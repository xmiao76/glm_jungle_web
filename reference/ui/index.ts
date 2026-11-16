/**
 * UI module barrel export.
 */
export {
  PALETTE,
  SPACING,
  PANEL_WIDTH,
  PANEL_GAP,
  PIECE_CHARS,
  DEN_CHAR,
  CJK_FONT_STACK,
} from "./theme";
export type { RendererConfig } from "./boardRenderer";
export { DEFAULT_RENDERER_CONFIG } from "./boardRenderer";
export { BoardRenderer } from "./boardRenderer";
export { generatePieceSurface, generatePieceSurfaceSmall, pieceLabel } from "./assets";
export type { GameControllerConfig, GameState, GameMode } from "./gameController";
export {
  GameController,
  checkDraw,
  DIFFICULTY_PRESETS,
  DIFFICULTY_ORDER,
  FIRST_MOVER_CHOICES,
} from "./gameController";
export {
  TurnCard,
  EvalCard,
  EngineCard,
  CapturedCard,
  PanelHints,
  GameOverOverlay,
  MenuButton,
  MainMenu,
  FirstMoverMenu,
} from "./components";
