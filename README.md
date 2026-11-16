# Jungle — WebAssembly Edition

Jungle (Dou Shou Qi / Animal Chess), running entirely in your local browser.
Version **2.0.0** compiles the interface, Canvas artwork, rules, game controller,
sound handling, and AI to Rust/WebAssembly. The AI runs in a dedicated worker.
Small JavaScript loaders connect the WebAssembly modules to browser APIs.

The release is a downloadable ZIP. Build, test locally, and distribute it
manually. Build and packaging commands do not upload anything or publish a website.

## Play a release

1. Install **Node.js 22 or newer** and extract the complete release ZIP.
2. On Windows, double-click **start.cmd**. On any supported system, run
   `node serve.mjs` inside the extracted directory.
3. The launcher opens **http://127.0.0.1:4173/** in your browser. Stop it with
   **Ctrl+C** when finished.

No Rust installation, npm dependencies, account, or internet connection is needed
for playing an extracted release. Use a current desktop Chrome, Edge, or Firefox.
The launcher serves only the release directory on the loopback interface.

If port 4173 is occupied, run `node serve.mjs --port 4174`.
Use `--no-open` to print the URL without opening a browser.
Open the launcher URL rather than double-clicking `index.html` or a `.wasm` file:
browser modules and workers need the included HTTP loader.

## Build, test, and package

Development prerequisites: Node.js 22+, Rust **1.94.1** (pinned by
`rust-toolchain.toml`), the `wasm32-unknown-unknown` target, and **wasm-pack 0.15.0**.

```sh
rustup toolchain install 1.94.1 --target wasm32-unknown-unknown
cargo install wasm-pack --version 0.15.0 --locked
npm ci
npm run build
npm run preview
```

`npm run build` compiles both optimized WebAssembly modules, checks TypeScript,
bundles the application, and records release assets in `dist/manifest.json`.
`npm run preview` serves that exact output through the included launcher.

```sh
npm test                             # Rust, WASM/reference parity, regression, launcher/package tests
npx playwright install chromium firefox
npm run test:browser                  # local browser behavior and failure recovery
node tools/browserFullGame.mjs        # also complete an AI-vs-AI game and restart
npm run test:browser -- --firefox
npm run package
```

Packaging verifies every file against the build manifest and creates:

- `releases/jungle-web-v2.0.0.zip`
- `releases/jungle-web-v2.0.0.zip.sha256`

**Extract and test that ZIP, then distribute the same archive.** Packaging does
not rebuild. Changed or extra build files are rejected. Existing versioned ZIPs
are never overwritten; preserve the tested release and bump the version in both
`package.json` and the Cargo workspace for the next release.

The manifest records version, source revision, dirty-working-tree status,
toolchain versions, and SHA-256 hashes. The archive contains two `.wasm` modules,
HTML/CSS/JavaScript loaders, launchers, and instructions. It excludes source code,
Node dependencies, Rust build products, and Cloudflare tooling.

For development, `npm run dev` builds development WebAssembly modules and starts
Vite. Rust source edits trigger recompilation and a full browser reload. Use
`npm run typecheck` and `cargo clippy --workspace --target wasm32-unknown-unknown`
for static checks. Browser suites start their own loopback server by default;
`JUNGLE_TEST_ROOT` can point them at an extracted release directory.

## Playing the game

- Choose **Human vs AI**, then choose your color and first mover independently.
- Or choose **AI vs AI** and watch two engines play.
- Difficulty cycles through Easy (0.4 seconds, depth 3), Medium (1.2 seconds),
  and Hard (3 seconds).
- Click/tap a piece and a highlighted destination. White dots indicate quiet
  moves; red rings indicate captures.
- Enter the enemy den or capture every enemy piece to win. Threefold repetition
  and the 400-turn cap are draws. Having no legal move is a loss.

| Control | Action |
| --- | --- |
| U or Ctrl/Cmd+Z | Undo the last human/AI move pair |
| F | Flip the board view |
| M | Toggle sound; preference persists in local browser storage |
| Escape | Return to the menu and cancel any search |

Ranks: Elephant 8, Lion 7, Tiger 6, Leopard 5, Wolf 4, Dog 3, Cat 2, Rat 1.
Only Rats swim. A Rat can capture an Elephant from land; an Elephant cannot
capture a Rat. Lions jump up to three water squares and Tigers up to two; any
Rat in a river blocks the jump. Enemy traps reduce a piece's rank to zero.
The menu includes the full rules and credits.

## Architecture and engine tools

| Location | Purpose |
| --- | --- |
| `crates/jungle-core` | Rules, board representation, game state/undo, evaluation, search |
| `crates/jungle-app` | Yew interface, procedural Canvas rendering, input, sound, worker lifecycle |
| `crates/jungle-worker` | Worker initialization and WebAssembly engine API |
| `src/` | Browser loaders, styling, and Node benchmark adapters |
| `reference/` | Original v1.1 TypeScript implementation used only by development/tests |
| `tools/` | Build, local server, archive creation, browser tests, Python duel driver |

React is retained solely as a development dependency for the original reference
UI tests. It is absent from the production bundle. Production gameplay has no
JavaScript engine fallback. A load/search failure shows a retryable error without
incorrectly awarding a win or loss.

```sh
npm run bench -- 1.0
npm run duel:local -- --a base --b rfp --games 40 --time 0.15
npm run selfplay -- --games 100 --time 0.08
npm run tune -- --data data/selfplay-g100-t0.08-s11.jsonl
npm run duel -- --games 40 --time 3 --parallel 4
```

These harnesses run search through the same WebAssembly module as the browser.
TypeScript board/feature helpers remain as reference tooling; tuning never
changes shipped weights automatically. The Python duel expects the original
desktop repository at `C:\GitHub\glm.z_cc_jungle`. Its historical JSON labels
`ts`/`tsIsBlue` remain for log compatibility and now identify the WASM contestant.
Performance and strength evidence is recorded in
[docs/strength-results.md](docs/strength-results.md).

Original game: GLM-5.3 / Claude Code, based on the Python/Pygame Jungle game.
WebAssembly port: OpenAI Codex. The original specification is retained in
`prompt.md` as historical context; its website-deployment requirements are superseded.
