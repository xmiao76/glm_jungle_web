# Jungle — Web Edition

A browser-based Jungle (Dou Shou Qi / Animal Chess) board game with a built-in
AI, deployed as a fully static app on Cloudflare Pages. Play it here:

**https://glm-jungle.pages.dev**

This is the web version of the Windows desktop Jungle game
(`glm.z_cc_jungle`, Python + Pygame), rewritten in TypeScript with the same
rules, the same visual design, and a substantially stronger AI.

## How to Play

- Visit the URL above — nothing to install, works offline after load (no
  network calls at all).
- Pick **Human vs AI**, then choose your color and who moves first (four
  independent combinations, e.g. play Blue but let the AI open).
- Click one of your pieces to select it. Legal moves show as white dots
  (quiet moves) or red rings (captures). Click a highlighted square to move.
  Click the same piece again to deselect; click another own piece to switch.
- Win by entering the enemy **den** (the marked home square) or by capturing
  every enemy piece. Draw on 3-fold repetition or after 400 moves.

## Controls

| Input | Action |
|---|---|
| Click / tap | Select piece, move to square |
| `U` or `Ctrl+Z` / Undo button | Take back your last move pair (Human vs AI) |
| `F` | Flip the board view (display only — never changes game state or turn) |
| `M` / Sound button | Mute or unmute sound effects |
| `ESC` | Return to menu |

The side panel also shows a live move history (captures marked with x) and the
engine card (search depth, score, speed, difficulty). The main menu includes a
complete "How to play" guide and build credits (model, code agent, engine
version).

## Game Modes & Difficulty

- **Human vs AI** — choose side (Blue/Red) and first mover independently.
- **AI vs AI** — watch two engines play; choose who opens.
- **Difficulty** (click to cycle on the main menu): Easy (0.4 s, depth 3),
  Medium (1.2 s), Hard (3.0 s).

## Piece Rankings (high → low)

8 象 Elephant · 7 狮 Lion · 6 虎 Tiger · 5 豹 Leopard · 4 狼 Wolf · 3 狗 Dog ·
2 猫 Cat · 1 鼠 Rat

Specials: the Rat can capture the Elephant (from land only) and is the only
piece that can swim; the Elephant cannot capture the Rat; a Lion leaps both
river crossings (up to 3 water squares), the Tiger only the 2-square
crossing; any rat in the water blocks a leap; an opponent's trap reduces your
piece's rank to 0.

## AI Architecture & Strength

Everything runs client-side: the engine and AI are a runtime-agnostic
TypeScript package executed inside a Web Worker (the UI never blocks).

- **Search**: iterative-deepening PVS with quiescence, transposition table
  (dual 32-bit Zobrist keys), killer/history move ordering, MVV-LVA, LMR with
  re-search, aspiration windows, futility pruning, and repetition-aware draw
  scoring. Zero allocations in the hot path (typed arrays, encoded int moves).
- **Evaluation**: material x10 (dominant) + BFS den-distance pressure/defense
  (rivers cost what they really cost), piece-square tables, mobility,
  rat-elephant matchup, trap danger, and an endgame den-race term.

Measured strength against the desktop Python engine on the same machine
(seeded random openings, alternating colors, equal time budgets) — full logs
in [`docs/strength-results.md`](docs/strength-results.md):

- **Node throughput: 18–28x** the Python engine (835k–2.5M nps vs 45–90k),
  reaching **4–10 more plies** in identical budgets (depth 10-12 vs 6 from
  the start position at 1.2–3 s).
- Every search heuristic was **re-tested by duels at the new depth profile**:
  RFP and null-move stay OFF (50.0% each — no gain), aggressive LMR confirmed
  (fixed-1-ply scored 33.8%), futility confirmed ON (46.3% when disabled),
  den-threat extension neutral (57.5% then 50.8% on confirmation — kept ON).
- **Evaluation tuning** (Texel-style logistic fit on 7,508 self-play samples,
  RMSProp + coordinate pass): the fit only improved the loss by pushing
  weights outside sanity bounds (self-play outcome leakage), so the duel gate
  refused the change — the shipped weights stay the duel-proven set.
- **Cross-language gate**: **TS 34 – 1 Python – 5 draws (91.3%)** over 40
  games at equal 3 s/move budgets with alternating colors and seeded random
  openings (gate: >= 65%). Full log: docs/strength-results.md §3.

## Development

```bash
npm install          # dependencies
npm run dev          # vite dev server
npm test             # vitest suite (engine rules, AI cross-validation, search, UI)
npm run build        # typecheck + production build
npm run bench        # depth/nps benchmark (add -- 1.0 for budget)
npm run duel:local   # in-process config duels (--a rfp --b base --games 40 --time 0.15)
npm run selfplay     # generate tuning data (--games 100 --time 0.08)
npm run tune         # Texel tuning with duel gate (--data data/....jsonl)
npm run duel         # cross-language duel vs the Python engine (--games 40 --time 3 --parallel 4)
npm run deploy       # build + deploy to Cloudflare Pages
```

The cross-language duel drives the desktop Python engine through
`tools/py_duel_engine.py` (expects the desktop repo at `C:\GitHub\glm.z_cc_jungle`).

### Layout

```
src/engine/    rules core (Board, rules, draw conventions) — ported 1:1
src/ai/        position core, search, evaluation, weights, TT (TypeScript)
src/worker/    AI Web Worker + typed message protocol
src/ui/        Canvas board renderer, procedural animal art, React shell
src/bench/     benchmark / duel / selfplay / tune harnesses (Node CLIs)
tools/         Python duel driver, browser smoke tests (Playwright)
tests/         vitest suite — includes fuzz tests asserting the fast AI
               move generator is exactly equivalent to the rules engine
```

### Testing

- `tests/rules.test.ts` + `board.test.ts`: full desktop rule-suite port.
- `tests/position.test.ts`: fuzz cross-validation (movegen, Zobrist keys,
  material, make/undo) — rules legality can never drift during strength work.
- `tests/search.test.ts`: PVS equivalence vs plain alpha-beta, abort safety,
  quiescence/LMR soundness, TT mate normalization, repetition awareness.
- `tests/evaluation.test.ts`: BFS maps, PSTs, material-dominance invariant.
- `tests/integration.test.ts`: full AI-vs-AI games, den-win scenarios, draw rule.
- `tools/browserCheck.mjs` / `tools/browserFullGame.mjs`: Playwright checks of
  the live app, including a complete AI-vs-AI game to the win overlay.

## Deployment

Static assets on Cloudflare Pages (`npm run deploy`; SPA fallback via `public/_redirects`). An alternate Workers deployment exists (`npm run deploy:workers` → https://jungle-web.xmiao76.workers.dev). Every
deploy is validated on the live URL: loads, complete games finish, all
difficulty levels and both modes work, flip/panel/game-over messaging behave,
no console errors.

## Build Info

- **Code agent:** Claude Code (claude.ai/code)
- **Model:** GLM-5.3
- **Engine:** TypeScript port of the Python desktop engine with identical
  rules; search/evaluation re-architected for speed and re-validated by duels.
- **Deployment:** Cloudflare Pages (Vite build; alternate Workers deployment available).

*Released August 2026, engine v1.1.0. Based on the desktop Jungle game built
with the same prompt-driven workflow (see `prompt.md`). Sound effects are
synthesized in-browser with WebAudio; the mute preference persists locally.*
