import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { buildPromotedCharacter } from "../src/campaign/promotion.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { buildTurnContext, NAME_PROVENANCE } from "../src/turn/context-builder.js";
import { establishNames } from "../src/turn/name-establishment.js";
import { RecentConversation, type RecentExchange } from "../src/turn/recent-conversation.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";

/**
 * Created name provenance continuity: how a created character's name was learned is a small typed profile fact (`name_source`) set
 * only by name establishment, projected to the narrator as one fixed sentence, so it outlives RecentConversation eviction and reload.
 */
const world = await loadWorld("data");
const LR = "heartstone_lr";
let serial = 0;
const fresh = (location = LR, extra: readonly CampaignCommand[] = []) => {
  const c = new CampaignState(world, `name_provenance_${++serial}`, { player_location: location, world_time: { world_minute: 600 } });
  if (extra.length) c.apply({ expected_revision: c.revision, commands: [...extra] });
  return c;
};
const at = (player: string, narration: string, location = LR): RecentExchange => ({ player, narration, status: "finalized", location_id: location });
function establish(c: CampaignState, recent: readonly RecentExchange[]) {
  const r = establishNames(recent, buildTurnContext(world, c.exportSnapshot()), world, c.exportSnapshot(), [], c.revision);
  c.apply({ expected_revision: c.revision, commands: [...r.commands] });
  return r;
}
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-07T12:00:00.000Z"), world), world).snapshot);
const byName = (c: CampaignState, name: string) => c.exportSnapshot().characters.find(x => x.profile.name === name)!;
/** The narrator prompt after `filler` more completed exchanges evicted everything before them. */
function promptAfterEviction(c: CampaignState, history: readonly RecentExchange[], name: string) {
  const recent = new RecentConversation();
  for (const e of history) recent.add(e);
  for (let i = 0; i < 13; i++) recent.add(at("Hello.", `*${name} nods.*`));
  const context = buildTurnContext(world, c.exportSnapshot());
  return { recent: recent.forPrompt(), context, prompt: JSON.stringify(buildNarratorPrompt("Hello.", context, recent.forPrompt(), {}, { candidates: [], runtime: [] })) };
}
const characterLine = (prompt: string, name: string) => prompt.split("\\n").find(l => l.startsWith(`Character ${name} (`)) ?? "";
const ALL = Object.values(NAME_PROVENANCE);

const WOMAN = at("*lets her rest on the sofa*", "*The tall woman lies on the sofa, her breathing shallow and feverish.*\n\nWhat do I call you.");
const ANSWER = at("name's nicco, i'm the keeper of the heartstone, what about you?", "*Her eyes stay half-open, fixed on his face. Her fingers press flat against the cushion, then relax.*\n\nMira.\n\n*She says it without ceremony.*");

// ------------------------------------------------------------------------------------------------ A: promoted self-disclosure
test("promoted self-disclosed Mira: provenance survives RecentConversation eviction and save/reload, bounded and evidence-preserving", () => {
  const c = fresh();
  const r = establish(c, [WOMAN, ANSWER]);
  assert.deepEqual(r.promoted.map(p => p.name), ["Mira"]);
  const mira = byName(c, "Mira");
  assert.equal(mira.profile.name_source, "self_disclosed");
  assert.ok(mira.origin_snapshot!.evidence.includes('Mira: "Mira."'), "existing origin evidence preserved");
  assert.equal(mira.origin_snapshot!.trigger, "name_established");
  for (const campaign of [c, roundTrip(c)]) {
    const { recent, context, prompt } = promptAfterEviction(campaign, [WOMAN, ANSWER], "Mira");
    assert.ok(!recent.some(e => e.player === ANSWER.player), "the original introduction was evicted");
    const line = characterLine(prompt, "Mira");
    assert.ok(line.includes(NAME_PROVENANCE.self_disclosed), line);
    assert.ok(!line.includes(NAME_PROVENANCE.narrator_introduced) && !line.includes(NAME_PROVENANCE.introduced_by_other));
    assert.doesNotMatch(line, /name_source|self_disclosed/, "no raw enum");
    assert.ok(!line.includes("Mira: "), "no raw origin evidence quote");
    assert.equal(context.characters.find(x => x.profile.name === "Mira")!.established_origin!.name_provenance, NAME_PROVENANCE.self_disclosed);
  }
  assert.equal(roundTrip(c).exportSnapshot().characters.find(x => x.id === mira.id)!.profile.name_source, "self_disclosed");
  // No duplicate name state: one character, and a repeated confirmation adds nothing.
  assert.deepEqual(establish(c, [WOMAN, ANSWER, at("so your name is Mira?", "*She nods.*\nMira.")]).commands, []);
  assert.equal(c.exportSnapshot().characters.filter(x => x.profile.name === "Mira").length, 1);
});

