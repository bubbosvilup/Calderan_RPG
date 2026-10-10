import test from "node:test";
import assert from "node:assert/strict";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { turnFixture } from "../src/dev/turn-fixture.js";
import { runScenario, type DiagnosticScenario } from "../src/dev/controller-authorization-diagnostics.js";
import { conflictingCommands } from "../src/turn/mutation-diagnostics.js";
import { CONDITION_TERMS } from "../src/turn/physical-interaction.js";
import { CONTROLLER_POLICY } from "../src/llm/openrouter/state-controller.js";
import { apply, itemId, makeItem, promptFor, sceneBlock, sceneFixture, SCENE_ELSEWHERE } from "../src/dev/scene-state-fixtures.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { CampaignState } from "../src/campaign/campaign-state.js";

/** Consolidation Pass C: F condition vocabulary, G conflicting-command diagnostics, D new-item materialization continuity, J next-turn scene continuity. */
type F = ReturnType<typeof turnFixture>;
const away: CampaignCommand[] = [{ kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE }, { kind: "move_character", character_id: "gerome", location_id: SCENE_ELSEWHERE }];
const scene = (id: string, commands: CampaignCommand[] = []) => () => sceneFixture({ id, commands: [...away, ...commands] }) as unknown as F;
const cmds = (commands: CampaignCommand[], evidence: string[]) => ({ kind: "commands" as const, commands, evidence });
const rusty = (fields: Partial<Extract<CampaignCommand, { kind: "create_item" }>> = {}): CampaignCommand =>
  ({ kind: "create_item", name: "Rusty sword", description: "A rusty iron sword.", visual_description: "Plain rusty iron sword with a pitted blade.", category: "weapon", position: { kind: "carried", character_id: "nicco" }, owner_id: "nicco", ...fields }) as CampaignCommand;
const CLAIM = "Nicco finds a rusty sword discarded on the ground, picks it up and claims it as his own.";
const run = (s: Partial<DiagnosticScenario> & Pick<DiagnosticScenario, "narration" | "controller" | "input">) => runScenario({ id: "pc", title: "pc", fixture: scene("pc"), ...s });
const swords = (f: F) => f.campaign.exportSnapshot().items.filter(i => /sword/i.test(i.name ?? ""));

// ---------- F: condition vocabulary ----------
test("F winded: breath-knocked-out phrasings are recognised, harmless breath/air sentences are not", () => {
  const yes = ["The blow knocks the breath out of her.", "Air rushes out of him with a grunt.", "The air leaves her in a rush.", "She struggles to catch her breath.", "He is fighting for air.", "She can't breathe.", "Brenna is winded.", "She gasps for air.", "The punch knocked the wind out of him.", "The breath left them all at once."];
  const no = ["She holds her breath and listens.", "The air leaves the room as the door opens.", "He takes a deep breath.", "She stops to catch her breath after the stairs.", "The wind rushes through the hall.", "Her breath fogs in the cold air.", "The air leaves the bellows with a hiss.", "A long breath leaves him in relief.", "She breathes easily.", "The air is cold."];
  for (const t of yes) assert.ok(CONDITION_TERMS.winded.test(t), t);
  for (const t of no) assert.ok(!CONDITION_TERMS.winded.test(t), t);
});
test("F other tags keep their strict vocabulary (no broadening beyond winded)", () => {
  for (const t of ["She flinches.", "It hurts.", "He grimaces in pain.", "She steps back."]) for (const tag of ["minor_injury", "dazed", "knocked_down"] as const) assert.ok(!CONDITION_TERMS[tag].test(t), `${tag}: ${t}`);
});
test("F Controller sees a concise semantic guide for the four tags and the pain/flinch rule", () => {
  for (const s of ["winded is breath knocked out", "dazed is disoriented", "knocked_down is actually falling", "minor_injury is explicit physical damage", "Pain, a flinch or an attempted blow alone records nothing"]) assert.ok(CONTROLLER_POLICY.includes(s), s);
});
test("F the live E2E2 draft (air leaving her in a rush) now lets a verified winded tag commit; a minor_injury tag on the same sentence is still rejected", async () => {
  const narration = "*The punch folds Maren in half with a sharp grunt, air leaving her in a rush. She staggers back a step.*";
  const tag = (t: "winded" | "minor_injury"): CampaignCommand => ({ kind: "set_condition", character_id: "maren", conditions: [t] } as CampaignCommand);
  const ok = await run({ input: "*punches Maren hard in the stomach*", narration, controller: cmds([tag("winded")], ["The punch folds Maren in half with a sharp grunt, air leaving her in a rush."]) });
  assert.equal(ok.diagnostic.verdict, "committed", ok.diagnostic.notes.join("|"));
  const bad = await run({ input: "*punches Maren hard in the stomach*", narration, controller: cmds([tag("minor_injury")], ["The punch folds Maren in half with a sharp grunt, air leaving her in a rush."]) });
  assert.equal(bad.diagnostic.revision_after, bad.diagnostic.revision_before); assert.equal(bad.result!.authorization[0]!.evidence?.check, "condition_term_missing");
});
test("F a harmless breath sentence after a punch never authorises winded", async () => {
  const r = await run({ input: "*punches Maren hard in the stomach*", narration: "*Maren holds her breath and glares at Nicco.*", controller: cmds([{ kind: "set_condition", character_id: "maren", conditions: ["winded"] } as CampaignCommand], ["Maren holds her breath and glares at Nicco."]) });
  assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});

