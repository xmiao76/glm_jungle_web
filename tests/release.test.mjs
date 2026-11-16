import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { request } from "node:http";
import { serve } from "../tools/serve.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";

test("portable localhost server: WASM MIME, root isolation, methods and missing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "jungle release test "));
  await writeFile(join(root, "index.html"), "<title>Jungle</title>");
  await writeFile(
    join(root, "engine.wasm"),
    Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
  );
  await mkdir(join(root, "folder"));
  const { server, url } = await serve({ root, port: 0, open: false });
  try {
    const page = await fetch(url);
    assert.equal(page.status, 200);
    assert.equal(page.headers.get("cache-control"), "no-store");
    const wasm = await fetch(new URL("engine.wasm", url));
    assert.equal(wasm.headers.get("content-type"), "application/wasm");
    assert.equal((await wasm.arrayBuffer()).byteLength, 8);
    assert.equal((await fetch(new URL("missing.wasm", url))).status, 404);
    assert.equal((await fetch(new URL("folder", url))).status, 404);
    assert.equal((await fetch(url, { method: "POST" })).status, 405);
    const raw = (path) =>
      new Promise((ok, fail) => {
        const r = request(url, { path }, (response) => {
          response.resume();
          ok(response.statusCode);
        });
        r.on("error", fail);
        r.end();
      });
    assert.equal(await raw("/%2e%2e/package.json"), 403);
    assert.equal(await raw("/%E0%A4%A"), 400);
    assert.equal(await raw("/..%5cpackage.json"), 400);
    assert.equal(
      (
        await fetch(new URL("engine.wasm", url), { method: "HEAD" })
      ).headers.get("content-length"),
      "8",
    );
    await assert.rejects(
      () => serve({ root, port: server.address().port, open: false }),
      /occupied/,
    );
  } finally {
    await new Promise((ok) => {
      server.closeAllConnections();
      server.close(ok);
    });
    // Only remove the verified temporary directory created by this test.
    assert.ok(
      resolve(root).startsWith(resolve(tmpdir()) + "\\") ||
        resolve(root).startsWith(resolve(tmpdir()) + "/"),
    );
    await rm(root, { recursive: true, force: true });
  }
});

test("packaging preserves tested bytes and rejects changed output", async () => {
  const root = await mkdtemp(join(tmpdir(), "jungle package test "));
  assert.ok(resolve(root).startsWith(resolve(tmpdir())));
  try {
    await mkdir(join(root, "dist"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ version: "2.0.0" }),
    );
    const bytes = Buffer.from("exact tested bytes");
    await writeFile(join(root, "dist", "index.html"), bytes);
    const manifest = {
      version: "2.0.0",
      assets: {
        "index.html": createHash("sha256").update(bytes).digest("hex"),
      },
    };
    await writeFile(
      join(root, "dist", "manifest.json"),
      JSON.stringify(manifest),
    );
    const run = () =>
      spawnSync(process.execPath, [resolve("tools/release.mjs"), "package"], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
      });
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    const zip = await readFile(join(root, "releases", "jungle-web-v2.0.0.zip"));
    const unpacked = unzipSync(zip);
    assert.deepEqual(
      Buffer.from(unpacked["jungle-web-v2.0.0/index.html"]),
      bytes,
    );
    const checksum = await readFile(
      join(root, "releases", "jungle-web-v2.0.0.zip.sha256"),
      "utf8",
    );
    assert.ok(
      checksum.startsWith(createHash("sha256").update(zip).digest("hex")),
    );
    assert.match(run().stderr, /already exists/);
    await writeFile(join(root, "dist", "index.html"), "changed");
    assert.match(run().stderr, /Built asset changed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
