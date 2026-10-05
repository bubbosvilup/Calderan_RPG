import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { participatesInScene } from "../src/turn/scene-participation.js";
import { deduplicateRecovered, retrievedSourceHandles } from "../src/turn/npc-plus.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { auditNarration } from "../src/turn/narration-audit.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { retrieveForTurn } from "../src/turn/retrieval-policy.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { turnFixture } from "../src/dev/turn-fixture.js";

/** NPC+ Pass 4: absent_participant flags participation, not mention; same-turn duplicate canon is removed by source identity. */

// ================================================================================================ participation detector
const ALLOW = [
  "Brenna did not follow. She stayed upstairs.", "Brenna did not follow.", "She stayed upstairs, and Brenna stayed with her.", "Brenna stayed upstairs.",
  "Korvin is a slaver who works at the market.", "Korvin usually works at the slave market.", "I remember what Korvin told me.", "What do I know about Korvin?",
  "Nicco remembers Korvin.", "According to Korvin, the auction starts at dawn.", "Korvin had told him yesterday that prices were rising.", "What Brenna said earlier still bothered him.",
  "Korvin said yesterday that the cages were full.", "If Korvin were here, he would haggle.", "Korvin isn't here.", "Korvin sells enslaved people through a licensed operation.",
  "Korvin's stall stands empty.", "Brenna, Gerome and Maren remain above.", "Nicco thinks of Brenna upstairs.", "Brenna used to sit by that window.", "Korvin never comes here.",
  // Pass 4 live finding: a name as a preposition's object is not the subject of the following verb.
  "What Nicco knows of Korvin comes from local canon about Calderan.", "Talk about Korvin makes him uneasy.",
];
const FLAG = [
  "Brenna walks into the hall.", "Korvin says the price is fair.", '"Pay me," Korvin says.', '"Pay me," says Korvin.', "Korvin hands Nicco the key.", "Brenna stands beside Nicco.",
  "Korvin looks at him and laughs.", "Nearby, Korvin sat hunched at the counter.", "Brenna follows him down the stairs into the hall.", "Korvin is here, arms folded.",
  "Nicco hands Brenna the boots.", "Korvin, the slaver, steps forward.", "Brenna is standing at the door.", "Korvin quietly takes the coins.",
];
test("participation matrix: references ABOUT an absent character are allowed; current participation BY them is caught", () => {
  for (const s of ALLOW) assert.equal(participatesInScene(s, ["Brenna", "Korvin"]), false, `allow: ${s}`);
  for (const s of FLAG) assert.equal(participatesInScene(s, ["Brenna", "Korvin"]), true, `flag: ${s}`);
  // Deterministic.
  for (const s of [...ALLOW, ...FLAG]) assert.equal(participatesInScene(s, ["Brenna", "Korvin"]), participatesInScene(s, ["Brenna", "Korvin"]));
});

// ================================================================================================ audit integration
const audit = (narration: string, input = "I look around.") => {
  const f = turnFixture();
  // Nicco goes down to the hall: Brenna, Gerome and Maren (authored) are absent there.
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "test_hall" } }] });
  const s = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, s), intent = { candidates: [], runtime: [] };
  return auditNarration({ narration, context, world: f.world, access: projectKnowledgeAccess(context, undefined), evidence: deriveTurnEvidence(intent, narration, context), diagnostics: [], committed: [], prepared: s, player_input: input })
    .filter(i => i.kind === "absent_participant").map(i => i.character);
};
test("audit: absent authored NPCs are flagged only when they participate; created-character protection is unchanged", () => {
  assert.deepEqual(audit("The hall is quiet. Brenna did not follow. She stayed upstairs."), []);
  assert.deepEqual(audit("Behind him, the stairwell stays empty; Brenna, Gerome and Maren remain above."), []);
  assert.deepEqual(audit("Brenna walks into the hall and sits by the hearth."), ["Brenna"]);
  assert.deepEqual(audit('"You left me behind," Maren says from the doorway.'), ["Maren"]);
  // Created characters: participation still flagged; remembering their exit still allowed (existing ABSENCE rule).
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "register_character", character: { id: "campaign_character_dell", origin: { kind: "created" }, profile: { name: "Dell Harrow" }, current: { current_location: "test_remote", status: "active" } } }] });
  const s = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, s);
  const kinds = (narration: string) => auditNarration({ narration, context, world: f.world, access: projectKnowledgeAccess(context, undefined), evidence: deriveTurnEvidence({ candidates: [], runtime: [] }, narration, context), diagnostics: [], committed: [], prepared: s, player_input: "Hello." }).filter(i => i.kind === "absent_participant").length;
  assert.equal(kinds("Nearby, Dell Harrow sat hunched and brooding at the counter."), 1);
  assert.equal(kinds("The stool Dell had left stands empty."), 0);
  assert.equal(kinds("Nicco remembers Dell Harrow's sullen face."), 0);
});