// ---------- G: conflicting-command diagnostics ----------
const tr = (mode: "handoff" | "lend" | "gift", who: string, id = "i1"): CampaignCommand => ({ kind: "transfer_item", mode, item_id: id, position: { kind: "carried", character_id: who } });
const put = (id: string, loc: string): CampaignCommand => ({ kind: "place_item", item_id: id, position: { kind: "stored", location_id: loc } } as CampaignCommand);
test("G conflicts: handoff+lend, two recipients, two positions, transfer+place are named; repeats and different items are not conflicts", () => {
  assert.match(conflictingCommands([tr("handoff", "brenna"), tr("lend", "brenna")])[0]!.detail, /both handoff and lend/);
  assert.match(conflictingCommands([tr("handoff", "brenna"), tr("handoff", "maren")])[0]!.detail, /two recipients \(brenna and maren\)/);
  assert.match(conflictingCommands([put("i1", "a"), put("i1", "b")])[0]!.detail, /two different positions/);
  assert.match(conflictingCommands([tr("handoff", "brenna"), put("i1", "a")])[0]!.detail, /transferred and placed/);
  assert.deepEqual(conflictingCommands([tr("handoff", "brenna"), tr("handoff", "brenna")]), []);
  assert.deepEqual(conflictingCommands([tr("handoff", "brenna", "i1"), tr("lend", "maren", "i2")]), []);
});
const SWORD = "campaign_item_sword";
const reg = (f: F, owner: string, carrier: string) => { apply(f.campaign, { kind: "register_item", item: { id: SWORD, origin: { kind: "created" }, name: "Sword", owner_id: owner, position: { kind: "carried", character_id: carrier } } } as CampaignCommand); };
test("G a conflicting proposal (two recipients, no player intent) surfaces `conflicts` and records that the later authorized command wins", async () => {
  const r = await run({ input: "*looks at Brenna*", setup: f => reg(f, "nicco", "nicco"),
    narration: "Brenna takes the sword and weighs it. Maren takes the sword from her.",
    controller: cmds([tr("handoff", "brenna", SWORD), tr("handoff", "maren", SWORD)], ["Brenna takes the sword and weighs it.", "Maren takes the sword from her."]) });
  assert.ok(r.diagnostic.conflicts?.length === 1, JSON.stringify(r.diagnostic.notes)); assert.match(r.diagnostic.conflicts![0]!.detail, /two recipients/);
  // Finding (H): both receipts were verified, so both commands are authorized and apply in proposal order; the later command wins. Observable, not blocked.
  assert.equal(r.diagnostic.accepted.length, 2);
  assert.ok(r.diagnostic.notes.some(n => /conflicting commands/.test(n)));
});

