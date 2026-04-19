# mm-coder (Multi-modal Coder) Mattermost 设计差距清单

> **文档生命周期**：这是“实现前收口用”的阶段性 gap 文档。它的价值在于帮助 AI agent 和 reviewer 快速判断“当前代码离目标设计还差什么”。  
> 当相应缺口被实现并由测试覆盖后，应及时缩减、更新；当前文档只保留**仍未关闭**的 gap，避免已关闭项与待办项并存造成双真值。

---

## 1. 目标

本文件对比：
- **当前实现**：`src/plugins/im/mattermost.ts`
- **目标设计**：`docs/SPEC.md`、`docs/STATE-INVARIANTS.md`、`docs/EVENT-SEMANTICS.md`、`docs/IMPL-SLICES.resident-worker-tdd.md`

输出一份“当前仍可直接开工的 gap list”，避免 agent 反复自己读代码后再归纳。

---

## 2. 当前结论

截至本轮 phase2-final 收口：
- typing **行为语义**已完成：仅 `runtimeState=running` 时发送，非 running 不发送，且具备节流与停止语义
- typing **REST 路径**已修正到当前已确认的官方真值：`POST /api/v4/users/{user_id}/typing`
- 当前 Mattermost 插件已具备 heartbeat/ack 最小必要补强，以及 `getConnectionHealth()` 形式的连接诊断摘要

因此，之前阻塞 phase2 收口的 typing 路径 gap 已关闭；当前文件只保留后续增强项。

---

## 3. 当前仍待增强的 gap

### G1. 状态诊断输出仍可继续增强
**现状**：
- 当前已有 `getConnectionHealth()`
- 但诊断面仍偏插件内部，尚未完整串到 daemon diagnose/status/TUI

**风险**：
- 长时间运行问题虽然比之前更容易排查，但还没有形成统一外显诊断面

**目标**：
- 在 daemon diagnose/status/TUI 中暴露 Mattermost 健康摘要
- 明确区分：
  - REST 可发
  - WS 已连
  - 订阅逻辑健康

**优先级**：P2

### G2. WS 健壮性测试仍可扩充
**现状**：
- 当前测试已覆盖暴露过的问题
- 但未形成独立、系统化的 resilience 集成测试组

**风险**：
- 后续若继续改心跳/重连逻辑，回归保护仍偏碎片化

**目标**：
- 视后续迭代需要，补充独立 `mattermost-ws-resilience` 测试组
- 覆盖：
  - heartbeat 超时后主动 close + reconnect
  - 旧连接状态清理
  - 诊断字段在断链/恢复前后的变化

**优先级**：P2

---

## 4. 已关闭 gap（不再作为当前阻塞项）

以下差距已完成并通过现有实现/测试收口，不再作为当前 gap list 的活跃项：

- WebSocket 健康判定过于乐观
- 缺少 REST/WS 双通道健康模型（当前迭代范围）
- 缺少 typing indicator 节流与停止语义
- typing REST 路径与官方 API reference 真值未对齐

---

## 5. 不属于 Mattermost 插件单独解决的内容

以下问题不能只在 `mattermost.ts` 内解决，需要 daemon / registry / dispatcher 配合：

1. **busy/idle 真值**
   - 真值在 SessionRegistry / daemon，不在 Mattermost 插件
   - Mattermost 只消费 `runtimeState` 结果

2. **typing 发送时机**
   - 插件只提供 `sendTyping?()` 能力
   - 是否发送、何时发送、何时停止，应由 daemon/dispatcher 依据 runtimeState 决定

3. **attach waiter 事件名统一**
   - 这是 IPC / attach 协议问题，不是 Mattermost 插件问题

---

## 6. 推荐后续顺序

建议按以下顺序做：

1. **先做 G1**
   - 把现有健康摘要接到 daemon / status / TUI 诊断面

2. **再做 G2**
   - 在继续演进 WS 健壮性前，补系统化 resilience 测试组

---

## 7. 维护规则

当以下任一内容发生变化时，应回看本文件是否仍准确：
- `src/plugins/im/mattermost.ts`
- `docs/SPEC.md` 的 Mattermost / typing / runtimeState 章节
- `docs/RESEARCH.mattermost-typing-semantics.md`
- `docs/TODO.md` 中 Mattermost 健壮性与 typing 待办

若某个 gap 已实现并有测试覆盖：
1. 在本文件中删除或降级为“已关闭 gap”
2. 不要把“已实现差距”长期留在活跃 gap 区制造噪音
