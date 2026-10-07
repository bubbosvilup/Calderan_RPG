import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../src/world/loader.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import { buildPromotedCharacter } from "../src/campaign/promotion.js";
import { applyAppearancePatch, resolvePermanentAppearance } from "../src/campaign/permanent-appearance.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { establishNames } from "../src/turn/name-establishment.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { GameSession, type SessionDeps } from "../src/app/index.js";
import { playerCharacterProjection } from "../src/app/player-character-view.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { mockController, mockNarrator } from "./turn-fixtures.js";

/** Permanent Appearance V1: one resolver over canon/origin prose + CharacterProfile.appearance, and the narrow managed editor save. */
const world = await loadWorld("data");
const LR = "heartstone_lr";
const dirs: string[] = [];
test.after(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });
let serial = 0;

// ------------------------------------------------------------------------------------------------ resolver contract
test("canonical baseline prose + profile override, field by field; clearing restores the baseline; canon is untouched", () => {
  const canonBefore = structuredClone(world.getEntity("mira_thorne"));
  const c = new CampaignState(world, `appearance_${++serial}`, { player_location: "mudlarks_herbs", world_time: { world_minute: 600 } });
  const base = resolvePermanentAppearance(world, c.exportSnapshot(), "mira_thorne", { canonical: true, overrides: true });
  assert.deepEqual(base.values, {}, "authored prose is never parsed into structured values");
  assert.equal(base.baseline[0]?.source, "canonical");
  assert.match(base.description[0]!, /copper-brown hair/);
  assert.equal(base.identity.species, "Human");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: { id: "mira_thorne", origin: { kind: "canonical", canonical_entity_id: "mira_thorne" }, profile: { appearance: { hair: { color: "white" } } }, current: {} } }] });
  const over = resolvePermanentAppearance(world, c.exportSnapshot(), "mira_thorne", { canonical: true, overrides: true });
  assert.deepEqual([over.values.hair_color, over.description], ["white", base.description], "a structured override does not replace the baseline prose");
  const cleared = applyAppearancePatch(c.exportSnapshot().characters.find(x => x.id === "mira_thorne")!.profile.appearance, { hair_color: null });
  assert.ok(cleared.ok && cleared.changed && cleared.appearance === undefined, "clearing the only override removes the appearance object");
  assert.deepEqual(world.getEntity("mira_thorne"), canonBefore);
  // Without overrides (an unmanaged reader), the same record resolves to the baseline only.
  assert.deepEqual(resolvePermanentAppearance(world, c.exportSnapshot(), "mira_thorne", { canonical: true }).values, {});
});

test("created origin evidence + profile override; the promotion-time copy is baseline, not an override; conditions excluded", () => {
  const c = new CampaignState(world, `appearance_${++serial}`, { player_location: LR, world_time: { world_minute: 600 } });
  const woman = buildPromotedCharacter({ label: "the woman", established: { sex: "female", descriptor: "woman", appearance: ["tall", "copper-brown hair"], condition: ["feverish"] }, evidence: [], location_id: LR,
    trigger: "purchase_unnamed_subject", promoted_revision: c.revision + 1, world_minute: 600 });
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: woman }] });
  assert.equal(woman.profile.appearance?.description, "tall; copper-brown hair");
  const r = resolvePermanentAppearance(world, c.exportSnapshot(), woman.id, { canonical: true, overrides: true });
  assert.deepEqual([r.values, r.description, r.identity.sex], [{}, ["tall", "copper-brown hair"], "female"]);
  assert.doesNotMatch(JSON.stringify(r), /feverish/);
  const patched = applyAppearancePatch(woman.profile.appearance, { build: "athletic" });
  assert.ok(patched.ok);
  assert.deepEqual(patched.appearance, { description: "tall; copper-brown hair", build: "athletic" }, "no backfill: only the changed field is added");
});

test("patch semantics: omitted unchanged, null clears, values set; invalid input is rejected without partial writes", () => {
  const current = { build: "lean", hair: { color: "black", texture: "wavy" }, scars: [{ location: "left hand", description: "old burn" }] };
  const ok = applyAppearancePatch(current, { hair_color: null, eyes: "  grey   green ", height_cm: 180, distinctive_traits: ["Walks with a slight limp", "Hums while working"] });
  assert.ok(ok.ok && ok.changed);
  assert.deepEqual(ok.appearance, { build: "lean", hair: { texture: "wavy" }, scars: [{ location: "left hand", description: "old burn" }], eyes: "grey green", height_cm: 180, distinctive_traits: ["Walks with a slight limp", "Hums while working"] });
  assert.deepEqual(applyAppearancePatch(current, { build: "lean" }), { ok: true, appearance: current, changed: false });
  for (const patch of [{}, { build: "   " }, { build: "" }, { height_cm: -5 }, { height_cm: 180.5 }, { weight_kg: 0 }, { height_cm: "180" }, { scars: [] }, { scars: ["a", "A"] }, { scars: "a scar" },
    { distinguishing_marks: ["x".repeat(201)] }, { name: "Other" }, { appearance: {} }, { usual_attire: "a cloak" }, null, [], "build"]) {
    const result = applyAppearancePatch(current, patch);
    assert.equal(result.ok, false, JSON.stringify(patch));
  }
});

