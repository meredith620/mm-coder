# mm-coder — 需求与设计规格

> AI CLI 会话桥接工具：管理多个 AI CLI 会话，支持终端直接交互和 IM 远程交互，两端交替使用同一会话上下文。

---

## 1. 需求

### 1.1 核心场景

个人开发者日常同时推进多个 AI CLI 任务。大部分时间在终端直接使用 Claude Code 等 AI CLI 工具，离开电脑时希望通过 IM（Mattermost 等）继续推进，回来后在终端无缝衔接。

### 1.2 关键需求

- **终端原生体验**：终端交互时直接面对 AI CLI，零中间层
- **IM 远程续接**：离开电脑后，通过 IM 继续与同一会话交互
- **多会话并行**：同时管理多个独立会话，终端和 IM 各自选择操作哪个
- **权限审批不阻塞**：终端不在时，权限请求转发到 IM 审批
- **可扩展**：IM 端（Mattermost → Slack/Discord）和 CLI 端（Claude Code → Codex/Gemini）均可通过插件扩展

### 1.3 使用流程

```
$ mm-coder start                                # 启动 daemon（一次性）
$ mm-coder create bug-fix --workdir ~/myapp     # 注册一个命名会话

# 在电脑前：终端直接交互
$ mm-coder attach bug-fix                       # 直接启动 Claude Code，原生体验
  ... 正常使用 Claude Code ...
  /exit 或 Ctrl+C                               # 退出 Claude Code = 释放会话

# 离开电脑：IM 远程交互
  → Mattermost 上发消息继续推进任务
  → 权限请求通过 IM emoji/按钮审批

# 回到电脑：终端再次接续
$ mm-coder attach bug-fix                       # 再次启动 Claude Code，自动 resume
```

---

## 2. 架构

### 2.1 核心思路：Session-based 混合方案

终端和 IM 使用不同的交互通道访问同一个 AI CLI 会话：

- **终端**：直接运行 AI CLI 命令（如 `claude --session-id <id> --resume`），用户看到的就是原生 Claude Code，没有任何代理层
- **IM**：Daemon 调用 AI CLI 的非交互模式（如 `claude -p "msg" --session-id <id> --output-format stream-json`），获取结构化输出后发送到 IM
- **互斥**：同一 session 同一时刻只有一端在操作。终端在用时 IM 提示"会话正在终端使用中"

### 2.2 整体结构

```
                    ┌──────────────────────────────────────┐
                    │           mm-coder daemon             │
                    │                                      │
                    │  ┌────────────────────────────────┐  │
                    │  │       SessionRegistry          │  │
                    │  │                                │  │
                    │  │  bug-fix   → { sessionId, ... }│  │
                    │  │  review-pr → { sessionId, ... }│  │
                    │  │  explore   → { sessionId, ... }│  │
                    │  └────────────────────────────────┘  │
                    │                                      │
                    │  ┌──────────────┐ ┌──────────────┐  │
                    │  │  IM Plugins  │ │  CLI Plugins │  │
                    │  │ ┌──────────┐ │ │ ┌──────────┐ │  │
                    │  │ │Mattermost│ │ │ │ClaudeCode│ │  │
                    │  │ └──────────┘ │ │ └──────────┘ │  │
                    │  │ ┌──────────┐ │ │ ┌──────────┐ │  │
                    │  │ │Slack ... │ │ │ │Codex ... │ │  │
                    │  │ └──────────┘ │ │ └──────────┘ │  │
                    │  └──────────────┘ └──────────────┘  │
                    └───────────┬──────────────────────────┘
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
    ┌────────▼─────┐   ┌───────▼──────┐   ┌───────▼──────┐
    │ mm-coder CLI │   │ Mattermost   │   │ AI CLI       │
    │ (用户命令)    │   │ (IM 消息)    │   │ (非交互进程)  │
    └──────────────┘   └──────────────┘   └──────────────┘
```

### 2.3 数据流

```
终端 attach:
  mm-coder attach bug-fix
    → 通知 daemon 标记 session 为 attached，上报 claude 进程 PID
    → 直接执行 claude --session-id <id> --resume（stdio: inherit）
    → 用户与 Claude Code 原生交互
    → Claude Code 退出后，通知 daemon 标记 session 为 detached
    → 如果是被 IM 端接管导致退出，显示"会话已被 IM 端接管"

IM 交互:
  用户在 Mattermost 发消息
    → IM Plugin 收到消息
    → Daemon 检查 session 状态
    → 如果 attached:
       → 提示"会话正在终端使用中，是否接管？"
       → 用户选择接管 → Daemon 向终端 claude 进程发送 SIGTERM
       → Claude Code 优雅退出（session 状态自动保存）
       → session 变为 detached，继续处理 IM 消息
       → 用户选择不接管 → 消息排队等待
    → 如果 detached:
       → 启动 claude -p "msg" --session-id <id> --output-format stream-json
       → 解析 stream-json 输出
       → 发送格式化结果到 IM
       → 进程退出，session 保持 detached
```

