"""Duel driver for the desktop Python Jungle engine.

Speaks a line-based JSON protocol on stdin/stdout so the TypeScript duel
orchestrator can play games against this engine with equal time budgets.
The driver keeps the authoritative Python-side board, its own repetition
history, and a per-side transposition table across moves.

Protocol (one JSON object per line):
  -> {"cmd": "start", "pieces": [[pt, owner, r, c], ...], "side": 1|2}
  <- {"ok": true}
  -> {"cmd": "move", "fr": r, "fc": c, "tr": r, "tc": c, "next_side": 1|2}
  <- {"ok": true}
  -> {"cmd": "go", "side": 1|2, "time": 3.0}
  <- {"fr": r, "fc": c, "tr": r, "tc": c}   or   {"move": null}

Run:  python tools/py_duel_engine.py
"""
import json
import sys

sys.path.insert(0, r"c:\GitHub\glm.z_cc_jungle")

from engine.board import Board  # noqa: E402
from engine.piece import Piece  # noqa: E402
from engine.move import Move  # noqa: E402
from engine.constants import TERRAIN_MAP, BOARD_COLS, BOARD_ROWS  # noqa: E402
from engine.rules import make_move  # noqa: E402
from ai.search import find_best_move  # noqa: E402
from ai.transposition import TranspositionTable, compute_hash  # noqa: E402

TT_SIZE = 250_000
HISTORY_WINDOW = 32

board = None
tts = {}
history = []


def make_board(pieces):
    b = Board.__new__(Board)
    b._terrain = TERRAIN_MAP
    b._grid = [[None] * BOARD_COLS for _ in range(BOARD_ROWS)]
    for pt, owner, r, c in pieces:
        b._grid[r][c] = Piece(pt, owner, r, c)
    return b


def send(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    msg = json.loads(line)
    cmd = msg["cmd"]

    if cmd == "start":
        board = make_board(msg["pieces"])
        tts = {}
        history = [compute_hash(board, msg.get("side", 1))]
        send({"ok": True})

    elif cmd == "move":
        target = board.get_piece(msg["tr"], msg["tc"])
        if target is not None:
            mv = Move(msg["fr"], msg["fc"], msg["tr"], msg["tc"],
                      target.piece_type, target.owner, target.row, target.col)
        else:
            mv = Move(msg["fr"], msg["fc"], msg["tr"], msg["tc"])
        board = make_move(board, mv)
        history.append(compute_hash(board, msg["next_side"]))
        send({"ok": True})

    elif cmd == "go":
        side = msg["side"]
        tt = tts.get(side)
        if tt is None:
            tt = TranspositionTable(max_size=TT_SIZE)
            tts[side] = tt
        mv = find_best_move(board, side, time_limit=msg["time"], tt=tt,
                            history_keys=history[-HISTORY_WINDOW:])
        if mv is None:
            send({"move": None})
        else:
            send({"fr": mv.from_row, "fc": mv.from_col,
                  "tr": mv.to_row, "tc": mv.to_col})

    elif cmd == "quit":
        break
