import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { createPlaytestServer } from "../src/ui/server.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { countingController, sessionWith, stepNarrator } from "./block4-fixtures.js";

/**
 * Consolidation block 5A, phase 3: the generic confirmation card. The client renders only the masked projection it is given (an opaque ref, display
 * strings) and its Confirm / Cancel requests carry ONLY that ref and the revision it rendered. Offline: a minimal DOM stand-in and a real local server.
 */
class Element {
  private text = "";
  id = ""; className = ""; value = ""; hidden = false; disabled = false; type = ""; scrollTop = 0; scrollHeight = 100; clientHeight = 100;
  parent?: Element; children: Element[] = []; dataset: Record<string, string> = {};
  attributes = new Map<string, string>(); handlers = new Map<string, (event: any) => any>();
  get textContent(): string { return this.text + this.children.map(c => c.textContent).join(""); }
  set textContent(value: string) { this.text = value; this.children = []; }
  append(...children: Element[]) { children.forEach(c => { c.parent = this; }); this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.text = ""; this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name); }
  addEventListener(name: string, handler: (event: any) => any) { this.handlers.set(name, handler); }
  focus() {}
  requestSubmit() { return this.handlers.get("submit")?.({ preventDefault() {} }); }
  classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  all(): Element[] { return [this, ...this.children.flatMap(c => c.all())]; }
  byClass(name: string): Element[] { return this.all().filter(e => e.className.split(/\s+/).includes(name)); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const REF = "b".repeat(24);
const opening = { messages: [{ role: "narrator", text: "*An ordinary morning.*" }], status: "idle", configured: true, revision: 7, scene: { location: "Slave Market", time_of_day: "Late Morning" }, household: [] };
const card = (extra: Record<string, unknown> = {}) => ({ ref: REF, kind: "manumission", created_revision: 7, title: "Free Maren?", subject_label: "Maren", confirm_label: "Free Maren", cancel_label: "Keep as is",
  body: "Nicco's words describe freeing Maren. Nothing has changed yet.", ...extra });
async function client(fetchMock: (url: string, options?: any) => any) {
  const nodes = new Map<string, Element>();
  const node = (selector: string): Element => {
    if (selector === "#confirmation-region") return nodes.get("#conversation")?.all().find(e => e.id === "confirmation-region") as Element;
    if (selector === "#trade-region") return nodes.get("#conversation")?.all().find(e => e.id === "trade-region") as Element;
    let e = nodes.get(selector); if (!e) { e = new Element(); e.id = selector.replace(/^#/, ""); nodes.set(selector, e); } return e;
  };
  const context: any = { document: { querySelector: node, querySelectorAll: (selector: string) => selector.startsWith(".") ? node("#conversation").byClass(selector.slice(1)) : [], createElement: () => new Element() },
    fetch: fetchMock, setTimeout, clearTimeout, TextDecoder };
  runInNewContext(await readFile("src/ui/client.js", "utf8"), context); await tick();
  const region = () => node("#conversation").byClass("confirm-region")[0];
  return { render: context.render as (data: any) => void, region, text: () => region()?.textContent ?? "", conversation: node("#conversation") };
}
const get = (data: unknown) => async () => ({ ok: true, json: async () => data });

test("a confirmation card sits inline after the newest response with a meaningful question, body and two verbs; it vanishes when there is nothing to confirm", async () => {
  const c = await client(get(opening));
  c.render({ ...opening, confirmations: { cards: [card()], recent: [] } });
  assert.equal(c.conversation.children.at(-1), c.region());
  assert.match(c.text(), /NEEDS YOUR CONFIRMATION/); assert.match(c.text(), /Free Maren\?/); assert.match(c.text(), /Nothing has changed yet/);
  const confirm = c.region()!.byClass("confirm-accept")[0]!, cancel = c.region()!.byClass("confirm-cancel")[0]!;
  assert.equal(confirm.textContent, "Free Maren"); assert.equal(cancel.textContent, "Keep as is");
  assert.equal(confirm.getAttribute("aria-label"), "Confirm: Free Maren");
  assert.match(cancel.getAttribute("aria-label")!, /^Cancel: Free Maren\? Keep as is$/);
  assert.equal(c.region()!.byClass("confirm-card")[0]!.getAttribute("role"), "group");
  assert.match(c.region()!.byClass("confirm-card")[0]!.getAttribute("aria-label")!, /Confirmation needed: Free Maren\?/);
  assert.equal(c.region()!.getAttribute("aria-live"), "polite");
  c.render({ ...opening, confirmations: { cards: [], recent: [] } });
  assert.equal(c.region(), undefined, "no card, no region");
});
test("Confirm and Cancel post ONLY the opaque ref and the rendered revision; the browser cannot send a name, an ID, a payload or an amount", async () => {
  const calls: { url: string; body: any }[] = [];
  const c = await client(async (url: string, options?: any) => {
    if (options?.method === "POST") { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ...opening, revision: 8, ok: true, confirmations: { cards: [], recent: [{ ref: REF, status: "confirmed", subject_label: "Maren", text: "Confirmed." }] } }) }; }
    return { ok: true, json: async () => opening };
  });
  c.render({ ...opening, confirmations: { cards: [card()], recent: [] } });
  c.region()!.byClass("confirm-accept")[0]!.handlers.get("click")!({}); await tick(); await tick();
  assert.equal(calls.length, 1); assert.equal(calls[0]!.url, "/api/confirmation/confirm");
  assert.deepEqual(calls[0]!.body, { ref: REF, expected_revision: 7 });
  assert.deepEqual(Object.keys(calls[0]!.body).sort(), ["expected_revision", "ref"]);
  c.render({ ...opening, confirmations: { cards: [card()], recent: [] } });
  c.region()!.byClass("confirm-cancel")[0]!.handlers.get("click")!({}); await tick(); await tick();
  assert.equal(calls[1]!.url, "/api/confirmation/cancel"); assert.deepEqual(calls[1]!.body, { ref: REF, expected_revision: 7 });
});
test("a stale or invalidated request shows its safe reason inline and leaves the card (the server answers with the refreshed state); an outcome notice replaces a vanished card", async () => {
  const stale = { ...opening, revision: 9, ok: false, error: { code: "stale_turn", message: "The campaign changed since this card was shown. Review the story and try again." }, confirmations: { cards: [card()], recent: [] } };
  const c = await client(async (_url: string, options?: any) => ({ ok: options?.method !== "POST", json: async () => options?.method === "POST" ? stale : opening }));
  c.render({ ...opening, confirmations: { cards: [card()], recent: [] } });
  c.region()!.byClass("confirm-accept")[0]!.handlers.get("click")!({}); await tick(); await tick();
  assert.match(c.text(), /campaign changed since this card was shown/);
  assert.equal(c.region()!.byClass("confirm-card").length, 1);
  assert.equal(c.region()!.byClass("confirm-error")[0]!.hidden, false);
  c.render({ ...opening, confirmations: { cards: [], recent: [{ ref: REF, status: "invalidated", subject_label: "Maren", text: "No longer applicable: the person's legal status has changed." }] } });
  assert.match(c.text(), /Maren: No longer applicable/);
  assert.equal(c.region()!.byClass("confirm-card").length, 0);
  // A reload (a page that never showed that card) does not resurface old history.
  const fresh = await client(get(opening));
  fresh.render({ ...opening, confirmations: { cards: [], recent: [{ ref: REF, status: "confirmed", subject_label: "Maren", text: "Confirmed." }] } });
  assert.equal(fresh.region(), undefined);
});
test("buttons are disabled while a turn runs and the card is built with textContent only (no HTML injection from a label)", async () => {
  const c = await client(get(opening));
  c.render({ ...opening, status: "running_turn", confirmations: { cards: [card({ title: "<img src=x onerror=alert(1)>?" })], recent: [] } });
  assert.equal(c.region()!.byClass("confirm-accept")[0]!.disabled, true); assert.equal(c.region()!.byClass("confirm-cancel")[0]!.disabled, true);
  assert.match(c.text(), /<img src=x onerror=alert\(1\)>\?/, "shown as text");
  const source = await readFile("src/ui/client.js", "utf8"), block = source.slice(source.indexOf("function renderConfirmations"), source.indexOf("async function actOnConfirmation"));
  assert.doesNotMatch(block, /innerHTML|insertAdjacentHTML|outerHTML/);
});

