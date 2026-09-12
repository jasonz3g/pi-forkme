// Opt-in live test. Creates exactly one temporary tab, never focuses it, then
// closes only that tab. Does not submit any model prompt or touch the caller.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createSnapshot } from "../snapshot.ts";
import { launchFork, piInvocation, prepareLauncher } from "../launch.ts";

if (process.env.HERDR_ENV !== "1") throw new Error("Run this test only inside Herdr.");
const { packageDir } = await import("./pi-package.mjs");
const { SessionManager } = await import(pathToFileURL(join(packageDir, "dist/index.js")).href);
const exec = promisify(execFile);
const dir = mkdtempSync(join(tmpdir(), "pi-forkme-live-"));
const env = { ...process.env, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1" };
let createdTab;
let createdPane;
let safeToRemove = true;
const run = async (command, args, timeout = 15_000) => {
	const { stdout } = await exec(command, args, { encoding: "utf8", timeout, env });
	if (args[0] === "tab" && args[1] === "create") {
		const result = JSON.parse(stdout).result;
		createdTab = result.tab.tab_id;
		createdPane = result.root_pane.pane_id;
		safeToRemove = false;
	}
	return stdout;
};
try {
	const launcher = await prepareLauncher("herdr", run, env);
	const manager = SessionManager.create(dir, join(dir, "sessions"));
	const snapshot = createSnapshot({ cwd: dir, sessionManager: manager, thinkingLevel: "off" }, SessionManager);
	const destination = await launchFork(launcher, snapshot, dir, run, env, piInvocation(), false);
	const agent = JSON.parse(await run(launcher.binary, ["agent", "get", createdPane]));
	assert.ok(agent.result.agent, "Herdr should recognize the new Pi agent");
	const processInfo = await run(launcher.binary, ["pane", "process-info", "--pane", createdPane]);
	console.log(JSON.stringify({ destination, fork: snapshot.id, cwd: dir, agent: agent.result.agent, processInfo: JSON.parse(processInfo) }, null, 2));
	await run(launcher.binary, ["agent", "prompt", createdPane, "/session"]);
	await run(launcher.binary, ["pane", "wait-output", createdPane, "--match", snapshot.id, "--source", "recent-unwrapped", "--lines", "120", "--timeout", "10000"]);
	console.log("Verified /session reports the exact fork ID.");
} finally {
	if (createdTab) {
		try {
			await run(env.HERDR_BIN_PATH || "herdr", ["tab", "close", createdTab]);
			safeToRemove = true;
			console.log(`Closed only smoke-test tab ${createdTab}.`);
		} catch (error) {
			console.error(`Could not close test tab ${createdTab}; preserved files at ${dir}.`, error.message);
		}
	}
	if (safeToRemove) rmSync(dir, { recursive: true, force: true });
}
