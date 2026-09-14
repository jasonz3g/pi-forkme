import { SessionManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { makeHandler } from "./command.ts";
import { piInvocation, type Run } from "./launch.ts";

export default function forkme(pi: ExtensionAPI) {
	let active = true;
	pi.on("session_shutdown", async () => { active = false; });
	pi.on("session_start", async () => { active = true; });

	const run: Run = async (command, args, timeout = 15_000) => {
		const result = await pi.exec(command, args, { timeout });
		if (result.killed || result.code !== 0) {
			throw new Error(`${command} ${result.killed ? "timed out" : `exited with code ${result.code}`}: ${(result.stderr || result.stdout).trim().slice(0, 1800)}`);
		}
		return result.stdout;
	};

	pi.registerCommand("forkme", {
		description: "Fork this session into a new tab or window (usage: /forkme [name])",
		handler: makeHandler({
			run, env: process.env, platform: process.platform,
			Manager: SessionManager, invocation: piInvocation(), isActive: () => active,
		}),
	});
}
