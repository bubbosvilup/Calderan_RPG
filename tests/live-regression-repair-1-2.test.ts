import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { auditNarration } from "../src/turn/narration-audit.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { TurnCoordinator, type TurnDebugRecord } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { OpenRouterClient } from "../src/llm/openrouter/client.js";
import { DeepSeekStateControllerProvider, DEFAULT_CONTROLLER_MODEL } from "../src/llm/openrouter/deepseek-controller.js";
import { parseControllerProposal } from "../src/llm/controller-schema.js";
import { ProviderError } from "../src/llm/errors.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Live NPC Regression Repair 1.2: controller parse diagnostics, dialogue premise, gesture/thought agency, Mereth retraction. */
const RETURN_INPUT = "Thanks *he said to them, after which he decides to give them back the boots*\nYou'll need them more than me";
const BOOTS = "campaign_item_repair_boots";
const world = await loadWorld("data");
const boots = (owner: string) => ({ kind: "register_item", item: { id: BOOTS, origin: { kind: "created" }, name: "pair of leather boots", owner_id: owner, position: { kind: "carried", character_id: owner } } }) as unknown as CampaignCommand;
function scene(npc: string, extra: readonly CampaignCommand[] = []) {
  const c = createOpeningCampaign(world, `repair12_${npc}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { character_movements: [{ character_id: npc, current_location: "heartstone_square" }] } }, ...extra] });
  return c;
}
function audit(c: CampaignState, input: string, narration: string) {
  const snapshot = c.exportSnapshot(), context = buildTurnContext(world, snapshot), intent = playerIntent(input, context, snapshot, world);
  return auditNarration({ narration, context, world, access: projectKnowledgeAccess(context, {}), evidence: deriveTurnEvidence(intent, narration, context), diagnostics: [], committed: [], prepared: snapshot, player_input: input }).map(i => i.kind);
}
const MALFORMED = '{"commands":[{"command":{"kind":"transfer_item","item_id":"campaign_item_repair_boots","owner_id":"nicco"},"evidence_quote":"Mira hands the boots to Nicco."}]}';
const controllerReturning = (content: string) => new DeepSeekStateControllerProvider(new OpenRouterClient({ api_key: () => "test-key-not-real", fetch: (async () => Response.json({ model: "deepseek/test", choices: [{ message: { content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 } })) as typeof fetch }));

// ------------------------------------------------------------------------------------------- 1. raw controller diagnostics
test("1.2 controller: a strict-parse failure keeps raw output, metadata, expected schema and reason; parsing is not weakened", async () => {
  await assert.rejects(controllerReturning(MALFORMED).propose({ player_action: "", prior_state: "", final_narration: "" }), (error: unknown) => {
    assert.ok(error instanceof ProviderError); assert.equal(error.code, "structured_output_invalid");
    const d = error.diagnostic!;
    assert.equal(d.raw_text, MALFORMED); assert.equal(d.model, DEFAULT_CONTROLLER_MODEL); assert.equal(d.finish_reason, "stop");
    assert.deepEqual(d.usage, { prompt_tokens: 10, completion_tokens: 7, total_tokens: 17 });
    assert.match(d.expected_schema, /campaign_proposal_with_evidence/); assert.match(d.parse_error, /^schema_mismatch/);
    assert.ok(!JSON.stringify(error).includes("test-key-not-real"));
    return true;
  });
  assert.throws(() => parseControllerProposal(MALFORMED)); // still rejected
  const diagnose = async (text: string) => { try { await controllerReturning(text).propose({ player_action: "", prior_state: "", final_narration: "" }); } catch (e) { return (e as ProviderError).diagnostic!.parse_error; } return "parsed"; };
  assert.match(await diagnose("{not json"), /^json_parse_error/);
  assert.match(await diagnose("{\"commands\":[{\"command\":{\"kind\":\"transfer_item\",\"item_id\":\"bad id!\",\"position\":{\"kind\":\"carried\",\"character_id\":\"nicco\"},\"mode\":\"handoff\"},\"evidence_quote\":\"x\"}]}"), /^campaign_validation_error/);
});
test("1.2 controller: the diagnostic reaches only the debug sink, never player-facing events", async () => {
  const c = scene("mira_thorne", [boots("mira_thorne")]), records: TurnDebugRecord[] = [];
  const narrator: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: "Mira hands the boots to Nicco." }; yield { type: "completed", result: { text: "Mira hands the boots to Nicco.", ...metadata } }; } };
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, narrator, controllerReturning(MALFORMED), { service, search: new HybridSearch(service) }, { debug_sink: r => records.push(r) });
  const events = await collect(coordinator.runTurn({ campaign: c, player_input: "Mira Thorne gives Nicco a pair of leather boots." }));
  const last = events.at(-1)!;
  assert.equal(last.type, "turn_failed"); assert.equal((last as { provider_code?: string }).provider_code, "structured_output_invalid");
  assert.ok(!JSON.stringify(events).includes("evidence_quote"), "raw controller output never appears in events");
  assert.equal(records.length, 1);
  const r0 = records[0] as Extract<TurnDebugRecord, { kind: "controller_parse_failure" }>;
  assert.deepEqual([r0.kind, r0.campaign_id, r0.base_revision, r0.stage, r0.raw_text], ["controller_parse_failure", "repair12_mira_thorne", c.revision, "controller_failed", MALFORMED]);
  // Without a sink nothing is retained anywhere.
  const quiet = await collect(new TurnCoordinator(world, narrator, controllerReturning(MALFORMED), { service, search: new HybridSearch(service) }).runTurn({ campaign: scene("mira_thorne", [boots("mira_thorne")]), player_input: "Hello." }));
  assert.equal(quiet.at(-1)!.type, "turn_failed");
});

// ---------------------------------------------------------------------------------------------- 2. dialogue premise
test("1.2 premise: NPC dialogue may not presuppose a gift that never happened (exact Mereth line)", () => {
  const c = scene("sister_mereth", [boots("sister_mereth")]);
  const mereth = "Sister Mereth's grey eyebrows lift slightly. \"I don't give gifts twice,\" she says. \"Keep them, sell them, or leave them on the street. They aren't coming back to me.\" The leather boots remain in her hands, unaccepted.";
  assert.ok(audit(c, RETURN_INPUT, mereth).includes("false_premise"));
  for (const line of ["\"They're yours now,\" she says.", "\"I won't take them back,\" she says.", "\"I already gave them to you,\" she says.", "\"Your boots are fine,\" she says."])
    assert.ok(audit(c, RETURN_INPUT, `Sister Mereth frowns. ${line}`).includes("false_premise"), line);
  for (const line of ["\"I never actually gave them to you,\" she says.", "\"You can't return what I still have,\" she says.", "\"I was offering them, not handing them over,\" she says.", "\"If I had given them to you, I wouldn't take them back,\" she says."])
    assert.ok(!audit(c, RETURN_INPUT, `Sister Mereth frowns. ${line}`).includes("false_premise"), line);
  // Outside a give-back turn (an ordinary offer), "keep them" is ordinary speech.
  assert.ok(!audit(c, "Sister Mereth gives Nicco a pair of leather boots.", "\"Take them. Keep them,\" Sister Mereth says, holding them out.").includes("false_premise"));
  // When Nicco really holds the boots, the same line is correct.
  const held = scene("sister_mereth", [boots("nicco")]);
  assert.ok(!audit(held, RETURN_INPUT, mereth.replace(" The leather boots remain in her hands, unaccepted.", "")).includes("false_premise"));
});

// ---------------------------------------------------------------------------------------------- 3. gestures and thoughts
test("1.2 agency: unauthored gestures, beliefs, thoughts and feelings are flagged (exact Livia sentence)", () => {
  const c = scene("livia_marr", [boots("livia_marr")]);
  assert.ok(audit(c, RETURN_INPUT, "Nicco spoke to empty air, gesturing vaguely toward where he thought someone stood.").includes("player_agency"));
  for (const s of ["Nicco gestures toward the tower.", "Nicco nods.", "Nicco smiles knowingly.", "Nicco thinks she is lying.", "Nicco believes nobody is there.", "Nicco decides she is dangerous.", "Nicco suspects a trick.", "Nicco looks embarrassed.", "Nicco feels afraid."])
    assert.ok(audit(c, "Hello.", `Livia Marr waits. ${s}`).includes("player_agency"), s);
});
test("1.2 agency: authored gestures, involuntary consequences and authored transfers stay allowed", () => {
  const c = scene("livia_marr", [boots("livia_marr")]);
  const allowed: readonly [string, string][] = [
    ["*he nods*", "Nicco nods."],
    ["*he smiles at Livia*", "Nicco smiles at her."],
    ["*he thinks she is lying*", "Nicco thinks she is lying."],
    ["Hello.", "Nicco is shoved back a step."],
    ["Hello.", "Nicco is struck and his head snaps back."],
    ["Hello.", "Nicco loses his balance."],
    ["Hello.", "Nicco's hand is pushed aside."],
    ["\"Who are you?\"", "Nicco asks, \"Who are you?\" Livia Marr shrugs."],
    ["Hello.", "Nicco watches as Livia smiles."],
  ];
  for (const [input, s] of allowed) assert.ok(!audit(c, input, `Livia Marr waits. ${s}`).includes("player_agency"), `${input} → ${s}`);
  const held = scene("livia_marr", [boots("nicco")]);
  assert.ok(!audit(held, RETURN_INPUT, "Nicco extends the boots back toward Livia.").includes("player_agency"));
});

// ------------------------------------------------------------------------------------------- 4. Mereth retraction (live)
test("1.2 evidence: the exact Mereth sentence does not retract an established handover", () => {
  const c = scene("sister_mereth", [boots("sister_mereth")]), context = buildTurnContext(world, c.exportSnapshot());
  const intent = playerIntent("Sister Mereth gives Nicco a pair of leather boots.", context, c.exportSnapshot(), world);
  const text = "Sister Mereth reaches into her document bag and withdraws a pair of worn but serviceable leather boots, passing them over to Nicco. He takes them. \"You'll need proper footwear,\" she says, her grey eyes appraising him with the same frank assessment she might give any of her charges.";
  const ev = deriveTurnEvidence(intent, text, context);
  assert.deepEqual(ev.narrator_refusals, []); assert.ok(ev.narrator_confirmations.length >= 1);
});
