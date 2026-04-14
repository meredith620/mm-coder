import { randomUUID } from 'crypto';
import type { Session } from '../../types.js';
import type { CLIPlugin, CommandSpec } from '../types.js';

export class ClaudeCodePlugin implements CLIPlugin {
  buildAttachCommand(session: Session): CommandSpec {
    return {
      command: 'claude',
      args: ['--resume', session.sessionId],
    };
  }

  buildIMWorkerCommand(session: Session, bridgeScriptPath: string): CommandSpec {
    return {
      command: 'claude',
      args: [
        '-p',
        '--resume', session.sessionId,
        '--input-format', 'stream-json',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-prompt-tool', `mcp__mm-coder-bridge__permission_prompt:${bridgeScriptPath}`,
      ],
    };
  }

  generateSessionId(): string {
    return randomUUID();
  }
}
