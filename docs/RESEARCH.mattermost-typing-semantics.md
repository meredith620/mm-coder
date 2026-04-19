# mm-coder (Multi-modal Coder) Mattermost typing 官方语义核对

> **文档生命周期**：这是针对 Mattermost typing 用法的官方语义核对文档。它的作用是为 reviewer 与后续 AI agent 提供“当前实现是否符合官方语义”的判断依据。  
> 当 Mattermost 官方文档、客户端实践、或 mm-coder 的 typing 实现发生变化时，应更新本文件；如果后续 typing 实现从一个 REST 路径切换到另一个官方已确认路径，也应在这里记录迁移理由与证据。

---

## 1. 调研目标

需要核实：
1. Mattermost typing 的官方正确用法是什么
2. `POST /users/me/typing` 是否存在并可用
3. `POST /users/{user_id}/typing` 是否才是真实 REST endpoint
4. WebSocket `user_typing` 是客户端 action 还是服务端事件
5. 当前 mm-coder 实现是否需要从当前 REST 路径修正到官方 REST 真值，或改为 WebSocket action

---

## 2. 当前 mm-coder 实现

当前实现（`src/plugins/im/mattermost.ts`）：
- `sendTyping()` 调用 `POST /api/v4/users/{user_id}/typing`
- 其中 `user_id` 使用 `connect()` 阶段解析出的 bot user id
- body 包含：
  - `channel_id`
  - thread 场景下的 `parent_id`

这是当前代码实现真值，但**不等于官方文档已确认其路径正确**。

---

## 3. 官方资料核对结论

### 3.1 WebSocket 文档层面
基于 Mattermost 官方 API reference 的 WebSocket 说明（`mattermost-api-reference/v4/source/introduction.yaml`）：
- `user_typing` 是 **客户端发起的 WebSocket action**
- 服务端对应的事件名是 **`typing`**，不是 `user_typing`
- `user_typing` 示例里的 `data` 包含：
  - `channel_id`
  - `parent_id`
- 文档明确说明该 action 用于 channel 或 thread 场景

这部分官方证据是明确成立的。

### 3.2 REST 文档层面（现已拿到官方证据）
基于 Mattermost 官方 API reference 的 `mattermost-api-reference/v4/source/users.yaml`，当前已能确认正式 REST endpoint 为：

- **路径**：`POST /api/v4/users/{user_id}/typing`
- **summary**：`Publish a user typing websocket event.`
- **description**：`Notify users in the given channel via websocket that the given user is typing.`
- **Minimum server version**：`5.26`
- **path 参数**：
  - `user_id`（必填）
- **body 字段**：
  - `channel_id`（必填）
  - `parent_id`（可选）
- **权限说明**：
  - 对“任意非本人 user”发布 typing 需要 `manage_system`
  - 这也意味着“本人 typing”仍走同一条 `{user_id}` 路径，而不是文档中另列一条 `/users/me/typing`

### 3.3 对 `/users/me/typing` 的判断
截至本轮核对：
- **已找到官方文档证据**支持 `POST /api/v4/users/{user_id}/typing`
- **尚未找到官方文档证据**支持 `POST /api/v4/users/me/typing`

因此当前结论应写成：
- 当前实现已修正为使用 `/users/{user_id}/typing`
- `/users/{user_id}/typing` 是当前已拿到官方文档证据支持的 REST 真值
- `/users/me/typing` 是否只是服务端兼容 alias，本轮**没有官方证据**

---

## 4. 对当前实现的判断

### 结论
当前结论已经不是“REST 真值未知”，而是：

1. **官方已确认的 REST typing endpoint 是 `POST /api/v4/users/{user_id}/typing`**
2. 当前 mm-coder 实现已修正到 `POST /api/v4/users/{user_id}/typing`，**与当前已确认的官方路径一致**
3. 当前实现的 body 语义（`channel_id` + thread 场景 `parent_id`）与官方文档一致
4. 因此本轮重点已从“路径待修正”转为“保留 `/users/me/typing` 为未证实 alias 的历史说明，避免文档回退到旧真值”

### 对 WebSocket 方案的判断
当前**不建议因为这次核对就直接改成 WebSocket `user_typing` 主路径**。

原因：
1. 现在已经拿到官方 REST 真值，不再需要靠 WS 作为唯一官方可证实路径兜底
2. 当前实现与 dispatcher 节流/停止语义已围绕 REST 方式落地
3. 更合理的顺序是先把 REST 路径修正到官方真值，再评估是否有必要改成 WS action

---

## 5. 推荐后续动作

### 当前不建议做的事
- 不建议在没有额外收益论证前，直接把 typing 从 REST 改成 WebSocket
- 不建议继续把 `/users/me/typing` 写成“官方已确认正确接口”

### 当前建议做的事
1. 在文档中明确：
   - WebSocket `user_typing` 是官方 action，服务端事件是 `typing`
   - 官方已确认的 REST endpoint 是 `POST /api/v4/users/{user_id}/typing`
   - 当前实现已与该官方 REST 真值对齐
   - `/users/me/typing` 仍不得写成官方已确认正确接口
2. 后续若继续演进：
   - 默认保持使用 `connect()` 阶段解析出的 bot `userId`
   - 仅当拿到官方 alias 证据时，才可单独讨论 `/users/me/typing` 的兼容价值

---

## 6. 给后续 AI agent 的实施建议

后续 agent 若触碰 typing 逻辑：
- 不要再把 `/users/me/typing` 作为官方真值写入文档
- 默认保持使用官方已确认的 `POST /api/v4/users/{user_id}/typing`
- 若要重新讨论 `/users/me/typing`，必须先补到**官方 alias 证据**，否则只能把它视为历史实现路径，而非官方真值
- 仅当 REST 方案被证明不可行或存在明确产品收益时，才单独评估 WS `user_typing` 方案

---

## 7. Sources（供人工核对）

- Mattermost 官方 API reference：`mattermost-api-reference/v4/source/introduction.yaml`
- Mattermost 官方 API reference：`mattermost-api-reference/v4/source/users.yaml`
- 当前实现：`src/plugins/im/mattermost.ts`
- 当前测试：`tests/unit/mattermost-plugin.test.ts`、`tests/integration/im-routing.test.ts`
