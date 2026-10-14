import test from "node:test";
import assert from "node:assert/strict";
import { identityLoadWarnings } from "../../src/campaign/identity-load-diagnostics.js";
import type { CampaignSnapshot } from "../../src/campaign/types.js";

/**
 * Block B4 (P4): warn-level identity diagnostics at load. Read-only: the function only reports (ID-4/N5 duplicate narrated refs and unnamed twins, F7 a
 * counteroffer that changed its subject, AUTH-8 an accepted person offer without its transaction). Hand-made snapshot fragments; the loader wiring is
 * covered by the session load report test below and tests/persistence/legacy-save-fixtures.test.ts (clean saves report nothing).
 */
const MARKET = "calderan_slave_market";
const person = (id: string, ref: string, label: string, name?: string, location = MARKET) => ({ id, origin: { kind: "created" }, profile: name ? { name } : {}, current: { current_location: location, status: "active" },
  origin_snapshot: { source: "narrator_ephemeral", trigger: "purchase", promoted_revision: 3, promoted_world_minute: 0, location_id: location, label, ephemeral_ref: ref, established: {}, evidence: [] } });
const offer = (id: string, subject: string, extra: Record<string, unknown>) => ({ id, direction: "buy", price_gold: 5, counterparty: { kind: "character", character_id: "korvin" },
  subject: { kind: "person", subject_character_id: subject, plan: [] }, location_id: MARKET, created_minute: 0, ...extra });
const snapshot = (parts: Partial<Record<keyof CampaignSnapshot, unknown>>) => ({ campaign_id: "c", revision: 9, characters: [], player_characters: [], transactions: [], trade_offers: [], legal_statuses: [], ...parts }) as unknown as CampaignSnapshot;

test("a clean snapshot reports nothing", () => assert.deepEqual(identityLoadWarnings(snapshot({ characters: [person("campaign_character_a", "narrated:mira", "Mira", "Mira"), person("campaign_character_b", "narrated:the_woman", "the woman")] })), []));

test("duplicate narrated refs are keyed by ref plus materialization location", () => {
  const w = identityLoadWarnings(snapshot({ characters: [person("campaign_character_a", "narrated:mira", "Mira", "Mira"), person("campaign_character_b", "narrated:mira", "Mira", "Mira"),
    person("campaign_character_c", "narrated:mira", "Mira", "Mira", "calderan_west_market")] }));
  assert.deepEqual(w.map(x => [x.kind, x.ids]), [["duplicate_narrated_ref", ["campaign_character_a", "campaign_character_b"]]]);
});

test("unnamed twins: same label and place, both unnamed; a named record is not a twin", () => {
  const w = identityLoadWarnings(snapshot({ characters: [person("campaign_character_a", "narrated:woman_1", "the woman"), person("campaign_character_b", "narrated:woman_2", "The woman"),
    person("campaign_character_c", "narrated:woman_3", "the woman", "Brenna")] }));
  assert.deepEqual(w.map(x => [x.kind, x.ids]), [["unnamed_twin", ["campaign_character_a", "campaign_character_b"]]]);
});

test("a counteroffer that changes the planned subject is reported; one that keeps it is not", () => {
  const offers = [offer("campaign_trade_offer_1", "campaign_character_r3_woman", { status: "superseded", created_revision: 3, resolved_revision: 4 }),
    offer("campaign_trade_offer_2", "campaign_character_r4_girl", { status: "superseded", created_revision: 4, resolved_revision: 5 }),
    offer("campaign_trade_offer_3", "campaign_character_r4_girl", { status: "active", created_revision: 5 })];
  const w = identityLoadWarnings(snapshot({ trade_offers: offers }));
  assert.deepEqual(w.map(x => [x.kind, x.ids]), [["counteroffer_subject_changed", ["campaign_trade_offer_1", "campaign_trade_offer_2"]]]);
});

test("an accepted person offer must name a recorded transaction", () => {
  const offers = [offer("campaign_trade_offer_1", "campaign_character_a", { status: "accepted", created_revision: 3, resolved_revision: 4, settlement: { gold: 5, revision: 4, world_minute: 0, transaction_id: "campaign_transaction_a" } }),
    offer("campaign_trade_offer_2", "campaign_character_b", { status: "accepted", created_revision: 5, resolved_revision: 6, settlement: { gold: 5, revision: 6, world_minute: 0, transaction_id: "campaign_transaction_b" } }),
    offer("campaign_trade_offer_3", "campaign_character_c", { status: "accepted", created_revision: 7, resolved_revision: 8, settlement: { gold: 5, revision: 8, world_minute: 0 } })];
  const w = identityLoadWarnings(snapshot({ trade_offers: offers, transactions: [{ id: "campaign_transaction_a" }] }));
  assert.deepEqual(w.map(x => [x.kind, x.ids]), [["accepted_offer_transaction_missing", ["campaign_trade_offer_2", "campaign_transaction_b"]], ["accepted_offer_transaction_missing", ["campaign_trade_offer_3"]]]);
});

test("the diagnostics never change the snapshot they read", () => {
  const s = snapshot({ characters: [person("campaign_character_a", "narrated:mira", "Mira", "Mira"), person("campaign_character_b", "narrated:mira", "Mira", "Mira")] }), before = JSON.stringify(s);
  identityLoadWarnings(s); assert.equal(JSON.stringify(s), before);
});
