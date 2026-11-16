/** Original rule fixtures; move generation and terminal outcomes run in Rust/WASM. */
import { describe, expect, test } from "vitest";
import { Board } from "../reference/engine/board";
import { Move } from "../reference/engine/move";
import {
  makeMove,
  makeMoveInPlace,
  undoMoveInPlace,
  getEffectiveRank,
} from "../reference/engine/rules";
import {getLegalMoves, getAllLegalMoves, getGameState} from "../src/wasm/rules";
import {
  BOARD_ROWS,
  BOARD_COLS,
  BLUE,
  RED,
  TRAP_RED,
  TRAP_BLUE,
  RAT,
  CAT,
  WOLF,
  TIGER,
  LION,
  ELEPHANT,
} from "../reference/engine/constants";

/** Helper: create a board with specific pieces. Each tuple is [pieceType, owner, row, col]. */
function makeBoardWith(...pieces: [number, number, number, number][]): Board {
  return Board.withPieces(...pieces);
}

describe("TestBasicMovement", () => {
  test("piece can move orthogonally", () => {
    // Use position with no water adjacent (row 4 has water at cols 1,2,4,5)
    const board = makeBoardWith([LION, BLUE, 4, 3]);
    const moves = getLegalMoves(board, 4, 3);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    // (4,2) and (4,4) are water, so Lion gets horizontal jumps instead
    expect(positions.has("3,3")).toBe(true); // Up
    expect(positions.has("5,3")).toBe(true); // Down
    // Horizontal: water on both sides, so Lion jumps to (4,0) and (4,6)
    expect(positions.has("4,0")).toBe(true); // Jump left across river
    expect(positions.has("4,6")).toBe(true); // Jump right across river
  });

  test("diagonal moves not allowed", () => {
    const board = makeBoardWith([LION, BLUE, 4, 3]);
    const moves = getLegalMoves(board, 4, 3);
    for (const m of moves) {
      expect(m.fromRow === m.toRow || m.fromCol === m.toCol).toBe(true);
    }
  });

  test("cannot move off board", () => {
    const board = makeBoardWith([LION, BLUE, 0, 0]);
    const moves = getLegalMoves(board, 0, 0);
    for (const m of moves) {
      expect(m.toRow >= 0 && m.toRow < BOARD_ROWS).toBe(true);
      expect(m.toCol >= 0 && m.toCol < BOARD_COLS).toBe(true);
    }
  });

  test("cannot move onto own piece", () => {
    const board = makeBoardWith([LION, BLUE, 4, 3], [TIGER, BLUE, 3, 3]);
    const moves = getLegalMoves(board, 4, 3);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("3,3")).toBe(false);
  });

  test("empty square returns no moves", () => {
    const board = makeBoardWith();
    expect(getLegalMoves(board, 4, 3)).toEqual([]);
  });
});

describe("TestBasicCapture", () => {
  test("higher rank captures lower", () => {
    const board = makeBoardWith([TIGER, BLUE, 4, 3], [WOLF, RED, 3, 3]);
    const moves = getLegalMoves(board, 4, 3);
    const captureMoves = moves.filter((m) => m.isCapture);
    expect(captureMoves.length).toBe(1);
    expect(captureMoves[0]!.toRow).toBe(3);
    expect(captureMoves[0]!.toCol).toBe(3);
  });

  test("equal rank captures", () => {
    const board = makeBoardWith([TIGER, BLUE, 4, 3], [TIGER, RED, 3, 3]);
    const moves = getLegalMoves(board, 4, 3);
    const captureMoves = moves.filter((m) => m.isCapture);
    expect(captureMoves.length).toBe(1);
  });

  test("lower rank cannot capture higher", () => {
    const board = makeBoardWith([CAT, BLUE, 4, 3], [TIGER, RED, 3, 3]);
    const moves = getLegalMoves(board, 4, 3);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("3,3")).toBe(false);
  });

  test("cannot capture own piece", () => {
    const board = makeBoardWith([TIGER, BLUE, 4, 3], [WOLF, BLUE, 3, 3]);
    const moves = getLegalMoves(board, 4, 3);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("3,3")).toBe(false);
  });
});

