import { describe, test, expect } from 'vitest';
import { getIMPluginFactory, listIMPlugins, getDefaultIMPluginName } from '../../src/plugins/im/registry.js';

describe('IM Plugin Registry', () => {
  test('getIMPluginFactory 返回 mattermost 工厂', () => {
    const factory = getIMPluginFactory('mattermost');
    expect(factory).toBeDefined();
    expect(typeof factory.load).toBe('function');
    expect(typeof factory.getDefaultConfigPath).toBe('function');
    expect(typeof factory.writeConfigTemplate).toBe('function');
    expect(typeof factory.verifyConnection).toBe('function');
    expect(typeof factory.getCommandHelpText).toBe('function');
  });

  test('getIMPluginFactory 对未知插件抛错', () => {
    expect(() => getIMPluginFactory('unknown-im')).toThrow(/Unknown IM plugin: unknown-im/);
  });

  test('listIMPlugins 返回已注册插件列表', () => {
    const plugins = listIMPlugins();
    expect(plugins).toContain('mattermost');
    expect(plugins.length).toBeGreaterThan(0);
  });

  test('默认 IM 插件名为 mattermost', () => {
    expect(getDefaultIMPluginName()).toBe('mattermost');
  });

  test('mattermost 工厂 getDefaultConfigPath 返回有效路径', () => {
    const factory = getIMPluginFactory('mattermost');
    const configPath = factory.getDefaultConfigPath();
    expect(configPath).toContain('.mx-coder');
    expect(configPath).toContain('config.json');
  });

  test('mattermost 工厂暴露帮助文案', () => {
    const factory = getIMPluginFactory('mattermost');
    const help = factory.getCommandHelpText();
    expect(help).toContain('/help');
    expect(help).toContain('/open <sessionName>');
  });
});
