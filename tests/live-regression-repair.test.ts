import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { buildNarratorPrompt, NARRATOR_SYSTEM } from "../src/turn/prompt-builder.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { verifyEvidence } from "../src/turn/evidence-authorization.js";
import { auditNarration } from "../src/turn/narration-audit.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { retrieveForTurn } from "../src/turn/retrieval-policy.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { StateControllerProvider } from "../src/llm/state-controller-provider.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Live NPC Regression Repair 1: deterministic cases derived from docs/evaluations/archive/CALDERAN_LIVE_NPC_REGRESSION_1.md. */
const RETURN_INPUT = "Thanks *he said to them, after which he decides to give them back the boots*\nYou'll need them more than me";
const BOOTS = "campaign_item_repair_boots";
const world = await loadWorld("data");
const boots = (owner: string, position: Record<string, unknown> = { kind: "carried", character_id: owner }, acquisition?: Record<string, unknown>, id = BOOTS, name = "pair of leather boots"): CampaignCommand =>
  ({ kind: "register_item", item: { id, origin: { kind: "created" }, name, owner_id: owner, position, ...(acquisition ? { acquisition } : {}) } }) as unknown as CampaignCommand;
function scene(npcs: readonly string[], extra: readonly CampaignCommand[] = [], at = "heartstone_square") {
  const campaign = createOpeningCampaign(world, `repair1_${npcs.join("_") || "alone"}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { ...(at === "heartstone_square" ? {} : { player_location: at }), character_movements: npcs.map(id => ({ character_id: id, current_location: at })) } }, ...extra] });
  return campaign;
}
function narrator(texts: readonly string[], seen: GenerationRequest[] = []): NarratorProvider {
  let i = 0;
  return { async generate() { throw new Error("unused"); }, async *stream(request) {
    seen.push(request); const text = texts[Math.min(i++, texts.length - 1)]!;
    yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } };
  } };
}
const controller = (commands: readonly CampaignCommand[] = [], evidence?: readonly string[]): StateControllerProvider => ({ async propose() { return { commands: [...commands], ...(evidence ? { evidence: [...evidence] } : {}), ...metadata }; } });
async function run(campaign: CampaignState, input: string, texts: readonly string[], commands: readonly CampaignCommand[] = [], evidence?: readonly string[], seen: GenerationRequest[] = []) {
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, narrator(texts, seen), controller(commands, evidence), { service, search: new HybridSearch(service) });
  const events = await collect(coordinator.runTurn({ campaign, player_input: input }));
  const last = events.at(-1)!;
  assert.equal(last.type, "turn_completed", JSON.stringify(last));
  return { result: (last as { result: TurnResult }).result, events, delivered: events.filter(e => e.type === "narration_delta").map(e => (e as { text: string }).text).join("") };
}
const item = (campaign: CampaignState, id = BOOTS) => campaign.exportSnapshot().items.filter(i => i.id === id);
const inbound: CampaignCommand = { kind: "transfer_item", item_id: BOOTS, owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } };
const toKorvin: CampaignCommand = { kind: "transfer_item", item_id: BOOTS, owner_id: "korvin", position: { kind: "carried", character_id: "korvin" } };
const intentOf = (campaign: CampaignState, input: string) => playerIntent(input, buildTurnContext(world, campaign.exportSnapshot()), campaign.exportSnapshot(), world);

// ---------------------------------------------------------------------------------------------------------------- transfers
test("A: an NPC offer the player has not accepted is not a transfer; the NPC keeps the exact item", async () => {
  const campaign = scene(["korvin"], [boots("korvin")]);
  const intent = intentOf(campaign, "Korvin offers Nicco a pair of leather boots.");
  assert.deepEqual(intent.candidates, []);
  assert.deepEqual(intent.natural!.actions.map(a => [a.kind, a.status]), [["npc_offer", "awaiting_player_acceptance"]]);
  // Even a controller proposal cannot commit it: there is no player intent to realize.
  const { result } = await run(campaign, "Korvin offers Nicco a pair of leather boots.", ["Korvin holds the boots out toward Nicco."], [inbound]);
  assert.equal(result.authorization[0]!.authorized, false);
  assert.deepEqual(item(campaign).map(i => [i.owner_id, i.position]), [["korvin", { kind: "carried", character_id: "korvin" }]]);
});
test("B: an NPC gives an item and the handover is narrated: exact NPC → Nicco transfer with provenance, no clone", async () => {
  const campaign = scene(["korvin"], [boots("korvin")]);
  const intent = intentOf(campaign, "Korvin gives Nicco a pair of leather boots.");
  assert.deepEqual(intent.candidates, [inbound]);
  const { result } = await run(campaign, "Korvin gives Nicco a pair of leather boots.", ["Korvin hands the boots to Nicco without ceremony."], [inbound]);
  assert.equal(result.authorization[0]!.authorized, true);
  const [boot] = item(campaign);
  assert.equal(item(campaign).length, 1); assert.equal(campaign.exportSnapshot().items.length, 1);
  assert.equal(boot!.owner_id, "nicco"); assert.deepEqual(boot!.position, { kind: "carried", character_id: "nicco" });
  assert.deepEqual(boot!.acquisition, { acquisition_kind: "gift", from_character_id: "korvin", acquired_at: 0 });
  // Nicco's own receipt also establishes it.
  const second = scene(["korvin"], [boots("korvin")]);
  await run(second, "*he takes the boots from Korvin*", ["Nicco takes the boots from Korvin."], [inbound]);
  assert.equal(item(second)[0]!.owner_id, "nicco");
});
test("B guard: inbound transfers need a present holder who owns the item; no remote or carrier-only transfer", async () => {
  const remote = scene([], [boots("korvin")]); // Korvin is at the slave market, not here.
  assert.deepEqual(intentOf(remote, "Korvin gives Nicco a pair of leather boots.").candidates, []);
  const carrierOnly = scene(["korvin"], [boots("mistress_elara", { kind: "carried", character_id: "korvin" })]);
  assert.deepEqual(intentOf(carrierOnly, "Korvin gives Nicco a pair of leather boots.").candidates, []);
  const { result } = await run(carrierOnly, "Hello.", ["Korvin nods."], [inbound]);
  assert.equal(result.authorization[0]!.reason, "rejected_reference_invalid");
});
test("C: Nicco gives an item and the NPC accepts: transfer", async () => {
  const campaign = scene(["korvin"], [boots("nicco")]);
  await run(campaign, "*he gives the boots to Korvin*", ["Korvin takes the boots."], [toKorvin], ["Korvin takes the boots."]);
  assert.deepEqual(item(campaign).map(i => [i.owner_id, i.position]), [["korvin", { kind: "carried", character_id: "korvin" }]]);
});
test("D: Nicco offers an item and the NPC refuses: Nicco keeps it, and narration stays consistent", async () => {
  const campaign = scene(["korvin"], [boots("nicco")]);
  const { result, delivered } = await run(campaign, "*he gives the boots to Korvin*", ["Korvin refuses the boots. \"Keep them.\""], [toKorvin], ["Korvin refuses the boots."]);
  assert.equal(result.authorization[0]!.authorized, false);
  assert.equal(item(campaign)[0]!.owner_id, "nicco");
  assert.equal(result.narration_reconciliation!.delivered, "draft"); assert.match(delivered, /Keep them/);
});
test("E: the original give-back phrasing resolves the exact item and the giver as recipient", async () => {
  const campaign = scene(["korvin"], [boots("nicco", undefined, { acquisition_kind: "gift", from_character_id: "korvin", acquired_at: 0 })]);
  const intent = intentOf(campaign, RETURN_INPUT);
  assert.deepEqual(intent.candidates, [toKorvin]);
  assert.equal(intent.natural!.actions.find(a => a.kind === "offer")!.detail.form, "give_back");
  for (const form of ["*he gives them back*", "*he gives the boots back*", "*he returns the boots*", "*he hands them back to Korvin*", "*he gives back the boots to Korvin*", "*he offers them back*", "*he tries to return them*"])
    assert.deepEqual(intentOf(campaign, form).candidates, [toKorvin], form);
  // Accepted return commits; refused return keeps Nicco's ownership.
  await run(campaign, RETURN_INPUT, ["Korvin takes the boots back with a grunt."], [toKorvin], ["Korvin takes the boots back with a grunt."]);
  assert.equal(item(campaign)[0]!.owner_id, "korvin");
  const refused = scene(["korvin"], [boots("nicco", undefined, { acquisition_kind: "gift", from_character_id: "korvin", acquired_at: 0 })]);
  const { delivered } = await run(refused, RETURN_INPUT, ["Korvin pushes the boots back. \"I said keep them.\""]);
  assert.equal(item(refused)[0]!.owner_id, "nicco"); assert.match(delivered, /keep them/);
});
test("F: negated, hedged or hypothetical give-back never transfers", async () => {
  const campaign = scene(["korvin"], [boots("nicco", undefined, { acquisition_kind: "gift", from_character_id: "korvin", acquired_at: 0 })]);
  for (const input of ["*he doesn't give them back*", "*he thinks about giving them back*", "*he almost gives them back*", "*I don't give them back*", "*he would give them back if he could*", "\"I'll give them back later.\""])
    assert.deepEqual(intentOf(campaign, input).candidates, [], input);
});
test("G: ambiguous give-back with several plausible items or recipients is never guessed", async () => {
  const from = { acquisition_kind: "gift", from_character_id: "korvin", acquired_at: 0 };
  const twoItems = scene(["korvin"], [boots("nicco", undefined, from), boots("nicco", undefined, from, "campaign_item_repair_belt", "leather belt")]);
  const a = intentOf(twoItems, "*he gives them back*");
  assert.deepEqual(a.candidates, []); assert.equal(a.natural!.actions[0]!.status, "ambiguous");
  const twoPeople = scene(["korvin", "mistress_elara"], [boots("nicco")]);
  const b = intentOf(twoPeople, "*he gives them back*");
  assert.deepEqual(b.candidates, []); assert.equal(b.natural!.actions[0]!.status, "ambiguous");
  // Naming the recipient or item removes the ambiguity.
  assert.deepEqual(intentOf(twoPeople, "*he hands them back to Korvin*").candidates, [toKorvin]);
});
test("H: transferring an equipped item unequips it atomically: no ghost equipment, no duplicate", async () => {
  const campaign = scene(["korvin"], [boots("nicco", { kind: "equipped", character_id: "nicco", slot: "feet", mode: "worn" })]);
  await run(campaign, "*he gives the boots to Korvin*", ["Korvin takes the boots."], [toKorvin], ["Korvin takes the boots."]);
  const s = campaign.exportSnapshot();
  assert.equal(s.items.length, 1); assert.equal(s.items[0]!.owner_id, "korvin"); assert.deepEqual(s.items[0]!.position, { kind: "carried", character_id: "korvin" });
  assert.equal(s.items.filter(i => i.position.kind === "equipped").length, 0);
  assert.deepEqual(s.characters.find(c => c.id === "nicco")!.current.empty_slots, ["feet"]);
});

// -------------------------------------------------------------------------------------------------- narration/state coherence
test("I: a rejected transfer cannot be delivered as successful narration (revision, then deterministic fallback)", async () => {
  // Controller omits the proposal: the draft's acceptance is not state. The revision matches the resolved outcome.
  const revised = scene(["korvin"], [boots("nicco")]), seen: GenerationRequest[] = [];
  const a = await run(revised, "*he gives the boots to Korvin*", ["Korvin takes the boots.", "Korvin looks at the boots and leaves them in Nicco's hands."], [], undefined, seen);
  assert.equal(item(revised)[0]!.owner_id, "nicco");
  assert.equal(a.result.narration_reconciliation!.delivered, "revision");
  assert.doesNotMatch(a.delivered, /takes the boots/); assert.equal(a.result.narration, a.delivered);
  assert.match(seen[1]!.messages.at(-1)!.content, /NOT COMMITTED: pair of leather boots did not change hands; it stays with Nicco/);
  // A narrator that repeats the error is redacted deterministically, with the authoritative outcome stated.
  const stubborn = scene(["korvin"], [boots("nicco")]);
  const b = await run(stubborn, "*he gives the boots to Korvin*", ["Korvin grins. Korvin takes the boots."]);
  assert.equal(b.result.narration_reconciliation!.delivered, "redacted");
  assert.doesNotMatch(b.delivered, /takes the boots/); assert.match(b.delivered, /Korvin grins\./); assert.match(b.delivered, /stays with Nicco/);
  // The delivered text is the only narration event, and it is released after authorization.
  assert.deepEqual(b.events.map(e => e.type), ["turn_started", "controller_started", "state_proposed", "narration_delta", "narration_completed", "state_committed", "turn_completed"]);
});
test("I: an inbound gift the engine could not commit is never narrated as received", async () => {
  const campaign = scene(["korvin"], [boots("korvin")]);
  const { delivered } = await run(campaign, "Korvin offers Nicco a pair of leather boots.", ["Korvin hands the boots to Nicco."]);
  assert.equal(item(campaign)[0]!.owner_id, "korvin"); assert.doesNotMatch(delivered, /hands the boots to Nicco/); assert.match(delivered, /stays with Korvin/);
});

test("I: a turn that fails after narration exposes no unaudited draft and commits nothing", async () => {
  const campaign = scene(["korvin"], [boots("korvin")]), before = campaign.exportSnapshot();
  const service = new RetrievalService(world);
  const failing: StateControllerProvider = { async propose() { throw new Error("timeout"); } };
  const events = await collect(new TurnCoordinator(world, narrator(["Korvin hands the boots to Nicco."]), failing, { service, search: new HybridSearch(service) }).runTurn({ campaign, player_input: "Korvin gives Nicco a pair of leather boots." }));
  const last = events.at(-1)!;
  assert.equal(last.type, "turn_failed"); assert.equal((last as { narration: string }).narration, "");
  assert.ok(!events.some(e => e.type === "narration_delta")); assert.equal(campaign.exportSnapshot(), before);
});

// ------------------------------------------------------------------------------------------------------- evidence pairs
test("evidence verifier: ordinary receipt language passes; negation, hedges, retreats and instructions fail", () => {
  const nicco = scene(["korvin"], [boots("nicco")]), context = buildTurnContext(world, nicco.exportSnapshot());
  const out = (sentence: string) => verifyEvidence(toKorvin, sentence, sentence, context, [toKorvin]).verified;
  for (const s of ["Korvin takes the boots.", "Korvin accepts the returned boots.", "He takes the boots back.", "Korvin accepts the boots back."]) assert.equal(out(s.replace(/^He/, "Korvin")), true, s);
  for (const s of ["Korvin doesn't take the boots.", "Korvin almost accepts them.", "Korvin tells him to take them back.", "Korvin considers taking the boots.", "Korvin steps back instead of accepting them.", "Korvin hands the boots back."]) assert.equal(out(s), false, s);
  const held = scene(["korvin"], [boots("korvin")]), heldContext = buildTurnContext(world, held.exportSnapshot());
  const inboundOk = (sentence: string) => verifyEvidence(inbound, sentence, sentence, heldContext, [inbound]).verified;
  for (const s of ["Nicco takes the boots from her.", "Korvin hands the boots to Nicco.", "Korvin presses the boots into Nicco's hands."]) assert.equal(inboundOk(s), true, s);
  for (const s of ["Korvin doesn't hand over the boots.", "Nicco almost takes the boots.", "Korvin holds out the boots.", "Korvin tells him to take the boots."]) assert.equal(inboundOk(s), false, s);
});

// --------------------------------------------------------------------------------------------------- knowledge authority
function auditQuote(campaign: CampaignState, narration: string) {
  const snapshot = campaign.exportSnapshot(), context = buildTurnContext(world, snapshot);
  const intent = { candidates: [], runtime: [] };
  return auditNarration({ narration, context, world, access: projectKnowledgeAccess(context, {}), evidence: deriveTurnEvidence(intent, narration, context), diagnostics: [], committed: [], prepared: snapshot });
}
test("J: forbidden player facts cannot be voiced through invented registries, rumors or history (Korvin's live failure)", async () => {
  const campaign = scene(["korvin"]);
  const kinds = (text: string) => auditQuote(campaign, text).map(i => i.kind).sort();
  assert.deepEqual(kinds("\"Keep your boots, mage. And don't go flashing that light around the Back-Back Alleys,\" Korvin says."), ["private_player_fact"]);
  assert.deepEqual(kinds("Korvin shrugs. \"Word is you own Heartstone now. The registry says so.\""), ["household_claim", "invented_source"]);
  assert.deepEqual(kinds("\"You're the one who came through the tower door yesterday,\" Korvin says."), ["unsourced_history"]);
  assert.deepEqual(kinds("\"You're the new holder,\" Korvin says."), ["household_claim"]);
  assert.deepEqual(kinds("\"The tower stood empty for years before you,\" Korvin says."), ["unsourced_history"]);
  assert.ok(kinds("\"You came from another world, didn't you,\" Korvin says.").includes("private_player_fact"));
  // End to end: the delivered narration never contains the leak, whatever the narrator repeats.
  const { delivered, result } = await run(campaign, "Hello.", ["Korvin grunts. \"Watch yourself, mage.\""]);
  assert.doesNotMatch(delivered, /mage/i); assert.equal(result.narration_reconciliation!.delivered, "redacted");
});
test("K: an explicitly authorized rumor may be voiced as rumor", () => {
  const campaign = scene(["korvin"]);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "set_knowledge", knowledge: { character_id: "korvin", fact_id: "campaign_fact_nicco_light_mage", status: "heard_rumor" } }] });
  assert.deepEqual(auditQuote(campaign, "Korvin squints. \"I've heard rumors you're some kind of mage.\""), []);
});
test("L: a qualified visual inference is allowed and persists nothing", async () => {
  const campaign = scene(["korvin"]);
  assert.deepEqual(auditQuote(campaign, "Korvin looks past Nicco at the tower door. \"If I had to guess, that tower's yours.\""), []);
  assert.deepEqual(auditQuote(campaign, "\"You don't sound local. Haven't seen you before,\" Korvin says."), []);
  const before = campaign.exportSnapshot().knowledge;
  const { result } = await run(campaign, "*He asks Korvin who they think he is and where he comes from.*", ["Korvin looks him over. \"If I had to guess, that tower's yours. Where you're from, I don't know.\""]);
  assert.equal(result.narration_reconciliation!.delivered, "draft");
  assert.deepEqual(campaign.exportSnapshot().knowledge, before);
});
test("household authority: Heartstone ownership is a controlled fact, usable only by fellow members", () => {
  const campaign = scene(["korvin"]), context = buildTurnContext(world, campaign.exportSnapshot()), access = projectKnowledgeAccess(context, {});
  assert.deepEqual(access.facts.filter(f => f.source === "player_household").map(f => [f.ref, f.text]), [["H1", "Nicco is owner of the household Heartstone."]]);
  assert.deepEqual(access.characters.find(c => c.character_id === "korvin")!.do_not_use, ["F1", "F2", "H1"]);
  const prompt = buildNarratorPrompt("Hello.", context, [], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.match(prompt, /Observable by anyone present: tall, overweight/); assert.match(prompt, /NARRATOR-ONLY/); assert.match(prompt, /UNKNOWN IS NOT A RUMOR/);
});

// ---------------------------------------------------------------------------------------------- confidential encounters
test("M: a protected character in a valid runtime encounter gets portrayal without public/private leakage", async () => {
  const campaign = scene(["dren"]), context = buildTurnContext(world, campaign.exportSnapshot());
  const dren = world.getEntity("dren")!;
  assert.ok(dren.type === "character" && dren.purpose && dren.private_notes);
  const prompt = buildNarratorPrompt("Hello.", context, [], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.ok(prompt.includes(dren.purpose!), "portrayal reaches the narrator for the valid encounter");
  assert.match(prompt, /CONFIDENTIAL ENCOUNTER/);
  // Presence grants no player/public visibility and no retrieval of hidden canon.
  const service = new RetrievalService(world);
  assert.equal(service.get({ entity_id: "dren" }, "player").kind, "not_visible");
  const retrieved = await retrieveForTurn("Tell me about Dren", context, world, { service, search: new HybridSearch(service) });
  assert.ok(!JSON.stringify(retrieved.data).includes(dren.private_notes!));
  // H3: Dren may use only his own authored known_by grants on restricted canon; presence still grants nothing public or player-known.
  const access = projectKnowledgeAccess(context, retrieved.data);
  assert.ok(access.characters.find(c => c.character_id === "dren")!.can_use.every(u => u.basis === "canonical_private"));
  assert.ok(access.facts.filter(f => f.source === "npc_private_canon").every(f => !access.player.includes(f.ref)));
  // Without presence there is no projection at all.
  const absent = buildTurnContext(world, createOpeningCampaign(world, "repair1_absent").exportSnapshot());
  assert.ok(!absent.characters.some(c => c.id === "dren"));
  assert.ok(!buildNarratorPrompt("Hello.", absent, [], {}, { candidates: [], runtime: [] }).messages[0]!.content.includes(dren.purpose!));
});

// ------------------------------------------------------------------------------------------------ presence and reaction
test("19A: authored companions ('usually accompanied by') absent from the scene may not be placed or used", async () => {
  const campaign = scene(["blackthorn"]);
  assert.deepEqual(auditQuote(campaign, "Her two bodyguards surge forward and seize Nicco's shoulders.").map(i => i.kind).sort(), ["absent_participant", "uncommitted_constraint"]);
  const { delivered } = await run(campaign, "Hello.", ["Blackthorn raises an eyebrow. Her two bodyguards step closer."]);
  assert.doesNotMatch(delivered, /bodyguard/i); assert.match(delivered, /Blackthorn raises an eyebrow/);
});
test("19B: the same companions explicitly present in the scene may be used", () => {
  const campaign = scene(["blackthorn"], [{ kind: "register_character", character: { id: "campaign_character_bodyguard", origin: { kind: "created" }, profile: { name: "Bodyguard" }, current: { current_location: "heartstone_square" } } }]);
  assert.deepEqual(auditQuote(campaign, "Her bodyguard steps closer.").map(i => i.kind), []);
  const prompt = buildNarratorPrompt("Hello.", buildTurnContext(world, campaign.exportSnapshot()), [], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.ok(prompt.includes(narratorIdentityGate(buildTurnContext(world, campaign.exportSnapshot()))!.mask("[PRESENT AND ABLE TO REACT]\n- Blackthorn\n- Bodyguard")));
});
test("20A: three named NPCs present, one attacked: only the real present set may react", () => {
  const campaign = scene(["korvin", "mistress_elara", "bartolomhew"], [], "calderan_slave_market");
  const context = buildTurnContext(world, campaign.exportSnapshot());
  const prompt = buildNarratorPrompt("*He punches Korvin directly in the face.*", context, [], {}, intentOf(campaign, "*He punches Korvin directly in the face.*")).messages[0]!.content;
  for (const id of ["korvin", "mistress_elara", "bartolomhew"]) assert.ok(prompt.includes(`- ${narratorIdentityGate(context)!.identities.get(id)!.observable_label}\n`));
  assert.deepEqual(auditQuote(campaign, "Mistress Elara steps back with a sharp laugh. Bartolomhew watches."), []);
  assert.deepEqual(auditQuote(campaign, "Captain Doran Hale shoulders through the crowd.").map(i => i.kind), ["absent_participant"]);
});
test("20B: with no other NPC present, no named third party may intervene", () => {
  const campaign = scene(["korvin"]);
  const context = buildTurnContext(world, campaign.exportSnapshot());
  assert.ok(buildNarratorPrompt("Hello.", context, [], {}, { candidates: [], runtime: [] }).messages[0]!.content.includes(`[PRESENT AND ABLE TO REACT]\n- ${narratorIdentityGate(context)!.identities.get("korvin")!.observable_label}\nOnly these people`));
  assert.deepEqual(auditQuote(campaign, "Mistress Elara appears at Korvin's shoulder.").map(i => i.kind), ["absent_participant"]);
});

// -------------------------------------------------------------------------------------------------- physical interaction
test("physical act: a punch is recognized; a narrated minor injury commits only with verified evidence and vocabulary", async () => {
  const input = "*He punches Korvin directly in the face.*";
  const campaign = scene(["korvin"]);
  const intent = intentOf(campaign, input);
  assert.deepEqual(intent.natural!.physical, [{ actor: "nicco", target: "korvin", interaction: "strike" }]);
  assert.deepEqual(intent.candidates, []);
  const injury: CampaignCommand = { kind: "set_condition", character_id: "korvin", conditions: ["minor_injury"] };
  const text = "Nicco's fist catches Korvin across the jaw. Korvin staggers, blood welling from a split lip.";
  const { result } = await run(campaign, input, [text], [injury], ["Korvin staggers, blood welling from a split lip."]);
  assert.equal(result.authorization[0]!.authorized, true);
  assert.deepEqual(campaign.exportSnapshot().characters.find(c => c.id === "korvin")!.current.conditions, ["minor_injury"]);
  assert.equal(result.narration_reconciliation!.delivered, "draft");
});
test("physical act: out-of-vocabulary, unevidenced or unprovoked conditions are rejected; unrecorded injuries and constraints are not delivered", async () => {
  const input = "*He punches Korvin directly in the face.*";
  for (const [conditions, quote] of [[["dead"], "Korvin staggers, blood welling from a split lip."], [["minor_injury"], "Korvin laughs."], [["restrained"], "Korvin staggers, blood welling from a split lip."]] as const) {
    const campaign = scene(["korvin"]);
    const { result } = await run(campaign, input, ["Korvin staggers, blood welling from a split lip.", "Korvin flinches and steps back, jaw tight."], [{ kind: "set_condition", character_id: "korvin", conditions: [...conditions] }], [quote]);
    assert.equal(result.authorization[0]!.authorized, false, conditions.join());
    assert.equal(campaign.exportSnapshot().characters.find(c => c.id === "korvin")?.current.conditions, undefined);
    assert.equal(result.narration_reconciliation!.delivered, "revision");
  }
  const calm = scene(["korvin"]);
  const { result } = await run(calm, "Hello.", ["Korvin nods."], [{ kind: "set_condition", character_id: "korvin", conditions: ["minor_injury"] }], ["Korvin nods."]);
  assert.equal(result.authorization[0]!.reason, "rejected_reference_invalid");
  const held = scene(["korvin"]);
  const { delivered } = await run(held, input, ["Korvin staggers. Two market guards seize Nicco by the arms.", "Korvin staggers."]);
  assert.doesNotMatch(delivered, /seize Nicco/);
});

// ------------------------------------------------------------------------------------- rerun-1 findings (generalized fixes)
test("inbound gift: a completed player-directed gift tells the narrator Nicco's acceptance is player-authored", () => {
  const campaign = scene(["korvin"], [boots("korvin")]);
  const intent = intentOf(campaign, "Korvin gives Nicco a pair of leather boots.");
  const prompt = buildNarratorPrompt("Korvin gives Nicco a pair of leather boots.", buildTurnContext(world, campaign.exportSnapshot()), [], {}, intent).messages[0]!.content;
  assert.match(prompt, /Nicco's acceptance is already authored by the player/); assert.match(prompt, /Do not leave it suspended mid-offer/);
  // An NPC offer carries no such authorization.
  const offer = intentOf(campaign, "Korvin offers Nicco a pair of leather boots.");
  assert.doesNotMatch(buildNarratorPrompt("Korvin offers Nicco a pair of leather boots.", buildTurnContext(world, campaign.exportSnapshot()), [], {}, offer).messages[0]!.content, /acceptance is already authored/);
});
test("inbound gift: still offering ('kept the boots extended') is not withholding; keeping them is", () => {
  const campaign = scene(["korvin"], [boots("korvin")]), context = buildTurnContext(world, campaign.exportSnapshot());
  const intent = intentOf(campaign, "Korvin gives Nicco a pair of leather boots.");
  const evidence = (text: string) => deriveTurnEvidence(intent, text, context);
  assert.deepEqual(evidence("Korvin kept the boots extended. Korvin presses the boots into Nicco's hands.").narrator_refusals, []);
  assert.equal(evidence("Korvin kept the boots extended. Korvin presses the boots into Nicco's hands.").narrator_confirmations.length, 1);
  assert.equal(evidence("Korvin keeps the boots for himself.").narrator_refusals.length, 1);
});
test("inbound evidence (rerun-2 sentences): producing, idioms and gestures are not refusals or handovers; item-subject handovers are", () => {
  const campaign = scene(["korvin"], [boots("korvin")]), context = buildTurnContext(world, campaign.exportSnapshot());
  const intent = intentOf(campaign, "Korvin gives Nicco a pair of leather boots.");
  const ev = (text: string) => deriveTurnEvidence(intent, text, context);
  const verified = (text: string) => verifyEvidence(inbound, text, text, context, [inbound]).verified;
  // Not refusals (they previously vetoed real handovers).
  for (const text of ["Korvin withdrew a pair of leather boots from his satchel, holding them out toward Nicco. Nicco accepts the boots.",
    "Korvin extends his hand, offering the boots with a smile that doesn't quite reach his eyes. Nicco takes the boots.",
    "Korvin does not withdraw the boots. Nicco takes the boots."]) { assert.deepEqual(ev(text).narrator_refusals, [], text); assert.equal(ev(text).narrator_confirmations.length, 1, text); }
  // A gesture toward Nicco is still an offer.
  assert.equal(ev("Korvin thrusts the boots toward Nicco.").narrator_confirmations.length, 0);
  assert.equal(verified("Korvin thrusts the boots toward Nicco."), false);
  // Item-subject completions.
  for (const text of ["The boots pass into Nicco's hands.", "The boots pass from his grip to Nicco's.", "The pair of leather boots passes to Nicco's hands."]) {
    assert.equal(ev(`Korvin holds out the boots. ${text}`).narrator_confirmations.length, 1, text); assert.equal(verified(text), true, text);
  }
  // Real withdrawal still vetoes.
  assert.equal(ev("Korvin withdraws his hand, keeping the boots.").narrator_refusals.length, 1);
});
test("inbound evidence (rerun-3 sentences): release-until idiom, clause-scoped negation, gendered pronouns, multi-word names", () => {
  const verified = (npc: string, text: string) => {
    const campaign = scene([npc], [boots(npc)]), context = buildTurnContext(world, campaign.exportSnapshot());
    return verifyEvidence(inbound, text.split(/(?<=\.)\s+/).at(-1)!, text, context, [inbound]).verified;
  };
  assert.equal(verified("hadrik_voss", "Hadrik Voss holds out the boots. He does not release them until Nicco's hands close around the leather."), true);
  assert.equal(verified("orla_fen", "Orla Fen holds out the boots. She doesn't wait for thanks, already turning away as Nicco takes the boots."), true);
  assert.equal(verified("jessa_rook", "Jessa Rook extends the boots toward Nicco. He takes them."), true);
  assert.equal(verified("sister_mereth", "Sister Mereth holds out the boots. Sister Mereth presses the boots into Nicco's hands."), true);
  // Still rejected: negation or refusal in the act's own clause, a pronoun that could be the giver, and a plain gesture.
  assert.equal(verified("orla_fen", "Orla Fen holds out the boots. She refuses to let go, as Nicco takes the boots."), false);
  assert.equal(verified("orla_fen", "Orla Fen holds out the boots. Nicco doesn't take the boots."), false);
  assert.equal(verified("hadrik_voss", "Hadrik Voss holds out the boots. He takes them back."), false);
  assert.equal(verified("sister_mereth", "Sister Mereth thrusts the pair toward Nicco."), false);
});
test("invented shared past with Nicco is not delivered as known; the NPC's own past is fine", () => {
  const campaign = scene(["livia_marr"]);
  assert.deepEqual(auditQuote(campaign, "\"Consider it a thank-you for not keeling over on my stoop yesterday,\" Livia Marr says.").map(i => i.kind), []);
  assert.deepEqual(auditQuote(campaign, "\"These should fit your measure from yesterday,\" Livia Marr says.").map(i => i.kind), ["unsourced_history"]);
  assert.deepEqual(auditQuote(campaign, "\"I bought these off a carter yesterday,\" Livia Marr says.").map(i => i.kind), []);
});
test("ownership guess framing counts only when the guess marker precedes the claim", () => {
  const campaign = scene(["korvin"]);
  assert.deepEqual(auditQuote(campaign, "\"Fair trade for a man who keeps his own tower and looks like he forgot to pack,\" Korvin says.").map(i => i.kind), ["household_claim"]);
  assert.deepEqual(auditQuote(campaign, "\"For a man who claims a tower,\" Korvin says.").map(i => i.kind), ["household_claim"]);
  assert.deepEqual(auditQuote(campaign, "\"If I had to guess, that tower's yours,\" Korvin says."), []);
  assert.deepEqual(auditQuote(campaign, "\"That tower yours, then?\" Korvin says."), []);
});

// ---------------------------------------------------------------------------------------------------- prompt contract
test("23/24: narrator contract forbids durable canon fabrication and forced composure", () => {
  for (const rule of ["laws, penalties or punishments", "historical or previous owners, residents, keepers or heirs", "named institutions, watches, offices or bodies", "exact recurring counts", "property history, debts or inheritance", "official records or registries", "Unknown durable canon stays unknown"])
    assert.ok(NARRATOR_SYSTEM.includes(rule), rule);
  for (const rule of ["background tendencies, not presence", "never narrate them as accomplished", "shock, recoil, pain, fear, anger, confusion, defensive movement, freezing, retreat or retaliation", "does not mean automatic composure", "do not force panic", "unknown is not rumor", "What the narrator knows is not what a character knows"])
    assert.ok(NARRATOR_SYSTEM.includes(rule), rule);
});
