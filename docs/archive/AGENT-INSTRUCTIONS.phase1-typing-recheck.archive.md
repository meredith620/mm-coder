# 给下游 Claude Code agent 的执行指令（阶段 1：typing 官方语义再核实与文档修正）

你现在接手 mm-coder (Multi-modal Coder) 的**阶段 1：typing 官方语义再核实与文档修正**工作。你运行在 Claude Code CLI 中，请严格遵循现有设计，不要直接修改业务实现代码，除非在文档与证据核实后被明确要求。

## 你的目标

完成 3 件事：

1. **继续核实 Mattermost typing 的官方正确接口**
2. **把目前文档里关于 typing 的“已完全收口”表述下调到证据一致的程度**
3. **如果确认需要，把后续实现计划改成“重新打开 typing 路径核实/修正”**

---

## 你必须先阅读的文档

1. `docs/RESEARCH.mattermost-typing-semantics.md`
2. `docs/REVIEW.phase2-and-current-state.md`
3. `docs/CURRENT-ISSUES.typing-and-remove.md`
4. `docs/MATTERMOST-GAPS.md`
5. `docs/SPEC.md`
6. `docs/TODO.md`
7. `docs/EVENT-SEMANTICS.md`
8. `docs/AGENT-INSTRUCTIONS.phase3-docs-and-channel-strategy.md`

然后再读这些代码：
9. `src/plugins/im/mattermost.ts`
10. `tests/unit/mattermost-plugin.test.ts`
11. `tests/integration/im-routing.test.ts`

---

## 已知真值（请不要擅自推翻）

### 已能确认的官方真值
- Mattermost WebSocket `user_typing` 是**客户端 action**
- 服务端对应事件是 `typing`
- `user_typing` 的 `data` 支持：
  - `channel_id`
  - `parent_id`

### 当前不确定的点
- `/api/v4/users/me/typing` 是否是官方正式 REST endpoint
- `/api/v4/users/{user_id}/typing` 是否才是真实 REST endpoint

因此当前不能再把 REST `/users/me/typing` 写成“已被官方文档确认正确”。

---

## 你需要完成的任务

### 任务 A：继续搜官方证据
要求：
1. 优先找 **官方文档或官方源码中的明确证据**
2. 如果能确认 REST endpoint 真值：
   - 明确写出路径
   - 写出方法
   - 写出 body 字段
3. 如果依然确认不了：
   - 就明确写成“REST 路径官方证据不足”
   - 保留 WebSocket `user_typing` 作为当前唯一可被官方明确确认的 typing 方式

### 任务 B：修正文档措辞
要求更新：
- `docs/RESEARCH.mattermost-typing-semantics.md`
- `docs/REVIEW.phase2-and-current-state.md`
- `docs/CURRENT-ISSUES.typing-and-remove.md`
- `docs/MATTERMOST-GAPS.md`
- `docs/TODO.md`

原则：
- 不要再写“typing 已彻底由官方确认正确”
- 若官方证据不足，只能写“当前实现成立，但官方 REST endpoint 真值待再确认”

### 任务 C：如有必要，改下游实施计划
如果最终仍无法确认 REST endpoint 真值，则应把后续实施建议改成：
1. 优先继续核实官方 REST endpoint
2. 若无法核实，则评估切换到官方明确可证实的 WebSocket `user_typing` action

---

## 不要做的事

1. 不要直接把 typing 主路径改成 WebSocket
2. 不要在没有官方证据的情况下宣称 `/users/me/typing` 一定正确
3. 不要删除历史文档，只能修正生命周期说明和当前真值定位

---

## 输出要求

完成后请汇报：
- 已读文档：
- 找到的官方证据：
- 哪些结论被加强：
- 哪些结论被下调：
- 更新了哪些文档：
- 是否建议后续实现改走 WebSocket：

---

## 开始前的第一条回复格式

请先回复一段很短的启动说明，格式固定：

- 已读文档：
- 先做任务：
- 预期风险：

然后开始调研与文档修正。
