import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CampaignSnapshot } from "../src/campaign/types.js";
import type { DeepReadonly } from "../src/types/readonly.js";
import type { WorldStore } from "../src/world/world-store.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { resolvePlayerCarry, characterLocation } from "../src/turn/character-movement.js";
import { narratedDepartures } from "../src/turn/scene-departure.js";
import { resolvePersonTransactions } from "../src/turn/person-transactions.js";
import { refersTo, readScene } from "../src/turn/narrated-captives.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Hardening H5.1 — the two live-confirmed engine defects from H5 (docs/evaluations/CALDREVAN_HARDENING_H5_LIVE_EVAL.md):
 *  A. common natural movement / departure / carry phrasing was narrated as movement while runtime state did not move (0/119);
 *  B. a narrated captive was promoted and bought during a purchase while the scene already held the intended persistent captive.
 * Movement phrases are the exact H5 scenario inputs; the purchase narration is the exact recovered H5 soak-run text (truncated at
 * the recorder's 400-character excerpt bound; the one completion is marked).
 */

// ================================================================================================ A. movement — grammar
const HALL = "test_hall", ROOM = "test_room";
const destinationOf = (input: string, f = turnFixture()) => {
  const snapshot = f.campaign.exportSnapshot();
  const intent = playerIntent(input, buildTurnContext(f.world, snapshot, { input }), snapshot, f.world);
  const moves = intent.runtime.filter((c): c is Extract<CampaignCommand, { kind: "runtime_delta" }> => c.kind === "runtime_delta" && !!c.delta.player_location);
  return moves.map(c => c.delta.player_location);
};
const H5_PHRASES = {
  B: "I leave the room and go downstairs to the main hall.",
  Y: "I go down to the main hall alone.",
  C: "Come with me, Brenna. Let's go down to the main hall together.",
  D: "Maren has twisted her ankle. I lift her carefully and carry her down to the main hall.",
  O: "Gerome, you may go now. Leave the room.",
} as const;

test("H5 movement phrases: each has explicit, tested semantics (player movement, carry, follower, NPC departure)", () => {
  assert.deepEqual(destinationOf(H5_PHRASES.B), [HALL]);
  assert.deepEqual(destinationOf(H5_PHRASES.Y), [HALL]);
  // "Let's go down to X" commits Nicco's own movement; it never moves Brenna (no follower is forced).
  assert.deepEqual(destinationOf(H5_PHRASES.C), [HALL]);
  // Carrying is resolved by the carry rule (below), not by the walking grammar.
  assert.deepEqual(destinationOf(H5_PHRASES.D), []);
  // An instruction to an NPC is not player movement.
  assert.deepEqual(destinationOf(H5_PHRASES.O), []);
});

test("player movement grammar: bounded natural first-person forms move through the route resolver", () => {
  for (const input of ["I go to the main hall.", "I go downstairs to the main hall.", "I go down to the main hall.", "I head downstairs to the main hall.", "I head down to the main hall.",
    "I leave the room and go downstairs to the main hall.", "I leave here and go to the main hall.", "I walk down to the main hall.", "I make my way down to the main hall.", "Let's go to the main hall.",
    "I stand up, leave the room and head downstairs to the main hall.", "*goes downstairs to the main hall*"])
    assert.deepEqual(destinationOf(input), [HALL], input);
  // Route invariants: the runtime delta carries the route's minutes (1 minute between the two rooms).
  const f = turnFixture(), snapshot = f.campaign.exportSnapshot();
  const intent = playerIntent("I go down to the main hall.", buildTurnContext(f.world, snapshot), snapshot, f.world);
  assert.deepEqual(intent.runtime, [{ kind: "runtime_delta", delta: { player_location: HALL, time_advance_minutes: 1 } }]);
  // Return trip from the hall.
  const back = turnFixture(); back.campaign.apply({ expected_revision: back.campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: HALL } }] });
  assert.deepEqual(destinationOf("I go back up to the observation room. Who is here?", back), [ROOM]);
  assert.deepEqual(destinationOf("I head upstairs to the observation room.", back), [ROOM]);
});

