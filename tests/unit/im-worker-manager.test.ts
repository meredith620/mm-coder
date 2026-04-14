import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { IMWorkerManager } from '../../src/im-worker-manager.js';
import { SessionRegistry } from '../../src/session-registry.js';
import type { CLIPlugin, CommandSpec } from '../../src/plugins/types.js';
import type { Session } from '../../src/types.js';
import { spawn } from 'child_process';

// Mock CLI plugin that spawns a sleep process
class MockCLIPlugin implements CLIPlugin {
  buildAttachCommand(session: Session): CommandSpec {
    return { command: 'sleep', args: ['60'] };
  }

  buildIMWorkerCommand(session: Session, bridgeScriptPath: string): CommandSpec {
    return { command: 'sleep', args: ['60'] };
  }

  generateSessionId(): string {
    return 'mock-session-id';
  }
}

// Mock CLI plugin that spawns a process that exits immediately
class CrashingCLIPlugin implements CLIPlugin {
  buildAttachCommand(session: Session): CommandSpec {
    return { command: 'false', args: [] };
  }

  buildIMWorkerCommand(session: Session, bridgeScriptPath: string): CommandSpec {
    return { command: 'false', args: [] };
  }

  generateSessionId(): string {
    return 'mock-session-id';
  }
}

describe('IMWorkerManager', () => {
  let registry: SessionRegistry;
  let mockPlugin: MockCLIPlugin;
  let crashingPlugin: CrashingCLIPlugin;

  beforeEach(() => {
    registry = new SessionRegistry();
    mockPlugin = new MockCLIPlugin();
    crashingPlugin = new CrashingCLIPlugin();
  });

  afterEach(async () => {
    // Clean up any running processes
    for (const [name] of registry['_sessions']) {
      const session = registry.get(name);
      if (session?.imWorkerPid) {
        try {
          process.kill(session.imWorkerPid, 'SIGKILL');
        } catch {}
      }
    }
  });

  test('spawn 后 isAlive 返回 true', async () => {
    const session = registry.create('test', { workdir: '/tmp', cliPlugin: 'mock' });
    const mgr = new IMWorkerManager(mockPlugin, registry);

    await mgr.spawn(session);
    expect(mgr.isAlive('test')).toBe(true);

    await mgr.terminate('test');
  });

  test('terminate 后 isAlive 返回 false', async () => {
    const session = registry.create('test', { workdir: '/tmp', cliPlugin: 'mock' });
    const mgr = new IMWorkerManager(mockPlugin, registry);

    await mgr.spawn(session);
    await mgr.terminate('test');

    // Wait a bit for process to exit
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(mgr.isAlive('test')).toBe(false);
  });

  test('崩溃后 restartIfCrashed 递增 crashCount', async () => {
    const session = registry.create('test', { workdir: '/tmp', cliPlugin: 'crashing' });
    const mgr = new IMWorkerManager(crashingPlugin, registry);

    await mgr.spawn(session);

    // Wait for crash and restart
    await new Promise(resolve => setTimeout(resolve, 500));

    const updated = registry.get('test')!;
    expect(updated.imWorkerCrashCount).toBeGreaterThan(0);

    // Clean up
    if (updated.imWorkerPid) {
      try {
        process.kill(updated.imWorkerPid, 'SIGKILL');
      } catch {}
    }
  }, 10000);

  test('超过 maxCrashCount 进入 error 状态', async () => {
    const session = registry.create('test', { workdir: '/tmp', cliPlugin: 'crashing' });
    const mgr = new IMWorkerManager(crashingPlugin, registry);

    await mgr.spawn(session);

    // Wait for all restart attempts (3 crashes)
    await new Promise(resolve => setTimeout(resolve, 5000));

    const updated = registry.get('test')!;
    expect(updated.status).toBe('error');
    expect(updated.imWorkerCrashCount).toBeGreaterThanOrEqual(3);
  }, 15000);

  test('成功处理一条消息后 resetCrashCountOnSuccess 清零', () => {
    const session = registry.create('test', { workdir: '/tmp', cliPlugin: 'mock' });
    const mgr = new IMWorkerManager(mockPlugin, registry);

    // Manually set crashCount
    registry['_sessions'].get('test')!.imWorkerCrashCount = 2;

    mgr.resetCrashCountOnSuccess('test', 'correlation-1');

    expect(registry.get('test')!.imWorkerCrashCount).toBe(0);
  });

  test('spawnGeneration：并发 spawn 时仅有一个活跃 worker', async () => {
    const session = registry.create('gen-test', { workdir: '/tmp', cliPlugin: 'mock' });
    const mgr = new IMWorkerManager(mockPlugin, registry);

    // Simulate pre-warm and lazy spawn both triggering
    const spawn1 = mgr.spawn(session);
    const spawn2 = mgr.spawn(session);

    await Promise.allSettled([spawn1, spawn2]);

    // Only one valid imWorkerPid at any time
    const s = registry.get('gen-test')!;
    expect(mgr.isAlive(s.name)).toBe(true);

    // Clean up
    await mgr.terminate('gen-test');
  });

  test('generation 不匹配时 stale worker 立即被终止', async () => {
    const session = registry.create('test', { workdir: '/tmp', cliPlugin: 'mock' });
    const mgr = new IMWorkerManager(mockPlugin, registry);

    // First spawn
    await mgr.spawn(session);
    const firstPid = registry.get('test')!.imWorkerPid;

    // Increment generation manually
    registry['_sessions'].get('test')!.spawnGeneration++;

    // Second spawn (should terminate first)
    await mgr.spawn(session);
    const secondPid = registry.get('test')!.imWorkerPid;

    expect(secondPid).not.toBe(firstPid);

    // Wait for first process to exit
    await new Promise(resolve => setTimeout(resolve, 200));

    // First process should be dead
    let firstAlive = true;
    try {
      process.kill(firstPid!, 0);
    } catch {
      firstAlive = false;
    }
    expect(firstAlive).toBe(false);

    // Clean up
    await mgr.terminate('test');
  });
});
