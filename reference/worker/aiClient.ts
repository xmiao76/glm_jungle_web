/**
 * Main-thread client for the AI Web Worker.
 *
 * Manages worker lifecycle, sends search requests, handles responses, and
 * provides cancellation support.
 */
import type { SearchRequest, WorkerResponse } from "./protocol";

/** Search result returned to the caller. */
export interface SearchResult {
  move: { fromRow: number; fromCol: number; toRow: number; toCol: number } | null;
  score: number;
  depth: number;
  nodes: number;
  nps: number;
  elapsedMs: number;
}

/** Callback type for iteration updates during search. */
export type IterationCallback = (info: {
  depth: number;
  score: number;
  nodes: number;
  nps: number;
  elapsedMs: number;
}) => void;

/** AI client for running searches in a Web Worker. */
export class AiClient {
  private worker: Worker | null = null;
  private currentId: string | null = null;
  private resolveMap: Map<string, (result: SearchResult) => void> = new Map();
  private rejectMap: Map<string, (error: Error) => void> = new Map();
  private iterationCallbacks: Map<string, IterationCallback> = new Map();
  private nextId = 0;

  constructor() {
    this.spawnWorker();
  }

  /** Spawn a new worker instance. */
  private spawnWorker(): void {
    try {
      this.worker = new Worker(new URL("./aiWorker.ts", import.meta.url), {
        type: "module",
      });

      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        this.handleResponse(e.data);
      };

      this.worker.onerror = (error) => {
        // If we have a pending request, reject it
        if (this.currentId && this.rejectMap.has(this.currentId)) {
          const reject = this.rejectMap.get(this.currentId)!;
          reject(new Error(`Worker error: ${error.message}`));
          this.cleanup();
        }
      };
    } catch (error) {
      throw new Error(
        `Failed to create AI worker: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /** Handle a worker response. */
  private handleResponse(resp: WorkerResponse): void {
    const id = resp.id;

    if (resp.type === "iteration") {
      const callback = this.iterationCallbacks.get(id);
      if (callback && id === this.currentId) {
        callback({
          depth: resp.depth,
          score: resp.score,
          nodes: resp.nodes,
          nps: resp.nps,
          elapsedMs: resp.elapsedMs,
        });
      }
    } else if (resp.type === "result") {
      const resolve = this.resolveMap.get(id);
      if (resolve) {
        resolve({
          move: resp.move,
          score: resp.score,
          depth: resp.depth,
          nodes: resp.nodes,
          nps: resp.nps,
          elapsedMs: resp.elapsedMs,
        });
        this.cleanup();
      }
    } else if (resp.type === "error") {
      const reject = this.rejectMap.get(id);
      if (reject) {
        reject(new Error(resp.message));
        this.cleanup();
      }
    }
  }

  /** Clean up state after a request completes/fails. */
  private cleanup(): void {
    if (this.currentId) {
      this.resolveMap.delete(this.currentId);
      this.rejectMap.delete(this.currentId);
      this.iterationCallbacks.delete(this.currentId);
    }
    this.currentId = null;
  }

  /**
   * Execute an AI search.
   *
   * @param req - Search request parameters
   * @param onIteration - Optional callback for iteration updates
   * @returns Promise resolving to the search result
   */
  async search(
    req: SearchRequest,
    onIteration?: IterationCallback
  ): Promise<SearchResult> {
    // Generate unique ID
    const id = `search_${this.nextId++}`;

    // Cancel any pending search
    if (this.currentId) {
      this.cancel();
    }

    // Set up callbacks
    const promise = new Promise<SearchResult>((resolve, reject) => {
      this.resolveMap.set(id, resolve);
      this.rejectMap.set(id, reject);
    });

    if (onIteration) {
      this.iterationCallbacks.set(id, onIteration);
    }

    // Store request and send
    this.currentId = id;

    if (!this.worker) {
      this.spawnWorker();
    }

    this.worker!.postMessage({ ...req, id });

    return promise;
  }

  /** Cancel the current search and respawn the worker. */
  cancel(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    if (this.currentId) {
      const reject = this.rejectMap.get(this.currentId);
      if (reject) {
        reject(new Error("Search cancelled"));
      }
      this.cleanup();
    }
  }

  /** Terminate the worker and clean up resources. */
  terminate(): void {
    this.cancel();
  }
}
