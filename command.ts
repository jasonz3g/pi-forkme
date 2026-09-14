import type { ExtensionCommandContext, SessionManager } from "@earendil-works/pi-coding-agent";
import { detectHost, launchFork, prepareLauncher, resumeCommand, type Run } from "./launch.ts";
import { createSnapshot, normalizeForkName, type ForkSnapshot } from "./snapshot.ts";

export interface Dependencies {
	run: Run;
	env: NodeJS.ProcessEnv;
	platform: string;
	Manager: typeof SessionManager;
	invocation: string[];
	isActive?: () => boolean;
}

export function makeHandler(deps: Dependencies) {
	let launching = false;
	return async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("/forkme requires interactive mode.", "error");
			return;
		}
		if (launching) {
			ctx.ui.notify("Fork already in progress.", "warning");
			return;
		}
		const idle = () => ctx.isIdle() && !ctx.hasPendingMessages();
		if (!idle()) {
			ctx.ui.notify("Agent busy. Try again when idle.", "warning");
			return;
		}

		launching = true;
		let snapshot: ForkSnapshot | undefined;
		try {
			const name = normalizeForkName(args);
			const sourceId = ctx.sessionManager.getSessionId();
			const sourceLeaf = ctx.sessionManager.getLeafId();
			const host = detectHost(deps.env, deps.platform);
			if (!ctx.sessionManager.getSessionFile()) {
				const confirmed = await ctx.ui.confirm("Save temporary session?", "Forking saves this session to disk. Continue?");
				if (!confirmed) return;
			}
			const launcher = await prepareLauncher(host, deps.run, deps.env);
			if (deps.isActive && !deps.isActive()) return;
			if (!idle() || sourceId !== ctx.sessionManager.getSessionId() || sourceLeaf !== ctx.sessionManager.getLeafId()) {
				ctx.ui.notify("Session changed. Run /forkme again.", "warning");
				return;
			}
			// No await between reading the live manager and persisting the snapshot.
			snapshot = createSnapshot(ctx, deps.Manager, name);
			const destination = await launchFork(launcher, snapshot, ctx.cwd, deps.run, deps.env, deps.invocation);
			if (deps.isActive && !deps.isActive()) return;
			ctx.ui.setWidget("forkme-recovery", undefined);
			ctx.ui.notify(`Fork opened in ${destination}.`, "info");
		} catch (error) {
			if (deps.isActive && !deps.isActive()) return;
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`/forkme: ${message}`, "error");
			if (snapshot) {
				ctx.ui.setWidget("forkme-recovery", [
					"Fork saved. Do not open it twice.",
					`Session: ${snapshot.path}`,
					"Check the new tab/window. If not running, use:",
					resumeCommand(ctx.cwd, snapshot, deps.invocation, deps.env),
				]);
			}
		} finally {
			launching = false;
		}
	};
}
