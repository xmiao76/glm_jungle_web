/** Correctness tests for the Jungle search. Port of tests/test_search.py,
 * adapted to the TS internals exported via `__testing`. */
import { describe, expect, test } from "vitest";
import { Board } from "../src/engine/board";

import { getAllLegalMoves, makeMove } from "../src/engine/rules";
import { BOARD_COLS, BLUE, RED, RAT, WOLF, TIGER, LION, ELEPHANT } from "../src/engine/constants";
import { findBestMove, SearchConfig, WIN, MAX_PLY, __testing } from "../src/ai/search";
import { Position } from "../src/ai/position";
import { evaluate } from "../src/ai/evaluation";
import { scoreToTt, scoreFromTt, MATE_THRESHOLD } from "../src/ai/transposition";
import { computeHash } from "../src/ai/zobrist";

// --- Incremental Zobrist parity (adapted: child key via make vs recompute) ---

describe("TestIncrementalHash", () => {
  function check(board: Board, player: number): void {
    const opponent = player === BLUE ? RED : BLUE;
    const pos = Position.fromBoard(board, player);
    for (const move of getAllLegalMoves(board, player)) {
      const childHash = computeHash(makeMove(board, move), opponent);
      const fsq = move.fromRow * BOARD_COLS + move.fromCol;
      const tsq = move.toRow * BOARD_COLS + move.toCol;
      const cap = move.isCapture ? (move.capturedOwner === BLUE ? move.capturedType : move.capturedType + 8) : 0;
      pos.make(fsq | (tsq << 6) | (cap << 12));
      expect(pos.keyHi, `hash mismatch for ${move.toString()}`).toBe(childHash.hi);
      expect(pos.keyLo).toBe(childHash.lo);
      pos.undo(fsq | (tsq << 6) | (cap << 12));
    }
  }

  test("starting position both sides", () => {
    check(new Board(), BLUE);
    check(new Board(), RED);
  });

  test("captures and jumps", () => {
    check(
      Board.withPieces(
        [LION, BLUE, 2, 1],
        [TIGER, BLUE, 4, 0],
        [RAT, RED, 4, 1],
        [ELEPHANT, RED, 6, 0],
        [WOLF, RED, 6, 1],
      ),
      BLUE,
    );
    check(
      Board.withPieces(
        [LION, BLUE, 2, 1],
        [TIGER, BLUE, 4, 0],
        [RAT, RED, 4, 1],
        [ELEPHANT, RED, 6, 0],
        [WOLF, RED, 6, 1],
      ),
      RED,
    );
  });

  test("rat in water", () => {
    const board = Board.withPieces([RAT, BLUE, 3, 1], [RAT, RED, 3, 2], [LION, RED, 6, 3]);
    check(board, BLUE);
    check(board, RED);
  });
});

// --- Abort-safe iterative deepening ------------------------------------------

describe("TestAbortSafety", () => {
  test("tiny budget returns legal move", () => {
    const board = new Board();
    const legal = getAllLegalMoves(board, BLUE);
    const result = findBestMove(board, BLUE, { timeLimit: 0.001 });
    expect(result.move).not.toBeNull();
    expect(legal.some((m) => m.equals(result.move!))).toBe(true);
  });

  test("tiny budget does not corrupt board", () => {
    /** A timed-out search must fully restore the board (undo-on-unwind). */
    const board = new Board();
    const before = computeHash(board, BLUE);
    findBestMove(board, BLUE, { timeLimit: 0.002 });
    const after = computeHash(board, BLUE);
    expect(after.hi).toBe(before.hi);
    expect(after.lo).toBe(before.lo);
  });

  test("aborted depth keeps completed result", () => {
    /** The returned move must come from a completed depth, not a partial one. */
    const board = Board.withPieces([LION, BLUE, 7, 3], [RAT, RED, 0, 0]);
    const result = findBestMove(board, BLUE, { timeLimit: 0.5 });
    expect(result.move).not.toBeNull();
    expect(result.move!.toRow).toBe(8);
    expect(result.move!.toCol).toBe(3);
  });
});

// --- Quiescence ---------------------------------------------------------------

describe("TestQuiescence", () => {
  test("avoids losing capture with recapture", () => {
    /** Tiger x Wolf is met by Lion x Tiger -> net loss; engine must avoid it. */
    const board = Board.withPieces([TIGER, BLUE, 8, 1], [WOLF, RED, 8, 0], [LION, RED, 7, 0]);
    const result = findBestMove(board, BLUE, { timeLimit: 0.5, maxDepth: 1 });
    expect(result.move).not.toBeNull();
    expect(`${result.move!.toRow},${result.move!.toCol}`).not.toBe("8,0");
  });

  test("takes genuinely free capture", () => {
    const board = Board.withPieces([TIGER, BLUE, 4, 3], [WOLF, RED, 3, 3]);
    const result = findBestMove(board, BLUE, { timeLimit: 0.5, maxDepth: 1 });
    expect(result.move).not.toBeNull();
    expect(result.move!.toRow).toBe(3);
    expect(result.move!.toCol).toBe(3);
  });

  test("quiesce value reflects recapture", () => {
    /** Quiesce from Red's view: capturing the last Blue piece is an outright win. */
    const board = Board.withPieces([TIGER, BLUE, 8, 0], [LION, RED, 7, 0]);
    const pos = Position.fromBoard(board, RED);
    const s = __testing.makeSearcher(pos, { limit: 2.0 });
    const val = __testing.quiesce(s, -Infinity, Infinity, 0, 1);
    expect(val).toBeGreaterThanOrEqual(WIN);
  });
});

