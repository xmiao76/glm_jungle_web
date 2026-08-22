/**
 * Precomputed static tables for the fast search core: piece decoding,
 * material values, terrain flags, neighbor lists, river-jump lanes, BFS
 * den-distance maps per movement class, and weight-derived piece-square
 * tables. Port of the table builders in ai/position.py.
 */
import {
  BOARD_ROWS,
  BOARD_COLS,
  BLUE,
  RED,
  WATER,
  TRAP_BLUE,
  TRAP_RED,
  DEN_BLUE,
  DEN_RED,
  RAT,
  CAT,
  DOG,
  WOLF,
  LEOPARD,
  TIGER,
  LION,
  ELEPHANT,
  DIRECTIONS,
  TERRAIN_MAP,
} from "../engine/constants";
import { WEIGHTS, ANIMAL_KEYS, type Weights } from "./weights";

export const SQ = BOARD_ROWS * BOARD_COLS; // 63
export const INF = 99;

// --- Piece decoding -----------------------------------------------------------

// PT_OF[code] -> piece type; SIDE_OF[code] -> owning player.
export const PT_OF = new Uint8Array(17);
export const SIDE_OF = new Uint8Array(17);
for (let pt = 1; pt <= 8; pt++) {
  PT_OF[pt] = pt;
  SIDE_OF[pt] = BLUE;
  PT_OF[pt + 8] = pt;
  SIDE_OF[pt + 8] = RED;
}

// VALUE[code] -> material value, from the shared weight schema
// (weights.ts; tests assert it matches evaluation.PIECE_VALUES).
export const VALUE = new Int32Array(17);

// --- Terrain ------------------------------------------------------------------

export const IS_WATER = new Uint8Array(SQ); // 0/1
export const TRAP_OWNER = new Int8Array(SQ); // BLUE/RED for that side's trap squares, else 0
export let DEN_SQ_BLUE = -1;
export let DEN_SQ_RED = -1;
export function denSqBlue(): number {
  return DEN_SQ_BLUE;
}
export function denSqRed(): number {
  return DEN_SQ_RED;
}

for (let r = 0; r < BOARD_ROWS; r++) {
  for (let c = 0; c < BOARD_COLS; c++) {
    const sq = r * BOARD_COLS + c;
    const t = TERRAIN_MAP[r]![c]!;
    if (t === WATER) IS_WATER[sq] = 1;
    else if (t === TRAP_BLUE) TRAP_OWNER[sq] = BLUE;
    else if (t === TRAP_RED) TRAP_OWNER[sq] = RED;
    else if (t === DEN_BLUE) DEN_SQ_BLUE = sq;
    else if (t === DEN_RED) DEN_SQ_RED = sq;
  }
}

// --- Neighbors (flat: NEIGH_FLAT[sq*4 + i], NEIGH_CNT[sq]) ----------------------

export const NEIGH_FLAT = new Int8Array(SQ * 4).fill(-1);
export const NEIGH_CNT = new Uint8Array(SQ);
{
  const tmp: number[][] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const n: number[] = [];
      for (const [dr, dc] of DIRECTIONS) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < BOARD_ROWS && nc >= 0 && nc < BOARD_COLS) {
          n.push(nr * BOARD_COLS + nc);
        }
      }
      tmp.push(n);
    }
  }
  for (let sq = 0; sq < SQ; sq++) {
    NEIGH_CNT[sq] = tmp[sq]!.length;
    for (let i = 0; i < tmp[sq]!.length; i++) NEIGH_FLAT[sq * 4 + i] = tmp[sq]![i]!;
  }
}

// --- River-jump lanes -----------------------------------------------------------
// JUMP_LAND[sq] / JUMP_LANE[sq] / JUMP_WLEN[sq]: parallel arrays of jump lanes
// leaving sq. Rat blocking and the Tiger's 2-water limit are enforced at
// runtime (dynamic / piece-specific).