// ------------------------------------------------------------------------------------------------ the real server routes
const BRENNA = "brenna";
async function liveServer(t: { after: (fn: () => unknown) => void }) {
  const dir = await mkdtemp(join(tmpdir(), "block5a-ui-"));
  const heldBrenna: CampaignCommand = { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "nicco" };
  const h = sessionWith(stepNarrator([{ text: "Brenna goes very still." }]), countingController([]), { save_dir: dir, autosave: false, setup: c => c.apply({ expected_revision: c.revision, commands: [heldBrenna] }) });
  const server = createPlaytestServer(h.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await h.session.shutdown({ discard_unsaved: true }); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown) => { const r = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() as any }; };
  const state = async () => await (await fetch(`${base}/api/session`)).json() as any;
  return { h, base, post, state };
}
test("server: the state carries the masked card; Confirm frees the person through the route; a repeat is a 200 replay; stale is 409; unknown is 422; no ids or payload leak", async t => {
  const { h, post, state } = await liveServer(t);
  await post("/api/turn", { text: "I hereby free you, Brenna.", turn_key: "ui_turn_key_0001", expected_revision: h.campaign.revision });
  const before = await state();
  assert.equal(before.confirmations.cards.length, 1);
  assert.doesNotMatch(JSON.stringify(before.confirmations), /subject_id|actor_id|payload|holder_id|campaign_character|"brenna"|manumit/);
  const ref = before.confirmations.cards[0].ref, rev = before.revision;
  assert.equal((await post("/api/confirmation/confirm", { ref, expected_revision: rev - 1 })).status, 409);
  assert.equal((await post("/api/confirmation/confirm", { ref: "f".repeat(24), expected_revision: rev })).status, 422);
  assert.equal(h.campaign.exportSnapshot().legal_statuses.find(l => l.character_id === BRENNA)?.status, "enslaved", "refusals changed nothing");
  // Extra fields are ignored: the browser cannot choose a subject or a payload.
  const ok = await post("/api/confirmation/confirm", { ref, expected_revision: rev, character_id: "nicco", holder_id: "korvin", payload: { x: 1 } });
  assert.equal(ok.status, 200); assert.equal(ok.data.ok, true); assert.equal(ok.data.confirmation, "confirmed");
  assert.equal(h.campaign.exportSnapshot().legal_statuses.find(l => l.character_id === BRENNA)?.status, "free");
  assert.equal(ok.data.confirmations.cards.length, 0);
  const again = await post("/api/confirmation/confirm", { ref, expected_revision: rev });
  assert.equal(again.status, 200); assert.equal(again.data.replayed, true);
  assert.equal(h.campaign.exportSnapshot().transactions.filter(x => x.kind === "manumission").length, 1);
  const cancelAfter = await post("/api/confirmation/cancel", { ref, expected_revision: rev + 1 });
  assert.equal(cancelAfter.status, 422); assert.equal(cancelAfter.data.reason, "already_confirmed");
});
test("server: Cancel is a 200 with zero campaign change; the routes demand JSON and reject cross-origin writes", async t => {
  const { h, base, post, state } = await liveServer(t);
  await post("/api/turn", { text: "I hereby free you, Brenna.", turn_key: "ui_turn_key_0002", expected_revision: h.campaign.revision });
  const before = await state(), ref = before.confirmations.cards[0].ref;
  const cancelled = await post("/api/confirmation/cancel", { ref, expected_revision: before.revision });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.data.confirmation, "cancelled");
  assert.equal((await state()).revision, before.revision, "cancel never moves the revision");
  assert.equal((await state()).confirmations.cards.length, 0);
  const text = await fetch(`${base}/api/confirmation/confirm`, { method: "POST", headers: { "Content-Type": "text/plain", Origin: base }, body: "{}" });
  assert.equal(text.status, 415);
  const foreign = await fetch(`${base}/api/confirmation/confirm`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://evil.example" }, body: JSON.stringify({ ref, expected_revision: 0 }) });
  assert.equal(foreign.status, 403);
});