// --- PVS equivalence ----------------------------------------------------------

/** Reference full-window negamax on the fast core (no PVS/TT/LMR).
 *
 * Shares only the quiescence leaf evaluator with the engine, so an exact
 * value match proves PVS + TT + ordering return the true minimax value.
 */
function referenceNegamax(s: ReturnType<typeof __testing.makeSearcher>, depth: number, ply: number): number {
  const pos = s.pos;
  const w = pos.winner();
  if (w !== 0) return w === pos.side ? WIN + (MAX_PLY - ply) : -WIN - (MAX_PLY - ply);
  if (depth <= 0) return __testing.quiesce(s, -Infinity, Infinity, 0, ply);
  const moves = pos.genMoves(pos.side);
  if (moves.length === 0) return -WIN - (MAX_PLY - ply);
  let best = -Infinity;
  for (const mv of moves) {
    pos.make(mv);
    const score = -referenceNegamax(s, depth - 1, ply + 1);
    pos.undo(mv);
    if (score > best) best = score;
  }
  return best;
}

function referenceRootScore(board: Board, player: number, depth: number): number {
  const pos = Position.fromBoard(board, player);
  const s = __testing.makeSearcher(pos, { limit: 30.0 });
  let best = -Infinity;
  for (const mv of pos.genMoves(player)) {
    pos.make(mv);
    const score = -referenceNegamax(s, depth - 1, 1);
    pos.undo(mv);
    if (score > best) best = score;
  }
  return best;
}

describe("TestPVSEquivalence", () => {
  const cases: [Board, number][] = [
    [Board.withPieces([LION, BLUE, 4, 3], [TIGER, RED, 6, 3]), BLUE],
    [Board.withPieces([LION, BLUE, 4, 3], [TIGER, RED, 6, 3]), RED],
    [Board.withPieces([LION, BLUE, 2, 1], [TIGER, BLUE, 4, 0], [RAT, RED, 4, 1], [ELEPHANT, RED, 6, 0]), BLUE],
    [Board.withPieces([TIGER, BLUE, 4, 3], [WOLF, RED, 3, 3], [LION, RED, 2, 3]), BLUE],
    [Board.withPieces([ELEPHANT, BLUE, 6, 2], [RAT, RED, 3, 1], [LION, RED, 0, 0]), RED],
  ];

  test.each(cases)("pvs matches plain ab (%#)", (board, player) => {
    const depth = 3;
    const pos = Position.fromBoard(board, player);
    // Pure config: heuristic prunings off, so the engine must return the
    // exact minimax value the reference computes.
    const s = __testing.makeSearcher(pos, { limit: 30.0, cfg: SearchConfig.pure() });
    const [, engineScore] = __testing.root(s, depth, -Infinity, Infinity, new Int32Array(80));
    const reference = referenceRootScore(board, player, depth);
    expect(engineScore).toBeCloseTo(reference, 6);
  });

  test("full config finds den win through prunings", () => {
    const board = Board.withPieces([LION, BLUE, 7, 3], [RAT, RED, 0, 0]);
    const result = findBestMove(board, BLUE, { timeLimit: 1.0, maxDepth: 6 });
    expect(result.move).not.toBeNull();
    expect(result.move!.toRow).toBe(8);
    expect(result.move!.toCol).toBe(3);
  });

  test("full config declines losing recapture", () => {
    const board = Board.withPieces([TIGER, BLUE, 8, 1], [WOLF, RED, 8, 0], [LION, RED, 7, 0]);
    const result = findBestMove(board, BLUE, { timeLimit: 1.0, maxDepth: 6 });
    expect(result.move).not.toBeNull();
    expect(`${result.move!.toRow},${result.move!.toCol}`).not.toBe("8,0");
  });
});

// --- Depth growth smoke test ---------------------------------------------------

describe("TestKillersHistory", () => {
  test("search deepens with time", () => {
    const board = new Board();
    const shallow = findBestMove(board, BLUE, { timeLimit: 0.1 }).depth;
    const deep = findBestMove(board, BLUE, { timeLimit: 1.0 }).depth;
    expect(shallow).toBeGreaterThanOrEqual(1);
    expect(deep).toBeGreaterThanOrEqual(shallow);
  });
});

// --- Evaluation direction guarantees -------------------------------------------

