/**
 * React UI components for the Jungle game.
 *
 * Ported from gui/renderer.py - side panel, menus, and game over overlay.
 */
import { useState, useEffect, useRef, type FC, type ReactElement } from "react";
import { PALETTE, SPACING, CJK_FONT_STACK, PIECE_CHARS } from "./theme";
import { generatePieceSurfaceSmall } from "./assets";
import { BLUE, RED } from "../engine/constants";
import { ENGINE_VERSION } from "./version";
import type { MoveLogEntry } from "./gameController";

/** Props for the turn indicator card. */
interface TurnCardProps {
  currentPlayer: number;
  turnNumber: number;
}

/** Turn indicator card. */
export const TurnCard: FC<TurnCardProps> = ({ currentPlayer, turnNumber }) => {
  const isBlue = currentPlayer === BLUE;
  const color = isBlue ? PALETTE.BLUE : PALETTE.RED;
  const playerName = isBlue ? "Blue" : "Red";

  return (
    <div
      className="panel-card"
      style={{
        padding: `${SPACING.card_pad}px`,
        marginBottom: `${SPACING.card_gap}px`,
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: PALETTE.TEXT_DIM,
          marginBottom: "8px",
        }}
      >
        Game
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: color,
          }}
        />
        <div style={{ fontSize: "20px", fontWeight: "bold", color: PALETTE.TEXT }}>
          {playerName} to move
        </div>
        <div
          style={{
            marginLeft: "auto",
            fontSize: "16px",
            color: PALETTE.TEXT_DIM,
          }}
        >
          #{turnNumber}
        </div>
      </div>
    </div>
  );
};

/** Props for the eval bar card. */
interface EvalCardProps {
  evalForBlue: number | null;
}

/** Eval bar card. */
export const EvalCard: FC<EvalCardProps> = ({ evalForBlue }) => {
  // Map score to [0, 1] range using tanh
  const evalDisplay = evalForBlue !== null ? 0.5 + 0.5 * Math.tanh(evalForBlue / 2500) : 0.5;
  const blueWidth = `${evalDisplay * 100}%`;

  return (
    <div
      className="panel-card"
      style={{
        padding: `${SPACING.card_pad}px`,
        marginBottom: `${SPACING.card_gap}px`,
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: PALETTE.TEXT_DIM,
          marginBottom: "8px",
        }}
      >
        Position
      </div>
      <div
        style={{
          height: "14px",
          background: `linear-gradient(180deg, ${PALETTE.RED_DARK} 0%, #5a1414 100%)`,
          borderRadius: "7px",
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 1px 0 rgba(255,255,255,0.06) inset, 0 2px 5px rgba(5,7,11,0.4)",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: blueWidth,
            background: `linear-gradient(180deg, ${PALETTE.BLUE} 0%, #2f4fb0 100%)`,
            boxShadow: "0 -1px 0 rgba(255,255,255,0.25) inset",
            transition: "width 0.18s ease-out",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: "rgba(255,255,255,0.35)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            border: `1px solid ${PALETTE.CARD_EDGE}`,
            borderRadius: "7px",
            pointerEvents: "none",
          }}
        />
      </div>
    </div>
  );
};

/** Props for the engine info card. */
interface EngineCardProps {
  aiStats: { depth: number; score: number; nps: number } | null;
  difficulty: string;
}

/** Engine info card. */
export const EngineCard: FC<EngineCardProps> = ({ aiStats, difficulty }) => {
  let content: ReactElement | null = null;

  if (aiStats) {
    const score = aiStats.score;
    const depth = aiStats.depth;
    const nps = aiStats.nps;
    const scoreTxt = `${(score / 10).toFixed(0)}`;

    content = (
      <div>
        <div style={{ fontSize: "18px", color: PALETTE.TEXT, marginBottom: "4px", fontVariantNumeric: "tabular-nums" }}>
          Depth {depth}   Score {scoreTxt}
        </div>
        <div style={{ fontSize: "18px", color: PALETTE.TEXT, fontVariantNumeric: "tabular-nums" }}>
          {(nps / 1000).toFixed(0)}k/s   {difficulty}
        </div>
      </div>
    );
  } else {
    content = (
      <div style={{ fontSize: "18px", color: PALETTE.TEXT }}>
        Waiting for engine…
      </div>
    );
  }

  return (
    <div
      className="panel-card"
      style={{
        padding: `${SPACING.card_pad}px`,
        marginBottom: `${SPACING.card_gap}px`,
        height: "122px",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: PALETTE.TEXT_DIM,
          marginBottom: "8px",
        }}
      >
        Engine
      </div>
      {content}
    </div>
  );
};

