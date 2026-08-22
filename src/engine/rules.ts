import {
  BOARD_ROWS,
  BOARD_COLS,
  BLUE,
  RED,
  TRAP_BLUE,
  TRAP_RED,
  DEN_BLUE,
  DEN_RED,
  RAT,
  ELEPHANT,
  LION,
  TIGER,
  DIRECTIONS,
  DEN_POSITIONS,
} from "./constants";
import { Board } from "./board";
import { Piece } from "./piece";
import { Move } from "./move";

export interface GameState {
  over: boolean;
  winner: number | null;
}

/** A piece's effective rank (0 if in opponent's trap, normal otherwise). */
export function getEffectiveRank(piece: Piece, board: Board): number {
  const terrain = board.getTerrain(piece.row, piece.col);
  if (terrain === TRAP_BLUE && piece.owner === RED) return 0;
  if (terrain === TRAP_RED && piece.owner === BLUE) return 0;
  return piece.rank;
}

/** Check if attacker can capture defender given current positions.
 *
 * Rules:
 * - Elephant CANNOT capture Rat
 * - Rat captures Elephant only from land (not from water)
 * - Rat in water can only be captured by enemy Rat also in water
 * - Otherwise: effective rank of attacker >= effective rank of defender
 */
export function canCapture(attacker: Piece, defender: Piece, board: Board): boolean {
  // Elephant cannot capture Rat
  if (attacker.pieceType === ELEPHANT && defender.pieceType === RAT) return false;

  // Rat captures Elephant only from land
  if (attacker.pieceType === RAT && defender.pieceType === ELEPHANT) {
    return !board.isWater(attacker.row, attacker.col);
  }

  // Rat in water is invulnerable to land pieces
  if (board.isWater(defender.row, defender.col) && defender.pieceType === RAT) {
    return attacker.pieceType === RAT && board.isWater(attacker.row, attacker.col);
  }

  // General rule: compare effective ranks (traps reduce rank to 0)
  return getEffectiveRank(attacker, board) >= getEffectiveRank(defender, board);
}

/** Max contiguous water squares a leaper may clear in one jump.
 *
 * Each river is 2 squares wide and 3 squares long, so the stronger Lion
 * (clears 3) can leap across either side of a river, while the weaker Tiger
 * (clears 2) can only leap across the narrow, 2-water-square side.
 */
const LEAP_MAX_WATER = new Map<number, number>([
  [LION, 3],
  [TIGER, 2],
]);

/** Valid landing squares for lion/tiger river jumps.
 *
 * A leaper may jump in any of the four directions over a contiguous run of
 * water squares, landing on the first square beyond the water -- but only if
 * the piece can clear the whole run (Lion up to 3 squares, Tiger up to 2).
 * A jump is blocked if a Rat (of either color) occupies any intervening water square.
 */
export function getRiverJumpDestinations(
  board: Board,
  row: number,
  col: number,
  pieceType: number,
): [number, number][] {
  const maxWater = LEAP_MAX_WATER.get(pieceType) ?? 0;
  if (maxWater === 0) return [];

  const destinations: [number, number][] = [];
  for (const [dr, dc] of DIRECTIONS) {
    let r = row + dr;
    let c = col + dc;
    if (!board.isInBounds(r, c) || !board.isWater(r, c)) continue;

    // Trace the contiguous water run in this direction.
    let blocked = false;
    let waterCount = 0;
    while (board.isInBounds(r, c) && board.isWater(r, c)) {
      const p = board.getPiece(r, c);
      if (p !== null && p.pieceType === RAT) {
        blocked = true;
        break;
      }
      waterCount++;
      r += dr;
      c += dc;
    }

    if (blocked || !board.isInBounds(r, c)) continue;
    // The piece must clear every water square in this lane.
    if (waterCount > maxWater) continue;

    destinations.push([r, c]);
  }

  return destinations;
}

