import type { IMPlugin } from '../types.js';
import type { MessageTarget, MessageContent, IncomingMessage, ApprovalRequest } from '../../types.js';

export interface MattermostConfig {
  url: string;
  token: string;
  channelId: string;
}

export class MattermostPlugin implements IMPlugin {
  private _config: MattermostConfig;
  private _handlers: Array<(msg: IncomingMessage) => void> = [];

  constructor(config: MattermostConfig) {
    this._config = config;
  }

  onMessage(handler: (msg: IncomingMessage) => void): void {
    this._handlers.push(handler);
  }

  private _headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this._config.token}`,
      'Content-Type': 'application/json',
    };
  }

  private _toText(content: MessageContent): string {
    if (content.kind === 'text') return content.text;
    if (content.kind === 'markdown') return content.markdown;
    return content.url;
  }

  async sendMessage(target: MessageTarget, content: MessageContent): Promise<void> {
    await fetch(`${this._config.url}/api/v4/posts`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        channel_id: this._config.channelId,
        root_id: target.threadId,
        message: this._toText(content),
      }),
    });
  }

  async createLiveMessage(target: MessageTarget, content: MessageContent): Promise<string> {
    const res = await fetch(`${this._config.url}/api/v4/posts`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        channel_id: this._config.channelId,
        root_id: target.threadId,
        message: this._toText(content),
      }),
    });
    const data = await res.json() as { id: string };
    return data.id;
  }

  async updateMessage(messageId: string, content: MessageContent): Promise<void> {
    await fetch(`${this._config.url}/api/v4/posts/${messageId}`, {
      method: 'PUT',
      headers: this._headers(),
      body: JSON.stringify({
        id: messageId,
        message: this._toText(content),
      }),
    });
  }

  async requestApproval(target: MessageTarget, request: ApprovalRequest): Promise<void> {
    const actions = request.scopeOptions.map(scope => ({
      id: `approve_${scope}_${request.requestId}`,
      name: scope === 'once' ? 'Approve (once)' : 'Approve (session)',
      type: 'button',
      style: 'good',
    }));
    actions.push({
      id: `deny_${request.requestId}`,
      name: 'Deny',
      type: 'button',
      style: 'danger',
    });

    await fetch(`${this._config.url}/api/v4/posts`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify({
        channel_id: this._config.channelId,
        root_id: target.threadId,
        message: `**Approval required** — \`${request.toolName}\`\n${request.toolInputSummary}`,
        props: {
          attachments: [{
            title: `Tool: ${request.toolName}`,
            text: request.toolInputSummary,
            color: request.riskLevel === 'high' ? '#FF0000' : request.riskLevel === 'medium' ? '#FFA500' : '#00FF00',
            actions,
          }],
        },
      }),
    });
  }
}
