import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ForkSnapshot } from "./snapshot.ts";

export type Host = "herdr" | "ghostty" | "iterm2" | "terminal";
export type Run = (command: string, args: string[], timeout?: number) => Promise<string>;
export type Launcher =
	| { host: "herdr"; binary: string; workspaceId: string }
	| { host: "ghostty" | "iterm2" | "terminal" };

export function detectHost(env: NodeJS.ProcessEnv, platform: string): Host {
	// Prefer the inner host, even when TERM_PROGRAM says Ghostty/iTerm2.
	if (env.HERDR_ENV === "1") return "herdr";
	if (env.SSH_CONNECTION || env.SSH_TTY || env.SSH_CLIENT) {
		throw new Error("Plain SSH is unsupported. Use Herdr on the remote host.");
	}
	if (env.TMUX || env.STY) throw new Error("tmux/screen is unsupported. Run Pi directly or in Herdr.");
	if (platform !== "darwin") throw new Error("Native windows require macOS. Use Herdr on other systems.");
	switch (env.TERM_PROGRAM?.toLowerCase()) {
		case "ghostty": return "ghostty";
		case "iterm.app": return "iterm2";
		case "apple_terminal": return "terminal";
		default: throw new Error(`Unsupported terminal: ${env.TERM_PROGRAM || "unknown"}. No fork created.`);
	}
}

function parseHerdr(text: string): Record<string, any> {
	const response = JSON.parse(text);
	if (response.error) throw new Error(`Herdr: ${JSON.stringify(response.error)}`);
	if (!response.result || typeof response.result !== "object") throw new Error("Invalid Herdr response.");
	return response.result;
}

export async function prepareLauncher(host: Host, run: Run, env: NodeJS.ProcessEnv): Promise<Launcher> {
	if (host === "herdr") {
		if (env.HERDR_ENV !== "1" || !env.HERDR_PANE_ID) throw new Error("Missing Herdr caller pane.");
		const binary = env.HERDR_BIN_PATH || "herdr";
		// Resolve the live caller, not the UI-focused pane or a possibly stale
		// HERDR_WORKSPACE_ID after the current pane has been moved.
		const current = parseHerdr(await run(binary, ["pane", "current", "--current"]));
		const workspaceId = current.pane?.workspace_id;
		if (typeof workspaceId !== "string" || !workspaceId) throw new Error("Cannot find the current Herdr workspace.");
		return { host, binary, workspaceId };
	}
	if (host === "ghostty") {
		const version = (await run("/usr/bin/osascript", ["-e", 'tell application "Ghostty" to get version'])).trim();
		const match = /^(\d+)\.(\d+)/.exec(version);
		if (!match || Number(match[1]) < 1 || (Number(match[1]) === 1 && Number(match[2]) < 3)) {
			throw new Error(`Ghostty 1.3.0+ required (found: ${version || "unknown"}).`);
		}
	}
	return { host };
}

