import { describe, test, expect } from 'vitest';
import { parseStream } from '../../src/plugins/cli/claude-code.js';
import type { CLIEvent, StreamCursor } from '../../src/types.js';
import { Readable } from 'stream';

function makeStream(lines: string[]): Readable {
  return Readable.from(lines.map(l => l + '\n'));
}

describe('parseStream', () => {
  test('基础事件解析：system/assistant/result', async () => {
    const stream = makeStream([
      JSON.stringify({ type: 'system', message: { session_id: 'sess1' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } }),
      JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }),
    ]);
    const events: CLIEvent[] = [];
    for await (const e of parseStream(stream)) {
      events.push(e);
    }
    expect(events.map(e => e.type)).toEqual(['system', 'assistant', 'result']);
  });

  test('cursor 过滤：跳过已处理的 messageId', async () => {
    const cursor: StreamCursor = { sessionId: 'sess1', lastMessageId: 'msg1' };
    const stream = makeStream([
      JSON.stringify({ type: 'system', message: { session_id: 'sess1' } }),
      JSON.stringify({ type: 'assistant', message: { id: 'msg1', content: [] } }),
      JSON.stringify({ type: 'assistant', message: { id: 'msg2', content: [] } }),
    ]);
    const events: CLIEvent[] = [];
    for await (const e of parseStream(stream, cursor)) {
      events.push(e);
    }
    // msg1 已处理，只输出 msg2 之后的事件
    const assistantEvents = events.filter(e => e.type === 'assistant');
    expect(assistantEvents.length).toBe(1);
    expect((assistantEvents[0] as { messageId: string }).messageId).toBe('msg2');
  });

  test('cursor miss：sessionId 不一致时清空 cursor 全量输出', async () => {
    const cursor: StreamCursor = { sessionId: 'old-sess', lastMessageId: 'msg1' };
    const stream = makeStream([
      JSON.stringify({ type: 'system', message: { session_id: 'new-sess' } }),
      JSON.stringify({ type: 'assistant', message: { id: 'msg1', content: [] } }),
      JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }),
    ]);
    const events: CLIEvent[] = [];
    for await (const e of parseStream(stream, cursor)) {
      events.push(e);
    }
    // sessionId 不一致，全量输出（包括 msg1）
    expect(events.map(e => e.type)).toEqual(['system', 'assistant', 'result']);
  });

  test('cursor miss：sessionId 一致但 lastMessageId 不在历史中', async () => {
    const cursor: StreamCursor = { sessionId: 'sess1', lastMessageId: 'msg-unknown' };
    const stream = makeStream([
      JSON.stringify({ type: 'system', message: { session_id: 'sess1' } }),
      JSON.stringify({ type: 'assistant', message: { id: 'msg1', content: [] } }),
      JSON.stringify({ type: 'result', subtype: 'success', result: 'done' }),
    ]);
    const events: CLIEvent[] = [];
    for await (const e of parseStream(stream, cursor)) {
      events.push(e);
    }
    // lastMessageId 不在历史中，降级为全量输出
    expect(events.map(e => e.type)).toEqual(['system', 'assistant', 'result']);
  });

  test('未知事件类型不报错（兼容性）', async () => {
    const stream = makeStream([
      JSON.stringify({ type: 'unknown-future-type', data: {} }),
    ]);
    const events: CLIEvent[] = [];
    for await (const e of parseStream(stream)) {
      events.push(e);
    }
    expect(events[0].type).toBe('unknown');
    expect((events[0] as { rawType: string }).rawType).toBe('unknown-future-type');
  });
});
