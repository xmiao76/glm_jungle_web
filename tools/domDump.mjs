/** Dump the app DOM state for debugging the blank game view. */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:5199";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.getByText("Human vs AI").first().click();
await page.waitForTimeout(300);
await page.getByText("Blue - You first").first().click();
await page.waitForTimeout(1200);

const dump = await page.evaluate(() => {
  const summarize = (el, depth) => {
    const r = el.getBoundingClientRect();
    const s = `${"  ".repeat(depth)}<${el.tagName.toLowerCase()} ${el.id ? "#" + el.id : ""} class="${el.className}" ${r.width | 0}x${r.height | 0}> "${(el.childNodes.length === 1 && el.textContent || "").slice(0, 40)}"`;
    return s;
  };
  const lines = [];
  const walk = (el, depth) => {
    if (depth > 6) return;
    lines.push(summarize(el, depth));
    for (const c of el.children) walk(c, depth + 1);
  };
  walk(document.getElementById("root") || document.body, 0);
  const canvases = [...document.querySelectorAll("canvas")].map((c) => ({
    w: c.width,
    h: c.height,
    rect: c.getBoundingClientRect().toJSON(),
  }));
  return { lines, canvases, bodyText: document.body.textContent.slice(0, 300) };
});
console.log(dump.lines.join("\n"));
console.log("canvases:", JSON.stringify(dump.canvases));
console.log("bodyText:", dump.bodyText);
console.log("errors:", errors);
await browser.close();
