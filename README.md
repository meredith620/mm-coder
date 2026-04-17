# mm-coder

AI CLI 会话桥接工具 — 管理多个 AI CLI 会话，支持终端直接交互和 IM 远程交互。

## 解决什么问题

在电脑前用终端操作 Claude Code 等 AI CLI 工具时体验很好，但离开电脑后就无法继续推进任务。mm-coder 让你通过 IM（Mattermost 等）远程继续与同一会话交互，回来后在终端无缝衔接。

## 核心特性

- **终端零中间层** — attach 时直接运行 AI CLI，体验与原生完全一致
- **IM 远程续接** — 离开电脑后通过 Mattermost 继续推进任务
- **终端优先 + 接管** — 终端 attach 时 IM 普通消息会被拒绝，可用 takeover 请求或强制接管
- **多会话并行** — 同时管理多个独立会话，终端和 IM 各自操作
- **权限审批转发** — 终端不在时，权限请求自动转发到 IM 审批
- **插件化扩展** — IM 端（Mattermost / Slack / Discord）和 CLI 端（Claude Code / Codex / Gemini）均可通过插件扩展

## 使用流程

```bash
mm-coder start                              # 启动后台服务（一次性）
mm-coder create bug-fix --workdir ~/myapp   # 创建命名会话

# 终端交互（原生体验）
mm-coder attach bug-fix                     # 直接进入 Claude Code
# ... 正常工作 ...
# 退出 Claude Code = 释放会话

# IM 远程交互
# `/open <name>` 定位到对应 thread
# attached 时 IM 普通消息会被拒绝，并提示使用 `/takeover <name>`
# `/takeover <name>` 请求终端释放；`/takeover-force <name>` 立即接管

# 回到终端
mm-coder attach bug-fix                     # 再次进入，自动 resume
```

## 配置

### Mattermost

创建 `~/.mm-coder/config.json`：

```json
{
  "im": {
    "mattermost": {
      "url": "https://mattermost.example.com",
      "token": "your-bot-token",
      "channelId": "channel-id",
      "reconnectIntervalMs": 5000
    }
  }
}
```

仍兼容旧格式：

```json
{
  "mattermost": {
    "url": "https://mattermost.example.com",
    "token": "your-bot-token",
    "channelId": "channel-id"
  }
}
```

以及最早的平铺格式：

```json
{
  "url": "https://mattermost.example.com",
  "token": "your-bot-token",
  "channelId": "channel-id"
}
```

| 字段 | 说明 |
|------|------|
| `url` | Mattermost 服务器地址 |
| `token` | Bot 的 Personal Access Token |
| `channelId` | 监听消息的频道 ID |
| `reconnectIntervalMs` | WebSocket 重连间隔（可选，默认 5000ms） |

## 插件开发

当前默认插件：
- 默认 CLI 插件：`claude-code`
- 默认 IM 插件：`mattermost`

扩展方式：
- 新增 CLI 插件：实现 `src/plugins/types.ts` 中的 `CLIPlugin`，并注册到 `src/plugins/cli/registry.ts`
- 新增 IM 插件：实现 `src/plugins/types.ts` 中的 `IMPlugin`，并注册到 `src/plugins/im/registry.ts`

更完整的开发与发布说明见 [docs/DEV-OPS.md](docs/DEV-OPS.md)。

## 架构

Session-based 混合方案：

- **终端**：CLI 插件负责构造 attach 命令，默认实现为 `claude --resume <id>` / `claude --session-id <id>`
- **IM**：daemon 根据 session 的 `cliPlugin` 动态选择 CLI 插件，执行 `buildIMMessageCommand()`
- **路由**：IM 回复目标优先使用消息自身的 `plugin/channelId/threadId`
- **互斥**：终端 attach 时 IM 普通消息会被拒绝；可通过 takeover 交接控制权

详见 [docs/SPEC.md](docs/SPEC.md)。

## 技术栈

- TypeScript / Node.js
- 插件系统：IM Plugin + CLI Plugin 接口

## 项目状态

设计阶段。详见：

- [docs/SPEC.md](docs/SPEC.md) — 需求与设计规格
- [docs/TODO.md](docs/TODO.md) — 待解决问题清单