/** Props for the captured pieces card. */
interface CapturedCardProps {
  capturedByBlue: number[];
  capturedByRed: number[];
}

/** Captured pieces card. */
export const CapturedCard: FC<CapturedCardProps> = ({
  capturedByBlue,
  capturedByRed,
}) => {
  const smallSize = Math.max(16, Math.floor(20 * 0.56));

  const renderRow = (pieces: number[], ownerColor: string) => {
    const isBlueOwner = ownerColor === PALETTE.BLUE;

    return (
      <div key={ownerColor} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <div
          style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            background: ownerColor,
          }}
        />
        {pieces.slice(0, 9).map((pieceType, i) => {
          const canvas = generatePieceSurfaceSmall(
            pieceType,
            isBlueOwner ? RED : BLUE,
            smallSize
          );
          const dataUrl = canvas.toDataURL();

          return (
            <img
              key={i}
              src={dataUrl}
              alt=""
              style={{
                width: `${smallSize}px`,
                height: `${smallSize}px`,
                display: "block",
              }}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div
      className="panel-card"
      style={{
        padding: `${SPACING.card_pad}px`,
        marginBottom: `${SPACING.card_gap}px`,
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: PALETTE.TEXT_DIM,
          marginBottom: "8px",
        }}
      >
        Captured
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {renderRow(capturedByBlue, PALETTE.BLUE)}
        {renderRow(capturedByRed, PALETTE.RED)}
      </div>
    </div>
  );
};

/** Props for the panel hints footer. */
interface PanelHintsProps {
  showFlipHint?: boolean;
  showMenuHint?: boolean;
}

/** Panel hints footer. */
export const PanelHints: FC<PanelHintsProps> = ({
  showFlipHint = true,
  showMenuHint = true,
}) => {
  const hints: string[] = [];
  if (showFlipHint) hints.push("F Flip");
  if (showMenuHint) hints.push("ESC Menu");

  return (
    <div
      style={{
        fontSize: "16px",
        color: PALETTE.TEXT_DIM,
        padding: `${SPACING.card_pad}px`,
      }}
    >
      {hints.join("    ")}
    </div>
  );
};

/** Props for the game over overlay. */
interface GameOverOverlayProps {
  winner: number | "DRAW" | null;
  onRestart: () => void;
}

/** Game over overlay. */
export const GameOverOverlay: FC<GameOverOverlayProps> = ({
  winner,
  onRestart,
}) => {
  let mainText: string;
  let color: string;

  if (winner === "DRAW") {
    mainText = "Draw!";
    color = "#dcdee4";
  } else {
    const side = winner === BLUE ? "Blue" : "Red";
    mainText = `${side} Wins!`;
    color = winner === BLUE ? PALETTE.BLUE : PALETTE.RED;
  }

  return (
    <div
      onClick={onRestart}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(8, 10, 14, 0.63)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: "min(90vw, 480px)",
          maxWidth: "480px",
          height: "190px",
          background: PALETTE.CARD,
          border: `2px solid ${PALETTE.CARD_EDGE}`,
          borderRadius: "16px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "24px",
        }}
      >
        <div
          className="game-over-title"
          style={{
            fontSize: "clamp(34px, 5vw, 68px)",
            fontWeight: "bold",
            color,
            fontFamily: CJK_FONT_STACK,
          }}
        >
          {mainText}
        </div>
        <div
          style={{
            fontSize: "clamp(14px, 2vw, 18px)",
            color: PALETTE.TEXT_DIM,
            fontFamily: CJK_FONT_STACK,
          }}
        >
          Click to play again · ESC for menu
        </div>
      </div>
    </div>
  );
};

/** Props for a menu button. */
interface MenuButtonProps {
  text: string;
  onClick: () => void;
  baseColor?: string;
  edgeColor?: string;
}

/** Menu button (styling lives in styles.css .menu-btn). */
export const MenuButton: FC<MenuButtonProps> = ({
  text,
  onClick,
  baseColor,
  edgeColor,
}) => {
  const style =
    baseColor || edgeColor
      ? ({
          "--btn-base": baseColor ?? PALETTE.BTN,
          "--btn-edge": edgeColor ?? PALETTE.BTN_EDGE,
        } as React.CSSProperties)
      : undefined;

  return (
    <button className="menu-btn" onClick={onClick} style={style}>
      {text}
    </button>
  );
};

/** Props for the main menu. */
interface MainMenuProps {
  difficulty: string;
  onHumanVsAi: () => void;
  onAiVsAi: () => void;
  onCycleDifficulty: () => void;
  onQuit: () => void;
}

/** Main menu. */
export const MainMenu: FC<MainMenuProps> = ({
  difficulty,
  onHumanVsAi,
  onAiVsAi,
  onCycleDifficulty,
  onQuit,
}) => {
  const [showRules, setShowRules] = useState(false);
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: PALETTE.BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        fontFamily: CJK_FONT_STACK,
      }}
    >
      {/* Ambient drifting light */}
      <div className="menu-bg" />
      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <div
          className="menu-hero-title"
          style={{
            fontSize: "clamp(42px, 12vh, 96px)",
            fontWeight: "bold",
            marginBottom: "8px",
          }}
        >
          JUNGLE
        </div>
        <div
          style={{
            fontSize: "clamp(16px, 4.5vh, 32px)",
            color: "#b2baca",
            fontWeight: "300",
          }}
        >
          Dou Shou Qi · Animal Chess
        </div>
      </div>

      {/* Buttons */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          width: "min(90vw, 380px)",
        }}
      >
        <MenuButton text="Human vs AI" onClick={onHumanVsAi} />
        <MenuButton text="AI vs AI" onClick={onAiVsAi} />
        <MenuButton text={`Difficulty: ${difficulty}`} onClick={onCycleDifficulty} />
        <MenuButton
          text={showRules ? "Hide How to play" : "How to play"}
          onClick={() => setShowRules((v) => !v)}
        />
        <MenuButton text="Quit" onClick={onQuit} />
      </div>

      {showRules && <HowToPlay />}

      <div className="credits-footer">
        Made with model GLM-5.3 (Z.ai) · code agent Claude Code
        <br />
        Engine v{ENGINE_VERSION} · runs entirely in your browser (no server)
      </div>
    </div>
  );
};

