import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../../src/world/loader.js";
import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import type { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignCharacter, CampaignCommand } from "../../src/campaign/types.js";
import type { DeepReadonly } from "../../src/types/readonly.js";
import { activeTradeOffer } from "../../src/campaign/trade.js";
import { narratorEphemeralCharacters } from "../../src/campaign/materialization.js";
import type { RecentExchange } from "../../src/turn/recent-conversation.js";
import { readOffer } from "../support/offer-fixtures.js";
import { maskWithheld, reservedClaims } from "../../src/turn/identity/canonical-name-reservation.js";
import type { IdentityFact } from "../../src/turn/narration-facts/index.js";

/**
 * AUD-1 (post-cleanup audit) with the user's decision of 2026-10-14: canonical names and aliases are reserved identity handles (REPO-12), and the
 * person Actual Offer is the third lane that applies the rule. A narrated captive or named seller who claims another identity's exact canonical name
 * or alias keeps the offer, but is materialized WITHOUT that name (masked to the narration's description). The transaction is never blocked.
 * Real data/ world, scripted narration, no providers.
 */
const world = await loadWorld("data"), MARKET = "calderan_slave_market";
let serial = 0;
function market(): CampaignState {
  const c = createOpeningCampaign(world, `reserved_offer_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }] });
  return c;
}
const at = (narration: string, player = "*looks around*"): RecentExchange => ({ player, narration, status: "finalized", location_id: MARKET });
const captiveSays = (name: string): RecentExchange =>
  at(`Korvin leads Nicco to the last cage, where a woman sits chained behind the bars.\nThe woman lifts her head. "My name is ${name}," she says. "I can cook and keep accounts."`, "*checks the cages*");
const OFFER = at('Korvin taps his ledger. "Five for her. Papers included."\nThe woman does not look away.', "How much for the woman?");
const accept = (c: CampaignState, recent: readonly RecentExchange[]) => {
  const r = readOffer(world, c.exportSnapshot(), "How much for the woman?", recent, c.revision);
  const offered = r.diagnostics.find(d => d.status === "offered");
  assert.ok(offered, `an offer stands: ${JSON.stringify(r.diagnostics)}`);
  c.apply({ expected_revision: c.revision, commands: r.commands as CampaignCommand[] });
  const offer = activeTradeOffer(c.exportSnapshot().trade_offers); assert.ok(offer, "an offer stands");
  c.commit(c.prepare({ expected_revision: c.revision, commands: [{ kind: "accept_trade_offer", offer_id: offer.id }] }));
  const [person] = narratorEphemeralCharacters(c.exportSnapshot());
  assert.ok(person, "the bought person is materialized");
  return { person, diagnostics: r.diagnostics };
};
const carries = (c: DeepReadonly<CampaignCharacter>, handle: string) => [c.profile.name, c.origin_snapshot?.label, c.origin_snapshot?.established.name, ...(c.origin_snapshot?.evidence ?? []), c.id]
  .some(v => !!v && v.toLowerCase().includes(handle.toLowerCase()));

// Exact alias, the whole canonical name, and a whole name that keeps a canonical token (an exact canonical name: the Korvin test below).
for (const [handle, owner] of [["Elara", "mistress_elara"], ["Mistress Elara", "mistress_elara"], ["Doran Hale", "captain_doran_hale"], ["Captain Doran Hale", "captain_doran_hale"]] as const) {
  test(`a captive who claims the canonical alias "${handle}" is still bought, materialized unnamed, the handle masked everywhere`, () => {
    const c = market();
    const { person, diagnostics } = accept(c, [captiveSays(handle), OFFER]);
    assert.equal(person.profile.name, undefined, "the reserved name is not established");
    assert.equal(carries(person, handle), false, `no field of the record carries "${handle}": ${JSON.stringify(person)}`);
    assert.equal(person.origin_snapshot?.label, "the woman", "the narration's description is the label");
    assert.equal(c.exportSnapshot().legal_statuses.find(l => l.character_id === person.id)?.holder_id, "nicco", "the purchase settled");
    assert.equal(c.exportSnapshot().characters.some(x => x.id === owner && x.origin.kind !== "canonical"), false, "the canonical owner is not forked into a created record");
    assert.ok(diagnostics.some(d => d.status === "offered" && d.detail.name_withheld === "canonical_name_reserved"), JSON.stringify(diagnostics));
  });
}

test("a non-reserved self-introduced name is kept by the purchase (control)", () => {
  const c = market();
  const { person, diagnostics } = accept(c, [captiveSays("Brenna"), OFFER]);
  assert.equal(person.profile.name, "Brenna");
  assert.equal(diagnostics.some(d => d.detail.name_withheld !== undefined), false);
});

test("a named seller who claims a canonical alias stays a seller, recorded under the narration's description", () => {
  const c = market();
  const intro = at('A broad man in a leather apron stands by the pens. "Name\'s Doran Hale," he says. "I sell what Korvin cannot."\nA girl sits chained behind him.', "*approaches the pens*");
  const offer = at('The man in the apron jerks his chin at the girl. "Three gold for her. No papers."', "How much for the girl?");
  const r = readOffer(world, c.exportSnapshot(), "How much for the girl?", [intro, offer], c.revision);
  const offered = r.diagnostics.find(d => d.status === "offered");
  assert.ok(offered, `an offer stands: ${JSON.stringify(r.diagnostics)}`);
  const plan = r.commands.flatMap(x => x.kind === "propose_trade_offer" && x.subject.kind === "person" ? [...x.subject.plan] : []);
  const registered = plan.flatMap(x => x.kind === "register_character" ? [x.character] : []);
  assert.equal(registered.some(x => carries(x, "Doran")), false, JSON.stringify(registered));
  assert.equal(JSON.stringify(r.commands).includes("Doran Hale"), false, "the offer never names the seller with the reserved alias");
});

test("a self-introduction in the very exchange that states the price is withheld the same way", () => {
  const c = market();
  const both = at('Korvin leads Nicco to the last cage, where a woman sits chained behind the bars.\nThe woman lifts her head. "My name is Doran Hale," she says.\nKorvin taps his ledger. "Five for her. Papers included."', "How much for the woman?");
  const { person, diagnostics } = accept(c, [both]);
  assert.equal(person.profile.name, undefined);
  assert.equal(carries(person, "Doran"), false, JSON.stringify(person));
  assert.ok(diagnostics.some(d => d.detail.name_withheld === "canonical_name_reserved"));
});

test("a captive who claims the exact canonical name of the seller present: only the claim is masked, narration about the real Korvin keeps his name", () => {
  const c = market();
  const { person, diagnostics } = accept(c, [captiveSays("Korvin"), OFFER]);
  assert.equal(person.profile.name, undefined);
  assert.equal(person.origin_snapshot?.label, "the woman");
  assert.ok(diagnostics.some(d => d.detail.name_withheld === "canonical_name_reserved"));
  const evidence = person.origin_snapshot?.evidence ?? [];
  assert.ok(evidence.some(e => e.startsWith("Korvin leads Nicco")), JSON.stringify(evidence));
  assert.ok(evidence.some(e => e.includes('"My name is [name withheld],"')), JSON.stringify(evidence));
  assert.equal(person.origin_snapshot?.established.role, "enslaved; offered for sale by Korvin");
});

test("handle matching is case-insensitive and lowercase ids or scene refs are never masked", () => {
  const fact = (name: string, full_name?: string) => ({ kind: "self_introduction", form: "my_name_is", name, ...(full_name ? { full_name } : {}), standalone: false, source_text: `My name is ${full_name ?? name},`,
    subject: { surface: "she", entity_id: "other:woman" } }) as unknown as IdentityFact;
  const w = reservedClaims(world, [fact("Doran", "Doran HALE")], { name: "Doran", keys: ["other:Doran", "other:woman"] });
  assert.deepEqual([...w.names], ["Doran HALE", "Doran"]);
  assert.equal(maskWithheld("narrated:doran heard Doran say: My name is Doran HALE,", w), "narrated:doran heard [name withheld] say: My name is [name withheld],");
  assert.equal(reservedClaims(world, [fact("Brenna")], { name: "Brenna", keys: ["other:woman"] }).handles.length, 0);
});
