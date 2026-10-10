import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { projectKnowledgeAccess, renderKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { buildNarratorPrompt, dialogueFocused, NARRATOR_SYSTEM } from "../src/turn/prompt-builder.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { retrieveForTurn } from "../src/turn/retrieval-policy.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { StateControllerProvider } from "../src/llm/state-controller-provider.js";
import { collect, metadata } from "./turn-fixtures.js";

const ctx = (options: Parameters<typeof turnFixture>[1] = {}) => { const f = turnFixture(false, options); return { ...f, context: buildTurnContext(f.world, f.campaign.exportSnapshot()) }; };
const knowledge: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };

test("projection: facts in context are usable by the player only; NPCs without edges get DO NOT USE", () => {
  const { context } = ctx(), access = projectKnowledgeAccess(context, { records: [], unknown: false });
  assert.deepEqual(access.facts.map(f => [f.ref, f.id]), [["F1", "campaign_fact_bridge_closed"]]);
  assert.deepEqual(access.player, ["F1"]);
  for (const c of access.characters) { assert.deepEqual(c.can_use, []); assert.deepEqual(c.do_not_use, ["F1"]); }
  assert.ok(!access.characters.some(c => c.character_id === "nicco"));
  assert.equal(access.revision, context.primary.runtime_revision);
  const text = renderKnowledgeAccess(access);
  assert.match(text, /Maren: CAN USE none; DO NOT USE F1/); assert.match(text, /F1 campaign_fact_bridge_closed "The eastern bridge is closed\."/);
});
test("projection is character-specific: Brenna may use the fact, Maren may not", () => {
  const text = renderKnowledgeAccess(projectKnowledgeAccess(ctx({ brennaKnowsBridge: true }).context, {}));
  assert.match(text, /Brenna: CAN USE F1 \(knows\); DO NOT USE none/); assert.match(text, /Maren: CAN USE none; DO NOT USE F1/);
});
test("belief statuses are carried into the permission", () => {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "set_knowledge", knowledge: { character_id: "maren", fact_id: "campaign_fact_bridge_closed", status: "believes" } }] });
  assert.match(renderKnowledgeAccess(projectKnowledgeAccess(buildTurnContext(f.world, f.campaign.exportSnapshot()), {})), /Maren: CAN USE F1 \(believes\)/);
});
test("hidden facts are never enumerated, not even as DO NOT USE; unrelated facts are not listed", () => {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_fact", fact: { id: "campaign_fact_unrelated", content: { kind: "campaign", statement: "UNRELATED_SENTINEL", truth: "true" } } }] });
  const access = projectKnowledgeAccess(buildTurnContext(f.world, f.campaign.exportSnapshot()), {}), text = renderKnowledgeAccess(access);
  for (const absent of ["HIDDEN_SECRET_SENTINEL", "campaign_fact_private_secret", "UNRELATED_SENTINEL", "campaign_fact_unrelated"]) assert.ok(!text.includes(absent), absent);
  assert.equal(access.facts.length, 1);
});
test("retrieval grants no NPC access; canonical awareness grants it to that NPC only", async () => {
  const run = async (options: Parameters<typeof turnFixture>[1]) => {
    const { world, context } = ctx(options), service = new RetrievalService(world);
    const retrieved = await retrieveForTurn("What do I know about Ironbound?", context, world, { service, search: new HybridSearch(service) });
    return renderKnowledgeAccess(projectKnowledgeAccess(context, retrieved.data));
  };
  const plain = await run({});
  assert.match(plain, /R1 retrieved canon "ironbound"/); assert.match(plain, /Narration and Nicco \(player\): F1, R1/);
  assert.match(plain, /Brenna: CAN USE none; DO NOT USE F1, R1/); assert.match(plain, /Maren: CAN USE none; DO NOT USE F1, R1/);
  const aware = await run({ ironboundKnownBy: ["brenna"] });
  assert.match(aware, /Brenna: CAN USE R1 \(canonical\); DO NOT USE F1/); assert.match(aware, /Maren: CAN USE none; DO NOT USE F1, R1/);
});
test("narrator prompt carries the access section and no longer implies NPCs may assume unestablished knowledge", () => {
  const { context } = ctx(), prompt = buildNarratorPrompt("Hello", context, [], {}, { candidates: [], runtime: [] });
  const all = prompt.system_prompt + prompt.messages[0]!.content;
  assert.match(all, /\[CHARACTER KNOWLEDGE ACCESS\]/);
  for (const gone of ["Unknown means unestablished", "No edge means awareness is unestablished", "Individual knowledge edges"]) assert.ok(!all.includes(gone), gone);
  assert.match(NARRATOR_SYSTEM, /Character knowledge follows \[CHARACTER KNOWLEDGE ACCESS\]/);
});

