import { spawn } from 'child_process';
import * as net from 'net';
import * as readline from 'readline';
import { encodeRequest, encodeResponse, decodeMessage } from './ipc/codec.js';

export interface AttachOptions {
  socketPath: string;
  sessionName: string;
  cliCommand: string;
  cliArgs: string[];
}

/**
 * Attach to a session: notify daemon, wait if IM is processing, spawn CLI, then notify detach.
 */
export async function attachSession(opts: AttachOptions): Promise<void> {
  const { socketPath, sessionName, cliCommand, cliArgs } = opts;

  // Connect to daemon
  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const s = net.createConnection(socketPath);
    s.on('connect', () => resolve(s));
    s.on('error', reject);
  });

  const rl = readline.createInterface({ input: socket, crlfDelay: Infinity });
  const pending = new Map<string, (line: string) => void>();
  let resumeResolve: (() => void) | null = null;

  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const msg = decodeMessage(line);
      if (msg.type === 'response') {
        const handler = pending.get(msg.requestId);
        if (handler) {
          pending.delete(msg.requestId);
          handler(line);
        }
      } else if (msg.type === 'event') {
        const ev = msg as { type: 'event'; event: string; data: Record<string, unknown> };
        if (ev.event === 'session_resume' && resumeResolve) {
          resumeResolve();
          resumeResolve = null;
        }
      }
    } catch { /* ignore */ }
  });

  function sendRequest(command: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const line = encodeRequest(command, args);
      const requestId = (JSON.parse(line) as { requestId: string }).requestId;
      pending.set(requestId, (responseLine) => {
        try {
          const msg = JSON.parse(responseLine) as { ok: boolean; data?: Record<string, unknown>; error?: unknown };
          if (msg.ok) resolve(msg.data ?? {});
          else reject(new Error(JSON.stringify(msg.error)));
        } catch (e) { reject(e); }
      });
      socket.write(line + '\n');
    });
  }

  try {
    // Send attach command
    const attachResult = await sendRequest('attach', { name: sessionName, pid: process.pid });

    // If waitRequired, wait for resume event
    if (attachResult.waitRequired) {
      await new Promise<void>(resolve => { resumeResolve = resolve; });
    }

    // Spawn CLI
    const exitCode = await new Promise<number>((resolve) => {
      const proc = spawn(cliCommand, cliArgs, { stdio: 'inherit' });
      proc.on('close', (code) => resolve(code ?? 0));
      proc.on('error', () => resolve(1));
    });

    // Notify daemon of detach
    await sendRequest('markDetached', {
      name: sessionName,
      exitReason: exitCode === 0 ? 'normal' : 'error',
      exitCode,
    });
  } finally {
    rl.close();
    socket.destroy();
  }
}
