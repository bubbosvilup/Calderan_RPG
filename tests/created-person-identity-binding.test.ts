import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { buildPromotedCharacter } from "../src/campaign/promotion.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { establishNames } from "../src/turn/name-establishment.js";
import { asksName, readScene } from "../src/turn/narrated-captives.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { deriveSessionView } from "../src/app/session-view.js";
import { derivePlayUiView } from "../src/app/play-ui-view.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Created-person identity binding: RPG plain-speech self-disclosure, the reciprocal "what about you?" name question and actor-bound
 * canon first-name collisions, through the existing delivered-narration → establishNames → register_character path. Narration is
 * fixture prose shaped like the long playthrough (stars restored: the transcript copy lost the RPG asterisks); nothing is imported.
 */
const world = await loadWorld("data");
const LR = "heartstone_lr";
let serial = 0;
const fresh = (location = LR, extra: readonly CampaignCommand[] = []) => {
  const c = new CampaignState(world, `identity_binding_${++serial}`, { player_location: location, world_time: { world_minute: 600 } });
  if (extra.length) c.apply({ expected_revision: c.revision, commands: [...extra] });
  return c;
};
const at = (player: string, narration: string, location = LR): RecentExchange => ({ player, narration, status: "finalized", location_id: location });
const names = (c: CampaignState, recent: readonly RecentExchange[]) => establishNames(recent, buildTurnContext(world, c.exportSnapshot()), world, c.exportSnapshot(), [], c.revision);
const promotedNames = (c: CampaignState, recent: readonly RecentExchange[]) => names(c, recent).promoted.map(p => p.name);
const created = (c: CampaignState) => c.exportSnapshot().characters.filter(x => x.origin.kind === "created");
function view(c: CampaignState) {
  const snapshot = c.exportSnapshot();
  return derivePlayUiView(world, snapshot, deriveSessionView(world, snapshot, { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } }));
}

const RECIPROCAL = "name's nicco, i'm the keeper of the heartstone, what about you?";
const CONFIRM = "so your name is Mira?";
/** The woman already in the scene before she names herself (the healed, feverish woman on the sofa). */
const WOMAN = at("*lets her rest on the sofa*", "*The tall woman lies on the sofa, her breathing shallow and feverish. Her fingers rest on the cushion.*\n\nWhat do I call you.");
const LIVE_ANSWER = "*Her eyes stay half-open, fixed on his face. The name lands and she rolls it once, silently. Her fingers press flat against the cushion, then relax.*\n\nMira.\n\n*She says it without ceremony, the way someone gives a fact that doesn't require one.*";
const LIVE_CONFIRM = "*Her eyes open again at the question, not all the way. Then the faintest nod.*\n\nMira.\n\n*She says it once more, as if confirming it to herself.*";

// ------------------------------------------------------------------------------------------------ reciprocal grammar
test("reciprocal name question requires the player's own name introduction earlier in the same input", () => {
  for (const q of [RECIPROCAL, "Name's Nicco, what about you?", "My name is Nicco. What about you?", "I'm Nicco. And you?", "NAME'S NICCO — how about you?",
    "i am nicco, you?", "I’m Nicco… and yours?", "I'm Nicco — what do I call you?", "What's your name?"]) assert.ok(asksName(q), q);
  for (const q of ["I'm tired. What about you?", "I like tea. What about you?", "What about you?", "And you?", "You alright? What about you?", "Tea is good. And you?",
    "I'll call you Mira.", "What about you, Nicco?", "I'm Nicco, nice to meet you.", "What are your names?"]) assert.ok(!asksName(q), q);
});