/** Props for the first-mover menu. */
interface FirstMoverMenuProps {
  mode: "human_vs_ai" | "ai_vs_ai";
  onBack: () => void;
  onSelectChoice: (choice: string) => void;
}

/** First-mover selection menu. */
export const FirstMoverMenu: FC<FirstMoverMenuProps> = ({
  mode,
  onBack,
  onSelectChoice,
}) => {
  const title = mode === "human_vs_ai" ? "Human vs AI" : "AI vs AI";

  let buttons: Array<{ text: string; baseColor: string; edgeColor: string }> = [];

  if (mode === "human_vs_ai") {
    buttons = [
      { text: "Blue - You first", baseColor: PALETTE.BLUE_DARK, edgeColor: PALETTE.BLUE },
      { text: "Blue - AI first", baseColor: PALETTE.BLUE_DARK, edgeColor: PALETTE.BLUE },
      { text: "Red - You first", baseColor: PALETTE.RED_DARK, edgeColor: PALETTE.RED },
      { text: "Red - AI first", baseColor: PALETTE.RED_DARK, edgeColor: PALETTE.RED },
    ];
  } else {
    buttons = [
      { text: "Blue First", baseColor: PALETTE.BLUE_DARK, edgeColor: PALETTE.BLUE },
      { text: "Red First", baseColor: PALETTE.RED_DARK, edgeColor: PALETTE.RED },
    ];
  }

  buttons.push({ text: "Back", baseColor: PALETTE.BTN, edgeColor: PALETTE.BTN_EDGE });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: PALETTE.BG,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "24px",
        fontFamily: CJK_FONT_STACK,
      }}
    >
      {/* Ambient drifting light */}
      <div className="menu-bg" />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: "clamp(32px, 9vh, 64px)",
            fontWeight: "bold",
            color: PALETTE.GOLD,
            marginBottom: "16px",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: "clamp(14px, 4.2vh, 28px)",
            color: PALETTE.TEXT_DIM,
          }}
        >
          Who moves first?
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          width: "min(90vw, 380px)",
        }}
      >
        {buttons.map((btn) => (
          <MenuButton
            key={btn.text}
            text={btn.text}
            baseColor={btn.baseColor}
            edgeColor={btn.edgeColor}
            onClick={() => {
              if (btn.text === "Back") onBack();
              else onSelectChoice(btn.text);
            }}
          />
        ))}
      </div>
    </div>
  );
};


/** Notation helpers for the move history panel (exported for tests). */
export function squareName(row: number, col: number): string {
  return `${"abcdefg"[col] ?? "?"}${row + 1}`;
}

