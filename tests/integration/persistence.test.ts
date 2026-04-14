import { describe, test, expect } from 'vitest';
import { SessionRegistry } from '../../src/session-registry.js';
import { PersistenceStore } from '../../src/persistence.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

describe('PersistenceStore', () => {
  test('写入后重新加载可恢复 session', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-coder-test-'));
    const store = new PersistenceStore(path.join(dir, 'sessions.json'));
    const r1 = new SessionRegistry(store);
    r1.create('test', { workdir: '/tmp', cliPlugin: 'claude-code' });
    await store.flush();

    const store2 = new PersistenceStore(path.join(dir, 'sessions.json'));
    const r2 = new SessionRegistry(store2);
    await store2.load(r2);
    expect(r2.get('test')?.name).toBe('test');
  });

  test('重启后 attached/im_processing 状态重置为 recovering', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-coder-test-'));
    const store = new PersistenceStore(path.join(dir, 'sessions.json'));
    // 手动写入非干净状态
    fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify({
      version: 1,
      sessions: [{ name: 'broken', status: 'im_processing', cliPlugin: 'claude-code', workdir: '/tmp' }],
    }));
    const store2 = new PersistenceStore(path.join(dir, 'sessions.json'));
    const r2 = new SessionRegistry(store2);
    await store2.load(r2);
    expect(r2.get('broken')?.status).toBe('recovering');
  });

  test('approval_pending/takeover_pending 重启后也重置为 recovering', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-coder-test-'));
    fs.writeFileSync(path.join(dir, 'sessions.json'), JSON.stringify({
      version: 1,
      sessions: [
        { name: 'a', status: 'approval_pending', cliPlugin: 'claude-code', workdir: '/tmp' },
        { name: 'b', status: 'takeover_pending', cliPlugin: 'claude-code', workdir: '/tmp' },
      ],
    }));
    const store = new PersistenceStore(path.join(dir, 'sessions.json'));
    const r = new SessionRegistry(store);
    await store.load(r);
    expect(r.get('a')?.status).toBe('recovering');
    expect(r.get('b')?.status).toBe('recovering');
  });

  test('原子写：flush 使用 .tmp 后 rename', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-coder-test-'));
    const filePath = path.join(dir, 'sessions.json');
    const store = new PersistenceStore(filePath);
    const r = new SessionRegistry(store);
    r.create('atomictest', { workdir: '/tmp', cliPlugin: 'claude-code' });
    await store.flush();
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.existsSync(filePath + '.tmp')).toBe(false);
  });
});
