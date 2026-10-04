import { productionStub, testTrajectory, testContrast, testMovement, instantReflectionPacing } from "./production-reflection-fixtures.js";
import test from "node:test";
import assert from "node:assert/strict";
import { build, BASE } from "./pass10-headroom.js";
import { household, play } from "./pass10-support.js";
import { loadWorld } from "../src/world/loader.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { npcPlusFragments, packNpcPlus, npcDeepSources } from "../src/turn/npc-plus.js";
import { reflectAfterTurn, reflectionEvidence, type ReflectionProvider } from "../src/turn/reflection.js";
import { invitedFollowers } from "../src/turn/follow-invitation.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";

/** NPC+ Pass 10 — determinism: identical inputs yield byte-identical outputs across runs, rebuilds and round trips. */
const world = await loadWorld("data");

test("the same scripted multi-turn play yields a byte-identical campaign snapshot, premium state and prompt on two independent runs", async () => {
  const script: readonly [string, string][] = [["Nicco goes down the stairs. Maren follows him.", "I go down to the main hall. Maren, come with me."], ["Nicco climbs the stairs alone.", "I go back upstairs to the observation room."],
    ["Nicco goes down. Behind him, Brenna's uneven tread followed — slow… her hand on the rail.", "I go down to the main hall. Brenna, join me."]];
  const runOnce = async () => { const f = household(); const prompts: string[] = []; for (const [n, i] of script) prompts.push((await play(n, i, { fixture: f })).prompt); return { snapshot: JSON.stringify(f.campaign.exportSnapshot()), prompts }; };
  const a = await runOnce(), b = await runOnce();
  assert.equal(a.snapshot, b.snapshot);
  assert.deepEqual(a.prompts, b.prompts);
});
test("context, fragments, packing and recovery refs are stable across rebuilds, with all-equal scores and after a JSON round trip", () => {
  const { campaign } = build({ ...BASE, n: 14, history: "rollup", reflections: true, facts: 10, knowsPer: 2, rules: 2, rich: false, itemsPer: 0 });
  const snap = campaign.exportSnapshot(), present = new Set(["nicco", ...snap.characters.map(c => c.id)]);
  const runs = Array.from({ length: 5 }, () => JSON.stringify([npcPlusFragments(world, snap, present, "Everybody, come here."), packNpcPlus(world, snap, present, "Everybody, come here.")]));
  assert.equal(new Set(runs).size, 1);
  const viaJson = JSON.stringify([npcPlusFragments(world, JSON.parse(JSON.stringify(snap)), present, "Everybody, come here."), packNpcPlus(world, JSON.parse(JSON.stringify(snap)), present, "Everybody, come here.")]);
  assert.equal(viaJson, runs[0]);
  const refs = (id: string) => npcDeepSources(world, snap, id).map(s => s.handle);
  assert.deepEqual(refs("campaign_character_h003"), refs("campaign_character_h003"));
  assert.equal(JSON.stringify(buildTurnContext(world, snap, { input: "x" })), JSON.stringify(buildTurnContext(world, JSON.parse(JSON.stringify(snap)), { input: "x" })));
});
test("fully tied NPC+ (identical scores) pack in snapshot order, deterministically, whatever the input wording", () => {
  const { campaign } = build({ ...BASE, n: 9, rich: false, itemsPer: 0, history: "none" });
  const snap = campaign.exportSnapshot(), present = new Set(snap.characters.map(c => c.id));
  const order = (input: string) => packNpcPlus(world, snap, present, input, 700)!.lines.map(l => l.split(":")[0]);
  const a = order("hello"), b = order("hello"), c = order("anything else entirely");
  assert.deepEqual(a, b);
  assert.deepEqual(a, [...a].sort(), "tied fragments keep snapshot (id) order");
  assert.ok(c.length > 0 && JSON.stringify(c) === JSON.stringify([...c].sort()));
});
test("reflection merge is deterministic: the same stub twice on identical campaigns stores identical notes, ids and ordering", async () => {
  const mk = async () => {
    const f = household(["maren"]);
    for (const loc of ["test_hall", "test_room", "test_hall"]) f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "maren", location_id: loc }] });
    const refs = reflectionEvidence(f.world, f.campaign.exportSnapshot(), "maren").filter(e => / moved from /.test(e.text)).map(e => e.ref);
    const provider = productionStub(r => { const moves=r.evidence.filter(e=>e.evidence_type==='movement');return [testMovement(r),testMovement({...r,evidence:moves.slice(0,2)})]; });
    await reflectAfterTurn(f.campaign, f.world, provider, { pacing: instantReflectionPacing().pacing });
    return JSON.stringify(f.campaign.exportSnapshot().premium_reflections);
  };
  const a = await mk(), b = await mk();
  assert.equal(a, b);
  assert.ok(JSON.parse(a)[0].notes.length >= 2);
});
test("invitation target selection and movement proposals do not depend on object or array incidental order", () => {
  const mk = (id: string) => ({ id, names: [id[0]!.toUpperCase() + id.slice(1)] });
  const a = invitedFollowers("Anyone who wants can come with me.", [mk("maren"), mk("brenna")], []), b = invitedFollowers("Anyone who wants can come with me.", [mk("brenna"), mk("maren")], []);
  assert.deepEqual([...a].sort(), [...b].sort());
  // Output order follows the eligible list (the snapshot's own order in production), never the sentence or hash order: the SET is stable.
  assert.deepEqual(invitedFollowers("Maren, Brenna, come with me.", [mk("brenna"), mk("maren")], []), ["brenna", "maren"]);
  assert.deepEqual(invitedFollowers("Maren, Brenna, come with me.", [mk("maren"), mk("brenna")], []), ["maren", "brenna"]);
});
test("save format and migration output are byte-stable: serialize twice, decode and re-serialize, and migrate a legacy save twice", () => {
  const f = household(["brenna", "maren"]);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "maren", location_id: "test_hall" }] });
  const text = serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-02T09:00:00.000Z"), f.world);
  assert.equal(serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-02T09:00:00.000Z"), f.world), text);
  assert.equal(serializeSave(decodeSave(text, f.world), f.world), text);
  const legacy = JSON.parse(text); legacy.schema_version = 2; legacy.snapshot.schema_version = 1; delete legacy.snapshot.premium_characters; delete legacy.snapshot.premium_reflections;
  const a = JSON.stringify(decodeSave(JSON.stringify(legacy), f.world)), b = JSON.stringify(decodeSave(JSON.stringify(legacy), f.world));
  assert.equal(a, b);
});
