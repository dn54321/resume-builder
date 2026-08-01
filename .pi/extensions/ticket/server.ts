/**
 * GitHub webhook server with ngrok tunnel support.
 *
 * Listens for PR events and comment events, notifying the orchestrator
 * so it can re-prioritize the queue and spawn agents.
 * Uses ngrok to expose the local server to the internet for GitHub webhooks.
 */

import * as http from 'node:http';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GraphNode } from './types.js';
import { findMergeConflicts, getUnaddressedComments, scanAllPRComments } from './github-pr.js';
import { getRepoRoot } from './git.js';

export type WebhookEvent =
  | { type: 'pr_opened'; prNumber: number }
  | { type: 'pr_synchronize'; prNumber: number }
  | { type: 'pr_comment'; prNumber: number; ticketId: string | null }
  | { type: 'shutdown' };

type EventHandler = (event: WebhookEvent) => void;

let server: http.Server | null = null;
let handler: EventHandler | null = null;

function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** Extract ticket ID from branch name: ticket/res-6 → RES-6 */
function ticketFromBranch(branch: string): string | null {
  const m = branch.match(/ticket\/([a-z]+-\d+)/i);
  return m ? m[1]!.toUpperCase() : null;
}

export function startWebhookServer(
  port: number,
  onEvent: EventHandler,
): http.Server {
  handler = onEvent;

  server = http.createServer(async (req, res) => {
    if (req.url !== '/github-webhook' || req.method !== 'POST') {
      res.writeHead(404);
      res.end('not found');
      return;
    }

    const eventType = req.headers['x-github-event'] as string;
    if (!eventType) {
      res.writeHead(400);
      res.end('missing event type');
      return;
    }

    // Acknowledge immediately — processing happens async
    res.writeHead(200);
    res.end('ok');

    try {
      const body = await parseBody(req);
      const payload = JSON.parse(body);

      switch (eventType) {
        case 'pull_request': {
          const action = payload.action;
          const prNumber = payload.number;

          if (action === 'opened' || action === 'reopened') {
            handler?.({ type: 'pr_opened', prNumber });
          } else if (action === 'synchronize') {
            // New commits pushed to PR — check merge conflicts
            handler?.({ type: 'pr_synchronize', prNumber });
          }
          break;
        }

        case 'issue_comment': {
          if (payload.issue?.pull_request) {
            // This is a PR comment, not a plain issue comment
            const prNumber = payload.issue.number;
            const branch = payload.issue?.pull_request?.head?.ref ?? payload.issue?.head?.ref ?? '';
            const ticketId = ticketFromBranch(branch);
            handler?.({ type: 'pr_comment', prNumber, ticketId });
          }
          break;
        }

        case 'pull_request_review_comment': {
          const prUrl = payload.pull_request?.html_url ?? '';
          // Extract PR number from URL
          const prMatch = prUrl.match(/\/pull\/(\d+)/);
          const prNumber = prMatch ? parseInt(prMatch[1]!) : 0;
          const branch = payload.pull_request?.head?.ref ?? '';
          const ticketId = ticketFromBranch(branch);
          if (prNumber > 0) {
            handler?.({ type: 'pr_comment', prNumber, ticketId });
          }
          break;
        }

        default:
          // Ignore other events (push, status, etc.)
          break;
      }
    } catch (err) {
      console.error('Webhook processing error:', (err as Error).message);
    }
  });

  server.listen(port, () => {
    console.log(`Webhook server listening on port ${port}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Webhook server not started.`);
    } else {
      console.error('Webhook server error:', err.message);
    }
  });

  return server;
}

let ngrokProc: cp.ChildProcess | null = null;
let ngrokUrl: string | null = null;
let ngrokLineBuf = '';

/** Find the ngrok binary — bundled with the npm package. */
function findNgrokBin(): string {
  const repo = getRepoRoot();
  // Try npm-installed ngrok binary
  const bundled = `${repo}/.pi/extensions/ticket/node_modules/ngrok/bin/ngrok`;
  if (fs.existsSync(bundled)) return bundled;
  // Fall back to system ngrok
  return 'ngrok';
}

/** Read the ngrok authtoken from .env.agent or environment. */
function getNgrokAuthtoken(): string {
  // Check env first
  if (process.env.NGROK_AUTHTOKEN) return process.env.NGROK_AUTHTOKEN;
  if (process.env.NGROK_AUTH_TOKEN) return process.env.NGROK_AUTH_TOKEN;
  // Read from .env.agent
  try {
    const envPath = path.join(getRepoRoot(), '.env.agent');
    if (!fs.existsSync(envPath)) return '';
    const raw = fs.readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key === 'NGROK_AUTHTOKEN' && val) return val;
    }
  } catch { /* ignore */ }
  return '';
}

/** Start an ngrok tunnel to the webhook server port. Returns the public URL or null. */
export function startNgrokTunnel(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const ngrokBin = findNgrokBin();
    const args = ['http', String(port), '--log=stdout', '--log-format=json'];
    const authtoken = getNgrokAuthtoken();
    if (authtoken) args.push('--authtoken', authtoken);

    try {
      ngrokProc = cp.spawn(ngrokBin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    } catch (err) {
      console.error('Failed to spawn ngrok:', (err as Error).message);
      resolve(null);
      return;
    }

    const timeout = setTimeout(() => {
      resolve(null);
    }, 15000);

    ngrokProc.stdout?.on('data', (data: Buffer) => {
      ngrokLineBuf += data.toString();
      const lines = ngrokLineBuf.split('\n');
      ngrokLineBuf = lines.pop() ?? '';
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.url && entry.url.startsWith('http')) {
            ngrokUrl = entry.url;
            clearTimeout(timeout);
            resolve(ngrokUrl);
          }
          if (entry.msg?.includes('authtoken') || entry.msg?.includes('account')) {
            clearTimeout(timeout);
            resolve(null);
          }
        } catch { /* skip non-JSON lines */ }
      }
    });

    ngrokProc.on('error', () => {
      clearTimeout(timeout);
      resolve(null);
    });

    ngrokProc.on('exit', (code) => {
      if (!ngrokUrl) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  });
}

/** Get the current ngrok public URL, or null if not connected. */
export function getNgrokUrl(): string | null {
  return ngrokUrl;
}

/** Stop ngrok tunnel and close the webhook server. */
export function stopWebhookServer(): void {
  if (ngrokProc) {
    ngrokProc.kill('SIGTERM');
    ngrokProc = null;
  }
  ngrokUrl = null;
  ngrokLineBuf = '';
  if (server) {
    server.close();
    server = null;
  }
  handler = null;
}
