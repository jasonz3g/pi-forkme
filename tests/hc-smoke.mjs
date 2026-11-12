// Opt-in live test for the Herdr app (hc CLI). It starts exactly one temporary
// child terminal, never attaches or takes focus, verifies the forked Pi, then
// ends only that terminal. No model prompt is submitted.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { createSnapshot } from "../snapshot.ts";
import { forkTerminalName, launchFork, piInvocation, prepareLauncher } from "../launch.ts";

if (!process.env.HC_TERMINAL_ID && !process.env.HC_TERMINAL_SOCKET) {
	throw new Error("Run this test only inside a Herdr app terminal (HC_TERMINAL_ID is unset).");
}
const { packageDir } = await import("./pi-package.mjs");
const { SessionManager } = await import(pathToFileURL(join(packageDir, "dist/index.js")).href);
const exec = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const binary = process.env.HC_BIN_PATH || "hc";
const env = { ...process.env, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1" };
const run = async (command, args, timeout = 20_000) => (await exec(command, args, { encoding: "utf8", timeout, env })).stdout;
const info = async () => JSON.parse(await run(binary, ["get", name, "--json"]));

const dir = mkdtempSync(join(tmpdir(), "pi-forkme-hc-live-"));
let name;
let started = false;
try {
	const launcher = await prepareLauncher("hc", run, env);
	const manager = SessionManager.create(dir, join(dir, "sessions"));
	const snapshot = createSnapshot({ cwd: dir, sessionManager: manager, thinkingLevel: "off" }, SessionManager);
	name = forkTerminalName(snapshot);
	const destination = await launchFork(launcher, snapshot, dir, run, env, piInvocation());
	started = true;

	// The pinned Pi must be the terminal's own program, in the temporary directory.
	let current = await info();
	for (let attempt = 0; attempt < 30 && current.state === "live" && !current.foreground; attempt++) {
		await sleep(1_000);
		current = await info();
	}
	assert.equal(current.state, "live", `The fork ended at once: ${JSON.stringify(current.error ?? current.reason)}`);
	const argv = JSON.stringify(current.foreground?.argv ?? []);
	assert.ok(/\bpi\b/.test(argv), `The terminal is not running the pinned Pi: ${argv}`);
	assert.equal(realpathSafe(current.foreground?.cwd), realpathSafe(dir), "The fork must run in the source working directory.");
	if (process.env.HC_TERMINAL_ID) {
		assert.equal(current.parent, process.env.HC_TERMINAL_ID, "The fork should stay under the calling terminal.");
	}

	// /session is a local Pi command: it prints the session ID without a model request.
	// The Pi TUI needs a moment to come up, so resend until its output arrives.
	let screen = "";
	for (let attempt = 0; attempt < 4 && !screen.includes(snapshot.id); attempt++) {
		await sleep(attempt ? 3_000 : 8_000);
		await run(binary, ["send", name, "/session"]);
		for (let read = 0; read < 6 && !screen.includes(snapshot.id); read++) {
			await sleep(2_000);
			screen = await run(binary, ["read", name, "--lines", "120"]);
		}
	}
	assert.ok(screen.includes(snapshot.id), `${name} never printed the fork session ID ${snapshot.id}:\n${screen}`);
	// Herdr classifies a terminal as an agent once a client has viewed it.
	console.log(JSON.stringify({ destination, terminal: name, fork: snapshot.id, cwd: dir, parent: current.parent, agent: current.agent, where: current.labels?.where }, null, 2));
	console.log(`Verified /session reports the exact fork ID in ${name}.`);
} finally {
	let closed = !started;
	if (started) {
		try {
			await run(binary, ["kill", name]);
			await run(binary, ["rm", name]);
			closed = true;
			console.log(`Closed only smoke-test terminal ${name}.`);
		} catch (error) {
			console.error(`Could not close ${name}; it may still be running. ${error.message}`);
		}
	}
	if (closed) rmSync(dir, { recursive: true, force: true });
	else console.error(`Preserved the temporary session directory at ${dir}.`);
}

function realpathSafe(value) {
	try {
		return realpathSync(value);
	} catch {
		return value;
	}
}
