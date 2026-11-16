# AI Strength Results Log

Every strength-affecting change is gated by measurement. This file records the
evidence: benchmarks, config duels, and the final cross-language gate.
(Workstation: same machine runs both engines, so ratios are directly comparable.)

## 1. Node throughput (benchmark parity: same positions as desktop `bench/benchmark.py`)

Time budget 1.0 s per move, fresh TT per search. Node counts include quiescence.

| Position | Side | Python depth | Python nps | TS depth | TS nps | TS/Python nps |
|----------|------|--------------|------------|----------|--------|---------------|
| starting | Blue | 6 | 45,826 | 10 | 834,977 | **18.2x** |
| starting | Red | 6 | 44,080 | 11 | 890,579 | **20.2x** |
| midgame | Blue | 10 | 48,055 | 14 | 906,314 | **18.9x** |
| midgame | Red | 9 | 56,703 | 15 | 1,420,961 | **25.1x** |
| tactical | Blue | 17 | 89,534 | 28 | 2,381,283 | **26.6x** |
| tactical | Red | 18 | 89,661 | 28 | 2,545,060 | **28.4x** |

**Gate ">= 5x node throughput from the starting position": PASSED (18-20x).**
Search depth within equal budgets is 4-10 plies deeper across the board.

Environment: Python 3.12.9 (desktop repo `python -m bench.benchmark`) vs
Node 24.13.0 (`npm run bench -- 1.0`) on the same Windows machine (2026-08-18).

Per-budget depth from the starting position (equal budgets, both engines):

| Budget | Python depth (Blue/Red) | TS depth (Blue/Red) | TS nps |
|--------|-------------------------|---------------------|--------|
| 0.4 s  | 6 / 6                   | 9 / 9               | ~770k-900k |
| 1.2 s  | 6 / 6                   | 11 / 11            | ~860k-880k |
| 3.0 s  | 6 / 6                   | 11 / 12            | ~850k-860k |

(Python's predictive time management plateaus at depth 6 from the start
position even with a 3 s budget; the TS engine's higher nps converts the same
budgets into 3-6 extra plies.)

## 2. Config duels (in-process, TS-vs-TS)

Each candidate vs the shipped defaults, alternating colors, seeded random
openings (first 6 plies random), shared per-side TTs, 3-fold/400-move draw rule.
Score is from the candidate's perspective (win=1, draw=0.5).

