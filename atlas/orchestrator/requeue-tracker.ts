/**
 * RequeueTracker — detects worker pain points EARLY by watching re-queue
 * patterns, instead of waiting for the boss to notice buried log lines.
 *
 * Every major infra failure tonight manifested as repeated re-queues:
 *   - RES-88 re-queued 105× in ~20min (missing stream-output extension →
 *     worker died instantly with 'Unknown option: --stream')
 *   - RES-85 re-queued 77× (already-merged tickets looping on empty-commit
 *     re-push + pre-push test:cov flaking under load)
 *
 * Both had clear early signals (worker exits code -1, repeated Re-queuing
 * log lines) that were buried in a long log file. This tracker counts
 * re-queues per ticket within a rolling time window and exposes:
 *   - per-ticket re-queue counts + first/last seen (for the dashboard)
 *   - a threshold breach that the boss can be alerted on immediately
 *
 * Rolling window (default 10 min) so old storms don't trip the alarm
 * forever — a healthy ticket that re-queues once after a long wait is not
 * an anomaly, but N rapid re-queues is.
 */

export interface RequeueEvent {
  ticketId: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  /** Reason most recently recorded for a re-queue (worker gone, retry, etc). */
  lastReason?: string;
}

export interface RequeueTrackerOptions {
  /** Rolling window (ms) — re-queues older than this are pruned. */
  windowMs?: number;
  /** Re-queues within the window that trip the anomaly alarm. */
  threshold?: number;
  /** Called when a ticket crosses the anomaly threshold. */
  onAnomaly?: (ticketId: string, count: number, reason?: string) => void;
  /** Logging callback. */
  log?: (msg: string) => void;
}

export class RequeueTracker {
  private readonly windowMs: number;
  private readonly threshold: number;
  private readonly onAnomaly?: (ticketId: string, count: number, reason?: string) => void;
  private readonly log: (msg: string) => void;
  /** ticketId -> timestamps of recent re-queues (FIFO). */
  private events = new Map<string, number[]>();
  /** ticketId -> last reason, to surface in the dashboard. */
  private reasons = new Map<string, string>();
  /** Tickets already flagged as anomalous (avoid spam on every re-queue). */
  private alerted = new Set<string>();

  constructor(options: RequeueTrackerOptions = {}) {
    this.windowMs = options.windowMs ?? 10 * 60 * 1000;
    this.threshold = options.threshold ?? 5;
    this.onAnomaly = options.onAnomaly;
    this.log = options.log ?? ((msg) => console.log(`[RequeueTracker] ${msg}`));
  }

  /**
   * Record a re-queue for a ticket. Prunes old events, updates the rolling
   * count, and fires onAnomaly the FIRST time the ticket crosses the
   * threshold within the window.
   */
  record(ticketId: string, reason?: string): number {
    const now = Date.now();
    if (reason) this.reasons.set(ticketId, reason);

    const list = this.events.get(ticketId) ?? [];
    list.push(now);
    // Prune events outside the window (keep the list sorted by push order)
    while (list.length > 0 && list[0]! < now - this.windowMs) list.shift();
    this.events.set(ticketId, list);

    if (list.length >= this.threshold && !this.alerted.has(ticketId)) {
      this.alerted.add(ticketId);
      this.log(`⚠️ ${ticketId} re-queued ${list.length}× within ${this.windowMs / 60000}min — possible worker crash loop (${reason ?? 'unknown'})`);
      this.onAnomaly?.(ticketId, list.length, reason);
    }
    return list.length;
  }

  /**
   * Record a re-queue that is KNOWN to be benign — a defer (worker finished
   * but the main repo was busy), a no-op completion, or post-completion
   * pane-death churn. These look like re-queues but are NOT crash loops, so
   * they must not trip the anomaly alarm (observed: RES-85/RES-88 flagged
   * 5× after defers/completions when the worker was actually fine). The event
   * still shows on the dashboard snapshot for visibility.
   */
  recordBenign(ticketId: string, reason?: string): number {
    const now = Date.now();
    if (reason) this.reasons.set(ticketId, reason);

    const list = this.events.get(ticketId) ?? [];
    list.push(now);
    while (list.length > 0 && list[0]! < now - this.windowMs) list.shift();
    this.events.set(ticketId, list);
    return list.length;
  }

  /**
   * Snapshot of current re-queue activity — for the dashboard. Returns
   * tickets with counts ≥ 2 (a single re-queue is normal; 2+ in the window
   * is worth showing). Sorted by count descending. Prunes aged-out events
   * so a storm stops showing once it passes the window.
   */
  snapshot(): RequeueEvent[] {
    const now = Date.now();
    const out: RequeueEvent[] = [];
    for (const [ticketId, list] of this.events) {
      while (list.length > 0 && list[0]! < now - this.windowMs) list.shift();
      if (list.length === 0) {
        this.events.delete(ticketId);
        this.reasons.delete(ticketId);
        continue;
      }
      if (list.length < 2) continue;
      out.push({
        ticketId,
        count: list.length,
        firstSeen: list[0]!,
        lastSeen: list[list.length - 1]!,
        lastReason: this.reasons.get(ticketId),
      });
    }
    return out.sort((a, b) => b.count - a.count);
  }

  /** Total re-queues recorded (all tickets, current window). */
  get total(): number {
    let n = 0;
    for (const list of this.events.values()) n += list.length;
    return n;
  }

  /** Clear all state (e.g. on restart). */
  reset(): void {
    this.events.clear();
    this.reasons.clear();
    this.alerted.clear();
  }
}