export const MAX_LEAP_WATER: Record<number, number> = { [LION]: 3, [TIGER]: 2 };
export const JUMP_LAND: number[][] = [];
export const JUMP_LANE: number[][][] = [];
export const JUMP_WLEN: number[][] = [];
{
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const lands: number[] = [];
      const lanes: number[][] = [];
      const wlens: number[] = [];
      for (const [dr, dc] of DIRECTIONS) {
        let rr = r + dr;
        let cc = c + dc;
        if (!(rr >= 0 && rr < BOARD_ROWS && cc >= 0 && cc < BOARD_COLS)) continue;
        if (TERRAIN_MAP[rr]![cc] !== WATER) continue;
        const lane: number[] = [];
        while (rr >= 0 && rr < BOARD_ROWS && cc >= 0 && cc < BOARD_COLS && TERRAIN_MAP[rr]![cc] === WATER) {
          lane.push(rr * BOARD_COLS + cc);
          rr += dr;
          cc += dc;
        }
        if (!(rr >= 0 && rr < BOARD_ROWS && cc >= 0 && cc < BOARD_COLS)) continue; // water runs off board (never on this map)
        lands.push(rr * BOARD_COLS + cc);
        lanes.push(lane);
        wlens.push(lane.length);
      }
      JUMP_LAND.push(lands);
      JUMP_LANE.push(lanes);
      JUMP_WLEN.push(wlens);
    }
  }
}

// Rat codes (both sides) for leap-lane blocking checks.
export const RAT_CODE_BLUE = RAT;
export const RAT_CODE_RED = RAT + 8;

// Manhattan distance from each square to each den (ordering heuristic input).
export const DIST_DEN_BLUE = new Uint8Array(SQ); // distance to Blue's den at (0,3)
export const DIST_DEN_RED = new Uint8Array(SQ); // distance to Red's den at (8,3)
for (let r = 0; r < BOARD_ROWS; r++) {
  for (let c = 0; c < BOARD_COLS; c++) {
    const sq = r * BOARD_COLS + c;
    DIST_DEN_BLUE[sq] = Math.abs(r - 0) + Math.abs(c - 3);
    DIST_DEN_RED[sq] = Math.abs(r - 8) + Math.abs(c - 3);
  }
}

// --- BFS movement-distance maps --------------------------------------------------
// True walking distance to each den for each movement class, replacing the
// Manhattan approximation (which pretends rivers do not exist). The mover
// cannot pass through its OWN den, so the BFS for "distance to den X" (used by
// the opponent of X) excludes X's owner's den as a transit square. Unreachable
// squares (own den) get INF.

function bfsDen(denSq: number, ownDenSq: number, swim: boolean, leapMaxWater: number): Uint8Array {
  const dist = new Uint8Array(SQ).fill(INF);
  dist[denSq] = 0;
  const queue: number[] = [denSq];
  let head = 0;
  while (head < queue.length) {
    const sq = queue[head++]!;
    const d = dist[sq]! + 1;
    // Reverse edges: predecessors reachable in one move from square p.
    const cnt = NEIGH_CNT[sq]!;
    for (let i = 0; i < cnt; i++) {
      const p = NEIGH_FLAT[sq * 4 + i]!;
      if (dist[p]! <= d || p === ownDenSq) continue;
      if (IS_WATER[p]! && !swim) continue; // a non-swimmer cannot stand on water
      if (IS_WATER[sq]! && !swim) continue; // ... and cannot step into water
      dist[p] = d;
      queue.push(p);
    }
    if (leapMaxWater) {
      // Reverse leap edges: any square p whose lane (len <= max) lands on sq
      // gives p -> sq in one move.
      for (let p = 0; p < SQ; p++) {
        if (dist[p]! <= d) continue;
        const lands = JUMP_LAND[p]!;
        const wlens = JUMP_WLEN[p]!;
        for (let j = 0; j < lands.length; j++) {
          if (lands[j] === sq && wlens[j]! <= leapMaxWater && p !== ownDenSq) {
            dist[p] = d;
            queue.push(p);
            break;
          }
        }
      }
    }
  }
  return dist;
}

// Per-class distance maps: WALK_<den> (no water), RAT_<den> (swims),
// LION_<den> / TIGER_<den> (walk + leaps). <den> names the TARGET den.
export const WALK_TO_RED = bfsDen(DEN_SQ_RED, DEN_SQ_BLUE, false, 0);
export const WALK_TO_BLUE = bfsDen(DEN_SQ_BLUE, DEN_SQ_RED, false, 0);
export const RAT_TO_RED = bfsDen(DEN_SQ_RED, DEN_SQ_BLUE, true, 0);
export const RAT_TO_BLUE = bfsDen(DEN_SQ_BLUE, DEN_SQ_RED, true, 0);
export const LION_TO_RED = bfsDen(DEN_SQ_RED, DEN_SQ_BLUE, false, 3);
export const LION_TO_BLUE = bfsDen(DEN_SQ_BLUE, DEN_SQ_RED, false, 3);
export const TIGER_TO_RED = bfsDen(DEN_SQ_RED, DEN_SQ_BLUE, false, 2);
export const TIGER_TO_BLUE = bfsDen(DEN_SQ_BLUE, DEN_SQ_RED, false, 2);

