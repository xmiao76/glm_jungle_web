/**
 * Full-game browser test: AI-vs-AI at Easy difficulty from click to game-over
 * overlay. Exercises the worker, controller, animations, draw handling, and
 * win messaging end to end.
 *
 * Run:  node tools/browserFullGame.mjs [url]
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "https://glm-jungle.pages.dev";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

const ok = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) process.exitCode = 1;
};

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// Set difficulty to Easy first (Medium -> Hard -> Easy), then start AI vs AI.
await page.getByText("Difficulty: Medium").first().click();
await page.waitForTimeout(150);
await page.getByText("Difficulty: Hard").first().click();
await page.waitForTimeout(150);
ok("difficulty cycled to Easy", (await page.textContent("body")).includes("Difficulty: Easy"));
await page.getByText("AI vs AI").first().click();
await page.waitForTimeout(300);
await page.getByText("Blue First").first().click();
await page.waitForTimeout(800);

// Poll until the game-over overlay appears (win/draw messaging) or timeout.
const deadline = Date.now() + 6 * 60_000;
let overlay = null;
let lastTurn = "";
while (Date.now() < deadline) {
  const text = (await page.textContent("body")) || "";
  lastTurn = (text.match(/#\d+/) || [""])[0];
  if (/\bWins!|\bDraw!/.test(text)) {
    overlay = text;
    break;
  }
  await page.waitForTimeout(2000);
}
ok("game completed with win/draw overlay", overlay !== null);
if (overlay) {
  console.log("overlay text:", overlay.slice(0, 120).replace(/\s+/g, " "));
  console.log("last turn number seen:", lastTurn);
}
await page.screenshot({ path: "results/shot-fullgame-over.png" });

// Flip hotkey still works on the game-over screen (view-only).
await page.keyboard.press("f");
await page.waitForTimeout(300);
ok("no console errors across the full game", errors.length === 0);
console.log("console errors:", errors.length === 0 ? "none" : errors.slice(0, 5));

await browser.close();
