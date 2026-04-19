# 给下游 Claude Code agent 的执行指令（阶段 3：文档收口与 Mattermost channel 策略）

你现在接手 mm-coder (Multi-modal Coder) 的**阶段 3：文档收口与 Mattermost channel 策略设计增强**工作。你运行在 Claude Code CLI 中，请严格遵循现有设计，不要重新发散架构。

## 你的目标

你要完成 3 件事：

1. **清理当前文档双真值与过时内容**
2. **确认并补强 Mattermost channel 作为 session 空间策略的设计结论**
3. **把修改后的结论同步回相关文档，供后续实现 agent 使用**

---

## 你必须先阅读的文档（按顺序）

1. `docs/REVIEW.phase2-and-current-state.md`
2. `docs/RESEARCH.mattermost-typing-semantics.md`
3. `docs/MATTERMOST-GAPS.md`
4. `docs/CURRENT-ISSUES.typing-and-remove.md`
5. `docs/IMPL-SLICES.phase3-future-features.md`
6. `docs/SPEC.md`
7. `docs/TODO.md`
8. `docs/STATE-INVARIANTS.md`
9. `docs/EVENT-SEMANTICS.md`

然后再读这些代码（只用于理解，不要求改实现）：
10. `src/plugins/im/mattermost.ts`
11. `src/daemon.ts`
12. `src/im-message-dispatcher.ts`
13. `tests/unit/mattermost-plugin.test.ts`
14. `tests/integration/daemon-commands.test.ts`

---

## 已确认的设计真值（不要推翻）

### typing 相关
1. `sendTyping()` 当前实现走 REST `/api/v4/users/me/typing`
2. 这是当前阶段保留的主路径
3. 虽然官方 WebSocket 文档里存在 `user_typing` action，但**当前不改成 WS 方案**
4. typing 仍是 `runtimeState=running` 的派生行为，而不是 Claude 原生状态

### Mattermost session 空间策略相关
1. 默认 `spaceStrategy=thread`
2. `channel` 只是 Mattermost 的可选模式
3. 全局默认值来自持久配置
4. CLI / TUI 可做单次 override
5. override 只影响本次创建，不回写配置
6. 修改默认策略后，只影响未来新建 session
7. 已存在 session 不迁移
8. 所有新 session 创建入口都要受策略控制：
   - CLI 创建
   - TUI 创建
   - IM `/open`
   - IM 普通文本自动建 session
9. channel 模式默认使用 **private channel**
10. 保留主 channel 作为索引入口
11. channel 模式下 remove/archive 默认优先考虑 **archive/解绑语义**，不建议默认硬删除 channel
12. 当前 `spaceStrategy` 仅对 Mattermost 生效

---

## 你需要完成的任务

### 任务 A：清理 `docs/MATTERMOST-GAPS.md`
当前文件存在明显问题：
- 已关闭项与旧未关闭项并存
- 编号重复
- 语义容易让后续 agent 误判当前 gap 状态

要求：
1. 重写/清理它，不要继续叠加
2. 让文档只保留：
   - 当前仍未关闭的 gap
   - 或明确分成“已关闭 / 仍待增强”两部分，但不得重复编号
3. 不要再保留已经被实现且已测试覆盖的旧 gap 内容作为“未关闭问题”

### 任务 B：处理过时 review 文档
`docs/REVIEW.phase2-and-current-issues.md` 已经过时。
要求：
1. 不要删除，但要把它明确改为“历史 review / 已被后续修复覆盖”
2. 避免后续 agent 把它当成当前真值
3. 当前真值应由：
   - `docs/REVIEW.phase2-and-current-state.md`
   - `docs/SPEC.md`
   - `docs/TODO.md`
   - `docs/IMPL-SLICES.phase3-future-features.md`
   来承担

### 任务 C：补强 Mattermost channel 策略文档
要求把以下结论明确同步进文档：
1. channel 模式不是替代 thread，而是 Mattermost 的可选 `spaceStrategy`
2. channel 默认应创建 **private channel**
3. 主 channel 作为统一索引入口保留
4. remove/archive 在 channel 模式下默认应优先 archive/解绑，而不是硬删 channel
5. `/status`、IM `/status`、TUI 未来都必须展示：
   - 当前默认 `spaceStrategy`
   - 当前 session 实际绑定空间类型

重点同步到：
- `docs/IMPL-SLICES.phase3-future-features.md`
- `docs/SPEC.md`
- `docs/TODO.md`
- 如有必要，`README.md`

---

## 不要做的事

1. 不要直接修改业务代码实现
2. 不要把 typing 主路径从 REST 改为 WebSocket
3. 不要把 channel 模式写成默认值
4. 不要把 channel 模式写成“立即替代 thread”
5. 不要删历史文档，而是加清晰生命周期说明

---

## 输出要求

你完成后请汇报：

- 已读文档：
- 更新了哪些文档：
- 修正了哪些双真值/过时表述：
- 对 Mattermost channel 策略新增了哪些明确约束：
- 是否还存在需要用户确认的设计问题：

---

## 开始前的第一条回复格式

请先回复一段很短的启动说明，格式固定：

- 已读文档：
- 先做任务：
- 预期风险：

然后开始文档收口工作。
