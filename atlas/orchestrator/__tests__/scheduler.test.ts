/**
 * Tests for the Scheduler module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../scheduler';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler();
  });

  afterEach(() => {
    scheduler.stop();
  });

  it('registers actions with keys', () => {
    const action = vi.fn();
    scheduler.register('status_sync', action);

    const intervals = scheduler.getIntervals();
    expect(intervals.status_sync).toBeDefined();
    expect(intervals.status_sync).toBeGreaterThan(0);
  });

  it('starts and stops without error', () => {
    const action = vi.fn();
    scheduler.register('dashboard_refresh', action);
    scheduler.start();
    scheduler.stop();
    // Should not throw
  });

  it('setInterval updates the interval', () => {
    const action = vi.fn();
    scheduler.register('pr_scan', action);

    const result = scheduler.setInterval('pr_scan', 60);
    expect(result).toBe(true);

    const intervals = scheduler.getIntervals();
    expect(intervals.pr_scan).toBe(60);
  });

  it('setInterval rejects invalid keys', () => {
    const result = scheduler.setInterval('nonexistent', 10);
    expect(result).toBe(false);
  });

  it('setInterval rejects non-positive values', () => {
    const action = vi.fn();
    scheduler.register('status_sync', action);

    expect(scheduler.setInterval('status_sync', 0)).toBe(false);
    expect(scheduler.setInterval('status_sync', -5)).toBe(false);
  });

  it('getIntervals returns all registered intervals', () => {
    scheduler.register('status_sync', vi.fn());
    scheduler.register('pr_scan', vi.fn());
    scheduler.register('dashboard_refresh', vi.fn());

    const intervals = scheduler.getIntervals();
    expect(Object.keys(intervals)).toContain('status_sync');
    expect(Object.keys(intervals)).toContain('pr_scan');
    expect(Object.keys(intervals)).toContain('dashboard_refresh');
  });

  it('runNow executes an action immediately', async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    scheduler.register('queue_process', action);

    const result = await scheduler.runNow('queue_process');
    expect(result).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('runNow returns false for unknown keys', async () => {
    const result = await scheduler.runNow('nonexistent');
    expect(result).toBe(false);
  });

  it('runNow prevents concurrent execution', async () => {
    let running = false;
    const action = vi.fn().mockImplementation(async () => {
      running = true;
      await new Promise((r) => setTimeout(r, 50));
      running = false;
    });

    scheduler.register('agent_health', action);

    // Start the action
    const promise1 = scheduler.runNow('agent_health');
    // Try to start it again while first is running
    const result2 = await scheduler.runNow('agent_health');

    await promise1;
    // Second call should have been rejected because action was running
    expect(result2).toBe(false);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('can reschedule while stopped', () => {
    const action = vi.fn();
    scheduler.register('status_sync', action);
    scheduler.start();
    scheduler.stop();

    // setInterval should still work on a stopped scheduler
    const result = scheduler.setInterval('status_sync', 120);
    expect(result).toBe(true);
    expect(scheduler.getIntervals().status_sync).toBe(120);
  });
});
