import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import { buildPromotedCharacter } from "../src/campaign/promotion.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { establishNames } from "../src/turn/name-establishment.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import { deriveSessionView } from "../src/app/session-view.js";
import { derivePlayUiView } from "../src/app/play-ui-view.js";
import { knownCreatedName, playerCharacterProjection } from "../src/app/player-character-view.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";

/** Current character name projection: a created character's current, play-established name is its player-facing name. */
const world = await loadWorld("data");
const LR = "heartstone_lr";
let serial = 0, minuteNow = 600;
const at = (player: string, narration: string): RecentExchange => ({ player, narration, status: "finalized", location_id: LR });
const LATE = [at("*carries her to the sofa*", "*The woman lies on the sofa, burning with fever.*"),
  at("name's nicco, i'm the keeper of the heartstone, what about you?", "*Her eyes stay half-open, fixed on his face. Her fingers press flat against the cushion, then relax.*\n\nMira.\n\n*She says it without ceremony.*")];
const acquired = (revision: number) => buildPromotedCharacter({ label: "the woman", established: { sex: "female", descriptor: "woman" }, evidence: ["The woman lies in the cage."], location_id: LR, trigger: "purchase_unnamed_subject", promoted_revision: revision, world_minute: minuteNow });
function home(extra: (revision: number) => CampaignCommand[] = () => []) {
  const c = createOpeningCampaign(world, `name_projection_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }] });
  minuteNow = c.exportSnapshot().runtime.scene.world_time.world_minute;
  const more = extra(c.revision + 1);
  if (more.length) c.apply({ expected_revision: c.revision, commands: more });
  return c;
}
function play(c: CampaignState) {
  const snapshot = c.exportSnapshot();
  return derivePlayUiView(world, snapshot, deriveSessionView(world, snapshot, { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } }));
}
const card = (c: CampaignState, id: string) => playerCharacterProjection(world, c.exportSnapshot()).project(id)!;
const lateName = (c: CampaignState) => {
  const r = establishNames(LATE, buildTurnContext(world, c.exportSnapshot()), world, c.exportSnapshot(), [], c.revision);
  c.apply({ expected_revision: c.revision, commands: [...r.commands] });
  return r;
};
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-07T12:00:00.000Z"), world), world).snapshot);

test("late-named acquired woman: every player-facing projection shows Mira; same record, ref and origin; no duplicate", () => {
  let woman!: ReturnType<typeof acquired>;
  const c = home(rev => { woman = acquired(rev); return [{ kind: "register_character", character: woman }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: woman.id }]; });
  const before = card(c, woman.id), originBefore = structuredClone(c.exportSnapshot().characters.find(x => x.id === woman.id)!.origin_snapshot);
  const count = c.exportSnapshot().characters.length;
  assert.deepEqual([before.name, before.name_known, before.category.startsWith("Household")], ["the woman", false, false]);
  assert.equal(play(c).participants.find(p => p.ref === before.ref)?.name, "the woman");

  const r = lateName(c);
  assert.deepEqual(r.named.map(n => [n.character_id, n.name]), [[woman.id, "Mira"]]);
  const record = c.exportSnapshot().characters.find(x => x.id === woman.id)!;
  assert.deepEqual([record.profile.name, record.profile.name_source], ["Mira", "self_disclosed"]);
  assert.deepEqual(record.origin_snapshot, originBefore, "origin snapshot unchanged");
  assert.equal(record.origin_snapshot!.established.name, undefined);
  assert.equal(c.exportSnapshot().characters.length, count, "no duplicate character");

  const after = card(c, woman.id), ui = play(c);
  assert.deepEqual([after.name, after.name_known, after.ref], ["Mira", true, before.ref]);
  assert.ok(after.category.startsWith("Household"));
  const sidebar = ui.participants.find(p => p.ref === before.ref)!;
  assert.deepEqual([sidebar.name, sidebar.card?.name_known, sidebar.card?.name], ["Mira", true, "Mira"]); // sidebar + drawer source
  const member = ui.household.flatMap(h => h.members).find(m => m.ref === before.ref)!;
  assert.deepEqual([member.name, member.name_known], ["Mira", true]); // Household overview card (server sends name when name_known)
  assert.ok(!ui.participants.some(p => p.name === "the woman"));
  assert.doesNotMatch(JSON.stringify(after), /self_disclosed|name_source|campaign_character/);
  assert.equal(knownCreatedName(record), "Mira");
});

test("promotion-time names, unnamed descriptors and unproven profile names keep their behavior", () => {
  let named!: ReturnType<typeof acquired>, unnamed!: ReturnType<typeof acquired>, unproven!: ReturnType<typeof acquired>;
  const c = home(rev => {
    named = buildPromotedCharacter({ label: "Mira", established: { name: "Mira", sex: "female", descriptor: "woman" }, evidence: ['Mira: "Mira."'], location_id: LR, trigger: "name_established", promoted_revision: rev, world_minute: minuteNow });
    unnamed = acquired(rev);
    unproven = { ...acquired(rev), id: "campaign_character_unproven", profile: { name: "UNPROVEN_NAME" } };
    return [named, unnamed, unproven].map(character => ({ kind: "register_character" as const, character }));
  });
  assert.deepEqual([card(c, named.id).name, card(c, named.id).name_known], ["Mira", true]);
  assert.deepEqual([card(c, unnamed.id).name, card(c, unnamed.id).name_known], ["the woman", false]);
  const hidden = card(c, unproven.id);
  assert.deepEqual([hidden.name, hidden.name_known], ["the woman", false]);
  assert.doesNotMatch(JSON.stringify(play(c)), /UNPROVEN_NAME/);
});

test("old saves: no name_source still loads; a promotion-time name shows, an unproven late profile name is not inferred", () => {
  let old!: ReturnType<typeof acquired>, legacyLate!: ReturnType<typeof acquired>;
  const c = roundTrip(home(rev => {
    old = buildPromotedCharacter({ label: "Sovela", established: { name: "Sovela" }, evidence: [], location_id: LR, trigger: "name_established", promoted_revision: rev, world_minute: minuteNow });
    legacyLate = { ...acquired(rev), profile: { name: "Mira", sex: "female" } }; // late-named before name provenance existed
    return [old, legacyLate].map(character => ({ kind: "register_character" as const, character }));
  }));
  assert.equal(c.exportSnapshot().characters.find(x => x.id === old.id)!.profile.name_source, undefined);
  assert.deepEqual([card(c, old.id).name, card(c, old.id).name_known], ["Sovela", true]);
  assert.deepEqual([card(c, legacyLate.id).name, card(c, legacyLate.id).name_known], ["the woman", false]);
  // Late naming committed now (with provenance) survives a reload and still displays.
  let woman!: ReturnType<typeof acquired>;
  const named = home(rev => { woman = acquired(rev); return [{ kind: "register_character", character: woman }]; });
  lateName(named);
  assert.equal(card(roundTrip(named), woman.id).name, "Mira");
});

test("canonical name gating is unchanged and a created Mira reveals no unknown canonical name", () => {
  const c = home(rev => [{ kind: "register_character", character: acquired(rev) }]);
  lateName(c);
  const json = JSON.stringify(play(c));
  assert.doesNotMatch(json, /Thorne/);
  // Canonical Mira Thorne, unknown to Nicco, stays masked in her shop.
  const shop = new CampaignState(world, `name_projection_${++serial}`, { player_location: "mudlarks_herbs", world_time: { world_minute: 600 } });
  const thorne = playerCharacterProjection(world, shop.exportSnapshot()).project("mira_thorne")!;
  assert.deepEqual([thorne.name, thorne.name_known], ["Unfamiliar person", false]);
  assert.doesNotMatch(JSON.stringify(thorne), /Mira|Thorne/);
  // A canonical record carrying an unproven profile name (even with a provenance value) is not named by it.
  shop.apply({ expected_revision: shop.revision, commands: [{ kind: "register_character", character: { id: "mira_thorne", origin: { kind: "canonical", canonical_entity_id: "mira_thorne" }, profile: { name: "UNPROVEN_NAME", name_source: "self_disclosed" }, current: {} } }] });
  const masked = playerCharacterProjection(world, shop.exportSnapshot()).project("mira_thorne")!;
  assert.deepEqual([masked.name, masked.name_known], ["Unfamiliar person", false]);
  assert.doesNotMatch(JSON.stringify(masked), /UNPROVEN_NAME|Mira|Thorne/);
});
