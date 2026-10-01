import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_FUNDS } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { buildTurnContext, SOCIAL_LIMITS } from "../src/turn/context-builder.js";
import { relationshipHeadline } from "../src/campaign/relationship-summary.js";
import { formatCampaignStatus } from "../src/dev/campaign-status.js";

/**
 * Household / Slave Trade / Relationship Runtime Pass 1: domain-level guarantees. Fixture people are campaign-created characters
 * (never canon); Korvin is the existing canonical licensed seller. Money, legal status, household membership, residence and
 * relationships are separate dimensions, and no transition of one silently rewrites another.
 */
const world = await loadWorld("data");
const BRENNA = "campaign_character_brenna", MAREN = "campaign_character_maren", WHITTLER = "campaign_character_whittler";
const person = (id: string, name: string, years: number, location = "calderan_slave_market"): CampaignCommand =>
  ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years } }, current: { current_location: location, status: "active" } } });
let serial = 0;
function market(extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `household_pass_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } },
    person(BRENNA, "Brenna", 29), { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }, ...extra] });
  return c;
}
const sale = (c: CampaignState, gold: number, subject = BRENNA, from = "korvin", documentation: "documented" | "undocumented" | "unestablished" = "documented", id = `campaign_transaction_r${c.revision}_sale`): CampaignCommand =>
  ({ kind: "transfer_person", transaction_id: id, transaction_kind: "sale", character_id: subject, from_holder_id: from, to_holder_id: "nicco", payment: { payer_id: "nicco", payee_id: from, gold }, documentation });
const apply = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const gold = (c: CampaignState, id = "nicco") => c.exportSnapshot().funds.find(f => f.character_id === id)?.gold;
const holder = (c: CampaignState, id = BRENNA) => c.exportSnapshot().legal_statuses.find(l => l.character_id === id);
const members = (c: CampaignState) => c.exportSnapshot().households.find(h => h.id === OPENING_HOUSEHOLD)!.members.filter(m => m.status === "member" && m.role !== "owner").map(m => m.character_id);
const edge = (c: CampaignState, from: string, to: string) => c.exportSnapshot().relationships.find(e => e.from_character_id === from && e.to_character_id === to);
const unchanged = (c: CampaignState, run: () => void) => { const before = structuredClone(c.exportSnapshot()); assert.throws(run); assert.deepEqual(c.exportSnapshot(), before); };
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-09-30T12:00:00.000Z"), world), world).snapshot);

// ------------------------------------------------------------------------------------------------ transactions
test("transactions A: a purchase commits atomically — 500 → 495, Korvin → Nicco, household unchanged", () => {
  const c = market();
  assert.equal(gold(c), OPENING_FUNDS);
  apply(c, sale(c, 5));
  assert.equal(gold(c), 495);
  assert.deepEqual([holder(c)!.status, holder(c)!.holder_id, holder(c)!.transfer!.documentation, holder(c)!.transfer!.from_holder_id], ["enslaved", "nicco", "documented", "korvin"]);
  assert.deepEqual(members(c), []);
  assert.equal(c.exportSnapshot().transactions.length, 1);
  assert.deepEqual(c.exportSnapshot().relationships, []); // no trust, loyalty or affection from a purchase
});
test("transactions B–F: insufficient funds, wrong seller, stale revision, replay and re-purchase all reject with no partial mutation", () => {
  const poor = market([{ kind: "set_funds", character_id: "nicco", gold: 3 }]);
  unchanged(poor, () => apply(poor, sale(poor, 5)));                                                      // B
  const c = market();
  unchanged(c, () => apply(c, sale(c, 5, BRENNA, "bartolomhew")));                                         // C: not the legal holder
  const stale = sale(c, 5);
  apply(c, { kind: "set_funds", character_id: "korvin", gold: 0 });
  unchanged(c, () => c.apply({ expected_revision: c.revision - 1, commands: [stale] }));                   // D: stale revision
  apply(c, sale(c, 5));
  assert.equal(gold(c), 495); assert.equal(gold(c, "korvin"), 5); // a tracked payee is credited exactly once
  const replay = c.exportSnapshot().transactions[0]!.id;
  unchanged(c, () => apply(c, sale(c, 5, BRENNA, "korvin", "documented", replay)));                       // E: replayed transaction ID
  unchanged(c, () => apply(c, sale(c, 5)));                                                                 // F: already transferred
  assert.equal(gold(c), 495); assert.equal(c.exportSnapshot().transactions.length, 1);
});
test("transactions G–H: manumission frees without touching household or relationships; a gift moves the holder only", () => {
  const c = market([person(MAREN, "Maren", 15), { kind: "set_legal_status", character_id: MAREN, status: "enslaved", holder_id: "korvin" }]);
  apply(c, sale(c, 5));
  apply(c, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: BRENNA });
  apply(c, { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: "nicco", dimension: "wariness", direction: "raise" });
  const beforeRelationships = structuredClone(c.exportSnapshot().relationships);
  apply(c, { kind: "manumit", transaction_id: `campaign_transaction_r${c.revision}_free`, character_id: BRENNA, by_holder_id: "nicco", documentation: "unestablished" });
  assert.equal(holder(c)!.status, "free"); assert.equal(holder(c)!.holder_id, undefined);
  assert.deepEqual(members(c), [BRENNA]);                                   // a freed member stays a member
  assert.deepEqual(c.exportSnapshot().relationships, beforeRelationships); // no gratitude or loyalty is created
  assert.throws(() => apply(c, { kind: "manumit", transaction_id: `campaign_transaction_r${c.revision}_again`, character_id: BRENNA, by_holder_id: "nicco", documentation: "unestablished" }));
  // H: a general holder A → holder B transfer (gift), without payment; relationships unchanged.
  const rel = structuredClone(c.exportSnapshot().relationships), money = gold(c);
  apply(c, { kind: "transfer_person", transaction_id: `campaign_transaction_r${c.revision}_gift`, transaction_kind: "gift", character_id: MAREN, from_holder_id: "korvin", to_holder_id: "bartolomhew", documentation: "unestablished" });
  assert.equal(holder(c, MAREN)!.holder_id, "bartolomhew"); assert.equal(gold(c), money); assert.deepEqual(c.exportSnapshot().relationships, rel);
  assert.throws(() => apply(c, { kind: "transfer_person", transaction_id: `campaign_transaction_r${c.revision}_bad`, transaction_kind: "gift", character_id: MAREN, from_holder_id: "bartolomhew", to_holder_id: "korvin", payment: { payer_id: "korvin", payee_id: "bartolomhew", gold: 1 }, documentation: "unestablished" }));
});

// ------------------------------------------------------------------------------------------------ household
test("household A–F: acquisition, residence and care never make membership; only an explicit join does, once; leaving touches nothing else", () => {
  const c = market();
  apply(c, sale(c, 5));
  assert.deepEqual(members(c), []);                                                                   // A
  apply(c, { kind: "runtime_delta", delta: { player_location: "heartstone_lr" } }, { kind: "move_character", character_id: BRENNA, location_id: "heartstone_lr" });
  assert.deepEqual(members(c), []);                                                                   // B: staying at Heartstone
  const social = buildTurnContext(world, c.exportSnapshot()).social;
  assert.deepEqual(social.households[0]!.present_non_members.map(p => p.character_id), [BRENNA]);
  assert.deepEqual(social.legal.map(l => [l.character_id, l.status, l.holder_id, l.papers]), [[BRENNA, "enslaved", "nicco", "documented"]]);
  apply(c, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: BRENNA });
  assert.deepEqual(members(c), [BRENNA]);                                                             // C
  assert.throws(() => apply(c, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: BRENNA })); // D
  assert.deepEqual(c.exportSnapshot().relationships, []);                                             // F: no love, romance or trust from joining
  const legalBefore = structuredClone(holder(c)), money = gold(c);
  apply(c, { kind: "leave_household", household_id: OPENING_HOUSEHOLD, character_id: BRENNA });
  assert.deepEqual(members(c), []); assert.deepEqual(holder(c), legalBefore); assert.equal(gold(c), money); // E
  assert.throws(() => apply(c, { kind: "leave_household", household_id: OPENING_HOUSEHOLD, character_id: "nicco" })); // the keeper cannot "leave"
});
test("household G: rules persist through save/load with IDs and revisions; identical active rules are rejected", () => {
  const c = market();
  apply(c, { kind: "add_household_rule", household_id: OPENING_HOUSEHOLD, text: "Household is family: no lies, no secrets among family" });
  const created = c.revision;
  apply(c, { kind: "add_household_rule", household_id: OPENING_HOUSEHOLD, text: "Protect the family, at all costs" });
  assert.throws(() => apply(c, { kind: "add_household_rule", household_id: OPENING_HOUSEHOLD, text: "protect the family, at all costs" }));
  apply(c, { kind: "set_household_rule_active", household_id: OPENING_HOUSEHOLD, rule_id: "rule_2", active: false });
  const restored = roundTrip(c).exportSnapshot().households.find(h => h.id === OPENING_HOUSEHOLD)!.rules!;
  assert.deepEqual(restored.map(r => [r.id, r.active, r.created_revision]), [["rule_1", true, created], ["rule_2", false, created + 1]]);
  assert.deepEqual(buildTurnContext(world, c.exportSnapshot()).social.households[0]!.rules, ["Household is family: no lies, no secrets among family"]);
});

// ------------------------------------------------------------------------------------------------ relationships
test("relationships A, B, F, G: directional, NPC↔NPC, one bounded step at a time, unrelated edges untouched", () => {
  const c = market([person(MAREN, "Maren", 15)]);
  apply(c, { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: "nicco", dimension: "trust", direction: "raise" });
  assert.equal(edge(c, BRENNA, "nicco")!.dimensions!.trust, "low"); assert.equal(edge(c, "nicco", BRENNA), undefined); // A
  apply(c, { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: MAREN, dimension: "protectiveness", direction: "raise" }); // B
  apply(c, { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: "nicco", dimension: "trust", direction: "raise" });
  apply(c, { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: "nicco", dimension: "trust", direction: "raise" });
  assert.equal(edge(c, BRENNA, "nicco")!.dimensions!.trust, "high");
  assert.throws(() => apply(c, { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: "nicco", dimension: "trust", direction: "raise" })); // F: bound
  assert.throws(() => apply(c, { kind: "adjust_relationship", from_character_id: MAREN, to_character_id: MAREN, dimension: "trust", direction: "raise" })); // no self-edge
  assert.deepEqual(edge(c, BRENNA, MAREN)!.dimensions, { protectiveness: "low" }); // G
  assert.equal(relationshipHeadline(edge(c, BRENNA, "nicco")!), "TRUSTING");
});
test("relationships H–I: save/load preserves social state; romance is impossible involving a minor or an unknown age", () => {
  const c = market([person(MAREN, "Maren", 15)]);
  apply(c, { kind: "adjust_relationship", from_character_id: MAREN, to_character_id: BRENNA, dimension: "trust", direction: "raise" });
  apply(c, { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: "nicco", dimension: "romance", direction: "raise" }); // two adults
  assert.deepEqual(roundTrip(c).exportSnapshot().relationships, c.exportSnapshot().relationships); // H
  for (const [from, to] of [[MAREN, "nicco"], ["nicco", MAREN], [BRENNA, MAREN]] as const)
    unchanged(c, () => apply(c, { kind: "adjust_relationship", from_character_id: from, to_character_id: to, dimension: "romance", direction: "raise" }));
  unchanged(c, () => apply(c, { kind: "seed_relationship", relationship: { from_character_id: MAREN, to_character_id: "nicco", dimensions: { romance: "low" } } }));
  apply(c, { kind: "register_character", character: { id: "campaign_character_unknown_age", origin: { kind: "created" }, profile: { name: "Stranger" }, current: { current_location: "calderan_slave_market" } } });
  unchanged(c, () => apply(c, { kind: "adjust_relationship", from_character_id: "campaign_character_unknown_age", to_character_id: "nicco", dimension: "romance", direction: "raise" }));
  // Family, protective and trust relationships with a minor remain fully supported.
  apply(c, { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: MAREN, dimension: "protectiveness", direction: "raise" });
});

// ------------------------------------------------------------------------------------------------ historical regressions
test("historical regression — Brenna: bought for 5, household stays empty through care, joins later by her own choice", () => {
  const c = market();
  assert.deepEqual([gold(c), members(c)], [500, []]);
  assert.equal(holder(c)!.holder_id, "korvin");
  apply(c, sale(c, 5, BRENNA, "korvin", "documented"));
  assert.deepEqual([gold(c), holder(c)!.holder_id, members(c)], [495, "nicco", []]);
  apply(c, { kind: "runtime_delta", delta: { player_location: "heartstone_lr" } }, { kind: "move_character", character_id: BRENNA, location_id: "heartstone_lr" });
  apply(c, { kind: "runtime_delta", delta: { time_advance_minutes: 600 } }); // care, feeding, sleep, conversation: no state of its own
  assert.deepEqual(members(c), []);
  apply(c, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: BRENNA });
  assert.deepEqual([gold(c), members(c)], [495, [BRENNA]]);
  assert.match(formatCampaignStatus(c.exportSnapshot(), world), /Money: 495 gold[\s\S]*Brenna — enslaved; holder=Nicco; documented transfer[\s\S]*Heartstone Household: 1 — Brenna/);
});
test("historical regression — Maren: bought unpapered for 3 with Brenna already home; no second transaction when she joins", () => {
  const c = market([{ kind: "set_funds", character_id: "nicco", gold: 454 }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: BRENNA },
    person(WHITTLER, "Whittler", 40), person(MAREN, "Maren", 15), { kind: "set_legal_status", character_id: MAREN, status: "enslaved", holder_id: WHITTLER }]);
  assert.deepEqual([gold(c), members(c)], [454, [BRENNA]]);
  apply(c, sale(c, 3, MAREN, WHITTLER, "undocumented"));
  assert.deepEqual([gold(c), holder(c, MAREN)!.holder_id, holder(c, MAREN)!.transfer!.documentation, members(c)], [451, "nicco", "undocumented", [BRENNA]]);
  apply(c, { kind: "move_character", character_id: MAREN, location_id: "heartstone_lr" }, { kind: "move_character", character_id: BRENNA, location_id: "heartstone_lr" }, { kind: "runtime_delta", delta: { player_location: "heartstone_lr" } });
  apply(c, { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: MAREN, dimension: "protectiveness", direction: "raise" }); // explicitly evidenced in play
  assert.deepEqual(members(c), [BRENNA]);
  const transactions = c.exportSnapshot().transactions.length;
  apply(c, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: MAREN });
  assert.deepEqual([gold(c), members(c).sort(), c.exportSnapshot().transactions.length], [451, [BRENNA, MAREN].sort(), transactions]);
});

// ------------------------------------------------------------------------------------------------ context budget
test("social context budget: only in-scene edges are shown, capped, deterministic; remote edges never appear", () => {
  const people = Array.from({ length: 8 }, (_, i) => `campaign_character_p${i}`);
  const c = market(people.map((id, i) => person(id, `Person${i}`, 30 + i)));
  apply(c, person("campaign_character_remote", "Remote", 40, "heartstone_lr"));
  for (const a of people) for (const b of people) if (a !== b) apply(c, { kind: "adjust_relationship", from_character_id: a, to_character_id: b, dimension: "respect", direction: "raise" });
  apply(c, { kind: "adjust_relationship", from_character_id: "campaign_character_remote", to_character_id: BRENNA, dimension: "hostility", direction: "raise" });
  const first = buildTurnContext(world, c.exportSnapshot()).social.relationships, again = buildTurnContext(world, c.exportSnapshot()).social.relationships;
  assert.equal(first.length, SOCIAL_LIMITS.edges); assert.deepEqual(first, again);
  assert.ok(!first.some(r => r.from === "Remote" || r.to === "Remote"));
});
