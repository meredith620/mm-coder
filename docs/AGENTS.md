# Agent 使用指南

## 验证 Claude Code 原生命令支持度

### 快速开始

```bash
# 运行验证脚本
./scripts/verify-native-commands.sh
```

### 预期输出示例

```
==========================================
Claude Code 原生命令支持度验证
==========================================
远程主机: 10.10.10.88

开始验证...

[1] Testing /cost ... PASS
    Output: Total cost:            $0.0000...
[2] Testing /context ... PASS
    Output: ## Context Usage...
...

==========================================
验证结果汇总
==========================================
总计: 16  通过: 16  失败: 0  跳过: 0

所有验证通过！
```

### 命令分类结果

| 类别 | 命令 | 状态 |
|------|------|------|
| **支持** | `/cost`, `/context` | ✅ 有直接输出 |
| **支持（交互式）** | `/batch`, `/loop`, `/review` | ✅ 有交互响应 |
| **支持（后台）** | `/init`, `/debug`, `/insights`, `/simplify`, `/claude-api` | ⚠️ 后台执行，无 stdout |
| **不支持** | `/help`, `/model`, `/effort`, `/skills`, `/plan`, `/status`, `/diff`, `/memory`, `/doctor`, `/recap`, `/btw` | ❌ Unknown skill |

### Agent Task 触发方式

Agent 可以通过以下方式触发验证：

1. **监听用户消息**: "验证 Claude Code 命令"
2. **执行脚本**: `bash scripts/verify-native-commands.sh`
3. **SSH 远程调用**: `ssh 10.10.10.88 "source ~/.nvm/nvm.sh && printf '/cost\n' | claude -p"`

### 注意事项

- 验证需要 SSH 访问 `10.10.10.88`
- 远程主机需要安装 Claude Code 并配置 nvm
- 部分命令（如 `/batch`, `/loop`）是交互式的，测试时需注意
- 后台执行的命令（如 `/init`, `/simplify`）无 stdout 输出
