import test from "node:test";
import assert from "node:assert/strict";
import type { CampaignCommand } from "../src/campaign/types.js";
import { setup, collect } from "./turn-fixtures.js";

// Phase 1M.1: forms observed in Phase 1M Stage B traces, plus the mandated negative controls.
const garments: CampaignCommand[] = ["pink_cotton", "pink_fluffy", "pink_shorts"].map(item_id => ({ kind: "transfer_item", item_id, owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } }));
const offer = "*gives her the two pink shirt, one fluffy and thick one made of probably cotton, the shorts are also pink and should be alright for her narrow waist*";
async function handover(narration: string, proposal: readonly CampaignCommand[] = garments) {
  const s = setup(narration, proposal, true), before = s.campaign.exportSnapshot();
  const last = (await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: offer }))).at(-1)!;
  assert.equal(last.type, "turn_completed");
  return { s, before, result: last.type === "turn_completed" ? last.result : undefined };
}
for (const narration of [
  "She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts, taking them into her hands.",
  "Brenna hesitates, glancing down at her worn boots, before carefully taking the three items from Nicco's hands.",
  "After a moment of silent assessment, she extended her hands to take all three garments.",
  "(accepts the stack of pink clothing) Thanks. *settles back, pink clothes in lap*",
  "Brenna takes the stack into her arms.",
  "Brenna takes all three garments.",
  "Brenna hesitates. Then she takes the three items.",
  "Brenna watched the bundle approach. She did not reach out immediately, remaining seated with an alert stillness that suggested caution rather than refusal. After a brief pause, she extended one hand to take the stack, accepting the cotton shirt, the fluffy shirt, and the shorts into her grasp.",
  "She did not reach for them immediately. After a moment of silent assessment, she extended her hands to take all three garments.",
]) test(`record 115 acceptance authorizes all three, equips nothing: ${narration}`, async () => {
  const { s, result } = await handover(narration);
  assert.deepEqual(result!.authorized_commands, garments);
  assert.equal(result!.authorization.filter(d => d.command.kind === "place_item").length, 0);
  assert.deepEqual(result!.turn_evidence.narrator_refusals, []);
  for (const id of ["pink_cotton", "pink_fluffy", "pink_shorts"]) assert.deepEqual(s.campaign.exportSnapshot().items.find(i => i.id === id)!.position, { kind: "carried", character_id: "brenna" });
  assert.deepEqual(s.campaign.exportSnapshot().items.find(i => i.id === "brenna_boots")!.position, { kind: "equipped", character_id: "brenna", slot: "feet", mode: "worn" });
});
test("every offered item named in one sentence is collective with indexes [0,1,2]", async () => {
  const { result } = await handover("She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts.");
  assert.deepEqual(result!.turn_evidence.narrator_confirmations.map(c => ({ kind: c.kind, command_indexes: c.command_indexes, collective: c.collective })), [{ kind: "accepted_transfer", command_indexes: [0, 1, 2], collective: true }]);
});
test("naming only part of the offer authorizes only the named items", async () => {
  const { result } = await handover("She accepts the pink cotton shirt and the pink shorts.");
  assert.deepEqual(result!.authorized_commands, [garments[0], garments[2]]);
});
for (const narration of [
  "Brenna refuses to take them.",
  "\"I don't want them.\" She pushes the clothes back.",
  "She makes no move to take them and turns away.",
  "She remained seated and did not reach out to take them.",
  "Brenna takes all three garments. She hands them back to Nicco.",
  "Brenna takes all three garments, then immediately gives them back.",
  "Brenna takes the stack. Maybe she will not keep them.",
  "She reaches toward them.",
  "Brenna looks at the three items.",
  "Brenna considers taking the three items.",
  "Brenna takes the two items.",
  "Brenna looks at the ring. She takes the three items.",
  "Maren looks at Brenna. She takes all three garments.",
  "She makes no move to accept or refuse, waiting for Nicco's answer.",
]) test(`record 115 refusal, retraction or ambiguity commits nothing: ${narration}`, async () => {
  const { s, before, result } = await handover(narration);
  assert.deepEqual(result!.authorized_commands, []);
  assert.deepEqual(s.campaign.exportSnapshot(), before);
});
test("controller proposal is still required: acceptance narration alone creates no command", async () => {
  const { result } = await handover("She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts.", []);
  assert.deepEqual(result!.authorized_commands, []); assert.deepEqual(result!.authorization, []);
});

