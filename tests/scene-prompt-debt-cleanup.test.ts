import test from "node:test";
import assert from "node:assert/strict";
import { buildSceneStateProjection } from "../src/turn/scene-state-projection.js";
import { focusedSceneStateProjection } from "../src/turn/scene-state-focus.js";
import { renderSceneStateProjection, SCENE_RENDER_LIMITS, SCENE_SECTION_SOFT_BUDGETS } from "../src/turn/scene-state-render.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { narratorPortrayalCurrent } from "../src/turn/prompt-builder.js";
import { withoutStatedRelationship, type NpcPlusContext } from "../src/turn/npc-plus.js";
import { largeScene, richScene, RICH } from "../src/dev/scene-foundation-fixtures.js";
import { LORE, SCENE_LOCATION, apply, alone, createdPerson, itemId, makeItem, promptFor, sceneBlock, sceneFixture } from "../src/dev/scene-state-fixtures.js";

/**
 * Consolidation Pass A: Scene Projection / prompt debt cleanup. The narrator-facing state gets smaller and less repetitive; every omission is
 * silence (never a negative claim) and the certified contract is unchanged. Synthetic public fixtures only; no network, nothing under data/.
 */
type Fixture = { world: ReturnType<typeof richScene>["world"]; campaign: ReturnType<typeof richScene>["campaign"] };
const scene = (f: Fixture, input = "Brenna, are you alright?") => sceneBlock(promptFor(f.world, f.campaign, input).text);
const SECTION_END = /^(?:Character state:|Items:|Player:|Knowledge \(|Social \(|Scheduled:|Recent recorded developments|TEMPORAL)/;
/** The body (title included) of one CURRENT SCENE section, up to the next section title. */
function section(block: string, title: string): string {
  const lines = block.split("\n"), start = lines.findIndex(l => l.startsWith(title));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && SECTION_END.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}
const body = (text: string) => text.split("\n").slice(1);
const NO_IGNORANCE = /does not know|doesn't know|is unaware|ignorant of|cannot know|knows nothing/i;
let large: Fixture;
const bigScene = () => (large ??= largeScene());

// ------------------------------------------------------------------------------------------------ phase 2: knowledge compaction
test("knowledge: a crowd with no recorded edge is not enumerated, only the differentiated holders are", () => {
  const knowledge = section(scene(bigScene()), "Knowledge (");
  assert.match(knowledge, /known by Nicco; heard only as a rumor by Brenna\./);
  assert.doesNotMatch(knowledge, /no recorded knowledge entry for/, "nobody the turn is about lacks an entry");
  assert.doesNotMatch(knowledge, /Crowd1\b.*Crowd2\b.*Crowd3\b/);
  assert.ok(knowledge.length < 400, `knowledge section stays small (${knowledge.length})`);
  assert.doesNotMatch(knowledge, NO_IGNORANCE);
});

test("knowledge: one fact with one holder renders that holder only; absent edges stay silent, never ignorance", () => {
  const f = sceneFixture({ id: "one_holder", commands: alone });
  apply(f.campaign, { kind: "create_fact", fact: { id: "campaign_fact_solo", content: { kind: "campaign", statement: "The cellar hatch is jammed.", truth: "true" } } },
    { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: "campaign_fact_solo", status: "knows" } });
  const knowledge = section(scene(f, "What about the cellar hatch?"), "Knowledge (");
  assert.match(knowledge, /- "The cellar hatch is jammed\.": known by Nicco\.$/m);
  assert.doesNotMatch(knowledge, /no recorded|Brenna|Maren/);
});

test("knowledge: a question naming two people names exactly those two, a missing edge reads as a missing entry", () => {
  const block = scene(richScene(), "What do Brenna and Maren know about the eastern bridge?");
  assert.match(block, /"The eastern bridge is closed\." \[the claim is false\]: known by Nicco; believed by Maren; no recorded knowledge entry for Brenna\./);
  assert.doesNotMatch(block, /no recorded knowledge entry for[^\n]*Gerome/, "Gerome is present but the turn is not about him");
  assert.doesNotMatch(block, NO_IGNORANCE);
  assert.match(block, /having no entry is not proof a person is ignorant/);
});

test("knowledge: Character Knowledge Access is untouched - everyone without permission is still told DO NOT USE there", () => {
  const f = richScene(), { text } = promptFor(f.world, f.campaign, "Brenna, are you alright?");
  const access = text.slice(text.indexOf("[CHARACTER KNOWLEDGE ACCESS]"), text.indexOf("[HARD CHARACTER CONSTRAINTS]"));
  assert.match(access, /Brenna: CAN USE F2 \(heard_rumor\), F3 \(knows\), H1 \(household_member\); DO NOT USE F1/);
  assert.match(access, /NPC4: CAN USE F1 \(believes\), H1 \(household_member\); DO NOT USE F2, F3/);
  assert.match(access, /DO NOT USE is this turn's permission, not proof of ignorance/);
});

test("knowledge: large-scene knowledge shrinks to what differs (was ~1,900 characters of 'no recorded entry' lists)", () => {
  assert.ok(section(scene(bigScene(), "Brenna and Maren, what do you know about the grain tax?"), "Knowledge (").length < 600);
});

// ------------------------------------------------------------------------------------------------ phase 3: household compaction
test("households: ordinary conversation in a large room shows the engaged household only, never the complement set", () => {
  const social = section(scene(bigScene()), "Social (");
  assert.equal((social.match(/- Household /g) ?? []).length, 1);
  assert.match(social, /Household Heartstone: keeper Nicco; members: Brenna, Maren\./);
  assert.doesNotMatch(social, /House[0-3]|Present but NOT|Crowd\d+, Crowd\d+/);
  assert.match(social, /never inferred from being present or living somewhere/, "presence != membership is stated once, in the header");
});

test("households: nobody engaged means no household at all (members merely in the room do not open one)", () => {
  assert.doesNotMatch(scene(bigScene(), "The evening is quiet."), /- Household /);
});

test("households: a directly engaged member of a secondary household opens that household and no other", () => {
  const social = section(scene(bigScene(), "Crowd7, are you alright?"), "Social (");
  assert.match(social, /Household House1: keeper Nicco; members: Crowd5, Crowd6, Crowd7, Crowd8, Crowd9\./);
  assert.doesNotMatch(social, /Household (?:House0|House2|House3|Heartstone)/);
});

test("households: an explicit household question is the only thing that opens every household, still without a non-member dump", () => {
  const social = section(scene(bigScene(), "Which households are there, and who are the members?"), "Social (");
  assert.ok((social.match(/- Household /g) ?? []).length >= 5);
  assert.doesNotMatch(social, /Present, not members|Present but NOT/, "no engaged or legally tied non-member exists");
});

test("households: an action that touches a household rule shows the rule", () => {
  const f = richScene();
  assert.doesNotMatch(scene(f, "Brenna, are you alright?"), new RegExp(RICH.rule));
  assert.match(scene(f, "I lay my sword on the table."), new RegExp(`Active household rules: "${RICH.rule.replace(/\./g, "\\.")}"`));
});

test("households: a specific non-member the turn is about is named, nobody else is", () => {
  const social = section(scene(richScene(), "Brenna and Gerome, are you both alright?"), "Social (");
  assert.match(social, /Household Heartstone: keeper Nicco; members: Brenna, Maren\.\n  Present, not members: Gerome\./);
  assert.doesNotMatch(section(scene(richScene(), "Brenna, are you alright?"), "Social ("), /Present, not members/);
});

test("households: a legally held person who is not a member is still named so the narrator cannot call them one", () => {
  const f = sceneFixture({ id: "legal_non_member", commands: alone });
  apply(f.campaign, { kind: "create_household", id: "campaign_household_l", name: "Heartstone" },
    { kind: "set_membership", household_id: "campaign_household_l", membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "join_household", household_id: "campaign_household_l", character_id: "maren" },
    { kind: "set_legal_status", character_id: "brenna", status: "enslaved", holder_id: "nicco" });
  // Brenna is neither engaged nor a member, yet she is legally held and present: she is named inside the (Maren-engaged) household.
  const social = section(scene(f, "Maren, are you alright?"), "Social (");
  assert.match(social, /Household Heartstone: keeper Nicco; members: Maren\.\n  Present, not members: Brenna\./);
  assert.match(social, /Brenna: legally enslaved; legal holder Nicco/);
  // ...and opens the household by herself, because she is the person the narrator must not call a member.
  assert.match(section(scene(f, "The evening is quiet."), "Social ("), /Present, not members: Brenna\./);
  assert.doesNotMatch(section(scene(f, "The evening is quiet."), "Social ("), /Maren,/);
});

test("households: the large-scene Social section is a fraction of the certified size", () => {
  assert.ok(section(scene(bigScene()), "Social (").length < 300);
});

// ------------------------------------------------------------------------------------------------ phase 4: background item compaction
test("items: twenty background actors each carrying one ordinary item are omitted, with one honest omission note", () => {
  const items = section(scene(bigScene()), "Items:");
  assert.doesNotMatch(items, /Crowd\d+ carries Bundle/);
  assert.match(items, /further carried or worn items not listed/);
  assert.ok((items.match(/Bundle/g) ?? []).length === 0);
});

test("items: a referenced background item survives, and only it", () => {
  const items = section(scene(bigScene(), "What is in Bundle12?"), "Items:");
  assert.match(items, /- Crowd12 carries Bundle12\./);
  assert.equal((items.match(/carries Bundle/g) ?? []).length, 1);
});

test("items: an engaged carrier still lists what they carry", () => {
  const items = section(scene(bigScene(), "Crowd3, what are you carrying?"), "Items:");
  assert.match(items, /- Crowd3 carries Bundle3\./);
  assert.equal((items.match(/carries Bundle/g) ?? []).length, 1);
});

test("items: something owned by someone else and carried by a bystander stays visible (owner != carrier is never lost)", () => {
  const items = section(scene(richScene(), "Maren, what did you cook?"), "Items:");
  assert.match(items, /- Brenna carries Sword; owner: Nicco\./);
});

test("items: compaction removes nothing from the engine - inventory and the Controller's items are unchanged", () => {
  const f = largeScene({ present: 20 }), before = JSON.stringify(f.campaign.exportSnapshot()), revision = f.campaign.revision;
  const context = buildTurnContext(f.world, f.campaign.exportSnapshot(), { input: "Brenna, are you alright?" });
  const bundles = context.items.filter(i => (i.name ?? "").startsWith("Bundle")).length;
  scene(f);
  assert.equal(bundles, 20, "the Controller context still carries every item");
  assert.equal(JSON.stringify(f.campaign.exportSnapshot()), before);
  assert.equal(f.campaign.revision, revision);
});

// ------------------------------------------------------------------------------------------------ phase 5: identity wording
test("identity: a confidential encounter is an unfamiliar person - no permission wording, no name, no role", () => {
  const f = richScene({ secrets: true, secretNpc: true });
  const block = scene(f, "Who is the stranger by the door?");
  assert.match(block, /^- the unfamiliar person$/m);
  assert.doesNotMatch(block, /confidential|encounter|identity|role and affiliations|not public|hidden|secret/i);
  assert.ok(!block.includes("Seraph"));
  for (const sentinel of Object.values(LORE)) assert.ok(!block.includes(sentinel));
});

// ------------------------------------------------------------------------------------------------ phases 6-8: duplicated prompt blocks
test("[CURRENT AUTHORITATIVE CHARACTERS]: runtime state and technical location ids are not repeated, portrayal and identity stay", () => {
  const f = richScene(), { text } = promptFor(f.world, f.campaign, "Brenna, are you alright?");
  const characters = text.slice(text.indexOf("[CURRENT AUTHORITATIVE CHARACTERS]"), text.indexOf("[PRESENT AND ABLE TO REACT]"));
  assert.doesNotMatch(characters, /current_location|heartstone_lr|"conditions"|winded/);
  assert.match(characters, /Character Brenna \(NPC\d+\): \{"identity":/);
  assert.match(characters, /"profile":\{"name":"Brenna"/);
  assert.match(characters, /Character Nicco \(nicco\): \{"profile":\{"name":"Nicco","aliases":\[\]\},"canonical_awareness":\[\]\}/);
  assert.match(sceneBlock(text), /- Brenna is winded\./, "the condition still has exactly one descriptive owner");
});

test("[CURRENT AUTHORITATIVE CHARACTERS]: state the scene did not render is kept (nothing is lost to a budget omission)", () => {
  assert.deepEqual(narratorPortrayalCurrent({ conditions: ["winded"], current_location: "x", presentation: "p", status: "dead" }, true), {});
  assert.deepEqual(narratorPortrayalCurrent({ conditions: ["winded"], current_location: "x" }, false), { current: { conditions: ["winded"] } });
  assert.deepEqual(narratorPortrayalCurrent({ current_location: "x", mood: "calm" }, true), { current: { mood: "calm" } });
  assert.deepEqual(narratorPortrayalCurrent(undefined, true), {});
});

test("player profile: no permanent household line; the household is described once through relevance and permitted through CKA", () => {
  const f = largeScene(), { text } = promptFor(f.world, f.campaign, "The evening is quiet.");
  assert.doesNotMatch(text, /Household: Heartstone \(owner\)/);
  assert.match(text, /H1 household "Nicco is owner of the household Heartstone\."/, "the permission fact is still listed in CKA");
});

test("NPC+: a relationship CURRENT SCENE already states is not repeated, portrayal / role / history stay", () => {
  const f = richScene(), { text } = promptFor(f.world, f.campaign, "Brenna, are you alright?");
  const npc = text.split("\n").find(l => l.startsWith("NPC+ Brenna"))!;
  assert.ok(npc, "Brenna's Tier B line is present");
  assert.doesNotMatch(npc, /toward Nicco/);
  assert.match(npc, /household role: unestablished/);
  assert.match(npc, /recent \(r\d+\): /);
  assert.match(sceneBlock(text), /Brenna → Nicco: NEUTRAL \(trust low\)/);
});

test("NPC+: both fragment shapes are trimmed only for the stated person, and only that edge", () => {
  const b = "NPC+ Brenna (brenna) — personality: p | voice: v | morality: m | social style: s | household role: r | toward Nicco: trust low, affection none | recent (r4): joined, trust>N:0→L";
  const c = "Brenna: core=a; voice=v; social=s; role=r; N{trust=L,aff=0}; recent=joined";
  const other = "Maren: core=a; role=r; N{trust=M}; recent=joined";
  const npc: NpcPlusContext = { lines: [b, c, other], diagnostics: {} as never };
  const out = withoutStatedRelationship(npc, new Map([["brenna", "Brenna"]])).lines;
  assert.equal(out[0], "NPC+ Brenna (brenna) — personality: p | voice: v | morality: m | social style: s | household role: r | recent (r4): joined, trust>N:0→L");
  assert.equal(out[1], "Brenna: core=a; voice=v; social=s; role=r; recent=joined");
  assert.equal(out[2], other);
  assert.equal(withoutStatedRelationship(npc, new Map()), npc);
});

// ------------------------------------------------------------------------------------------------ phase 9: developments
test("developments: a cleared condition is never restated, a fresh gain and a trust change are", () => {
  const f = richScene();
  assert.doesNotMatch(scene(f, "Maren, are you alright?"), /no longer has the condition/);
  const g = sceneFixture({ id: "dev_gain", commands: alone });
  apply(g.campaign, { kind: "create_household", id: "campaign_household_d", name: "Heartstone" },
    { kind: "set_membership", household_id: "campaign_household_d", membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "join_household", household_id: "campaign_household_d", character_id: "maren" },
    { kind: "set_condition", character_id: "maren", conditions: ["dazed"] });
  const fresh = scene(g, "Maren, how is your head?");
  assert.match(fresh, /Maren gained the condition "dazed" \(0m ago\)/);
  apply(g.campaign, { kind: "runtime_delta", delta: { time_advance_minutes: 45 } });
  const later = scene(g, "Maren, how is your head?");
  assert.match(later, /Maren is dazed\./, "the current state still says it");
  assert.doesNotMatch(later, /gained the condition/, "...so the stale 'gained' history adds nothing");
});

test("developments: history of someone the turn is not about is not shown", () => {
  const block = scene(bigScene(), "Brenna, are you alright?");
  assert.match(block, /Brenna toward Nicco: trust moved from none to low/);
  assert.doesNotMatch(block, /Crowd\d+ toward Nicco/);
});

// ------------------------------------------------------------------------------------------------ phase 10: section budgets
test("budgets: no section of the large scene runs away - each stays within its soft budget plus its required entries", () => {
  const block = scene(bigScene());
  const sizes = {
    state: section(block, "Character state:"), items: section(block, "Items:"), knowledge: section(block, "Knowledge ("), social: section(block, "Social ("),
    scheduled: section(block, "Scheduled:"), developments: section(block, "Recent recorded developments"),
  };
  for (const [name, text] of Object.entries(sizes)) {
    const budget = SCENE_SECTION_SOFT_BUDGETS[name as keyof typeof SCENE_SECTION_SOFT_BUDGETS], chars = body(text).join("\n").length;
    assert.ok(chars <= budget + 160, `${name}: ${chars} chars vs soft budget ${budget} (+ required entries)`);
  }
  assert.ok(block.length < 3_000, `large scene CURRENT SCENE is ${block.length} chars (certified: 5,993)`);
});

test("budgets: over-budget optional entries are dropped whole, with an explicit note; required entries survive", () => {
  const f = largeScene({ present: 40, packs: 0 });
  const context = buildTurnContext(f.world, f.campaign.exportSnapshot(), { input: "Brenna, are you alright?" });
  const projection = buildSceneStateProjection(context);
  const focused = focusedSceneStateProjection(projection, { background: new Set(), foreground: new Set(["brenna"]), input: "Brenna, are you alright?" });
  const rendered = renderSceneStateProjection(focused);
  assert.ok((rendered.dropped.state ?? 0) > 0, "background states beyond the soft budget are dropped");
  assert.match(rendered.text, /more character states? not listed for space\./);
  assert.match(rendered.text, /- Brenna is winded\./);
  assert.match(rendered.text, /- Maren has a minor injury\./);
  assert.ok(rendered.chars <= SCENE_RENDER_LIMITS.max_chars);
  assert.ok(rendered.states.includes("Brenna"));
  for (const line of rendered.text.split("\n")) assert.ok(!/ is winded$/.test(line) || line.endsWith("."), "no half sentence");
});

test("budgets: a referenced item survives an exhausted Items budget", () => {
  const f = largeScene({ stored: 60 });
  const items = section(scene(f, "I pick up Crate55."), "Items:");
  assert.match(items, /Crate55 is stored here/);
});

// ------------------------------------------------------------------------------------------------ phase 13/14: determinism and contract
test("determinism: same snapshot + input + focus = same CURRENT SCENE byte for byte, across independently built fixtures", () => {
  const a = scene(largeScene(), "Brenna, are you alright?"), b = scene(largeScene(), "Brenna, are you alright?"), c = scene(bigScene(), "Brenna, are you alright?");
  assert.equal(a, b);
  assert.equal(a, c);
  assert.equal(scene(bigScene(), "Crowd7, are you alright?"), scene(bigScene(), "Crowd7, are you alright?"));
});

test("contract: cleanup leaks no ids, visuals or hidden names, mutates nothing, and the transcript stays subordinate", () => {
  const f = largeScene(), before = JSON.stringify(f.campaign.exportSnapshot());
  for (const input of ["Brenna, are you alright?", "What is in Bundle3?", "Which households are there?", "Crowd2 and Crowd3, what do you know about rumor number 2?"]) {
    const block = scene(f, input);
    for (const re of [/campaign_(?:item|fact|event|character|household)_/, /SECRET_VISUAL_SENTINEL/, /Seraph/, /\bsprite\b/i, /heartstone_lr/]) assert.doesNotMatch(block, re, `${input}: ${re}`);
    assert.doesNotMatch(block, NO_IGNORANCE);
    assert.ok(block.length <= SCENE_RENDER_LIMITS.max_chars);
  }
  assert.equal(JSON.stringify(f.campaign.exportSnapshot()), before);
});

test("contract: absence from CURRENT SCENE alone still proves nothing (guidance and unestablished rule intact)", () => {
  const f = richScene(), { text } = promptFor(f.world, f.campaign, "Brenna, are you alright?");
  assert.match(sceneBlock(text), /absence from this block alone does not establish that something is false, absent or unknown/);
  assert.match(text, /\[UNESTABLISHED DETAILS\]\nAccessories, extra possessions and permanent scene details absent from ALL the authoritative context above/);
  assert.match(sceneBlock(text), /Time: 19:42 — Evening/);
});

test("regression: a created bystander handing over an item the player names is engaged through the intent, not dropped as background", () => {
  const f = sceneFixture({ id: "intent_engaged", commands: alone });
  apply(f.campaign, createdPerson("campaign_character_vendor", "Ida", SCENE_LOCATION), makeItem({ name: "Satchel", position: { kind: "carried", character_id: "campaign_character_vendor" } }));
  assert.ok(itemId(f.campaign, "Satchel"));
  assert.match(scene(f, "Ida, show me the satchel."), /Ida carries Satchel\./);
});