export function moveNotation(entry: MoveLogEntry, index: number): string {
  const side = entry.side === BLUE ? "Blue" : "Red";
  const name = PIECE_CHARS[entry.pieceType] ?? "?";
  const from = squareName(entry.from[0], entry.from[1]);
  const to = squareName(entry.to[0], entry.to[1]);
  return `${index + 1}. ${side} ${name} ${from}${entry.capture ? " x " : " > "}${to}`;
}

/** Props for the move history card. */
interface MoveHistoryCardProps {
  log: MoveLogEntry[];
}

/** Scrollable move history list. */
export const MoveHistoryCard: FC<MoveHistoryCardProps> = ({ log }) => {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  return (
    <div
      className="panel-card"
      style={{
        padding: `${SPACING.card_pad}px`,
        marginBottom: `${SPACING.card_gap}px`,
        minHeight: "64px",
        maxHeight: "220px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: PALETTE.TEXT_DIM,
          marginBottom: "8px",
        }}
      >
        Moves
      </div>
      <div
        ref={listRef}
        style={{
          overflowY: "auto",
          fontSize: "15px",
          lineHeight: 1.55,
          color: PALETTE.TEXT,
          fontVariantNumeric: "tabular-nums",
          minHeight: "24px",
        }}
      >
        {log.length === 0 ? (
          <span style={{ color: PALETTE.TEXT_DIM }}>No moves yet</span>
        ) : (
          log.map((entry, i) => (
            <div key={i} style={{ color: entry.capture ? PALETTE.CAPTURE : undefined }}>
              {moveNotation(entry, i)}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

/** Props for the in-game controls card. */
interface ControlsCardProps {
  canUndo: boolean;
  onUndo: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

/** Undo + mute controls. */
export const ControlsCard: FC<ControlsCardProps> = ({ canUndo, onUndo, muted, onToggleMute }) => (
  <div
    className="panel-card"
    style={{
      padding: `${SPACING.card_pad}px`,
      marginBottom: `${SPACING.card_gap}px`,
      display: "flex",
      gap: "10px",
    }}
  >
    <button className="menu-btn" onClick={onUndo} disabled={!canUndo} style={{ flex: 1, fontSize: "16px", padding: "8px 12px", opacity: canUndo ? 1 : 0.45, cursor: canUndo ? "pointer" : "not-allowed" }}>
      ↩ Undo
    </button>
    <button className="menu-btn" onClick={onToggleMute} style={{ flex: 1, fontSize: "16px", padding: "8px 12px" }}>
      {muted ? "🔇 Muted" : "🔊 Sound"}
    </button>
  </div>
);

/** Collapsible complete rules for a brand-new player. */
export const HowToPlay: FC = () => (
  <div
    className="panel-card rules-panel"
    style={{ padding: "16px 20px", maxWidth: "min(92vw, 640px)" }}
  >
    <div style={{ fontSize: "20px", fontWeight: 700, marginBottom: "10px" }}>
      How to play
    </div>
    <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.65, fontSize: "15px" }}>
      <li>
        <b>Win</b> by moving any piece into the enemy <b>den</b> (the marked home
        square), or by <b>capturing every enemy piece</b>. A side with <b>no legal
        move loses</b>.
      </li>
      <li>
        <b>Moving:</b> click your piece to select it (amber glow), then click a
        highlighted square — white dots are moves, red rings are captures. Click
        the piece again to deselect, or another of your pieces to switch.
      </li>
      <li>
        <b>Rank order (strongest first):</b> Elephant 8 · Lion 7 · Tiger 6 ·
        Leopard 5 · Wolf 4 · Dog 3 · Cat 2 · Rat 1. A piece captures enemies of
        <b> equal or lower</b> rank. <b>Exception:</b> the Rat can capture the
        Elephant — but only from land — and the Elephant can never capture the Rat.
      </li>
      <li>
        <b>River:</b> only the Rat can swim. A rat in water can only be captured
        by another rat in the water.
      </li>
      <li>
        <b>River jumps:</b> the Lion leaps across both river crossings (long and
        short); the Tiger only the short (2-water) crossing. Any rat in the water
        along the path blocks the jump.
      </li>
      <li>
        <b>Traps:</b> a piece standing in an enemy trap has rank 0 — any enemy
        piece may capture it. Your own traps do not affect you.
      </li>
      <li><b>You may never enter your own den.</b></li>
      <li>
        <b>Draws:</b> threefold repetition of the same position, or the 400-move
        no-progress limit, ends the game as a draw.
      </li>
      <li>
        <b>Controls:</b> Undo (button / U) takes back your last move pair · F
        flips the board view · M mutes sound · ESC returns to the menu.
      </li>
    </ul>
  </div>
);
