import test from "node:test";
import assert from "node:assert/strict";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { buildSceneStateProjection, sceneExtrasOf } from "../src/turn/scene-state-projection.js";
import { focusedSceneStateProjection } from "../src/turn/scene-state-focus.js";
import { renderSceneStateProjection } from "../src/turn/scene-state-render.js";
import { backgroundGroundingOption } from "../src/turn/background-grounding.js";
import { SceneParticipants } from "../src/turn/scene-participants.js";
import { resolveTurnIntent, projectTurnIntent, type IntentStageInput } from "../src/turn/stages/intent.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { ContextBudgetManager } from "../src/turn/context-budget.js";
import { REQUEST_RESOURCE_CHARACTERS } from "../src/types/resource-limits.js";
import { LARGE_DEFAULT, RICH, largeScene, richScene } from "../src/dev/scene-foundation-fixtures.js";
import {
  LORE, SCENE_ELSEWHERE, SCENE_LOCATION, apply, createdPerson, fact, itemId, knows, makeItem, promptFor, sceneBlock, sceneFixture, type SceneOptions,
} from "../src/dev/scene-state-fixtures.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";

/**
 * Foundation certification: Scene State Projection as the integration boundary between independent authoritative subsystems and the
 * Narrator. Everything here is deterministic and offline, on the synthetic fixtures in src/dev (nothing under data/).
 */
type Rich = ReturnType<typeof richScene>;
const scene = (f: Rich, input: string, recent: readonly RecentExchange[] = []) => sceneBlock(promptFor(f.world, f.campaign, input, recent).text);
const ex = (player: string, narration: string): RecentExchange => ({ player, narration, status: "finalized" });
const MIXED = /\b(borrow(ed)?|stol(e|en)|lent|loan(ed)?|gift(ed)?|entrust(ed)?)\b/i;
const LEAK = [/campaign_item_/, /campaign_fact_/, /campaign_event_/, /campaign_character_/, /campaign_household_/, /\bcreated_revision\b/, /\.(png|webp|jpe?g)\b/i, /SECRET_VISUAL_SENTINEL/, /\bsprite\b/i];

// ------------------------------------------------------------------------------------------------ phase 3/4: snapshot + turn lifecycle
function stage(f: Rich, player_input: string) {
  const participants = new SceneParticipants(), finalized: RecentExchange[] = [];
  const input: IntentStageInput = { world: f.world, snapshot: f.campaign.exportSnapshot(), base_revision: f.campaign.revision, player_input,
    prepare: proposal => f.campaign.prepare(proposal), plan: (text, context) => participants.plan(text, context, finalized), finalized };
  const resolved = resolveTurnIntent(input);
  return { input, resolved, projected: projectTurnIntent(input, resolved) };
}

test("lifecycle: an item action is only a CANDIDATE; the narrator context is the committed BASE snapshot (pre-receipt truth)", () => {
  const f = sceneFixture({ id: "lifecycle_handover", commands: [{ kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE }] });
  apply(f.campaign, makeItem({ name: "Sword", owner_id: "nicco" }));
  const revision = f.campaign.revision, participants = new SceneParticipants(), finalized: RecentExchange[] = [];
  const input: IntentStageInput = { world: f.world, snapshot: f.campaign.exportSnapshot(), base_revision: revision, player_input: "I hand Brenna the sword.",
    prepare: proposal => f.campaign.prepare(proposal), plan: (text, context) => participants.plan(text, context, finalized), finalized };
  const resolved = resolveTurnIntent(input), projected = projectTurnIntent(input, resolved);
  assert.ok(resolved.intent.candidates.some(c => c.kind === "transfer_item"), "the handover is a candidate for the Controller");
  assert.equal(resolved.intent.runtime.length, 0, "...not a player-authored runtime effect");
  assert.equal(projected.projected, input.snapshot, "narration sees the committed snapshot");
  const text = buildNarratorPrompt("", projected.context, [], undefined, projected.prompt_intent, { knowledge_relevance_input: input.player_input }, projected.scene).messages[0]!.content;
  assert.match(sceneBlock(text), /Nicco carries Sword\./, "CURRENT SCENE is the state BEFORE the receipt");
  assert.doesNotMatch(sceneBlock(text), /Brenna carries Sword/);
  assert.equal(f.campaign.revision, revision, "nothing is committed during intent resolution");
  apply(f.campaign, { kind: "transfer_item", item_id: itemId(f.campaign, "Sword"), mode: "handoff", position: { kind: "carried", character_id: "brenna" } });
  assert.match(sceneBlock(promptFor(f.world, f.campaign, "Next turn.").text), /Brenna carries Sword; owner: Nicco\./, "the NEXT turn shows the committed transfer");
});

