import * as path from 'path';
import * as os from 'os';
import { loadMattermostConfig, createConnectedMattermostPlugin, writeMattermostConfigTemplate, verifyMattermostConnection } from './mattermost.js';
import type { IMPlugin } from '../types.js';

export interface IMPluginFactory {
  load(configPath: string): Promise<IMPlugin>;
  getDefaultConfigPath(): string;
  writeConfigTemplate(configPath: string): void;
  verifyConnection(configPath?: string): Promise<{ ok: true; config: unknown; botUserId: string }>;
}

const IM_PLUGINS: Record<string, IMPluginFactory> = {
  'mattermost': {
    load: async (configPath: string) => {
      const config = loadMattermostConfig(configPath);
      // Note: sessionCount/activeCount will be provided by daemon during initialization
      return createConnectedMattermostPlugin(configPath, { sessionCount: 0, activeCount: 0 });
    },
    getDefaultConfigPath: () => path.join(os.homedir(), '.mm-coder', 'config.json'),
    writeConfigTemplate: writeMattermostConfigTemplate,
    verifyConnection: verifyMattermostConnection,
  },
  // 未来扩展：'discord': { ... },
};

export function getIMPluginFactory(name: string): IMPluginFactory {
  const factory = IM_PLUGINS[name];
  if (!factory) throw new Error(`Unknown IM plugin: ${name}`);
  return factory;
}

export function listIMPlugins(): string[] {
  return Object.keys(IM_PLUGINS);
}
