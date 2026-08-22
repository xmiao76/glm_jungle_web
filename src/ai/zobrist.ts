/**
 * Zobrist hashing for the Jungle AI.
 *
 * 64-bit keys are represented as dual 32-bit halves (hi/lo) so the hot path
 * uses only int32 XOR — no BigInt. Keys are seeded deterministically
 * (mulberry32, seed 42) so searches and tests are reproducible. Bit-parity
 * with the Python engine's MT19937 stream is intentionally NOT required:
 * keys only need internal consistency.
 */
import { BOARD_ROWS, BOARD_COLS, BLUE, RED, RAT, ELEPHANT } from "../engine/constants";
import type { Board } from "../engine/board";

/** Deterministic 32-bit PRNG (mulberry32). Returns unsigned 32-bit ints. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

const SQ = BOARD_ROWS * BOARD_COLS; // 63

const rng = mulberry32(42);

// One random 64-bit number per (square, piece code) combination, split into
// two 32-bit halves. Index layout mirrors the flat table: sq * 17 + code.
export const Z_HI = new Int32Array(SQ * 17 + 17);
export const Z_LO = new Int32Array(SQ * 17 + 17);
for (let i = 0; i < Z_HI.length; i++) {
  Z_HI[i] = rng() | 0;
  Z_LO[i] = rng() | 0;
}

// Side-to-move hash
export const Z_SIDE_HI = rng() | 0;
export const Z_SIDE_LO = rng() | 0;

export interface HashPair {
  hi: number;
  lo: number;
}

/** Compute the Zobrist hash for a board position.
 *
 * Used to seed the incremental key at the root of a search and by the game
 * controller for repetition tracking. The hot search path updates the key
 * incrementally in Position.make/undo instead (O(1) per node).
 */
export function computeHash(board: Board, sideToMove: number): HashPair {
  let hi = 0;
  let lo = 0;
  if (sideToMove === BLUE) {
    hi ^= Z_SIDE_HI;
    lo ^= Z_SIDE_LO;
  }
  for (let row = 0; row < BOARD_ROWS; row++) {
    const base = row * BOARD_COLS;
    for (let col = 0; col < BOARD_COLS; col++) {
      const p = board.getPiece(row, col);
      if (p === null) continue;
      const sq = base + col;
      const code = p.owner === BLUE ? p.pieceType : p.pieceType + 8;
      const idx = sq * 17 + code;
      hi ^= Z_HI[idx]!;
      lo ^= Z_LO[idx]!;
    }
  }
  return { hi, lo };
}

// Re-export piece constants used by downstream table builders.
export { RAT, ELEPHANT, BLUE, RED };
export const SQUARES = SQ;