test("player movement grammar: negated, modal, hypothetical, planned, delegated, vague or unreachable movement moves nobody", () => {
  for (const input of ["I do not go to the main hall.", "I don't go downstairs to the main hall.", "I might go to the main hall.", "I almost go down to the main hall.",
    "I plan to go to the main hall.", "If I go down to the main hall, will she follow?", "I think about leaving and going downstairs.", "I ask Brenna to go to the main hall.",
    "Brenna refuses to go to the main hall.", "I go downstairs.", "I leave.", "I wander off.", "I want to go down to the main hall.", "I could head down to the main hall later.",
    "Let's not go down to the main hall.", "Should I go down to the main hall?", "I go down to the cellar.", "\"I go down to the main hall,\" I tell her, but I stay."])
    assert.deepEqual(destinationOf(input), [], input);
  // An unreachable destination is blocked, never teleported: the narrator is told Nicco has not arrived.
  const f = turnFixture(), snapshot = f.campaign.exportSnapshot();
  const intent = playerIntent("I go down to the remote docks.", buildTurnContext(f.world, snapshot), snapshot, f.world);
  assert.deepEqual(intent.runtime, []);
  assert.match(intent.natural!.notes.join(" "), /has not arrived/);
});

test("carry: the carried persistent character (authored or created) moves with Nicco; helping, supporting or a pronoun without one referent moves nobody", () => {
  const carry = (input: string, f = turnFixture()) => {
    const snapshot = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, snapshot, { input });
    const spoken = playerIntent(input, context, snapshot, f.world);
    return [...spoken.runtime, ...resolvePlayerCarry(input, snapshot, context, f.world, spoken.runtime).runtime];
  };
  const both = [{ kind: "runtime_delta", delta: { player_location: HALL, time_advance_minutes: 1 } }, { kind: "move_character", character_id: "maren", location_id: HALL }];
  assert.deepEqual(carry(H5_PHRASES.D), both);
  assert.deepEqual(carry("I lift Maren and carry her down to the main hall."), both);
  assert.deepEqual(carry("I pick Maren up and carry her downstairs to the main hall."), both);
  // Walking + carrying in one input: one route, the carried person arrives where Nicco arrives.
  assert.deepEqual(carry("I go down to the main hall, carrying Maren in my arms."), both);
  // No carry from helping/supporting/escorting, and an unresolved pronoun (Brenna and Maren both present) carries nobody.
  assert.deepEqual(carry("I help Maren down to the main hall."), []);
  assert.deepEqual(carry("I support Maren as we go down to the main hall."), []);
  assert.deepEqual(carry("I lift her carefully and carry her down to the main hall."), []);
  assert.deepEqual(carry("I don't carry Maren down to the main hall."), []);
  assert.deepEqual(carry("I might carry Maren down to the main hall."), []);
});

test("follower: a request, household membership or ownership never moves an NPC; only Nicco's own movement is player-controlled", () => {
  const f = turnFixture(), snapshot = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, snapshot);
  const spoken = playerIntent(H5_PHRASES.C, context, snapshot, f.world);
  assert.deepEqual(spoken.runtime.map(c => c.kind), ["runtime_delta"]);
  assert.deepEqual(resolvePlayerCarry(H5_PHRASES.C, snapshot, context, f.world, spoken.runtime).runtime, []);
});

test("departure evidence: completed natural exits of a present created character count; looks, readiness, talk and hesitation never do", () => {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "register_character", character: { id: "campaign_character_tomas", origin: { kind: "created" }, profile: { name: "Tomas", sex: "male" }, current: { current_location: ROOM, status: "active" } } }] });
  const context = buildTurnContext(f.world, f.campaign.exportSnapshot());
  const leaves = (text: string) => narratedDepartures(text, context).map(d => d.character_id);
  for (const text of ["Tomas nods and leaves the room.", "Tomas nods once and walks out of the room.", "Tomas turns and leaves.", "Tomas heads downstairs.", "Tomas goes down the stairs without a word."])
    assert.deepEqual(leaves(text), ["campaign_character_tomas"], text);
  for (const text of ["Tomas looks toward the door.", "Tomas seems ready to leave.", "Tomas says he might leave.", "Tomas hesitates.", "Tomas starts toward the door.", "\"Leave the room,\" Nicco tells Tomas."])
    assert.deepEqual(leaves(text), [], text);
  // Authored (canonical) NPCs are never departure candidates for leave_scene: their whereabouts are canon-owned.
  assert.deepEqual(leaves("Gerome nods and leaves the room."), []);
});

