import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { narratorEphemeralCharacters } from "../src/campaign/promotion.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { resolvePersonTransactions } from "../src/turn/person-transactions.js";
import { establishNames } from "../src/turn/name-establishment.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { formatCampaignStatus } from "../src/dev/campaign-status.js";
import { NARRATOR_SYSTEM } from "../src/turn/prompt-builder.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Persistence Pass 1.2: narrator-created person → (proper name established) → campaign character → (joins household) → NPC+ (future),
 * plus the unnamed-acquisition exception and anonymous seller provenance. Narration is fixture prose written for these tests.
 */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market";
let serial = 0;
const created = (c: CampaignState) => c.exportSnapshot().characters.filter(x => x.origin.kind === "created");
const promoted = (c: CampaignState) => narratorEphemeralCharacters(c.exportSnapshot());
const gold = (c: CampaignState) => c.exportSnapshot().funds.find(f => f.character_id === "nicco")!.gold;
const members = (c: CampaignState) => c.exportSnapshot().households.find(h => h.id === OPENING_HOUSEHOLD)!.members.filter(m => m.status === "member" && m.role !== "owner").map(m => m.character_id);
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-01T12:00:00.000Z"), world), world).snapshot);
function campaign(location = OPENING_LOCATION, extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `persistence_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [...(location === OPENING_LOCATION ? [] : [{ kind: "runtime_delta" as const, delta: { player_location: location } }]), ...extra] });
  return c;
}
function coordinator(texts: string[], seen: GenerationRequest[] = []) {
  const service = new RetrievalService(world);
  return new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = texts.shift()!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
}
async function run(co: TurnCoordinator, c: CampaignState, input: string): Promise<TurnResult> {
  const events = await collect(co.runTurn({ campaign: c, player_input: input }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_completed", JSON.stringify(last));
  return (last as { result: TurnResult }).result;
}
const at = (narration: string, player = "*looks around*", location = MARKET): RecentExchange => ({ player, narration, status: "finalized", location_id: location });
const names = (c: CampaignState, recent: readonly RecentExchange[]) => establishNames(recent, buildTurnContext(world, c.exportSnapshot()), world, c.exportSnapshot(), [], c.revision);

// ------------------------------------------------------------------------------------------------ chestnut boy (§21, §22)
const CHESTNUTS = [
  ["*walks across the square*", "A boy sells roasted chestnuts from a brazier at the edge of the square. His hand has a small burn across the knuckles."],
  ["*talks to the boy* Busy day?", '"Busy enough," the boy says, turning the chestnuts with his good hand. He does not offer a name.'],
  ["*discreetly heals the burn on the boy's hand*", "The burn on the boy's hand closes and fades. A passer-by stops, staring, then hurries on."],
] as const;
test("chestnut boy (negative): talking, a wound, secret healing and a witness create no campaign character, snapshot or relationship", async () => {
  const c = campaign(), before = c.exportSnapshot();
  const texts = [...CHESTNUTS.map(([, n]) => n), 'The boy calls a thank-you after Nicco as he moves on. "Thank you, sir!"'];
  const co = coordinator(texts);
  for (const input of [...CHESTNUTS.map(([i]) => i), "*nods and leaves*"]) {
    const r = await run(co, c, input);
    assert.deepEqual([r.identity?.promoted, r.identity?.named], [[], []], input);
  }
  const after = c.exportSnapshot();
  assert.deepEqual([created(c), promoted(c)], [[], []]);
  assert.deepEqual([after.relationships, after.households, after.legal_statuses, after.transactions], [before.relationships, before.households, before.legal_statuses, before.transactions]);
  assert.ok(!after.characters.some(x => x.origin_snapshot)); // no persistent condition or origin record for the boy or the witness
});
test("chestnut boy (contrast): learning his name makes exactly one campaign character with only established facts", async () => {
  const c = campaign(), seen: GenerationRequest[] = [];
  const texts = [...CHESTNUTS.map(([, n]) => n), '"Tomas," the boy says, wiping his hands on his apron.', "Tomas grins and holds out a paper cone of chestnuts."];
  const co = coordinator(texts, seen);
  for (const [input] of CHESTNUTS) await run(co, c, input);
  const named = await run(co, c, "What's your name?");
  assert.deepEqual(named.identity?.promoted.map(p => [p.name, p.participant_id]), [["Tomas", "scene_npc_1"]]); // the boy the player addressed (P1)
  const [tomas] = promoted(c); assert.ok(tomas);
  assert.equal(created(c).length, 1); // the passer-by stays ephemeral
  const o = tomas.origin_snapshot!;
  assert.deepEqual([tomas.profile.name, tomas.profile.sex, tomas.profile.age, tomas.profile.species, o.trigger, o.established.descriptor], ["Tomas", "male", undefined, undefined, "name_established", "boy"]);
  assert.ok(!o.established.background && !o.established.role); // nothing invented: no history, no role
  assert.deepEqual(Object.keys(tomas).sort(), ["current", "id", "origin", "origin_snapshot", "profile"]); // no NPC+ state
  assert.deepEqual([members(c), c.exportSnapshot().relationships.filter(e => e.from_character_id === tomas.id || e.to_character_id === tomas.id)], [[], []]);
  await run(co, c, "Thanks, Tomas.");
  const prompt = seen.at(-1)!.messages[0]!.content;
  assert.equal(prompt.match(/Character Tomas \(/g)?.length, 1); assert.doesNotMatch(prompt, /P1 Boy/);
});

// ------------------------------------------------------------------------------------------------ name conservatism (§3, §4, §25)
test("name establishment is conservative: absent people, rumors, places, titles, capitals, canon names and collisions", () => {
  const c = campaign(MARKET);
  const only = (narration: string, player = "*listens*") => names(c, [at(narration, player)]);
  // Named only in talk (absent) or in a rumor: not a person in this scene.
  assert.deepEqual(only('"Apothecary? Two streets east. An old woman named Maren runs it," Korvin says.').promoted, []);
  assert.deepEqual(only('Korvin shrugs. "Word is a smuggler named Dace runs the docks now."').promoted, []);
  // Places, titles, occupations, capitalized narration words, uncertain guesses: never names.
  assert.deepEqual(only("Behind the Stalls, Something moves. The Guard captain nods. Heartstone looms over the square.").promoted, []);
  assert.deepEqual(only('A porter squints at Nicco. "Maybe it\'s Garrick? I don\'t know him."').promoted, []);
  // A canon character's name is never duplicated by a narrator-created person.
  assert.deepEqual(only('A stout man grins. "Name\'s Korvin."').promoted, []);
  // Self-introduction and narration-voice introduction promote; the name alone is enough.
  assert.deepEqual(only('A tired porter sets down his crate. "My name is Hollis."').promoted.map(p => p.name), ["Hollis"]);
  assert.deepEqual(only("A thin woman named Lysa sweeps the steps.").promoted.map(p => p.name), ["Lysa"]);
  // Two different people given the same name in one exchange: unresolved, nobody promoted.
  assert.deepEqual(only('"I\'m Hollis," the porter says. "I\'m Hollis too!" the boy shouts.').promoted, []);
  // A different "Maren" while another Maren exists elsewhere: a distinct character (names are not identity).
  const other = campaign(MARKET, [{ kind: "register_character", character: { id: "campaign_character_maren", origin: { kind: "created" }, profile: { name: "Maren" }, current: { current_location: "heartstone_lr", status: "active" } } }]);
  const r = names(other, [at('A girl looks up from her mending. "My name is Maren."')]);
  other.apply({ expected_revision: other.revision, commands: r.commands as CampaignCommand[] });
  assert.equal(other.exportSnapshot().characters.filter(x => x.profile.name === "Maren").length, 2);
});

// ------------------------------------------------------------------------------------------------ historical Maren (§19)
const WHITTLER = [
  at("The whittler waves Nicco toward the back of his lot. Behind the bars a thin girl lies curled on the straw, burning with fever. Brenna stops three paces back."),
  at('The whittler scratches his neck. "Three gold. No papers, no listing. She\'s a write-off."', "How much for the girl?"),
];
function homeWithBrenna(): CampaignState {
  const B = "campaign_character_brenna";
  return campaign(MARKET, [
    { kind: "register_character", character: { id: B, origin: { kind: "created" }, profile: { name: "Brenna", sex: "female" }, current: { current_location: MARKET, status: "active" } } },
    { kind: "set_legal_status", character_id: B, status: "enslaved", holder_id: "nicco", documentation: "documented" },
    { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: B }, { kind: "set_funds", character_id: "nicco", gold: 454 }]);
}
test("historical Maren: an unnamed girl bought from an ANONYMOUS whittler — one character, no seller character, seller provenance kept", () => {
  const c = homeWithBrenna(), charactersBefore = c.exportSnapshot().characters.length;
  const r = resolvePersonTransactions("*pays him and takes the key to free her*", buildTurnContext(world, c.exportSnapshot()), c.exportSnapshot(), WHITTLER, c.revision, { world });
  assert.deepEqual(r.commands.map(x => x.kind), ["register_character", "transfer_person"]); // no seller registration, no pre-sale holder
  assert.deepEqual([r.diagnostics[0]!.detail.seller, r.diagnostics[0]!.detail.seller_kind], ["the whittler", "anonymous"]);
  c.apply({ expected_revision: c.revision, commands: r.commands as CampaignCommand[] });
  const s = c.exportSnapshot();
  assert.equal(s.characters.length, charactersBefore + 1);
  const [girl] = promoted(c); assert.ok(girl);
  assert.deepEqual([girl.profile.name, girl.origin_snapshot!.label, girl.origin_snapshot!.trigger], [undefined, "the girl", "purchase_unnamed_subject"]);
  assert.ok(!s.characters.some(x => /whittler/i.test(`${x.profile.name ?? ""} ${x.origin_snapshot?.label ?? ""}`)));
  const legal = s.legal_statuses.find(l => l.character_id === girl.id)!;
  assert.deepEqual([legal.status, legal.holder_id, legal.transfer!.documentation, legal.transfer!.from_holder_id], ["enslaved", "nicco", "undocumented", undefined]);
  const [tx] = s.transactions;
  assert.deepEqual([tx!.from_holder_id, tx!.from_counterparty!.label, tx!.from_counterparty!.location_id, tx!.to_holder_id, tx!.gold, tx!.payee_id, tx!.documentation], [undefined, "the whittler", MARKET, "nicco", 3, undefined, "undocumented"]);
  assert.match(tx!.from_counterparty!.authority_evidence.join(" "), /Three gold/);
  assert.deepEqual([gold(c), members(c), s.relationships, r.commands.some(x => x.kind === "manumit")], [451, ["campaign_character_brenna"], [], false]);
  // Save/load keeps the provenance and the girl; the debug ledger shows the anonymous seller, never as a character.
  const restored = roundTrip(c).exportSnapshot();
  assert.deepEqual([restored.transactions, restored.characters.find(x => x.id === girl.id)], [s.transactions, s.characters.find(x => x.id === girl.id)]);
  const debug = formatCampaignStatus(restored, world, "debug");
  assert.match(debug, /sale the girl the whittler \(anonymous seller at calderan_slave_market; authority: "[^"]*Three gold/);
  assert.match(debug, /Origin: narrator_ephemeral \(purchase_unnamed_subject\)/);
  assert.doesNotMatch(debug, /Promoted characters:[\s\S]*whittler \(campaign_character/);
});

test("late naming: the purchased unnamed girl says her name — the SAME character gets it; nothing else changes", async () => {
  const c = homeWithBrenna(), seen: GenerationRequest[] = [];
  const co = coordinator([WHITTLER[0]!.narration, WHITTLER[1]!.narration, "The whittler pockets the coins and unlocks the cage.", 'The girl lifts her head from the straw. "My name is Maren."', "Maren closes her eyes."], seen);
  await run(co, c, "*looks around*"); await run(co, c, "How much for the girl?");
  await run(co, c, "*pays him and takes the key to free her*");
  const [girl] = promoted(c); assert.ok(girl);
  const snapshotBefore = c.exportSnapshot();
  const legalBefore = snapshotBefore.legal_statuses.find(l => l.character_id === girl.id), originBefore = girl.origin_snapshot;
  const r = await run(co, c, "What's your name?");
  assert.deepEqual(r.identity?.named.map(n => [n.character_id, n.name]), [[girl.id, "Maren"]]);
  assert.deepEqual(r.identity?.promoted, []);
  const after = c.exportSnapshot(), maren = after.characters.find(x => x.id === girl.id)!;
  assert.deepEqual([maren.profile.name, maren.origin_snapshot, after.legal_statuses.find(l => l.character_id === girl.id)], ["Maren", originBefore, legalBefore]); // origin still says unnamed
  assert.equal(maren.origin_snapshot!.established.name, undefined);
  assert.deepEqual([promoted(c).length, members(c), after.relationships, after.transactions], [1, ["campaign_character_brenna"], snapshotBefore.relationships, snapshotBefore.transactions]);
  await run(co, c, "Rest, Maren.");
  const prompt = seen.at(-1)!.messages[0]!.content;
  assert.equal(prompt.match(/Character Maren \(/g)?.length, 1); assert.doesNotMatch(prompt, /Character the girl/);
  assert.deepEqual(roundTrip(c).exportSnapshot().characters.find(x => x.id === girl.id)!.profile.name, "Maren");
});

test("historical Maren, named first: her name promotes her before the sale; the anonymous whittler sells her; no duplicate", async () => {
  const c = homeWithBrenna();
  const co = coordinator(["The whittler waves Nicco toward the back of his lot. Behind the bars a thin girl named Maren lies curled on the straw, burning with fever.",
    'The whittler scratches his neck. "Three gold for Maren. No papers, no listing."', "The whittler pockets the coins and unlocks the cage."]);
  const first = await run(co, c, "*looks around*");
  assert.deepEqual(first.identity?.promoted.map(p => p.name), ["Maren"]);
  await run(co, c, "How much for her?");
  await run(co, c, "*pays him*");
  const all = promoted(c); assert.equal(all.length, 1);
  const s = c.exportSnapshot(), legal = s.legal_statuses.find(l => l.character_id === all[0]!.id)!;
  assert.deepEqual([all[0]!.profile.name, all[0]!.origin_snapshot!.trigger, legal.holder_id, legal.transfer!.documentation, s.transactions[0]!.from_counterparty?.label, gold(c), members(c)],
    ["Maren", "name_established", "nicco", "undocumented", "the whittler", 451, ["campaign_character_brenna"]]);
});

// ------------------------------------------------------------------------------------------------ sellers (§14, §15)
test("a named narrator-created seller becomes a campaign character by the ordinary name rule; the sale is from that character", () => {
  const c = campaign(MARKET);
  const scene = [at('A lean man leans on the cage. "Name\'s Oswin. Three gold for the girl." A girl lies chained behind the bars.', "How much?")];
  const r = resolvePersonTransactions("Done. *pays him*", buildTurnContext(world, c.exportSnapshot()), c.exportSnapshot(), scene, c.revision, { world });
  assert.deepEqual([r.commands.map(x => x.kind), r.diagnostics[0]!.detail.seller_kind], [["register_character", "register_character", "set_legal_status", "transfer_person"], "named"]);
  c.apply({ expected_revision: c.revision, commands: r.commands as CampaignCommand[] });
  const oswin = promoted(c).find(x => x.profile.name === "Oswin")!;
  assert.deepEqual([oswin.origin_snapshot!.trigger, oswin.profile.sex, c.exportSnapshot().transactions[0]!.from_holder_id, c.exportSnapshot().transactions[0]!.from_counterparty], ["name_established", "male", oswin.id, undefined]);
  assert.equal(c.exportSnapshot().legal_statuses.find(l => l.character_id === oswin.id), undefined); // the seller is not a captive
});
test("anonymous seller authority must come from their own offer; bystanders never sell; two offering sellers block", () => {
  const c = campaign(MARKET);
  const resolve = (scene: readonly RecentExchange[], input = "Done. *pays him*") => resolvePersonTransactions(input, buildTurnContext(world, c.exportSnapshot()), c.exportSnapshot(), scene, c.revision, { world });
  const bystander = resolve([at('A girl lies chained behind the bars. A porter glances over. "She came in yesterday."', "Who is she?")], "I'll take her for three gold. *pays*");
  assert.deepEqual([bystander.commands, bystander.diagnostics[0]!.detail.reason], [[], "seller_authority_unestablished"]);
  const two = resolve([at('A girl lies chained behind the bars. The whittler spits. "Three gold for her." The handler snorts. "She\'s mine. Four gold for her."', "How much?")]);
  assert.deepEqual([two.commands, two.diagnostics[0]!.detail.reason], [[], "seller_ambiguous"]);
  assert.equal(created(c).length, 0);
});

// ------------------------------------------------------------------------------------------------ domain rules (§16, §17)
test("anonymous sale domain: sale only, subject without legal record, no payee, atomic; snapshots need exactly one seller side", () => {
  const c = campaign(MARKET, [{ kind: "register_character", character: { id: "campaign_character_girl", origin: { kind: "created" }, profile: {}, current: { current_location: MARKET, status: "active" } } }]);
  const seller = { label: "the whittler", location_id: MARKET, authority_evidence: ["Three gold."] };
  const sale = (extra: Record<string, unknown> = {}): CampaignCommand => ({ kind: "transfer_person", transaction_id: "campaign_transaction_anon", transaction_kind: "sale", character_id: "campaign_character_girl", from_counterparty: seller, to_holder_id: "nicco", payment: { payer_id: "nicco", gold: 3 }, documentation: "undocumented", ...extra } as CampaignCommand);
  const tryApply = (cmd: CampaignCommand) => assert.throws(() => c.apply({ expected_revision: c.revision, commands: [cmd] }));
  tryApply(sale({ transaction_kind: "gift", payment: undefined }));
  tryApply(sale({ payment: { payer_id: "nicco", payee_id: "korvin", gold: 3 } }));
  tryApply(sale({ from_holder_id: "korvin" }));
  tryApply(sale({ payment: { payer_id: "nicco", gold: 9999 } }));
  assert.deepEqual([gold(c), c.exportSnapshot().legal_statuses, c.exportSnapshot().transactions], [500, [], []]);
  c.apply({ expected_revision: c.revision, commands: [sale()] });
  assert.deepEqual([gold(c), c.exportSnapshot().legal_statuses[0]!.holder_id], [497, "nicco"]);
  // Once a legal record exists, only the legal holder can transfer: an anonymous "resale" is rejected.
  tryApply(sale({ transaction_id: "campaign_transaction_anon_2" }));
  const broken = structuredClone(c.exportSnapshot()) as unknown as { transactions: { from_holder_id?: string }[] };
  broken.transactions[0]!.from_holder_id = "korvin";
  assert.throws(() => CampaignState.restore(world, broken as never));
});

test("historical-transcript regressions: word fragments are not names; mentions do not donate facts; unrelated deals touch no captive", () => {
  const c = campaign(MARKET);
  // "Soft. Like it's something to be proud of." — a quote opening with a capitalized word is not a name without an acting use.
  assert.deepEqual(names(c, [at('"You keep saying that word." She turns her head. "Soft. Like it\'s something to be proud of."\nSoft.\nShe turns her head on the pillow.')]).promoted, []);
  // A sentence that merely mentions Maren describes someone else: Brenna's grey eyes are not Maren's.
  const r = names(c, [at("Behind the bars a thin girl named Maren lies curled on the straw, burning with fever. Brenna's grey eyes find Maren and stay there.")]);
  const maren = (r.commands[0] as Extract<CampaignCommand, { kind: "register_character" }>).character;
  assert.deepEqual([maren.profile.name, maren.origin_snapshot!.established.appearance, maren.origin_snapshot!.established.condition], ["Maren", ["thin"], ["feverish"]]);
  // A deal about goods, or "I'll pay a visit", never reaches back to a captive narrated earlier in the scene: no purchase, no note.
  const scene = [at("A girl lies chained behind the bars of the whittler's pen."), at('The smith hefts the halberd. "Fifteen, and I throw in the oil."', "15g for the halberd?")];
  for (const input of ["U got a deal, merchant.", "I'll pay a visit to the back alleys then."]) {
    const t = resolvePersonTransactions(input, buildTurnContext(world, c.exportSnapshot()), c.exportSnapshot(), scene, c.revision, { world });
    assert.deepEqual([t.commands, t.notes], [[], []], input);
  }
});

// ------------------------------------------------------------------------------------------------ narrator guardrail (§26)
test("narrator guardrail: incidental people stay descriptive; names only when learned, introduced, identified or necessary", () => {
  assert.match(NARRATOR_SYSTEM, /refer to incidental background people descriptively/);
  assert.match(NARRATOR_SYSTEM, /a named person becomes a lasting character/);
});
