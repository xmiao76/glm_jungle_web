/**
 * Board renderer for the Jungle UI.
 *
 * Ported from gui/renderer.py - handles all board drawing, terrain, pieces,
 * highlights, animations, and effects.
 */
import {
  BOARD_ROWS,
  BOARD_COLS,
  LAND,
  WATER,
  TRAP_BLUE,
  TRAP_RED,
  DEN_BLUE,
  DEN_RED,
} from "../engine/constants";
import type { Board } from "../engine/board";
import type { Piece } from "../engine/piece";
import type { Move } from "../engine/move";
import { PALETTE, DEN_CHAR, CJK_FONT_STACK } from "./theme";
import { generatePieceSurface } from "./assets";

/** Colors indexed by terrain type. */
const TERRAIN_COLORS: Record<number, string> = {
  [LAND]: PALETTE.LAND,
  [WATER]: PALETTE.WATER,
  [TRAP_BLUE]: PALETTE.TRAP,
  [TRAP_RED]: PALETTE.TRAP_ALT,
  [DEN_BLUE]: PALETTE.DEN_BLUE,
  [DEN_RED]: PALETTE.DEN_RED,
};

/** Piece surfaces cache. */
interface PieceSurfaces {
  normal: Map<string, HTMLCanvasElement>;
  small: Map<string, HTMLCanvasElement>;
}

/** Effect for capture animation. */
interface CaptureEffect {
  row: number;
  col: number;
  pieceType: number;
  owner: number;
  startTime: number;
}

/** Animation state. */
interface AnimationState {
  piece: Piece;
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  startTime: number;
  duration: number;
}

/** Renderer configuration. */
export interface RendererConfig {
  cellSize: number;
  flipped: boolean;
  boardOffsetX: number;
  boardOffsetY: number;
  borderWidth: number;
  statusHeight: number;
  panelWidth: number;
  /** Device pixel ratio of the canvas (drawing is in CSS px under a dpr transform). */
  dpr: number;
}

/** Default renderer configuration. */
export const DEFAULT_RENDERER_CONFIG: RendererConfig = {
  cellSize: 60,
  flipped: false,
  boardOffsetX: 0,
  boardOffsetY: 0,
  borderWidth: 4,
  statusHeight: 50,
  panelWidth: 300,
  dpr: 1,
};

