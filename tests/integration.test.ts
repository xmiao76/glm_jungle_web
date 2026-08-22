/** Integration tests: complete game scenarios, AI vs AI games, regressions.
 * Port of tests/test_integration.py. */
import { describe, expect, test } from "vitest";
import { Board } from "../src/engine/board";
import { Move } from "../src/engine/move";
import {
  getLegalMoves,
  getAllLegalMoves,
  makeMove,
  getGameState,
  makeMoveInPlace,
  undoMoveInPlace,
} from "../src/engine/rules";
import { BLUE, RED, RAT, CAT, TIGER, LION } from "../src/engine/constants";
import { findBestMove } from "../src/ai/search";
import { TranspositionTable } from "../src/ai/transposition";
import { computeHash } from "../src/ai/zobrist";
import { checkDraw, hashKey, MAX_GAME_MOVES } from "../src/engine/draw";

describe("TestAIVsAIGames", () => {
  test("ai vs ai completes game", () => {
    /** Two AIs should complete a game within the move cap. */
    let board = new Board();
    let current = BLUE;
    const ttBlue = new TranspositionTable(1 << 18);
    const ttRed = new TranspositionTable(1 << 18);
    const counts = new Map<string, number>();
    const recentKeys: { hi: number; lo: number }[] = [];
    let moveCount = 0;

    while (moveCount < MAX_GAME_MOVES + 10) {
      const state = getGameState(board);
      if (state.over) {
        expect(state.winner).not.toBeNull();
        return; // Test passes — game completed
      }
      const h = computeHash(board, current);
      const key = hashKey(h);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (checkDraw(counts, key, moveCount)) return; // draw — game complete

      const tt = current === BLUE ? ttBlue : ttRed;
      const result = findBestMove(board, current, {
        timeLimit: 0.06,
        tt,
        historyKeys: recentKeys.slice(-32),
      });
      if (result.move === null) break;

      board = makeMove(board, result.move);
      recentKeys.push(h);
      current = current === BLUE ? RED : BLUE;
      if (current === BLUE) moveCount++;
    }
    expect(moveCount).toBeGreaterThan(10);
  }, 120_000);

  test("ai vs ai multiple games", () => {
    for (let gameNum = 0; gameNum < 2; gameNum++) {
      let board = new Board();
      let current = BLUE;
      const tt = new TranspositionTable(1 << 18);
      let movesCount = 0;
      const counts = new Map<string, number>();

      while (movesCount < 300) {
        const state = getGameState(board);
        if (state.over) break;
        const h = computeHash(board, current);
        const key = hashKey(h);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        if (checkDraw(counts, key, movesCount)) break;

        const result = findBestMove(board, current, { timeLimit: 0.05, tt });
        if (result.move === null) break;
        board = makeMove(board, result.move);
        current = current === BLUE ? RED : BLUE;
        if (current === BLUE) movesCount++;
      }
    }
  }, 120_000);
});

describe("TestFullGameScenarios", () => {
  test("blue wins by den entry", () => {
    const board = Board.withPieces([LION, BLUE, 7, 3], [RAT, RED, 6, 6]);
    const result = findBestMove(board, BLUE, { timeLimit: 0.5 });
    expect(result.move).not.toBeNull();
    expect(result.move!.toRow).toBe(8);
    expect(result.move!.toCol).toBe(3);
  });

  test("red wins by den entry", () => {
    const board = Board.withPieces([TIGER, RED, 1, 3], [RAT, BLUE, 2, 0]);
    const result = findBestMove(board, RED, { timeLimit: 0.5 });
    expect(result.move).not.toBeNull();
    expect(result.move!.toRow).toBe(0);
    expect(result.move!.toCol).toBe(3);
  });

  test("game from starting position", () => {
    let board = new Board();
    let current = BLUE;
    for (let i = 0; i < 20; i++) {
      const state = getGameState(board);
      expect(state.over, `Game shouldn't end in ${i} moves from start`).toBe(false);
      const moves = getAllLegalMoves(board, current);
      expect(moves.length).toBeGreaterThan(0);
      board = makeMove(board, moves[0]!);
      current = current === BLUE ? RED : BLUE;
    }
  });
});

