/** Tests for the Board class (1:1 port of tests/test_board.py). */
import { describe, expect, test } from "vitest";
import { Board } from "../reference/engine/board";
import { Piece } from "../reference/engine/piece";
import {
  BOARD_ROWS,
  BOARD_COLS,
  BLUE,
  RED,
  WATER,
  TERRAIN_MAP,
  BLUE_START,
  RED_START,
} from "../reference/engine/constants";

describe("TestBoardSetup", () => {
  test("board dimensions", () => {
    const board = new Board();
    expect((board as unknown as { _terrain: number[][] })._terrain).toBe(TERRAIN_MAP);
    const grid = (board as unknown as { _grid: (Piece | null)[][] })._grid;
    expect(grid.length).toBe(BOARD_ROWS);
    for (const row of grid) expect(row.length).toBe(BOARD_COLS);
  });

  test("initial blue pieces", () => {
    const board = new Board();
    for (const key of Object.keys(BLUE_START)) {
      const pieceType = Number(key);
      const [row, col] = BLUE_START[pieceType]!;
      const p = board.getPiece(row, col);
      expect(p, `Expected piece at (${row},${col})`).not.toBeNull();
      expect(p!.pieceType).toBe(pieceType);
      expect(p!.owner).toBe(BLUE);
      expect(p!.alive).toBe(true);
    }
  });

  test("initial red pieces", () => {
    const board = new Board();
    for (const key of Object.keys(RED_START)) {
      const pieceType = Number(key);
      const [row, col] = RED_START[pieceType]!;
      const p = board.getPiece(row, col);
      expect(p, `Expected piece at (${row},${col})`).not.toBeNull();
      expect(p!.pieceType).toBe(pieceType);
      expect(p!.owner).toBe(RED);
      expect(p!.alive).toBe(true);
    }
  });

  test("total piece count", () => {
    const board = new Board();
    expect(board.getAliveCount(BLUE)).toBe(8);
    expect(board.getAliveCount(RED)).toBe(8);
  });

  test("empty squares are null", () => {
    const board = new Board();
    const occupied = new Set<string>();
    for (const pieces of [BLUE_START, RED_START]) {
      for (const [row, col] of Object.values(pieces)) occupied.add(`${row},${col}`);
    }
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        if (!occupied.has(`${r},${c}`)) {
          expect(board.getPiece(r, c), `(${r},${c}) should be empty`).toBeNull();
        }
      }
    }
  });
});

describe("TestTerrain", () => {
  test("water squares", () => {
    const board = new Board();
    let waterCount = 0;
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        if (TERRAIN_MAP[r]![c] === WATER) {
          expect(board.isWater(r, c)).toBe(true);
          waterCount++;
        }
      }
    }
    expect(waterCount).toBe(12); // 2 rivers of 6 squares each
  });

  test("den positions", () => {
    const board = new Board();
    expect(board.isDen(0, 3)).toBe(true);
    expect(board.isDen(8, 3)).toBe(true);
    expect(board.getDenOwner(0, 3)).toBe(BLUE);
    expect(board.getDenOwner(8, 3)).toBe(RED);
    expect(board.isDen(0, 0)).toBe(false);
    expect(board.isDen(4, 3)).toBe(false);
  });

  test("trap positions", () => {
    const board = new Board();
    const blueTraps: [number, number][] = [
      [0, 2],
      [0, 4],
      [1, 3],
    ];
    const redTraps: [number, number][] = [
      [8, 2],
      [8, 4],
      [7, 3],
    ];
    for (const [r, c] of blueTraps) {
      expect(board.isTrap(r, c)).toBe(true);
      expect(board.getTrapOwner(r, c)).toBe(BLUE);
    }
    for (const [r, c] of redTraps) {
      expect(board.isTrap(r, c)).toBe(true);
      expect(board.getTrapOwner(r, c)).toBe(RED);
    }
  });
});

describe("TestBoardCopy", () => {
  test("copy produces independent board", () => {
    const board = new Board();
    const copy = board.copy();
    // Move a piece on the copy
    const piece = copy.getPiece(2, 0)!; // Blue Rat
    copy.setPiece(3, 0, piece);
    copy.setPiece(2, 0, null);
    // Original should be unchanged
    expect(board.getPiece(2, 0)).not.toBeNull();
    expect(board.getPiece(3, 0)).toBeNull();
  });

  test("copy shares terrain", () => {
    const board = new Board();
    const copy = board.copy();
    expect((board as unknown as { _terrain: number[][] })._terrain).toBe(
      (copy as unknown as { _terrain: number[][] })._terrain,
    );
  });

  test("piece positions in copy", () => {
    const board = new Board();
    const copy = board.copy();
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        const pOrig = board.getPiece(r, c);
        const pCopy = copy.getPiece(r, c);
        if (pOrig === null) {
          expect(pCopy).toBeNull();
        } else {
          expect(pCopy!.pieceType).toBe(pOrig.pieceType);
          expect(pCopy!.owner).toBe(pOrig.owner);
        }
      }
    }
  });
});

describe("TestBoardPieceManagement", () => {
  test("set and get piece", () => {
    const board = new Board();
    const p = new Piece(7, BLUE, 4, 4);
    board.setPiece(4, 4, p);
    const result = board.getPiece(4, 4);
    expect(result).toBe(p);
    expect(result!.row).toBe(4);
    expect(result!.col).toBe(4);
  });

  test("remove piece", () => {
    const board = new Board();
    board.setPiece(0, 0, null);
    expect(board.getPiece(0, 0)).toBeNull();
  });

  test("is in bounds", () => {
    const board = new Board();
    expect(board.isInBounds(0, 0)).toBe(true);
    expect(board.isInBounds(8, 6)).toBe(true);
    expect(board.isInBounds(-1, 0)).toBe(false);
    expect(board.isInBounds(9, 0)).toBe(false);
    expect(board.isInBounds(0, 7)).toBe(false);
  });

  test("get all pieces blue", () => {
    const board = new Board();
    const pieces = board.getAllPieces(BLUE);
    expect(pieces.length).toBe(8);
    expect(pieces.every((p) => p.owner === BLUE)).toBe(true);
  });

  test("get all pieces red", () => {
    const board = new Board();
    const pieces = board.getAllPieces(RED);
    expect(pieces.length).toBe(8);
    expect(pieces.every((p) => p.owner === RED)).toBe(true);
  });
});
