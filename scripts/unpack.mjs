import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const parts = Array.from({ length: 7 }, (_, i) =>
  readFileSync(join(root, "bundle", `part.${String(i).padStart(2, "0")}`), "utf8")
).join("");

const archive = join("/tmp", "scout-market-radar.tgz");
writeFileSync(archive, Buffer.from(parts, "base64"));
execFileSync("tar", ["-xzf", archive, "-C", root], { stdio: "inherit" });
try { unlinkSync(archive); } catch {}
console.log("SCOUT source restored for Vercel build");