// ================================================================================================ A. movement — full turns
function fixtureHarness(f = turnFixture()) {
  let texts: string[] = [], commands: CampaignCommand[] = [];
  const diagnostics: TurnDiagnostics[] = [];
  const service = new RetrievalService(f.world);
  const co = new TurnCoordinator(f.world, { async generate() { throw new Error("unused"); }, async *stream() { const text = texts.shift() ?? "The moment passes."; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [...commands], ...metadata }; } }, { service, search: new HybridSearch(service) }, { diagnostics_sink: d => { diagnostics.push(d as TurnDiagnostics); } });
  const step = async (input: string, narrations: string[], proposals: CampaignCommand[] = []): Promise<{ result: TurnResult; diagnostics: TurnDiagnostics }> => {
    texts = [...narrations]; commands = proposals;
    const events = await collect(co.runTurn({ campaign: f.campaign, player_input: input }));
    const last = events.at(-1)!; assert.equal(last.type, "turn_completed", `${input}: ${JSON.stringify(last)}`);
    return { result: (last as { result: TurnResult }).result, diagnostics: diagnostics.at(-1)! };
  };
  return { ...f, step };
}
const at = (s: DeepReadonly<CampaignSnapshot>, world: WorldStore, id: string) => characterLocation(s, world, id);

test("full turn B: valid explicit movement moves Nicco; narration and state agree with no audit issue", async () => {
  const h = fixtureHarness();
  const { result, diagnostics } = await h.step(H5_PHRASES.B, ["Nicco leaves the observation room and descends the narrow stairs to the main hall. The hall is empty and quiet."]);
  assert.equal(at(h.campaign.exportSnapshot(), h.world, "nicco"), HALL);
  assert.deepEqual(diagnostics.audit?.issue_kinds, []);
  assert.match(result.narration, /main hall/);
  for (const id of ["brenna", "gerome", "maren"]) assert.equal(at(h.campaign.exportSnapshot(), h.world, id), ROOM, `${id} stays behind`);
});

test("full turn: narrated movement of Nicco that did not happen in state is an audit issue (uncommitted_movement), never a state change", async () => {
  const h = fixtureHarness();
  const { result, diagnostics } = await h.step("I think about going down to the main hall.", ["Nicco descends the stairs to the main hall.", "The stairs down to the main hall stay empty. The observation room is quiet."]);
  assert.equal(at(h.campaign.exportSnapshot(), h.world, "nicco"), ROOM);
  assert.deepEqual(diagnostics.audit?.issue_kinds, ["uncommitted_movement"]);
  assert.equal(diagnostics.audit?.delivered, "revision");
  assert.doesNotMatch(result.narration, /descends/);
});

test("full turn C: Nicco moves; Brenna is not forced; narrating her following without authorization is flagged and reconciled", async () => {
  const h = fixtureHarness();
  const { result, diagnostics } = await h.step(H5_PHRASES.C, ["Nicco heads down to the main hall. Brenna follows him down the stairs into the main hall.", "Nicco heads down to the main hall alone. The hall is quiet."]);
  const s = h.campaign.exportSnapshot();
  assert.deepEqual([at(s, h.world, "nicco"), at(s, h.world, "brenna")], [HALL, ROOM]);
  // Two independent, correct findings: Brenna was not moved (uncommitted_movement) and is not present in the hall (absent_participant).
  assert.deepEqual([...diagnostics.audit!.issue_kinds].sort(), ["absent_participant", "uncommitted_movement"]);
  assert.equal(result.narration, "Nicco heads down to the main hall alone. The hall is quiet.");
});

