import { randomUUID } from 'crypto';
import type { CLIPlugin, CommandSpec } from '../../src/plugins/types.js';
import type { Session } from '../../src/types.js';

export class MockCLIPlugin implements CLIPlugin {
  private _command: string;
  private _args: string[];

  constructor(command: string, args: string[] = []) {
    this._command = command;
    this._args = args;
  }

  buildAttachCommand(session: Session): CommandSpec {
    return {
      command: this._command,
      args: [...this._args, '--resume', session.sessionId],
    };
  }

  buildIMWorkerCommand(session: Session, bridgeScriptPath: string): CommandSpec {
    return {
      command: this._command,
      args: [...this._args, '--resume', session.sessionId, '--bridge', bridgeScriptPath],
    };
  }

  buildIMMessageCommand(session: Session, prompt: string): CommandSpec {
    return {
      command: this._command,
      args: [...this._args, '-p', prompt, '--resume', session.sessionId],
    };
  }

  generateSessionId(): string {
    return randomUUID();
  }
}
