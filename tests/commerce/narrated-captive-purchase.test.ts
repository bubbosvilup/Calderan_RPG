import { narratorIdentityGate } from "../../src/turn/identity/narrator-identity.js";
import { learnCanonicalName } from "../../src/campaign/identity-knowledge.js";
import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../../src/campaign/opening-state.js";
import { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import { narratorEphemeralCharacters } from "../../src/campaign/materialization.js";
import { buildTurnContext } from "../../src/turn/context/context-builder.js";
import { asPlan, readOffer } from "../support/offer-fixtures.js";
import { activeTradeOffer } from "../../src/campaign/trade.js";
import { establishedFacts, readScene } from "../../src/turn/narration-facts/index.js";
import type { RecentExchange } from "../../src/turn/recent-conversation.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import type { GenerationRequest } from "../../src/llm/types.js";
import type { TurnResult } from "../../src/turn/turn-types.js";
import { formatCampaignStatus } from "../../src/dev/support/campaign-status.js";
import { createSaveFile, decodeSave, serializeSave } from "../../src/persistence/save-format.js";
import { collect, metadata } from "../support/turn-fixtures.js";

/**
 * Promotion Pass 1.1: a narrator-invented captive, with no pre-registered persistent character, is materialized and purchased in one
 * atomic proposal. Narration below is fixture prose written for these tests (live-shape, not the historical transcript).
 */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market";
let serial = 0;
function market(extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `promotion_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...extra] });
  return c;
}
const at = (narration: string, player = "*looks around*"): RecentExchange => ({ player, narration, status: "finalized", location_id: MARKET });
const INTRO = at('Korvin leads Nicco past the canvas partition to the last cage.\n"Brenna. Thirty-two. Came to me through a debt auction in Ashford, was a river hauler before the debt caught up," Korvin says.\nBrenna coughs behind the bars, feverish, and does not lift her head.', "*checks the cages*");
const OFFER = at('Korvin taps his ledger. "Five. She\'s a burden I paid four for." He holds the pen over the page. "Papers included. Clean transfer, debt-forfeiture chain, no liens. You walk her out that gate, she\'s yours."\nBrenna does not open her eyes.', "Name your price, Korvin.");
const resolve = (c: CampaignState, input: string, recent: readonly RecentExchange[]) =>
  asPlan(readOffer(world, c.exportSnapshot(), input, recent, c.revision));
/** Actual Offer V1: the seller's quote is recorded as an offer, then the PLAYER accepts it (the UI click); the settlement is the old materialization+sale in one revision. */
const settle = (c: CampaignState, r: { readonly offer: { readonly commands: readonly CampaignCommand[] } }) => {
  c.apply({ expected_revision: c.revision, commands: r.offer.commands as CampaignCommand[] });
  const offer = activeTradeOffer(c.exportSnapshot().trade_offers); assert.ok(offer, "an offer stands");
  c.commit(c.prepare({ expected_revision: c.revision, commands: [{ kind: "accept_trade_offer", offer_id: offer.id }] }));
};
const gold = (c: CampaignState) => c.exportSnapshot().funds.find(f => f.character_id === "nicco")!.gold;
const members = (c: CampaignState) => c.exportSnapshot().households.find(h => h.id === OPENING_HOUSEHOLD)!.members.filter(m => m.status === "member" && m.role !== "owner").map(m => m.character_id);
const materialized = (c: CampaignState) => narratorEphemeralCharacters(c.exportSnapshot());

// ------------------------------------------------------------------------------------------------ resolver and domain
test("Brenna live shape: a narrator-invented captive is materialized, legally set up under the seller and bought in ONE proposal", () => {
  const c = market();
  assert.deepEqual(materialized(c), []); assert.equal(c.exportSnapshot().characters.some(x => x.profile.name === "Brenna"), false);
  const r = resolve(c, "Done. *pays him*", [INTRO, OFFER]);
  assert.deepEqual(r.commands.map(x => x.kind), ["register_character", "set_legal_status", "transfer_person"]);
  assert.equal(r.diagnostics[0]!.status, "offered"); assert.equal(r.diagnostics[0]!.detail.promoted_on_acceptance, true);
  assert.deepEqual([materialized(c).length, gold(c)], [0, 500], "reading the offer materializes nobody and pays nothing");
  const before = c.revision;
  const plannedId = (r.commands.find(x => x.kind === "register_character") as Extract<CampaignCommand, { kind: "register_character" }>).character.id;
  settle(c, r);
  assert.equal(c.revision, before + 2); // the offer (one revision), then materialization + legal setup + payment + transfer + ledger in ONE settlement revision
  const [brenna] = materialized(c); assert.ok(brenna);
  const o = brenna.origin_snapshot!;
  assert.deepEqual([brenna.id, brenna.origin.kind, brenna.profile.name, o.source, o.trigger, o.promoted_revision, o.location_id], [plannedId, "created", "Brenna", "narrator_ephemeral", "name_established", before + 2, MARKET]); // named: the ordinary name rule
  assert.deepEqual([o.established.sex, o.established.age, brenna.current.current_location, brenna.current.status], ["female", { kind: "exact", years: 32 }, MARKET, "active"]);
  assert.ok(o.established.condition!.includes("feverish") && o.established.condition!.includes("coughing"));
  // Background Grounding V1: "Ashford" is not canon, so the seller's claim naming it is an unverified named place and is not frozen
  // into durable background (it remains only in raw evidence). Name, age and condition are unaffected.
  assert.equal(o.established.background, undefined); assert.ok(o.evidence.some(e => /debt auction in Ashford/.test(e)));
  const legal = c.exportSnapshot().legal_statuses.find(l => l.character_id === brenna.id)!;
  assert.deepEqual([legal.status, legal.holder_id, legal.transfer!.documentation, legal.transfer!.from_holder_id], ["enslaved", "nicco", "documented", "korvin"]);
  assert.match(legal.transfer!.note!, /debt-forfeiture chain/);
  assert.deepEqual([gold(c), members(c), c.exportSnapshot().transactions.length], [495, [], 1]);
  // Materialization and purchase are emotionally neutral: no relationship edge touches her.
  assert.equal(c.exportSnapshot().relationships.some(e => e.from_character_id === brenna.id || e.to_character_id === brenna.id), false);
  // Never freed by a purchase.
  assert.deepEqual(resolve(c, "I bought you to save you. You're safe now.", []).commands, []);
});

test("Maren live shape: a second narrated captive is materialized once, unpapered, with Brenna already home and nothing else changing", () => {
  const BRENNA = "campaign_character_brenna", SELLER = "campaign_character_fixture_seller";
  const c = market([
    { kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 32 } }, current: { current_location: MARKET, status: "active" } } },
    { kind: "register_character", character: { id: SELLER, origin: { kind: "created" }, profile: { name: "Oswin" }, current: { current_location: MARKET, status: "active" } } },
    { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "nicco", documentation: "documented" },
    { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: BRENNA }, { kind: "set_funds", character_id: "nicco", gold: 454 }]);
  const scene = [at("Oswin waves Nicco toward the back cages. Behind the bars a thin girl named Maren lies curled on the straw, lips cracked with fever. Brenna goes very still."),
    at('"Three gold," Oswin says. "No papers, no listing. She\'s a write-off." Maren does not lift her head.', "How much for her?")];
  const r = resolve(c, "*pays him and takes the key to free her*", scene);
  assert.deepEqual(r.commands.map(x => x.kind), ["register_character", "set_legal_status", "transfer_person"]);
  settle(c, r);
  const [maren] = materialized(c); assert.ok(maren);
  assert.deepEqual([maren.profile.name, maren.profile.sex, maren.profile.age, maren.origin_snapshot!.established.appearance], ["Maren", "female", undefined, ["thin"]]); // "girl" is no age
  const legal = c.exportSnapshot().legal_statuses.find(l => l.character_id === maren.id)!;
  assert.deepEqual([legal.status, legal.holder_id, legal.transfer!.documentation], ["enslaved", "nicco", "undocumented"]);
  assert.deepEqual([gold(c), members(c), c.exportSnapshot().transactions.length], [451, [BRENNA], 1]);
  assert.equal(c.exportSnapshot().relationships.some(e => e.from_character_id === maren.id || e.to_character_id === maren.id), false);
  assert.ok(!r.commands.some(x => x.kind === "manumit")); // "take the key to free her" is unchaining, not manumission
  // Retrying the same acceptance next turn: Maren is persistent and Nicco's now, so nothing is materialized or paid twice.
  assert.deepEqual(resolve(c, "*pays him and takes the key to free her*", scene).commands, []);
  assert.equal(materialized(c).length, 1);
});

test("failed purchases never materialize: funds, ambiguity, seller authority, stale revision, replay, missing price", () => {
  // A. insufficient funds
  const poor = market([{ kind: "set_funds", character_id: "nicco", gold: 2 }]);
  const a = resolve(poor, "Done. *pays him*", [INTRO, OFFER]);
  assert.equal(a.diagnostics[0]!.status, "offered", "an unaffordable quote is still an offer; funds are checked when the player accepts");
  assert.throws(() => settle(poor, a), /insufficient_funds/);
  assert.deepEqual([materialized(poor).length, gold(poor), poor.exportSnapshot().transactions.length], [0, 2, 0]);
  // B. ambiguous captive: two named captives in the latest narration, no reference that picks one.
  const c = market();
  const two = at('Korvin gestures at the cages. "This is Brenna, from a debt auction. That\'s Tamsin, from the pits." Brenna coughs behind the bars. Tamsin sits chained beside her. Korvin shrugs. "Five gold, either one."', "What do you have?");
  const b = resolve(c, "Done.", [two]);
  assert.deepEqual([b.commands, b.diagnostics[0]!.status], [[], "ambiguous"]);
  assert.equal(resolve(c, "Done, I'll take Tamsin.", [two]).diagnostics[0]!.status, "offered"); // a name disambiguates
  // Identity may not change between offer and acceptance.
  const priced = at('Korvin nods at the cage. "Five gold for Brenna." Tamsin sits chained beside her. Brenna coughs behind the bars.', "Price?");
  const changed = resolve(c, "Done, I'll take Tamsin.", [two, priced]);
  assert.deepEqual([changed.commands, changed.diagnostics[0]!.detail.reason], [[], "subject_changed"]);
  // C. seller authority not established: Korvin only describes her; the player names a price.
  const nearby = at('Korvin leans on his stool. "That\'s Brenna. She came in yesterday." Brenna coughs behind the bars.', "Who is she?");
  const cc = resolve(c, "I'll take her for five gold. *pays him*", [nearby]);
  assert.deepEqual([cc.commands, cc.diagnostics[0]!.detail.reason], [[], "seller_authority_unestablished"]);
  // F. no price: authority but no amount anywhere.
  const noPrice = at('Korvin shrugs. "That\'s Brenna. She\'s mine, bought her off a debt auction." Brenna coughs behind the bars.', "Who is she?");
  // Pass 1.2: with no price talk at all, "Done." is not a person trade (nothing happens, no note); a named-but-unpriced subject is
  // told no single price is established.
  assert.deepEqual(resolve(c, "Done.", [noPrice]).commands, []);
  const f = resolve(c, "Done, I'll take Brenna.", [noPrice]);
  assert.deepEqual([f.commands, f.diagnostics[0]!.status], [[], "blocked"]); // no stated price: no seller has made an offer for her
  assert.equal(materialized(c).length, 0);
  // D. stale revision: the resolved proposal fails as a whole after any other change; nobody is materialized.
  const d = resolve(c, "Done. *pays him*", [INTRO, OFFER]);
  const base = c.revision;
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 5 } }] });
  assert.throws(() => c.apply({ expected_revision: base, commands: d.offer.commands as CampaignCommand[] }), /stale/);
  assert.deepEqual([materialized(c).length, gold(c), c.exportSnapshot().legal_statuses.length], [0, 500, 0]);
  // Seller authority failing inside preparation (seller not the holder) also leaves nothing behind.
  const forged = resolve(c, "Done. *pays him*", [INTRO, OFFER]).commands.map(x => x.kind === "set_legal_status" ? { ...x, holder_id: "nicco" } : x);
  assert.throws(() => c.apply({ expected_revision: c.revision, commands: forged as CampaignCommand[] }));
  assert.deepEqual([materialized(c).length, gold(c)], [0, 500]);
  // E. replay: the same materialization+purchase applied twice commits once.
  const e = resolve(c, "Done. *pays him*", [INTRO, OFFER]);
  settle(c, e);
  // The same quote proposed again after settlement is stale (the person is already materialized): it can never be accepted.
  c.apply({ expected_revision: c.revision, commands: e.offer.commands as CampaignCommand[] });
  assert.equal(activeTradeOffer(c.exportSnapshot().trade_offers), undefined);
  assert.deepEqual([materialized(c).length, gold(c), c.exportSnapshot().transactions.length], [1, 495, 1]);
});

test("unnamed captive: materialized under the narration's description, never an invented name; not re-materialized afterwards", () => {
  const c = market();
  const scene = [at("Korvin nods toward the far cage, where a girl lies chained on the straw, burning with fever."),
    at('"Three gold for the girl," Korvin says. "No papers. She\'s mine to sell."', "How much for the girl?")];
  const r = resolve(c, "Done. *pays him*", scene);
  settle(c, r);
  const [girl] = materialized(c); assert.ok(girl);
  assert.deepEqual([girl.profile.name, girl.origin_snapshot!.label, girl.origin_snapshot!.established.name, girl.profile.age, girl.profile.sex], [undefined, "the girl", undefined, undefined, "female"]);
  assert.equal(buildTurnContext(world, c.exportSnapshot()).characters.find(x => x.id === girl.id)!.profile.name, "the girl"); // narrator-facing label only
  assert.deepEqual([gold(c), c.exportSnapshot().legal_statuses.find(l => l.character_id === girl.id)!.transfer!.documentation], [497, "undocumented"]);
  assert.deepEqual(resolve(c, "Done. *pays him*", scene).commands, []);
  assert.equal(materialized(c).length, 1);
});

test("duplicate names: a different narrated Brenna is a different person with a collision-safe ID; a present one is never re-materialized", () => {
  const OLD = "campaign_character_brenna";
  const c = market([{ kind: "register_character", character: { id: OLD, origin: { kind: "created" }, profile: { name: "Brenna" }, current: { current_location: "heartstone_lr", status: "active" } } }]);
  // A weak quote-opening name ("Brenna. Thirty-two.") that matches an existing campaign character is ignored (it may be a vocative
  // or that same person): nothing is materialized. A strong introduction of a different Brenna here is a different person.
  assert.deepEqual(resolve(c, "Done. *pays him*", [INTRO, OFFER]).commands, []);
  const strong = at('Korvin points at the last cage. "That\'s Brenna, came to me through a debt auction." Brenna coughs behind the bars, feverish.', "*checks the cages*");
  const r = resolve(c, "Done. *pays him*", [strong, OFFER]);
  settle(c, r);
  const [fresh] = materialized(c);
  assert.ok(fresh && fresh.id !== OLD && fresh.profile.name === "Brenna");
  assert.equal(c.exportSnapshot().characters.find(x => x.id === OLD)!.current.current_location, "heartstone_lr"); // not merged by name
  const present = market([{ kind: "register_character", character: { id: OLD, origin: { kind: "created" }, profile: { name: "Brenna" }, current: { current_location: MARKET, status: "active" } } }]);
  assert.deepEqual(readScene([INTRO, OFFER], buildTurnContext(world, present.exportSnapshot()), world).captives.map(x => x.label), []); // she IS the present Brenna
});

test("non-invention: only established facts survive materialization; names imply nothing; hedged ages establish nothing", () => {
  const c = market();
  const context = buildTurnContext(world, c.exportSnapshot());
  const lysa = readScene([at("In the far cage sits a young woman named Lysa, thin and bruised.")], context, world).captives;
  assert.deepEqual(lysa.map(x => x.label), ["Lysa"]); // not also "the woman"
  const facts = establishedFacts(lysa[0]!, "korvin", id => id).established;
  assert.deepEqual(facts, { name: "Lysa", sex: "female", age: { kind: "approximate", description: "young adult" }, descriptor: "woman", appearance: ["thin"], condition: ["bruised"] });
  // A bare name establishes no sex, age, species or history; "maybe eighteen" is not an age.
  const bare = readScene([at('Korvin points. "That\'s Ilsa." Ilsa sits in the cage.'), at("Ilsa, maybe eighteen, maybe less, stares at the bars.")], context, world).captives;
  const b = establishedFacts(bare[0]!, "korvin", id => id).established;
  assert.deepEqual([b.name, b.sex, b.age, b.species, b.background], ["Ilsa", undefined, undefined, undefined, undefined]);
  // Capitalized narration words are not people.
  assert.deepEqual(readScene([at("Behind the bars, Something stirs. Papers rustle in the cage.")], context, world).captives.filter(x => x.name).length, 0);
});

// ------------------------------------------------------------------------------------------------ end to end
test("end to end (AUTH-2): no pre-registered Brenna → named by narration stays provisional → bought → exactly one persistent Brenna", async () => {
  const c = market(), seen: GenerationRequest[] = [];
  c.apply({ expected_revision: c.revision, commands: [...learnCanonicalName(world, c.exportSnapshot(), "korvin")] });
  let texts: string[] = [];
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = texts.shift()!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const step = async (input: string, narration: readonly string[], co = coordinator) => {
    texts = [...narration];
    const events = await collect(co.runTurn({ campaign: c, player_input: input }));
    const last = events.at(-1)!; assert.equal(last.type, "turn_completed", JSON.stringify(last));
    return (last as { result: TurnResult }).result;
  };
  const prompt = () => seen.at(-1)!.messages[0]!.content;
  // The player addresses "the slave" (a temporary scene participant) before the narrator names her.
  const intro = await step("*approaches the slave in the last cage*", [INTRO.narration]);
  assert.match(prompt(), /P1 Slave/);
  // AUTH-2: the narration establishes her name, but that is NOT persistence authority: she stays the same temporary participant, now named.
  assert.deepEqual(intro.identity?.provisional.map(p => [p.name, p.participant_id]), [["Brenna", "scene_npc_1"]]);
  assert.deepEqual([materialized(c).length, gold(c), c.exportSnapshot().legal_statuses], [0, 500, []]);
  await step("Name your price for the slave, Korvin.", [OFFER.narration]); // "the slave" is the SAME provisional person: no new temporary participant
  assert.match(prompt(), /P1 - Brenna \(Slave\)/); assert.doesNotMatch(prompt(), /P2 /); assert.doesNotMatch(prompt(), /Character Brenna \(/);
  assert.equal(materialized(c).length, 0, "an offer is a proposal: nothing durable yet");
  const standing = activeTradeOffer(c.exportSnapshot().trade_offers); assert.ok(standing && standing.price_gold === 5 && standing.subject.kind === "person");
  assert.deepEqual([gold(c), c.exportSnapshot().legal_statuses], [500, []], "the quote is an offer: nothing is paid or set up yet");
  // Spoken or narrated payment is not acceptance: the narrator is told the offer is pending, and a draft that narrates the payment is reconciled.
  const talk = await step("Done. *pays him*", ["Korvin pockets the coins and hands over the key. Brenna does not look up.", "Korvin names the price once more and waits. Brenna does not look up."]);
  assert.match(prompt(), /TRADE OFFER PENDING \(authoritative\)/); assert.ok(talk.narration_reconciliation!.issues.some(i => i.kind === "asserts_uncommitted_purchase"));
  assert.deepEqual([gold(c), c.exportSnapshot().legal_statuses, c.exportSnapshot().transactions.length], [500, [], 0]);
  // The explicit accept action settles in one revision.
  c.commit(c.prepare({ expected_revision: c.revision, commands: [{ kind: "accept_trade_offer", offer_id: standing.id }] }));
  const [brenna] = materialized(c); assert.ok(brenna);
  assert.equal(brenna.origin_snapshot!.ephemeral_ref, "scene_npc_1");
  assert.deepEqual([gold(c), members(c), c.exportSnapshot().legal_statuses.find(l => l.character_id === brenna.id)!.holder_id], [495, [], "nicco"]);
  // Retry of the same words: no second materialization, no second payment.
  await step("Done. *pays him*", ["Korvin raises an eyebrow. The deal is already done.", "Korvin raises an eyebrow and says nothing."]);
  assert.deepEqual([materialized(c).length, gold(c), c.exportSnapshot().transactions.length], [1, 495, 1]);
  // Continuity without the transcript: a fresh session (empty history) still knows who she is, once.
  const fresh = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = texts.shift()!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  await step("*looks at Brenna*", ["Brenna coughs."], fresh);
  const p = prompt();
  assert.equal(p.match(/Character Brenna \(/g)?.length, 1);
  // Background Grounding V1: the seller's claim names "Ashford", which is not canon, so it never reaches a fresh session as established background.
  assert.ok(narratorIdentityGate(buildTurnContext(world, c.exportSnapshot()))!.identities.get("korvin")!.ref);
  assert.doesNotMatch(p, /debt auction in Ashford/);
  assert.match(p, /"sex":"female"/); assert.match(p, /"years":32/);
  assert.match(p, /Brenna: legally enslaved; legal holder Nicco; transfer papers documented/);
  assert.match(p, /Present, not members: [^\n]*Brenna/);
  assert.doesNotMatch(p, /\[SCENE PARTICIPANTS\][\s\S]*Brenna/);
  // Debug inspect distinguishes origin; the player view does not expose the origin snapshot.
  const debug = formatCampaignStatus(c.exportSnapshot(), world, "debug");
  assert.match(debug, /Promoted characters:\n  Brenna \(campaign_character_r\d+_brenna\)\n    Origin: narrator_ephemeral \(name_established\); promoted at revision \d+/);
  assert.match(debug, /Established at promotion: name Brenna; sex female; age 32/);
  assert.match(debug, /Legal: enslaved; holder=Nicco; documented\n    Household: not member/);
  assert.doesNotMatch(formatCampaignStatus(c.exportSnapshot(), world), /Promoted characters|narrator_ephemeral/);
  // Save/load: identity, origin, legal state and location survive without any transcript.
  const restored = CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-01T12:00:00.000Z"), world), world).snapshot);
  assert.deepEqual(restored.exportSnapshot().characters.find(x => x.id === brenna.id), c.exportSnapshot().characters.find(x => x.id === brenna.id));
  assert.deepEqual(restored.exportSnapshot().legal_statuses, c.exportSnapshot().legal_statuses);
  assert.equal(narratorEphemeralCharacters(restored.exportSnapshot()).length, 1);
});

test("end to end: an unaffordable offer stays pending and the narrator knows the purse falls short; nothing is persisted (AUTH-2), no legal state", async () => {
  const c = market([{ kind: "set_funds", character_id: "nicco", gold: 2 }]), seen: GenerationRequest[] = [];
  const texts = [INTRO.narration, OFFER.narration, "Korvin shakes his head and keeps the key on his belt."];
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = texts.shift()!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
  for (const input of ["*checks the cages*", "Name your price, Korvin.", "Done. *pays him*"]) assert.equal((await collect(coordinator.runTurn({ campaign: c, player_input: input }))).at(-1)!.type, "turn_completed");
  assert.match(seen.at(-1)!.messages[0]!.content, /TRADE OFFER PENDING[\s\S]*Nicco has only 2 gold, which does not cover the 5 gold price/);
  assert.deepEqual([materialized(c).map(x => x.origin_snapshot!.trigger), gold(c), c.exportSnapshot().legal_statuses, c.exportSnapshot().transactions], [[], 2, [], []]);
  const standing = activeTradeOffer(c.exportSnapshot().trade_offers)!;
  assert.throws(() => c.prepare({ expected_revision: c.revision, commands: [{ kind: "accept_trade_offer", offer_id: standing.id }] }), /insufficient_funds/);
  assert.equal(materialized(c).length, 0, "a failed Accept leaves the person non-persistent");
});
