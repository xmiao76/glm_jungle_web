/**
 * Game controller for the Jungle UI.
 *
 * Ported from main.py - manages game state, AI integration, repetition
 * detection, and coordinates between the engine and UI.
 */
import {
  Board,
  Move,
  BLUE,
  RED,
  getLegalMoves,
  getAllLegalMoves,
  makeMove,
  getGameState,
} from "../engine";
import { computeHash } from "../ai/zobrist";
import {
  checkDraw,
  MAX_GAME_MOVES,
  HISTORY_WINDOW,
  hashKey as pairKey,
} from "../engine/draw";
import type { AiClient, SearchResult as AiSearchResult } from "../worker/aiClient";
import { sounds } from "./sounds";

/** Game state enum. */
export enum GameState {
  MENU = "menu",
  FIRST_MOVER = "first_mover",
  PLAYING = "playing",
  ANIMATING = "animating",
  AI_THINKING = "ai_thinking",
  GAME_OVER = "game_over",
}

/** Game mode. */
export enum GameMode {
  HUMAN_VS_AI = "human_vs_ai",
  AI_VS_AI = "ai_vs_ai",
}

/** AI difficulty presets. */
export const DIFFICULTY_PRESETS: Record<string, { timeLimit: number; maxDepth: number | null }> = {
  Easy: { timeLimit: 0.4, maxDepth: 3 },
  Medium: { timeLimit: 1.2, maxDepth: null },
  Hard: { timeLimit: 3.0, maxDepth: null },
};

export const DIFFICULTY_ORDER = ["Easy", "Medium", "Hard"] as const;

/** First-mover choices for Human vs AI. */
export const FIRST_MOVER_CHOICES: Record<
  string,
  { humanColor: number; firstPlayer: number }
> = {
  "Blue - You first": { humanColor: BLUE, firstPlayer: BLUE },
  "Blue - AI first": { humanColor: BLUE, firstPlayer: RED },
  "Red - You first": { humanColor: RED, firstPlayer: RED },
  "Red - AI first": { humanColor: RED, firstPlayer: BLUE },
};

/** Draw handling (3-fold repetition / move cap), shared with the engine. */
export { checkDraw, MAX_GAME_MOVES };

/** Game controller configuration. */
export interface GameControllerConfig {
  aiClient: AiClient;
  onStateChange?: (state: GameState) => void;
  onBoardUpdate?: () => void;
  onAiStats?: (stats: AiSearchResult | null, evalForBlue: number | null) => void;
}

/** Move log entry for the history panel. */
export interface MoveLogEntry {
  side: number;
  pieceType: number;
  from: [number, number];
  to: [number, number];
  capture: boolean;
}

/** Pre-move snapshot for undo. */
interface UndoSnapshot {
  pieces: Array<[number, number, number, number]>;
  currentPlayer: number;
  moveCount: number;
  positionCounts: Map<string, number>;
  captured: Map<number, number[]>;
  recentHashes: { hi: number; lo: number }[];
  lastMove: { from: [number, number]; to: [number, number] } | null;
  moveLog: MoveLogEntry[];
}

/** Game controller class. */
export class GameController {
  private aiClient: AiClient;
  private onStateChange?: (state: GameState) => void;
  private onBoardUpdate?: () => void;
  private onAiStats?: (stats: AiSearchResult | null, evalForBlue: number | null) => void;

  // Game state
  private state: GameState = GameState.MENU;
  private board: Board;
  private currentPlayer: number;
  private aiPlayer: number;
  private aiPlayer2: number | null = null;
  private firstPlayer: number;
  private difficulty: string = "Medium";
  private winner: number | "DRAW" | null = null;
  private moveCount = 0;

  // Human player
  private humanColor: number;

  // Selection and animation
  private selectedPos: [number, number] | null = null;
  private legalMoves: Move[] = [];
  private pendingMove: Move | null = null;
  private animatingMove: Move | null = null;
  private animationStartTime = 0;
  private animationDuration = 180;

  // Repetition tracking: counts are kept for the WHOLE game (a 3-fold draw
  // must stand even when an early occurrence slides out of the window handed
  // to the search). Only the window given to the AI is bounded.
  private positionCounts = new Map<string, number>();
  private recentHashes: { hi: number; lo: number }[] = [];

