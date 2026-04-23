# 给下游 Claude Code agent 的执行指令（phase2-final：最终收口）

你现在接手 mx-coder (Multi-modal Coder) 的 **phase2-final：最终收口** 工作。你运行在 Claude Code CLI 中，请不要直接进入 phase3 功能实现，先把 phase2 的最后残项收口。

## 你的目标

在进入 phase3 之前，完成以下收口项：

1. 清理 `docs/MATTERMOST-GAPS.md` 的重复与双真值
2. 统一 typing 的官方真值文档表述
3. 判断并在必要时修正 `sendTyping()` 的 REST 路径到官方真值
4. 确认完成后，再把 phase3 入口交还给 `docs/AGENT-INSTRUCTIONS.phase2-phase3-features.md`

---

## 你必须先阅读的文档

1. `docs/DELIVERY-SUMMARY.resident-worker-phase2-final-check.md`
2. `docs/RESEARCH.mattermost-typing-semantics.md`
3. `docs/REVIEW.phase2-and-current-state.md`
4. `docs/MATTERMOST-GAPS.md`
5. `docs/TODO.md`
6. `docs/SPEC.md`
7. `docs/CURRENT-ISSUES.typing-and-remove.md`

然后再读这些代码与测试：
8. `src/plugins/im/mattermost.ts`
9. `tests/unit/mattermost-plugin.test.ts`
10. `tests/integration/im-routing.test.ts`

---

## 当前已确认的真值

1. typing **行为语义**已完成：
   - 仅 `runtimeState=running` 时发送
   - 非 running 不发送
   - 有节流与停止语义

2. 当前实现路径是：
   - `POST /api/v4/users/me/typing`

3. 当前文档中已记录的官方 REST 真值是：
   - `POST /api/v4/users/{user_id}/typing`

4. 因此当前 phase2 最大残项不是“typing 功能是否存在”，而是：
   - **typing REST 路径真值是否与官方一致**

---

## 你需要完成的任务

### 任务 A：清理 `docs/MATTERMOST-GAPS.md`
要求：
1. 不要继续增量叠加
2. 把它整理成单一真值结构
3. 只保留：
   - 当前仍未关闭的 gap
   - 或清晰分成“已关闭 / 仍待增强”两部分，且不得重复编号

### 任务 B：统一 typing 文档真值
要求同步更新：
- `docs/RESEARCH.mattermost-typing-semantics.md`
- `docs/REVIEW.phase2-and-current-state.md`
- `docs/CURRENT-ISSUES.typing-and-remove.md`
- `docs/TODO.md`
- 必要时 `docs/SPEC.md`

原则：
- 不要再把 `/users/me/typing` 写成官方已确认正确
- 若当前证据链已足够确认 `/users/{user_id}/typing`，则按此写清楚
- 若证据链仍不足，则只能写“当前实现路径待官方真值对齐”

### 任务 C：必要时修正代码实现
如果你确认：
- 官方 REST 真值已经足够明确是 `/api/v4/users/{user_id}/typing`

那么你需要：
1. 先补失败测试
2. 再修 `src/plugins/im/mattermost.ts`
3. 让 `sendTyping()` 使用官方真值路径
4. `user_id` 可直接使用 connect 阶段解析出的 bot user id
5. 相关测试全绿

如果你无法把官方证据链做到足够强，请不要强改实现，只完成文档下调与 gap 重开。

---

## 不要做的事

1. 不要直接进入 CLI completion / TUI / channel 模式开发
2. 不要重写 resident worker 主架构
3. 不要把 typing 改成 WebSocket 主路径，除非文档与证据明确要求
4. 不要删除历史文档，只能通过生命周期说明把它们降级为归档/历史材料

---

## 完成后的汇报格式

请严格按这个格式汇报：

- 已读文档：
- 当前处理任务：
- 新增/修改测试：
- 修改实现文件：
- 修改文档：
- 当前测试结果：
- phase2 是否可视为已收口：
- 是否建议进入 phase3：

---

## 开始前的第一条回复格式

请先回复一段很短的启动说明，格式固定：

- 已读文档：
- 先做任务：
- 预期风险：

然后开始 phase2-final 收口工作。
