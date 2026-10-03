import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { CampaignState, prepareCampaignChange } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CampaignSnapshot, MannerismDefinition } from "../src/campaign/types.js";
import { MANNERISM_SEEDS, reviewMannerismSeeds } from "../src/campaign/mannerism-seeds.js";
import { assignInitialMannerism, mannerismOwners, validateMannerismDefinition } from "../src/campaign/mannerisms.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { npcPlusFragments, packNpcPlus, MANNERISM_NARRATOR_RULE } from "../src/turn/npc-plus.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { parseControllerProposal } from "../src/llm/controller-schema.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { setup, mockNarrator, mockController, collect, transfer } from "./turn-fixtures.js";

const HOME = "campaign_household_mannerisms";
function rig(...members: string[]) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: HOME }, { kind: "set_membership", household_id: HOME, membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...members.map(character_id => ({ kind: "join_household" as const, household_id: HOME, character_id })),
  ] });
  return f;
}
const rows = (c: CampaignState, id = "brenna") => c.exportSnapshot().premium_characters.find(p => p.character_id === id)!.mannerisms ?? [];
const unused = (c: CampaignState) => MANNERISM_SEEDS.filter(s => !mannerismOwners(c.exportSnapshot()).has(s.canonical_key));
const def = (s: MannerismDefinition): MannerismDefinition => ({ canonical_key: s.canonical_key, text: s.text });
const add = (c: CampaignState, definition: MannerismDefinition, character_id = "brenna") => c.addMannerism({ expected_revision: c.revision, character_id, definition });

