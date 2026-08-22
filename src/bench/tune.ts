/**
 * Texel-style evaluation tuning for the Jungle AI (port of bench/tune.py).
 *
 * Pipeline (npm run tune -- --data data/selfplay-*.jsonl):
 * 1. FIT: logistic regression on score/500 vs game result with an analytic
 *    gradient over the linear weights, small L2 nudge, holdout early
 *    stopping; then a coordinate pass over the non-linear knobs.
 * 2. GATE: only weights that WIN a same-process duel against the current
 *    defaults (>= win threshold over N games, both colors) are written to
 *    results/tuned-weights.json. The duel gate is the final arbiter -- the
 *    tuner never accepts a weight vector that plays worse.
 *
 * Material values are frozen by default (self-play outcome fitting of
 * material overfits and loses games -- the desktop round-1 rejection
 * demonstrated it); pass --tune-values to override.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { Board } from "../engine/board";
import { BLUE, RED } from "../engine/constants";
import { getGameState, makeMove } from "../engine/rules";
import { findBestMove, SearchConfig } from "../ai/search";
import { TranspositionTable } from "../ai/transposition";
import { applyWeights } from "../ai/evaluation";
import { DEFAULT_WEIGHTS, WEIGHTS, type Weights } from "../ai/weights";
import { computeHash } from "../ai/zobrist";
import { checkDraw, hashKey } from "../engine/draw";
import { materialWinner, openingPosition, type Sample } from "./selfplay";

const LINEAR_KEYS: string[] = [
  ...(["rat", "cat", "dog", "wolf", "leopard", "tiger", "lion", "elephant"] as const).map(
    (k) => `value_${k}`,
  ),
  ...(["rat", "cat", "dog", "wolf", "leopard", "tiger", "lion", "elephant"] as const).map(
    (k) => `adv_w_${k}`,
  ),
  "trap_control_cat",
  "trap_control_dog",
  "trap_control_wolf",
  "trap_control_leopard",
  "trap_control_tiger",
  "trap_control_lion",
  "home_defense_cat",
  "home_defense_dog",
  "rat_water",
  "rat_water_adjacent",
  "ele_water_adjacent",
  "center_file",
  "den_threat",
  "den_defense",
  "mobility",
  "trap_danger_near",
  "trap_danger_safe",
];

const COORD_KEYS = ["race_w", "race_max_mat", "pst_phase_max"] as const;

function featureKey(weightKey: string): string {
  return weightKey === "race_w" ? "race" : weightKey;
}

const VALUE_ORDER = ["rat", "cat", "dog", "wolf", "leopard", "tiger", "lion", "elephant"] as const;

const BOUNDS: Record<string, [number, number]> = {
  value_rat: [150, 300],
  value_cat: [150, 300],
  value_dog: [180, 350],
  value_wolf: [220, 420],
  value_leopard: [300, 550],
  value_tiger: [450, 800],
  value_lion: [550, 900],
  value_elephant: [350, 650],
  adv_w_rat: [0, 6],
  adv_w_cat: [0, 4],
  adv_w_dog: [0, 4],
  adv_w_wolf: [0, 5],
  adv_w_leopard: [0, 5],
  adv_w_tiger: [0, 5],
  adv_w_lion: [0, 5],
  adv_w_elephant: [0, 4],
  trap_control_cat: [0, 12],
  trap_control_dog: [0, 12],
  trap_control_wolf: [0, 12],
  trap_control_leopard: [0, 12],
  trap_control_tiger: [0, 14],
  trap_control_lion: [0, 14],
  home_defense_cat: [0, 12],
  home_defense_dog: [0, 12],
  rat_water: [0, 12],
  rat_water_adjacent: [0, 8],
  ele_water_adjacent: [-12, 0],
  center_file: [0, 6],
  den_threat: [2, 16],
  den_defense: [2, 16],
  mobility: [0, 3],
  trap_danger_near: [1.0, 3.0],
  trap_danger_safe: [0.3, 2.0],
  race_w: [5, 45],
  race_max_mat: [1600, 4800],
  pst_phase_max: [1.0, 1.6],
};

/** Logistic temperature: score 500 (half a piece-step) ~ 73%. */
const SCALE = 500.0;

function sigmoid(x: number): number {
  return 1.0 / (1.0 + Math.exp(-x));
}