test("full turn D: the carried person follows Nicco deterministically; nobody else moves", async () => {
  const h = fixtureHarness();
  const { diagnostics } = await h.step(H5_PHRASES.D, ["Nicco lifts Maren carefully and carries her down the stairs into the main hall."]);
  const s = h.campaign.exportSnapshot();
  assert.deepEqual(["nicco", "maren", "brenna", "gerome"].map(id => at(s, h.world, id)), [HALL, HALL, ROOM, ROOM]);
  assert.deepEqual(diagnostics.audit?.issue_kinds, []);
});

test("full turn O: P12.2 records a completed canonical departure; the order alone grants no movement", async () => {
  const h = fixtureHarness();
  const { result, diagnostics } = await h.step(H5_PHRASES.O, ["Gerome nods and walks out of the room.", "Gerome stands motionless and does not answer."], [{ kind: "leave_scene", character_id: "gerome" }]);
  assert.equal(at(h.campaign.exportSnapshot(), h.world, "gerome"), undefined);
  assert.deepEqual(diagnostics.audit?.issue_kinds, []);
  assert.equal(result.narration, "Gerome nods and walks out of the room.");
});

test("full turn O (created NPC): a completed narrated departure is authorized from evidence; a vague one is not and is never narrated as done", async () => {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "register_character", character: { id: "campaign_character_tomas", origin: { kind: "created" }, profile: { name: "Tomas", sex: "male" }, current: { current_location: ROOM, status: "active" } } }] });
  const h = fixtureHarness(f);
  await h.step("Tomas, you may go now.", ["Tomas looks toward the door but stays."], [{ kind: "leave_scene", character_id: "campaign_character_tomas" }]);
  assert.equal(at(h.campaign.exportSnapshot(), h.world, "campaign_character_tomas"), ROOM);
  await h.step("Tomas, you may go now. Leave the room.", ["Tomas nods and leaves the room."], [{ kind: "leave_scene", character_id: "campaign_character_tomas" }]);
  assert.equal(at(h.campaign.exportSnapshot(), h.world, "campaign_character_tomas"), undefined);
});

test("full turn Y: going down alone and coming back keeps everyone where state put them", async () => {
  const h = fixtureHarness();
  await h.step("I go down to the main hall alone.", ["Nicco descends to the main hall alone. Brenna, Gerome and Maren remain above."]);
  assert.equal(at(h.campaign.exportSnapshot(), h.world, "nicco"), HALL);
  const back = await h.step("I go back up to the observation room. Who is here?", ["Nicco climbs back to the observation room. Brenna, Gerome and Maren are where he left them."]);
  const s = h.campaign.exportSnapshot();
  assert.deepEqual(["nicco", "brenna", "gerome", "maren"].map(id => at(s, h.world, id)), [ROOM, ROOM, ROOM, ROOM]);
  assert.deepEqual(back.diagnostics.audit?.issue_kinds, []);
});

test("movement determinism: same world, snapshot and input give the same movement regardless of repetition or command order", () => {
  const results = new Set<string>();
  for (let i = 0; i < 5; i++) results.add(JSON.stringify(destinationOf(H5_PHRASES.B)));
  assert.equal(results.size, 1);
  // Command order in the prepared projection does not change where the carried person ends up.
  const f = turnFixture();
  const a = f.campaign.prepare({ expected_revision: f.campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: HALL, time_advance_minutes: 1 } }, { kind: "move_character", character_id: "maren", location_id: HALL }] }).snapshot;
  const b = f.campaign.prepare({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "maren", location_id: HALL }, { kind: "runtime_delta", delta: { player_location: HALL, time_advance_minutes: 1 } }] }).snapshot;
  assert.deepEqual([at(a, f.world, "nicco"), at(a, f.world, "maren")], [at(b, f.world, "nicco"), at(b, f.world, "maren")]);
});

