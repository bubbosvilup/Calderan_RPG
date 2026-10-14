import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../../src/world/loader.js";
import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignCommand, CampaignSnapshot } from "../../src/campaign/types.js";
import type { WorldStore } from "../../src/world/world-store.js";
import { GameSession, type SessionDeps } from "../../src/app/game-session.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import { buildTurnContext } from "../../src/turn/context/context-builder.js";
import { buildSceneStateProjection } from "../../src/turn/context/scene-state-projection.js";
import { characterLocation } from "../../src/turn/movement/character-movement.js";
import { resolvePlayerTravel } from "../../src/turn/movement/player-travel.js";
import type { NarratorProvider } from "../../src/llm/narrator-provider.js";
import type { GenerationRequest } from "../../src/llm/types.js";
import type { TurnResult } from "../../src/turn/turn-types.js";
import type { DeepReadonly } from "../../src/types/readonly.js";
import { turnFixture } from "../../src/dev/support/turn-fixture.js";
import { collect, metadata } from "../support/turn-fixtures.js";
import * as F from "../fixtures/person-offer-playthrough.js";

/**
 * Companion / group movement bugfix. A person moves with Nicco on inter-location travel only when the CURRENT turn evidences it, derived per turn
 * (no party, follow flag, escort membership or roster): (B) the deterministic escort of a person Nicco holds whom the player's own words lead, named,
 * or unnamed when nobody else is present; (A) a completed narrated follow of that same person. The companion inherits Nicco's resolved arrival in
 * the same batch; anything ambiguous fails closed. M1-M15 below; the real regression is the recorded live person-offer playthrough.
 */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market", HOME = "heartstone_lr", NICCO = "nicco";
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
const plain = <T>(x: T) => JSON.parse(JSON.stringify(x)) as T;

