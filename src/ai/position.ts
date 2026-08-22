/**
 * Fast search-time position core for the Jungle AI.
 *
 * A flat, integer-coded mirror of the engine's board tuned for search speed:
 * - 63-cell Int8Array grid (0 empty; BLUE codes 1-8, RED codes 9-16) — no
 *   object allocations in the hot path.
 * - Per-side occupied-square lists maintained incrementally by make/undo.
 * - Incremental Zobrist key as dual 32-bit halves.
 * - Moves encoded as ints: fsq | (tsq << 6) | (cap << 12).
 *
 * Rules here mirror engine/rules.ts exactly; tests cross-validate the two
 * implementations by random-playout fuzzing.
 */
import { BOARD_ROWS, BOARD_COLS, BLUE, RED, RAT, LION, TIGER, ELEPHANT } from "../engine/constants";
import type { Board } from "../engine/board";
import { Z_HI, Z_LO, Z_SIDE_HI, Z_SIDE_LO } from "./zobrist";
import {
  SQ,
  PT_OF,
  SIDE_OF,
  VALUE,
  PSTS,
  IS_WATER,
  TRAP_OWNER,
  NEIGH_FLAT,
  NEIGH_CNT,
  JUMP_LAND,
  JUMP_LANE,
  JUMP_WLEN,
  MAX_LEAP_WATER,
  RAT_CODE_BLUE,
  RAT_CODE_RED,
  DEN_SQ_BLUE,
  DEN_SQ_RED,
} from "./tables";

/** Decode helpers for the encoded move int. */
export function mvFrom(mv: number): number {
  return mv & 63;
}
export function mvTo(mv: number): number {
  return (mv >>> 6) & 63;
}
export function mvCap(mv: number): number {
  return mv >>> 12;
}
export function encodeMove(fsq: number, tsq: number, cap: number): number {
  return fsq | (tsq << 6) | (cap << 12);
}

/** Mirror of engine.rules.canCapture on flat codes/squares. */
export function canCaptureFlat(aCode: number, aSq: number, dCode: number, dSq: number): boolean {
  const aPt = PT_OF[aCode]!;
  const dPt = PT_OF[dCode]!;

  if (aPt === ELEPHANT && dPt === RAT) return false;
  if (aPt === RAT && dPt === ELEPHANT) return IS_WATER[aSq]! === 0;
  if (dPt === RAT && IS_WATER[dSq]!) return aPt === RAT && IS_WATER[aSq]! === 1;

  // Effective ranks: a trap zeroes the rank of the opponent of its owner.
  let t = TRAP_OWNER[aSq]!;
  const aRank = t !== 0 && t !== SIDE_OF[aCode]! ? 0 : aPt;
  t = TRAP_OWNER[dSq]!;
  const dRank = t !== 0 && t !== SIDE_OF[dCode]! ? 0 : dPt;
  return aRank >= dRank;
}

// Den squares as module consts (values fixed at table-build time).
const DEN_SQ_BLUE_VAL = DEN_SQ_BLUE;
const DEN_SQ_RED_VAL = DEN_SQ_RED;

export class Position {
  grid = new Int8Array(SQ);
  /** Occupied squares per side (fixed capacity 8), order-preserving remove. */
  blueSq = new Int8Array(8);
  redSq = new Int8Array(8);
  blueCnt = 0;
  redCnt = 0;
  matBlue = 0;
  matRed = 0;
  pstBlue = 0;
  pstRed = 0;
  keyHi = 0;
  keyLo = 0;
  side: number = BLUE;

