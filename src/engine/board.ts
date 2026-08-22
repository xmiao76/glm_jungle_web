import {
  BOARD_ROWS,
  BOARD_COLS,
  TERRAIN_MAP,
  BLUE,
  RED,
  WATER,
  TRAP_BLUE,
  TRAP_RED,
  DEN_BLUE,
  DEN_RED,
  BLUE_START,
  RED_START,
  PIECE_ABBREVIATIONS,
} from "./constants";
import { Piece } from "./piece";

/**
 * The Jungle game board.
 *
 * The terrain map is shared (immutable) across all board copies.
 * Only the piece grid is copied for AI search.
 */
export class Board {
  private readonly _terrain = TERRAIN_MAP;
  private _grid: (Piece | null)[][];

  constructor() {
    this._grid = Array.from({ length: BOARD_ROWS }, () => Array.from({ length: BOARD_COLS }, () => null));
    this.placeInitialPieces();
  }

  /** An empty board with no pieces placed (for tests and custom setups). */
  static empty(): Board {
    const b = new Board();
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) b._grid[row]![col] = null;
    }
    return b;
  }

  /** Place pieces onto an empty board. Each tuple is [pieceType, owner, row, col]. */
  static withPieces(...pieces: [number, number, number, number][]): Board {
    const b = Board.empty();
    for (const [pt, owner, r, c] of pieces) b._grid[r]![c] = new Piece(pt, owner, r, c);
    return b;
  }

  private placeInitialPieces(): void {
    for (const pieceType of Object.keys(BLUE_START)) {
      const pt = Number(pieceType);
      const [row, col] = BLUE_START[pt]!;
      this._grid[row]![col] = new Piece(pt, BLUE, row, col);
    }
    for (const pieceType of Object.keys(RED_START)) {
      const pt = Number(pieceType);
      const [row, col] = RED_START[pt]!;
      this._grid[row]![col] = new Piece(pt, RED, row, col);
    }
  }

  getPiece(row: number, col: number): Piece | null {
    return this._grid[row]![col];
  }

  setPiece(row: number, col: number, piece: Piece | null): void {
    this._grid[row]![col] = piece;
    if (piece !== null) {
      piece.row = row;
      piece.col = col;
    }
  }

  getTerrain(row: number, col: number): number {
    return this._terrain[row]![col]!;
  }

  isInBounds(row: number, col: number): boolean {
    return row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;
  }

  isWater(row: number, col: number): boolean {
    return this._terrain[row]![col] === WATER;
  }

  isTrap(row: number, col: number): boolean {
    const t = this._terrain[row]![col]!;
    return t === TRAP_BLUE || t === TRAP_RED;
  }

  isDen(row: number, col: number): boolean {
    const t = this._terrain[row]![col]!;
    return t === DEN_BLUE || t === DEN_RED;
  }

  getTrapOwner(row: number, col: number): number | null {
    const t = this._terrain[row]![col]!;
    if (t === TRAP_BLUE) return BLUE;
    if (t === TRAP_RED) return RED;
    return null;
  }

  getDenOwner(row: number, col: number): number | null {
    const t = this._terrain[row]![col]!;
    if (t === DEN_BLUE) return BLUE;
    if (t === DEN_RED) return RED;
    return null;
  }

  getAllPieces(owner: number): Piece[] {
    const pieces: Piece[] = [];
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const p = this._grid[row]![col];
        if (p !== null && p.owner === owner && p.alive) pieces.push(p);
      }
    }
    return pieces;
  }

  getAliveCount(owner: number): number {
    let count = 0;
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const p = this._grid[row]![col];
        if (p !== null && p.owner === owner) count++;
      }
    }
    return count;
  }

  /** Create a deep copy of this board (shares terrain map). */
  copy(): Board {
    const nb = Object.create(Board.prototype) as Board;
    (nb as unknown as { _terrain: readonly number[][] })._terrain = this._terrain; // Shared reference
    (nb as unknown as { _grid: (Piece | null)[][] })._grid = Array.from(
      { length: BOARD_ROWS },
      () => Array.from({ length: BOARD_COLS }, () => null),
    );
    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const p = this._grid[row]![col];
        if (p !== null) nb._grid[row]![col] = p.copy();
      }
    }
    return nb;
  }

  toString(): string {
    const lines: string[] = [];
    for (let row = 0; row < BOARD_ROWS; row++) {
      const cells: string[] = [];
      for (let col = 0; col < BOARD_COLS; col++) {
        const p = this._grid[row]![col];
        if (p === null) {
          const t = this._terrain[row]![col]!;
          if (t === WATER) cells.push("~~");
          else if (t === DEN_BLUE) cells.push("DB");
          else if (t === DEN_RED) cells.push("DR");
          else if (t === TRAP_BLUE) cells.push("TB");
          else if (t === TRAP_RED) cells.push("TR");
          else cells.push("..");
        } else {
          const abbr = PIECE_ABBREVIATIONS[p.pieceType]!;
          const prefix = p.owner === BLUE ? "B" : "R";
          cells.push(`${prefix}${abbr}`);
        }
      }
      lines.push(cells.map((c) => c.padStart(3)).join(" "));
    }
    return lines.join("\n");
  }
}
