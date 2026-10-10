import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { buildSceneStateProjection } from "../src/turn/scene-state-projection.js";
import { focusedSceneStateProjection, SCENE_FOCUS_LIMITS } from "../src/turn/scene-state-focus.js";
import { renderSceneStateProjection, SCENE_BLOCK_HEADER } from "../src/turn/scene-state-render.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import {
  LORE, SCENE_ELSEWHERE, SCENE_LOCATION, WEST_GATE, WEST_GATE_TEXT, alone, apply, createdPerson, fact, idealScene, itemId, knows, makeItem, promptFor,
  sceneBlock, sceneFixture, scenarios, sceneWorld,
} from "../src/dev/scene-state-fixtures.js";

/**
 * Scene State Projection V1 (phases 41-55): the narrator-facing [CURRENT SCENE] block is DERIVED each turn from authoritative runtime
 * state. These tests use only the synthetic public fixtures in src/dev/scene-state-fixtures.ts; nothing touches data/ or the network.
 */
const scene = (f: { world: ReturnType<typeof sceneWorld>; campaign: CampaignState }, input = "Brenna, are you alright?", recent = [] as Parameters<typeof promptFor>[3]) =>
  sceneBlock(promptFor(f.world, f.campaign, input, recent).text);
const HELD_BACK = /\b(borrow(ed)?|stol(e|en)|lent|loan(ed)?|gift(ed)?|stolen|thief|thieves)\b/i;

test("basic scene: location, human time, present people, player resources and nothing the engine does not track", () => {
  const block = scene(idealScene());
  assert.ok(block.startsWith(SCENE_BLOCK_HEADER));
  assert.match(block, /Location: Heartstone LR/);
  assert.match(block, /Time: 19:42 — Evening/);
  assert.match(block, /Present:\n- Nicco\n- Brenna\n- Maren/);
  assert.match(block, /Mana: 80\/100/);
  assert.match(block, /Money: 4 Gold/);
  assert.doesNotMatch(block, /\b(weather|rain|raining|snow|cloudy|temperature|lit|dark|candle|fireplace is)\b/i);
});

test("character state: a present NPC's recorded condition is shown, and it survives when the player talks to someone else (background NPC)", () => {
  const f = idealScene();
  assert.match(scene(f, "Brenna, are you alright?"), /- Brenna is winded\./);
  assert.match(scene(f, "Maren, what did you cook?"), /- Brenna is winded\./, "background Brenna keeps her recorded state");
  const e = scenarios()[4]!;
  assert.match(sceneBlock(promptFor(e.world, e.campaign, e.input).text), /Maren has a minor injury\./);
});

test("character state: absent NPCs and unknown conditions never invent state", () => {
  const f = idealScene();
  apply(f.campaign, { kind: "set_condition", character_id: "absent_korvin", conditions: ["winded"] });
  assert.doesNotMatch(scene(f), /Korvin/);
  const quiet = sceneFixture({ commands: alone });
  assert.doesNotMatch(scene(quiet), /Character state:/);
});

test("ownership and possession are two facts: a carried item shows carrier and owner, without loan/theft/gift inference", () => {
  const f = idealScene();
  const block = scene(f);
  assert.match(block, /- Brenna carries Sword; owner: Nicco\./);
  assert.doesNotMatch(block, HELD_BACK);
  for (const mode of ["lend", "steal"] as const) {
    const g = sceneFixture({ id: `own_${mode}`, commands: alone });
    apply(g.campaign, makeItem({ name: "Sword", owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } }));
    try { apply(g.campaign, { kind: "transfer_item", item_id: itemId(g.campaign, "Sword"), mode, position: { kind: "carried", character_id: "brenna" } } as never); } catch { /* a mode the domain refuses leaves the item in place; the block must still not narrate a loan */ }
    const text = scene(g, "Brenna, show me the sword.");
    assert.match(text, /Sword/);
    assert.doesNotMatch(text, HELD_BACK, mode);
  }
  const handed = scenarios()[1]!;
  assert.doesNotMatch(sceneBlock(promptFor(handed.world, handed.campaign, handed.input, handed.recent).text), HELD_BACK);
});

