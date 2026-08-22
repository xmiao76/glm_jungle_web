/**
 * Main React app for the Jungle game.
 *
 * Wires together the game controller, canvas renderer, AI client, and UI
 * components into a complete playable game.
 */
import "./ui/styles.css";
import { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { BoardRenderer } from "./ui/boardRenderer";
import { GameController, GameState, GameMode, FIRST_MOVER_CHOICES } from "./ui/gameController";
import { AiClient } from "./worker/aiClient";
import {
  TurnCard,
  EvalCard,
  EngineCard,
  CapturedCard,
  ControlsCard,
  MoveHistoryCard,
  PanelHints,
  GameOverOverlay,
  MainMenu,
  FirstMoverMenu,
} from "./ui/components";
import { sounds } from "./ui/sounds";
import { BLUE, RED } from "./engine/constants";
import { PALETTE, PANEL_WIDTH } from "./ui/theme";

/** Main App component. */
function App(): JSX.Element {
  // AI client
  const [aiClient] = useState(() => new AiClient());

  // Game controller
  const [gameController] = useState(() => new GameController({
    aiClient,
    onStateChange: (state) => {
      setGameState(state);
    },
    onBoardUpdate: () => {
      forceUpdate({});
    },
    onAiStats: (stats, evalForBlue) => {
      setAiStats(stats);
      setEvalForBlue(evalForBlue);
    },
  }));

  // UI state
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [aiStats, setAiStats] = useState<{ depth: number; score: number; nps: number } | null>(null);
  const [evalForBlue, setEvalForBlue] = useState<number | null>(null);
  const [pendingMode, setPendingMode] = useState<GameMode | null>(null);
  const [muted, setMuted] = useState(() => sounds.isMuted());
  const [, forceUpdate] = useState({});

  // Canvas and renderer refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);

  // Animation frame ref
  const frameRef = useRef<number>();

  // The canvas only exists in game views; set up the renderer + render loop
  // whenever it (re)mounts. The DOM already reserves the side panel, so the
  // canvas box is pure board area (panelWidth 0 inside the renderer).
  const inGame = gameState !== GameState.MENU && gameState !== GameState.FIRST_MOVER;

  useEffect(() => {
    if (!inGame || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const renderer = new BoardRenderer(canvas, { panelWidth: 0 });
    rendererRef.current = renderer;

    const handleResize = () => {
      const container = canvas.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      renderer.updateConfig({
        cellSize: Math.max(
          16,
          Math.floor(
            Math.min((rect.width - 32) / 7, (rect.height - 82) / 9),
          ),
        ),
        dpr,
      });

      forceUpdate({});
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    const render = () => {
      gameController.update();

      renderer.setSelected(gameController.getSelectedPos());
      renderer.setLegalMoves(gameController.getLegalMoves());
      renderer.setLastMove(
        gameController.getLastMove()?.from ?? null,
        gameController.getLastMove()?.to ?? null,
      );
      renderer.setFlipped(gameController.isFlipped());
      renderer.drawBoard(gameController.getBoard());

      frameRef.current = requestAnimationFrame(render);
    };
    frameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [inGame, gameController]);

  const handleUndo = useCallback(() => {
    gameController.undo();
    forceUpdate({});
  }, [gameController]);

  const handleToggleMute = useCallback(() => {
    setMuted(sounds.toggleMute());
  }, []);

  // Input handling (pointer events cover both mouse and touch)
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current || !rendererRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const pos = rendererRef.current.pixelToCell(x, y);
    if (pos) {
      gameController.handleClick(pos[0], pos[1]);
    }
  }, [gameController]);

  // Keyboard handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (gameState === GameState.MENU) {
          // Quit
          window.close();
        } else if (gameState === GameState.GAME_OVER) {
          gameController.goToMenu();
        } else {
          gameController.goToMenu();
        }
      } else if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (gameState === GameState.PLAYING) {
          gameController.undo();
          forceUpdate({});
        }
      } else if (e.key === "u" || e.key === "U") {
        if (gameState === GameState.PLAYING) {
          gameController.undo();
          forceUpdate({});
        }
      } else if (e.key === "m" || e.key === "M") {
        setMuted(sounds.toggleMute());
      } else if (e.key === "f" || e.key === "F") {
        if (gameState === GameState.PLAYING ||
            gameState === GameState.ANIMATING ||
            gameState === GameState.AI_THINKING ||
            gameState === GameState.GAME_OVER) {
          gameController.toggleFlip();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, gameController]);

  // Menu handlers
  const handleHumanVsAi = useCallback(() => {
    setPendingMode(GameMode.HUMAN_VS_AI);
    setGameState(GameState.FIRST_MOVER);
  }, []);

  const handleAiVsAi = useCallback(() => {
    setPendingMode(GameMode.AI_VS_AI);
    setGameState(GameState.FIRST_MOVER);
  }, []);

  const handleCycleDifficulty = useCallback(() => {
    gameController.cycleDifficulty();
    forceUpdate({});
  }, [gameController]);

  const handleQuit = useCallback(() => {
    window.close();
  }, []);

  const handleFirstMoverSelect = useCallback((choice: string) => {
    if (!pendingMode) return;

    if (pendingMode === GameMode.HUMAN_VS_AI) {
      const selection = FIRST_MOVER_CHOICES[choice];
      if (selection) {
        gameController.newGame(
          GameMode.HUMAN_VS_AI,
          selection.firstPlayer,
          selection.humanColor
        );
      }
    } else {
      if (choice === "Blue First") {
        gameController.newGame(GameMode.AI_VS_AI, BLUE);
      } else if (choice === "Red First") {
        gameController.newGame(GameMode.AI_VS_AI, RED);
      }
    }

    setPendingMode(null);
  }, [pendingMode, gameController]);

  const handleBackToMenu = useCallback(() => {
    gameController.goToMenu();
  }, [gameController]);

  const handleRestart = useCallback(() => {
    // Restart with same settings
    const currentMode = gameController.getHumanColor() !== undefined ? GameMode.HUMAN_VS_AI : GameMode.AI_VS_AI;
    gameController.newGame(
      currentMode,
      gameController.getCurrentPlayer() === BLUE ? BLUE : RED,
      currentMode === GameMode.HUMAN_VS_AI ? gameController.getHumanColor() : undefined
    );
  }, [gameController]);

  // Render based on state
  if (gameState === GameState.MENU) {
    return (
      <MainMenu
        difficulty={gameController.getDifficulty()}
        onHumanVsAi={handleHumanVsAi}
        onAiVsAi={handleAiVsAi}
        onCycleDifficulty={handleCycleDifficulty}
        onQuit={handleQuit}
      />
    );
  }

  if (gameState === GameState.FIRST_MOVER) {
    return (
      <FirstMoverMenu
        mode={pendingMode === GameMode.HUMAN_VS_AI ? "human_vs_ai" : "ai_vs_ai"}
        onBack={handleBackToMenu}
        onSelectChoice={handleFirstMoverSelect}
      />
    );
  }

  // Playing / animating / AI thinking / game over
  const isGameOver = gameState === GameState.GAME_OVER;
  const currentPlayer = gameController.getCurrentPlayer();
  const turnNumber = gameController.getMoveCount();
  const difficulty = gameController.getDifficulty();
  const capturedByBlue = gameController.getCaptured(BLUE);
  const capturedByRed = gameController.getCaptured(RED);
  const winner = gameController.getWinner();

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        background: PALETTE.BG,
        overflow: "hidden",
        display: "flex",
      }}
    >
      {/* Canvas area */}
      <div
        style={{
          flex: 1,
          position: "relative",
        }}
        onPointerDown={handleCanvasPointerDown}
      >
        <canvas
          ref={canvasRef}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            touchAction: "none",
          }}
        />
      </div>

      {/* Side panel */}
      <div
        style={{
          width: `${PANEL_WIDTH}px`,
          background: PALETTE.PANEL_BG,
          display: "flex",
          flexDirection: "column",
          padding: `${10}px`,
        }}
      >
        <TurnCard currentPlayer={currentPlayer} turnNumber={turnNumber} />
        <EvalCard evalForBlue={evalForBlue} />
        <EngineCard aiStats={aiStats} difficulty={difficulty} />
        <CapturedCard capturedByBlue={capturedByBlue} capturedByRed={capturedByRed} />
        <ControlsCard
          canUndo={gameController.canUndo()}
          onUndo={handleUndo}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
        <MoveHistoryCard log={gameController.getMoveLog()} />
        <div style={{ flex: 1 }} />
        <PanelHints />
      </div>

      {/* Game over overlay */}
      {isGameOver && winner !== null && (
        <GameOverOverlay winner={winner} onRestart={handleRestart} />
      )}
    </div>
  );
}

// Mount the app
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
