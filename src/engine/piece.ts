import { PIECE_NAMES } from "./constants";

/** A single animal piece on the board. */
export class Piece {
  pieceType: number;
  rank: number;
  owner: number;
  row: number;
  col: number;
  alive: boolean;

  constructor(pieceType: number, owner: number, row: number, col: number) {
    this.pieceType = pieceType;
    this.rank = pieceType; // Default rank equals piece type
    this.owner = owner;
    this.row = row;
    this.col = col;
    this.alive = true;
  }

  /** Create a shallow copy of this piece. */
  copy(): Piece {
    const p = new Piece(this.pieceType, this.owner, this.row, this.col);
    p.rank = this.rank;
    p.alive = this.alive;
    return p;
  }

  toString(): string {
    const ownerStr = this.owner === 1 ? "Blue" : "Red";
    return `Piece(${ownerStr} ${PIECE_NAMES[this.pieceType]} at (${this.row},${this.col}))`;
  }
}
