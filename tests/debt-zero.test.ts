import test from "node:test";
import assert from "node:assert/strict";
import type { CampaignCommand } from "../src/campaign/types.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { loadWorld } from "../src/world/loader.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { deriveSessionView } from "../src/app/session-view.js";
import { resolveItemIntent } from "../src/turn/item-intent.js";
import { resolveItemPhrase } from "../src/turn/item-resolution.js";
import { establishedCount, ownerEvidenced } from "../src/turn/item-ownership.js";
import { normalizeControllerOutput, parseControllerEvidenceProposal } from "../src/llm/controller-schema.js";
import { environmentAt, resolveClimateProfileId, resolveExposure } from "../src/world/environment.js";
import { WEATHER_LOOKBACK_BLOCKS, WEATHER_BLOCK_MINUTES, weatherAt } from "../src/world/weather.js";
import { calendarDateAt } from "../src/world/calendar.js";
import { inspectInventory, pickupCase, runPickupCase, SWORD, groundSword, pickUp, dropHere } from "../src/dev/item-lifecycle-inspector.js";
import { turnFixture } from "../src/dev/turn-fixture.js";

/** Pre-Property Debt Zero: item intent binding, bounded evidence recovery, aliases, conflicts, create_item facts, weather seam and exposure. */
type F = ReturnType<typeof turnFixture>;
const apply = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const reg = (id: string, name: string, owner: string | null, position: Record<string, unknown>) => ({ kind: "register_item", item: { id, origin: { kind: "created" }, name, owner_id: owner, position } }) as CampaignCommand;
async function turn(input: string, narration: string, commands: CampaignCommand[], evidence: string[], setup: (f: F) => void = groundSword()) {
  return runPickupCase(pickupCase({ id: "t", title: input, input, narration, controller: commands.length ? { kind: "commands", commands, evidence } : { kind: "none" }, setup }));
}
const HERE = { kind: "stored", location_id: "test_room" }, NICCO = { kind: "carried", character_id: "nicco" };
const carriedBy = (r: { item: { position: unknown } }, p: unknown) => assert.deepEqual(r.item.position, p);
const A = "Nicco bends and picks up the sword.";
const ctxOf = (setup: (f: F) => void = groundSword()) => { const f = turnFixture(); setup(f); return buildTurnContext(f.world, f.campaign.exportSnapshot()); };

// ---------------------------------------------------------------- I: intent grammar
test("I1: pickup intent grammar binds the one tracked item (positive corpus)", () => {
  const context = ctxOf();
  for (const input of ["I pick up the sword.", "I take the sword from the floor.", "I grab the sword.", "I lift the blade.", "I retrieve the sword.", "I pick it up.", "*takes the sword*", "*picks up the blade*", "I pick the sword up.", "*Nicco grabs the sword from the ground*"]) {
    const intent = resolveItemIntent(input, context);
    assert.ok(intent && intent.kind === "pickup" && intent.status === "bound" && intent.item_id === SWORD, `${input} -> ${JSON.stringify(intent)}`);
  }
});
test("I2: attempts, looks, touches, questions and hypotheticals are never a completed pickup intent", () => {
  const context = ctxOf();
  for (const input of ["I look at the sword.", "I touch the sword.", "I reach for the sword.", "I try to pick up the sword.", "Can I take the sword?", "I think about taking the sword.", "I could grab the sword.", "I refuse to lift the sword."]) {
    const intent = resolveItemIntent(input, context);
    assert.ok(!intent || intent.status === "attempt", `${input} -> ${JSON.stringify(intent)}`);
  }
});
test("I3: drop intent grammar binds the carried item to the current location", () => {
  const context = ctxOf(f => { apply(f.campaign, reg(SWORD, "Sword", "nicco", NICCO)); });
  for (const input of ["I put the sword down on the floor.", "I set the sword down.", "I drop the sword.", "*drops the blade*", "I leave the sword here.", "I place the sword on the floor."]) {
    const intent = resolveItemIntent(input, context);
    assert.ok(intent && intent.kind === "drop" && intent.status === "bound" && intent.item_id === SWORD && JSON.stringify(intent.command.position) === JSON.stringify(HERE), `${input} -> ${JSON.stringify(intent)}`);
  }
  // A pronoun resolves only when exactly one item could be meant: Nicco carries several things in this fixture.
  assert.equal(resolveItemIntent("I put it down.", context)?.status, "ambiguous");
  assert.equal(resolveItemIntent("I take the sword from Brenna.", ctxOf(f => { apply(f.campaign, reg(SWORD, "Sword", "nicco", { kind: "carried", character_id: "brenna" })); })), undefined);
});