  // Captured pieces
  private captured: Map<number, number[]> = new Map(); // owner -> list of captured piece types

  // AI stats
  private lastAiStats: AiSearchResult | null = null;
  private statsSide: number = BLUE;

  // Last move for highlighting
  private lastMove: { from: [number, number]; to: [number, number] } | null = null;

  private moveLog: MoveLogEntry[] = [];
  private undoStack: UndoSnapshot[] = [];

  // Board flip (view-only)
  private flipped = false;

  // Pending AI-vs-AI pacing timer (cancelled on menu/new game).
  private aiVsAiTimer: number | null = null;

  /** Search generation: bumped whenever the current search is invalidated
   * (menu, new game, undo, restart). Stale search promises check it before
   * touching game state — a cancelled search must never be scored as a loss. */
  private searchGen = 0;

  constructor(config: GameControllerConfig) {
    this.aiClient = config.aiClient;
    this.onStateChange = config.onStateChange;
    this.onBoardUpdate = config.onBoardUpdate;
    this.onAiStats = config.onAiStats;

    this.board = new Board();
    this.currentPlayer = BLUE;
    this.aiPlayer = RED;
    this.firstPlayer = BLUE;
    this.humanColor = BLUE;

    this.captured.set(BLUE, []);
    this.captured.set(RED, []);
  }

  /** Get current game state. */
  getState(): GameState {
    return this.state;
  }

  /** Get the board. */
  getBoard(): Board {
    return this.board;
  }

  /** Get current player. */
  getCurrentPlayer(): number {
    return this.currentPlayer;
  }

  /** Get human color. */
  getHumanColor(): number {
    return this.humanColor;
  }

  /** Get AI player. */
  getAiPlayer(): number {
    return this.aiPlayer;
  }

  /** Get difficulty. */
  getDifficulty(): string {
    return this.difficulty;
  }

  /** Set difficulty. */
  setDifficulty(difficulty: string): void {
    this.difficulty = difficulty;
  }

  /** Cycle difficulty. */
  cycleDifficulty(): void {
    const idx = DIFFICULTY_ORDER.indexOf(this.difficulty as (typeof DIFFICULTY_ORDER)[number]);
    this.difficulty = DIFFICULTY_ORDER[(idx + 1) % DIFFICULTY_ORDER.length];
  }

  /** Get winner. */
  getWinner(): number | "DRAW" | null {
    return this.winner;
  }

  /** Get move count. */
  getMoveCount(): number {
    return this.moveCount;
  }

  /** Get captured pieces by owner. */
  getCaptured(owner: number): number[] {
    return this.captured.get(owner) ?? [];
  }

  /** Get last AI stats. */
  getLastAiStats(): AiSearchResult | null {
    return this.lastAiStats;
  }

  /** Get selected position. */
  getSelectedPos(): [number, number] | null {
    return this.selectedPos;
  }

  /** Get legal moves for current selection. */
  getLegalMoves(): Move[] {
    return this.legalMoves;
  }

  /** Get last move. */
  getLastMove(): { from: [number, number]; to: [number, number] } | null {
    return this.lastMove;
  }

  /** Check if board is flipped. */
  isFlipped(): boolean {
    return this.flipped;
  }

  /** Toggle board flip. */
  toggleFlip(): void {
    this.flipped = !this.flipped;
    this.onBoardUpdate?.();
  }

  /** Get animation state. */
  getAnimationState(): { move: Move | null; progress: number } {
    if (!this.animatingMove) return { move: null, progress: 1 };
    const elapsed = performance.now() - this.animationStartTime;
    const progress = Math.min(elapsed / this.animationDuration, 1);
    return { move: this.animatingMove, progress };
  }

