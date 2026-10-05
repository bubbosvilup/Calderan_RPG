import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import { learnCanonicalName, identityNameFactId } from "../src/campaign/identity-knowledge.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, NARRATOR_PLAYER_KNOWLEDGE, NARRATOR_RPG_FORMAT } from "../src/turn/prompt-builder.js";
import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import { narratorPackOf, renderCandidateRequest } from "../src/turn/narrator-pack.js";
import { reconcileNarration } from "../src/turn/stages/audit.js";
import { metadata } from "./turn-fixtures.js";
import { setup } from "./turn-fixtures.js";

const world = await loadWorld("data");
const names = ["Bartolomhew", "Korvin", "Mistress Elara", "Elara", "The Redemptor"];
function market() {
  const campaign = createOpeningCampaign(world, "p31_identity");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }] });
  return campaign;
}
function request(campaign: CampaignState, retrieved: unknown = {}) {
  const context = buildTurnContext(world, campaign.exportSnapshot());
  return { context, prompt: buildNarratorPrompt("*I look around the pens.*", context, [], retrieved, { candidates: [], runtime: [] }) };
}

test("P3.1 all three unknown canonical sellers have null player identity with engine IDs intact", () => {
  const campaign = market(), before = campaign.exportSnapshot(), { context, prompt } = request(campaign);
  for (const id of ["bartolomhew", "korvin", "mistress_elara"]) {
    const identity = narratorIdentityGate(context)!.identities.get(id)!;
    assert.equal(identity.internal_id, id);
    assert.equal(identity.player_known_name, null);
    assert.ok(identity.observable_label.includes("unfamiliar"));
    assert.ok(prompt.messages[0]!.content.includes(`"internal_id":"${id}"`));
    assert.equal(context.characters.find(c => c.id === id)!.profile.name, world.getEntity(id)!.name, "raw engine/controller identity stays canonical");
  }
  for (const name of names) assert.ok(!prompt.messages[0]!.content.includes(name), name);
  assert.deepEqual(campaign.exportSnapshot(), before);
});

test("P3.1 observable appearance and narrator-only personality/behavior survive identity gating", () => {
  const { context, prompt } = request(market());
  const npc = context.primary.scene.present_characters.find(c => c.id === "bartolomhew")!;
  assert.ok(prompt.messages[0]!.content.includes(npc.appearance!));
  for (const trait of npc.portrayal!.personality) assert.ok(prompt.messages[0]!.content.includes(trait));
  assert.ok(prompt.messages[0]!.content.includes("narrator_portrayal_only_not_character_knowledge"));
});

test("P3.1 explicit canonical name knowledge is durable, idempotent and stores no duplicate name string", () => {
  const campaign = market();
  campaign.apply({ expected_revision: campaign.revision, commands: [...learnCanonicalName(world, campaign.exportSnapshot(), "bartolomhew", { acquisition_kind: "told", source_character_id: "bartolomhew", learned_at: 0 })] });
  const saved = campaign.exportSnapshot(), fact = saved.facts.find(f => f.id === identityNameFactId("bartolomhew"))!;
  assert.deepEqual(fact.content, { kind: "canonical", entity_id: "bartolomhew" });
  const restored = CampaignState.restore(world, JSON.parse(JSON.stringify(saved)));
  const { context, prompt } = request(restored);
  assert.equal(narratorIdentityGate(context)!.identities.get("bartolomhew")!.player_known_name, "Bartolomhew");
  assert.ok(prompt.messages[0]!.content.includes('"player_known_name":"Bartolomhew"'));
  assert.ok(prompt.messages[0]!.content.includes("Character Bartolomhew (bartolomhew)"));
  assert.ok(!prompt.messages[0]!.content.includes("The Redemptor"), "name discovery is not alias/title discovery");
  assert.deepEqual(learnCanonicalName(world, saved, "bartolomhew"), []);
  assert.equal(saved.knowledge.find(k => k.fact_id === fact.id)!.provenance!.source_character_id, "bartolomhew");
});