// ================================================================================================ de-duplication
test("de-duplication: an H3-retrieved source appears once; recovery without retrieval is kept; private sources never take the public path", async () => {
  const world = await loadWorld("data");
  const c = createOpeningCampaign(world, "npcplus4_dedup");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: "korvin" } as CampaignCommand] });
  const input = "What do I know about Korvin's trade at the market?";
  const context = buildTurnContext(world, c.exportSnapshot(), { input });
  assert.equal(context.npc_plus!.diagnostics.recovered, 1);
  const service = new RetrievalService(world);
  const retrieved = await retrieveForTurn(input, context, world, { service, search: new HybridSearch(service) });
  assert.ok(retrievedSourceHandles(retrieved.data).has("npcmem:korvin:canon:entity"), "H3 retrieval fetched Korvin's entity record");
  const { npc, removed } = deduplicateRecovered(context.npc_plus!, retrieved.data);
  assert.equal(removed, 1);
  const prompt = buildNarratorPrompt(input, context, [], retrieved.data, { candidates: [], runtime: [] }).messages[0]!.content;
  const content = (world.getEntity("korvin") as { content: string }).content;
  assert.equal(prompt.split(narratorIdentityGate(context)!.mask(content.slice(0, 80))).length - 1, 1, "the canon payload appears exactly once");
  assert.match(npc.lines.join("\n"), /\[npcmem:korvin:canon:entity\]: same source as \[RETRIEVED CANON\]/);
  // Without that retrieval, the recovered payload is kept intact.
  const kept = deduplicateRecovered(context.npc_plus!, { records: [] });
  assert.deepEqual([kept.removed, kept.npc], [0, context.npc_plus!]);
  // A private chunk handle is never a recovered line, so de-duplication cannot surface or move it.
  assert.equal(context.npc_plus!.lines.some(l => l.startsWith("Recovered for") && l.includes("private_background")), false);
  assert.equal(context.npc_plus!.lines.join("\n").includes(world.getChunk("korvin.private_background")!.content.slice(0, 40)), false);
  assert.equal(deduplicateRecovered(context.npc_plus!, { records: [{ kind: "chunk", entity_id: "korvin", chunk_id: "korvin.private_background" }] }).removed, 0);
  // Deterministic.
  assert.deepEqual(deduplicateRecovered(context.npc_plus!, retrieved.data), deduplicateRecovered(context.npc_plus!, retrieved.data));
});

test("real canon still works: relevant absent question recovers public canon, unrelated does not; the audit does not flag a mention", async () => {
  const world = await loadWorld("data");
  const c = createOpeningCampaign(world, "npcplus4_canon");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: "korvin" } as CampaignCommand] });
  const s = c.exportSnapshot();
  assert.equal(buildTurnContext(world, s, { input: "What do I know about Korvin's trade at the market?" }).npc_plus!.diagnostics.recovered, 1);
  assert.equal(buildTurnContext(world, s, { input: "What is the weather like?" }).npc_plus!.diagnostics.recovered, 0);
  const context = buildTurnContext(world, s), narration = "Korvin sells enslaved people from a licensed stall at the market. His trade is practical and reliable.";
  const issues = auditNarration({ narration, context, world, access: projectKnowledgeAccess(context, undefined), evidence: deriveTurnEvidence({ candidates: [], runtime: [] }, narration, context), diagnostics: [], committed: [], prepared: s, player_input: "What do I know about Korvin's trade?" });
  assert.equal(issues.some(i => i.kind === "absent_participant"), false);
});
