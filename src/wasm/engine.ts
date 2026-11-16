/** Node tooling adapter around the same WASM module shipped in the browser. */
import { readFile } from "node:fs/promises";
import init, { Engine } from "../../generated/worker/worker.js";
import { Board } from "../../reference/engine/board";
import { Move } from "../../reference/engine/move";
import { WEIGHTS } from "../../reference/ai/weights";
import type {
  SearchOptions as ReferenceOptions,
  SearchResult,
} from "../../reference/ai/search";
export { SearchConfig } from "../../reference/ai/search";
export { Engine as WasmEngine };

await init({
  module_or_path: await readFile(
    new URL("../../generated/worker/worker_bg.wasm", import.meta.url),
  ),
});
export function piecesOf(board: Board): [number, number, number, number][] {
  const pieces: [number, number, number, number][] = [];
  for (let row = 0; row < 9; row++)
    for (let col = 0; col < 7; col++) {
      const p = board.getPiece(row, col);
      if (p) pieces.push([p.pieceType, p.owner, row, col]);
    }
  return pieces;
}
export class TranspositionTable {
  readonly engine: Engine;
  weights = "";
  constructor(sizeEntries = 1 << 21) {
    this.engine = new Engine(Math.floor(Math.log2(sizeEntries)));
  }
  clear() {
    this.engine.clear();
  }
  free() {
    this.engine.free();
  }
}
export type SearchOptions = Omit<ReferenceOptions, "tt"> & {
  tt?: TranspositionTable;
};
export function findBestMove(
  board: Board,
  side: number,
  options: SearchOptions = {},
): SearchResult {
  const table = options.tt ?? new TranspositionTable();
  try {
    const weights = JSON.stringify(WEIGHTS);
    if (table.weights !== weights) {
      table.engine.set_weights(WEIGHTS);
      table.weights = weights;
    }
    const convert = (result: SearchResult): SearchResult => {
      if (!result.move) return { ...result, move: null };
      const m = result.move;
      const victim = board.getPiece(m.toRow, m.toCol);
      return {
        ...result,
        move: new Move(
          m.fromRow,
          m.fromCol,
          m.toRow,
          m.toCol,
          victim?.pieceType ?? 0,
          victim?.owner ?? 0,
          victim ? m.toRow : -1,
          victim ? m.toCol : -1,
        ),
      };
    };
    const result = table.engine.search(
      piecesOf(board),
      side,
      {
        timeLimitMs: (options.timeLimit ?? 1.5) * 1000,
        maxDepth: options.maxDepth ?? null,
        historyKeys: options.historyKeys ?? [],
        config: options.config ?? {},
      },
      options.onIteration
        ? (r: SearchResult) => options.onIteration!(convert(r))
        : undefined,
    ) as SearchResult;
    return convert(result);
  } finally {
    if (!options.tt) table.free();
  }
}
