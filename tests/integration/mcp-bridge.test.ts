import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { generateBridgeScript } from '../../src/mcp-bridge.js';
import * as net from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

describe('MCP Bridge script generation', () => {
  let tmpDir: string;
  let socketPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-coder-bridge-test-'));
    socketPath = path.join(tmpDir, 'daemon.sock');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('bridge 脚本携带正确 sessionId', async () => {
    const scriptPath = await generateBridgeScript('sess-abc', socketPath, tmpDir);
    const content = fs.readFileSync(scriptPath, 'utf8');
    expect(content).toContain('sess-abc');
  });

  test('bridge 文件权限为 0600', async () => {
    const scriptPath = await generateBridgeScript('sess-xyz', socketPath, tmpDir);
    const stat = fs.statSync(scriptPath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  test('脚本路径包含 sessionId', async () => {
    const scriptPath = await generateBridgeScript('sess-path-test', socketPath, tmpDir);
    expect(scriptPath).toContain('sess-path-test');
  });

  test('生成的 bridge 脚本连接 daemon socket 并转发', async () => {
    const received: Buffer[] = [];

    // Start a mock Unix socket server
    const server = net.createServer(socket => {
      socket.on('data', chunk => received.push(chunk));
    });

    await new Promise<void>(resolve => server.listen(socketPath, resolve));

    const scriptPath = await generateBridgeScript('sess-fwd', socketPath, tmpDir);

    // Spawn bridge process, write to stdin
    const proc = spawn('node', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });

    const testPayload = JSON.stringify({ jsonrpc: '2.0', method: 'test', id: 1 }) + '\n';
    proc.stdin.write(testPayload);

    await new Promise(resolve => setTimeout(resolve, 300));

    proc.kill('SIGTERM');
    await new Promise<void>(resolve => server.close(() => resolve()));

    const combined = Buffer.concat(received).toString();
    expect(combined).toContain('"method":"test"');
  }, 10000);
});
