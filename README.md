# pi-forkme

**Fork your current Pi conversation into a new terminal — without leaving the original session.**

[简体中文](README.zh-CN.md) · [MIT License](LICENSE)

Run one command inside [Pi](https://pi.dev):

```text
/forkme [name]
```

`[name]` is optional; replace it with your desired session name without the brackets, or omit it for automatic naming.

No session ID required. Forking does not make a model request.

| Where Pi is running | Where the fork opens |
| --- | --- |
| Herdr app terminal (`hc`), regardless of the outer terminal | A new terminal under the caller, in the same workspace |
| Herdr (classic `herdr` CLI), regardless of the outer terminal | A new tab in the caller's current workspace |
| Directly in Ghostty on macOS | A new Ghostty window |
| Directly in iTerm2 on macOS | A new iTerm2 window |
| Directly in Terminal.app on macOS | A new Terminal window |

The original session stays open and unchanged. The new Pi uses an independent session file and the same working directory.

In the Herdr app, the fork is started with `hc run --bg --no-notify --outlive-parent`: nothing is typed into your current Pi prompt, the new terminal keeps running after the original Pi exits, and no other window is raised. Herdr recognizes it as a Pi agent as soon as a client views the terminal.

In classic Herdr, the new tab receives focus as soon as it is created, without waiting for Pi to become ready. Startup completion never refocuses it, so you can switch to another tab while it loads.

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

New Pi sessions load the extension automatically. Run `/forkme` while the agent is idle. Optionally provide a name for the new session:

```text
/forkme Issue A
```

This creates a session named `Issue A`, without an added fork suffix. The original session stays unchanged. In Herdr, the new tab label uses the same name; the Herdr app names the terminal `fork-<id>` because terminal names are lowercase ASCII, and native terminal window titles are not explicitly controlled.

- `/forkme` or a whitespace-only argument keeps automatic naming: the source session name (or working-directory name) plus ` · fork <id>`.
- The entire argument is the name. Leading/trailing whitespace is trimmed, internal spaces are preserved, and line breaks become spaces.
- No quotes are needed; quotes and shell syntax are treated literally. Chinese, emoji, and duplicate names are supported. Custom names are not truncated or stripped of existing fork suffixes.
- Remaining ASCII control characters (including internal tabs, NUL, and ESC) are rejected before creating a fork.

The name is saved in the fork file and retained when reopening it, including after a failed terminal launch.

## Requirements

- Pi **0.85.1 or newer**; tested with **1.5.2** and `0.85.1`.
- Node.js **22.19.0 or newer** when using Node-based Pi.
- For the Herdr app: tested with **hc 0.1.20** and its `hc run` command. The terminal is detected through `HC_TERMINAL_ID`/`HC_TERMINAL_SOCKET`.
- For classic Herdr: tested with **0.9.0** and its `pane current`, `tab create`, and `agent start` CLI.
- For native windows: macOS with the corresponding terminal installed.
- Ghostty **1.3.0+** with AppleScript enabled (`macos-applescript`, enabled by default).

macOS may ask for Automation permission to control the terminal. Native adapters report that the window creation request was accepted; unlike Herdr, they do not verify that the new Pi has reached its input-ready state.

Plain SSH, tmux/screen outside Herdr, unknown terminals, and non-macOS native-window launchers are not implemented. They fail explicitly rather than launching an unrelated terminal. Herdr is checked first, including on remote hosts with a functioning local Herdr CLI/socket. `SSH_CONNECTION=herdr` is treated as a Herdr marker, not as a plain SSH login.

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

1. Check whether the new window/tab already exists or is waiting for permission. In the Herdr app, the terminal is named `fork-<id>`: inspect it with `hc get fork-<id>` and `hc read fork-<id>`, and end it with `hc kill fork-<id>`.
2. If the fork was saved, the original Pi displays its path and an exact recovery command.
3. Only run that command after confirming another process is not already using the same fork file.

## Development

```bash
npm ci
npm run verify
```

Tests cover session snapshots, terminal routing, failure recovery, and installation of the npm package. AppleScript compilation tests run when the relevant macOS application is installed. Standard tests do not open windows or send model requests.

To load a local checkout into Pi, run `pi install .` from the repository root.

Two **opt-in** live tests start a real fork without sending a model prompt:

```bash
# Only inside a Herdr app terminal (HC_TERMINAL_ID is set):
npm run test:hc

# Only inside classic Herdr with an available pi executable:
npm run test:herdr
```

`test:hc` creates one temporary child terminal, starts Pi on the fork, verifies that `/session` reports the exact fork ID, and then ends only that terminal. `test:herdr` creates a temporary tab without taking focus, verifies the fork session, and closes the test tab.

Maintainers can find release instructions in [docs/RELEASING.md](docs/RELEASING.md).

## License

[MIT](LICENSE).
