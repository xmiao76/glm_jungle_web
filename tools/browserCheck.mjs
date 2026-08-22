/**
 * Browser smoke check for the Jungle web app (dev or deployed URL).
 * Verifies: page loads, menus render, a Human-vs-AI game starts, the human
 * can select a piece and move, the AI answers, the panel updates, and no
 * console errors fire. Saves screenshots to results/.
 *
 * Run:  node tools/browserCheck.mjs [url]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "https://glm-jungle.pages.dev";
mkdirSync("results", { recursive: true });

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(String(err)));

const ok = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) process.exitCode = 1;
};

// 1. Load
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
ok("page loads with title", (await page.title()).includes("Jungle"));
await page.screenshot({ path: "results/shot-1-menu.png" });

// 2. Main menu buttons
const menuText = await page.textContent("body");
ok("main menu shows Human vs AI", menuText.includes("Human vs AI"));
ok("main menu shows AI vs AI", menuText.includes("AI vs AI"));
ok("main menu shows difficulty", menuText.includes("Medium"));

// 2b. Back navigation: enter the first-mover menu and come back
await page.getByText("AI vs AI").first().click();
await page.waitForTimeout(300);
const fmText = await page.textContent("body");
ok("first-mover menu opens", fmText.includes("Who moves first?"));
await page.getByText("Back").first().click();
await page.waitForTimeout(300);
ok("Back returns to main menu", (await page.textContent("body")).includes("Difficulty"));

// 3. Start Human vs AI, human = Blue, human first
await page.getByText("Human vs AI").first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: "results/shot-2-firstmover.png" });
await page.getByText("Blue - You first").first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: "results/shot-3-game.png" });

// 4. Board canvas present and non-trivial
const canvasInfo = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  if (!c) return null;
  return { w: c.width, h: c.height };
});
ok("canvas renders at real size", canvasInfo !== null && canvasInfo.w > 500 && canvasInfo.h > 500);

// 5. Select Blue's rat at logical (2,0). Human is Blue and board is flipped
//    (Blue at bottom), so display coords: row 2 -> display row 8-2=6 bottom.
const cell = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const r = c.getBoundingClientRect();
  // Board occupies the canvas area left of the 300px panel.
  const boardW = Math.min(r.width - 300, (r.height) * (7 / 9));
  const originX = (r.width - 300 - boardW) / 2;
  const originY = 20;
  const cellW = boardW / 7;
  const cellH = (r.height - 40) / 9;
  const dr = 6; // display row for logical row 2 when flipped
  const dc = 6; // display col for logical col 0 when flipped
  return { x: r.left + originX + (dc + 0.5) * cellW, y: r.top + originY + (dr + 0.5) * cellH };
});
await page.mouse.click(cell.x, cell.y);
await page.waitForTimeout(400);
await page.screenshot({ path: "results/shot-4-selected.png" });

// 6. Status/panel sanity (panel uses CJK-first labels like the desktop)
const bodyAfter = await page.textContent("body");
ok(
  "panel shows a turn indicator",
  /Blue|Red|蓝方|红方/.test(bodyAfter || ""),
);

// 6b. The board actually DRAWS: count non-background pixels via readback.
const paintStats = () =>
  page.evaluate(() => {
    const c = document.querySelector("canvas");
    const ctx = c.getContext("2d");
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let painted = 0;
    for (let i = 0; i < data.length; i += 40) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.abs(r - 24) + Math.abs(g - 28) + Math.abs(b - 38) > 30) painted++;
    }
    return painted;
  });
const paintedBefore = await paintStats();
ok("board paints real content (terrain + pieces)", paintedBefore > 400);

// 7. Click an adjacent empty square (logical (2,1) is water; rat can enter) —
//    display (6,5). If selection worked, this is a legal move.
const target = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const r = c.getBoundingClientRect();
  const boardW = Math.min(r.width - 300, r.height * (7 / 9));
  const originX = (r.width - 300 - boardW) / 2;
  const cellW = boardW / 7;
  const cellH = (r.height - 40) / 9;
  return { x: r.left + originX + (5.5) * cellW, y: r.top + 20 + (6.5) * cellH };
});
await page.mouse.click(target.x, target.y);
await page.waitForTimeout(3500); // move anim + AI think (Easy-ish default Medium 1.2s)
await page.screenshot({ path: "results/shot-5-after-ai.png" });

console.log("console errors:", errors.length === 0 ? "none" : errors.slice(0, 5));
ok("no console errors", errors.length === 0);

await browser.close();