/** All legal moves for the piece at (row, col); empty if no piece there. */
export function getLegalMoves(board: Board, row: number, col: number): Move[] {
  const piece = board.getPiece(row, col);
  if (piece === null) return [];

  const moves: Move[] = [];

  // Standard orthogonal moves
  for (const [dr, dc] of DIRECTIONS) {
    const nr = row + dr;
    const nc = col + dc;
    if (!board.isInBounds(nr, nc)) continue;

    // Cannot enter own den
    const terrain = board.getTerrain(nr, nc);
    if (terrain === DEN_BLUE && piece.owner === BLUE) continue;
    if (terrain === DEN_RED && piece.owner === RED) continue;

    // Water: only Rat can enter
    if (board.isWater(nr, nc) && piece.pieceType !== RAT) continue;

    const target = board.getPiece(nr, nc);

    if (target === null) {
      // Empty square — can always move there
      moves.push(new Move(row, col, nr, nc));
    } else if (target.owner !== piece.owner) {
      // Enemy piece — check if we can capture
      if (canCapture(piece, target, board)) {
        moves.push(
          new Move(row, col, nr, nc, target.pieceType, target.owner, target.row, target.col),
        );
      }
    }
    // Own piece — cannot move there
  }

  // River jumps (Lion and Tiger)
  if (piece.pieceType === LION || piece.pieceType === TIGER) {
    const jumpDests = getRiverJumpDestinations(board, row, col, piece.pieceType);
    for (const [jr, jc] of jumpDests) {
      const terrain = board.getTerrain(jr, jc);
      // Cannot jump into own den (unlikely but check)
      if (terrain === DEN_BLUE && piece.owner === BLUE) continue;
      if (terrain === DEN_RED && piece.owner === RED) continue;

      const target = board.getPiece(jr, jc);
      if (target === null) {
        moves.push(new Move(row, col, jr, jc));
      } else if (target.owner !== piece.owner) {
        if (canCapture(piece, target, board)) {
          moves.push(new Move(row, col, jr, jc, target.pieceType, target.owner, target.row, target.col));
        }
      }
    }
  }

  return moves;
}

/** All legal moves for a player. Used by AI. */
export function getAllLegalMoves(board: Board, player: number): Move[] {
  const moves: Move[] = [];
  for (let row = 0; row < BOARD_ROWS; row++) {
    for (let col = 0; col < BOARD_COLS; col++) {
      const p = board.getPiece(row, col);
      if (p !== null && p.owner === player) {
        for (const m of getLegalMoves(board, row, col)) moves.push(m);
      }
    }
  }
  return moves;
}

/** Execute a move on a COPY of the board and return the new board. */
export function makeMove(board: Board, move: Move): Board {
  const newBoard = board.copy();
  applyMove(newBoard, move);
  return newBoard;
}

/** Mutate board in-place. Used by AI for performance. */
export function makeMoveInPlace(board: Board, move: Move): void {
  applyMove(board, move);
}

/** Undo a move made by makeMoveInPlace. */
export function undoMoveInPlace(board: Board, move: Move): void {
  const piece = board.getPiece(move.toRow, move.toCol);
  if (piece === null) return;

  // Move piece back
  board.setPiece(move.fromRow, move.fromCol, piece);
  board.setPiece(move.toRow, move.toCol, null);

  // Restore captured piece if any
  if (move.isCapture) {
    const captured = new Piece(move.capturedType, move.capturedOwner, move.capturedPosRow, move.capturedPosCol);
    board.setPiece(move.capturedPosRow, move.capturedPosCol, captured);
  }
}

/** Apply a move to a board (mutates the board). */
function applyMove(board: Board, move: Move): void {
  const piece = board.getPiece(move.fromRow, move.fromCol);
  if (piece === null) return;

  board.setPiece(move.fromRow, move.fromCol, null);
  board.setPiece(move.toRow, move.toCol, piece);
}

/** Return the game state: den entry and all-pieces-captured checks.
 *
 * winner is BLUE, RED, or null (game not over).
 */
export function getGameState(board: Board): GameState {
  // Check if any piece is in the opponent's den
  for (const player of [BLUE, RED]) {
    const opponent = player === BLUE ? RED : BLUE;
    const [denRow, denCol] = DEN_POSITIONS[opponent]!;
    const p = board.getPiece(denRow, denCol);
    if (p !== null && p.owner === player) {
      return { over: true, winner: player };
    }
  }

  // Check if a player has lost all pieces
  if (board.getAliveCount(BLUE) === 0) return { over: true, winner: RED };
  if (board.getAliveCount(RED) === 0) return { over: true, winner: BLUE };

  return { over: false, winner: null };
}
