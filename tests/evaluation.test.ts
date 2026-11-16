/** Tests for the evaluation: BFS maps, PSTs, invariants. Port of tests/test_evaluation.py. */
import { describe, expect, test } from "vitest";
import { Board } from "../reference/engine/board";
import { getAllLegalMoves, makeMove, getGameState } from "../reference/engine/rules";
import {
  BOARD_COLS,
  BOARD_ROWS,
  BLUE,
  RED,
  RAT,
  CAT,
  DOG,
  WOLF,
  LEOPARD,
  TIGER,
  LION,
  ELEPHANT,
} from "../reference/engine/constants";
import {
  PSTS,
  INF,
  WALK_TO_RED,
  WALK_TO_BLUE,
  RAT_TO_RED,
  LION_TO_RED,
  TIGER_TO_RED,
  DEN_SQ_BLUE,
  DEN_SQ_RED,
  IS_WATER,
} from "../reference/ai/tables";
import { Position } from "../reference/ai/position";
import {
  evaluate,
  evaluatePos,
  evaluateFeatures,
  applyWeights,
  resetWeights,
  PIECE_VALUES,
} from "../reference/ai/evaluation";
import { DEFAULT_WEIGHTS, WEIGHTS } from "../reference/ai/weights";
import { makeRng, pick, randRange } from "./helpers";

function sq(r: number, c: number): number {
  return r * BOARD_COLS + c;
}

describe("TestBFSMaps", () => {
  test("zero at target den", () => {
    expect(WALK_TO_RED[DEN_SQ_RED]).toBe(0);
    expect(WALK_TO_BLUE[DEN_SQ_BLUE]).toBe(0);
    expect(LION_TO_RED[DEN_SQ_RED]).toBe(0);
  });

  test("own den unreachable", () => {
    // A piece can never stand on (let alone route through) its own den.
    expect(WALK_TO_RED[DEN_SQ_BLUE]).toBe(INF);
    expect(WALK_TO_BLUE[DEN_SQ_RED]).toBe(INF);
    expect(LION_TO_RED[DEN_SQ_BLUE]).toBe(INF);
  });

  test("walkers cannot be on water", () => {
    expect(WALK_TO_RED[sq(3, 1)]).toBe(INF);
    expect(WALK_TO_BLUE[sq(5, 5)]).toBe(INF);
  });

  test("rat swims so water is reachable and rivers shortcut", () => {
    expect(RAT_TO_RED[sq(3, 1)]!).toBeLessThan(INF);
    for (let s = 0; s < BOARD_ROWS * BOARD_COLS; s++) {
      if (IS_WATER[s]) continue;
      expect(RAT_TO_RED[s]!).toBeLessThanOrEqual(WALK_TO_RED[s]!);
    }
  });

  test("leapers at least as close as walkers", () => {
    for (let s = 0; s < BOARD_ROWS * BOARD_COLS; s++) {
      if (IS_WATER[s]) continue;
      expect(LION_TO_RED[s]!).toBeLessThanOrEqual(WALK_TO_RED[s]!);
      expect(TIGER_TO_RED[s]!).toBeLessThanOrEqual(WALK_TO_RED[s]!);
      expect(LION_TO_RED[s]!).toBeLessThanOrEqual(TIGER_TO_RED[s]!);
    }
  });

  test("maps mirror vertically", () => {
    for (let r = 0; r < BOARD_ROWS; r++) {
      for (let c = 0; c < BOARD_COLS; c++) {
        expect(WALK_TO_RED[sq(r, c)]).toBe(WALK_TO_BLUE[sq(8 - r, c)]);
      }
    }
  });

  test("lion crosses river faster from bank", () => {
    // Lion standing next to the water on the left bank can leap the lake.
    expect(LION_TO_RED[sq(2, 1)]!).toBeLessThan(WALK_TO_RED[sq(2, 1)]!);
  });
});

describe("TestPSTs", () => {
  test("advance monotone for every piece type", () => {
    /** Closer (BFS) to the enemy den must score higher, per piece type. */
    for (const pt of [RAT, CAT, DOG, WOLF, LEOPARD, TIGER, LION, ELEPHANT]) {
      const nearSq = sq(6, 3); // deep in enemy territory
      const farSq = sq(0, 0); // home corner
      const blueCode = pt;
      expect(PSTS[blueCode * 63 + nearSq]!, `PST for ${pt} not advancing`).toBeGreaterThan(
        PSTS[blueCode * 63 + farSq]!,
      );
    }
  });

  test("rat likes water", () => {
    const onWater = PSTS[RAT * 63 + sq(4, 1)]!;
    const onLandBeside = PSTS[RAT * 63 + sq(4, 0)]!;
    expect(onWater).toBeGreaterThan(PSTS[RAT * 63 + sq(2, 0)]!); // advance + water
    expect(onLandBeside).toBeGreaterThanOrEqual(PSTS[RAT * 63 + sq(2, 0)]!); // no regression
  });

  test("elephant avoids river bank", () => {
    const riverside = PSTS[ELEPHANT * 63 + sq(6, 1)]!;
    const inland = PSTS[ELEPHANT * 63 + sq(6, 3)]!;
    expect(riverside).toBeLessThan(inland);
  });

  test("total pst bounded below material step", () => {
    /** Worst-case summed PST difference stays below one material step (x10).
     *
     * The smallest distinct piece-value gap is 50 (e.g. Dog 250 vs Rat/Cat
     * 200) -> 500 after the x10 material multiplier.
     */
    let perPieceMax = 0;
    for (let code = 1; code < 17; code++) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let s = 0; s < 63; s++) {
        const v = PSTS[code * 63 + s]!;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      perPieceMax = Math.max(perPieceMax, hi - lo);
    }
    expect(perPieceMax * 8 * 1.25, `PST spread too large: per-piece max ${perPieceMax}`).toBeLessThan(500);
  });
});

