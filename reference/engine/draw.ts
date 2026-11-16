/**
 * Draw handling, ported 1:1 from the desktop controller (main.py).
 *
 * Wikipedia does not standardize a Jungle repetition rule, so this is the
 * project's chosen completeness convention (keeps AI-vs-AI / self-play
 * finite): 3-fold repetition or an absolute move cap ends the game in a draw.
 */
import type { HashPair } from "../ai/zobrist";

export const MAX_GAME_MOVES = 400;
export const REPETITION_LIMIT = 3;
/** How many recent position hashes the controller hands to the search so it
 * can score repetitions as draws (bounded to keep the search-side set small). */
export const HISTORY_WINDOW = 32;

/** String key for a Zobrist hash pair (use for repetition count maps). */
export function hashKey(h: HashPair): string {
  return `${h.hi}|${h.lo}`;
}

/** Is the current position a draw?
 *
 * Called AFTER recording ``key`` in ``counts``. Pure, so it is unit-testable
 * without a running UI.
 */
export function checkDraw(counts: ReadonlyMap<string, number>, key: string, moveCount: number): boolean {
  if (moveCount > MAX_GAME_MOVES) return true;
  return (counts.get(key) ?? 0) >= REPETITION_LIMIT;
}
