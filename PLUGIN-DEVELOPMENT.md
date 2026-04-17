# Plugin Development Guide

mm-coder 支持两类插件：
- **CLI 插件**：负责构造 attach / IM worker / 单条 IM 消息的命令
- **IM 插件**：负责接收消息、发送消息、创建可更新消息、发审批请求

---

## CLI 插件

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

### 当前参考实现

参考 `src/plugins/cli/claude-code.ts`：

```typescript
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

  buildIMMessageCommand(session: Session, prompt: string): CommandSpec {
    return {
      command: 'claude',
      args: [
        '-p', prompt,
        '--resume', session.sessionId,
        '--output-format', 'stream-json',
      ],
    };
  }

  generateSessionId(): string {
    return randomUUID();
  }
}
```

### 注册 CLI 插件

在 `src/plugins/cli/registry.ts` 中注册：

```typescript
const CLI_PLUGINS: Record<string, () => CLIPlugin> = {
  'claude-code': () => new ClaudeCodePlugin(),
  'my-custom': () => new MyCustomPlugin(),
};
```

如果要改默认 CLI 插件，同时更新 registry 中的默认插件常量。

### CLI 插件开发约束

- `buildAttachCommand()` 必须返回可直接进入交互式会话的命令
- `buildIMWorkerCommand()` 用于长驻 worker，不是单次 prompt 命令
- `buildIMMessageCommand()` 用于 dispatcher 单条消息处理
- 生成的命令必须只依赖 `Session` 中已有字段，不能假设额外全局状态

---

## IM 插件

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

### 当前参考实现

参考 `src/plugins/im/mattermost.ts`：
- WebSocket 收消息
- REST API 发消息 / 更新消息
- `IncomingMessage.plugin` 固定写入插件名（如 `mattermost`）
- `threadId/channelId` 必须完整透传，供 daemon 做动态路由

### IM 工厂接口

`src/plugins/im/registry.ts` 中每个 IM 插件都通过工厂注册：

```typescript
export interface IMPluginFactory {
  load(configPath: string, opts?: { sessionCount?: number; activeCount?: number }): Promise<IMPlugin>;
  getDefaultConfigPath(): string;
  writeConfigTemplate(configPath: string): void;
  verifyConnection(configPath?: string): Promise<{ ok: true; config: unknown; botUserId: string }>;
  getCommandHelpText(): string;
}
```

### 注册 IM 插件

```typescript
const IM_PLUGINS: Record<string, IMPluginFactory> = {
  'mattermost': {
    load: async (configPath, opts = {}) => createConnectedMattermostPlugin(configPath, opts),
    getDefaultConfigPath: () => path.join(os.homedir(), '.mm-coder', 'config.json'),
    writeConfigTemplate: writeMattermostConfigTemplate,
    verifyConnection: verifyMattermostConnection,
    getCommandHelpText: getMattermostCommandHelpText,
  },
  'discord': {
    // ...
  },
};
```

如果要改默认 IM 插件，同时更新 registry 中的默认插件常量。

### IM 插件开发约束

- `IncomingMessage.plugin` 必须稳定标识当前 IM 插件名
- `sendMessage()` / `createLiveMessage()` 必须尊重 `MessageTarget.threadId/channelId`
- `getCommandHelpText()` 返回该 IM 插件环境下的 `/help` 文案
- `disconnect()` 必须幂等，daemon 停止时会统一调用

---

## 配置格式

当前推荐配置格式：

```json
{
  "im": {
    "mattermost": {
      "url": "https://your-mattermost-server.com",
      "token": "your-bot-token",
      "channelId": "channel-id-here",
      "reconnectIntervalMs": 5000
    }
  }
}
```

Mattermost 仍兼容旧格式：
- `{ "mattermost": { ... } }`
- `{ "url": "...", "token": "...", "channelId": "..." }`

---

## 路由与调度约束

当前实现已经是动态路由：

1. daemon 根据 `IncomingMessage.plugin + threadId` 绑定 session
2. daemon 在 `/help` `/list` `/status` `/open` 中按消息来源 plugin 选择 IM 插件
3. dispatcher 按 `QueuedMessage.plugin/channelId/threadId` 决定回复目标
4. dispatcher 按 `session.cliPlugin` 动态解析 CLI 插件
5. IM worker manager 也按 `session.cliPlugin` 动态启动 worker

因此新增插件时，最关键的是：
- 写对 `IncomingMessage.plugin`
- 保证 `MessageTarget` 能真实映射到平台线程/频道
- 保证 CLI 插件命令与该 coder 的 resume 语义一致

---

## 测试建议

### CLI 插件测试

至少覆盖：
- `buildAttachCommand()`
- `buildIMWorkerCommand()`
- `buildIMMessageCommand()`
- `generateSessionId()`

参考：`tests/unit/claude-code-plugin.test.ts`

### IM 插件测试

至少覆盖：
- 配置加载
- `onMessage()` 收到平台事件后能正确转换为 `IncomingMessage`
- `sendMessage()` / `createLiveMessage()` / `updateMessage()`
- `requestApproval()`
- `disconnect()`

参考：`tests/unit/mattermost-plugin.test.ts`

### 路由测试

新增 IM/CLI 插件后，建议至少补跑：

```bash
npx vitest run \
  tests/unit/cli-plugin-registry.test.ts \
  tests/unit/im-plugin-registry.test.ts \
  tests/integration/im-routing.test.ts \
  tests/e2e/cli-e2e.test.ts
```

---

## 参考文件

- `src/plugins/types.ts`
- `src/plugins/cli/registry.ts`
- `src/plugins/cli/claude-code.ts`
- `src/plugins/im/registry.ts`
- `src/plugins/im/mattermost.ts`
- `tests/helpers/mock-cli-plugin.ts`
- `tests/helpers/mock-im-plugin.ts`
