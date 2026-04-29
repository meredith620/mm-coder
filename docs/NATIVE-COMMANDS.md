# mx-coder 支持的原生指令

mx-coder 通过 `//<cmd>` 语法将 IM 消息透传给底层 coder CLI。

## Claude Code 原生指令

在管道模式（`-p`）下，Claude Code 支持以下 slash commands：

### 会话控制

| 指令 | 说明 | 示例输出 |
|------|------|----------|
| `/compact` | 压缩会话上下文，释放 token 空间 | `Compacting context...` 或 `No messages to compact` |
| `/context` | 显示当前 token 使用统计 | 表格显示各分类 token 占用 |
| `/cost` | 显示会话成本统计 | 总成本、API 时长、代码变更统计 |

### 项目操作

| 指令 | 说明 | 示例输出 |
|------|------|----------|
| `/init` | 在当前目录初始化 CLAUDE.md | 创建项目配置文件 |
| `/review [path]` | 代码审查（可指定路径） | 审查结果 |

### 调试与分析

| 指令 | 说明 | 示例输出 |
|------|------|----------|
| `/debug` | 启用调试模式，显示会话调试信息 | 后台任务执行 |
| `/insights` | 显示会话洞察 | 后台任务执行 |

**注意**：`/security-review` 在管道模式下无输出，不推荐使用。

### 配置

| 指令 | 说明 | 示例输出 |
|------|------|----------|
| `/update-config` | 更新配置 | 配置更新结果 |
| `/batch` | 批量操作 | 批量任务执行 |

### 技能（Skills）

| 指令 | 说明 |
|------|------|
| `/simplify` | 简化代码 |
| `/loop` | 循环执行 |
| `/claude-api` | Claude API 相关操作 |

## IM 透传语法

在 Mattermost 中发送以 `//` 开头的消息，即可透传到 Claude Code：

```
//compact     → 压缩上下文
//context     → 查看 token 使用
//cost        → 查看会话成本
```

**注意**：
- 透传命令以双斜杠 `//` 开头，mx-coder 会剥离首个 `/` 后发送给 Claude Code
- 单斜杠命令（如 `/status`、`/help`）由 mx-coder 自己处理，不透传
- `//effort` 和 `//model` 在管道模式下不可用（这些是 TUI 专用命令）

## 相关文档

- [SPEC.md](SPEC.md) — 透传协议的完整规格
- [IMPL-SLICES.v2.1.md](IMPL-SLICES.v2.1.md) — v2.1 透传功能实现切片