// ================================================================================================ B. duplicate captive identity
const world = await loadWorld("data");
const MARKET = "calderan_slave_market", BRENNA = "campaign_character_brenna";
let serial = 0;
const marketCampaign = (extra: readonly CampaignCommand[] = [], brennaSex?: string) => {
  const c = createOpeningCampaign(world, `h5_1_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } },
    { kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 29 }, ...(brennaSex ? { sex: brennaSex } : {}) }, current: { current_location: MARKET, status: "active" } } },
    { kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: "korvin" }, ...extra] });
  return c;
};
const ex = (narration: string, player: string): RecentExchange => ({ player, narration, status: "finalized", location_id: MARKET });
const buy = (c: CampaignState, input: string, recent: readonly RecentExchange[]) => resolvePersonTransactions(input, buildTurnContext(world, c.exportSnapshot()), c.exportSnapshot(), recent, c.revision, { world });
const subjectOf = (r: ReturnType<typeof buy>) => r.commands.find((x): x is Extract<CampaignCommand, { kind: "transfer_person" }> => x.kind === "transfer_person")?.character_id;

/** Exact H5 soak-run H_late_naming #6 narration (docs/evaluations/h5-live/soak.jsonl), turns 0 and 1, as recorded. */
const H5_T0 = "The cages along the private-seller row are timber-framed, iron-barred, practical things. Several hold laborers of various descriptions — a thin man sitting still with his head against the bars, a broad-shouldered Beastfolk with mottled fur crouched in the corner. One of the nearer cages contains a woman, auburn-haired, maybe thirty, sitting on the bare plank floor with her knees drawn up. She does";
const H5_T1 = "Korvin scratched the side of his jaw with one broad, callused hand and looked Nicco over the way a man sizes up a horse he's not sure he wants to sell.\n\n\"For the field worker?\" He glanced back toward the cage where Brenna sat, then turned his small perceptive eyes on Nicco again. \"Sixty gold. She's not fancy, but she's sound. No marks, no sickness, no bad habits I've seen. That's a fair price for "
  + "a field hand.\""; // completion: the recorder truncated the excerpt at 400 characters; the outcome is identical for every tested ending
const H5_SCENE = [ex(H5_T0, "*checks the cages* Korvin, what about the woman in the cage?"), ex(H5_T1, "Name your price, Korvin.")];

test("h5_duplicate_captive_purchase_regression: the exact live narration buys the pre-registered Brenna, never a newly registered narrated captive", () => {
  const c = marketCampaign();
  const r = buy(c, "Done. *pays him and takes the key*", H5_SCENE);
  assert.deepEqual(r.commands.map(x => x.kind), ["transfer_person"]);
  assert.equal(subjectOf(r), BRENNA);
  assert.equal(r.commands.some(x => x.kind === "register_character"), false);
  const before = c.exportSnapshot().characters.length;
  c.apply({ expected_revision: c.revision, commands: r.commands as CampaignCommand[] });
  const s = c.exportSnapshot();
  assert.equal(s.characters.length, before, "no new persistent person");
  assert.deepEqual([s.legal_statuses.find(l => l.character_id === BRENNA)?.holder_id, s.funds.find(f => f.character_id === "nicco")?.gold], ["nicco", 440]);
  // Every tested ending of the truncated sentence resolves the same way.
  for (const tail of ["the woman.\"", "her.\"", "a woman her age.\"", "a man like you.\""]) {
    const scene = [H5_SCENE[0]!, ex(H5_T1.replace(/a field hand\."$/, tail), "Name your price, Korvin.")];
    assert.equal(subjectOf(buy(marketCampaign(), "Done. *pays him and takes the key*", scene)), BRENNA, tail);
  }
});

test("root cause: a simile ('the way a man sizes up a horse') is not a reference to a narrated captive", () => {
  const reading = readScene(H5_SCENE, buildTurnContext(world, marketCampaign().exportSnapshot()), world);
  const man = reading.captives.find(p => p.noun === "man");
  assert.ok(man, "the thin man behind the bars is a narrated captive");
  assert.equal(refersTo(man, "Korvin looked Nicco over the way a man sizes up a horse he's not sure he wants to sell."), false);
  assert.equal(refersTo(man, "How much for the thin man?"), true);
  assert.equal(refersTo(man, "Ten gold for the man in the corner."), true);
});

const OFFER_WOMAN = (price: string) => ex(`Korvin nods toward the cage. "${price} gold for the woman. She works hard."`, "Name your price, Korvin.");

test("identity matrix B/C: a named persistent captive keeps her ID through appearance variation and 'the woman'", () => {
  const scene = [ex("Brenna sits in the nearest cage. Behind the bars, an auburn-haired woman watches Nicco without moving.", "*checks the cages* What about her?"),
    ex("The dark-haired woman in the cage lifts her head. Korvin shrugs.", "Tell me about the woman in the cage."), OFFER_WOMAN("Fifty")];
  const r = buy(marketCampaign(), "Done. *pays him*", scene);
  assert.deepEqual([r.commands.map(x => x.kind), subjectOf(r)], [["transfer_person"], BRENNA]);
  assert.equal(subjectOf(buy(marketCampaign(), "I'll take the woman. *pays him*", scene)), BRENNA);
  // Appearance adjectives never decide identity: swapping them changes nothing.
  const swapped = scene.map(e => ({ ...e, narration: e.narration.replace("auburn-haired", "grey-eyed").replace("dark-haired", "red-haired") }));
  assert.equal(subjectOf(buy(marketCampaign(), "Done. *pays him*", swapped)), BRENNA);
});

test("identity matrix A: an existing unnamed persistent captive is bought under her own ID by generic narration", () => {
  const SERA = "campaign_character_r9_woman";
  const c = createOpeningCampaign(world, `h5_1_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }] });
  c.apply({ expected_revision: c.revision, commands: [
    { kind: "register_character", character: { id: SERA, origin: { kind: "created" }, profile: {}, current: { current_location: MARKET, status: "active" },
      origin_snapshot: { source: "narrator_ephemeral", trigger: "purchase_unnamed_subject", label: "the woman", promoted_revision: c.revision + 1, promoted_world_minute: c.exportSnapshot().runtime.scene.world_time.world_minute, location_id: MARKET, established: { descriptor: "woman", role: "enslaved; offered for sale by Korvin" }, evidence: ["fixture"] } } },
    { kind: "set_legal_status", character_id: SERA, status: "enslaved", holder_id: "korvin" }] });
  const r = buy(c, "Done. *pays him*", [ex("A woman sits behind the bars, knees drawn up.", "*checks the cages*"), OFFER_WOMAN("Forty")]);
  assert.deepEqual([r.commands.map(x => x.kind), subjectOf(r)], [["transfer_person"], SERA]);
});

