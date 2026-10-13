import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../../src/world/loader.js";
import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import { CampaignState } from "../../src/campaign/campaign-state.js";
import { identityNameFactId, learnCanonicalName } from "../../src/campaign/identity-knowledge.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSaveFile, decodeSave, serializeSave } from "../../src/persistence/save-format.js";
import { buildTurnContext } from "../../src/turn/context/context-builder.js";
import { SceneParticipants } from "../../src/turn/identity/scene-participants.js";
import { RecentConversation } from "../../src/turn/recent-conversation.js";
import { canonicalNameDisclosure, establishedCanonicalDisclosure } from "../../src/turn/identity/canonical-name-disclosure.js";
import { narratorIdentityGate } from "../../src/turn/identity/narrator-identity.js";
import { projectNarratorFocus } from "../../src/turn/context/narrator-focus.js";
import { prepareCommit } from "../../src/turn/stages/commit-preparation.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import { playerCharacterProjection } from "../../src/app/player-character-view.js";
import type { GenerationRequest } from "../../src/llm/types.js";
import type { TurnResult } from "../../src/turn/turn-types.js";
import { collect, metadata } from "../support/turn-fixtures.js";
import { P35_LIVE_INTRODUCTION } from "../fixtures/p35-live-introduction.js";

/**
 * Objective identity vs player-known identity. Replay finding: "walks up to the short compact man ... who am i talking with?" fits only
 * ONE present canonical actor on two traits, so the engine created a temporary person and the narrator gave him an invented personal name.
 * Fix under test: name-request-scoped exclusive resolution. Real data/ world, scripted offline narration. No model calls.
 */
const world = await loadWorld("data"), MARKET = "calderan_slave_market";
const WEAK_ENGAGE = "*walks up to the short compact man by the pens* hello, name's Nicco, who am i talking with ?";
const KORVIN_SCENE = "*In the back rows, a short, compact seller with large damaged hands, a hooked nose and small, perceptive eyes leans on a pen rail, watching Nicco come.*";
const intent = { candidates: [], runtime: [] };
let serial = 0;
const market = (location = MARKET) => { const c = createOpeningCampaign(world, `identity_objective_${++serial}`); c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: location } }] }); return c; };
const identityOf = (c: CampaignState, id: string) => narratorIdentityGate(buildTurnContext(world, c.exportSnapshot()))!.identities.get(id)!;
const created = (c: CampaignState) => c.exportSnapshot().characters.filter(x => x.origin.kind === "created");
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-11T12:00:00.000Z"), world), world).snapshot);

