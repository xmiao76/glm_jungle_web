/**
 * One cross-language duel game: the TS engine (in this process) versus the
 * desktop Python engine (a tools/py_duel_engine.py child process), equal
 * per-move budgets, seeded random opening. Prints a JSON result line.
 *
 * Run:  npx tsx src/bench/duelGame.ts --seed 7 --time 3 --tsblue 1
 */
import { spawn } from "node:child_process";
import { Board } from "../../reference/engine/board";
import { BLUE, RED } from "../../reference/engine/constants";
import { getAllLegalMoves, makeMove, getGameState } from "../../reference/engine/rules";
import { findBestMove } from "../wasm/engine";
import { TranspositionTable } from "../wasm/engine";
import { computeHash, mulberry32 } from "../../reference/ai/zobrist";
import { checkDraw, hashKey, MAX_GAME_MOVES } from "../../reference/engine/draw";

interface PyLine {
  ok?: boolean;
  move?: null;
  fr?: number;
  fc?: number;
  tr?: number;
  tc?: number;
}

function piecesOf(board: Board): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 7; c++) {
      const p = board.getPiece(r, c);
      if (p !== null) out.push([p.pieceType, p.owner, r, c]);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (flag: string, dflt: string): string => {
    const i = args.indexOf(flag);
    return i >= 0 ? (args[i + 1] ?? dflt) : dflt;
  };
  const seed = Number(get("--seed", "1"));
  const time = Number(get("--time", "3"));
  const tsIsBlue = get("--tsblue", "1") === "1";
  const openingPlies = Number(get("--opening", "6"));
  const python = get("--python", "python");
  const pyScript = get("--pyscript", "tools/py_duel_engine.py");

  const py = spawn(python, [pyScript], { stdio: ["pipe", "pipe", "pipe"] });
  py.stderr.on("data", (d) => process.stderr.write(`[py] ${d}`));
  let buf = "";
  const pending: ((line: PyLine) => void)[] = [];
  py.stdout.on("data", (d) => {
    buf += d.toString();
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) pending.shift()?.(JSON.parse(line) as PyLine);
    }
  });
  const send = (obj: unknown): Promise<PyLine> =>
    new Promise((resolve) => {
      pending.push(resolve);
      py.stdin.write(JSON.stringify(obj) + "\n");
    });

  let board = new Board();
  let current = BLUE;
  const counts = new Map<string, number>();
  const recentKeys: { hi: number; lo: number }[] = [];
  const tts = new Map<number, TranspositionTable>();
  let moveCount = 0;
  let plies = 0;
  const rng = mulberry32(seed);
  const result = (winner: "ts" | "py" | "draw", reason: string): never => {
    py.kill();
    process.stdout.write(
      JSON.stringify({ seed, time, tsIsBlue, winner, reason, moves: moveCount }) + "\n",
    );
    process.exit(0);
  };

  try {
    await send({ cmd: "start", pieces: piecesOf(board), side: BLUE });

    for (;;) {
      const state = getGameState(board);
      if (state.over) {
        const tsWon = (state.winner === BLUE) === tsIsBlue;
        result(tsWon ? "ts" : "py", "den-or-capture-all");
      }
      const h = computeHash(board, current);
      const key = hashKey(h);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (checkDraw(counts, key, moveCount)) {
        result("draw", moveCount > MAX_GAME_MOVES ? "draw-cap" : "draw-repetition");
      }

      let move;
      if (plies < openingPlies) {
        const legal = getAllLegalMoves(board, current);
        move = legal[Math.floor((rng() / 4294967296) * legal.length)]!;
      } else if ((current === BLUE) === tsIsBlue) {
        let tt = tts.get(current);
        if (tt === undefined) {
          tt = new TranspositionTable(1 << 21);
          tts.set(current, tt);
        }
        move = findBestMove(board, current, {
          timeLimit: time,
          tt,
          historyKeys: recentKeys.slice(-32),
        }).move;
      } else {
        const reply = await send({ cmd: "go", side: current, time });
        if (reply.move === null || reply.fr === undefined) {
          result("ts", "py-no-moves");
        }
        move = getAllLegalMoves(board, current).find(
          (m) => m.fromRow === reply.fr && m.fromCol === reply.fc && m.toRow === reply.tr && m.toCol === reply.tc,
        );
        if (move === undefined) {
          process.stderr.write(`[duel] python returned illegal move ${JSON.stringify(reply)}\n`);
          result("ts", "py-illegal");
        }
      }
      if (move === null || move === undefined) {
        result((current === BLUE) === tsIsBlue ? "py" : "ts", "no-moves");
      }

      const nextSide = current === BLUE ? RED : BLUE;
      await send({
        cmd: "move",
        fr: move!.fromRow,
        fc: move!.fromCol,
        tr: move!.toRow,
        tc: move!.toCol,
        next_side: nextSide,
      });
      board = makeMove(board, move!);
      recentKeys.push(h);
      current = nextSide;
      if (current === BLUE) moveCount++;
      plies++;
    }
  } catch (e) {
    process.stderr.write(`[duel] fatal: ${e}\n`);
    py.kill();
    process.exit(1);
  }
}

void main();
