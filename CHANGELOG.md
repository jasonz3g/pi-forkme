# Changelog

## 0.2.2 - 2026-09-14

- Pin native launches to the active Pi installation across CLI layouts and resolve fork session paths before launch.
- Clarify custom session-name examples in the English and Chinese README files.

## 0.2.1 - 2026-09-14

- Focus new Herdr tabs at creation instead of after Pi startup, preventing delayed focus changes from overriding the user's manually selected tab.

## 0.2.0 - 2026-09-14

- Support `/forkme [name]` to persist an optional custom fork session name and use it for the Herdr tab label, while preserving automatic naming when no name is provided.
- Normalize custom names and reject remaining ASCII control characters before creating a fork.

## 0.1.1

- Keep fork session/tab names stable when forking a fork: replace inherited trailing fork suffixes with the new fork ID instead of accumulating them.

## 0.1.0

Initial public-package preparation, based on the working local `/forkme` extension.

- Fork the active session branch without requiring a session ID or changing the source session.
- Open a tab in the live caller's Herdr workspace, or a new Ghostty, iTerm2, or Terminal window on macOS.
- Preserve the working directory, selected model, thinking level, labels, and compaction history.
- Protect busy/queued sessions, confirm persistence of ephemeral sessions, and provide recovery after launch failures.
- Add reproducible local dependencies, packaged-install tests, CI, and English/Chinese documentation.
