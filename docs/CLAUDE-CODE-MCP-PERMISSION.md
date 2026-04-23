# Claude Code MCP Permission 协议

本文件是 mx-coder 中 Claude Code IM 审批链路的权威协议说明。未来修改 `mcp-bridge.ts`、`approval-handler.ts`、`approval-manager.ts`、`plugins/cli/claude-code.ts` 时，必须以本文件为准对齐实现与测试。

## 1. 边界

- 本协议只描述 **Claude Code 在 IM worker 模式下** 的 permission prompt 流程。
- 终端 attach 模式下，直接使用 Claude Code 原生权限确认，不经过 mx-coder 审批桥。
- 本协议不是跨 CLI 的统一抽象；Codex / Gemini 应分别复用各自原生审批机制。

## 2. 通信拓扑

```text
claude -p --permission-prompt-tool mcp__mx_coder_bridge__can_use_tool
  -> 临时 bridge 脚本（stdio）
  -> daemon approval socket
  -> ApprovalHandler / ApprovalManager
  -> IM 审批
  -> allow / deny 响应回 Claude Code
```

关键约束：
- bridge 仅做 stdio ↔ socket 转发，不包含审批业务逻辑。
- daemon 负责审批状态机、规则匹配和 IM 路由。
- bridge 与 IM worker 生命周期绑定，worker 退出后 bridge 一并失效。

## 3. 请求输入

MCP `tools/call` 的 `arguments` 至少包含：
- `tool_name`
- `message_id`
- `tool_use_id`

工具输入字段规则：
- 优先读取 `input`
- 若 `input` 缺失，兼容读取 `tool_input`
- 两者都缺失时按空对象处理

会话字段：
- `session_id` 用于把审批路由到对应 session
- `message_id + tool_use_id` 用于 requestId 关联

## 4. 返回格式

返回必须是 **单个 text block**，其 `text` 内容是 JSON 字符串。

### allow

```json
{"behavior":"allow","updatedInput":{...}}
```

约束：
- `updatedInput` 必须回传最终允许执行的输入对象
- allow 时不得返回额外 block

### deny

```json
{"behavior":"deny","message":"..."}
```

约束：
- `message` 应为可读拒绝原因
- deny / expired / cancelled 都必须 fail-closed 地映射为 deny 返回

## 5. requestId 与状态机

`requestId` 生成规则：

```text
<sessionId>:<messageId>:<toolUseId>:<nonce>
```

审批状态：
- `pending`
- `approved`
- `denied`
- `expired`
- `cancelled`

约束：
- 同一 session 任一时刻最多仅允许一个 `pending` 审批
- 新审批到来时，旧 pending 必须失效
- stale requestId 回调必须被丢弃，不得改写当前状态
- daemon 重启后未决审批必须转为 `expired`

## 6. 规则匹配

主策略按 capability：
- `read_only` -> 可 autoAllow
- `file_write` -> 默认 ask
- `shell_dangerous` / `network_destructive` -> 可 autoDeny

约束：
- capability 规则优先于字符串模式匹配
- `autoDenyPatterns` 仅作兜底，不可替代 capability 主策略

## 7. scope=session

当用户选择 `for session`：
- 缓存键固定为 `sessionId + operatorId + capability`
- operatorId 以 daemon 记录的当前活动消息发起者为真值
- capability 优先使用 MCP 显式透传值；缺失时由 daemon 保守推导

缓存失效时机：
- session 结束
- force takeover
- session reset / remove

## 8. 实现映射

- `src/plugins/cli/claude-code.ts`
  - IM worker 命令构建
  - 注入 `--mcp-config`
  - 注入 `--permission-prompt-tool`
- `src/mcp-bridge.ts`
  - stdio ↔ socket bridge
  - MCP tool schema 暴露
- `src/approval-handler.ts`
  - 解析 `tools/call`
  - 读取 `input` / `tool_input`
  - 生成 allow / deny text block
- `src/approval-manager.ts`
  - pending 状态机
  - capability 规则匹配
  - session scope 缓存

## 9. 回归测试要求

以下约束必须有测试覆盖：
- `input` 优先于 `tool_input`
- 返回必须是单 text block
- allow / deny JSON 结构固定
- daemon 重启后 pending -> expired
- stale requestId 不得污染当前审批状态