test("owner unrecorded and unowned items say so honestly without implying ownership", () => {
  const f = sceneFixture({ commands: alone });
  apply(f.campaign, makeItem({ name: "Satchel", position: { kind: "carried", character_id: "nicco" } }));
  const block = scene(f, "I check my satchel.");
  assert.match(block, /Nicco carries Satchel\./);
  assert.doesNotMatch(block, /Satchel[^\n]*owner:/);
});

test("stored items: shown as stored here, with owner; the stored-item gap is closed while the Controller still receives items_here", () => {
  const f = idealScene();
  const { context, text } = promptFor(f.world, f.campaign, "I look at the letter on the shelf.");
  assert.match(sceneBlock(text), /- Letter is stored here; owner: Nicco\./);
  assert.ok("items_here" in context && context.items_here!.length > 0, "Controller items_here is unchanged");
});

test("stored items: capped, a referenced item survives the cap, items elsewhere are excluded", () => {
  const f = sceneFixture({ commands: alone });
  const names = Array.from({ length: 14 }, (_, i) => `Crate${String.fromCharCode(97 + i)}`);
  apply(f.campaign, ...names.map(name => makeItem({ name, position: { kind: "stored", location_id: SCENE_LOCATION } })),
    makeItem({ name: "Cellar key", position: { kind: "stored", location_id: SCENE_ELSEWHERE } }), makeItem({ name: "Zephyr lamp", position: { kind: "stored", location_id: SCENE_LOCATION } }));
  const generic = scene(f, "Good evening, Brenna.");
  assert.ok((generic.match(/is stored here/g) ?? []).length <= SCENE_FOCUS_LIMITS.stored_items);
  assert.doesNotMatch(generic, /Cellar key/);
  assert.match(generic, /more stored|not listed/i);
  assert.match(scene(f, "*picks up the Zephyr lamp*"), /Zephyr lamp is stored here/);
});

test("resources: mana and Gold only, never an invented currency", () => {
  const block = scene(idealScene());
  assert.match(block, /Mana: 80\/100/);
  assert.doesNotMatch(block, /silver|copper|coin|\bsp\b|\bcp\b/i);
  const poor = sceneFixture({ commands: alone });
  apply(poor.campaign, { kind: "set_funds", character_id: "nicco", gold: 0 });
  assert.match(scene(poor), /Money: 0 Gold/);
});

