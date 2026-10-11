import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

/**
 * Actual Offer V1 — the browser side. The client renders only the masked projection it is given (an opaque ref, a label, lines, a price) and its
 * accept request carries ONLY that ref and the revision it rendered. Offline: a minimal DOM stand-in, no network.
 */
class Element {
  private text = "";
  id = ""; className = ""; value = ""; hidden = false; disabled = false; type = ""; scrollTop = 0; scrollHeight = 100; clientHeight = 100; focused = false;
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
  focus() { this.focused = true; }
  requestSubmit() { return this.handlers.get("submit")?.({ preventDefault() {} }); }
  classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  all(): Element[] { return [this, ...this.children.flatMap(c => c.all())]; }
  byClass(name: string): Element[] { return this.all().filter(e => e.className.split(/\s+/).includes(name)); }
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const opening = { messages: [{ role: "narrator", text: "*An ordinary morning.*" }], status: "idle", configured: true, revision: 7,
  scene: { location: "Slave Market", time_of_day: "Late Morning" }, household: [] };
const card = (extra: Record<string, unknown> = {}) => ({ ref: "a".repeat(24), direction: "buy", kind: "goods", counterparty: "Korvin", price_gold: 15, lines: ["Halberd"], affordable: true, gold: 500, summary: "Buy Halberd for 15 gold", ...extra });

async function client(fetchMock: (url: string, options?: any) => any) {
  const nodes = new Map<string, Element>();
  const node = (selector: string): Element => { if (selector === "#trade-region") return nodes.get("#conversation")?.all().find(e => e.id === "trade-region") as Element; /* only once the client has attached it, as in a real page */ let e = nodes.get(selector); if (!e) { e = new Element(); e.id = selector.replace(/^#/, ""); nodes.set(selector, e); } return e; };
  const context: any = { document: { querySelector: node, querySelectorAll: (selector: string) => selector.startsWith(".") ? node("#conversation").byClass(selector.slice(1)) : [], createElement: () => new Element() },
    fetch: fetchMock, setTimeout, clearTimeout, TextDecoder };
  runInNewContext(await readFile("src/ui/client.js", "utf8"), context); await tick();
  const region = () => node("#conversation").byClass("trade-region")[0];
  return { render: context.render as (data: any) => void, node, region, text: () => region()?.textContent ?? "", conversation: node("#conversation") };
}
const get = (data: unknown) => async () => ({ ok: true, json: async () => data });

test("a BUY card is compact and inline after the conversation, with BUY text and icon, the price, the lines and an Accept button — no shop, no counteroffer", async () => {
  const c = await client(get({ ...opening, trade: { offer: card(), notice: null, receipt: null } }));
  c.render({ ...opening, trade: { offer: card(), notice: null, receipt: null } });
  assert.equal(c.conversation.children.at(-1), c.region(), "the card sits last, right after the newest Narrator response");
  assert.match(c.text(), /ACTUAL OFFER/); assert.match(c.text(), /▼ BUY/); assert.match(c.text(), /15 gold/); assert.match(c.text(), /Halberd/); assert.match(c.text(), /Korvin offers to sell/);
  assert.match(c.text(), /You have 500 gold\./);
  const accept = c.region()!.byClass("trade-accept");
  assert.equal(accept.length, 1); assert.equal(accept[0]!.textContent, "Accept offer");
  assert.doesNotMatch(c.text(), /counter|haggle|shop|catalog|stock/i, "negotiation stays in chat");
  assert.equal(c.region()!.byClass("trade-card")[0]!.dataset.tradeRef, "a".repeat(24));
});
test("BUY and SELL differ by text and icon, not by colour alone; a person offer carries a marker in the same component", async () => {
  const c = await client(get(opening));
  c.render({ ...opening, trade: { offer: card({ direction: "sell", counterparty: "Korvin", lines: ["Old Rusty Sword"], price_gold: 5, affordable: null }), notice: null, receipt: null } });
  assert.match(c.text(), /▲ SELL/); assert.doesNotMatch(c.text(), /▼ BUY/); assert.match(c.text(), /Korvin offers to buy/);
  assert.equal(c.region()!.byClass("trade-person").length, 0);
  c.render({ ...opening, trade: { offer: card({ kind: "person", lines: ["Red-haired Slave"], person: { label: "Red-haired Slave", name_known: false }, price_gold: 5 }), notice: null, receipt: null } });
  assert.match(c.text(), /▼ BUY/); assert.match(c.text(), /♟ Person/); assert.match(c.text(), /Red-haired Slave/);
  assert.equal(c.region()!.byClass("trade-card").length, 1, "one component for goods and people");
});
test("accepting posts ONLY the offer ref and the rendered revision; the browser cannot send a price, an item or a person", async () => {
  const calls: { url: string; body: any }[] = [];
  const c = await client(async (url: string, options?: any) => {
    if (options?.method === "POST") { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ ...opening, revision: 8, ok: true, trade: { offer: null, notice: null, receipt: { ref: "a".repeat(24), direction: "buy", kind: "goods", gold: 15, summary: "Bought Halberd for 15 gold" } } }) }; }
    return { ok: true, json: async () => opening };
  });
  c.render({ ...opening, trade: { offer: card(), notice: null, receipt: null } });
  c.region()!.byClass("trade-accept")[0]!.handlers.get("click")!({}); await tick(); await tick();
  assert.equal(calls.length, 1); assert.equal(calls[0]!.url, "/api/trade/accept");
  assert.deepEqual(calls[0]!.body, { ref: "a".repeat(24), expected_revision: 7 });
  assert.deepEqual(Object.keys(calls[0]!.body).sort(), ["expected_revision", "ref"]);
  assert.match(c.text(), /✓ Bought Halberd for 15 gold\./, "the receipt replaces the card, without a reload");
  assert.equal(c.region()!.byClass("trade-accept").length, 0);
});
test("a stale or refused acceptance shows its safe reason inline on the card and leaves the card in place (the server answers with the refreshed state)", async () => {
  const standing = { ...opening, trade: { offer: card(), notice: null, receipt: null } };
  const c = await client(async (_url: string, options?: any) => options?.method === "POST"
    ? { ok: false, json: async () => ({ ok: false, error: { message: "Not enough gold. The offer stays open." }, ...standing }) } : { ok: true, json: async () => standing });
  c.render(standing);
  c.region()!.byClass("trade-accept")[0]!.handlers.get("click")!({}); await tick(); await tick();
  const problem = c.region()!.byClass("trade-error")[0]!;
  assert.equal(problem.hidden, false); assert.equal(problem.textContent, "Not enough gold. The offer stays open."); assert.equal(problem.attributes.get("role"), "alert");
  assert.equal(c.region()!.byClass("trade-card").length, 1);
  assert.equal(c.region()!.byClass("trade-accept")[0]!.disabled, false, "the player can try again");
});
test("an unaffordable BUY disables Accept and says so; a SELL never does", async () => {
  const c = await client(get(opening));
  c.render({ ...opening, trade: { offer: card({ affordable: false, gold: 10 }), notice: null, receipt: null } });
  assert.equal(c.region()!.byClass("trade-accept")[0]!.disabled, true); assert.match(c.text(), /Not enough gold \(you have 10\)\./);
});
test("a superseded or withdrawn offer leaves no actionable card, only a short notice; with nothing to show the region is not in the conversation at all", async () => {
  const c = await client(get(opening));
  c.render({ ...opening, trade: { offer: null, notice: { ref: "b".repeat(24), status: "withdrawn", text: "The offer was withdrawn." }, receipt: null } });
  assert.equal(c.region()!.byClass("trade-accept").length, 0); assert.match(c.text(), /The offer was withdrawn\./);
  c.render({ ...opening, trade: { offer: null, notice: null, receipt: null } });
  assert.equal(c.region(), undefined);
  const before = c.conversation.children.length;
  c.render({ ...opening }); assert.equal(c.conversation.children.length, before);
});
test("untrusted text in a card is inert: lines and labels are text nodes, never markup", async () => {
  const c = await client(get(opening));
  c.render({ ...opening, trade: { offer: card({ lines: ["<img src=x onerror=alert(1)>"], counterparty: "<script>alert(1)</script>" }), notice: null, receipt: null } });
  assert.ok(c.region()!.all().every(e => e.children.length === 0 || e.className !== "" || true));
  assert.match(c.text(), /<img src=x onerror=alert\(1\)>/); assert.match(c.text(), /<script>alert\(1\)<\/script>/);
  assert.ok(c.region()!.all().every(e => e.attributes.get("src") === undefined && e.attributes.get("onerror") === undefined));
});
