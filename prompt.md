> **Historical specification.** The v2.0 WebAssembly refactor supersedes the
> website-deployment requirements below. The deliverable is a locally testable,
> versioned WebAssembly ZIP with a Node.js loopback launcher. Builds and packaging
> must never publish to Cloudflare or another website. See README.md for the
> current build, validation, and manual release workflow.

Act as a senior software architect and technical lead specializing in web game development and game AI.

Create a step-by-step development plan for a browser-based Jungle board game application with a polished GUI and a built-in AI so a human can play against the computer on a visual board in a web browser. The final deliverable is a deployed, playable web app on Cloudflare, not a downloadable executable.

The existing Windows desktop implementation of this exact game at C:\GitHub\glm.z_cc_jungle (Python + Pygame) is the reference implementation. The web version must faithfully match its rules, rule interpretations, draw conventions, game modes, and visual design. The AI, however, must not be ported verbatim: regardless of the programming language and design used by the desktop version, refactor and re-architect the engine and AI to maximize the Jungle AI's playing strength, and prove the strength gain by measurement (see "AI strength requirements" below).

Use the standard Jungle / Dou Shou Qi rules from this page as the main game specification and reference:
https://en.wikipedia.org/wiki/Jungle_(board_game)

If the board layout, terrain layout, or initial piece positions are unclear from the wiki page, also refer to:
https://veryspecial.us/free-downloads/AncientChess.com-DouShouQi.pdf

Do not restate the full rules in detail unless needed. Instead, refer to the source materials above and build the plan around implementing the ruleset correctly and consistently. If the sources mention ambiguous rules or variants, identify them, choose one clear standard interpretation, document it, and keep the implementation consistent.

Requirements:
- Write the engine and AI in TypeScript (strict mode) running fully client-side in the browser, with the AI search executing inside a Web Worker so the UI never blocks. There is no backend: no server API, no database, no online multiplayer, no analytics or tracking, and no external network calls after page load.
- Use Vite for the build, Vitest for tests, Canvas 2D for board rendering, and deploy as static assets on Cloudflare Workers (via @cloudflare/vite-plugin, or wrangler.jsonc with assets.directory=./dist and not_found_handling="single-page-application"). Choose and justify the remaining stack choices (component framework, state management) yourself.
- Structure the engine and AI as a standalone, runtime-agnostic TypeScript package with no DOM or Worker dependencies, so the same code runs in the browser Worker, in Node CLIs (duels, tuning, benchmarks), and in tests.
- All web source code must be newly written for this application; the desktop Python codebase is a reference to study, not code to translate mechanically.
- Phase 1 must deliver a working browser GUI where a human can play against the AI with the same polish as the desktop version.
- Game modes must match the desktop: Human vs AI (choose your side, choose independently whether the human or the AI moves first, Easy/Medium/Hard difficulty) and AI-vs-AI spectate. Support choosing who moves first before a game starts. No pass-and-play, no online multiplayer.
- Difficulty presets match the desktop budgets: Easy 0.4 s with max depth 3, Medium 1.2 s, Hard 3.0 s. Within the same budgets the web AI must search at least as deep as the desktop engine (see strength gates).
- The engine must be responsive and suitable for smooth browser play, with stable animation and instant input response throughout.
- Translate the desktop's rule and board tests to Vitest one-to-one; port the fuzz tests that assert the fast AI position move generator is exactly equivalent to the rules engine move generator; adapt the search, evaluation, and integration tests to the new engine.
- Testing must be integrated throughout development. Automated tests must be created and maintained during development.
- Bugs found in testing or gameplay must be fixed and regression-tested until stable.
- The final application must complete full Jungle games correctly, with rule behavior identical to the desktop engine.
- The app must be easy to build, run, test, and deploy locally (Vite dev server, wrangler dev, wrangler deploy).

Rule clarification for river jumping:
- Implement the lion and tiger river-jump behavior using this explicit interpretation.
- The lion is stronger than the tiger for river jumping.
- The lion can jump across the river both horizontally and vertically.
- Horizontal lion jump means jumping across 3 river squares to the next non-water square on the opposite side.
- Vertical lion jump means jumping across 2 river squares to the next non-water square on the opposite side.
- The tiger can jump only vertically across 2 river squares to the next non-water square on the opposite side.
- Do not assume tiger has the same horizontal jump ability as lion unless the implementation explicitly supports it as an optional documented variant.
- Any rat-blocking behavior must still be handled correctly according to the selected ruleset.

