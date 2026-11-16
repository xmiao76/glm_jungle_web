/**
 * Position evaluation for the Jungle AI.
 *
 * Material is the dominant term (x10); every positional term is deliberately
 * bounded below a single piece-value swing so it can never invert material
 * priorities (tests enforce this). Scores are returned from the perspective
 * of the ``player`` arg. Port of ai/evaluation.py, term for term.
 */
import { BOARD_COLS, BLUE, RED, RAT, CAT, DOG, WOLF, LEOPARD, TIGER, LION, ELEPHANT } from "../engine/constants";
import type { Board } from "../engine/board";
import { WEIGHTS, DEFAULT_WEIGHTS, ANIMAL_KEYS, type Weights } from "./weights";
import { Position } from "./position";
import {
  PT_OF,
  SIDE_OF,
  VALUE,
  NEIGH_FLAT,
  NEIGH_CNT,
  IS_WATER,
  TRAP_OWNER,
  DEN_SQ_BLUE,
  DEN_SQ_RED,
  DIST_DEN_BLUE,
  DIST_DEN_RED,
  INF,
  advMaps,
  rebuildTables,
} from "./tables";
// den maps re-exported for tests
export {
  WALK_TO_RED,
  WALK_TO_BLUE,
  RAT_TO_RED,
  RAT_TO_BLUE,
  LION_TO_RED,
  LION_TO_BLUE,
  TIGER_TO_RED,
  TIGER_TO_BLUE,
  DEN_SQ_BLUE,
  DEN_SQ_RED,
  IS_WATER,
  INF,
  PSTS,
  PT_OF,
} from "./tables";

/** Material values, from the shared weight schema. Elephant < Lion/Tiger
 * because it is vulnerable to the Rat. Index by piece type 1-8. */
export const PIECE_VALUES = new Int32Array(9);

/** Total material on the board at the start (both sides). */
export let START_MATERIAL = 0;

// --- Evaluation term weights (all clearly subordinate to material x 10) ---
let DEN_THREAT_W = 0;
let DEN_DEFENSE_W = 0;
let MOBILITY_W = 0;
let RAT_ELE_W = 0;
let TRAP_DANGER_NEAR = 0;
let TRAP_DANGER_SAFE = 0;
let MAX_DEN_DIST = 0;
let PST_PHASE_MAX = 0;
let RACE_MAX_MAT = 0;
let RACE_W = 0;
let MATERIAL_SCALE = 0;
let ADV_SPREAD = 0;

function refreshTermWeights(w: Weights): void {
  PIECE_VALUES.fill(0);
  let total = 0;
  for (let pt = 1; pt <= 8; pt++) {
    PIECE_VALUES[pt] = (w as unknown as Record<string, number>)[`value_${ANIMAL_KEYS[pt]}`]!;
    total += PIECE_VALUES[pt]!;
  }
  START_MATERIAL = total * 2;
  DEN_THREAT_W = w.den_threat;
  DEN_DEFENSE_W = w.den_defense;
  MOBILITY_W = w.mobility;
  RAT_ELE_W = w.rat_ele;
  TRAP_DANGER_NEAR = w.trap_danger_near;
  TRAP_DANGER_SAFE = w.trap_danger_safe;
  MAX_DEN_DIST = w.max_den_dist;
  PST_PHASE_MAX = w.pst_phase_max;
  RACE_MAX_MAT = w.race_max_mat;
  RACE_W = w.race_w;
  MATERIAL_SCALE = w.material_scale;
  ADV_SPREAD = w.adv_spread;
}
refreshTermWeights(WEIGHTS);

/** Swap the whole evaluation to a new weight vector.
 *
 * Updates this module's term constants, weights.WEIGHTS, and rebuilds the
 * PST / material tables. Positions built afterwards use the new weights
 * (existing Position objects keep their old incremental sums).
 */
export function applyWeights(w: Weights): void {
  Object.assign(WEIGHTS, w);
  refreshTermWeights(WEIGHTS);
  rebuildTables(WEIGHTS);
}

