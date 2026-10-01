import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { narratorEphemeralCharacters } from "../src/campaign/promotion.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { movableCharacters, narratedMovements, resolvePlayerCarry } from "../src/turn/character-movement.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Location Continuity Pass 1.3: a campaign character moves only on explicit completed movement. No party or follower system.
 * Narration is fixture prose written for these tests.
 */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market", SQUARE = OPENING_LOCATION, LR = "heartstone_lr", CY = "heartstone_cy";
let serial = 0;
const where = (c: CampaignState, id: string) => id === "nicco" ? c.exportSnapshot().runtime.scene.player_location : c.exportSnapshot().characters.find(x => x.id === id)?.current.current_location;
const named = (c: CampaignState, name: string) => c.exportSnapshot().characters.filter(x => x.profile.name === name);
const members = (c: CampaignState) => c.exportSnapshot().households.find(h => h.id === OPENING_HOUSEHOLD)!.members.filter(m => m.status === "member" && m.role !== "owner").map(m => m.character_id);
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-01T12:00:00.000Z"), world), world).snapshot);
function campaign(location = SQUARE, extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `location_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [...(location === SQUARE ? [] : [{ kind: "runtime_delta" as const, delta: { player_location: location } }]), ...extra] });
  return c;
}
const person = (id: string, name: string, location: string, sex = "female"): CampaignCommand => ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, sex }, current: { current_location: location, status: "active" } } });
/** Scripted narrator and controller: each step supplies its narration and (optionally) the controller's proposals. */
function harness(c: CampaignState) {
  const seen: GenerationRequest[] = [];
  let texts: string[] = [], commands: CampaignCommand[] = [];
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = texts.shift()!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [...commands], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const step = async (input: string, narration: string, proposals: CampaignCommand[] = []): Promise<TurnResult> => {
    texts = [narration]; commands = proposals;
    const events = await collect(co.runTurn({ campaign: c, player_input: input }));
    const last = events.at(-1)!; assert.equal(last.type, "turn_completed", `${input}: ${JSON.stringify(last)}`);
    return (last as { result: TurnResult }).result;
  };
  return { step, prompt: () => seen.at(-1)!.messages[0]!.content };
}

// ------------------------------------------------------------------------------------------------ Regression A (§13)
test("Maren regression: named slaver and Maren promoted at the market; purchase moves nobody; carrying her into Heartstone moves only her", async () => {
  const c = campaign();
  const { step, prompt } = harness(c);
  await step("/go calderan_slave_market", "Nicco walks through West to the Slave Market.");
  await step("*approaches the slaver by the back cages*", "A lean slaver leans against a post by the back cages. Behind the bars a thin girl lies curled on the straw, burning with fever.");
  // 2–3. The slaver's name: exactly one campaign character, where he was met; not household.
  const asked = await step("What's your name?", '"Oswin," the slaver says, spitting into the dirt.');
  assert.deepEqual(asked.identity?.promoted.map(p => p.name), ["Oswin"]);
  const [oswin] = named(c, "Oswin"); assert.ok(oswin);
  assert.deepEqual([where(c, oswin.id), oswin.origin_snapshot!.trigger, members(c).includes(oswin.id)], [MARKET, "name_established", false]);
  // 4. Maren's name: exactly one campaign character, at the market.
  await step("And the girl?", "Oswin jerks his chin at the cage. \"That one's Maren. Debt forfeiture.\" Maren does not lift her head from the straw.");
  const [maren] = named(c, "Maren"); assert.ok(maren);
  assert.equal(where(c, maren.id), MARKET);
  // 5–6. Offer and purchase: ownership changes, location does not.
  await step("How much for Maren?", 'Oswin scratches his neck. "Three gold for Maren. No papers."');
  await step("Done. *pays him*", "Oswin pockets the coins and unlocks the cage.");
  const legal = () => c.exportSnapshot().legal_statuses.find(l => l.character_id === maren.id);
  assert.deepEqual([legal()?.holder_id, legal()?.transfer?.from_holder_id, where(c, maren.id), members(c)], ["nicco", oswin.id, MARKET, []]);
  // Canonical city route, no mutation: pickup and carrying resolve through the real turn pipeline.
  const beforeTravel = c.exportSnapshot().runtime.scene.world_time.world_minute;
  const carried = await step("*picks Maren up and carries her back to Heartstone*", "Nicco carries Maren through West, enters Heartstone and lays her on the sofa by the hearth.");
  assert.equal(carried.travel?.origin, MARKET);
  assert.equal(carried.travel?.destination, LR);
  assert.equal(carried.travel?.minutes, 21);
  assert.ok(carried.travel!.nodes.length > 3);
  assert.equal(c.exportSnapshot().runtime.scene.world_time.world_minute - beforeTravel, 21);
  assert.deepEqual([where(c, "nicco"), where(c, maren.id), legal()?.holder_id, members(c)], [LR, LR, "nicco", []]);
  assert.equal(c.exportSnapshot().relationships.some(e => e.from_character_id === maren.id || e.to_character_id === maren.id), false);
  assert.deepEqual([where(c, oswin.id), named(c, "Maren").length, named(c, "Oswin").length], [MARKET, 1, 1]); // the seller stays; no duplicates
  // Next turn: she is here in the narrator's context; the seller is not.
  await step("*checks her fever*", "Maren's forehead is hot under his palm.");
  assert.equal(prompt().match(/Character Maren \(/g)?.length, 1); assert.doesNotMatch(prompt(), /Character Oswin \(/);
  const restored = roundTrip(c);
  assert.deepEqual([where(restored, maren.id), where(restored, oswin.id), where(restored, "nicco")], [LR, MARKET, LR]);
});

// ------------------------------------------------------------------------------------------------ Regression B (§14)
test("chestnut boy: named and healed, Tomas stays in the square when Nicco walks back into Heartstone", async () => {
  const c = campaign(SQUARE);
  const { step, prompt } = harness(c);
  await step("*notices a boy selling roasted chestnuts*", "A boy sells roasted chestnuts from a brazier at the edge of the square. His hand has a small burn across the knuckles.");
  await step("*approaches the boy* Hello, I'm Nicco. What's your name?", '"Tomas," the boy says, wiping his hands on his apron.');
  const [tomas] = named(c, "Tomas"); assert.ok(tomas);
  assert.equal(where(c, tomas.id), SQUARE);
  await step("*notices the burn on Tomas's hand and quietly heals it*", "The burn on Tomas's hand closes and fades. Tomas stares at his knuckles.");
  await step("Goodbye, Tomas.", '"Bye, sir!" Tomas calls, already turning back to his chestnuts.');
  await step("*walks back into Heartstone*", "Nicco pushes through the heavy door into the living floor of the tower.");
  assert.match(prompt(), /Tomas stays there: do not have Nicco bring or carry them/);
  assert.deepEqual([where(c, "nicco"), where(c, tomas.id), named(c, "Tomas").length, members(c)], [LR, SQUARE, 1, []]);
  assert.deepEqual(c.exportSnapshot().relationships, createOpeningCampaign(world, "baseline").exportSnapshot().relationships); // nothing from healing or names
  assert.deepEqual(Object.keys(tomas).sort(), ["current", "id", "origin", "origin_snapshot", "profile"]); // no NPC+ state
  await step("*sits by the hearth*", "The fire crackles.");
  assert.doesNotMatch(prompt(), /Character Tomas \(/);
  await step("/go calderan_slave_market", "Nicco walks to the Slave Market alone.");
  assert.equal(where(c, tomas.id), SQUARE);
  // Returning via a multi-hop route surfaces Tomas in his unchanged location.
  await step("*walks back to Heartstone Square*", "Tomas waves from his brazier.");
  assert.equal(where(c, "nicco"), SQUARE);
  await step("*buys a cone of chestnuts*", "Tomas scoops chestnuts into a paper cone.");
  assert.equal(prompt().match(/Character Tomas \(/g)?.length, 1);
  assert.equal(where(roundTrip(c), tomas.id), SQUARE);
});

// ------------------------------------------------------------------------------------------------ Negative / positive (§15)
test("movement grammar: only completed movement of one resolvable campaign character to one concrete place moves anyone", () => {
  const c = campaign(SQUARE, [person("campaign_character_maren", "Maren", SQUARE)]);
  const context = buildTurnContext(world, c.exportSnapshot());
  const movable = movableCharacters(c.exportSnapshot(), [SQUARE, LR]);
  const moves = (narration: string, arrival = LR) => narratedMovements(narration, movable, { origin: SQUARE, arrival }, context, world).map(m => [m.character_id, m.location_id]);
  const M = "campaign_character_maren";
  assert.deepEqual(moves("Maren looks toward Heartstone."), []);                          // A: gaze
  assert.deepEqual(moves("Nicco says he'll bring Maren home later."), []);                // B: a plan
  assert.deepEqual(moves("Nicco leaves the square and heads inside."), []);               // C: Nicco moving is not Maren moving
  assert.deepEqual(moves("Maren could follow him inside, but she stays."), []);            // modality
  assert.deepEqual(moves("Maren follows Nicco into Heartstone."), [[M, LR]]);              // D
  assert.deepEqual(moves("Nicco carries Maren into Heartstone."), [[M, LR]]);              // E
  assert.deepEqual(moves("He carries her through the tower door."), [[M, LR]]);           // one compatible "her"
  assert.deepEqual(moves("They reach Heartstone, Maren still in his arms."), [[M, LR]]);
  assert.deepEqual(moves("Maren follows him inside.", SQUARE), []);                        // Nicco did not move: "inside" resolves nowhere
  assert.deepEqual(moves("Maren walks back to the Calderan Slave Market.", SQUARE), [[M, MARKET]]); // a concrete place elsewhere
  // G: two women present: "she"/"her" resolves to nobody; a name still works.
  const two = campaign(SQUARE, [person("campaign_character_maren", "Maren", SQUARE), person("campaign_character_lysa", "Lysa", SQUARE)]);
  const both = movableCharacters(two.exportSnapshot(), [SQUARE, LR]);
  const m2 = (n: string) => narratedMovements(n, both, { origin: SQUARE, arrival: LR }, buildTurnContext(world, two.exportSnapshot()), world).map(m => m.character_id);
  assert.deepEqual([m2("She follows him inside."), m2("He carries her through the tower door."), m2("Lysa follows him inside.")], [[], [], ["campaign_character_lysa"]]);
  // Player-authored carrying moves the carried person with Nicco; walking alone moves nobody else.
  assert.deepEqual(resolvePlayerCarry("*carries Maren into Heartstone*", c.exportSnapshot(), context, world, []).runtime, [{ kind: "runtime_delta", delta: { player_location: LR, time_advance_minutes: 1 } }, { kind: "move_character", character_id: M, location_id: LR }]);
  assert.deepEqual(resolvePlayerCarry("*walks into Heartstone alone*", c.exportSnapshot(), context, world, [{ kind: "runtime_delta", delta: { player_location: LR } }]).runtime, []);
  assert.deepEqual(resolvePlayerCarry("*thinks about carrying Maren inside*", c.exportSnapshot(), context, world, []).runtime, []);
});

test("controller path: a narrated follow is authorized from evidence; walking home alone never brings anyone; no automatic co-movement", async () => {
  const M = "campaign_character_maren", B = "campaign_character_brenna";
  const c = campaign(LR, [person(M, "Maren", LR), person(B, "Brenna", LR),
    { kind: "set_legal_status", character_id: M, status: "enslaved", holder_id: "nicco" }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: B }]);
  const { step } = harness(c);
  // Nicco goes to the courtyard; Maren follows (narrated, controller-proposed, evidence-confirmed). Brenna — household — stays.
  const r = await step("*walks out into the courtyard*", "Nicco walks out into the courtyard. Maren follows him into the courtyard, blinking at the light.",
    [{ kind: "move_character", character_id: M, location_id: CY }, { kind: "move_character", character_id: B, location_id: CY }]);
  assert.deepEqual(r.authorization.map(a => [a.command.kind === "move_character" ? a.command.character_id : a.command.kind, a.authorized, a.reason]),
    [[M, true, "authorized_narrative_confirmation"], [B, false, "rejected_insufficient_confirmation"]]);
  assert.deepEqual([where(c, "nicco"), where(c, M), where(c, B)], [CY, CY, LR]);
  // Walking back alone: a proposal to bring Maren along is rejected (no narrated movement); ownership moves nobody.
  const alone = await step("*walks back into Heartstone alone*", "Nicco walks back into the tower alone.", [{ kind: "move_character", character_id: M, location_id: LR }]);
  assert.equal(alone.authorization[0]!.authorized, false);
  assert.deepEqual([where(c, "nicco"), where(c, M)], [LR, CY]);
});

test("same turn: a purchase and carrying the bought person home commit atomically; the seller stays", async () => {
  const M = "campaign_character_maren", S = "campaign_character_oswin";
  const c = campaign(SQUARE, [person(M, "Maren", SQUARE), person(S, "Oswin", SQUARE, "male"), { kind: "set_legal_status", character_id: M, status: "enslaved", holder_id: S }]);
  const { step, prompt } = harness(c);
  await step("How much for Maren, Oswin?", 'Oswin shrugs. "Three gold for her. No papers."');
  const r = await step("Done. *pays him and carries Maren into Heartstone*", "Nicco pays, lifts Maren and carries her through the heavy door into the tower.");
  assert.match(prompt(), /Purchase completes now/);
  assert.equal(r.final_revision, r.base_revision + 1); // one atomic revision
  const legal = c.exportSnapshot().legal_statuses.find(l => l.character_id === M)!;
  assert.deepEqual([legal.holder_id, where(c, "nicco"), where(c, M), where(c, S), members(c)], ["nicco", LR, LR, SQUARE, []]);
});
