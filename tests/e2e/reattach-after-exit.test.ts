import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { IPCClient } from '../../src/ipc/client.js';

describe('Re-attach after CLI exit E2E', () => {
  let tmpDir: string;
  let socketPath: string;
  let daemonProc: ChildProcess | null = null;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-coder-reattach-test-'));
    socketPath = path.join(tmpDir, 'daemon.sock');
    const persistencePath = path.join(tmpDir, 'sessions.json');

    // Start daemon with isolated persistence
    const daemonScript = path.resolve('./dist/daemon-main.js');
    daemonProc = spawn(process.execPath, [daemonScript, socketPath, '', persistencePath], {
      stdio: 'ignore',
      detached: false,
    });

    // Wait for socket
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon socket timeout')), 5000);
      const check = setInterval(() => {
        if (fs.existsSync(socketPath)) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      }, 50);
    });
  });

  afterEach(async () => {
    if (daemonProc) {
      daemonProc.kill('SIGTERM');
      // Wait for daemon to exit
      await new Promise<void>((resolve) => {
        if (!daemonProc) { resolve(); return; }
        daemonProc.on('exit', () => resolve());
        setTimeout(() => resolve(), 1000); // Fallback timeout
      });
      daemonProc = null;
    }
    // Additional wait for file handles to be released
    await new Promise(resolve => setTimeout(resolve, 100));
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('attach → CLI exits → markDetached → re-attach succeeds', async () => {
    const client = new IPCClient(socketPath);
    await client.connect();

    // Create session
    const createRes = await client.send('create', {
      name: 'test-session',
      workdir: tmpDir,
      cli: 'claude-code',
    });
    if (!createRes.ok) {
      throw new Error(`Create failed: ${createRes.error?.message}`);
    }
    expect(createRes.ok).toBe(true);

    // First attach
    const attach1Res = await client.send('attach', {
      name: 'test-session',
      pid: process.pid,
    });
    expect(attach1Res.ok).toBe(true);
    expect(attach1Res.data?.session.status).toBe('attached');

    // Simulate CLI exit: send markDetached
    const markDetachedRes = await client.send('markDetached', {
      name: 'test-session',
      exitReason: 'normal',
    });
    expect(markDetachedRes.ok).toBe(true);

    // Check session is now idle
    const statusRes = await client.send('status', {});
    expect(statusRes.ok).toBe(true);
    const sessions = statusRes.data?.sessions as Array<{ name: string; status: string }>;
    const session = sessions.find(s => s.name === 'test-session');
    expect(session?.status).toBe('idle');

    // Re-attach should succeed (this was failing with INVALID_STATE_TRANSITION before fix)
    const attach2Res = await client.send('attach', {
      name: 'test-session',
      pid: process.pid + 1,
    });
    expect(attach2Res.ok).toBe(true);
    expect(attach2Res.data?.session.status).toBe('attached');

    await client.close();
  });

  it('attach → CLI exits → persistence flush → daemon restart → re-attach succeeds', async () => {
    const persistencePath = path.join(tmpDir, 'sessions.json');

    // Restart daemon with persistence
    if (daemonProc) {
      daemonProc.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const daemonScript = path.resolve('./dist/daemon-main.js');
    daemonProc = spawn(process.execPath, [daemonScript, socketPath, '', persistencePath], {
      stdio: 'ignore',
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon socket timeout')), 5000);
      const check = setInterval(() => {
        if (fs.existsSync(socketPath)) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      }, 50);
    });

    const client = new IPCClient(socketPath);
    await client.connect();

    // Create session
    const createRes = await client.send('create', {
      name: 'persist-session',
      workdir: tmpDir,
      cli: 'claude-code',
    });
    expect(createRes.ok).toBe(true);

    // Attach
    const attachRes = await client.send('attach', {
      name: 'persist-session',
      pid: process.pid,
    });
    expect(attachRes.ok).toBe(true);

    // Mark detached
    await client.send('markDetached', {
      name: 'persist-session',
      exitReason: 'normal',
    });

    await client.close();

    // Verify persistence file exists
    expect(fs.existsSync(persistencePath)).toBe(true);

    // Restart daemon
    daemonProc.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 200));

    daemonProc = spawn(process.execPath, [daemonScript, socketPath, '', persistencePath], {
      stdio: 'ignore',
      detached: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Daemon socket timeout after restart')), 5000);
      const check = setInterval(() => {
        if (fs.existsSync(socketPath)) {
          clearInterval(check);
          clearTimeout(timeout);
          resolve();
        }
      }, 50);
    });

    // Reconnect and verify session persisted
    const client2 = new IPCClient(socketPath);
    await client2.connect();

    const listRes = await client2.send('list', {});
    expect(listRes.ok).toBe(true);
    const sessions = listRes.data?.sessions as Array<{ name: string; status: string }>;
    const session = sessions.find(s => s.name === 'persist-session');
    expect(session).toBeDefined();
    expect(session?.status).toBe('idle');

    // Re-attach after restart
    const reattachRes = await client2.send('attach', {
      name: 'persist-session',
      pid: process.pid + 2,
    });
    expect(reattachRes.ok).toBe(true);
    expect(reattachRes.data?.session.status).toBe('attached');

    await client2.close();
  });
});
