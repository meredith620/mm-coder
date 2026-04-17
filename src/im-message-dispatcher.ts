import { spawn } from 'child_process';
import * as readline from 'readline';
import type { SessionRegistry } from './session-registry.js';
import type { IMPlugin, CLIPlugin } from './plugins/types.js';
import type { MessageTarget, QueuedMessage, Session } from './types.js';
import { StreamToIM } from './stream-to-im.js';

function debugLog(payload: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify({ at: new Date().toISOString(), component: 'im-dispatcher', ...payload }));
  } catch {
    // ignore logging failure
  }
}

export interface IMMessageDispatcherOptions {
  registry: SessionRegistry;
  imPlugin: IMPlugin;
  imPluginResolver?: (message: QueuedMessage, session: Session) => IMPlugin;
  imTarget: MessageTarget;
  cliPlugin?: CLIPlugin;
  cliPluginResolver?: (session: Session) => CLIPlugin;
  pollIntervalMs?: number;
  maxRetries?: number;
  onSessionImDone?: (sessionName: string) => void;
}

/**
 * Polls the session registry for pending IM messages, spawns the CLI for each,
 * pipes stdout through StreamToIM, and updates the IM plugin with the response.
 */
export class IMMessageDispatcher {
  private _opts: IMMessageDispatcherOptions;
  private _running = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _processing = new Set<string>(); // sessionName:messageId

  constructor(opts: IMMessageDispatcherOptions) {
    this._opts = opts;
  }

  start(): void {
    this._running = true;
    this._poll();
  }

  stop(): void {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _poll(): void {
    if (!this._running) return;
    void this._tick().finally(() => {
      if (this._running) {
        this._timer = setTimeout(() => this._poll(), this._opts.pollIntervalMs ?? 100);
      }
    });
  }

  private async _tick(): Promise<void> {
    const sessions = this._opts.registry.list();
    for (const session of sessions) {
      if (session.status !== 'idle' && session.status !== 'im_processing') {
        continue;
      }
      const pending = session.messageQueue.filter(m => m.status === 'pending');
      for (const msg of pending) {
        const key = `${session.name}:${msg.messageId}`;
        if (this._processing.has(key)) continue;
        this._processing.add(key);
        void this._processMessage(session.name, msg.messageId).finally(() => {
          this._processing.delete(key);
        });
      }
    }
  }

  private _getSessionAndMessage(sessionName: string, messageId: string): { session: Session; message: QueuedMessage } {
    const session = this._opts.registry.get(sessionName);
    if (!session) throw new Error(`Session not found: ${sessionName}`);
    const message = session.messageQueue.find(m => m.messageId === messageId);
    if (!message) throw new Error(`Queued message not found: ${messageId}`);
    return { session, message };
  }

  private _buildTarget(message: QueuedMessage): MessageTarget {
    return {
      plugin: message.plugin ?? this._opts.imTarget.plugin,
      ...(message.channelId !== undefined || this._opts.imTarget.channelId !== undefined
        ? { channelId: message.channelId ?? this._opts.imTarget.channelId }
        : {}),
      threadId: message.threadId || this._opts.imTarget.threadId,
      ...(message.userId || this._opts.imTarget.userId
        ? { userId: message.userId || this._opts.imTarget.userId }
        : {}),
    };
  }

  private _resolveCLIPlugin(session: Session): CLIPlugin {
    if (this._opts.cliPluginResolver) {
      return this._opts.cliPluginResolver(session);
    }
    if (this._opts.cliPlugin) {
      return this._opts.cliPlugin;
    }
    throw new Error('IMMessageDispatcher requires cliPlugin or cliPluginResolver');
  }

  private _resolveIMPlugin(message: QueuedMessage, session: Session): IMPlugin {
    if (this._opts.imPluginResolver) {
      return this._opts.imPluginResolver(message, session);
    }
    return this._opts.imPlugin;
  }

  private _buildCLICommand(session: Session, message: QueuedMessage) {
    return this._resolveCLIPlugin(session).buildIMMessageCommand(session, message.content);
  }

  private async _processMessage(sessionName: string, messageId: string, attempt = 0): Promise<void> {
    const maxRetries = this._opts.maxRetries ?? 1;
    const registry = this._opts.registry;
    const { session, message } = this._getSessionAndMessage(sessionName, messageId);
    const streamToIM = new StreamToIM(this._resolveIMPlugin(message, session), this._buildTarget(message));
    const wasUninitialized = session.initState === 'uninitialized';

    let finalStatus: QueuedMessage['status'] = 'failed';
    let currentAttempt = attempt;

    debugLog({
      event: 'process_start',
      sessionName,
      messageId,
      threadId: message.threadId,
      channelId: message.channelId,
      attempt: currentAttempt,
      content: message.content,
    });

    // Update session status to im_processing
    try {
      registry.markImProcessing(sessionName);
    } catch { /* session may not exist or invalid transition */ }

    try {
      while (currentAttempt <= maxRetries) {
        try {
          const exitCode = await new Promise<number>((resolve) => {
            const cmdSpec = this._buildCLICommand(session, message);
            debugLog({ event: 'spawn_cli', sessionName, messageId, command: cmdSpec.command, args: cmdSpec.args, workdir: session.workdir });
            const proc = spawn(cmdSpec.command, cmdSpec.args, {
              stdio: ['pipe', 'pipe', 'pipe'],
              cwd: session.workdir,
            });

            const rl = readline.createInterface({ input: proc.stdout!, crlfDelay: Infinity });
            rl.on('line', (line) => {
              if (!line.trim()) return;
              debugLog({ event: 'stdout_line', sessionName, messageId, line });
              try {
                const event = JSON.parse(line) as { type: string; payload: unknown };
                void streamToIM.onEvent(event as Parameters<typeof streamToIM.onEvent>[0]);
              } catch {
                debugLog({ event: 'stdout_non_json', sessionName, messageId, line });
              }
            });

            const stderrRl = readline.createInterface({ input: proc.stderr!, crlfDelay: Infinity });
            stderrRl.on('line', (line) => {
              if (!line.trim()) return;
              debugLog({ event: 'stderr_line', sessionName, messageId, line });
            });

            proc.on('close', (code) => resolve(code ?? 0));
            proc.on('error', (err) => {
              debugLog({ event: 'spawn_error', sessionName, messageId, error: err.message });
              resolve(1);
            });
          });

          debugLog({ event: 'process_exit', sessionName, messageId, exitCode });

          if (exitCode === 0) {
            finalStatus = 'completed';
            // 首次运行成功后标记为 initialized，后续使用 --resume
            if (wasUninitialized) {
              try { registry.updateSessionId(sessionName, session.sessionId); } catch { /* best-effort */ }
            }
            break;
          }
        } catch {
          // handled by retry branch below
        }

        if (currentAttempt < maxRetries) {
          currentAttempt += 1;
          await new Promise(resolve => setTimeout(resolve, 200));
          continue;
        }

        finalStatus = 'failed';
        break;
      }
    } finally {
      const current = registry.get(sessionName);
      if (current) {
        const currentMessage = current.messageQueue.find(m => m.messageId === messageId);
        if (currentMessage) currentMessage.status = finalStatus;
      }
      try {
        registry.markImDone(sessionName);
        debugLog({ event: 'mark_im_done', sessionName, messageId, finalStatus, sessionStatus: registry.get(sessionName)?.status });
        this._opts.onSessionImDone?.(sessionName);
      } catch (err) {
        debugLog({ event: 'mark_im_done_failed', sessionName, messageId, error: (err as Error).message });
      }
    }
  }
}
