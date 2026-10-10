import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { buildTurnContext, CONTEXT_LIMITS } from "../src/turn/context-builder.js";
import { projectKnowledgeAccess, renderKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { retrieveForTurn } from "../src/turn/retrieval-policy.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";

/**
 * Hardening H3: context projection — relevance selection happens BEFORE any size validation, scene-critical state is never dropped,
 * and context_too_large fails closed only when never-drop state cannot fit. Real Calderan world, synthetic campaign load.
 */
const world = await loadWorld("data");
let serial = 0;
function campaign(): CampaignState { return createOpeningCampaign(world, `h3_scale_${++serial}`); }
function apply(c: CampaignState, commands: readonly CampaignCommand[]) { for (let i = 0; i < commands.length; i += 100) c.apply({ expected_revision: c.revision, commands: commands.slice(i, i + 100) }); }
const pad = (n: number) => String(n).padStart(3, "0");
const facts = (n: number, at = 0): CampaignCommand[] => Array.from({ length: n }, (_, k) => [
  { kind: "create_fact" as const, fact: { id: `campaign_fact_s${pad(at + k)}`, content: { kind: "campaign" as const, statement: `Ledger entry ${pad(at + k)} records a debt in the harbor.`, truth: "true" as const } } },
  { kind: "set_knowledge" as const, knowledge: { character_id: "nicco", fact_id: `campaign_fact_s${pad(at + k)}`, status: "knows" as const } }]).flat();
const people = (n: number): CampaignCommand[] => Array.from({ length: n }, (_, k) => ({ kind: "register_character", character: { id: `campaign_character_s${pad(k)}`, origin: { kind: "created" },
  profile: { name: `Person${pad(k)}` }, current: { current_location: "heartstone_square", status: "active" } } }));
const events = (n: number): CampaignCommand[] => Array.from({ length: n }, (_, k) => ({ kind: "schedule_event", id: `campaign_event_s${pad(k)}`, title: `Appointment ${pad(k)}`, scheduled_world_minute: 100_000 - k * 10, participants: ["nicco"] }));
const items = (n: number, label = "trinket"): CampaignCommand[] => Array.from({ length: n }, (_, k) => ({ kind: "register_item", item: { id: `campaign_item_s${pad(k)}`, origin: { kind: "created" },
  name: `${label} ${pad(k)}`, owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } } }));
const size = (c: CampaignState) => JSON.stringify(buildTurnContext(world, c.exportSnapshot())).length;

// ------------------------------------------------------------------------------------------------ facts
test("facts > 32: relevance selection runs before validation; the referenced fact survives; nothing is forgotten", () => {
  const c = campaign(); apply(c, facts(64));
  const context = buildTurnContext(world, c.exportSnapshot(), { input: "What does ledger entry 050 say?" });
  assert.equal(context.facts.length, CONTEXT_LIMITS.facts);
  assert.ok(context.facts.some(f => f.id === "campaign_fact_s050"), "the fact the player references is selected");
  assert.deepEqual(context.projection?.facts, { total: 66, shown: 32 }, "the omission is reported, not silent");
  assert.equal(c.exportSnapshot().facts.length, 66, "selection is not forgetting");
});
test("facts > 32: /tell of a fact beyond the first 32 still resolves (the player's words select it)", () => {
  const c = campaign(); apply(c, facts(64));
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_lr" } },
    { kind: "register_character", character: { id: "campaign_character_brenna", origin: { kind: "created" }, profile: { name: "Brenna" }, current: { current_location: "heartstone_lr", status: "active" } } }] });
  const input = "/tell campaign_fact_s063 to campaign_character_brenna";
  const context = buildTurnContext(world, c.exportSnapshot(), { input });
  const intent = playerIntent(input, context, c.exportSnapshot(), world);
  assert.ok(intent.candidates.some(x => x.kind === "set_knowledge" && x.knowledge.fact_id === "campaign_fact_s063"));
});
test("pre-H3 fatal point: 33 known facts no longer fail the turn context", () => {
  const c = campaign(); apply(c, facts(31));
  assert.doesNotThrow(() => buildTurnContext(world, c.exportSnapshot()));
});

