/** Test/tool adapter; all move generation and terminal rules execute in WASM. */
import { WasmEngine, piecesOf } from "./engine";
import { Board } from "../../reference/engine/board";
import { Move } from "../../reference/engine/move";
const engine = new WasmEngine(10);

export function getAllLegalMoves(board: Board, side: number): Move[] {
  return (engine.inspect(piecesOf(board), side).moves as number[]).map(
    (encoded) => {
      const from = encoded & 63,
        to = (encoded >>> 6) & 63,
        captured = encoded >>> 12;
      if (!captured)
        return new Move(
          Math.floor(from / 7),
          from % 7,
          Math.floor(to / 7),
          to % 7,
        );
      return new Move(
        Math.floor(from / 7),
        from % 7,
        Math.floor(to / 7),
        to % 7,
        ((captured - 1) % 8) + 1,
        captured <= 8 ? 1 : 2,
        Math.floor(to / 7),
        to % 7,
      );
    },
  );
}
export function getLegalMoves(board: Board, row: number, col: number): Move[] {
  const piece = board.getPiece(row, col);
  if (!piece) return [];
  return getAllLegalMoves(board, piece.owner).filter(
    (m) => m.fromRow === row && m.fromCol === col,
  );
}
export function getGameState(board: Board): {
  over: boolean;
  winner: number | null;
} {
  const winner = engine.inspect(piecesOf(board), 1).winner as number;
  return { over: winner !== 0, winner: winner || null };
}
