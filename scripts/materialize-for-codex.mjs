import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const unpack = join(root, "scripts", "unpack.mjs");
if (!existsSync(unpack)) throw new Error("scripts/unpack.mjs not found");

execFileSync(process.execPath, [unpack], { cwd: root, stdio: "inherit" });

const pkgPath = join(root, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.scripts = {
  dev: "next dev",
  build: "next build",
  start: "next start",
  test: "node --test tests/*.test.mjs"
};
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

const gitignorePath = join(root, ".gitignore");
const gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
const additions = ["node_modules", ".next", ".vercel", ".env", ".env.local", "*.log"];
const lines = new Set(gitignore.split(/\r?\n/).filter(Boolean));
for (const item of additions) lines.add(item);
writeFileSync(gitignorePath, [...lines].join("\n") + "\n");

rmSync(join(root, "bundle"), { recursive: true, force: true });
rmSync(unpack, { force: true });

console.log("\nSCOUT materialized for Codex.");
console.log("Next: npm install && npm run build && npm test");
console.log("Then review git diff and commit the normal source tree.");
