/**
 * Transposition table for the Jungle AI.
 *
 * Fixed-size open-addressed table in parallel typed arrays (no per-entry
 * objects): key verification by the full dual-32-bit Zobrist pair, single
 * slot per index with a depth-priority replacement policy (deeper entries
 * win; same-depth overwrites matter for aspiration-window corrections).
 */
import { computeHash, type HashPair } from "./zobrist";

// Entry flags
export const EXACT = 0;
export const LOWERBOUND = 1;
export const UPPERBOUND = 2;

// --- Terminal-score normalization ----------------------------------------------
// Win/loss scores in the search are ply-adjusted ("prefer faster wins"), so
// they are ROOT-relative. Stored raw, a "win in N from here" found at ply 5
// would be misread after a transposition as the same distance from a different
// ply. Normalizing to node-relative distance on store (and back on lookup)
// keeps mate scores correct across paths.

export const WIN_SCORE = 100_000;
export const PLY_BOUND = 64;
/** Any score at or beyond this magnitude is treated as a ply-adjusted win/loss. */
export const MATE_THRESHOLD = WIN_SCORE - PLY_BOUND;

export function scoreToTt(score: number, ply: number): number {
  if (score >= MATE_THRESHOLD) return score + ply;
  if (score <= -MATE_THRESHOLD) return score - ply;
  return score;
}

export function scoreFromTt(score: number, ply: number): number {
  if (score >= MATE_THRESHOLD) return score - ply;
  if (score <= -MATE_THRESHOLD) return score + ply;
  return score;
}

export interface TtEntry {
  depth: number;
  flag: number;
  score: number;
  move: number; // encoded from/to (fsq | tsq << 6); -1 = none
}

export class TranspositionTable {
  private readonly mask: number;
  private readonly keyHi: Int32Array;
  private readonly keyLo: Int32Array;
  private readonly depth: Int8Array;
  private readonly flag: Uint8Array;
  private readonly score: Float64Array;
  private readonly move: Int32Array;
  /** Number of occupied slots (approximate; for stats). */
  used = 0;

  constructor(sizeEntries = 1 << 21) {
    const size = 1 << Math.floor(Math.log2(sizeEntries));
    this.mask = size - 1;
    this.keyHi = new Int32Array(size);
    this.keyLo = new Int32Array(size);
    this.depth = new Int8Array(size).fill(-1);
    this.flag = new Uint8Array(size);
    this.score = new Float64Array(size);
    this.move = new Int32Array(size).fill(-1);
  }

  private indexFor(hi: number, lo: number): number {
    return ((hi ^ (lo * 0x9e3779b1)) >>> 0) & this.mask;
  }

  /** Returns the entry for this exact key pair, or null. */
  lookup(hi: number, lo: number, out: TtEntry): boolean {
    const i = this.indexFor(hi, lo);
    if (this.depth[i]! < 0) return false;
    if (this.keyHi[i] !== hi || this.keyLo[i] !== lo) return false;
    out.depth = this.depth[i]!;
    out.flag = this.flag[i]!;
    out.score = this.score[i]!;
    out.move = this.move[i]!;
    return true;
  }

  /** Store an entry, replacing same-depth-or-shallower entries.
   *
   * Same-depth overwrite matters: with aspiration windows a node first stores
   * a bound at depth D, then a corrected full-window result at the SAME depth
   * — refusing to overwrite would leave the stale bound for transpositions.
   * Deeper entries still win.
   */
  store(hi: number, lo: number, depth: number, flag: number, score: number, move: number): void {
    const i = this.indexFor(hi, lo);
    if (this.depth[i]! < 0) this.used++;
    else if (this.depth[i]! > depth) return; // Keep the strictly deeper entry
    this.keyHi[i] = hi;
    this.keyLo[i] = lo;
    this.depth[i] = depth;
    this.flag[i] = flag;
    this.score[i] = score;
    this.move[i] = move;
  }

  clear(): void {
    this.depth.fill(-1);
    this.move.fill(-1);
    this.used = 0;
  }
}

export { computeHash, type HashPair };
