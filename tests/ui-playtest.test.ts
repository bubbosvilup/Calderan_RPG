import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { once } from "node:events";
import { runInNewContext } from "node:vm";
import { loadWorld } from "../src/world/loader.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { createProductionDeps } from "../src/app/index.js";
import { createUIPlaytestSession, UI_PLAYTEST_OPENING } from "../src/app/ui-playtest.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { mockNarrator, mockController } from "./turn-fixtures.js";
import { NARRATOR_RPG_FORMAT } from "../src/turn/prompt-builder.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";

const world = await loadWorld("data");
function sessionFor(narrator: NarratorProvider) {
  const service = new RetrievalService(world);
  return createUIPlaytestSession({ world, repository: new FileCampaignRepository(world),
    createCoordinator: hooks => new TurnCoordinator(world, narrator, mockController([]), { service, search: new HybridSearch(service) }, { ...(hooks.narrator_request_setup ? { narrator_request_setup: hooks.narrator_request_setup } : {}), diagnostics_sink: hooks.diagnostics_sink, provider_retry: false }),
  });
}

test("V0 starts a disposable canonical Slave Pens session without narrator calls or saves", async () => {
  const deps = await createProductionDeps({ reflection_mode: "off" });
  assert.equal(deps.reflection_provider, undefined);
  const session = createUIPlaytestSession(deps), view = session.getView();
  assert.equal(view.session.campaign_id, "ui_playtest");
  assert.equal(view.scene.location.id, "calderan_slave_market");
  assert.equal(view.scene.time.world_minute, 600);
  assert.equal(view.player.name, "Nicco");
  assert.equal(view.player.gold, 500);
  assert.ok(view.scene.present.some(p => p.id === "bartolomhew"));
  assert.ok(!view.scene.present.some(p => p.id === "nicco"));
  assert.equal(session.listTurns().length, 0);
  assert.equal(view.session.save.state, "unsaved");
  for (const paragraph of UI_PLAYTEST_OPENING.split("\n\n")) {
    assert.ok(paragraph.startsWith("*") && paragraph.endsWith("*"));
    assert.equal(paragraph.split("*").length, 3);
  }
  const words = UI_PLAYTEST_OPENING.split(/\s+/).length;
  assert.ok(words >= 120 && words <= 220);
  await session.shutdown({ discard_unsaved: true });
});

test("HTTP UI uses real GameSession turns: opening, input, busy rejection, finalized transcript and safe failures", async t => {
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  const story = "The auction continues. A clerk attends to the sale papers.";
  const base = mockNarrator(story, request => {
    assert.ok(request.messages.some(m => m.content.includes("I look at the auction.")));
  });
  const narrator: NarratorProvider = { ...base, async *stream(request) {
    calls++;
    assert.equal(request.system_prompt.split(NARRATOR_RPG_FORMAT).length - 1, 1);
    assert.equal(request.messages.filter(m => m.content.includes(NARRATOR_RPG_FORMAT)).length, 0);
    assert.equal(request.messages.some(m => m.role === "assistant" && m.content === UI_PLAYTEST_OPENING), calls === 1);
    if (calls === 1) { entered(); await waiting; }
    if (calls === 2) throw new Error("PRIVATE_PROVIDER_SENTINEL");
    yield* base.stream(request);
  } };
  const session = sessionFor(narrator), server = createPlaytestServer(session);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { release(); await session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const get = async () => (await fetch(`${url}/api/session`)).json();
  const post = (text: string, origin = url) => fetch(`${url}/api/turn`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ text }) });
  const opening = await get(); assert.deepEqual(opening.messages, [{ role: "narrator", text: UI_PLAYTEST_OPENING }]);
  assert.equal((await fetch(url)).status, 200);
  const before = session.getView();
  assert.equal((await post(" ")).status, 400);
  assert.equal((await post("I look at the auction.", "https://untrusted.example")).status, 403);
  const first = post("I look at the auction."); await started;
  assert.equal((await get()).status, "running_turn");
  const overlapping = await post("An overlapping turn."); assert.equal(overlapping.status, 409);
  assert.equal(calls, 1);
  assert.equal((await get()).messages.length, 1, "no draft/player turn is presented as finalized");
  release(); const completed = await (await first).json(); assert.equal(completed.ok, true);
  assert.deepEqual(completed.messages.slice(1), [{ role: "player", text: "I look at the auction." }, { role: "narrator", text: story }]);
  const after = session.getView(); assert.deepEqual(after.scene, before.scene);
  const failedResponse = await post("I look at the auction."); assert.equal(failedResponse.status, 422);
  const failed = await failedResponse.json(); assert.equal(failed.ok, false);
  assert.equal(failed.error.turn_state_changed, false);
  assert.ok(!JSON.stringify(failed).includes("PRIVATE_PROVIDER_SENTINEL"));
  assert.deepEqual(failed.messages, completed.messages);
  assert.deepEqual(session.getView().scene, after.scene);
  assert.equal(session.status, "idle");
  assert.equal((await (await post("I look at the auction.")).json()).ok, true, "failed session can continue");
});

