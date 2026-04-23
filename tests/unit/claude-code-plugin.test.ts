import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ClaudeCodePlugin, getClaudeSessionPath, readClaudePermissionMode } from '../../src/plugins/cli/claude-code.js';
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
  runtimeState: 'cold',
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
    tmpWorkdir = fs.mkdtempSync(path.join(os.tmpdir(), 'mx-claude-plugin-'));
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
    expect(args).not.toContain('--permission-mode');
  });

  test('buildAttachCommand 继承持久化 session 中最后保存的 permission mode', () => {
    const localSession = { ...session, workdir: tmpWorkdir } as Session;
    const sessionPath = getClaudeSessionPath(tmpWorkdir, localSession.sessionId);
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, [
      JSON.stringify({ type: 'permission-mode', permissionMode: 'default', sessionId: localSession.sessionId }),
      JSON.stringify({ type: 'permission-mode', permissionMode: 'acceptEdits', sessionId: localSession.sessionId }),
    ].join('\n') + '\n', 'utf8');

    const { args } = plugin.buildAttachCommand(localSession);
    expect(args).toContain('--resume');
    expect(args).toContain('--permission-mode');
    expect(args).toContain('acceptEdits');
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

  test('buildIMWorkerCommand 包含常驻 worker 所需标志', () => {
    const bridgePath = '/tmp/mx-coder-mcp-bridge-uuid-123.js';
    const { command, args } = plugin.buildIMWorkerCommand(session, bridgePath);
    expect(command).toBe('claude');
    expect(args).toContain('-p');
    expect(args).not.toContain('--permission-mode');
    expect(args).toContain('--input-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--verbose');
  });

  test('buildIMWorkerCommand 继承持久化 session 中最后保存的 permission mode', () => {
    const localSession = { ...session, workdir: tmpWorkdir } as Session;
    const sessionPath = getClaudeSessionPath(tmpWorkdir, localSession.sessionId);
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify({ type: 'permission-mode', permissionMode: 'acceptEdits', sessionId: localSession.sessionId }) + '\n', 'utf8');

    const { args } = plugin.buildIMWorkerCommand(localSession, '/tmp/bridge.js');
    expect(args).toContain('--permission-mode');
    expect(args).toContain('acceptEdits');
  });

  test('readClaudePermissionMode 读不到时返回 undefined', () => {
    expect(readClaudePermissionMode(tmpWorkdir, 'missing-session')).toBeUndefined();
  });

  test('buildIMWorkerCommand 通过 --mcp-config 注入 bridge MCP server', () => {
    const bridgePath = '/tmp/mx-coder-mcp-bridge-uuid-123.js';
    const { args } = plugin.buildIMWorkerCommand(session, bridgePath);
    const mcpIdx = args.indexOf('--mcp-config');

    expect(mcpIdx).toBeGreaterThan(-1);
    expect(args[mcpIdx + 1]).toContain('mx_coder_bridge');
    expect(args[mcpIdx + 1]).toContain(bridgePath);
  });

  test('buildIMWorkerCommand 使用 MCP tool 名而不是 shell 字符串 permission prompt tool', () => {
    const bridgePath = '/tmp/mx-coder-mcp-bridge-uuid-123.js';
    const { args } = plugin.buildIMWorkerCommand(session, bridgePath);
    const ptIdx = args.indexOf('--permission-prompt-tool');

    expect(ptIdx).toBeGreaterThan(-1);
    expect(args[ptIdx + 1]).toBe('mcp__mx_coder_bridge__can_use_tool');
  });

  test('buildIMMessageCommand 已从主插件契约退役', () => {
    expect('buildIMMessageCommand' in plugin).toBe(false);
    expect((plugin as { buildIMMessageCommand?: unknown }).buildIMMessageCommand).toBeUndefined();
  });

  test('generateSessionId 生成 UUID 格式', () => {
    const id = plugin.generateSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