describe("TestMoveUndoConsistency", () => {
  test("undo restores board state", () => {
    const board = new Board();
    const originalRepr = board.toString();

    const moves = getAllLegalMoves(board, BLUE);
    for (const move of moves.slice(0, 5)) {
      const fromPiece = board.getPiece(move.fromRow, move.fromCol)!;
      const toPiece = board.getPiece(move.toRow, move.toCol);

      const moveCaptured =
        toPiece !== null
          ? new Move(
              move.fromRow,
              move.fromCol,
              move.toRow,
              move.toCol,
              toPiece.pieceType,
              toPiece.owner,
              toPiece.row,
              toPiece.col,
            )
          : move;

      makeMoveInPlace(board, moveCaptured);
      undoMoveInPlace(board, moveCaptured);

      const restoredFrom = board.getPiece(move.fromRow, move.fromCol);
      const restoredTo = board.getPiece(move.toRow, move.toCol);
      expect(restoredFrom, "From piece should be restored").not.toBeNull();
      expect(restoredFrom!.pieceType).toBe(fromPiece.pieceType);
      expect(restoredFrom!.owner).toBe(fromPiece.owner);

      if (toPiece === null) {
        expect(restoredTo).toBeNull();
      } else {
        expect(restoredTo).not.toBeNull();
        expect(restoredTo!.pieceType).toBe(toPiece.pieceType);
        expect(restoredTo!.owner).toBe(toPiece.owner);
      }
    }

    expect(board.toString()).toBe(originalRepr);
  });
});

describe("TestEdgeCases", () => {
  test("lion jump from edge", () => {
    const board = Board.withPieces([LION, BLUE, 5, 0]);
    const moves = getLegalMoves(board, 5, 0);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("6,0")).toBe(true);
    expect(positions.has("4,0")).toBe(true);
  });

  test("piece surrounded by own", () => {
    const board = Board.withPieces([TIGER, BLUE, 0, 0], [RAT, BLUE, 0, 1], [CAT, BLUE, 1, 0]);
    expect(getLegalMoves(board, 0, 0).length).toBe(0);
  });

  test("multiple rats in water", () => {
    const board = Board.withPieces(
      [RAT, BLUE, 3, 1],
      [RAT, RED, 3, 2],
      [RAT, BLUE, 4, 1],
      [RAT, RED, 4, 2],
    );
    const moves = getLegalMoves(board, 3, 1);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("4,1")).toBe(false); // Own piece there
    expect(positions.has("3,2")).toBe(true); // Capture enemy rat in water
    expect(positions.has("3,0")).toBe(true); // Move to land
  });
});

describe("TestRepetitionDraw", () => {
  /** Draw handling: 3-fold repetition / move-cap keeps games finite. */

  test("check draw helper", () => {
    expect(checkDraw(new Map(), "12345", 0)).toBe(false); // never seen
    expect(checkDraw(new Map([["12345", 2]]), "12345", 10)).toBe(false); // 2-fold
    expect(checkDraw(new Map([["12345", 3]]), "12345", 10)).toBe(true); // 3-fold
    expect(checkDraw(new Map([["12345", 1]]), "12345", MAX_GAME_MOVES + 1)).toBe(true); // move cap
  });

  test("oscillating position is declared draw", () => {
    /** Two non-interacting rats shuttling forever must hit a draw. */
    let board = Board.withPieces([RAT, BLUE, 0, 0], [RAT, RED, 8, 6]);
    const counts = new Map<string, number>();
    let moveCount = 0;
    let current = BLUE;

    const blueSeq = [new Move(0, 0, 0, 1), new Move(0, 1, 0, 0)];
    const redSeq = [new Move(8, 6, 8, 5), new Move(8, 5, 8, 6)];
    let bi = 0;
    let ri = 0;
    let declared: string | null = null;

    for (let i = 0; i < 60; i++) {
      const move = current === BLUE ? blueSeq[bi % 2]! : redSeq[ri % 2]!;
      board = makeMove(board, move);
      current = current === BLUE ? RED : BLUE;
      if (current === BLUE) {
        moveCount++;
        bi++;
      } else {
        ri++;
      }
      const h = computeHash(board, current);
      const key = hashKey(h);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (checkDraw(counts, key, moveCount)) {
        declared = "DRAW";
        break;
      }
    }

    expect(declared).toBe("DRAW");
  });
});
