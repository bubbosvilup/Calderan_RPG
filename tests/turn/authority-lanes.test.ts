import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadWorld } from "../../src/world/loader.js";
import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import { identityNameFactId } from "../../src/campaign/identity-knowledge.js";
import { turnFixture } from "../../src/dev/support/turn-fixture.js";
import { CONTROLLER_SCHEMA } from "../../src/llm/controller-schema.js";
import { AUTHORITY_LANES } from "../../src/turn/authorization/authority-lanes.js";
import { authorizeCommands } from "../../src/turn/authorization/command-authorizer.js";
import { deriveTurnEvidence } from "../../src/turn/authorization/turn-evidence.js";
import { authorizeTradeProposals } from "../../src/turn/commerce/trade-authorization.js";
import { buildTurnContext } from "../../src/turn/context/context-builder.js";
import { SceneParticipants } from "../../src/turn/identity/scene-participants.js";
import { RecentConversation } from "../../src/turn/recent-conversation.js";
import { prepareCommit } from "../../src/turn/stages/commit-preparation.js";
import { buildTrace } from "../../src/app/turn-trace.js";
import type { TurnResult } from "../../src/turn/turn-types.js";
import { P35_LIVE_INTRODUCTION } from "../fixtures/p35-live-introduction.js";
import { collect, setup } from "../support/turn-fixtures.js";

/**
 * Block B5 (PIPE-6): the authority lanes are declared, every committed command carries the lane that produced it, and the committed list is the final
 * batch (after commit preparation and the TRD-2 drop), in TurnResult and in the turn trace. The corpus-wide checks (every lane exercised, every lane
 * record within its declared kinds, the committed list reproducing the committed state) are in reader-parity.test.ts.
 */
const world = await loadWorld("data"), MARKET = "calderan_slave_market";