function coordinated(location = MARKET) {
  const campaign = market(location);
  let text = "", request: GenerationRequest | undefined;
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(r) { request = r; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const turn = async (input: string, narration = "*The market noise goes on.*") => {
    text = narration;
    const last = (await collect(co.runTurn({ campaign, player_input: input }))).at(-1)!;
    assert.equal(last.type, "turn_completed", JSON.stringify(last).slice(0, 300));
    const result = (last as { result: TurnResult }).result, prompt = request!.messages[0]!.content;
    return { result, plan: result.scene_participants!.plan, prompt, system: request!.system_prompt };
  };
  return { campaign, turn };
}

test("I1/I3: before any introduction the unknown canonical man stays masked to the player and in ordinary narration", async () => {
  const s = coordinated();
  await s.turn("*looks around the market*", KORVIN_SCENE);
  const t = await s.turn(WEAK_ENGAGE, "*The short man looks up from the rail.*");
  assert.equal(identityOf(s.campaign, "korvin").player_known_name, null);
  assert.equal(t.prompt.includes("Korvin"), false, "the canonical name never appears in the narrator context");
  assert.equal(JSON.stringify(t.result.narration ?? "").includes("Korvin"), false);
});
test("I2/I4/I8: the direct name question binds to the one canonical man by description; no temporary person is created", async () => {
  const s = coordinated();
  await s.turn("*looks around the market*", KORVIN_SCENE);
  const t = await s.turn(WEAK_ENGAGE, "*The short man looks up from the rail.*");
  assert.equal(t.plan.created, null, "no descriptor-only temporary participant");
  assert.equal(t.plan.focus, "korvin");
  assert.deepEqual(t.plan.participants, []);
  assert.equal(t.prompt.includes("[SCENE PARTICIPANTS]"), false);
  const ref = identityOf(s.campaign, "korvin").ref;
  assert.deepEqual([...t.prompt.matchAll(/^Character [^(]+\(([^)]+)\)/gm)].map(m => m[1]!).filter(id => id !== "nicco"), [ref], "objective identity is grounded: the canonical record is the one foreground character");
  assert.equal(created(s.campaign).length, 0, "no invented alias, no replacement identity");
});
test("I5: the canonical self-introduction capability is offered to the SAME entity, naming Korvin only inside the capability", async () => {
  const s = coordinated();
  await s.turn("*looks around the market*", KORVIN_SCENE);
  const t = await s.turn(WEAK_ENGAGE, "*The short man looks up from the rail.*");
  assert.match(t.system, /CONTROLLED SELF-DISCLOSURE/);
  assert.match(t.system, /"canonical_name_for_own_spoken_introduction_only":"Korvin"/);
});
test("I6/I7/I9/I10: a truthful introduction establishes the canonical name on the same id: knowledge updated, no duplicate, survives save/load", () => {
  const campaign = market(), participants = new SceneParticipants(), recent = new RecentConversation();
  const context = buildTurnContext(world, campaign.exportSnapshot()), scene = participants.plan(WEAK_ENGAGE, context);
  assert.equal(scene.created, null); assert.equal(scene.focus, "korvin");
  const focus = projectNarratorFocus(context, WEAK_ENGAGE, recent.forPrompt(), intent, scene);
  assert.equal(canonicalNameDisclosure(context, WEAK_ENGAGE, recent.forPrompt(), focus.foreground, intent, scene)?.internal_id, "korvin");
  assert.equal(establishedCanonicalDisclosure(context, WEAK_ENGAGE, recent.finalized(), P35_LIVE_INTRODUCTION, scene, intent), "korvin");
  const revision = campaign.revision, prepared = campaign.prepare({ expected_revision: revision, commands: [] });
  const plan = prepareCommit({ world, prepare: proposal => campaign.prepare(proposal), prepared, commands: [], finalized: recent.finalized(), player_input: WEAK_ENGAGE, delivered: P35_LIVE_INTRODUCTION, scene,
    base_revision: revision, disclosure_intent: intent, location_changed: false, on_skip(reason) { assert.fail(reason); } });
  assert.equal(identityOf(campaign, "korvin").player_known_name, null, "nothing is learned before the commit");
  campaign.commit(plan.receipt);
  for (const c of [campaign, roundTrip(campaign)]) {
    const gate = identityOf(c, "korvin");
    assert.equal(gate.player_known_name, "Korvin");
    const snapshot = c.exportSnapshot();
    assert.equal(snapshot.facts.filter(f => f.id === identityNameFactId("korvin")).length, 1, "one name fact");
    assert.equal(snapshot.knowledge.filter(k => k.character_id === "nicco" && k.fact_id === identityNameFactId("korvin") && k.status === "knows").length, 1);
    assert.equal(created(c).length, 0, "same id, no created duplicate or alias");
    assert.equal(snapshot.characters.filter(x => /korvin/i.test(x.profile.name ?? "")).length <= 1, true);
    for (const id of ["mistress_elara", "bartolomhew"]) assert.equal(identityOf(c, id).player_known_name, null, "other canonical people stay masked");
  }
});
test("I11: the player-facing card stays masked until the name is established; the canonical avatar route is opaque in both states", async t => {
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-identity-avatar-")); t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "Korvin_avatar.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
  const c = market();
  const project = () => playerCharacterProjection(world, c.exportSnapshot(), { canon_avatar_dir: dir }).project("korvin")!;
  const before = project();
  assert.equal(before.name_known, false); assert.notEqual(before.name, "Korvin");
  assert.equal(/korvin/i.test(JSON.stringify(before)), false, "no part of the unknown card carries the canonical name, id or file name");
  c.apply({ expected_revision: c.revision, commands: learnCanonicalName(world, c.exportSnapshot(), "korvin") });
  const after = project();
  assert.equal(after.name_known, true); assert.equal(after.name, "Korvin");
  assert.ok(after.avatar_url && !/korvin/i.test(after.avatar_url), "the route never carries the authored id or the file name");
});
test("I12: the exclusive rule is scoped: the same description without an identity request, an ambiguous description, or a place with no canonical candidate still create a temporary person", async () => {
  const noRequest = coordinated();
  await noRequest.turn("*looks around the market*", KORVIN_SCENE);
  assert.equal((await noRequest.turn("*walks up to the short compact man by the pens* Good day.", "*The man looks up.*")).plan.created, "scene_npc_1", "weak description alone never casts a canonical actor");
  const elsewhere = coordinated("gatherers_inn");
  await elsewhere.turn("*looks around the common room*", KORVIN_SCENE);
  const t = await elsewhere.turn(WEAK_ENGAGE, "*The man looks up.*");
  assert.equal(t.plan.created, "scene_npc_1", "Korvin is not present here: a genuinely new person may be created");
  assert.notEqual(t.plan.focus, "korvin");
  const generic = coordinated();
  await generic.turn("*looks around the market*", "*A man leans on a rail.*");
  assert.equal((await generic.turn("*walks up to the man* who are you?", "*The man looks up.*")).plan.created, "scene_npc_1", "one generic noun still casts nobody");
});