describe("TestRatElephantSpecial", () => {
  test("rat captures elephant from land", () => {
    const board = makeBoardWith([RAT, BLUE, 4, 3], [ELEPHANT, RED, 3, 3]);
    const moves = getLegalMoves(board, 4, 3);
    const captureMoves = moves.filter((m) => m.isCapture);
    expect(captureMoves.length).toBe(1);
  });

  test("rat cannot capture elephant from water", () => {
    // Rat at (3,1) (water), Elephant at (3,0) land.
    const board = makeBoardWith([RAT, BLUE, 3, 1], [ELEPHANT, RED, 3, 0]);
    expect(board.isWater(3, 1)).toBe(true);
    const moves = getLegalMoves(board, 3, 1);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("3,0")).toBe(false); // Cannot capture Elephant from water
  });

  test("elephant cannot capture rat", () => {
    const board = makeBoardWith([ELEPHANT, BLUE, 4, 3], [RAT, RED, 3, 3]);
    const moves = getLegalMoves(board, 4, 3);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("3,3")).toBe(false);
  });
});

describe("TestWaterRules", () => {
  test("rat can enter water", () => {
    const board = makeBoardWith([RAT, BLUE, 3, 0]);
    const moves = getLegalMoves(board, 3, 0);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("3,1")).toBe(true); // Water square
  });

  test("rat can exit water", () => {
    const board = makeBoardWith([RAT, BLUE, 3, 1]);
    const moves = getLegalMoves(board, 3, 1);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("3,0")).toBe(true); // Land square
  });

  test("non rat cannot enter water", () => {
    const board = makeBoardWith([LION, BLUE, 3, 0]);
    const moves = getLegalMoves(board, 3, 0);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("3,1")).toBe(false); // Water square blocked
  });

  test("rat in water invulnerable to land piece", () => {
    // Rat in water, Tiger on adjacent land
    const board = makeBoardWith([RAT, RED, 3, 1], [TIGER, BLUE, 3, 0]);
    const moves = getLegalMoves(board, 3, 0);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("3,1")).toBe(false); // Tiger can't capture Rat in water
  });

  test("rat in water captures enemy rat in water", () => {
    const board = makeBoardWith([RAT, BLUE, 3, 1], [RAT, RED, 3, 2]);
    const moves = getLegalMoves(board, 3, 1);
    const captureMoves = moves.filter((m) => m.isCapture);
    expect(captureMoves.length).toBe(1);
    expect(captureMoves.map((m) => `${m.toRow},${m.toCol}`)).toContain("3,2");
  });
});