// ------------------------------------------------------------------------------------------------ managed editor: Mira
const LATE = [
  { player: "*carries her to the sofa*", narration: "*The woman lies on the sofa, burning with fever.*", status: "finalized" as const, location_id: LR },
  { player: "name's nicco, i'm the keeper of the heartstone, what about you?", narration: "*Her eyes stay half-open, fixed on his face. Her fingers press flat against the cushion.*\n\nMira.\n\n*She says it without ceremony.*", status: "finalized" as const, location_id: LR },
];
async function miraSession() {
  const id = `appearance_mira_${++serial}`;
  const c = createOpeningCampaign(world, id);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }] });
  const minute = c.exportSnapshot().runtime.scene.world_time.world_minute;
  const woman = buildPromotedCharacter({ label: "the woman", established: { sex: "female", descriptor: "woman", appearance: ["tall and gaunt"], condition: ["feverish"] }, evidence: ["The woman lies in the cage."],
    location_id: LR, trigger: "purchase_unnamed_subject", promoted_revision: c.revision + 1, world_minute: minute });
  const plain = buildPromotedCharacter({ label: "Sovela", established: { name: "Sovela" }, evidence: [], location_id: LR, trigger: "name_established", promoted_revision: c.revision + 1, world_minute: minute });
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: woman }, { kind: "register_character", character: plain }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: woman.id }] });
  const named = establishNames(LATE, buildTurnContext(world, c.exportSnapshot()), world, c.exportSnapshot(), [], c.revision);
  c.apply({ expected_revision: c.revision, commands: [...named.commands] as CampaignCommand[] });
  const dir = await mkdtemp(join(tmpdir(), "caldrevan-appearance-")); dirs.push(dir);
  const repository = new FileCampaignRepository(world, dir);
  await repository.saveCampaign(c);
  const service = new RetrievalService(world);
  const deps: SessionDeps = { world, repository, createCoordinator: () => new TurnCoordinator(world, mockNarrator("*Nothing changes.*"), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false }) };
  const loaded = await GameSession.loadCampaign(deps, id); assert.ok(loaded.ok);
  return { session: loaded.session, deps, id, woman: woman.id, plain: plain.id };
}
const cardOf = (session: GameSession, ref: string) => session.getPlayUiView().household.flatMap(h => h.members).find(m => m.ref === ref);