  /** Build a Position from an engine Board (one 63-cell scan). */
  static fromBoard(board: Board, side: number): Position {
    const pos = new Position();
    const grid = pos.grid;
    let hi = 0;
    let lo = 0;
    for (let r = 0; r < BOARD_ROWS; r++) {
      const base = r * BOARD_COLS;
      for (let c = 0; c < BOARD_COLS; c++) {
        const p = board.getPiece(r, c);
        if (p === null) continue;
        const sq = base + c;
        const code = p.owner === BLUE ? p.pieceType : p.pieceType + 8;
        grid[sq] = code;
        const pstV = PSTS[code * SQ + sq]!;
        if (p.owner === BLUE) {
          pos.blueSq[pos.blueCnt++] = sq;
          pos.matBlue += VALUE[code]!;
          pos.pstBlue += pstV;
        } else {
          pos.redSq[pos.redCnt++] = sq;
          pos.matRed += VALUE[code]!;
          pos.pstRed += pstV;
        }
        const idx = sq * 17 + code;
        hi ^= Z_HI[idx]!;
        lo ^= Z_LO[idx]!;
      }
    }
    if (side === BLUE) {
      hi ^= Z_SIDE_HI;
      lo ^= Z_SIDE_LO;
    }
    pos.keyHi = hi;
    pos.keyLo = lo;
    pos.side = side;
    return pos;
  }

  /** All legal moves for ``side`` as encoded ints (allocates; off hot path). */
  genMoves(side: number): number[] {
    const buf = new Int32Array(80);
    const n = this.genMovesInto(buf, side);
    return Array.from(buf.subarray(0, n));
  }