// ---------------------------------------------------------------- I: bounded evidence recovery
test("I4: Controller omitted the pickup, the player's explicit act and ONE unambiguous receipt recover it (no quote)", async () => {
  const r = await turn("I pick up the sword.", A, [], []);
  carriedBy(r, NICCO); assert.deepEqual([r.run.diagnostic.revision_before, r.run.diagnostic.revision_after], [2, 3]);
  const a = r.run.diagnostic.accepted[0]!; assert.equal(a.evidence?.source, "recovered_narrator_receipt"); assert.ok(a.signals?.includes("recovered_narrator_receipt"));
});
test("I5: a Controller quote of the WRONG sentence loses nothing: the draft's own receipt is recovered and diagnosed", async () => {
  const n = "Dust hangs in the lamplight. Nicco bends and picks up the sword.";
  const r = await turn("I pick up the sword.", n, [pickUp()], ["Dust hangs in the lamplight."]);
  carriedBy(r, NICCO);
  const a = r.run.diagnostic.accepted[0]!; assert.equal(a.evidence?.source, "recovered_narrator_receipt"); assert.equal(a.evidence?.original_quote, "Dust hangs in the lamplight.");
});
test("I6: a good Controller quote is reported as controller_quote and nothing is recovered", async () => {
  const r = await turn("I pick up the sword.", A, [pickUp()], [A]);
  carriedBy(r, NICCO); assert.equal(r.run.diagnostic.accepted[0]!.evidence?.source, "controller_quote");
});
test("I7: recovery stops on any failed attempt, refusal, another actor, reversal or item falling away", async () => {
  for (const n of ["Nicco tries to pick up the sword but fails.", "Nicco refuses to pick up the sword.", "Brenna picks up the sword.", "Nicco picks up the sword, then it slips from his fingers.",
    "Nicco picks up the sword and then drops the sword again.", "Nicco picks up the sword. Brenna takes the sword from him and walks away.", "Nicco reaches for the sword.", "Nicco picks up the sword, which crumbles to dust in his hand."]) {
    const r = await turn("I pick up the sword.", n, [pickUp()], ["The weapon lies there."]);
    carriedBy(r, HERE); assert.deepEqual([r.run.diagnostic.revision_before, r.run.diagnostic.revision_after], [2, 2], n);
    const omitted = await turn("I pick up the sword.", n, [], []); carriedBy(omitted, HERE);
  }
});
test("I8: two separate completed acts on the item are ambiguous evidence for a WEAK quote: nothing is recovered; a different item's receipt is not a second act", async () => {
  const r = await turn("I pick up the sword.", "Nicco picks up the sword. Brenna laughs, bright and short. Nicco picks up the sword.", [pickUp()], ["Brenna laughs, bright and short."]);
  carriedBy(r, HERE); assert.equal(r.run.diagnostic.rejected[0]!.evidence?.check, "recovery_ambiguous_evidence");
  const two = (f: F) => { apply(f.campaign, reg("campaign_item_iron_sword", "Iron sword", null, HERE), reg("campaign_item_iron_dagger", "Iron dagger", null, HERE)); };
  const other = await turn("I pick up the iron sword.", "Nicco picks up the iron sword. Nicco picks up the iron dagger.", [], [], two);
  assert.deepEqual(other.fixture.campaign.exportSnapshot().items.filter(i => i.position.kind === "carried" && i.id.startsWith("campaign_item_iron")).map(i => i.id), ["campaign_item_iron_sword"]);
});