test("lifecycle: a player-authored runtime effect is projected ONCE into a detached snapshot and context + extras come from that same snapshot", () => {
  const f = richScene(), base = f.campaign.exportSnapshot(), revision = f.campaign.revision;
  const s = stage(f, "/mana -5");
  assert.notEqual(s.projected.projected, base, "a detached projected snapshot");
  assert.equal(f.campaign.revision, revision, "projection never commits");
  assert.equal(s.projected.projected.runtime.mana.current, base.runtime.mana.current - 5);
  const text = buildNarratorPrompt("", s.projected.context, [], undefined, s.projected.prompt_intent, { knowledge_relevance_input: "/mana -5" }, s.projected.scene).messages[0]!.content;
  assert.match(sceneBlock(text), /Mana: 75\/100/, "the projected (player-authored) state, not the stale base value");
  assert.match(promptFor(f.world, f.campaign, "Hello.").text, /Mana: 80\/100/, "the committed state is untouched");
  assert.ok(sceneExtrasOf(s.projected.context), "extras were registered for the context actually used by the narrator");
});

test("lifecycle: a mixed-revision scene is impossible by construction (one snapshot feeds the context, the extras and the projection)", () => {
  const f = richScene(), snapshot = f.campaign.exportSnapshot();
  const context = buildTurnContext(f.world, snapshot, { input: "Brenna?" });
  const first = buildSceneStateProjection(context);
  // The campaign moves on AFTER the context was built; the projection built from that context must not notice.
  apply(f.campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 90 } }, { kind: "set_condition", character_id: "brenna", conditions: [] });
  assert.deepEqual(buildSceneStateProjection(context), first);
  assert.equal(first.time.actual_time, "19:42");
  const fresh = buildSceneStateProjection(buildTurnContext(f.world, f.campaign.exportSnapshot(), { input: "Brenna?" }));
  assert.notEqual(fresh.time.actual_time, first.time.actual_time);
});

// ------------------------------------------------------------------------------------------------ phase 5: derived-only
test("derived-only: building, focusing and rendering mutate nothing and are deterministic", () => {
  const f = richScene(), revision = f.campaign.revision, before = JSON.stringify(f.campaign.exportSnapshot());
  const context = buildTurnContext(f.world, f.campaign.exportSnapshot(), { input: "Brenna, are you alright?" });
  const ctxBefore = JSON.stringify(context);
  const a = promptFor(f.world, f.campaign, "Brenna, are you alright?"), b = promptFor(f.world, f.campaign, "Brenna, are you alright?");
  assert.equal(a.text, b.text);
  const projection = buildSceneStateProjection(context), projectionJson = JSON.stringify(projection);
  const focused = focusedSceneStateProjection(projection, { background: new Set(), foreground: new Set(["brenna"]), input: "Brenna" });
  const r1 = renderSceneStateProjection(focused), r2 = renderSceneStateProjection(focused);
  assert.equal(r1.text, r2.text);
  assert.equal(JSON.stringify(projection), projectionJson, "focus + render do not mutate the projection");
  assert.equal(JSON.stringify(context), ctxBefore, "TurnContext is not mutated");
  assert.equal(f.campaign.revision, revision);
  assert.equal(JSON.stringify(f.campaign.exportSnapshot()), before, "knowledge, inventory, social and schedule are untouched");
  assert.ok(!/CURRENT SCENE|SceneState/i.test(before), "nothing of the projection is in the saveable snapshot");
});

