import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { playerCharacterProjection } from "../src/app/player-character-view.js";
import { characterCapabilities, AVATAR_UPLOAD_SUPPORTED } from "../src/app/character-capabilities.js";
import { isNpcPlus, activeNpcPlus } from "../src/campaign/premium-characters.js";
import { createSaveFile } from "../src/persistence/save-format.js";

/** NPC visual capability / UI tier cleanup: tier and capabilities are DERIVED from the premium record, never from household membership or the active gate. */
const world = await loadWorld("data");
let serial = 0;
const LR = "heartstone_lr";
function campaign(): CampaignState {
  const c = createOpeningCampaign(world, `capability_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }] });
  return c;
}
const person = (id: string, name: string, status: "active" | "inactive" | "dead" = "active"): CampaignCommand => ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 30 } }, current: { current_location: LR, status } } });
const apply = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const card = (c: CampaignState, id: string) => playerCharacterProjection(world, c.exportSnapshot()).project(id)!;
const join = (id: string): CampaignCommand => ({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: id });
const leave = (id: string): CampaignCommand => ({ kind: "leave_household", household_id: OPENING_HOUSEHOLD, character_id: id });
const NONE = { can_upload_avatar: false, can_generate_avatar: false, can_show_full_body: false, can_manage_full_body: false, can_show_gallery: false, can_manage_gallery: false, can_edit_npc_plus: false, can_edit_appearance: false, portrait_editable: false };
const subset = (caps: ReturnType<typeof card>["character_capabilities"], keys: readonly string[]) => Object.fromEntries(keys.map(k => [k, (caps as unknown as Record<string, unknown>)[k]]));

test("U1-U6: a world/canon NPC has the canon tier, a displayable portrait and none of the management capabilities", () => {
  const c = campaign(), caps = card(c, "mira_thorne").character_capabilities;
  assert.equal(caps.tier, "world_canon"); assert.equal(caps.portrait_display, true);
  assert.deepEqual(subset(caps, Object.keys(NONE)), NONE);
  assert.equal(card(c, "mira_thorne").appearance_editor, null);
});
test("U7/U8: a campaign NPC is not NPC+: no management capabilities, but its read-only runtime information stays", () => {
  const c = campaign(); apply(c, person("campaign_character_ada", "Ada"));
  const view = card(c, "campaign_character_ada");
  assert.equal(view.character_capabilities.tier, "campaign_npc"); assert.deepEqual(subset(view.character_capabilities, Object.keys(NONE)), NONE);
  assert.equal(view.name, "Ada"); assert.match(view.where, /Here/); assert.equal(view.npc_plus, false);
});
test("U9-U13/U20: a promoted NPC+ has every NPC+ capability (Avatar, Generate, Full Body, Gallery, Edit); Upload follows the real upload support", () => {
  const c = campaign(); apply(c, person("campaign_character_ada", "Ada"), join("campaign_character_ada"));
  const caps = card(c, "campaign_character_ada").character_capabilities;
  assert.equal(caps.tier, "npc_plus");
  assert.deepEqual(subset(caps, ["can_generate_avatar", "can_show_full_body", "can_manage_full_body", "can_show_gallery", "can_manage_gallery", "can_edit_npc_plus", "can_edit_appearance", "portrait_editable"]),
    { can_generate_avatar: true, can_show_full_body: true, can_manage_full_body: true, can_show_gallery: true, can_manage_gallery: true, can_edit_npc_plus: true, can_edit_appearance: true, portrait_editable: true });
  assert.equal(caps.can_upload_avatar, AVATAR_UPLOAD_SUPPORTED);
  assert.equal(caps.generate_unavailable_reason, null, "enabled when nothing blocks generation");
  assert.ok(card(c, "campaign_character_ada").appearance_editor);
});
test("U14/U15/U16: promotion keeps the same identity and refreshes the capabilities from the authoritative record", () => {
  const c = campaign(); apply(c, person("campaign_character_ada", "Ada"));
  const before = card(c, "campaign_character_ada"), count = c.exportSnapshot().characters.length;
  assert.equal(before.character_capabilities.tier, "campaign_npc");
  apply(c, join("campaign_character_ada"));
  const after = card(c, "campaign_character_ada");
  assert.equal(after.ref, before.ref, "same opaque identity"); assert.equal(c.exportSnapshot().characters.length, count, "no duplicate character");
  assert.equal(after.character_capabilities.tier, "npc_plus"); assert.equal(after.character_capabilities.can_edit_npc_plus, true);
  assert.equal(after.avatar_url, before.avatar_url, "an existing avatar association is unchanged by promotion");
});
test("U17/U18/root cause: a promoted NPC+ keeps NPC+ capabilities after leaving the household, though the behavior gate is inactive", () => {
  const c = campaign(); apply(c, person("campaign_character_ada", "Ada"), join("campaign_character_ada")); apply(c, leave("campaign_character_ada"));
  const snapshot = c.exportSnapshot();
  assert.equal(isNpcPlus(snapshot, "campaign_character_ada"), true); assert.equal(activeNpcPlus(snapshot).has("campaign_character_ada"), false, "the behavior gate is off");
  const view = card(c, "campaign_character_ada");
  assert.equal(view.household, false); assert.equal(view.character_capabilities.tier, "npc_plus"); assert.equal(view.character_capabilities.can_edit_npc_plus, true); assert.ok(view.appearance_editor);
});
test("U18: being present or a household candidate without promotion grants nothing", () => {
  const c = campaign(); apply(c, person("campaign_character_ada", "Ada"));
  assert.equal(card(c, "campaign_character_ada").character_capabilities.can_edit_npc_plus, false);
});
test("U19: an authored canon character promoted to NPC+ receives NPC+ capabilities", () => {
  const c = campaign(); apply(c, { kind: "register_character", character: { id: "mira_thorne", origin: { kind: "canonical", canonical_entity_id: "mira_thorne" }, profile: {}, current: { status: "active" } } }, { kind: "move_character", character_id: "mira_thorne", location_id: LR });
  assert.equal(card(c, "mira_thorne").character_capabilities.tier, "campaign_npc");
  apply(c, join("mira_thorne"));
  const caps = card(c, "mira_thorne").character_capabilities;
  assert.equal(caps.tier, "npc_plus"); assert.equal(caps.can_edit_npc_plus, true); assert.equal(caps.can_show_gallery, true);
});
test("an inactive or dead NPC+ keeps its tier but not its editing, with the real reason", () => {
  const c = campaign(); apply(c, person("campaign_character_ada", "Ada"), join("campaign_character_ada"), { kind: "set_condition", character_id: "campaign_character_ada", conditions: [], status: "inactive" });
  const caps = card(c, "campaign_character_ada").character_capabilities;
  assert.equal(caps.tier, "npc_plus"); assert.equal(caps.can_edit_npc_plus, false); assert.match(caps.edit_unavailable_reason!, /no longer active/);
});
test("U21/U22: capabilities are deterministic, read-only derived state; the save schema is unchanged and holds no capability field", () => {
  const c = campaign(); apply(c, person("campaign_character_ada", "Ada"), join("campaign_character_ada"));
  const before = JSON.stringify(c.exportSnapshot()), a = JSON.stringify(card(c, "campaign_character_ada").character_capabilities), b = JSON.stringify(card(c, "campaign_character_ada").character_capabilities);
  assert.equal(a, b); assert.equal(JSON.stringify(c.exportSnapshot()), before, "projection does not write");
  assert.ok(!/character_capabilities|can_edit_npc_plus|character_tier/i.test(before));
  assert.equal(c.exportSnapshot().schema_version, 7); assert.equal(createSaveFile(c.exportSnapshot(), world, "2026-10-11T00:00:00.000Z").schema_version, 7, "save schema 6 (block 5A); the snapshot schema is unchanged by this pass");
  assert.deepEqual(characterCapabilities({ promoted: false, has_campaign_record: true, editable: true }), characterCapabilities({ promoted: false, has_campaign_record: true, editable: false }), "a non-promoted tier never edits");
});