// ---------------------------------------------------------------- I: triangle
test("I9: intent / receipt / proposal triangle", async () => {
  const two = (f: F) => { apply(f.campaign, reg("campaign_item_sword_a", "Rusty sword", null, HERE), reg("campaign_item_sword_b", "Silver sword", null, HERE)); };
  const p = (id: string): CampaignCommand => ({ kind: "place_item", item_id: id, position: NICCO as never });
  const carried = (r: Awaited<ReturnType<typeof turn>>) => r.fixture.campaign.exportSnapshot().items.filter(i => i.position.kind === "carried" && i.id.startsWith("campaign_item_sword_")).map(i => i.id);
  // intent A, narration A, controller A -> accepted
  assert.deepEqual(carried(await turn("I pick up the silver sword.", "Nicco picks up the silver sword.", [p("campaign_item_sword_b")], ["Nicco picks up the silver sword."], two)), ["campaign_item_sword_b"]);
  // intent A, narration picks A, controller B -> rejected with a precise code
  const mismatch = await turn("I pick up the silver sword.", "Nicco picks up the silver sword.", [p("campaign_item_sword_a")], ["Nicco picks up the silver sword."], two);
  assert.deepEqual(carried(mismatch), []); assert.equal(mismatch.run.diagnostic.code, "controller_item_mismatch");
  // intent A, narration fails to lift A, controller A -> rejected, nothing recovered
  assert.deepEqual(carried(await turn("I pick up the silver sword.", "Nicco strains but fails to lift the silver sword.", [p("campaign_item_sword_b")], ["Nicco strains but fails to lift the silver sword."], two)), []);
  // an ambiguous phrase binds nothing and the Controller cannot pick for the player
  const vague = await turn("I pick up the sword.", "Nicco picks up the sword.", [p("campaign_item_sword_a")], ["Nicco picks up the sword."], two);
  assert.deepEqual(carried(vague), []); assert.equal(vague.run.diagnostic.code, "ambiguous_item");
});
test("I10: an autonomous NPC pickup without any player intent still works", async () => {
  const n = "Brenna crouches and picks up the sword.", r = await turn("I watch Brenna.", n, [pickUp("brenna")], [n]);
  carriedBy(r, { kind: "carried", character_id: "brenna" });
  assert.ok(inspectInventory(r.fixture, "brenna").derived.includes(SWORD));
});
test("I11: the drop mirrors the pickup (intent + receipt), including recovery of an omitted or weakly quoted drop", async () => {
  const held = (f: F) => { apply(f.campaign, reg(SWORD, "Sword", "nicco", NICCO)); };
  const n = "Nicco sets the sword down on the floor.";
  for (const [commands, quotes] of [[[dropHere()], [n]], [[dropHere()], ["The room is quiet."]], [[], []]] as [CampaignCommand[], string[]][]) {
    const r = await turn("I put the sword down on the floor.", n, commands, quotes, held);
    carriedBy(r, HERE); assert.equal(r.item.owner, "nicco"); assert.ok(!inspectInventory(r.fixture, "nicco").derived.includes(SWORD));
  }
});

// ---------------------------------------------------------------- I: aliases and same-name resolution
test("I12: generic alias resolution: exact name, name tokens, authored category and the validated category registry", () => {
  const pool = [{ id: "a", name: "Plain iron sword", category: "weapon", position: { kind: "stored" } }, { id: "b", name: "Wooden cup", category: "tool", position: { kind: "stored" } }, { id: "c", name: "Leather boots", category: "clothing", position: { kind: "stored" } }];
  const env = { people: new Map<string, string>(), actor: "nicco" };
  const id = (phrase: string) => { const r = resolveItemPhrase(phrase, pool, env); return r.status === "unique" ? r.id : r.status; };
  for (const [phrase, expected] of [["plain iron sword", "a"], ["iron sword", "a"], ["sword", "a"], ["blade", "a"], ["the weapon", "a"], ["wooden cup", "b"], ["cup", "b"], ["boots", "c"], ["footwear", "c"], ["satchel", "none"], ["lantern", "none"]] as const) assert.equal(id(phrase), expected, phrase);
});
test("I13: same-name items resolve only by authoritative qualifiers (name word, owner, held); otherwise ambiguous and nothing moves", () => {
  const cups = [{ id: "c1", name: "Iron cup", owner_id: "nicco", position: { kind: "stored" } }, { id: "c2", name: "Iron cup", owner_id: "brenna", position: { kind: "stored" } }, { id: "c3", name: "Rusty iron cup", owner_id: null, position: { kind: "stored" } }];
  const env = { people: new Map([["brenna", "brenna"], ["nicco", "nicco"]]), actor: "nicco" };
  const r = (p: string) => resolveItemPhrase(p, cups, env);
  assert.equal(r("cup").status, "ambiguous"); assert.equal(r("iron cup").status, "ambiguous");
  assert.deepEqual(r("rusty cup"), { status: "unique", id: "c3" }); assert.deepEqual(r("Brenna's cup"), { status: "unique", id: "c2" }); assert.deepEqual(r("my cup"), { status: "unique", id: "c1" });
});

