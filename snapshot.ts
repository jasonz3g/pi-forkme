import type { ExtensionCommandContext, SessionManager } from "@earendil-works/pi-coding-agent";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

export interface ForkSnapshot {
	path: string;
	id: string;
	name: string;
}

type SnapshotContext = Pick<ExtensionCommandContext, "cwd" | "sessionManager" | "model" | "thinkingLevel">;

/** Match Pi's session-name normalization, then reject remaining ASCII controls. */
export function normalizeForkName(value?: string): string | undefined {
	const name = value?.replace(/[\r\n]+/g, " ").trim();
	if (!name) return undefined;
	if (/[\x00-\x1f\x7f]/.test(name)) {
		throw new Error("Session name must not contain control characters.");
	}
	return name;
}

/** Snapshot the live active branch, without ever mutating the original manager or file. */
export function createSnapshot(ctx: SnapshotContext, Manager: typeof SessionManager, requestedName?: string): ForkSnapshot {
	const customName = normalizeForkName(requestedName);
	const source = ctx.sessionManager;
	const sourceHeader = source.getHeader();
	if (!sourceHeader) throw new Error("Missing session header. Cannot fork.");

	const leafId = source.getLeafId();
	// The on-disk last entry is NOT necessarily the active leaf after /tree.
	// Use a detached in-memory manager so the SDK handles labels/compactions,
	// including re-chaining parents after label entries are removed.
	const copy = leafId
		? Manager.inMemory(ctx.cwd, undefined, structuredClone([sourceHeader, ...source.getEntries()]))
		: Manager.inMemory(ctx.cwd);
	if (leafId) copy.createBranchedSession(leafId);

	if (ctx.model) copy.appendModelChange(ctx.model.provider, ctx.model.id);
	if (ctx.thinkingLevel !== undefined) copy.appendThinkingLevelChange(ctx.thinkingLevel);
	const id = copy.getSessionId();
	// Remove inherited fork suffixes before truncating, including older nested names.
	const baseName = source.getSessionName()?.replace(/(?: · fork [0-9a-f]{8})+$/, "") || basename(ctx.cwd) || "Pi";
	const name = customName ?? `${baseName.slice(0, 80)} · fork ${id.slice(-8)}`;
	copy.appendSessionInfo(name);
	copy.appendCustomEntry("forkme", {
		sourceSessionId: source.getSessionId(),
		sourceLeafId: leafId,
	});

	const header = { ...copy.getHeader()!, cwd: ctx.cwd, parentSession: source.getSessionFile() };
	// Relative session directories are based on process.cwd(), not the session's cwd.
	// Pin the absolute path before the launcher changes directories to ctx.cwd.
	const dir = resolve(source.getSessionDir() || Manager.create(ctx.cwd).getSessionDir());
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const path = join(dir, `${header.timestamp.replace(/[:.]/g, "-")}_${id}.jsonl`);
	const data = [header, ...copy.getEntries()].map((entry) => JSON.stringify(entry)).join("\n") + "\n";
	// Persist even an empty/user-only session, which the SDK normally defers until
	// the first assistant response. The new process must have a real file to open.
	writeFileSync(path, data, { flag: "wx", mode: 0o600 });
	return { path, id, name };
}
