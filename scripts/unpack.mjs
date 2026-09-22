import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { unzipSync } from "fflate";

const root = process.cwd();
const archivePath = join(root, "bundle", "market-radar-v53-deploy-source.zip");
const files = unzipSync(new Uint8Array(readFileSync(archivePath)));
const prefix = "market-radar-v53/";

for (const [name, data] of Object.entries(files)) {
  if (!name.startsWith(prefix) || name.endsWith("/")) continue;
  const rel = name.slice(prefix.length);
  if (!rel || rel === "package.json") continue;
  const out = join(root, rel);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, data);
}
console.log("SCOUT v53 source restored for Vercel build");