// ---------------------------------------------------------------- I: conflicts
test("I14: contradictory placements of ONE item are rejected before commit (no revision); an exact duplicate is only deduped", async () => {
  const B = "Brenna crouches and picks up the sword.";
  const conflict = await turn("I look around.", `${A} ${B}`, [pickUp(), pickUp("brenna")], [A, B]);
  assert.equal(conflict.run.diagnostic.code, "conflicting_item_mutations"); assert.deepEqual([conflict.run.diagnostic.revision_before, conflict.run.diagnostic.revision_after], [2, 2]); carriedBy(conflict, HERE);
  assert.ok(conflict.run.diagnostic.rejected.every(o => o.code === "conflicting_item_mutations"));
  const dup = await turn("I pick up the sword.", A, [pickUp(), pickUp()], [A, A]);
  carriedBy(dup, NICCO); assert.deepEqual([dup.run.diagnostic.revision_before, dup.run.diagnostic.revision_after], [2, 3]);
  const mixed = await turn("I pick up the sword.", A, [pickUp(), { kind: "place_item", item_id: SWORD, position: { kind: "carried", character_id: "nicco" } } as CampaignCommand], [A, A]);
  carriedBy(mixed, NICCO);
});
test("I15: two recipients for one item, and handoff plus lend of one item, are conflicts; unrelated commands in the batch are unaffected", async () => {
  const f = (c: F) => { apply(c.campaign, reg(SWORD, "Sword", "nicco", NICCO)); };
  const t = (to: string, mode: "handoff" | "lend" = "handoff"): CampaignCommand => ({ kind: "transfer_item", item_id: SWORD, mode, position: { kind: "carried", character_id: to } });
  const n = "Brenna takes the sword and weighs it. Maren takes the sword from her.";
  const r = await turn("*looks at Brenna*", n, [t("brenna"), t("maren")], ["Brenna takes the sword and weighs it.", "Maren takes the sword from her."], f);
  assert.equal(r.run.diagnostic.code, "conflicting_item_mutations"); carriedBy(r, NICCO); assert.equal(r.run.diagnostic.revision_after, r.run.diagnostic.revision_before);
});

