import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const dev = process.argv.includes("--dev");
const only = process.argv.includes("--worker-only");
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
if (!readFileSync("Cargo.toml", "utf8").includes(`version = "${version}"`))
  throw Error("package.json and Rust workspace versions differ");
mkdirSync("generated", { recursive: true });
for (const name of only ? ["worker"] : ["worker", "app"]) {
  const args = [
    "build",
    `crates/jungle-${name}`,
    "--target",
    "web",
    "--out-dir",
    resolve(`generated/${name}`),
    "--out-name",
    name,
    dev ? "--dev" : "--release",
    "--locked",
  ];
  const result = spawnSync("wasm-pack", args, {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error)
    throw Error(
      `wasm-pack is required. Install Rust, wasm32-unknown-unknown and wasm-pack. ${result.error.message}`,
    );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
