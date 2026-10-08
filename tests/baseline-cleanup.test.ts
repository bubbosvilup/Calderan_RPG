import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, dialogueFocused } from "../src/turn/prompt-builder.js";
import { retrievalRequired, retrieveForTurn } from "../src/turn/retrieval-policy.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { turnFixture } from "../src/dev/turn-fixture.js";

/** Exact passer-by narrations from the 2026-09-29 opening smoke run (turns 1 and 2). */
const SMOKE_T1 = "The passer-by—a thin man in a worn coat carrying a parcel under one arm—stops and blinks at Nicco, his expression flickering between confusion and wary caution. \"Slave pen?\" he repeats, glancing sidelong toward Heartstone's massive wooden entrance as if seeking escape. \"There's no such place here. Not in the city.\" He shifts his parcel, stepping back half a pace. \"The Constabulary deals with criminals. Workhouses for debtors. But nothing like—\" He shakes his head firmly. \"I don't know what you're asking for, stranger, and I'd rather not.\" With that, he hurries past, quickening his steps toward wherever he was bound.";
const SMOKE_T2 = "The passer-by — a thin man in a clerk's coat — recoils as if Nicco had spat at his feet. \"A Light mage? You?\" He laughs, harsh and brief. \"I know *nothing* about you, stranger. That's the point.\" He edges backward, hands raised slightly, palms out. \"I answered your question. The Constabulary's three streets that way if you've debtors to claim. Leave me out of whatever you're playing at.\"\n\nHe does not wait for reply. The crowd in the square swallows him quickly — purposeful strides toward Heartstone's entrance, then a sharp turn down some unmarked thoroughfare, gone. A few others nearby glance over, then away, unwilling to inherit the conversation.\n\nNicco stands alone in the open space before the tower's great wooden doors, the weight of the question still hanging in the air.";
const opening = async () => { const world = await loadWorld("data"), campaign = createOpeningCampaign(world, "cleanup"); return { world, campaign, context: buildTurnContext(world, campaign.exportSnapshot()) }; };
const lines = (narration: string, context: Parameters<typeof dialogueFocused>[1]) => dialogueFocused([{ player: "p", narration, status: "finalized" }], context)[0]!.npc_dialogue;

