import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { resolvePersonTransactions } from "../src/turn/person-transactions.js";
import { detectHouseholdChoices, extractRuleDeclarations, verifyRelationshipEvidence } from "../src/turn/household-evidence.js";
import { authorizeWithEvidence } from "../src/turn/evidence-authorization.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { playerIntent } from "../src/turn/player-intent.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { formatCampaignStatus } from "../src/dev/campaign-status.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Household Pass 1: natural-language evals (deterministic resolvers and evidence) and an end-to-end turn scenario. No LLM calls. */
const world = await loadWorld("data");
const BRENNA = "campaign_character_brenna", MAREN = "campaign_character_maren";
const person = (id: string, name: string, years: number, location = "calderan_slave_market"): CampaignCommand =>
  ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years } }, current: { current_location: location, status: "active" } } });
let serial = 0;
function market(extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `household_turns_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } },
    ...learnCanonicalName(world, c.exportSnapshot(), "korvin"), person(BRENNA, "Brenna", 29), { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }, ...extra] });
  return c;
}
const OFFER: RecentExchange = { player: "Name your price again, Korvin.", narration: 'Korvin studies the woman in the cage, then Nicco. "Five." He taps the ledger. "Papers included. Clean transfer, debt-forfeiture chain, no liens."', status: "finalized" };
const UNPAPERED: RecentExchange = { player: "What about the girl?", narration: '"Ten gold was for three," Brenna says. The whittler shrugs. "Three gold. She\'s a write-off. No papers, no listing, no—"', status: "finalized" };
const resolve = (c: CampaignState, input: string, recent: readonly RecentExchange[] = [OFFER]) => resolvePersonTransactions(input, buildTurnContext(world, c.exportSnapshot()), c.exportSnapshot(), recent, c.revision);

// ------------------------------------------------------------------------------------------------ controller evals: purchase
test("purchase evals: explicit acceptance or payment of the established offer resolves one exact sale; questions and hedges never do", () => {
  const c = market();
  for (const input of ["Done. Five.", "*pays him and takes the key*", "mmh alright *pays up* i will bring her myself, she can't walk for sure", "Done."]) {
    const r = resolve(c, input);
    assert.equal(r.commands.length, 1, input);
    const cmd = r.commands[0]!; assert.ok(cmd.kind === "transfer_person");
    if (cmd.kind !== "transfer_person") continue;
    assert.deepEqual([cmd.character_id, cmd.from_holder_id, cmd.to_holder_id, cmd.payment!.gold, cmd.documentation], [BRENNA, "korvin", "nicco", 5, "documented"], input);
    assert.match(cmd.note ?? "", /debt-forfeiture chain/);
  }
  const three = resolve(c, "I'll take her for three gold.").commands[0]!;
  assert.ok(three.kind === "transfer_person" && three.payment!.gold === 3); // the player's own stated amount
  for (const input of ["How much?", "Let me look at her.", "Maybe.", "We should save her.", "If she's dying I'll buy her.", "Would you take four?"])
    assert.deepEqual(resolve(c, input).commands, [], input);
});
test("purchase evals: unpapered offers stay unpapered, ambiguity and unaffordable deals resolve nothing, and the narrator is told", () => {
  const c = market();
  const r = resolve(c, "*pays him and take the key to free her*", [UNPAPERED]);
  const cmd = r.commands[0]!; assert.ok(cmd.kind === "transfer_person");
  assert.deepEqual(cmd.kind === "transfer_person" ? [cmd.payment!.gold, cmd.documentation] : [], [3, "undocumented"]); // "Ten gold was for three" is not the price
  assert.ok(!r.commands.some(x => x.kind === "manumit")); // unchaining is not manumission
  const none = resolve(c, "Done.", [{ player: "Hello.", narration: "Korvin shrugs.", status: "finalized" }]);
  assert.deepEqual([none.commands, none.diagnostics[0]!.status], [[], "no_offer"]);
  const two = market([person(MAREN, "Maren", 15), { kind: "set_legal_status", character_id: MAREN, status: "enslaved", holder_id: "korvin" }]);
  assert.deepEqual([resolve(two, "Done.").commands, resolve(two, "Done.").diagnostics[0]!.status], [[], "ambiguous"]); // never "take all nearby"
  assert.equal(resolve(two, "Done, I'll take Maren.").commands[0]!.kind === "transfer_person" && (resolve(two, "Done, I'll take Maren.").commands[0] as { character_id: string }).character_id, MAREN);
  const poor = market([{ kind: "set_funds", character_id: "nicco", gold: 2 }]);
  const blocked = resolve(poor, "Done.");
  assert.deepEqual(blocked.commands, []); assert.match(blocked.notes[0]!, /has only 2: the purchase cannot complete/);
});
test("manumission evals: legal freeing of a person Nicco holds resolves; chains, permission to leave and hedges do not", () => {
  const c = market();
  c.apply({ expected_revision: c.revision, commands: [{ kind: "transfer_person", transaction_id: "campaign_transaction_setup", transaction_kind: "sale", character_id: BRENNA, from_holder_id: "korvin", to_holder_id: "nicco", payment: { payer_id: "nicco", payee_id: "korvin", gold: 5 }, documentation: "documented" }] });
  for (const input of ["You are free now, Brenna. No one owns you.", "I hereby free you.", "*grants Brenna her freedom*"]) assert.equal(resolve(c, input, []).commands[0]?.kind, "manumit", input);
  for (const input of ["*frees her from the chains*", "You're free to go outside.", "Maybe one day I'll free you.", "Are you free tomorrow?"]) assert.deepEqual(resolve(c, input, []).commands, [], input);
});

// ------------------------------------------------------------------------------------------------ controller evals: household
test("household evals: only the chooser's own unhedged words establish a join; welcomes, care and ownership never do", () => {
  const c = market();
  const context = buildTurnContext(world, c.exportSnapshot());
  for (const narration of ['Brenna rests her palm on the stone. "I, Brenna, decide to stay and become a resident. I swear to protect the hearthstone."', 'Brenna looks around the room. "I want to stay here. This is my home."'])
    assert.deepEqual(detectHouseholdChoices(narration, context).map(x => [x.character_id, x.choice]), [[BRENNA, "join"]], narration);
  for (const narration of ['"You can stay here tonight," Nicco says.', '"I\'ll take care of you," Nicco says.', '"Welcome," Nicco says.', '"I bought you," Nicco says.', '"You are safe here," Nicco says.',
    'Brenna frowns. "Maybe I\'ll stay for now."', 'Brenna shrugs. "I could become a member, if you asked."', 'Brenna sits by the fire and says nothing.'])
    assert.deepEqual(detectHouseholdChoices(narration, context), [], narration);
});
test("rule evals: explicit rule declarations are extracted; ordinary requests are not rules; rules authorize only against declarations", () => {
  const historical = "*ahem clearing his troat* Rule number 1 : Household is family, no lies, no secrets among family. Rule number 2 : Protect the family, at all costs Rule number 3 : Which is my favorite one by the way.. Indoor only barefoot. The household will always be barefoot inside. That's All!";
  const rules = extractRuleDeclarations(historical);
  assert.equal(rules.length, 3); assert.match(rules[0]!, /Household is family, no lies, no secrets among family/); assert.match(rules[2]!, /barefoot/);
  assert.deepEqual(extractRuleDeclarations("Don't steal my porridge."), []);
  assert.deepEqual(extractRuleDeclarations("House rule: nobody lies to family."), ["nobody lies to family"]);
  const c = market(), context = buildTurnContext(world, c.exportSnapshot());
  const rule: CampaignCommand = { kind: "add_household_rule", household_id: OPENING_HOUSEHOLD, text: "Protect the family, at all costs" };
  const authorize = (input: string) => {
    const intent = { ...playerIntent(input, context, c.exportSnapshot(), world), rule_declarations: extractRuleDeclarations(input) };
    return authorizeWithEvidence([rule], undefined, deriveTurnEvidence(intent, "Brenna listens.", context), "Brenna listens.", context, c.exportSnapshot(), "hybrid")[0]!;
  };
  assert.equal(authorize(historical).authorized, true);
  assert.deepEqual([authorize("We should protect each other, I guess.").authorized, authorize("We should protect each other, I guess.").reason], [false, "rejected_insufficient_confirmation"]);
});
test("relationship evals: the feeling character's own evidenced act authorizes one step; Nicco's purchase, gift or care never does", () => {
  const c = market([person(MAREN, "Maren", 15)]);
  const context = buildTurnContext(world, c.exportSnapshot());
  const adjust = (from: string, to: string, dimension: "protectiveness" | "affection" | "trust", narration: string, quote: string) => {
    const cmd: CampaignCommand = { kind: "adjust_relationship", from_character_id: from, to_character_id: to, dimension, direction: "raise" };
    return { check: verifyRelationshipEvidence(cmd as Extract<CampaignCommand, { kind: "adjust_relationship" }>, quote, narration, context),
      decision: authorizeWithEvidence([cmd], [quote], deriveTurnEvidence(playerIntent("*waits*", context, c.exportSnapshot(), world), narration, context), narration, context, c.exportSnapshot(), "hybrid")[0]! };
  };
  const strong = adjust(BRENNA, MAREN, "protectiveness", "Brenna steps between Maren and the door, shielding her.", "Brenna steps between Maren and the door, shielding her.");
  assert.deepEqual([strong.check.verified, strong.decision.authorized, strong.decision.reason], [true, true, "authorized_controller_evidence"]);
  for (const [dimension, narration, quote] of [
    ["affection", "Nicco gives Brenna a pink shirt. Brenna holds it.", "Nicco gives Brenna a pink shirt."],   // a gift is Nicco's act
    ["trust", "Korvin hands Nicco the key. Brenna watches.", "Brenna watches."],                              // a purchase is not trust
    ["trust", "Nicco heals the fever. Brenna sleeps.", "Brenna sleeps."],                                      // care is not trust
    ["affection", 'Brenna stays in the room. "We are family," Nicco says.', "Brenna stays in the room."],     // presence and a declaration
  ] as const) {
    const weak = adjust(BRENNA, "nicco", dimension, narration, quote);
    assert.deepEqual([weak.check.verified, weak.decision.authorized], [false, false], narration);
  }
  const agency = authorizeWithEvidence([{ kind: "adjust_relationship", from_character_id: "nicco", to_character_id: BRENNA, dimension: "affection", direction: "raise" }], ["Nicco hugs Brenna warmly."],
    deriveTurnEvidence(playerIntent("*hugs her*", context, c.exportSnapshot(), world), "Nicco hugs Brenna warmly.", context), "Nicco hugs Brenna warmly.", context, c.exportSnapshot(), "hybrid")[0]!;
  assert.deepEqual([agency.authorized, agency.reason], [false, "rejected_command_not_allowed"]); // Nicco's feelings belong to the player
});

// ------------------------------------------------------------------------------------------------ end to end
function scripted(texts: readonly string[], seen: GenerationRequest[]): NarratorProvider {
  let i = 0;
  return { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = texts[Math.min(i++, texts.length - 1)]!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
}
async function turn(c: CampaignState, input: string, texts: readonly string[], commands: readonly CampaignCommand[] = [], evidence?: readonly string[], seen: GenerationRequest[] = [], coordinator?: TurnCoordinator) {
  const service = new RetrievalService(world);
  const co = coordinator ?? new TurnCoordinator(world, scripted(texts, seen), { async propose() { return { commands: [...commands], ...(evidence ? { evidence: [...evidence] } : {}), ...metadata }; } }, { service, search: new HybridSearch(service) });
  const events = await collect(co.runTurn({ campaign: c, player_input: input }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_completed", JSON.stringify(last));
  return (last as { result: TurnResult }).result;
}
const members = (c: CampaignState) => c.exportSnapshot().households.find(h => h.id === OPENING_HOUSEHOLD)!.members.filter(m => m.status === "member" && m.role !== "owner").map(m => m.character_id);
const gold = (c: CampaignState) => c.exportSnapshot().funds.find(f => f.character_id === "nicco")!.gold;

test("end to end: market → negotiate → buy → Heartstone → wary care → voluntary join, with state always authoritative", async () => {
  const c = market(), seen: GenerationRequest[] = [];
  const service = new RetrievalService(world);
  let texts: string[] = [], commands: CampaignCommand[] = [], evidence: string[] | undefined;
  const coordinator = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = texts.shift()!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [...commands], ...(evidence ? { evidence: [...evidence] } : {}), ...metadata }; } }, { service, search: new HybridSearch(service) });
  const step = async (input: string, narration: readonly string[], cmds: CampaignCommand[] = [], ev?: string[]) => { texts = [...narration]; commands = cmds; evidence = ev; return turn(c, input, [], [], undefined, seen, coordinator); };
  const prompt = () => seen.at(-1)!.messages[0]!.content;

  // 1. Inspect and negotiate: nothing changes, and the narrator knows the purse and Brenna's legal status.
  await step("*checks the cages* Korvin, what about her?", [OFFER.narration]);
  assert.match(prompt(), /Nicco's money: 500 gold/); assert.match(prompt(), /Brenna: legally enslaved; legal holder Korvin/);
  assert.deepEqual([gold(c), members(c)], [500, []]);
  // 2. Accept: the engine resolves and validates the sale BEFORE narration; the narrator is told the outcome.
  const bought = await step("Done. *pays him*", ["Korvin pockets the coins and hands over the key and the papers. Brenna watches the exchange with flat, wary eyes."]);
  assert.match(prompt(), /Purchase completes now \(already validated, authoritative\): Nicco pays Korvin 5 gold/);
  assert.equal(bought.narration_reconciliation?.delivered, "draft");
  assert.deepEqual([gold(c), c.exportSnapshot().legal_statuses[0]!.holder_id, members(c)], [495, "nicco", []]);
  // 3. Home: Brenna stays at Heartstone, still not household. A draft calling her household is reconciled, not committed.
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_lr" } }, { kind: "move_character", character_id: BRENNA, location_id: "heartstone_lr" }] });
  const care = await step("Rest. You're safe here.", ["Brenna, now part of the household, sits on the edge of the bed.", "Brenna sits on the edge of the bed and keeps her distance, saying nothing."]);
  assert.equal(care.narration_reconciliation?.delivered, "revision");
  assert.ok(care.narration_reconciliation!.issues.some(i => i.kind === "uncommitted_household"));
  assert.match(prompt(), /Present but NOT household members: Brenna/);
  assert.match(prompt(), /Nicco's money: 495 gold/); assert.deepEqual(members(c), []);
  // 4. Her own voluntary oath: the controller proposes, the chooser's words confirm; protectiveness rises one step, trust does not.
  const oath = 'Brenna rests her palm on the warm stone. "I, Brenna, decide to stay and become a resident. I swear to protect the hearthstone and Nicco, the keeper."';
  const joined = await step("*explains the Heartstone and waits*", [oath],
    [{ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: BRENNA }, { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: "nicco", dimension: "protectiveness", direction: "raise" }],
    ["I, Brenna, decide to stay and become a resident.", "I swear to protect the hearthstone and Nicco, the keeper."]);
  assert.deepEqual(joined.authorization.map(a => [a.command.kind, a.authorized]), [["join_household", true], ["adjust_relationship", true]]);
  assert.deepEqual(members(c), [BRENNA]);
  assert.deepEqual(c.exportSnapshot().relationships.find(e => e.from_character_id === BRENNA)!.dimensions, { protectiveness: "low" });
  // 5. After the join the narrator sees her as a member; money was never touched again; status comes from runtime only.
  await step("Welcome home.", ["Brenna nods once."]);
  assert.match(prompt(), /members: Brenna/); assert.doesNotMatch(prompt(), /Present but NOT household members: Brenna/);
  assert.equal(gold(c), 495);
  assert.match(formatCampaignStatus(c.exportSnapshot(), world), /Money: 495 gold[\s\S]*Heartstone Household: 1 — Brenna/);
});
test("end to end: an unaffordable purchase is blocked before narration; narrated payment is reconciled; nothing changes", async () => {
  const c = market([{ kind: "set_funds", character_id: "nicco", gold: 2 }]), seen: GenerationRequest[] = [];
  const coordinator = new TurnCoordinator(world, scripted([OFFER.narration, "Korvin pockets the coins and hands over the key.", "Korvin shakes his head and keeps the key on his belt."], seen),
    { async propose() { return { commands: [], ...metadata }; } }, { service: new RetrievalService(world), search: new HybridSearch(new RetrievalService(world)) });
  await turn(c, "Korvin, what about her?", [], [], undefined, seen, coordinator);
  const r = await turn(c, "Done. *pays him*", [], [], undefined, seen, coordinator);
  assert.match(seen.at(-2)!.messages[0]!.content, /has only 2: the purchase cannot complete/);
  assert.ok(r.narration_reconciliation!.issues.some(i => i.kind === "asserts_uncommitted_purchase"));
  assert.deepEqual([gold(c), c.exportSnapshot().legal_statuses[0]!.holder_id, c.exportSnapshot().transactions], [2, "korvin", []]);
});