function dotWeights(f: Record<string, number>, w: Weights): number {
  const wr = w as unknown as Record<string, number>;
  let s = f.rat_ele_fixed ?? 0;
  for (const fk of ["den_threat", "den_defense", "mobility", "trap_danger_near", "trap_danger_safe", "race"]) {
    const v = f[fk];
    if (v !== undefined) {
      const wk = fk === "race" ? "race_w" : fk;
      s += wr[wk]! * v;
    }
  }
  for (const [fk, v] of Object.entries(f)) {
    if (fk.startsWith("value_")) s += wr[fk]! * w.material_scale * v;
    else if (
      fk.startsWith("adv_w_") ||
      fk.startsWith("trap_control_") ||
      fk.startsWith("home_defense_") ||
      ["rat_water", "rat_water_adjacent", "ele_water_adjacent", "center_file"].includes(fk)
    ) {
      s += wr[fk]! * v;
    }
  }
  return s;
}

function meanError(data: Sample[], w: Weights): number {
  let err = 0.0;
  for (const s of data) {
    const pred = sigmoid(dotWeights(s.f, w) / SCALE);
    err += (pred - s.r) * (pred - s.r);
  }
  return err / Math.max(data.length, 1);
}

function clamp(w: Weights): void {
  const wr = w as unknown as Record<string, number>;
  for (const [k, [lo, hi]] of Object.entries(BOUNDS)) {
    if (k in wr) wr[k] = Math.min(Math.max(wr[k]!, lo), hi);
  }
  // Material ordering with a 25-point minimum ladder between distinct ranks.
  let prev = 0;
  for (const name of VALUE_ORDER) {
    const key = `value_${name}`;
    wr[key] = Math.min(Math.max(wr[key]!, prev + 25), 1000);
    prev = wr[key]!;
  }
  // Elephant stays below Lion (rat vulnerability).
  w.value_elephant = Math.min(w.value_elephant, w.value_lion - 50);
}

function fitLinear(
  train: Sample[],
  holdout: Sample[],
  w0: Weights,
  iters = 220,
  lr = 0.02,
  l2 = 2e-4,
  tuneValues = false,
): Weights {
  // RMSProp: feature magnitudes span single digits (adv weights) to thousands
  // (trap-danger carries material values), so a raw gradient oscillates.
  // Per-weight step normalization lets every weight move in weight units.
  const keys = tuneValues
    ? LINEAR_KEYS
    : LINEAR_KEYS.filter((k) => !k.startsWith("value_"));
  const w: Weights = { ...w0 };
  const wr = w as unknown as Record<string, number>;
  const n = train.length;
  let bestW: Weights = { ...w };
  let bestErr = meanError(holdout, w);
  const scale = w0.material_scale;
  const vSq: Record<string, number> = {};
  for (let it = 0; it < iters; it++) {
    const grad: Record<string, number> = {};
    for (const k of keys) grad[k] = 0;
    for (const s of train) {
      const pred = sigmoid(dotWeights(s.f, w) / SCALE);
      const d = ((2.0 * (pred - s.r) * pred * (1 - pred)) / SCALE) * (1 / n);
      for (const k of keys) {
        const fv = s.f[featureKey(k)];
        if (fv !== undefined && fv !== 0) {
          grad[k]! += d * fv * (k.startsWith("value_") ? scale : 1);
        }
      }
    }
    for (const k of keys) {
      const g = grad[k]!;
      vSq[k] = 0.9 * (vSq[k] ?? 0) + 0.1 * g * g;
      // Weight decay is applied UNNORMALIZED (folding it into the normalized
      // gradient would amplify it into a massive pull toward zero).
      wr[k]! -= (lr * g) / (Math.sqrt(vSq[k]!) + 1e-8) + lr * l2 * wr[k]!;
    }
    clamp(w);
    if (it % 10 === 9) {
      const err = meanError(holdout, w);
      if (err < bestErr - 1e-6) {
        bestErr = err;
        bestW = { ...w };
      }
    }
  }
  return bestW;
}

function fitCoordinate(data: Sample[], w0: Weights, rounds = 2): Weights {
  const w: Weights = { ...w0 };
  const wr = w as unknown as Record<string, number>;
  let best = meanError(data, w);
  for (let i = 0; i < rounds; i++) {
    for (const k of COORD_KEYS) {
      const [lo, hi] = BOUNDS[k]!;
      const step = (hi - lo) / 8.0;
      const cur = wr[k]!;
      for (const raw of [cur - step, cur + step]) {
        const cand = Math.min(Math.max(raw, lo), hi);
        if (cand === cur) continue;
        const trial: Weights = { ...w };
        (trial as unknown as Record<string, number>)[k] = cand;
        const err = meanError(data, trial);
        if (err < best - 1e-6) {
          best = err;
          wr[k] = cand;
        }
      }
    }
  }
  return w;
}

