/**
 * Configurable main loop scheduler.
 * Each action has its own interval, adjustable at runtime by the boss.
 */

import type { SchedulerConfig } from './types';
import { getConfig } from './config';

type ScheduledAction = () => Promise<void>;

interface TimerEntry {
  key: string;
  action: ScheduledAction;
  interval: number;
  timer: NodeJS.Timeout | null;
  running: boolean;
}

export class Scheduler {
  private timers: Map<string, TimerEntry> = new Map();
  private started = false;

  /**
   * Register an action with its interval key from config.
   */
  register(key: keyof SchedulerConfig['intervals'], action: ScheduledAction): void {
    const config = getConfig();
    const interval = config.intervals[key];
    this.timers.set(key, {
      key,
      action,
      interval,
      timer: null,
      running: false,
    });
  }

  /**
   * Start all registered actions.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    for (const [, entry] of this.timers) {
      this.scheduleLoop(entry);
    }
  }

  /**
   * Stop all timers.
   */
  stop(): void {
    this.started = false;
    for (const [, entry] of this.timers) {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
    }
  }

  /**
   * Adjust an interval at runtime (boss command).
   */
  setInterval(key: string, seconds: number): boolean {
    const entry = this.timers.get(key);
    if (!entry) return false;

    if (seconds < 1) return false;

    entry.interval = seconds;

    // Reschedule if running
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
      this.scheduleLoop(entry);
    }

    console.log(`[Scheduler] ${key} interval set to ${seconds}s`);
    return true;
  }

  /**
   * Get current intervals.
   */
  getIntervals(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [, entry] of this.timers) {
      result[entry.key] = entry.interval;
    }
    return result;
  }

  /**
   * Run an action immediately (bypass interval).
   */
  async runNow(key: string): Promise<boolean> {
    const entry = this.timers.get(key);
    if (!entry) return false;
    if (entry.running) return false; // Already running

    try {
      entry.running = true;
      await entry.action();
    } catch (err) {
      console.error(`[Scheduler] Action "${key}" error:`, err);
    } finally {
      entry.running = false;
    }
    return true;
  }

  private scheduleLoop(entry: TimerEntry): void {
    if (!this.started) return;

    const run = async () => {
      if (!this.started) return;

      if (!entry.running) {
        try {
          entry.running = true;
          await entry.action();
        } catch (err) {
          console.error(`[Scheduler] Action "${entry.key}" error:`, err);
        } finally {
          entry.running = false;
        }
      }

      if (this.started) {
        entry.timer = setTimeout(run, entry.interval * 1000);
      }
    };

    // Start first run after a short delay to avoid thundering herd
    entry.timer = setTimeout(run, 1000);
  }
}
