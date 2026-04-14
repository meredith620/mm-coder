import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Daemon } from '../../src/daemon.js';
import { IPCClient } from '../../src/ipc/client.js';
import * as path from 'path';
import * as os from 'os';

let daemon: Daemon;
let client: IPCClient;
let socketPath: string;

beforeEach(async () => {
  socketPath = path.join(os.tmpdir(), `mm-test-attach-${Date.now()}.sock`);
  daemon = new Daemon(socketPath);
  await daemon.start();
  client = new IPCClient(socketPath);
  await client.connect();
});

afterEach(async () => {
  await client.close();
  await daemon.stop();
});

describe('attach command', () => {
  test('attach idle session 成功', async () => {
    await client.send('create', { name: 'a1', workdir: '/tmp', cli: 'claude-code' });
    const res = await client.send('attach', { name: 'a1', pid: 9999 });
    expect(res.ok).toBe(true);

    const listRes = await client.send('list', {});
    const s = (listRes.data!.sessions as any[]).find((s: any) => s.name === 'a1');
    expect(s.status).toBe('attached');
  });

  test('attach im_processing session 返回 waitRequired + attach_pending', async () => {
    await client.send('create', { name: 'a2', workdir: '/tmp', cli: 'claude-code' });
    // 手动将 session 设为 im_processing
    daemon.registry['_sessions'].get('a2')!.status = 'im_processing';

    const res = await client.send('attach', { name: 'a2', pid: 9999 });
    expect(res.ok).toBe(true);
    expect(res.data!.waitRequired).toBe(true);

    const listRes = await client.send('list', {});
    const s = (listRes.data!.sessions as any[]).find((s: any) => s.name === 'a2');
    expect(s.status).toBe('attach_pending');
  });

  test('attach nonexistent session 返回 SESSION_NOT_FOUND', async () => {
    const res = await client.send('attach', { name: 'ghost', pid: 9999 });
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('SESSION_NOT_FOUND');
  });

  test('attach uninitialized session 触发懒初始化', async () => {
    await client.send('create', { name: 'a3', workdir: '/tmp', cli: 'claude-code' });
    const s1 = daemon.registry.get('a3')!;
    expect(s1.initState).toBe('uninitialized');

    const res = await client.send('attach', { name: 'a3', pid: 9999 });
    expect(res.ok).toBe(true);

    const s2 = daemon.registry.get('a3')!;
    expect(s2.initState).toBe('initialized');
    expect(s2.status).toBe('attached');
  });

  test('attach initializing session 返回 SESSION_BUSY', async () => {
    await client.send('create', { name: 'a4', workdir: '/tmp', cli: 'claude-code' });
    daemon.registry['_sessions'].get('a4')!.initState = 'initializing';

    const res = await client.send('attach', { name: 'a4', pid: 9999 });
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('SESSION_BUSY');
  });

  test('attach 优先：idle 态 attach 后 IM 消息入队', async () => {
    await client.send('create', { name: 'a5', workdir: '/tmp', cli: 'claude-code' });

    // attach first
    await client.send('attach', { name: 'a5', pid: 9999 });

    // then IM message arrives — should be queued, not rejected
    const s = daemon.registry.get('a5')!;
    expect(s.status).toBe('attached');
    // enqueueIMMessage should queue when attached
    daemon.registry.enqueueIMMessage('a5', {
      plugin: 'mock',
      threadId: 't1',
      messageId: 'm1',
      userId: 'u1',
      text: 'hello',
      receivedAt: new Date().toISOString(),
    });
    expect(daemon.registry.get('a5')!.messageQueue).toHaveLength(1);
  });
});