// ---------- D: new-item materialization continuity ----------
const nSwords = (f: F) => swords(f).length;
const shared = (id: string) => { const f = scene(id)(); return { f, fixture: () => f }; };
test("D1 scenery-only mention: nothing is materialized", async () => {
  const { f, fixture } = shared("d1");
  const r = await run({ fixture, input: "*looks around*", narration: "A rusty sword lies in the mud near the door.", controller: { kind: "none" } });
  assert.equal(r.diagnostic.verdict, "nothing_intended"); assert.equal(nSwords(f), 0);
});
test("D2 find + pick up + claim: one engine-id item, carried and owned by Nicco; revision +1", async () => {
  const { f, fixture } = shared("d2");
  const r = await run({ fixture, input: "*finds a rusty sword discarded on the ground, picks it up and claims it as his own*", narration: `*${CLAIM}*`, controller: cmds([rusty()], [CLAIM]) });
  assert.equal(r.diagnostic.verdict, "committed", r.diagnostic.notes.join("|") + JSON.stringify(r.diagnostic.rejected.map(x => x.detail)));
  const [sword] = swords(f); assert.equal(nSwords(f), 1); assert.match(sword!.id, /^campaign_item_\d{8}$/);
  assert.deepEqual([sword!.owner_id, sword!.position], ["nicco", { kind: "carried", character_id: "nicco" }]);
});
test("D3 pick up without any claim: the item is created unowned (ownership is never inferred)", async () => {
  const { f, fixture } = shared("d3"); const q = "Nicco picks up a rusty sword from the ground.";
  const r = await run({ fixture, input: "*picks up the rusty sword*", narration: `*${q}*`, controller: cmds([(() => { const { owner_id: _o, ...rest } = rusty() as Extract<CampaignCommand, { kind: "create_item" }>; void _o; return rest as CampaignCommand; })()], [q]) });
  assert.equal(r.diagnostic.verdict, "committed"); assert.ok(swords(f)[0]!.owner_id == null);
});
test("D4 embellished/hedged or unnamed evidence is rejected deterministically; nothing is created", async () => {
  const { f, fixture } = shared("d4");
  const hedge = "Nicco might pick up a rusty sword and perhaps claim it.";
  const a = await run({ fixture, input: "*picks up the rusty sword*", narration: `*${hedge}*`, controller: cmds([rusty()], [hedge]) });
  assert.equal(a.diagnostic.revision_after, a.diagnostic.revision_before);
  const unnamed = "Nicco bends down and picks something up from the ground.";
  const b = await run({ fixture, input: "*picks up the rusty sword*", narration: `*${unnamed}*`, controller: cmds([rusty()], [unnamed]) });
  assert.equal(b.result!.authorization[0]!.evidence?.check, "materialized_object_not_named"); assert.equal(nSwords(f), 0);
  const long = `Nicco finds a rusty sword ${"discarded far from everything and ".repeat(8)}and picks it up.`;
  const c = await run({ fixture, input: "*picks up the rusty sword*", narration: `*${long}*`, controller: cmds([rusty()], [long]) });
  assert.equal(c.diagnostic.revision_after, c.diagnostic.revision_before); assert.equal(nSwords(f), 0);
});
test("D5 follow-up 'adds it to inventory' after D2: no duplicate, whether the Controller proposes nothing or re-proposes create_item", async () => {
  const { f, fixture } = shared("d5");
  await run({ fixture, input: "*picks up the rusty sword and claims it*", narration: `*${CLAIM}*`, controller: cmds([rusty()], [CLAIM]) });
  const q = "Nicco slides the rusty sword into his belt.";
  const none = await run({ fixture, input: "*adds the rusty sword to his inventory*", narration: `*${q}*`, controller: { kind: "none" } });
  assert.equal(nSwords(f), 1); assert.notEqual(none.diagnostic.verdict, "committed");
  const again = await run({ fixture, input: "*adds the rusty sword to his inventory*", narration: `*${q}*`, controller: cmds([rusty()], [q]) });
  assert.equal(again.result!.authorization[0]!.reason, "rejected_already_established"); assert.equal(nSwords(f), 1); assert.equal(again.diagnostic.revision_after, again.diagnostic.revision_before);
});
test("D6 the same create_item twice in one proposal is deduplicated to one item", async () => {
  const { f, fixture } = shared("d6");
  const r = await run({ fixture, input: "*picks up the rusty sword*", narration: `*${CLAIM}*`, controller: cmds([rusty(), rusty()], [CLAIM, CLAIM]) });
  assert.equal(r.diagnostic.verdict, "committed"); assert.equal(nSwords(f), 1);
});
test("D7 same-name distinct swords: the second same-named object is blocked while the first is visible (documented limitation); a distinguishing name is accepted", async () => {
  const { f, fixture } = shared("d7");
  await run({ fixture, input: "*picks up the rusty sword*", narration: `*${CLAIM}*`, controller: cmds([rusty()], [CLAIM]) });
  const q2 = "Nicco finds another rusty sword, notched along the edge, and picks it up.";
  const blocked = await run({ fixture, input: "*picks up the other rusty sword*", narration: `*${q2}*`, controller: cmds([rusty()], [q2]) });
  assert.equal(blocked.result!.authorization[0]!.reason, "rejected_already_established"); assert.equal(nSwords(f), 1);
  const ok = await run({ fixture, input: "*picks up the other rusty sword*", narration: `*${q2}*`, controller: cmds([rusty({ name: "Notched rusty sword" })], [q2]) });
  assert.equal(ok.diagnostic.verdict, "committed"); assert.equal(nSwords(f), 2);
});
test("D8 an item already tracked (lying here) is picked up with place_item, never materialized again", async () => {
  const { f, fixture } = shared("d8");
  apply(f.campaign, makeItem({ name: "Rusty sword", position: { kind: "stored", location_id: "heartstone_lr" } }));
  const id = itemId(f.campaign, "Rusty sword"), q = "Nicco picks up the rusty sword.";
  const dup = await run({ fixture, input: "*picks up the rusty sword*", narration: `*${q}*`, controller: cmds([rusty()], [q]) });
  assert.equal(dup.result!.authorization[0]!.reason, "rejected_already_established"); assert.equal(nSwords(f), 1);
  const move = await run({ fixture, input: "*picks up the rusty sword*", narration: `*${q}*`, controller: cmds([{ kind: "place_item", item_id: id, position: { kind: "carried", character_id: "nicco" } } as CampaignCommand], [q]) });
  assert.equal(move.diagnostic.verdict, "committed"); assert.equal(nSwords(f), 1); assert.deepEqual(swords(f)[0]!.position, { kind: "carried", character_id: "nicco" });
});
test("D9 the Controller schema carries no embellishment fields (strict envelope rejects extras)", async () => {
  const { f, fixture } = shared("d9");
  const raw = JSON.stringify({ commands: [{ command: { ...rusty(), rust_level: "heavy", history: "found in the mud" }, evidence_quote: CLAIM }] });
  const r = await run({ fixture, input: "*picks up the rusty sword*", narration: `*${CLAIM}*`, controller: { kind: "raw", text: raw } });
  assert.equal(r.diagnostic.code, "controller_parse_failure"); assert.equal(nSwords(f), 0);
});

