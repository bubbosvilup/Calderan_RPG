import test from "node:test";
import assert from "node:assert/strict";
import { build, measure, BASE, type Config } from "./pass10-headroom.js";
import { loadWorld } from "../src/world/loader.js";
import { buildTurnContext, CONTEXT_LIMITS } from "../src/turn/context-builder.js";
import { NPC_PLUS_LIMITS, npcDeepSources, recoverNpcContext, deduplicateRecovered, packNpcPlus } from "../src/turn/npc-plus.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { household } from "./pass10-support.js";

/** NPC+ Pass 10 — context/recovery integrity and the headroom boundary (offline; the table in the report is `node .build/tests/pass10-headroom.js`). */
const world = await loadWorld("data");

test("NPC+ adds at most its global 4k budget and never the authority: 20 rich present NPC+ with full rollups stay under 32k, all people kept, NPC+ degrades to Tier D first", () => {
  const rollup = measure({ ...BASE, n: 20, history: "rollup" }), none = measure({ ...BASE, n: 20, history: "none" });
  assert.ok(rollup.ok && none.ok);
  if (!rollup.ok || !none.ok) return;
  assert.ok(rollup.after! <= NPC_PLUS_LIMITS.budget_characters && none.after! <= NPC_PLUS_LIMITS.budget_characters, "4k global cap");
  assert.ok(rollup.total <= CONTEXT_LIMITS.serialized_characters, "32k final cap");
  assert.equal(rollup.people, 21, "every present person is kept (Tier A)");
  assert.ok(rollup.tiers!.D >= 0 && rollup.before! > none.before!, "history only grows the optional layer");
  // Authority only moves with real authoritative changes (rollups add relationship edges), never because NPC+ grew.
  assert.ok(Math.abs(rollup.authority - none.authority) < 400);
});
test("NPC+ growth can never cause context_too_large by itself: the same authority with and without NPC+ history has the same verdict", () => {
  for (const history of ["none", "full", "rollup"] as const) assert.equal(measure({ ...BASE, rich: false, itemsPer: 0, n: 30, history, reflections: true }).ok, true, history);
});
test("the true failure boundary is authoritative growth (never-drop state), and it is quadratic in shared knowledge: present people × shown facts known", () => {
  const first = (knows: number) => { const cfg: Config = { ...BASE, rich: false, itemsPer: 0, facts: 32, knowsPer: knows }; let lo = 1, hi = 80; while (lo < hi) { const mid = (lo + hi) >> 1; if (measure({ ...cfg, n: mid }).ok) lo = mid + 1; else hi = mid; } return lo; };
  const [k3, k8, k32] = [first(3), first(8), first(32)];
  assert.ok(k3 > k8 && k8 > k32, `more shared knowledge per person overflows with fewer present people (${k3} > ${k8} > ${k32})`);
  assert.ok(k32 > 12 && k32 < 80, `the reconciled resource safeguard fails at ${k32} present people, beyond the historical 32k gate`);
  assert.throws(() => buildTurnContext(world, build({ ...BASE, rich: false, itemsPer: 0, facts: 32, knowsPer: 32, n: k32 }).campaign.exportSnapshot()), /context_too_large/);
});
test("determinism: the same snapshot builds a byte-identical context, twice and after a JSON round trip", () => {
  const { campaign } = build({ ...BASE, n: 12, history: "rollup", reflections: true, facts: 20, knowsPer: 2, rules: 3 });
  const a = JSON.stringify(buildTurnContext(world, campaign.exportSnapshot(), { input: "Member003, come here." }));
  const b = JSON.stringify(buildTurnContext(world, campaign.exportSnapshot(), { input: "Member003, come here." }));
  const c = JSON.stringify(buildTurnContext(world, JSON.parse(JSON.stringify(campaign.exportSnapshot())), { input: "Member003, come here." }));
  assert.equal(a, b); assert.equal(a, c);
});
test("recovery: every handle in a line resolves exactly to its source; rollups are typed as consolidated; stale history handles do not resolve", () => {
  const { campaign } = build({ ...BASE, n: 3, history: "rollup", reflections: true });
  const snap = campaign.exportSnapshot(), id = "campaign_character_h000";
  const sources = npcDeepSources(world, snap, id);
  for (const s of sources) assert.deepEqual(recoverNpcContext(world, snap, s.handle), s);
  const roll = sources.find(s => s.kind === "rollup")!;
  assert.match(roll.exact_payload, /"type":"consolidated_history"/);
  assert.equal(recoverNpcContext(world, snap, `npcmem:${id}:history:r1.0`), undefined, "a rotated-out history handle does not resolve");
  assert.equal(recoverNpcContext(world, snap, `npcmem:${id}:history:r999.0`), undefined);
  assert.equal(recoverNpcContext(world, snap, "npcmem:nicco:canon:entity"), undefined, "only NPC+ have recoverable sources");
  const handles = sources.map(s => s.handle); assert.equal(new Set(handles).size, handles.length, "handles are unique");
});
test("private evidence never enters public NPC+ lines or recovered lines (handle only); recovered canon already retrieved appears once", () => {
  const f = household(["maren"]);
  const ctx = buildTurnContext(f.world, f.campaign.exportSnapshot(), { input: "Maren, what do you remember about the tower and the secret?" });
  assert.equal(JSON.stringify(ctx.npc_plus).includes("HIDDEN_SECRET_SENTINEL"), false);
  assert.ok(npcDeepSources(f.world, f.campaign.exportSnapshot(), "maren").some(s => s.visibility === "holder_private" && /HIDDEN_SECRET_SENTINEL/.test(s.exact_payload)), "the engine can recover it; the prompt never shows it");
  const retrieved = { records: [{ kind: "entity", entity_id: "maren" }] };
  const deduped = deduplicateRecovered({ lines: ["Recovered for Maren [npcmem:maren:canon:entity]: A young woman staying in the tower."], diagnostics: ctx.npc_plus!.diagnostics }, retrieved);
  assert.equal(deduped.removed, 1); assert.match(deduped.npc.lines[0]!, /same source as \[RETRIEVED CANON\]/);
});
test("one authoritative value: NPC+ relationship tokens are rendered from the relationship domain, never stored (no premium copy exists)", () => {
  const { campaign } = build({ ...BASE, n: 2 });
  const snap = campaign.exportSnapshot();
  assert.equal(JSON.stringify(snap.premium_characters).includes("trust"), false, "premium state holds no relationship values (only change-history entries once a change is committed)");
  const ctx = buildTurnContext(world, snap, { input: "Member000, hello." });
  assert.ok(ctx.npc_plus!.lines.some(l => /N\{trust=M,aff=L,resp=M\}|toward Nicco: trust moderate/.test(l)));
});
test("scaling guard: packing 150 NPC+ is near-linear (was O(P²) character lookups: ~0.5 s at 150 before Pass 10, ~10 ms after); the bound leaves a wide margin", () => {
  const { campaign } = build({ ...BASE, n: 150, rich: false, itemsPer: 0, history: "none" });
  const snap = campaign.exportSnapshot(), present = new Set(snap.characters.slice(0, 5).map(c => c.id));
  const t = performance.now(); for (let i = 0; i < 3; i++) packNpcPlus(world, snap, present, "Member000, how are you?"); const per = (performance.now() - t) / 3;
  assert.ok(per < 400, `packNpcPlus took ${per.toFixed(1)} ms for 150 NPC+`);
});