test("knowledge scopes: knows / believes / suspects / rumor are distinct and a missing edge is never stated as ignorance", () => {
  const c = scenarios()[2]!;
  const block = sceneBlock(promptFor(c.world, c.campaign, c.input).text);
  assert.match(block, /known by Nicco, Brenna; heard only as a rumor by Maren/);
  assert.match(block, /believed by Maren/);
  assert.match(block, /suspected by Brenna/);
  assert.match(block, /\[the claim is false\]/);
  assert.doesNotMatch(block, /does not know|doesn't know|is unaware|ignorant of|cannot know/i);
  const ideal = scene(idealScene(), "Brenna, tell me about the West Gate incident.");
  assert.doesNotMatch(ideal, /no recorded knowledge entry for/, "Maren is not named by this turn, so she is not listed");
  assert.match(scene(idealScene(), "Brenna and Maren, what do you each know about the West Gate incident?"), /known by Nicco, Brenna; no recorded knowledge entry for Maren\./);
  assert.match(ideal, /not proof a person is ignorant/);
});

test("secrecy: public canon is not scene truth, and restricted / holder-only / author-only canon never enters the block", () => {
  const f = sceneFixture({ secrets: true, commands: alone });
  const block = scene(f, "Brenna, tell me everything you know.");
  for (const sentinel of Object.values(LORE)) assert.ok(!block.includes(sentinel), `${sentinel} must not be projected into scene truth`);
});

test("secrecy: a narrator-only person in the room is a confidential encounter, never named", () => {
  const f = sceneFixture({ secretNpc: true, commands: alone });
  const block = scene(f);
  assert.doesNotMatch(block, /Seraph/);
  assert.match(block, /unfamiliar person/);
});

test("secrecy: a canonical fact pointing at author-only or holder-only lore never leaks the lore text", () => {
  const f = sceneFixture({ secrets: true, commands: alone });
  apply(f.campaign,
    { kind: "create_fact", fact: { id: "campaign_fact_author", content: { kind: "canonical", entity_id: "lore_author_only" } } },
    { kind: "create_fact", fact: { id: "campaign_fact_holder", content: { kind: "canonical", entity_id: "lore_holder_only" } } },
    knows("brenna", "campaign_fact_author"), knows("brenna", "campaign_fact_holder"));
  const block = scene(f, "Brenna, what secret do you keep?");
  for (const sentinel of [LORE.author, LORE.holder]) assert.ok(!block.includes(sentinel));
});

test("no technical id, asset filename, revision or visual description reaches the block", () => {
  const f = idealScene();
  apply(f.campaign, { kind: "schedule_event", id: "campaign_event_supper", title: "Supper", scheduled_world_minute: 1260, participants: ["nicco", "brenna"] },
    { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  const block = scene(f, "Brenna, about the sword, the letter, the West Gate and supper.");
  const ids = [/campaign_item_/, /campaign_fact_/, /campaign_event_/, /campaign_character_/, /campaign_household_/, /\bcreated_revision\b/, /\.(png|webp|jpg|jpeg)\b/i, /SECRET_VISUAL_SENTINEL/, /\brevision\b/i, /\b(brenna|nicco|maren)_[a-z0-9]+\b/];
  for (const re of ids) assert.doesNotMatch(block, re, String(re));
  assert.ok(!block.includes(itemId(f.campaign, "Sword")));
});

test("focus: item descriptions appear only for items the turn is about, and unrelated stored items yield to referenced ones", () => {
  const f = idealScene();
  assert.doesNotMatch(scene(f, "Good evening."), /Description: /);
  assert.match(scene(f, "Brenna, show me the sword."), /Sword[^\n]*Description: A plain iron sword\./);
});

test("large scene: deterministic, bounded, whole lines, important facts survive and secrecy holds", () => {
  const build = () => {
    const f = idealScene({ secrets: true });
    const people = Array.from({ length: 160 }, (_, i) => createdPerson(`campaign_character_crowd_${i}`, `Crowd${i}`));
    const chunked = (commands: Parameters<typeof apply>[1][]) => { for (let i = 0; i < commands.length; i += 20) apply(f.campaign, ...commands.slice(i, i + 20)); };
    chunked(people);
    chunked(people.slice(0, 80).map((_, i) => makeItem({ name: `Bundle${i}`, position: { kind: "carried", character_id: `campaign_character_crowd_${i}` } })));
    chunked(people.slice(0, 40).map((_, i) => ({ kind: "set_condition", character_id: `campaign_character_crowd_${i}`, conditions: ["winded"] }) as never));
    return f;
  };
  const a = scene(build(), "Brenna, are you alright?"), b = scene(build(), "Brenna, are you alright?");
  assert.equal(a, b, "deterministic");
  assert.ok(a.length <= 6_000, `bounded (${a.length})`);
  assert.match(a, /Location: Heartstone LR/);
  assert.match(a, /Mana: 80\/100/);
  assert.match(a, /Money: 4 Gold/);
  assert.match(a, /Brenna carries Sword; owner: Nicco\./);
  for (const sentinel of Object.values(LORE)) assert.ok(!a.includes(sentinel));
  for (const line of a.split("\n")) assert.ok(!/[,;:(]$/.test(line.trimEnd()) || line.endsWith(":"), `no cut line: ${line}`);
});

test("renderer budget: under a tiny budget required sections survive and the least important ones are dropped first", () => {
  const f = idealScene();
  const { context, intent } = promptFor(f.world, f.campaign, "Brenna, are you alright?");
  void intent;
  const focused = focusedSceneStateProjection(buildSceneStateProjection(context), { background: new Set(), foreground: new Set(["brenna"]), input: "Brenna, are you alright?" });
  const full = renderSceneStateProjection(focused);
  const small = renderSceneStateProjection(focused, { max_chars: 700 });
  assert.ok(small.chars < full.chars);
  assert.ok(small.chars <= 700 + 400, "approximately within budget (guidance and header are never dropped)");
  assert.match(small.text, /Location: Heartstone LR/);
  assert.match(small.text, /Present:/);
  assert.match(small.text, /Mana: 80\/100/);
  assert.ok(Object.keys(small.dropped).length > 0, "something was dropped and reported");
});

test("derived only: building the block never mutates the campaign (revision, snapshot, saved JSON)", () => {
  const f = idealScene();
  const before = JSON.stringify(f.campaign.exportSnapshot()), revision = f.campaign.revision;
  scene(f); scene(f, "Maren, hello.");
  assert.equal(f.campaign.revision, revision);
  assert.equal(JSON.stringify(f.campaign.exportSnapshot()), before);
});

test("save round trip: the projection is not persisted and is identical when rebuilt from a restored save", () => {
  const f = idealScene();
  const snapshot = JSON.parse(JSON.stringify(f.campaign.exportSnapshot()));
  assert.ok(!/CURRENT SCENE|scene_state_projection|SceneState/i.test(JSON.stringify(snapshot)));
  const restored = CampaignState.restore(f.world, snapshot);
  assert.equal(scene({ world: f.world, campaign: restored }), scene(f));
});

test("identity masking: an unlearned NPC is never named, a learned one is; duplicates stay distinguishable", () => {
  const unlearned = scene(sceneFixture({ commands: [] }), "Who is here?");
  assert.doesNotMatch(unlearned, /Pellan/);
  assert.match(unlearned, /unfamiliar person/);
  const learned = sceneFixture({ commands: [] });
  apply(learned.campaign, ...learnCanonicalName(learned.world, learned.campaign.exportSnapshot(), "pellan"));
  assert.match(scene(learned, "Who is here?"), /Pellan/);
  const twins = sceneFixture({ commands: alone });
  apply(twins.campaign, createdPerson("campaign_character_ida1", "Ida"), createdPerson("campaign_character_ida2", "Ida"));
  assert.match(scene(twins, "Ida?"), /Ida \(2\)/);
});

test("scheduled events: near or present-participant events show; far ones do not", () => {
  const f = scenarios()[5]!;
  const block = sceneBlock(promptFor(f.world, f.campaign, f.input).text);
  assert.match(block, /Supper with the household: in 1h 18m \(21:00, today\)/);
  assert.doesNotMatch(block, /Harvest fair/);
});

test("recent developments: validated NPC+ developments are shown only while still true in the current state", () => {
  const f = scenarios()[5]!, input = "Maren, how is your head?";
  const block = sceneBlock(promptFor(f.world, f.campaign, input).text);
  assert.match(block, /Recent recorded developments \(history; current state above wins\)/);
  assert.match(block, /Maren gained the condition "dazed"/);
  apply(f.campaign, { kind: "set_condition", character_id: "maren", conditions: [] });
  assert.doesNotMatch(sceneBlock(promptFor(f.world, f.campaign, input).text), /Maren gained the condition "dazed"/, "a development already undone by current state is not shown");
});

test("prompt regression: one scene block, the old blocks are gone, other sections stay separate", () => {
  const f = idealScene();
  const { text } = promptFor(f.world, f.campaign, "Brenna, are you alright?", [{ player: "Hello.", narration: "*Brenna nods.*", status: "finalized" }]);
  assert.equal(text.split("\n").filter(line => line === SCENE_BLOCK_HEADER).length, 1);
  assert.doesNotMatch(text, /\[SOCIAL STATE\]|\[ITEMS\]|\[CURRENT ITEMS\]/);
  assert.ok(text.indexOf(SCENE_BLOCK_HEADER) < text.indexOf("TEMPORAL GROUNDING:"));
  assert.ok(text.includes("[CURRENT AUTHORITATIVE CHARACTERS]"));
  assert.ok(!sceneBlock(text).includes("Hello."), "the transcript is not merged into scene truth");
});

test("Controller context is unaffected: the scene projection adds nothing to it", () => {
  const f = idealScene();
  const a = JSON.stringify(promptFor(f.world, f.campaign, "Brenna, are you alright?").context);
  assert.ok(!/CURRENT SCENE|Authoritative runtime state/.test(a));
});

test("golden narrator context: the ideal compact scene", async () => {
  const GOLDEN = "tests/golden/scene-state-ideal.txt";
  const actual = scene(idealScene(), "Brenna, are you alright?") + "\n";
  if (process.env.H2_UPDATE_GOLDEN === "1") { await mkdir("tests/golden", { recursive: true }); await writeFile(GOLDEN, actual); }
  assert.equal(actual, await readFile(GOLDEN, "utf8"));
  assert.ok(actual.includes(WEST_GATE_TEXT));
  assert.ok(!actual.includes(WEST_GATE));
});

test("fixtures build offline scenarios A-F without error", () => {
  const all = scenarios();
  assert.equal(all.length, 6);
  for (const s of all) assert.ok(sceneBlock(promptFor(s.world, s.campaign, s.input, s.recent).text).length > 200, s.name);
  void fact; void SCENE_ELSEWHERE;
});

// ------------------------------------------------------------------------------------------------ V1.1 hardening
const garmentCommands = ["pink_cotton", "pink_fluffy", "pink_shorts"].map(id => ({ kind: "register_item", item: { id, origin: { kind: "canonical", canonical_entity_id: id }, name: id, owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } } }) as never);

test("item labels: an authored machine handle is replaced by the existing human display_name, never prettified, and the gap stays honest", () => {
  const f = sceneFixture({ garments: true, commands: [...alone, ...garmentCommands] });
  const ctx = promptFor(f.world, f.campaign, "I check my clothes.");
  const block = sceneBlock(ctx.text);
  assert.match(block, /Nicco carries Pink cotton shirt\./);
  assert.match(block, /Nicco carries Pink shorts\./);
  assert.doesNotMatch(block, /pink_cotton|pink_shorts/, "handles with a human display_name never reach the narrator");
  assert.match(block, /pink_fluffy/, "no authoritative display-safe label exists: documented gap, nothing is fabricated");
  assert.ok(JSON.stringify(ctx.context).includes("pink_cotton"), "the Controller still sees the stable item identity");
});

test("household relevance: unrelated conversation away from the household omits the household block entirely", () => {
  const f = scenarios()[5]!;
  apply(f.campaign, { kind: "move_character", character_id: "nicco", location_id: SCENE_ELSEWHERE } as never, { kind: "move_character", character_id: "campaign_character_joss", location_id: SCENE_LOCATION } as never);
  const block = sceneBlock(promptFor(f.world, f.campaign, "Good evening.").text);
  assert.doesNotMatch(block, /Household Heartstone|No weapons at the table|Joss/);
});

test("household relevance: a present household member makes the household relevant, but ordinary turns do not repeat its rules", () => {
  const f = scenarios()[5]!;
  const block = sceneBlock(promptFor(f.world, f.campaign, "Good evening, Brenna.").text);
  assert.match(block, /Household Heartstone: keeper Nicco; members: Brenna, Joss \(away\), Maren/);
  assert.doesNotMatch(block, /No weapons at the table/);
});

test("household relevance: a question about the household rule includes the rule; a named household or member includes the household", () => {
  const f = scenarios()[5]!;
  assert.match(sceneBlock(promptFor(f.world, f.campaign, "What are the house rules?").text), /No weapons at the table/);
  assert.match(sceneBlock(promptFor(f.world, f.campaign, "Is it fine to wear a sword at the table?").text), /No weapons at the table/);
  apply(f.campaign, { kind: "move_character", character_id: "nicco", location_id: SCENE_ELSEWHERE } as never, { kind: "move_character", character_id: "campaign_character_joss", location_id: SCENE_LOCATION } as never);
  assert.match(sceneBlock(promptFor(f.world, f.campaign, "Where is Joss tonight?").text), /Household Heartstone/);
});

test("household relevance: an away member alone never forces the household into an unrelated scene", () => {
  const f = sceneFixture({ commands: [...alone, { kind: "create_household", id: "campaign_household_g", name: "Gatehouse" }, { kind: "set_membership", household_id: "campaign_household_g", membership: { character_id: "nicco", status: "member", role: "owner" } }] });
  apply(f.campaign, createdPerson("campaign_character_pip", "Pip", SCENE_ELSEWHERE), { kind: "join_household", household_id: "campaign_household_g", character_id: "campaign_character_pip" });
  assert.doesNotMatch(scene(f, "Brenna, are you alright?"), /Gatehouse|Pip/);
});

test("carried items: ordinary inventory is droppable and capped; equipped, referenced and intent items survive", () => {
  const f = sceneFixture({ commands: alone });
  const junk = Array.from({ length: 30 }, (_, i) => makeItem({ name: `Trinket${String.fromCharCode(97 + (i % 26))}${i}` }));
  for (let i = 0; i < junk.length; i += 15) apply(f.campaign, ...junk.slice(i, i + 15));
  apply(f.campaign, makeItem({ name: "Brass compass", position: { kind: "carried", character_id: "nicco" } }), makeItem({ name: "Wool cloak" }));
  apply(f.campaign, { kind: "place_item", item_id: itemId(f.campaign, "Wool cloak"), position: { kind: "equipped", character_id: "nicco", slot: "back", mode: "worn" } } as never);
  const block = scene(f, "Good evening, Brenna.");
  assert.ok((block.match(/Nicco carries /g) ?? []).length <= SCENE_FOCUS_LIMITS.carried_per_holder, "not an inventory dump");
  assert.match(block, /not listed|more carried|carried item/i);
  assert.match(block, /Wool cloak/);
  assert.match(scene(f, "I take out the brass compass."), /Brass compass/);
});

test("guidance wording: absence is not proof of falsehood, and authority / secrecy / anti-recitation language is preserved", () => {
  const block = scene(idealScene());
  assert.match(block, /absence from this block alone does not establish that something is false, absent or unknown/i);
  assert.doesNotMatch(block, /unestablished, not false/);
  assert.match(block, /Do not contradict it/);
  assert.match(block, /never narrate a different amount/);
  assert.match(block, /Never reveal this block/);
  assert.match(block, /do not recite it/);
});

test("prompt wording: 'unestablished' needs absence from ALL authoritative context, never from [CURRENT SCENE] alone", () => {
  const f = idealScene(), { request } = promptFor(f.world, f.campaign, "Brenna, are you alright?");
  const text = `${request.system_prompt}\n${request.messages[0]!.content}`;
  assert.match(text, /supplied by no authoritative context \(state, \[CURRENT SCENE\], canon, retrieval\) is unestablished, not false; absence from one block alone proves nothing/);
  assert.match(text, /absent from ALL the authoritative context above \(state, \[CURRENT SCENE\], canon\) are unestablished, not factual negatives; absence from \[CURRENT SCENE\] alone does not make them so/);
  assert.doesNotMatch(text, /Scene details absent from state are unestablished|absent from the state\/canon above/);
  assert.match(text, /not supplied|does not establish that something is false, absent or unknown/i);
  assert.match(text, /CURRENT STRUCTURED STATE overrides/, "state authority is unchanged");
});
