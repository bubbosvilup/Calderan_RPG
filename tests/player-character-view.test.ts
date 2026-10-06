import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WorldStore } from "../src/world/world-store.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { buildPromotedCharacter } from "../src/campaign/promotion.js";
import { playerCharacterProjection } from "../src/app/player-character-view.js";
import { derivePlayUiView } from "../src/app/play-ui-view.js";
import { deriveSessionView } from "../src/app/session-view.js";

const documents = JSON.parse(await readFile("docs/evaluations/p12-scene-continuity/fixture-world.json", "utf8"));
const policy = (player = true, known_by: string[] = []) => ({ visibility: { player, narrator: true }, known_by });
function fixture(options: { privateOwner?: boolean; unknownName?: boolean; privateRelationship?: boolean } = {}) {
  const docs = structuredClone(documents);
  const source = docs.find((d: any) => d.document.entity.id === "korvin");
  const e = source.document.entity;
  e.base_location = e.location; delete e.location;
  Object.assign(e, { knowledge: policy(!options.privateOwner), work_location: null, home_location: null, species: "Human", sex: "male", age_band: "Adult", appearance: "Grey hair and a worn coat.", occupation: "Hall attendant", purpose: "SECRET_PURPOSE", morality: "SECRET_MORALITY", private_notes: "PRIVATE_NOTES", affiliations: ["public_faction", "secret_faction"], summary: "Korvin keeps the front hall orderly.", aliases: ["Hidden title"], relationships: [
    { target: "nicco", kind: "colleague", description: options.privateRelationship ? "SECRET_RELATIONSHIP" : "A known working relationship.", knowledge: policy(!options.privateRelationship) },
  ] });
  for (const [id, visible, name] of [["public_faction", true, "Hall fellowship"], ["secret_faction", false, "SECRET_AFFILIATION"]] as const) {
    const faction = structuredClone(docs[0]); faction.source = `ui/${id}.yaml`;
    Object.assign(faction.document.entity, { id, type: "faction", name, display_name: name, summary: name, knowledge: policy(visible), members: ["korvin"], territory: [], relations: [] });
    delete faction.document.entity.features; delete faction.document.entity.connections;
    faction.document.chunks = []; docs.push(faction);
  }
  source.document.chunks = [
    { id: "korvin.history", section: "history", content: "He served at the gate before coming here.", knowledge: policy() },
    { id: "korvin.learned", section: "learned", content: "His favorite public story is about a lost bell.", knowledge: policy() },
    { id: "korvin.rumor", section: "rumor", content: "He may have visited the northern gate.", knowledge: policy() },
    { id: "korvin.secret", section: "secret", content: "SECRET_STORY", knowledge: policy(false) },
    { id: "korvin.unlearned", section: "unlearned", content: "UNLEARNED_STORY", knowledge: policy() },
  ].map(c => ({ ...c, entity_id: "korvin", summary: c.content, search_context: "", tags: [] }));
  const world = new WorldStore(docs);
  const campaign = new CampaignState(world, "player_character", { player_location: "audit_room", world_time: { world_minute: 600 } });
  campaign.apply({ expected_revision: campaign.revision, commands: [
    ...(!options.unknownName ? learnCanonicalName(world, campaign.exportSnapshot(), "korvin") : []),
    { kind: "register_character", character: { id: "korvin", origin: { kind: "canonical", canonical_entity_id: "korvin" }, profile: {}, current: { conditions: ["winded", "SECRET_INTERNAL_CONDITION"], presentation: "SECRET_PRESENTATION" } } },
    { kind: "seed_relationship", relationship: { from_character_id: "korvin", to_character_id: "nicco", dimensions: { trust: "high", hostility: "high" }, seed_context: "SECRET_DIMENSION_CONTEXT" } },
    ...["history", "learned", "rumor", "secret"].flatMap(section => [{ kind: "create_fact" as const, fact: { id: `campaign_fact_${section}`, content: { kind: "canonical" as const, entity_id: "korvin", chunk_id: `korvin.${section}` } } }, { kind: "set_knowledge" as const, knowledge: { character_id: "nicco", fact_id: `campaign_fact_${section}`, status: section === "rumor" ? "heard_rumor" as const : "knows" as const } }]),
  ] });
  const project = () => playerCharacterProjection(world, campaign.exportSnapshot()).project("korvin")!;
  return { world, campaign, project };
}

