import { describe, test, expect } from 'vitest';
import { parseCLIArgs } from '../../src/cli-parser.js';

describe('CLI 命令解析', () => {
  test('parse "create bug-fix --workdir /tmp"', () => {
    const parsed = parseCLIArgs(['create', 'bug-fix', '--workdir', '/tmp']);
    expect(parsed.command).toBe('create');
    expect(parsed.args.name).toBe('bug-fix');
    expect(parsed.args.workdir).toBe('/tmp');
  });

  test('parse "attach test"', () => {
    const parsed = parseCLIArgs(['attach', 'test']);
    expect(parsed.command).toBe('attach');
    expect(parsed.args.name).toBe('test');
  });

  test('parse "import uuid-123 --name imported --workdir /tmp"', () => {
    const parsed = parseCLIArgs(['import', 'uuid-123', '--name', 'imported', '--workdir', '/tmp']);
    expect(parsed.command).toBe('import');
    expect(parsed.args.sessionId).toBe('uuid-123');
    expect(parsed.args.name).toBe('imported');
    expect(parsed.args.workdir).toBe('/tmp');
  });

  test('parse "list"', () => {
    const parsed = parseCLIArgs(['list']);
    expect(parsed.command).toBe('list');
  });

  test('parse "status my-session"', () => {
    const parsed = parseCLIArgs(['status', 'my-session']);
    expect(parsed.command).toBe('status');
    expect(parsed.args.name).toBe('my-session');
  });

  test('parse "remove my-session"', () => {
    const parsed = parseCLIArgs(['remove', 'my-session']);
    expect(parsed.command).toBe('remove');
    expect(parsed.args.name).toBe('my-session');
  });

  test('parse "start" daemon command', () => {
    const parsed = parseCLIArgs(['start']);
    expect(parsed.command).toBe('start');
  });

  test('未知命令抛出错误', () => {
    expect(() => parseCLIArgs(['unknown-cmd'])).toThrow();
  });
});