/** Reset to the shipped defaults (test helper). */
export function resetWeights(): void {
  applyWeights({ ...DEFAULT_WEIGHTS });
}

/** Evaluate an engine Board from ``player``'s perspective (positive = good). */
export function evaluate(board: Board, player: number): number {
  return evaluatePos(Position.fromBoard(board, player), player);
}

function posMobility(pos: Position, ownDenSq: number, side: number): number {
  /** Cheap mobility proxy: count orthogonally reachable squares. */
  const grid = pos.grid;
  const squares = side === BLUE ? pos.blueSq : pos.redSq;
  const cnt = side === BLUE ? pos.blueCnt : pos.redCnt;
  let count = 0;
  for (let i = 0; i < cnt; i++) {
    const sq = squares[i]!;
    const pt = PT_OF[grid[sq]!]!;
    const nc = NEIGH_CNT[sq]!;
    for (let j = 0; j < nc; j++) {
      const nsq = NEIGH_FLAT[sq * 4 + j]!;
      if (nsq === ownDenSq) continue;
      if (IS_WATER[nsq]! && pt !== RAT) continue;
      const t = grid[nsq]!;
      if (t === 0 || SIDE_OF[t]! !== side) count++;
    }
  }
  return count;
}

function posEnemyAdjacent(pos: Position, sq: number, side: number): boolean {
  const grid = pos.grid;
  const nc = NEIGH_CNT[sq]!;
  for (let j = 0; j < nc; j++) {
    const t = grid[NEIGH_FLAT[sq * 4 + j]!]!;
    if (t !== 0 && SIDE_OF[t]! !== side) return true;
  }
  return false;
}

/** Closest BFS movement distance of any piece in the side's list to a den. */
function minAttackerDist(pos: Position, side: number, targetDenIsRed: boolean): number {
  const grid = pos.grid;
  const idx = targetDenIsRed ? 0 : 1;
  const squares = side === BLUE ? pos.blueSq : pos.redSq;
  const cnt = side === BLUE ? pos.blueCnt : pos.redCnt;
  let best = INF;
  for (let i = 0; i < cnt; i++) {
    const sq = squares[i]!;
    const maps = advMaps(PT_OF[grid[sq]!]!);
    const d = maps[idx]![sq]!;
    if (d < best) best = d;
  }
  return best;
}

