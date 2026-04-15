import { IPCServer } from './ipc/socket-server.js';
import { SessionRegistry } from './session-registry.js';
import { AclManager } from './acl-manager.js';
import { PersistenceStore } from './persistence.js';
import type { AclAction, Actor } from './acl-manager.js';
import type { ErrorCode } from './ipc/codec.js';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

export interface DaemonOptions {
  persistencePath?: string;
}

export class Daemon {
  private _server: IPCServer;
  registry: SessionRegistry;
  private _acl: AclManager;
  private _store: PersistenceStore | null;

  constructor(socketPath: string, opts: DaemonOptions = {}) {
    this._server = new IPCServer(socketPath);
    this._store = opts.persistencePath ? new PersistenceStore(opts.persistencePath) : null;
    this.registry = new SessionRegistry(this._store ?? undefined);
    this._acl = new AclManager();
    this._registerHandlers();
  }

  async start(): Promise<void> {
    if (this._store) {
      await this._store.load(this.registry);
    }
    await this._server.listen();
  }

  async stop(): Promise<void> {
    if (this._store) {
      await this._store.flush();
    }
    await this._server.close();
  }

  /** Write PID file so CLI can detect running daemon */
  writePidFile(pidFile: string): void {
    fs.writeFileSync(pidFile, String(process.pid), 'utf-8');
    process.on('exit', () => {
      try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
    });
  }

  private _registerHandlers(): void {
    this._server.handle('create', async (args, actor) => {
      // create is public — no ACL check
      const name = args['name'] as string;
      const workdir = args['workdir'] as string;
      const cli = args['cli'] as string;

      let session;
      try {
        session = this.registry.create(name, { workdir, cliPlugin: cli });
      } catch (err) {
        const code: ErrorCode = 'SESSION_ALREADY_EXISTS';
        const e = new Error((err as Error).message) as Error & { code: ErrorCode };
        e.code = code;
        throw e;
      }

      // Creator becomes owner
      if (actor?.userId) {
        this._acl.grant(session, actor.userId, 'owner');
      }

      return { session: this._serializeSession(session) };
    });

    this._server.handle('list', async () => {
      const sessions = this.registry.list().map(s => this._serializeSession(s));
      return { sessions };
    });

    this._server.handle('remove', async (args, actor) => {
      const name = args['name'] as string;
      const session = this.registry.get(name);

      if (!session) {
        const e = new Error(`Session not found: ${name}`) as Error & { code: ErrorCode };
        e.code = 'SESSION_NOT_FOUND';
        throw e;
      }

      this._checkAcl(actor, 'remove', session);

      this.registry.remove(name);
      return {};
    });

    this._server.handle('status', async () => {
      const sessions = this.registry.list().map(s => this._serializeSession(s));
      return { pid: process.pid, sessions };
    });

    this._server.handle('markDetached', async (args) => {
      const name = args['name'] as string;
      const exitReason = (args['exitReason'] as 'normal' | 'error' | undefined) ?? 'normal';

      const session = this.registry.get(name);
      if (!session) {
        const e = new Error(`Session not found: ${name}`) as Error & { code: ErrorCode };
        e.code = 'SESSION_NOT_FOUND';
        throw e;
      }

      // Allow markDetached from 'attached' or 'recovering' (daemon restarted while attached).
      // Also tolerate sessions stuck in 'attach_pending' when the CLI process itself crashed.
      const allowedStates = new Set(['attached', 'attach_pending', 'recovering']);
      if (!allowedStates.has(session.status)) {
        // Already in a stable state (idle/error/im_processing) — this is a stale call; ignore.
        return {};
      }

      this.registry.markDetached(name, exitReason);
      if (this._store) void this._store.flush();

      // Push session_resume for any waiting attach waiter
      this._server.pushEventToAttachWaiter(name, {
        type: 'event',
        event: 'session_resume',
        data: { name },
      });

      return {};
    });

    this._server.handle('attach', async (args, actor, socket) => {
      const name = args['name'] as string;
      const pid = args['pid'] as number;
      const session = this.registry.get(name);

      if (!session) {
        const e = new Error(`Session not found: ${name}`) as Error & { code: ErrorCode };
        e.code = 'SESSION_NOT_FOUND';
        throw e;
      }

      this._checkAcl(actor, 'attach', session);

      // initState guard: concurrent init in progress
      if (session.initState === 'initializing') {
        const e = new Error('SESSION_BUSY') as Error & { code: ErrorCode };
        e.code = 'SESSION_BUSY';
        throw e;
      }

      // lazy init on first attach (first-writer-wins)
      if (session.initState === 'uninitialized') {
        await this.registry.beginInitAndAttach(name, pid);
      } else {
        // markAttached handles im_processing → attach_pending via state machine
        this.registry.markAttached(name, pid);
      }

      if (this._store) void this._store.flush();

      const updated = this.registry.get(name)!;
      if (updated.status === 'attach_pending') {
        // Register socket so markDetached can push session_resume event
        if (socket) this._server.registerAttachWaiter(name, socket);
        return { waitRequired: true, session: this._serializeSession(updated) };
      }
      return { session: this._serializeSession(updated) };
    });

    this._server.handle('import', async (args, actor) => {
      const sessionId = args['sessionId'] as string;
      const workdir = args['workdir'] as string;
      const cli = args['cli'] as string;
      const name = (args['name'] as string | undefined) ?? `imported-${randomUUID().slice(0, 8)}`;

      let session;
      try {
        session = this.registry.importSession(sessionId, name, { workdir, cliPlugin: cli });
      } catch (err) {
        const e = new Error((err as Error).message) as Error & { code: ErrorCode };
        e.code = 'SESSION_ALREADY_EXISTS';
        throw e;
      }

      if (actor?.userId) {
        this._acl.grant(session, actor.userId, 'owner');
      }

      return { session: this._serializeSession(session) };
    });
  }

  private _checkAcl(actor: Actor | undefined, action: AclAction, session: import('./types.js').Session): void {
    if (this._acl.authorize(actor, action, session) === 'deny') {
      const e = new Error('ACL_DENIED') as Error & { code: ErrorCode };
      e.code = 'ACL_DENIED';
      throw e;
    }
  }

  private _serializeSession(s: import('./types.js').Session): Record<string, unknown> {
    return {
      name: s.name,
      sessionId: s.sessionId,
      status: s.status,
      lifecycleStatus: s.lifecycleStatus,
      workdir: s.workdir,
      cliPlugin: s.cliPlugin,
      createdAt: s.createdAt,
    };
  }
}
