import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, firefox } from "playwright";
import { serve } from "./serve.mjs";

export async function checkBrowser({
  full = false,
  browserName = "chromium",
  root = "dist",
  url,
} = {}) {
  const local = url ? null : await serve({ root, port: 0, open: false });
  url ??= local.url;
  const browser = await { chromium, firefox }[browserName].launch();
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const errors = [];
  const requested = new Set();
  let page;
  try {
    // Prove the local package does not rely on any remote assets or services.
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === new URL(url).origin
        ? route.continue()
        : route.abort(),
    );
    page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("request", (r) => requested.add(r.url()));
    await page.goto(url);
    await page
      .getByRole("button", { name: "Human vs AI", exact: true })
      .waitFor();
    await mkdir("results", { recursive: true });
    await page.screenshot({ path: `results/wasm-${browserName}-menu.png` });
    await page
      .getByRole("button", { name: "How to play", exact: true })
      .click();
    assert.match(
      await page.locator(".rules-panel").innerText(),
      /Lion jumps up to 3/,
    );
    await page
      .getByRole("button", { name: "Hide How to play", exact: true })
      .click();
    async function difficulty(want) {
      for (let i = 0; i < 3; i++) {
        const b = page.getByRole("button", { name: /^Difficulty:/ });
        if ((await b.innerText()) === `Difficulty: ${want}`) return;
        await b.click();
      }
      throw Error("Difficulty cycle failed");
    }
    async function square(row, col) {
      const point = await page.locator("canvas").evaluate(
        (c, { row, col }) => {
          const b = c.getBoundingClientRect(),
            s = Number(c.dataset.cellSize),
            flipped = c.dataset.flipped === "true";
          return {
            x:
              b.x +
              Number(c.dataset.originX) +
              (flipped ? 6 - col : col) * s +
              s / 2,
            y:
              b.y +
              Number(c.dataset.originY) +
              (flipped ? 8 - row : row) * s +
              s / 2,
          };
        },
        { row, col },
      );
      await page.mouse.click(point.x, point.y);
    }
    async function idle(minMoves) {
      await page.waitForFunction(
        (n) => {
          const g = document.querySelector("main.game");
          return (
            g?.dataset.state === "playing" && Number(g.dataset.moveCount) >= n
          );
        },
        minMoves,
        { timeout: 20000 },
      );
    }
    for (const level of ["Easy", "Medium", "Hard"]) {
      await difficulty(level);
      for (const choice of [
        "Blue - You first",
        "Blue - AI first",
        "Red - You first",
        "Red - AI first",
      ]) {
        await page
          .getByRole("button", { name: "Human vs AI", exact: true })
          .click();
        await page.getByRole("button", { name: choice, exact: true }).click();
        const aiFirst = choice.includes("AI first"),
          blue = choice.startsWith("Blue");
        await idle(aiFirst ? 1 : 0);
        await square(blue ? 2 : 6, blue ? 0 : 6);
        await square(blue ? 3 : 5, blue ? 0 : 6);
        await idle(aiFirst ? 3 : 2);
        assert.match(
          await page.locator(".engine-card").innerText(),
          /Depth [1-9]/,
        );
        assert.equal(await page.locator("[role=alert]").count(), 0);
        if (level === "Easy" && choice === "Blue - You first") {
          await page.screenshot({
            path: `results/wasm-${browserName}-game.png`,
          });
          const before = await page
            .locator("canvas")
            .getAttribute("data-flipped");
          await page.keyboard.press("f");
          await page.waitForFunction(
            (old) => document.querySelector("canvas").dataset.flipped !== old,
            before,
          );
          const body = await page
            .locator("main.game")
            .getAttribute("data-move-count");
          assert.equal(body, "2");
          await page.keyboard.press("f");
          const sound = await page
            .getByRole("button", { name: /Sound:/ })
            .innerText();
          await page.keyboard.press("m");
          // Yew schedules the DOM update after the keyboard event returns.
          await page
            .getByRole("button", {
              name: sound === "Sound: On" ? "Sound: Off" : "Sound: On",
              exact: true,
            })
            .waitFor();
          await page.setViewportSize({ width: 1100, height: 760 });
          await page.waitForTimeout(100);
          assert.ok((await page.locator("canvas").boundingBox()).width > 500);
          await page.setViewportSize({ width: 1400, height: 900 });
        }
        await page
          .getByRole("button", { name: "Undo (U)", exact: true })
          .click();
        await idle(aiFirst ? 1 : 0);
        assert.equal(
          await page.locator("main.game").getAttribute("data-move-count"),
          String(aiFirst ? 1 : 0),
        );
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "Human vs AI", exact: true })
          .waitFor();
      }
      console.log(
        `PASS ${browserName}: ${level}, all color/first-mover choices, moves and undo`,
      );
    }
    // Cancel an active search and make sure no stale result changes the menu.
    await page
      .getByRole("button", { name: "Human vs AI", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Blue - AI first", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("main.game")?.dataset.state === "thinking",
    );
    await page.keyboard.press("Escape");
    await page.waitForTimeout(3200);
    assert.equal(await page.locator(".game-over-card").count(), 0);
    assert.equal(await page.locator("main.menu").count(), 1);
    assert.ok([...requested].some((u) => /app_bg.*\.wasm/.test(u)));
    assert.ok([...requested].some((u) => /worker_bg.*\.wasm/.test(u)));
    if (full) {
      await difficulty("Easy");
      await page.getByRole("button", { name: "AI vs AI", exact: true }).click();
      await page
        .getByRole("button", { name: "Red First", exact: true })
        .click();
      await page.locator(".game-over-card").waitFor({ timeout: 600000 });
      assert.match(
        await page.locator(".game-over-card").innerText(),
        /Wins!|Draw!/,
      );
      await page.screenshot({
        path: `results/wasm-${browserName}-fullgame.png`,
      });
      console.log(
        `PASS ${browserName}: full AI game (${await page.locator("main.game").getAttribute("data-move-count")} plies)`,
      );
      await page.locator(".game-over-card").click();
      await page.waitForFunction(
        () =>
          Number(document.querySelector("main.game")?.dataset.moveCount) >= 2,
      );
      await page.keyboard.press("Escape");
    }
    assert.deepEqual(errors, [], "Unexpected browser errors");
    // Failure cases intentionally cause fetch errors, on a separate page.
    const failed = await context.newPage();
    await failed.route("**/*worker_bg*.wasm", (r) => r.abort());
    await failed.goto(url);
    await failed
      .getByRole("button", { name: "Human vs AI", exact: true })
      .click();
    await failed
      .getByRole("button", { name: "Blue - AI first", exact: true })
      .click();
    await failed.getByRole("alert").waitFor();
    assert.equal(await failed.locator(".game-over-card").count(), 0);
    await failed.unroute("**/*worker_bg*.wasm");
    await failed
      .getByRole("button", { name: "Retry engine", exact: true })
      .click();
    await failed.waitForFunction(
      () => Number(document.querySelector("main.game")?.dataset.moveCount) >= 1,
    );
    assert.equal(await failed.getByRole("alert").count(), 0);
    await failed.close();
    const missing = await context.newPage();
    await missing.route("**/*app_bg*.wasm", (r) => r.abort());
    await missing.goto(url);
    await missing
      .getByRole("heading", { name: "Jungle could not start" })
      .waitFor();
    await missing.unroute("**/*app_bg*.wasm");
    await missing.getByRole("button", { name: "Retry", exact: true }).click();
    await missing
      .getByRole("button", { name: "Human vs AI", exact: true })
      .waitFor();
    await missing.close();
    const corrupt = await context.newPage();
    await corrupt.route("**/*app_bg*.wasm", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/wasm",
        body: Buffer.from("invalid wasm"),
      }),
    );
    await corrupt.goto(url);
    await corrupt
      .getByRole("heading", { name: "Jungle could not start" })
      .waitFor();
    await corrupt.close();
    console.log(
      `PASS ${browserName}: cancellation, offline assets, missing/corrupt WASM and retry`,
    );
  } finally {
    await browser.close();
    if (local)
      await new Promise((ok) => {
        local.server.closeAllConnections();
        local.server.close(ok);
      });
  }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/browserSuite.mjs"))
  await checkBrowser({
    full: process.argv.includes("--full"),
    browserName: process.argv.includes("--firefox") ? "firefox" : "chromium",
    root: process.env.JUNGLE_TEST_ROOT ?? "dist",
    url: process.argv.find((v) => /^https?:/.test(v)),
  });
