# v1.1 TypeScript reference implementation

This directory preserves the original engine and interface for regression and
cross-language parity tests. It is not imported by the browser application or
included in release archives. React is a development-only dependency for the
historical UI tests. The production game lives in the Rust workspace.

Node benchmark/tuning harnesses reuse these board/feature data helpers, but run
search through `src/wasm/engine.ts`, which loads the released WebAssembly engine.
