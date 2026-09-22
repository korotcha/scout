import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
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

function stripTsImportExtensions(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name !== "node_modules" && name !== ".next" && name !== "bundle") stripTsImportExtensions(full);
      continue;
    }
    if (!/\.(ts|tsx|mts|cts)$/.test(name)) continue;
    let text = readFileSync(full, "utf8");
    text = text.replace(/(['"])(\.\.?\/[^'"]+?)\.ts\1/g, "$1$2$1");
    writeFileSync(full, text);
  }
}

function awaitImportFs() {
  return globalThis.__scoutFs ??= (() => {
    const fs = require("node:fs");
    return { readdirSync: fs.readdirSync, statSync: fs.statSync };
  })();
}

function replaceInFile(rel, replacements) {
  const path = join(root, rel);
  let text = readFileSync(path, "utf8");
  for (const [from, to] of replacements) text = text.split(from).join(to);
  writeFileSync(path, text);
}

extract(
  readFileSync(join(root, "bundle", "market-radar-v53-deploy-source.zip")),
  "market-radar-v53/",
  true,
);

const overlayB64 = [0, 1, 2, 3, 4, 5]
  .map((i) => readFileSync(join(root, "bundle", `vercel-overrides.${String(i).padStart(2, "0")}`), "utf8"))
  .join("");

extract(Buffer.from(overlayB64, "base64"));

const secretFallbacks = [
  ["process.env.INTEGRATION_ENCRYPTION_KEY ?? ''", "(process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.SCOUT_PASSWORD ?? '')"],
  ['process.env.INTEGRATION_ENCRYPTION_KEY ?? ""', '(process.env.INTEGRATION_ENCRYPTION_KEY ?? process.env.SCOUT_PASSWORD ?? "")'],
  ['process.env.INTEGRATION_ENCRYPTION_KEY??""', '(process.env.INTEGRATION_ENCRYPTION_KEY??process.env.SCOUT_PASSWORD??"")'],
];
for (const rel of [
  "app/api/search-demand/route.ts",
  "app/api/query-competitors/route.ts",
  "app/api/query-analysis/route.ts",
  "app/api/connections/route.ts",
]) replaceInFile(rel, secretFallbacks);

replaceInFile("app/api/research-report/route.ts", [
  ["new Response(object.body,", "new Response(new Uint8Array(object.body),"],
]);

replaceInFile("app/api/uploads/route.ts", [
  ["new Response(object.body,", "new Response(new Uint8Array(object.body),"],
]);

stripTsImportExtensions(root);
console.log("SCOUT v53 source restored + Vercel/Neon overlay + normalized TS imports");
