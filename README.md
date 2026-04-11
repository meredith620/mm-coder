# mm-coder

AI CLI 会话桥接工具 — 管理多个 AI CLI 会话，支持终端直接交互和 IM 远程交互。

## 解决什么问题

在电脑前用终端操作 Claude Code 等 AI CLI 工具时体验很好，但离开电脑后就无法继续推进任务。mm-coder 让你通过 IM（Mattermost 等）远程继续与同一会话交互，回来后在终端无缝衔接。

## 核心特性

- **终端零中间层** — attach 时直接运行 AI CLI，体验与原生完全一致
- **IM 远程续接** — 离开电脑后通过 Mattermost 继续推进任务
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
# 在 Mattermost 上继续与 bug-fix 会话对话
# 权限请求通过 emoji 审批

# 回到终端
mm-coder attach bug-fix                     # 再次进入，自动 resume
```

## 架构

Session-based 混合方案：

- **终端**：直接运行 `claude --session-id <id> --resume`，stdio 直通，零代理层
- **IM**：daemon 调用 `claude -p "msg" --session-id <id> --output-format stream-json`，结构化输出
- 两端通过 session ID 共享同一会话上下文，互斥使用

详见 [docs/SPEC.md](docs/SPEC.md)。

## 技术栈

- TypeScript / Node.js
- 插件系统：IM Plugin + CLI Plugin 接口

## 项目状态

设计阶段。详见：

- [docs/SPEC.md](docs/SPEC.md) — 需求与设计规格
- [docs/TODO.md](docs/TODO.md) — 待解决问题清单
