/**
 * Tests for the Tmux pane manager.
 * All tmux interaction goes through mocked child_process.execSync/spawn —
 * no real tmux session is required.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PaneManager } from '../pane-manager';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

describe('PaneManager', () => {
  let tmpDir: string;
  let pm: PaneManager;
  // Simulated tmux state
  let sessionAlive: boolean;
  let splitResult: string;
  let displayOk: boolean;

  function mockTmux(): void {
    vi.mocked(cp.execSync).mockImplementation(((cmd: unknown) => {
      const c = String(cmd);
      if (c.includes('has-session')) return sessionAlive ? 'yes\n' : 'no\n';
      if (c.includes('split-window')) return splitResult + '\n';
      if (c.includes('display-message')) {
        // pane_dead: '0' alive, '1' process exited; a gone pane prints empty
        return displayOk ? '0\n' : '1\n';
      }
      if (c.includes('list-panes')) return '%1\n';
      if (c.includes('mkfifo')) return '';
      if (c.includes('kill-pane')) return '';
      return '';
    }) as any);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-pm-test-'));
    sessionAlive = true;
    splitResult = '%3';
    displayOk = true;
    vi.mocked(cp.execSync).mockReset();
    vi.mocked(cp.spawn).mockClear();
    mockTmux();
    pm = new PaneManager({ sessionName: 'atlas-test', stateDir: tmpDir, maxWorkers: 3 });
    pm.init();
    pm.setBannerPane('%1');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('createWorkerPane', () => {
    it('returns the pane id and splits the banner with a bash shell', () => {
      const paneId = pm.createWorkerPane('worker-1', 'RES-99');
      expect(paneId).toBe('%3');

      const splitCall = vi
        .mocked(cp.execSync)
        .mock.calls.find((c) => String(c[0]).includes('split-window'));
      expect(splitCall).toBeDefined();
      const cmd = String(splitCall![0]);
      // Must capture the real pane id (split-window prints nothing without -P,
      // and plain -P prints "session:window.pane", not the "%N" id).
      expect(cmd).toContain("-P -F '#{pane_id}'");
      // Pane runs a shell so the pool can launch pi via send-keys.
      expect(cmd).toContain('"bash"');
      expect(cmd).toContain('-t "%1"');
      expect(cmd).toContain('-l 8');
    });

    it('returns null without a banner pane', () => {
      const fresh = new PaneManager({
        sessionName: 'atlas-test',
        stateDir: tmpDir,
        maxWorkers: 3,
      });
      expect(fresh.createWorkerPane('worker-1', 'RES-99')).toBeNull();
    });

    it('returns null when the tmux session is gone', () => {
      sessionAlive = false;
      expect(pm.createWorkerPane('worker-1', 'RES-99')).toBeNull();
    });

    it('returns null when split-window output is not a pane id', () => {
      splitResult = 'atlas-test:0.1'; // plain -P format — must not be accepted
      expect(pm.createWorkerPane('worker-1', 'RES-99')).toBeNull();
    });

    it('returns null when split-window throws', () => {
      vi.mocked(cp.execSync).mockImplementation((() => {
        throw new Error('tmux not installed');
      }) as any);
      expect(pm.createWorkerPane('worker-1', 'RES-99')).toBeNull();
    });

    it('updates the banner with the worker assignment', () => {
      pm.createWorkerPane('worker-1', 'RES-99');
      const spawnCall = vi
        .mocked(cp.spawn)
        .mock.calls.find((c) => String(c[1]?.[1]).includes('echo \'UPDATE:1:worker-1=RES-99\''));
      expect(spawnCall).toBeDefined();
    });
  });

  describe('killWorkerPane', () => {
    it('kills the pane and removes it from the map', () => {
      pm.createWorkerPane('worker-1', 'RES-99');
      vi.mocked(cp.execSync).mockClear();

      pm.killWorkerPane('worker-1');

      const killCall = vi
        .mocked(cp.execSync)
        .mock.calls.find((c) => String(c[0]).includes('kill-pane'));
      expect(killCall).toBeDefined();
      expect(String(killCall![0])).toContain('-t "%3"');

      // Second kill is a no-op (already removed)
      vi.mocked(cp.execSync).mockClear();
      pm.killWorkerPane('worker-1');
      expect(vi.mocked(cp.execSync)).not.toHaveBeenCalled();
    });

    it('does nothing for unknown agents', () => {
      vi.mocked(cp.execSync).mockClear();
      pm.killWorkerPane('nope');
      expect(vi.mocked(cp.execSync)).not.toHaveBeenCalled();
    });
  });

  describe('isPaneAlive', () => {
    it('returns true when display-message succeeds', () => {
      expect(pm.isPaneAlive('%3')).toBe(true);
    });

    it('returns false when display-message fails', () => {
      displayOk = false;
      expect(pm.isPaneAlive('%3')).toBe(false);
    });

    it('returns false when the session is gone', () => {
      sessionAlive = false;
      expect(pm.isPaneAlive('%3')).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('returns true when the banner pane responds', () => {
      expect(pm.healthCheck()).toBe(true);
    });

    it('returns false when the banner pane is dead', () => {
      displayOk = false;
      expect(pm.healthCheck()).toBe(false);
    });
  });

  describe('init', () => {
    it('writes the pane scripts to the state dir', () => {
      const scriptsDir = path.join(tmpDir, 'panes');
      expect(fs.existsSync(path.join(scriptsDir, 'banner.sh'))).toBe(true);
      expect(fs.existsSync(path.join(scriptsDir, 'worker-pane.sh'))).toBe(true);
      expect(fs.existsSync(path.join(scriptsDir, 'dashboard-watch.sh'))).toBe(true);
    });

    it('restores the banner pane id from banner.pane', () => {
      // Fresh manager: session exists and saved banner id resolves
      displayOk = true;
      const fresh = new PaneManager({
        sessionName: 'atlas-test',
        stateDir: tmpDir,
        maxWorkers: 3,
      });
      fresh.init();
      expect(fresh.createWorkerPane('worker-1', 'RES-99')).toBe('%3');
    });
  });
});