// ------------------------------------------------------------------------------------------------ the closed lane vocabulary
const controllerKinds = new Set((CONTROLLER_SCHEMA.properties!.commands!.items!.anyOf ?? []).flatMap(s => (s.properties?.kind?.enum ?? []) as string[]));
test("lane vocabulary: seven declared lanes, and each commit-preparation lane emits only its own kinds", () => {
  assert.deepEqual(Object.keys(AUTHORITY_LANES), ["player_runtime", "preferred_authorization", "trade", "late_naming", "name_knowledge", "character_contract", "person_offer"]);
  assert.deepEqual(Object.fromEntries(Object.entries(AUTHORITY_LANES).map(([k, v]) => [k, [v.stage, v.reads, v.kinds ?? null]])), {
    player_runtime: ["intent", "player_input", ["runtime_delta", "move_character"]], preferred_authorization: ["authorization", "draft", null],
    trade: ["authorization", "draft", ["propose_trade_offer", "withdraw_trade_offer"]], late_naming: ["commit_preparation", "delivered", ["set_profile"]],
    name_knowledge: ["commit_preparation", "delivered", ["create_fact", "set_knowledge"]], character_contract: ["commit_preparation", "delivered", ["establish_character_contract"]],
    person_offer: ["commit_preparation", "delivered", ["propose_trade_offer"]] });
});
test("lane vocabulary: the Controller can never propose a commit-preparation kind, and no other path decides one", () => {
  assert.ok(controllerKinds.size > 10);
  for (const kind of ["set_profile", "create_fact", "establish_character_contract"]) assert.equal(controllerKinds.has(kind), false, kind);
  assert.doesNotMatch(JSON.stringify(CONTROLLER_SCHEMA), /"person"/, "the Controller schema has no person subject");
  // The trade lane refuses a person offer; the preferred path refuses knowledge for Nicco (L5b is the only lane that teaches Nicco a name).
  const f = turnFixture(), snapshot = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, snapshot);
  const person: CampaignCommand = { kind: "propose_trade_offer", direction: "buy", price_gold: 5, counterparty: { kind: "anonymous", label: "seller" }, subject: { kind: "person", subject_character_id: "brenna", plan: [] } } as unknown as CampaignCommand;
  assert.equal(authorizeTradeProposals([{ command: person, quote: "Five gold for her, the seller says." }], "Five gold for her, the seller says.", context, snapshot, f.world)[0]!.code, "person_offer_not_controller");
  const knowNicco: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: "any", status: "knows" } };
  assert.equal(authorizeCommands([knowNicco], deriveTurnEvidence({ candidates: [], runtime: [] }, "Brenna smiles.", context), context, snapshot, f.world)[0]!.authorized, false);
});
/** Source without comment lines. */
const code = (file: string) => readFileSync(file, "utf8").split("\n").filter(l => !/^\s*(?:\/\/|\/?\*)/.test(l)).join("\n");
test("lane vocabulary: only the coordinator commits a turn, and every receipt commit preparation builds is prepared from a lane list", () => {
  for (const file of ["src/turn/stages/commit-preparation.ts", "src/turn/stages/authorization.ts", "src/turn/stages/audit.ts", "src/turn/stages/intent.ts"]) assert.doesNotMatch(code(file), /\.commit\(/, file);
  assert.match(readFileSync("src/turn/coordinator/turn-coordinator.ts", "utf8"), /campaign\.commit\(plan\.receipt\)/);
  const prep = readFileSync("src/turn/stages/commit-preparation.ts", "utf8"), prepares = [...prep.matchAll(/i\.prepare\(\{[^}]*\}\)/g)].map(m => m[0]);
  assert.equal(prepares.length, 4);
  for (const p of prepares) assert.match(p, /commands: commandsOf\(/, p);
});

// ------------------------------------------------------------------------------------------------ the committed list
/** Korvin at the market, not yet named; a goods offer authorized on the DRAFT; the delivered text is his name reveal with no price in it. */
function korvinTurn(delivered: string) {
  const campaign = createOpeningCampaign(world, "b5_lanes");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }] });
  const participants = new SceneParticipants(), recent = new RecentConversation(), input = "name's Nicco, who am i speaking with?";
  const context = buildTurnContext(world, campaign.exportSnapshot());
  participants.commit(participants.plan("I approach the short compact man.", context), "*The short man nods.*");
  recent.add({ player: "I approach the short compact man.", narration: "*The short man nods.*", status: "finalized", location_id: MARKET, conversation_partner_id: "korvin" });
  const projected = campaign.exportSnapshot(), draft = 'Korvin lifts a halberd from the weapon rack. "Fifteen gold for the halberd."';
  const buy: CampaignCommand = { kind: "propose_trade_offer", direction: "buy", price_gold: 15, counterparty: { kind: "character", character_id: "korvin" }, subject: { kind: "goods", lines: [{ name: "Halberd", description: "A halberd.", visual_description: "a halberd" }] } };
  const diagnostics = authorizeTradeProposals([{ command: buy, quote: "Fifteen gold for the halberd." }], draft, context, projected, world);
  assert.equal(diagnostics[0]!.authorized, true, "the draft authorizes the card");
  const prepared = campaign.prepare({ expected_revision: campaign.revision, commands: [buy] });
  const plan = prepareCommit({ world, prepare: p => campaign.prepare(p), prepared, lanes: [{ lane: "trade", command: buy, evidence: "Fifteen gold for the halberd." }], finalized: recent.finalized(), player_input: input,
    delivered, scene: participants.plan(input, context), base_revision: campaign.revision, disclosure_intent: { candidates: [], runtime: [] }, trade_recheck: { diagnostics, projected }, location_changed: false,
    on_skip: reason => assert.fail(reason) });
  return { campaign, plan };
}
test("committed list: a goods offer TRD-2 drops is not listed, a commit-preparation command is, and the list is exactly what the receipt holds", () => {
  const { campaign, plan } = korvinTurn(P35_LIVE_INTRODUCTION);
  assert.deepEqual(plan.committed.map(c => [c.lane, c.command.kind]), [["name_knowledge", "create_fact"], ["name_knowledge", "set_knowledge"]]);
  assert.deepEqual(plan.offers?.map(o => o.reason), ["quote_not_in_delivered_text"]);
  assert.equal((plan.receipt.snapshot.trade_offers ?? []).length, 0, "the dropped card is not in the receipt");
  assert.deepEqual(campaign.prepare({ expected_revision: campaign.revision, commands: plan.committed.map(c => c.command) }).snapshot, plan.receipt.snapshot);
  assert.ok(plan.receipt.snapshot.knowledge.some(k => k.character_id === "nicco" && k.fact_id === identityNameFactId("korvin")));
});
test("committed list: the trade lane keeps its offer and its quote when the delivered text still shows it", () => {
  const { plan } = korvinTurn('Korvin lifts a halberd from the weapon rack. "Fifteen gold for the halberd."');
  assert.deepEqual(plan.committed.map(c => [c.lane, c.command.kind, c.evidence]), [["trade", "propose_trade_offer", "Fifteen gold for the halberd."]]);
});
test("lane record: an NPC+ self-description in the delivered text commits as a character_contract with its quote", () => {
  const f = turnFixture(), HOME = "campaign_household_h";
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_household", id: HOME, name: "Home" }, { kind: "set_membership", household_id: HOME, membership: { character_id: "nicco", status: "member", role: "owner" } }] });
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "join_household", household_id: HOME, character_id: "brenna" }] });
  const context = buildTurnContext(f.world, f.campaign.exportSnapshot()), prepared = f.campaign.prepare({ expected_revision: f.campaign.revision, commands: [] });
  const plan = prepareCommit({ world: f.world, prepare: p => f.campaign.prepare(p), prepared, lanes: [], finalized: [], player_input: "Tell me about yourself.", delivered: 'Brenna looks at him. "I will never hurt children," she says.',
    scene: new SceneParticipants().plan("Tell me about yourself.", context), base_revision: f.campaign.revision, location_changed: false, on_skip: reason => assert.fail(reason) });
  assert.deepEqual(plan.committed.map(c => [c.lane, c.command.kind, c.evidence]), [["character_contract", "establish_character_contract", "I will never hurt children,"]]);
});

