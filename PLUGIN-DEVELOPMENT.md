# Plugin Development Guide

mm-coder 支持两类插件：**CLI 插件**（coder 后端）和 **IM 插件**（消息平台）。

---

## CLI 插件（Coder 后端）

CLI 插件负责生成与 AI 编码助手（如 Claude Code）交互的命令。

### 接口定义

```typescript
export interface CommandSpec {
  command: string;
  args: string[];
}

export interface CLIPlugin {
  buildAttachCommand(session: Session): CommandSpec;
  buildIMWorkerCommand(session: Session, bridgeScriptPath: string): CommandSpec;
  buildIMMessageCommand(session: Session, prompt: string): CommandSpec;
  generateSessionId(): string;
}
```

### 实现示例

参考 `src/plugins/cli/claude-code.ts`：

```typescript
export const ClaudeCodePlugin: CLIPlugin = {
  buildAttachCommand(session: Session): CommandSpec {
    return {
      command: 'claude',
      args: [
        '--dangerously-disable-permissions',
        '--session-id', session.sessionId,
      ],
    };
  },

  buildIMWorkerCommand(session: Session, bridgeScriptPath: string): CommandSpec {
    return {
      command: 'claude',
      args: [
        '--dangerously-disable-permissions',
        '--session-id', session.sessionId,
        '--mcp', bridgeScriptPath,
      ],
    };
  },

  buildIMMessageCommand(session: Session, prompt: string): CommandSpec {
    return {
      command: 'claude',
      args: [
        '--dangerously-disable-permissions',
        '--session-id', session.sessionId,
        '--prompt', prompt,
      ],
    };
  },

  generateSessionId(): string {
    return randomUUID();
  },
};
```

### 注册插件

在 `src/plugins/cli/registry.ts` 中注册：

```typescript
import { MyCustomPlugin } from './my-custom.js';

const CLI_PLUGINS: Record<string, CLIPlugin> = {
  'claude-code': ClaudeCodePlugin,
  'my-custom': MyCustomPlugin,  // 新增
};

export function getCLIPlugin(name: string): CLIPlugin {
  const plugin = CLI_PLUGINS[name];
  if (!plugin) throw new Error(`Unknown CLI plugin: ${name}`);
  return plugin;
}
```

### 使用插件

```bash
# 创建 session 时指定 CLI 插件
mm-coder create my-session --cli my-custom
```

---

## IM 插件（消息平台）

IM 插件负责与消息平台（如 Mattermost、Discord）交互。

### 接口定义

```typescript
export interface IMPlugin {
  onMessage(handler: (msg: IncomingMessage) => void): void;
  sendMessage(target: MessageTarget, content: MessageContent): Promise<void>;
  createLiveMessage(target: MessageTarget, content: MessageContent): Promise<string>;
  updateMessage(messageId: string, content: MessageContent): Promise<void>;
  requestApproval(target: MessageTarget, request: ApprovalRequest): Promise<void>;
  disconnect?(): Promise<void>;
}
```

关键类型定义见 `src/types.ts`：
- `IncomingMessage`：接收到的消息
- `MessageTarget`：消息目标（channel/thread/user）
- `MessageContent`：消息内容（text/markdown/file）
- `ApprovalRequest`：审批请求

### 实现要点

参考 `src/plugins/im/mattermost.ts` 的 `MattermostPlugin` 类：

1. **连接管理**：在构造函数或 `connect()` 中建立 WebSocket 连接
2. **消息接收**：监听平台事件，转换为 `IncomingMessage` 并调用 `onMessage` 回调
3. **消息发送**：实现 `sendMessage`、`createLiveMessage`、`updateMessage`
4. **审批请求**：实现 `requestApproval` 发送交互式审批消息
5. **资源清理**：实现 `disconnect()` 关闭连接

### 配置格式

IM 插件配置统一放在 `~/.mm-coder/config.json`，使用多 IM 格式：

```json
{
  "im": {
    "mattermost": {
      "url": "https://your-mattermost-server.com",
      "token": "your-bot-token",
      "channelId": "channel-id-here",
      "reconnectIntervalMs": 5000
    },
    "discord": {
      "token": "your-discord-bot-token",
      "guildId": "guild-id",
      "channelId": "channel-id"
    }
  }
}
```

