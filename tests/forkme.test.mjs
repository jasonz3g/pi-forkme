import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { createSnapshot } from "../snapshot.ts";
import { makeHandler } from "../command.ts";
import { appleScripts, detectHost, launchEnvironment, launchFork, piInvocation, prepareLauncher, resumeCommand, shellQuote } from "../launch.ts";

import { packageDir } from "./pi-package.mjs";
const { SessionManager } = await import(pathToFileURL(join(packageDir, "dist/index.js")).href);
const extensionDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fixture(t) {
	const dir = mkdtempSync(join(tmpdir(), "pi-forkme-test-"));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const cwd = join(dir, "项目's directory");
	mkdirSync(cwd);
	const sessions = join(dir, "sessions");
	const manager = SessionManager.create(cwd, sessions);
	const notifications = [];
	const widgets = [];
	const ctx = {
		mode: "tui", cwd, sessionManager: manager, thinkingLevel: "high",
		model: { provider: "test-provider", id: "test-model" },
		isIdle: () => true, hasPendingMessages: () => false,
		ui: {
			notify: (message, level) => notifications.push({ message, level }),
			setWidget: (key, lines) => widgets.push({ key, lines }),
			confirm: async () => true,
		},
	};
	return { dir, cwd, sessions, manager, ctx, notifications, widgets };
}
const user = (text) => ({ role: "user", content: text, timestamp: Date.now() });
const assistant = (text) => ({
	role: "assistant", content: [{ type: "text", text }], api: "openai-completions",
	provider: "test-provider", model: "test-model", stopReason: "stop", timestamp: Date.now(),
	usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
});
const messageIds = (manager) => manager.getEntries().filter((entry) => entry.type === "message").map((entry) => entry.id);

function fakeHerdrRun(calls, failStart = false) {
	return async (binary, args) => {
		calls.push({ binary, args });
		if (args[0] === "pane") return JSON.stringify({ result: { pane: { workspace_id: "live-workspace" } } });
		if (args[0] === "tab" && args[1] === "create") return JSON.stringify({ result: { tab: { tab_id: "created-tab" }, root_pane: { pane_id: "created-pane" } } });
		if (failStart && args[0] === "agent") throw new Error("startup timed out");
		return JSON.stringify({ result: { ok: true } });
	};
}
const herdrEnv = { HERDR_ENV: "1", HERDR_PANE_ID: "caller", HERDR_WORKSPACE_ID: "stale-workspace", TERM_PROGRAM: "ghostty", PATH: process.env.PATH };
const dependencies = (run, env = herdrEnv) => ({ run, env, platform: "darwin", Manager: SessionManager, invocation: ["pi"] });

test("host routing: Herdr wins; direct terminals use native windows", () => {
	assert.equal(detectHost(herdrEnv, "darwin"), "herdr");
	assert.equal(detectHost({ HERDR_ENV: "1" }, "linux"), "herdr");
	assert.equal(detectHost({ TERM_PROGRAM: "ghostty" }, "darwin"), "ghostty");
	assert.equal(detectHost({ TERM_PROGRAM: "iTerm.app" }, "darwin"), "iterm2");
	assert.equal(detectHost({ TERM_PROGRAM: "Apple_Terminal" }, "darwin"), "terminal");
	for (const env of [{}, { TERM_PROGRAM: "vscode" }, { TERM_PROGRAM: "ghostty", SSH_CONNECTION: "remote" }, { TERM_PROGRAM: "iTerm.app", TMUX: "socket" }]) {
		assert.throws(() => detectHost(env, "darwin"));
	}
	assert.throws(() => detectHost({ TERM_PROGRAM: "ghostty" }, "linux"));
});

test("snapshot uses active leaf, preserves labels and leaves source file/state unchanged", (t) => {
	const { ctx, manager } = fixture(t);
	const first = manager.appendMessage(user("first"));
	const chosen = manager.appendMessage(assistant("chosen answer"));
	manager.appendMessage(user("excluded branch"));
	manager.appendMessage(assistant("excluded answer"));
	manager.appendLabelChange(chosen, "checkpoint");
	manager.appendSessionInfo("Original session");
	manager.branch(chosen);
	const sourcePath = manager.getSessionFile();
	const before = readFileSync(sourcePath, "utf8");
	const entriesBefore = structuredClone(manager.getEntries());
	const idBefore = manager.getSessionId();

	const snapshot = createSnapshot(ctx, SessionManager);
	const fork = SessionManager.open(snapshot.path);
	assert.notEqual(snapshot.id, idBefore);
	assert.equal(fork.getHeader().parentSession, sourcePath);
	assert.equal(fork.getCwd(), ctx.cwd);
	assert.deepEqual(messageIds(fork), [first, chosen]);
	assert.equal(fork.getLabel(chosen), "checkpoint");
	assert.match(fork.getSessionName(), /^Original session · fork /);
	assert.equal(fork.buildSessionContext().thinkingLevel, "high");
	assert.deepEqual(fork.buildSessionContext().model, { provider: "test-provider", modelId: "test-model" });
	assert.equal(statSync(snapshot.path).mode & 0o777, 0o600);
	assert.equal(readFileSync(sourcePath, "utf8"), before);
	assert.deepEqual(manager.getEntries(), entriesBefore);
	assert.equal(manager.getLeafId(), chosen);
	assert.equal(manager.getSessionId(), idBefore);
	fork.appendMessage(user("fork-only"));
	assert.equal(readFileSync(sourcePath, "utf8"), before);
});