/** Evaluate the fast Position from ``player``'s perspective. */
export function evaluatePos(pos: Position, player: number): number {
  if (player === BLUE) {
    if (pos.blueCnt === 0) return -100000.0;
    if (pos.redCnt === 0) return 100000.0;
  } else {
    if (pos.redCnt === 0) return -100000.0;
    if (pos.blueCnt === 0) return 100000.0;
  }
  const grid = pos.grid;
  const mySq = player === BLUE ? pos.blueSq : pos.redSq;
  const myCnt = player === BLUE ? pos.blueCnt : pos.redCnt;
  const oppSq = player === BLUE ? pos.redSq : pos.blueSq;
  const oppCnt = player === BLUE ? pos.redCnt : pos.blueCnt;
  const myMat = player === BLUE ? pos.matBlue : pos.matRed;
  const oppMat = player === BLUE ? pos.matRed : pos.matBlue;
  const myPst = player === BLUE ? pos.pstBlue : pos.pstRed;
  const oppPst = player === BLUE ? pos.pstRed : pos.pstBlue;
  const myDenSq = player === BLUE ? DEN_SQ_BLUE : DEN_SQ_RED;
  const oppDenSq = player === BLUE ? DEN_SQ_RED : DEN_SQ_BLUE;
  const opponent = player === BLUE ? RED : BLUE;

  let score = 0.0;

  // 1. Material balance (dominant)
  score += (myMat - oppMat) * MATERIAL_SCALE;

  // 2. Piece-square difference, scaled up as material comes off
  const totalMat = myMat + oppMat;
  const phase = 1.0 + (PST_PHASE_MAX - 1.0) * Math.max(0.0, 1.0 - totalMat / START_MATERIAL);
  score += (myPst - oppPst) * phase;

  // 3. Closest-attacker den pressure (per movement class, rivers included)
  const targetIsRed = player === BLUE;
  let d = minAttackerDist(pos, player, targetIsRed);
  score += DEN_THREAT_W * Math.max(0, MAX_DEN_DIST - d);
  d = minAttackerDist(pos, opponent, !targetIsRed);
  score -= DEN_THREAT_W * Math.max(0, MAX_DEN_DIST - d);

  // 4. Den defense -- nearest defender distance to own den
  d = minAttackerDist(pos, player, !targetIsRed);
  score += DEN_DEFENSE_W * 2 * Math.max(0, MAX_DEN_DIST - d);
  d = minAttackerDist(pos, opponent, targetIsRed);
  score -= DEN_DEFENSE_W * 2 * Math.max(0, MAX_DEN_DIST - d);

  // 5. Mobility proxy
  score += MOBILITY_W * (posMobility(pos, myDenSq, player) - posMobility(pos, oppDenSq, opponent));

  // 6. Rat threat -- a Rat near the enemy Elephant is strategically valuable
  for (let i = 0; i < myCnt; i++) {
    const rsq = mySq[i]!;
    if (PT_OF[grid[rsq]!]! === RAT) {
      const r = (rsq / BOARD_COLS) | 0;
      const c = rsq % BOARD_COLS;
      for (let j = 0; j < oppCnt; j++) {
        const esq = oppSq[j]!;
        if (PT_OF[grid[esq]!]! === ELEPHANT) {
          const er = (esq / BOARD_COLS) | 0;
          const ec = esq % BOARD_COLS;
          const dist = Math.abs(r - er) + Math.abs(c - ec);
          if (dist <= 3) score += Math.floor(RAT_ELE_W / Math.max(dist, 1));
        }
      }
    }
  }
  for (let i = 0; i < oppCnt; i++) {
    const rsq = oppSq[i]!;
    if (PT_OF[grid[rsq]!]! === RAT) {
      const r = (rsq / BOARD_COLS) | 0;
      const c = rsq % BOARD_COLS;
      for (let j = 0; j < myCnt; j++) {
        const esq = mySq[j]!;
        if (PT_OF[grid[esq]!]! === ELEPHANT) {
          const er = (esq / BOARD_COLS) | 0;
          const ec = esq % BOARD_COLS;
          const dist = Math.abs(r - er) + Math.abs(c - ec);
          if (dist <= 3) score -= Math.floor(RAT_ELE_W / Math.max(dist, 1));
        }
      }
    }
  }

  // 7. Trap danger -- only heavily penalize a trapped piece if capturable now
  for (let i = 0; i < myCnt; i++) {
    const sq = mySq[i]!;
    const t = TRAP_OWNER[sq]!;
    if (t !== 0 && t !== player) {
      const mult = posEnemyAdjacent(pos, sq, player) ? TRAP_DANGER_NEAR : TRAP_DANGER_SAFE;
      score -= VALUE[grid[sq]!]! * mult;
    }
  }
  for (let i = 0; i < oppCnt; i++) {
    const sq = oppSq[i]!;
    const t = TRAP_OWNER[sq]!;
    if (t !== 0 && t !== opponent) {
      const mult = posEnemyAdjacent(pos, sq, opponent) ? TRAP_DANGER_NEAR : TRAP_DANGER_SAFE;
      score += VALUE[grid[sq]!]! * mult;
    }
  }

  // 8. Endgame den race: a spearhead that wins the race to the enemy den
  // against the nearest defender earns a bounded escalating bonus. The side
  // to move gets a one-move head start on its attack clock.
  if (totalMat <= RACE_MAX_MAT) {
    let myAttack = minAttackerDist(pos, player, targetIsRed);
    const myDefend = minAttackerDist(pos, player, !targetIsRed);
    let oppAttack = minAttackerDist(pos, opponent, !targetIsRed);
    const oppDefend = minAttackerDist(pos, opponent, targetIsRed);
    if (pos.side === player) myAttack -= 1;
    if (pos.side === opponent) oppAttack -= 1;
    if (myAttack < oppDefend) score += RACE_W * Math.max(0, 8 - myAttack);
    if (oppAttack < myDefend) score -= RACE_W * Math.max(0, 8 - oppAttack);
  }

  return score;
}

