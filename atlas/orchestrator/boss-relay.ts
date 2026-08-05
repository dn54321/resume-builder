/**
 * BossRelay — reliable boss messaging with an offline message queue.
 *
 * ⚠️ DESIGN NOTES (read before changing)
 *
 * 1. `delivered: true` from the intercom broker does NOT mean the boss got
 *    the message. The broker accepts sends to disconnected sessions into an
 *    offline mailbox and still acks them. The ONLY authoritative liveness
 *    signal is a delivery receipt (receiver_received/injected/acknowledged),
 *    which a live boss's pi-intercom extension auto-emits for every message.
 *    So: broker ack + no receipt within the window ⇒ boss unreachable.
 *
 * 2. The offline queue is IN-MEMORY BY DESIGN. It must die with the process:
 *    if the orchestrator dies, the queue is cleared (no stale messages are
 *    replayed against a new boss). Never persist it.
 *
 * 3. Duplicate-delivery edge: if the boss reconnects with the SAME session id,
 *    the broker flushes its own mailbox AND we flush our queue on
 *    re-registration — the boss may see a message twice. That is acceptable
 *    for an overseer (STATUS/ASK forwards are idempotent-ish). A late receipt
 *    for an already-queued message revives the boss but does not dedupe.
 *
 * 4. Revival: any delivery receipt proves the boss is reachable. If we marked
 *    the boss dead after a transient failure (e.g. a send threw while the boss
 *    was actually fine), the first receipt that arrives after that flushes the
 *    queue automatically — no re-registration needed.
 */

/** Broker-level outcome of a send (see wrapper's SendResult). */
export interface RelaySendResult {
  id: string;
  delivered: boolean;
  reason?: string;
}

export type RelayDeliveryStatus = 'delivered' | 'queued';

export interface BossRelayOptions {
  /** Low-level send, e.g. `(to, text) => intercom.send(to, text)`. */
  send: (to: string, text: string) => Promise<RelaySendResult>;
  /** Max time to wait for a delivery receipt after broker acceptance. */
  receiptTimeoutMs?: number;
  /** Hard cap on the offline queue; oldest messages dropped beyond this. */
  maxQueueSize?: number;
  /** Logging callback (defaults to console.log). */
  log?: (msg: string) => void;
  /**
   * Process liveness probe for the boss. Given the boss's pid + start time,
   * returns true if the process is alive and matches. Used by checkLiveness()
   * as an OS-level authority: a PID+startTime match is proof the boss process
   * exists, regardless of whether it acked a receipt within the window
   * (receipts time out while the boss is busy, which previously caused false
   * 'Boss dead' states that queued failure notifications). Defaults to the
   * /proc-based probe below.
   */
  isProcessAlive?: (pid: number, startTime?: number) => boolean;
}

/**
 * POSIX /proc probe: true when the process exists AND its start time matches
 * (field 22 of /proc/<pid>/stat). The startTime guards against PID recycling —
 * a recycled PID (new process reusing the number) has a different start time.
 */
export function defaultIsProcessAlive(pid: number, startTime?: number): boolean {
  try {
    const fs = require('node:fs');
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
    if (!startTime) return true; // process exists; no baseline to compare
    // Field 22 = starttime in JIFFIES SINCE BOOT (tokens: comm can contain
    // spaces, so split from the right after stripping the trailing )).
    const close = stat.lastIndexOf(')');
    const fields = stat.slice(close + 2).trim().split(/\s+/);
    const startJiffies = Number(fields[19]);

    // Convert to epoch-ms to compare with the intercom session's startedAt
    // (which is Date.now() — epoch ms, NOT jiffies). Unit mismatch made the
    // naive `start === startTime` comparison ALWAYS false, marking a live
    // boss dead on every check (observed: 'boss process 446820 is no longer
    // alive' for a process that was alive the whole time).
    const CLK_TCK = 100; // POSIX default (getconf CLK_TCK)
    const uptimeS = Number(fs.readFileSync('/proc/uptime', 'utf-8').split(/\s+/)[0]);
    const bootEpochMs = Date.now() - uptimeS * 1000;
    const startEpochMs = bootEpochMs + (startJiffies / CLK_TCK) * 1000;

    // Allow 5s skew (clock/rounding between the two sources).
    return Math.abs(startEpochMs - Number(startTime)) < 5000;
  } catch {
    return false;
  }
}