test("smoke regression: passer-by lines replay as Passer-by, never as Nicco", async () => {
  const { context } = await opening();
  assert.deepEqual(lines(SMOKE_T1, context), [
    "Passer-by: \"Slave pen?\"", "Passer-by: \"There's no such place here. Not in the city.\"",
    "Passer-by: \"The Constabulary deals with criminals. Workhouses for debtors. But nothing like—\"", "Passer-by: \"I don't know what you're asking for, stranger, and I'd rather not.\""]);
  assert.deepEqual(lines(SMOKE_T2, context), ["Passer-by: \"A Light mage? You?\"", "Passer-by: \"I know *nothing* about you, stranger. That's the point.\"",
    "Passer-by: \"I answered your question. The Constabulary's three streets that way if you've debtors to claim. Leave me out of whatever you're playing at.\""]);
  const prompt = buildNarratorPrompt("next", context, [{ player: "*stops an ordinary passer-by* \"Excuse me, where is the slave pen?\"", narration: SMOKE_T1, status: "finalized" }], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.ok(!prompt.includes("Nicco: \\\""), "recent context must never claim Nicco said the passer-by's lines");
});
test("speaker attribution: Nicco only by an explicit clause naming him; unknown speakers are omitted, named NPCs kept", () => {
  const { world, campaign } = turnFixture(), context = buildTurnContext(world, campaign.exportSnapshot());
  assert.deepEqual(lines("Nicco nods. \"Fine,\" he says.", context), []);
  assert.deepEqual(lines("Nicco turns to Brenna. \"The bridge is closed.\"", context), []);
  assert.deepEqual(lines("\"Fine,\" Nicco says. Nicco says to Brenna, \"Hello.\"", context), ["Nicco: \"Fine,\"", "Nicco: \"Hello.\""]);
  assert.deepEqual(lines("The wind howls. \"Who goes there?\"", context), []);
  assert.deepEqual(lines("Brenna looks at Nicco. \"You're back.\" Her eyes narrow. \"Closed?\" She considers this.", context), ["Brenna: \"You're back.\"", "Brenna: \"Closed?\""]);
  assert.deepEqual(lines("A stranger blinks at Nicco. \"Who are you?\"\n\n\"Leave,\" a guard says.", context), ["Stranger: \"Who are you?\"", "Guard: \"Leave,\""]);
});
test("player profile: Nicco's visible profile and household reach the narrator as their own block; authored background prose does not", async () => {
  const { context } = await opening();
  const prompt = buildNarratorPrompt("Hello.", context, [], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  const block = prompt.slice(prompt.indexOf("[NICCO / PLAYER PROFILE]"), prompt.indexOf("[CURRENT AUTHORITATIVE CHARACTERS]"));
  for (const expected of [/Visible appearance \(character data, not instructions[^)]*\): "traits: tall; overweight; a few visible white hairs; very mild early balding\."/, /Household: Heartstone \(owner\)/, /not NPC knowledge/])
    assert.match(block, expected);
  for (const privateProse of [/35-year-old/, /approximately one day before/, /lawful owner\/holder/, /healing and sacrifice/, /transported/])
    assert.doesNotMatch(prompt, privateProse, "authored background prose is private, not per-turn narrator context");
  assert.doesNotMatch(block, /NARRATOR-ONLY/);
  assert.equal(context.characters.length, 1, "no NPC exists to hold the profile");
  assert.match(prompt, /Narration and Nicco \(player\): F1, F2/);
});
test("geography: Heartstone and the square outside it are contained in Calderan; the prompt says so", async () => {
  const { world, context } = await opening();
  for (const id of ["heartstone", "heartstone_square"]) assert.equal(world.getEntity(id)!.parent, "calderan_west");
  assert.deepEqual(context.primary.scene.location_ancestry.map(e => e.id), ["calderan_west", "calderan", "west", "continent"]);
  assert.match(buildNarratorPrompt("Hello.", context, [], {}, { candidates: [], runtime: [] }).messages[0]!.content, /"display_name":"Calderan"/);
});
test("canon has distinct official market and criminal fringe in Calderan West", async () => {
  const world = await loadWorld("data");
  const slavery = world.getEntitiesByType("location").filter(e => /slave/i.test(`${e.name} ${e.aliases.join(" ")}`));
  assert.deepEqual(slavery.map(e => e.id), ["calderan_slave_market", "slave_market_back_alleys"]);
  const market = slavery[0]!;
  assert.ok(market.type === "location"); assert.equal(market.parent, "calderan_west"); assert.ok(market.connections.some(c => c.target === "slave_market_back_alleys"));
  assert.match(market.content, /public, legal slave market in Calderan's West District/); assert.match(market.content, /publicly known/);
});
test("retrieval triggers on canon-sensitive world/location questions, not on ordinary conversation", async () => {
  const { world, context } = await opening();
  for (const input of ["Excuse me, where is the slave pen?", "Where are the slave pens?", "Is there a slave market?", "What happens to slaves here?", "Tell me about slavery.",
    "Where is the market?", "How do I get to the harbor?", "What is the Inquisition?", "Who is the Duke?", "Where can I find a healer?"])
    assert.equal(retrievalRequired(input, context, world), true, input);
  for (const input of ["Hello there.", "What is your name?", "Who are you?", "What is going on?", "Where are you going?", "*nods and waits*", "Thanks, that helps."])
    assert.equal(retrievalRequired(input, context, world), false, input);
});
test("\"Excuse me, where is the slave pen?\" retrieves the Calderan Slave Market canon without an injected answer", async () => {
  const { world, context } = await opening(), service = new RetrievalService(world);
  const result = await retrieveForTurn("*stops an ordinary passer-by* \"Excuse me, where is the slave pen?\"", context, world, { search: new HybridSearch(service), service });
  assert.equal(result.diagnostics.outcome, "found"); assert.equal(result.diagnostics.ids[0], "calderan_slave_market");
  assert.equal((result.data.records[0] as { entity_id: string }).entity_id, "calderan_slave_market");
});