// ------------------------------------------------------------------------------------------------ result and trace
test("a turn's result and trace list what committed, with lanes; authorized_commands stays the authorization stage's list", async () => {
  const transfer: CampaignCommand = { kind: "transfer_item", mode: "handoff", item_id: "boots", position: { kind: "carried", character_id: "brenna" } };
  const s = setup("Brenna accepts boots from Nicco.", [transfer]), before = s.campaign.revision;
  const last = (await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: "I give boots to Brenna." }))).at(-1)!;
  assert.equal(last.type, "turn_completed");
  const result = (last as { result: TurnResult }).result;
  assert.deepEqual(result.committed.map(c => [c.lane, c.command.kind]), [["preferred_authorization", "transfer_item"]]);
  assert.deepEqual(result.authorized_commands, result.committed.map(c => c.command));
  const trace = buildTrace({ sequence: 1, campaign_id: "c", dataset_id: "d", player_input: "I give boots to Brenna.", revision_before: before, outcome: "completed", revision_after: s.campaign.revision, result });
  assert.deepEqual(trace.committed_command_kinds, ["transfer_item"]);
  assert.deepEqual(trace.committed_lanes, [{ lane: "preferred_authorization", kind: "transfer_item" }]);
});
test("the trace takes committed kinds from the committed list, not from the pre-commit-preparation batch", () => {
  const buy = { kind: "propose_trade_offer" } as unknown as CampaignCommand, naming = { kind: "set_profile" } as unknown as CampaignCommand;
  const result = { authorized_commands: [buy], committed: [{ lane: "late_naming", command: naming }], authorization: [], narrator: {}, controller: {}, retrieval: { ids: [], mode: "none" } } as unknown as TurnResult;
  const trace = buildTrace({ sequence: 1, campaign_id: "c", dataset_id: "d", player_input: "x", revision_before: 0, outcome: "completed", revision_after: 1, result });
  assert.deepEqual([trace.committed_command_kinds, trace.committed_lanes], [["set_profile"], [{ lane: "late_naming", kind: "set_profile" }]]);
});

// ------------------------------------------------------------------------------------------------ AUD-2 wiring
test("AUD-2: late naming and the household speech readers read the turn's shared facts; NPC+ contracts keep their own reading (parity does not hold)", () => {
  const prep = readFileSync("src/turn/stages/commit-preparation.ts", "utf8");
  assert.match(prep, /establishNames\([\s\S]*?\.\.\.\(i\.facts \? \{ facts: i\.facts \} : \{\}\) \}\);/);
  assert.match(prep, /contractCommands\(i\.delivered, context, i\.prepared\.snapshot\);/);
  assert.match(readFileSync("src/turn/authorization/turn-evidence.ts", "utf8"), /detectHouseholdChoices\(narration, context, facts\?\.dialogue\)/);
  const evidence = readFileSync("src/turn/authorization/evidence-authorization.ts", "utf8");
  assert.match(evidence, /verifyRelationshipEvidence\(command, quote, rawNarration, context, facts\?\.dialogue\)/);
  assert.match(evidence, /detectHouseholdChoices\(rawNarration, context, facts\?\.dialogue\)/);
});
