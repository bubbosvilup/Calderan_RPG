import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Hardening H1: correct-narration-survives-audit corpus. Every narration here is VALID for its turn (it asserts only what the turn
 * authorizes, or nothing durable at all). Each must be delivered as the draft — no reconciliation call, no redaction, no audit issue.
 * This measures OVER-redaction, the inverse of the existing "bad narration is caught" suites. Offline; no LLM is called.
 */
const world = await loadWorld("data");
const SQUARE = OPENING_LOCATION, LR = "heartstone_lr", INN = "gatherers_inn", MARKET = "calderan_slave_market";
let serial = 0;
const person = (id: string, name: string, location: string, sex = "female"): CampaignCommand =>
  ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, sex }, current: { current_location: location, status: "active" } } });
function real(location: string, extra: readonly CampaignCommand[] = []): { world: typeof world; campaign: CampaignState } {
  const c = createOpeningCampaign(world, `h1_survives_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [...(location === SQUARE ? [] : [{ kind: "runtime_delta" as const, delta: { player_location: location } }]), ...extra] });
  return { world, campaign: c };
}
async function run(setup: { world: typeof world; campaign: CampaignState }, steps: readonly { input: string; narration: string; proposals?: readonly CampaignCommand[]; evidence?: readonly string[] }[]): Promise<TurnResult> {
  let result: TurnResult | undefined, calls = 0, s = steps[0]!;
  // One coordinator for the whole scenario: recent conversation (e.g. a seller's offer) carries across steps, as in play.
  const service = new RetrievalService(setup.world);
  const co = new TurnCoordinator(setup.world, { async generate() { throw new Error("unused"); }, async *stream() { calls++; yield { type: "text_delta", text: s.narration }; yield { type: "completed", result: { text: s.narration, ...metadata } }; } },
    { async propose() { return { commands: [...(s.proposals ?? [])], ...(s.evidence ? { evidence: [...s.evidence] } : {}), ...metadata }; } }, { service, search: new HybridSearch(service) });
  for (const step of steps) {
    s = step; calls = 0;
    const last = (await collect(co.runTurn({ campaign: setup.campaign, player_input: s.input }))).at(-1)!;
    assert.equal(last.type, "turn_completed", `${s.input}: ${JSON.stringify(last).slice(0, 300)}`);
    result = (last as { result: TurnResult }).result;
    assert.equal(calls, 1, `${s.input}: no reconciliation call for valid narration; issues ${JSON.stringify(result.narration_reconciliation?.issues)}; auth ${JSON.stringify(result.authorization.map(a => [a.command.kind, a.authorized, a.reason]))}`);
  }
  return result!;
}
const DELL = "campaign_character_dell", M = "campaign_character_maren", BRENNA = "campaign_character_brenna";
const transfer: CampaignCommand = { kind: "transfer_item", item_id: "boots", owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } };

interface Case { readonly id: string; readonly setup: () => { world: typeof world; campaign: CampaignState }; readonly prelude?: readonly { input: string; narration: string; proposals?: readonly CampaignCommand[] }[];
  readonly input: string; readonly narration: string; readonly proposals?: readonly CampaignCommand[]; readonly evidence?: readonly string[]; readonly check?: (c: CampaignState, r: TurnResult) => void }
const CORPUS: readonly Case[] = [
  // ---- item handover
  { id: "handover_plain", setup: () => turnFixture(), input: "I give boots to Brenna.", narration: "Brenna accepts boots from Nicco.", proposals: [transfer],
    check: c => assert.equal(c.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "brenna") },
  { id: "handover_no_hesitation", setup: () => turnFixture(), input: "I give boots to Brenna.", narration: "Brenna takes the boots from Nicco, no hesitation.", proposals: [transfer],
    check: c => assert.equal(c.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "brenna") },
  { id: "handover_without_hesitation", setup: () => turnFixture(), input: "I give boots to Brenna.", narration: "Brenna takes the boots from Nicco without hesitation.", proposals: [transfer],
    check: c => assert.equal(c.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "brenna") },
  // ---- ordinary dialogue, questions, quoted speech, observation
  { id: "dialogue_question", setup: () => turnFixture(), input: "Hello, Brenna. How are you feeling?", narration: 'Brenna looks up from her chair. "Better than yesterday," she says. "Why do you ask?"' },
  { id: "quoted_speech_with_action_words", setup: () => turnFixture(), input: "Do you want these boots?", narration: '"Leave them by the door," Brenna says. "I\'ll take them when I can stand."' },
  { id: "descriptive_observation", setup: () => turnFixture(), input: "*looks around the room*", narration: "Grey light falls through the arched window across the narrow bed and the small table. Brenna watches the stairs, no hurry in her." },
  { id: "observation_no_warning_weather", setup: () => real(SQUARE), input: "*watches the square*", narration: "Rain comes with no warning, and the stallholders drag canvas over their goods while pigeons scatter from the fountain." },
  // ---- movement and carrying
  { id: "player_movement", setup: () => real(SQUARE), input: "*walks into Heartstone*", narration: "Nicco pushes through the heavy door into the living floor of the tower.",
    check: c => assert.equal(c.exportSnapshot().runtime.scene.player_location, LR) },
  { id: "character_follows", setup: () => real(SQUARE, [person(M, "Maren", SQUARE)]), input: "*walks into Heartstone*", narration: "Nicco walks inside. Maren follows him into Heartstone without a word.",
    proposals: [{ kind: "move_character", character_id: M, location_id: LR }], check: c => assert.equal(c.exportSnapshot().characters.find(x => x.id === M)!.current.current_location, LR) },
  { id: "carrying", setup: () => real(SQUARE, [person(M, "Maren", SQUARE), { kind: "set_legal_status", character_id: M, status: "enslaved", holder_id: "nicco" }]), input: "*picks Maren up and carries her into Heartstone*",
    narration: "Nicco lifts Maren and carries her through the heavy door, laying her on the sofa by the hearth.", check: c => assert.equal(c.exportSnapshot().characters.find(x => x.id === M)!.current.current_location, LR) },
  // ---- departure
  { id: "departure_no_word", setup: () => real(INN, [person(DELL, "Dell Harrow", INN, "male")]), input: "*Nicco sips his ale.*", narration: "No word to anyone, Dell drains his cup and walks out of the inn.",
    proposals: [{ kind: "leave_scene", character_id: DELL }], check: c => assert.equal(c.exportSnapshot().characters.find(x => x.id === DELL)!.current.current_location, undefined) },
  // ---- condition establishment (player-authored contact)
  { id: "condition_minor_injury", setup: () => real(INN, [person(DELL, "Dell Harrow", INN, "male")]), input: "*Nicco punches Dell Harrow directly in the face.*",
    narration: "Nicco's fist catches Dell Harrow across the jaw. Dell Harrow staggers, blood welling from a split lip.",
    proposals: [{ kind: "set_condition", character_id: DELL, conditions: ["minor_injury"] }], evidence: ["Dell Harrow staggers, blood welling from a split lip."],
    check: c => assert.deepEqual(c.exportSnapshot().characters.find(x => x.id === DELL)!.current.conditions, ["minor_injury"]) },
  // ---- naming
  { id: "naming", setup: () => real(MARKET), prelude: [{ input: "*approaches the slaver*", narration: "A lean slaver leans against a post by the back cages." }],
    input: "What's your name?", narration: '"Oswin," the slaver says, spitting into the dirt.', check: (_c, r) => assert.deepEqual(r.identity?.promoted.map(p => p.name), ["Oswin"]) },
  // ---- purchase
  { id: "purchase", setup: () => real(MARKET, [{ kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 29 } }, current: { current_location: MARKET, status: "active" } } }, { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }]),
    prelude: [{ input: "Name your price again, Korvin.", narration: 'Korvin studies the woman in the cage, then Nicco. "Five." He taps the ledger. "Papers included."' }],
    input: "Done. *pays him*", narration: "Korvin pockets the coins and hands over the key and the papers. Brenna watches the exchange with flat, wary eyes.",
    check: c => assert.equal(c.exportSnapshot().legal_statuses.find(l => l.character_id === BRENNA)?.holder_id, "nicco") },
  // ---- household declaration (player-authored rule)
  { id: "household_rule", setup: () => real(LR), input: "House rule: nobody goes down to the cellar alone.", narration: "Nicco's words settle over the quiet living floor. The hearth crackles." },
];

for (const c of CORPUS) {
  test(`survives audit: ${c.id}`, async () => {
    const setup = c.setup();
    const r = await run(setup, [...(c.prelude ?? []), { input: c.input, narration: c.narration, ...(c.proposals ? { proposals: c.proposals } : {}), ...(c.evidence ? { evidence: c.evidence } : {}) }]);
    assert.equal(r.narration_reconciliation?.delivered, "draft", JSON.stringify(r.narration_reconciliation?.issues));
    assert.deepEqual(r.narration_reconciliation?.issues, []);
    assert.equal(r.narration, c.narration, "delivered verbatim");
    for (const a of r.authorization) assert.equal(a.authorized, true, `${a.command.kind}: ${a.reason}`);
    c.check?.(setup.campaign, r);
  });
}
test("corpus size and coverage: every supported mechanic and every protected phrase is represented", () => {
  const text = CORPUS.map(c => c.narration).join(" ");
  for (const phrase of ["no hesitation", "without hesitation", "no warning", "No word", "?", '"']) assert.ok(text.includes(phrase), phrase);
  assert.ok(CORPUS.length >= 15);
});

/**
 * Over-redaction measured by this corpus in H1 and since FIXED (formerly todo tests): each regression names the narration that used to
 * be wrongly reconciled and why; the negative cases around it prove the fixes did not make the audit permissive.
 */
async function deliveredAs(setup: { world: typeof world; campaign: CampaignState }, input: string, narration: string, proposals: readonly CampaignCommand[] = []) {
  const service = new RetrievalService(setup.world);
  const co = new TurnCoordinator(setup.world, { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: narration }; yield { type: "completed", result: { text: narration, ...metadata } }; } },
    { async propose() { return { commands: [...proposals], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const last = (await collect(co.runTurn({ campaign: setup.campaign, player_input: input }))).at(-1)!;
  return last.type === "turn_completed" ? last.result.narration_reconciliation?.delivered : last.type;
}
/** Full outcome: delivery, audit issues (kind + character/item) and the boots' owner afterwards. */
async function audited(setup: { world: typeof world; campaign: CampaignState }, input: string, narration: string, proposals: readonly CampaignCommand[] = []) {
  const service = new RetrievalService(setup.world);
  const co = new TurnCoordinator(setup.world, { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: narration }; yield { type: "completed", result: { text: narration, ...metadata } }; } },
    { async propose() { return { commands: [...proposals], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const last = (await collect(co.runTurn({ campaign: setup.campaign, player_input: input }))).at(-1)!;
  assert.equal(last.type, "turn_completed");
  const r = (last as { result: TurnResult }).result;
  return { delivered: r.narration_reconciliation?.delivered, issues: (r.narration_reconciliation?.issues ?? []).map(i => [i.kind, i.character ?? i.item_id]), boots: setup.campaign.exportSnapshot().items.find(i => i.id === "boots")?.owner_id };
}
// Cause: the audit re-checks every POSSIBLE handover (here Nicco's ring) with that candidate as the only offer, and a bare "them" counted
// as "the whole offer" even though its clause explicitly names the boots, so a phantom ring transfer was "asserted".
test("group pronoun in a valid one-item handover does not fabricate a second transfer (formerly KNOWN over-redaction)", async () => {
  const s = turnFixture();
  assert.equal(await deliveredAs(s, "I give boots to Brenna.", "Brenna takes the boots from Nicco and sets them by her chair.", [transfer]), "draft");
  assert.equal(s.campaign.exportSnapshot().items.find(i => i.id === "ring")!.owner_id, "nicco");
});
test("a genuinely ambiguous 'them' stays conservative: no named item, so the unoffered ring cannot be ruled out", async () => {
  const r = await audited(turnFixture(), "I give boots to Brenna.", "Brenna takes them from Nicco.", [transfer]);
  assert.notEqual(r.delivered, "draft"); assert.deepEqual(r.issues, [["asserts_uncommitted_transfer", "ring"]]);
});
// Cause: condition subjects were matched by full profile name only; "Dell …, glares at Nicco" named only Nicco, so Dell's state was
// attributed to Nicco. Now an established, unshared name token identifies its character (with Nicco also named, no single subject).
test("a condition on a person named by first name only is not attributed to Nicco (formerly KNOWN over-redaction)", async () => {
  assert.equal(await deliveredAs(real(INN, [person(DELL, "Dell Harrow", INN, "male")]), "*Nicco shoves Dell hard in the chest.*", "Dell staggers back into the bar, winded, and glares at Nicco.",
    [{ kind: "set_condition", character_id: DELL, conditions: ["winded"] }]), "draft");
});
test("first-name resolution is exact and conservative: unique names resolve to their owner, shared and unestablished names do not", async () => {
  // Unique and alone in the sentence: Dell is the subject, and an uncommitted condition is still caught — for Dell, not Nicco.
  const unique = await audited(real(INN, [person(DELL, "Dell Harrow", INN, "male")]), "*Nicco shoves Dell hard in the chest.*", "Dell staggers back into the bar, winded.");
  assert.notEqual(unique.delivered, "draft"); assert.deepEqual(unique.issues, [["uncommitted_condition", "Dell Harrow"]]);
  // Two present Dells: the shared first name resolves to neither.
  const shared = await audited(real(INN, [person(DELL, "Dell Harrow", INN, "male"), person("campaign_character_dell_marsh", "Dell Marsh", INN, "male")]), "*Nicco shoves Dell Harrow hard in the chest.*", "Dell staggers back into the bar, winded.");
  assert.ok(!shared.issues.some(([, who]) => who === "Dell Harrow" || who === "Dell Marsh"), JSON.stringify(shared.issues));
  // Recognising the attacker's first name never hides an unauthored outcome on Nicco: he is the nearest named person before the term.
  for (const attacker of ["Dell", "Dell Harrow"]) {
    const onNicco = await audited(real(INN, [person(DELL, "Dell Harrow", INN, "male")]), "*Nicco sips his ale.*", `With no hesitation, ${attacker} knocks Nicco unconscious.`);
    assert.notEqual(onNicco.delivered, "draft", attacker); assert.ok(onNicco.issues.some(([k, who]) => k === "uncommitted_condition" && who !== "Dell Harrow"), JSON.stringify(onNicco.issues));
  }
  // A name nobody established resolves to no character at all.
  const unknown = await audited(real(INN, [person(DELL, "Dell Harrow", INN, "male")]), "*Nicco shoves Dell hard in the chest.*", "Harlan staggers back into the bar, winded.");
  assert.ok(!unknown.issues.some(([, who]) => who === "Dell Harrow"), JSON.stringify(unknown.issues));
});
// Formerly a KNOWN over-redaction TODO; resolved by P8: a price question is an economic turn, so a concrete Gold ask is grounded.
test("a seller's concrete price for an unnamed narrated captive is not redacted as invented (P8 regression)", async () => {
  const s = real(MARKET);
  await deliveredAs(s, "*approaches the cages*", "A lean slaver leans against a post. Behind the bars a thin girl lies curled on the straw.");
  assert.equal(await deliveredAs(s, "How much for the girl?", 'The slaver shrugs. "Six hundred gold for the girl. No papers."'), "draft");
});
// Cause: the receipt grammar strips only a closed set of sentence lead-ins ("Without a word,", "Finally,"), so after "Without
// hesitation," the recipient did not lead the clause. The closed set now includes such phrases and plain manner adverbs (no hedges).
test("a fronted adverbial before the recipient still confirms the receipt (formerly KNOWN false negative)", async () => {
  for (const narration of ["Without hesitation, Brenna takes the boots from Nicco.", "Carefully, Brenna accepts the boots from Nicco."]) {
    const s = turnFixture();
    assert.equal(await deliveredAs(s, "I give boots to Brenna.", narration, [transfer]), "draft", narration);
    assert.equal(s.campaign.exportSnapshot().items.find(i => i.id === "boots")!.owner_id, "brenna", narration);
  }
});
test("fronted adverbials never authorize what the turn does not: no intent, a wrong recipient, or a hedge", async () => {
  const noIntent = await audited(turnFixture(), "*shows Brenna the boots*", "Without hesitation, Brenna takes the boots from Nicco.");
  assert.notEqual(noIntent.delivered, "draft"); assert.equal(noIntent.boots, "nicco");
  const wrong = await audited(turnFixture(), "I give boots to Brenna.", "Without hesitation, Maren takes the boots from Nicco.", [transfer]);
  assert.notEqual(wrong.delivered, "draft"); assert.equal(wrong.boots, "nicco");
  // "Perhaps" is not a stripped lead-in: the hedged sentence confirms nothing, so the transfer does not commit.
  assert.equal((await audited(turnFixture(), "I give boots to Brenna.", "Perhaps, Brenna takes the boots from Nicco.", [transfer])).boots, "nicco");
});
test("unrelated prose with 'takes' is not a transfer", async () => {
  const r = await audited(turnFixture(), "*shows Brenna the boots*", "Brenna takes a deep breath and looks out of the window.");
  assert.equal(r.delivered, "draft"); assert.equal(r.boots, "nicco");
});