// ------------------------------------------------------------------------------------------------ B: late naming
test("late-named acquired woman: set_profile records self-disclosure on the same record; survives eviction and reload", () => {
  const woman = buildPromotedCharacter({ label: "the woman", established: { sex: "female", descriptor: "woman" }, evidence: ["The woman lies in the cage."], location_id: LR, trigger: "purchase_unnamed_subject", promoted_revision: 1, world_minute: 600 });
  const c = fresh(LR, [{ kind: "register_character", character: woman }]);
  const before = c.exportSnapshot().characters.find(x => x.id === woman.id)!;
  const history = [at("*carries her to the sofa*", "*The woman lies on the sofa, burning with fever.*"), ANSWER];
  const r = establish(c, history);
  assert.deepEqual([r.promoted, r.named.map(n => [n.character_id, n.name])], [[], [[woman.id, "Mira"]]]);
  const after = c.exportSnapshot().characters.find(x => x.id === woman.id)!;
  assert.deepEqual([after.profile.name, after.profile.name_source, after.profile.sex], ["Mira", "self_disclosed", before.profile.sex]);
  assert.deepEqual(after.origin_snapshot, before.origin_snapshot, "origin snapshot stays immutable");
  assert.equal(c.exportSnapshot().characters.length, fresh().exportSnapshot().characters.length + 1, "no second record");
  for (const campaign of [c, roundTrip(c)]) {
    const line = characterLine(promptAfterEviction(campaign, history, "Mira").prompt, "Mira");
    assert.ok(line.includes(NAME_PROVENANCE.self_disclosed), line);
  }
});

// ------------------------------------------------------------------------------------------------ other sources
test("narration and third-party introductions are distinguished from self-disclosure", () => {
  const narrated = fresh();
  establish(narrated, [at("*looks around*", "A thin woman named Lysa sweeps the hearth.")]);
  assert.equal(byName(narrated, "Lysa").profile.name_source, "narrator_introduced");
  assert.ok(characterLine(promptAfterEviction(narrated, [], "Lysa").prompt, "Lysa").includes(NAME_PROVENANCE.narrator_introduced));
  for (const narration of ["*The old man nods toward the woman.*\nThis is Sovela.\n*Sovela coughs into her sleeve.*", 'The old man nods toward the woman. "This is Sovela," he says. Sovela coughs into her sleeve.']) {
    const c = fresh();
    establish(c, [at("*looks around*", narration)]);
    assert.equal(byName(c, "Sovela").profile.name_source, "introduced_by_other", narration);
    const line = characterLine(promptAfterEviction(c, [], "Sovela").prompt, "Sovela");
    assert.ok(line.includes(NAME_PROVENANCE.introduced_by_other) && !line.includes(NAME_PROVENANCE.self_disclosed), line);
  }
});