// ------------------------------------------------------------------------------------------------ exact Mira acceptance (establishNames)
test("exact playthrough: reciprocal question + plain RPG 'Mira.' promotes one active co-located Campaign Character despite absent Mira Thorne", () => {
  const c = fresh(), canonBefore = structuredClone(world.getEntity("mira_thorne"));
  assert.ok(!buildTurnContext(world, c.exportSnapshot()).characters.some(x => x.id === "mira_thorne"), "Mira Thorne is not in Heartstone LR");
  const before = c.exportSnapshot();
  const r = names(c, [WOMAN, at(RECIPROCAL, LIVE_ANSWER)]);
  assert.deepEqual(r.promoted.map(p => p.name), ["Mira"]);
  assert.deepEqual(r.commands.map(x => x.kind), ["register_character"]);
  c.apply({ expected_revision: c.revision, commands: [...r.commands] });
  const after = c.exportSnapshot();
  const [mira, ...others] = created(c);
  assert.equal(others.length, 0);
  assert.equal(mira!.id, r.promoted[0]!.character_id);
  assert.match(mira!.id, /^campaign_character_r\d+_mira$/);
  assert.deepEqual([mira!.profile.name, mira!.profile.sex, mira!.current.status, mira!.current.current_location], ["Mira", "female", "active", LR]);
  const o = mira!.origin_snapshot!;
  assert.deepEqual([o.source, o.trigger, o.location_id, o.established.name, o.established.descriptor], ["narrator_ephemeral", "name_established", LR, "Mira", "woman"]);
  assert.ok(o.evidence.some(e => e === 'Mira: "Mira."'), JSON.stringify(o.evidence)); // attributed evidence preserved
  // Campaign Character only: no NPC+, Household, relationship, knowledge edge, legal status or canon change.
  assert.deepEqual([after.premium_characters, after.households, after.relationships, after.knowledge, after.legal_statuses], [before.premium_characters, before.households, before.relationships, before.knowledge, before.legal_statuses]);
  assert.deepEqual(Object.keys(mira!).sort(), ["current", "id", "origin", "origin_snapshot", "profile"]);
  assert.deepEqual(world.getEntity("mira_thorne"), canonBefore);
  assert.ok(!after.characters.some(x => x.id === "mira_thorne" || /Thorne/.test(x.profile.name ?? "")));
  // In the scene: Nicco and Mira through the existing projections, no membership flag.
  const ui = view(c);
  assert.deepEqual(ui.participants.map(p => p.name).sort(), ["Mira", "Nicco"]);
  // Second-turn confirmation: no duplicate.
  const again = names(c, [WOMAN, at(RECIPROCAL, LIVE_ANSWER), at(CONFIRM, LIVE_CONFIRM)]);
  assert.deepEqual([again.commands, again.promoted], [[], []]);
});

test("explicit confirmation establishes her once when the first reciprocal form was not a name question", () => {
  const c = fresh();
  const first = at("I'm tired. What about you?", LIVE_ANSWER);
  assert.deepEqual(promotedNames(c, [WOMAN, first]), []);
  assert.deepEqual(promotedNames(c, [WOMAN, first, at(CONFIRM, LIVE_CONFIRM)]), ["Mira"]);
});