// ------------------------------------------------------------------------------------------------ phases 6-7: the integration fixture
test("integration: ONE rich scene is correct across location, time, people, state, items, resources, knowledge, social, schedule and developments", () => {
  const f = richScene();
  const block = scene(f, "Brenna, are you alright? And why are you carrying my sword?");
  assert.match(block, /Location: Heartstone LR/);                                                       // 1
  assert.match(block, /Time: 19:42 — Evening/);                                                        // 2
  assert.match(block, /Present:\n- Nicco\n- Brenna\n- Gerome\n- Maren/);                              // 3
  assert.doesNotMatch(block, /Pellan|Korvin/);
  assert.match(block, /- Brenna is winded\./); assert.match(block, /- Maren has a minor injury\./);   // 4
  assert.match(block, /- Brenna carries Sword; owner: Nicco\./);                                       // 6
  assert.doesNotMatch(block, MIXED);                                                                    // 7
  assert.match(block, /- Nicco wears Wool cloak \(back\)\./);                                          // 8
  assert.ok((block.match(/Nicco carries /g) ?? []).length < 14, "ordinary carried inventory compacts");   // 10
  assert.match(block, /further carried items not listed/);
  assert.match(block, /- Letter is stored here; owner: Nicco\./);                                      // 11
  assert.doesNotMatch(block, /Cellar key/);                                                             // 12
  assert.match(block, /Mana: 80\/100/); assert.match(block, /Money: 4 Gold/);                          // 13-14
  assert.match(block, /Household Heartstone: keeper Nicco; members: Brenna, Maren/);                  // 17 (present members make it relevant)
  assert.doesNotMatch(block, new RegExp(RICH.rule));                                                    // rule not relevant to this input
  assert.match(block, /Brenna → Nicco: NEUTRAL \(trust low\)/);                                        // 18
  assert.doesNotMatch(block, /wariness/);                                                               // 19
  assert.match(block, /Supper with the household: in 1h 18m \(21:00, today\)/);                       // 20
  assert.doesNotMatch(block, /Harvest fair/);                                                           // 21
  assert.match(block, /Brenna toward Nicco: trust moved from none to low/);                           // 22
  assert.doesNotMatch(block, /Maren gained the condition "dazed"/);                                     // 23
  for (const re of LEAK) assert.doesNotMatch(block, re, String(re));                                    // 24-26
  assert.doesNotMatch(block, /Description: Wool cloak/);
});

