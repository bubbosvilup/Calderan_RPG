import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { isNpcPlus } from "../src/campaign/premium-characters.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { heartstoneRiteEligibility } from "../src/campaign/heartstone-rite.js";
import { recognizedByHeartstone, stoneFeel } from "../src/campaign/heartstone-recognition.js";
import { CANON_AVATAR_ROUTE, canonAvatarToken } from "../src/app/canon-avatars.js";
import { playerCharacterProjection } from "../src/app/player-character-view.js";
import { playerRef } from "../src/app/player-visual-view.js";
import { GameSession, type SessionDeps } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { runScenario } from "../src/dev/controller-authorization-diagnostics.js";

/**
 * Explicit NPC+ promotion = the Heartstone household rite completed by the PLAYER. The rite is roleplayed in fiction; the only mechanical
 * authority is the explicit confirmation (GameSession.completeHeartstoneRite). Offline: no provider is called.
 */
const world = await loadWorld("data");
const LR = "heartstone_lr", MARKET = "calderan_slave_market";
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
let serial = 0;
const idOf = (name: string) => `campaign_character_${name.toLowerCase()}`;

function person(name: string, where: string, status: "active" | "inactive" | "dead" = "active"): CampaignCommand {
  return { kind: "register_character", character: { id: idOf(name), origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 26 }, appearance: { description: `${name} has a weathered face and a patient manner.` } },
    current: { current_location: where, status } } };
}
/** An opening campaign in Heartstone with Brenna (inside), Sovela (outside), Dara (inactive), Tomas (dead) and the canonical Korvin as a campaign record inside. */
function campaign(extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `explicit_rite_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }, person("Brenna", LR), person("Sovela", MARKET), person("Dara", LR, "inactive"), person("Tomas", LR, "dead"),
    { kind: "register_character", character: { id: "korvin", origin: { kind: "canonical", canonical_entity_id: "korvin" }, profile: {}, current: { status: "active" } } },
    { kind: "move_character", character_id: "korvin", location_id: LR }, ...extra] });
  const known = learnCanonicalName(world, c.exportSnapshot(), "korvin"); // Nicco knows Korvin by name (a named canon NPC shows his authored portrait)
  if (known.length) c.apply({ expected_revision: c.revision, commands: known });
  return c;
}
async function session(c: CampaignState, onTurn?: () => void) {
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-explicit-rite-")); dirs.push(dir);
  const repository = new FileCampaignRepository(world, dir);
  await repository.saveCampaign(c);
  const deps: SessionDeps = { world, repository, createCoordinator: () => ({ async *runTurn() { onTurn?.(); } }) };
  const loaded = await GameSession.loadCampaign(deps, c.exportSnapshot().campaign_id); assert.ok(loaded.ok);
  return { session: loaded.session, deps, id: c.exportSnapshot().campaign_id };
}
const cards = (s: GameSession) => [...s.getPlayUiView().participants.flatMap(p => p.card ? [p.card] : []), ...s.getPlayUiView().household.flatMap(h => h.members)];
const cardOf = (s: GameSession, name: string) => { const card = cards(s).find(x => x.name === name); assert.ok(card, `card ${name}`); return card!; };
const revision = (s: GameSession) => s.getView().session.revision;
const members = (snap: ReturnType<CampaignState["exportSnapshot"]>) => snap.households.find(h => h.id === OPENING_HOUSEHOLD)!.members.filter(m => m.status === "member" && m.role !== "owner").map(m => m.character_id);
/** Everything except household membership, the premium record and the revision/journal stamps. */
const untouched = (snap: ReturnType<CampaignState["exportSnapshot"]>) => JSON.stringify({ characters: snap.characters, items: snap.items, relationships: snap.relationships, knowledge: snap.knowledge, facts: snap.facts, goals: snap.goals,
  funds: snap.funds, legal: snap.legal_statuses, transactions: snap.transactions, runtime: snap.runtime });

// ------------------------------------------------------------------------------------------------ capability (P1-P7)
test("P1/P7: a campaign NPC inside Heartstone has the promotion capability; the read model carries a reason-free flag", async () => {
  const { session: s } = await session(campaign());
  const caps = cardOf(s, "Brenna").character_capabilities;
  assert.equal(caps.tier, "campaign_npc");
  assert.deepEqual([caps.can_promote_to_npc_plus, caps.promotion_unavailable_reason], [true, null]);
  assert.equal(caps.can_edit_npc_plus, false, "no NPC+ tools before the rite");
});
test("P2: a world/canon NPC without a campaign record has no promotion capability and is refused; one WITH a campaign record follows the same rule as any campaign NPC", async () => {
  const c = campaign(), projection = playerCharacterProjection(world, c.exportSnapshot());
  const mira = projection.project("mira_thorne")!;
  assert.equal(mira.character_capabilities.tier, "world_canon");
  assert.deepEqual([mira.character_capabilities.can_promote_to_npc_plus, mira.character_capabilities.promotion_unavailable_reason], [false, null]);
  assert.equal(heartstoneRiteEligibility(world, c.exportSnapshot(), "mira_thorne").ok, false);
  const { session: s } = await session(c);
  const refused = s.completeHeartstoneRite({ ref: mira.ref, expected_revision: revision(s) });
  assert.ok(!refused.ok && refused.reason === "character_not_found" || !refused.ok && refused.reason === "not_campaign_npc");
  const korvin = cardOf(s, "Korvin");
  assert.equal(korvin.character_capabilities.tier, "campaign_npc"); assert.equal(korvin.character_capabilities.can_promote_to_npc_plus, true);
});
test("P3: the Player Character can never be promoted", async () => {
  const c = campaign(), snap = c.exportSnapshot();
  const eligibility = heartstoneRiteEligibility(world, snap, "nicco");
  assert.ok(!eligibility.ok && eligibility.code === "not_campaign_npc");
  const { session: s } = await session(c), before = revision(s);
  const refused = s.completeHeartstoneRite({ ref: playerRef(snap.campaign_id, "nicco"), expected_revision: before });
  assert.ok(!refused.ok); assert.equal(revision(s), before);
  assert.equal(s.getPlayerProfileView()!.visual!.capabilities.can_promote_to_npc_plus, false);
});
test("P4/P13: an existing NPC+ has no promotion capability and a second attempt is refused with no revision, record or member added", async () => {
  const { session: s } = await session(campaign());
  const ref = cardOf(s, "Brenna").ref;
  assert.ok(s.completeHeartstoneRite({ ref, expected_revision: revision(s) }).ok);
  const again = cardOf(s, "Brenna"), before = revision(s);
  assert.equal(again.character_capabilities.tier, "npc_plus");
  assert.deepEqual([again.character_capabilities.can_promote_to_npc_plus, again.character_capabilities.promotion_unavailable_reason], [false, null]);
  const second = s.completeHeartstoneRite({ ref, expected_revision: before });
  assert.ok(!second.ok && second.reason === "already_npc_plus");
  assert.equal(second.error.code, "invalid_input"); assert.doesNotMatch(second.error.message, /campaign_character|korvin_id/);
  assert.equal(revision(s), before, "no revision for a semantic no-op");
});
test("P5: an inactive or dead character is not promotable (capability false with a stated reason; the action is refused)", async () => {
  const { session: s } = await session(campaign());
  for (const name of ["Dara", "Tomas"]) {
    const card = cards(s).find(x => x.name === name);
    if (!card) continue; // a dead/inactive character may not be projected at all: then there is nothing to click
    assert.equal(card.character_capabilities.can_promote_to_npc_plus, false, name);
    assert.match(card.character_capabilities.promotion_unavailable_reason ?? "", /no longer active/);
    const before = revision(s), refused = s.completeHeartstoneRite({ ref: card.ref, expected_revision: before });
    assert.ok(!refused.ok && refused.reason === "not_active", name); assert.equal(revision(s), before);
  }
  const snap = campaign().exportSnapshot();
  for (const name of ["Dara", "Tomas"]) { const e = heartstoneRiteEligibility(world, snap, idOf(name)); assert.ok(!e.ok && e.code === "not_active", name); }
});
test("P6: a campaign NPC outside Heartstone is not promotable and the action is refused with no state change", async () => {
  const c = campaign(), snap = c.exportSnapshot();
  const e = heartstoneRiteEligibility(world, snap, idOf("Sovela"));
  assert.ok(!e.ok && e.code === "not_at_heartstone" && /inside Heartstone/.test(e.reason));
  const { session: s } = await session(c), card = playerCharacterProjection(world, c.exportSnapshot()).project(idOf("Sovela"))!;
  assert.deepEqual([card.character_capabilities.can_promote_to_npc_plus, card.character_capabilities.promotion_unavailable_reason], [false, e.reason]);
  const before = revision(s), refused = s.completeHeartstoneRite({ ref: card.ref, expected_revision: before });
  assert.ok(!refused.ok && refused.reason === "not_at_heartstone"); assert.equal(revision(s), before);
});
test("eligibility also refuses an unavailable Heartstone household and a player who is not its Keeper (no prose is read)", () => {
  const c = campaign(), snap = structuredClone(c.exportSnapshot()) as { households: { id: string; members: { character_id: string; role?: string }[] }[] } & ReturnType<CampaignState["exportSnapshot"]>;
  const none = { ...snap, households: [] } as unknown as typeof snap;
  const a = heartstoneRiteEligibility(world, none, idOf("Brenna")); assert.ok(!a.ok && a.code === "household_unavailable");
  const notKeeper = { ...snap, households: snap.households.map(h => ({ ...h, members: h.members.map(m => m.character_id === "nicco" ? { ...m, role: "member" } : m) })) } as unknown as typeof snap;
  const b = heartstoneRiteEligibility(world, notKeeper, idOf("Brenna")); assert.ok(!b.ok && b.code === "not_keeper");
  const m = heartstoneRiteEligibility(world, snap, "campaign_character_nobody"); assert.ok(!m.ok && m.code === "character_not_found");
});

// ------------------------------------------------------------------------------------------------ the action (P8-P20)
test("P8/P9/P10/P12/P14/P19: the explicit action adds membership AND NPC+ in exactly one revision, keeps the same character, and touches nothing else", async () => {
  const c = campaign(), { session: s, deps, id } = await session(c);
  const before = (await deps.repository.loadCampaign(id)).campaign.exportSnapshot(), card = cardOf(s, "Brenna"), rev = revision(s);
  const outcome = s.completeHeartstoneRite({ ref: card.ref, expected_revision: rev });
  assert.ok(outcome.ok && outcome.changed);
  assert.equal(revision(s), rev + 1, "one revision");
  await s.save();
  const after = (await deps.repository.loadCampaign(id)).campaign.exportSnapshot();
  assert.deepEqual(members(after), [idOf("Brenna")]); assert.equal(members(before).length, 0);
  assert.equal(isNpcPlus(after, idOf("Brenna")), true); assert.equal(after.premium_characters.filter(p => p.character_id === idOf("Brenna")).length, 1);
  assert.equal(after.premium_characters.find(p => p.character_id === idOf("Brenna"))!.metadata.active_household_member, true);
  assert.equal(after.characters.filter(x => x.id === idOf("Brenna")).length, 1, "same record, never cloned");
  assert.equal(untouched(after), untouched(before), "appearance, location, relationships, knowledge, items, funds and legal state are unchanged");
  assert.equal(cardOf(s, "Brenna").ref, card.ref, "same identity ref");
  assert.equal(after.revision, before.revision + 1);
});
test("P11: a refused request (stale revision, ineligible, unknown) creates neither membership nor promotion and costs no revision", async () => {
  const { session: s } = await session(campaign()), ref = cardOf(s, "Brenna").ref, rev = revision(s);
  const stale = s.completeHeartstoneRite({ ref, expected_revision: rev - 1 });
  assert.ok(!stale.ok && stale.error.code === "stale_turn");
  const bad = s.completeHeartstoneRite({ ref: "not-a-ref", expected_revision: rev }); assert.ok(!bad.ok && bad.error.code === "invalid_input");
  const wrong = s.completeHeartstoneRite({ ref, expected_revision: "1" }); assert.ok(!wrong.ok && wrong.error.code === "stale_turn");
  assert.equal(revision(s), rev);
  assert.equal(cardOf(s, "Brenna").character_capabilities.tier, "campaign_npc");
  assert.equal(s.getView().promoted.length, 0);
});
test("P15: a canonical NPC with a campaign record promotes as the same identity and keeps its authored avatar as the fallback; a selected NPC+ Avatar still wins", async () => {
  const c = campaign(), { session: s } = await session(c);
  const before = cardOf(s, "Korvin"), authored = `${CANON_AVATAR_ROUTE}${canonAvatarToken("korvin")}`;
  assert.equal(before.avatar_url, authored);
  assert.ok(s.completeHeartstoneRite({ ref: before.ref, expected_revision: revision(s) }).ok);
  const after = cardOf(s, "Korvin");
  assert.deepEqual([after.ref, after.character_capabilities.tier, after.avatar_url], [before.ref, "npc_plus", authored]);
  assert.equal(s.getView().promoted.filter(p => p.name === "Korvin").length, 1, "no second Korvin");
});
test("P16/P18: NPC+ capabilities appear on the next projection and recognition warmth derives from the new membership (nothing stored)", async () => {
  const c = campaign(), { session: s, deps, id } = await session(c), snap0 = c.exportSnapshot();
  assert.equal(recognizedByHeartstone(snap0, idOf("Brenna")), false); assert.equal(stoneFeel(snap0, world, idOf("Brenna"), LR, "bare_skin"), "ordinary_stone");
  const card = cardOf(s, "Brenna");
  assert.deepEqual([card.character_capabilities.can_edit_npc_plus, card.character_capabilities.can_generate_avatar, card.character_capabilities.can_show_gallery, card.appearance_editor === null], [false, false, false, true]);
  assert.ok(s.completeHeartstoneRite({ ref: card.ref, expected_revision: revision(s) }).ok);
  const npcPlus = cardOf(s, "Brenna");
  assert.deepEqual([npcPlus.character_capabilities.tier, npcPlus.character_capabilities.can_edit_npc_plus, npcPlus.character_capabilities.can_generate_avatar, npcPlus.character_capabilities.can_show_full_body,
    npcPlus.character_capabilities.can_show_gallery, npcPlus.character_capabilities.can_edit_appearance, npcPlus.appearance_editor !== null, npcPlus.household, npcPlus.npc_plus], ["npc_plus", true, true, true, true, true, true, true, true]);
  assert.equal(npcPlus.character_capabilities.can_promote_to_npc_plus, false);
  await s.save();
  const snap = (await deps.repository.loadCampaign(id)).campaign.exportSnapshot();
  assert.equal(recognizedByHeartstone(snap, idOf("Brenna")), true); assert.equal(stoneFeel(snap, world, idOf("Brenna"), LR, "bare_skin"), "gentle_warmth");
  assert.ok(!/warm_floor|stone_warm|rite_completed/i.test(JSON.stringify(snap)), "no extra rite or warmth state");
});
test("P17: save then load preserves membership, NPC+ promotion, the same character and its capability tier; the save schema is unchanged", async () => {
  const c = campaign(), { session: s, deps, id } = await session(c);
  const ref = cardOf(s, "Brenna").ref;
  assert.ok(s.completeHeartstoneRite({ ref, expected_revision: revision(s) }).ok);
  await s.save();
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok);
  const card = cardOf(loaded.session, "Brenna");
  assert.deepEqual([card.ref, card.character_capabilities.tier, card.household, card.npc_plus, card.character_capabilities.can_promote_to_npc_plus], [ref, "npc_plus", true, true, false]);
  const snap = (await deps.repository.loadCampaign(id)).campaign.exportSnapshot();
  assert.equal(snap.schema_version, 7, "snapshot schema is unchanged (no rite field was added)");
  assert.ok(!/rite/i.test(JSON.stringify(snap.premium_characters)) && !/rite/i.test(JSON.stringify(snap.households)));
});
test("P20: the action needs no Narrator or Controller call (the coordinator is never invoked)", async () => {
  let turns = 0;
  const { session: s } = await session(campaign(), () => { turns++; });
  assert.ok(s.completeHeartstoneRite({ ref: cardOf(s, "Brenna").ref, expected_revision: revision(s) }).ok);
  assert.equal(turns, 0);
});

// ------------------------------------------------------------------------------------------------ the old authority is gone
const FULL_OATH = (n: string) => `"I, ${n}, choose to stay and become a member of the Heartstone. I swear to be loyal to and protect my family, and to stand faithfully beside the Keeper."`;
const PERFECT_RITE = (n: string) => `${n} stands barefoot, her bare feet flat on the stone of the floor. ${FULL_OATH(n)}\n\nNicco accepts the oath. "I accept you as a member of the Heartstone."`;
test("automatic-rite negative: a PERFECT canonical rite in the narration, with the Controller proposing the join, changes nothing without the explicit action", async () => {
  const c = campaign(), before = c.revision, snapBefore = JSON.stringify(c.exportSnapshot());
  const run = await runScenario({ id: "auto", title: "auto", input: "*waits for her answer*", narration: PERFECT_RITE("Brenna"), fixture: () => ({ world, campaign: c } as unknown as ReturnType<typeof turnFixture>),
    controller: { kind: "commands", commands: [{ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: idOf("Brenna") }], evidence: ["I, Brenna, choose to stay and become a member of the Heartstone."] } });
  assert.notEqual(run.diagnostic.verdict, "committed");
  assert.equal(c.revision, before, "no revision");
  assert.deepEqual(members(c.exportSnapshot()), []); assert.equal(isNpcPlus(c.exportSnapshot(), idOf("Brenna")), false);
  assert.equal(JSON.stringify(c.exportSnapshot()), snapBefore);
  assert.ok(run.diagnostic.rejected?.some(r => r.reason === "rejected_command_not_allowed"), JSON.stringify(run.diagnostic.rejected));
});
test("automatic-rite negative: the same perfect rite with an idle Controller also changes nothing", async () => {
  const c = campaign(), before = c.revision;
  await runScenario({ id: "auto2", title: "auto2", input: "*waits for her answer*", narration: PERFECT_RITE("Brenna"), fixture: () => ({ world, campaign: c } as unknown as ReturnType<typeof turnFixture>), controller: { kind: "none" } });
  assert.equal(c.revision <= before + 1, true); // a turn may record scene facts, never household or premium state
  assert.deepEqual(members(c.exportSnapshot()), []); assert.equal(c.exportSnapshot().premium_characters.length, 0);
});
test("the same explicit action works with NO rite prose at all (the player confirmation is the authority)", async () => {
  const c = campaign(), snap = c.exportSnapshot();
  assert.equal(heartstoneRiteEligibility(world, snap, idOf("Brenna")).ok, true);
  const { session: s } = await session(c);
  assert.ok(s.completeHeartstoneRite({ ref: cardOf(s, "Brenna").ref, expected_revision: revision(s) }).ok);
  assert.deepEqual(s.getView().promoted.map(p => [p.name, p.household_member]), [["Brenna", true]]);
});
test("promotion is distinct from membership: a promoted character who leaves the household stays NPC+ and cannot be promoted again", async () => {
  const c = campaign(), { session: s, deps, id } = await session(c);
  const ref = cardOf(s, "Brenna").ref;
  assert.ok(s.completeHeartstoneRite({ ref, expected_revision: revision(s) }).ok);
  await s.save();
  const repo = (await deps.repository.loadCampaign(id)).campaign;
  repo.apply({ expected_revision: repo.revision, commands: [{ kind: "leave_household", household_id: OPENING_HOUSEHOLD, character_id: idOf("Brenna") }] });
  const snap = repo.exportSnapshot();
  assert.deepEqual(members(snap), []); assert.equal(isNpcPlus(snap, idOf("Brenna")), true);
  const e = heartstoneRiteEligibility(world, snap, idOf("Brenna")); assert.ok(!e.ok && e.code === "already_npc_plus");
});

// ------------------------------------------------------------------------------------------------ server route (opaque ref + revision only)
test("POST /api/npc-plus/promote: ok with the refreshed state, 409 for a stale revision, 422 for an ineligible character, no technical ids in messages", async t => {
  const { session: s } = await session(campaign());
  const server = createPlaytestServer(s); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (body: unknown) => { const r = await fetch(`${base}/api/npc-plus/promote`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(body) }); return { status: r.status, data: await r.json() as Record<string, any> }; };
  const brenna = cardOf(s, "Brenna").ref;
  const rev = revision(s);
  const stale = await post({ ref: brenna, expected_revision: rev - 1 }); assert.equal(stale.status, 409); assert.equal(stale.data.ok, false);
  const ok = await post({ ref: brenna, expected_revision: rev }); assert.equal(ok.status, 200); assert.equal(ok.data.ok, true); assert.equal(ok.data.revision, rev + 1);
  const card = ok.data.play.participants.find((p: any) => p.card?.name === "Brenna").card;
  assert.equal(card.character_capabilities.tier, "npc_plus");
  const again = await post({ ref: brenna, expected_revision: rev + 1 }); assert.equal(again.status, 422); assert.match(again.data.error.message, /already NPC\+/);
  assert.doesNotMatch(JSON.stringify(again.data.error), /campaign_character|campaign_household/);
});