// ---------- J: next-turn scene continuity, no transcript dependency ----------
test("D10/J new item: the next prompt's [CURRENT SCENE] shows Nicco carrying the Rusty sword (owner Nicco) with no transcript; survives save/load", async () => {
  const { f, fixture } = shared("j1");
  await run({ fixture, input: "*picks up the rusty sword and claims it*", narration: `*${CLAIM}*`, controller: cmds([rusty()], [CLAIM]) });
  const block = sceneBlock(promptFor(f.world, f.campaign, "*looks around*", []).text);
  assert.match(block, /Rusty sword/i); assert.match(block, /Nicco/);
  const loaded = decodeSave(serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-10T10:00:00.000Z"), f.world), f.world).snapshot;
  const again = sceneBlock(promptFor(f.world, CampaignState.restore(f.world, loaded), "*looks around*", []).text);
  assert.equal(again, block);
});
test("J handover: after a committed handoff the next scene shows Brenna carrying the Sword, owner still Nicco", async () => {
  const { f, fixture } = shared("j2");
  reg(f, "nicco", "nicco");
  const r = await run({ fixture, input: "*hands Brenna the sword*", narration: "Nicco offers the hilt. Brenna takes the sword and weighs it.", controller: cmds([tr("handoff", "brenna", SWORD)], ["Brenna takes the sword and weighs it."]) });
  assert.equal(r.diagnostic.verdict, "committed");
  const sword = f.campaign.exportSnapshot().items.find(i => i.id === SWORD)!; assert.deepEqual([sword.owner_id, sword.position], ["nicco", { kind: "carried", character_id: "brenna" }]);
  const block = sceneBlock(promptFor(f.world, f.campaign, "*looks at Brenna*", []).text);
  assert.match(block, /Brenna[^\n]*Sword/i); assert.match(block, /owner[^\n]*Nicco|Nicco[^\n]*owner|belongs to Nicco/i);
});
test("J condition: after a committed winded tag the next scene shows it for Maren", async () => {
  const { f, fixture } = shared("j3"); const q = "The punch folds Maren in half, air leaving her in a rush.";
  const r = await run({ fixture, input: "*punches Maren hard in the stomach*", narration: `*${q}*`, controller: cmds([{ kind: "set_condition", character_id: "maren", conditions: ["winded"] } as CampaignCommand], [q]) });
  assert.equal(r.diagnostic.verdict, "committed");
  assert.match(sceneBlock(promptFor(f.world, f.campaign, "*looks at Maren*", []).text), /Maren[^\n]*winded/i);
});
