/**
 * Self-play data generation for Texel-style evaluation tuning.
 *
 * Plays engine-vs-engine games at a short time limit from seeded random
 * openings and records (features, game result) pairs per executed move, from
 * the mover's perspective. Writes JSON lines to data/selfplay-*.jsonl.
 *
 * Run:  npm run selfplay -- --games 120 --time 0.08 --seed 11
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Board } from "../../reference/engine/board";
import { BLUE, RED } from "../../reference/engine/constants";
import { getAllLegalMoves, makeMove, getGameState } from "../../reference/engine/rules";
import { findBestMove } from "../wasm/engine";
import { TranspositionTable } from "../wasm/engine";
import { Position } from "../../reference/ai/position";
import { evaluateFeatures } from "../../reference/ai/evaluation";
import { PIECE_VALUES } from "../../reference/ai/evaluation";
import { computeHash, mulberry32 } from "../../reference/ai/zobrist";
import { checkDraw, hashKey } from "../../reference/engine/draw";

export interface Sample {
  /** Per-weight feature units (mover's perspective). */
  f: Record<string, number>;
  /** Game result from the mover's perspective (1 / 0.5 / 0). */
  r: number;
}

/** Deterministic random opening: K random legal plies from the start. */
export function openingPosition(seed: number, plies = 6): { board: Board; current: number } {
  const rng = mulberry32(seed);
  const r01 = () => rng() / 4294967296;
  let board = new Board();
  let current = BLUE;
  for (let i = 0; i < plies; i++) {
    const legal = getAllLegalMoves(board, current);
    if (legal.length === 0 || getGameState(board).over) break;
    board = makeMove(board, legal[Math.floor(r01() * legal.length)]!);
    current = current === BLUE ? RED : BLUE;
  }
  return { board, current };
}

/** Winner by material if the game hit the move cap without a result. */
export function materialWinner(board: Board): number | null {
  let blue = 0;
  let red = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 7; c++) {
      const p = board.getPiece(r, c);
      if (p === null) continue;
      if (p.owner === BLUE) blue += PIECE_VALUES[p.pieceType]!;
      else red += PIECE_VALUES[p.pieceType]!;
    }
  }
  if (blue > red * 1.08) return BLUE;
  if (red > blue * 1.08) return RED;
  return null;
}

/** Generate tuning samples. */
export function generateData(
  games: number,
  timeLimit: number,
  seed: number,
  skipOpening = 6,
  openingPlies = 6,
): Sample[] {
  const r01 = () => {
    const v = mulberry32(seed ^ 0x5f3759df)();
    return v / 4294967296;
  };
  const data: Sample[] = [];
  for (let g = 0; g < games; g++) {
    const { board: b0, current: c0 } = openingPosition(seed + 7919 * g, openingPlies);
    let board = b0;
    let current = c0;
    const tt = new TranspositionTable(1 << 18);
    const counts = new Map<string, number>();
    const samples: { pos: Position; side: number }[] = [];
    let winner: number | null = null;
    for (let ply = 0; ply < 220; ply++) {
      const state = getGameState(board);
      if (state.over) {
        winner = state.winner;
        break;
      }
      const h = computeHash(board, current);
      const key = hashKey(h);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (checkDraw(counts, key, ply)) {
        winner = null;
        break;
      }
      const legal = getAllLegalMoves(board, current);
      if (legal.length === 0) {
        winner = current === BLUE ? RED : BLUE;
        break;
      }
      const result = findBestMove(board, current, { timeLimit, tt });
      let move = result.move;
      if (move !== null) {
        move = legal.find((m) => m.equals(move!)) ?? null;
      }
      if (move === null) move = legal[Math.floor(r01() * legal.length)]!;
      board = makeMove(board, move);
      current = current === BLUE ? RED : BLUE;
      samples.push({ pos: Position.fromBoard(board, current), side: current });
    }
    tt.free();
    if (samples.length === 0) continue;
    if (winner === null && samples.length >= 200) winner = materialWinner(board);
    for (let i = skipOpening; i < samples.length; i++) {
      const { pos, side } = samples[i]!;
      const [score, feats] = evaluateFeatures(pos, side);
      if (feats.size === 0 || Math.abs(score) > 50000) continue; // terminal positions carry no tunable features
      const result = winner === null ? 0.5 : winner === side ? 1.0 : 0.0;
      const f: Record<string, number> = {};
      for (const [k, v] of feats) f[k] = v;
      data.push({ f, r: result });
    }
  }
  return data;
}

function main(): void {
  const args = process.argv.slice(2);
  const get = (flag: string, dflt: string): string => {
    const i = args.indexOf(flag);
    return i >= 0 ? (args[i + 1] ?? dflt) : dflt;
  };
  const games = Number(get("--games", "120"));
  const time = Number(get("--time", "0.08"));
  const seed = Number(get("--seed", "11"));
  const out = get("--out", `data/selfplay-g${games}-t${time}-s${seed}.jsonl`);

  console.log(`selfplay: ${games} games @ ${time}s/move, seed ${seed}`);
  const t0 = Date.now();
  const data = generateData(games, time, seed);
  mkdirSync("data", { recursive: true });
  const lines = data.map((s) => JSON.stringify(s));
  writeFileSync(out, lines.join("\n") + "\n", "utf-8");
  const wins = data.filter((s) => s.r === 1).length;
  const draws = data.filter((s) => s.r === 0.5).length;
  console.log(
    `${data.length} samples (${wins} win / ${losses(data)} loss / ${draws} draw) in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out}`,
  );
  function losses(d: Sample[]): number {
    return d.filter((s) => s.r === 0).length;
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("selfplay.ts")) {
  main();
}