describe("TestEvalTerms", () => {
  test("eval prefers closer to enemy den", () => {
    const near = Board.withPieces([LION, BLUE, 6, 3], [RAT, RED, 0, 0]);
    const far = Board.withPieces([LION, BLUE, 0, 6], [RAT, RED, 0, 0]);
    expect(evaluate(near, BLUE)).toBeGreaterThan(evaluate(far, BLUE));
  });

  test("trap danger only when captor near", () => {
    const guarded = Board.withPieces([TIGER, BLUE, 7, 3], [LION, RED, 7, 2]);
    const exposed = Board.withPieces([TIGER, BLUE, 7, 3], [LION, RED, 0, 0]);
    expect(evaluate(guarded, BLUE)).toBeLessThan(evaluate(exposed, BLUE));
  });

  test("favors more material", () => {
    const rich = Board.withPieces([LION, BLUE, 4, 3], [RAT, RED, 0, 0]);
    const poor = Board.withPieces([RAT, BLUE, 4, 3], [RAT, RED, 0, 0]);
    expect(evaluate(rich, BLUE)).toBeGreaterThan(evaluate(poor, BLUE));
  });
});

// --- LMR soundness --------------------------------------------------------------

describe("TestLMR", () => {
  test("finds forced den win with lmr", () => {
    const board = Board.withPieces([LION, BLUE, 7, 3], [RAT, RED, 0, 0]);
    const result = findBestMove(board, BLUE, { timeLimit: 1.0, maxDepth: 5 });
    expect(result.move).not.toBeNull();
    expect(result.move!.toRow).toBe(8);
    expect(result.move!.toCol).toBe(3);
  });

  test("still declines losing recapture with lmr", () => {
    const board = Board.withPieces([TIGER, BLUE, 8, 1], [WOLF, RED, 8, 0], [LION, RED, 7, 0]);
    const result = findBestMove(board, BLUE, { timeLimit: 1.0, maxDepth: 5 });
    expect(result.move).not.toBeNull();
    expect(`${result.move!.toRow},${result.move!.toCol}`).not.toBe("8,0");
  });

  test("lmr branch executes without corrupting board", () => {
    const board = new Board();
    const before = computeHash(board, BLUE);
    findBestMove(board, BLUE, { timeLimit: 0.8, maxDepth: 5 });
    const after = computeHash(board, BLUE);
    expect(after.hi).toBe(before.hi);
    expect(after.lo).toBe(before.lo);
  });
});

// --- TT mate-score normalization -------------------------------------------------

describe("TestMateScoreNormalization", () => {
  test("round trip preserves mate distance", () => {
    const score = WIN + (MAX_PLY - 5); // a win detected at ply 5
    const stored = scoreToTt(score, 5);
    const loaded = scoreFromTt(stored, 9);
    expect(loaded).toBe(WIN + (MAX_PLY - 9));
  });

  test("normal scores untouched", () => {
    for (const score of [0.0, 350.0, -1250.75, 29500.0]) {
      expect(scoreToTt(score, 7)).toBe(score);
      expect(scoreFromTt(score, 7)).toBe(score);
    }
  });

  test("losses normalize symmetrically", () => {
    const score = -WIN - (MAX_PLY - 3);
    const stored = scoreToTt(score, 3);
    expect(scoreFromTt(stored, 10)).toBe(-WIN - (MAX_PLY - 10));
  });

  test("mate threshold below win bound", () => {
    expect(MATE_THRESHOLD).toBe(WIN - MAX_PLY);
    expect(MATE_THRESHOLD).toBeLessThanOrEqual(WIN);
  });
});

// --- Repetition awareness ---------------------------------------------------------

describe("TestRepetitionAwareness", () => {
  test("repeated position scores as draw", () => {
    const board = Board.withPieces([RAT, BLUE, 0, 0], [RAT, RED, 8, 6]);
    const pos = Position.fromBoard(board, BLUE);
    const key = { hi: pos.keyHi, lo: pos.keyLo };
    const s = __testing.makeSearcher(pos, { historyKeys: [key, key] });
    const score = __testing.alphabeta(s, 3, -Infinity, Infinity, 1);
    expect(score).toBe(0.0);
  });

  test("single occurrence does not draw", () => {
    const board = Board.withPieces([RAT, BLUE, 0, 0], [RAT, RED, 8, 6]);
    const pos = Position.fromBoard(board, BLUE);
    const key = { hi: pos.keyHi, lo: pos.keyLo };
    const s = __testing.makeSearcher(pos, { historyKeys: [key] });
    const score = __testing.alphabeta(s, 3, -Infinity, Infinity, 1);
    expect(score).not.toBe(0.0);
  });

  test("empty hist scores by evaluation", () => {
    const board = Board.withPieces([RAT, BLUE, 0, 0], [RAT, RED, 8, 6]);
    const pos = Position.fromBoard(board, BLUE);
    const s = __testing.makeSearcher(pos);
    const score = __testing.alphabeta(s, 3, -Infinity, Infinity, 1);
    expect(score).not.toBe(0.0);
  });
});
