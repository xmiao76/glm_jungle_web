import { spawnSync } from "node:child_process";
import { watch } from "node:fs";
import { createServer } from "vite";
function build() {
  const result = spawnSync(
    process.execPath,
    ["tools/wasm-build.mjs", "--dev"],
    { stdio: "inherit", windowsHide: true },
  );
  return result.status === 0;
}
if (!build()) process.exit(1);
const server = await createServer({ server: { host: "127.0.0.1" } });
await server.listen();
server.printUrls();
let timer;
watch("crates", { recursive: true }, (_event, file) => {
  if (!file?.endsWith(".rs") && !file?.endsWith(".toml")) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (build()) server.ws.send({ type: "full-reload" });
  }, 300);
});