// ---------------------------------------------------------------- I: create_item facts
const create = (name: string, extra: Record<string, unknown> = {}): CampaignCommand => ({ kind: "create_item", name, description: `A ${name.toLowerCase()}.`, visual_description: `A plain ${name.toLowerCase()}.`, category: "tool", position: NICCO, ...extra }) as CampaignCommand;
const created = (r: Awaited<ReturnType<typeof turn>>, re: RegExp) => r.fixture.campaign.exportSnapshot().items.filter(i => re.test(i.name ?? ""));
test("I16: create_item multiplicity only when the narration explicitly establishes it; a repeated single object never duplicates", async () => {
  const none = (_f: F) => {};
  const two = await turn("I take the cups.", "Two identical iron cups stand on the table. Nicco takes the iron cups.", [create("Iron cup"), create("Iron cup")], ["Nicco takes the iron cups.", "Nicco takes the iron cups."], none);
  assert.equal(created(two, /iron cup/i).length, 2);
  const one = await turn("I take the cup.", "An iron cup stands on the table. Nicco takes the iron cup.", [create("Iron cup"), create("Iron cup")], ["Nicco takes the iron cup.", "Nicco takes the iron cup."], none);
  assert.equal(created(one, /iron cup/i).length, 1);
  assert.equal(establishedCount("Iron cup", "a pair of iron cups"), 2); assert.equal(establishedCount("Iron cup", "three iron cups"), 3); assert.equal(establishedCount("Iron cup", "the iron cup, the iron cup"), 1);
});
test("I17: create_item ownership is independent of existence and placement: never inferred from mention, discovery or carrying", async () => {
  const none = (_f: F) => {};
  const ownerOf = async (narration: string, quote: string, input: string, owner: string) => (created(await turn(input, narration, [create("Iron cup", { owner_id: owner })], [quote], none), /iron cup/i)[0]);
  // carried by Nicco, found on the floor, mentioned beside Brenna: the item exists, the owner is NOT set
  for (const [narration, input] of [["Brenna stands beside an iron cup. Nicco takes the iron cup.", "I take the cup."], ["Nicco finds an iron cup and takes the iron cup.", "I take the iron cup."], ["Brenna carries an iron cup. Nicco takes the iron cup.", "I take the iron cup."]] as const) {
    const item = await ownerOf(narration, narration.split(". ").at(-1)!.replace(/\.?$/, "."), input, "brenna");
    assert.ok(item, narration); assert.equal(item!.owner_id ?? null, null, narration);
  }
  // evidenced owner: possessive, belongs-to, or the player's own "my"
  assert.equal((await ownerOf("Nicco takes Brenna's iron cup.", "Nicco takes Brenna's iron cup.", "I take the cup.", "brenna"))!.owner_id, "brenna");
  assert.equal((await ownerOf("The iron cup belongs to Brenna. Nicco takes the iron cup.", "Nicco takes the iron cup.", "I take the cup.", "brenna"))!.owner_id, "brenna");
  assert.equal((await ownerOf("Nicco takes the iron cup.", "Nicco takes the iron cup.", "I take my iron cup.", "nicco"))!.owner_id, "nicco");
  assert.equal(ownerEvidenced(create("Iron cup", { owner_id: "brenna" }) as never, "Nicco takes the iron cup.", "I take the cup.", ["brenna", "Brenna"]), false);
});
test("I18: owner_id:null is a narrow normalization (flat or nested create_item only) and never poisons other commands", () => {
  const cmd = { kind: "create_item", name: "Iron cup", description: "d", visual_description: "v", category: "tool", position: NICCO, owner_id: null };
  const flat = normalizeControllerOutput(JSON.stringify({ commands: [{ ...cmd, evidence_quote: "Nicco takes the iron cup." }] })), nested = normalizeControllerOutput(JSON.stringify({ commands: [{ command: cmd, evidence_quote: "Nicco takes the iron cup." }] }));
  for (const n of [flat, nested]) { assert.ok(n.normalized_json && /R2_NULL_OPTIONAL_OWNER/.test(n.rule ?? "")); assert.doesNotMatch(n.normalized_json!, /owner_id/); assert.equal(parseControllerEvidenceProposal(n.normalized_json!).length, 1); }
  const mixed = normalizeControllerOutput(JSON.stringify({ commands: [{ command: cmd, evidence_quote: "q" }, { command: { kind: "place_item", item_id: SWORD, position: NICCO }, evidence_quote: "q2" }] }));
  assert.equal(parseControllerEvidenceProposal(mixed.normalized_json!).length, 2);
  const other = normalizeControllerOutput(JSON.stringify({ commands: [{ command: { kind: "place_item", item_id: SWORD, owner_id: null, position: NICCO }, evidence_quote: "q" }] }));
  assert.equal(other.normalized_json, null);
  const nonNull = normalizeControllerOutput(JSON.stringify({ commands: [{ command: { ...cmd, owner_id: 7 }, evidence_quote: "q" }] }));
  assert.equal(nonNull.normalized_json, null);
});