/** Board renderer class. */
export class BoardRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: RendererConfig;
  private pieceSurfaces: PieceSurfaces = {
    normal: new Map(),
    small: new Map(),
  };
  private selectedPos: [number, number] | null = null;
  private legalMoves: Move[] = [];
  private lastMove: { from: [number, number]; to: [number, number] } | null = null;
  private animState: AnimationState | null = null;
  private effects: CaptureEffect[] = [];
  private evalDisplay = 0.5;

  constructor(
    canvas: HTMLCanvasElement,
    config: Partial<RendererConfig> = {}
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get 2D context");
    this.ctx = ctx;

    this.config = { ...DEFAULT_RENDERER_CONFIG, ...config };
    this.centerBoard();
  }

  /** Update configuration. */
  updateConfig(config: Partial<RendererConfig>): void {
    const cellChanged =
      config.cellSize !== undefined && config.cellSize !== this.config.cellSize;
    this.config = { ...this.config, ...config };
    if (cellChanged) {
      // Cached piece surfaces were rendered at the old cell size.
      this.pieceSurfaces.normal.clear();
      this.pieceSurfaces.small.clear();
    }
    this.centerBoard();
  }

  /** Center the board in the available space (CSS pixels). */
  private centerBoard(): void {
    const boardW = BOARD_COLS * this.config.cellSize;
    const boardH = BOARD_ROWS * this.config.cellSize;
    const totalH = boardH + this.config.borderWidth * 2;
    const totalW = boardW + this.config.borderWidth * 2;

    // Canvas size should be set externally; convert device px -> CSS px.
    const availW = this.ctx.canvas.width / this.config.dpr - this.config.panelWidth;
    const availH = this.ctx.canvas.height / this.config.dpr;
    this.config.boardOffsetX = Math.max((availW - totalW) / 2, 0);
    this.config.boardOffsetY = Math.max((availH - totalH) / 2, 0);
  }

  /** Set flip state (view-only coordinate mapping). */
  setFlipped(flipped: boolean): void {
    this.config.flipped = flipped;
  }

  /** Toggle flip state. */
  toggleFlip(): void {
    this.config.flipped = !this.config.flipped;
  }

  /** Map logical (row, col) to display coordinates (involution). */
  private flipRC(row: number, col: number): [number, number] {
    if (this.config.flipped) {
      return [BOARD_ROWS - 1 - row, BOARD_COLS - 1 - col];
    }
    return [row, col];
  }

  /** Convert pixel coordinates to logical board position. */
  pixelToCell(x: number, y: number): [number, number] | null {
    const bx = x - this.config.boardOffsetX - this.config.borderWidth;
    const by = y - this.config.boardOffsetY - this.config.borderWidth;

    if (bx < 0 || by < 0) return null;

    const dc = Math.floor(bx / this.config.cellSize);
    const dr = Math.floor(by / this.config.cellSize);

    if (dr < 0 || dr >= BOARD_ROWS || dc < 0 || dc >= BOARD_COLS) return null;

    return this.flipRC(dr, dc); // involution: display -> logical
  }

  /** Get pixel rectangle for a logical board cell. */
  private cellRect(row: number, col: number): {
    x: number;
    y: number;
    w: number;
    h: number;
    cx: number;
    cy: number;
  } {
    const [dr, dc] = this.flipRC(row, col);
    const x =
      this.config.boardOffsetX +
      this.config.borderWidth +
      dc * this.config.cellSize;
    const y =
      this.config.boardOffsetY +
      this.config.borderWidth +
      dr * this.config.cellSize;
    const w = this.config.cellSize;
    const h = this.config.cellSize;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }

  /** Get board outer rectangle. */
  private boardRect(): { x: number; y: number; w: number; h: number } {
    const bw = this.config.borderWidth;
    const boardW = BOARD_COLS * this.config.cellSize + bw * 2;
    const boardH = BOARD_ROWS * this.config.cellSize + bw * 2;
    return {
      x: this.config.boardOffsetX,
      y: this.config.boardOffsetY,
      w: boardW,
      h: boardH,
    };
  }

  /** Clear canvas and fill background. */
  private clear(): void {
    this.ctx.fillStyle = PALETTE.BG;
    this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }

  /** Draw the border frame: layered rim with a drop shadow under the board. */
  private drawBorder(): void {
    const rect = this.boardRect();
    const radius = 14;
    const ctx = this.ctx;

    // Drop shadow beneath the whole board
    ctx.save();
    ctx.shadowColor = "rgba(5, 7, 11, 0.6)";
    ctx.shadowBlur = Math.max(16, this.config.cellSize / 3);
    ctx.shadowOffsetY = Math.max(4, this.config.cellSize / 16);
    ctx.fillStyle = "#0d1017";
    this.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fill();
    ctx.restore();

    // Tonal mid frame
    const frame = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
    frame.addColorStop(0, "#2b3243");
    frame.addColorStop(0.5, "#232939");
    frame.addColorStop(1, "#1a1f2b");
    ctx.fillStyle = frame;
    this.roundRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4, radius - 2);
    ctx.fill();

    // Inner line + top hairline light
    const bw = this.config.borderWidth;
    const inner = {
      x: rect.x + bw - 1,
      y: rect.y + bw - 1,
      w: rect.w - 2 * bw + 2,
      h: rect.h - 2 * bw + 2,
    };
    ctx.strokeStyle = "#3a4358";
    ctx.lineWidth = 1.5;
    this.roundRect(inner.x, inner.y, inner.w, inner.h, radius - 4);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    this.roundRect(inner.x + 1.5, inner.y + 1.5, inner.w - 3, inner.h - 3, radius - 5);
    ctx.stroke();
  }

  /** Cached per-cellSize terrain overlays (vignettes, water base). */
  private terrainCache = new Map<string, HTMLCanvasElement>();

  private terrainTile(kind: "landEven" | "landOdd" | "waterEven" | "waterOdd"): HTMLCanvasElement {
    const cs = Math.max(8, Math.floor(this.config.cellSize));
    const key = `${kind}:${cs}`;
    const cached = this.terrainCache.get(key);
    if (cached) return cached;

    const c = document.createElement("canvas");
    c.width = cs;
    c.height = cs;
    const g = c.getContext("2d")!;

    if (kind === "landEven" || kind === "landOdd") {
      // Soft light from above, gentle edge darkening (stronger on odd cells)
      const rg = g.createRadialGradient(cs * 0.5, cs * 0.4, cs * 0.15, cs * 0.5, cs * 0.55, cs * 0.78);
      rg.addColorStop(0, "rgba(255,255,235,0.08)");
      rg.addColorStop(0.55, "rgba(0,0,0,0)");
      rg.addColorStop(1, kind === "landOdd" ? "rgba(0,0,0,0.17)" : "rgba(0,0,0,0.10)");
      g.fillStyle = rg;
      g.fillRect(0, 0, cs, cs);
      // Faint grass strokes
      g.strokeStyle = "rgba(0,0,0,0.06)";
      g.lineWidth = 1;
      g.lineCap = "round";
      for (let i = 0; i < 5; i++) {
        const x = cs * (0.15 + 0.18 * i) + ((i * 37) % 5);
        const y = cs * (0.3 + ((i * 53) % 10) / 28);
        g.beginPath();
        g.moveTo(x, y + cs * 0.1);
        g.lineTo(x + cs * 0.02, y);
        g.stroke();
      }
    } else {
      // Water base: vertical depth gradient + darker bed for odd cells
      const wg = g.createLinearGradient(0, 0, 0, cs);
      const light = kind === "waterEven" ? PALETTE.WATER : PALETTE.WATER_ALT;
      wg.addColorStop(0, this.lightenColor(light, 14));
      wg.addColorStop(0.55, light);
      wg.addColorStop(1, this.darkenColor(light, 22));
      g.fillStyle = wg;
      g.fillRect(0, 0, cs, cs);
      // Subtle depth speckles
      g.fillStyle = kind === "waterEven" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.07)";
      for (let i = 0; i < 6; i++) {
        const x = ((i * 71) % 97) / 97 * cs;
        const y = ((i * 43) % 89) / 89 * cs;
        g.beginPath();
        g.arc(x, y, Math.max(1, cs / 60), 0, Math.PI * 2);
        g.fill();
      }
    }

    this.terrainCache.set(key, c);
    return c;
  }

  /** Draw terrain cells. */
  private drawTerrain(board: Board): void {
    const time = performance.now();
    const ticks = time;

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        const terrain = board.getTerrain(row, col);
        const rect = this.cellRect(row, col);

        if (terrain === LAND) {
          const color =
            (row + col) % 2 === 0 ? PALETTE.LAND : PALETTE.LAND_ALT;
          this.ctx.fillStyle = color;
          this.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
          this.ctx.drawImage(
            this.terrainTile((row + col) % 2 === 0 ? "landEven" : "landOdd"),
            rect.x,
            rect.y,
          );
        } else if (terrain === WATER) {
          this.drawWater(rect, row, col, ticks);
        } else if (terrain === TRAP_BLUE || terrain === TRAP_RED) {
          this.drawTrap(rect, terrain);
        } else if (terrain === DEN_BLUE || terrain === DEN_RED) {
          this.drawDen(rect, terrain);
        }
      }
    }
  }

  /** Draw animated water cell over a cached depth-gradient base. */
  private drawWater(
    rect: { x: number; y: number; w: number; h: number },
    row: number,
    col: number,
    ticks: number
  ): void {
    const cs = this.config.cellSize;
    this.ctx.drawImage(
      this.terrainTile((row + col) % 2 === 0 ? "waterEven" : "waterOdd"),
      rect.x,
      rect.y,
    );

    const waveOffset = ticks / 900 + row * 0.5;
    const cs10 = Math.max(cs / 8, 2);

    // Animated waves: bold crest + faint echo line beneath
    for (let wy = 0; wy < 2; wy++) {
      const yPos = rect.y + cs * (0.32 + wy * 0.34);
      this.ctx.strokeStyle = PALETTE.WATER_WAVE;
      this.ctx.lineWidth = Math.max(1, Math.floor(cs / 30));
      this.ctx.lineCap = "round";
      this.ctx.beginPath();
      for (let wx = 0; wx <= cs; wx += cs10) {
        const px = rect.x + wx;
        const py = yPos + Math.sin(waveOffset + wx * 0.07 + wy) * cs * 0.03;
        if (wx === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.stroke();

      this.ctx.strokeStyle = "rgba(255,255,255,0.10)";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      for (let wx = 0; wx <= cs; wx += cs10) {
        const px = rect.x + wx;
        const py = yPos + cs * 0.06 + Math.sin(waveOffset + wx * 0.07 + wy + 0.6) * cs * 0.03;
        if (wx === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.stroke();
    }

    // Moving shimmer highlight sweeping across the river
    const sweep = ((ticks / 2600 + col * 0.35 + row * 0.12) % 1.4) - 0.2; // -0.2..1.2
    if (sweep >= -0.05 && sweep <= 1.05) {
      const sx = rect.x + sweep * cs;
      const shimmer = this.ctx.createLinearGradient(sx - cs * 0.3, 0, sx + cs * 0.3, 0);
      shimmer.addColorStop(0, "rgba(255,255,255,0)");
      shimmer.addColorStop(0.5, "rgba(255,255,255,0.09)");
      shimmer.addColorStop(1, "rgba(255,255,255,0)");
      this.ctx.fillStyle = shimmer;
      this.ctx.fillRect(rect.x, rect.y, cs, cs);
    }
  }

  /** Draw trap cell: carved plate with a beveled X. */
  private drawTrap(rect: { x: number; y: number; w: number; h: number }, terrain: number): void {
    const color = TERRAIN_COLORS[terrain] || PALETTE.LAND;
    const cs = this.config.cellSize;

    // Base with inset (carved) border
    this.ctx.fillStyle = this.darkenColor(color, 10);
    this.ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    this.ctx.strokeStyle = "rgba(0,0,0,0.28)";
    this.ctx.lineWidth = Math.max(2, cs / 26);
    this.ctx.strokeRect(rect.x + 1.5, rect.y + 1.5, rect.w - 3, rect.h - 3);
    this.ctx.strokeStyle = "rgba(255,255,255,0.08)";
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(rect.x + 3, rect.y + 3, rect.w - 6, rect.h - 6);

    const margin = Math.floor(cs * 0.22);
    const lw = Math.max(2, Math.floor(cs / 18));
    const trapColor = this.darkenColor(color, 55);
    const trapLight = this.lightenColor(color, 30);

    // X: dark body with an offset light edge (bevel)
    const strokes: Array<[number, number, number, number]> = [
      [rect.x + margin, rect.y + margin, rect.x + rect.w - margin, rect.y + rect.h - margin],
      [rect.x + rect.w - margin, rect.y + margin, rect.x + margin, rect.y + rect.h - margin],
    ];
    this.ctx.lineCap = "round";
    for (const [x1, y1, x2, y2] of strokes) {
      this.ctx.strokeStyle = trapColor;
      this.ctx.lineWidth = lw;
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();

      this.ctx.strokeStyle = trapLight;
      this.ctx.lineWidth = Math.max(1, lw / 3);
      this.ctx.beginPath();
      this.ctx.moveTo(x1 - lw * 0.18, y1 - lw * 0.18);
      this.ctx.lineTo(x2 - lw * 0.18, y2 - lw * 0.18);
      this.ctx.stroke();
    }

    // Corner rivets
    const rr = Math.max(1.5, cs / 34);
    this.ctx.fillStyle = this.darkenColor(color, 40);
    for (const [rx, ry] of [
      [rect.x + margin * 0.5, rect.y + margin * 0.5],
      [rect.x + rect.w - margin * 0.5, rect.y + margin * 0.5],
      [rect.x + margin * 0.5, rect.y + rect.h - margin * 0.5],
      [rect.x + rect.w - margin * 0.5, rect.y + rect.h - margin * 0.5],
    ]) {
      this.ctx.beginPath();
      this.ctx.arc(rx, ry, rr, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  /** Draw den cell: recessed arch with depth and an engraved label. */
  private drawDen(rect: { x: number; y: number; w: number; h: number }, terrain: number): void {
    const color = TERRAIN_COLORS[terrain] || PALETTE.LAND;
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const cs = this.config.cellSize;

    // Inner pad (soft radial floor)
    const padMargin = Math.max(2, Math.floor(cs / 12));
    const pad = ctx.createRadialGradient(cx, cy - cs * 0.1, cs * 0.1, cx, cy, cs * 0.7);
    pad.addColorStop(0, this.darkenColor(color, 8));
    pad.addColorStop(1, this.darkenColor(color, 26));
    ctx.fillStyle = pad;
    this.roundRect(
      rect.x + padMargin,
      rect.y + padMargin,
      cs - padMargin * 2,
      cs - padMargin * 2,
      cs / 6
    );
    ctx.fill();

    // Arch opening with interior depth gradient
    const archR = Math.floor(cs * 0.28);
    const archCy = cy + cs * 0.08;
    const archDepth = ctx.createRadialGradient(cx, archCy - archR * 0.4, archR * 0.15, cx, archCy, archR);
    archDepth.addColorStop(0, "#05060a");
    archDepth.addColorStop(1, "#12151d");
    ctx.fillStyle = archDepth;
    ctx.beginPath();
    ctx.arc(cx, archCy, archR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - archR, archCy, archR * 2, archR);

    // Glowing owner-colored frame around the arch
    const archFrame = this.lightenColor(color, 55);
    ctx.save();
    ctx.shadowColor = archFrame;
    ctx.shadowBlur = Math.max(4, cs / 10);
    ctx.strokeStyle = archFrame;
    ctx.lineWidth = Math.max(2, Math.floor(cs / 20));
    ctx.beginPath();
    ctx.arc(cx, archCy - archR, archR, 0, Math.PI);
    ctx.stroke();
    ctx.restore();

    // Engraved label
    const label = DEN_CHAR;
    const fontSize = Math.max(cs * (label.length <= 2 ? 0.27 : 0.2), 10);
    ctx.font = `bold ${fontSize}px ${CJK_FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillText(label, cx + 1, cy + cs * 0.3 + 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, cx, cy + cs * 0.3);
  }

  /** Draw highlights (selection, legal moves, last move). */
  private drawHighlights(): void {
    const cs = this.config.cellSize;
    const radius = Math.max(4, Math.floor(cs / 6));

    // Last move
    if (this.lastMove) {
      for (const pos of [this.lastMove.from, this.lastMove.to]) {
        const rect = this.cellRect(pos[0], pos[1]);
        this.ctx.fillStyle = `${PALETTE.LAST_MOVE}28`; // ~16% alpha
        this.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
        this.ctx.fill();

        this.ctx.strokeStyle = `${PALETTE.LAST_MOVE}96`; // ~59% alpha
        this.ctx.lineWidth = 2;
        this.roundRect(rect.x, rect.y, rect.w, rect.h, radius);
        this.ctx.stroke();
      }
    }

    // Selection (gentle pulse)
    if (this.selectedPos) {
      const rect = this.cellRect(this.selectedPos[0], this.selectedPos[1]);
      const inset = Math.max(2, Math.floor(cs / 24));
      const sel = {
        x: rect.x + inset,
        y: rect.y + inset,
        w: rect.w - inset * 2,
        h: rect.h - inset * 2,
      };
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 280);

      // Outer glow (pulsing)
      this.ctx.fillStyle = `${PALETTE.SELECT}${Math.round(0x30 + 0x22 * pulse).toString(16).padStart(2, "0")}`;
      this.roundRect(sel.x, sel.y, sel.w, sel.h, radius + 2);
      this.ctx.fill();

      // Inner ring
      this.ctx.strokeStyle = PALETTE.SELECT;
      this.ctx.lineWidth = 3;
      this.roundRect(sel.x, sel.y, sel.w, sel.h, radius);
      this.ctx.stroke();
    }

    // Legal moves
    for (const move of this.legalMoves) {
      const rect = this.cellRect(move.toRow, move.toCol);
      if (move.isCapture) {
        // Glowing capture ring
        this.ctx.save();
        this.ctx.shadowColor = PALETTE.CAPTURE;
        this.ctx.shadowBlur = Math.max(6, cs / 7);
        this.ctx.strokeStyle = PALETTE.CAPTURE;
        this.ctx.lineWidth = 3.5;
        this.roundRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4, radius);
        this.ctx.stroke();
        this.ctx.restore();

        this.ctx.strokeStyle = "rgba(255,255,255,0.5)";
        this.ctx.lineWidth = 1;
        this.roundRect(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8, radius - 1);
        this.ctx.stroke();
      } else {
        const dr = Math.max(cs / 9, 4);
        const { cx, cy } = rect;

        // Translucent halo
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, dr * 1.9, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(255,255,255,0.16)";
        this.ctx.fill();

        // Dark ring for visibility on grass
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, dr + Math.max(2, Math.floor(cs / 22)), 0, Math.PI * 2);
        this.ctx.fillStyle = "#14181ecb"; // ~79% alpha
        this.ctx.fill();

        // White dot with a top-left glint
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, dr, 0, Math.PI * 2);
        this.ctx.fillStyle = `${PALETTE.LEGAL}eb`; // ~92% alpha
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(cx - dr * 0.25, cy - dr * 0.25, dr * 0.32, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(255,255,255,0.9)";
        this.ctx.fill();
      }
    }
  }

  /** Draw all pieces on the board. */
  private drawPieces(board: Board): void {
    const animPositions = new Set<string>();
    if (this.animState) {
      animPositions.add(`${this.animState.fromRow},${this.animState.fromCol}`);
      animPositions.add(`${this.animState.toRow},${this.animState.toCol}`);
    }

    for (let row = 0; row < BOARD_ROWS; row++) {
      for (let col = 0; col < BOARD_COLS; col++) {
        if (animPositions.has(`${row},${col}`)) continue;
        const piece = board.getPiece(row, col);
        if (piece) {
          this.drawPiece(piece, row, col);
        }
      }
    }

    // Draw animated piece
    if (this.animState) {
      this.drawAnimatedPiece();
    }
  }

  /** Draw a single piece at a board position (ground shadow + lift on selection). */
  private drawPiece(piece: Piece, row: number, col: number): void {
    const key = `${piece.pieceType},${piece.owner}`;
    let surface = this.pieceSurfaces.normal.get(key);

    if (!surface) {
      const size = Math.floor(this.config.cellSize * 0.88);
      surface = generatePieceSurface(piece.pieceType, piece.owner, size);
      this.pieceSurfaces.normal.set(key, surface);
    }

    const rect = this.cellRect(row, col);
    const isSelected =
      this.selectedPos !== null &&
      this.selectedPos[0] === row &&
      this.selectedPos[1] === col;
    const scale = isSelected ? 1.07 : 1;

    // Ground shadow (stronger when lifted)
    this.ctx.beginPath();
    this.ctx.ellipse(
      rect.cx,
      rect.cy + surface.height * 0.42,
      surface.width * 0.36 * scale,
      surface.height * 0.1,
      0,
      0,
      Math.PI * 2,
    );
    this.ctx.fillStyle = isSelected ? "rgba(8, 10, 14, 0.45)" : "rgba(8, 10, 14, 0.32)";
    this.ctx.fill();

    const w = surface.width * scale;
    const h = surface.height * scale;
    this.ctx.drawImage(surface, rect.cx - w / 2, rect.cy - h / 2 - (isSelected ? 2 : 0), w, h);
  }

  /** Draw the animated piece with a small hop arc. */
  private drawAnimatedPiece(): void {
    if (!this.animState) return;

    const { piece, fromRow, fromCol, toRow, toCol, startTime, duration } =
      this.animState;
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / duration, 1.0);
    const easedT = 1 - Math.pow(1 - t, 2); // Ease-out

    const fromRect = this.cellRect(fromRow, fromCol);
    const toRect = this.cellRect(toRow, toCol);

    const x = fromRect.cx + (toRect.cx - fromRect.cx) * easedT;
    const y = fromRect.cy + (toRect.cy - fromRect.cy) * easedT;

    const key = `${piece.pieceType},${piece.owner}`;
    let surface = this.pieceSurfaces.normal.get(key);
    if (!surface) {
      const size = Math.floor(this.config.cellSize * 0.88);
      surface = generatePieceSurface(piece.pieceType, piece.owner, size);
      this.pieceSurfaces.normal.set(key, surface);
    }

    // Hop: scale up mid-flight, shadow separates beneath
    const hop = Math.sin(Math.PI * t);
    const scale = 1 + 0.1 * hop;

    this.ctx.beginPath();
    this.ctx.ellipse(
      x,
      y + surface.height * 0.42,
      surface.width * 0.36,
      surface.height * 0.1,
      0,
      0,
      Math.PI * 2,
    );
    this.ctx.fillStyle = "rgba(8, 10, 14, 0.32)";
    this.ctx.fill();

    const w = surface.width * scale;
    const h = surface.height * scale;
    this.ctx.drawImage(surface, x - w / 2, y - h / 2 - hop * 5, w, h);
  }

  /** Draw capture effects. */
  private drawEffects(): void {
    const now = performance.now();
    const alive: CaptureEffect[] = [];

    for (const fx of this.effects) {
      const t = (now - fx.startTime) / 360;
      if (t >= 1.0) continue;

      alive.push(fx);

      const rect = this.cellRect(fx.row, fx.col);
      const key = `${fx.pieceType},${fx.owner}`;
      let surface = this.pieceSurfaces.normal.get(key);
      if (!surface) {
        const size = Math.floor(this.config.cellSize * 0.88);
        surface = generatePieceSurface(fx.pieceType, fx.owner, size);
        this.pieceSurfaces.normal.set(key, surface);
      }

      // Fade and shrink
      const alpha = 1 - t;
      const scale = 1 - 0.35 * t;
      const scaledSize = Math.max(surface.width * scale, 4);

      this.ctx.save();
      this.ctx.globalAlpha = alpha;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = scaledSize;
      tempCanvas.height = scaledSize;
      const tempCtx = tempCanvas.getContext("2d");
      if (tempCtx) {
        tempCtx.drawImage(surface, 0, 0, scaledSize, scaledSize);
        this.ctx.drawImage(
          tempCanvas,
          rect.cx - scaledSize / 2,
          rect.cy - scaledSize / 2
        );
      }

      this.ctx.restore();

      // Ring ripple
      const ringRadius = rect.w * (0.22 + 0.45 * t);
      this.ctx.beginPath();
      this.ctx.arc(rect.cx, rect.cy, Math.max(ringRadius, 2), 0, Math.PI * 2);
      this.ctx.strokeStyle = `${PALETTE.CAPTURE}${Math.floor(210 * (1 - t))
        .toString(16)
        .padStart(2, "0")}`;
      this.ctx.lineWidth = 3;
      this.ctx.stroke();
    }

    this.effects = alive;
  }

  /** Draw the complete board. */
  drawBoard(board: Board): void {
    this.clear();
    this.drawBorder();
    this.drawTerrain(board);
    this.drawHighlights();
    this.drawPieces(board);
    this.drawEffects();
  }

  /** Set selection position. */
  setSelected(pos: [number, number] | null): void {
    this.selectedPos = pos;
  }

  /** Set legal moves for highlighting. */
  setLegalMoves(moves: Move[]): void {
    this.legalMoves = moves;
  }

  /** Set last move for highlighting. */
  setLastMove(from: [number, number] | null, to: [number, number] | null): void {
    if (from && to) {
      this.lastMove = { from, to };
    } else {
      this.lastMove = null;
    }
  }

  /** Start a move animation. */
  startAnimation(piece: Piece, from: [number, number], to: [number, number], durationMs: number = 180): void {
    this.animState = {
      piece,
      fromRow: from[0],
      fromCol: from[1],
      toRow: to[0],
      toCol: to[1],
      startTime: performance.now(),
      duration: durationMs,
    };
  }

  /** Check if animation is complete. */
  isAnimationDone(): boolean {
    if (!this.animState) return true;
    return performance.now() - this.animState.startTime >= this.animState.duration;
  }

  /** End the current animation. */
  endAnimation(): void {
    this.animState = null;
  }

  /** Add a capture effect. */
  addCaptureEffect(pos: [number, number], pieceType: number, owner: number): void {
    this.effects.push({
      row: pos[0],
      col: pos[1],
      pieceType,
      owner,
      startTime: performance.now(),
    });
  }

  /** Get the current eval display value. */
  getEvalDisplay(): number {
    return this.evalDisplay;
  }

  /** Update the eval display with smooth interpolation. */
  updateEvalDisplay(target: number): void {
    // target is already mapped to [0, 1] range
    this.evalDisplay += (target - this.evalDisplay) * 0.18;
  }

  /** Helper: draw rounded rectangle. */
  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.roundRect(x, y, w, h, r);
  }

  /** Helper: darken a hex color. */
  private darkenColor(hex: string, amount: number): string {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  /** Helper: lighten a hex color. */
  private lightenColor(hex: string, amount: number): string {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }
}