test("identity matrix D: a clearly distinct second captive may become a new person; Brenna is untouched", () => {
  const scene = [ex("Brenna sits in the nearest cage. In the next cage, another woman, thin and silent, sits behind the bars.", "*checks the cages*"),
    ex(`Korvin follows Nicco's look. "Twenty gold for the other woman. No papers."`, "How much for the other woman?")];
  const r = buy(marketCampaign(), "Done. *pays him*", scene);
  assert.deepEqual(r.commands.map(x => x.kind), ["register_character", "set_legal_status", "transfer_person"]);
  assert.notEqual(subjectOf(r), BRENNA);
  // Established sex is structural distinctness: a man is never Brenna (she), so he may be bought as himself.
  const men = [ex("Brenna sits in the nearest cage, her head bowed. A thin man sits behind the bars of the next one.", "*checks the cages*"),
    ex(`"Ten gold for the man," Korvin says.`, "How much for the man?")];
  const m = buy(marketCampaign([], "female"), "Done. *pays him*", men);
  assert.deepEqual(m.commands.map(x => x.kind), ["register_character", "set_legal_status", "transfer_person"]);
  assert.notEqual(subjectOf(m), BRENNA);
});

test("identity matrix E: two plausible persistent captives and a generic reference fail closed (no guessed purchase or registration)", () => {
  const SERA = "campaign_character_sera";
  const c = marketCampaign([{ kind: "register_character", character: { id: SERA, origin: { kind: "created" }, profile: { name: "Sera" }, current: { current_location: MARKET, status: "active" } } },
    { kind: "set_legal_status", character_id: SERA, status: "enslaved", holder_id: "korvin" }]);
  const r = buy(c, "Done. *pays him*", [ex("Brenna and Sera sit in neighbouring cages. A woman behind the bars looks up.", "*checks the cages*"), OFFER_WOMAN("Fifty")]);
  assert.deepEqual(r.commands, []);
  assert.equal(r.diagnostics[0]?.status, "ambiguous");
});

