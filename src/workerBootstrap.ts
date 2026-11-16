import init, { start_worker } from "../generated/worker/worker.js";
try {
  await init();
  start_worker();
} catch (error) {
  self.postMessage({
    type: "init-error",
    message: `Could not load the WebAssembly engine: ${error instanceof Error ? error.message : String(error)}`,
  });
}
