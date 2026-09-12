# Publishing pi-forkme

A GitHub repository and an npm release serve different purposes:

- **GitHub** hosts the source and supports `pi install <repository-url>`.
- **npm** supports `pi install npm:pi-forkme`.
- The **Pi gallery** discovers packages tagged with the npm keyword `pi-package`. GitHub upload alone is not a gallery submission, and indexing is not necessarily immediate.

Do not publish until the owner, package name, public visibility, and MIT license have been confirmed. `pi-forkme` was available when checked during preparation; availability is not a reservation.

## 1. Authenticate locally

If using GitHub CLI:

```bash
# macOS, if gh is not already installed:
brew install gh

gh auth login
gh auth setup-git
gh auth status
npm login
npm whoami
```

Complete browser/2FA prompts locally. Never paste tokens into the repository, command-line arguments, issues, or a chat transcript.

Alternatively, use an existing GitHub repository and your normal authenticated Git transport.

## 2. Set the actual repository and commit identity

Replace `OWNER` with the chosen GitHub user or organization:

```bash
node scripts/set-repository.mjs OWNER/pi-forkme

# Repository-local settings, using your preferred public/noreply identity:
git config user.name "YOUR COMMIT NAME"
git config user.email "YOUR GITHUB NOREPLY EMAIL"
```

The script fills `repository`, `homepage`, and `bugs` in `package.json`. It does not create or publish anything remotely.

## 3. Verify, inspect, and push

```bash
npm ci
npm run verify
npm pack --dry-run --ignore-scripts

git add .
git diff --cached --stat
# Review the staged content, especially before making a repository public.
git commit -m "Initial release of pi-forkme"
```

Create a new repository only after confirming its name and visibility:

```bash
gh repo create OWNER/pi-forkme --public --source=. --remote=origin --push
```

For an **existing empty repository**, instead:

```bash
git remote add origin https://github.com/OWNER/pi-forkme.git
git push -u origin main
```

Do not force-push over an existing nonempty repository. Inspect/reconcile its history first.

GitHub installs can now use its actual HTTPS URL. Set repository topics such as `pi-package`, `pi-extension`, and `herdr` if desired; GitHub topics do not replace the npm keyword.

## 4. Publish the first npm release

Review the README and changelog, and commit any release edits. Check npm package-name availability again.

```bash
npm view pi-forkme name version
# E404 means it is not currently published; other errors do not establish availability.

git tag -a v0.1.0 -m "pi-forkme v0.1.0"
git push origin v0.1.0

npm publish --dry-run
npm publish --access public
```

`prepublishOnly` runs type checks, tests, and a release guard requiring real GitHub metadata, a clean worktree, and a matching `v<version>` tag on HEAD. No publish lifecycle runs when users install the package.

Do not use `--ignore-scripts` when publishing: it bypasses those checks. npm may request authentication/2FA. This repository does not contain a publish token or an auto-publish workflow.

Optionally create a GitHub Release from the pushed tag after npm publication succeeds:

```bash
gh release create v0.1.0 --verify-tag --title "v0.1.0" --notes-file CHANGELOG.md
```

## 5. Verify installation and discoverability

```bash
npm view pi-forkme version keywords repository
pi install npm:pi-forkme
```

Disable any local development copy before testing the installed package, so `/forkme` is registered only once. Test it in an idle session and check the independent session ID.

Check <https://pi.dev/packages> after the npm index has refreshed. The repository already includes the required `pi-package` keyword and `pi.extensions` manifest. Do not claim the package is listed until the gallery actually shows it.

## Subsequent releases

1. Update `CHANGELOG.md`, documentation, and tests.
2. Update the version (including `package-lock.json`), commit, and run `npm run verify`.
3. Create/push the matching `v<version>` tag.
4. Dry-run and publish manually, then verify npm and Pi installation.

The npm tarball has an explicit file allowlist: four TypeScript runtime files, package metadata, two READMEs, the license, and the changelog. Tests, CI configuration, machine-local configs, sessions, credentials, and dev dependencies are not included.
