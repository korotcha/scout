import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { unzipSync } from "fflate";

const root = process.cwd();

function extract(zipBytes, prefix = "", skipPackage = false) {
  const files = unzipSync(new Uint8Array(zipBytes));
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith("/")) continue;
    let rel = name;
    if (prefix) {
      if (!name.startsWith(prefix)) continue;
      rel = name.slice(prefix.length);
    }
    if (!rel || (skipPackage && rel === "package.json")) continue;
    const out = join(root, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, data);
  }
}

extract(
  readFileSync(join(root, "bundle", "market-radar-v53-deploy-source.zip")),
  "market-radar-v53/",
  true,
);

const overlayB64 = [0, 1, 2, 3, 4]
  .map((i) => readFileSync(join(root, "bundle", `vercel-overrides.${String(i).padStart(2, "0")}`), "utf8"))
  .join("");

extract(Buffer.from(overlayB64, "base64"));
console.log("SCOUT v53 source restored + Vercel/Neon overlay");