for (const [label, sourceName, baseName] of [
	["unnamed", undefined, undefined],
	["named", "原始会话", "原始会话"],
	["long name", "Long session ".repeat(10), "Long session ".repeat(10).slice(0, 80)],
	["legacy nested suffixes", "Original · fork 1234abcd · fork deadbeef", "Original"],
	["ordinary fork text", "Discuss · fork abcdef12 implementation · fork notes", "Discuss · fork abcdef12 implementation · fork notes"],
]) {
	test(`repeated forks keep a stable base name: ${label}`, (t) => {
		const { ctx, manager } = fixture(t);
		if (sourceName) manager.appendSessionInfo(sourceName);
		for (let generation = 0; generation < 6; generation++) {
			const source = ctx.sessionManager;
			const nameBefore = source.getSessionName();
			const snapshot = createSnapshot(ctx, SessionManager);
			const fork = SessionManager.open(snapshot.path);
			assert.equal(snapshot.name, `${baseName ?? basename(ctx.cwd)} · fork ${snapshot.id.slice(-8)}`);
			assert.equal(fork.getSessionName(), snapshot.name);
			assert.equal(source.getSessionName(), nameBefore);
			assert.notEqual(snapshot.id, source.getSessionId());
			assert.equal(fork.getHeader().parentSession, source.getSessionFile());
			ctx.sessionManager = fork;
		}
	});
}

test("forking a renamed fork uses the new session name", (t) => {
	const { ctx } = fixture(t);
	const first = createSnapshot(ctx, SessionManager);
	ctx.sessionManager = SessionManager.open(first.path);
	ctx.sessionManager.appendSessionInfo("Renamed session");
	const second = createSnapshot(ctx, SessionManager);
	assert.equal(second.name, `Renamed session · fork ${second.id.slice(-8)}`);
});

test("empty/user-only sessions are persisted and resume without duplicate headers", (t) => {
	const { ctx, manager } = fixture(t);
	let snapshot = createSnapshot(ctx, SessionManager);
	assert.equal(messageIds(SessionManager.open(snapshot.path)).length, 0);
	manager.appendMessage(user("not on disk yet"));
	snapshot = createSnapshot(ctx, SessionManager);
	const fork = SessionManager.open(snapshot.path);
	assert.equal(messageIds(fork).length, 1);
	fork.appendMessage(assistant("first response"));
	const entries = readFileSync(snapshot.path, "utf8").trim().split("\n").map(JSON.parse);
	assert.equal(entries.filter((e) => e.type === "session").length, 1);
	assert.equal(entries.filter((e) => e.type === "message").length, 2);
});

test("resetting the active leaf to root does not revive disk history", (t) => {
	const { ctx, manager } = fixture(t);
	manager.appendMessage(user("old"));
	manager.appendMessage(assistant("old response"));
	manager.resetLeaf();
	const snapshot = createSnapshot(ctx, SessionManager);
	assert.equal(messageIds(SessionManager.open(snapshot.path)).length, 0);
});

test("SDK snapshot retains compaction and extension state", (t) => {
	const { ctx, manager } = fixture(t);
	manager.appendMessage(user("old"));
	manager.appendMessage(assistant("old response"));
	const kept = manager.appendMessage(user("keep me"));
	manager.appendMessage(assistant("kept response"));
	manager.appendCompaction("summary", kept, 3000);
	manager.appendCustomEntry("test-state", { done: [1, 2] });
	const snapshot = createSnapshot(ctx, SessionManager);
	const fork = SessionManager.open(snapshot.path);
	assert.equal(fork.getEntries().find((e) => e.type === "compaction").firstKeptEntryId, kept);
	assert.deepEqual(fork.getEntries().find((e) => e.type === "custom" && e.customType === "test-state").data, { done: [1, 2] });
	assert.ok(fork.buildSessionContext().messages.length > 0);
});

