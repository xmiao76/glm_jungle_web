/**
 * Visual theme for the Jungle UI.
 *
 * Ported from gui/theme.py - exact RGB palette, spacing, and CJK labels.
 */

/** Color palette matching the desktop app exactly. */
export const PALETTE = {
  // Window / chrome
  BG: "#181c26", // deep slate
  PANEL_BG: "#1e232f", // side panel background
  CARD: "#262c3a", // cards inside the panel
  CARD_EDGE: "#343c4e",
  STATUS_BG: "#14171f",

  // Board terrain
  LAND: "#8ca864",
  LAND_ALT: "#829d5c",
  WATER: "#3e6e9e",
  WATER_ALT: "#386594",
  WATER_WAVE: "#6e9ecd",
  TRAP: "#c4944c",
  TRAP_ALT: "#bc8c46",
  DEN_BLUE: "#344994",
  DEN_RED: "#9e3030",

  // Sides
  BLUE: "#426ee0",
  BLUE_DARK: "#1c3482",
  RED: "#d44242",
  RED_DARK: "#801c1c",

  // Accents
  SELECT: "#ffd054", // warm amber selection
  LAST_MOVE: "#ffd054",
  LEGAL: "#fafafa", // near-white dots for quiet moves
  CAPTURE: "#e8483d",

  // Buttons
  BTN: "#343e52",
  BTN_HOVER: "#424e66",
  BTN_EDGE: "#56637e",
  BTN_TEXT: "#f0f3fa",
  GOLD: "#ffd054",

  // Text
  TEXT: "#ebeef5",
  TEXT_DIM: "#949cac",
} as const;

/** Spacing scale (multiplied by cell size where relevant). */
export const SPACING = {
  radius: 10, // button corner radius (px)
  card_pad: 12, // inner padding of panel cards
  card_gap: 10, // gap between panel cards
} as const;

/** Side panel geometry (px). */
export const PANEL_WIDTH = 300;
export const PANEL_GAP = 16;

/** Piece labels, in rank order (RAT..ELEPHANT). */
export const PIECE_CHARS: Record<number, string> = {
  1: "Rat",
  2: "Cat",
  3: "Dog",
  4: "Wolf",
  5: "Leopard",
  6: "Tiger",
  7: "Lion",
  8: "Elephant",
};

/** Den label. */
export const DEN_CHAR = "DEN";

/** Font stack for UI + canvas text. */
export const CJK_FONT_STACK =
  '"Segoe UI Variable Display", "Segoe UI", system-ui, -apple-system, sans-serif';
