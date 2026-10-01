import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { narratedDepartures } from "../src/turn/scene-departure.js";
import { movableCharacters, narratedMovements, resolvePlayerCarry } from "../src/turn/character-movement.js";
import { TurnCoordinator, type TurnDebugRecord } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Hardening H1: deterministic identity / continuity edge cases that must hold before NPC+, and multi-actor movement attribution.
 * Offline fixture prose; no LLM is called. No fuzzy identity merging exists or is tested for.
 */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market", SQUARE = OPENING_LOCATION, LR = "heartstone_lr", INN = "gatherers_inn";
let serial = 0;
const campaign = (location = SQUARE, extra: readonly CampaignCommand[] = []) => {
  const c = createOpeningCampaign(world, `h1_identity_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [...(location === SQUARE ? [] : [{ kind: "runtime_delta" as const, delta: { player_location: location } }]), ...extra] });
  return c;
};
const person = (id: string, name: string, location: string, sex = "female"): CampaignCommand =>
  ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, sex }, current: { current_location: location, status: "active" } } });
const where = (c: CampaignState, id: string) => id === "nicco" ? c.exportSnapshot().runtime.scene.player_location : c.exportSnapshot().characters.find(x => x.id === id)?.current.current_location;
const named = (c: CampaignState, name: string) => c.exportSnapshot().characters.filter(x => x.profile.name === name);
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-01T12:00:00.000Z"), world), world).snapshot);
function harness(c: CampaignState, sink?: (r: TurnDebugRecord) => void) {
  let texts: string[] = [], commands: CampaignCommand[] = [];
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream() { const text = texts.length > 1 ? texts.shift()! : texts[0]!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [...commands], ...metadata }; } }, { service, search: new HybridSearch(service) }, sink ? { debug_sink: sink } : {});
  return async (input: string, narration: string, proposals: CampaignCommand[] = []): Promise<TurnResult> => {
    texts = [narration]; commands = proposals;
    const last = (await collect(co.runTurn({ campaign: c, player_input: input }))).at(-1)!;
    assert.equal(last.type, "turn_completed", `${input}: ${JSON.stringify(last).slice(0, 300)}`);
    return (last as { result: TurnResult }).result;
  };
}

// ------------------------------------------------------------------------------------------------ naming vs movement
test("naming while Nicco moves: the person may be left behind, so nobody is promoted anywhere (H1 location_changed)", async () => {
  const c = campaign(), step = harness(c);
  const r = await step("*walks into Heartstone*", 'As Nicco reaches the door, the chestnut boy calls after him, "I\'m Tomas, sir!" Nicco steps inside.');
  assert.deepEqual(r.identity?.skipped, [{ name: "Tomas", reason: "location_changed" }]);
  assert.deepEqual([named(c, "Tomas").length, where(c, "nicco")], [0, LR], "no durable character in a possibly wrong place; the move still commits");
});
test("naming on a stationary turn after arrival promotes at the place where it happened", async () => {
  const c = campaign(), step = harness(c);
  await step("/go calderan_slave_market", "Nicco walks to the Slave Market. A lean slaver leans by the back cages.");
  const r = await step("What's your name?", '"Oswin," the slaver says, spitting into the dirt.');
  assert.deepEqual(r.identity?.promoted.map(p => p.name), ["Oswin"]);
  assert.equal(where(c, named(c, "Oswin")[0]!.id), MARKET);
});
test("canonical NPC names are never promoted as narrator-created people", async () => {
  const c = campaign(MARKET), step = harness(c);
  const r = await step("What's your name?", '"Korvin," the slaver says.');
  assert.deepEqual([r.identity?.promoted, named(c, "Korvin").length], [[], 0]);
});
test("promotion evidence in quoted dialogue: an ellipsis inside speech is not a sentence break (H1 splitter fix)", async () => {
  const c = campaign(MARKET), step = harness(c);
  await step("*approaches the slaver*", "A lean slaver leans against a post by the back cages.");
  await step("What's your name?", '"Oswin," the slaver says. "Worked in the mines… till they shut. Now this."');
  const [oswin] = named(c, "Oswin"); assert.ok(oswin);
  const background = oswin.origin_snapshot?.established.background?.map(b => b.text) ?? [];
  assert.ok(background.includes("Worked in the mines… till they shut."), JSON.stringify(background));
  assert.ok(!background.includes("Worked in the mines…"), "no fragment claim cut at the ellipsis");
});

// ------------------------------------------------------------------------------------------------ late naming
test("unnamed purchased person names herself after a scene change: same ID, legal holder and household; survives save/load", async () => {
  const c = campaign(), step = harness(c);
  await step("/go calderan_slave_market", "Nicco walks to the Slave Market.");
  await step("*approaches the cages*", "A lean slaver leans against a post. Behind the bars a thin girl lies curled on the straw, burning with fever.");
  await step("How much for the girl?", 'The slaver shrugs. "Three gold for the girl. No papers."');
  const bought = await step("Done. *pays him*", "The slaver pockets the coins and unlocks the cage.");
  const id = bought.authorized_commands.find((x): x is Extract<CampaignCommand, { kind: "transfer_person" }> => x.kind === "transfer_person")?.character_id;
  assert.ok(id, "purchase promoted the unnamed girl");
  assert.equal(c.exportSnapshot().characters.find(x => x.id === id)!.profile.name, undefined);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: id }] }); // fixture state, not inferred
  await step("/go heartstone_lr", "Nicco walks home alone.");                              // scene change; she stays (no follow)
  assert.equal(where(c, id), MARKET);
  await step("/go calderan_slave_market", "Nicco returns to the Slave Market.");
  const r = await step("*kneels by her* What is your name?", 'The girl lifts her head. "My name is Maren," she whispers.');
  assert.deepEqual(r.identity?.named.map(n => [n.character_id, n.name]), [[id, "Maren"]]);
  const check = (s: CampaignState) => {
    const snap = s.exportSnapshot(), me = snap.characters.find(x => x.id === id)!;
    assert.deepEqual([me.profile.name, me.current.current_location, me.origin_snapshot?.trigger], ["Maren", MARKET, "purchase_unnamed_subject"]);
    assert.equal(snap.legal_statuses.find(l => l.character_id === id)?.holder_id, "nicco");
    assert.ok(snap.households.find(h => h.id === OPENING_HOUSEHOLD)!.members.some(m => m.character_id === id && m.status === "member"));
    assert.equal(snap.characters.filter(x => x.profile.name === "Maren").length, 1, "no duplicate record");
  };
  check(c); check(roundTrip(c));
});
test("a present persistent person is never re-promoted when narration repeats her name", async () => {
  const M = "campaign_character_maren", c = campaign(SQUARE, [person(M, "Maren", SQUARE)]), step = harness(c);
  const r = await step("What's your name?", '"Maren," she says again.');
  assert.deepEqual([r.identity?.promoted, named(c, "Maren").map(x => x.id)], [[], [M]]);
});
test("a person who stays behind and is revisited keeps one record and one location", async () => {
  const T = "campaign_character_tomas", c = campaign(SQUARE, [person(T, "Tomas", SQUARE, "male")]), step = harness(c);
  await step("/go calderan_slave_market", "Nicco walks to the Slave Market alone.");
  assert.ok(!buildTurnContext(world, c.exportSnapshot()).characters.some(x => x.id === T));
  await step("/go heartstone_square", "Tomas waves from his brazier.");
  assert.ok(buildTurnContext(world, c.exportSnapshot()).characters.some(x => x.id === T));
  assert.deepEqual([where(c, T), named(c, "Tomas").length, where(roundTrip(c), T)], [SQUARE, 1, SQUARE]);
});

// ------------------------------------------------------------------------------------------------ identity skip diagnostic
test("an identity preparation failure skips promotion, still commits the turn, and is observable (result + debug sink)", async () => {
  const c = campaign(MARKET), records: TurnDebugRecord[] = [], step = harness(c, r => records.push(r));
  const prepare = c.prepare.bind(c);
  c.prepare = (input: unknown) => {                                     // test seam: fail only the identity re-preparation
    const commands = (input as { commands: CampaignCommand[] }).commands;
    if (commands.some(x => x.kind === "register_character" && x.character.origin_snapshot?.trigger === "name_established")) throw new Error("injected identity failure");
    return prepare(input);
  };
  const before = c.revision;
  const r = await step("/wait 5", 'A lean slaver straightens. "I\'m Oswin," he says.');
  assert.deepEqual([r.identity?.promoted, r.identity_skipped?.reason], [[], "injected identity failure"]);
  assert.equal(c.revision, before + 1, "the rest of the turn (the wait) committed");
  assert.equal(named(c, "Oswin").length, 0);
  assert.deepEqual(records.filter(x => x.kind === "identity_establishment_skipped").map(x => x.kind === "identity_establishment_skipped" ? x.reason : ""), ["injected identity failure"]);
});

// ------------------------------------------------------------------------------------------------ multi-actor attribution
// (Not "Jessa": the canonical NPC Jessa Rook is present at the Gatherer's Inn.)
const DELL = "campaign_character_dell", BRAM = "campaign_character_bram", LYSA = "campaign_character_lysa";
const innContext = () => buildTurnContext(world, campaign(INN, [person(DELL, "Dell Harrow", INN, "male"), person(BRAM, "Bram Kessel", INN, "male"), person(LYSA, "Lysa Vale", INN)]).exportSnapshot());
test("departures: A leaves while B stays; A and B both leave; looking or speaking about leaving is not leaving", () => {
  const ctx = innContext(), ids = (n: string) => narratedDepartures(n, ctx).map(d => d.character_id);
  assert.deepEqual(ids("Dell walks out of the inn. Bram stays at the bar."), [DELL]);
  assert.deepEqual(ids("Dell walks out of the inn. Bram leaves the inn too."), [DELL, BRAM]);
  assert.deepEqual(ids("Dell looks toward the door."), []);
  assert.deepEqual(ids('"I\'m leaving," Dell says.'), []);
  assert.deepEqual(ids('Lysa says, "Dell walks out of the inn every night."'), [], "quoted narration-like speech is not a departure");
  assert.deepEqual(ids("Dell says he will leave later."), []);
});
test("departures: ambiguous and sex-incompatible pronouns never remove the wrong person (H1 narrowing); subject continuity kept", () => {
  const ctx = innContext(), ids = (n: string) => narratedDepartures(n, ctx).map(d => d.character_id);
  assert.deepEqual(ids("Dell and Bram argue. He walks out of the inn."), [], "compound subject: no referent");
  assert.deepEqual(ids("Dell, Bram and Lysa argue. She walks out of the inn."), [], "compound subject list");
  assert.deepEqual(ids("Lysa glares at Dell. He walks out of the inn."), [], "Lysa is never the referent of 'he'");
  assert.deepEqual(ids("Lysa glares at Dell. She walks out of the inn."), [LYSA]);
  assert.deepEqual(ids("Dell glares at Bram. He walks out of the inn."), [DELL], "subject continuity (legacy design) is preserved");
  assert.deepEqual(ids("Dell and Bram argue. The door bangs shut behind him."), [], "'behind him' follows the same rule");
});
test("movement: Nicco moves while a character only says she will follow; explicit carrying moves only the carried person", async () => {
  const M = "campaign_character_maren", T = "campaign_character_tomas";
  const c = campaign(SQUARE, [person(M, "Maren", SQUARE), person(T, "Tomas", SQUARE, "male")]), step = harness(c);
  const r = await step("/go heartstone_lr", 'Nicco heads inside. "I\'ll follow you later," Maren says.', [{ kind: "move_character", character_id: M, location_id: LR }]);
  assert.equal(r.authorization[0]!.authorized, false);
  assert.deepEqual([where(c, "nicco"), where(c, M), where(c, T)], [LR, SQUARE, SQUARE]);
  const back = campaign(SQUARE, [person(M, "Maren", SQUARE), person(T, "Tomas", SQUARE, "male")]);
  const ctx = buildTurnContext(world, back.exportSnapshot());
  const carry = resolvePlayerCarry("*picks Maren up and carries her into Heartstone*", back.exportSnapshot(), ctx, world, []);
  assert.deepEqual(carry.runtime.filter(x => x.kind === "move_character").map(x => x.kind === "move_character" ? x.character_id : ""), [M], "only Maren moves with Nicco");
  const movable = movableCharacters(back.exportSnapshot(), [SQUARE, LR]);
  const moves = (n: string) => narratedMovements(n, movable, { origin: SQUARE, arrival: LR }, ctx, world).map(m => m.character_id);
  assert.deepEqual(moves("Maren follows Nicco into Heartstone. Tomas stays by his brazier."), [M]);
  assert.deepEqual(moves("Maren follows Nicco into Heartstone. Tomas follows him into Heartstone too."), [M, T]);
  assert.deepEqual(moves("Tomas looks toward the tower door."), []);
});