// Scripted providers: one narration per call, requests captured, fixed controller proposals.
function scripted(narrations: string[], seen: GenerationRequest[]): NarratorProvider {
  let i = 0;
  return { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = narrations[i++]!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
}
function controller(perTurn: CampaignCommand[][], envelopes: string[] = []): StateControllerProvider { let i = 0; return { async propose(r) { envelopes.push(r.prior_state); return { commands: perTurn[i++] ?? [], ...metadata }; } }; }
async function twoTurns(first: string, proposal: CampaignCommand[], envelopes: string[] = []) {
  const { world, campaign } = turnFixture(), service = new RetrievalService(world), seen: GenerationRequest[] = [];
  const coordinator = new TurnCoordinator(world, scripted([first, "Brenna nods."], seen), controller([proposal, []], envelopes), { service, search: new HybridSearch(service) });
  await collect(coordinator.runTurn({ campaign, player_input: "/tell campaign_fact_bridge_closed to brenna" }));
  await collect(coordinator.runTurn({ campaign, player_input: "Brenna, what does that mean for us?" }));
  return { campaign, seen };
}
test("committed tell: next turn's projection lets Brenna use the fact (follows CampaignState after commit)", async () => {
  const { seen } = await twoTurns("Nicco tells Brenna that the eastern bridge is closed.", [knowledge]);
  assert.match(seen[0]!.messages[0]!.content, /Brenna: CAN USE none; DO NOT USE F1/);
  assert.match(seen[1]!.messages[0]!.content, /Brenna: CAN USE F1 \(knows\)/);
  assert.match(seen[1]!.messages[0]!.content, /NPC3: CAN USE none; DO NOT USE F1/);
});
test("failed tell: permission is unchanged next turn; provisional narration grants nothing", async () => {
  const { seen, campaign } = await twoTurns("Brenna looks worried.", [knowledge]);
  assert.ok(!campaign.exportSnapshot().knowledge.some(k => k.character_id === "brenna" && k.fact_id === "campaign_fact_bridge_closed"));
  assert.match(seen[1]!.messages[0]!.content, /Brenna: CAN USE none; DO NOT USE F1/);
});
test("projection is narrator-only: the controller evidence envelope is unchanged", async () => {
  const envelopes: string[] = [];
  await twoTurns("Nicco tells Brenna that the eastern bridge is closed.", [knowledge], envelopes);
  for (const e of envelopes) { assert.ok(!e.includes("CHARACTER KNOWLEDGE ACCESS")); assert.deepEqual(Object.keys(JSON.parse(e)), ["base_revision", "context", "explicit_intent"]); }
});
test("recent context: dialogue-focused keeps player turns and attributed NPC dialogue, omits narrator description", () => {
  const { context } = ctx();
  const recent = [{ player: "How are you?", narration: "Brenna stretches, bare feet on the stone. \"I'm fine,\" she says.\nMaren shrugs. \"The river is high.\" Gerome waits.", status: "finalized" as const }];
  const [entry] = dialogueFocused(recent, context);
  assert.deepEqual(entry, { player: "How are you?", npc_dialogue: ["Brenna: \"I'm fine,\"", "Maren: \"The river is high.\""], narrator_description: "omitted; current structured state is authoritative" });
  assert.ok(!JSON.stringify(entry).includes("bare feet"));
  const prompt = buildNarratorPrompt("Yes.", context, recent, {}, { candidates: [], runtime: [] }, { recent_context: "dialogue_focused" }).messages[0]!.content;
  assert.match(prompt, /DIALOGUE ONLY/); assert.ok(!prompt.includes("bare feet"));
});
test("recent context: state_last places earlier conversation before the authoritative state; full_prose is unchanged", () => {
  const { context } = ctx(), recent = [{ player: "Hi", narration: "Brenna smiles.", status: "finalized" as const }];
  const last = buildNarratorPrompt("Yes.", context, recent, {}, { candidates: [], runtime: [] }, { recent_context: "state_last" }).messages[0]!.content;
  assert.ok(last.indexOf("[EARLIER CONVERSATION") < last.indexOf("[STATE PRECEDENCE]"));
  assert.ok(last.indexOf("[CURRENT SCENE]") < last.indexOf("[PLAYER ACTION"));
  const full = buildNarratorPrompt("Yes.", context, recent, {}, { candidates: [], runtime: [] }, { recent_context: "full_prose" }).messages[0]!.content;
  const production = buildNarratorPrompt("Yes.", context, recent, {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.match(production, /DIALOGUE ONLY/);
  assert.ok(full.startsWith("[STATE PRECEDENCE]")); assert.ok(full.indexOf("[RECENT CONVERSATION") > full.indexOf("[UNESTABLISHED DETAILS]"));
});