describe("TestRiverJumps", () => {
  test("lion jumps vertically", () => {
    // Lion at (2,1), jump down to (6,1) across water (3,1)-(5,1)
    const board = makeBoardWith([LION, BLUE, 2, 1]);
    const moves = getLegalMoves(board, 2, 1);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("3,1")).toBe(false); // Can't enter water
    expect(positions.has("6,1")).toBe(true);
  });

  test("tiger cannot clear long river", () => {
    // The (2,1)->(6,1) jump spans 3 water squares (rows 3-5 at col 1), beyond the Tiger.
    const board = makeBoardWith([TIGER, BLUE, 2, 1]);
    const moves = getLegalMoves(board, 2, 1);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("6,1")).toBe(false);
  });

  test("lion jumps horizontally", () => {
    // Lion at (4,0), jump right across (4,1)(4,2) water to (4,3)
    const board = makeBoardWith([LION, BLUE, 4, 0]);
    const moves = getLegalMoves(board, 4, 0);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("4,3")).toBe(true);
  });

  test("tiger clears short river", () => {
    // The Tiger can clear 2 water squares: (4,0)->(4,3) crosses cols 1-2.
    const board = makeBoardWith([TIGER, BLUE, 4, 0]);
    const moves = getLegalMoves(board, 4, 0);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("4,3")).toBe(true);
  });

  test("tiger short jump captures enemy piece", () => {
    // A Tiger leaps the 2-square crossing to capture an enemy on the far bank.
    const board = makeBoardWith([TIGER, BLUE, 4, 0], [CAT, RED, 4, 3]);
    const moves = getLegalMoves(board, 4, 0);
    const captureMoves = moves.filter((m) => m.isCapture && m.toRow === 4 && m.toCol === 3);
    expect(captureMoves.length).toBe(1);
  });

  test("tiger short jump blocked by rat", () => {
    // A Rat in the water on the path blocks even the Tiger's short jump.
    const board = makeBoardWith([TIGER, BLUE, 4, 0], [RAT, RED, 4, 1]);
    const moves = getLegalMoves(board, 4, 0);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("4,3")).toBe(false);
  });

  test("tiger cannot long jump to capture", () => {
    // Even with a capturable enemy across the 3-square crossing, the Tiger cannot reach it.
    const board = makeBoardWith([TIGER, BLUE, 2, 1], [CAT, RED, 6, 1]);
    const moves = getLegalMoves(board, 2, 1);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("6,1")).toBe(false);
  });

  test("jump blocked by own rat in water", () => {
    // Lion at (2,1), own Rat at (4,1) in water
    const board = makeBoardWith([LION, BLUE, 2, 1], [RAT, BLUE, 4, 1]);
    const moves = getLegalMoves(board, 2, 1);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("6,1")).toBe(false); // Blocked by own Rat
  });

  test("jump blocked by enemy rat in water", () => {
    // Lion at (2,1), enemy Rat at (4,1) in water
    const board = makeBoardWith([LION, BLUE, 2, 1], [RAT, RED, 4, 1]);
    const moves = getLegalMoves(board, 2, 1);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("6,1")).toBe(false); // Blocked by enemy Rat
  });

  test("lion jump captures enemy piece", () => {
    // Lion at (2,1), enemy Cat at (6,1)
    const board = makeBoardWith([LION, BLUE, 2, 1], [CAT, RED, 6, 1]);
    const moves = getLegalMoves(board, 2, 1);
    const captureMoves = moves.filter((m) => m.isCapture && m.toRow === 6 && m.toCol === 1);
    expect(captureMoves.length).toBe(1);
  });

  test("lion cannot jump onto own piece", () => {
    const board = makeBoardWith([LION, BLUE, 2, 1], [CAT, BLUE, 6, 1]);
    const moves = getLegalMoves(board, 2, 1);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("6,1")).toBe(false);
  });
});

describe("TestTraps", () => {
  test("opponent trap reduces rank to zero", () => {
    // Blue piece in Red's trap at (7,3)
    const board = makeBoardWith([TIGER, BLUE, 7, 3]);
    expect(board.getTerrain(7, 3)).toBe(TRAP_RED);
    const rank = getEffectiveRank(board.getPiece(7, 3)!, board);
    expect(rank).toBe(0);
  });

  test("own trap no effect", () => {
    // Blue piece in Blue's own trap at (1,3)
    const board = makeBoardWith([TIGER, BLUE, 1, 3]);
    expect(board.getTerrain(1, 3)).toBe(TRAP_BLUE);
    const rank = getEffectiveRank(board.getPiece(1, 3)!, board);
    expect(rank).toBe(TIGER);
  });

  test("trapped piece captured by any", () => {
    // Blue Tiger trapped in Red trap at (7,3), Red Rat can capture it
    const board = makeBoardWith([TIGER, BLUE, 7, 3], [RAT, RED, 7, 2]);
    const moves = getLegalMoves(board, 7, 2);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("7,3")).toBe(true); // Rat captures trapped Tiger
  });

  test("trap effect restored on exit", () => {
    // Tiger is rank-zeroed in Red's trap at (7,3)...
    const board = makeBoardWith([TIGER, BLUE, 7, 3]);
    expect(getEffectiveRank(board.getPiece(7, 3)!, board)).toBe(0);
    // ...and regains full rank after stepping out to the land square (7,2).
    const newBoard = makeMove(board, new Move(7, 3, 7, 2));
    expect(getEffectiveRank(newBoard.getPiece(7, 2)!, newBoard)).toBe(TIGER);
  });
});

