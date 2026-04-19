# mm-coder 第二阶段 resident worker 迁移交付总结

更新时间：2026-04-18

## 1. 交付范围

本轮已按切片完成并通过关键/全量测试的内容：

- R1 `runtimeState / busy-idle` 类型基线迁移
- R2 `SessionRegistry` 控制面与运行态解耦
- R3 CLI 插件契约迁移到 resident worker 主模型
- R4 `IMWorkerManager` 常驻进程生命周期管理
- R5 `result` 事件作为消息完成边界的单测与流处理基线
- R6 `IMMessageDispatcher` 从 per-message spawn 迁到 per-session resident queue
- R7 attach 与 IM worker 的安全切换主链
- R8 takeover 与 approval cancel / session cache 失效闭环
- R9 daemon 重启后的恢复状态基线
- R10 Mattermost WebSocket 活性检测与自愈重连
- R11 对外状态呈现（runtimeState + busy/idle）与 Mattermost typing 能力基线
- R12 总验收与关键/全量测试收口

## 2. 已达成的目标语义

### 2.1 resident worker 主模型

- 同一活跃 session 由单个常驻 IM worker 驱动
- dispatcher 不再按“每条消息启动一个临时 Claude 进程”组织主路径
- 同一 session 的 IM 消息按 FIFO 串行发送到同一个 worker
- `messageQueue` 被收敛为调度队列，而非进程生命周期容器

### 2.2 状态真值

- `status` 与 `runtimeState` 已分离
- `idle` 不再等同于单一运行态，而允许 `cold | ready`
- `approval_pending` 被收敛为当前活动消息的阻塞子态
- `attach_pending` 能保留 `ready / running / waiting_approval` 的子语义

### 2.3 attach / takeover / approval

- attach 与 IM worker 切换已具备主链安全语义
- attach waiter 当前统一使用 `session_resume` 事件唤醒
- `takeover-force` 会先取消 pending approval，再完成 takeover
- `scope=session` 缓存会在 takeover force 路径失效

### 2.4 恢复与重启

- daemon 重启后不会把旧 ready worker 当成可信进程恢复
- `attached / im_processing / approval_pending / takeover_pending` 重启后映射到 `recovering`
- `ready` 持久化恢复后回到 `idle + cold`

### 2.5 Mattermost 健壮性

- 已补上 WebSocket 活性相关时间戳：
  - `lastWsOpenAt`
  - `lastWsMessageAt`
  - `lastHeartbeatSentAt`
  - `lastHeartbeatAckAt`
- 已补 heartbeat 检测与超时后主动 close + reconnect
- 已提供 `getConnectionHealth()` 诊断摘要
- 已增加 `sendTyping()` 能力基线

### 2.6 对外状态呈现

- CLI `status` 已输出 `runtimeState`
- CLI `status` 已输出 `busy/idle` 派生
- TUI 渲染已输出 `status + runtimeState`
- Mattermost 健康摘要单测已覆盖

## 3. 测试结果

### 3.1 关键回归

以下关键测试文件已通过：

- `tests/unit/types.test.ts`
- `tests/unit/session-state-machine.test.ts`
- `tests/unit/session-registry.test.ts`
- `tests/unit/claude-code-plugin.test.ts`
- `tests/unit/im-worker-manager.test.ts`
- `tests/unit/parse-stream.test.ts`
- `tests/unit/stream-to-im.test.ts`
- `tests/unit/mattermost-plugin.test.ts`
- `tests/unit/tui-renderer.test.ts`
- `tests/unit/approval-manager.test.ts`
- `tests/integration/message-delivery.test.ts`
- `tests/integration/im-routing.test.ts`
- `tests/integration/daemon-attach.test.ts`
- `tests/integration/daemon-commands.test.ts`
- `tests/integration/persistence.test.ts`
- `tests/e2e/im-message-flow.test.ts`
- `tests/e2e/stdio-im-e2e.test.ts`
- `tests/e2e/attach-im-switch.test.ts`
- `tests/e2e/approval-e2e.test.ts`
- `tests/e2e/cli-e2e.test.ts`

### 3.2 全量测试

已执行：

- `npm test`

结果：

- 11 个测试文件
- 99 个测试
- 全部通过

## 4. 审查结论

本轮在交付前进行了代码审查与清理，当前代码主链整体结论：

- 未发现阻塞交付的复用缺陷
- 未发现新的高风险结构性 hack
- resident worker / attach / approval / recovery / mattermost 健壮性主链已收敛

需要说明的设计选择：

- attach waiter 事件当前统一为 `session_resume`，已避免双真值并存
- CLI E2E 为了稳定覆盖非 git 目录场景，改为直接走 `tsx` CLI 入口，而不是 `node --import tsx ...` 变体

## 5. 当前剩余非阻塞项

以下属于可继续增强，但不阻塞本轮交付：

1. Mattermost 更深层的 ws resilience integration test 仍可继续补强
2. typing 的更细节流/门控策略还可继续补更高层测试
3. README / TODO / SPEC 若需要逐条对账，可再做一次文档一致性巡检

## 6. 建议的后续动作

若进入下一轮：

1. 做一次 README / SPEC / TODO 的逐条一致性复核
2. 补 Mattermost WS resilience integration 测试
3. 若需要发布，执行一次 build 产物检查与发布前 smoke test
