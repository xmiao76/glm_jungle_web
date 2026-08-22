/**
 * Benchmark the Jungle search: report depth reached and nodes/sec.
 *
 * Run:  npm run bench [-- <seconds>]
 * Mirrors the desktop repo's bench/benchmark.py (same positions) so node
 * throughput can be compared 1:1 against the Python engine.
 */
import { Board } from "../engine/board";
import { BLUE, RED, LION, TIGER, RAT, WOLF, ELEPHANT, DOG } from "../engine/constants";
import { findBestMove } from "../ai/search";
import { TranspositionTable } from "../ai/transposition";

// A few representative positions (identical to bench/benchmark.py).
const POSITIONS: Record<string, () => Board> = {
  starting: () => new Board(),
  midgame: () =>
    Board.withPieces(
      [LION, BLUE, 2, 1],
      [TIGER, BLUE, 2, 2],
      [ELEPHANT, BLUE, 2, 6],
      [RAT, BLUE, 3, 0],
      [DOG, BLUE, 1, 1],
      [LION, RED, 6, 1],
      [TIGER, RED, 6, 2],
      [ELEPHANT, RED, 6, 0],
      [RAT, RED, 5, 6],
      [WOLF, RED, 7, 4],
    ),
  tactical: () =>
    Board.withPieces(
      [TIGER, BLUE, 8, 1],
      [LION, BLUE, 7, 0],
      [WOLF, RED, 8, 0],
      [LION, RED, 6, 3],
    ),
};

function main(): void {
  const timeLimit = Number(process.argv[2] ?? 1.0);
  console.log(`Jungle search benchmark (time_limit=${timeLimit}s per move)`);
  console.log("-".repeat(60));
  console.log(`${"position".padEnd(10)} ${"player".padEnd(7)} ${"depth".padStart(6)} ${"nodes".padStart(12)} ${"nodes/s".padStart(12)}`);
  console.log("-".repeat(60));
  for (const [name, make] of Object.entries(POSITIONS)) {
    for (const [player, label] of [
      [BLUE, "Blue"],
      [RED, "Red"],
    ] as const) {
      const result = findBestMove(make(), player, {
        timeLimit,
        tt: new TranspositionTable(),
      });
      const nps = result.nodes / Math.max(result.elapsedMs / 1000, 1e-6);
      console.log(
        `${name.padEnd(10)} ${label.padEnd(7)} ${String(result.depth).padStart(6)} ${String(result.nodes).padStart(12)} ${Math.round(nps).toString().padStart(12)}`,
      );
    }
  }
}

main();
