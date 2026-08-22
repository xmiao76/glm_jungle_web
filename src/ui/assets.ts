/**
 * Asset generation for the Jungle UI.
 *
 * Ported from gui/assets.py - procedural animal piece graphics using Canvas 2D.
 */

import { PIECE_CHARS, CJK_FONT_STACK } from "./theme";

/** Piece type to English name mapping. */
const PIECE_NAMES: Record<number, string> = {
  1: "Rat",
  2: "Cat",
  3: "Dog",
  4: "Wolf",
  5: "Leopard",
  6: "Tiger",
  7: "Lion",
  8: "Elephant",
};

/** Get the label for a piece (CJK character if available, else English name). */
export function pieceLabel(pieceType: number): string {
  return PIECE_CHARS[pieceType] || PIECE_NAMES[pieceType];
}

/**
 * Draw a rat token.
 * Big round ears, pointed snout, long tail.
 */
function drawRat(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
): void {
  const ol = Math.max(2, Math.floor(r / 10)); // outline width
  const dk = darkenColor(color, 60);

  // Body
  const bw = Math.floor(r * 0.55);
  const bh = Math.floor(r * 0.38);
  ctx.fillStyle = color;
  ctx.strokeStyle = dk;
  ctx.lineWidth = ol;
  ctx.beginPath();
  ctx.ellipse(cx, cy - Math.floor(r * 0.05), bw / 2, bh / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Head (snout pointing right)
  const hw = Math.floor(r * 0.35);
  const hh = Math.floor(r * 0.28);
  const hx = cx + Math.floor(r * 0.15);
  const hy = cy - Math.floor(r * 0.18);
  ctx.beginPath();
  ctx.ellipse(hx, hy, hw / 2, hh / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Big round ears
  const earR = Math.floor(r * 0.16);
  // Left ear
  ctx.beginPath();
  ctx.arc(hx - Math.floor(r * 0.08), hy - Math.floor(r * 0.2), earR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx - Math.floor(r * 0.08), hy - Math.floor(r * 0.2), earR / 2, 0, Math.PI * 2);
  ctx.fillStyle = dk;
  ctx.fill();

  // Right ear
  ctx.beginPath();
  ctx.arc(hx + Math.floor(r * 0.12), hy - Math.floor(r * 0.18), earR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx + Math.floor(r * 0.12), hy - Math.floor(r * 0.18), earR / 2, 0, Math.PI * 2);
  ctx.fillStyle = dk;
  ctx.fill();

  // Eye
  ctx.beginPath();
  ctx.arc(
    hx + Math.floor(r * 0.05),
    hy - Math.floor(r * 0.02),
    Math.max(2, Math.floor(r / 14)),
    0,
    Math.PI * 2
  );
  ctx.fillStyle = "#1e1e1e";
  ctx.fill();

  // Nose
  ctx.beginPath();
  ctx.arc(
    hx + Math.floor(r * 0.16),
    hy + Math.floor(r * 0.02),
    Math.max(2, Math.floor(r / 20)),
    0,
    Math.PI * 2
  );
  ctx.fillStyle = "#1e1e1e";
  ctx.fill();

  // Tail
  ctx.strokeStyle = dk;
  ctx.lineWidth = Math.max(2, Math.floor(r / 12));
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - Math.floor(r * 0.28), cy + Math.floor(r * 0.1));
  ctx.lineTo(cx - Math.floor(r * 0.42), cy + Math.floor(r * 0.28));
  ctx.lineTo(cx - Math.floor(r * 0.52), cy + Math.floor(r * 0.12));
  ctx.stroke();
}

/**
 * Draw a cat token.
 * Pointy ears, slit eyes, whiskers.
 */
function drawCat(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
): void {
  const ol = Math.max(2, Math.floor(r / 10));
  const dk = darkenColor(color, 60);

  // Head
  const hr = Math.floor(r * 0.38);
  ctx.beginPath();
  ctx.arc(cx, cy - Math.floor(r * 0.05), hr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = dk;
  ctx.lineWidth = ol;
  ctx.stroke();

  // Pointy ears
  const earH = Math.floor(r * 0.28);
  for (const sign of [-1, 1]) {
    const earX = cx + sign * Math.floor(r * 0.22);
    const earBaseY = cy - Math.floor(r * 0.05) - Math.floor(hr * 0.65);
    ctx.beginPath();
    ctx.moveTo(earX - Math.floor(r * 0.1), earBaseY + Math.floor(r * 0.08));
    ctx.lineTo(earX, earBaseY - earH + Math.floor(r * 0.08));
    ctx.lineTo(earX + Math.floor(r * 0.1), earBaseY + Math.floor(r * 0.08));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = dk;
    ctx.lineWidth = ol;
    ctx.stroke();
  }

  // Eyes (vertical slits)
  for (const sign of [-1, 1]) {
    const ex = cx + sign * Math.floor(r * 0.12);
    const ey = cy - Math.floor(r * 0.08);
    const ew = Math.max(3, Math.floor(r * 0.07));
    const eh = Math.max(5, Math.floor(r * 0.12));

    // Eye background
    ctx.beginPath();
    ctx.ellipse(ex, ey, ew, eh, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#b4dc3c";
    ctx.fill();
    ctx.strokeStyle = dk;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Slit pupil
    ctx.beginPath();
    ctx.moveTo(ex, ey - eh + 1);
    ctx.lineTo(ex, ey + eh - 1);
    ctx.strokeStyle = "#141414";
    ctx.lineWidth = Math.max(2, Math.floor(ew / 2));
    ctx.stroke();
  }

  // Nose
  const noseY = cy + Math.floor(r * 0.06);
  const nw = Math.max(2, Math.floor(r / 16));
  ctx.beginPath();
  ctx.moveTo(cx, noseY - nw);
  ctx.lineTo(cx - nw, noseY + Math.floor(nw / 2));
  ctx.lineTo(cx + nw, noseY + Math.floor(nw / 2));
  ctx.closePath();
  ctx.fillStyle = "#ff9696";
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = "#dcdcdc";
  ctx.lineWidth = Math.max(1, Math.floor(r / 20));
  for (const dy of [-1, 1]) {
    // Left whiskers
    ctx.beginPath();
    ctx.moveTo(cx - Math.floor(r * 0.08), noseY + dy * Math.floor(r * 0.03));
    ctx.lineTo(cx - Math.floor(r * 0.42), noseY + dy * Math.floor(r * 0.1) - Math.floor(r * 0.03));
    ctx.stroke();

    // Right whiskers
    ctx.beginPath();
    ctx.moveTo(cx + Math.floor(r * 0.08), noseY + dy * Math.floor(r * 0.03));
    ctx.lineTo(cx + Math.floor(r * 0.42), noseY + dy * Math.floor(r * 0.1) - Math.floor(r * 0.03));
    ctx.stroke();
  }
}

/**
 * Draw a dog token.
 * Floppy ears, happy face, tongue out.
 */
function drawDog(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
): void {
  const ol = Math.max(2, Math.floor(r / 10));
  const dk = darkenColor(color, 60);
  const snoutColor = lightenColor(color, 40);

  // Head
  const hr = Math.floor(r * 0.36);
  ctx.beginPath();
  ctx.arc(cx, cy - Math.floor(r * 0.05), hr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = dk;
  ctx.lineWidth = ol;
  ctx.stroke();

  // Snout
  const sr = Math.floor(r * 0.18);
  ctx.beginPath();
  ctx.arc(cx, cy + Math.floor(r * 0.08), sr, 0, Math.PI * 2);
  ctx.fillStyle = snoutColor;
  ctx.fill();
  ctx.strokeStyle = dk;
  ctx.stroke();

  // Floppy ears
  const earW = Math.floor(r * 0.18);
  const earH = Math.floor(r * 0.32);
  for (const sign of [-1, 1]) {
    const ex = cx + sign * Math.floor(r * 0.28);
    const ey = cy - Math.floor(r * 0.12);
    ctx.beginPath();
    ctx.ellipse(ex, ey, earW / 2, earH / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = dk;
    ctx.lineWidth = ol;
    ctx.stroke();
  }

  // Eyes
  for (const sign of [-1, 1]) {
    const ex = cx + sign * Math.floor(r * 0.12);
    const ey = cy - Math.floor(r * 0.1);
    const er = Math.max(3, Math.floor(r * 0.08));
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(2, Math.floor(er / 2)), 0, Math.PI * 2);
    ctx.fillStyle = "#1e1e1e";
    ctx.fill();
  }

  // Nose
  const nw = Math.max(3, Math.floor(r * 0.1));
  ctx.beginPath();
  ctx.ellipse(cx, cy + Math.floor(r * 0.02), nw, nw / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#1e1e1e";
  ctx.fill();

  // Tongue
  const tw = Math.max(3, Math.floor(r * 0.07));
  const th = Math.max(4, Math.floor(r * 0.12));
  ctx.beginPath();
  ctx.ellipse(cx, cy + Math.floor(r * 0.14), tw / 2, th / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ff7878";
  ctx.fill();
  ctx.strokeStyle = "#c85050";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Draw a wolf token.
 * Sharp ears, angular face, intense eyes.
 */
function drawWolf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
): void {
  const ol = Math.max(2, Math.floor(r / 10));
  const dk = darkenColor(color, 60);
  const snoutColor = lightenColor(color, 30);

  // Head
  const hr = Math.floor(r * 0.38);
  ctx.beginPath();
  ctx.arc(cx, cy - Math.floor(r * 0.02), hr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = dk;
  ctx.lineWidth = ol;
  ctx.stroke();

  // Snout
  ctx.beginPath();
  ctx.moveTo(cx - Math.floor(r * 0.12), cy + Math.floor(r * 0.08));
  ctx.lineTo(cx + Math.floor(r * 0.12), cy + Math.floor(r * 0.08));
  ctx.lineTo(cx, cy + Math.floor(r * 0.28));
  ctx.closePath();
  ctx.fillStyle = snoutColor;
  ctx.fill();
  ctx.strokeStyle = dk;
  ctx.lineWidth = ol;
  ctx.stroke();

  // Pointed ears
  for (const sign of [-1, 1]) {
    const earX = cx + sign * Math.floor(r * 0.22);
    const earBaseY = cy - Math.floor(r * 0.02) - Math.floor(hr * 0.7);
    ctx.beginPath();
    ctx.moveTo(earX - sign * Math.floor(r * 0.06), earBaseY + Math.floor(r * 0.1));
    ctx.lineTo(earX, earBaseY - Math.floor(r * 0.25));
    ctx.lineTo(earX + sign * Math.floor(r * 0.06), earBaseY + Math.floor(r * 0.1));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = dk;
    ctx.stroke();
  }

  // Eyes
  for (const sign of [-1, 1]) {
    const ex = cx + sign * Math.floor(r * 0.14);
    const ey = cy - Math.floor(r * 0.08);
    const er = Math.max(3, Math.floor(r * 0.07));
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fillStyle = "#ffc832";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(2, Math.floor(er / 2)), 0, Math.PI * 2);
    ctx.fillStyle = "#141414";
    ctx.fill();
  }

  // Nose
  const nw = Math.max(3, Math.floor(r * 0.09));
  ctx.beginPath();
  ctx.ellipse(cx, cy + Math.floor(r * 0.08), nw, nw / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#141414";
  ctx.fill();
}

/**
 * Draw a leopard token.
 * Round face, rosette spots, small ears.
 */
function drawLeopard(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
): void {
  const ol = Math.max(2, Math.floor(r / 10));
  const dk = darkenColor(color, 60);
  const spotRing = darkenColor(color, 50);

  // Head
  const hr = Math.floor(r * 0.4);
  ctx.beginPath();
  ctx.arc(cx, cy - Math.floor(r * 0.02), hr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = dk;
  ctx.lineWidth = ol;
  ctx.stroke();

  // Small round ears
  const earR = Math.floor(r * 0.12);
  for (const sign of [-1, 1]) {
    const earX = cx + sign * Math.floor(r * 0.28);
    const earY = cy - Math.floor(r * 0.02) - Math.floor(hr * 0.7);
    ctx.beginPath();
    ctx.arc(earX, earY, earR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = dk;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(earX, earY, earR / 2, 0, Math.PI * 2);
    ctx.fillStyle = dk;
    ctx.fill();
  }

  // Rosette spots
  const spots = [
    [-0.18, -0.08],
    [0.18, -0.08],
    [-0.1, 0.12],
    [0.1, 0.12],
    [0.0, -0.22],
  ];
  const sr = Math.max(3, Math.floor(r * 0.07));
  for (const [sx, sy] of spots) {
    const px = cx + Math.floor(r * sx);
    const py = cy - Math.floor(r * 0.02) + Math.floor(r * sy);
    ctx.beginPath();
    ctx.arc(px, py, sr, 0, Math.PI * 2);
    ctx.strokeStyle = spotRing;
    ctx.lineWidth = Math.max(1, Math.floor(sr / 3));
    ctx.stroke();
  }

  // Eyes
  for (const sign of [-1, 1]) {
    const ex = cx + sign * Math.floor(r * 0.12);
    const ey = cy - Math.floor(r * 0.08);
    const er = Math.max(3, Math.floor(r * 0.06));
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fillStyle = "#ffdc50";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(2, Math.floor(er / 2)), 0, Math.PI * 2);
    ctx.fillStyle = "#141414";
    ctx.fill();
  }

  // Nose
  const nw = Math.max(2, Math.floor(r / 16));
  ctx.beginPath();
  ctx.moveTo(cx, cy + Math.floor(r * 0.08));
  ctx.lineTo(cx - nw, cy + Math.floor(r * 0.13));
  ctx.lineTo(cx + nw, cy + Math.floor(r * 0.13));
  ctx.closePath();
  ctx.fillStyle = "#1e1e1e";
  ctx.fill();
}

/**
 * Draw a tiger token.
 * Bold stripes, round face, fierce.
 */
function drawTiger(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
): void {
  const ol = Math.max(2, Math.floor(r / 10));
  const dk = darkenColor(color, 70);
  const stripe = darkenColor(color, 80);

  // Head
  const hr = Math.floor(r * 0.42);
  ctx.beginPath();
  ctx.arc(cx, cy - Math.floor(r * 0.02), hr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = dk;
  ctx.lineWidth = ol;
  ctx.stroke();

  // Round ears
  const earR = Math.floor(r * 0.13);
  for (const sign of [-1, 1]) {
    const earX = cx + sign * Math.floor(r * 0.3);
    const earY = cy - Math.floor(r * 0.02) - Math.floor(hr * 0.7);
    ctx.beginPath();
    ctx.arc(earX, earY, earR, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = dk;
    ctx.stroke();

    // Inner pink
    const innerColor = lightenColor(color, 50);
    ctx.beginPath();
    ctx.arc(earX, earY, earR / 2, 0, Math.PI * 2);
    ctx.fillStyle = innerColor;
    ctx.fill();
  }

  // Forehead stripes (three vertical marks)
  const sw = Math.max(2, Math.floor(r / 12));
  ctx.strokeStyle = stripe;
  ctx.lineWidth = sw;
  for (const sx of [-0.1, 0.0, 0.1]) {
    const x = cx + Math.floor(r * sx) - Math.floor(sw / 2);
    ctx.beginPath();
    ctx.moveTo(x, cy - Math.floor(r * 0.2));
    ctx.lineTo(x, cy - Math.floor(r * 0.08));
    ctx.stroke();
  }

  // Cheek stripes
  for (const sign of [-1, 1]) {
    const x1 = cx + sign * Math.floor(r * 0.15);
    const x2 = cx + sign * Math.floor(r * 0.38);
    ctx.beginPath();
    ctx.moveTo(x1, cy);
    ctx.lineTo(x2, cy + Math.floor(r * 0.05));
    ctx.stroke();
  }

  // Eyes
  for (const sign of [-1, 1]) {
    const ex = cx + sign * Math.floor(r * 0.14);
    const ey = cy - Math.floor(r * 0.08);
    const er = Math.max(3, Math.floor(r * 0.07));
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fillStyle = "#ffc832";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(2, Math.floor(er / 2)), 0, Math.PI * 2);
    ctx.fillStyle = "#141414";
    ctx.fill();
  }

  // Nose
  const nw = Math.max(3, Math.floor(r * 0.1));
  ctx.beginPath();
  ctx.ellipse(cx, cy + Math.floor(r * 0.06), nw, nw / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ff8c8c";
  ctx.fill();
  ctx.strokeStyle = dk;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Draw a lion token.
 * Glorious mane, regal face.
 */
function drawLion(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
): void {
  const ol = Math.max(2, Math.floor(r / 10));
  const dk = darkenColor(color, 60);
  const mane = lightenColor(color, 40);
  const maneDark = darkenColor(color, 20);

  // Mane (spiky circle around head)
  const maneR = Math.floor(r * 0.48);
  const maneCy = cy - Math.floor(r * 0.02);

  const numSpikes = 12;
  for (let i = 0; i < numSpikes; i++) {
    const angle = (i * 2 * Math.PI) / numSpikes;
    const a1 = angle - 0.15;
    const a2 = angle;
    const a3 = angle + 0.15;
    const outer = maneR;
    const inner = maneR * 0.6;

    ctx.beginPath();
    ctx.moveTo(
      cx + Math.floor(inner * Math.cos(a1)),
      maneCy + Math.floor(inner * Math.sin(a1))
    );
    ctx.lineTo(
      cx + Math.floor(outer * Math.cos(a2)),
      maneCy + Math.floor(outer * Math.sin(a2))
    );
    ctx.lineTo(
      cx + Math.floor(inner * Math.cos(a3)),
      maneCy + Math.floor(inner * Math.sin(a3))
    );
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? mane : maneDark;
    ctx.fill();
  }

  // Mane circle fill
  ctx.beginPath();
  ctx.arc(cx, maneCy, Math.floor(maneR * 0.55), 0, Math.PI * 2);
  ctx.fillStyle = mane;
  ctx.fill();

  // Head
  const hr = Math.floor(r * 0.26);
  ctx.beginPath();
  ctx.arc(cx, maneCy, hr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = dk;
  ctx.lineWidth = ol;
  ctx.stroke();

  // Ears
  const earR = Math.floor(r * 0.07);
  ctx.beginPath();
  ctx.arc(cx - Math.floor(r * 0.16), maneCy - Math.floor(r * 0.16), earR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + Math.floor(r * 0.16), maneCy - Math.floor(r * 0.16), earR, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Eyes
  for (const sign of [-1, 1]) {
    const ex = cx + sign * Math.floor(r * 0.09);
    const ey = maneCy - Math.floor(r * 0.04);
    const er = Math.max(3, Math.floor(r * 0.06));
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fillStyle = "#c8aa3c";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(2, Math.floor(er / 2)), 0, Math.PI * 2);
    ctx.fillStyle = "#141414";
    ctx.fill();
  }

  // Nose
  const nw = Math.max(3, Math.floor(r * 0.08));
  ctx.beginPath();
  ctx.moveTo(cx, maneCy + Math.floor(r * 0.06));
  ctx.lineTo(cx - nw, maneCy + Math.floor(r * 0.1));
  ctx.lineTo(cx + nw, maneCy + Math.floor(r * 0.1));
  ctx.closePath();
  ctx.fillStyle = "#323232";
  ctx.fill();

  // Mane outline
  ctx.beginPath();
  ctx.arc(cx, maneCy, Math.floor(maneR * 0.55), 0, Math.PI * 2);
  ctx.strokeStyle = dk;
  ctx.lineWidth = ol;
  ctx.stroke();
}

/**
 * Draw an elephant token.
 * Big ears, long trunk, tusks.
 */
function drawElephant(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string
): void {
  const ol = Math.max(2, Math.floor(r / 10));
  const dk = darkenColor(color, 60);
  const light = lightenColor(color, 30);

  // Head
  const hr = Math.floor(r * 0.32);
  ctx.beginPath();
  ctx.arc(cx, cy - Math.floor(r * 0.08), hr, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = dk;
  ctx.lineWidth = ol;
  ctx.stroke();

  // Big ears
  const earW = Math.floor(r * 0.22);
  const earH = Math.floor(r * 0.34);
  for (const sign of [-1, 1]) {
    const ex = cx + sign * Math.floor(r * 0.28);
    const ey = cy - Math.floor(r * 0.04);
    ctx.beginPath();
    ctx.ellipse(ex, ey, earW / 2, earH / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = dk;
    ctx.stroke();

    // Ear inner
    const iw = Math.floor(earW * 0.55);
    const ih = Math.floor(earH * 0.55);
    ctx.beginPath();
    ctx.ellipse(ex, ey, iw / 2, ih / 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = light;
    ctx.fill();
  }

  // Trunk
  const tw = Math.max(4, Math.floor(r * 0.12));
  const trunkTop = cy + Math.floor(r * 0.04);
  ctx.strokeStyle = color;
  ctx.lineWidth = tw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx, trunkTop);
  ctx.lineTo(cx + Math.floor(r * 0.05), trunkTop + Math.floor(r * 0.12));
  ctx.lineTo(cx + Math.floor(r * 0.02), trunkTop + Math.floor(r * 0.24));
  ctx.lineTo(cx - Math.floor(r * 0.06), trunkTop + Math.floor(r * 0.3));
  ctx.stroke();

  ctx.strokeStyle = dk;
  ctx.lineWidth = Math.max(1, Math.floor(tw / 3));
  ctx.stroke();

  // Tusks
  const tuskW = Math.max(2, Math.floor(r / 10));
  const tuskColor = "#ffffe6";
  for (const sign of [-1, 1]) {
    const tx = cx + sign * Math.floor(r * 0.12);
    const ty = cy + Math.floor(r * 0.04);
    ctx.strokeStyle = tuskColor;
    ctx.lineWidth = tuskW;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + sign * Math.floor(r * 0.08), ty + Math.floor(r * 0.15));
    ctx.lineTo(tx + sign * Math.floor(r * 0.04), ty + Math.floor(r * 0.26));
    ctx.stroke();
  }

  // Eyes
  for (const sign of [-1, 1]) {
    const ex = cx + sign * Math.floor(r * 0.12);
    const ey = cy - Math.floor(r * 0.12);
    const er = Math.max(2, Math.floor(r * 0.05));
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex, ey, Math.max(1, Math.floor(er / 2)), 0, Math.PI * 2);
    ctx.fillStyle = "#1e1e1e";
    ctx.fill();
  }
}

/** Animal drawing dispatch table. */
const ANIMAL_DRAWERS: Record<number, typeof drawRat> = {
  1: drawRat,
  2: drawCat,
  3: drawDog,
  4: drawWolf,
  5: drawLeopard,
  6: drawTiger,
  7: drawLion,
  8: drawElephant,
};

/**
 * Generate a piece surface (canvas) for the given piece type and owner.
 *
 * @param pieceType - Piece type (1-8, RAT=1 to ELEPHANT=8)
 * @param owner - Piece owner (1=BLUE, 2=RED)
 * @param size - Size of the canvas (square)
 * @returns Canvas element with the piece drawn on it
 */
export function generatePieceSurface(
  pieceType: number,
  owner: number,
  size: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 4;
  const discCx = cx - 1;
  const discCy = cy - 2;

  // Owner colors
  let darkColor: string;
  let bgColor: string;
  let highlight: string;
  let animalColor: string;

  if (owner === 1) {
    // BLUE
    darkColor = "#1c3482";
    bgColor = "#426ee0";
    highlight = "#96b9ff";
    animalColor = "#e8eeff";
  } else {
    // RED
    darkColor = "#801c1c";
    bgColor = "#d44242";
    highlight = "#ff9696";
    animalColor = "#ffeeee";
  }

  // Clear
  ctx.clearRect(0, 0, size, size);

  // --- Disc with dimensional shading ---
  // Base ring (dark edge)
  ctx.beginPath();
  ctx.arc(discCx, discCy, radius, 0, Math.PI * 2);
  ctx.fillStyle = darkColor;
  ctx.fill();

  // Face of the disc: radial gradient (lit top-left -> base -> shaded bottom)
  const face = ctx.createRadialGradient(
    discCx - radius * 0.3,
    discCy - radius * 0.35,
    radius * 0.1,
    discCx,
    discCy,
    radius * 1.05
  );
  face.addColorStop(0, highlight + "aa"); // strong top-left light
  face.addColorStop(0.25, bgColor);
  face.addColorStop(1, darkColor);
  ctx.beginPath();
  ctx.arc(discCx, discCy, radius - 2, 0, Math.PI * 2);
  ctx.fillStyle = face;
  ctx.fill();

  // Bottom inner shadow (grounds the disc)
  const bottomShade = ctx.createRadialGradient(
    discCx,
    discCy - radius * 0.4,
    radius * 0.4,
    discCx,
    discCy + radius * 0.2,
    radius
  );
  bottomShade.addColorStop(0, "rgba(0,0,0,0)");
  bottomShade.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.beginPath();
  ctx.arc(discCx, discCy, radius - 2, 0, Math.PI * 2);
  ctx.fillStyle = bottomShade;
  ctx.fill();

  // Everything below (animal, band, text) is clipped to the round token.
  ctx.save();
  ctx.beginPath();
  ctx.arc(discCx, discCy, radius - 2, 0, Math.PI * 2);
  ctx.clip();

  // Animal drawing (upper portion)
  const animalCy = discCy - radius * 0.22;
  const animalArea = radius * 0.74;
  const drawer = ANIMAL_DRAWERS[pieceType];
  if (drawer) {
    drawer(ctx, discCx, animalCy, animalArea, animalColor);
  }

  // Soft face shading over the animal area for depth
  const faceLight = ctx.createRadialGradient(
    discCx - radius * 0.35,
    animalCy - radius * 0.3,
    0,
    discCx - radius * 0.35,
    animalCy - radius * 0.3,
    radius * 0.9
  );
  faceLight.addColorStop(0, "rgba(255,255,255,0.14)");
  faceLight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = faceLight;
  ctx.fillRect(discCx - radius, animalCy - radius, radius * 2, radius * 2);

  // Label band: gradient dark -> darker, engraved separation on top
  const bandTop = discCy + radius * 0.12;
  const band = ctx.createLinearGradient(0, bandTop, 0, discCy + radius);
  band.addColorStop(0, darkColor);
  band.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = band;
  ctx.fillRect(discCx - radius, bandTop, radius * 2, radius * 2);

  // Hairline highlight where the band meets the face
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(discCx - radius, bandTop, radius * 2, Math.max(1, size / 90));

  // Label text
  const textCy = discCy + radius * 0.44;
  const label = pieceLabel(pieceType);
  const maxFont = Math.max(size * (label.length <= 4 ? 0.34 : 0.26), 12);

  // Fit text
  let fontSize = maxFont;
  for (let fs = maxFont; fs >= 7; fs--) {
    ctx.font = `bold ${fs}px ${CJK_FONT_STACK}`;
    const metrics = ctx.measureText(label);
    const w = metrics.width;
    const h = fs; // approximate
    const dx = w / 2;
    const top = textCy - h / 2;
    const bottomDy = textCy - discCy + h / 2;
    const limit = radius - Math.max(2, radius / 8);

    if (top >= bandTop && dx * dx + bottomDy * bottomDy <= limit * limit) {
      fontSize = fs;
      break;
    }
  }

  ctx.font = `bold ${fontSize}px ${CJK_FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Engraved text: dark drop beneath, white on top
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillText(label, discCx + 1, textCy + 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, discCx, textCy);

  ctx.restore(); // end circle clip

  // --- Ring finish ---
  ctx.beginPath();
  ctx.arc(discCx, discCy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = darkColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Rim light on the upper-left edge
  ctx.beginPath();
  ctx.arc(discCx, discCy, radius - 3, Math.PI * 0.75, Math.PI * 1.75);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = Math.max(1, size / 80);
  ctx.lineCap = "round";
  ctx.stroke();

  // Inner dark hairline on the lower-right edge (depth)
  ctx.beginPath();
  ctx.arc(discCx, discCy, radius - 3, -Math.PI * 0.25, Math.PI * 0.75);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  return canvas;
}

/**
 * Generate a scaled-down version for the graveyard.
 */
export function generatePieceSurfaceSmall(
  pieceType: number,
  owner: number,
  size: number
): HTMLCanvasElement {
  return generatePieceSurface(pieceType, owner, size);
}

/**
 * Darken a hex color by a given amount.
 */
function darkenColor(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Lighten a hex color by a given amount.
 */
function lightenColor(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
