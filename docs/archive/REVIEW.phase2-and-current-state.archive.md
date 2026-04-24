# mx-coder (Multi-modal Coder) 最终 review、官方语义核对与后续实施指令

> **文档生命周期**：这是本轮最终收口文档。用于记录：1) 对当前修复实现的再 review；2) Mattermost typing 官方语义核对结论；3) Mattermost channel 绑定合理性讨论结果；4) 给下一位 Claude Code agent 的执行入口。  
> 当相关实现继续变化后，应更新本文件；若这些结论全部吸收到 SPEC / TODO / IMPL-SLICES 中并稳定，可将本文件转为归档材料。

---

## 1. 对当前修复实现的最终 review 结论

### 1.1 代码实现 review 结论
当前另一个 agent 对 phase2 review 问题的修复，**整体是成立的**，而且已经明显优于之前我写 `REVIEW.phase2-and-current-issues.md` 时的状态。

#### 已确认修复成立的点

1. **typing 主路径已接入且行为语义成立**
   - `src/plugins/im/mattermost.ts` 中 `sendTyping()` 当前调用：
     - `POST /api/v4/users/{user_id}/typing`
     - `user_id` 直接使用 `connect()` 阶段解析出的 bot user id
     - body 含 `channel_id`
     - thread 场景携带 `parent_id`
   - 对应单测已存在：
     - `tests/unit/mattermost-plugin.test.ts`

2. **typing 已接入主路径**
   - `src/im-message-dispatcher.ts` 已有 `_startTypingLoop()`
   - 只有 `runtimeState === 'running'` 时才持续发送 typing
   - `stopTyping()` 在本轮处理结束时被调用
   - 集成测试已存在：
     - `tests/integration/im-routing.test.ts`

3. **remove 已接入 worker terminate 闭环**
   - `src/daemon.ts` 的 remove handler 现在会：
     - 拒绝 `attached / attach_pending / takeover_pending`
     - 若存在 `imWorkerPid`，先 `await this._imWorkerManager?.terminate(name)`
     - 再 `registry.remove(name)`
   - 集成测试已存在：
     - remove idle+cold
     - remove idle+ready
     - remove attached 返回错误

4. **heartbeat ack 最小补强已到位**
   - `mattermost.ts` 已新增 `_lastHeartbeatSeq`
   - 现在只有 `seq_reply === _lastHeartbeatSeq` 才刷新 `lastHeartbeatAckAt`
   - 相关单测已存在

### 1.2 仍存在的 review 问题

#### 问题 A：typing REST 路径文档表述需要统一到当前已收口真值
本轮最终结论显示：
- 当前已拿到的官方 REST API reference 真值是 **`POST /api/v4/users/{user_id}/typing`**
- 当前实现已修正到该官方路径
- 当前仍未拿到 `/users/me/typing` 的官方文档证据

这意味着：
- 现有实现的 **typing 行为语义是成立的**
- 当前实现的 **REST 路径也已与官方真值对齐**
- 但文档中仍需继续避免把 `/users/me/typing` 写成“官方已确认正确”

#### 问题 B：`docs/MATTERMOST-GAPS.md` 需要清理为单一真值结构
当前文件本轮已重写整理为：
- 活跃 gap 仅保留当前仍待增强项
- 已关闭项集中降级到“已关闭 gap”区
- 不再保留重复编号与已关闭/未关闭并存的双真值

**结论：该问题本轮已完成收口。**

#### 问题 C：`docs/TODO.md` 与当前实现的完成状态仍需重新对齐
当前需要统一为：
- typing keepalive **行为语义**已完成
- typing REST **路径真值**已完成对齐
- typing 后续只剩“避免文档回退到 `/users/me/typing` 旧表述”的维护要求

**结论：该问题本轮可一并收口。**

---

## 2. Mattermost typing 官方语义核对结论

### 2.1 已能确认的官方事实

基于官方 API reference：
- `user_typing` 是 **客户端发送的 WebSocket action**
- 服务端对应事件是 **`typing`**
- `user_typing` 示例 data 中包含：
  - `channel_id`
  - `parent_id`
- 文档明确覆盖 channel / thread 场景

### 2.2 已确认的 REST typing endpoint 真值

基于官方 API reference 的 `mattermost-api-reference/v4/source/users.yaml`，当前可明确确认：
- **路径**：`POST /api/v4/users/{user_id}/typing`
- **body**：
  - `channel_id`（必填）
  - `parent_id`（可选）
- **语义**：发布一个 user typing websocket event

### 2.3 对当前实现路径 `/users/me/typing` 的判断

当前可以确认：
- 现有实现采用 `POST /api/v4/users/{user_id}/typing`
- 该实现的 body 语义与官方文档一致
- 当前**没有官方文档证据**证明 `/users/me/typing` 是正式 endpoint 或官方 alias

因此结论必须写成：
- 当前实现路径已与官方 REST 真值对齐
- `/users/{user_id}/typing` 是当前已确认的官方 REST 真值
- `/users/me/typing` 只能作为历史实现路径说明，不应再被写成官方真值

### 2.4 是否需要改成 WebSocket `user_typing`

**当前不建议直接改成 WebSocket 主路径。**

原因：
1. 现在已经拿到官方 REST 真值，不再需要把 WS 当作唯一官方可证实方案
2. resident worker + dispatcher 的 typing keepalive 已围绕 REST 方式稳定落地
3. 更直接的问题是“实现路径与官方 REST 真值不一致”，不是“必须切换到 WS”

