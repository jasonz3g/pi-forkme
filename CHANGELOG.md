# Changelog

## 0.1.1

- Keep fork session/tab names stable when forking a fork: replace inherited trailing fork suffixes with the new fork ID instead of accumulating them.

## 0.1.0

Initial public-package preparation, based on the working local `/forkme` extension.

- Fork the active session branch without requiring a session ID or changing the source session.
- Open a tab in the live caller's Herdr workspace, or a new Ghostty, iTerm2, or Terminal window on macOS.
- Preserve the working directory, selected model, thinking level, labels, and compaction history.
- Protect busy/queued sessions, confirm persistence of ephemeral sessions, and provide recovery after launch failures.
- Add reproducible local dependencies, packaged-install tests, CI, and English/Chinese documentation.
