/** Constants for the Jungle (Dou Shou Qi) game engine. */

// Board dimensions
export const BOARD_ROWS = 9;
export const BOARD_COLS = 7;

// Piece types (also serve as rank values)
export const RAT = 1;
export const CAT = 2;
export const DOG = 3;
export const WOLF = 4;
export const LEOPARD = 5;
export const TIGER = 6;
export const LION = 7;
export const ELEPHANT = 8;

// Players
export const BLUE = 1; // Moves first, top of board
export const RED = 2; // Bottom of board

// Terrain types
export const LAND = 0;
export const WATER = 1;
export const TRAP_BLUE = 2; // Blue's traps (near Blue's den at top)
export const TRAP_RED = 3; // Red's traps (near Red's den at bottom)
export const DEN_BLUE = 4; // Blue's den (top center)
export const DEN_RED = 5; // Red's den (bottom center)

export type Player = typeof BLUE | typeof RED;
export type PieceType = number; // RAT..ELEPHANT
export type Terrain = number; // LAND..DEN_RED

/** Piece names for display. */
export const PIECE_NAMES: Record<number, string> = {
  [RAT]: "Rat",
  [CAT]: "Cat",
  [DOG]: "Dog",
  [WOLF]: "Wolf",
  [LEOPARD]: "Lep",
  [TIGER]: "Tig",
  [LION]: "Lion",
  [ELEPHANT]: "Ele",
};

export const PIECE_ABBREVIATIONS: Record<number, string> = {
  [RAT]: "Rt",
  [CAT]: "Ca",
  [DOG]: "Dg",
  [WOLF]: "Wf",
  [LEOPARD]: "Le",
  [TIGER]: "Ti",
  [LION]: "Li",
  [ELEPHANT]: "El",
};

/** Terrain map (9 rows x 7 columns). Blue side is top (row 0), Red bottom (row 8). */
export const TERRAIN_MAP: readonly number[][] = [
  // Col:  0     1     2          3         4          5     6
  [LAND, LAND, TRAP_BLUE, DEN_BLUE, TRAP_BLUE, LAND, LAND], // Row 0
  [LAND, LAND, LAND, TRAP_BLUE, LAND, LAND, LAND], // Row 1
  [LAND, LAND, LAND, LAND, LAND, LAND, LAND], // Row 2
  [LAND, WATER, WATER, LAND, WATER, WATER, LAND], // Row 3
  [LAND, WATER, WATER, LAND, WATER, WATER, LAND], // Row 4
  [LAND, WATER, WATER, LAND, WATER, WATER, LAND], // Row 5
  [LAND, LAND, LAND, LAND, LAND, LAND, LAND], // Row 6
  [LAND, LAND, LAND, TRAP_RED, LAND, LAND, LAND], // Row 7
  [LAND, LAND, TRAP_RED, DEN_RED, TRAP_RED, LAND, LAND], // Row 8
];

/** Starting positions: [pieceType, row, col][] keyed by piece type via maps below. */
export const BLUE_START: Readonly<Record<number, readonly [number, number]>> = {
  [LION]: [0, 0],
  [TIGER]: [0, 6],
  [DOG]: [1, 1],
  [CAT]: [1, 5],
  [RAT]: [2, 0],
  [LEOPARD]: [2, 2],
  [WOLF]: [2, 4],
  [ELEPHANT]: [2, 6],
};

export const RED_START: Readonly<Record<number, readonly [number, number]>> = {
  [TIGER]: [8, 0],
  [LION]: [8, 6],
  [CAT]: [7, 1],
  [DOG]: [7, 5],
  [ELEPHANT]: [6, 0],
  [WOLF]: [6, 2],
  [LEOPARD]: [6, 4],
  [RAT]: [6, 6],
};

/** Den positions. */
export const DEN_POSITIONS: Readonly<Record<number, readonly [number, number]>> = {
  [BLUE]: [0, 3],
  [RED]: [8, 3],
};

/** Trap positions, derived from the terrain map (single source of truth). */
export function trapPositions(player: number): readonly [number, number][] {
  const out: [number, number][] = [];
  const want = player === BLUE ? TRAP_BLUE : TRAP_RED;
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      if (TERRAIN_MAP[r]![c] === want) out.push([r, c]);
    }
  }
  return out;
}

export const TRAP_POSITIONS: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  [BLUE]: trapPositions(BLUE),
  [RED]: trapPositions(RED),
};

/** Water squares. */
export const WATER_SQUARES: ReadonlySet<string> = (() => {
  const s = new Set<string>();
  for (let r = 3; r < 6; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      if (TERRAIN_MAP[r]![c] === WATER) s.add(`${r},${c}`);
    }
  }
  return s;
})();

export function isWaterSquare(row: number, col: number): boolean {
  return WATER_SQUARES.has(`${row},${col}`);
}

/** Orthogonal directions. */
export const DIRECTIONS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