### 2.5 推荐结论

- **被加强的结论**：官方已确认 `POST /api/v4/users/{user_id}/typing`
- **已完成的收口**：当前实现已修正到该官方 REST 真值
- **当前建议**：phase2 可不再因 typing 路径阻塞；WS `user_typing` 仍可保留为备选增强方案，而不是当前主修复方向

---

## 3. Mattermost channel 绑定 Claude session 的合理性讨论结论

### 3.1 当前已确认的产品前提

你已经确认以下产品约束：
- 默认模式：`thread`
- 支持持久配置切换默认策略
- CLI / TUI 支持单次 override
- 修改策略后仅影响未来新建 session
- 已存在 session 不迁移
- 当前仅对 Mattermost 生效
- 保留主 channel 作为索引入口
- channel 模式默认使用 **private channel**

这意味着：
- 我们讨论的已经不再是“用 channel 替代 thread”
- 而是“为 Mattermost 提供可配置的会话空间策略”

### 3.2 我对其合理性的结论

**我认为这是合理的，但只能作为 Mattermost 的可选高级模式，不适合作为默认主路径。**

#### thread 模式的优势
- 不会让 sidebar 膨胀
- 当前模型成熟，已有 `/open` / `/list` / `/status` 语义
- 更适合大量 session 共存的个人工作流

#### channel 模式的优势
- 更强隔离
- 对长期独立 session 更清晰
- channel 级通知和可见性更自然
- 如果未来要让某些 session 变成更长期、明确分区的工作空间，channel 更合适

#### channel 模式的代价
- 需要 `teamId`
- 需要 bot 有创建 private channel 权限
- 需要额外清理/归档策略
- 需要在 `/open`、自动建 session、status/TUI 展示里全面感知空间类型
- 多 session 时 sidebar 体验会变差

### 3.3 关于“channel 是否可以删除”的讨论

就 Mattermost 产品语义而言，我认为即使技术上存在删除接口，也**不应把“硬删除 channel”当作默认 session 清理动作**。

更合理的产品建议是：
- session remove / archive 默认优先考虑：
  - **archive / soft close / 解绑**
- 不建议默认硬删 channel

原因：
- channel 是比 thread 更重的会话空间资源
- 与 session 生命周期强绑定时，硬删除可能过于激进
- private channel 更像“工作空间”，archive 比 delete 更可预期

### 3.4 最终建议

我建议正式写入设计结论：
1. `thread` 保持默认
2. `channel` 是 Mattermost-only 的可选模式
3. `channel` 模式默认创建 **private channel**
4. 保留主 channel 作为索引入口
5. `/open` 在两种模式下都存在，但语义不同
6. channel 模式的清理优先考虑 archive/解绑语义，而不是默认硬删除

---

## 4. 需要同步修订的文档

下一位 agent 需要优先同步以下文档：

1. `docs/MATTERMOST-GAPS.md`
   - 重写，清掉重复编号与旧未关闭项残留
   - 重新打开 typing REST 路径差距

2. `docs/REVIEW.phase2-and-current-issues.md`
   - 改成归档/历史 review，或补顶部声明说明其已被后续修复覆盖

3. `docs/IMPL-SLICES.phase3-future-features.md`
   - 把 channel 策略部分进一步改成：
     - private channel 默认
     - 保留主 channel 索引入口
     - remove/archive 更倾向 archive 语义

4. `docs/SPEC.md`
   - 若决定正式确认“channel 默认 private + 保留主 channel 入口 + 清理优先 archive”，应写入规格
   - typing REST 真值需改写为 `/users/{user_id}/typing`

5. `docs/TODO.md`
   - 把 typing 从“仅剩已完成项”调整为“实现路径待与官方 REST 真值对齐”

---

## 5. 给下一位 Claude Code agent 的实施指令

下一位 agent 的工作目标是：

### 文档修正
1. 清理 `docs/MATTERMOST-GAPS.md`
2. 更新 `docs/REVIEW.phase2-and-current-issues.md` 的生命周期说明
3. 更新 `docs/IMPL-SLICES.phase3-future-features.md`
4. 必要时更新 `docs/SPEC.md`
5. 更新 `docs/TODO.md`

### channel 策略设计增强
明确落入文档的产品真值：
- `thread` 默认
- `channel` 可选
- `channel` 默认 private
- 保留主 channel 作为索引入口
- 只影响未来新建 session
- 已有 session 不迁移
- 当前仅对 Mattermost 生效
- channel 模式清理优先 archive/解绑，而非默认硬删除

### typing 语义
- 不要再把当前 REST `/users/me/typing` 写成官方已确认真值
- 当前官方已确认的 REST endpoint 是 `POST /api/v4/users/{user_id}/typing`
- 后续实现优先重新打开 typing REST 路径修正
- 若要探索 WS typing，必须开新 spike 文档，不能直接改主路径

---

## 6. Sources

- Mattermost WebSocket API reference（`user_typing` action / `typing` event）：官方 API reference 仓库 `introduction.yaml`
- Mattermost REST API reference（`POST /api/v4/users/{user_id}/typing`）：官方 API reference 仓库 `users.yaml`
- Mattermost developer API docs 入口：developers.mattermost.com
- 当前实现与测试：本仓库 `src/plugins/im/mattermost.ts`、`tests/unit/mattermost-plugin.test.ts`、`tests/integration/im-routing.test.ts`