  /** Start a new game. */
  newGame(mode: GameMode, firstPlayer: number, humanColor?: number): void {
    this.searchGen++; // invalidate any in-flight search
    this.board = new Board();
    this.currentPlayer = firstPlayer;
    this.firstPlayer = firstPlayer;
    this.moveCount = 1;
    this.winner = null;
    this.selectedPos = null;
    this.legalMoves = [];
    this.pendingMove = null;
    this.animatingMove = null;
    this.lastMove = null;
    this.positionCounts.clear();
    this.recentHashes = [];
    this.moveLog = [];
    this.undoStack = [];
    this.captured.set(BLUE, []);
    this.captured.set(RED, []);
    this.lastAiStats = null;
    this.statsSide = BLUE;

    if (mode === GameMode.HUMAN_VS_AI) {
      this.humanColor = humanColor ?? firstPlayer;
      this.aiPlayer = this.humanColor === BLUE ? RED : BLUE;
      this.aiPlayer2 = null;
      this.flipped = this.humanColor === BLUE;
    } else {
      this.aiPlayer = BLUE;
      this.aiPlayer2 = RED;
      this.flipped = false;
    }

    this.setState(GameState.PLAYING);
    this.onBoardUpdate?.();

    // Check if AI should move first
    if (this.isAiTurn()) {
      this.startAiSearch();
    }
  }

  /** Set game state.
   *
   * Always notifies: React (and any other view) can hold state the controller
   * did not originate (e.g. FIRST_MOVER is entered directly from the view),
   * so suppressing a "no-change" notification would strand the view.
   */
  private setState(newState: GameState): void {
    this.state = newState;
    this.onStateChange?.(newState);
  }

  /** Check if it's AI's turn. */
  private isAiTurn(): boolean {
    return (
      this.currentPlayer === this.aiPlayer ||
      (this.aiPlayer2 !== null && this.currentPlayer === this.aiPlayer2)
    );
  }

  /** Handle a click on the board. */
  handleClick(row: number, col: number): void {
    if (this.state !== GameState.PLAYING) return;
    if (this.isAiTurn()) return;

    const clickedPiece = this.board.getPiece(row, col);

    if (this.selectedPos) {
      const [selRow, selCol] = this.selectedPos;

      // Clicked same piece - deselect
      if (row === selRow && col === selCol) {
        this.deselect();
        return;
      }

      // Clicked another own piece - switch selection
      if (clickedPiece && clickedPiece.owner === this.currentPlayer) {
        this.select(row, col);
        return;
      }

      // Check if legal move
      const move = this.legalMoves.find(
        (m) => m.toRow === row && m.toCol === col
      );
      if (move) {
        this.deselect();
        this.startMove(move);
      }
    } else {
      // Try to select a piece
      if (clickedPiece && clickedPiece.owner === this.currentPlayer) {
        this.select(row, col);
      }
    }
  }

  /** Select a piece. */
  private select(row: number, col: number): void {
    this.selectedPos = [row, col];
    this.legalMoves = getLegalMoves(this.board, row, col);
    this.onBoardUpdate?.();
  }

  /** Deselect current piece. */
  private deselect(): void {
    this.selectedPos = null;
    this.legalMoves = [];
    this.onBoardUpdate?.();
  }

  /** Start a move (with animation). */
  private startMove(move: Move): void {
    this.pendingMove = move;
    this.animatingMove = move;
    this.animationStartTime = performance.now();
    this.setState(GameState.ANIMATING);
    this.onBoardUpdate?.();
  }