// --- Feature extraction (for eval auto-tuning) -----------------------------------
//
// evaluateFeatures mirrors evaluatePos term-for-term, but instead of the
// folded sums it returns per-weight FEATURES: the unit contribution each
// tunable weight multiplies. score == evaluatePos(pos, player) exactly.
// The tuning CLI fits weights by logistic regression on these features.
//
// The rat-elephant term uses integer division by distance (80 // dist), so it
// is not linear in its weight; it is exposed as a fixed unit-weight feature
// ('rat_ele_fixed') and left out of gradient tuning.

const PST_TRAP_TYPES = new Set([CAT, DOG, WOLF, LEOPARD, TIGER, LION]);
const HOME_DEFENSE_TYPES = new Set([CAT, DOG]);
const CENTER_TYPES = new Set([WOLF, LEOPARD]);
export const PST_UNIT_KEYS = [
  "adv_w_rat",
  "adv_w_cat",
  "adv_w_dog",
  "adv_w_wolf",
  "adv_w_leopard",
  "adv_w_tiger",
  "adv_w_lion",
  "adv_w_elephant",
  "trap_control_cat",
  "trap_control_dog",
  "trap_control_wolf",
  "trap_control_leopard",
  "trap_control_tiger",
  "trap_control_lion",
  "home_defense_cat",
  "home_defense_dog",
  "rat_water",
  "rat_water_adjacent",
  "ele_water_adjacent",
  "center_file",
] as const;
const PST_UNIT_KEY_SET = new Set<string>(PST_UNIT_KEYS);

/** Accumulate one piece's UNWEIGHTED PST feature units into ``out``. */
function pstUnitFeatures(code: number, sq: number, side: number, out: Map<string, number>, sign: number): void {
  const pt = PT_OF[code]!;
  const key = ANIMAL_KEYS[pt]!;
  const toEnemy = advMaps(pt)[side === BLUE ? 0 : 1];
  const d = toEnemy[sq]!;
  if (d < INF) {
    const k = `adv_w_${key}`;
    out.set(k, (out.get(k) ?? 0) + sign * Math.max(0, ADV_SPREAD - d));
  }
  if (PST_TRAP_TYPES.has(pt)) {
    const nc = NEIGH_CNT[sq]!;
    for (let i = 0; i < nc; i++) {
      const t = TRAP_OWNER[NEIGH_FLAT[sq * 4 + i]!]!;
      if (t !== 0 && t !== side) {
        const k = `trap_control_${key}`;
        out.set(k, (out.get(k) ?? 0) + sign);
        break;
      }
    }
  }
  if (HOME_DEFENSE_TYPES.has(pt)) {
    const nearOwn = side === BLUE ? DIST_DEN_BLUE[sq]! <= 2 : DIST_DEN_RED[sq]! <= 2;
    if (nearOwn) {
      const k = `home_defense_${key}`;
      out.set(k, (out.get(k) ?? 0) + sign);
    }
  }
  if (IS_WATER[sq]!) {
    if (pt === RAT) out.set("rat_water", (out.get("rat_water") ?? 0) + sign);
  } else {
    let touches = false;
    const nc = NEIGH_CNT[sq]!;
    for (let i = 0; i < nc; i++) {
      if (IS_WATER[NEIGH_FLAT[sq * 4 + i]!]!) {
        touches = true;
        break;
      }
    }
    if (touches) {
      if (pt === RAT) out.set("rat_water_adjacent", (out.get("rat_water_adjacent") ?? 0) + sign);
      else if (pt === ELEPHANT) out.set("ele_water_adjacent", (out.get("ele_water_adjacent") ?? 0) + sign);
    }
  }
  if (CENTER_TYPES.has(pt) && sq % BOARD_COLS >= 2 && sq % BOARD_COLS <= 4) {
    out.set("center_file", (out.get("center_file") ?? 0) + sign);
  }
}

