# pi-forkme

**Fork your current Pi conversation into a new terminal — without leaving the original session.**

[简体中文](README.zh-CN.md) · [MIT License](LICENSE)

Run one command inside [Pi](https://pi.dev):

```text
/forkme
```

No session ID required. Forking does not make a model request.

| Where Pi is running | Where the fork opens |
| --- | --- |
| Herdr, regardless of the outer terminal | A new tab in the caller's current workspace |
| Directly in Ghostty on macOS | A new Ghostty window |
| Directly in iTerm2 on macOS | A new iTerm2 window |
| Directly in Terminal.app on macOS | A new Terminal window |

The original session stays open and unchanged. The new Pi uses an independent session file and the same working directory.

## Install

```bash
pi install npm:pi-forkme
```

Or install directly from GitHub:

```bash
pi install https://github.com/jasonz3g/pi-forkme
```

## Usage

In an already-running Pi session, reload extensions and run the command:

```text
/reload
/forkme
```

New Pi sessions load the extension automatically. Run `/forkme` while the agent is idle; no arguments are needed.

## Requirements

- Pi **0.85.1 or newer**; tested with `0.85.1`.
- Node.js **22.19.0 or newer** when using Node-based Pi.
- For Herdr: tested with **0.9.0** and its `pane current`, `tab create`, and `agent start` CLI.
- For native windows: macOS with the corresponding terminal installed.
- Ghostty **1.3.0+** with AppleScript enabled (`macos-applescript`, enabled by default).

macOS may ask for Automation permission to control the terminal. Native adapters report that the window creation request was accepted; unlike Herdr, they do not verify that the new Pi has reached its input-ready state.

Plain SSH, tmux/screen outside Herdr, unknown terminals, and non-macOS native-window launchers are not implemented. They fail explicitly rather than launching an unrelated terminal. Herdr is checked first, including on remote hosts with a functioning local Herdr CLI/socket.

## What is copied?

- The **active branch**, including completed assistant responses. After `/tree`, this is not necessarily the branch at the end of the session file.
- Labels, compaction history, and persisted extension entries, using Pi's SessionManager branch extraction.
- The selected model, thinking level, and working directory.
- A new session ID and source-session provenance.

The snapshot is saved before launching the new process, so later messages in the original session do not leak into the fork. Session files are created with mode `0600`.

Run the command while Pi is idle and has no queued messages. Repeated invocations during startup are blocked. Ephemeral sessions such as `--no-session` require confirmation before their contents are saved to disk.

### What is not copied?

**Project files are shared.** This is a conversation fork, not a Git worktree. Avoid letting two agents modify the same files concurrently.

It is also not a process-memory snapshot: unsent editor drafts, running tools, and extension-only in-memory state are not copied. The new Pi loads its normal global/project configuration; temporary CLI overrides such as `-e`, `--system-prompt`, and `--tools` are not reproduced.

Pi configuration-directory variables and PATH are carried over, but credentials and the entire parent environment are not serialized into launch commands. If authentication exists only in a temporary shell `export`, configure authentication in Pi or the destination terminal as well.

## If opening the fork fails

The extension never retries a potentially successful launch automatically, closes the new tab on a timeout, or deletes a saved fork.

1. Check whether the new window/tab already exists or is waiting for permission.
2. If the fork was saved, the original Pi displays its path and an exact recovery command.
3. Only run that command after confirming another process is not already using the same fork file.

## Development

```bash
npm ci
npm run verify
```

Tests cover session snapshots, terminal routing, failure recovery, and installation of the npm package. AppleScript compilation tests run when the relevant macOS application is installed. Standard tests do not open windows or send model requests.

To load a local checkout into Pi, run `pi install .` from the repository root.

An **opt-in** live Herdr test is available:

```bash
# Only inside Herdr with an available pi executable:
npm run test:herdr
```

This test creates a temporary tab without taking focus, starts Pi, verifies the fork session, and closes the test tab. It does not send a model prompt.

Maintainers can find release instructions in [docs/RELEASING.md](docs/RELEASING.md).

## License

[MIT](LICENSE).
