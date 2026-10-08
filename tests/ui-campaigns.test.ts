import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

/** Save/Load v1 (client): start screen, create/load, save control and status, load report, campaign switch resets the story. */
class Element {
  private text = "";
  className = ""; value = ""; hidden = false; disabled = false; focused = false; tagName = "DIV";
  parent?: Element; children: Element[] = [];
  attributes = new Map<string, string>(); handlers = new Map<string, (event: any) => any>();
  get textContent(): string { return this.text + this.children.map(c => c.textContent).join(""); }
  set textContent(value: string) { this.text = value; this.children = []; }
  append(...children: Element[]) { children.forEach(c => { c.parent = this; }); this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.text = ""; this.children = []; this.append(...children); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  getAttribute(name: string) { return this.attributes.get(name); }
  addEventListener(name: string, handler: (event: any) => any) { this.handlers.set(name, handler); }
  focus() { this.focused = true; }
  scrollIntoView() {}
  requestSubmit() { return this.handlers.get("submit")!({ preventDefault() {} }); }
}
const IDS = ["conversation", "composer", "input", "send", "status", "error", "location", "daypart", "household-members", "latest", "day", "location-id", "gold", "present-count", "scene-participants", "household-count",
  "household-nav", "play-view", "household-view", "member-editor", "household-cards", "household-title", "campaign-screen", "campaign-list", "campaign-error", "campaign-new", "campaign-name", "campaign-scenario",
  "campaign-scenario-description", "campaign-create", "campaigns-nav", "save-button", "save-status", "load-report", "load-report-text", "load-report-dismiss", "portrait-lightbox"];
const tick = () => new Promise(resolve => setImmediate(resolve));
const scene = (id: string, name: string, save: Record<string, unknown>, messages: unknown[] = [{ role: "narrator", text: `*Opening of ${name}.*` }]) =>
  ({ messages, status: "idle", configured: true, revision: 3, campaign: { id, display_name: name, save }, scene: { location: "Market", location_id: "calderan_slave_market", time_of_day: "Late Morning" }, play: { participants: [], household: [] }, household: [] });
const list = { campaigns: [
  { campaign_id: "campaign_a", display_name: "First run", status: "valid", revision: 12, saved_at: "2026-10-08T10:00:00.000Z", location_name: "Market", world_minute: 1500, household_members: 1, previous_valid: true, backups: ["r00000012-20261008T100000000Z.json"], locked: false },
  { campaign_id: "campaign_b", display_name: "Broken run", status: "invalid_json", previous_valid: true, backups: ["r00000004-20261007T100000000Z.json"], locked: false },
], scenarios: [{ id: "caldrevan.slave_market.v1", label: "Arrival at the Calderan slave market", description: "Nicco arrives." }], active_campaign_id: null };
async function client(routes: Record<string, (body: any) => any>) {
  const nodes = new Map(IDS.map(id => [`#${id}`, new Element()]));
  const posts: { url: string; body: any }[] = [];
  const fetchMock = async (url: string, options?: any) => {
    const body = options?.body ? JSON.parse(options.body) : undefined;
    if (options?.method === "POST") posts.push({ url, body });
    const handler = routes[url]; if (!handler) throw new Error(`unexpected ${url}`);
    return { ok: true, json: async () => handler(body) };
  };
  const lookup = (id: string) => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const context: any = { document: { querySelector: lookup, createElement: (tag: string) => Object.assign(new Element(), { tagName: tag.toUpperCase() }) }, fetch: fetchMock, setTimeout: () => 0, clearTimeout: () => undefined, TextDecoder };
  runInNewContext(await readFile("src/ui/client.js", "utf8"), context); await tick(); await tick();
  return { node: (id: string) => nodes.get(`#${id}`)!, posts };
}

test("startup with no campaign shows the start screen (list + new campaign) and never plays; recovery buttons only for broken saves", async () => {
  const c = await client({ "/api/session": () => ({ campaign: null, messages: [], status: "idle", configured: true }), "/api/campaigns": () => list });
  assert.equal(c.node("campaign-screen").hidden, false); assert.equal(c.node("save-button").hidden, true); assert.equal(c.node("input").disabled, true);
  const rows = c.node("campaign-list").children;
  assert.equal(rows.length, 2); assert.match(rows[0]!.textContent, /First run.*Market · Day 1, 01:00 · 1 in household/);
  assert.deepEqual(rows[0]!.children[1]!.children.map(b => b.textContent), ["Load"]);
  assert.deepEqual(rows[1]!.children[1]!.children.map(b => b.textContent), ["Load previous save", "Load latest backup"]);
  assert.match(rows[1]!.textContent, /cannot be read/);
  assert.deepEqual(c.node("campaign-scenario").children.map(o => o.textContent), ["Arrival at the Calderan slave market"]);
});

test("create sends only a name and a scenario ID; load sends a campaign ID and slot; warnings show once; switching campaigns resets the story", async () => {
  let state: any = { campaign: null, messages: [], status: "idle", configured: true };
  const c = await client({ "/api/session": () => state, "/api/campaigns": () => list,
    "/api/campaigns/create": body => (state = { ok: true, ...scene("campaign_new", body.display_name, { state: "saved", last_saved_revision: 3, autosave: "on" }) }),
    "/api/campaigns/load": body => (state = { ok: true, load_report: { warnings: body.slot === "previous" ? ["Loaded from the previous save, not the latest save."] : [] }, ...scene(body.campaign_id, "Loaded", { state: "saved", last_saved_revision: 3, autosave: "on" }) }),
    "/api/campaigns/close": () => (state = { ok: true, campaign: null, messages: [], status: "idle", configured: true }) });
  c.node("campaign-name").value = "  My run ";
  await c.node("campaign-new").handlers.get("submit")!({ preventDefault() {} }); await tick();
  assert.deepEqual(c.posts.at(-1), { url: "/api/campaigns/create", body: { display_name: "My run", scenario_id: "caldrevan.slave_market.v1" } });
  assert.equal(c.node("campaign-error").textContent, ""); assert.equal(c.node("campaign-screen").hidden, true); assert.equal(c.node("save-button").hidden, false); assert.equal(c.node("save-status").textContent, "Saved");
  assert.match(c.node("conversation").textContent, /Opening of My run/); assert.equal(c.node("load-report").hidden, true, "a quiet create shows no report");
  // Back to the start screen, then explicit recovery of the broken campaign.
  await c.node("campaigns-nav").handlers.get("click")!({}); await tick(); await tick();
  assert.equal(c.node("campaign-screen").hidden, false); assert.equal(c.node("conversation").textContent, "", "no story from the closed campaign remains");
  await c.node("campaign-list").children[1]!.children[1]!.children[0]!.handlers.get("click")!({}); await tick();
  assert.deepEqual(c.posts.at(-1), { url: "/api/campaigns/load", body: { campaign_id: "campaign_b", slot: "previous" } });
  assert.equal(c.node("load-report").hidden, false); assert.match(c.node("load-report-text").textContent, /previous save/);
  c.node("load-report-dismiss").handlers.get("click")!({}); assert.equal(c.node("load-report").hidden, true);
  assert.match(c.node("conversation").textContent, /Opening of Loaded/); assert.doesNotMatch(c.node("conversation").textContent, /My run/);
});

test("Save is immediate and shows Saving… then the server's state; failures say Save failed without losing the session", async () => {
  let saveReply: any;
  const c = await client({ "/api/session": () => scene("campaign_a", "First run", { state: "unsaved", last_saved_revision: 2, autosave: "on" }), "/api/save": () => saveReply });
  assert.equal(c.node("save-status").textContent, "Unsaved changes");
  saveReply = { ok: true, ...scene("campaign_a", "First run", { state: "saved", last_saved_revision: 3, autosave: "on" }) };
  const pending = c.node("save-button").handlers.get("click")!({});
  assert.equal(c.node("save-status").textContent, "Saving…"); assert.equal(c.node("save-button").disabled, true);
  await pending; assert.equal(c.node("save-status").textContent, "Saved"); assert.deepEqual(c.posts.at(-1), { url: "/api/save", body: {} });
  saveReply = { ok: false, error: { message: "The save could not be read or written." }, ...scene("campaign_a", "First run", { state: "unsaved", last_saved_revision: 3, error: "io_error", autosave: "on" }) };
  await c.node("save-button").handlers.get("click")!({});
  assert.equal(c.node("save-status").textContent, "Save failed"); assert.match(c.node("save-status").getAttribute("title")!, /still in this session/);
  assert.equal(c.node("error").hidden, false); assert.equal(c.node("save-button").disabled, false, "retry stays possible");
});

test("disposable playtest payloads (no campaign field) keep the original UI: no start screen, no save control", async () => {
  const c = await client({ "/api/session": () => ({ messages: [{ role: "narrator", text: "*Playtest.*" }], status: "idle", configured: true, revision: 1, scene: { location: "Market", time_of_day: "Morning" }, play: { participants: [], household: [] }, household: [] }) });
  assert.equal(c.node("campaign-screen").hidden, true); assert.equal(c.node("save-button").hidden, true); assert.equal(c.node("campaigns-nav").hidden, true);
  assert.match(c.node("conversation").textContent, /Playtest/);
});
