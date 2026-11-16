/** A single move on the board. */
export class Move {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  capturedType: number;
  capturedOwner: number;
  capturedPosRow: number;
  capturedPosCol: number;

  constructor(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    capturedType = 0,
    capturedOwner = 0,
    capturedPosRow = -1,
    capturedPosCol = -1,
  ) {
    this.fromRow = fromRow;
    this.fromCol = fromCol;
    this.toRow = toRow;
    this.toCol = toCol;
    this.capturedType = capturedType;
    this.capturedOwner = capturedOwner;
    this.capturedPosRow = capturedPosRow;
    this.capturedPosCol = capturedPosCol;
  }

  get isCapture(): boolean {
    return this.capturedType !== 0;
  }

  get fromPos(): readonly [number, number] {
    return [this.fromRow, this.fromCol];
  }

  get toPos(): readonly [number, number] {
    return [this.toRow, this.toCol];
  }

  /** Equality by from/to squares only (matches the Python engine). */
  equals(other: Move): boolean {
    return (
      this.fromRow === other.fromRow &&
      this.fromCol === other.fromCol &&
      this.toRow === other.toRow &&
      this.toCol === other.toCol
    );
  }

  toString(): string {
    return `Move((${this.fromRow},${this.fromCol})->(${this.toRow},${this.toCol}))`;
  }
}