test("identity matrix F/G/H/I/J: same names stay distinct; late naming keeps the bought ID; save/load preserves identity; seller stays; no household", () => {
  // F: a second created character also named Brenna is a different person with its own ID; buying one never merges them.
  const OTHER = "campaign_character_brenna_2";
  const c = marketCampaign([{ kind: "register_character", character: { id: OTHER, origin: { kind: "created" }, profile: { name: "Brenna" }, current: { current_location: "heartstone_square", status: "active" } } }]);
  const r = buy(c, "Done. *pays him and takes the key*", H5_SCENE);
  assert.equal(subjectOf(r), BRENNA);
  c.apply({ expected_revision: c.revision, commands: r.commands as CampaignCommand[] });
  const s = c.exportSnapshot();
  assert.deepEqual(s.characters.filter(x => x.profile.name === "Brenna").map(x => x.id).sort(), [BRENNA, OTHER].sort());
  // H: save/load round trip keeps the same identity, holder and ledger.
  const restored = CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(s, world, "2026-10-01T12:00:00.000Z"), world), world).snapshot).exportSnapshot();
  assert.deepEqual(restored.legal_statuses.find(l => l.character_id === BRENNA)?.holder_id, "nicco");
  assert.deepEqual(restored.characters.map(x => x.id).sort(), s.characters.map(x => x.id).sort());
  // I/J: the seller stays where he was; legal ownership is not household membership.
  assert.equal(buildTurnContext(world, s).characters.some(x => x.id === "korvin"), true);
  assert.equal(s.households.find(h => h.id === OPENING_HOUSEHOLD)!.members.some(m => m.character_id === BRENNA), false);
});

test("identity matrix G: an unnamed captive bought on this turn is named later under the same ID (no second person)", () => {
  const c = createOpeningCampaign(world, `h5_1_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }] });
  const scene = [ex("A woman sits behind the bars of the nearest cage, knees drawn up.", "*checks the cages*"), OFFER_WOMAN("Forty")];
  const r = buy(c, "Done. *pays him*", scene);
  assert.deepEqual(r.commands.map(x => x.kind), ["register_character", "set_legal_status", "transfer_person"]);
  c.apply({ expected_revision: c.revision, commands: r.commands as CampaignCommand[] });
  const bought = subjectOf(r)!;
  const naming = readScene([...scene, ex('The woman looks up at him. "My name is Brenna," she says.', "What should I call you?")], buildTurnContext(world, c.exportSnapshot()), world);
  assert.deepEqual(naming.namings.map(n => [n.character_id, n.name]), [[bought, "Brenna"]]);
  assert.equal(naming.persons.some(p => p.name === "Brenna" && !p.character_id), false);
});

test("identity determinism: unrelated character registration order does not change the purchase subject", () => {
  const extra = (ids: string[]): CampaignCommand[] => ids.map(id => ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name: id.slice(-4) }, current: { current_location: MARKET, status: "active" } } }));
  const a = subjectOf(buy(marketCampaign(extra(["campaign_character_aaaa", "campaign_character_bbbb"])), "Done. *pays him and takes the key*", H5_SCENE));
  const b = subjectOf(buy(marketCampaign(extra(["campaign_character_bbbb", "campaign_character_aaaa"])), "Done. *pays him and takes the key*", H5_SCENE));
  assert.deepEqual([a, b], [BRENNA, BRENNA]);
});