test("Herdr resolves the live caller and only starts the created pane", async (t) => {
	const { ctx } = fixture(t);
	const calls = [];
	const run = fakeHerdrRun(calls);
	const launcher = await prepareLauncher("herdr", run, herdrEnv);
	assert.equal(launcher.workspaceId, "live-workspace");
	const snapshot = createSnapshot(ctx, SessionManager);
	await launchFork(launcher, snapshot, ctx.cwd, run, herdrEnv, ["pi"]);
	assert.deepEqual(calls[0].args, ["pane", "current", "--current"]);
	assert.ok(calls[1].args.includes("live-workspace"));
	assert.ok(calls[1].args.includes("--no-focus"));
	assert.equal(calls[1].args[calls[1].args.indexOf("--label") + 1], snapshot.name);
	assert.ok(!calls[1].args.includes("stale-workspace"));
	assert.ok(calls[2].args.includes("created-pane"));
	assert.ok(calls[2].args.includes(snapshot.path));
	assert.deepEqual(calls[3].args, ["tab", "focus", "created-tab"]);
});

test("all native adapters request new windows, never inject into the existing window", async (t) => {
	const { ctx } = fixture(t);
	const snapshot = createSnapshot(ctx, SessionManager);
	for (const host of ["ghostty", "iterm2", "terminal"]) {
		const calls = [];
		await launchFork({ host }, snapshot, ctx.cwd, async (binary, args) => { calls.push({ binary, args }); return ""; }, {}, ["pi"]);
		assert.equal(calls.length, 1);
		assert.equal(calls[0].binary, "/usr/bin/osascript");
		assert.deepEqual(calls[0].args.slice(2, 4), ["--", ctx.cwd]);
		assert.ok(calls[0].args[4].includes(snapshot.id));
		assert.ok(!calls[0].args[1].includes(ctx.cwd));
	}
	assert.match(appleScripts.ghostty, /new window with configuration/);
	assert.match(appleScripts.iterm2, /create window with default profile command/);
	assert.match(appleScripts.terminal, /do script launchCommand\n/);
	assert.ok(!appleScripts.terminal.includes(" in "));
});

test("Ghostty version gate runs before snapshot/window creation", async () => {
	await assert.rejects(prepareLauncher("ghostty", async () => "1.2.3", {}), /1.3.0/);
	assert.deepEqual(await prepareLauncher("ghostty", async () => "1.3.1", {}), { host: "ghostty" });
	await assert.rejects(prepareLauncher("herdr", async () => "{}", {}), /pane/);
});

test("shell quoting keeps paths and arguments literal, including apostrophes/newlines", (t) => {
	const { cwd } = fixture(t);
	const odd = "session '$HOME; $(touch SHOULD_NOT_EXIST)\n中文.jsonl";
	const snapshot = { path: join(cwd, odd), id: "id", name: "fork" };
	const invocation = [process.execPath, "-e", "console.log(JSON.stringify({cwd:process.cwd(),args:process.argv.slice(1)}))", "--"];
	const command = resumeCommand(cwd, snapshot, invocation, {});
	const result = JSON.parse(execFileSync("/bin/sh", ["-c", command], { encoding: "utf8" }));
	assert.equal(result.cwd, realpathSync(cwd));
	assert.deepEqual(result.args, ["--session", snapshot.path, "--session-dir", cwd]);
	assert.throws(() => shellQuote("bad\0value"), /NUL/);
});

test("launch environment never copies session identity, terminal identity, or credentials", () => {
	const env = { PATH: "/custom", PI_CODING_AGENT_DIR: "/config with space", HERDR_ENV: "1", PI_SESSION_FILE: "/original", TERM_PROGRAM: "ghostty", OPENAI_API_KEY: "secret" };
	const result = launchEnvironment(env);
	assert.ok(result.some((v) => v.startsWith("PATH=")));
	assert.ok(result.includes("PI_CODING_AGENT_DIR=/config with space"));
	assert.ok(result.every((v) => !v.includes("secret") && !v.startsWith("HERDR_") && !v.startsWith("PI_SESSION_") && !v.startsWith("TERM_")));
	assert.deepEqual(piInvocation(["node", join(packageDir, "dist/cli.js")], process.execPath), [realpathSync(process.execPath), realpathSync(join(packageDir, "dist/cli.js"))]);
});

test("command rejects arguments, busy/queued/noninteractive calls without writing or launching", async (t) => {
	const f = fixture(t);
	const calls = [];
	const handler = makeHandler(dependencies(fakeHerdrRun(calls)));
	await handler("some-id", f.ctx);
	await handler("", { ...f.ctx, isIdle: () => false });
	await handler("", { ...f.ctx, hasPendingMessages: () => true });
	await handler("", { ...f.ctx, mode: "rpc" });
	assert.equal(calls.length, 0);
	assert.equal(readdirSync(f.sessions).length, 0);
	assert.deepEqual(f.notifications, [
		{ message: "Usage: /forkme (no arguments).", level: "warning" },
		{ message: "Agent busy. Try again when idle.", level: "warning" },
		{ message: "Agent busy. Try again when idle.", level: "warning" },
		{ message: "/forkme requires interactive mode.", level: "error" },
	]);
});

