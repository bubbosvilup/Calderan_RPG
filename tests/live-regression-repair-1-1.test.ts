import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { verifyEvidence } from "../src/turn/evidence-authorization.js";
import { auditNarration } from "../src/turn/narration-audit.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Live NPC Regression Repair 1.1: the three section-L defects, tested with the exact failing live sentences. */
const RETURN_INPUT = "Thanks *he said to them, after which he decides to give them back the boots*\nYou'll need them more than me";
const GIFT = (name: string) => `${name} gives Nicco a pair of leather boots.`;
const BOOTS = "campaign_item_repair_boots";
const world = await loadWorld("data");
const item = (owner: string, holder = owner, id = BOOTS, name = "pair of leather boots", acquisition?: Record<string, unknown>) =>
  ({ kind: "register_item", item: { id, origin: { kind: "created" }, name, owner_id: owner, position: { kind: "carried", character_id: holder }, ...(acquisition ? { acquisition } : {}) } }) as unknown as CampaignCommand;
function scene(npc: string, extra: readonly CampaignCommand[]) {
  const campaign = createOpeningCampaign(world, `repair11_${npc}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { character_movements: [{ character_id: npc, current_location: "heartstone_square" }] } }, ...extra] });
  return campaign;
}
const inbound: CampaignCommand = { kind: "transfer_item", mode: "handoff", item_id: BOOTS,  position: { kind: "carried", character_id: "nicco" } };
const contextOf = (c: CampaignState) => buildTurnContext(world, c.exportSnapshot());
const verify = (c: CampaignState, narration: string, quote: string) => verifyEvidence(inbound, quote, narration, contextOf(c), [inbound]);
const grammar = (c: CampaignState, input: string, narration: string) => deriveTurnEvidence(playerIntent(input, contextOf(c), c.exportSnapshot(), world), narration, contextOf(c));
function audit(c: CampaignState, input: string, narration: string) {
  const snapshot = c.exportSnapshot(), context = buildTurnContext(world, snapshot), intent = playerIntent(input, context, snapshot, world);
  return auditNarration({ narration, context, world, access: projectKnowledgeAccess(context, {}), evidence: deriveTurnEvidence(intent, narration, context), diagnostics: [], committed: [], prepared: snapshot, player_input: input }).map(i => i.kind);
}
function narrator(texts: readonly string[]): NarratorProvider {
  let i = 0;
  return { async generate() { throw new Error("unused"); }, async *stream() { const text = texts[Math.min(i++, texts.length - 1)]!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
}
async function run(c: CampaignState, input: string, texts: readonly string[], commands: readonly CampaignCommand[] = [], evidence?: readonly string[]) {
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, narrator(texts), { async propose() { return { commands: [...commands], ...(evidence ? { evidence: [...evidence] } : {}), ...metadata }; } }, { service, search: new HybridSearch(service) });
  const events = await collect(coordinator.runTurn({ campaign: c, player_input: input }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_completed");
  return (last as { result: TurnResult }).result;
}

// ------------------------------------------------------------------------------------------------ 1. handover evidence
test("1.1 evidence: item-subject 'transfer' is a handover; negated withholding is not a veto (Mereth's live draft)", () => {
  const c = scene("sister_mereth", [item("sister_mereth")]);
  const text = "Sister Mereth extends the boots toward Nicco. She does not move to withdraw the offer. The boots transfer to Nicco's hands: scuffed, sturdy, clearly used but intact.";
  const ev = grammar(c, GIFT("Sister Mereth"), text);
  assert.deepEqual(ev.narrator_refusals, []); assert.equal(ev.narrator_confirmations.length, 1);
  assert.equal(verify(c, text, "The boots transfer to Nicco's hands").verified, true);
  for (const form of ["The boots are transferred to Nicco's hands.", "The boots transferred into his hands."]) assert.equal(grammar(c, GIFT("Sister Mereth"), form).narrator_confirmations.length, 1, form);
  // Real withholding and non-completions still fail.
  assert.equal(grammar(c, GIFT("Sister Mereth"), "Sister Mereth withdraws the offer.").narrator_refusals.length, 1);
  assert.equal(verify(c, "The boots do not transfer to Nicco's hands.", "The boots do not transfer to Nicco's hands.").verified, false);
  assert.equal(verify(c, "The boots transfer toward Nicco.", "The boots transfer toward Nicco.").verified, false);
});
test("1.1 evidence: a unique category word from item metadata references the item (Mira's live draft); ambiguity still rejects", () => {
  const mira = "Mira Thorne pulls the worn leather boots from her shoulder bag. She doesn't wait for thanks or explanation, simply pressing the footwear into his hands with the brisk efficiency of someone who dislikes loose ends.";
  const quote = "She doesn't wait for thanks or explanation, simply pressing the footwear into his hands with the brisk efficiency of someone who dislikes loose ends.";
  assert.equal(verify(scene("mira_thorne", [item("mira_thorne")]), mira, quote).verified, true);
  // Two pieces of footwear in the scene: "the footwear" refers to neither.
  const two = scene("mira_thorne", [item("mira_thorne"), item("mira_thorne", "mira_thorne", "campaign_item_repair_sandals", "pair of sandals")]);
  assert.equal(verify(two, mira, quote).verified, false);
  // A category never derived from the item's own metadata is not a reference.
  const belt = scene("mira_thorne", [item("mira_thorne", "mira_thorne", BOOTS, "leather belt")]);
  assert.equal(verify(belt, "Mira presses the footwear into Nicco's hands.", "Mira presses the footwear into Nicco's hands.").verified, false);
  // Existing negative cases hold.
  const c = scene("mira_thorne", [item("mira_thorne")]);
  for (const s of ["Mira Thorne holds out the footwear.", "Mira Thorne almost presses the footwear into Nicco's hands.", "Mira Thorne doesn't hand over the footwear."]) assert.equal(verify(c, s, s).verified, false, s);
});
test("1.1 evidence: a later sentence retracts an established inbound handover only if it concerns the transfer or item (Elara's live draft)", () => {
  const c = scene("mistress_elara", [item("mistress_elara")]);
  const unrelated = "Mistress Elara extends the boots toward Nicco. Nicco takes the boots. She does not ask directly about his claim to the tower, though her gaze lingers on the massive wooden entrance behind him.";
  const a = grammar(c, GIFT("Mistress Elara"), unrelated);
  assert.deepEqual(a.narrator_refusals, []); assert.equal(a.narrator_confirmations.length, 1);
  // Repair 1.1 live finding (Mereth): a hedged comparison using "give" is not about this transfer.
  const live = grammar(scene("sister_mereth", [item("sister_mereth")]), GIFT("Sister Mereth"), "Sister Mereth withdraws a pair of worn leather boots, passing them over to Nicco. He takes them. \"You'll need proper footwear,\" she says, her grey eyes appraising him with the same frank assessment she might give any of her charges.");
  assert.deepEqual(live.narrator_refusals, []); assert.equal(live.narrator_confirmations.length >= 1, true);
  for (const retraction of ["She does not let him keep the boots.", "She does not release them after all.", "She hesitates and takes the boots back."]) {
    const b = grammar(c, GIFT("Mistress Elara"), `Nicco takes the boots. ${retraction}`);
    assert.equal(b.narrator_refusals.length, 1, retraction);
  }
});

// ---------------------------------------------------------------------------------------------------- 2. return premise
test("1.1 premise: a give-back after a failed gift tells the narrator who really holds the item", () => {
  const c = scene("livia_marr", [item("livia_marr")]);
  const intent = playerIntent(RETURN_INPUT, contextOf(c), c.exportSnapshot(), world);
  assert.deepEqual(intent.candidates, []);
  assert.equal(intent.natural!.actions.find(a => a.kind === "offer")!.detail.premise, "not_held_by_nicco");
  assert.match(intent.natural!.notes.join(" "), /Nicco does not have pair of leather boots: Livia Marr still has it/);
});
test("1.1 premise: narration may not return, hold or take back an item Nicco never received (Livia's and Mira's live drafts)", async () => {
  const c = scene("livia_marr", [item("livia_marr")]);
  for (const bad of ["Nicco thanks Livia, then decides to hand the boots back to her.", "She takes the boots back without comment, turning them over in her hands.", "Nicco extends the boots back toward Livia.", "The boots remain in Nicco's hands."])
    assert.ok(audit(c, RETURN_INPUT, `Livia Marr tilts her head. ${bad}`).includes("false_premise"), bad);
  for (const fine of ["Livia Marr keeps the boots tucked under her arm and raises an eyebrow at his thanks.", "Nicco does not have the boots; Livia still does."])
    assert.ok(!audit(c, RETURN_INPUT, fine).includes("false_premise"), fine);
  // When the gift did commit, the same return narration is correct.
  const held = scene("livia_marr", [item("nicco", "nicco", BOOTS, "pair of leather boots", { acquisition_kind: "gift", from_character_id: "livia_marr", acquired_at: 0 })]);
  assert.ok(!audit(held, RETURN_INPUT, "Nicco extends the boots back toward Livia. She takes the boots back.").includes("false_premise"));
  // End to end: the false premise never reaches the player; state is untouched.
  const r = await run(c, RETURN_INPUT, ["Livia Marr tilts her head. She takes the boots back without comment."]);
  assert.doesNotMatch(r.narration, /takes the boots back/); assert.match(r.narration, /stays with Livia Marr/);
  assert.equal(c.exportSnapshot().items[0]!.owner_id, "livia_marr");
});

// ---------------------------------------------------------------------------------------------------- 3. player agency
test("1.1 agency: unauthored Nicco dialogue and decisions are flagged", () => {
  const c = scene("korvin", [item("korvin")]);
  const cases: readonly [string, string][] = [
    ["Hello.", "Korvin nods. \"I'll keep them,\" Nicco says."],
    ["Hello.", "Nicco accepts the boots with a nod."],
    ["Hello.", "Nicco refuses the gift."],
    ["Hello.", "Nicco decides to keep the boots."],
    ["Hello.", "Nicco turns to leave."],
    ["Hello.", "Nicco decides to stay a while longer."],
    ["Hello.", "Nicco thanks Korvin."],
    [RETURN_INPUT, "Korvin's hands withdraw as Korvin frowns. Nicco refuses the offered boots and turns to leave."],
  ];
  for (const [input, text] of cases) assert.ok(audit(c, input, text).includes("player_agency"), `${input} → ${text}`);
});
test("1.1 agency: authored speech, authored gifts/returns and deterministic consequences are allowed", () => {
  const c = scene("korvin", [item("korvin")]);
  const allowed: readonly [string, string][] = [
    [GIFT("Korvin"), "Korvin hands the boots to Nicco, and Nicco takes them."],
    ["*he takes the boots from Korvin*", "Nicco takes the boots from Korvin."],
    ["\"You'll need them more than me.\"", "\"You'll need them more than me,\" Nicco says. Korvin grunts."],
    ["*He asks Korvin who they think he is and where he comes from.*", "Nicco asks, \"Who do you think I am, and where do you think I come from?\" Korvin shrugs."],
    ["*he walks away toward the market*", "Nicco leaves the square behind."],
    ["Thanks. *he stays where he is*", "Nicco thanks Korvin and stays where he is."],
    ["Hello.", "Korvin offers the boots. Nicco watches him."],
  ];
  for (const [input, text] of allowed) assert.ok(!audit(c, input, text).includes("player_agency"), `${input} → ${text}`);
  // A committed gift's return narration restating the authored action is not a slip.
  const held = scene("korvin", [item("nicco", "nicco", BOOTS, "pair of leather boots", { acquisition_kind: "gift", from_character_id: "korvin", acquired_at: 0 })]);
  assert.ok(!audit(held, RETURN_INPUT, "Nicco thanks Korvin, then offers the boots back.").includes("player_agency"));
});
test("1.1 agency: an unauthored decision is removed before delivery", async () => {
  const c = scene("korvin", [item("korvin")]);
  const r = await run(c, "Hello.", ["Korvin shrugs. Nicco decides to keep the boots."]);
  assert.doesNotMatch(r.narration, /decides to keep/); assert.match(r.narration, /Korvin shrugs/);
});
