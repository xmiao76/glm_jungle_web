import {
  readFile,
  writeFile,
  readdir,
  copyFile,
  mkdir,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { zipSync } from "fflate";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const root = resolve("dist");
async function files(dir, prefix = "") {
  let out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink())
      throw Error("Release output must not contain symbolic links");
    if (e.isDirectory())
      out.push(...(await files(resolve(dir, e.name), prefix + e.name + "/")));
    else out.push(prefix + e.name);
  }
  return out.sort();
}
function command(name, args) {
  try {
    return execFileSync(name, args, {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch {
    return "unavailable";
  }
}
if (process.argv[2] === "manifest") {
  await copyFile("tools/serve.mjs", "dist/serve.mjs");
  await writeFile(
    "dist/start.cmd",
    '@echo off\r\nnode "%~dp0serve.mjs" %*\r\nif errorlevel 1 pause\r\n',
  );
  await writeFile(
    "dist/start.sh",
    '#!/bin/sh\nexec node "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/serve.mjs" "$@"\n',
  );
  await writeFile(
    "dist/README.txt",
    `Jungle v${pkg.version} — WebAssembly release\n\nRequires Node.js 22+ and a current desktop browser. No npm install needed.\nWindows: double-click start.cmd\nAll systems: node serve.mjs\nOptional: node serve.mjs --port 4174 --no-open\nThe launcher opens http://127.0.0.1:4173/. Ctrl+C stops it.\nDo not open index.html directly from disk.\n\nThe entire game runs locally in WebAssembly. No internet connection is needed.\nTest this extracted archive, then distribute the original ZIP unchanged.\n`,
  );
  const all = (await files(root)).filter((f) => f !== "manifest.json");
  const assets = {};
  for (const f of all) assets[f] = hash(await readFile(resolve(root, f)));
  if (
    !all.includes("index.html") ||
    all.filter((f) => f.endsWith(".wasm")).length !== 2
  )
    throw Error(
      "Build must contain the application and AI WebAssembly modules",
    );
  const manifest = {
    version: pkg.version,
    revision: command("git", ["rev-parse", "HEAD"]),
    dirty: command("git", ["status", "--porcelain"]).length > 0,
    builtAt: new Date().toISOString(),
    toolchain: {
      node: process.versions.node,
      rust: command("rustc", ["--version"]),
      wasmPack: command("wasm-pack", ["--version"]),
    },
    assets,
  };
  await writeFile(
    "dist/manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(`Recorded ${all.length} release assets for v${pkg.version}.`);
} else {
  const manifest = JSON.parse(
    await readFile(resolve(root, "manifest.json"), "utf8").catch(() => {
      throw Error("Run npm run build before packaging.");
    }),
  );
  if (manifest.version !== pkg.version)
    throw Error("Build version differs from package.json; build and retest.");
  const all = await files(root);
  const expected = [...Object.keys(manifest.assets), "manifest.json"].sort();
  if (JSON.stringify(all) !== JSON.stringify(expected))
    throw Error("Build file list changed; rebuild and retest.");
  const zip = {};
  for (const f of all) {
    const bytes = await readFile(resolve(root, f));
    if (f !== "manifest.json" && hash(bytes) !== manifest.assets[f])
      throw Error(`Built asset changed: ${f}. Rebuild and retest.`);
    zip[`jungle-web-v${pkg.version}/${f}`] = [
      new Uint8Array(bytes),
      { mtime: new Date("2026-01-01T00:00:00Z") },
    ];
  }
  await mkdir("releases", { recursive: true });
  const name = `jungle-web-v${pkg.version}.zip`;
  const target = resolve("releases", name);
  if (
    await stat(target).then(
      () => true,
      () => false,
    )
  )
    throw Error(
      `${name} already exists. Preserve the tested release or choose a new version.`,
    );
  const bytes = zipSync(zip, { level: 9 });
  await writeFile(target, bytes, { flag: "wx" });
  await writeFile(target + ".sha256", `${hash(bytes)}  ${name}\n`);
  console.log(
    `Created ${target}\nNo rebuild or upload occurred. Extract, test, and distribute this same ZIP.`,
  );
}