test("command success creates exactly one fork without changing the current session", async (t) => {
	const f = fixture(t);
	f.manager.appendMessage(user("original"));
	f.manager.appendMessage(assistant("original reply"));
	const originalPath = f.manager.getSessionFile();
	const before = readFileSync(originalPath, "utf8");
	const calls = [];
	await makeHandler(dependencies(fakeHerdrRun(calls)))("", f.ctx);
	assert.equal(readdirSync(f.sessions).length, 2);
	assert.equal(f.manager.getSessionFile(), originalPath);
	assert.equal(readFileSync(originalPath, "utf8"), before);
	assert.equal(f.notifications.at(-1).level, "info");
	assert.equal(f.notifications.at(-1).message, "Fork opened in Herdr tab created-tab.");
});

test("failed launch preserves snapshot/tab and provides recovery without retrying", async (t) => {
	const f = fixture(t);
	const calls = [];
	await makeHandler(dependencies(fakeHerdrRun(calls, true)))("", f.ctx);
	assert.equal(readdirSync(f.sessions).length, 1);
	assert.equal(calls.filter((c) => c.args[0] === "agent").length, 1);
	assert.ok(!calls.some((c) => c.args.includes("close")));
	assert.equal(f.notifications.at(-1).level, "error");
	assert.equal(f.notifications.at(-1).message, "/forkme: Check Herdr tab created-tab (pane created-pane) before retrying. startup timed out");
	assert.equal(f.widgets.at(-1).lines[0], "Fork saved. Do not open it twice.");
	assert.equal(f.widgets.at(-1).lines[2], "Check the new tab/window. If not running, use:");
	assert.ok(f.widgets.at(-1).lines.some((line) => line.includes("--session")));
});

test("unsupported environment fails without creating a snapshot", async (t) => {
	const f = fixture(t);
	await makeHandler(dependencies(async () => { throw new Error("must not run"); }, { TERM_PROGRAM: "unknown" }))("", f.ctx);
	assert.equal(readdirSync(f.sessions).length, 0);
	assert.equal(f.notifications.at(-1).level, "error");
});

test("ephemeral sessions require confirmation before saving", async (t) => {
	const f = fixture(t);
	f.ctx.sessionManager = SessionManager.inMemory(f.cwd);
	let asked = false;
	f.ctx.ui.confirm = async (title, message) => {
		assert.equal(title, "Save temporary session?");
		assert.equal(message, "Forking saves this session to disk. Continue?");
		asked = true;
		return false;
	};
	const calls = [];
	await makeHandler(dependencies(fakeHerdrRun(calls)))("", f.ctx);
	assert.equal(asked, true);
	assert.equal(calls.length, 0);
	assert.equal(readdirSync(f.sessions).length, 0);
});

test("duplicate invocation is blocked and state is rechecked after async preflight", async (t) => {
	const f = fixture(t);
	let release;
	const pending = new Promise((resolve) => { release = resolve; });
	const handler = makeHandler(dependencies(async () => pending));
	const first = handler("", f.ctx);
	await handler("", f.ctx);
	assert.equal(f.notifications.at(-1).message, "Fork already in progress.");
	f.ctx.isIdle = () => false;
	release(JSON.stringify({ result: { pane: { workspace_id: "current" } } }));
	await first;
	assert.equal(readdirSync(f.sessions).length, 0);
	assert.equal(f.notifications.at(-1).message, "Session changed. Run /forkme again.");
});

test("extension loads through Pi's actual extension loader and registers /forkme", async () => {
	const { loadExtensions } = await import(pathToFileURL(join(packageDir, "dist/core/extensions/loader.js")).href);
	const loaded = await loadExtensions([join(extensionDir, "index.ts")], extensionDir);
	assert.deepEqual(loaded.errors, []);
	assert.equal(loaded.extensions.length, 1);
	assert.equal(loaded.extensions[0].commands.get("forkme").description, "Fork this session into a new tab or window");
});

const nativeApps = {
	ghostty: "/Applications/Ghostty.app",
	iterm2: "/Applications/iTerm.app",
	terminal: "/System/Applications/Utilities/Terminal.app",
};
for (const [host, script] of Object.entries(appleScripts)) {
	test(`${host} AppleScript compiles against its installed dictionary (no window opened)`, {
		skip: process.platform !== "darwin" || !existsSync(nativeApps[host]),
	}, (t) => {
		const f = fixture(t);
		execFileSync("/usr/bin/osacompile", ["-o", join(f.dir, `${host}.scpt`), "-e", script], { encoding: "utf8" });
	});
}