/** Score a Position plus the per-weight feature decomposition.
 *
 * Returns [score, features] where score == evaluatePos(pos, player) and
 * score == sum(weight[k] * features[k]) over linear keys, plus
 * features['rat_ele_fixed'] (unit weight) carrying the non-linear term.
 */
export function evaluateFeatures(pos: Position, player: number): [number, Map<string, number>] {
  if (player === BLUE) {
    if (pos.blueCnt === 0) return [-100000.0, new Map()];
    if (pos.redCnt === 0) return [100000.0, new Map()];
  } else {
    if (pos.redCnt === 0) return [-100000.0, new Map()];
    if (pos.blueCnt === 0) return [100000.0, new Map()];
  }
  const grid = pos.grid;
  const mySq = player === BLUE ? pos.blueSq : pos.redSq;
  const myCnt = player === BLUE ? pos.blueCnt : pos.redCnt;
  const oppSq = player === BLUE ? pos.redSq : pos.blueSq;
  const oppCnt = player === BLUE ? pos.redCnt : pos.blueCnt;
  const myDenSq = player === BLUE ? DEN_SQ_BLUE : DEN_SQ_RED;
  const oppDenSq = player === BLUE ? DEN_SQ_RED : DEN_SQ_BLUE;
  const opponent = player === BLUE ? RED : BLUE;

  const targetIsRed = player === BLUE;
  const totalMat = (player === BLUE ? pos.matBlue + pos.matRed : pos.matRed + pos.matBlue);
  const phase = 1.0 + (PST_PHASE_MAX - 1.0) * Math.max(0.0, 1.0 - totalMat / START_MATERIAL);

  const feats = new Map<string, number>();

  // 1. Material, decomposed per piece type: feature = my count - opponent count.
  for (let pt = 1; pt <= 8; pt++) feats.set(`value_${ANIMAL_KEYS[pt]}`, 0);
  for (let i = 0; i < myCnt; i++) {
    const k = `value_${ANIMAL_KEYS[PT_OF[grid[mySq[i]!]!]!]!}`;
    feats.set(k, feats.get(k)! + 1);
  }
  for (let i = 0; i < oppCnt; i++) {
    const k = `value_${ANIMAL_KEYS[PT_OF[grid[oppSq[i]!]!]!]!}`;
    feats.set(k, feats.get(k)! - 1);
  }

  // 2. PST features (per weight key, phase-scaled)
  for (let i = 0; i < myCnt; i++) pstUnitFeatures(grid[mySq[i]!]!, mySq[i]!, player, feats, 1);
  for (let i = 0; i < oppCnt; i++) pstUnitFeatures(grid[oppSq[i]!]!, oppSq[i]!, opponent, feats, -1);
  for (const [k, v] of feats) {
    if (PST_UNIT_KEY_SET.has(k)) feats.set(k, v * phase);
  }

  // 3/4. Den pressure and defense
  let d = minAttackerDist(pos, player, targetIsRed);
  const tMy = Math.max(0, MAX_DEN_DIST - d);
  d = minAttackerDist(pos, opponent, !targetIsRed);
  const tOpp = Math.max(0, MAX_DEN_DIST - d);
  feats.set("den_threat", tMy - tOpp);

  d = minAttackerDist(pos, player, !targetIsRed);
  const fMy = Math.max(0, MAX_DEN_DIST - d);
  d = minAttackerDist(pos, opponent, targetIsRed);
  const fOpp = Math.max(0, MAX_DEN_DIST - d);
  feats.set("den_defense", 2 * (fMy - fOpp));

  // 5. Mobility
  feats.set("mobility", posMobility(pos, myDenSq, player) - posMobility(pos, oppDenSq, opponent));

  // 6. Rat-elephant (fixed unit feature; integer-division term)
  let ratEle = 0;
  for (let i = 0; i < myCnt; i++) {
    const rsq = mySq[i]!;
    if (PT_OF[grid[rsq]!]! === RAT) {
      const r = (rsq / BOARD_COLS) | 0;
      const c = rsq % BOARD_COLS;
      for (let j = 0; j < oppCnt; j++) {
        const esq = oppSq[j]!;
        if (PT_OF[grid[esq]!]! === ELEPHANT) {
          const dist = Math.abs(r - ((esq / BOARD_COLS) | 0)) + Math.abs(c - (esq % BOARD_COLS));
          if (dist <= 3) ratEle += Math.floor(RAT_ELE_W / Math.max(dist, 1));
        }
      }
    }
  }
  for (let i = 0; i < oppCnt; i++) {
    const rsq = oppSq[i]!;
    if (PT_OF[grid[rsq]!]! === RAT) {
      const r = (rsq / BOARD_COLS) | 0;
      const c = rsq % BOARD_COLS;
      for (let j = 0; j < myCnt; j++) {
        const esq = mySq[j]!;
        if (PT_OF[grid[esq]!]! === ELEPHANT) {
          const dist = Math.abs(r - ((esq / BOARD_COLS) | 0)) + Math.abs(c - (esq % BOARD_COLS));
          if (dist <= 3) ratEle -= Math.floor(RAT_ELE_W / Math.max(dist, 1));
        }
      }
    }
  }
  feats.set("rat_ele_fixed", ratEle);

  // 7. Trap danger
  let near = 0;
  let safe = 0;
  for (let i = 0; i < myCnt; i++) {
    const sq = mySq[i]!;
    const t = TRAP_OWNER[sq]!;
    if (t !== 0 && t !== player) {
      if (posEnemyAdjacent(pos, sq, player)) near -= VALUE[grid[sq]!]!;
      else safe -= VALUE[grid[sq]!]!;
    }
  }
  for (let i = 0; i < oppCnt; i++) {
    const sq = oppSq[i]!;
    const t = TRAP_OWNER[sq]!;
    if (t !== 0 && t !== opponent) {
      if (posEnemyAdjacent(pos, sq, opponent)) near += VALUE[grid[sq]!]!;
      else safe += VALUE[grid[sq]!]!;
    }
  }
  feats.set("trap_danger_near", near);
  feats.set("trap_danger_safe", safe);

  // 8. Den race (gated by the current threshold -- a non-linear knob)
  let race = 0;
  if (totalMat <= RACE_MAX_MAT) {
    let myAttack = minAttackerDist(pos, player, targetIsRed);
    const myDefend = minAttackerDist(pos, player, !targetIsRed);
    let oppAttack = minAttackerDist(pos, opponent, !targetIsRed);
    const oppDefend = minAttackerDist(pos, opponent, targetIsRed);
    if (pos.side === player) myAttack -= 1;
    if (pos.side === opponent) oppAttack -= 1;
    if (myAttack < oppDefend) race += Math.max(0, 8 - myAttack);
    if (oppAttack < myDefend) race -= Math.max(0, 8 - oppAttack);
  }
  feats.set("race", race);

  const w = WEIGHTS as unknown as Record<string, number>;
  let score =
    (feats.get("rat_ele_fixed")! +
      feats.get("trap_danger_near")! * TRAP_DANGER_NEAR +
      feats.get("trap_danger_safe")! * TRAP_DANGER_SAFE +
      feats.get("race")! * RACE_W);
  for (const [k, v] of feats) {
    if (k.startsWith("value_")) score += w[k]! * MATERIAL_SCALE * v;
    else if (PST_UNIT_KEY_SET.has(k)) score += w[k]! * v;
  }
  score += feats.get("den_threat")! * DEN_THREAT_W + feats.get("den_defense")! * DEN_DEFENSE_W + feats.get("mobility")! * MOBILITY_W;
  return [score, feats];
}