  /** Fill ``buf`` with legal moves for ``side``; returns the count (hot path). */
  genMovesInto(buf: Int32Array, side: number): number {
    const grid = this.grid;
    let n = 0;
    const ownDen = side === BLUE ? DEN_SQ_BLUE_VAL : DEN_SQ_RED_VAL;
    const squares = side === BLUE ? this.blueSq : this.redSq;
    const cnt = side === BLUE ? this.blueCnt : this.redCnt;
    for (let i = 0; i < cnt; i++) {
      const sq = squares[i]!;
      const code = grid[sq]!;
      const pt = PT_OF[code]!;
      const nc = NEIGH_CNT[sq]!;
      for (let j = 0; j < nc; j++) {
        const nsq = NEIGH_FLAT[sq * 4 + j]!;
        if (nsq === ownDen) continue;
        if (IS_WATER[nsq]! && pt !== RAT) continue;
        const t = grid[nsq]!;
        if (t === 0) {
          buf[n++] = sq | (nsq << 6);
        } else if (SIDE_OF[t]! !== side && canCaptureFlat(code, sq, t, nsq)) {
          buf[n++] = sq | (nsq << 6) | (t << 12);
        }
      }
      if (pt === LION || pt === TIGER) {
        const lands = JUMP_LAND[sq]!;
        const lanes = JUMP_LANE[sq]!;
        const wlens = JUMP_WLEN[sq]!;
        const maxLeap = MAX_LEAP_WATER[pt]!;
        for (let j = 0; j < lands.length; j++) {
          if (wlens[j]! > maxLeap) continue;
          const land = lands[j]!;
          if (land === ownDen) continue;
          const lane = lanes[j]!;
          let blocked = false;
          for (let k = 0; k < lane.length; k++) {
            const s = grid[lane[k]!]!;
            if (s === RAT_CODE_BLUE || s === RAT_CODE_RED) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;
          const t = grid[land]!;
          if (t === 0) {
            buf[n++] = sq | (land << 6);
          } else if (SIDE_OF[t]! !== side && canCaptureFlat(code, sq, t, land)) {
            buf[n++] = sq | (land << 6) | (t << 12);
          }
        }
      }
    }
    return n;
  }

  /** Only captures and enemy-den entries (for quiescence). Allocates. */
  genNoisy(side: number): number[] {
    const buf = new Int32Array(80);
    const n = this.genNoisyInto(buf, side);
    return Array.from(buf.subarray(0, n));
  }

  /** Fill ``buf`` with noisy moves for ``side``; returns the count (hot path). */
  genNoisyInto(buf: Int32Array, side: number): number {
    const grid = this.grid;
    let n = 0;
    const ownDen = side === BLUE ? DEN_SQ_BLUE_VAL : DEN_SQ_RED_VAL;
    const enemyDen = side === BLUE ? DEN_SQ_RED_VAL : DEN_SQ_BLUE_VAL;
    const squares = side === BLUE ? this.blueSq : this.redSq;
    const cnt = side === BLUE ? this.blueCnt : this.redCnt;
    for (let i = 0; i < cnt; i++) {
      const sq = squares[i]!;
      const code = grid[sq]!;
      const pt = PT_OF[code]!;
      const nc = NEIGH_CNT[sq]!;
      for (let j = 0; j < nc; j++) {
        const nsq = NEIGH_FLAT[sq * 4 + j]!;
        if (nsq === ownDen) continue;
        if (IS_WATER[nsq]! && pt !== RAT) continue;
        const t = grid[nsq]!;
        if (t === 0) {
          if (nsq === enemyDen) buf[n++] = sq | (nsq << 6);
        } else if (SIDE_OF[t]! !== side && canCaptureFlat(code, sq, t, nsq)) {
          buf[n++] = sq | (nsq << 6) | (t << 12);
        }
      }
      if (pt === LION || pt === TIGER) {
        const lands = JUMP_LAND[sq]!;
        const lanes = JUMP_LANE[sq]!;
        const wlens = JUMP_WLEN[sq]!;
        const maxLeap = MAX_LEAP_WATER[pt]!;
        for (let j = 0; j < lands.length; j++) {
          if (wlens[j]! > maxLeap) continue;
          const land = lands[j]!;
          if (land === ownDen) continue;
          const lane = lanes[j]!;
          let blocked = false;
          for (let k = 0; k < lane.length; k++) {
            const s = grid[lane[k]!]!;
            if (s === RAT_CODE_BLUE || s === RAT_CODE_RED) {
              blocked = true;
              break;
            }
          }
          if (blocked) continue;
          const t = grid[land]!;
          if (t !== 0 && SIDE_OF[t]! !== side && canCaptureFlat(code, sq, t, land)) {
            buf[n++] = sq | (land << 6) | (t << 12);
          }
        }
      }
    }
    return n;
  }

  /** 0 = ongoing, else BLUE/RED. Mirror of engine.rules.getGameState. */
  winner(): number {
    let c = this.grid[DEN_SQ_RED_VAL]!;
    if (c > 0 && c <= 8) return BLUE; // a BLUE piece sits in Red's den
    c = this.grid[DEN_SQ_BLUE_VAL]!;
    if (c > 8) return RED; // a RED piece sits in Blue's den
    if (this.redCnt === 0) return BLUE;
    if (this.blueCnt === 0) return RED;
    return 0;
  }

  /** Apply a move in place, updating all incremental state. */
  make(mv: number): void {
    const fsq = mv & 63;
    const tsq = (mv >>> 6) & 63;
    const cap = mv >>> 12;
    const grid = this.grid;
    const code = grid[fsq]!;
    grid[fsq] = 0;
    grid[tsq] = code;
    let hi = (this.keyHi ^ Z_HI[fsq * 17 + code]! ^ Z_HI[tsq * 17 + code]! ^ Z_SIDE_HI) | 0;
    let lo = (this.keyLo ^ Z_LO[fsq * 17 + code]! ^ Z_LO[tsq * 17 + code]! ^ Z_SIDE_LO) | 0;
    if (SIDE_OF[code]! === BLUE) {
      const list = this.blueSq;
      for (let i = 0; i < this.blueCnt; i++) {
        if (list[i] === fsq) {
          list[i] = tsq;
          break;
        }
      }
      this.pstBlue += PSTS[code * SQ + tsq]! - PSTS[code * SQ + fsq]!;
      if (cap) {
        const opp = this.redSq;
        for (let i = 0; i < this.redCnt; i++) {
          if (opp[i] === tsq) {
            for (let j = i; j < this.redCnt - 1; j++) opp[j] = opp[j + 1]!;
            break;
          }
        }
        this.redCnt--;
        this.matRed -= VALUE[cap]!;
        this.pstRed -= PSTS[cap * SQ + tsq]!;
        hi ^= Z_HI[tsq * 17 + cap]!;
        lo ^= Z_LO[tsq * 17 + cap]!;
      }
    } else {
      const list = this.redSq;
      for (let i = 0; i < this.redCnt; i++) {
        if (list[i] === fsq) {
          list[i] = tsq;
          break;
        }
      }
      this.pstRed += PSTS[code * SQ + tsq]! - PSTS[code * SQ + fsq]!;
      if (cap) {
        const opp = this.blueSq;
        for (let i = 0; i < this.blueCnt; i++) {
          if (opp[i] === tsq) {
            for (let j = i; j < this.blueCnt - 1; j++) opp[j] = opp[j + 1]!;
            break;
          }
        }
        this.blueCnt--;
        this.matBlue -= VALUE[cap]!;
        this.pstBlue -= PSTS[cap * SQ + tsq]!;
        hi ^= Z_HI[tsq * 17 + cap]!;
        lo ^= Z_LO[tsq * 17 + cap]!;
      }
    }
    this.keyHi = hi;
    this.keyLo = lo;
    this.side = this.side === BLUE ? RED : BLUE;
  }

  /** Reverse a ``make`` exactly (captured piece re-appended at list end). */
  undo(mv: number): void {
    const fsq = mv & 63;
    const tsq = (mv >>> 6) & 63;
    const cap = mv >>> 12;
    const grid = this.grid;
    const code = grid[tsq]!;
    grid[tsq] = cap;
    grid[fsq] = code;
    let hi = (this.keyHi ^ Z_HI[fsq * 17 + code]! ^ Z_HI[tsq * 17 + code]! ^ Z_SIDE_HI) | 0;
    let lo = (this.keyLo ^ Z_LO[fsq * 17 + code]! ^ Z_LO[tsq * 17 + code]! ^ Z_SIDE_LO) | 0;
    if (SIDE_OF[code]! === BLUE) {
      const list = this.blueSq;
      for (let i = 0; i < this.blueCnt; i++) {
        if (list[i] === tsq) {
          list[i] = fsq;
          break;
        }
      }
      this.pstBlue += PSTS[code * SQ + fsq]! - PSTS[code * SQ + tsq]!;
      if (cap) {
        this.redSq[this.redCnt++] = tsq;
        this.matRed += VALUE[cap]!;
        this.pstRed += PSTS[cap * SQ + tsq]!;
        hi ^= Z_HI[tsq * 17 + cap]!;
        lo ^= Z_LO[tsq * 17 + cap]!;
      }
    } else {
      const list = this.redSq;
      for (let i = 0; i < this.redCnt; i++) {
        if (list[i] === tsq) {
          list[i] = fsq;
          break;
        }
      }
      this.pstRed += PSTS[code * SQ + fsq]! - PSTS[code * SQ + tsq]!;
      if (cap) {
        this.blueSq[this.blueCnt++] = tsq;
        this.matBlue += VALUE[cap]!;
        this.pstBlue += PSTS[cap * SQ + tsq]!;
        hi ^= Z_HI[tsq * 17 + cap]!;
        lo ^= Z_LO[tsq * 17 + cap]!;
      }
    }
    this.keyHi = hi;
    this.keyLo = lo;
    this.side = this.side === BLUE ? RED : BLUE;
  }

  /** True if ``mv`` enters the opponent's den (an immediate win). */
  isDenEntry(mv: number, side: number): boolean {
    return mvTo(mv) === (side === BLUE ? DEN_SQ_RED_VAL : DEN_SQ_BLUE_VAL);
  }

  toString(): string {
    const lines: string[] = [];
    for (let r = 0; r < BOARD_ROWS; r++) {
      const cells: string[] = [];
      for (let c = 0; c < BOARD_COLS; c++) {
        const code = this.grid[r * BOARD_COLS + c]!;
        cells.push(code === 0 ? ".." : `${SIDE_OF[code] === BLUE ? "B" : "R"}${code % 8 || 8}`);
      }
      lines.push(cells.join(" "));
    }
    return lines.join("\n");
  }
}
