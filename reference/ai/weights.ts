/**
 * Evaluation weight schema for the Jungle AI.
 *
 * Every tunable number in the evaluation (material values, PST feature
 * weights, positional term weights, race parameters) lives here as a single
 * flat object. tables.ts builds its PST tables from it and evaluation.ts
 * reads its term weights from it, so applyWeights() can swap the whole
 * evaluation at once (used by the tuning CLI).
 */

export interface Weights {
  // --- Material (piece values) ---
  value_rat: number;
  value_cat: number;
  value_dog: number;
  value_wolf: number;
  value_leopard: number;
  value_tiger: number;
  value_lion: number;
  value_elephant: number;

  // --- PST features (per piece type) ---
  adv_w_rat: number;
  adv_w_cat: number;
  adv_w_dog: number;
  adv_w_wolf: number;
  adv_w_leopard: number;
  adv_w_tiger: number;
  adv_w_lion: number;
  adv_w_elephant: number;

  trap_control_cat: number;
  trap_control_dog: number;
  trap_control_wolf: number;
  trap_control_leopard: number;
  trap_control_tiger: number;
  trap_control_lion: number;

  home_defense_cat: number;
  home_defense_dog: number;

  rat_water: number;
  rat_water_adjacent: number;
  ele_water_adjacent: number;
  center_file: number; // wolf/leopard on columns 2-4

  // --- Positional terms ---
  den_threat: number;
  den_defense: number;
  mobility: number;
  rat_ele: number;
  race_w: number;
  race_max_mat: number;
  pst_phase_max: number;
  trap_danger_near: number;
  trap_danger_safe: number;

  // --- Fixed scale (not tuned) ---
  material_scale: number;
  adv_spread: number;
  max_den_dist: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  value_rat: 200,
  value_cat: 200,
  value_dog: 250,
  value_wolf: 300,
  value_leopard: 400,
  value_tiger: 600,
  value_lion: 700,
  value_elephant: 500,

  adv_w_rat: 2,
  adv_w_cat: 1,
  adv_w_dog: 2,
  adv_w_wolf: 2,
  adv_w_leopard: 3,
  adv_w_tiger: 3,
  adv_w_lion: 3,
  adv_w_elephant: 1,

  trap_control_cat: 4,
  trap_control_dog: 4,
  trap_control_wolf: 4,
  trap_control_leopard: 4,
  trap_control_tiger: 6,
  trap_control_lion: 6,

  home_defense_cat: 4,
  home_defense_dog: 6,

  rat_water: 6,
  rat_water_adjacent: 2,
  ele_water_adjacent: -6,
  center_file: 2,

  den_threat: 8,
  den_defense: 6,
  mobility: 1,
  rat_ele: 80,
  race_w: 25,
  race_max_mat: 3200,
  pst_phase_max: 1.25,
  trap_danger_near: 2.0,
  trap_danger_safe: 1.0,

  material_scale: 10,
  adv_spread: 14,
  max_den_dist: 16,
};

/** Piece-type suffixes for the per-animal weight keys. */
export const ANIMAL_KEYS: Record<number, string> = {
  1: "rat",
  2: "cat",
  3: "dog",
  4: "wolf",
  5: "leopard",
  6: "tiger",
  7: "lion",
  8: "elephant",
};

/** The active weight vector (mutated only via evaluation.applyWeights). */
export const WEIGHTS: Weights = { ...DEFAULT_WEIGHTS };