  /** Execute a move on the board. */
  private executeMove(move: Move): void {
    // Snapshot for undo (before any mutation).
    this.undoStack.push({
      pieces: this.serializePieces(),
      currentPlayer: this.currentPlayer,
      moveCount: this.moveCount,
      positionCounts: new Map(this.positionCounts),
      captured: new Map(Array.from(this.captured, ([k, v]) => [k, [...v]])),
      recentHashes: [...this.recentHashes],
      lastMove: this.lastMove,
      moveLog: [...this.moveLog],
    });
    if (this.undoStack.length > 240) this.undoStack.shift();

    const mover = this.board.getPiece(move.fromRow, move.fromCol);
    const moverType = mover ? mover.pieceType : 0;
    const moverSide = this.currentPlayer;

    // Record capture
    if (move.isCapture) {
      const victim = this.board.getPiece(move.toRow, move.toCol);
      if (victim) {
        const capturedList = this.captured.get(this.currentPlayer);
        if (capturedList) {
          capturedList.push(victim.pieceType);
        }
      }
    }

    // Make the move
    this.board = makeMove(this.board, move);

    // Update turn
    this.currentPlayer = this.currentPlayer === BLUE ? RED : BLUE;
    if (this.currentPlayer === this.firstPlayer) {
      this.moveCount++;
    }

    // Record position for repetition detection (game-long counts; the search
    // window is sliced at request time).
    const hash = computeHash(this.board, this.currentPlayer);
    const hashKey = pairKey(hash);
    this.positionCounts.set(
      hashKey,
      (this.positionCounts.get(hashKey) ?? 0) + 1
    );
    this.recentHashes.push(hash);

    // Update last move
    this.lastMove = {
      from: [move.fromRow, move.fromCol],
      to: [move.toRow, move.toCol],
    };

    // History panel entry
    this.moveLog.push({
      side: moverSide,
      pieceType: moverType,
      from: [move.fromRow, move.fromCol],
      to: [move.toRow, move.toCol],
      capture: move.isCapture,
    });

    this.onBoardUpdate?.();

    // Sound feedback for the executed move
    sounds.play(move.isCapture ? "capture" : "move");

    // Check terminal
    if (this.checkTerminal(hashKey)) {
      sounds.play(this.winner === "DRAW" ? "draw" : "win");
      this.setState(GameState.GAME_OVER);
      return;
    }

    this.setState(GameState.PLAYING);

    // Start AI turn if needed (a short pause in AI-vs-AI keeps the game
    // watchable).
    if (this.isAiTurn()) {
      if (this.aiPlayer2 !== null) {
        this.aiVsAiTimer = window.setTimeout(() => {
          this.aiVsAiTimer = null;
          if (this.state === GameState.PLAYING && this.isAiTurn()) {
            this.startAiSearch();
          }
        }, 400);
      } else {
        this.startAiSearch();
      }
    }
  }

  /** Check if game has ended. */
  private checkTerminal(hashKey?: string): boolean {
    const gameState = getGameState(this.board);
    if (gameState.over) {
      this.winner = gameState.winner;
      return true;
    }

    const key = hashKey ?? pairKey(computeHash(this.board, this.currentPlayer));
    if (checkDraw(this.positionCounts, key, this.moveCount)) {
      this.winner = "DRAW";
      return true;
    }

    // Check for no legal moves (rare but possible)
    const legalMoves = getAllLegalMoves(this.board, this.currentPlayer);
    if (legalMoves.length === 0) {
      this.winner = this.currentPlayer === BLUE ? RED : BLUE;
      return true;
    }

    return false;
  }