test("D10 curated pool: 80 bounded self-contained concepts, eight categories, no unsafe prerequisites or duplicate keys", () => {
  const r = reviewMannerismSeeds(); assert.equal(r.seed_count, 80); assert.equal(Object.keys(r.categories).length, 8);
  assert.deepEqual([r.rejected_unsafe_seeds, r.duplicate_canonical_keys], [[], []]);
  for (const s of MANNERISM_SEEDS) { validateMannerismDefinition(s); assert.equal(s.requires_item_id, undefined); assert.equal(s.requires_entity_id, undefined); }
  assert.deepEqual(reviewMannerismSeeds([{ ...MANNERISM_SEEDS[0]!, text: "Turns a ring given by her mother." }]).rejected_unsafe_seeds, [MANNERISM_SEEDS[0]!.canonical_key]);
  assert.deepEqual(reviewMannerismSeeds([MANNERISM_SEEDS[0]!, MANNERISM_SEEDS[0]!]).duplicate_canonical_keys, [MANNERISM_SEEDS[0]!.canonical_key]);
});
test("D10 NPC+ promotion atomically assigns exactly one seed; ordinary, guest and ephemeral characters receive none", () => {
  const f = rig(); assert.deepEqual(f.campaign.exportSnapshot().premium_characters, []);
  const before = f.campaign.exportSnapshot();
  const p = f.campaign.prepare({ expected_revision: f.campaign.revision, commands: [{ kind: "join_household", household_id: HOME, character_id: "brenna" }] });
  assert.equal(f.campaign.exportSnapshot(), before); assert.equal(p.snapshot.premium_characters[0]!.mannerisms!.length, 1);
  f.campaign.commit(p); const m = rows(f.campaign)[0]!;
  assert.deepEqual([m.source, m.user_edited, m.created_revision], ["seeded", false, f.campaign.revision]);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "set_membership", household_id: HOME, membership: { character_id: "maren", status: "guest" } }] });
  assert.equal(f.campaign.exportSnapshot().premium_characters.some(p => p.character_id === "maren"), false);
});
test("D10 maximum four: manual fifth addition fails atomically; initial-assignment seam never replaces occupied slots", () => {
  const f = rig("brenna"); for (const s of unused(f.campaign).slice(0, 3)) add(f.campaign, def(s));
  const before = f.campaign.exportSnapshot(); assert.equal(rows(f.campaign).length, 4);
  assert.throws(() => add(f.campaign, def(unused(f.campaign)[0]!)), /maximum four/); assert.equal(f.campaign.exportSnapshot(), before);
  const draft = structuredClone(before) as CampaignSnapshot; assignInitialMannerism(draft, f.world, draft.premium_characters[0]!); assert.deepEqual(draft, before);
  f.campaign.deleteMannerism({ expected_revision: f.campaign.revision, character_id: "brenna", id: rows(f.campaign)[0]!.id });
  add(f.campaign, def(unused(f.campaign)[0]!)); assert.equal(rows(f.campaign).length, 4, "delete makes a full slot usable again");
});
test("D10 global semantic keys: aliases of an owned concept cannot be added to another NPC+; distinct seeds coexist", () => {
  const f = rig("brenna", "maren"), b = rows(f.campaign)[0]!;
  assert.notEqual(b.canonical_key, rows(f.campaign, "maren")[0]!.canonical_key);
  const before = f.campaign.exportSnapshot();
  assert.throws(() => add(f.campaign, { canonical_key: b.canonical_key, text: "Briefly lowers their eyes before replying." }, "maren"), /already owned/);
  assert.equal(f.campaign.exportSnapshot(), before);
  assert.throws(() => add(f.campaign, { canonical_key: "another_spelling", text: b.text }, "maren"), /retain its concept key/);
  add(f.campaign, def(unused(f.campaign)[0]!), "maren"); assert.equal(mannerismOwners(f.campaign.exportSnapshot()).size, 3);
});
test("D10 inactive owners retain exclusivity; rejoining does not assign or overwrite", () => {
  const f = rig("brenna", "maren"), b = rows(f.campaign)[0]!;
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "leave_household", household_id: HOME, character_id: "brenna" }] });
  assert.throws(() => add(f.campaign, def(b), "maren"), /already owned/);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "join_household", household_id: HOME, character_id: "brenna" }] });
  assert.deepEqual(rows(f.campaign), [b]);
});
test("D10 object prerequisites: missing item, wrong owner and inaccessible possession fail; actual owned carried ring succeeds", () => {
  const f = rig("brenna"), before = f.campaign.exportSnapshot();
  const d = { canonical_key: "ring_turn_while_waiting", text: "Turns their ring with a thumb while waiting.", requires_item_id: "ring" };
  assert.throws(() => add(f.campaign, { ...d, requires_item_id: "campaign_item_missing" }), /unavailable/);
  assert.throws(() => add(f.campaign, d), /unavailable/); assert.equal(f.campaign.exportSnapshot(), before);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "transfer_item", item_id: "ring", owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } }] });
  add(f.campaign, d); assert.equal(rows(f.campaign).at(-1)!.requires_item_id, "ring");
  assert.throws(() => add(f.campaign, { canonical_key: "doll_clutch", text: "Clutches their doll with both hands.", requires_item_id: "ring" }), /unavailable/);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "place_item", item_id: "ring", position: { kind: "stored", location_id: "test_room" } }] });
  assert.equal(rows(f.campaign).length, 2, "historical cue is retained");
  assert.ok(!packNpcPlus(f.world, f.campaign.exportSnapshot(), new Set(["brenna"]), "Brenna")!.lines.join("\n").includes(d.text));
  assert.doesNotThrow(() => decodeSave(serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-03T22:00:00.000Z"), f.world), f.world));
});
test("D10 entity prerequisites: missing, off-location and unsupported types rejected; actual current room accepted", () => {
  const f = rig("brenna"); const d = { canonical_key: "head_tilt_in_room", text: "Tilts their head briefly before replying.", requires_entity_id: "test_room" };
  for (const requires_entity_id of ["nonexistent", "test_remote", "ironbound"]) assert.throws(() => add(f.campaign, { ...d, requires_entity_id }), /unavailable/);
  add(f.campaign, d); assert.equal(rows(f.campaign).length, 2);
});
test("D10 unsafe automatic inference and unsupported objects rejected by finite guard", () => {
  const f = rig("brenna"); const before = f.campaign.exportSnapshot();
  for (const text of ["Avoids showing affection.", "Hides vulnerability behind sarcasm.", "Distrusts authority.", "Is protective of friends.", "Becomes playful around people she trusts.", "Values honesty.", "Likes being dominated.", "Is naturally submissive.", "Fears abandonment.", "Taps her fingers to signal consent.", "Turns the ring on her finger.", "Clutches a doll with both hands.", "Touches an old scar with her fingers."]) {
    assert.throws(() => add(f.campaign, { canonical_key: "unsafe_cue", text }), /inference|observable|prerequisite/);
  }
  assert.equal(f.campaign.exportSnapshot(), before);
});
test("D10 edit persists, preserves ID/source/creation and ownership, never automatically overwritten; delete frees slot and key", () => {
  const f = rig("brenna", "maren"), first = rows(f.campaign)[0]!;
  const text = "Briefly taps two fingertips together before answering.";
  f.campaign.editMannerism({ expected_revision: f.campaign.revision, character_id: "brenna", id: first.id, definition: { canonical_key: first.canonical_key, text } });
  const edited = rows(f.campaign)[0]!;
  assert.deepEqual([edited.id, edited.source, edited.created_revision, edited.user_edited], [first.id, "seeded", first.created_revision, true]);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }); assert.equal(rows(f.campaign)[0]!.text, text);
  assert.throws(() => add(f.campaign, def(first), "maren"), /already owned/);
  f.campaign.deleteMannerism({ expected_revision: f.campaign.revision, character_id: "brenna", id: first.id }); assert.deepEqual(rows(f.campaign), []);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }); assert.deepEqual(rows(f.campaign), [], "no automatic refill");
  add(f.campaign, def(first), "maren"); assert.equal(mannerismOwners(f.campaign.exportSnapshot()).get(first.canonical_key), "maren");
});
test("D10 edit replaces canonical ownership explicitly and rejects collisions atomically", () => {
  const f = rig("brenna", "maren"), first = rows(f.campaign)[0]!, other = rows(f.campaign, "maren")[0]!;
  const before = f.campaign.exportSnapshot();
  assert.throws(() => f.campaign.editMannerism({ expected_revision: f.campaign.revision, character_id: "brenna", id: first.id, definition: def(other) }), /already owned/); assert.equal(f.campaign.exportSnapshot(), before);
  f.campaign.editMannerism({ expected_revision: f.campaign.revision, character_id: "brenna", id: first.id, definition: { canonical_key: "palms_press_during_wait", text: "Presses one palm against the other while waiting." } });
  assert.equal(mannerismOwners(f.campaign.exportSnapshot()).has(first.canonical_key), false); add(f.campaign, def(first), "maren");
});
test("D10 save/load: full authority survives; old optional-field absence remains zero; restore rejects duplicate ownership and future revisions", () => {
  const f = rig("brenna", "maren"); add(f.campaign, def(unused(f.campaign)[0]!));
  const first = rows(f.campaign)[0]!;
  f.campaign.editMannerism({ expected_revision: f.campaign.revision, character_id: "brenna", id: first.id, definition: { canonical_key: first.canonical_key, text: "Touches their fingertips together before a short reply." } });
  const original = f.campaign.exportSnapshot();
  const restored = CampaignState.restore(f.world, decodeSave(serializeSave(createSaveFile(original, f.world, "2026-10-03T22:00:00.000Z"), f.world), f.world).snapshot);
  assert.deepEqual(restored.exportSnapshot(), original); assert.deepEqual(mannerismOwners(restored.exportSnapshot()), mannerismOwners(original));
  const legacy = structuredClone(original) as CampaignSnapshot; for (const p of legacy.premium_characters) { delete p.mannerisms; delete p.metadata.initial_mannerism; }
  const old = CampaignState.restore(f.world, legacy); assert.equal(mannerismOwners(old.exportSnapshot()).size, 0);
  old.apply({ expected_revision: old.revision, commands: [] }); assert.equal(mannerismOwners(old.exportSnapshot()).size, 0);
  const duplicate = structuredClone(original) as CampaignSnapshot; duplicate.premium_characters[1]!.mannerisms = [structuredClone(duplicate.premium_characters[0]!.mannerisms![0]!)];
  assert.throws(() => CampaignState.restore(f.world, duplicate), /reference_invalid/);
  const future = structuredClone(original) as CampaignSnapshot; future.premium_characters[0]!.mannerisms![0]!.created_revision = original.revision + 1; assert.throws(() => CampaignState.restore(f.world, future), /reference_invalid/);
  const overfull = structuredClone(original) as CampaignSnapshot;
  while (overfull.premium_characters[0]!.mannerisms!.length < 5) overfull.premium_characters[0]!.mannerisms!.push(structuredClone(overfull.premium_characters[0]!.mannerisms![0]!));
  assert.throws(() => CampaignState.restore(f.world, overfull), /invalid_save/);
});
test("D10 no automatic promotion above slot one; exhausted 80-seed pool still promotes the 81st NPC+ with an explicit empty outcome", () => {
  const f = rig();
  for (let start = 0; start < 81; start += 40) {
    const commands: CampaignCommand[] = [];
    for (let i = start; i < Math.min(81, start + 40); i++) {
      const id = `campaign_character_member${i}`;
      commands.push({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name: `Member ${i}` }, current: { current_location: "test_room" } } }, { kind: "join_household", household_id: HOME, character_id: id });
    }
    f.campaign.apply({ expected_revision: f.campaign.revision, commands });
  }
  const s = f.campaign.exportSnapshot(), empty = s.premium_characters.filter(p => !p.mannerisms?.length);
  assert.equal(s.premium_characters.length, 81); assert.equal(mannerismOwners(s).size, 80); assert.equal(empty.length, 1);
  assert.equal(empty[0]!.metadata.initial_mannerism, "seed_pool_exhausted"); assert.equal(empty[0]!.metadata.active_household_member, true);
});
test("D10 promotion seam prefers a prevalidated available candidate, otherwise seed fallback; no evidence detector runs", () => {
  const f = rig("brenna"), d = structuredClone(f.campaign.exportSnapshot()) as CampaignSnapshot, p = d.premium_characters[0]!;
  delete p.mannerisms; delete p.metadata.initial_mannerism;
  assignInitialMannerism(d, f.world, p, { candidate: { canonical_key: "two_finger_tap", text: "Taps two fingertips against the opposite palm before replying.", semantic_duplicate_check: "passed" } });
  assert.equal(p.mannerisms![0]!.source, "emergent"); assert.equal(p.metadata.initial_mannerism, "candidate");
  const unavailable = structuredClone(d); const target = unavailable.premium_characters[0]!; delete target.mannerisms; delete target.metadata.initial_mannerism;
  assignInitialMannerism(unavailable, f.world, target, { candidate: { canonical_key: "ring_turn", text: "Turns their ring with a thumb.", requires_item_id: "ring", semantic_duplicate_check: "passed" } });
  assert.equal(target.mannerisms![0]!.source, "seeded");
});
test("D10 repeatable preparation and different campaign identities allow different casts", () => {
  const f = rig(), input = { expected_revision: f.campaign.revision, commands: [{ kind: "join_household", household_id: HOME, character_id: "brenna" }] };
  const a = prepareCampaignChange(f.campaign.exportSnapshot(), f.world, input), b = prepareCampaignChange(f.campaign.exportSnapshot(), f.world, input); assert.deepEqual(a, b);
  const keys = new Set<string>(); for (let i = 0; i < 12; i++) { const s = structuredClone(f.campaign.exportSnapshot()) as CampaignSnapshot; s.campaign_id = `cast${i}`; keys.add(prepareCampaignChange(s, f.world, input).snapshot.premium_characters[0]!.mannerisms![0]!.canonical_key); }
  assert.ok(keys.size > 1);
  const forward = ["brenna", "maren"].map(character_id => ({ kind: "join_household" as const, household_id: HOME, character_id }));
  assert.deepEqual(prepareCampaignChange(f.campaign.exportSnapshot(), f.world, { expected_revision: f.campaign.revision, commands: forward }).snapshot,
    prepareCampaignChange(f.campaign.exportSnapshot(), f.world, { expected_revision: f.campaign.revision, commands: [...forward].reverse() }).snapshot);
});
test("D10 contradictory canon: silent NPC+ receives an available non-speech cue; manual speech cue rejected", () => {
  const f = rig("gerome"), s = f.campaign.exportSnapshot(), m = rows(f.campaign, "gerome")[0]!;
  assert.equal(m.source, "seeded");
  const packed = packNpcPlus(f.world, s, new Set(["gerome"]), "Gerome")!.lines.join("\n"); assert.ok(packed.includes(m.text));
  assert.throws(() => add(f.campaign, { canonical_key: "quiet_voice_aside", text: "Lowers their voice before a brief aside." }, "gerome"), /unavailable/);
});
test("D10 manual unknown-input boundary rejects getters, excess fields and ordinary character edits without invoking code", () => {
  const f = rig("brenna"), before = f.campaign.exportSnapshot(); let invoked = false;
  assert.throws(() => f.campaign.addMannerism({ get expected_revision() { invoked = true; return f.campaign.revision; }, character_id: "brenna", definition: def(unused(f.campaign)[0]!) }), /accessors/);
  assert.equal(invoked, false);
  assert.throws(() => f.campaign.prepareMannerism({ kind: "add", expected_revision: f.campaign.revision, character_id: "brenna", definition: { ...def(unused(f.campaign)[0]!), source: "emergent" } }), /unknown field/);
  assert.throws(() => add(f.campaign, def(unused(f.campaign)[0]!), "maren"), /only an NPC/);
  assert.equal(f.campaign.exportSnapshot(), before);
});
test("D10 narrator packing: cues only for present active selected NPC+; no global keys, registry or absent NPC+ cues", () => {
  const f = rig("brenna", "maren"), s = f.campaign.exportSnapshot();
  const fs = npcPlusFragments(f.world, s, new Set(["brenna"]), "Brenna");
  assert.ok(fs.filter(x => x.character_id === "brenna").every(x => x.text.includes(rows(f.campaign)[0]!.text)));
  assert.ok(fs.filter(x => x.character_id === "maren").every(x => !x.text.includes("Mannerisms:")));
  const packed = packNpcPlus(f.world, s, new Set(["brenna"]), "Brenna")!.lines.join("\n");
  assert.ok(packed.includes("Mannerisms:")); assert.ok(!packed.includes(rows(f.campaign, "maren")[0]!.text));
  for (const key of mannerismOwners(s).keys()) assert.ok(!packed.includes(key));
  assert.match(MANNERISM_NARRATOR_RULE, /optional recurring cues/); assert.match(MANNERISM_NARRATOR_RULE, /never in every scene/); assert.match(MANNERISM_NARRATOR_RULE, /consent or internal state/);
  const ctx = buildTurnContext(f.world, s, { input: "Brenna" }); const prompt = buildNarratorPrompt("Brenna", ctx, [], {}, { candidates: [], runtime: [] });
  assert.ok(prompt.messages[0]!.content.includes("Mannerisms:"));
});
test("D10 stale manual receipts, consumed receipt replay and failed promotion leave authority untouched", () => {
  const f = rig("brenna"), before = f.campaign.exportSnapshot();
  assert.throws(() => f.campaign.prepareMannerism({ kind: "add", expected_revision: 0, character_id: "brenna", definition: def(unused(f.campaign)[0]!) }), /stale/);
  assert.equal(f.campaign.exportSnapshot(), before);
  const r = f.campaign.prepareMannerism({ kind: "add", expected_revision: f.campaign.revision, character_id: "brenna", definition: def(unused(f.campaign)[0]!) });
  f.campaign.commit(r); assert.throws(() => f.campaign.commit(r), /consumed/);
  const other = f.campaign.prepareMannerism({ kind: "delete", expected_revision: f.campaign.revision, character_id: "brenna", id: rows(f.campaign)[0]!.id });
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1 } }] }); assert.throws(() => f.campaign.commit(other), /stale/);
  const last = f.campaign.exportSnapshot(); assert.throws(() => f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "join_household", household_id: HOME, character_id: "maren" }, { kind: "join_household", household_id: HOME, character_id: "does_not_exist" }] }));
  assert.equal(f.campaign.exportSnapshot(), last);
});
test("D10 controller/reflection cannot mutate mannerisms; ordinary controller authorization is unchanged and sees no cue registry", async () => {
  for (const kind of ["add_mannerism", "edit_mannerism", "delete_mannerism"]) assert.throws(() => parseControllerProposal(JSON.stringify({ commands: [{ kind, character_id: "brenna" }] })));
  const f = rig("brenna"), before = rows(f.campaign);
  assert.throws(() => f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "add_mannerism", character_id: "brenna", text: "A cue." }] }));
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "record_reflection", character_id: "brenna", reflected_revision: f.campaign.revision, notes: [] }] }); assert.deepEqual(rows(f.campaign), before);
  const r = setup(), co = new TurnCoordinator(f.world, mockNarrator("Brenna accepts boots from Nicco."), { async propose(request) { assert.ok(!request.prior_state.includes("Mannerisms:")); assert.equal(JSON.parse(request.prior_state).context.npc_plus, undefined); assert.ok(!request.prior_state.includes(before[0]!.text)); return mockController([transfer]).propose(request); } }, r.retrieval);
  const events = await collect(co.runTurn({ campaign: f.campaign, player_input: "I give boots to Brenna." })); assert.equal(events.at(-1)!.type, "turn_completed"); assert.deepEqual(rows(f.campaign), before);
});
