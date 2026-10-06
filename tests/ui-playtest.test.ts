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
import { NarratorAlternatives, ALTERNATE_NARRATOR_MODELS } from "../src/app/narrator-alternatives.js";
import { NARRATOR_OUTPUT_TOKENS } from "../src/app/provider-config.js";

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
    private text = ""; className = ""; value = ""; hidden = false; disabled = false; scrollTop = 0; scrollHeight = 42; clientHeight = 42;
    parent?: Element;
    get textContent(): string { return this.text + this.children.map(c => c.textContent).join(""); }
    set textContent(value: string) { this.text = value; this.children = []; }
    children: Element[] = []; handlers = new Map<string, (event: any) => any>();
    append(...children: Element[]) { children.forEach(c => { c.parent = this; }); this.children.push(...children); }
    replaceChildren(...children: Element[]) { this.text = ""; this.children = []; this.append(...children); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
    setAttribute() {}
    addEventListener(name: string, handler: (event: any) => any) { this.handlers.set(name, handler); }
    focus() {}
    requestSubmit() { return this.handlers.get("submit")!({ preventDefault() {} }); }
  }
  const nodes = new Map(["conversation", "composer", "input", "send", "status", "error", "location", "daypart", "household-members", "latest"].map(id => [`#${id}`, new Element()]));
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
  assert.equal(node("conversation").children[0]!.children[1]!.textContent, UI_PLAYTEST_OPENING.replaceAll("*", ""));
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

test("alternate HTTP generation uses the original prepared RPG request without controller, state, trace or history changes", async t => {
  let controllerCalls = 0, alternateCalls = 0, failed = false;
  const captured: import("../src/llm/types.js").GenerationRequest[] = [];
  const comparisons = new NarratorAlternatives(model => ({ generate: async request => {
    alternateCalls++; captured.push(request);
    return { ...await mockNarrator('"Alternate dialogue."').generate(request), model };
  } }));
  const originalRequests: import("../src/llm/types.js").GenerationRequest[] = [];
  const base = mockNarrator('*The auction continues.*\n\n"Look here," a clerk calls.');
  const narrator: NarratorProvider = { ...base, async *stream(request) {
    if (failed) throw new Error("PRIVATE_FAILED_TURN");
    const prepared = { system_prompt: request.system_prompt, messages: request.messages, max_output_tokens: NARRATOR_OUTPUT_TOKENS };
    originalRequests.push(structuredClone(prepared)); comparisons.capture(prepared);
    yield* base.stream(request);
  } };
  const controller = mockController([]), service = new RetrievalService(world);
  const session = createUIPlaytestSession({ world, repository: new FileCampaignRepository(world),
    createCoordinator: hooks => new TurnCoordinator(world, narrator, { propose: async request => { controllerCalls++; return controller.propose(request); } }, { service, search: new HybridSearch(service) }, { narrator_request_setup: hooks.narrator_request_setup!, diagnostics_sink: hooks.diagnostics_sink, provider_retry: false }),
  });
  const server = createPlaytestServer(session, undefined, comparisons);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { await session.shutdown({ discard_unsaved: true }); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const post = (path: string, body: unknown, origin = url) => fetch(`${url}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
  const opening = await (await fetch(`${url}/api/session`)).json();
  assert.equal(opening.messages[0].comparison_id, undefined); assert.equal(opening.alternate_models.length, 6);
  assert.equal((await post("/api/alternative", { message_id: "opening", model: ALTERNATE_NARRATOR_MODELS[0]!.id })).status, 400);
  const first = await (await post("/api/turn", { text: "I watch the auction." })).json(); assert.equal(first.ok, true);
  const id = first.messages[2].comparison_id; assert.equal(typeof id, "string");
  assert.equal(first.messages[1].comparison_id, undefined); assert.equal(first.messages[2].comparison_available, true);
  assert.ok(!JSON.stringify(first).includes("system_prompt"));
  await post("/api/turn", { text: "I keep watching." });
  const before = structuredClone(session.getView()), traces = structuredClone(session.listTurns()), count = controllerCalls;
  assert.equal((await post("/api/alternative", { message_id: id, model: ALTERNATE_NARRATOR_MODELS[5]!.id }, "https://untrusted.example")).status, 403);
  assert.equal((await post("/api/alternative", { message_id: id, model: "arbitrary/model" })).status, 422);
  const result = await (await post("/api/alternative", { message_id: id, model: ALTERNATE_NARRATOR_MODELS[5]!.id })).json(); assert.equal(result.ok, true);
  assert.equal(alternateCalls, 1); assert.deepEqual(captured[0], originalRequests[0]);
  assert.ok(captured[0]!.messages.some(message => message.content === UI_PLAYTEST_OPENING));
  assert.ok(!captured[0]!.messages.some(message => message.content.includes("I keep watching.")));
  assert.deepEqual(session.getView(), before); assert.deepEqual(session.listTurns(), traces); assert.equal(controllerCalls, count);
  const transcript = await (await fetch(`${url}/api/session`)).json();
  assert.equal(transcript.messages[2].text, first.messages[2].text); assert.equal(transcript.messages[2].alternatives.length, 1);
  assert.equal(transcript.messages.length, 5);
  failed = true; const failedTurn = await (await post("/api/turn", { text: "Failed action" })).json(); assert.equal(failedTurn.ok, false); assert.equal(failedTurn.messages.length, 5);
  failed = false; await post("/api/turn", { text: "I continue watching." });
  const next = originalRequests.at(-1)!;
  assert.ok(next.messages.some(message => message.content.includes("Look here,")), "canonical dialogue is retained by the existing dialogue-focused history");
  assert.ok(!next.messages.some(message => message.content.includes("Alternate dialogue")));
});
