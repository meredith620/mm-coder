import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const BRIDGE_TEMPLATE = `#!/usr/bin/env node
// MCP Bridge for session: __SESSION_ID__
// Connects to daemon Unix socket and forwards stdin/stdout
'use strict';

const net = require('net');
const SOCKET_PATH = '__SOCKET_PATH__';
const SESSION_ID = '__SESSION_ID__';

// Pause stdin immediately so buffered data isn't lost before pipe
process.stdin.pause();

const client = net.createConnection(SOCKET_PATH, () => {
  // Send session id header as first line
  client.write(JSON.stringify({ type: 'mcp_bridge_connect', sessionId: SESSION_ID }) + '\\n');
  // Pipe socket → stdout
  client.pipe(process.stdout);
  // Resume and pipe stdin → socket
  process.stdin.pipe(client);
  process.stdin.resume();
});

client.on('error', (err) => {
  process.stderr.write('MCP bridge error: ' + err.message + '\\n');
  process.exit(1);
});

process.stdin.on('end', () => {
  client.end();
});
`;

/**
 * Generate an MCP bridge script for a given sessionId and daemon socket path.
 * Returns the path to the generated script.
 * @param sessionId - The session ID to embed in the script
 * @param socketPath - The Unix socket path to connect to
 * @param dir - Directory to write the script (defaults to /tmp)
 */
export async function generateBridgeScript(
  sessionId: string,
  socketPath: string,
  dir?: string,
): Promise<string> {
  const outDir = dir ?? os.tmpdir();
  const scriptPath = path.join(outDir, `mcp-bridge-${sessionId}.js`);

  const content = BRIDGE_TEMPLATE
    .replace(/__SESSION_ID__/g, sessionId)
    .replace(/__SOCKET_PATH__/g, socketPath);

  fs.writeFileSync(scriptPath, content, { mode: 0o600 });

  return scriptPath;
}
