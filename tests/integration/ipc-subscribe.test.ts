import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { IPCServer } from '../../src/ipc/socket-server.js';
import { IPCClient } from '../../src/ipc/client.js';
import * as path from 'path';
import * as os from 'os';

let server: IPCServer;
let client: IPCClient;
let socketPath: string;

beforeEach(async () => {
  socketPath = path.join(os.tmpdir(), `mm-test-subscribe-${Date.now()}.sock`);
  server = new IPCServer(socketPath);
  await server.listen();
  client = new IPCClient(socketPath);
  await client.connect();
});

afterEach(async () => {
  await client.close();
  await server.close();
});

describe('IPC subscribe client', () => {
  test('客户端可订阅并收到 session_state_changed 事件', async () => {
    const events: Array<{ event: string; data: Record<string, unknown> }> = [];

    await client.subscribe((event) => {
      events.push(event);
    });

    server.pushEvent({
      type: 'event',
      event: 'session_state_changed',
      data: { name: 'demo', status: 'idle', revision: 1 },
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('session_state_changed');
    expect(events[0].data.name).toBe('demo');
  });
});