### 2.4 并发模型

- 同一 session 的 IM 消息串行处理（队列），前一条处理完才处理下一条
- 不同 session 之间完全并行
- 终端和 IM 互斥：attach 时 IM 可选择接管（SIGTERM 终止终端进程）或排队等待

---

## 3. 核心模块

### 3.1 Daemon

后台长驻进程，职责：
- 托管 SessionRegistry
- 加载并管理插件
- 接收 CLI 命令（通过 IPC）
- 接收 IM 消息并调度 AI CLI 处理

### 3.2 SessionRegistry

```typescript
interface Session {
  name: string;              // 用户定义，唯一
  sessionId: string;         // AI CLI 的 session ID（如 Claude Code 的 --session-id）
  cliPlugin: string;         // CLI 插件名
  workdir: string;
  status: 'attached' | 'detached';
  attachedPid: number | null; // 终端 claude 进程 PID（attached 时有值）
  imBindings: IMBinding[];   // 关联的 IM 线程
  messageQueue: string[];    // IM 待处理消息队列
  createdAt: Date;
  lastActivityAt: Date;
}

class SessionRegistry {
  create(name: string, opts: CreateOpts): Session;
  list(): SessionInfo[];
  remove(name: string): void;

  markAttached(name: string, pid: number): void;
  markDetached(name: string): void;
  takeover(name: string): void;  // 向终端 claude 进程发 SIGTERM，强制释放 session

  bindIM(name: string, binding: IMBinding): void;
  getByIMThread(pluginName: string, threadId: string): Session | undefined;
}
```

### 3.3 CLI 命令

```
mm-coder start                              启动 daemon
mm-coder stop                               停止 daemon
mm-coder create <name> [--workdir] [--cli]  注册新会话
mm-coder attach <name>                      直接启动 AI CLI 交互
mm-coder list                               列出所有会话
mm-coder remove <name>                      删除会话
mm-coder status                             daemon 和会话状态
```

---

## 4. 插件系统

### 4.1 IM Plugin 接口

```typescript
interface IMPlugin {
  name: string;

  init(config: Record<string, unknown>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;

  onMessage(handler: (msg: IncomingMessage) => void): void;
  sendMessage(target: MessageTarget, content: string): Promise<void>;

  // 权限审批
  requestApproval(target: MessageTarget, req: ApprovalRequest): Promise<boolean>;
}
```

首个实现：**MattermostPlugin**

### 4.2 CLI Plugin 接口

```typescript
interface CLIPlugin {
  name: string;

  // 终端模式：构建交互式启动命令
  buildAttachCommand(session: Session): { command: string; args: string[] };

  // IM 模式：构建非交互式命令
  buildMessageCommand(session: Session, message: string): { command: string; args: string[] };

  // 解析非交互模式输出
  parseOutput(raw: string): ParsedOutput;

  // 权限拦截配置（可选）
  permissionConfig?(): PermissionConfig;
}
```

首个实现：**ClaudeCodePlugin**

```typescript
// 示例：Claude Code 插件实现
class ClaudeCodePlugin implements CLIPlugin {
  name = 'claude-code';

  buildAttachCommand(session: Session) {
    return {
      command: 'claude',
      args: ['--session-id', session.sessionId, '--resume'],
    };
  }

  buildMessageCommand(session: Session, message: string) {
    return {
      command: 'claude',
      args: ['-p', message, '--session-id', session.sessionId,
             '--output-format', 'stream-json', '--resume'],
    };
  }
}
```

### 4.3 插件加载

插件以 npm 包或本地目录形式存在，配置文件声明，动态 import 加载：

```yaml
plugins:
  im:
    - name: mattermost
      package: "@mm-coder/plugin-mattermost"
  cli:
    - name: claude-code
      package: "@mm-coder/plugin-claude-code"
```

---

## 5. 权限审批

### 终端模式

直接使用 AI CLI 原生审批（Claude Code 自带的终端权限确认），无需干预。

### IM 模式

通过 Claude Code 的 **PreToolUse Hook** 实现。Hook 是 Claude Code 在执行工具前调用的外部脚本，在 `-p` 非交互模式下同样生效。

