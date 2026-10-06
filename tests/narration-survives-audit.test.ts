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
 * MEASURED pre-existing over-redaction, found by this corpus and deliberately NOT fixed in H1 (audit/grammar scope, not the language
 * gates). Recorded as todo tests so they stay visible in every run; each names the narration that is wrongly reconciled today.
 */
async function deliveredAs(setup: { world: typeof world; campaign: CampaignState }, input: string, narration: string, proposals: readonly CampaignCommand[] = []) {
  const service = new RetrievalService(setup.world);
  const co = new TurnCoordinator(setup.world, { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: narration }; yield { type: "completed", result: { text: narration, ...metadata } }; } },
    { async propose() { return { commands: [...proposals], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const last = (await collect(co.runTurn({ campaign: setup.campaign, player_input: input }))).at(-1)!;
  return last.type === "turn_completed" ? last.result.narration_reconciliation?.delivered : last.type;
}
test("KNOWN over-redaction: a group pronoun in a valid handover verifies a phantom transfer of another item", { todo: "audit 'possible transfers' treat 'them' as covering any one-item offer" }, async () => {
  assert.equal(await deliveredAs(turnFixture(), "I give boots to Brenna.", "Brenna takes the boots from Nicco and sets them by her chair.", [transfer]), "draft");
});
test("KNOWN over-redaction: a condition on a person named by first name only is attributed to Nicco", { todo: "audit condition subject matches full profile names only" }, async () => {
  assert.equal(await deliveredAs(real(INN, [person(DELL, "Dell Harrow", INN, "male")]), "*Nicco shoves Dell hard in the chest.*", "Dell staggers back into the bar, winded, and glares at Nicco.",
    [{ kind: "set_condition", character_id: DELL, conditions: ["winded"] }]), "draft");
});
// Formerly a KNOWN over-redaction TODO; resolved by P8: a price question is an economic turn, so a concrete Gold ask is grounded.
test("a seller's concrete price for an unnamed narrated captive is not redacted as invented (P8 regression)", async () => {
  const s = real(MARKET);
  await deliveredAs(s, "*approaches the cages*", "A lean slaver leans against a post. Behind the bars a thin girl lies curled on the straw.");
  assert.equal(await deliveredAs(s, "How much for the girl?", 'The slaver shrugs. "Six hundred gold for the girl. No papers."'), "draft");
});
test("KNOWN false negative: a fronted adverbial hides the receipt ('Without hesitation, Brenna takes the boots')", { todo: "receipt grammar requires the recipient to lead the clause; H1 does not widen grammar" }, async () => {
  assert.equal(await deliveredAs(turnFixture(), "I give boots to Brenna.", "Without hesitation, Brenna takes the boots from Nicco.", [transfer]), "draft");
});