| # | Change vs baseline | Budget | Games | W-L-D | Score | Verdict |
|---|--------------------|--------|-------|-------|-------|---------|
| 1 | rfp ON | 0.15s | 40 | 16-16-8 | 50.0% | No gain at TS depths (matches desktop's finding). **Keep OFF.** |
| 2 | null-move ON | 0.15s | 40 | 15-15-10 | 50.0% | No gain. **Keep OFF.** |
| 3 | LMR fixed 1-ply (vs aggressive) | 0.15s | 40 | 9-22-9 | 33.8% | **Aggressive LMR confirmed** (deep search makes reductions safe). |
| 4 | futility OFF | 0.15s | 40 | 14-17-9 | 46.3% | Futility confirmed mildly positive. **Keep ON.** |
| 5 | den-extension OFF | 0.15s | 40 | 19-13-8 | 57.5% | Suggestive -> retested. |
| 5b | den-extension OFF (confirm) | 0.2s | 60 | 21-20-19 | 50.8% | Pooled ~50.8% over 100 games: NEUTRAL. **Keep ON** (no change without evidence). |

Net result: every shipped default re-validated at the TS depth profile
(depth 8-11 vs Python's 5-6); no default flipped. The strength gain over the
desktop engine comes from raw speed (18-27x nps -> 4-10 extra plies) with the
duel-tuned heuristic set intact.

### 2b. Round 2 (v1.1, further levers)

| # | Candidate | Games | W-L-D | Score | Verdict |
|---|-----------|-------|-------|-------|---------|
| 6 | Countermove heuristic ON | 40 | 14-18-8 | 45.0% | **Rejected** — no gain over killers/history. |
| 7 | SEE-lite quiescence pruning ON | 40 | 12-17-11 | 43.8% | **Rejected** — loses tactical precision. |
| 8 | Both ON | 40 | 15-14-11 | 51.2% | **Rejected** — even. |
| - | TT 2^21 -> 2^22 | - | - | - | Not taken: 2^21 entries already covers 1-3M-node searches; doubling adds memory for no reachable depth. |
| - | Opening book / lazy-SMP | - | - | - | Skipped: marginal strength per complexity at current depth. |

All flags ship OFF (defaults unchanged); the engine remains behaviorally
identical to the configuration that scored 91.3% in the cross-language gate,
so no gate re-run was required.

## 3. Cross-language duel gate (TS Node vs desktop Python, equal budgets)

| Date | Budget | Games | TS wins | Python wins | Draws | TS score | Gate (>= 65%) |
|------|--------|-------|---------|--------------|-------|----------|---------------|
| 2026-08-19 | 3 s/move | 40 | **34** | 1 | 5 | **91.3%** | **PASSED** |

Setup: `npm run duel -- --games 40 --time 3 --parallel 4` — the TS engine in
Node vs the desktop Python engine via `tools/py_duel_engine.py`, colors
alternating, seeded 6-ply random openings, both engines with persistent
per-side transposition tables, draw rule enforced by the harness
(3-fold / 400 moves; 5 games ended in repetition draws, 35 by den entry or
capture-all, average 55 moves per game). Python's single win came as Blue
(seed 5008).

## 4. Tuning rounds

| # | What was tuned | Data | Result | Applied? |
|---|----------------|------|--------|----------|
| 1 | All positional weights (material frozen), logistic fit + RMSProp + coordinate pass | 7,508 samples from 100 self-play games @ 0.08s | Fit improved holdout only by pushing weights outside sanity bounds (e.g. negative advance weights -- self-play outcome leakage); inside bounds no holdout gain, so the duel gate was never reached | **No change** -- gate correctly refused. The desktop's weight set (itself duel-tuned over many rounds) remains the shipped evaluation. |
| 2 | Same, on leakage-resistant data (9,047 samples; mixed 0.05 s/0.15 s budgets; 10-ply random openings; 32% draws) | Fit DID improve holdout (0.16700 -> 0.16548) by zeroing the advance weights and spiking Elephant to 650 -- outcome leakage again. Duel gate: **16.7% win rate** | **REJECTED** -- outcome-prediction gains that play far worse. Conclusion: Texel tuning on self-play data does not beat this duel-tuned evaluation; the gate is load-bearing. |

Tuning tooling: `npm run selfplay`, `npm run tune` (see src/bench/tune.ts).
The pipeline enforces bounds (material ladder, material-dominance) and the
duel gate is the final arbiter, mirroring bench/tune.py.

## 5. WebAssembly release (v2.0.0, 2026-11-16)

The application UI, Canvas artwork, game controller, rules, evaluation, and
search now run in Rust/WebAssembly. Node engine tools load the same worker
module as the browser. The original TypeScript implementation in `reference/`
remains a development oracle; it is not included in the playable release.
The historical measurements above describe v1.x and are retained unchanged.

### Regression and release validation

- `npm test`: 156 Vitest tests, 8 Rust game/search tests, and 2 Node
  launcher/package tests passed. WASM parity checks cover more than 1,000
  seeded positions, legal moves, evaluation, hashes, material/PST totals,
  make/undo, and fixed-depth search results.
- TypeScript checking, Rust formatting, and Clippy with warnings denied passed.
- The actual ZIP was extracted into a temporary directory containing spaces,
  outside the repository. `start.cmd --port 0 --no-open` ran from another
  working directory without repository files or npm dependencies.
- Chromium and Firefox passed all 12 difficulty/color/first-mover combinations,
  human moves and AI replies, undo, flip, sound toggle, resizing, search
  cancellation, and missing/corrupt WASM recovery. External network requests
  were blocked. Chromium also completed a 58-ply AI game and restarted it.
- The Firefox sound-toggle assertion now waits for Yew's asynchronous DOM
  update. This was a test timing fix; the tested release bytes were unchanged.
- Self-play, tuning, and local config-duel smoke checks completed. Tuning did
  not change the shipped weights.

The manually distributable archive is `releases/jungle-web-v2.0.0.zip`
(267,568 bytes). Its SHA-256, verified before and after the extracted-package
browser checks, is:

```text
73253ee449babb8dca0fda7f73f8f6343699e281854a6a18d0ad0e7d7eef3f34
```

All 10 asset hashes match `manifest.json`. Packaging did not rebuild or upload
anything. Website deployment commands and Wrangler configuration were removed.
The ZIP and checksum are local release artifacts, intentionally ignored by Git.

### WebAssembly throughput

Measured sequentially after the duel and browser checks finished, with no other
task workload running: `npm run bench -- 1.0`, then the desktop repository's
`python -m bench.benchmark`. Both use the same six positions, a 1-second budget,
and a fresh transposition table per search. Environment: Windows, Node 24.13.0,
Python 3.12.9, Rust 1.94.1, wasm-pack 0.15.0.

| Position | Side | Python depth | Python nodes/s | WASM depth | WASM nodes/s | WASM/Python |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| starting | Blue | 6 | 37,561 | 11 | 1,283,856 | **34.2x** |
| starting | Red | 6 | 40,644 | 11 | 1,324,396 | **32.6x** |
| midgame | Blue | 9 | 41,663 | 15 | 1,536,370 | 36.9x |
| midgame | Red | 9 | 50,328 | 15 | 1,881,783 | 37.4x |
| tactical | Blue | 16 | 80,507 | 28 | 2,367,664 | 29.4x |
| tactical | Red | 18 | 80,706 | 28 | 2,566,900 | 31.8x |

**Starting-position throughput gate (at least 5x Python): PASSED.**
These are measurements from this workstation, not minimum hardware guarantees.

### WebAssembly vs Python strength gate

Command: `npm run duel -- --games 40 --time 3 --parallel 4`.
Alternating colors, seeds 5000-5039, six random opening plies, persistent
per-side transposition tables, threefold repetition and the 400-turn cap.
The Node-loaded worker binary is byte-identical to the worker in the ZIP.

| Games | Budget | WASM wins | Python wins | Draws | WASM score | Gate (at least 65%) |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 40 | 3 seconds/move | **33** | 1 | 6 | **90.0%** | **PASSED** |

All games completed without harness errors: 34 ended by den entry or
capture-all, and 6 by repetition. The average was 54 full moves. Python's
single win was seed 5012, playing Red. Score counts a win as 1 and a draw as 0.5.
Four games ran concurrently; build/browser verification overlapped part of
the duel, so this wall-clock result is subject to machine-load variation.
It validates the required gate, not a statistically significant strength
comparison with the historical TypeScript release.

The [complete 40-game log](wasm-v2-python-gate.txt) is retained with the source.
Its historical `TS`/`tsIsBlue` labels identify the WASM contestant, retained
for compatibility with the original tooling.
