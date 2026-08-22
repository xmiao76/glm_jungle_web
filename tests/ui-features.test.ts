/** Tests for the v1.1 UI features: move notation, undo round-trip, sounds. */
import { describe, expect, test } from "vitest";
import { moveNotation, squareName } from "../src/ui/components";
import {
  GameController,
  GameState,
  GameMode,
  type MoveLogEntry,
} from "../src/ui/gameController";
import type { AiClient } from "../src/worker/aiClient";
import { sounds } from "../src/ui/sounds";
import { Board } from "../src/engine/board";
import { computeHash } from "../src/ai/zobrist";
import { BLUE, RED, RAT, LION } from "../src/engine/constants";

/** Stub AI client: resolves with the given move (or never when move=null). */
function stubAiClient(move?: { fromRow: number; fromCol: number; toRow: number; toCol: number }): AiClient {
  return {
    search: () =>
      move
        ? Promise.resolve({
            move,
            score: 0,
            depth: 1,
            nodes: 1,
            nps: 0,
            elapsedMs: 1,
          })
        : new Promise(() => undefined),
    cancel: () => undefined,
    terminate: () => undefined,
  } as unknown as AiClient;
}

describe("Move notation", () => {
  test("square names map files a-g and ranks 1-9", () => {
    expect(squareName(0, 0)).toBe("a1");
    expect(squareName(8, 6)).toBe("g9");
    expect(squareName(2, 0)).toBe("a3");
  });

  test("quiet moves use > and captures use x", () => {
    const quiet: MoveLogEntry = {
      side: BLUE,
      pieceType: RAT,
      from: [2, 0],
      to: [3, 0],
      capture: false,
    };
    expect(moveNotation(quiet, 0)).toBe("1. Blue Rat a3 > a4");

    const cap: MoveLogEntry = {
      side: RED,
      pieceType: LION,
      from: [6, 3],
      to: [2, 3],
      capture: true,
    };
    expect(moveNotation(cap, 4)).toBe("5. Red Lion d7 x d3");
  });
});

describe("Sounds", () => {
  test("play never throws and mute round-trips", () => {
    expect(() => sounds.play("move")).not.toThrow();
    expect(() => sounds.play("capture")).not.toThrow();
    expect(() => sounds.play("win")).not.toThrow();
    const was = sounds.isMuted();
    sounds.toggleMute();
    expect(sounds.isMuted()).toBe(!was);
    sounds.toggleMute();
    expect(sounds.isMuted()).toBe(was);
  });
});

describe("Undo", () => {
  function forceAnimations(controller: GameController): void {
    // Fast-forward the 180 ms move animation so update() commits the move.
    const internals = controller as unknown as { update: () => void };
    const ctrl = controller as unknown as { animationStartTime: number; pendingMove: unknown };
    void internals;
    void ctrl;
    // Rewind the clock on any animating move until the controller is idle.
    for (let i = 0; i < 6; i++) {
      const c = controller as unknown as { animationStartTime: number; state: GameState };
      if (c.state === GameState.ANIMATING) c.animationStartTime -= 10_000;
      controller.update();
    }
  }

  async function playHumanMove(controller: GameController, from: [number, number], to: [number, number]): Promise<void> {
    controller.handleClick(from[0], from[1]);
    controller.handleClick(to[0], to[1]);
    forceAnimations(controller);
  }

  test("undo restores the exact pre-move state", { timeout: 20_000 }, async () => {
    const controller = new GameController({
      aiClient: stubAiClient({ fromRow: 6, fromCol: 6, toRow: 5, toCol: 6 }), // Red Rat g7->g6
      onStateChange: () => undefined,
      onBoardUpdate: () => undefined,
    });

    controller.newGame(GameMode.HUMAN_VS_AI, BLUE, BLUE);
    const initialHash = computeHash(controller.getBoard(), BLUE);

    // Human: Rat a3 -> a4 (logical (2,0) -> (3,0)).
    await playHumanMove(controller, [2, 0], [3, 0]);
    // AI (RED) answers via the stub with its own legal reply: Rat g7 -> g6.
    await new Promise((r) => setTimeout(r, 20));
    forceAnimations(controller);

    // A full human+AI pair happened.
    expect(controller.getMoveLog().length).toBe(2);
    expect(controller.getCurrentPlayer()).toBe(BLUE);
    expect(controller.canUndo()).toBe(true);

    // Undo returns to before the human's move.
    controller.undo();
    expect(controller.getState()).toBe(GameState.PLAYING);
    expect(controller.getCurrentPlayer()).toBe(BLUE);
    expect(computeHash(controller.getBoard(), BLUE)).toEqual(initialHash);
    expect(controller.getMoveLog().length).toBe(0);
    // The restored board equals a fresh start position.
    expect(controller.getBoard().toString()).toBe(new Board().toString());
  });

  test("undo is unavailable in AI vs AI", () => {
    const controller = new GameController({
      aiClient: stubAiClient(),
      onStateChange: () => undefined,
      onBoardUpdate: () => undefined,
    });
    controller.newGame(GameMode.AI_VS_AI, BLUE);
    expect(controller.canUndo()).toBe(false);
    expect(() => controller.undo()).not.toThrow();
  });

  test("undo is unavailable before any human move (AI opens)", () => {
    const controller = new GameController({
      aiClient: stubAiClient(),
      onStateChange: () => undefined,
      onBoardUpdate: () => undefined,
    });
    controller.newGame(GameMode.HUMAN_VS_AI, RED, BLUE); // human Red, AI opens
    expect(controller.canUndo()).toBe(false);
  });
});