test("integration: knowledge scopes stay distinct and a missing edge is not ignorance (rich scene, knowledge query)", () => {
  const block = scene(richScene(), "Brenna, what do you make of the grain tax, the bridge and the West Gate?");
  assert.match(block, /"The West Gate incident left two guards dead\.": known by Nicco, Brenna; no recorded knowledge entry for Gerome, Maren/);
  assert.match(block, /"The eastern bridge is closed\." \[the claim is false\]: known by Nicco; believed by Maren/);
  assert.match(block, /"The grain tax will double at harvest\." \[truth unestablished\]: known by Nicco; heard only as a rumor by Brenna/);
  assert.doesNotMatch(block, /does not know|doesn't know|is unaware|ignorant of|cannot know/i);
});

test("integration: the background NPC's state, the equipped item and a referenced carried item survive when the turn is about someone else", () => {
  const block = scene(richScene(), "Maren, can you show me your arm? I also want my brass compass.");
  assert.match(block, /- Brenna is winded\./, "background NPC state");
  assert.match(block, /Wool cloak/);
  assert.match(block, /Nicco carries Brass compass\./);
  assert.match(block, /Nicco carries Trinket/, "ordinary items can still be listed, but never required");
});

test("integration: the old duplicated blocks are gone from the whole narrator prompt", () => {
  const { text } = promptFor(...(() => { const f = richScene(); return [f.world, f.campaign, "Brenna?"] as const; })());
  assert.equal(text.split("\n").filter(l => l === "[CURRENT SCENE]").length, 1);
  assert.doesNotMatch(text, /\[SOCIAL STATE\]|\[CURRENT EQUIPMENT\]|\[CURRENT ITEMS\]|\[ITEMS\]/);
});

// ------------------------------------------------------------------------------------------------ phase 8: conflicts
test("conflict A: a recent transcript claiming Brenna holds a sword that is stored elsewhere never reaches CURRENT SCENE", () => {
  const f = sceneFixture({ commands: [{ kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE }] });
  apply(f.campaign, makeItem({ name: "Sword", owner_id: "nicco", position: { kind: "stored", location_id: SCENE_ELSEWHERE } }));
  const pf = promptFor(f.world, f.campaign, "Brenna, hand me the sword.", [ex("Hello.", "*Brenna is holding the sword and turns it in her hand.*")]);
  const text = `${pf.request.system_prompt}\n${pf.text}`, block = sceneBlock(pf.text);
  assert.doesNotMatch(block, /Sword/, "the sword is not here and not carried");
  assert.doesNotMatch(block, /Brenna (carries|holds)/);
  assert.match(text, /CURRENT STRUCTURED STATE overrides recent\/historical prose/);
});

test("conflict B: a development about a condition that was removed does not reassert it", () => {
  const f = richScene();
  apply(f.campaign, { kind: "set_condition", character_id: "brenna", conditions: [] });
  const block = scene(f, "Brenna, are you alright?");
  assert.doesNotMatch(block, /Brenna is winded|gained the condition "winded"/);
});

test("conflict C: a transcript saying it is morning does not change the runtime clock in CURRENT SCENE", () => {
  const block = scene(richScene(), "Good evening.", [ex("Good morning.", "*Morning light fills the room and the household is waking.*")]);
  assert.match(block, /Time: 19:42 — Evening/);
  assert.doesNotMatch(block, /morning/i);
});

test("conflict D: retrieved canon of an authored baseline never overrides runtime state, and stays out of CURRENT SCENE", () => {
  const f = richScene(), ctx = promptFor(f.world, f.campaign, "What is Brenna normally like?");
  const retrieval = { results: [{ entity_id: "lore_public", text: "RETRIEVAL_SENTINEL: Brenna is always healthy, never winded, and carries nothing." }] };
  const text = buildNarratorPrompt("What is Brenna normally like?", ctx.context, [], retrieval, ctx.intent).messages[0]!.content;
  assert.match(sceneBlock(text), /Brenna is winded/);
  assert.ok(!sceneBlock(text).includes("RETRIEVAL_SENTINEL"), "retrieval is not merged into scene truth");
  assert.ok(text.includes("RETRIEVAL_SENTINEL"), "it is still supplied as supplemental canon");
  assert.ok(text.indexOf("[CURRENT SCENE]") < text.indexOf("RETRIEVAL_SENTINEL"));
});

test("conflict E: prose claiming Brenna owns the sword loses to the CampaignItem owner", () => {
  const f = richScene();
  assert.match(scene(f, "Whose sword is it?", [ex("Hello.", "*Brenna says: 'This sword is mine, I have always owned it.'*")]), /Brenna carries Sword; owner: Nicco\./);
});

// ------------------------------------------------------------------------------------------------ phases 9-10: omission + reference survival
test("omission: omitted state is never declared nonexistent (carried items, households, facts established elsewhere)", () => {
  const f = sceneFixture({ commands: [{ kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE }] });
  apply(f.campaign, ...Array.from({ length: 20 }, (_, i) => makeItem({ name: `Odd${i}` })), { kind: "create_household", id: "campaign_household_far", name: "Faraway" },
    { kind: "set_membership", household_id: "campaign_household_far", membership: { character_id: "nicco", status: "member", role: "owner" } },
    fact("campaign_fact_shared", "The mill is old."), ...["nicco", "brenna", "maren", "gerome"].map(id => knows(id, "campaign_fact_shared")));
  const { text } = promptFor(f.world, f.campaign, "Good evening.");
  const block = sceneBlock(text);
  assert.match(block, /not listed/);
  assert.doesNotMatch(block, /no household|has no (other )?(items|possessions)|carries nothing|nothing else/i);
  assert.doesNotMatch(block, /Faraway/);
  assert.doesNotMatch(block, /mill is old/, "a fact every present person holds identically is not duplicated into the scene");
  assert.ok(text.includes("mill is old"), "...but it stays established in CHARACTER KNOWLEDGE ACCESS");
  assert.match(text, /absence from this block alone does not establish that something is false, absent or unknown/i);
});

test("reference survival: an otherwise droppable entity is shown when the turn names it", () => {
  const f = richScene();
  apply(f.campaign, ...Array.from({ length: 9 }, (_, i) => makeItem({ name: `Shelfitem${i}`, position: { kind: "stored", location_id: SCENE_LOCATION } })));
  assert.doesNotMatch(scene(f, "Good evening."), /Trinket11/);
  assert.match(scene(f, "Do I still have Trinket11?"), /Nicco carries Trinket11\./);                      // 20th-ish carried item
  assert.doesNotMatch(scene(f, "Good evening."), /Shelfitem8/);
  assert.match(scene(f, "Where is Shelfitem8?"), /Shelfitem8 is stored here/);                              // stored item
  assert.match(scene(f, "Is it fine to carry a sword to the table?"), new RegExp(RICH.rule));              // household rule
  assert.match(scene(f, "When is the Harvest fair?"), /Harvest fair/);                                      // distant event named
  assert.match(scene(f, "Brenna, what do you make of the grain tax?"), /grain tax will double/);          // fact queried
});

// ------------------------------------------------------------------------------------------------ phase 11: budget stress
test("budget stress: large combined scene is deterministic, bounded, whole-lined, leak-free and keeps never-drop truth", () => {
  const a = largeScene(), b = largeScene(), input = "Brenna, are you alright?";
  const pa = promptFor(a.world, a.campaign, input), pb = promptFor(b.world, b.campaign, input);
  assert.equal(pa.text, pb.text, "deterministic");
  const block = sceneBlock(pa.text);
  assert.ok(block.length <= 6_000, `bounded (${block.length})`);
  assert.match(block, /Location: Heartstone LR/); assert.match(block, /Time: 19:42 — Evening/);
  assert.match(block, /Mana: 80\/100/); assert.match(block, /Money: 4 Gold/);
  assert.match(block, /- Brenna carries Sword; owner: Nicco\./);
  assert.match(block, /- Brenna is winded\./);
  assert.match(block, /Wool cloak/);
  for (const line of block.split("\n")) assert.ok(!/[,;(—]$|\b(and|with|by|of|to)$/.test(line.trimEnd()), `no cut line: ${line}`);
  assert.doesNotMatch(block, /Seraph/);
  for (const sentinel of Object.values(LORE)) assert.ok(!block.includes(sentinel));
  for (const re of LEAK) assert.doesNotMatch(block, re);
  const request = pa.request, budget = new ContextBudgetManager().measure(request);
  assert.ok(JSON.stringify(request).length < REQUEST_RESOURCE_CHARACTERS, "inside the transport bound");
  assert.ok(budget, "context budget measurable");
  assert.ok(LARGE_DEFAULT.present > 0);
});

// ------------------------------------------------------------------------------------------------ phase 12: WeakMap lifecycle
test("WeakMap: production contexts carry extras, repeated projections agree, clones degrade safely, parallel contexts never cross-contaminate", () => {
  const f = richScene();
  apply(f.campaign, makeItem({ name: "Dagger", owner_id: "absent_korvin", position: { kind: "carried", character_id: "brenna" } }));
  const snap1 = f.campaign.exportSnapshot();
  const ctx1 = buildTurnContext(f.world, snap1, { input: "Brenna?" });
  assert.ok(sceneExtrasOf(ctx1));                                                                          // A
  assert.deepEqual(buildSceneStateProjection(ctx1), buildSceneStateProjection(ctx1));                      // B
  const clone = structuredClone(JSON.parse(JSON.stringify(ctx1)));                                         // C
  assert.equal(sceneExtrasOf(clone), undefined, "extras are object-identity scoped (documented)");
  const degraded = JSON.stringify(buildSceneStateProjection(clone));
  assert.ok(!degraded.includes("Korvin"), "no hidden-name leak in the degraded projection");
  apply(f.campaign, { kind: "set_condition", character_id: "maren", conditions: ["dazed"] }, { kind: "runtime_delta", delta: { time_advance_minutes: 30 } });
  const ctx2 = buildTurnContext(f.world, f.campaign.exportSnapshot(), { input: "Brenna?" });                // D
  assert.notEqual(sceneExtrasOf(ctx1), sceneExtrasOf(ctx2));
  assert.equal(buildSceneStateProjection(ctx1).time.actual_time, "19:42");
  assert.notEqual(buildSceneStateProjection(ctx2).time.actual_time, "19:42");
  assert.ok(buildSceneStateProjection(ctx2).character_state.some(s => s.name === "Maren" && s.conditions.includes("dazed")));
  assert.ok(!buildSceneStateProjection(ctx1).character_state.some(s => s.name === "Maren" && s.conditions.includes("dazed")), "the older context never sees the newer state");
});

// ------------------------------------------------------------------------------------------------ phases 13-14: identity and secrecy
test("identity/secrecy: unlearned names, confidential encounters and non-public canon leak through no section", () => {
  const f = richScene({ secrets: true, secretNpc: true, learn: ["brenna", "maren", "gerome"] });
  apply(f.campaign, makeItem({ name: "Dagger", owner_id: "absent_korvin", position: { kind: "carried", character_id: "brenna" } }),
    { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "absent_korvin", dimension: "wariness", direction: "raise" },
    { kind: "schedule_event", id: "campaign_event_korv", title: "Meeting with the cellar keeper", scheduled_world_minute: 1250, participants: ["nicco", "absent_korvin", "brenna"] },
    { kind: "move_character", character_id: "pellan", location_id: SCENE_LOCATION },
    { kind: "adjust_relationship", from_character_id: "pellan", to_character_id: "brenna", dimension: "trust", direction: "raise" });
  const block = scene(f, "Brenna, whose dagger is that? What about the meeting, and who is the stranger?");
  for (const hidden of ["Seraph", "Pellan", "Korvin", "absent_korvin", ...Object.values(LORE)]) assert.ok(!block.includes(hidden), hidden);
  assert.match(block, /owner: someone not present/);
  assert.match(block, /Meeting with the cellar keeper: in 1h 8m/);
  assert.match(block, /unfamiliar person/);
  const learned = richScene({ secrets: true, learn: ["brenna", "maren", "gerome", "pellan"] });
  apply(learned.campaign, { kind: "move_character", character_id: "pellan", location_id: SCENE_LOCATION });
  assert.match(scene(learned, "Who is here?"), /- Pellan/, "a learned name is disclosed");
});

// ------------------------------------------------------------------------------------------------ phase 15: duplication audit
test("duplication audit: every descriptive truth appears once in CURRENT SCENE; remaining overlaps are hard permission functions", () => {
  const f = richScene(), { text } = promptFor(f.world, f.campaign, "Brenna, are you alright?");
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  assert.equal(count(/Mana: 80\/100/g), 1);
  assert.equal(count(/Money: 4 Gold/g), 1);
  assert.equal(count(/Time: 19:42/g), 1);
  assert.equal(count(/Supper with the household/g), 1);
  assert.equal(count(/Household Heartstone/g), 1);
  assert.equal(count(/Brenna → Nicco/g), 1);
  assert.equal(count(/Brenna carries Sword/g), 1);
  assert.equal(count(/Wool cloak/g), 1);
});

// ------------------------------------------------------------------------------------------------ phase 16: CKA interaction
test("knowledge access: CURRENT SCENE lists facts as scene truth but the hard Character Knowledge Access gate is unchanged and separate", () => {
  const f = richScene(), pf = promptFor(f.world, f.campaign, "Brenna and Maren, what do you know about the West Gate incident?");
  const text = `${pf.request.system_prompt}\n${pf.text}`;
  const access = text.slice(text.indexOf("\n[CHARACTER KNOWLEDGE ACCESS]\n"));
  assert.ok(text.includes("[CHARACTER KNOWLEDGE ACCESS]"));
  assert.match(sceneBlock(text), /West Gate incident left two guards dead.*no recorded knowledge entry for Gerome, Maren/);
  assert.match(text, /a fact elsewhere in context is not usable by a character merely because it is present/);
  assert.ok(text.indexOf("[CURRENT SCENE]") < text.indexOf("\n[CHARACTER KNOWLEDGE ACCESS]\n"));
  // The access section remains the only place that grants usability: Maren has no usable West Gate entry there.
  assert.match(access, /Maren: CAN USE F1 \(believes\), H1 \(household_member\); DO NOT USE F2, F3/, "the hard gate still bars Maren from the West Gate fact");
  assert.match(access, /Brenna: CAN USE F2 \(heard_rumor\), F3 \(knows\)/);
  assert.match(sceneBlock(text), /Knowledge \(recorded entries only; having no entry is not proof a person is ignorant\)/);
});

// ------------------------------------------------------------------------------------------------ phases 17-18: retrieval and background grounding
test("retrieval: ordinary turns carry none; a canon turn adds it AFTER the scene, never into it, and grants no NPC knowledge", () => {
  const f = richScene(), plain = promptFor(f.world, f.campaign, "Good evening.");
  const retrieval = { results: [{ entity_id: "lore_public", text: "RETRIEVAL_SENTINEL The old wall was raised by the first smiths." }] };
  const request = buildNarratorPrompt("What do you know about the old wall?", plain.context, [], retrieval, plain.intent), withCanon = request.messages[0]!.content;
  assert.ok(!plain.text.includes("RETRIEVAL_SENTINEL"));
  assert.equal(sceneBlock(withCanon).includes("RETRIEVAL_SENTINEL"), false);
  assert.ok(withCanon.includes("RETRIEVAL_SENTINEL"));
  assert.match(`${request.system_prompt}\n${withCanon}`, /Narrator\/player access and retrieval grant no NPC access/);
  assert.equal(sceneBlock(withCanon).replace(/\s+/g, " ").length > 200, true);
});

test("background grounding: an opt-in separate block that never alters CURRENT SCENE", () => {
  const f = richScene(), input = "Brenna, where are you from?";
  const base = promptFor(f.world, f.campaign, input);
  const grounding = backgroundGroundingOption(f.world, base.context, input, []);
  assert.ok(grounding.background_grounding, "trigger fired");
  const grounded = buildNarratorPrompt(input, base.context, [], undefined, base.intent, { ...grounding });
  assert.equal(sceneBlock(grounded.messages[0]!.content), sceneBlock(base.text));
  assert.match(grounded.messages[0]!.content, /\[BACKGROUND GROUNDING/);
  // Next turn: the grounding block is not durable state, so a rebuilt scene contains nothing of it.
  assert.doesNotMatch(scene(f, "Good evening."), /BACKGROUND GROUNDING|Named places that exist/);
});

// ------------------------------------------------------------------------------------------------ phase 19: save/load
test("save/load: logical scene equality after a JSON round trip; nothing of the projection or its extras is persisted", () => {
  const f = richScene(), input = "Brenna, are you alright? What about the West Gate?";
  const before = scene(f, input), saved = JSON.stringify(f.campaign.exportSnapshot());
  assert.ok(!/CURRENT SCENE|item_labels|scene_extras|SceneState/.test(saved));
  const restored = CampaignState.restore(f.world, JSON.parse(saved));
  assert.equal(sceneBlock(promptFor(f.world, restored, input).text), before);
});

// ------------------------------------------------------------------------------------------------ phase 20: multi-turn offline sequence
test("multi-turn: CURRENT SCENE follows committed truth revision by revision and keeps nothing stale", () => {
  const f = sceneFixture({ id: "multi_turn", commands: [{ kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE }] });
  const c = f.campaign, look = () => scene({ world: f.world, campaign: c } as Rich, "Brenna, are you alright? The sword, the letter and the West Gate?");
  apply(c, makeItem({ name: "Sword", owner_id: "nicco" }));                                              // T0: Nicco carries it
  assert.match(look(), /Nicco carries Sword\./); assert.doesNotMatch(look(), /Brenna carries/);
  apply(c, { kind: "transfer_item", item_id: itemId(c, "Sword"), mode: "handoff", position: { kind: "carried", character_id: "brenna" } });   // T1
  const t1 = look();
  assert.match(t1, /Brenna carries Sword; owner: Nicco\./); assert.doesNotMatch(t1, /Nicco carries Sword/); assert.doesNotMatch(t1, MIXED);
  apply(c, { kind: "set_condition", character_id: "brenna", conditions: ["winded"] });                   // T2
  assert.match(look(), /Brenna is winded\./);
  apply(c, makeItem({ name: "Letter", owner_id: "nicco", position: { kind: "stored", location_id: SCENE_LOCATION } }));   // T3
  assert.match(look(), /Letter is stored here; owner: Nicco\./);
  apply(c, fact("campaign_fact_late", "The mill burned down."), knows("nicco", "campaign_fact_late"), knows("brenna", "campaign_fact_late"));   // T4
  const t4 = look();
  assert.match(t4, /"The mill burned down\.": known by Nicco, Brenna/);
  assert.match(t4, /Brenna carries Sword; owner: Nicco\./, "earlier truths persist while still true");
  apply(c, { kind: "set_condition", character_id: "brenna", conditions: [] }, { kind: "transfer_item", item_id: itemId(c, "Sword"), mode: "return", position: { kind: "carried", character_id: "nicco" } } as never);
  const t5 = look();
  assert.doesNotMatch(t5, /Brenna is winded/); assert.doesNotMatch(t5, /Brenna carries Sword/); assert.match(t5, /Nicco carries Sword\./);
});

// ------------------------------------------------------------------------------------------------ misc: bonus checks used by the report
test("prompt-level sanity: the player's authored intent never inserts a transfer into CURRENT SCENE before it is committed", () => {
  const f = sceneFixture({ commands: [{ kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE }] });
  apply(f.campaign, makeItem({ name: "Sword", owner_id: "nicco" }));
  const input = "*hands Brenna the sword*", p = promptFor(f.world, f.campaign, input);
  assert.ok(playerIntent(input, p.context, p.snapshot, f.world).candidates.some(c => c.kind === "transfer_item"));
  assert.match(sceneBlock(p.text), /Nicco carries Sword\./, "pre-receipt truth");
  assert.doesNotMatch(sceneBlock(p.text), /Brenna carries Sword/);
  assert.match(p.text, /Player-directed|hand|give/i);
  void createdPerson; void ({} as SceneOptions); void learnCanonicalName;
});
