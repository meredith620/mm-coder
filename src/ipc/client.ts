import * as net from 'net';
import * as readline from 'readline';
import { encodeRequest, decodeMessage, type IPCResponse, type IPCError, type IPCEvent } from './codec.js';

type SendResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } };

interface SendOptions {
  timeoutMs?: number;
  actor?: { source: string; userId?: string };
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class IPCClient {
  private _socketPath: string;
  private _socket: net.Socket | null = null;
  private _rl: readline.Interface | null = null;
  private _pending: Map<string, { resolve: (r: SendResult) => void; reject: (e: Error) => void }> = new Map();
  private _eventHandlers: Array<(event: IPCEvent) => void> = [];

  constructor(socketPath: string) {
    this._socketPath = socketPath;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this._socketPath);
      socket.on('connect', () => {
        this._socket = socket;
        this._rl = readline.createInterface({ input: socket, crlfDelay: Infinity });
        this._rl.on('line', (line) => this._handleLine(line));
        socket.on('error', (err) => this._rejectAll(err));
        socket.on('close', () => this._rejectAll(new Error('Connection closed')));
        resolve();
      });
      socket.on('error', reject);
    });
  }

  async send(
    command: string,
    args: Record<string, unknown> = {},
    opts: SendOptions = {},
  ): Promise<SendResult> {
    if (!this._socket) throw new Error('Not connected');

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const line = encodeRequest(command, args, opts.actor);
    const requestId = (JSON.parse(line) as { requestId: string }).requestId;

    return new Promise<SendResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(requestId);
        reject(new Error('TIMEOUT'));
      }, timeoutMs);

      this._pending.set(requestId, {
        resolve: (r) => { clearTimeout(timer); resolve(r); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });

      this._socket!.write(line + '\n');
    });
  }

  async close(): Promise<void> {
    this._eventHandlers = [];
    this._rl?.close();
    this._socket?.destroy();
    this._socket = null;
    this._rl = null;
  }

  async subscribe(onEvent: (event: IPCEvent) => void): Promise<void> {
    this._eventHandlers.push(onEvent);
    const response = await this.send('subscribe', {});
    if (!response.ok) {
      throw new Error(`Failed to subscribe: ${response.error.message}`);
    }
  }

  private _handleLine(line: string): void {
    let msg: ReturnType<typeof decodeMessage>;
    try { msg = decodeMessage(line); } catch { return; }

    if (msg.type === 'event') {
      for (const handler of this._eventHandlers) {
        handler(msg);
      }
      return;
    }

    if (msg.type !== 'response') return;

    const resp = msg as IPCResponse | IPCError;
    const pending = this._pending.get(resp.requestId);
    if (!pending) return;

    this._pending.delete(resp.requestId);
    if (resp.ok) {
      pending.resolve({ ok: true, data: resp.data });
    } else {
      pending.resolve({ ok: false, error: resp.error });
    }
  }

  private _rejectAll(err: Error): void {
    for (const p of this._pending.values()) p.reject(err);
    this._pending.clear();
  }
}
