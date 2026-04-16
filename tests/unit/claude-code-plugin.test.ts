import { describe, test, expect } from 'vitest';
import { ClaudeCodePlugin } from '../../src/plugins/cli/claude-code.js';
import type { Session } from '../../src/types.js';

const plugin = new ClaudeCodePlugin();
const session = {
  name: 'test',
  sessionId: 'uuid-123',
  cliPlugin: 'claude-code',
  workdir: '/tmp',
  status: 'idle',
  lifecycleStatus: 'active',
  initState: 'initialized',
  revision: 0,
  spawnGeneration: 0,
  attachedPid: null,
  imWorkerPid: null,
  imWorkerCrashCount: 0,
  imBindings: [],
  messageQueue: [],
  createdAt: new Date(),
  lastActivityAt: new Date(),
} as Session;

describe('ClaudeCodePlugin', () => {
  test('buildAttachCommand 生成 claude --resume', () => {
    const { command, args } = plugin.buildAttachCommand(session);
    expect(command).toBe('claude');
    expect(args).toContain('--resume');
    expect(args).toContain('uuid-123');
  });

  test('buildIMWorkerCommand 包含所有必要标志和 bridgeScriptPath', () => {
    const bridgePath = '/tmp/mm-coder-mcp-bridge-uuid-123.js';
    const { command, args } = plugin.buildIMWorkerCommand(session, bridgePath);
    expect(command).toBe('claude');
    expect(args).toContain('-p');
    expect(args).toContain('--input-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--verbose');
    expect(args).toContain('--permission-prompt-tool');
    // bridge path injected after --permission-prompt-tool
    const ptIdx = args.indexOf('--permission-prompt-tool');
    expect(args[ptIdx + 1]).toContain(bridgePath);
  });

  test('generateSessionId 生成 UUID 格式', () => {
    const id = plugin.generateSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('buildIMMessageCommand 生成带 prompt 的命令', () => {
    const { command, args } = plugin.buildIMMessageCommand(session, 'hello world');
    expect(command).toBe('claude');
    expect(args).toContain('-p');
    expect(args).toContain('hello world');
    expect(args).toContain('--resume');
    expect(args).toContain('uuid-123');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
  });
});