/** Receipt statuses that prove the boss actually received the message. */
const DELIVERED_STATUSES = new Set(['receiver_received', 'injected', 'acknowledged']);

interface PendingReceipt {
  resolve: (delivered: boolean) => void;
  timer: NodeJS.Timeout;
}

export class BossRelay {
  private sessionId: string | null = null;
  private alive = false;
  private queue: string[] = [];
  private pending = new Map<string, PendingReceipt>();
  private readonly sendFn: (to: string, text: string) => Promise<RelaySendResult>;
  private readonly receiptTimeoutMs: number;
  private readonly maxQueueSize: number;
  private readonly log: (msg: string) => void;
  private readonly isProcessAliveFn: (pid: number, startTime?: number) => boolean;
  /** OS identity of the boss process (from its intercom session metadata). */
  private bossPid: number | null = null;
  private bossStartedAt: number | null = null;

  constructor(options: BossRelayOptions) {
    this.sendFn = options.send;
    this.receiptTimeoutMs = options.receiptTimeoutMs ?? 8000;
    this.maxQueueSize = options.maxQueueSize ?? 500;
    this.log = options.log ?? ((msg) => console.log(`[BossRelay] ${msg}`));
    this.isProcessAliveFn = options.isProcessAlive ?? defaultIsProcessAlive;
  }

  // ─── State ─────────────────────────────────────────────────────────

  get registeredSessionId(): string | null {
    return this.sessionId;
  }

