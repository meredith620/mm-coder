# mm-coder (Multi-modal Coder) Phase2 实现复核与后续执行指令

> **文档生命周期**：这是针对“phase2 实现交付”的**历史 review / 归档材料**。它的作用是保留当时 review 过程中观察到的问题与判断，供追溯上下文使用。  
> **重要说明**：本文件中的部分负面结论已经被后续修复覆盖，另有部分 typing 结论也已被更新后的官方语义核对结果修正。因此，**不要再把本文件当作当前实现真值**。  
> 当前真值应优先以以下文档为准：
> - `docs/REVIEW.phase2-and-current-state.md`
> - `docs/SPEC.md`
> - `docs/TODO.md`
> - `docs/IMPL-SLICES.phase3-future-features.md`

---

## 1. 输入材料

本次 review 基于以下材料：
- `docs/DELIVERY-SUMMARY.resident-worker-phase2.md`
- 当前未提交源码（尤其是 resident worker、attach、Mattermost、状态模型相关文件）
- `mm-keepalive.md`
- `mm-typing.md`
- 现有设计文档：`docs/SPEC.md`、`docs/STATE-INVARIANTS.md`、`docs/EVENT-SEMANTICS.md`、`docs/IMPL-SLICES.resident-worker-tdd.md`

---

## 2. 总体 review 结论

### 2.1 正面结论

当前 phase2 未提交实现，**总体方向是正确的**，而且与既定设计高度一致，主要体现在：

1. **resident worker 主模型已真正落地到主路径**
   - `IMMessageDispatcher` 已不再按单条消息 spawn Claude
   - `IMWorkerManager` 承担常驻进程生命周期管理
   - dispatcher 负责 per-session FIFO 串行调度

2. **`result` 作为消息完成边界已进入实现主链**
   - `im-message-dispatcher.ts` 中 active turn 的完成依赖 `result`/`error`
   - 这符合常驻 worker 设计真值

3. **`status` / `runtimeState` 解耦已经开始成型**
   - `session-registry.ts` 已出现 `cold/ready/running/waiting_approval/...` 语义
   - 重启恢复、attach 切换、idle+worker-ready 的语义开始被编码

4. **attach waiter 事件名已在实现中统一到 `session_resume`**
   - 这与 summary 一致
   - 相比之前 `attach_ready/session_resume` 双真值风险，方向是正确的

5. **Mattermost 插件已补入 WS 活性字段与 heartbeat 骨架**
   - `lastWsOpenAt`
   - `lastWsMessageAt`
   - `lastHeartbeatSentAt`
   - `lastHeartbeatAckAt`
   - `getConnectionHealth()`
   说明 phase2 已经在朝正确的自愈方向推进

### 2.2 关于本文件负面结论的时效性说明

本文件后续章节中的一些问题判断，已经出现以下时效变化：

- `remove <name>` 未终止 worker 的问题，后续实现已补上闭环并有测试覆盖
- typing keepalive 是否接入主路径，当时尚未确认；后续实现已接入并有测试覆盖
- typing REST 路径判断，当时基于较弱证据；后续官方语义核对已拿到更强证据，应以新文档为准

因此下面内容应被理解为：
- **当时 review 时点的观察记录**
- 不是当前分支的最终判断

---

## 3. 历史关键问题 review（仅保留追溯价值）

### P1. Mattermost `sendTyping()` 实现大概率不对

#### 现状
当前 `src/plugins/im/mattermost.ts` 中：
- 已实现 `sendTyping(target)`
- 但实现是：`POST /api/v4/posts`，body 里传 `props: { typing: true }`

#### 问题
这与 Mattermost 的 typing 机制不一致。
根据 `mm-typing.md` 的分析，Mattermost 前端显示 “xxx is typing” 依赖的是：
- **`POST /users/me/typing`**
- payload 应为 `channel_id`，可选 `parent_id`

也就是说：
- 当前实现虽然“有了 sendTyping 方法”，但它**不是**调用正确接口
- 因此出现“Claude 正常回复，但 Mattermost 没有 typing 提示”是高度可解释的

#### 结论
- 这是一个**明确 bug**，不是体验差异
- 应优先修正为调用正确的 Mattermost typing API

#### 当前状态补注
这部分问题已被后续实现修复；但关于 REST 路径真值，当前应以 `docs/RESEARCH.mattermost-typing-semantics.md` 与 `docs/REVIEW.phase2-and-current-state.md` 的更新结论为准，而不是以本节中的旧判断为准。