// Map selection by piece type: which distance map applies when advancing.
// Index 0 = toward Red's den, 1 = toward Blue's den.
export const CLASS_MAPS: Record<number, readonly [Uint8Array, Uint8Array]> = {
  [RAT]: [RAT_TO_RED, RAT_TO_BLUE],
  [LION]: [LION_TO_RED, LION_TO_BLUE],
  [TIGER]: [TIGER_TO_RED, TIGER_TO_BLUE],
};
export const WALK_MAPS: readonly [Uint8Array, Uint8Array] = [WALK_TO_RED, WALK_TO_BLUE];

export function advMaps(pt: number): readonly [Uint8Array, Uint8Array] {
  return CLASS_MAPS[pt] ?? WALK_MAPS;
}

// --- Piece-square tables ---------------------------------------------------------
// Static positional knowledge per (piece code, square) from that piece's own
// perspective. All weights come from weights.ts so the tuner can rebuild the
// tables wholesale. Indexed PSTS[code * SQ + sq].

export const PSTS = new Int32Array(17 * SQ);

const PST_TRAP_TYPES = new Set([CAT, DOG, WOLF, LEOPARD, TIGER, LION]);

export function buildPsts(w: Weights): Int32Array {
  const psts = new Int32Array(17 * SQ);
  const advSpread = w.adv_spread;
  for (let code = 1; code < 17; code++) {
    const pt = PT_OF[code]!;
    const side = SIDE_OF[code]!;
    const key = ANIMAL_KEYS[pt]!;
    const toEnemy = advMaps(pt)[side === BLUE ? 0 : 1]; // idx 0 = toward Red's den
    const advW = (w as unknown as Record<string, number>)[`adv_w_${key}`]!;
    const trapW = PST_TRAP_TYPES.has(pt) ? (w as unknown as Record<string, number>)[`trap_control_${key}`]! : 0;
    const homeKey = `home_defense_${key}` as keyof Weights;
    const homeW = (w[homeKey] as number | undefined) ?? 0;
    const base = code * SQ;
    for (let sq = 0; sq < SQ; sq++) {
      let v = 0;
      const d = toEnemy[sq]!;
      if (d < INF) v += Math.max(0, advSpread - d) * advW;
      // Trap control: standing adjacent to the ENEMY's traps.
      if (trapW) {
        const cnt = NEIGH_CNT[sq]!;
        for (let i = 0; i < cnt; i++) {
          const t = TRAP_OWNER[NEIGH_FLAT[sq * 4 + i]!]!;
          if (t !== 0 && t !== side) {
            v += trapW;
            break;
          }
        }
      }
      // Cheap pieces earn a small home-defense bonus near their den.
      if (homeW && DIST_DEN_BLUE[sq]! <= 2 && side === BLUE) v += homeW;
      if (homeW && DIST_DEN_RED[sq]! <= 2 && side === RED) v += homeW;
      if (IS_WATER[sq]) {
        if (pt === RAT) v += w.rat_water;
      } else {
        // Land squares touching water: rats can dive, elephants fear the rat.
        let touchesWater = false;
        const cnt = NEIGH_CNT[sq]!;
        for (let i = 0; i < cnt; i++) {
          if (IS_WATER[NEIGH_FLAT[sq * 4 + i]!]!) {
            touchesWater = true;
            break;
          }
        }
        if (touchesWater) {
          if (pt === RAT) v += w.rat_water_adjacent;
          else if (pt === ELEPHANT) v += w.ele_water_adjacent;
        }
      }
      if ((pt === WOLF || pt === LEOPARD) && sq % BOARD_COLS >= 2 && sq % BOARD_COLS <= 4) {
        v += w.center_file;
      }
      psts[base + sq] = v;
    }
  }
  return psts;
}

/** Rebuild the weight-derived tables in place (PST + material values).
 *
 * Existing Position objects hold sums under the OLD weights; rebuild then
 * construct fresh positions (the tuner does exactly that).
 */
export function rebuildTables(w: Weights): void {
  PSTS.set(buildPsts(w));
  VALUE.fill(0);
  for (let pt = 1; pt <= 8; pt++) {
    const key = ANIMAL_KEYS[pt]!;
    const v = (w as unknown as Record<string, number>)[`value_${key}`]!;
    VALUE[pt] = v;
    VALUE[pt + 8] = v;
  }
}

// Initialize from the active weights at module load.
rebuildTables(WEIGHTS);
