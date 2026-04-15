import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { MattermostPlugin } from '../../src/plugins/im/mattermost.js';

const BASE_URL = 'https://mm.example.com';
const TOKEN = 'test-token';
const CHANNEL_ID = 'ch1';

function makeFetchMock(responseBody: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => responseBody,
    text: async () => JSON.stringify(responseBody),
  });
}

describe('MattermostPlugin', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = makeFetchMock({ id: 'post1' });
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('sendMessage 调用正确 API endpoint', async () => {
    const plugin = new MattermostPlugin({ url: BASE_URL, token: TOKEN, channelId: CHANNEL_ID });
    await plugin.sendMessage({ plugin: 'mattermost', threadId: 'root-post-id' }, { kind: 'text', text: 'hello' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/v4/posts`);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.message).toBe('hello');
    expect(body.root_id).toBe('root-post-id');
  });

  test('updateMessage 调用 PUT /api/v4/posts/:id', async () => {
    const plugin = new MattermostPlugin({ url: BASE_URL, token: TOKEN, channelId: CHANNEL_ID });
    await plugin.updateMessage('post-abc', { kind: 'text', text: 'updated' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/v4/posts/post-abc`);
    expect(opts.method).toBe('PUT');
    const body = JSON.parse(opts.body);
    expect(body.message).toBe('updated');
  });

  test('createLiveMessage 创建 post 并返回 id', async () => {
    const plugin = new MattermostPlugin({ url: BASE_URL, token: TOKEN, channelId: CHANNEL_ID });
    const msgId = await plugin.createLiveMessage({ plugin: 'mattermost', threadId: 'root1' }, { kind: 'text', text: 'live' });

    expect(msgId).toBe('post1');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  test('requestApproval 发送带 attachments 的消息', async () => {
    const plugin = new MattermostPlugin({ url: BASE_URL, token: TOKEN, channelId: CHANNEL_ID });
    await plugin.requestApproval({ plugin: 'mattermost', threadId: 'root1' }, {
      requestId: 'req1',
      sessionName: 'sess1',
      messageId: 'msg1',
      toolName: 'bash',
      toolInputSummary: 'ls -la',
      riskLevel: 'low',
      capability: 'bash',
      scopeOptions: ['once', 'session'],
      timeoutSeconds: 60,
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/api/v4/posts`);
    const body = JSON.parse(opts.body);
    expect(body.props?.attachments).toBeDefined();
  });

  test('Authorization header 包含 token', async () => {
    const plugin = new MattermostPlugin({ url: BASE_URL, token: TOKEN, channelId: CHANNEL_ID });
    await plugin.sendMessage({ plugin: 'mattermost', threadId: 'root1' }, { kind: 'text', text: 'hi' });

    const [, opts] = fetchSpy.mock.calls[0];
    expect(opts.headers['Authorization']).toBe(`Bearer ${TOKEN}`);
  });
});