interface Play { narration?: string; commands?: readonly CampaignCommand[]; during?: (campaign: CampaignState) => void }
/** A real GameSession over `campaign` with a scripted Narrator and Controller; every turn's TurnResult and Narrator prompt are kept. */
async function sessionOver(campaign: CampaignState, w: WorldStore = world) {
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-companion-")); dirs.push(dir);
  let play: Play = {};
  const results: TurnResult[] = [], prompts: string[] = [];
  const narrator: NarratorProvider = { async generate() { throw new Error("unused"); },
    async *stream(r: GenerationRequest) { prompts.push(r.messages.map(m => m.content).join("\n")); const text = play.narration ?? "*Nicco looks around.*"; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
  const service = new RetrievalService(w);
  const coordinator = new TurnCoordinator(w, narrator, { async propose() { play.during?.(campaign); return { commands: [...(play.commands ?? [])], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const run = coordinator.runTurn.bind(coordinator);
  (coordinator as { runTurn: TurnCoordinator["runTurn"] }).runTurn = async function* (request) { for await (const e of run(request)) { if (e.type === "turn_completed") results.push(e.result); yield e; } };
  const repository = new FileCampaignRepository(w, dir);
  const deps: SessionDeps = { world: w, repository, createCoordinator: () => coordinator };
  const session = GameSession.fromCampaign(deps, campaign);
  const turn = async (player: string, p: Play = {}) => { play = p; return session.submitPlayerInput(player); };
  return { session, campaign, deps, repository, turn, results, prompts, last: () => results.at(-1)! };
}

// The recorded live person-offer playthrough through Accept and the woman's name: the state every real-path case starts from.
const BASE: DeepReadonly<CampaignSnapshot> = await (async () => {
  const campaign = createOpeningCampaign(world, "companion_movement");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, { kind: "runtime_delta", delta: { time_advance_minutes: 600 } }] });
  const h = await sessionOver(campaign);
  for (const t of [F.SELLERS_ROW, F.KORVIN_NAME_REVEAL, F.OFFER_300, F.HAGGLE, F.LOWBALL, F.DONE_DEAL, F.PAYS_PROSE, F.GIVE_GOLD_PROSE]) assert.ok((await h.turn(t.player, { narration: t.narration })).ok);
  const card = h.session.getTradeView().offer!;
  assert.ok(h.session.acceptTradeOffer({ ref: card.ref, expected_revision: h.session.getView().session.revision }).ok);
  for (const t of [F.ASK_NAME_1, F.ASK_NAME_2]) assert.ok((await h.turn(t.player, { narration: t.narration })).ok);
  const snapshot = campaign.exportSnapshot();
  await h.session.shutdown({ discard_unsaved: true });
  return snapshot;
})();
const MAREN = BASE.characters.find(c => c.origin.kind === "created")!.id;
const fromBase = (adjust: readonly CampaignCommand[] = []) => {
  const campaign = CampaignState.restore(world, plain(BASE));
  if (adjust.length) campaign.apply({ expected_revision: campaign.revision, commands: [...adjust] });
  return sessionOver(campaign);
};
const where = (campaign: CampaignState, id: string) => characterLocation(campaign.exportSnapshot(), world, id);
const moves = (r: TurnResult) => r.committed.filter(c => c.command.kind === "move_character");
const PRONOUN_FOLLOW = "*She nods and falls into step behind him. They walk back through the rain until the old stone tower comes into view.*\n\n*Nicco pushes open the main entrance. She follows him inside.*";
const ALONE_HOME = "*Nicco walks home through the rain and pushes open the door of the old stone tower.*";

test("the starting state is the real one: the bought woman is Maren, one Campaign character, held by Nicco, with him at the market among three other people", () => {
  const maren = BASE.characters.find(c => c.id === MAREN)!;
  assert.equal(maren.profile.name, "Maren");
  assert.equal(BASE.characters.filter(c => c.origin.kind === "created").length, 1);
  assert.equal(BASE.legal_statuses.find(l => l.character_id === MAREN)?.holder_id, NICCO);
  assert.equal(maren.current.current_location, MARKET); assert.equal(BASE.runtime.scene.player_location, MARKET);
  const present = buildTurnContext(world, BASE, { input: "", recent_text: "" }).characters.map(c => c.id).filter(id => id !== NICCO && id !== MAREN);
  assert.equal(present.length, 3, `others present: ${present.join(", ")}`);
});

test("M1-M6 (real regression): \"Alright Maren, i just purchased you, let's go home\" moves Nicco AND Maren to Heartstone in one revision, same id, visible in the view and the scene projection", async () => {
  const h = await fromBase(), before = h.campaign.revision;
  const r = await h.turn(F.GO_HOME.player, { narration: F.GO_HOME.narration });
  assert.ok(r.ok);
  const s = h.campaign.exportSnapshot();
  // M1, M3: CampaignState holds both at the destination.
  assert.equal(s.runtime.scene.player_location, HOME);
  assert.equal(where(h.campaign, MAREN), HOME);
  // M2: the same entity, no duplicate, nothing about her changed but her location.
  assert.equal(s.characters.filter(c => c.origin.kind === "created").length, 1);
  const was = BASE.characters.find(c => c.id === MAREN)!, is = s.characters.find(c => c.id === MAREN)!;
  assert.deepEqual(plain({ ...is, current: { ...is.current, current_location: was.current.current_location } }), plain(was), "only current_location changed");
  assert.equal(s.legal_statuses.find(l => l.character_id === MAREN)?.holder_id, NICCO);
  // M6: one atomic commit; the companion inherits Nicco's resolved arrival (never a second resolution of "home").
  assert.equal(h.campaign.revision, before + 1);
  const result = h.last(), arrival = result.committed.find(c => c.command.kind === "runtime_delta" && !!c.command.delta.player_location)!.command;
  assert.equal(arrival.kind === "runtime_delta" ? arrival.delta.player_location : undefined, HOME);
  assert.deepEqual(moves(result).map(c => [c.lane, c.command]), [["player_runtime", { kind: "move_character", character_id: MAREN, location_id: HOME }]]);
  // M4: SessionView, without another turn or a reload.
  const view = h.session.getView();
  assert.equal(view.scene.location.id, HOME);
  assert.ok(view.scene.present.some(p => p.id === MAREN));
  // M5: the Scene State Projection built from the committed state.
  const ssp = buildSceneStateProjection(buildTurnContext(world, s, { input: "", recent_text: "" }));
  assert.equal(ssp.location.name, world.getEntity(HOME)!.display_name);
  assert.deepEqual(ssp.present.filter(p => !p.player).map(p => [p.id, p.name]), [[MAREN, "Maren"]]);
  // The delivered narration is the draft, whole: the audit does not read her walking along with him as an unrecorded departure.
  assert.deepEqual([result.narration_reconciliation?.delivered, result.narration_reconciliation?.issues], ["draft", []]);
  assert.equal(result.narration, F.GO_HOME.narration);
  // The Narrator was told she travels with him.
  assert.match(h.prompts.at(-1)!, /Nicco leads Maren along with him[^\n]*NOT left behind/);
});

test("M1 (spec forms): every strong named or sole-companion form moves Maren with Nicco; the forms with no destination move nobody", async () => {
  for (const input of ["Alright Maren, let's go home.", "Maren, come with me. We're going home.", "ok Maren lets go home", "Let's go home, Maren.", "Come on Maren, let's go back to Heartstone.", "Maren, follow me. We're heading home."]) {
    const h = await fromBase();
    assert.ok((await h.turn(input, { narration: PRONOUN_FOLLOW })).ok);
    assert.deepEqual([where(h.campaign, NICCO), where(h.campaign, MAREN)], [HOME, HOME], input);
    assert.deepEqual(moves(h.last()).map(c => c.lane), ["player_runtime"], input);
  }
  for (const input of ["Follow me.", "Come on, we're leaving."]) {
    const h = await fromBase();
    assert.ok((await h.turn(input, { narration: PRONOUN_FOLLOW })).ok);
    assert.deepEqual([where(h.campaign, NICCO), where(h.campaign, MAREN)], [MARKET, MARKET], `${input}: no destination, nobody travels`);
  }
});

test("player travel: progressive and comma-less cohortative forms resolve Nicco's destination; intention and negation still do not", () => {
  const snapshot = CampaignState.restore(world, plain(BASE)).exportSnapshot(), context = buildTurnContext(world, snapshot, { input: "", recent_text: "" });
  const to = (input: string) => resolvePlayerTravel(input, MARKET, context, world).runtime.map(c => c.kind === "runtime_delta" ? c.delta.player_location : undefined)[0];
  for (const input of ["Come with me, we're going home.", "We're going home.", "we are heading home", "I'm going home.", "I am going home.", "ok Maren lets go home", "Okay, let's go home.", "Korvin lets go home"]) assert.equal(to(input), HOME, input);
  for (const input of ["I'm going to the Slave Market to buy her.", "We're not going home.", "I'm going home tomorrow.", "Maren should probably go home sometime.", "Should we go home?", "Maren goes home."]) assert.equal(to(input), undefined, input);
});

test("M7: when Nicco's own travel does not resolve or is blocked, nobody moves (the companion never travels alone)", async () => {
  for (const input of ["Alright Maren, let's go to the Moon.", "Alright Maren, we're going home tomorrow.", "Alright Maren, let's go nowhere."]) {
    const h = await fromBase(), before = h.campaign.revision;
    assert.ok((await h.turn(input, { narration: PRONOUN_FOLLOW })).ok);
    assert.deepEqual([where(h.campaign, NICCO), where(h.campaign, MAREN)], [MARKET, MARKET], input);
    assert.equal(moves(h.last()).length, 0, input);
    assert.ok(h.campaign.revision <= before + 1, input);
  }
});

test("M8: a stale revision commits nothing (no phantom companion move); a companion who is not here never moves", async () => {
  const h = await fromBase(), base = h.campaign.revision;
  const r = await h.turn(F.GO_HOME.player, { narration: F.GO_HOME.narration, during: c => c.apply({ expected_revision: base, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }) });
  assert.ok(!r.ok && r.error.code === "stale_turn", JSON.stringify(r));
  assert.equal(h.campaign.revision, base + 1, "only the external change landed");
  assert.deepEqual([where(h.campaign, NICCO), where(h.campaign, MAREN)], [MARKET, MARKET]);
  // Maren is already elsewhere (at an inn): Nicco's travel from the market cannot "bring" her; she is not teleported, duplicated or touched.
  const away = await fromBase([{ kind: "move_character", character_id: MAREN, location_id: "the_slaughtered_pig" }]);
  assert.ok((await away.turn(F.GO_HOME.player, { narration: F.GO_HOME.narration })).ok);
  assert.equal(where(away.campaign, NICCO), HOME); assert.equal(where(away.campaign, MAREN), "the_slaughtered_pig");
  assert.equal(moves(away.last()).length, 0);
  assert.equal(away.campaign.exportSnapshot().characters.filter(c => c.origin.kind === "created").length, 1);
});

test("M9: escort, narrated follow and a Controller proposal for the same person and place produce ONE move", async () => {
  const h = await fromBase();
  const narration = "*Maren nods and falls into step behind him. They walk back through the rain. Maren follows him into the old stone tower.*";
  assert.ok((await h.turn("Alright Maren, let's go home.", { narration, commands: [{ kind: "move_character", character_id: MAREN, location_id: HOME }] })).ok);
  assert.equal(where(h.campaign, MAREN), HOME);
  assert.equal(moves(h.last()).length, 1);
  assert.equal(h.last().committed.filter(c => c.command.kind === "move_character" && c.command.character_id === MAREN).length, 1);
});

test("M10, M11: a location claim, a gaze, a hedge, a lone \"I'm going home\" or an unnamed lead among three other people never move Maren (Nicco may still move)", async () => {
  const cases: [string, string, string][] = [
    ["I'm going home.", PRONOUN_FOLLOW, HOME],
    ["I go home.", "*Nicco walks home through the rain. Maren is now at Heartstone.*", HOME],
    ["I go home.", "*Maren watches him leave. Nicco walks home through the rain.*", HOME],
    ["Let's go home.", PRONOUN_FOLLOW, HOME],
    ["Come with me, we're going home.", PRONOUN_FOLLOW, HOME],
    ["Maren should probably go home sometime.", "*Maren says nothing.*", MARKET],
  ];
  for (const [input, narration, nicco] of cases) {
    const h = await fromBase();
    assert.ok((await h.turn(input, { narration })).ok);
    assert.deepEqual([where(h.campaign, NICCO), where(h.campaign, MAREN)], [nicco, MARKET], input);
    assert.equal(moves(h.last()).length, 0, input);
  }
  // A Controller move backed only by the claim is not evidence either.
  const h = await fromBase();
  assert.ok((await h.turn("I go home.", { narration: "*Nicco walks home through the rain. Maren is at Heartstone.*", commands: [{ kind: "move_character", character_id: MAREN, location_id: HOME }] })).ok);
  assert.equal(where(h.campaign, MAREN), MARKET);
});

test("M11b: Maren named and led, but told to stay or refused in the same words, stays", async () => {
  for (const input of ["Maren, stay here. I'm going home.", "Maren, you are not coming with me. Let's go home.", "Maren, don't follow me. We're going home."]) {
    const h = await fromBase();
    assert.ok((await h.turn(input, { narration: ALONE_HOME })).ok);
    assert.equal(where(h.campaign, MAREN), MARKET, input);
  }
});

test("M13: save and load keep both locations, the same id and name, the ownership and the history; nothing about following is persisted", async () => {
  const h = await fromBase();
  assert.ok((await h.turn(F.GO_HOME.player, { narration: F.GO_HOME.narration })).ok);
  const saved = h.campaign.exportSnapshot();
  assert.ok((await h.session.save()).ok);
  const id = saved.campaign_id;
  await h.session.shutdown({});
  const loaded = await GameSession.loadCampaign(h.deps, id);
  assert.ok(loaded.ok, JSON.stringify(loaded));
  const view = loaded.session.getView();
  assert.equal(view.scene.location.id, HOME);
  assert.ok(view.scene.present.some(p => p.id === MAREN && p.name === "Maren"));
  const s = (await h.repository.loadCampaign(id)).campaign.exportSnapshot();
  assert.deepEqual(plain(s), plain(saved), "the loaded state is the saved state");
  assert.equal(s.trade_offers?.filter(o => o.status === "accepted").length, 1, "the purchase history is kept");
  assert.doesNotMatch(JSON.stringify(s), /"(?:party|follow(?:ers?|ing)?|escort(?:s|ed)?|companions?|roster)"\s*:/, "no persistent follow state");
  await loaded.session.shutdown({ discard_unsaved: true });
});

test("M14: the trace shows Nicco's travel and the companion move in the player lane of the committed batch; nothing else moved her", async () => {
  const h = await fromBase();
  const r = await h.turn(F.GO_HOME.player, { narration: F.GO_HOME.narration });
  assert.ok(r.ok);
  assert.deepEqual(r.trace.committed_lanes!.filter(l => l.lane === "player_runtime").map(l => l.kind), ["runtime_delta", "move_character"]);
  assert.deepEqual(r.trace.committed_command_kinds.filter(k => k === "move_character"), ["move_character"]);
  // Preparing the committed list from the starting state reproduces the committed state exactly: there is no untraced repair path.
  const replay = CampaignState.restore(world, plain(BASE)).prepare({ expected_revision: BASE.revision, commands: h.last().committed.map(c => c.command) }).snapshot;
  assert.deepEqual(plain(replay), plain(h.campaign.exportSnapshot()));
});

test("next turn at home: Maren is still the person in the scene (no fork, no new participant, her name kept)", async () => {
  const h = await fromBase();
  assert.ok((await h.turn(F.GO_HOME.player, { narration: F.GO_HOME.narration })).ok);
  assert.ok((await h.turn("Maren, sit by the hearth and warm up.", { narration: "*Maren sits by the hearth, holding her hands to the warmth.*" })).ok);
  const s = h.campaign.exportSnapshot();
  assert.equal(where(h.campaign, MAREN), HOME);
  assert.equal(s.characters.filter(c => c.origin.kind === "created").length, 1);
  assert.equal(s.characters.find(c => c.id === MAREN)?.profile.name, "Maren");
  assert.ok(h.session.getView().scene.present.some(p => p.id === MAREN));
});

// ------------------------------------------------------------------------------------------------ offline fixture world
const create = (id: string, name: string | undefined, location = "test_hall", label?: string, promoted_revision = 1): CampaignCommand =>
  ({ kind: "register_character", character: { id, origin: { kind: "created" }, ...(label ? { origin_snapshot: { source: "narrator_ephemeral", trigger: "purchase_unnamed_subject", promoted_revision, promoted_world_minute: 100, location_id: location, label, established: { sex: "female" }, evidence: ["Bought at the market."] } } : {}), profile: { ...(name ? { name } : {}), sex: "female", age: { kind: "exact", years: 24 } }, current: { current_location: location, status: "active" } } } as CampaignCommand);
const hold = (id: string): CampaignCommand => ({ kind: "set_legal_status", character_id: id, status: "enslaved", holder_id: NICCO });
const household = (...ids: string[]): CampaignCommand[] => [
  { kind: "create_household", id: "campaign_household_home", name: "Home" },
  { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: NICCO, status: "member", role: "owner" } },
  ...ids.map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id })),
];
/** Nicco and the given people in the main hall of the fixture world; nobody else is there. "the observation room" is upstairs. */
async function hall(setup: readonly CampaignCommand[] | ((revision: number) => readonly CampaignCommand[]), turns: readonly (readonly [string, string, (readonly CampaignCommand[])?])[]) {
  const f = turnFixture(), requests: GenerationRequest[] = [];
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "test_hall" } }, ...(typeof setup === "function" ? setup(f.campaign.revision + 1) : setup)] });
  let narration = "", commands: readonly CampaignCommand[] = [];
  const narrator = { async generate(r: GenerationRequest) { requests.push(r); return { text: narration, ...metadata }; },
    async *stream(r: GenerationRequest) { requests.push(r); yield { type: "text_delta" as const, text: narration }; yield { type: "completed" as const, result: { text: narration, ...metadata } }; } };
  const service = new RetrievalService(f.world);
  const coordinator = new TurnCoordinator(f.world, narrator, { async propose() { return { commands: [...commands], ...metadata }; } }, { service, search: new HybridSearch(service) });
  const results: TurnResult[] = [];
  for (const [input, text, proposed] of turns) {
    narration = text; commands = proposed ?? [];
    const done = (await collect(coordinator.runTurn({ campaign: f.campaign, player_input: input }))).find(e => e.type === "turn_completed");
    assert.ok(done && done.type === "turn_completed", input);
    results.push(done.result);
  }
  const snapshot = f.campaign.exportSnapshot();
  return { at: (id: string) => characterLocation(snapshot, f.world, id), results, prompt: requests.at(-1)!.messages.map(m => m.content).join("\n"), snapshot };
}
const UP = "I go up to the observation room.", UP_NARRATION = "*Nicco climbs the stairs to the observation room.*";

