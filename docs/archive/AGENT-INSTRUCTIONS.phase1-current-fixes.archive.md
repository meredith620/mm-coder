# 给下游 Claude Code agent 的执行指令（阶段 1：当前问题修复）

你现在接手 mx-coder (Multi-modal Coder) 的**阶段 1：当前问题修复**工作。你运行在 Claude Code CLI 中，请严格遵循现有设计与文档，不要重新发散架构。

## 你的目标

修复当前已经明确暴露的现实问题，并保证修复方式与 resident worker 主设计一致：

1. Mattermost **typing indicator 不生效**
2. `mx-coder remove <name>` 后 **Claude worker 进程残留**
3. 如有必要，对 Mattermost **WebSocket keepalive** 做最小必要补强

## 你必须先阅读的文档（按顺序）

1. `docs/REVIEW.phase2-and-current-issues.md`
2. `docs/CURRENT-ISSUES.typing-and-remove.md`
3. `docs/MATTERMOST-GAPS.md`
4. `docs/TODO.md`
5. `docs/SPEC.md`
6. `docs/STATE-INVARIANTS.md`
7. `docs/EVENT-SEMANTICS.md`
8. `docs/IMPL-SLICES.resident-worker-tdd.md`

然后再读这些代码：

9. `src/plugins/im/mattermost.ts`
10. `src/daemon.ts`
11. `src/im-message-dispatcher.ts`
12. `src/im-worker-manager.ts`
13. `src/session-registry.ts`
14. `src/attach.ts`

## 强约束

1. 必须走 **TDD**：先写失败测试，再写最小实现，再跑测试
2. 不要顺手做无关重构
3. 不要重写 resident worker 主架构
4. 不要引入第二套状态语义
5. 不要把 typing 作为 Claude 原生状态；它只能是 `runtimeState=running` 的派生行为
6. 不要把 remove 做成“删 registry 但不清 OS 进程”
7. 如果你触碰 attach waiter 协议，必须先 grep：
   - `attach_ready`
   - `session_resume`
   确认没有双真值残留

---

## 问题 A：typing indicator 不生效

### 已知设计真值
- typing 必须调用 **Mattermost 正确接口**
- typing 不是发 post
- typing 仅在 `runtimeState=running` 时按节流发送
- 以下状态不得发送 typing：
  - `waiting_approval`
  - `ready`
  - `cold`
  - `recovering`
  - `attached_terminal`
  - `takeover_pending`

### 你必须做的事
1. 先补 `tests/unit/mattermost-plugin.test.ts`
   - 证明当前 `sendTyping()` 调错接口
2. 修正 `src/plugins/im/mattermost.ts`
   - 让 `sendTyping()` 调用正确的 Mattermost typing API
3. grep 全代码库里的 `sendTyping(` 调用点
4. 若主路径尚未接入：
   - 在合适层（优先 dispatcher / reply lifecycle）接入 typing keepalive
5. 增加节流与停止条件测试

### 验收标准
- 单测证明 `sendTyping()` 走正确 API
- 行为测试证明只有 `runtimeState=running` 时才发 typing
- 状态切出 `running` 后停止续发

---

## 问题 B：remove 后 worker 残留

### 已知设计真值
- remove 不能只删 registry
- 若 session 有 IM worker，remove 前必须先 terminate worker
- attached session 的 remove 策略必须明确
- 当前推荐默认策略：**拒绝 remove attached session**，而不是静默删除

### 你必须做的事
1. 先补 `tests/integration/daemon-commands.test.ts`
   - remove idle + cold session
   - remove idle + ready(with worker pid) session → worker 被 terminate
   - remove attached session → 返回明确错误（按推荐策略）
2. 修正 `src/daemon.ts`
   - remove 前检查 session 状态
   - 若有 IM worker：先 terminate
   - 再 remove registry
3. 如需要，补日志/诊断输出

### 验收标准
- remove 后对应 Claude worker 进程消失
- attached session 不会被静默 remove 掉
- 相关集成测试全绿

---

## 问题 C：keepalive 最小补强（仅在必要时做）

### 何时做
如果你在修 typing / remove 时发现：
- heartbeat ack 判定很脆弱
- WS open 仍被过度信任
- 半断链仍可能逃逸

那就在本阶段做最小补强；否则不要顺手做大改。

### 允许的补强范围
- heartbeat seq / ack 关联加强
- 更明确的活性窗口判断
- 旧连接状态清理
- `mattermost-ws-resilience` 测试补充

### 不允许的范围
- 不要把整个 Mattermost 插件重写成另一套重连框架
- 不要大幅更改外层架构

---

## 建议执行顺序

按下面顺序执行：
1. typing 修复
2. remove 修复
3. keepalive 补强（若必要）

不要并行推进多个问题。

---

## 每完成一个问题后的汇报格式

请严格按这个格式汇报：

- 已读文档：
- 当前修复问题：
- 新增/修改测试：
- 修改实现文件：
- 当前测试结果：
- 是否需要更新文档：
- 下一步计划：

---

## 开始前的第一条回复格式

请先回复一段很短的启动说明，格式固定：

- 已读文档：
- 先修问题：
- 预期风险：

然后立刻开始 TDD 实施。