describe("TestDenRules", () => {
  test("cannot enter own den", () => {
    // Blue piece near Blue's den at (0,3)
    const board = makeBoardWith([LION, BLUE, 0, 2]);
    const moves = getLegalMoves(board, 0, 2);
    const positions = new Set(moves.map((m) => `${m.toRow},${m.toCol}`));
    expect(positions.has("0,3")).toBe(false); // Own den blocked
  });

  test("entering opponent den wins", () => {
    // Blue piece moves into Red's den at (8,3)
    const board = makeBoardWith([LION, BLUE, 7, 3]);
    const newBoard = makeMove(board, new Move(7, 3, 8, 3));
    const state = getGameState(newBoard);
    expect(state.over).toBe(true);
    expect(state.winner).toBe(BLUE);
  });

  test("red entering blue den wins", () => {
    const board = makeBoardWith([LION, RED, 1, 3]);
    const newBoard = makeMove(board, new Move(1, 3, 0, 3));
    const state = getGameState(newBoard);
    expect(state.over).toBe(true);
    expect(state.winner).toBe(RED);
  });
});

describe("TestWinDetection", () => {
  test("all blue captured red wins", () => {
    const board = makeBoardWith([LION, RED, 4, 3]);
    const state = getGameState(board);
    expect(state.over).toBe(true);
    expect(state.winner).toBe(RED);
  });

  test("all red captured blue wins", () => {
    const board = makeBoardWith([LION, BLUE, 4, 3]);
    const state = getGameState(board);
    expect(state.over).toBe(true);
    expect(state.winner).toBe(BLUE);
  });

  test("game not over at start", () => {
    const board = new Board();
    const state = getGameState(board);
    expect(state.over).toBe(false);
    expect(state.winner).toBeNull();
  });
});

describe("TestMakeMove", () => {
  test("make move returns new board", () => {
    const board = makeBoardWith([LION, BLUE, 4, 3]);
    const newBoard = makeMove(board, new Move(4, 3, 3, 3));
    expect(newBoard).not.toBe(board);
    expect(board.getPiece(4, 3)).not.toBeNull(); // Original unchanged
    expect(newBoard.getPiece(3, 3)).not.toBeNull();
    expect(newBoard.getPiece(4, 3)).toBeNull();
  });

  test("make move capture", () => {
    const board = makeBoardWith([TIGER, BLUE, 4, 3], [WOLF, RED, 3, 3]);
    const newBoard = makeMove(board, new Move(4, 3, 3, 3));
    expect(newBoard.getPiece(3, 3)!.pieceType).toBe(TIGER);
    expect(newBoard.getPiece(3, 3)!.owner).toBe(BLUE);
  });

  test("make move in place and undo", () => {
    const board = makeBoardWith([TIGER, BLUE, 4, 3], [WOLF, RED, 3, 3]);
    const move = new Move(4, 3, 3, 3, WOLF, RED, 3, 3);
    makeMoveInPlace(board, move);
    expect(board.getPiece(3, 3)!.pieceType).toBe(TIGER);
    expect(board.getPiece(4, 3)).toBeNull();
    undoMoveInPlace(board, move);
    expect(board.getPiece(4, 3)!.pieceType).toBe(TIGER);
    expect(board.getPiece(3, 3)!.pieceType).toBe(WOLF);
  });
});

describe("TestGetAllLegalMoves", () => {
  test("starting position move count", () => {
    const board = new Board();
    const blueMoves = getAllLegalMoves(board, BLUE);
    const redMoves = getAllLegalMoves(board, RED);
    // Blue should have some moves; exact count depends on starting setup
    expect(blueMoves.length).toBeGreaterThan(0);
    expect(redMoves.length).toBeGreaterThan(0);
  });

  test("all moves are legal", () => {
    const board = new Board();
    for (const player of [BLUE, RED]) {
      const moves = getAllLegalMoves(board, player);
      for (const m of moves) {
        const piece = board.getPiece(m.fromRow, m.fromCol);
        expect(piece).not.toBeNull();
        expect(piece!.owner).toBe(player);
      }
    }
  });
});
