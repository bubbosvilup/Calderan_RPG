import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext, type TurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, NARRATOR_SYSTEM } from "../src/turn/prompt-builder.js";
import { projectKnowledgeAccess, renderKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { retrieveForTurn } from "../src/turn/retrieval-policy.js";
import { MAX_SCENE_PARTICIPANTS, SceneParticipants, type SceneParticipantPlan } from "../src/turn/scene-participants.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { checkEphemeralAuthority } from "../src/dev/narrative-checks.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { GenerationRequest } from "../src/llm/types.js";
import { collect, metadata } from "./turn-fixtures.js";

const SLAVE_PEN = "*stops an ordinary passer-by* \"Excuse me, where is the slave pen?\"";
const LIGHT_MAGE = "*ignores the answer* \"Tell me what you know about me being a Light mage.\"";
const opening = async () => { const world = await loadWorld("data"), campaign = createOpeningCampaign(world, "p1p"); return { world, campaign, context: buildTurnContext(world, campaign.exportSnapshot()) }; };
const noIntent = { candidates: [], runtime: [] };
const rows = (context: TurnContext, retrieval: unknown, plan?: SceneParticipantPlan) => renderKnowledgeAccess(projectKnowledgeAccess(context, retrieval, undefined, plan));
const retrieved = (...entries: [string, string?][]) => ({ records: [], awareness: entries.map(([id, awareness]) => ({ id, narrator_access: true, player_access: true, known_by_present_npcs: [], ...(awareness ? { awareness } : {}) })) });
/** Plan and commit one turn; returns the plan. */
const step = (sp: SceneParticipants, input: string, context: TurnContext, narration = "The scene continues.") => { const plan = sp.plan(input, context); sp.commit(plan, narration); return plan; };

test("creation: an interaction verb plus an indefinite role creates one deterministic participant; no name, occupation or history invented", async () => {
  const { context } = await opening(), sp = new SceneParticipants();
  const plan = step(sp, SLAVE_PEN, context);
  assert.deepEqual(plan.participants.map(p => ({ id: p.id, ref: p.ref, role: p.role, display_name: p.display_name, standing: p.standing, locality: p.locality, descriptor: p.descriptor })),
    [{ id: "scene_npc_1", ref: "P1", role: "passer_by", display_name: "Passer-by", standing: "ordinary_local", locality: ["heartstone_square", "calderan_west", "calderan", "west", "continent"], descriptor: undefined }]);
  for (const input of ["Where is the slave market?", "Hello there.", "*walks toward the tower door*"]) assert.equal(new SceneParticipants().plan(input, context).created, null, input);
  assert.equal(new SceneParticipants().plan("*approaches a foreign merchant*", context).participants[0]!.standing, "foreign");
  assert.equal(new SceneParticipants().plan("*waves at a traveler*", context).participants[0]!.standing, "foreign");
});
test("knowledge matrix: ordinary local × local canon permitted; × Nicco-private forbidden; foreigner × local not granted; persistent edge rules kept", async () => {
  const { context } = await opening();
  const local = new SceneParticipants().plan(SLAVE_PEN, context), foreign = new SceneParticipants().plan("*approaches a foreign traveler* \"Where is the slave market?\"", context);
  const r = retrieved(["calderan_slave_market", "local:calderan"], ["calderan", "public"]);
  assert.match(rows(context, r, local), /P1 Passer-by \(temporary, ordinary local\): CAN USE R1 \(local:calderan\), R2 \(public\); DO NOT USE F1, F2, H1\n/);
  assert.match(rows(context, r, foreign), /P1 Traveler \(temporary, not local\): CAN USE R2 \(public\); DO NOT USE F1, F2, R1, H1\n/);
  const withEdge = turnFixture(false, { brennaKnowsBridge: true }), without = turnFixture();
  assert.match(rows(buildTurnContext(withEdge.world, withEdge.campaign.exportSnapshot()), {}), /Brenna: CAN USE F1 \(knows\)/);
  assert.match(rows(buildTurnContext(without.world, without.campaign.exportSnapshot()), {}), /Brenna: CAN USE none; DO NOT USE F1/);
  // Persistent NPCs gain public scope; local scope needs an authored home inside the location (none in the fixture).
  assert.match(rows(buildTurnContext(without.world, without.campaign.exportSnapshot()), r), /Brenna: CAN USE R2 \(public\); DO NOT USE F1, R1/);
});
test("retrieval is not knowledge: specialized, private and unclassified retrieved canon stay DO NOT USE for an ordinary participant", async () => {
  const { world, context } = await opening(), service = new RetrievalService(world), search = { search: new HybridSearch(service), service };
  const plan = new SceneParticipants().plan(SLAVE_PEN, context);
  const subschools = await retrieveForTurn("What are magical subschools?", context, world, search);
  assert.ok((subschools.diagnostics.ids as readonly string[]).includes("magic_subschools"));
  const ref = projectKnowledgeAccess(context, subschools.data, undefined, plan).facts.find(f => f.id === "magic_subschools")!.ref;
  const participant = projectKnowledgeAccess(context, subschools.data, undefined, plan).characters.find(c => c.kind === "ephemeral")!;
  assert.ok(participant.do_not_use.includes(ref)); assert.ok(!participant.can_use.some(u => u.ref === ref));
  assert.match(rows(context, retrieved(["nicco", "private"], ["heartstone_square"]), plan), /P1 Passer-by \(temporary, ordinary local\): CAN USE none; DO NOT USE F1, F2, R1, R2, H1/);
  assert.match(rows(context, retrieved(["nicco", "private"]), plan), /Narration and Nicco \(player\): F1, F2, R1, H1\./, "narrator access is unchanged (plus the Repair 1 household fact)");
});
test("lifetime: departure plus a non-addressing turn expires; continued speech keeps the partner; scene change and inactivity expire", async () => {
  const { context } = await opening(), sp = new SceneParticipants();
  step(sp, SLAVE_PEN, context, "The passer-by, a middle-aged woman, answers. With that, she continues on her path.");
  assert.equal(sp.active()[0]!.departed, true);
  const continued = step(sp, LIGHT_MAGE, context);
  assert.deepEqual([continued.focus, continued.expired], ["scene_npc_1", []], "explicit continued address prefers continuity");
  step(sp, "*waves* \"Goodbye.\"", context, "The passer-by nods and walks away down the square.");
  const gone = step(sp, "*looks up at the tower windows*", context);
  assert.deepEqual([gone.participants, gone.expired], [[], ["scene_npc_1"]]);
  const idle = new SceneParticipants(); step(idle, SLAVE_PEN, context);
  assert.equal(step(idle, "*looks up at the tower windows*", context).participants.length, 1, "one idle turn is tolerated");
  assert.deepEqual(step(idle, "*studies the door*", context).expired, ["scene_npc_1"]);
  const moved = new SceneParticipants(); step(moved, SLAVE_PEN, context);
  const world = await loadWorld("data"), indoors = new CampaignState(world, "indoors", { player_location: "heartstone_lr", world_time: { world_minute: 0 } });
  assert.deepEqual(moved.plan("\"Hello?\"", buildTurnContext(world, indoors.exportSnapshot())).expired, ["scene_npc_1"]);
});
test("capacity: bounded; overflow evicts the least recently addressed unaddressed participant, else creates nobody", async () => {
  const { context } = await opening(), sp = new SceneParticipants();
  step(sp, "*approaches a guard*", context);
  step(sp, "*approaches a merchant* while the guard waits", context);
  step(sp, "*approaches a customer* as the guard and the merchant look on", context);
  const full = step(sp, "*approaches a porter* while the guard, the merchant and the customer listen", context);
  assert.equal(full.participants.length, MAX_SCENE_PARTICIPANTS);
  const evicted = step(sp, "*approaches a stranger* while the guard, the merchant and the customer listen", context);
  assert.deepEqual(evicted.expired, ["scene_npc_4"]); assert.equal(evicted.created, "scene_npc_5");
  const refused = sp.plan("*approaches a child* while the guard, the merchant, the customer and the stranger listen", context);
  assert.equal(refused.created, null); assert.equal(refused.participants.length, MAX_SCENE_PARTICIPANTS);
});
test("descriptor continuity: only a narrated appositive is captured, first one wins, nothing guessed", async () => {
  const { context } = await opening();
  const a = new SceneParticipants(); step(a, SLAVE_PEN, context, "The passer-by, a middle-aged woman carrying a bundle, slows.");
  step(a, LIGHT_MAGE, context, "The passer-by, a thin man, laughs.");
  assert.equal(a.active()[0]!.descriptor, "middle-aged woman");
  const b = new SceneParticipants(); step(b, SLAVE_PEN, context, "The passer-by blinks. A dockworker shouts somewhere.");
  assert.equal(b.active()[0]!.descriptor, undefined);
  const c = new SceneParticipants(); step(c, SLAVE_PEN, context, "The passer-by—a thin man in a worn coat carrying a parcel under one arm—stops.");
  assert.equal(c.active()[0]!.descriptor, "thin man");
  const prompt = buildNarratorPrompt("\"Still there?\"", context, [], {}, noIntent, {}, a.plan("\"Still there?\"", context)).messages[0]!.content;
  assert.match(prompt, /\[SCENE PARTICIPANTS\][\s\S]*P1 - Passer-by \(current conversation partner\)\. Temporary; ordinary local of Calderan West District\. Established: middle-aged woman\./);
  assert.ok(!prompt.includes("scene_npc_1"), "implementation IDs never reach the narrator");
});

function scripted(narrations: readonly string[], seen: GenerationRequest[]): NarratorProvider {
  let i = 0;
  return { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = narrations[Math.min(i++, narrations.length - 1)]!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
}
test("5-turn coordinator continuity: same participant, stable descriptor, correct replay speaker, no promotion or durable mutation", async () => {
  const { world, campaign } = await opening(), service = new RetrievalService(world), seen: GenerationRequest[] = [];
  const narrations = [
    "The passer-by, a middle-aged woman carrying a cloth-wrapped bundle, slows. \"The slave market? West District,\" she says.",
    "The passer-by frowns. \"I know nothing about you.\" She shifts her bundle.",
    "\"All my life,\" she says, glancing at the tower.",
    "The woman shrugs. \"Grey skies again.\"",
    "The passer-by nods. \"Mind yourself, then.\"",
  ];
  const coordinator = new TurnCoordinator(world, scripted(narrations, seen), { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const inputs = [SLAVE_PEN, LIGHT_MAGE, "\"Have you lived here long?\"", "*nods* \"And the weather?\"", "\"Thank you.\""];
  for (const [i, input] of inputs.entries()) {
    const last = (await collect(coordinator.runTurn({ campaign, player_input: input }))).at(-1)!;
    assert.equal(last.type, "turn_completed");
    const result = last.type === "turn_completed" ? last.result : undefined!;
    assert.deepEqual(result.scene_participants!.after.map(p => [p.id, p.role, p.descriptor]), [["scene_npc_1", "passer_by", "middle-aged woman"]], `turn ${i + 1}`);
    assert.equal(result.scene_participants!.plan.focus, "scene_npc_1");
    assert.equal(result.final_revision, 1); assert.deepEqual(result.authorized_commands, []);
    const prompt = seen.at(-1)!.messages[0]!.content;
    assert.match(prompt, /P1 Passer-by \(temporary, ordinary local\): CAN USE [^\n]*DO NOT USE F1, F2/);
    if (i > 0) { assert.match(prompt, /Established: middle-aged woman/); assert.match(prompt, /"P1 Passer-by: \\"/); assert.ok(!prompt.includes("Nicco: \\\""), `turn ${i + 1}`); }
  }
  const snapshot = JSON.stringify(campaign.exportSnapshot());
  assert.equal(campaign.exportSnapshot().characters.length, 0, "never promoted to CampaignState"); assert.ok(!snapshot.includes("scene_npc"));
});
test("a failed turn discards its participant plan", async () => {
  const { world, campaign } = await opening(), service = new RetrievalService(world);
  const failing: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: "The passer-by" }; throw new Error("boom"); } };
  const coordinator = new TurnCoordinator(world, failing, { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  assert.equal((await collect(coordinator.runTurn({ campaign, player_input: SLAVE_PEN }))).at(-1)!.type, "turn_failed");
  assert.deepEqual(coordinator.participants(campaign).active(), []);
});
test("prompt policy: routes, institutions, rumors/derived claims and Nicco's mental state; the context adds no route data", async () => {
  for (const rule of ["Knowing a place is not knowing a route", "never invent institutions", "never invent rumors, public talk or claims that imply a fact", "Never assert that Nicco knows, realizes, remembers, decides, suspects, understands, intends, feels"])
    assert.ok(NARRATOR_SYSTEM.includes(rule), rule);
  const { world, context } = await opening(), service = new RetrievalService(world);
  const r = await retrieveForTurn(SLAVE_PEN, context, world, { search: new HybridSearch(service), service });
  assert.deepEqual((r.data.records[0] as { connections?: unknown }).connections ?? [], []);
  const prompt = buildNarratorPrompt(SLAVE_PEN, context, [], r.data, noIntent, {}, new SceneParticipants().plan(SLAVE_PEN, context)).messages[0]!.content;
  assert.ok(!/\b(?:gate|turn left|turn right|streets? that way|route:)\b/i.test(prompt));
  assert.match(prompt, /DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact/);
  const flags = (s: string) => checkEphemeralAuthority(s).map(f => f.category);
  assert.deepEqual(flags("…leaving Nicco with directions to a market he now knows lies in the West District."), ["player_internal_state_candidate"]);
  assert.deepEqual(flags("Nicco hears the directions. Nicco sees the crowd."), []);
  assert.deepEqual(flags("\"Follow the main way toward the western gate.\""), ["invented_route_candidate"]);
  assert.deepEqual(flags("\"Heard rumors there's one about.\" The Constabulary is near."), ["rumor_or_public_talk_candidate", "non_canon_institution_candidate"]);
});
test("player retrieval de-duplication: Nicco's own entity is dropped only when the player profile already carries it", async () => {
  const { world, context } = await opening(), service = new RetrievalService(world), search = { search: new HybridSearch(service), service };
  const withProfile = await retrieveForTurn(LIGHT_MAGE, context, world, search);
  const ids = withProfile.diagnostics.ids as readonly string[]; assert.ok(!ids.includes("nicco")); assert.ok(ids.includes("light_and_shadow"));
  const withoutProfile = await retrieveForTurn(LIGHT_MAGE, { ...context, player_profile: null }, world, search);
  // Without the profile Nicco's own record is retrieved; the de-duplication is the only difference between the two results.
  const without = withoutProfile.diagnostics.ids as readonly string[];
  assert.ok(without.includes("nicco"));
  assert.deepEqual(without.filter(id => id !== "nicco"), ids.slice(0, without.length - 1));
});
test("awareness schema: public/specialized/private/local:<location> only; local targets must be locations", async () => {
  const { WorldStore } = await import("../src/world/world-store.js");
  const { location, character, document } = await import("./fixtures.js");
  const build = (awareness: unknown) => { const place = location("town"), who = character("someone", "town"); who.knowledge = { visibility: { narrator: true, player: true }, known_by: [], awareness } as never; return new WorldStore([place, who].map(e => ({ source: `${e.id}.yaml`, document: document(e) }))); };
  for (const ok of ["public", "specialized", "private", "local:town"]) assert.doesNotThrow(() => build(ok), ok);
  for (const bad of ["everyone", "local:", "local:missing", "local:someone", 3]) assert.throws(() => build(bad), String(bad));
});
