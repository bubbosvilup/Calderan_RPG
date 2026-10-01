import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { OFFER as GARMENT_OFFER } from "../src/dev/evidence-corpus.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { authorizeWithEvidence, verifyEvidence } from "../src/turn/evidence-authorization.js";
import { narratedDepartures } from "../src/turn/scene-departure.js";
import { groundingIssues } from "../src/turn/grounding-audit.js";
import { auditNarration } from "../src/turn/narration-audit.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { resolvePersonTransactions } from "../src/turn/person-transactions.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";

/**
 * Hardening H1: the intended behaviour changes, proven through every affected CALL PATH (not only the regexes), plus the adversarial
 * suite for the evidence-authorization firewall. Offline; no LLM is called.
 */
const world = await loadWorld("data");
let serial = 0;

// ------------------------------------------------------------------------------------------- shared real-world harness (the inn)
const DELL = "campaign_character_eval_dell_harrow";
function inn(): CampaignState {
  const c = createOpeningCampaign(world, `h1_call_paths_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "gatherers_inn" } },
    { kind: "register_character", character: { id: DELL, origin: { kind: "created" }, profile: { name: "Dell Harrow", sex: "male" }, current: { current_location: "gatherers_inn", status: "active" } } }] });
  return c;
}
function audit(c: CampaignState, input: string, narration: string) {
  const snapshot = c.exportSnapshot(), context = buildTurnContext(world, snapshot), intent = playerIntent(input, context, snapshot, world);
  return auditNarration({ narration, context, world, access: projectKnowledgeAccess(context, {}), evidence: deriveTurnEvidence(intent, narration, context), diagnostics: [], committed: [],
    prepared: snapshot, player_input: input, recent: [], authoritative_text: JSON.stringify({ context }) }).map(i => i.kind);
}

// ------------------------------------------------------------------------------------------- change 1: bare "no" per call path
test("bare-no fix / departure path: 'No word to anyone, Dell walks out' is a completed departure; real negation still is not", () => {
  const context = buildTurnContext(world, inn().exportSnapshot());
  const ids = (n: string) => narratedDepartures(n, context).map(d => d.character_id);
  assert.deepEqual(ids("No word to anyone, Dell walks out of the inn."), [DELL]);
  assert.deepEqual(ids("No warning: Dell storms out of the inn."), [DELL]);
  assert.deepEqual(ids("No, Dell walks out of the inn."), [], "a bare 'No' is still negation");
  assert.deepEqual(ids("Dell does not walk out of the inn."), []);
});
test("bare-no fix / condition-constraint audit path: 'no warning' does not hide an uncommitted constraint or condition", () => {
  assert.ok(audit(inn(), "*Nicco sips his ale.*", "No warning: Dell grips Nicco's arm and holds it.").includes("uncommitted_constraint"));
  assert.ok(audit(inn(), "*Nicco sips his ale.*", "With no hesitation, Dell knocks Nicco unconscious.").includes("uncommitted_condition"));
  assert.ok(!audit(inn(), "*Nicco sips his ale.*", "Dell does not grip Nicco's arm.").includes("uncommitted_constraint"), "real negation is still not a claim");
});
test("bare-no fix / grounding path: an unhedged fabricated agreement with 'no hesitation' is flagged; a denied one is not", () => {
  const issues = (sentence: string) => groundingIssues({ sentences: [sentence], player_input: "Hello.", recent: [], authoritative_text: "" }).map(i => i.kind);
  assert.ok(issues("We agreed on the price with no hesitation.").includes("fabricated_prior_event"));
  assert.deepEqual(issues("We never agreed on anything."), []);
});
test("bare-no fix / authorization path: 'no hesitation' and 'without hesitation' confirm a handover", () => {
  const { world: w, campaign } = turnFixture(); const snapshot = campaign.exportSnapshot(), context = buildTurnContext(w, snapshot);
  const intents = playerIntent("I give boots to Brenna.", context, snapshot, w).candidates;
  const transfer: CampaignCommand = { kind: "transfer_item", item_id: "boots", owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } };
  for (const n of ["Brenna takes the boots, no hesitation.", "Brenna takes the boots without hesitation."]) assert.equal(verifyEvidence(transfer, n, n, context, intents).verified, true, n);
  assert.equal(verifyEvidence(transfer, "Brenna hesitates, then takes the boots.", "Brenna hesitates, then takes the boots.", context, intents).verified, false);
});

// ------------------------------------------------------------------------------------------- number unification per call path
test("numbers / grounding path: thirteen-nineteen, the tens and digits are prices; a word amount supports the same digit amount", () => {
  const prices = (sentence: string, authoritative_text = "", player_input = "Hello.") =>
    groundingIssues({ sentences: [sentence], player_input, recent: [], authoritative_text }).filter(i => i.kind === "invented_price").length;
  assert.equal(prices("Fourteen copper a night."), 1);
  assert.equal(prices("That's 14 copper a night."), 1, "digit amounts are prices (guards the NUM digit alternative)");
  assert.equal(prices("Sixty silver for the lot."), 1, "H1: tens to ninety come from the canonical table");
  assert.equal(prices("That's 14 copper a night.", "", "Fourteen copper, then."), 0, "the player's word amount supports the digit amount");
  assert.equal(prices("A dozen copper, then.", "", "A dozen copper, then."), 0, "phrase extensions keep their own values");
  assert.equal(prices("A dozen copper, then.", "", "Twelve copper, then."), 0, "'a dozen' and 'twelve' are the same amount");
});
const BRENNA = "campaign_character_brenna";
function market(): CampaignState {
  const c = createOpeningCampaign(world, `h1_market_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } },
    { kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 29 } }, current: { current_location: "calderan_slave_market", status: "active" } } },
    { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }] });
  return c;
}
const OFFER: RecentExchange = { player: "Name your price again, Korvin.", narration: 'Korvin studies the woman in the cage, then Nicco. "Five." He taps the ledger. "Papers included."', status: "finalized" };
test("numbers / transaction path: 'for fourteen gold' pays fourteen (previously unparsed, silently fell back to the offer of five)", () => {
  const paid = (input: string) => { const c = market(); const cmd = resolvePersonTransactions(input, buildTurnContext(world, c.exportSnapshot()), c.exportSnapshot(), [OFFER], c.revision).commands[0];
    return cmd?.kind === "transfer_person" ? cmd.payment?.gold : undefined; };
  assert.equal(paid("I'll take her for fourteen gold."), 14);
  assert.equal(paid("I'll take her for thirteen gold."), 13);
  assert.equal(paid("I'll take her for 14 gold."), 14);
  assert.equal(paid("I'll take her for twelve gold."), 12, "unchanged");
  assert.equal(paid("Done."), 5, "no stated amount: the seller's established offer");
});

