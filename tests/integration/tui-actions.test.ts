import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Daemon } from '../../src/daemon.js';
import { IPCClient } from '../../src/ipc/client.js';
import { createTuiActions } from '../../src/tui.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';


describe('TUI actions', () => {
  let tmpDir: string;
  let socketPath: string;
  let daemon: Daemon;
  let client: IPCClient;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-tui-actions-'));
    socketPath = path.join(tmpDir, 'daemon.sock');
    daemon = new Daemon(socketPath);
    await daemon.start();
    client = new IPCClient(socketPath);
    await client.connect();
  });

  afterEach(async () => {
    await client.close();
    await daemon.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('create / status / remove 动作可通过 IPC 完成闭环', async () => {
    const actions = createTuiActions(client);

    const created = await actions.createSession({ name: 'demo', workdir: tmpDir, cli: 'claude-code' });
    expect(created.name).toBe('demo');

    const status = await actions.getStatus('demo');
    expect(status.name).toBe('demo');
    expect(status.status).toBe('idle');

    await actions.removeSession('demo');

    const listRes = await client.send('list', {});
    expect(listRes.ok).toBe(true);
    const sessions = listRes.data.sessions as Array<Record<string, unknown>>;
    expect(sessions.some((session) => session.name === 'demo')).toBe(false);
  });

  test('diagnose / takeover-status / takeover-cancel / import 动作可通过 IPC 完成闭环', async () => {
    const actions = createTuiActions(client);

    await actions.importSession({ sessionId: 'sess-123', name: 'imported', workdir: tmpDir, cli: 'claude-code' });
    const diagnose = await actions.diagnoseSession('imported');
    expect(diagnose.name).toBe('imported');
    expect(diagnose.status).toBe('idle');

    await client.send('attach', { name: 'imported', pid: 1001 });
    (daemon.registry as any).requestTakeover('imported', 'user-im');

    const takeover = await actions.getTakeoverStatus('imported');
    expect(takeover.session.status).toBe('takeover_pending');

    const cancelled = await actions.cancelTakeover('imported');
    expect(cancelled.session.status).toBe('attached');
  });
});
