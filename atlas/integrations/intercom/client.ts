/**
 * Intercom client wrapper for Atlas.
 * Provides typed send/receive with message validation.
 */

import * as path from 'node:path';

export interface IntercomSession {
  id: string;
  name: string;
  model: string;
  pid: number;
  startedAt: number;
  lastActivity: number;
  status: string;
}

export interface IntercomMessage {
  id: string;
  from: string;
  content: { text: string };
  timestamp: number;
}

/** Broker-level outcome of a send. `delivered: true` means the broker
 * accepted the message (live delivery OR offline mailbox) — NOT that the
 * receiver actually got it. Use receipts (onReceipt) for real delivery. */
export interface SendResult {
  id: string;
  delivered: boolean;
  reason?: string;
}

/** Delivery receipt echoed back from the receiver via the broker. */
export interface ReceiptInfo {
  messageId: string;
  status: string;
  timestamp: number;
  detail?: string;
}

type MessageHandler = (from: IntercomSession, message: IntercomMessage) => void | Promise<void>;
type SessionHandler = (session: IntercomSession) => void | Promise<void>;
type ReceiptHandler = (session: IntercomSession, receipt: ReceiptInfo) => void | Promise<void>;

// ─── Client ─────────────────────────────────────────────────────────

export class IntercomClient {
  private intercom: any = null;
  private messageHandlers: MessageHandler[] = [];
  private sessionHandlers: SessionHandler[] = [];
  private receiptHandlers: ReceiptHandler[] = [];
  private connected = false;
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  async connect(): Promise<void> {
    const modulePath = findIntercomModule();
    const mod = await import(modulePath);
    const { IntercomClient: IC } = mod;

    const repoRoot = findRepoRoot();

    // Try to spawn broker if needed.
    // modulePath = .../pi-intercom/broker/client.ts
    // dirname   = .../pi-intercom/broker/
    // spawn.ts lives alongside client.ts in broker/, not broker/broker/
    try {
      const spawnMod = await import(path.join(path.dirname(modulePath), 'spawn.ts'));
      await spawnMod.spawnBrokerIfNeeded('npx', ['--no-install', 'tsx']);
    } catch { /* broker may already be running */ }

    this.intercom = new IC();
    await this.intercom.connect({
      name: this.name,
      cwd: repoRoot,
      model: 'atlas',
      pid: process.pid,
      startedAt: Date.now(),
      lastActivity: Date.now(),
      status: 'running',
    });

    // Wire up event listeners
    this.intercom.on('message', (from: IntercomSession, message: IntercomMessage) => {
      for (const handler of this.messageHandlers) {
        try { handler(from, message); } catch { /* handler errors are non-fatal */ }
      }
    });

    this.intercom.on('session_joined', (session: IntercomSession) => {
      for (const handler of this.sessionHandlers) {
        try { handler(session); } catch { /* handler errors are non-fatal */ }
      }
    });

    // Receipts flow back from the receiver through the broker. They are the
    // only authoritative signal that a message reached its destination — the
    // broker acks sends even when it mailboxes them for an offline session.
    this.intercom.on('message_receipt', (session: IntercomSession, receipt: ReceiptInfo) => {
      for (const handler of this.receiptHandlers) {
        try { handler(session, receipt); } catch { /* handler errors are non-fatal */ }
      }
    });

    this.connected = true;
    console.log(`[Intercom] Connected as "${this.name}"`);
  }

  async disconnect(): Promise<void> {
    if (this.intercom) {
      try { await this.intercom.disconnect(); } catch { /* ignore */ }
    }
    this.connected = false;
    this.intercom = null;
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  onSession(handler: SessionHandler): void {
    this.sessionHandlers.push(handler);
  }

  onReceipt(handler: ReceiptHandler): void {
    this.receiptHandlers.push(handler);
  }

  /** Returns broker-level delivery info (see SendResult doc). */
  async send(to: string, text: string): Promise<SendResult> {
    if (!this.intercom) throw new Error('Not connected');
    return await this.intercom.send(to, { text });
  }

  async listSessions(): Promise<IntercomSession[]> {
    if (!this.intercom) return [];
    try {
      return await this.intercom.listSessions();
    } catch {
      return [];
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    try {
      const cp = require('node:child_process');
      const result = cp.spawnSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: dir, encoding: 'utf-8', timeout: 3000,
      });
      if (result.status === 0) return result.stdout.trim();
    } catch { /* ignore */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function findIntercomModule(): string {
  // Try pi-intercom from the repo's .pi/npm first
  const repoRoot = findRepoRoot();
  const candidates = [
    path.join(repoRoot, '.pi', 'npm', 'node_modules', 'pi-intercom', 'broker', 'client.ts'),
    path.join(repoRoot, 'atlas', 'node_modules', 'pi-intercom', 'broker', 'client.ts'),
  ];

  for (const candidate of candidates) {
    try {
      require('node:fs').statSync(candidate);
      return candidate;
    } catch { /* not found */ }
  }

  throw new Error(
    'pi-intercom not found. Install it: npm install pi-intercom',
  );
}