  /** Boss is registered and believed reachable. */
  get isAlive(): boolean {
    return this.alive;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  getState(): 'unregistered' | 'alive' | 'dead' {
    if (!this.sessionId) return 'unregistered';
    return this.alive ? 'alive' : 'dead';
  }

  // ─── Registration ──────────────────────────────────────────────────

  /**
   * A boss session registered (or re-registered). Marks the boss reachable
   * and flushes the offline queue in FIFO order. Messages that fail to
   * deliver again are re-queued, so nothing is lost or duplicated.
   * Returns the number of queued messages that were flushed.
   */
  async registerBoss(
    sessionId: string,
    session?: { pid?: number; startedAt?: number },
  ): Promise<number> {
    const previous = this.sessionId;
    this.sessionId = sessionId;
    if (session?.pid) this.bossPid = session.pid;
    if (session?.startedAt) this.bossStartedAt = session.startedAt;
    this.alive = true;
    if (previous && previous !== sessionId) {
      this.log(`Boss re-registered as ${sessionId} (was ${previous})`);
    }
    return await this.flush();
  }

  /**
   * Deliver all queued messages in FIFO order. Failures re-queue (preserving
   * order), so nothing is lost or duplicated. Returns the number flushed.
   */
  async flush(): Promise<number> {
    const queued = this.queue;
    this.queue = [];
    for (const text of queued) {
      // tell() re-queues on failure; failed items land in the fresh queue in
      // the same order they were sent.
      await this.tell(text);
    }
    if (queued.length > 0) {
      this.log(`Flushed ${queued.length} queued message(s) to boss`);
    }
    return queued.length;
  }

  // ─── Sending ───────────────────────────────────────────────────────

  /**
   * Send a message to the boss. If the boss is unregistered or known-dead,
   * the message is queued instead of sent. If a send fails (broker rejects,
   * throws, or no delivery receipt within the window), the boss is marked
   * dead and the message is queued for the next registration.
   */
  async tell(text: string): Promise<RelayDeliveryStatus> {
    if (!this.sessionId || !this.alive) {
      this.enqueue(text);
      return 'queued';
    }
    const target = this.sessionId;

    let result: RelaySendResult;
    try {
      result = await this.sendFn(target, text);
    } catch (err) {
      this.markDead(`send threw: ${err instanceof Error ? err.message : String(err)}`);
      this.enqueue(text);
      return 'queued';
    }
    if (!result.delivered) {
      this.markDead(`broker rejected: ${result.reason ?? 'unknown reason'}`);
      this.enqueue(text);
      return 'queued';
    }

    // Broker accepted (live delivery or offline mailbox). Wait for the
    // receipt that only a live boss emits.
    const delivered = await this.waitForReceipt(result.id);
    if (!delivered) {
      this.markDead(`no delivery receipt within ${this.receiptTimeoutMs}ms (boss likely disconnected)`);
      this.enqueue(text);
      return 'queued';
    }
    return 'delivered';
  }

  /**
   * Feed a delivery receipt from the intercom client. Resolves a waiting
   * send, and treats delivery statuses as proof the boss is alive (this also
   * revives a boss that was marked dead but later delivered a message).
   */
  onReceipt(messageId: string, status: string): void {
    const pending = this.pending.get(messageId);
    if (pending) {
      if (DELIVERED_STATUSES.has(status)) {
        // Terminal, positive: the boss received the message.
        clearTimeout(pending.timer);
        this.pending.delete(messageId);
        this.revive();
        pending.resolve(true);
      } else if (status === 'expired') {
        // Terminal, negative: the message died in transit — boss gone.
        clearTimeout(pending.timer);
        this.pending.delete(messageId);
        this.markDead(`receipt expired for message ${messageId}`);
        pending.resolve(false);
      }
      // Non-terminal statuses (queued, ...) mean the boss is busy but
      // connected — keep the waiter and its timer; a final status may follow.
      return;
    }
    // Late receipt for an already-resolved send: the boss is demonstrably
    // live. Don't re-send (the text may already be queued — see notes).
    if (DELIVERED_STATUSES.has(status)) {
      this.revive();
    }
  }

  // ─── Internals ─────────────────────────────────────────────────────

  private waitForReceipt(messageId: string): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        resolve(false);
      }, this.receiptTimeoutMs);
      this.pending.set(messageId, { resolve, timer });
    });
  }

  private enqueue(text: string): void {
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
      this.log(`Boss queue full (cap ${this.maxQueueSize}) — dropped oldest queued message`);
    }
    if (this.queue.length === 0) {
      this.log('Boss unreachable — queueing messages until a boss registers');
    }
    this.queue.push(text);
  }

  private markDead(reason: string): void {
    if (!this.alive) return; // already dead — log once
    this.alive = false;
    this.log(`Boss marked unreachable: ${reason}`);
  }

  /** Boss proven reachable (receipt received). Flush anything queued. */
  private revive(): void {
    if (this.alive) return;
    this.alive = true;
    this.log('Boss reachable again (receipt received) — flushing queued messages');
    if (this.queue.length > 0) {
      void this.flush();
    }
  }

  /**
   * Called when the boss sends ANY message to the orchestrator — the
   * strongest possible liveness signal (the boss can only send if its
   * session is alive and connected). Receipts are best-effort and can be
   * missed (e.g. broker races), which previously caused false "Boss dead"
   * states that swallowed failure notifications. This makes dead-state
   * recovery robust: any inbound boss message revives and flushes.
   */
  onBossActivity(): void {
    this.revive();
  }

  /**
   * OS-level liveness probe: check the boss's process (pid + startTime) is
   * still alive. This is the authoritative "is the boss process running"
   * signal — receipts can time out while the boss is merely busy (its
   * intercom loop is blocked on a long tool call), which previously caused
   * false 'Boss dead' states that queued failure notifications until a
   * re-registration.
   *
   * A live process is NOT proof the boss will respond promptly, but it IS
   * proof the session can eventually drain its queue — so we only mark dead
   * when the process is actually gone AND no send is currently awaiting a
   * receipt (a pending receipt means a send is in flight and the boss may
   * just be slow).
   */
  checkLiveness(): void {
    if (!this.sessionId || this.pending.size > 0) return;
    if (this.bossPid == null) return; // no OS identity to probe
    if (!this.isProcessAliveFn(this.bossPid, this.bossStartedAt ?? undefined)) {
      this.markDead(`boss process ${this.bossPid} is no longer alive (PID check)`);
    }
  }
}
