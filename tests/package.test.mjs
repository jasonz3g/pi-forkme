import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { packageDir } from "./pi-package.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

async function verifyPackageInstall(t, dryRun) {
	const dir = mkdtempSync(join(tmpdir(), "pi-forkme-package-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const env = { ...process.env, npm_config_dry_run: String(dryRun) };
	// npm publish --dry-run exports npm_config_dry_run to lifecycle scripts.
	// Only these local test commands must write files; the parent publish stays dry-run.
	const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run=false", "--ignore-scripts", "--json", "--pack-destination", dir], {
		cwd: root, env, encoding: "utf8", timeout: 60_000,
	}))[0];
	assert.ok(existsSync(join(dir, packed.filename)), "npm pack must write a tarball even under a parent dry-run.");
	assert.equal(packed.name, "pi-forkme");
	assert.deepEqual(packed.files.map((file) => file.path).sort(), [
		"CHANGELOG.md", "LICENSE", "README.md", "README.zh-CN.md",
		"command.ts", "index.ts", "launch.ts", "package.json", "snapshot.ts",
	].sort());
	assert.ok(packed.unpackedSize < 100_000, "The package should not bundle SDKs, dependencies, or session data.");

	const consumer = join(dir, "consumer");
	mkdirSync(consumer);
	writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "forkme-consumer-test", private: true }));
	execFileSync("npm", ["install", "--dry-run=false", "--offline", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", "--package-lock=false", join(dir, packed.filename)], {
		cwd: consumer, env, encoding: "utf8", timeout: 60_000,
	});
	const installed = join(consumer, "node_modules", "pi-forkme");
	assert.equal(existsSync(join(consumer, "node_modules/@earendil-works/pi-coding-agent")), false, "Pi's SDK must not be installed into the consumer as a runtime dependency.");
	const pkg = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"));
	assert.ok(pkg.keywords.includes("pi-package"));
	assert.deepEqual(pkg.pi.extensions, ["./index.ts"]);
	assert.equal(pkg.private, undefined);
	assert.equal(pkg.license, "MIT");
	assert.equal(pkg.peerDependencies["@earendil-works/pi-coding-agent"], "*");
	assert.equal(pkg.peerDependenciesMeta["@earendil-works/pi-coding-agent"].optional, true);
	assert.equal(pkg.dependencies, undefined);
	assert.equal(pkg.scripts.prepare, undefined);
	assert.equal(pkg.scripts.postinstall, undefined);
	for (const file of packed.files) {
		const text = readFileSync(join(installed, file.path), "utf8");
		assert.doesNotMatch(text, /\/Users\/[^/\s]+\//, `Machine-specific path leaked into ${file.path}`);
		if (file.path.endsWith(".ts")) {
			assert.doesNotMatch(text, /\p{Script=Han}/u, `Keep built-in UI text in English: ${file.path}`);
		}
	}
	const { loadExtensions } = await import(pathToFileURL(join(packageDir, "dist/core/extensions/loader.js")).href);
	const loaded = await loadExtensions([join(installed, "index.ts")], consumer);
	assert.deepEqual(loaded.errors, []);
	assert.equal(loaded.extensions.length, 1);
	assert.ok(loaded.extensions[0].commands.has("forkme"));
}

for (const dryRun of [false, true]) {
	test(`npm package installs and loads with inherited dry-run=${dryRun}`, { timeout: 120_000 }, (t) => verifyPackageInstall(t, dryRun));
}
