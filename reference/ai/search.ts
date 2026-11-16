/**
 * Search for the Jungle AI: iterative-deepening negamax with alpha-beta.
 *
 * Runs on the fast Position core (flat int grid, incremental Zobrist and
 * material) converted once from the engine Board at the root. Port of
 * ai/search.py with zero-allocation move buffers.
 *
 * Enhancements over a plain minimax:
 * - Iterative deepening with a hard time budget; depths aborted by the time
 *   limit are discarded, so a partially-searched deeper iteration never
 *   overwrites the best move from a completed shallower one.
 * - Principal Variation Search (NegaScout).
 * - Quiescence search over captures and den-entry wins (stand-pat).
 * - Killer-move and history-heuristic move ordering (keyed per side) on top
 *   of MVV-LVA captures and the transposition-table best move.
 * - Transposition table with Zobrist hashing and ply-normalized win scores.
 * - Repetition awareness: positions already seen (game history or search
 *   path) score as draws.
 */
import { BOARD_COLS, BLUE, RED } from "../engine/constants";
import { Move } from "../engine/move";
import type { Board } from "../engine/board";
import { Position, mvFrom, mvTo, canCaptureFlat } from "./position";
import {
  PT_OF,
  SIDE_OF,
  VALUE,
  NEIGH_FLAT,
  NEIGH_CNT,
  DIST_DEN_BLUE,
  DIST_DEN_RED,
  DEN_SQ_BLUE,
  DEN_SQ_RED,
} from "./tables";
import { evaluatePos } from "./evaluation";
import {
  TranspositionTable,
  type TtEntry,
  EXACT,
  LOWERBOUND,
  UPPERBOUND,
  WIN_SCORE,
  PLY_BOUND,
  MATE_THRESHOLD,
  scoreToTt,
  scoreFromTt,
} from "./transposition";
import type { HashPair } from "./zobrist";
import { Z_SIDE_HI, Z_SIDE_LO } from "./zobrist";

/** Terminal score magnitude (must dominate any positional/material score). */
export const WIN = WIN_SCORE;
/** Maximum supported search ply (bounds the killer-move table). */
export const MAX_PLY = PLY_BOUND;

export class SearchConfig {
  /** Windowed ID re-searches around the last score. */
  aspiration = true;
  /** Reverse futility pruning (static cutoff). OFF by default: duels on the
   * desktop showed 140/ply margins cannot cover Jungle capture swings
   * (2000-7000 on the x10 material scale). Retest before enabling. */
  rfp = false;
  /** Skip quiet moves far below alpha at low depth. */
  futility = true;
  /** Null-move pruning (guarded for Jungle). OFF by default: passing a tempo
   * in rank-based-capture Jungle is far more costly than in chess. */
  nullMove = false;
  /** Depth/index-scaled LMR (vs fixed 1-ply). */
  lmrAggressive = true;
  /** Countermove heuristic (refutation of the opponent's previous move). */
  countermove = false;
  /** Prune clearly losing captures in quiescence (SEE-lite). */
  qseePrune = false;
  /** Extend while a den is under direct threat. */
  denExtension = true;

  static pure(): SearchConfig {
    const c = new SearchConfig();
    c.aspiration = false;
    c.rfp = false;
    c.futility = false;
    c.nullMove = false;
    c.lmrAggressive = false;
    c.denExtension = false;
    return c;
  }
}

// Fraction of the time budget consumed before we stop starting new depths.
const BUDGET_GUARD = 0.85;

// Check the clock every N nodes (checking per node would measurably slow the
// search; every node for the first window so tiny budgets abort fast).
const TIME_CHECK_EVERY = 16;
const TIME_CHECK_WARMUP = 64;

// Move-ordering tier scores. Bands never overlap: TT move > den-entry >
// capture > killers > history > den-approach.
const TT_MOVE_BONUS = 1_000_000;
const DEN_ENTRY_BONUS = 500_000;
const CAPTURE_BASE = 100_000;
const KILLER_PRIMARY = 90_000;
const KILLER_SECONDARY = 80_000;
const HISTORY_CAP = 79_000;
const COUNTER_BONUS = 85_000;
const DEN_APPROACH_W = 5;
const Q_CAPTURE_BASE = 10_000;

// Late Move Reductions.
const LMR_MIN_DEPTH = 3;
const LMR_FULL_MOVE = 4;
const LMR_MAX_REDUCTION = 3;