---

### P2. typing 发送时机尚未确认已真正接入主路径

#### 现状
当前代码里：
- `mattermost.ts` 已有 `sendTyping()`
- 但从 grep 结果看，暂未看到明确的 daemon / dispatcher 主路径调用点把 typing 与 `runtimeState=running` 绑定

#### 风险
这意味着存在两种可能：
1. 只有插件能力，没人调用
2. 调用逻辑散落在别处，但不够显式

无论哪种，都不算收口。

#### 结论
phase2 summary 中说“已增加 sendTyping 能力基线”，这个描述成立；
但“typing 功能已经按设计可工作”这个更强表述，目前**不能确认成立**。

#### 当前状态补注
该问题已被后续实现与测试覆盖修复；当前不应再把本节视为现状判断。

---

### P3. `remove <name>` 当前没有终止托管 Claude worker 的实现闭环

#### 现状
当前 `src/daemon.ts` 的 remove handler：
- 只做 ACL 检查
- 直接 `this.registry.remove(name)`
- **没有**调用 `this._imWorkerManager?.terminate(name)`

而当前 `SessionRegistry.remove(name)`：
- 只删 registry 内存结构
- 不负责操作系统进程回收

#### 直接后果
你给出的例子完全符合这个实现：
- `mm-coder remove demo10`
- registry/list 中已消失
- 但 `claude -p --resume ...` 常驻 worker 进程仍继续活着

#### 结论
这是一个**明确资源泄漏 / 控制面-进程面不一致 bug**。

#### 当前状态补注
该问题已被后续修复覆盖；当前 remove 真值应以 `docs/REVIEW.phase2-and-current-state.md`、`docs/CURRENT-ISSUES.typing-and-remove.md` 与对应测试为准。

---

### P4. WebSocket keepalive 方案已有明显进步，但还不算“完全完备”

#### 当前 phase2 已做的改进
相较原版，phase2 的 Mattermost 插件已经具备：
- heartbeat timer
- 超时窗口
- `lastWsMessageAt` / `lastHeartbeatAckAt`
- 超时后主动 `_forceReconnect()`
- `getConnectionHealth()` 诊断摘要

这比原始版本强很多，也已经覆盖了你担心的核心方向：
- 不再只信任底层 TCP / WS open

#### 结论
- 当前 phase2 的 keepalive 方案：**方向正确，基础可用，已经能覆盖你最担心的半断链问题的主要部分**
- 但如果问“是否完备”，我的回答是：**还不算完全完备**
- 建议后续做一轮增强，而不是推倒重来

#### 当前状态补注
当前 WS 健壮性相关真值应以 `docs/MATTERMOST-GAPS.md`、`docs/SPEC.md` 与对应测试覆盖为准。

---

## 4. 对 delivery summary 的历史 review

`docs/DELIVERY-SUMMARY.resident-worker-phase2.md` 在当时总体上是**可信的，但有两处表述偏乐观**：

### 4.1 关于 typing
summary 当时说：
- “已增加 sendTyping 能力基线”

这句话在当时没错；
但如果读者理解成“typing 已按预期工作”，那就偏乐观了。

### 4.2 关于 Mattermost 健壮性
summary 当时说：
- “已补 heartbeat 检测与超时后主动 close + reconnect”

这句话在当时也没错；
但如果读者理解成“keepalive 已完备”，那也偏乐观。

### 当前状态补注
上述 review 仅保留历史价值。当前实现的收口程度，应查看更新后的 `docs/REVIEW.phase2-and-current-state.md`。

---

## 5. 历史优先级建议（仅供追溯）

### 第一优先级（直接 bug）
1. **修正 Mattermost typing API 调用路径**
2. **修正 remove 不终止 Claude worker 的资源泄漏问题**

### 第二优先级（可靠性加强）
3. **增强 WebSocket heartbeat ack 对应关系**
4. **补 WS resilience 集成测试**

---

## 6. 使用规则

若后续 agent 读到本文件：
1. 可以把它当作历史上下文与修复动机来源
2. 不要把它当作当前代码或当前文档真值
3. 做设计或实施决策前，应先回看：
   - `docs/REVIEW.phase2-and-current-state.md`
   - `docs/SPEC.md`
   - `docs/TODO.md`
   - `docs/IMPL-SLICES.phase3-future-features.md`