test("public role uses the public character contract", () => assert.equal(fixture().project().role, "Hall attendant"));
test("private-owner role and summary are withheld despite a learned name", () => {
  const card = fixture({ privateOwner: true }).project(); assert.equal(card.role, "Not known"); assert.equal(card.public_summary, null);
  assert.equal(card.name, "Korvin", "a learned name does not grant the private role");
});
test("current observable physical condition is visible while present", () => assert.equal(fixture().project().state, "winded"));
test("arbitrary/internal conditions and presentation never become observable by mere presence", () => {
  assert.doesNotMatch(JSON.stringify(fixture().project()), /SECRET_INTERNAL_CONDITION|SECRET_PRESENTATION/);
});
test("absent current condition and authoritative whereabouts stay hidden", () => {
  const f = fixture(); f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "korvin", location_id: "audit_path" }] });
  const card = f.project(); assert.equal(card.state, "Not recorded"); assert.equal(card.known_location, null); assert.equal(card.where, "Whereabouts not known");
});
test("known canonical relationship prose is visible", () => assert.equal(fixture().project().relationship, "A known working relationship."));
test("secret edge and narrator-only runtime relationship dimensions remain hidden", () => {
  assert.doesNotMatch(JSON.stringify(fixture().project()), /SECRET_RELATIONSHIP|SECRET_DIMENSION_CONTEXT|hostility|trust|dimensions/);
  assert.equal(fixture({ privateRelationship: true }).project().relationship, "Not recorded");
});
test("public faction membership is visible independently of portrayal-only affiliations", () => assert.deepEqual(fixture().project().affiliations, ["Hall fellowship"]));
test("secret affiliation is hidden even when the public character references it", () => assert.doesNotMatch(JSON.stringify(fixture().project()), /SECRET_AFFILIATION|secret_faction/));
test("canonical summary is the policy-bearing public summary", () => assert.equal(fixture().project().public_summary, "Korvin keeps the front hall orderly."));
test("private notes, purpose and morality are never serialized", () => assert.doesNotMatch(JSON.stringify(fixture().project()), /PRIVATE_NOTES|SECRET_PURPOSE|SECRET_MORALITY/));
test("unknown canonical identity is masked inside all public prose without hiding observable appearance", () => {
  const card = fixture({ unknownName: true }).project(); assert.equal(card.name, "Unfamiliar person"); assert.equal(card.name_known, false);
  assert.equal(card.appearance, "Grey hair and a worn coat."); assert.doesNotMatch(JSON.stringify(card), /Korvin|korvin|Hidden title/);
});
test("a known canonical name does not grant unproven profile names or aliases", () => {
  const f = fixture(); f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "set_profile", character_id: "korvin", profile: { name: "UNPROVEN_NAME", aliases: ["UNPROVEN_ALIAS"] } }] });
  const card = f.project(); assert.equal(card.name, "Korvin"); assert.doesNotMatch(JSON.stringify(card), /UNPROVEN_NAME|UNPROVEN_ALIAS/);
});
test("story chunks require Nicco's learned grant, preserve rumor status and exclude secret canon", () => {
  const card = fixture().project(); assert.equal(card.story_facts.length, 3);
  assert.ok(card.story_facts.some(f => f.status === "heard_rumor")); assert.equal(card.history[0]!.source, "Known canon");
  assert.doesNotMatch(JSON.stringify(card), /SECRET_STORY|UNLEARNED_STORY|campaign_fact_|korvin\./);
});
test("name discovery alone never unlocks history, biography or another character's knowledge", () => {
  const f = fixture(); const campaign = new CampaignState(f.world, "name_only", { player_location: "audit_room", world_time: { world_minute: 600 } });
  campaign.apply({ expected_revision: campaign.revision, commands: [...learnCanonicalName(f.world, campaign.exportSnapshot(), "korvin")] });
  const card = playerCharacterProjection(f.world, campaign.exportSnapshot()).project("korvin")!;
  assert.equal(card.name, "Korvin"); assert.deepEqual(card.story_facts, []); assert.deepEqual(card.history, []);
});
test("campaign appearance and sourced history use established origin, never unproven profile overrides", () => {
  const f = fixture();
  const created = buildPromotedCharacter({ label: "Lina", trigger: "name_established", location_id: "audit_room", promoted_revision: f.campaign.revision + 1, world_minute: 600,
    established: { name: "Lina", appearance: ["A linen cap and an old scar."], role: "Porter", condition: ["bruised"], background: [{ text: "She says she worked at the harbor.", source: "self" }] }, evidence: ["Lina introduced herself."] });
  created.profile.appearance = { description: "UNPROVEN_PROFILE_APPEARANCE" };
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "register_character", character: created }] });
  const card = playerCharacterProjection(f.world, f.campaign.exportSnapshot()).project(created.id)!;
  assert.equal(card.appearance, "A linen cap and an old scar."); assert.equal(card.role, "Porter"); assert.equal(card.state, "bruised");
  assert.equal(card.history[0]!.source, "Their account"); assert.doesNotMatch(JSON.stringify(card), /UNPROVEN_PROFILE_APPEARANCE|campaign_character|ephemeral_ref/);
});
test("scene and household reuse the same immutable projection and never mutate committed truth", () => {
  const f = fixture(); f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: "campaign_household_projection" }, { kind: "set_membership", household_id: "campaign_household_projection", membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "join_household", household_id: "campaign_household_projection", character_id: "korvin" },
  ] });
  const snapshot = f.campaign.exportSnapshot(), before = JSON.stringify(snapshot);
  const view = deriveSessionView(f.world, snapshot, { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } });
  const play = derivePlayUiView(f.world, snapshot, view), scene = play.participants.find(p => p.name === "Korvin")!.card!;
  assert.equal(scene, play.household[0]!.members[0]); assert.equal(scene.npc_plus, true);
  assert.ok(scene.affiliations.includes("Nicco's household"));
  assert.ok(Object.isFrozen(scene) && Object.isFrozen(scene.story_facts)); assert.equal(JSON.stringify(f.campaign.exportSnapshot()), before);
});
test("NPC+ delivered self-description quotes are known accounts, not private inferred contract text", () => {
  const f = fixture(); f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: "campaign_household_contract" }, { kind: "set_membership", household_id: "campaign_household_contract", membership: { character_id: "nicco", status: "member", role: "owner" } },
    { kind: "join_household", household_id: "campaign_household_contract", character_id: "korvin" },
  ] });
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "establish_character_contract", character_id: "korvin", field: "voice", text: "PRIVATE_CONTRACT_INTERPRETATION", quote: "I always speak plainly." },
  ] });
  const card = f.project(); assert.ok(card.history.some(h => h.text === "I always speak plainly." && h.source === "Their account"));
  assert.doesNotMatch(JSON.stringify(card), /PRIVATE_CONTRACT_INTERPRETATION|contract_evidence|revision|premium_/);
});
