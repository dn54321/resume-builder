/**
 * Tests for the BossRelay offline-queue mechanism.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BossRelay, defaultIsProcessAlive, type RelaySendResult } from '../boss-relay';

const DELIVERED: RelaySendResult = { id: 'm1', delivered: true };

function makeSend(overrides?: {
  result?: RelaySendResult | Error;
  onSend?: (to: string, text: string) => void;
}) {
  const calls: Array<{ to: string; text: string }> = [];
  const send = vi.fn(async (to: string, text: string): Promise<RelaySendResult> => {
    calls.push({ to, text });
    overrides?.onSend?.(to, text);
    if (overrides?.result instanceof Error) throw overrides.result;
    return overrides?.result ?? DELIVERED;
  });
  return { send, calls };
}

describe('BossRelay — queueing when boss unreachable', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('queues messages when no boss is registered', async () => {
    const { send, calls } = makeSend();
    const relay = new BossRelay({ send, log: vi.fn() });

    expect(relay.getState()).toBe('unregistered');
    expect(await relay.tell('STATUS hello')).toBe('queued');
    expect(await relay.tell('DONE thing')).toBe('queued');

    expect(relay.queuedCount).toBe(2);
    expect(send).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('queues and marks dead when the broker rejects the send', async () => {
    const { send } = makeSend({ result: { id: 'x', delivered: false, reason: 'Session not found' } });
    const relay = new BossRelay({ send, log: vi.fn() });
    await relay.registerBoss('boss-1');

    expect(await relay.tell('STATUS hi')).toBe('queued');
    expect(relay.isAlive).toBe(false);
    expect(relay.getState()).toBe('dead');
    expect(send).toHaveBeenCalledTimes(1);

    // Once dead, subsequent messages queue WITHOUT sending.
    expect(await relay.tell('STATUS again')).toBe('queued');
    expect(send).toHaveBeenCalledTimes(1);
    expect(relay.queuedCount).toBe(2);
  });

  it('queues and marks dead when the send throws', async () => {
    const { send } = makeSend({ result: new Error('broker unreachable') });
    const relay = new BossRelay({ send, log: vi.fn() });
    await relay.registerBoss('boss-1');

    expect(await relay.tell('STATUS hi')).toBe('queued');
    expect(relay.isAlive).toBe(false);
    expect(relay.queuedCount).toBe(1);
  });

  it('drops the oldest message when the queue cap is reached', async () => {
    const { send } = makeSend();
    const log = vi.fn();
    const relay = new BossRelay({ send, maxQueueSize: 2, log });

    await relay.tell('one');
    await relay.tell('two');
    await relay.tell('three');

    expect(relay.queuedCount).toBe(2);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('dropped oldest'));

    // 'one' was dropped — flush should deliver 'two' then 'three' in order.
    const sent: string[] = [];
    send.mockImplementation(async (_to: string, text: string) => {
      sent.push(text);
      return { id: `mid-${sent.length}`, delivered: true };
    });
    const flushP = relay.registerBoss('boss-1');
    for (let i = 0; i < 2; i++) {
      await new Promise((r) => setTimeout(r, 1));
      relay.onReceipt(`mid-${i + 1}`, 'receiver_received');
    }
    await flushP;
    expect(sent).toEqual(['two', 'three']);
  });
});

describe('BossRelay — receipt window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('delivers when the boss acks with a receipt', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({ send, receiptTimeoutMs: 5000, log: vi.fn() });
    await relay.registerBoss('boss-1');

    const p = relay.tell('STATUS working');
    await vi.advanceTimersByTimeAsync(1); // let the send settle
    relay.onReceipt('m1', 'receiver_received');

    expect(await p).toBe('delivered');
    expect(relay.isAlive).toBe(true);
    expect(relay.queuedCount).toBe(0);
  });

  it('queues and marks dead when no receipt arrives within the window', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({ send, receiptTimeoutMs: 100, log: vi.fn() });
    await relay.registerBoss('boss-1');

    const p = relay.tell('STATUS stuck?');
    await vi.advanceTimersByTimeAsync(100 + 5);

    expect(await p).toBe('queued');
    expect(relay.isAlive).toBe(false);
    expect(relay.queuedCount).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);

    // Subsequent sends are skipped entirely.
    await relay.tell('STATUS more');
    expect(send).toHaveBeenCalledTimes(1);
    expect(relay.queuedCount).toBe(2);
  });

  it('queues when the receipt expires', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({ send, receiptTimeoutMs: 5000, log: vi.fn() });
    await relay.registerBoss('boss-1');

    const p = relay.tell('STATUS expiring');
    await vi.advanceTimersByTimeAsync(1);
    relay.onReceipt('m1', 'expired');

    expect(await p).toBe('queued');
    expect(relay.isAlive).toBe(false);
  });

  it('keeps waiting on a queued receipt (boss busy, not dead)', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({ send, receiptTimeoutMs: 5000, log: vi.fn() });
    await relay.registerBoss('boss-1');

    const p = relay.tell('STATUS busy');
    await vi.advanceTimersByTimeAsync(1);
    relay.onReceipt('m1', 'queued'); // still alive, just not processed yet
    expect(relay.isAlive).toBe(true);

    relay.onReceipt('m1', 'receiver_received');
    expect(await p).toBe('delivered');
  });

  it('revives a dead boss on a late receipt and auto-flushes the queue', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({ send, receiptTimeoutMs: 100, log: vi.fn() });
    await relay.registerBoss('boss-1');

    // First send times out → dead, message queued.
    const p1 = relay.tell('STATUS one');
    await vi.advanceTimersByTimeAsync(100 + 5);
    expect(await p1).toBe('queued');
    expect(relay.isAlive).toBe(false);

    // Another message queues without sending.
    await relay.tell('STATUS two');
    expect(relay.queuedCount).toBe(2);

    // A late receipt proves the boss is alive → queue auto-flushes.
    const sent: string[] = [];
    send.mockImplementation(async (_to: string, text: string) => {
      sent.push(text);
      return { id: `mid-${sent.length}`, delivered: true };
    });
    relay.onReceipt('m1', 'receiver_received');
    await vi.advanceTimersByTimeAsync(1);

    expect(relay.isAlive).toBe(true);
    // Flush is async — give it a beat to send both messages and await their receipts.
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(1);
      if (sent.length >= 2) break;
      relay.onReceipt(`mid-${sent.length}`, 'receiver_received');
    }
    expect(sent).toEqual(['STATUS one', 'STATUS two']);
    expect(relay.queuedCount).toBe(0);
  });
});

describe('BossRelay — flush on registration', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('flushes queued messages in FIFO order when a boss registers', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({ send, log: vi.fn() });

    await relay.tell('first');
    await relay.tell('second');
    await relay.tell('third');
    expect(relay.queuedCount).toBe(3);

    const sent: string[] = [];
    send.mockImplementation(async (_to: string, text: string) => {
      sent.push(text);
      return { id: `mid-${sent.length}`, delivered: true };
    });

    const flushP = relay.registerBoss('boss-1');
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 1));
      relay.onReceipt(`mid-${i + 1}`, 'receiver_received');
    }
    expect(await flushP).toBe(3);

    expect(sent).toEqual(['first', 'second', 'third']);
    expect(relay.queuedCount).toBe(0);
    expect(relay.isAlive).toBe(true);
    expect(relay.registeredSessionId).toBe('boss-1');
  });

  it('re-queues messages that fail again during flush, preserving order', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({ send, log: vi.fn() });

    await relay.tell('first');
    await relay.tell('second');
    await relay.tell('third');

    // First flush send fails; the rest must be re-queued in order.
    send.mockImplementation(async (_to: string, text: string) => {
      if (text === 'second') return { id: 'x', delivered: false, reason: 'Session not found' };
      return { id: `ok-${text}`, delivered: true };
    });
    const flushP = relay.registerBoss('boss-1');
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1));
      const ok = send.mock.results.filter((r) => r.type === 'return');
      const last = ok[ok.length - 1]?.value as RelaySendResult | undefined;
      if (last && last.delivered) relay.onReceipt(last.id, 'receiver_received');
    }
    await flushP;

    // 'second' failed → boss marked dead → 'third' re-queued (no send).
    expect(relay.isAlive).toBe(false);
    expect(relay.queuedCount).toBe(2);
  });

  it('re-registration with a different session id flushes again', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({ send, log: vi.fn() });
    await relay.registerBoss('boss-1');

    const p = relay.tell('STATUS hi');
    await new Promise((r) => setTimeout(r, 1));
    relay.onReceipt('m1', 'receiver_received');
    expect(await p).toBe('delivered');

    // Boss dies; queue builds up.
    send.mockImplementation(async () => ({ id: 'x', delivered: false, reason: 'gone' }));
    await relay.tell('queued-1');
    await relay.tell('queued-2');
    expect(relay.queuedCount).toBe(2);

    // New boss registers → flush delivers both.
    const sent: string[] = [];
    send.mockImplementation(async (_to: string, text: string) => {
      sent.push(text);
      return { id: `mid-${sent.length}`, delivered: true };
    });
    const flushP = relay.registerBoss('boss-2');
    for (let i = 0; i < 2; i++) {
      await new Promise((r) => setTimeout(r, 1));
      relay.onReceipt(`mid-${i + 1}`, 'receiver_received');
    }
    expect(await flushP).toBe(2);
    expect(sent).toEqual(['queued-1', 'queued-2']);
    expect(relay.registeredSessionId).toBe('boss-2');
  });
});

describe('BossRelay — OS-level liveness (PID check)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('marks the boss dead when the process is gone and no receipt is pending', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({
      send,
      log: vi.fn(),
      isProcessAlive: vi.fn(() => false),
    });
    await relay.registerBoss('boss-1', { pid: 4242, startedAt: 1000 });

    expect(relay.isAlive).toBe(true);
    relay.checkLiveness();
    expect(relay.isAlive).toBe(false);
    expect(relay.getState()).toBe('dead');
  });

  it('keeps the boss alive when the process exists (busy, not dead)', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({
      send,
      log: vi.fn(),
      isProcessAlive: vi.fn(() => true),
    });
    await relay.registerBoss('boss-1', { pid: 4242, startedAt: 1000 });

    relay.checkLiveness();
    expect(relay.isAlive).toBe(true);
  });

  it('does not mark dead while a send is awaiting a receipt (boss busy, not dead)', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({
      send,
      log: vi.fn(),
      isProcessAlive: vi.fn(() => false),
    });
    await relay.registerBoss('boss-1', { pid: 4242, startedAt: 1000 });

    vi.useFakeTimers();
    const tellP = relay.tell('STATUS busy');
    await vi.advanceTimersByTimeAsync(0);
    expect(relay.isAlive).toBe(true);

    relay.checkLiveness();
    expect(relay.isAlive).toBe(true);

    await vi.advanceTimersByTimeAsync(9000);
    await tellP;
    expect(relay.isAlive).toBe(false);
    vi.useRealTimers();
  });

  it('does nothing when no OS identity was captured', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({
      send,
      log: vi.fn(),
      isProcessAlive: vi.fn(() => false),
    });
    await relay.registerBoss('boss-1'); // no pid metadata

    relay.checkLiveness();
    expect(relay.isAlive).toBe(true);
  });

  it('uses defaultIsProcessAlive against /proc when no probe is injected', async () => {
    const { send } = makeSend();
    const relay = new BossRelay({ send, log: vi.fn() });
    // Compute the test process's startEpochMs (the /proc starttime is jiffies
    // since boot, not epoch-ms — the fix converts so the comparison works).
    const fs = require('node:fs') as typeof import('node:fs');
    const stat = fs.readFileSync(`/proc/${process.pid}/stat`, 'utf-8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    const startJiffies = Number(fields[19]);
    const uptimeS = Number(fs.readFileSync('/proc/uptime', 'utf-8').split(/\s+/)[0]);
    const startEpochMs = (Date.now() - uptimeS * 1000) + (startJiffies / 100) * 1000;
    await relay.registerBoss('boss-1', { pid: process.pid, startedAt: startEpochMs });

    relay.checkLiveness();
    expect(relay.isAlive).toBe(true);
  });

  it('defaultIsProcessAlive returns false for a non-existent pid', () => {
    expect(defaultIsProcessAlive(99999999)).toBe(false);
  });

  it('defaultIsProcessAlive correctly converts jiffies→epoch (live pid)', () => {
    // Regression: the naive `startJiffies === startTime` comparison ALWAYS
    // failed (jiffies vs epoch-ms units), marking a live boss dead on every
    // check. With the conversion fix, a live pid + correct startEpochMs must
    // be alive, and a wrong startTime must be dead.
    const fs = require('node:fs') as typeof import('node:fs');
    const stat = fs.readFileSync(`/proc/${process.pid}/stat`, 'utf-8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    const startJiffies = Number(fields[19]);
    const uptimeS = Number(fs.readFileSync('/proc/uptime', 'utf-8').split(/\s+/)[0]);
    const startEpochMs = (Date.now() - uptimeS * 1000) + (startJiffies / 100) * 1000;

    expect(defaultIsProcessAlive(process.pid, startEpochMs)).toBe(true);
    // Recycled PID: the new process started AFTER the session began → dead.
    expect(defaultIsProcessAlive(process.pid, startEpochMs - 60_000)).toBe(false);
  });

  it('keeps a live boss alive when boot skew exceeds 5s (session starts after process)', () => {
    // Regression: the probe used |processStart - sessionStartedAt| < 5s, but
    // session.startedAt is recorded when pi's intercom context initializes —
    // AFTER the process exec (model/extension load). Any boot skew > 5s
    // marked a LIVE boss dead (observed: orchestrator flagged pid 3020978,
    // a running boss, as 'no longer alive (PID check)' at 01:26:47Z). The
    // correct check is one-sided: the process must start BEFORE the session;
    // a session starting seconds later is normal and must stay alive.
    const fs = require('node:fs') as typeof import('node:fs');
    const stat = fs.readFileSync(`/proc/${process.pid}/stat`, 'utf-8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    const startJiffies = Number(fields[19]);
    const uptimeS = Number(fs.readFileSync('/proc/uptime', 'utf-8').split(/\s+/)[0]);
    const startEpochMs = (Date.now() - uptimeS * 1000) + (startJiffies / 100) * 1000;

    // Session initialized 10s after the process exec'd — normal pi boot.
    expect(defaultIsProcessAlive(process.pid, startEpochMs + 10_000)).toBe(true);
    // Even 60s boot skew is fine — the process still predates the session.
    expect(defaultIsProcessAlive(process.pid, startEpochMs + 60_000)).toBe(true);
  });
});
