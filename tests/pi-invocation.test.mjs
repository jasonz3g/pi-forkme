import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { piInvocation, resumeCommand } from "../launch.ts";

function fixture(t, layout = "dist/bundle/cli.js") {
	const root = mkdtempSync(join(tmpdir(), "pi-invocation-test-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const packageRoot = join(root, "Pi installation's directory");
	const entry = join(packageRoot, layout);
	mkdirSync(dirname(entry), { recursive: true });
	writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent" }));
	// A stand-in entry that reports its arguments without opening Pi or sending prompts.
	writeFileSync(entry, "console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)}));\n");
	return { root, packageRoot, entry };
}

for (const layout of ["dist/cli.js", "dist/bundle/cli.js"]) {
	test(`piInvocation pins the runtime and entry for ${layout}`, (t) => {
		const { entry } = fixture(t, layout);
		assert.deepEqual(piInvocation(["node", entry], process.execPath), [realpathSync(process.execPath), realpathSync(entry)]);
	});
}

test("piInvocation resolves symlinks for both the entry and runtime", (t) => {
	const { root, entry } = fixture(t);
	const entryLink = join(root, "pi");
	const runtimeLink = join(root, "node-runtime");
	symlinkSync(entry, entryLink);
	symlinkSync(process.execPath, runtimeLink);
	assert.deepEqual(piInvocation([runtimeLink, entryLink], runtimeLink), [realpathSync(process.execPath), realpathSync(entry)]);
});

test("piInvocation stops at a non-Pi package boundary", (t) => {
	const { entry } = fixture(t);
	writeFileSync(join(dirname(entry), "package.json"), JSON.stringify({ name: "custom-launcher" }));
	assert.deepEqual(piInvocation(["node", entry]), ["pi"]);
});

test("piInvocation falls back for malformed or missing manifests", (t) => {
	const { packageRoot, entry } = fixture(t);
	const manifest = join(packageRoot, "package.json");
	writeFileSync(manifest, "not JSON");
	assert.deepEqual(piInvocation(["node", entry]), ["pi"]);
	rmSync(manifest);
	assert.deepEqual(piInvocation(["node", entry]), ["pi"]);
});

test("piInvocation limits ancestor lookup", (t) => {
	const { entry } = fixture(t, "one/two/three/four/five/cli.js");
	assert.deepEqual(piInvocation(["node", entry]), ["pi"]);
});

test("piInvocation falls back for missing entries, runtimes, and custom launchers", (t) => {
	const { root, entry } = fixture(t);
	const missing = join(root, "missing");
	assert.deepEqual(piInvocation([]), ["pi"]);
	assert.deepEqual(piInvocation(["node", missing]), ["pi"]);
	assert.deepEqual(piInvocation(["node", entry], missing), ["pi"]);
	const custom = join(dirname(entry), "custom.js");
	writeFileSync(custom, "");
	assert.deepEqual(piInvocation(["node", custom]), ["pi"]);
});

test("native resume executes the pinned bundled entry despite an alternative Pi on PATH", {
	skip: process.platform === "win32",
}, (t) => {
	const { root, entry } = fixture(t);
	const bin = join(root, "alternative-bin");
	mkdirSync(bin);
	writeFileSync(join(bin, "pi"), "#!/bin/sh\nexit 99\n", { mode: 0o755 });
	const invocation = piInvocation(["node", entry], process.execPath);
	// Assert before execution so a regression cannot accidentally launch a real Pi.
	assert.deepEqual(invocation, [realpathSync(process.execPath), realpathSync(entry)]);
	const snapshot = { path: join(root, "fork.jsonl"), id: "fork-id", name: "Issue A" };
	const command = resumeCommand(root, snapshot, invocation, { PATH: bin });
	const result = JSON.parse(execFileSync("/bin/sh", ["-c", command], { encoding: "utf8", timeout: 10_000 }));
	assert.equal(result.cwd, realpathSync(root));
	assert.deepEqual(result.args, ["--session", snapshot.path, "--session-dir", root]);
});
