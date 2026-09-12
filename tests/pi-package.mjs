import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Tests use the repository's pinned dev dependency, never a global Pi install.
export const packageDir = resolve(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "..");