**向后兼容**：旧格式仍然支持：
- `{ "mattermost": { ... } }` （分组格式）
- `{ "url": "...", "token": "..." }` （扁平格式）

### 插件工厂

在 `src/plugins/im/registry.ts` 中注册插件工厂：

```typescript
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
      return createConnectedMattermostPlugin(configPath, { sessionCount: 0, activeCount: 0 });
    },
    getDefaultConfigPath: () => path.join(os.homedir(), '.mm-coder', 'config.json'),
    writeConfigTemplate: writeMattermostConfigTemplate,
    verifyConnection: verifyMattermostConnection,
  },
  // 新增插件
  'discord': { ... },
};

export function getIMPluginFactory(name: string): IMPluginFactory {
  const factory = IM_PLUGINS[name];
  if (!factory) throw new Error(`Unknown IM plugin: ${name}`);
  return factory;
}
```

### 使用插件

```bash
# 初始化配置
mm-coder im init --plugin discord

# 验证连接
mm-coder im verify --plugin discord

# 启动 daemon（默认使用 mattermost）
mm-coder start
```

---

## 测试

### CLI 插件测试

创建 `tests/unit/my-cli-plugin.test.ts`：

```typescript
import { describe, test, expect } from 'vitest';
import { MyCustomPlugin } from '../../src/plugins/cli/my-custom.js';

describe('MyCustomPlugin', () => {
  test('buildAttachCommand 返回正确命令', () => {
    const session = { sessionId: 'test-123', name: 'test', workdir: '/tmp' };
    const spec = MyCustomPlugin.buildAttachCommand(session);
    expect(spec.command).toBe('my-coder');
    expect(spec.args).toContain('test-123');
  });

  test('generateSessionId 返回唯一 ID', () => {
    const id1 = MyCustomPlugin.generateSessionId();
    const id2 = MyCustomPlugin.generateSessionId();
    expect(id1).not.toBe(id2);
  });
});
```

### IM 插件测试

使用 `MockIMPlugin`（`tests/helpers/mock-im-plugin.ts`）进行集成测试：

```typescript
import { MockIMPlugin } from '../helpers/mock-im-plugin.js';

test('IM 消息流', async () => {
  const plugin = new MockIMPlugin();
  const received: IncomingMessage[] = [];
  plugin.onMessage(msg => received.push(msg));
  
  plugin.simulateMessage({ threadId: 't1', userId: 'u1', text: 'hello' });
  expect(received).toHaveLength(1);
  expect(received[0].text).toBe('hello');
});
```

---

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                        Daemon                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │          SessionRegistry                         │   │
│  │  - 管理所有 session 状态                         │   │
│  │  - 消息队列                                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────┐        ┌──────────────────────┐   │
│  │ IMMessageDispatcher│      │  IMWorkerManager     │   │
│  │  - 轮询消息队列   │      │  - 管理 CLI 进程     │   │
│  │  - 调用 CLI 插件  │      │  - 崩溃重启          │   │
│  └──────────────────┘        └──────────────────────┘   │
│           │                            │                 │
│           ▼                            ▼                 │
│  ┌──────────────────┐        ┌──────────────────────┐   │
│  │    IM Plugin     │        │    CLI Plugin        │   │
│  │  - Mattermost    │        │  - Claude Code       │   │
│  │  - Discord       │        │  - Custom Coder      │   │
│  └──────────────────┘        └──────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**消息流**：
1. IM 平台 → `IMPlugin.onMessage` → `SessionRegistry.enqueueIMMessage`
2. `IMMessageDispatcher` 轮询队列 → 调用 `CLIPlugin.buildIMMessageCommand`
3. CLI 进程输出 → `StreamToIM` → `IMPlugin.sendMessage` → IM 平台

**审批流**：
1. CLI 进程 → MCP `can_use_tool` → `ApprovalHandler`
2. `ApprovalHandler` → `IMPlugin.requestApproval` → IM 平台
3. 用户审批 → `ApprovalManager.decide` → 返回 CLI 进程

---

## 参考实现

- **CLI 插件**：`src/plugins/cli/claude-code.ts`
- **IM 插件**：`src/plugins/im/mattermost.ts`
- **Mock 插件**：`tests/helpers/mock-cli-plugin.ts`, `tests/helpers/mock-im-plugin.ts`
- **Registry**：`src/plugins/cli/registry.ts`, `src/plugins/im/registry.ts`
