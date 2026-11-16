/**
 * In-process config duels: two TS engine configurations play N games at a
 * fixed per-move budget with seeded random openings, alternating colors.
 * Port of the desktop's bench/duel_configs.py gating methodology.
 *
 * Run:  npm run duel:local -- --a base --b rfp --games 40 --time 0.1
 */
import { Board } from "../../reference/engine/board";
import { BLUE, RED } from "../../reference/engine/constants";
import { getAllLegalMoves, makeMove, getGameState } from "../../reference/engine/rules";
import { findBestMove, SearchConfig, type SearchOptions } from "../wasm/engine";
import { TranspositionTable } from "../wasm/engine";
import { computeHash } from "../../reference/ai/zobrist";
import { checkDraw, hashKey, MAX_GAME_MOVES } from "../../reference/engine/draw";
import { mulberry32 } from "../../reference/ai/zobrist";

/** Named feature-switch configurations under test. */
export function configByName(name: string): SearchConfig {
  const c = new SearchConfig();
  switch (name) {
    case "base":
      return c;
    case "rfp":
      c.rfp = true;
      return c;
    case "nullmove":
      c.nullMove = true;
      return c;
    case "no-futility":
      c.futility = false;
      return c;
    case "no-aspiration":
      c.aspiration = false;
      return c;
    case "lmr-fixed":
      c.lmrAggressive = false;
      return c;
    case "no-den-ext":
      c.denExtension = false;
      return c;
    case "countermove":
      c.countermove = true;
      return c;
    case "qsee":
      c.qseePrune = true;
      return c;
    case "cm-qsee":
      c.countermove = true;
      c.qseePrune = true;
      return c;
    case "pure":
      return SearchConfig.pure();
    default:
      throw new Error(`unknown config: ${name}`);
  }
}

export interface GameOutcome {
  /** 1 = config that had BLUE in this game wins, 0 = draw, -1 = loss. */
  blueResult: number;
  moves: number;
  reason: "den" | "capture-all" | "draw-repetition" | "draw-cap" | "no-moves";
}

/** Play one game: cfgBlue vs cfgRed from a seeded random opening.
 *
 * The first `openingPlies` plies are random legal moves (seeded, so duels are
 * reproducible) so deterministic engines do not replay identical games.
 */
export function playConfigGame(
  cfgBlue: SearchConfig,
  cfgRed: SearchConfig,
  timeLimit: number,
  seed: number,
  openingPlies = 6,
  ttBits = 18,
): GameOutcome {
  const rng = mulberry32(seed);
  let board = new Board();
  let current = BLUE;
  const counts = new Map<string, number>();
  const recentKeys: { hi: number; lo: number }[] = [];
  const tts = new Map<number, TranspositionTable>();
  let moveCount = 0;
  let plies = 0;

  try { for (;;) {
    const state = getGameState(board);
    if (state.over) {
      return {
        blueResult: state.winner === BLUE ? 1 : -1,
        moves: moveCount,
        reason: "den",
      };
    }
    const h = computeHash(board, current);
    const key = hashKey(h);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (checkDraw(counts, key, moveCount)) {
      return {
        blueResult: 0,
        moves: moveCount,
        reason: moveCount > MAX_GAME_MOVES ? "draw-cap" : "draw-repetition",
      };
    }

    let move;
    if (plies < openingPlies) {
      const legal = getAllLegalMoves(board, current);
      move = legal[Math.floor((rng() / 4294967296) * legal.length)]!;
    } else {
      let tt = tts.get(current);
      if (tt === undefined) {
        tt = new TranspositionTable(1 << ttBits);
        tts.set(current, tt);
      }
      const opts: SearchOptions = {
        timeLimit,
        tt,
        historyKeys: recentKeys.slice(-32),
        config: current === BLUE ? cfgBlue : cfgRed,
      };
      const result = findBestMove(board, current, opts);
      move = result.move;
    }
    if (move === null) {
      return { blueResult: current === BLUE ? -1 : 1, moves: moveCount, reason: "no-moves" };
    }

    board = makeMove(board, move);
    recentKeys.push(h);
    current = current === BLUE ? RED : BLUE;
    if (current === BLUE) moveCount++;
    plies++;
  }} finally { for (const tt of tts.values()) tt.free(); }
}

export interface DuelSummary {
  games: number;
  aWins: number;
  bWins: number;
  draws: number;
  /** Score from A's perspective (win=1, draw=0.5). */
  aScorePct: number;
  reasons: Record<string, number>;
  avgMoves: number;
}

/** Play N games alternating colors. A gets BLUE in even games. */
export function duelConfigs(
  cfgA: SearchConfig,
  cfgB: SearchConfig,
  games: number,
  timeLimit: number,
  baseSeed = 1000,
): DuelSummary {
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  const reasons: Record<string, number> = {};
  let totalMoves = 0;
  for (let g = 0; g < games; g++) {
    const aIsBlue = g % 2 === 0;
    const outcome = playConfigGame(
      aIsBlue ? cfgA : cfgB,
      aIsBlue ? cfgB : cfgA,
      timeLimit,
      baseSeed + g,
    );
    totalMoves += outcome.moves;
    reasons[outcome.reason] = (reasons[outcome.reason] ?? 0) + 1;
    const aResult = aIsBlue ? outcome.blueResult : -outcome.blueResult;
    if (aResult === 1) aWins++;
    else if (aResult === -1) bWins++;
    else draws++;
  }
  return {
    games,
    aWins,
    bWins,
    draws,
    aScorePct: ((aWins + draws * 0.5) / games) * 100,
    reasons,
    avgMoves: totalMoves / games,
  };
}

function main(): void {
  const args = process.argv.slice(2);
  const get = (flag: string, dflt: string): string => {
    const i = args.indexOf(flag);
    return i >= 0 ? (args[i + 1] ?? dflt) : dflt;
  };
  const aName = get("--a", "base");
  const bName = get("--b", "base");
  const games = Number(get("--games", "20"));
  const time = Number(get("--time", "0.1"));
  const seed = Number(get("--seed", "1000"));

  console.log(`Config duel: A=${aName} vs B=${bName}, ${games} games, ${time}s/move, seed ${seed}`);
  const summary = duelConfigs(configByName(aName), configByName(bName), games, time, seed);
  console.log(
    `A wins ${summary.aWins} | B wins ${summary.bWins} | draws ${summary.draws} | A score ${summary.aScorePct.toFixed(1)}%`,
  );
  console.log(`avg moves/game ${summary.avgMoves.toFixed(0)}, endings:`, summary.reasons);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("duelLocal.ts")) {
  main();
}
