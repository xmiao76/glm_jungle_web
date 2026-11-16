/** Cross-validation of the reference TypeScript position core against Rust/WASM rules.
 *
 * These tests fuzz random playouts and assert the two implementations
 * agree on move generation, game state, Zobrist keys, material, evaluation,
 * and make/undo restoration. Port of tests/test_position.py.
 */
import { describe, expect, test } from "vitest";
import { Board } from "../reference/engine/board";
import { Move } from "../reference/engine/move";
import { makeMove } from "../reference/engine/rules";
import {getAllLegalMoves, getGameState} from "../src/wasm/rules";
import { BOARD_COLS, BLUE, RED, RAT, LION, TIGER } from "../reference/engine/constants";
import { Position, mvFrom, mvTo, mvCap } from "../reference/ai/position";
import { PT_OF, SIDE_OF, VALUE, PSTS, DEN_SQ_BLUE, DEN_SQ_RED, SQ } from "../reference/ai/tables";
import { evaluate, evaluatePos, PIECE_VALUES } from "../reference/ai/evaluation";
import { computeHash } from "../reference/ai/zobrist";
import { makeRng, pick, type Rng } from "./helpers";

function codeOf(pieceType: number, owner: number): number {
  return owner === BLUE ? pieceType : pieceType + 8;
}

/** Engine Move list -> set of "fsq,tsq,cap" strings. */
function engineMovesAsSet(moves: Move[]): Set<string> {
  const out = new Set<string>();
  for (const m of moves) {
    const fsq = m.fromRow * BOARD_COLS + m.fromCol;
    const tsq = m.toRow * BOARD_COLS + m.toCol;
    const cap = m.isCapture ? codeOf(m.capturedType, m.capturedOwner) : 0;
    out.add(`${fsq},${tsq},${cap}`);
  }
  return out;
}

/** Fast-core encoded move list -> set of "fsq,tsq,cap" strings. */
function fastMovesAsSet(moves: number[]): Set<string> {
  return new Set(moves.map((mv) => `${mvFrom(mv)},${mvTo(mv)},${mvCap(mv)}`));
}

describe("TestStaticTables", () => {
  test("value table matches piece values", () => {
    for (let pt = 1; pt <= 8; pt++) {
      expect(VALUE[pt]).toBe(PIECE_VALUES[pt]);
      expect(VALUE[pt + 8]).toBe(PIECE_VALUES[pt]);
    }
  });

  test("code decoding", () => {
    for (let pt = 1; pt <= 8; pt++) {
      expect(PT_OF[codeOf(pt, BLUE)]).toBe(pt);
      expect(SIDE_OF[codeOf(pt, BLUE)]).toBe(BLUE);
      expect(PT_OF[codeOf(pt, RED)]).toBe(pt);
      expect(SIDE_OF[codeOf(pt, RED)]).toBe(RED);
    }
  });
});

describe("TestFromBoardParity", () => {
  test("starting position (both sides)", () => {
    for (const side of [BLUE, RED]) {
      const board = new Board();
      const pos = Position.fromBoard(board, side);
      const h = computeHash(board, side);
      expect(pos.keyHi).toBe(h.hi);
      expect(pos.keyLo).toBe(h.lo);
      expect(pos.side).toBe(side);
    }
  });

  test("key and lists random playout", () => {
    /** Keys must stay identical after every move of a random game. */
    const rng = makeRng(123);
    let board = new Board();
    const pos = Position.fromBoard(board, BLUE);
    let current = BLUE;
    for (let i = 0; i < 80; i++) {
      const legal = getAllLegalMoves(board, current);
      if (legal.length === 0 || getGameState(board).over) break;
      const m = pick(rng, legal);
      const fsq = m.fromRow * BOARD_COLS + m.fromCol;
      const tsq = m.toRow * BOARD_COLS + m.toCol;
      const cap = m.isCapture ? codeOf(m.capturedType, m.capturedOwner) : 0;
      pos.make(fsq | (tsq << 6) | (cap << 12));
      board = makeMove(board, m);
      current = current === BLUE ? RED : BLUE;
      const h = computeHash(board, current);
      expect(pos.keyHi).toBe(h.hi);
      expect(pos.keyLo).toBe(h.lo);
      expect(pos.side).toBe(current);
      expect(pos.blueCnt).toBe(board.getAllPieces(BLUE).length);
      expect(pos.redCnt).toBe(board.getAllPieces(RED).length);
    }
  });
});