// Reverse futility pruning margin per ply of remaining depth.
const RFP_MARGIN = 140;
// Futility pruning base margin per depth (quiet moves only, depth <= 2).
const FUTILITY_MARGIN = 120;
// Null-move pruning: minimum depth, material, and reduction.
const NMP_MIN_DEPTH = 3;
const NMP_MIN_PIECES = 3;
// Den-threat extension: max ply to keep extending at.
const EXT_MAX_PLY = 40;

// Buffer sizing for the zero-allocation move stacks. Quiescence indexes
// buffers at ply + qply + 1; ply is bounded by the MAX_PLY - 8 eval bailout
// and qply by the 16-ply cap, so ~74 is the real ceiling — extra headroom
// keeps that invariant robust to future tweaks.
const MAX_MOVES = 80;
const MOVE_BUFFERS = MAX_PLY + 40;

/** Monotonic seconds, works in browsers and Node. */
function nowSec(): number {
  return (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
}

class SearchTimeout extends Error {}

export interface SearchStats {
  nodes: number;
  depth: number;
  score: number;
  nps: number;
  elapsedMs: number;
}

export interface IterationInfo extends SearchStats {
  move: Move | null;
}

export interface SearchOptions {
  /** Maximum seconds to think (default 1.5, matching the desktop default). */
  timeLimit?: number;
  /** Optional shared transposition table. */
  tt?: TranspositionTable;
  /** Optional hard depth cap (None = unlimited; difficulty presets use it). */
  maxDepth?: number | null;
  /** Zobrist keys of positions already seen in the game (side-to-move hashed
   * in). Lets the search score repetitions as draws instead of shuffling
   * into them. */
  historyKeys?: HashPair[];
  /** Feature switches (default: duel-tuned enhancements). */
  config?: SearchConfig;
  /** Called after each completed iterative-deepening iteration (for the
   * engine stats panel). */
  onIteration?: (info: IterationInfo) => void;
}

export interface SearchResult {
  move: Move | null;
  score: number;
  depth: number;
  nodes: number;
  nps: number;
  elapsedMs: number;
}

/** True if an enemy piece stands adjacent to the side-to-move's den —
 * Jungle's "check": the threat to enter the den next move. */
function denThreat(pos: Position): boolean {
  const side = pos.side;
  const ownDen = side === BLUE ? DEN_SQ_BLUE : DEN_SQ_RED;
  const grid = pos.grid;
  const cnt = NEIGH_CNT[ownDen]!;
  for (let i = 0; i < cnt; i++) {
    const c = grid[NEIGH_FLAT[ownDen * 4 + i]!]!;
    if (c !== 0 && SIDE_OF[c]! !== side) return true;
  }
  return false;
}

interface Searcher {
  pos: Position;
  tt: TranspositionTable;
  killers: Int32Array; // [ply*2], [ply*2+1]; encoded fsq|tsq<<6, -1 = none
  history: Map<number, number>;
  /** Repetition map: keyHi -> flat [lo, count, lo, count, ...]. */
  repHi: Map<number, number[]>;
  /** Countermove table: (side,from,to) of the opponent's move -> refutation. */
  counter: Int32Array;
  start: number;
  limit: number;
  nodes: number;
  nodesSinceCheck: number;
  cfg: SearchConfig;
  moveBufs: Int32Array[];
  scoreBufs: Int32Array[];
  ttScratch: TtEntry;
}

function timedOut(s: Searcher): boolean {
  s.nodesSinceCheck++;
  const n = s.nodesSinceCheck;
  if (n <= TIME_CHECK_WARMUP || n % TIME_CHECK_EVERY === 0) {
    return nowSec() - s.start > s.limit;
  }
  return false;
}

function repInc(s: Searcher, hi: number, lo: number): void {
  let arr = s.repHi.get(hi);
  if (arr === undefined) {
    arr = [lo, 1];
    s.repHi.set(hi, arr);
    return;
  }
  for (let i = 0; i < arr.length; i += 2) {
    if (arr[i] === lo) {
      arr[i + 1]!++;
      return;
    }
  }
  arr.push(lo, 1);
}

function repDec(s: Searcher, hi: number, lo: number): void {
  const arr = s.repHi.get(hi);
  if (arr === undefined) return;
  for (let i = 0; i < arr.length; i += 2) {
    if (arr[i] === lo) {
      arr[i + 1]!--;
      return;
    }
  }
}

function repCount(s: Searcher, hi: number, lo: number): number {
  const arr = s.repHi.get(hi);
  if (arr === undefined) return 0;
  for (let i = 0; i < arr.length; i += 2) {
    if (arr[i] === lo) return arr[i + 1]!;
  }
  return 0;
}

function historyKey(side: number, pt: number, tsq: number): number {
  return ((side << 11) | (pt << 7)) | tsq;
}

/** Countermove table key for the opponent's move (side, fsq, tsq). */
function counterKey(side: number, fsq: number, tsq: number): number {
  return (((side - 1) << 13) | (fsq << 7)) | tsq;
}

/** Order moves (in place, stable, descending by tier score) for alpha-beta. */
function orderMovesInto(
  s: Searcher,
  moves: Int32Array,
  scores: Int32Array,
  n: number,
  ply: number,
  ttMove: number,
  prevMove: number,
): void {
  const pos = s.pos;
  const side = pos.side;
  const grid = pos.grid;
  const enemyDen = side === BLUE ? DIST_DEN_RED : DIST_DEN_BLUE;
  const enemyDenSq = side === BLUE ? DEN_SQ_RED : DEN_SQ_BLUE;
  const killers = s.killers;
  const history = s.history;
  const ttFrom = ttMove >= 0 ? mvFrom(ttMove) : -1;
  const ttTo = ttMove >= 0 ? mvTo(ttMove) : -1;
  const k0 = ply < MAX_PLY ? killers[ply * 2]! : -1;
  const k1 = ply < MAX_PLY ? killers[ply * 2 + 1]! : -1;
  const counterRef =
    s.cfg.countermove && prevMove >= 0
      ? s.counter[
          counterKey(side === BLUE ? RED : BLUE, prevMove & 63, (prevMove >>> 6) & 63)
        ]!
      : -1;

  for (let i = 0; i < n; i++) {
    const mv = moves[i]!;
    const fsq = mv & 63;
    const tsq = (mv >>> 6) & 63;
    const cap = mv >>> 12;
    let score = 0;

    // 1. Transposition-table best move
    if (ttMove >= 0 && fsq === ttFrom && tsq === ttTo) score += TT_MOVE_BONUS;

    // 2. Immediate win by entering the opponent's den
    if (tsq === enemyDenSq) score += DEN_ENTRY_BONUS;

    if (cap !== 0) {
      // 3. MVV-LVA: prefer capturing valuable pieces with cheap attackers
      score += CAPTURE_BASE + VALUE[cap]! * 10 - VALUE[grid[fsq]!]!;
    } else {
      // 4/5. Quiet moves: killers then history
      const ft = fsq | (tsq << 6);
      if (ft === k0) score += KILLER_PRIMARY;
      else if (ft === k1) score += KILLER_SECONDARY;
      else if (ft === counterRef) score += COUNTER_BONUS;
      const hv = history.get(historyKey(side, PT_OF[grid[fsq]!]!, tsq));
      if (hv !== undefined && hv !== 0) score += Math.min(hv, HISTORY_CAP);
      // Den-approach heuristic for the remaining quiet moves
      score += (enemyDen[fsq]! - enemyDen[tsq]!) * DEN_APPROACH_W;
    }
    scores[i] = score;
  }

  // Stable insertion sort, descending by score.
  for (let i = 1; i < n; i++) {
    const mv = moves[i]!;
    const sc = scores[i]!;
    let j = i - 1;
    while (j >= 0 && scores[j]! < sc) {
      moves[j + 1] = moves[j]!;
      scores[j + 1] = scores[j]!;
      j--;
    }
    moves[j + 1] = mv;
    scores[j + 1] = sc;
  }
}

/** Order noisy (capture/den-entry) moves for quiescence by MVV-LVA. */
function orderQuiescenceInto(pos: Position, moves: Int32Array, scores: Int32Array, n: number): void {
  const grid = pos.grid;
  for (let i = 0; i < n; i++) {
    const mv = moves[i]!;
    scores[i] = Q_CAPTURE_BASE + VALUE[mv >>> 12]! * 10 - VALUE[grid[mv & 63]!]!;
  }
  for (let i = 1; i < n; i++) {
    const mv = moves[i]!;
    const sc = scores[i]!;
    let j = i - 1;
    while (j >= 0 && scores[j]! < sc) {
      moves[j + 1] = moves[j]!;
      scores[j + 1] = scores[j]!;
      j--;
    }
    moves[j + 1] = mv;
    scores[j + 1] = sc;
  }
}

function isKiller(s: Searcher, mv: number, ply: number): boolean {
  if (ply >= MAX_PLY) return false;
  const ft = (mv & 63) | (((mv >>> 6) & 63) << 6);
  return s.killers[ply * 2] === ft || s.killers[ply * 2 + 1] === ft;
}

function recordCutoff(s: Searcher, mv: number, ply: number, depth: number, prevMove = -1): void {
  if (ply >= MAX_PLY) return;
  const pos = s.pos;
  const ft = (mv & 63) | (((mv >>> 6) & 63) << 6);
  const k0 = s.killers[ply * 2]!;
  const k1 = s.killers[ply * 2 + 1]!;
  if (k0 === -1 || k0 === ft) s.killers[ply * 2] = ft;
  else if (k1 === -1 || k1 === ft) s.killers[ply * 2 + 1] = ft;
  else s.killers[ply * 2 + 1] = ft; // evict the older slot

  // Keyed per side: BLUE and RED cutoffs for the same piece type/destination
  // are independent events and must not reinforce each other.
  const hk = historyKey(pos.side, PT_OF[pos.grid[mv & 63]!]!, (mv >>> 6) & 63);
  s.history.set(hk, (s.history.get(hk) ?? 0) + depth * depth);

  // Countermove: remember this quiet refutation of the opponent's last move.
  if (s.cfg.countermove && prevMove >= 0) {
    s.counter[counterKey(pos.side === BLUE ? RED : BLUE, prevMove & 63, (prevMove >>> 6) & 63)] =
      (mv & 63) | (((mv >>> 6) & 63) << 6);
  }
}

/** Convert a fast-core move (at the root position) to an engine Move. */
function toEngineMove(pos: Position, mv: number): Move {
  const fsq = mvFrom(mv);
  const tsq = mvTo(mv);
  const fr = Math.floor(fsq / BOARD_COLS);
  const fc = fsq % BOARD_COLS;
  const tr = Math.floor(tsq / BOARD_COLS);
  const tc = tsq % BOARD_COLS;
  const cap = pos.grid[tsq]!; // search restores pos, so this is the root occupant
  if (cap !== 0) {
    return new Move(fr, fc, tr, tc, PT_OF[cap]!, SIDE_OF[cap]!, tr, tc);
  }
  return new Move(fr, fc, tr, tc);
}

/** Find the best move using iterative-deepening PVS with quiescence. */
export function findBestMove(board: Board, player: number, opts: SearchOptions = {}): SearchResult {
  const timeLimit = opts.timeLimit ?? 1.5;
  const maxDepth = opts.maxDepth ?? null;
  const cfg = opts.config ?? new SearchConfig();

  const pos = Position.fromBoard(board, player);
  const rootBuf = new Int32Array(MAX_MOVES);
  let nRoot = pos.genMovesInto(rootBuf, player);
  if (nRoot === 0) {
    return { move: null, score: 0, depth: 0, nodes: 0, nps: 0, elapsedMs: 0 };
  }
  if (nRoot === 1) {
    const t0 = nowSec();
    const mv = rootBuf[0]!;
    return { move: toEngineMove(pos, mv), score: 0, depth: 1, nodes: 1, nps: 0, elapsedMs: (nowSec() - t0) * 1000 };
  }

  const tt = opts.tt ?? new TranspositionTable();

  const moveBufs: Int32Array[] = [];
  const scoreBufs: Int32Array[] = [];
  for (let i = 0; i < MOVE_BUFFERS; i++) {
    moveBufs.push(new Int32Array(MAX_MOVES));
    scoreBufs.push(new Int32Array(MAX_MOVES));
  }

  const s: Searcher = {
    pos,
    tt,
    killers: new Int32Array(MAX_PLY * 2).fill(-1),
    history: new Map(),
    repHi: new Map(),
    counter: new Int32Array(1 << 14).fill(-1),
    start: nowSec(),
    limit: timeLimit,
    nodes: 0,
    nodesSinceCheck: 0,
    cfg,
    moveBufs,
    scoreBufs,
    ttScratch: { depth: 0, flag: 0, score: 0, move: -1 },
  };

  // Repetition map: positions from game history count toward draws.
  if (opts.historyKeys) {
    for (const k of opts.historyKeys) repInc(s, k.hi, k.lo);
  }

  // Initial ordering for the pre-search fallback best move.
  {
    const scratch = new Int32Array(MAX_MOVES);
    scratch.set(rootBuf.subarray(0, nRoot));
    orderMovesInto(s, scratch, new Int32Array(MAX_MOVES), nRoot, 0, -1, -1);
    rootBuf.set(scratch.subarray(0, nRoot));
  }
  let bestMove = rootBuf[0]!;
  let bestScore = 0;
  let reachedDepth = 0;
  let prevScore: number | null = null;
  const iterTimes: number[] = [];

  let depth = 1;
  while (maxDepth === null || depth <= maxDepth) {
    // Predictive time management: estimate the next iteration's cost from the
    // growth of the last two, and stop if it will not fit. The flat budget
    // guard remains as a fallback.
    if (depth > 1) {
      const elapsed = nowSec() - s.start;
      if (elapsed > timeLimit * BUDGET_GUARD) break;
      if (iterTimes.length > 0) {
        let growth = 3.0;
        if (iterTimes.length >= 2) {
          growth = iterTimes[iterTimes.length - 1]! / Math.max(iterTimes[iterTimes.length - 2]!, 1e-9);
          growth = Math.min(Math.max(growth, 1.5), 5.0);
        }
        const predicted = iterTimes[iterTimes.length - 1]! * growth;
        if (elapsed + predicted > timeLimit) break;
      }
    }

    const t0 = nowSec();
    let move: number | null = null;
    let score = 0;
    try {
      if (cfg.aspiration && prevScore !== null && depth >= 4 && Math.abs(prevScore) < MATE_THRESHOLD) {
        // Aspiration window around the previous iteration's score; widen
        // (recentered on the fail) until the search fits.
        let delta = 2500.0;
        let alpha = prevScore - delta;
        let beta = prevScore + delta;
        for (;;) {
          const r = root(s, depth, alpha, beta, rootBuf);
          if (r[1] <= alpha && alpha > -Infinity) {
            alpha = Math.max(r[1] - delta, -Infinity);
            delta *= 2.0;
          } else if (r[1] >= beta && beta < Infinity) {
            beta = Math.min(r[1] + delta, Infinity);
            delta *= 2.0;
          } else {
            move = r[0];
            score = r[1];
            break;
          }
        }
      } else {
        const r = root(s, depth, -Infinity, Infinity, rootBuf);
        move = r[0];
        score = r[1];
      }
    } catch (e) {
      if (e instanceof SearchTimeout) break; // aborted depth — keep the last completed result
      throw e;
    }
    iterTimes.push(nowSec() - t0);
    if (move !== null) {
      bestMove = move;
      bestScore = score;
      reachedDepth = depth;
      prevScore = score;
      const elapsed = nowSec() - s.start;
      opts.onIteration?.({
        depth,
        score,
        nodes: s.nodes,
        nps: s.nodes / Math.max(elapsed, 1e-9),
        elapsedMs: elapsed * 1000,
        move: toEngineMove(pos, bestMove),
      });
    }
    depth++;
  }

  const elapsedMs = (nowSec() - s.start) * 1000;
  return {
    move: toEngineMove(pos, bestMove),
    score: bestScore,
    depth: reachedDepth,
    nodes: s.nodes,
    nps: s.nodes / Math.max(elapsedMs / 1000, 1e-9),
    elapsedMs,
  };
}

/** Root search: returns [bestMove, score] within the given window. */
function root(s: Searcher, depth: number, alphaIn: number, beta: number, rootBuf: Int32Array): [number, number] {
  const pos = s.pos;
  let alpha = alphaIn;
  const ttEntry = s.ttScratch;
  const hit = s.tt.lookup(pos.keyHi, pos.keyLo, ttEntry);
  const ttMove = hit ? ttEntry.move : -1;
  const n = pos.genMovesInto(rootBuf, pos.side);
  orderMovesInto(s, rootBuf, s.scoreBufs[0]!, n, 0, ttMove, -1);

  const origAlpha = alpha;
  let bestScore = -Infinity;
  let bestMove = rootBuf[0]!;
  let first = true;

  for (let i = 0; i < n; i++) {
    const move = rootBuf[i]!;
    pos.make(move);
    let score = 0;
    try {
      repInc(s, pos.keyHi, pos.keyLo);
      if (first) {
        score = -alphabeta(s, depth - 1, -beta, -alpha, 1);
        first = false;
      } else {
        score = -alphabeta(s, depth - 1, -alpha - 1, -alpha, 1);
        if (alpha < score && score < beta) {
          score = -alphabeta(s, depth - 1, -beta, -alpha, 1);
        }
      }
      repDec(s, pos.keyHi, pos.keyLo);
      pos.undo(move);
    } catch (e) {
      repDec(s, pos.keyHi, pos.keyLo);
      pos.undo(move);
      throw e;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (score > alpha) alpha = score;
  }

  const flag = bestScore <= origAlpha ? UPPERBOUND : bestScore >= beta ? LOWERBOUND : EXACT;
  s.tt.store(pos.keyHi, pos.keyLo, depth, flag, scoreToTt(bestScore, 0), (bestMove & 63) | (mvTo(bestMove) << 6));
  return [bestMove, bestScore];
}

/** Recursive negamax with PVS, quiescence leaves, TT, ordering, and the
 * SearchConfig-gated pruning/extension heuristics. */
function alphabeta(
  s: Searcher,
  depth: number,
  alphaIn: number,
  beta: number,
  ply: number,
  parentInCheck = false,
  prevMove = -1,
): number {
  const pos = s.pos;
  s.nodes++;
  if (timedOut(s)) throw new SearchTimeout();

  const w = pos.winner();
  if (w !== 0) {
    // Prefer faster wins (low ply) / slower losses (high ply).
    return w === pos.side ? WIN + (MAX_PLY - ply) : -WIN - (MAX_PLY - ply);
  }

  // Repetition: a position already seen once (game history or an earlier
  // point of this search path) is trending toward the 3-fold draw — score it
  // as one. The parent has already counted this node's own first occurrence,
  // so >= 2 means a genuine earlier sighting. Checked before the TT probe so
  // a stale entry cannot mask the draw.
  if (repCount(s, pos.keyHi, pos.keyLo) >= 2) return 0.0;

  // Extension safety net: a deeply-extended line must land somewhere.
  if (ply >= MAX_PLY - 8) return evaluatePos(pos, pos.side);

  const cfg = s.cfg;
  let alpha = alphaIn;
  const side = pos.side;

  // Jungle's "check": an enemy piece adjacent to our den threatens to end the
  // game next move. While in check we never prune and extend one ply, before
  // the quiescence drop so threatened nodes stay in the main search. Only NEW
  // threats extend — a threat persisting from the parent node must not
  // re-extend every ply or hot den regions explode exponentially.
  const inCheck = denThreat(pos);
  if (inCheck && cfg.denExtension && !parentInCheck && ply < EXT_MAX_PLY) depth += 1;

  if (depth <= 0) return quiesce(s, alpha, beta, 0, ply);

  const ttEntry = s.ttScratch;
  let ttMove = -1;
  if (s.tt.lookup(pos.keyHi, pos.keyLo, ttEntry)) {
    const ttDepth = ttEntry.depth;
    ttMove = ttEntry.move;
    let ttScore = scoreFromTt(ttEntry.score, ply);
    if (ttDepth >= depth) {
      if (ttEntry.flag === EXACT) return ttScore;
      if (ttEntry.flag === LOWERBOUND && ttScore > alpha) alpha = ttScore;
      else if (ttEntry.flag === UPPERBOUND && ttScore < beta) beta = ttScore;
      if (alpha >= beta) return ttScore;
    }
  }

  const isCutNode = beta - alpha <= 1;

  // Reverse futility pruning: at shallow depths a static eval far above beta
  // (on a cut node, not in check, not near mate) proves the cutoff.
  if (cfg.rfp && isCutNode && !inCheck && depth <= 3 && Math.abs(beta) < MATE_THRESHOLD) {
    const stand = evaluatePos(pos, side);
    if (stand - RFP_MARGIN * depth >= beta) return stand;
  }

  // Null-move pruning: if passing still fails high (searched shallower), the
  // real position is won enough to prune. Guards for Jungle: no den threat
  // against us (tempo is everything in a den race), enough pieces (avoid
  // zugzwang-like endgames), cut node, non-mate beta.
  if (cfg.nullMove && isCutNode && !inCheck && depth >= NMP_MIN_DEPTH && Math.abs(beta) < MATE_THRESHOLD) {
    const oppPieces = side === BLUE ? pos.redCnt : pos.blueCnt;
    if (oppPieces >= NMP_MIN_PIECES) {
      const R = depth > 6 ? 3 : 2;
      // Pass: flip the side-to-move (and its hash bit) only.
      pos.keyHi ^= Z_SIDE_HI;
      pos.keyLo ^= Z_SIDE_LO;
      pos.side = side === BLUE ? RED : BLUE;
      let score: number;
      try {
        score = -alphabeta(s, depth - 1 - R, -beta, -beta + 1, ply + 1, false, prevMove);
      } finally {
        pos.side = side;
        pos.keyHi ^= Z_SIDE_HI;
        pos.keyLo ^= Z_SIDE_LO;
      }
      if (score >= beta && Math.abs(score) < MATE_THRESHOLD) return score;
    }
  }

  const bufIdx = ply;
  const moves = s.moveBufs[bufIdx]!;
  const scores = s.scoreBufs[bufIdx]!;
  const n = pos.genMovesInto(moves, pos.side);
  if (n === 0) {
    // No legal moves is a loss for the side to move. Effectively unreachable
    // in Jungle with pieces on the board, but correct if it ever occurs.
    return -WIN - (MAX_PLY - ply);
  }

  orderMovesInto(s, moves, scores, n, ply, ttMove, prevMove);

  const origAlpha = alpha;
  let bestScore = -Infinity;
  let bestMoveTuple = -1;
  let first = true;
  // The mover's opponent den (pos.side flips after make, so capture it now).
  const enemyDenSq = side === BLUE ? DEN_SQ_RED : DEN_SQ_BLUE;

  // Futility base for skipping quiet moves at low depth (never in check,
  // never the first move, never near mate).
  let futBase: number | null = null;
  if (cfg.futility && !inCheck && depth <= 2 && Math.abs(alpha) < MATE_THRESHOLD) {
    futBase = evaluatePos(pos, side) + FUTILITY_MARGIN * depth;
  }

  for (let i = 0; i < n; i++) {
    const move = moves[i]!;
    const cap = move >>> 12;
    const tsq = (move >>> 6) & 63;

    // Futility pruning: a late quiet move cannot raise alpha.
    if (futBase !== null && i > 0 && cap === 0 && tsq !== enemyDenSq && !isKiller(s, move, ply) && futBase <= alpha) {
      continue;
    }

    pos.make(move);
    let kHi = 0;
    let kLo = 0;
    let score: number;
    try {
      kHi = pos.keyHi;
      kLo = pos.keyLo;
      repInc(s, kHi, kLo);

      // Late Move Reduction: a late, quiet, non-killer move is unlikely to
      // raise alpha, so scout it shallower. Captures, den-entries and killers
      // stay at full depth; any fail-high is re-searched at full depth below,
      // so LMR never returns an unsound value.
      let reduction = 0;
      if (!inCheck && i >= LMR_FULL_MOVE && depth >= LMR_MIN_DEPTH && cap === 0 && tsq !== enemyDenSq && !isKiller(s, move, ply)) {
        if (cfg.lmrAggressive) {
          reduction = Math.min(1 + ((depth / 6) | 0) + ((i / 8) | 0), LMR_MAX_REDUCTION);
        } else {
          reduction = 1;
        }
      }

      if (first) {
        score = -alphabeta(s, depth - 1, -beta, -alpha, ply + 1, inCheck, move);
        first = false;
      } else {
        score = -alphabeta(s, depth - 1 - reduction, -alpha - 1, -alpha, ply + 1, inCheck);
        // Reduced scout failed high -> re-scout at full depth (null window)
        // before letting the value influence a cutoff.
        if (reduction > 0 && score > alpha) {
          score = -alphabeta(s, depth - 1, -alpha - 1, -alpha, ply + 1, inCheck, move);
        }
        // Standard PVS: a null-window improvement triggers a full-window
        // re-search so the value is exact.
        if (alpha < score && score < beta) {
          score = -alphabeta(s, depth - 1, -beta, -alpha, ply + 1, inCheck, move);
        }
      }
      repDec(s, kHi, kLo);
      pos.undo(move);
    } catch (e) {
      repDec(s, kHi, kLo);
      pos.undo(move);
      throw e;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMoveTuple = (move & 63) | (tsq << 6);
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (cap === 0 && tsq !== enemyDenSq) {
        recordCutoff(s, move, ply, depth, prevMove);
      }
      break;
    }
  }

  const flag = bestScore <= origAlpha ? UPPERBOUND : bestScore >= beta ? LOWERBOUND : EXACT;
  s.tt.store(pos.keyHi, pos.keyLo, depth, flag, scoreToTt(bestScore, ply), bestMoveTuple);
  return bestScore;
}

/** True if an enemy piece adjacent to tsq could capture `code` standing there. */
function defendedAgainst(pos: Position, tsq: number, code: number): boolean {
  const grid = pos.grid;
  const cnt = NEIGH_CNT[tsq]!;
  for (let i = 0; i < cnt; i++) {
    const nsq = NEIGH_FLAT[tsq * 4 + i]!;
    const c = grid[nsq]!;
    if (c !== 0 && SIDE_OF[c]! !== SIDE_OF[code]! && canCaptureFlat(c, nsq, code, tsq)) {
      return true;
    }
  }
  return false;
}

/** Quiescence search: stand-pat + captures/den-entries until quiet. */
function quiesce(s: Searcher, alphaIn: number, beta: number, qply: number, ply: number): number {  const pos = s.pos;
  s.nodes++;
  if (timedOut(s)) throw new SearchTimeout();

  const w = pos.winner();
  if (w !== 0) return w === pos.side ? WIN : -WIN;

  let alpha = alphaIn;
  const stand = evaluatePos(pos, pos.side);
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;

  // Safety cap (captures are finite; this guards pathological positions).
  if (qply > 16) return alpha;

  const bufIdx = ply + qply + 1;
  const moves = s.moveBufs[bufIdx]!;
  const scores = s.scoreBufs[bufIdx]!;
  const n = pos.genNoisyInto(moves, pos.side);
  orderQuiescenceInto(pos, moves, scores, n);

  const enemyDenSq = pos.side === BLUE ? DEN_SQ_RED : DEN_SQ_BLUE;
  for (let i = 0; i < n; i++) {
    const move = moves[i]!;
    const cap = move >>> 12;
    const fsq = move & 63;
    const tsq = (move >>> 6) & 63;
    const attacker = pos.grid[fsq]!;

    // SEE-lite: skip clearly losing captures (victim much cheaper than the
    // attacker, destination defended). Den entries end the game — never pruned.
    if (
      s.cfg.qseePrune &&
      cap !== 0 &&
      tsq !== enemyDenSq &&
      VALUE[cap]! + 150 < VALUE[attacker]! &&
      defendedAgainst(pos, tsq, attacker)
    ) {
      continue;
    }

    pos.make(move);
    let score: number;
    try {
      score = -quiesce(s, -beta, -alpha, qply + 1, ply);
    } finally {
      pos.undo(move);
    }
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }

  return alpha;
}

// --- Test-only internals ---------------------------------------------------------
// Exported so tests can drive individual search phases (PVS equivalence vs a
// reference negamax, repetition scoring, killer/history bookkeeping) exactly
// like the desktop's tests/test_search.py does with the Python internals.

function makeSearcherForTests(
  pos: Position,
  opts: {
    tt?: TranspositionTable;
    historyKeys?: HashPair[];
    limit?: number;
    cfg?: SearchConfig;
  } = {},
): Searcher {
  const moveBufs: Int32Array[] = [];
  const scoreBufs: Int32Array[] = [];
  for (let i = 0; i < MOVE_BUFFERS; i++) {
    moveBufs.push(new Int32Array(MAX_MOVES));
    scoreBufs.push(new Int32Array(MAX_MOVES));
  }
  const s: Searcher = {
    pos,
    tt: opts.tt ?? new TranspositionTable(),
    killers: new Int32Array(MAX_PLY * 2).fill(-1),
    history: new Map(),
    repHi: new Map(),
    counter: new Int32Array(1 << 14).fill(-1),
    start: nowSec(),
    limit: opts.limit ?? 10.0,
    nodes: 0,
    nodesSinceCheck: 0,
    cfg: opts.cfg ?? new SearchConfig(),
    moveBufs,
    scoreBufs,
    ttScratch: { depth: 0, flag: 0, score: 0, move: -1 },
  };
  if (opts.historyKeys) {
    for (const k of opts.historyKeys) repInc(s, k.hi, k.lo);
  }
  return s;
}

export const __testing = {
  alphabeta,
  quiesce,
  root,
  recordCutoff,
  makeSearcher: makeSearcherForTests,
  repCount,
};
