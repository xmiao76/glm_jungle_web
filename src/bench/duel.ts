/**
 * Cross-language duel orchestrator: plays N games of the TS engine (Node)
 * versus the desktop Python engine at equal time budgets, colors alternating,
 * with parallel single-game child processes.
 *
 * Run:  npm run duel -- --games 40 --time 3 --parallel 4
 */
import { spawn } from "node:child_process";
import * as path from "node:path";

interface GameResult {
  seed: number;
  time: number;
  tsIsBlue: boolean;
  winner: "ts" | "py" | "draw";
  reason: string;
  moves: number;
}

function runGame(seed: number, time: number, tsIsBlue: boolean, python: string): Promise<GameResult> {
  return new Promise((resolve, reject) => {
    const args = [
      "tsx",
      path.join("src", "bench", "duelGame.ts"),
      "--seed",
      String(seed),
      "--time",
      String(time),
      "--tsblue",
      tsIsBlue ? "1" : "0",
      "--python",
      python,
    ];
    const child = spawn("npx", args, { stdio: ["ignore", "pipe", "pipe"], shell: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("close", (code) => {
      const line = out.trim().split("\n").pop();
      if (line) {
        try {
          resolve(JSON.parse(line) as GameResult);
          return;
        } catch {
          /* fall through */
        }
      }
      reject(new Error(`game seed=${seed} failed (exit ${code}): ${err.slice(-400)}`));
    });
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string, dflt: string): string => {
    const i = args.indexOf(flag);
    return i >= 0 ? (args[i + 1] ?? dflt) : dflt;
  };
  const games = Number(get("--games", "10"));
  const time = Number(get("--time", "3"));
  const parallel = Number(get("--parallel", "4"));
  const baseSeed = Number(get("--seed", "5000"));
  const python = get("--python", "python");

  console.log(`Cross-language duel: TS vs Python, ${games} games, ${time}s/move, parallel ${parallel}`);
  const results: GameResult[] = [];
  let launched = 0;
  const workers: Promise<void>[] = [];

  for (let w = 0; w < parallel; w++) {
    workers.push(
      (async () => {
        for (;;) {
          const idx = launched++;
          if (idx >= games) break;
          const seed = baseSeed + idx;
          const tsIsBlue = idx % 2 === 0;
          try {
            const r = await runGame(seed, time, tsIsBlue, python);
            results.push(r);
            console.log(
              `[${results.length}/${games}] seed=${seed} TS=${tsIsBlue ? "Blue" : "Red"} -> ${r.winner.toUpperCase()} (${r.reason}, ${r.moves} moves)`,
            );
          } catch (e) {
            console.error(String(e));
            results.push({ seed, time, tsIsBlue, winner: "draw", reason: "error", moves: 0 });
          }
        }
      })(),
    );
  }
  await Promise.all(workers);

  const tsWins = results.filter((r) => r.winner === "ts").length;
  const pyWins = results.filter((r) => r.winner === "py").length;
  const draws = results.filter((r) => r.winner === "draw").length;
  const score = ((tsWins + draws * 0.5) / games) * 100;
  const avgMoves = results.reduce((a, r) => a + r.moves, 0) / games;
  const reasons: Record<string, number> = {};
  for (const r of results) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;

  console.log("-".repeat(60));
  console.log(`TS wins ${tsWins} | Python wins ${pyWins} | draws ${draws}`);
  console.log(`TS score: ${score.toFixed(1)}%  (gate: >= 65%)`);
  console.log(`avg moves/game: ${avgMoves.toFixed(0)}; endings:`, reasons);
}

void main();