describe("TestMovegenParity", () => {
  test("random playouts move sets identical", () => {
    /** For thousands of positions, both generators produce equal sets. */
    const rng = makeRng(456);
    let checked = 0;
    for (let g = 0; g < 25; g++) {
      let board = new Board();
      let current = BLUE;
      for (let i = 0; i < 60; i++) {
        const legal = getAllLegalMoves(board, current);
        if (legal.length === 0 || getGameState(board).over) break;
        const pos = Position.fromBoard(board, current);
        const engineSet = engineMovesAsSet(legal);
        const fastSet = fastMovesAsSet(pos.genMoves(current));
        expect(fastSet).toEqual(engineSet);
        const noisy = fastMovesAsSet(pos.genNoisy(current));
        const enemyDen = current === BLUE ? DEN_SQ_RED : DEN_SQ_BLUE;
        const expectedNoisy = new Set(
          [...fastSet].filter((s) => {
            const [, tsq, cap] = s.split(",").map(Number);
            return cap !== 0 || tsq === enemyDen;
          }),
        );
        expect(noisy).toEqual(expectedNoisy);
        checked++;
        board = makeMove(board, pick(rng, legal));
        current = current === BLUE ? RED : BLUE;
      }
    }
    expect(checked).toBeGreaterThan(400);
  });

  test("lion and tiger jump positions", () => {
    /** Leapers on every river-adjacent square generate identical jumps. */
    for (const pt of [LION, TIGER]) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 7; c++) {
          const board = Board.withPieces([pt, BLUE, r, c]);
          const pos = Position.fromBoard(board, BLUE);
          const engineSet = engineMovesAsSet(getAllLegalMoves(board, BLUE));
          const fastSet = fastMovesAsSet(pos.genMoves(BLUE));
          expect(fastSet, `${pt} at (${r},${c})`).toEqual(engineSet);
        }
      }
    }
  });

  test("rat water capture positions", () => {
    const boards = [
      Board.withPieces([RAT, BLUE, 3, 1], [RAT, RED, 3, 2]),
      Board.withPieces([RAT, BLUE, 3, 1], [RAT, RED, 4, 2], [RAT, BLUE, 4, 1]),
      Board.withPieces([RAT, BLUE, 4, 1], [4, RED, 4, 0]), // Wolf vs water rat
    ];
    for (const board of boards) {
      for (const side of [BLUE, RED]) {
        const pos = Position.fromBoard(board, side);
        const engineSet = engineMovesAsSet(getAllLegalMoves(board, side));
        const fastSet = fastMovesAsSet(pos.genMoves(side));
        expect(fastSet).toEqual(engineSet);
      }
    }
  });
});

describe("TestStateParity", () => {
  test("winner matches engine random playouts", () => {
    const rng = makeRng(789);
    for (let g = 0; g < 15; g++) {
      let board = new Board();
      let current = BLUE;
      for (let i = 0; i < 70; i++) {
        const state = getGameState(board);
        const pos = Position.fromBoard(board, current);
        const fastWinner = pos.winner();
        expect((fastWinner === 0 && !state.over) || fastWinner === state.winner).toBe(true);
        if (state.over) break;
        const legal = getAllLegalMoves(board, current);
        if (legal.length === 0) break;
        board = makeMove(board, pick(rng, legal));
        current = current === BLUE ? RED : BLUE;
      }
    }
  });
});

