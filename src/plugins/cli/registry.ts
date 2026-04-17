import { ClaudeCodePlugin } from './claude-code.js';
import type { CLIPlugin } from '../types.js';

const DEFAULT_CLI_PLUGIN = 'claude-code';

const CLI_PLUGINS: Record<string, () => CLIPlugin> = {
  'claude-code': () => new ClaudeCodePlugin(),
  // 未来扩展：'gemini-cli': () => new GeminiCLIPlugin(),
};

export function getCLIPlugin(name: string): CLIPlugin {
  const factory = CLI_PLUGINS[name];
  if (!factory) throw new Error(`Unknown CLI plugin: ${name}`);
  return factory();
}

export function listCLIPlugins(): string[] {
  return Object.keys(CLI_PLUGINS);
}

export function getDefaultCLIPluginName(): string {
  return DEFAULT_CLI_PLUGIN;
}