// ------------------------------------------------------------------------------------------------ end-to-end coordinator turns
function scripted(texts: string[]) {
  const service = new RetrievalService(world);
  return new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream() { const text = texts.shift()!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
}
async function run(co: TurnCoordinator, c: CampaignState, input: string): Promise<TurnResult> {
  const events = await collect(co.runTurn({ campaign: c, player_input: input }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_completed", JSON.stringify(last));
  return (last as { result: TurnResult }).result;
}
test("end-to-end: the reciprocal turn commits Mira atomically; the confirmation turn does not duplicate her", async () => {
  const c = fresh(), co = scripted([LIVE_ANSWER, LIVE_CONFIRM]);
  co.recent(c).add(WOMAN);
  const first = await run(co, c, RECIPROCAL);
  assert.equal(first.narration, LIVE_ANSWER);
  assert.deepEqual(first.identity?.promoted.map(p => p.name), ["Mira"]);
  const id = first.identity!.promoted[0]!.character_id;
  assert.deepEqual(created(c).map(x => [x.id, x.profile.name, x.current.current_location, x.current.status]), [[id, "Mira", LR, "active"]]);
  assert.ok(view(c).participants.some(p => p.name === "Mira"));
  const second = await run(co, c, CONFIRM);
  assert.deepEqual([second.identity?.promoted ?? [], second.identity?.named ?? []], [[], []]);
  assert.equal(created(c).length, 1);
  assert.deepEqual(view(c).participants.map(p => p.name).sort(), ["Mira", "Nicco"]);
  assert.deepEqual([c.exportSnapshot().premium_characters, c.exportSnapshot().households], [[], []]);
});

// ------------------------------------------------------------------------------------------------ other positives
test("RPG and legacy self-introductions under supported name questions", () => {
  const c = fresh();
  assert.deepEqual(promotedNames(c, [at("What's your name?", "*The woman looks up from the cot.*\nSovela.")]), ["Sovela"]);
  assert.deepEqual(promotedNames(c, [at("Who are you?", "*The woman looks up.*\n\nSovela!\n\n*She coughs.*")]), ["Sovela"]);
  assert.deepEqual(promotedNames(c, [at("Name's Nicco. And you?", "*The woman pushes up on one elbow.*\nSovela.")]), ["Sovela"]);
  assert.deepEqual(promotedNames(c, [at("Hello.", "*The woman pushes up on one elbow.*\nMy name is Sovela.")]), ["Sovela"]);
  assert.deepEqual(promotedNames(c, [at("Hello.", "*The woman shrugs.*\nCall me Sovela.")]), ["Sovela"]);
  assert.deepEqual(promotedNames(c, [at("Hello.", '"My name is Sovela," the woman says.')]), ["Sovela"]);
  assert.deepEqual(promotedNames(c, [at("Hello.", 'The woman shrugs. "Call me Sovela."')]), ["Sovela"]);
  assert.deepEqual(promotedNames(c, [at("What's your name?", '"Sovela." the woman says.')]), ["Sovela"]);
});

test("late naming via RPG: an acquired unnamed woman at Heartstone answering 'Mira.' names the SAME record", () => {
  const woman = buildPromotedCharacter({ label: "the woman", established: { sex: "female", descriptor: "woman" }, evidence: [], location_id: LR, trigger: "purchase_unnamed_subject", promoted_revision: 1, world_minute: 600 });
  const c = fresh(LR, [{ kind: "register_character", character: woman }]);
  const r = names(c, [at("*carries her to the sofa*", "*The woman lies on the sofa, burning with fever.*"), at(RECIPROCAL, LIVE_ANSWER)]);
  assert.deepEqual([r.promoted, r.named.map(n => [n.character_id, n.name])], [[], [[woman.id, "Mira"]]]);
  assert.deepEqual(r.commands.map(x => x.kind), ["set_profile"]);
});

// ------------------------------------------------------------------------------------------------ negatives
test("negative: generic reciprocal phrasing, unattributed speech, third parties, player naming and rumors establish nothing", () => {
  const c = fresh();
  const none = (recent: readonly RecentExchange[], why: string) => assert.deepEqual(names(c, recent).commands, [], why);
  none([WOMAN, at("I'm tired. What about you?", LIVE_ANSWER)], "generic reciprocal");
  none([WOMAN, at("Tea is good. And you?", "*The woman looks at him.*\nMira.")], "generic and-you");
  none([WOMAN, at("What about you?", "*The woman looks at him.*\nMira.")], "reciprocal without own name");
  none([at("What's your name?", "Mira.\n\n*Rain taps the shutters.*")], "no preceding beat: unattributed");
  none([at("What's your name?", "*Mira. The word hangs in the room.*")], "narration only");
  none([at("What's your name?", "*The old man by the hearth gestures at the cot.*\nHer name is Mira.")], "third party naming (canon first name)");
  none([at("What's your name?", "*The old man by the hearth gestures at the cot.*\nHer name is Sovela.")], "third party naming of someone not acting");
  none([WOMAN, at("I'll call you Mira.", "*The woman shrugs.*\nMira.")], "player naming");
  none([WOMAN, at("I'll call you Sovela.", "*The woman shrugs.*\nFine.")], "player naming, non-colliding");
  none([WOMAN, at("What's your name?", "*The woman stirs.*\nThere was a woman named Mira, once.")], "rumor, canon first name");
  none([WOMAN, at("What's your name?", "*The woman stirs.*\nThere was a woman named Sovela, once.")], "rumor");
  none([at("Rest now.", "*The woman sleeps. Nicco watches the fire.*\nNicco thinks of a girl named Mira.")], "narrated memory");
});

test("negative: multiple possible speakers fail safe", () => {
  const c = fresh();
  const none = (recent: readonly RecentExchange[], why: string) => assert.deepEqual(names(c, recent).commands, [], why);
  none([at("What are your names?", "*The two women glance at each other.*\nMira.")], "plural question, plural subject");
  none([at("What's your name?", "*The woman and the girl look up at once.*\nMira.")], "compound subject");
  none([at("What's your name?", "*The woman and the girl look up at once.*\nSovela.")], "compound subject, non-colliding");
  const twoWomen = at("*looks around*", "*The woman sits by the hearth. The girl sits by the window.*");
  none([twoWomen, at("What's your name?", "*She looks up.*\nMira.")], "pronoun with two plausible earlier subjects");
  none([twoWomen, at("What's your name?", "*She looks up.*\nSovela.")], "pronoun with two plausible earlier subjects, non-colliding");
  none([at("What's your name?", "*Nicco waits.*\nMira.")], "speaker is Nicco");
});

test("negative: canonical Mira Thorne is never duplicated — present speaker, full name, or full-name reference", () => {
  // Present and speaking: her own scene (Mudlark's Herbs).
  const shop = fresh("mudlarks_herbs");
  assert.ok(buildTurnContext(world, shop.exportSnapshot()).characters.some(x => x.id === "mira_thorne"), "Mira Thorne is present in her shop");
  for (const narration of ["*The woman behind the counter looks up.*\nMira.", "*The woman behind the counter looks up.*\nMira Thorne.", "*The woman behind the counter looks up.*\nMy name is Mira Thorne."]) {
    assert.deepEqual(names(shop, [at("What's your name?", narration, "mudlarks_herbs")]).commands, [], narration);
  }
  // Absent, but her full name is the referent.
  const c = fresh();
  for (const recent of [[WOMAN, at("What's your name?", "*The woman looks up.*\nMira Thorne.")], [WOMAN, at("What's your name?", "*The woman looks up.*\nMy name is Mira Thorne.")],
    [WOMAN, at("Do you know Mira Thorne? What's your name?", "*The woman looks up.*\nMira.")], [at("Have you heard of Mira Thorne?", "*The woman shrugs.*\nMira Thorne? The herbalist.")]]) {
    assert.deepEqual(names(c, recent).commands, [], recent.at(-1)!.narration);
  }
  assert.deepEqual(created(c), []);
});

test("canon collision is actor-bound only for a described narrated actor; reading without rpg_speech keeps the legacy projection", () => {
  const c = fresh(), recent = [WOMAN, at(RECIPROCAL, LIVE_ANSWER)];
  const legacy = readScene(recent, buildTurnContext(world, c.exportSnapshot()), world);
  assert.ok(legacy.units.some(u => u.text === "Mira." && !u.quoted), "purchase/audit readers keep their existing projection");
  const rpg = readScene(recent, buildTurnContext(world, c.exportSnapshot()), world, { rpg_speech: true });
  assert.ok(rpg.units.some(u => u.text === "Mira." && u.quoted && u.rpg && u.speaker === "other:woman"));
  // A verb-subject actor ("Mira nods") is not a described narrated actor: the canon first name stays blocked.
  assert.deepEqual(names(c, [at("What's your name?", "*Mira nods slowly.*\nMira.")]).commands, []);
});
