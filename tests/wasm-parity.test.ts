import { describe, test, expect } from "vitest";
import {
  WasmEngine,
  findBestMove as wasmSearch,
  piecesOf,
  TranspositionTable,
} from "../src/wasm/engine";
import { Board } from "../reference/engine/board";
import {
  getAllLegalMoves,
  makeMove,
  getGameState,
} from "../reference/engine/rules";
import { computeHash, mulberry32 } from "../reference/ai/zobrist";
import {
  evaluate,
  applyWeights,
  resetWeights,
} from "../reference/ai/evaluation";
import { DEFAULT_WEIGHTS } from "../reference/ai/weights";
import { Position } from "../reference/ai/position";
import {
  findBestMove as referenceSearch,
  SearchConfig,
} from "../reference/ai/search";
const encode = (
  m: { fromRow: number; fromCol: number; toRow: number; toCol: number },
  board: Board,
) =>
  (m.fromRow * 7 + m.fromCol) |
  ((m.toRow * 7 + m.toCol) << 6) |
  (((board.getPiece(m.toRow, m.toCol)?.pieceType ?? 0) +
    ((board.getPiece(m.toRow, m.toCol)?.owner ?? 1) - 1) * 8) <<
    12);

describe("Released WebAssembly engine parity", () => {
  test("rules, evaluation, hashes, captures and make/undo match over seeded playouts", () => {
    const engine = new WasmEngine(14);
    const random = mulberry32(42);
    let positions = 0;
    try {
      for (let game = 0; game < 20; game++) {
        let board = new Board();
        let side = 1;
        for (let ply = 0; ply < 100; ply++) {
          const pieces = piecesOf(board);
          const actual = engine.inspect(pieces, side);
          const legal = getAllLegalMoves(board, side);
          const pos = Position.fromBoard(board, side);
          expect(actual.moves.sort((a: number, b: number) => a - b)).toEqual(
            legal.map((m) => encode(m, board)).sort((a, b) => a - b),
          );
          expect(actual.hash).toEqual(computeHash(board, side));
          expect(actual.evaluation).toBeCloseTo(evaluate(board, side), 9);
          expect(actual.winner).toBe(getGameState(board).winner ?? 0);
          expect(actual.material.slice(1)).toEqual([pos.matBlue, pos.matRed]);
          expect(actual.pst.slice(1)).toEqual([pos.pstBlue, pos.pstRed]);
          positions++;
          if (!legal.length || actual.winner) break;
          const move =
            legal[Math.floor((random() / 4294967296) * legal.length)]!;
          const restored = engine.round_trip(pieces, side, encode(move, board));
          expect(restored.pieces).toEqual(pieces);
          expect(restored.hash).toEqual(actual.hash);
          expect(restored.material).toEqual(actual.material);
          expect(restored.pst).toEqual(actual.pst);
          board = makeMove(board, move);
          side = 3 - side;
        }
      }
      expect(positions).toBeGreaterThan(1000);
    } finally {
      engine.free();
    }
  });
  test("fixed-depth scores and selected moves match the reference search", () => {
    const random = mulberry32(8192);
    let board = new Board();
    let side = 1;
    for (let i = 0; i < 16; i++) {
      const opts = { timeLimit: 30, maxDepth: 3, config: new SearchConfig() };
      const expected = referenceSearch(board, side, opts);
      const actual = wasmSearch(board, side, opts);
      expect(actual.depth).toBe(expected.depth);
      expect(actual.score).toBeCloseTo(expected.score, 8);
      expect(actual.move?.fromPos).toEqual(expected.move?.fromPos);
      expect(actual.move?.toPos).toEqual(expected.move?.toPos);
      const legal = getAllLegalMoves(board, side);
      board = makeMove(
        board,
        legal[Math.floor((random() / 4294967296) * legal.length)]!,
      );
      side = 3 - side;
    }
  });
  test("weight updates, repetition and tiny budgets work in the shipped module", () => {
    const board = new Board();
    const pieces = piecesOf(board);
    const engine = new WasmEngine(14);
    try {
      const weights = {
        ...DEFAULT_WEIGHTS,
        adv_w_rat: 3.25,
        den_threat: 9,
        rat_ele: 83,
      };
      applyWeights(weights);
      engine.set_weights(weights);
      expect(engine.inspect(pieces, 1).evaluation).toBeCloseTo(
        evaluate(board, 1),
        9,
      );
    } finally {
      resetWeights();
      engine.free();
    }
    const tt = new TranspositionTable(1 << 14);
    try {
      const result = wasmSearch(board, 1, { timeLimit: 0.000001, tt });
      expect(result.move).not.toBeNull();
      expect(
        getAllLegalMoves(board, 1).some((m) => m.equals(result.move!)),
      ).toBe(true);
      expect(piecesOf(board)).toEqual(pieces);
      const legal = getAllLegalMoves(board, 1);
      const history = legal.map((m) => computeHash(makeMove(board, m), 2));
      const repeated = wasmSearch(board, 1, {
        maxDepth: 2,
        timeLimit: 5,
        historyKeys: history,
        tt,
      });
      expect(repeated.score).toBeCloseTo(0, 12);
    } finally {
      tt.free();
    }
  });
  test("bad external inputs fail without trapping or leaving the engine unusable", () => {
    const engine = new WasmEngine(12);
    try {
      expect(() => engine.inspect([[9, 1, 0, 0]], 1)).toThrow();
      expect(() =>
        engine.inspect(
          [
            [1, 1, 0, 0],
            [2, 2, 0, 0],
          ],
          1,
        ),
      ).toThrow();
      expect(() => engine.inspect([], 3)).toThrow();
      expect(
        engine.inspect(piecesOf(new Board()), 1).moves.length,
      ).toBeGreaterThan(0);
    } finally {
      engine.free();
    }
  });
});
