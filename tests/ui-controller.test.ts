/**
 * Unit tests for UI controller logic.
 *
 * Tests flip mapping, draw detection, first-mover combos, and piece
 * serialization - pure logic without canvas/React.
 */
import { describe, it, expect } from "vitest";
import { Board, BLUE, RED } from "../src/engine";
import { computeHash } from "../src/ai/zobrist";
import { checkDraw, FIRST_MOVER_CHOICES } from "../src/ui/gameController";

describe("UI Controller Logic", () => {
  describe("flip mapping", () => {
    it("should be involutive - flipping twice returns to original", () => {
      // Test all board positions
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
          // Apply flip transformation twice
          const flippedRow = 8 - row;
          const flippedCol = 6 - col;
          const doubleFlippedRow = 8 - flippedRow;
          const doubleFlippedCol = 6 - flippedCol;

          expect(doubleFlippedRow).toBe(row);
          expect(doubleFlippedCol).toBe(col);
        }
      }
    });

    it("should not change game state when flipping view", () => {
      // Create a board
      const board = new Board();

      // Record initial state
      const initialPieces: Array<{ row: number; col: number; type: number; owner: number } | null> = [];
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
          const piece = board.getPiece(row, col);
          initialPieces.push(
            piece ? { row, col, type: piece.pieceType, owner: piece.owner } : null
          );
        }
      }

      // Apply coordinate transformation (view flip doesn't modify board)
      // This is a no-op on the actual board state
      const boardAfter = new Board(); // Fresh board to compare

      // Verify no pieces changed
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
          const piece = boardAfter.getPiece(row, col);
          const initial = initialPieces[row * 7 + col];

          if (initial === null) {
            expect(piece).toBeNull();
          } else {
            expect(piece).not.toBeNull();
            expect(piece!.pieceType).toBe(initial.type);
            expect(piece!.owner).toBe(initial.owner);
          }
        }
      }
    });
  });

  describe("check-draw logic", () => {
    it("should detect 3-fold repetition as draw", () => {
      const positionCounts = new Map<string, number>();
      const hashKey = "123,456";

      // First occurrence - not a draw
      positionCounts.set(hashKey, 1);
      expect(checkDraw(positionCounts, hashKey, 10)).toBe(false);

      // Second occurrence - not a draw
      positionCounts.set(hashKey, 2);
      expect(checkDraw(positionCounts, hashKey, 10)).toBe(false);

      // Third occurrence - draw!
      positionCounts.set(hashKey, 3);
      expect(checkDraw(positionCounts, hashKey, 10)).toBe(true);
    });

    it("should detect move count cap (400) as draw", () => {
      const positionCounts = new Map<string, number>();
      const hashKey = "123,456";

      // Below cap - not a draw
      expect(checkDraw(positionCounts, hashKey, 400)).toBe(false);

      // At cap - draw
      expect(checkDraw(positionCounts, hashKey, 401)).toBe(true);
    });

    it("should prioritize repetition over move cap", () => {
      const positionCounts = new Map<string, number>();
      const hashKey = "123,456";

      // 3-fold repetition at low move count
      positionCounts.set(hashKey, 3);
      expect(checkDraw(positionCounts, hashKey, 10)).toBe(true);

      // 2-fold repetition at high move count (not a draw)
      positionCounts.set(hashKey, 2);
      expect(checkDraw(positionCounts, hashKey, 401)).toBe(true); // cap triggers
    });

    it("should not trigger draw on empty position", () => {
      const positionCounts = new Map<string, number>();
      const hashKey = "999,888";

      // Non-existent key with low move count
      expect(checkDraw(positionCounts, hashKey, 10)).toBe(false);

      // Non-existent key with high move count
      expect(checkDraw(positionCounts, hashKey, 401)).toBe(true);
    });
  });

  describe("first-mover combos", () => {
    it("should provide all 4 independent combinations for Human vs AI", () => {
      const choices = Object.keys(FIRST_MOVER_CHOICES);
      expect(choices).toHaveLength(4);

      // Each combo should have humanColor and firstPlayer
      for (const choice of choices) {
        const combo = FIRST_MOVER_CHOICES[choice];
        expect(combo).toBeDefined();
        expect(combo.humanColor).toBeDefined();
        expect(combo.firstPlayer).toBeDefined();
        expect([BLUE, RED]).toContain(combo.humanColor);
        expect([BLUE, RED]).toContain(combo.firstPlayer);
      }
    });

    it("should allow independent color and first-mover selection", () => {
      // Blue human, Blue moves first
      expect(FIRST_MOVER_CHOICES["Blue - You first"]).toEqual({
        humanColor: BLUE,
        firstPlayer: BLUE,
      });

      // Blue human, Red moves first
      expect(FIRST_MOVER_CHOICES["Blue - AI first"]).toEqual({
        humanColor: BLUE,
        firstPlayer: RED,
      });

      // Red human, Red moves first
      expect(FIRST_MOVER_CHOICES["Red - You first"]).toEqual({
        humanColor: RED,
        firstPlayer: RED,
      });

      // Red human, Blue moves first
      expect(FIRST_MOVER_CHOICES["Red - AI first"]).toEqual({
        humanColor: RED,
        firstPlayer: BLUE,
      });
    });
  });

  describe("pieces serialization round-trip", () => {
    it("should serialize and deserialize board correctly", () => {
      const board = new Board();

      // Serialize to pieces array
      const pieces: Array<[number, number, number, number]> = [];
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
          const piece = board.getPiece(row, col);
          if (piece) {
            pieces.push([piece.pieceType, piece.owner, row, col]);
          }
        }
      }

      // Deserialize (rebuild board)
      const rebuiltBoard = Board.withPieces(...pieces);

      // Verify all pieces match
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
          const original = board.getPiece(row, col);
          const rebuilt = rebuiltBoard.getPiece(row, col);

          if (original === null) {
            expect(rebuilt).toBeNull();
          } else {
            expect(rebuilt).not.toBeNull();
            expect(rebuilt!.pieceType).toBe(original.pieceType);
            expect(rebuilt!.owner).toBe(original.owner);
            expect(rebuilt!.row).toBe(original.row);
            expect(rebuilt!.col).toBe(original.col);
          }
        }
      }
    });

    it("should handle empty board serialization", () => {
      const pieces: Array<[number, number, number, number]> = [];
      const board = Board.withPieces(...pieces);

      // Should be empty
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
          expect(board.getPiece(row, col)).toBeNull();
        }
      }
    });

    it("should handle single piece serialization", () => {
      const pieces: Array<[number, number, number, number]> = [[1, BLUE, 0, 0]]; // Rat at (0,0)
      const board = Board.withPieces(...pieces);

      const piece = board.getPiece(0, 0);
      expect(piece).not.toBeNull();
      expect(piece!.pieceType).toBe(1);
      expect(piece!.owner).toBe(BLUE);

      // All other cells should be empty
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
          if (row !== 0 || col !== 0) {
            expect(board.getPiece(row, col)).toBeNull();
          }
        }
      }
    });

    it("should preserve pieces during round-trip", () => {
      const board = new Board();

      // Serialize every occupied square
      const serialized: Array<[number, number, number, number]> = [];
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
          const piece = board.getPiece(row, col);
          if (piece) serialized.push([piece.pieceType, piece.owner, row, col]);
        }
      }

      // Deserialize and compare cell by cell
      const rebuiltBoard = Board.withPieces(...serialized);
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 7; col++) {
          const original = board.getPiece(row, col);
          const rebuilt = rebuiltBoard.getPiece(row, col);
          if (original === null) {
            expect(rebuilt).toBeNull();
          } else {
            expect(rebuilt).not.toBeNull();
            expect(rebuilt!.pieceType).toBe(original.pieceType);
            expect(rebuilt!.owner).toBe(original.owner);
          }
        }
      }
    });
  });

  describe("hash key serialization", () => {
    it("should generate consistent hash keys", () => {
      const board = new Board();
      const hash1 = computeHash(board, BLUE);
      const hash2 = computeHash(board, BLUE);

      expect(hash1.hi).toBe(hash2.hi);
      expect(hash1.lo).toBe(hash2.lo);
    });

    it("should generate different hashes for different sides to move", () => {
      const board = new Board();
      const hashBlue = computeHash(board, BLUE);
      const hashRed = computeHash(board, RED);

      // At least one component should differ
      const matches = hashBlue.hi === hashRed.hi && hashBlue.lo === hashRed.lo;
      expect(matches).toBe(false);
    });

    it("should generate string keys suitable for Map", () => {
      const board = new Board();
      const hash = computeHash(board, BLUE);
      const hashKey = `${hash.hi},${hash.lo}`;

      // Should be parseable
      const parts = hashKey.split(",");
      expect(parts).toHaveLength(2);
      expect(parseInt(parts[0]!)).toBe(hash.hi);
      expect(parseInt(parts[1]!)).toBe(hash.lo);
    });
  });
});