const knowledge: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
async function tell(narration: string, proposal: readonly CampaignCommand[] = [knowledge]) {
  const s = setup(narration, proposal), before = s.campaign.exportSnapshot();
  const last = (await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "/tell campaign_fact_bridge_closed to brenna" }))).at(-1)!;
  assert.equal(last.type, "turn_completed");
  return { s, before, result: last.type === "turn_completed" ? last.result : undefined };
}
for (const [narration, kind] of [
  ["Nicco tells Brenna that the eastern bridge is closed.", "was_told_fact"],
  ["Nicco speaks to Brenna, telling her that the eastern bridge is closed.", "was_told_fact"],
  ["Nicco states to Brenna that the eastern bridge is closed.", "was_told_fact"],
  ["Nicco spoke the words clearly to Brenna, stating that the eastern bridge was closed.", "was_told_fact"],
  ["Nicco tells her that the eastern bridge is closed.", "was_told_fact"],
  ["Brenna hears Nicco say that the eastern bridge is closed.", "heard_fact"],
  ["Nicco tells Brenna that the eastern bridge is closed. Brenna's grey eyes lift to meet his, her seated posture unchanged.", "was_told_fact"],
] as const) test(`explicit communication authorizes told knowledge: ${narration}`, async () => {
  const { s, result } = await tell(narration);
  assert.equal(result!.authorization[0]!.reason, "authorized_explicit_information_transfer");
  assert.equal(result!.turn_evidence.narrator_confirmations[0]!.kind, kind);
  const edge = s.campaign.exportSnapshot().knowledge.find(k => k.character_id === "brenna" && k.fact_id === "campaign_fact_bridge_closed");
  assert.deepEqual(edge?.provenance, { source_character_id: "nicco", acquisition_kind: "told" });
});
for (const narration of ["Brenna looks worried.", "Brenna is quiet.", "Her posture is unchanged.", "Brenna already knew it.", "Brenna seems to understand.",
  "The narrator explains that the eastern bridge is closed.", "Nicco tells Maren that the eastern bridge is closed.", "Nicco tells Brenna that the western bridge is closed.", "Maren mentions the eastern bridge is closed."]) test(`no explicit telling to Brenna, no knowledge edge: ${narration}`, async () => {
  const { s, before } = await tell(narration);
  assert.deepEqual(s.campaign.exportSnapshot(), before);
});
test("neutral state language is neither acceptance nor refusal", async () => {
  const { result } = await tell("Her posture is unchanged. Brenna remained quiet, still seated.");
  assert.deepEqual(result!.turn_evidence.narrator_confirmations, []); assert.deepEqual(result!.turn_evidence.narrator_refusals, []);
});
test("knowledge leak is not authorized: a proposal for an NPC the player did not tell is rejected", async () => {
  const maren: CampaignCommand = { kind: "set_knowledge", knowledge: { ...knowledge.knowledge, character_id: "maren" } };
  const { s, before, result } = await tell("Nicco tells Brenna that the eastern bridge is closed. Maren says the eastern bridge is closed too.", [maren]);
  assert.equal(result!.authorization[0]!.authorized, false); assert.deepEqual(s.campaign.exportSnapshot(), before);
});
// Forms first observed in the Phase 1M.1 Stage B rerun (added after that run; see PHASE_1M1_REVIEW.md section E).
for (const narration of [
  "Brenna looks at the offered clothes. She reaches out and takes them, gathering the shirts and shorts in her large hands.",
  "Brenna looks at the offering, her grey eyes steady. \"I can carry them for you,\" she says, accepting the bundle without comment on the hue.",
]) test(`Phase 1M.1 rerun acceptance form authorizes all three: ${narration}`, async () => {
  const { result } = await handover(narration);
  assert.deepEqual(result!.authorized_commands, garments);
});
for (const narration of ["She reaches out and touches them.", "Brenna looks at the offering. She says, looking at the bundle.", "She reaches out toward them."]) test(`reaching or speaking without receipt commits nothing: ${narration}`, async () => {
  const { s, before } = await handover(narration);
  assert.deepEqual(s.campaign.exportSnapshot(), before);
});
test("turns-to-and-tells authorizes only for the intent recipient", async () => {
  const ok = await tell("Nicco turns to Brenna and tells her that the eastern bridge is closed.");
  assert.equal(ok.result!.authorization[0]!.reason, "authorized_explicit_information_transfer");
  const wrong = await tell("Nicco turns to Maren and tells her that the eastern bridge is closed.");
  assert.deepEqual(wrong.s.campaign.exportSnapshot(), wrong.before);
});
test("declining to put the clothes on after receipt does not retract the transfer (Phase 1M.1 replay regression)", async () => {
  const { result } = await handover("Brenna looks at the offered clothes. She reaches out and takes them, gathering the shirts and shorts in her large hands. She does not move to put anything on, only holds what she's been given.");
  assert.deepEqual(result!.authorized_commands, garments);
  const doubt = await handover("Brenna takes all three garments. She does not want to keep them.");
  assert.deepEqual(doubt.result!.authorized_commands, []);
});