test("unnamed lead: \"Come with me\" moves the ONE held person when nobody else is present; with a second held person, a free person or a temporary participant present, nobody", async () => {
  const sole = await hall([create("campaign_character_t", "Tessa"), hold("campaign_character_t")], [[`Come with me. ${UP}`, UP_NARRATION]]);
  assert.deepEqual([sole.at(NICCO), sole.at("campaign_character_t")], ["test_room", "test_room"]);
  assert.deepEqual(moves(sole.results[0]!).map(c => c.lane), ["player_runtime"]);
  for (const input of ["Let's go up to the observation room.", "Come on, we're going up to the observation room."]) {
    const r = await hall([create("campaign_character_t", "Tessa"), hold("campaign_character_t")], [[input, UP_NARRATION]]);
    assert.equal(r.at("campaign_character_t"), "test_room", input);
  }
  const two = await hall([create("campaign_character_t", "Tessa"), create("campaign_character_d", "Dara"), hold("campaign_character_t"), hold("campaign_character_d")], [[`Come with me. ${UP}`, UP_NARRATION]]);
  assert.deepEqual([two.at("campaign_character_t"), two.at("campaign_character_d")], ["test_hall", "test_hall"], "two held people: ambiguous");
  const free = await hall([create("campaign_character_t", "Tessa"), create("campaign_character_f", "Free"), hold("campaign_character_t")], [[`Come with me. ${UP}`, UP_NARRATION]]);
  assert.equal(free.at("campaign_character_t"), "test_hall", "a free person is present: ambiguous");
  const guard = await hall([create("campaign_character_t", "Tessa"), hold("campaign_character_t")], [["\"Which way to the stairs?\" I ask the guard.", "*The guard points at the stairs.*"], [`Come with me. ${UP}`, UP_NARRATION]]);
  assert.equal(guard.results[0]!.scene_participants?.after.length, 1, "the guard is a temporary participant here");
  assert.equal(guard.at("campaign_character_t"), "test_hall", "a temporary participant is present: ambiguous");
  const alone = await hall([create("campaign_character_t", "Tessa")], [[`Come with me. ${UP}`, UP_NARRATION]]);
  assert.equal(alone.at("campaign_character_t"), "test_hall", "not held: the player's words alone never move a free person");
  const stay = await hall([create("campaign_character_t", "Tessa"), hold("campaign_character_t")], [[`Wait here for me. ${UP}`, UP_NARRATION]]);
  assert.equal(stay.at("campaign_character_t"), "test_hall");
});

