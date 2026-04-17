import type { IMPlugin } from './plugins/types.js';
import type { MessageTarget } from './types.js';

const DEBOUNCE_MS = 500;

interface AssistantEvent {
  type: 'assistant';
  payload?: { message?: { content?: Array<{ type: string; text?: string }> } };
  message?: { content?: Array<{ type: string; text?: string }> };
}

interface ResultEvent {
  type: 'result';
  payload?: { subtype?: string; result?: string };
}

interface ErrorEvent {
  type: 'error';
  payload?: { message?: string };
}

type StreamEvent = AssistantEvent | ResultEvent | ErrorEvent | { type: string; payload: unknown };

export class StreamToIM {
  private _plugin: IMPlugin;
  private _target: MessageTarget;
  private _messageId: string | null = null;
  private _buffer = '';
  private _timer: ReturnType<typeof setTimeout> | null = null;

  constructor(plugin: IMPlugin, target: MessageTarget) {
    this._plugin = plugin;
    this._target = target;
  }

  async onEvent(event: StreamEvent): Promise<void> {
    if (event.type === 'assistant') {
      const e = event as AssistantEvent;
      const content = e.payload?.message?.content ?? e.message?.content ?? [];
      const text = content
        .filter(c => c.type === 'text')
        .map(c => c.text ?? '')
        .join('');

      if (!text) return;

      if (!this._messageId) {
        this._messageId = await this._plugin.createLiveMessage(this._target, { kind: 'text', text });
        this._buffer = text;
      } else {
        this._buffer += text;
        this._scheduleFlush();
      }
    } else if (event.type === 'result' || event.type === 'error') {
      await this._flush();
    }
  }

  private _scheduleFlush(): void {
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._timer = null;
      void this._flush();
    }, DEBOUNCE_MS);
  }

  private async _flush(): Promise<void> {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    if (this._messageId !== null) {
      await this._plugin.updateMessage(this._messageId, { kind: 'text', text: this._buffer });
    }
  }
}
