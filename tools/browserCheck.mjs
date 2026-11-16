import { checkBrowser } from "./browserSuite.mjs";
await checkBrowser({
  full: false,
  browserName: process.argv.includes("--firefox") ? "firefox" : "chromium",
  root: process.env.JUNGLE_TEST_ROOT ?? "dist",
  url: process.argv.find((v) => /^https?:/.test(v)),
});
