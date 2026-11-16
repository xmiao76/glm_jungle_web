// Standalone release launcher. Requires only Node.js 22+; no npm packages.
import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import {
  resolve,
  relative,
  extname,
  dirname,
  isAbsolute,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";

export async function serve({ root, port = 4173, open = true } = {}) {
  root = await realpath(
    resolve(root ?? dirname(fileURLToPath(import.meta.url))),
  );
  await stat(resolve(root, "index.html")).catch(() => {
    throw Error(
      `No built game in ${root}. Run npm run build or extract the complete release ZIP.`,
    );
  });
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw Error("Port must be an integer from 0 to 65535");
  const mime = {
    ".wasm": "application/wasm",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
  };
  const inside = (path) => {
    const r = relative(root, path);
    return !isAbsolute(r) && r !== ".." && !r.startsWith(`..${sep}`);
  };
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      let path = decodeURIComponent((req.url ?? "/").split("?")[0]);
      if (path.includes("\0") || path.includes("\\")) {
        res.writeHead(400).end("Invalid path");
        return;
      }
      const target = resolve(root, "." + (path === "/" ? "/index.html" : path));
      if (!inside(target)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      const actual = await realpath(target);
      if (!inside(actual)) {
        res.writeHead(403).end("Forbidden");
        return;
      }
      if (!(await stat(actual)).isFile()) {
        res.writeHead(404).end("Not found");
        return;
      }
      const data = await readFile(actual);
      res.writeHead(200, {
        "Content-Type": mime[extname(actual)] ?? "application/octet-stream",
        "Content-Length": data.length,
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) {
      res.writeHead(error instanceof URIError ? 400 : 404).end("Not found");
    }
  });
  await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", ok);
  }).catch((error) => {
    if (error.code === "EADDRINUSE")
      throw Error(
        `Port ${port} is occupied. Use --port 4174 (or another available port).`,
      );
    throw error;
  });
  const url = `http://127.0.0.1:${server.address().port}/`;
  if (open) {
    const [cmd, args] =
      process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : process.platform === "darwin"
          ? ["open", [url]]
          : ["xdg-open", [url]];
    const child = spawn(cmd, args, { stdio: "ignore", windowsHide: true });
    child.on("error", () => console.log(`Open ${url} in your browser.`));
    child.unref();
  }
  return { server, url };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (Number(process.versions.node.split(".")[0]) < 22)
      throw Error("Node.js 22 or newer is required.");
    const { values } = parseArgs({
      options: {
        root: { type: "string" },
        port: { type: "string" },
        "no-open": { type: "boolean" },
      },
    });
    const { server, url } = await serve({
      root: values.root,
      port: values.port === undefined ? 4173 : Number(values.port),
      open: !values["no-open"],
    });
    console.log(
      `Jungle is ready at ${url}\nPress Ctrl+C to stop the local launcher.`,
    );
    process.on("SIGINT", () => server.close(() => process.exit(0)));
    process.on("SIGTERM", () => server.close(() => process.exit(0)));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
