import { spawn, ChildProcess } from 'child_process';
import type { SessionRegistry } from './session-registry.js';
import type { CLIPlugin } from './plugins/types.js';
import type { Session } from './types.js';
import { Writable } from 'stream';

const MAX_CRASH_COUNT = 3;
const RESTART_DELAYS = [1000, 3000, 10000]; // ms

export class IMWorkerManager {
  private _plugin: CLIPlugin;
  private _registry: SessionRegistry;
  private _processes = new Map<string, ChildProcess>();
  private _restartTimers = new Map<string, NodeJS.Timeout>();

  constructor(plugin: CLIPlugin, registry: SessionRegistry) {
    this._plugin = plugin;
    this._registry = registry;
  }

  async spawn(session: Session): Promise<void> {
    const name = session.name;

    // Increment spawnGeneration atomically
    const currentGeneration = session.spawnGeneration + 1;
    this._registry['_sessions'].get(name)!.spawnGeneration = currentGeneration;

    // Terminate any existing worker (stale from previous generation)
    const existingProc = this._processes.get(name);
    if (existingProc) {
      existingProc.kill('SIGKILL');
      this._processes.delete(name);
    }

    // Build command
    const bridgePath = `/tmp/mm-coder-mcp-bridge-${session.sessionId}.js`;
    const { command, args } = this._plugin.buildIMWorkerCommand(session, bridgePath);

    // Spawn process
    const proc = spawn(command, args, {
      cwd: session.workdir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const pid = proc.pid!;

    // Register as active worker
    this._processes.set(name, proc);
    this._registry['_sessions'].get(name)!.imWorkerPid = pid;

    // Handle process exit
    proc.on('exit', (code) => {
      this._processes.delete(name);
      const s = this._registry.get(name);
      if (!s) return;

      this._registry['_sessions'].get(name)!.imWorkerPid = null;

      if (code !== 0 && code !== null) {
        // Crash detected
        this._handleCrash(name);
      }
    });
  }

  terminate(name: string, signal: NodeJS.Signals = 'SIGTERM'): void {
    const proc = this._processes.get(name);
    if (proc) {
      proc.kill(signal);
      this._processes.delete(name);
    }

    // Clear any pending restart timer
    const timer = this._restartTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      this._restartTimers.delete(name);
    }

    // Clear PID from registry
    const session = this._registry.get(name);
    if (session) {
      this._registry['_sessions'].get(name)!.imWorkerPid = null;
    }
  }

  isAlive(name: string): boolean {
    const session = this._registry.get(name);
    if (!session?.imWorkerPid) return false;

    try {
      process.kill(session.imWorkerPid, 0);
      return true;
    } catch {
      return false;
    }
  }

  resetCrashCountOnSuccess(name: string, correlationId: string): void {
    const session = this._registry.get(name);
    if (session) {
      this._registry['_sessions'].get(name)!.imWorkerCrashCount = 0;
    }
  }

  /** 向 IM worker stdin 写入 user 消息（JSONL 格式）；懒启动：若 worker 不存在则先 spawn */
  async sendMessage(name: string, text: string): Promise<void> {
    const session = this._registry.get(name);
    if (!session) throw new Error('SESSION_NOT_FOUND');

    // 懒启动
    if (!this._processes.has(name)) {
      await this.spawn(session);
    }

    const proc = this._processes.get(name);
    if (!proc?.stdin) return;

    const payload = JSON.stringify({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'text', text }],
      },
    });

    await new Promise<void>((resolve, reject) => {
      (proc.stdin as Writable).write(payload + '\n', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** pre-warm 钩子：attach 退出后立即启动 IM worker */
  async onDetach(name: string): Promise<void> {
    const session = this._registry.get(name);
    if (!session) return;

    if (!this._processes.has(name)) {
      await this.spawn(session);
    }
  }

  private _handleCrash(name: string): void {
    const session = this._registry.get(name);
    if (!session) return;

    const crashCount = session.imWorkerCrashCount + 1;
    this._registry['_sessions'].get(name)!.imWorkerCrashCount = crashCount;

    if (crashCount >= MAX_CRASH_COUNT) {
      // Max crashes exceeded - mark as error
      this._registry.markError(name, 'IM worker crashed too many times');
      return;
    }

    // Schedule restart with backoff
    const delay = RESTART_DELAYS[crashCount - 1] || RESTART_DELAYS[RESTART_DELAYS.length - 1];
    const timer = setTimeout(async () => {
      this._restartTimers.delete(name);
      const currentSession = this._registry.get(name);
      if (currentSession) {
        await this.spawn(currentSession);
      }
    }, delay);

    this._restartTimers.set(name, timer);
  }
}
