import { readFileSync, writeFileSync } from "node:fs";

const slug = process.argv[2];
if (process.argv.length !== 3 || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug || "")) {
	console.error("Usage: node scripts/set-repository.mjs GITHUB_OWNER/REPOSITORY");
	process.exit(1);
}
const path = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(readFileSync(path, "utf8"));
const url = `https://github.com/${slug}`;
pkg.repository = { type: "git", url: `git+${url}.git` };
pkg.homepage = `${url}#readme`;
pkg.bugs = { url: `${url}/issues` };
writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log(`Set package repository metadata to ${url}. Review and commit the change before publishing.`);
