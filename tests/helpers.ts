/** Shared test helpers: deterministic RNG (mirrors Python's random.Random(seed).choice). */
import { mulberry32 } from "../reference/ai/zobrist";

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  const raw = mulberry32(seed);
  return () => raw() / 4294967296; // normalize to [0, 1)
}

export function randInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function randRange(rng: Rng, lo: number, hiInclusive: number): number {
  return lo + Math.floor(rng() * (hiInclusive - lo + 1));
}
