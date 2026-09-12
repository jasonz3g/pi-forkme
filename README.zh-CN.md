# pi-forkme

**在 Pi 内输入 `/forkme`，将当前会话分叉到新终端，原会话保持不变。**

[English](README.md) · [MIT 协议](LICENSE)

无需指定 session ID，创建分叉不会调用模型。

| 当前环境 | Fork 的打开位置 |
| --- | --- |
| Herdr 内，无论外层是什么终端 | 调用方 pane 当前所在 workspace 的新 tab |
| macOS Ghostty，直接运行 Pi | 新 Ghostty 窗口 |
| macOS iTerm2，直接运行 Pi | 新 iTerm2 窗口 |
| macOS Terminal，直接运行 Pi | 新 Terminal 窗口 |

Herdr 成功启动后会切换到新标签页；原会话不切换、不重写。

## 安装

```bash
pi install npm:pi-forkme
```

或直接从 GitHub 安装：

```bash
pi install https://github.com/jasonz3g/pi-forkme
```

## 使用

在已经运行的 Pi 会话中，重新加载扩展后执行命令：

```text
/reload
/forkme
```

新启动的 Pi 会话会自动加载扩展。在 Agent 空闲时输入 `/forkme` 即可，不需要任何参数。

## 运行要求

- Pi **0.85.1+**，已在 `0.85.1` 测试。
- Node 版 Pi 使用 Node.js **22.19.0+**。
- Herdr 已在 **0.9.0** 测试，需要 `pane current`、`tab create`、`agent start` 接口。
- 原生窗口仅支持 macOS；Ghostty 需要 **1.3.0+**，并启用 AppleScript（`macos-applescript` 默认开启）。

首次使用可能需要允许 macOS 自动化权限。原生适配器确认终端接受了创建窗口请求，不像 Herdr 那样额外等待新 Pi 输入就绪。

普通 SSH、Herdr 之外的 tmux/screen、未知终端、非 macOS 的原生窗口暂未适配，会明确报错。Herdr 优先识别；远端 Herdr 内也通过远端本机 CLI/socket 打开标签页。

## 分叉语义

- 复制当前**活动分支**及已完成回答。使用 `/tree` 后，不会误复制磁盘末尾的其他分支。
- Pi SDK 处理 labels、compaction 和持久化的扩展条目。
- 保留工作目录、模型、思考级别和来源会话关系。
- 创建新的 session ID 和 JSONL 文件，权限 `0600`，原会话不变。
- 先保存快照再开终端，不会因启动延迟混入原会话后续消息。
- 忙碌、有排队消息时拒绝执行，不中断正在运行的回复或工具。
- 临时会话（如 `--no-session`）先确认是否允许把内容保存到磁盘。

**只 Fork 会话，不 Fork 项目文件。** 两个 Agent 默认共享同一项目目录，不创建 Git worktree。

这不是进程内存快照。未提交的编辑器草稿、正在运行的工具、扩展的纯内存状态不会复制。新进程正常加载全局/项目配置，不复制临时 `-e`、`--system-prompt`、`--tools` 等 CLI 覆盖项。

会传递 Pi 配置目录和 PATH，但不会把 API key 或整个父进程环境写进命令。仅通过当前 shell 临时 `export` 设置的认证可能需要在 Pi 或目标终端重新配置。

## 失败恢复

启动失败/超时时不会自动重试、关闭新 tab 或删除已经生成的 Fork。

1. 先检查新窗口/tab 是否已经打开或正在等待授权。
2. 已保存副本时，原 Pi 会显示会话路径和恢复命令。
3. 确认没有其他进程使用该副本后，再在新终端执行恢复命令。

不要同时打开同一副本两次。

## 开发与测试

```bash
npm ci
npm run verify
```

测试覆盖会话快照、终端识别、失败恢复和 npm 包安装。macOS 上已安装对应终端时，还会编译其 AppleScript。常规测试不会打开窗口或发送模型请求。

开发时可在仓库根目录执行 `pi install .`，让 Pi 加载本地代码。

Herdr 的可选实测：

```bash
# 仅在 Herdr 内、且 PATH 中存在 pi 时执行：
npm run test:herdr
```

该测试创建一个临时 tab，不抢焦点，启动 Pi 并验证分叉会话后关闭测试 tab，不发送模型请求。

维护者发布流程见 [docs/RELEASING.md](docs/RELEASING.md)。

## 协议

[MIT](LICENSE)。
