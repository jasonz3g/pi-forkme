import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
assert.equal(pkg.private, undefined, "The package must not be private.");
assert.ok(pkg.keywords?.includes("pi-package"), "The Pi gallery requires the pi-package keyword.");
assert.match(pkg.repository?.url || "", /^git\+https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\.git$/, "Set the real GitHub owner/repository with scripts/set-repository.mjs first.");
assert.ok(pkg.homepage && pkg.bugs?.url, "Missing homepage/issue links.");
assert.equal(execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim(), "", "Commit all release changes before publishing.");
const tags = execFileSync("git", ["tag", "--points-at", "HEAD"], { cwd, encoding: "utf8" }).trim().split("\n");
assert.ok(tags.includes(`v${pkg.version}`), `Tag the release commit v${pkg.version} before publishing.`);
console.log(`Release metadata and local v${pkg.version} tag verified. Ensure the commit/tag are pushed before publishing.`);