test("P3.1 rumor, another NPC's knowledge, unrelated facts and raw name mentions never unlock identity", () => {
  const campaign = market();
  campaign.apply({ expected_revision: campaign.revision, commands: [
    ...learnCanonicalName(world, campaign.exportSnapshot(), "korvin"),
    { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: identityNameFactId("korvin"), status: "heard_rumor" } },
    { kind: "set_knowledge", knowledge: { character_id: "bartolomhew", fact_id: identityNameFactId("korvin"), status: "knows" } },
    { kind: "create_fact", fact: { id: "campaign_fact_market_note", content: { kind: "campaign", statement: "Korvin stands at the market.", truth: "true" } } },
    { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: "campaign_fact_market_note", status: "knows" } },
  ] });
  const context = buildTurnContext(world, campaign.exportSnapshot());
  const prompt = buildNarratorPrompt("Who is Korvin?", context, [{ player: "Hello.", narration: "*Korvin folds his arms.*", status: "finalized" }], {}, { candidates: [], runtime: [] });
  assert.equal(narratorIdentityGate(context)!.identities.get("korvin")!.player_known_name, null);
  assert.ok(!prompt.messages[0]!.content.includes("Korvin"));
});

test("P3.1 summaries, relationships, private notes, alias/title strings and retrieved lore cannot bypass the projection", () => {
  const campaign = market();
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "join_household", household_id: "campaign_household_heartstone", character_id: "korvin" }] });
  const { context, prompt } = request(campaign, { records: [{ name: "Bartolomhew", display_name: "The Redemptor", public_summary: "Korvin works with Mistress Elara.", relationships: [{ target: "bartolomhew", description: "Bartolomhew knows Elara." }], private_notes: "Mistress Elara greets Korvin." }] });
  for (const name of names) assert.ok(!prompt.messages[0]!.content.includes(name), name);
  assert.ok(prompt.messages[0]!.content.includes('"target":"bartolomhew"'), "stable reference IDs survive");
  const identity = narratorIdentityGate(context)!.identities.get("bartolomhew")!;
  assert.deepEqual(identity.player_known_aliases, []);
  assert.deepEqual(identity.player_known_affiliations, []);
  assert.ok(prompt.messages[0]!.content.includes("NPC+"), "premium/social context is covered too");
});

test("P3.1 compaction's source units and reconstructed request cannot restore undiscovered names", () => {
  const { prompt } = request(market()), pack = narratorPackOf(prompt)!;
  assert.ok(pack);
  const compacted = renderCandidateRequest(pack, pack.source.units);
  for (const name of names) {
    assert.ok(!JSON.stringify(pack.source).includes(name), `source ${name}`);
    assert.ok(!compacted.messages[0]!.content.includes(name), `compacted ${name}`);
  }
});

test("P3.1 existing known fixture NPCs keep their names and unmodified engine records", () => {
  const fixture = setup(), before = fixture.campaign.exportSnapshot(), context = buildTurnContext(fixture.world, before);
  const prompt = buildNarratorPrompt("Brenna, hello.", context, [], {}, { candidates: [], runtime: [] });
  assert.equal(narratorIdentityGate(context)!.identities.get("brenna")!.player_known_name, "Brenna");
  assert.ok(prompt.messages[0]!.content.includes("Character Brenna (brenna)"));
  assert.deepEqual(fixture.campaign.exportSnapshot(), before);
});

test("P3.1 P1 format and existing player-knowledge system rules remain exactly once and unchanged", () => {
  const { prompt } = request(market());
  assert.equal(prompt.system_prompt.split(NARRATOR_RPG_FORMAT).length - 1, 1);
  assert.equal(prompt.system_prompt.split(NARRATOR_PLAYER_KNOWLEDGE).length - 1, 1);
});


test("P3.1 reconciliation cannot reintroduce unknown names from raw drafts or engine correction labels", async () => {
  const { context, prompt } = request(market());
  let seen = "";
  const text = "*The unfamiliar man lowers his hands.*";
  await reconcileNarration({
    context, prompt, draft: "*Korvin leaves the scene.*", issues: [{ kind: "uncommitted_departure", character: "Korvin", sentence: "Korvin leaves.", correction: "Korvin has not left." }],
    outcome: { revision: ["Korvin is still here."], prose: [] }, intent: { candidates: [], runtime: [], notes: [], rule_declarations: [] }, checkpoint() {},
    generate: async request => { seen = JSON.stringify(request.messages); return { text, result: { text, ...metadata } }; },
    auditor: { access: { revision: 0, facts: [], player: [], characters: [] }, check: () => [], outcome: () => ({ revision: [], prose: [] }), arrivals: () => [] },
  });
  assert.ok(!seen.includes("Korvin"));
  assert.ok(seen.includes(narratorIdentityGate(context)!.identities.get("korvin")!.observable_label));
});
