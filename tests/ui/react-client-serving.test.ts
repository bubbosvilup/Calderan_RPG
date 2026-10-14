import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { request } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { turnFixture } from "../../src/dev/support/turn-fixture.js";
import { GameSession } from "../../src/app/game-session.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { createPlaytestServer } from "../../src/ui/server.js";

/** Raw GET (no URL normalization), so traversal-shaped paths reach the server exactly as written. */
function get(port: number, path: string): Promise<{ status: number; type: string; cache: string; csp: string; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, method: "GET", headers: { host: `127.0.0.1:${port}` } }, res => {
      let body = ""; res.setEncoding("utf8"); res.on("data", chunk => { body += chunk; });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, type: String(res.headers["content-type"] ?? ""), cache: String(res.headers["cache-control"] ?? ""), csp: String(res.headers["content-security-policy"] ?? ""), body }));
    });
    req.on("error", reject); req.end();
  });
}

async function serve(t: test.TestContext, reactDir: string) {
  const { world, campaign } = turnFixture();
  const root = await mkdtemp(join(tmpdir(), "caldrevan-react-serving-")); t.after(() => rm(root, { recursive: true, force: true }));
  const session = GameSession.fromCampaign({ world, repository: new FileCampaignRepository(world, root), createCoordinator: () => ({ async *runTurn() {} }) }, campaign);
  const server = createPlaytestServer(session, undefined, undefined, undefined, { reactDir }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("missing port");
  return address.port;
}

test("React UI serving: /app serves the built entry (SPA fallback) and hashed assets; the legacy UI stays at /", async t => {
  const dist = await mkdtemp(join(tmpdir(), "caldrevan-react-dist-")); t.after(() => rm(dist, { recursive: true, force: true }));
  await mkdir(join(dist, "assets"));
  await writeFile(join(dist, "index.html"), "<!doctype html><title>REACT_ENTRY</title>");
  await writeFile(join(dist, "assets", "index-AbC_12.js"), "export const REACT_BUNDLE = 1;");
  await writeFile(join(dist, "assets", "index-AbC_12.css"), "body{}");
  await writeFile(join(dist, "secret.txt"), "OUTSIDE_ASSETS");
  const port = await serve(t, dist);

  for (const path of ["/app", "/app/", "/app/play", "/app/play/campaign_20261014_abc123?x=1", "/app/play/inventory", "/app/play/campaign_20261014_abc123/inventory", "/app/play/campaign_20261014_abc123/character/player"]) {
    const page = await get(port, path);
    assert.equal(page.status, 200, path); assert.match(page.type, /^text\/html/); assert.match(page.body, /REACT_ENTRY/, path);
    assert.match(page.csp, /default-src 'self'/, "the same CSP covers the React entry"); assert.equal(page.cache, "no-store");
  }
  const script = await get(port, "/app/assets/index-AbC_12.js");
  assert.equal(script.status, 200); assert.match(script.type, /^text\/javascript/); assert.match(script.body, /REACT_BUNDLE/); assert.match(script.cache, /immutable/);
  assert.match((await get(port, "/app/assets/index-AbC_12.css")).type, /^text\/css/);

  // Only named files of an allowed type inside assets/: no traversal, no dotfiles, no source maps, nothing outside the folder.
  for (const path of ["/app/assets/../secret.txt", "/app/assets/..%2fsecret.txt", "/app/assets/%2e%2e/secret.txt", "/app/assets/.env", "/app/assets/index-AbC_12.js.map", "/app/assets/missing.js", "/app/assets/", "/app/assets/sub/x.js"]) {
    const res = await get(port, path);
    assert.equal(res.status, 404, path); assert.doesNotMatch(res.body, /OUTSIDE_ASSETS|REACT_BUNDLE/, path);
  }
  const legacy = await get(port, "/");
  assert.equal(legacy.status, 200); assert.match(legacy.body, /client\.js/); assert.doesNotMatch(legacy.body, /REACT_ENTRY/);
});

test("React UI serving: without a build, /app explains how to build it instead of failing", async t => {
  const empty = await mkdtemp(join(tmpdir(), "caldrevan-react-empty-")); t.after(() => rm(empty, { recursive: true, force: true }));
  const port = await serve(t, empty);
  const res = await get(port, "/app/play");
  assert.equal(res.status, 404); assert.match(res.body, /npm run ui:build/); assert.match(res.body, /legacy UI is at \//);
  assert.equal((await get(port, "/")).status, 200, "the legacy UI is unaffected");
});