test("Mira: open shows resolved appearance with nothing stored; a narrow save changes only appearance and propagates everywhere", async () => {
  const { session, deps, id, woman } = await miraSession();
  const before = session.getPlayUiView().household.flatMap(h => h.members).find(m => m.name === "Mira")!;
  assert.ok(before, "header says Mira (late-named), not the woman");
  assert.deepEqual([before.name_known, before.appearance_editor_eligible, before.npc_plus], [true, true, true]);
  const editor = before.appearance_editor!;
  assert.ok(editor.fields.every(f => f.override === null), "nothing is stored as an override yet (the promotion copy is inherited)");
  assert.equal(editor.fields.find(f => f.key === "description")!.inherited, "tall and gaunt");
  assert.ok(editor.identity.some(i => i.label === "Sex" && i.value === "female"));
  assert.doesNotMatch(JSON.stringify(editor), /name_source|self_disclosed|campaign_character|origin|private|feverish|purchase/);
  const revision = session.getView().session.revision;
  const recordBefore = (await deps.repository.loadCampaign(id)).campaign.exportSnapshot();

  const saved = session.updateNpcAppearance({ ref: before.ref, expected_revision: revision, patch: { build: "athletic", hair_description: "shoulder-length dark hair", scars: ["A thin scar across the left palm"] } });
  assert.ok(saved.ok && saved.changed, JSON.stringify(saved));
  assert.equal(session.getView().session.revision, revision + 1);
  const after = cardOf(session, before.ref)!;
  assert.deepEqual([after.name, after.ref, after.name_known], ["Mira", before.ref, true]);
  assert.match(after.appearance, /Build: athletic/); assert.match(after.appearance, /Hair: shoulder-length dark hair/); assert.match(after.appearance, /tall and gaunt/);
  const fields = Object.fromEntries(after.appearance_editor!.fields.map(f => [f.key, f.override]));
  assert.deepEqual([fields.build, fields.hair_description, fields.scars, fields.eyes, fields.description], ["athletic", "shoulder-length dark hair", "A thin scar across the left palm", null, null]);

  // State: only the appearance changed, with no backfill; name, provenance, origin, household and NPC+ untouched.
  await session.save();
  const reloaded = (await deps.repository.loadCampaign(id)).campaign.exportSnapshot();
  const r0 = recordBefore.characters.find(c => c.id === woman)!, r1 = reloaded.characters.find(c => c.id === woman)!;
  assert.deepEqual(r1.profile.appearance, { description: "tall and gaunt", build: "athletic", hair: { description: "shoulder-length dark hair" }, scars: [{ description: "A thin scar across the left palm" }] });
  const { appearance: _a, ...restAfter } = r1.profile, { appearance: _b, ...restBefore } = r0.profile;
  assert.deepEqual(restAfter, restBefore);
  assert.deepEqual([r1.profile.name, r1.profile.name_source], ["Mira", "self_disclosed"]);
  assert.deepEqual([r1.origin_snapshot, r1.current, r1.id], [r0.origin_snapshot, r0.current, r0.id]);
  assert.deepEqual([reloaded.households, reloaded.premium_characters, reloaded.relationships, reloaded.legal_statuses], [recordBefore.households, recordBefore.premium_characters, recordBefore.relationships, recordBefore.legal_statuses]);

  // Narrator: the same resolved contract, one block.
  const context = buildTurnContext(world, reloaded);
  const prompt = JSON.stringify(buildNarratorPrompt("Hello.", context, [], {}, { candidates: [], runtime: [] }));
  const line = prompt.split("\\n").find(l => l.startsWith("Character Mira ("))!;
  assert.match(line, /permanent_appearance/); assert.match(line, /athletic/); assert.match(line, /tall and gaunt/);
  assert.doesNotMatch(line, /\\"appearance\\":\{/, "no raw profile appearance block beside the resolved one");

  // Reload through the session: the editor reopens with the saved values.
  const again = await GameSession.loadCampaign(deps, id); assert.ok(again.ok);
  assert.equal(cardOf(again.session, before.ref)!.appearance_editor!.fields.find(f => f.key === "build")!.override, "athletic");
  // Repeating the same values is a no-op: no commit.
  const rev = again.session.getView().session.revision;
  const same = again.session.updateNpcAppearance({ ref: before.ref, expected_revision: rev, patch: { build: "athletic" } });
  assert.ok(same.ok && !same.changed); assert.equal(again.session.getView().session.revision, rev);
  // Clearing an override returns that field to unestablished; the baseline prose stays.
  const clear = again.session.updateNpcAppearance({ ref: before.ref, expected_revision: rev, patch: { build: null } });
  assert.ok(clear.ok && clear.changed);
  const cleared = cardOf(again.session, before.ref)!;
  assert.equal(cleared.appearance_editor!.fields.find(f => f.key === "build")!.override, null);
  assert.doesNotMatch(cleared.appearance, /athletic/); assert.match(cleared.appearance, /tall and gaunt/);
});

test("stale revision is rejected with no write; unknown, forged and ineligible targets are rejected with no mutation", async () => {
  const { session, deps, id, plain } = await miraSession();
  const mira = session.getPlayUiView().household.flatMap(h => h.members).find(m => m.name === "Mira")!;
  const opened = session.getView().session.revision;
  const moved = session.overridePlayerLocation({ target: "heartstone_square", expected_revision: opened });
  assert.ok(moved.ok, JSON.stringify(moved));
  const stale = session.updateNpcAppearance({ ref: mira.ref, expected_revision: opened, patch: { build: "athletic" } });
  assert.ok(!stale.ok); assert.equal(stale.error.code, "stale_turn");
  assert.equal(cardOf(session, mira.ref)!.appearance_editor!.fields.find(f => f.key === "build")!.override, null);
  const now = session.getView().session.revision;
  assert.equal(now, opened + 1);

  const snapshot = (await deps.repository.loadCampaign(id)).campaign.exportSnapshot();
  const refOf = (cid: string) => playerCharacterProjection(world, snapshot).project(cid)!.ref;
  for (const [ref, why] of [[refOf("nicco"), "Nicco"], [refOf(plain), "ordinary Campaign Character"], ["0".repeat(24), "unknown ref"], ["not-a-ref", "forged ref"], [42, "non-string ref"]] as const) {
    const result = session.updateNpcAppearance({ ref, expected_revision: now, patch: { build: "athletic" } });
    assert.ok(!result.ok, why); assert.equal(result.error.code, "invalid_input", why);
  }
  for (const patch of [{ build: "   " }, { usual_attire: "a cloak" }, { name: "Other" }, { height_cm: -1 }]) {
    const result = session.updateNpcAppearance({ ref: mira.ref, expected_revision: now, patch });
    assert.ok(!result.ok, JSON.stringify(patch)); assert.equal(result.error.code, "invalid_input");
  }
  assert.equal(session.getView().session.revision, now, "no rejected request committed anything");
});

test("HTTP route: /api/appearance saves (200), refuses a stale revision (409) and an ineligible ref (422); the state carries no private fields", async () => {
  const { session } = await miraSession();
  const server = createPlaytestServer(session);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const port = (server.address() as AddressInfo).port, url = `http://127.0.0.1:${port}`;
    const state = await (await fetch(`${url}/api/session`)).json();
    const mira = state.play.household.flatMap((h: any) => h.members).find((m: any) => m.name === "Mira");
    assert.doesNotMatch(JSON.stringify(state), /name_source|self_disclosed|private_notes|origin_snapshot|purchase_unnamed_subject/);
    const post = (body: unknown) => fetch(`${url}/api/appearance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const ok = await post({ ref: mira.ref, expected_revision: state.revision, patch: { build: "athletic" } });
    assert.equal(ok.status, 200); const saved = await ok.json();
    assert.equal(saved.revision, state.revision + 1);
    assert.equal(saved.play.household.flatMap((h: any) => h.members).find((m: any) => m.ref === mira.ref).appearance_editor.fields.find((f: any) => f.key === "build").override, "athletic");
    assert.equal((await post({ ref: mira.ref, expected_revision: state.revision, patch: { build: "lean" } })).status, 409);
    assert.equal((await post({ ref: "0".repeat(24), expected_revision: saved.revision, patch: { build: "lean" } })).status, 422);
    assert.equal((await (await fetch(`${url}/api/session`)).json()).revision, saved.revision);
  } finally { server.close(); await session.shutdown({ discard_unsaved: true }); }
});

test("eligibility follows management: an unmanaged or inactive NPC+ and an unmanaged canonical character are not editable", async () => {
  const c = createOpeningCampaign(world, `appearance_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }] });
  const minute = c.exportSnapshot().runtime.scene.world_time.world_minute;
  const woman = buildPromotedCharacter({ label: "Lysa", established: { name: "Lysa" }, evidence: [], location_id: LR, trigger: "name_established", promoted_revision: c.revision + 1, world_minute: minute });
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: woman }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: woman.id }] });
  const card = () => playerCharacterProjection(world, c.exportSnapshot()).project(woman.id)!;
  assert.equal(card().appearance_editor_eligible, true);
  assert.ok(card().appearance_editor);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "set_condition", character_id: woman.id, conditions: [], status: "inactive" }] });
  assert.deepEqual([card().appearance_editor_eligible, card().appearance_editor], [false, null], "inactive");
  const thorne = playerCharacterProjection(world, c.exportSnapshot()).project("mira_thorne");
  assert.ok(!thorne?.appearance_editor_eligible && !thorne?.appearance_editor, "unmanaged canonical");
});