/** Same-process weights duel: wNew vs wBase; returns the new side's win rate. */
function duelWeights(
  wNew: Weights,
  wBase: Weights,
  games: number,
  timeLimit: number,
  seed: number,
): number {
  const cfg = new SearchConfig();
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const newSide = i % 2 === 0 ? BLUE : RED;
    const { board: b0, current: c0 } = openingPosition(seed + 7919 * i);
    let board: Board = b0;
    let current = c0;
    const ttBase = new TranspositionTable(1 << 18);
    const ttNew = new TranspositionTable(1 << 18);
    const counts = new Map<string, number>();
    let winner: number | null = null;
    let hitCap = false;
    for (let ply = 0; ply < 200; ply++) {
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
      applyWeights(current === newSide ? wNew : wBase);
      const move = findBestMove(board, current, {
        timeLimit,
        tt: current === newSide ? ttNew : ttBase,
        config: cfg,
      }).move;
      applyWeights(wBase);
      if (move === null) {
        winner = current === BLUE ? RED : BLUE;
        break;
      }
      board = makeMove(board, move);
      current = current === BLUE ? RED : BLUE;
      if (ply === 199) hitCap = true;
    }
    if (winner === null && hitCap) winner = materialWinner(board);
    if (winner === newSide) wins++;
  }
  return wins / games;
}

function main(): void {
  const args = process.argv.slice(2);
  const get = (flag: string, dflt: string): string => {
    const i = args.indexOf(flag);
    return i >= 0 ? (args[i + 1] ?? dflt) : dflt;
  };
  const dataFile = get("--data", "");
  const duelGames = Number(get("--duel-games", "24"));
  const duelTime = Number(get("--duel-time", "0.25"));
  const minWinRate = Number(get("--min-win-rate", "0.55"));
  const tuneValues = args.includes("--tune-values");
  const lr = Number(get("--lr", "0.04"));
  const iters = Number(get("--iters", "220"));
  const seed = Number(get("--seed", "11"));

  if (!dataFile) {
    console.error("usage: npm run tune -- --data data/selfplay-....jsonl");
    process.exit(1);
  }
  const data: Sample[] = readFileSync(dataFile, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Sample);
  console.log(`tune: ${data.length} samples from ${dataFile}`);

  // Shuffle deterministically, split train/holdout.
  let st = seed | 0;
  const rnd = () => {
    st = mulberry32Step(st);
    return st / 4294967296;
  };
  for (let i = data.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [data[i], data[j]] = [data[j]!, data[i]!];
  }
  const cut = Math.floor(data.length * 0.8);
  const train = data.slice(0, cut);
  const holdout = data.slice(cut);

  const current: Weights = { ...WEIGHTS };
  const baseErr = meanError(holdout, current);
  console.log(`holdout error at current weights: ${baseErr.toFixed(5)}`);

  let w = fitLinear(train, holdout, current, iters, lr, 2e-4, tuneValues);
  w = fitCoordinate(holdout, w);
  const err = meanError(holdout, w);
  console.log(`fitted holdout error: ${err.toFixed(5)}`);

  const changed: Record<string, [number, number]> = {};
  for (const k of Object.keys(current) as (keyof Weights)[]) {
    if (Math.abs(w[k] - current[k]) > 1e-6) changed[k] = [current[k], w[k]];
  }
  const entries = Object.entries(changed);
  for (const [k, [a, b]] of entries.slice(0, 14)) {
    console.log(`  ${k}: ${a} -> ${Number(b.toFixed(3))}`);
  }
  if (entries.length > 14) console.log(`  ... and ${entries.length - 14} more`);

  if (err >= baseErr - 1e-5) {
    console.log("no holdout improvement -- keeping current weights");
    return;
  }

  console.log(`dueling candidate vs current (${duelGames} games @ ${duelTime}s)...`);
  const wr = duelWeights(w, current, duelGames, duelTime, seed + 1000);
  console.log(`duel win rate: ${(wr * 100).toFixed(1)}% (gate ${(minWinRate * 100).toFixed(0)}%)`);
  if (wr >= minWinRate) {
    console.log("ACCEPTED -- writing results/tuned-weights.json");
    mkdirSync("results", { recursive: true });
    const diff: Record<string, number> = {};
    for (const k of Object.keys(changed)) diff[k] = (w as unknown as Record<string, number>)[k]!;
    writeFileSync("results/tuned-weights.json", JSON.stringify(diff, null, 2) + "\n", "utf-8");
  } else {
    console.log("REJECTED by duel gate");
  }
}

function mulberry32Step(a: number): number {
  let t = (a + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("tune.ts")) {
  main();
}

// Re-export so clamps stay honest against the shipped defaults in tests.
export { DEFAULT_WEIGHTS };
