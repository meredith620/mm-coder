import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeCodePlugin, getClaudeSessionPath } from '../../src/plugins/cli/claude-code.js';
import type { Session } from '../../src/types.js';

const plugin = new ClaudeCodePlugin();
let tmpWorkdir: string;
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
  beforeEach(() => {
    tmpWorkdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-claude-plugin-'));
  });

  afterEach(() => {
    fs.rmSync(tmpWorkdir, { recursive: true, force: true });
  });

  test('buildAttachCommand 对存在本地 session 的 session 生成 claude --resume', () => {
    const localSession = { ...session, workdir: tmpWorkdir } as Session;
    const sessionPath = getClaudeSessionPath(tmpWorkdir, localSession.sessionId);
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, '{}\n', 'utf8');

    const { command, args } = plugin.buildAttachCommand(localSession);
    expect(command).toBe('claude');
    expect(args).toContain('--resume');
    expect(args).toContain('uuid-123');
  });

  test('buildAttachCommand 对不存在本地 session 的 session 生成 claude --session-id', () => {
    const { args } = plugin.buildAttachCommand({ ...session, workdir: tmpWorkdir, initState: 'initialized' } as Session);
    expect(args).toContain('--session-id');
    expect(args).toContain('uuid-123');
    expect(args).not.toContain('--resume');
  });

  test('buildAttachCommand 对 uninitialized session 生成 claude --session-id', () => {
    const { args } = plugin.buildAttachCommand({ ...session, workdir: tmpWorkdir, initState: 'uninitialized' } as Session);
    expect(args).toContain('--session-id');
    expect(args).toContain('uuid-123');
    expect(args).not.toContain('--resume');
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

  test('buildIMMessageCommand 对不存在本地 session 的 initialized session 使用 --session-id', () => {
    const { command, args } = plugin.buildIMMessageCommand({ ...session, workdir: tmpWorkdir, initState: 'initialized' } as Session, 'hello world');
    expect(command).toBe('claude');
    expect(args).toContain('--session-id');
    expect(args).not.toContain('--resume');
    expect(args).toContain('--verbose');
  });

  test('buildIMMessageCommand 对 uninitialized session 使用 --session-id', () => {
    const { command, args } = plugin.buildIMMessageCommand({ ...session, initState: 'uninitialized' } as Session, 'hello world');
    expect(command).toBe('claude');
    expect(args).toContain('-p');
    expect(args).toContain('hello world');
    expect(args).toContain('--session-id');
    expect(args).toContain('uuid-123');
    expect(args).not.toContain('--resume');
    expect(args).toContain('--verbose');
  });

  test('buildIMMessageCommand 生成带 prompt 的命令', () => {
    const localSession = { ...session, workdir: tmpWorkdir } as Session;
    const sessionPath = getClaudeSessionPath(tmpWorkdir, localSession.sessionId);
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, '{}\n', 'utf8');

    const { command, args } = plugin.buildIMMessageCommand(localSession, 'hello world');
    expect(command).toBe('claude');
    expect(args).toContain('-p');
    expect(args).toContain('hello world');
    expect(args).toContain('--resume');
    expect(args).toContain('uuid-123');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--verbose');
  });
});