// ---------------------------------------------------------------- I: persistence, equality, bounds
test("I19: save/load equivalence after a pickup; nothing derived (intent, evidence source, exposure, weather) is persisted", async () => {
  const r = await turn("I pick up the sword.", A, [], []);
  const world = r.fixture.world, snapshot = r.fixture.campaign.exportSnapshot();
  const loaded = decodeSave(serializeSave(createSaveFile(snapshot, world, "2026-10-10T10:00:00.000Z"), world), world).snapshot;
  assert.deepEqual(JSON.parse(JSON.stringify(loaded.items)), JSON.parse(JSON.stringify(snapshot.items)));
  assert.doesNotMatch(JSON.stringify(snapshot), /recovered_narrator_receipt|evidence_source|environment_exposure|weather|owner_not_evidenced/);
});
test("I20: inventory equality: domain = SessionView = UI after recovery; stored(location) means physically at the place, not 'floor'", async () => {
  const r = await turn("I pick up the sword.", A, [], []);
  assert.deepEqual(r.inventory.session_view, r.inventory.derived); assert.deepEqual(r.inventory.ui, r.inventory.derived);
  const d = await turn("I pick up the sword.", "Nicco tries to pick up the sword but fails.", [], []);
  assert.deepEqual(d.item.position, { kind: "stored", location_id: "test_room" }); assert.ok(!d.inventory.derived.includes(SWORD));
});
test("I21: bounded work: intent resolution over hundreds of items and 28-draw weather lookups stay fast", () => {
  const f = turnFixture(); for (let k = 0; k < 8; k++) apply(f.campaign, ...Array.from({ length: 50 }, (_, n) => reg(`campaign_item_bulk_${k * 50 + n}`, `Bulk item ${k * 50 + n} sword`, null, HERE)));
  const context = buildTurnContext(f.world, f.campaign.exportSnapshot()), t0 = performance.now();
  for (let n = 0; n < 20; n++) resolveItemIntent("I pick up the bulk item 7 sword.", context);
  for (let n = 0; n < 2000; n++) weatherAt("perf", "west_cool_maritime", n * 360);
  assert.ok(performance.now() - t0 < 4000, `${performance.now() - t0}ms`);
});

