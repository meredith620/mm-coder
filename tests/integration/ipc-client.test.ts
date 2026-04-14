import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { IPCServer } from '../../src/ipc/socket-server.js';
import { IPCClient } from '../../src/ipc/client.js';
import * as path from 'path';
import * as os from 'os';

let server: IPCServer;
let client: IPCClient;
let socketPath: string;

beforeEach(async () => {
  socketPath = path.join(os.tmpdir(), `mm-test-client-${Date.now()}.sock`);
  server = new IPCServer(socketPath);
  server.handle('list', async () => ({ sessions: [] }));
  server.handle('slow', async () => {
    await new Promise(r => setTimeout(r, 500));
    return {};
  });
  await server.listen();
  client = new IPCClient(socketPath);
  await client.connect();
});

afterEach(async () => {
  await client.close();
  await server.close();
});

describe('IPCClient', () => {
  test('client.send 返回 server 响应', async () => {
    const response = await client.send('list', {});
    expect(response.ok).toBe(true);
  });

  test('client 超时时抛出 TIMEOUT 错误', async () => {
    await expect(client.send('slow', {}, { timeoutMs: 100 })).rejects.toThrow('TIMEOUT');
  });

  test('client 收到 UNKNOWN_COMMAND 时 ok 为 false', async () => {
    const response = await client.send('nonexistent', {});
    expect(response.ok).toBe(false);
    expect(response.error?.code).toBe('UNKNOWN_COMMAND');
  });

  test('多个并发请求按 requestId 正确匹配响应', async () => {
    const [r1, r2] = await Promise.all([
      client.send('list', {}),
      client.send('list', {}),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});
