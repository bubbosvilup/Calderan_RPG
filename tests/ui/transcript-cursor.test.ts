import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { GameSession } from "../../src/app/game-session.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { setup } from "../support/turn-fixtures.js";

/**
 * B3: the transcript render cursor. The server sends a bounded window (the last 500 entries) and every message carries its stable entry index
 * as `seq`. The client renders the messages after the last `seq` it rendered; a count stops working once the window is full (new turns never
 * appeared until a reload). Offline: a real GameSession over a temporary save, and the real client against a minimal DOM stand-in.
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
  classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const base = { status: "idle", configured: true, revision: 7, scene: { location: "Slave Market", time_of_day: "Late Morning" }, household: [] };
async function client() {
  const nodes = new Map<string, Element>();
  const node = (selector: string) => { let e = nodes.get(selector); if (!e) { e = new Element(); e.id = selector.replace(/^#/, ""); nodes.set(selector, e); } return e; };
  const context: any = { document: { querySelector: node, querySelectorAll: () => [], createElement: () => new Element() },
    fetch: async () => ({ ok: true, json: async () => ({ ...base, messages: [] }) }), setTimeout, clearTimeout, TextDecoder };
  runInNewContext(await readFile("src/ui/client.js", "utf8"), context); await tick();
  const articles = () => node("#conversation").children.filter(e => e.className === "player" || e.className === "narrator");
  return { render: context.render as (data: any) => void, articles };
}
const window500 = (from: number) => Array.from({ length: 500 }, (_, k) => ({ role: (from + k) % 2 ? "player" : "narrator", text: `entry ${from + k}`, seq: from + k }));

test("client: with a full 500-entry window, new entries render once and nothing is re-rendered", async () => {
  const c = await client();
  c.render({ ...base, messages: window500(0) });
  assert.equal(c.articles().length, 500);
  c.render({ ...base, messages: window500(2) }); // the window slid: same length, two new entries at the end
  assert.equal(c.articles().length, 502, "a count-based cursor would render nothing here");
  assert.deepEqual(c.articles().slice(-2).map(a => a.textContent.replace(/^(Nicco|Narrator)/, "")), ["entry 500", "entry 501"]);
  c.render({ ...base, messages: window500(2) });
  assert.equal(c.articles().length, 502, "a repeated poll renders nothing");
});

test("client: a payload without positions keeps the old count behaviour (backward compatible)", async () => {
  const c = await client();
  c.render({ ...base, messages: [{ role: "narrator", text: "one" }] });
  c.render({ ...base, messages: [{ role: "narrator", text: "one" }, { role: "player", text: "two" }] });
  assert.equal(c.articles().length, 2);
});

test("a loaded campaign with 600 saved entries sends its stable positions, and a new turn appears after the full window", async () => {
  const dir = await mkdtemp(join(tmpdir(), "transcript-cursor-"));
  try {
    const f = setup(), repository = new FileCampaignRepository(f.world, dir), id = f.campaign.exportSnapshot().campaign_id;
    await repository.saveCampaign(f.campaign);
    const at = "2026-10-14T10:00:00.000Z";
    await repository.appendTranscript(id, Array.from({ length: 600 }, (_, i) => ({ i, at, role: i % 2 ? "player" as const : "narrator" as const, text: `saved ${i}`, revision: f.campaign.revision })));
    const loaded = await GameSession.loadCampaign({ world: f.world, repository, createCoordinator: () => f.coordinator }, id);
    assert.ok(loaded.ok); const session = loaded.session;
    const before = session.getTranscript();
    assert.equal(before.length, 500); assert.deepEqual([before[0]!.i, before.at(-1)!.i], [100, 599]);
    assert.ok((await session.submitPlayerInput("I smile.")).ok);
    const after = session.getTranscript();
    assert.equal(after.length, 500, "the window stays full");
    assert.ok(after.at(-1)!.i > 599 && after.at(-2)!.i > 599, "the new turn has new, larger positions");
    const c = await client(), payload = (t: typeof after) => ({ ...base, messages: t.map(m => ({ role: m.role, text: m.text, seq: m.i })) });
    c.render(payload(before)); c.render(payload(after));
    assert.equal(c.articles().length, 502);
    assert.match(c.articles().at(-2)!.textContent, /I smile\./);
    await session.shutdown({ discard_unsaved: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