Reference-implementation parity:
The desktop engine pins these interpretations, and the web engine must match them exactly:
- Lion may use both river crossings, the 3-water-square crossing and the 2-water-square crossing; the tiger only the 2-water-square crossing. The functional rule stated here and the reference implementation's behavior are authoritative wherever crossing-direction wording differs.
- A river jump is blocked if any rat, friendly or enemy, occupies a water square in the jump path.
- The elephant cannot capture the rat.
- The rat captures the elephant only from land, never from water.
- A rat in water can only be captured by an enemy rat also in water.
- Traps affect only opponent pieces: a piece in an opponent's trap has effective rank 0 and can be captured by any enemy piece.
- Entering the opponent's den wins; a player cannot enter their own den; capturing all enemy pieces wins.
- Blue moves first. A draw is declared on 3-fold repetition or after 400 total moves.

AI strength requirements:
- Objective: maximize playing strength. The rules, draw handling, and observable game behavior must not change; everything inside search and evaluation is open to redesign.
- Start from the desktop AI's proven design (iterative-deepening PVS with quiescence, transposition table, killers/history, repetition-aware draw scoring, BFS den-distance evaluation) as the baseline to beat, not a contract to copy.
- Raw speed first: TypeScript with TypedArrays, zero allocations in the search hot path, and 64-bit Zobrist keys implemented as dual 32-bit halves (hi/lo XOR, not BigInt). Measure with a ported benchmark reporting depth and nodes per second from standard positions at 0.4 s, 1.2 s, and 3.0 s.
- Re-evaluate every search heuristic at the new depth profile and keep changes only when they win duels: reverse-futility and null-move pruning were disabled by duels on the desktop and must be retested rather than inherited; tune LMR, futility margins, aspiration windows, quiescence entry and depth, and the den-threat extension.
- Upgrade move ordering where it pays: countermove heuristic, history aging, static-exchange-style pruning of clearly losing captures in quiescence, stronger den-entry ordering.
- Scale the transposition table to browser memory (multi-million entries) with a sound replacement policy, keeping ply-normalized win scores and draw-aware repetition handling.
- Rebuild the evaluation and tune it with data, not hand-tweaks: generate self-play games with a Node CLI, apply Texel-style tuning to all weights and piece-square tables (the desktop's bench/tune.py is the model), and preserve the invariant that positional terms can never outweigh a material step. Candidate terms: refined den pressure and endgame den-race, trap control, rat-elephant matchup terms, per-piece mobility, tempo.
- Refine time management (the desktop's predictive-growth budgeting) for the faster engine.
- Optional enhancements, each only if it measurably wins duels and never breaks the single-worker fallback: multi-worker parallel search (lazy-SMP-style shared transposition table via SharedArrayBuffer, which requires COOP/COEP headers on Cloudflare) and a small self-play-generated opening book.
- Strength gates, all of which must be met and documented in the repository:
  - A cross-language duel harness: the TypeScript engine running under Node versus the desktop Python engine, equal time budgets, alternating colors, at least 40 games, over a simple text protocol between processes.
  - The final web AI scores a clear majority against the desktop engine at equal 3 s-per-move budgets, targeting 65 percent or higher over 40+ games.
  - Every intermediate strength change is gated by fast in-process config duels (a port of the desktop's bench/duel_configs.py approach) against the faithful baseline port, with results recorded in a results log.
  - At least 5x the desktop's node throughput from the starting position, with per-budget search depths reported.
  - Determinism is preserved: fixed seeds, reproducible searches and duels.
- Rules legality must never drift during strength work: the engine-to-position equivalence fuzz tests and the full rule suite must stay green after every strength change.

Technical constraints:
- Zobrist keys must be seeded deterministically so tests are reproducible. Bit-identical keys to the Python engine are not required; internal consistency is what matters.
- The Worker message protocol must support streaming search statistics (depth, score, nodes per second) for the side panel, and cancellation when the user restarts or returns to the menu.
- Canvas rendering must handle devicePixelRatio for crisp visuals, scale responsively to the browser window, and drive animation with requestAnimationFrame.
- Target modern evergreen browsers (current and previous major version of Chrome, Edge, Firefox, Safari). If Web Worker initialization fails, show a graceful, user-friendly error with a recovery path.
- Validate all user input; never route untrusted data into eval or innerHTML.

UI requirements:
- The final UI must be polished and attractive, not just functional — suitable for a public demo.
- The board should visually show river, trap, den, land, and other terrain clearly (reuse existing tile art).
- Each piece should look like its animal (reuse existing piece art), and each piece must also display the animal's short English name (e.g. "Rat", "Lion") in a small font on or under the piece, readable on both sides' colors at any board size and following the piece during move animations.
- The main menu must display which AI model and which code agent were used to build the game (e.g. "Made with model Claude Fable 5 (Anthropic) · code agent Claude Code"), alongside the engine version and runtime info.
- The main menu must include a "How to play" section with simple but complete guidance for a brand-new player: the two win conditions, how to select and move pieces with the UI's input model and move/capture indicators, the full rank order and the Rat-vs-Elephant exception, river/swimming rules, Lion and Tiger river jumps (including rat-blocking), trap behavior, the own-den restriction, the stalemate loss and the no-capture draw rule, and the in-game controls (undo, board flip, mute).
- Include good usability details: piece selection highlights, legal move indicators, capture feedback, move animations, turn display, move history panel, and win/loss messaging.
- Support flipping the board upside down as a view option. This must only change the visual mapping of squares to pixels and mouse/touch coordinates back to squares. It must not change game state, must not swap sides internally, and must not change whose turn it is.
- Support a clear UI option to choose whether the human player or the AI moves first; it must work correctly together with the board-flip option.
- Sound effects for move / capture / win with a mute toggle (browsers require a user gesture before audio — handle this gracefully).
- Responsive layout: excellent on desktop; usable on tablet/mobile (touch input for the two-click select-then-move model) is a stretch goal for Phase 2, not Phase 1.
- Avoid placeholder-style visuals in the final release.

Deployment and release requirements:
- Deploy the application to Cloudflare as static assets (Pages or Workers), built with Vite.
- The deployed URL must be publicly accessible and must be tested after deployment, not only during local development. Validate on the live URL that the game loads and renders, a complete Human vs AI game finishes correctly, all difficulty levels work, AI-vs-AI works, board flip works, the side panel updates, game-over and draw messaging appear, and there are no console errors.
- If deployment defects are found, fix, rebuild, and redeploy until the live application passes validation.
- Include README.md in the repository with the live URL, gameplay instructions, controls, notes, the achieved AI strength results (duel scores and benchmark numbers), and a clear statement identifying which model and which code agent were used to complete the task.
- Save this prompt as prompt.md in the codebase.

Please provide:
- recommended tech stack and justification
- architecture and module breakdown (engine, ai, bench/duel/tune harnesses, worker, ui), mirroring the reference implementation's layout
- phased roadmap
- test plan for each phase
- automated testing strategy
- AI/engine strategy (Worker protocol, Zobrist-in-JavaScript design)
- AI strength-maximization strategy: speed plan, search re-tuning plan, evaluation tuning plan (data generation, objective, duel gating, thresholds)
- performance optimization plan
- local build, run, and test workflow (dev server, wrangler dev, Vitest, duel and bench CLIs)
- bug-fix and regression-test workflow
- deployment plan (Cloudflare setup, optional CI)
- post-deployment validation plan
- expected repository contents
- suggested README.md contents
- where prompt.md should be stored
- completion criteria

Completion is only achieved when the game is playable and stable in a browser, completes full games correctly with rule parity with the desktop engine, all game modes and difficulty levels work, the UI is a faithful visual port of the desktop design, the required automated tests pass including the engine-to-position equivalence fuzz tests, the AI strength gates are met and documented (majority duel score against the desktop Python engine at equal budgets, at least 5x node throughput, duel-gated change log maintained), the application is deployed to a live Cloudflare URL that passed post-deployment validation, the repository includes README.md with the model/code-agent statement and strength results, and prompt.md is included in the codebase.