export function shellQuote(value: string): string {
	if (value.includes("\0")) throw new Error("Invalid NUL character in argument.");
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

/** Pin the current Node/Pi installation instead of relying on a GUI app's PATH. */
export function piInvocation(argv = process.argv, execPath = process.execPath): string[] {
	try {
		const entry = realpathSync(argv[1]);
		const manifest = JSON.parse(readFileSync(join(dirname(entry), "..", "package.json"), "utf8"));
		if (basename(entry) === "cli.js" && manifest.name === "@earendil-works/pi-coding-agent") {
			return [realpathSync(execPath), entry];
		}
	} catch { /* SDK/custom launchers: use Pi from the preserved PATH. */ }
	return ["pi"];
}

// Do not copy HERDR_*, TERM_*, PI_SESSION_*, or credentials into a different
// terminal. Keep Pi configuration and tool discovery consistent across windows.
export function launchEnvironment(env: NodeJS.ProcessEnv): string[] {
	const values: string[] = [];
	if (env.PATH) values.push(`PATH=${dirname(realpathSync(process.execPath))}:${env.PATH}`);
	for (const key of ["PI_CODING_AGENT_DIR", "PI_CODING_AGENT_SESSION_DIR", "PI_PACKAGE_DIR", "PI_OFFLINE", "PI_SKIP_VERSION_CHECK", "PI_TELEMETRY"]) {
		if (env[key] !== undefined) values.push(`${key}=${env[key]}`);
	}
	return values;
}

export function resumeArgs(snapshot: ForkSnapshot): string[] {
	return ["--session", snapshot.path, "--session-dir", dirname(snapshot.path)];
}

export function resumeCommand(cwd: string, snapshot: ForkSnapshot, invocation: string[], env: NodeJS.ProcessEnv): string {
	const script = `cd ${shellQuote(cwd)} && exec ${["/usr/bin/env", ...launchEnvironment(env), ...invocation, ...resumeArgs(snapshot)].map(shellQuote).join(" ")}`;
	// The outer command works both as a terminal's executable command and as text
	// entered into an interactive shell. No session/path is interpolated into AppleScript.
	return `/bin/sh -c ${shellQuote(script)}`;
}

export const appleScripts = {
	ghostty: `on run argv
	set workDir to item 1 of argv
	set launchCommand to item 2 of argv
	tell application "Ghostty"
		set cfg to new surface configuration
		set initial working directory of cfg to workDir
		set command of cfg to launchCommand
		new window with configuration cfg
		activate
	end tell
end run`,
	iterm2: `on run argv
	set launchCommand to item 2 of argv
	tell application id "com.googlecode.iterm2"
		create window with default profile command launchCommand
		activate
	end tell
end run`,
	terminal: `on run argv
	set launchCommand to item 2 of argv
	tell application "Terminal"
		do script launchCommand
		activate
	end tell
end run`,
};

export async function launchFork(
	launcher: Launcher,
	snapshot: ForkSnapshot,
	cwd: string,
	run: Run,
	env: NodeJS.ProcessEnv,
	invocation: string[],
	focus = true,
): Promise<string> {
	if (launcher.host !== "herdr") {
		const command = resumeCommand(cwd, snapshot, invocation, env);
		await run("/usr/bin/osascript", ["-e", appleScripts[launcher.host], "--", cwd, command], 60_000);
		return {
			ghostty: "a new Ghostty window",
			iterm2: "a new iTerm2 window",
			terminal: "a new Terminal window",
		}[launcher.host];
	}
	// Check again immediately before any mutating Herdr command.
	if (env.HERDR_ENV !== "1") throw new Error("Not running in Herdr.");
	const { binary, workspaceId } = launcher;
	// Focus at creation, not after agent readiness: a delayed focus would override
	// any tab the user manually selected while the new Pi was starting.
	const args = ["tab", "create", "--workspace", workspaceId, "--cwd", cwd, "--label", snapshot.name, focus ? "--focus" : "--no-focus"];
	for (const value of launchEnvironment(env)) args.push("--env", value);
	const created = parseHerdr(await run(binary, args));
	const tabId = created.tab?.tab_id;
	const paneId = created.root_pane?.pane_id;
	if (typeof tabId !== "string" || typeof paneId !== "string") throw new Error("Missing Herdr tab/pane ID. Check the new tab.");
	try {
		await run(binary, [
			"agent", "start", `fork-${snapshot.id.slice(-12)}`, "--kind", "pi", "--pane", paneId,
			"--timeout", "30000", "--", ...resumeArgs(snapshot),
		], 40_000);
	} catch (error) {
		// A timeout/permission prompt doesn't prove launch failed. Never auto-retry,
		// close the tab, or remove the snapshot: that could kill a live fork.
		throw new Error(`Check Herdr tab ${tabId} (pane ${paneId}) before retrying. ${error instanceof Error ? error.message : String(error)}`);
	}
	return `Herdr tab ${tabId}`;
}
