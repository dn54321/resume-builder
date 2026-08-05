/**
 * Tests for the RequeueTracker — the worker pain-point detector.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequeueTracker } from '../requeue-tracker';

describe('RequeueTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not flag a single re-queue (normal)', () => {
    const onAnomaly = vi.fn();
    const tracker = new RequeueTracker({ threshold: 5, onAnomaly });

    tracker.record('RES-88', 'worker gone');
    expect(tracker.snapshot()).toHaveLength(0); // < 2 → hidden
    expect(onAnomaly).not.toHaveBeenCalled();
  });

  it('flags a crash-loop (threshold crossed within window)', () => {
    const onAnomaly = vi.fn();
    const tracker = new RequeueTracker({ threshold: 5, onAnomaly });

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000);
      tracker.record('RES-88', `worker gone #${i}`);
    }

    expect(onAnomaly).toHaveBeenCalledTimes(1);
    expect(onAnomaly).toHaveBeenCalledWith('RES-88', 5, expect.stringContaining('worker gone'));
    const snap = tracker.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]!.count).toBe(5);
  });

  it('alerts only once per ticket (no spam on every re-queue)', () => {
    const onAnomaly = vi.fn();
    const tracker = new RequeueTracker({ threshold: 3, onAnomaly });

    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(1000);
      tracker.record('RES-85');
    }

    expect(onAnomaly).toHaveBeenCalledTimes(1);
  });

  it('prunes events older than the window (storm stops mattering)', () => {
    const tracker = new RequeueTracker({ threshold: 3, windowMs: 60_000 });

    // 5 rapid re-queues → flagged
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000);
      tracker.record('RES-88');
    }
    expect(tracker.snapshot()[0]!.count).toBe(5);

    // Advance past the window — the storm ages out (advance well beyond
    // the newest record, not just the first)
    vi.advanceTimersByTime(70_000);
    expect(tracker.snapshot()).toHaveLength(0);
    expect(tracker.total).toBe(0);
  });

  it('tracks multiple tickets independently', () => {
    const tracker = new RequeueTracker({ threshold: 10 });
    tracker.record('RES-88');
    tracker.record('RES-88');
    tracker.record('RES-85');
    tracker.record('RES-85');
    tracker.record('RES-85');

    const snap = tracker.snapshot();
    expect(snap).toHaveLength(2);
    expect(snap.find((s) => s.ticketId === 'RES-85')!.count).toBe(3);
    expect(snap.find((s) => s.ticketId === 'RES-88')!.count).toBe(2);
  });

  it('reset clears all state', () => {
    const tracker = new RequeueTracker({ threshold: 2 });
    tracker.record('RES-88');
    tracker.record('RES-88');
    expect(tracker.snapshot()).toHaveLength(1);

    tracker.reset();
    expect(tracker.snapshot()).toHaveLength(0);
    expect(tracker.total).toBe(0);
  });
});

describe('RequeueTracker — benign events', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('recordBenign does NOT trip the anomaly alarm even past threshold', () => {
    const onAnomaly = vi.fn();
    const tracker = new RequeueTracker({ threshold: 3, onAnomaly });

    // 5 defers (worker finished, main repo busy) — must NOT alarm
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000);
      tracker.recordBenign('RES-88', 'deferred (main repo dirty)');
    }

    expect(onAnomaly).not.toHaveBeenCalled();
    // But the events still show on the dashboard snapshot
    const snap = tracker.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]!.count).toBe(5);
  });

  it('a real crash (record) after defers still alarms', () => {
    const onAnomaly = vi.fn();
    const tracker = new RequeueTracker({ threshold: 3, onAnomaly });

    // 2 defers (benign) + 3 real re-queues (crash) = 5 events, alarm at 3 real
    tracker.recordBenign('RES-88', 'deferred');
    tracker.recordBenign('RES-88', 'deferred');
    for (let i = 0; i < 3; i++) {
      vi.advanceTimersByTime(1000);
      tracker.record('RES-88', 'worker exited (code -1)');
    }

    expect(onAnomaly).toHaveBeenCalledTimes(1);
  });
});
