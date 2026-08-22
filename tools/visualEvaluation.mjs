/**
 * Visual quality evaluation of Jungle web game UI
 * Walks through the entire user flow and captures detailed screenshots
 * for systematic visual defect analysis.
 *
 * Run:  node tools/visualEvaluation.mjs [url]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const url = process.argv[2] ?? "http://localhost:5199";
const resultsDir = "results/visual-eval";
mkdirSync(resultsDir, { recursive: true });

const errors = [];
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(String(err)));

const log = (msg) => console.log(`[EVAL] ${msg}`);
const screenshot = async (name, description) => {
  const path = `${resultsDir}/${name}.png`;
  await page.screenshot({ path });
  log(`Screenshot saved: ${description} → ${path}`);
};

try {
  log("Starting visual evaluation of Jungle web game");
  log("=" .repeat(60));

  // 1. Main Menu
  log("\n[1/6] Loading main menu...");
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await screenshot("01-main-menu", "Main menu with title, subtitle, and game mode buttons");

  // Check main menu elements
  const menuText = await page.textContent("body");
  log(`  - Contains "JUNGLE" title: ${menuText.includes("JUNGLE") || menuText.includes("Jungle")}`);
  log(`  - Contains "Human vs AI": ${menuText.includes("Human vs AI")}`);
  log(`  - Contains difficulty indicator: ${menuText.includes("Difficulty")}`);
  log(`  - Contains "AI vs AI": ${menuText.includes("AI vs AI")}`);

  // 2. First-Mover Menu
  log("\n[2/6] Navigating to first-mover menu...");
  await page.getByText("Human vs AI").first().click();
  await page.waitForTimeout(400);
  await screenshot("02-first-mover-menu", "First-mover selection menu (Blue/Red options)");

  const firstMoverText = await page.textContent("body");
  log(`  - Contains Blue options: ${firstMoverText.includes("Blue")}`);
  log(`  - Contains Red options: ${firstMoverText.includes("Red")}`);
  log(`  - Contains first/second options: ${firstMoverText.includes("first") || firstMoverText.includes("First")}`);

  // 3. Game View (Board + Side Panel)
  log("\n[3/6] Starting game (Blue first)...");
  await page.getByText("Blue - You first").first().click();
  await page.waitForTimeout(600);
  await screenshot("03-game-view-initial", "Initial game view with board and side panel");

  // Check game elements
  const gameText = await page.textContent("body");
  log(`  - Shows turn indicator: ${/Blue|Red|蓝方|红方/.test(gameText || "")}`);
  log(`  - Shows evaluation bar: ${gameText.includes("Eval") || gameText.includes("engine")}`);

  // Get canvas info for precise clicking
  const getCanvasMetrics = () => page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const boardW = Math.min(r.width - 300, r.height * (7 / 9));
    const originX = (r.width - 300 - boardW) / 2;
    const originY = 20;
    const cellW = boardW / 7;
    const cellH = (r.height - 40) / 9;
    return { r, originX, originY, cellW, cellH, boardW };
  });

  // 4. Piece Selection
  log("\n[4/6] Selecting a Blue piece...");
  const metrics = await getCanvasMetrics();
  if (!metrics) {
    log("  ERROR: Could not get canvas metrics");
  } else {
    // Blue is at bottom (flipped), so Blue's rat at logical (2,0) is at display (6,6)
    const dr = 6;
    const dc = 6;
    const selectX = metrics.r.left + metrics.originX + (dc + 0.5) * metrics.cellW;
    const selectY = metrics.r.top + metrics.originY + (dr + 0.5) * metrics.cellH;

    log(`  - Clicking at display coords (${dr}, ${dc}) → screen (${Math.round(selectX)}, ${Math.round(selectY)})`);
    await page.mouse.click(selectX, selectY);
    await page.waitForTimeout(400);
    await screenshot("04-piece-selected", "Blue piece selected with highlights");

    // 5. Making a Move
    log("\n[5/6] Making a move (Rat to water)...");
    // Move rat to logical (2,1) which is water, display (6,5)
    const moveDr = 6;
    const moveDc = 5;
    const moveX = metrics.r.left + metrics.originX + (moveDc + 0.5) * metrics.cellW;
    const moveY = metrics.r.top + metrics.originY + (moveDr + 0.5) * metrics.cellH;

    log(`  - Clicking target at display coords (${moveDr}, ${moveDc}) → screen (${Math.round(moveX)}, ${Math.round(moveY)})`);
    await page.mouse.click(moveX, moveY);

    // Wait for move animation + AI thinking
    log("  - Waiting for AI response (3.5s)...");
    await page.waitForTimeout(3500);
    await screenshot("05-after-ai-move", "Board after AI responded");

    // 6. Game Over Check
    log("\n[6/6] Checking for game over...");
    const finalText = await page.textContent("body");
    const hasGameOver = /\bWins!|\bDraw!/.test(finalText || "");

    if (hasGameOver) {
      await screenshot("06-game-over", "Game over overlay");
      log("  - Game over detected and screenshot captured");
    } else {
      log("  - No game over yet (expected - this was a single move)");
      await screenshot("06-continue-game", "Game continues - another move shown");
    }
  }

  // Final checks
  log("\n" + "=".repeat(60));
  log("Visual Evaluation Complete");
  log("=" .repeat(60));

  const finalStats = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    return {
      canvasWidth: c.width,
      canvasHeight: c.height,
      displayWidth: rect.width,
      displayHeight: rect.height,
      devicePixelRatio: window.devicePixelRatio
    };
  });

  if (finalStats) {
    log(`Canvas metrics:`);
    log(`  - Internal size: ${finalStats.canvasWidth}x${finalStats.canvasHeight}`);
    log(`  - Display size: ${finalStats.displayWidth}x${finalStats.displayHeight}`);
    log(`  - Device pixel ratio: ${finalStats.devicePixelRatio}`);
  }

  log(`\nConsole errors: ${errors.length === 0 ? "none" : errors.slice(0, 3)}`);

  if (errors.length > 0) {
    log("ERRORS DETECTED:");
    errors.slice(0, 5).forEach((e, i) => log(`  ${i + 1}. ${e}`));
  }

  await page.waitForTimeout(1000);
  await browser.close();

  log(`\nAll screenshots saved to: ${resultsDir}/`);
  process.exit(errors.length > 0 ? 1 : 0);

} catch (error) {
  log(`ERROR during evaluation: ${error.message}`);
  console.error(error);
  await browser.close();
  process.exit(1);
}