// ------------------------------------------------------------------------------------------------ people / events / social
test("people > 24: every present person is kept (never dropped); knowledge access stays renderable", () => {
  const c = campaign(); apply(c, people(40));
  const context = buildTurnContext(world, c.exportSnapshot());
  assert.equal(context.characters.filter(x => x.id.startsWith("campaign_character_s")).length, 40);
  apply(c, facts(5));
  const ctx = buildTurnContext(world, c.exportSnapshot());
  assert.doesNotThrow(() => renderKnowledgeAccess(projectKnowledgeAccess(ctx, undefined)));
});
test("crowded knowledge access: 30 people with knowledge edges render losslessly within budget (every CAN USE kept)", () => {
  const c = campaign(); apply(c, [...people(30), ...facts(16)]);
  apply(c, Array.from({ length: 60 }, (_, k): CampaignCommand => ({ kind: "set_knowledge", knowledge: { character_id: `campaign_character_s${pad(k % 30)}`, fact_id: `campaign_fact_s${pad(Math.floor(k / 30))}`, status: "knows" } })));
  const access = projectKnowledgeAccess(buildTurnContext(world, c.exportSnapshot()), undefined);
  const rendered = renderKnowledgeAccess(access);
  assert.ok(rendered.length <= 6_000, `${rendered.length}`);
  for (const ch of access.characters.filter(x => x.can_use.length)) for (const u of ch.can_use) assert.ok(rendered.includes(`${ch.name}: CAN USE`) && rendered.includes(`${u.ref} (${u.basis})`), `${ch.name} ${u.ref}`);
  assert.match(rendered, /DO NOT USE every other fact above/, "the complement is stated, not enumerated");
});
test("events > 16: the soonest 16 are projected (ties by id); later appointments stay in state", () => {
  const c = campaign(); apply(c, events(32));
  const context = buildTurnContext(world, c.exportSnapshot());
  assert.equal(context.scheduled_events.length, 16);
  const minutes = context.scheduled_events.map(e => e.scheduled_world_minute), soonest = [...c.exportSnapshot().scheduled_events].map(e => e.scheduled_world_minute).sort((a, b) => a - b).slice(0, 16);
  assert.deepEqual([...minutes].sort((a, b) => a - b), soonest);
  assert.deepEqual(context.projection?.scheduled_events, { total: 32, shown: 16 });
});
test("social: present household members, all active rules and Nicco's relationships are never dropped; omissions are reported", () => {
  const c = campaign(); apply(c, people(30));
  apply(c, Array.from({ length: 30 }, (_, k): CampaignCommand => ({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: `campaign_character_s${pad(k)}` })));
  // move 20 of the 30 members away: 10 present, 20 absent (more than the 15 selectable slots)
  apply(c, Array.from({ length: 20 }, (_, k): CampaignCommand => ({ kind: "move_character", character_id: `campaign_character_s${pad(k + 10)}`, location_id: "heartstone_lr" })));
  apply(c, Array.from({ length: 14 }, (_, k): CampaignCommand => ({ kind: "add_household_rule", household_id: OPENING_HOUSEHOLD, text: `Rule ${k}: keep the ledger ${k} closed.` })));
  apply(c, Array.from({ length: 10 }, (_, k): CampaignCommand => ({ kind: "seed_relationship", relationship: { from_character_id: `campaign_character_s${pad(k)}`, to_character_id: "nicco", dimensions: { trust: "low" } } })));
  apply(c, Array.from({ length: 9 }, (_, k): CampaignCommand => ({ kind: "seed_relationship", relationship: { from_character_id: `campaign_character_s${pad(k)}`, to_character_id: `campaign_character_s${pad(k + 1)}`, dimensions: { wariness: "low" } } })));
  const context = buildTurnContext(world, c.exportSnapshot()), h = context.social.households.find(x => x.id === OPENING_HOUSEHOLD)!;
  assert.equal(h.members.filter(m => m.present).length, 10, "every present member is listed");
  assert.equal(h.rules.length, 14, "active rules are never cut");
  assert.equal(context.social.relationships.filter(r => r.to === "Nicco" || r.from === "Nicco").length, 10, "Nicco's relationships survive");
  assert.deepEqual(context.projection?.household_members_not_present, { omitted: 15 }, "20 absent members, 5 selectable slots left after the 10 present");
  assert.deepEqual(context.projection?.relationships, { total: 19, shown: 12 });
});