test("browser composer submits once, handles Enter/Shift+Enter, preserves failures and renders final text safely", async () => {
  class Element {
    textContent = ""; className = ""; value = ""; hidden = false; disabled = false; scrollTop = 0; scrollHeight = 42;
    children: Element[] = []; handlers = new Map<string, (event: any) => any>();
    append(...children: Element[]) { this.children.push(...children); }
    addEventListener(name: string, handler: (event: any) => any) { this.handlers.set(name, handler); }
    focus() {}
    requestSubmit() { return this.handlers.get("submit")!({ preventDefault() {} }); }
  }
  const nodes = new Map(["conversation", "composer", "input", "send", "status", "error"].map(id => [`#${id}`, new Element()]));
  const node = (id: string) => nodes.get(`#${id}`)!;
  const opening = { messages: [{ role: "narrator", text: UI_PLAYTEST_OPENING }], status: "idle", configured: true };
  let resolvePost!: (value: unknown) => void, requestBody = "", submits = 0;
  const fetchMock = async (_url: string, options?: { body: string }) => {
    if (!options) return { ok: true, json: async () => opening };
    submits++; requestBody = options.body;
    return new Promise(resolve => { resolvePost = resolve; });
  };
  runInNewContext(await readFile("src/ui/client.js", "utf8"), { document: { querySelector: (id: string) => nodes.get(id), createElement: () => new Element() }, fetch: fetchMock, setTimeout, clearTimeout });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node("conversation").children[0]!.children[1]!.textContent, UI_PLAYTEST_OPENING);
  node("input").value = "  "; await node("composer").requestSubmit(); assert.equal(submits, 0);
  let prevented = false;
  node("input").handlers.get("keydown")!({ key: "Enter", shiftKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, false); assert.equal(submits, 0);
  node("input").value = "I look around.";
  node("input").handlers.get("keydown")!({ key: "Enter", shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(submits, 1); assert.equal(node("input").disabled, true);
  assert.equal(node("status").textContent, "Generating…");
  await node("composer").requestSubmit(); assert.equal(submits, 1);
  assert.deepEqual(JSON.parse(requestBody), { text: "I look around." });
  resolvePost({ json: async () => ({ ok: true, ...opening, messages: [...opening.messages, { role: "player", text: "I look around." }, { role: "narrator", text: "<script>plain story text</script>" }] }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node("input").value, ""); assert.equal(node("input").disabled, false);
  assert.equal(node("conversation").children[2]!.children[1]!.textContent, "<script>plain story text</script>");
  assert.equal(node("conversation").scrollTop, 42);
  node("input").value = "Try again.";
  const failed = node("composer").requestSubmit();
  resolvePost({ json: async () => ({ ok: false, ...opening, messages: [ ...opening.messages, { role: "player", text: "I look around." }, { role: "narrator", text: "<script>plain story text</script>" } ], error: { message: "Provider unavailable.", turn_state_changed: false } }) });
  await failed;
  assert.equal(node("input").value, "Try again."); assert.equal(node("input").disabled, false);
  assert.match(node("error").textContent, /Turn failed\. Your message was not applied\./);
  assert.equal(node("conversation").children.length, 3);
});

test("UI modules do not import engine internals, providers, saves or mutate campaign truth", async () => {
  for (const filename of await readdir("src/ui")) {
    if (!/\.(ts|js)$/.test(filename)) continue;
    const text = await readFile(`src/ui/${filename}`, "utf8");
    assert.ok(!/CampaignState|CampaignSnapshot|TurnCoordinator|\.apply\(|\.exportSnapshot\(|\.prepare\(|OpenRouter|\.\.\/(?:campaign|turn|world|llm|persistence|retrieval)\//.test(text), filename);
  }
});
