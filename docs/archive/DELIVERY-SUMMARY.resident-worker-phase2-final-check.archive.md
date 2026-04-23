# mx-coder (Multi-modal Coder) phase2 剩余收口项与进入 phase3 前检查清单

> **文档生命周期**：这是 resident worker phase2 收口阶段的检查与交接文档。它只服务于“是否可以进入 phase3”这一判断窗口。  
> 当本文件中的剩余项被完成、归档或明确延后到 phase3 后，应将本文件归档，避免未来 agent 继续把它当作长期真值来源。

---

## 1. 目标

本文件回答两个问题：

1. 当前在进入 phase3 之前，phase2 还有哪些**未完成**的项？
2. 哪些是我可以直接收口的文档工作，哪些需要交给下游 Claude Code agent 做实现或继续修文档？

---

## 2. 结论总览

### 已完成到可收口的 phase2 工作
以下事项已基本完成或已转为归档状态：

1. resident worker 主模型
2. `status` / `runtimeState` 基线迁移
3. attach / takeover / approval / recovery 主链
4. remove 进程清理闭环
5. WebSocket heartbeat 最小必要补强
6. typing 的**行为语义**（running 时发送、非 running 不发送、节流与停止）
7. phase2 的历史问题文档已开始转为归档材料：
   - `docs/CURRENT-ISSUES.typing-and-remove.md`
   - `docs/REVIEW.phase2-and-current-issues.md`

### 当前仍未完成、不能直接算 phase2 全收口的项
我判断仍有 **2 类剩余项**：

#### A. 文档真值未完全统一
1. `docs/MATTERMOST-GAPS.md` 结构仍不干净
   - 已关闭项与旧未关闭项并存
   - 编号重复
   - 需要重写清理

2. `docs/REVIEW.phase2-and-current-state.md`、`docs/RESEARCH.mattermost-typing-semantics.md`、`docs/TODO.md`、`docs/SPEC.md` 虽然已更新，但还需要由下游 agent 做一次**最终一致性巡检**，防止残留双真值

#### B. 文档真值统一后的后续维护
本轮已完成：
- `docs/MATTERMOST-GAPS.md` 重写为单一真值结构
- `docs/RESEARCH.mattermost-typing-semantics.md`、`docs/REVIEW.phase2-and-current-state.md`、`docs/CURRENT-ISSUES.typing-and-remove.md`、`docs/TODO.md`、`docs/SPEC.md` 已统一到当前 typing 真值

因此进入 phase3 前剩余的不是 phase2 阻塞项，而是后续增强项维护。

---

## 3. 我已直接处理的收口动作

我已直接完成以下文档侧收口：

1. 已将以下指令文档做归档副本：
   - `docs/archive/AGENT-INSTRUCTIONS.phase1-current-fixes.archive.md`
   - `docs/archive/AGENT-INSTRUCTIONS.phase3-docs-and-channel-strategy.archive.md`

2. 当前仍保留原文件作为工作副本，避免用户或下游 agent 在本轮尚未确认前丢失上下文：
   - `docs/AGENT-INSTRUCTIONS.phase1-current-fixes.md`
   - `docs/AGENT-INSTRUCTIONS.phase3-docs-and-channel-strategy.md`

说明：
- 这两个文件的原目标已经基本达成
- 后续若用户确认不再使用，可再删除工作副本，仅保留 archive

---

## 4. 需要下游 agent 继续做的事

### 必做（进入 phase3 前建议先完成）

#### P2-Final-1：清理 `docs/MATTERMOST-GAPS.md`
目标：
- 重写结构，删除重复编号与已关闭/未关闭混杂状态
- 让其只保留当前仍未关闭的 gap

#### P2-Final-2：统一 typing 路径真值文档
目标：
- 把所有文档统一成当前一致表述：
  - typing 行为语义已完成
  - typing REST 路径已与官方真值对齐
- 不再把 `/users/me/typing` 写成官方已确认真值

**状态：本轮已完成**

#### P2-Final-3：修正 typing 路径实现到官方 REST 真值
目标：
- 当前已确认官方真值是 `/users/{user_id}/typing`
- 实现已完成修正，并已有测试覆盖

**状态：本轮已完成**

### 可延后到 phase3 的项
1. Mattermost 健康摘要接入 daemon diagnose/status/TUI
2. 更系统化的 `mattermost-ws-resilience` 集成测试
3. thread/channel 策略实现

这些不阻塞 phase2 收口，但会自然进入 phase3

---

## 5. 是否现在就应该进入 `docs/AGENT-INSTRUCTIONS.phase2-phase3-features.md`？

### 我的判断
**现在可以进入 `docs/AGENT-INSTRUCTIONS.phase2-phase3-features.md`。**

原因：
- 之前阻塞 phase2 的 typing REST 路径真值问题已完成实现与文档对齐
- `docs/MATTERMOST-GAPS.md` 已清理为单一真值结构
- 当前剩余事项均属于 phase3 或后续增强项

### 更合理的顺序
建议顺序是：

1. **phase2-final 已完成**
   - 文档清理
   - typing 路径真值对齐

2. **现在进入 `docs/AGENT-INSTRUCTIONS.phase2-phase3-features.md`**
   - CLI tab 补全
   - TUI
   - Mattermost thread/channel 策略

---

## 6. 对下一位 Claude Code agent 的入口建议

下一位 agent 现在可以直接进入 phase3 功能实现，执行入口为：

1. `docs/AGENT-INSTRUCTIONS.phase2-phase3-features.md`
2. `docs/IMPL-SLICES.phase3-future-features.md`

phase2-final 的资料保留为收口记录，不再作为主执行入口。

---

## 7. 进入 phase3 的判定标准

只有当以下条件都满足时，才建议正式进入 phase3：

- [x] `docs/MATTERMOST-GAPS.md` 已清理为单一真值结构
- [x] typing 路径真值已确认并同步到文档
- [x] typing endpoint 实现已修正并有测试覆盖
- [x] `docs/TODO.md` 中 phase2 残项只剩可延后增强项

以上条件现已满足，建议把主执行入口切换到：
- `docs/AGENT-INSTRUCTIONS.phase2-phase3-features.md`

---

## 8. 建议使用的下游 agent 指令文件

### 现在优先使用
- `docs/AGENT-INSTRUCTIONS.phase2-phase3-features.md`

### phase2-final 收口记录
- `docs/AGENT-INSTRUCTIONS.phase2-final-closure.md`

### 文档策略收口场景可参考
- `docs/AGENT-INSTRUCTIONS.phase3-docs-and-channel-strategy.md`（已基本完成，可视情况仅保留 archive）
