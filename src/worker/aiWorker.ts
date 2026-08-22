/**
 * AI Web Worker entry point.
 *
 * Runs AI search in a background thread, posting progress updates and results
 * back to the main thread. Uses the same search API as the desktop app.
 */
import { Board } from "../engine";
import { findBestMove, type SearchOptions } from "../ai/search";
import type {
  SearchRequest,
  IterationResponse,
  ResultResponse,
  ErrorResponse,
} from "./protocol";

/** Rebuild a Board from the serialized pieces array. */
function rebuildBoard(pieces: Array<[number, number, number, number]>): Board {
  return Board.withPieces(...pieces);
}

/** Handle a search request. */
function handleSearch(req: SearchRequest): void {
  try {
    const board = rebuildBoard(req.pieces);
    const player = req.sideToMove;

    // Build search options
    const opts: SearchOptions = {
      timeLimit: req.timeLimitMs / 1000, // Convert to seconds
      maxDepth: req.maxDepth ?? null,
      historyKeys: req.historyKeys,
      onIteration: (info) => {
        const iterResp: IterationResponse = {
          type: "iteration",
          id: req.id,
          depth: info.depth,
          score: info.score,
          nodes: info.nodes,
          nps: info.nps,
          elapsedMs: info.elapsedMs,
        };
        self.postMessage(iterResp);
      },
    };

    const result = findBestMove(board, player, opts);

    const resp: ResultResponse = {
      type: "result",
      id: req.id,
      move: result.move
        ? {
            fromRow: result.move.fromRow,
            fromCol: result.move.fromCol,
            toRow: result.move.toRow,
            toCol: result.move.toCol,
          }
        : null,
      score: result.score,
      depth: result.depth,
      nodes: result.nodes,
      nps: result.nps,
      elapsedMs: result.elapsedMs,
    };

    self.postMessage(resp);
  } catch (error) {
    const errResp: ErrorResponse = {
      type: "error",
      id: req.id,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(errResp);
  }
}

/** Worker message handler. */
self.onmessage = (e: MessageEvent<SearchRequest>): void => {
  handleSearch(e.data);
};

// Export for type checking (used by aiClient)
export type {};
