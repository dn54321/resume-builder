/**
 * tmux-worker.ts — Interactive pi session for an agent tmux pane.
 *
 * Just runs pi in interactive mode. The controller sends work via intercom.
 * This replaces the old file-based command loop.
 */

import { spawnSync, spawn } from 'node:child_process';

function findPi(): string {
  for (const p of ['/home/dn54321/.local/share/pnpm/bin/pi', '/usr/local/bin/pi', 'pi']) {
    try { spawnSync(p, ['--version'], { timeout: 2000 }); return p; } catch {}
  }
  return 'pi';
}

const pi = spawn(findPi(), [], { stdio: 'inherit' });
pi.on('close', (code) => process.exit(code ?? 0));