// ------------------------------------------------------------------------------------------------ negatives
test("unknown provenance says nothing: Nicco's own introduction, weak names, old records and unrelated evidence", () => {
  // Nicco introducing someone is not a third party (and never self-disclosure): unknown.
  const nicco = fresh();
  const r = establish(nicco, [at("*introduces her*", '"This is Sovela," Nicco says. Sovela coughs into her sleeve.')]);
  assert.deepEqual(r.promoted.map(p => p.name), ["Sovela"]);
  assert.equal(byName(nicco, "Sovela").profile.name_source, undefined);
  const niccoLine = characterLine(promptAfterEviction(nicco, [], "Sovela").prompt, "Sovela");
  assert.ok(niccoLine && !ALL.some(s => niccoLine.includes(s)), niccoLine);
  // A weak quote-opening name ("Lysa. Twenty.") establishes the name without a known source.
  const weak = fresh();
  establish(weak, [at("*looks around*", 'The seller pushes the girl forward. "Lysa. Twenty." Lysa coughs. Lysa stares at the floor.')]);
  assert.equal(byName(weak, "Lysa").profile.name_source, undefined);
  const weakLine = characterLine(promptAfterEviction(weak, [], "Lysa").prompt, "Lysa");
  assert.ok(weakLine && !ALL.some(s => weakLine.includes(s)), weakLine);
  // An old save/fixture record without the field, even with self-disclosure-looking evidence, stays unknown (not inferred).
  const old = buildPromotedCharacter({ label: "Mira", established: { name: "Mira", sex: "female", descriptor: "woman" }, evidence: ['Mira: "Mira."', 'Mira: "My name is Mira."'], location_id: LR, trigger: "name_established", promoted_revision: 1, world_minute: 600 });
  assert.equal(old.profile.name_source, undefined);
  const legacy = roundTrip(fresh(LR, [{ kind: "register_character", character: old }]));
  const { context, prompt } = promptAfterEviction(legacy, [], "Mira");
  assert.equal(context.characters.find(x => x.id === old.id)!.established_origin!.name_provenance, undefined);
  assert.ok(characterLine(prompt, "Mira") && !ALL.some(s => prompt.includes(s)));
  // A name_source without a name (unnamed record) says nothing either.
  const unnamed = buildPromotedCharacter({ label: "the girl", established: { descriptor: "girl" }, evidence: [], location_id: LR, trigger: "purchase_unnamed_subject", promoted_revision: 1, world_minute: 600, name_source: "self_disclosed" });
  assert.equal(unnamed.profile.name_source, undefined);
});

test("player naming and canonical P3 identities carry no created-name provenance", () => {
  // "I'll call you Mira" is not a supported durable naming path: nothing is established, so nothing can be mislabeled.
  const c = fresh();
  assert.deepEqual(establish(c, [WOMAN, at("I'll call you Mira.", "*The woman shrugs.*\nMira.")]).commands, []);
  assert.ok(!c.exportSnapshot().characters.some(x => x.profile.name === "Mira"));
  // Canonical Mira Thorne in her shop: no created provenance, no established origin.
  const shop = fresh("mudlarks_herbs");
  const context = buildTurnContext(world, shop.exportSnapshot());
  const thorne = context.characters.find(x => x.id === "mira_thorne")!;
  assert.ok(thorne && thorne.established_origin === undefined && !("name_source" in thorne.profile));
  const prompt = JSON.stringify(buildNarratorPrompt("Hello.", context, [], {}, { candidates: [], runtime: [] }));
  assert.ok(!ALL.some(s => prompt.includes(s)));
});

test("validation rejects an unknown name_source; the narrator addition is one bounded sentence with no IDs or private material", () => {
  const bad = buildPromotedCharacter({ label: "Mira", established: { name: "Mira" }, evidence: [], location_id: LR, trigger: "name_established", promoted_revision: 1, world_minute: 600 });
  const c = fresh();
  assert.throws(() => c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: { ...bad, profile: { ...bad.profile, name_source: "player_assigned" as never } } }] }));
  for (const s of ALL) { assert.ok(s.length <= 90, s); assert.doesNotMatch(s, /_|campaign_character|\d/); }
  // Prompt growth is exactly the provenance key and sentence.
  const named = fresh();
  establish(named, [WOMAN, ANSWER]);
  const id = byName(named, "Mira").id;
  const withSource = promptAfterEviction(named, [], "Mira").prompt;
  const snapshot = structuredClone(named.exportSnapshot()) as ReturnType<CampaignState["exportSnapshot"]>;
  delete (snapshot.characters.find(x => x.id === id)!.profile as { name_source?: string }).name_source;
  const without = promptAfterEviction(CampaignState.restore(world, snapshot), [], "Mira").prompt;
  const growth = withSource.length - without.length;
  assert.ok(growth > NAME_PROVENANCE.self_disclosed.length && growth <= NAME_PROVENANCE.self_disclosed.length + 40, `growth ${growth}`);
  assert.equal(withSource.replace(NAME_PROVENANCE.self_disclosed, "").length < withSource.length, true);
});