describe("TestMaterialDominance", () => {
  test("removing enemy piece never hurts me", () => {
    /** On random realistic positions, capturing (removing) any enemy piece
     * must improve my evaluation — positional terms can never invert a full
     * material step. */
    const rng = makeRng(20250814);
    let checked = 0;
    for (let g = 0; g < 15; g++) {
      let board = new Board();
      let current = BLUE;
      for (let i = 0, n = randRange(rng, 6, 40); i < n; i++) {
        if (getGameState(board).over) break;
        const legal = getAllLegalMoves(board, current);
        if (legal.length === 0) break;
        board = makeMove(board, pick(rng, legal));
        current = current === BLUE ? RED : BLUE;
      }

      for (let r = 0; r < BOARD_ROWS; r++) {
        for (let c = 0; c < BOARD_COLS; c++) {
          const p = board.getPiece(r, c);
          if (p === null || p.owner !== RED) continue;
          const before = evaluate(board, BLUE);
          const grid = (board as unknown as { _grid: (typeof p | null)[][] })._grid;
          grid[r]![c] = null;
          const after = evaluate(board, BLUE);
          grid[r]![c] = p;
          expect(after, `removing Red ${p.toString()} at (${r},${c}) lowered Blue's eval`).toBeGreaterThan(before);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("TestPhaseAndRace", () => {
  test("endgame race bonus for unstoppable attacker", () => {
    /** A Lion three steps from an undefended den beats a far-away Lion. */
    const near = Board.withPieces([LION, BLUE, 7, 1], [CAT, RED, 0, 0]);
    const far = Board.withPieces([LION, BLUE, 0, 0], [CAT, RED, 0, 1]);
    expect(evaluate(near, BLUE)).toBeGreaterThan(evaluate(far, BLUE));
  });

  test("defended den reduces race bonus", () => {
    /** Same attacking Lion, but a defender parked by the den rates worse for
     * the attacker than an undefended den. */
    const undefended = Board.withPieces([LION, BLUE, 6, 3], [CAT, RED, 0, 0]);
    const defended = Board.withPieces([LION, BLUE, 6, 3], [DOG, RED, 7, 3]);
    expect(evaluate(undefended, BLUE)).toBeGreaterThan(evaluate(defended, BLUE));
  });
});

describe("TestFeatureParity", () => {
  /** evaluateFeatures must reproduce evaluatePos exactly and decompose into
   * per-weight features (the tuning pipeline depends on this). */
  function dot(feats: Map<string, number>): number {
    const w = WEIGHTS as unknown as Record<string, number>;
    let d =
      (feats.get("rat_ele_fixed")! +
        feats.get("den_threat")! * w.den_threat! +
        feats.get("den_defense")! * w.den_defense! +
        feats.get("mobility")! * w.mobility! +
        feats.get("trap_danger_near")! * w.trap_danger_near! +
        feats.get("trap_danger_safe")! * w.trap_danger_safe! +
        feats.get("race")! * w.race_w!);
    const pstPrefixes = ["adv_w_", "trap_control_", "home_defense_"];
    const pstFlat = ["rat_water", "rat_water_adjacent", "ele_water_adjacent", "center_file"];
    for (const [k, v] of feats) {
      if (k.startsWith("value_")) d += w[k]! * w.material_scale! * v;
      else if (pstPrefixes.some((p) => k.startsWith(p)) || pstFlat.includes(k)) d += w[k]! * v;
    }
    return d;
  }

  test("features match evaluatePos random playouts", () => {
    const rng = makeRng(777);
    let checked = 0;
    for (let g = 0; g < 12; g++) {
      let board = new Board();
      let current = BLUE;
      for (let i = 0; i < 45; i++) {
        if (getGameState(board).over) break;
        const pos = Position.fromBoard(board, current);
        for (const side of [BLUE, RED]) {
          const [sFeat, feats] = evaluateFeatures(pos, side);
          const sEval = evaluatePos(pos, side);
          expect(sFeat).toBeCloseTo(sEval, 6);
          expect(dot(feats), `feature dot mismatch at side=${side}`).toBeCloseTo(sEval, 6);
          checked++;
        }
        const legal = getAllLegalMoves(board, current);
        if (legal.length === 0) break;
        board = makeMove(board, pick(rng, legal));
        current = current === BLUE ? RED : BLUE;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });
});

describe("TestApplyWeights", () => {
  test("round trip preserves eval", () => {
    const board = Board.withPieces([LION, BLUE, 6, 3], [CAT, RED, 0, 0]);
    const before = evaluate(board, BLUE);
    applyWeights({ ...DEFAULT_WEIGHTS });
    const after = evaluate(board, BLUE);
    expect(after).toBeCloseTo(before, 9);
  });

  test("changed weights change eval and restore", () => {
    const board = Board.withPieces([LION, BLUE, 6, 3], [CAT, RED, 0, 0]);
    const baseline = evaluate(board, BLUE);
    try {
      const w = { ...DEFAULT_WEIGHTS, den_threat: 20 };
      applyWeights(w);
      const moved = evaluate(board, BLUE);
      // den-threat feature is 2 on this board -> 2 * (20-8) = 24 swing.
      expect(Math.abs(moved - baseline)).toBeGreaterThan(10);
    } finally {
      resetWeights();
    }
    expect(evaluate(board, BLUE)).toBeCloseTo(baseline, 9);
  });

  test("value weights flow into piece values", () => {
    const w = { ...DEFAULT_WEIGHTS, value_lion: 900 };
    try {
      applyWeights(w);
      expect(PIECE_VALUES[LION]).toBe(900);
    } finally {
      resetWeights();
    }
  });
});
