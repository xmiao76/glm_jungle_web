/**
 * Shared protocol for AI Web Worker communication.
 *
 * The worker runs the AI search in a background thread, posting progress
 * updates and final results back to the main thread.
 */

/** Request to start an AI search. */
export interface SearchRequest {
  /** Unique request ID (for cancellation/tracking). */
  id: string;
  /** Board position as flat piece tuples: [pieceType, owner, row, col][]. */
  pieces: Array<[number, number, number, number]>;
  /** Side to move (1=BLUE, 2=RED). */
  sideToMove: number;
  /** Time budget in milliseconds. */
  timeLimitMs: number;
  /** Optional depth cap (null = unlimited). */
  maxDepth: number | null;
  /** Recent position hashes for repetition detection. */
  historyKeys: Array<{ hi: number; lo: number }>;
}

/** Worker response during search (iteration info). */
export interface IterationResponse {
  type: "iteration";
  /** Request ID this iteration belongs to. */
  id: string;
  /** Current search depth. */
  depth: number;
  /** Score from the player's perspective. */
  score: number;
  /** Nodes searched so far. */
  nodes: number;
  /** Nodes per second. */
  nps: number;
  /** Elapsed time in milliseconds. */
  elapsedMs: number;
}

/** Worker response with final move. */
export interface ResultResponse {
  type: "result";
  /** Request ID this result belongs to. */
  id: string;
  /** Best move found (null if no legal moves). */
  move: { fromRow: number; fromCol: number; toRow: number; toCol: number } | null;
  /** Final score. */
  score: number;
  /** Depth reached. */
  depth: number;
  /** Total nodes searched. */
  nodes: number;
  /** Nodes per second. */
  nps: number;
  /** Total elapsed time in milliseconds. */
  elapsedMs: number;
}

/** Worker error response. */
export interface ErrorResponse {
  type: "error";
  /** Request ID this error belongs to. */
  id: string;
  /** Error message. */
  message: string;
}

/** Union type of all possible worker responses. */
export type WorkerResponse = IterationResponse | ResultResponse | ErrorResponse;
