import { describe, test, expect, afterEach } from 'vitest';
import { IPCServer } from '../../src/ipc/socket-server.js';
import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';

// Helper: send one RPC and return the response
async function sendRpc(
  socketPath: string,
  command: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } }> {
  return new Promise((resolve, reject) => {
    const conn = net.createConnection(socketPath);
    const rl = readline.createInterface({ input: conn });
    const requestId = 'test-req-1';

    conn.on('connect', () => {
      conn.write(JSON.stringify({ type: 'request', requestId, command, args }) + '\n');
    });

    rl.on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        if (msg.requestId === requestId) {
          conn.destroy();
          resolve(msg);
        }
      } catch { /* ignore */ }
    });

    conn.on('error', reject);
    setTimeout(() => { conn.destroy(); reject(new Error('timeout')); }, 2000);
  });
}

const servers: IPCServer[] = [];

afterEach(async () => {
  for (const s of servers) {
    try { await s.close(); } catch { /* ignore */ }
  }
  servers.length = 0;
});

describe('IPCServer', () => {
  test('server 响应 create 命令', async () => {
    const socketPath = path.join(os.tmpdir(), `mm-test-${Date.now()}.sock`);
    const server = new IPCServer(socketPath);
    servers.push(server);
    server.handle('create', async (args) => ({ session: { name: args['name'], status: 'idle' } }));
    await server.listen();

    const response = await sendRpc(socketPath, 'create', { name: 'test' });
    expect(response.ok).toBe(true);
    expect(response.data?.['session']).toMatchObject({ name: 'test', status: 'idle' });
  });

  test('server 返回 UNKNOWN_COMMAND 错误', async () => {
    const socketPath = path.join(os.tmpdir(), `mm-test-${Date.now()}.sock`);
    const server = new IPCServer(socketPath);
    servers.push(server);
    await server.listen();

    const response = await sendRpc(socketPath, 'nonexistent', {});
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe('UNKNOWN_COMMAND');
  });

  test('ping/pong keepalive', async () => {
    const socketPath = path.join(os.tmpdir(), `mm-test-${Date.now()}.sock`);
    const server = new IPCServer(socketPath);
    servers.push(server);
    await server.listen();

    const pong = await new Promise<string>((resolve, reject) => {
      const conn = net.createConnection(socketPath);
      const rl = readline.createInterface({ input: conn });
      conn.on('connect', () => conn.write(JSON.stringify({ type: 'ping' }) + '\n'));
      rl.on('line', (line) => { conn.destroy(); resolve(line); });
      conn.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 2000);
    });
    expect(JSON.parse(pong).type).toBe('pong');
  });

  // P1: server-push event & subscribe
  test('subscribe 命令注册长连接，收到 session_state_changed 事件', async () => {
    const socketPath = path.join(os.tmpdir(), `mm-test-${Date.now()}.sock`);
    const server = new IPCServer(socketPath);
    servers.push(server);
    await server.listen();

    const received: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const conn = net.createConnection(socketPath);
      const rl = readline.createInterface({ input: conn });

      rl.on('line', (line) => received.push(line));

      conn.on('connect', () => {
        conn.write(JSON.stringify({ type: 'request', requestId: 'sub-1', command: 'subscribe', args: {} }) + '\n');
      });

      // Wait for subscribe response before pushing event
      setTimeout(async () => {
        server.pushEvent({ type: 'event', event: 'session_state_changed', data: { name: 'test', status: 'idle', revision: 1 } });
        setTimeout(() => {
          conn.destroy();
          resolve();
        }, 80);
      }, 80);

      conn.on('error', reject);
    });

    expect(received.some(l => {
      try { return JSON.parse(l).event === 'session_state_changed'; }
      catch { return false; }
    })).toBe(true);
  });

  test('handler 抛出错误时返回 INTERNAL_ERROR', async () => {
    const socketPath = path.join(os.tmpdir(), `mm-test-${Date.now()}.sock`);
    const server = new IPCServer(socketPath);
    servers.push(server);
    server.handle('boom', async () => { throw new Error('oops'); });
    await server.listen();

    const response = await sendRpc(socketPath, 'boom', {});
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe('INTERNAL_ERROR');
  });
});
