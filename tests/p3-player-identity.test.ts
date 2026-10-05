import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, NARRATOR_PLAYER_KNOWLEDGE, NARRATOR_RPG_FORMAT } from "../src/turn/prompt-builder.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";

const world = await loadWorld("data");
function market() {
  const campaign = createOpeningCampaign(world, "p3_identity");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }] });
  return campaign;
}
function prompt(campaign: CampaignState, recent: readonly RecentExchange[] = []) {
  const context = buildTurnContext(world, campaign.exportSnapshot());
  return { context, request: buildNarratorPrompt("*I look around the pens.*", context, recent, {}, { candidates: [], runtime: [] }) };
}

test("P3 unknown canonical NPC identity references are not player-known facts or disclosure permission", () => {
  const { context, request } = prompt(market());
  for (const id of ["bartolomhew", "korvin", "mistress_elara"]) {
    const npc = context.characters.find(c => c.id === id)!;
    assert.ok(npc, id);
    assert.ok(npc.profile.name, "canon is retained internally");
    assert.equal(context.facts.some(f => f.statement.includes(npc.profile.name!)), false);
    const access = projectKnowledgeAccess(context, {});
    assert.equal(access.facts.some(f => access.player.includes(f.ref) && f.text.includes(npc.profile.name!)), false);
  }
  assert.equal(request.system_prompt.split(NARRATOR_PLAYER_KNOWLEDGE).length - 1, 1);
  assert.ok(request.system_prompt.includes("not player-known merely because IDs, profiles, visibility or retrieval expose them"));
  assert.ok(!request.system_prompt.includes("name is narratively necessary"));
});

test("P3 unknown NPC appearance and personality remain available for rich observable portrayal", () => {
  const { context, request } = prompt(market());
  const npc = context.primary.scene.present_characters.find(c => c.id === "bartolomhew")!;
  assert.ok(npc.appearance?.includes("tonsure"));
  assert.ok(npc.portrayal?.personality.length);
  assert.ok(request.messages[0]!.content.includes(npc.appearance!));
});

test("P3 authoritative told-name knowledge remains available after transcript loss", () => {
  const campaign = market();
  campaign.apply({ expected_revision: campaign.revision, commands: [
    ...learnCanonicalName(world, campaign.exportSnapshot(), "bartolomhew", { source_character_id: "bartolomhew", acquisition_kind: "told" }),
    { kind: "create_fact", fact: { id: "campaign_fact_bartolomhew_name", content: { kind: "campaign", statement: "The white-blond man introduced himself to Nicco as Bartolomhew.", truth: "true" } } },
    { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: "campaign_fact_bartolomhew_name", status: "knows", provenance: { source_character_id: "bartolomhew", acquisition_kind: "told" } } },
  ] });
  const { context, request } = prompt(campaign);
  assert.ok(context.facts.some(f => f.id === "campaign_fact_bartolomhew_name"));
  assert.ok(request.messages[0]!.content.includes("introduced himself to Nicco as Bartolomhew"));
  assert.ok(request.system_prompt.includes("Preserve identities already established in-world"));
});

test("P3 in-world naming in retained dialogue is an available disclosure, bare canon labels are not", () => {
  const recent: RecentExchange[] = [{ player: "What is your name?", narration: 'The white-blond man says, "My name is Bartolomhew."', status: "finalized" }];
  const campaign = market();
  campaign.apply({ expected_revision: campaign.revision, commands: [...learnCanonicalName(world, campaign.exportSnapshot(), "bartolomhew")] });
  const { request } = prompt(campaign, recent);
  assert.ok(request.messages[0]!.content.includes("My name is Bartolomhew"));
  assert.ok(request.system_prompt.includes("learned them through established player knowledge or an in-world disclosure"));
});

test("P3 hidden titles, affiliations, aliases and personal history receive no permission from portrayal", () => {
  const { context, request } = prompt(market());
  const npc = context.primary.scene.present_characters.find(c => c.id === "bartolomhew")!;
  assert.equal(npc.portrayal?.authority, "narrator_portrayal_only_not_character_knowledge");
  assert.ok(context.characters.find(c => c.id === "bartolomhew")!.profile.aliases?.includes("The Redemptor"));
  assert.ok(request.system_prompt.includes("names, aliases, titles, affiliations, hidden roles and personal history"));
  assert.ok(request.system_prompt.includes("never an unknown name with a disclaimer"));
});

test("P3 established NPCs and P1 format contract are preserved on first and later requests", () => {
  const campaign = market();
  const before = campaign.exportSnapshot();
  for (const recent of [[], [{ player: "*I wait.*", narration: "*The market continues.*", status: "finalized" as const }]]) {
    const { request } = prompt(campaign, recent);
    assert.equal(request.system_prompt.split(NARRATOR_RPG_FORMAT).length - 1, 1);
    assert.equal(request.system_prompt.split(NARRATOR_PLAYER_KNOWLEDGE).length - 1, 1);
  }
  assert.deepEqual(campaign.exportSnapshot(), before, "projection does not change known NPC records or knowledge");
});
