import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SessionRegistry } from '../../src/session-registry.js';
import { IMMessageDispatcher } from '../../src/im-message-dispatcher.js';
import { IMWorkerManager } from '../../src/im-worker-manager.js';
import { MockIMPlugin } from '../helpers/mock-im-plugin.js';
import { MockCLIPlugin } from '../helpers/mock-cli-plugin.js';
import { ApprovalHandler } from '../../src/approval-handler.js';
import { ApprovalManager } from '../../src/approval-manager.js';

describe('IM 消息处理 E2E', () => {
  let tmpDir: string;
  let registry: SessionRegistry;
  let mockIM: MockIMPlugin;
  let dispatcher: IMMessageDispatcher;
  let approvalHandler: ApprovalHandler | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-e2e-test-'));
    registry = new SessionRegistry();
    mockIM = new MockIMPlugin();
  });

  afterEach(async () => {
    dispatcher?.stop();
    await approvalHandler?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('IM 消息 → mock claude → IM 回复', async () => {
    // Create a mock claude CLI that outputs a fixed stream-json event
    const mockCli = path.join(tmpDir, 'mock-claude.sh');
    fs.writeFileSync(mockCli, [
      '#!/bin/sh',
      'while IFS= read -r line; do',
      '  echo \'{"type":"assistant","payload":{"message":{"content":[{"type":"text","text":"Hello from mock claude"}]}}}\'',
      '  echo \'{"type":"result","payload":{"subtype":"success","result":"done"}}\'',
      'done',
    ].join('\n'), { mode: 0o755 });

    registry.create('test-session', { workdir: tmpDir, cliPlugin: 'mock' });

    dispatcher = new IMMessageDispatcher({
      registry,
      imPlugin: mockIM,
      imTarget: { plugin: 'mock', threadId: 'thread-1' },
      workerManager: new IMWorkerManager(new MockCLIPlugin(mockCli), registry),
    });

    dispatcher.start();

    // Enqueue a message
    registry.enqueueIMMessage('test-session', {
      plugin: 'mock',
      threadId: 'thread-1',
      messageId: 'msg-1',
      userId: 'user-1',
      text: 'hello',
      dedupeKey: 'dedup-1',
    });

    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify IM received a live message with the response
    expect(mockIM.liveMessages.size).toBeGreaterThan(0);
    const messages = [...mockIM.liveMessages.values()];
    expect(messages.some(m => m.includes('Hello from mock claude'))).toBe(true);
  }, 10000);

  test('worker 重连后历史 user/assistant/result 不会被重新桥接到 IM', async () => {
    const workerScript = path.join(tmpDir, 'mock-claude-replay-safe.sh');
    const stateFile = path.join(tmpDir, 'replay-state.json');
    fs.writeFileSync(stateFile, JSON.stringify({ firstTurnDone: false }));
    fs.writeFileSync(workerScript, [
      '#!/usr/bin/env node',
      "const fs = require('fs');",
      "const readline = require('readline');",
      `const stateFile = ${JSON.stringify(stateFile)};`,
      'const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });',
      'rl.on("line", () => {',
      '  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));',
      '  if (!state.firstTurnDone) {',
      '    process.stdout.write(JSON.stringify({ type: "user", message: { id: "user-turn-1", content: [{ type: "text", text: "first question" }] } }) + "\\n");',
      '    process.stdout.write(JSON.stringify({ type: "assistant", message: { id: "assistant-turn-1", content: [{ type: "text", text: "first answer" }] } }) + "\\n");',
      '    process.stdout.write(JSON.stringify({ type: "result", message: { id: "assistant-turn-1" }, subtype: "success", result: "done-1" }) + "\\n");',
      '    fs.writeFileSync(stateFile, JSON.stringify({ firstTurnDone: true }));',
      '    return;',
      '  }',
      '  process.stdout.write(JSON.stringify({ type: "user", message: { id: "user-turn-1", content: [{ type: "text", text: "first question" }] } }) + "\\n");',
      '  process.stdout.write(JSON.stringify({ type: "assistant", message: { id: "assistant-turn-1", content: [{ type: "text", text: "first answer" }] } }) + "\\n");',
      '  process.stdout.write(JSON.stringify({ type: "result", message: { id: "assistant-turn-1" }, subtype: "success", result: "done-1" }) + "\\n");',
      '  process.stdout.write(JSON.stringify({ type: "user", message: { id: "user-turn-2", content: [{ type: "text", text: "second question" }] } }) + "\\n");',
      '  process.stdout.write(JSON.stringify({ type: "assistant", message: { id: "assistant-turn-2", content: [{ type: "text", text: "second fresh answer" }] } }) + "\\n");',
      '  process.stdout.write(JSON.stringify({ type: "result", message: { id: "assistant-turn-2" }, subtype: "success", result: "done-2" }) + "\\n");',
      '});',
    ].join('\n'), { mode: 0o755 });

    registry.create('replay-safe-session', { workdir: tmpDir, cliPlugin: 'mock' });
    const workerManager = new IMWorkerManager(new MockCLIPlugin(workerScript), registry);
    dispatcher = new IMMessageDispatcher({
      registry,
      imPlugin: mockIM,
      imTarget: { plugin: 'mock', threadId: 'thread-replay-safe' },
      workerManager,
      pollIntervalMs: 50,
    });
    dispatcher.start();

    registry.enqueueIMMessage('replay-safe-session', {
      plugin: 'mock',
      threadId: 'thread-replay-safe',
      messageId: 'msg-first',
      userId: 'user-1',
      text: 'first question',
      dedupeKey: 'dedup-first',
    });

    await new Promise(resolve => setTimeout(resolve, 1200));
    const firstMessages = [...mockIM.liveMessages.values()];
    expect(firstMessages.some(m => m.includes('first answer'))).toBe(true);

    await workerManager.terminate('replay-safe-session');

    registry.enqueueIMMessage('replay-safe-session', {
      plugin: 'mock',
      threadId: 'thread-replay-safe',
      messageId: 'msg-second',
      userId: 'user-1',
      text: 'second question',
      dedupeKey: 'dedup-second',
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    const messages = [...mockIM.liveMessages.values()];
    expect(messages.some(m => m.includes('second fresh answer'))).toBe(true);
    expect(registry.get('replay-safe-session')?.streamState?.cursor?.lastMessageId).toBe('assistant-turn-2');
  }, 15000);
});
