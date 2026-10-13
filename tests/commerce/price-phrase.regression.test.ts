import test from "node:test";
import assert from "node:assert/strict";
import { learnCanonicalName } from "../../src/campaign/identity-knowledge.js";
import { loadWorld } from "../../src/world/loader.js";
import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import type { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import { buildTurnContext } from "../../src/turn/context/context-builder.js";
import { asPlan, readOffer } from "../support/offer-fixtures.js";
import type { RecentExchange } from "../../src/turn/recent-conversation.js";
import { NUMBER_PHRASE_SOURCE, numberPhraseValue } from "../../src/turn/language/numbers.js";

/**
 * Regressions found by the Historical Campaign Replay certification (docs/evaluations/HISTORICAL_CAMPAIGN_REPLAY_CERTIFICATION.md).
 * Each test names the behaviour, not the iteration. Deterministic; no model calls.
 */
const world = await loadWorld("data");
const BRENNA = "campaign_character_brenna";
const person = (id: string, name: string, years: number): CampaignCommand =>
  ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years } }, current: { current_location: "calderan_slave_market", status: "active" } } });
let serial = 0;
function market(): CampaignState {
  const c = createOpeningCampaign(world, `replay_regressions_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } },
    ...learnCanonicalName(world, c.exportSnapshot(), "korvin"), person(BRENNA, "Brenna", 29), { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }] });
  return c;
}
const offer = (line: string): RecentExchange => ({ player: "Name your price again, Korvin.", narration: `Korvin studies the woman in the cage, then Nicco. "${line}" He taps the ledger.`, status: "finalized" });
const resolve = (c: CampaignState, input: string, recent: readonly RecentExchange[]) => asPlan(readOffer(world, c.exportSnapshot(), input, recent, c.revision));
const paid = (r: ReturnType<typeof resolve>) => { const cmd = r.commands.find(x => x.kind === "transfer_person"); return cmd && cmd.kind === "transfer_person" ? cmd.payment?.gold : undefined; };

test("number phrases keep their full value: hundreds, thousands, 'a hundred', digit groups, never the trailing word", () => {
  const table: readonly (readonly [string, number])[] = [["five", 5], ["thirty-two", 32], ["a hundred", 100], ["hundred", 100], ["four hundred", 400], ["four hundred and fifty", 450],
    ["six hundred forty", 640], ["six hundred and forty", 640], ["two thousand five hundred", 2500], ["a thousand", 1000], ["twelve hundred", 1200], ["1,200", 1200], ["640", 640]];
  for (const [text, value] of table) assert.equal(numberPhraseValue(text), value, text);
  for (const bad of ["five five", "twenty ten", "hundred hundred", "gold", "", "ten ten"]) assert.equal(numberPhraseValue(bad), undefined, `invalid: ${bad}`);
  const re = new RegExp(`\\b(${NUMBER_PHRASE_SOURCE})\\s+gold\\b`, "i");
  assert.equal(re.exec("Four hundred gold, and the papers.")?.[1], "Four hundred");
  assert.equal(re.exec("It costs four hundred and fifty gold.")?.[1], "four hundred and fifty");
});

test("a seller's multi-word gold price is the price Nicco pays, not its last word", () => {
  const c = market();
  for (const [line, expected] of [["Four hundred gold. Papers included.", 400], ["Four hundred. Papers included.", 400], ["Four hundred and fifty gold, papers included.", 450],
    ["A hundred gold, papers included.", 100], ["Five gold, papers included.", 5]] as const) {
    const r = resolve(c, "Alright. *pays up*", [offer(line)]);
    assert.equal(paid(r), expected, line);
  }
});

test("the player's stated amount never sets the price; an unaffordable seller price is still a pending offer (funds are checked when the player accepts)", () => {
  const c = market();
  assert.equal(paid(resolve(c, "I'll take her for four hundred gold.", [offer("Five hundred gold. Papers included.")])), 500, "only the seller's stated amount counts");
  const poor = resolve(c, "Done. *pays up*", [offer("Seven hundred gold. Papers included.")]);
  assert.equal(paid(poor), 700, "700 exceeds the 500 gold purse, but an offer is only a proposal");
  assert.equal(poor.commands.length, 1);
});

test("a household rule that restates an active charter rule in other words is rejected; a genuinely new rule is accepted", () => {
  const c = createOpeningCampaign(world, "replay_rule_restatement");
  const add = (text: string) => c.apply({ expected_revision: c.revision, commands: [{ kind: "add_household_rule", household_id: "campaign_household_heartstone", text }] });
  assert.throws(() => add("Indoor only barefoot. The household will always be barefoot inside."));
  assert.throws(() => add("Household is family, no lies, no secrets among family."));
  assert.throws(() => add("Protect the family, at all costs."));
  add("Nobody enters the cellar alone.");
  assert.equal(c.exportSnapshot().households[0]!.rules!.filter(r => r.active).length, 4);
});
