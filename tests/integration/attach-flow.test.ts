import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { attachSession } from '../../src/attach.js';
import { encodeResponse } from '../../src/ipc/codec.js';

describe('attach 流程', () => {
  let tmpDir: string;
  let socketPath: string;
  let server: net.Server;
  let receivedCommands: Array<{ command: string; args: Record<string, unknown> }>;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-attach-test-'));
    socketPath = path.join(tmpDir, 'daemon.sock');
    receivedCommands = [];

    server = net.createServer(socket => {
      let buf = '';
      socket.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as { type: string; requestId: string; command: string; args: Record<string, unknown> };
            if (msg.type === 'request') {
              receivedCommands.push({ command: msg.command, args: msg.args });
              // Respond with ok
              socket.write(encodeResponse(msg.requestId, { ok: true, waitRequired: false }) + '\n');
            }
          } catch { /* ignore */ }
        }
      });
    });

    await new Promise<void>(resolve => server.listen(socketPath, resolve));
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('attach 完整流程：通知 daemon → spawn → 退出 → 通知 detach', async () => {
    // Create a mock CLI script that exits immediately
    const mockCli = path.join(tmpDir, 'mock-cli.sh');
    fs.writeFileSync(mockCli, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    await attachSession({
      socketPath,
      sessionName: 'test-session',
      cliCommand: mockCli,
      cliArgs: [],
    });

    // Should have sent 'attach' and 'markDetached'
    const commands = receivedCommands.map(r => r.command);
    expect(commands).toContain('attach');
    expect(commands).toContain('markDetached');

    const detachCmd = receivedCommands.find(r => r.command === 'markDetached');
    expect(detachCmd?.args.exitReason).toBe('normal');
  }, 10000);

  test('attach 期间 IM 正在处理：waitRequired 为 true 时等待 resume', async () => {
    // Override server to return waitRequired: true for attach, then send resume event
    server.removeAllListeners('connection');
    server.on('connection', socket => {
      let buf = '';
      let attachHandled = false;
      socket.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line) as { type: string; requestId: string; command: string; args: Record<string, unknown> };
            if (msg.type === 'request') {
              receivedCommands.push({ command: msg.command, args: msg.args });
              if (msg.command === 'attach' && !attachHandled) {
                attachHandled = true;
                socket.write(encodeResponse(msg.requestId, { ok: true, waitRequired: true }) + '\n');
                // Send resume event after short delay
                setTimeout(() => {
                  socket.write(JSON.stringify({ type: 'event', event: 'session_resume', data: { name: 'wait-session' } }) + '\n');
                }, 50);
              } else {
                socket.write(encodeResponse(msg.requestId, { ok: true }) + '\n');
              }
            }
          } catch { /* ignore */ }
        }
      });
    });

    const mockCli = path.join(tmpDir, 'mock-cli2.sh');
    fs.writeFileSync(mockCli, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

    await attachSession({
      socketPath,
      sessionName: 'wait-session',
      cliCommand: mockCli,
      cliArgs: [],
    });

    const commands = receivedCommands.map(r => r.command);
    expect(commands).toContain('attach');
    expect(commands).toContain('markDetached');
  }, 10000);
});