// ------------------------------------------------------------------------------------------- firewall adversarial suite
const transfer: CampaignCommand = { kind: "transfer_item", item_id: "boots", owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } };
function authorize(narration: string, quote = narration) {
  const { world: w, campaign } = turnFixture(); const snapshot = campaign.exportSnapshot(), context = buildTurnContext(w, snapshot);
  const intent = playerIntent("I give boots to Brenna.", context, snapshot, w);
  return authorizeWithEvidence([transfer], [quote], deriveTurnEvidence(intent, narration, context), narration, context, snapshot, "hybrid")[0]!.authorized;
}
test("firewall: a completed, asserted receipt authorizes the handover (controls)", () => {
  for (const n of ["Brenna takes the boots.", "Brenna accepts the boots from Nicco.", "Brenna takes the boots, no hesitation.", "Brenna takes the boots without hesitation."])
    assert.equal(authorize(n), true, n);
});
const UNSUPPORTED: Readonly<Record<string, readonly string[]>> = {
  quoted_speech_mistaken_for_action: ['Brenna says, "I take the boots."', '"I accept the boots," Brenna says, and does nothing.'],
  refusal: ["Brenna refuses the boots.", "Brenna declines the boots.", "Brenna rejects the boots."],
  hesitation: ["Brenna hesitates over the boots."],
  retraction: ["Brenna takes the boots, then hands them back.", "Brenna reaches for the boots but pulls back.", "Brenna steps back from the boots."],
  negated_action: ["Brenna does not take the boots.", "Brenna doesn't take the boots.", "Brenna never takes the boots."],
  future_intention: ["Brenna will take the boots.", "Brenna'll take the boots.", "Brenna is going to take the boots."],
  hypothetical: ["If Brenna takes the boots, she will need socks.", "Brenna would take the boots."],
  attempted_not_completed: ["Brenna tries to take the boots.", "Brenna almost takes the boots.", "Brenna starts to take the boots.",
    "Brenna attempts to take the boots.", "Brenna attempted to take the boots.", "Brenna is trying to take the boots.", "Brenna reaches for the boots."],
  epistemic_act: ["Brenna seems to take the boots.", "Brenna probably takes the boots.", "Brenna moves as if to take the boots."],
  instruction_frame: ["Gerome tells her to take the boots."],
  question: ["Does Brenna take the boots?"],
  clause_local_negation_is_sentence_wide_for_outbound: ["Brenna doesn't smile, but she takes the boots.", "Brenna takes the boots; she does not thank him."],
};
for (const [kind, cases] of Object.entries(UNSUPPORTED)) {
  test(`firewall adversarial: ${kind} never authorizes a handover`, () => { for (const n of cases) assert.equal(authorize(n), false, n); });
}
test("firewall: the H1 fail-safe additions do not veto ordinary act-unrelated prose", () => {
  // ("as if" alone was already vetoed before H1 by the bare "if" cue; that is preserved, not new.)
  for (const n of ["Brenna seems relieved as she takes the boots.", "It seems a fair trade; Brenna takes the boots.", "Brenna takes the boots, reaching out with both hands."])
    assert.equal(authorize(n), true, n);
});
test("firewall: collective confirmation authorizes only when the group covers the whole offer", () => {
  const { world: w, campaign } = turnFixture(true); const snapshot = campaign.exportSnapshot(), context = buildTurnContext(w, snapshot);
  const intent = playerIntent(GARMENT_OFFER, context, snapshot, w), garments = intent.candidates;
  assert.equal(garments.length, 3);
  const run = (n: string) => authorizeWithEvidence(garments, garments.map(() => n), deriveTurnEvidence(intent, n, context), n, context, snapshot, "hybrid").map(d => d.authorized);
  assert.deepEqual(run("Brenna takes the three garments from Nicco's hands."), [true, true, true]);
  assert.deepEqual(run("Brenna takes all three of them."), [true, true, true]);
  assert.deepEqual(run("Brenna takes the two garments."), [false, false, false], "a stated count that does not match the offer authorizes nothing");
  assert.deepEqual(run("Brenna takes the two pink shirts but leaves the shorts."), [false, false, false], "a partial acceptance never commits the group");
  assert.deepEqual(run("Brenna takes them, but not the shorts."), [false, false, false]);
});