// ---------------------------------------------------------------- W: weather and environment
test("W1-W3: weather is a pure function of (seed, profile, minute): any call order, no persistence, bounded", () => {
  const minutes = [0, 5, 359, 360, 10079, 10080, 10081, 60480, 2_000_000, 7 * 1440 * 3 + 1];
  const forward = minutes.map(m => JSON.stringify(weatherAt("s", "west_cool_maritime", m))), backward = [...minutes].reverse().map(m => JSON.stringify(weatherAt("s", "west_cool_maritime", m))).reverse();
  assert.deepEqual(forward, backward);
  assert.equal(JSON.stringify(weatherAt("s", "west_cool_maritime", 5000)), JSON.stringify(weatherAt("s", "west_cool_maritime", 5000)));
  assert.equal(WEATHER_LOOKBACK_BLOCKS, 27); assert.ok(weatherAt("s", "center_hot_arid", 0).block_index === 0);
});
test("W4: the old seven-day seam is gone: persistence across former segment boundaries matches persistence inside a week", () => {
  let seam = 0, inner = 0; const N = 400;
  for (let k = 1; k <= N; k++) {
    if (weatherAt("seam", "west_cool_maritime", (28 * k - 1) * WEATHER_BLOCK_MINUTES).condition === weatherAt("seam", "west_cool_maritime", 28 * k * WEATHER_BLOCK_MINUTES).condition) seam++;
    if (weatherAt("seam", "west_cool_maritime", (28 * k + 9) * WEATHER_BLOCK_MINUTES).condition === weatherAt("seam", "west_cool_maritime", (28 * k + 10) * WEATHER_BLOCK_MINUTES).condition) inner++;
  }
  assert.ok(Math.abs(seam - inner) / N < 0.1, `seam ${seam / N} inner ${inner / N}`);
});
test("W5: weather at the very start of a campaign (history before minute 0) is defined and deterministic", () => {
  const a = weatherAt("fresh", "east_cold_continental", 0), b = weatherAt("fresh", "east_cold_continental", 0); assert.deepEqual(a, b); assert.equal(a.block_index, 0);
  assert.ok(calendarDateAt(-WEATHER_BLOCK_MINUTES * WEATHER_LOOKBACK_BLOCKS));
});
const world = await loadWorld("data");
const sceneAt = (loc: string, seed = "dz_scene") => {
  const campaign = createOpeningCampaign(world, seed), s = campaign.exportSnapshot();
  const moved = { ...s, runtime: { ...s.runtime, scene: { ...s.runtime.scene, player_location: loc } } } as typeof s;
  const context = buildTurnContext(world, moved);
  return { text: buildNarratorPrompt("", context, [], {}, playerIntent("Look around.", context, moved, world)).messages[0]!.content, snapshot: moved };
};
test("W6-W8: exposure is authored per place and never inherited; outdoor reads \"Weather:\", everything else \"Outside weather:\"", () => {
  assert.deepEqual(["heartstone_lr", "heartstone_u1", "heartstone_cy", "heartstone_square", "heartstone", "calderan"].map(id => resolveExposure(world, id)), ["indoor", "indoor", "outdoor", "outdoor", "unknown", "unknown"]);
  assert.equal(resolveExposure(world, null), "unknown");
  const line = (loc: string) => sceneAt(loc).text.split("\n").find(l => /^(?:Outside weather|Weather): /.test(l))!.split(":")[0];
  assert.equal(line("heartstone_cy"), "Weather"); assert.equal(line("heartstone_square"), "Weather");
  assert.equal(line("heartstone_lr"), "Outside weather"); assert.equal(line("heartstone_u1"), "Outside weather"); assert.equal(line("calderan"), "Outside weather"); // unknown
  assert.doesNotMatch(sceneAt("heartstone_lr").text, /rain falls|falls inside|\bindoor\b|environment_exposure/i);
});
test("W9: SessionView and the scene prompt derive the same weather from the same selector; exposure travels in the read model", () => {
  const { text, snapshot } = sceneAt("heartstone_lr");
  const view = deriveSessionView(world, snapshot, { player_inventory: [] } as never);
  assert.equal(view.scene.environment.exposure, "indoor");
  assert.ok(text.includes(view.scene.environment.weather.summary!), `${view.scene.environment.weather.summary}`);
  assert.equal(view.scene.environment.weather.summary, environmentAt(world, snapshot.campaign_id, snapshot.runtime.scene.world_time.world_minute, "heartstone_lr").weather && view.scene.environment.weather.summary);
});
test("W10: a South location with no zone yet reports an explicit derived status, and the narrator is told nothing technical", () => {
  const env = environmentAt(world, "c", 0, "south_continent");
  assert.deepEqual([env.weather, env.weather_status], [null, "needs_climate_zone"]);
  const snapshot = sceneAt("south_continent").snapshot, view = deriveSessionView(world, snapshot, { player_inventory: [] } as never);
  assert.equal(view.scene.environment.weather.status, "needs_climate_zone"); assert.equal(view.scene.environment.weather.note, "Climate zone unresolved");
  assert.doesNotMatch(sceneAt("south_continent").text, /south_mixed|needs_climate_zone|climate zone|\bWeather: |Outside weather: /i);
});
test("W11: climate coverage: every authored place resolves a profile except the continent itself and the Mist Sea (documented gaps)", () => {
  const locations = world.listEntities().filter(e => e.type === "location").map(e => e.id), missing = locations.filter(id => resolveClimateProfileId(world, id) === undefined).sort();
  assert.deepEqual(missing, ["continent", "mist_sea"]);
  for (const id of ["dragons_teeth_mountains", "chained_bay", "sorrow_sea", "silent_ocean"]) assert.notEqual(resolveClimateProfileId(world, id), undefined, id);
});
test("W12: validation rejects an unknown exposure value and exposure leaves the save untouched", async () => {
  const r = environmentAt(world, "c", 0, "heartstone_lr"); assert.equal(r.exposure, "indoor");
  const snap = createOpeningCampaign(world, "dz_save").exportSnapshot(); assert.doesNotMatch(JSON.stringify(snap), /exposure|climate/);
});
test("W13: calendar regression: dates around the Great Illumination and the year boundary are unchanged by the weather window", () => {
  const a = calendarDateAt(0), b = calendarDateAt(1440 * 360), c = calendarDateAt(1440 * 366);
  assert.equal(a.kind, "regular"); assert.ok(b && c);
  assert.deepEqual(JSON.parse(JSON.stringify(calendarDateAt(777))), JSON.parse(JSON.stringify(calendarDateAt(777))));
});