test("unmanaged readers never see profile appearance values; old saves without appearance still resolve and display", () => {
  const c = new CampaignState(world, `appearance_${++serial}`, { player_location: LR, world_time: { world_minute: 600 } });
  const lina = buildPromotedCharacter({ label: "Lina", established: { name: "Lina", appearance: ["a long braid"] }, evidence: [], location_id: LR, trigger: "name_established", promoted_revision: c.revision + 1, world_minute: 600 });
  const old = { id: "campaign_character_old", origin: { kind: "created" as const }, profile: { name: "Old" }, current: { current_location: LR, status: "active" as const } };
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: { ...lina, profile: { ...lina.profile, appearance: { ...lina.profile.appearance, build: "UNPROVEN_BUILD" } } } }, { kind: "register_character", character: old }] });
  const projection = playerCharacterProjection(world, c.exportSnapshot());
  const card = projection.project(lina.id)!;
  assert.equal(card.appearance, "a long braid"); assert.doesNotMatch(JSON.stringify(card), /UNPROVEN_BUILD/); assert.equal(card.appearance_editor, null);
  assert.equal(projection.project(old.id)!.appearance, "No known appearance recorded.");
  assert.deepEqual(resolvePermanentAppearance(world, c.exportSnapshot(), old.id, { canonical: true, overrides: true }).values, {});
});