describe("TestMakeUndo", () => {
  test("undo restores full state", () => {
    /** Deep make/undo chains restore grid, lists, material, key, side. */
    const rng = makeRng(2024);
    const board = new Board();
    const pos = Position.fromBoard(board, BLUE);
    const snapshot = () => ({
      grid: Array.from(pos.grid),
      blue: new Set(Array.from(pos.blueSq.subarray(0, pos.blueCnt))),
      red: new Set(Array.from(pos.redSq.subarray(0, pos.redCnt))),
      matBlue: pos.matBlue,
      matRed: pos.matRed,
      keyHi: pos.keyHi,
      keyLo: pos.keyLo,
      side: pos.side,
    });
    const snap = snapshot();
    const applied: number[] = [];
    let current = BLUE;
    for (let i = 0; i < 40; i++) {
      const moves = pos.genMoves(current);
      if (moves.length === 0 || pos.winner() !== 0) break;
      const mv = pick(rng, moves);
      applied.push(mv);
      pos.make(mv);
      current = current === BLUE ? RED : BLUE;
    }
    while (applied.length > 0) {
      pos.undo(applied.pop()!);
    }
    expect(snapshot()).toEqual(snap);
  });

  test("material tracks engine", () => {
    const rng = makeRng(31337);
    let board = new Board();
    const pos = Position.fromBoard(board, BLUE);
    let current = BLUE;
    for (let i = 0; i < 60; i++) {
      const moves = pos.genMoves(current);
      if (moves.length === 0 || pos.winner() !== 0) break;
      const mv = pick(rng, moves);
      const fr = Math.floor(mvFrom(mv) / BOARD_COLS);
      const fc = mvFrom(mv) % BOARD_COLS;
      const tr = Math.floor(mvTo(mv) / BOARD_COLS);
      const tc = mvTo(mv) % BOARD_COLS;
      const cap = mvCap(mv);
      const engineMove =
        cap !== 0
          ? new Move(fr, fc, tr, tc, PT_OF[cap]!, SIDE_OF[cap]!, tr, tc)
          : new Move(fr, fc, tr, tc);
      pos.make(mv);
      board = makeMove(board, engineMove);
      current = current === BLUE ? RED : BLUE;
      const engineBlue = board
        .getAllPieces(BLUE)
        .reduce((acc, p) => acc + PIECE_VALUES[p.pieceType]!, 0);
      const engineRed = board.getAllPieces(RED).reduce((acc, p) => acc + PIECE_VALUES[p.pieceType]!, 0);
      expect(pos.matBlue).toBe(engineBlue);
      expect(pos.matRed).toBe(engineRed);
    }
  });

  test("pst sums track recompute", () => {
    /** Incremental PST sums equal a full recompute after every move. */
    const rng = makeRng(60606);
    const pos = Position.fromBoard(new Board(), BLUE);
    let current = BLUE;
    for (let i = 0; i < 60; i++) {
      const moves = pos.genMoves(current);
      if (moves.length === 0 || pos.winner() !== 0) break;
      pos.make(pick(rng, moves));
      current = current === BLUE ? RED : BLUE;
      let expBlue = 0;
      for (let i2 = 0; i2 < pos.blueCnt; i2++) expBlue += PSTS[pos.grid[pos.blueSq[i2]!]! * SQ + pos.blueSq[i2]!]!;
      let expRed = 0;
      for (let i2 = 0; i2 < pos.redCnt; i2++) expRed += PSTS[pos.grid[pos.redSq[i2]!]! * SQ + pos.redSq[i2]!]!;
      expect(pos.pstBlue).toBe(expBlue);
      expect(pos.pstRed).toBe(expRed);
    }
  });
});

describe("TestEvalParity", () => {
  const rng: Rng = makeRng(999);

  test("evaluatePos matches evaluate random playouts", () => {
    let checked = 0;
    for (let g = 0; g < 20; g++) {
      let board = new Board();
      let current = BLUE;
      for (let i = 0; i < 50; i++) {
        if (getGameState(board).over) break;
        const pos = Position.fromBoard(board, current);
        for (const side of [BLUE, RED]) {
          expect(evaluatePos(pos, side)).toBeCloseTo(evaluate(board, side), 9);
          checked++;
        }
        const legal = getAllLegalMoves(board, current);
        if (legal.length === 0) break;
        board = makeMove(board, pick(rng, legal));
        current = current === BLUE ? RED : BLUE;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  test("noisy moves are subset", () => {
    const rng2 = makeRng(77);
    for (let g = 0; g < 10; g++) {
      let board = new Board();
      let current = BLUE;
      for (let i = 0; i < 40; i++) {
        if (getGameState(board).over) break;
        const pos = Position.fromBoard(board, current);
        const noisy = fastMovesAsSet(pos.genNoisy(current));
        const all = fastMovesAsSet(pos.genMoves(current));
        for (const m of noisy) expect(all.has(m)).toBe(true);
        const legal = getAllLegalMoves(board, current);
        if (legal.length === 0) break;
        board = makeMove(board, pick(rng2, legal));
        current = current === BLUE ? RED : BLUE;
      }
    }
  });
});