test("M15: an unnamed bought person shown only as Slave is escorted by \"Come with me\" under that label; no name or id reaches the Narrator note", async () => {
  const r = await hall(revision => [create("campaign_character_s", undefined, "test_hall", "Slave", revision), hold("campaign_character_s")], [[`Come with me. ${UP}`, UP_NARRATION]]);
  assert.equal(r.at("campaign_character_s"), "test_room");
  const note = r.prompt.split("\n").find(l => /NOT left behind/.test(l))!;
  assert.match(note, /Nicco leads Slave along with him/);
  assert.doesNotMatch(note, /campaign_character_s/);
  assert.equal(r.snapshot.characters.find(c => c.id === "campaign_character_s")?.profile.name, undefined, "no name is invented");
});

test("M12 / multiple followers: two held people named and led move together atomically; a free household member named and led moves only on a narrated follow of her", async () => {
  const both = await hall([create("campaign_character_t", "Tessa"), create("campaign_character_d", "Dara"), hold("campaign_character_t"), hold("campaign_character_d")],
    [[`Come on Tessa and Dara, let's go. ${UP}`, UP_NARRATION]]);
  assert.deepEqual([both.at(NICCO), both.at("campaign_character_t"), both.at("campaign_character_d")], ["test_room", "test_room", "test_room"]);
  assert.equal(both.snapshot.revision, both.results[0]!.base_revision + 1, "one revision for all three");
  const member = [create("campaign_character_b", "Bryn"), ...household("campaign_character_b")];
  const narrated = await hall(member, [[`Come on Bryn, let's go. ${UP}`, "*Nicco climbs the stairs. Bryn follows him up into the observation room.*"]]);
  assert.equal(narrated.at("campaign_character_b"), "test_room");
  assert.deepEqual(moves(narrated.results[0]!).map(c => c.lane), ["preferred_authorization"]);
  const silent = await hall(member, [[`Come on Bryn, let's go. ${UP}`, UP_NARRATION]]);
  assert.equal(silent.at("campaign_character_b"), "test_hall", "a free person's own following is evidenced by the narration, never by the player's words alone");
  // Held Tessa and free Bryn led together: Tessa by the escort, Bryn by the narrated follow of her, in the same batch.
  const mixed = await hall([create("campaign_character_t", "Tessa"), hold("campaign_character_t"), ...member],
    [[`Come on Tessa and Bryn, let's go. ${UP}`, "*Nicco climbs the stairs with Tessa. Bryn follows him up into the observation room.*"]]);
  assert.deepEqual([mixed.at("campaign_character_t"), mixed.at("campaign_character_b")], ["test_room", "test_room"]);
  assert.equal(mixed.snapshot.revision, mixed.results[0]!.base_revision + 1);
  // Known limit, fail closed: a plural narrated subject ("Tessa and Bryn follow him") is not read as Bryn's own follow; the held person still moves.
  const plural = await hall([create("campaign_character_t", "Tessa"), hold("campaign_character_t"), ...member],
    [[`Come on Tessa and Bryn, let's go. ${UP}`, "*Nicco climbs the stairs. Tessa and Bryn follow him up into the observation room.*"]]);
  assert.deepEqual([plural.at("campaign_character_t"), plural.at("campaign_character_b")], ["test_room", "test_hall"]);
});

test("M10b: a location claim at Nicco's arrival supports only a follower the player invited BY NAME this turn; anyone else stays and the claim is withdrawn", async () => {
  const member = [create("campaign_character_b", "Bryn"), ...household("campaign_character_b")];
  const claim = "*Nicco climbs the stairs to the observation room. Inside the Observation room, Bryn waits by the window.*";
  const invited = await hall(member, [[`Bryn, come with me. ${UP}`, claim]]);
  assert.equal(invited.at("campaign_character_b"), "test_room");
  const uninvited = await hall(member, [[UP, claim]]);
  assert.equal(uninvited.at("campaign_character_b"), "test_hall");
  assert.ok((uninvited.results[0]!.narration_reconciliation?.issues ?? []).some(i => i.kind === "uncommitted_movement" && i.character === "Bryn"));
  const held = await hall([create("campaign_character_t", "Tessa"), hold("campaign_character_t")],
    [[UP, "*Nicco climbs the stairs to the observation room. Inside the Observation room, Tessa waits by the window.*"]]);
  assert.equal(held.at("campaign_character_t"), "test_hall", "a held person nobody led is not moved by a claim");
});
