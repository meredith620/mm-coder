import type { Session } from '../../types.js';

export interface CommandSpec {
  command: string;
  args: string[];
}

export interface CLIPlugin {
  buildAttachCommand(session: Session): CommandSpec;
  buildIMWorkerCommand(session: Session, bridgeScriptPath: string): CommandSpec;
  generateSessionId(): string;
}