  /** Start AI search. */
  private startAiSearch(): void {
    this.setState(GameState.AI_THINKING);
    this.statsSide = this.currentPlayer;

    const preset = DIFFICULTY_PRESETS[this.difficulty];
    const historyKeys = this.recentHashes.slice(-HISTORY_WINDOW);

    // Serialize board
    const pieces: Array<[number, number, number, number]> = [];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 7; col++) {
        const piece = this.board.getPiece(row, col);
        if (piece) {
          pieces.push([piece.pieceType, piece.owner, row, col]);
        }
      }
    }

    const gen = this.searchGen;
    this.aiClient
      .search(
        {
          id: `search_${Date.now()}`,
          pieces,
          sideToMove: this.currentPlayer,
          timeLimitMs: preset.timeLimit * 1000,
          maxDepth: preset.maxDepth,
          historyKeys,
        },
        (info) => {
          if (gen !== this.searchGen) return; // stale search
          this.lastAiStats = info as AiSearchResult;
          const evalForBlue = this.evalForBlue();
          this.onAiStats?.(this.lastAiStats, evalForBlue);
        }
      )
      .then((result) => {
        if (gen !== this.searchGen) return; // stale search
        this.lastAiStats = result as AiSearchResult;
        const evalForBlue = this.evalForBlue();
        this.onAiStats?.(this.lastAiStats, evalForBlue);

        if (result.move) {
          const move = new Move(
            result.move.fromRow,
            result.move.fromCol,
            result.move.toRow,
            result.move.toCol
          );
          this.startMove(move);
        } else {
          // No legal moves - current player loses
          this.winner = this.currentPlayer === BLUE ? RED : BLUE;
          this.setState(GameState.GAME_OVER);
        }
      })
      .catch((error) => {
        if (gen !== this.searchGen) return; // cancelled, not failed
        console.error("AI search failed:", error);
        // Treat as loss for current player
        this.winner = this.currentPlayer === BLUE ? RED : BLUE;
        this.setState(GameState.GAME_OVER);
      });
  }

  /** Get evaluation from Blue's perspective. */
  evalForBlue(): number | null {
    if (!this.lastAiStats) return null;
    const score = this.lastAiStats.score;
    return this.statsSide === BLUE ? score : -score;
  }

  /** Cancel current AI search (e.g., when returning to menu). */
  cancelAi(): void {
    this.searchGen++;
    if (this.aiVsAiTimer !== null) {
      window.clearTimeout(this.aiVsAiTimer);
      this.aiVsAiTimer = null;
    }
    this.aiClient.cancel();
  }

  /** Serialize the board as piece tuples. */
  private serializePieces(): Array<[number, number, number, number]> {
    const pieces: Array<[number, number, number, number]> = [];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 7; col++) {
        const piece = this.board.getPiece(row, col);
        if (piece) pieces.push([piece.pieceType, piece.owner, row, col]);
      }
    }
    return pieces;
  }

  /** The move history log (for the panel). */
  getMoveLog(): MoveLogEntry[] {
    return this.moveLog;
  }

  /** True when undo can return the game to the human's previous turn. */
  canUndo(): boolean {
    return (
      this.aiPlayer2 === null &&
      this.state === GameState.PLAYING &&
      this.undoStack.some((s) => s.currentPlayer === this.humanColor)
    );
  }

  /** Undo back to the human's previous turn (Human vs AI only).
   *
   * Restores the full pre-move state: board, turn, move count, repetition
   * counts, captured lists, search history window, last-move marker, and the
   * move log.
   */
  undo(): void {
    if (!this.canUndo()) return;
    this.cancelAi();
    while (this.undoStack.length > 0) {
      const snap = this.undoStack.pop()!;
      if (snap.currentPlayer !== this.humanColor) continue; // skip AI replies
      this.board = Board.withPieces(...snap.pieces);
      this.currentPlayer = snap.currentPlayer;
      this.moveCount = snap.moveCount;
      this.positionCounts = new Map(snap.positionCounts);
      this.captured = new Map(Array.from(snap.captured, ([k, v]) => [k, [...v]]));
      this.recentHashes = [...snap.recentHashes];
      this.lastMove = snap.lastMove;
      this.moveLog = [...snap.moveLog];
      this.selectedPos = null;
      this.legalMoves = [];
      this.pendingMove = null;
      this.animatingMove = null;
      this.winner = null;
      this.setState(GameState.PLAYING);
      this.onBoardUpdate?.();
      return;
    }
  }

  /** Go to menu. */
  goToMenu(): void {
    this.cancelAi();
    this.setState(GameState.MENU);
  }

  /** Go to first-mover selection. */
  goToFirstMover(_mode: GameMode): void {
    this.setState(GameState.FIRST_MOVER);
  }

  /** Update animation state. */
  update(): void {
    if (this.state === GameState.ANIMATING && this.animatingMove) {
      const elapsed = performance.now() - this.animationStartTime;
      if (elapsed >= this.animationDuration) {
        // Animation complete
        this.animatingMove = null;
        if (this.pendingMove) {
          const moveToExecute = this.pendingMove;
          this.pendingMove = null;
          this.executeMove(moveToExecute);
        }
      }
    }
  }

  /** Return to menu state. */
  reset(): void {
    this.cancelAi();
    this.state = GameState.MENU;
    this.board = new Board();
    this.currentPlayer = BLUE;
    this.aiPlayer = RED;
    this.aiPlayer2 = null;
    this.firstPlayer = BLUE;
    this.humanColor = BLUE;
    this.difficulty = "Medium";
    this.winner = null;
    this.moveCount = 0;
    this.selectedPos = null;
    this.legalMoves = [];
    this.pendingMove = null;
    this.animatingMove = null;
    this.lastMove = null;
    this.positionCounts.clear();
    this.recentHashes = [];
    this.moveLog = [];
    this.undoStack = [];
    this.captured.set(BLUE, []);
    this.captured.set(RED, []);
    this.lastAiStats = null;
    this.statsSide = BLUE;
    this.flipped = false;
  }
}