**流程：**

```
claude -p 执行中，要调用 Write 工具
  → 触发 PreToolUse hook
  → hook 脚本读取 stdin 中的工具调用信息（工具名、参数等）
  → 检查白名单：如果工具在 autoAllow 中 → 直接输出 {"decision":"allow"}
  → 检查黑名单：如果匹配 autoDeny 规则 → 直接输出 {"decision":"deny"}
  → 否则：通过 Unix socket 发请求到 daemon
  → daemon 转发到 IM："⚠️ 权限请求: Write → src/auth.ts"
  → hook 脚本阻塞等待...
  → 用户在 IM 审批（👍 / 👎）
  → daemon 返回结果给 hook 脚本
  → hook 脚本输出 {"decision":"allow"} 或 {"decision":"deny"}
  → Claude Code 继续或中止
```

**配置：**

```yaml
permissions:
  # 白名单：IM 模式下自动允许，不弹审批
  autoAllow:
    - Read
    - Grep
    - Glob
    - WebSearch
    - LSP

  # 黑名单：IM 模式下直接拒绝
  autoDeny:
    - "Bash:rm -rf"
    - "Bash:drop"
    - "Bash:truncate"

  # 未匹配的工具 → 走 IM 审批
  timeout: 300  # 审批超时秒数，超时自动拒绝
```

**实现要点：**

- mm-coder 启动 `claude -p` 时，自动注入 PreToolUse hook 配置
- hook 脚本是一个轻量进程，通过 Unix socket 与 daemon 同步通信
- daemon 维护 pending approval 状态，IM 用户审批后立即响应 hook

---

## 6. IM 交互

### Mattermost 示例

每个 session 关联一个 thread：

```
用户: !create bug-fix ~/myapp
Bot:  ✅ 会话 'bug-fix' 已创建并关联到此线程

用户: auth 模块的实现逻辑是什么？
Bot:  [Claude Code 的回复，Markdown 格式化]

用户: !list
Bot:  ● bug-fix    (detached)  ~/myapp
      ● review-pr  (attached)  ~/other     ← 终端使用中

用户: !switch review-pr
Bot:  ⚠️ 会话 'review-pr' 正在终端使用中
      🔄 接管（终止终端会话）  ❌ 取消
用户: 🔄
Bot:  ✅ 已接管 'review-pr'，终端会话已终止

[权限审批]
Bot:  ⚠️ 权限请求: Write → src/auth.ts
      👍 允许  👎 拒绝
用户: 👍
Bot:  ✅ 已允许
```

---

## 7. 配置

```yaml
# ~/.config/mm-coder/config.yaml

plugins:
  im:
    - name: mattermost
      package: "@mm-coder/plugin-mattermost"
      config:
        url: https://mattermost.example.com
        token: bot-token
        channelId: default-channel
  cli:
    - name: claude-code
      package: "@mm-coder/plugin-claude-code"

defaults:
  cli: claude-code
  workdir: ~/projects

permissions:
  autoAllow: [Read, Grep, Glob, WebSearch, LSP]
  autoDeny: ["Bash:rm -rf", "Bash:drop", "Bash:truncate"]
  timeout: 300

persistence:
  path: ~/.config/mm-coder/sessions.json
```

---

## 8. 项目结构

```
src/
├── index.ts                 # CLI 入口（命令解析）
├── daemon.ts                # Daemon 主进程
├── session-registry.ts      # Session 注册表
│
├── plugins/
│   ├── types.ts             # 插件接口定义
│   ├── plugin-host.ts       # 插件加载器
│   ├── im/
│   │   └── mattermost.ts
│   └── cli/
│       └── claude-code.ts
│
├── config/
│   └── index.ts
│
└── utils/
    └── logger.ts
```

---

## 9. 实现顺序

```
Phase 1: 核心骨架
  - Daemon + IPC 通信
  - SessionRegistry
  - CLI 命令（start/create/attach/list）
  - Claude Code 插件（attach + message 命令构建）

Phase 2: Mattermost 集成
  - IM 插件接口 + Mattermost 实现
  - IM 命令处理 + thread 关联
  - stream-json 输出解析与 Markdown 格式化

Phase 3: 权限审批
  - IM 模式下的权限拦截方案
  - IM 审批交互

Phase 4: 插件系统完善
  - 插件加载器
  - 配置体系
  - 更多 IM/CLI 插件
```

---

## 待定

- [ ] 会话持久化与 daemon 重启后的恢复策略
- [ ] IM 消息队列的持久化（daemon 重启时不丢消息）
- [ ] 测试策略
