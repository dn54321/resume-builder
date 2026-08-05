/**
 * Tests for the BossRelay offline-queue mechanism.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BossRelay, type RelaySendResult } from '../boss-relay';

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