// ------------------------------------------------------------------------------------------------ budget bands and genuine overflow
test("serialized budget: contexts near 50%, 80% and 95% build; beyond 100% of never-drop state fails closed", () => {
  const c = campaign();
  const budget = CONTEXT_LIMITS.serialized_characters;
  let n = 0;
  const reach = (fraction: number) => { while (size(c) < budget * fraction) { apply(c, [items(1)[0]!].map(x => ({ ...x, item: { ...(x as Extract<CampaignCommand, { kind: "register_item" }>).item, id: `campaign_item_b${pad(n)}`, name: `ledger ${pad(n++)}` } }) as CampaignCommand)); } };
  for (const fraction of [0.5, 0.8, 0.95]) { reach(fraction); const s = size(c); assert.ok(s >= budget * fraction && s <= budget, `${fraction}: ${s}`); }
  assert.throws(() => { reach(1.01); }, /context_too_large/);
});
test("mixed high-load scene: 30 people, 64 facts, 32 events, 40 items — builds, and every scene-critical record survives", () => {
  const c = campaign(); apply(c, [...people(30), ...facts(64), ...events(32), ...items(40)]);
  apply(c, [{ kind: "set_legal_status", character_id: "campaign_character_s003", status: "enslaved", holder_id: "nicco" }]);
  const context = buildTurnContext(world, c.exportSnapshot(), { input: "Hello." });
  assert.equal(context.characters.length, 31 + context.primary.scene.present_characters.length, "Nicco + 30 created + authored NPCs present");
  assert.equal(context.items.length, 40, "items are never dropped");
  assert.ok(context.social.legal.some(l => l.character_id === "campaign_character_s003"), "legal state of a present person survives");
  assert.equal(context.primary.scene.player_location?.id, "heartstone_square");
  assert.ok(JSON.stringify(context).length <= CONTEXT_LIMITS.serialized_characters);
});
test("deterministic: same snapshot + input + world gives byte-identical context, whatever the command insertion order", () => {
  const a = campaign(), b = campaign();
  const reversedFacts = Array.from({ length: 40 }, (_, k) => facts(1, 39 - k)).flat();
  apply(a, [...facts(40), ...events(20)]); apply(b, [...events(20).reverse(), ...reversedFacts]);
  const ctx = (c: CampaignState) => JSON.stringify(buildTurnContext(world, c.exportSnapshot(), { input: "ledger entry 033" })).replace(/h3_scale_\d+/g, "x");
  assert.equal(ctx(a), ctx(b));
  assert.equal(ctx(a), ctx(a));
});

// ------------------------------------------------------------------------------------------------ retrieval under load
test("retrieval under load: supplemental canon never crowds out runtime truth (location, people, legal state, prompt intact)", async () => {
  const c = campaign(); apply(c, [...people(30), ...facts(64), ...items(30)]);
  apply(c, [{ kind: "set_legal_status", character_id: "campaign_character_s007", status: "enslaved", holder_id: "nicco" }]);
  const input = "What do I know about the Inquisition?";
  const context = buildTurnContext(world, c.exportSnapshot(), { input });
  const service = new RetrievalService(world), r = await retrieveForTurn(input, context, world, { service, search: new HybridSearch(service) });
  assert.ok(r.diagnostics.operations > 0, "retrieval ran");
  const prompt = buildNarratorPrompt(input, context, [], r.data, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.match(prompt, /\[CURRENT SCENE\]/);
  for (const k of [0, 7, 29]) assert.ok(prompt.includes(`Person${pad(k)}`), `present person ${k} in the prompt`);
  assert.match(prompt, /campaign_character_s007/);
  assert.ok(prompt.length < 100_000, `narrator request stays within the transport bound (${prompt.length})`);
});
