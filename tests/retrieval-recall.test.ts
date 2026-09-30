import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, NARRATOR_SYSTEM } from "../src/turn/prompt-builder.js";
import { entityMentions, queryIntent, retrievalQuery, retrievalRequired, retrieveForTurn, rankForTurn } from "../src/turn/retrieval-policy.js";
import { stem } from "../src/retrieval/lexical-index.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { runTurnRetrievalBenchmark, TURN_RETRIEVAL_CASES } from "../src/dev/turn-retrieval-benchmark.js";
import { groundingManifest } from "../src/dev/lore-grounding.js";

async function opening() {
  const world = await loadWorld("data"), context = buildTurnContext(world, createOpeningCampaign(world, "p1r").exportSnapshot()), service = new RetrievalService(world);
  return { world, context, retrieval: { search: new HybridSearch(service), service } };
}

test("stemming-lite folds plurals only; slave/slavery and mage/magic stay distinct", () => {
  assert.deepEqual(["auctions", "markets", "pens", "slaves", "cities", "classes", "chains", "mages"].map(stem), ["auction", "market", "pen", "slave", "city", "class", "chain", "mage"]);
  assert.deepEqual(["slavery", "magic", "bus", "status", "is", "pen", "42s"].map(stem), ["slavery", "magic", "bus", "status", "is", "pen", "42s"]);
});
test("query cleaning drops participant introductions and roleplay asterisks, keeps other action content", () => {
  assert.equal(retrievalQuery("*stops an ordinary passer-by* \"Excuse me, where is the slave pen?\""), "\"Excuse me, where is the slave pen?\"");
  assert.equal(retrievalQuery("*walks toward the slave market*"), "walks toward the slave market");
});
test("query intent: route > schedule > history > location > lore; listener questions stay unclassified", () => {
  const cases: [string, ReturnType<typeof queryIntent>][] = [
    ["What's the exact route to the slave market from here?", "route"], ["How do I get to the slave market?", "route"], ["When do the slave auctions happen?", "schedule"],
    ["Who owned Heartstone before me?", "history"], ["How long has this tower been empty?", "history"], ["Where is the slave pen?", "location"],
    ["What is Light magic?", "lore"], ["What do people know about Light magic?", "lore"],
    ["Where are you going?", null], ["What is your name?", null], ["Lovely weather today, isn't it?", null], ["When will you be done?", null]];
  for (const [text, intent] of cases) assert.equal(queryIntent(text), intent, text);
});
test("history, schedule and route questions trigger retrieval even without topic words or canon names", async () => {
  const { world, context } = await opening();
  for (const input of ["How long has this tower been empty?", "Who lived here before me?", "What time does it open?", "How do I get there from here? The way to the market?"])
    assert.equal(retrievalRequired(input, context, world), true, input);
});
test("entity mentions: near names with head equivalence, explicit names win, foreign qualifiers block, deixis resolves to the container", async () => {
  const { world, context } = await opening();
  const m = (q: string) => Object.fromEntries(entityMentions(q, context, world));
  for (const q of ["slave market", "slave-market", "slave markets", "slave auction", "slave auctions"]) assert.equal(m(`Where is the ${q}?`).calderan_slave_market, 1, q);
  // The supplied Slave Pens alias now makes these explicit mentions.
  for (const q of ["slave pen", "slave pens"]) assert.equal(m(`Where is the ${q}?`).calderan_slave_market, 2, q);
  assert.deepEqual(m("Where is the slave market in Davenport?"), { davenport: 2 }, "an explicitly named other city blocks the Calderan near-name");
  assert.ok(m("Where is the slave market in Calderan?").calderan_slave_market! >= 1);
  assert.equal(m("How long has this tower been empty?").heartstone, 1);
  assert.equal(m("Who owned Heartstone before me?").heartstone, 2);
  assert.equal(m("Where can I buy slavery supplies?").calderan_slave_market, undefined, "slavery is not slave");
});
test("locality is a tiebreak and explicit naming overrides it; the intended entity survives the cutoff", async () => {
  const { world, context, retrieval } = await opening();
  const ids = async (q: string) => (await rankForTurn(q, context, world, retrieval)).candidates.map(c => c.entity_id);
  assert.equal((await ids("Where is the slave market?"))[0], "calderan_slave_market");
  assert.equal((await ids("Where is the slave market in Davenport?"))[0], "davenport");
  assert.equal((await ids("Tell me about Davenport."))[0], "davenport");
});
test("turn retrieval benchmark: every slave-market variant in top-3; policy top-1 25/25; engine-only ablation recorded", async () => {
  const { world } = await opening(), result = await runTurnRetrievalBenchmark(world);
  for (const row of result.policy.rows.filter(r => r.group === "slave_market")) assert.ok(row.ids.slice(0, 3).includes("calderan_slave_market"), row.query);
  assert.equal(result.policy.cases, TURN_RETRIEVAL_CASES.length); assert.equal(result.policy.top1, 25); assert.equal(result.policy.recall_at_3, 1);
  assert.ok(result.engine_only.top1 < result.policy.top1);
});
test("route, schedule and history questions retrieve the destination/topic and add a generic focus line, never an answer", async () => {
  const { world, context, retrieval } = await opening();
  for (const [input, id, focus] of [["*stops an ordinary passer-by* \"When do the slave auctions happen?\"", "calderan_slave_market", "Schedule question"],
    ["*stops an ordinary passer-by* \"What's the exact route to the slave market from here?\"", "calderan_slave_market", "Route question"],
    ["*stops an ordinary passer-by* \"Who owned Heartstone before me?\"", "heartstone", "History question"],
    ["*stops an ordinary passer-by* \"How long has this tower been empty?\"", "heartstone", "History question"]] as const) {
    const r = await retrieveForTurn(input, context, world, retrieval);
    assert.equal(r.diagnostics.ids[0], id, input);
    const prompt = buildNarratorPrompt(input, context, [], r.data, { candidates: [], runtime: [] }).messages[0]!.content;
    assert.match(prompt, new RegExp(`\\[QUESTION FOCUS\\]\\n${focus}`)); assert.ok(!prompt.includes("question_focus"));
  }
  const chat = await retrieveForTurn("*stops an ordinary passer-by* \"Lovely weather today, isn't it?\"", context, world, retrieval);
  assert.equal(chat.diagnostics.mode, "none");
});
test("history and fixture policy is stated; the review-only detector flags persistent history and fixed fixtures, not personal experience", async () => {
  for (const rule of ["History is canon-bearing", "Being local permits using supplied local canon, not creating history", "\"I've never been inside\"", "\"Before my time\"", "fixed or semi-permanent public fixtures"])
    assert.ok(NARRATOR_SYSTEM.includes(rule), rule);
  const world = await loadWorld("data"), flag = (narration: string) => groundingManifest({ narration, prompt: "", world }).ungrounded.map(f => f.category);
  for (const n of ["\"The old tower? Empty since I was a boy.\"", "\"Belongs to the city, or it did.\"", "\"Tower's been empty long as I've lived in Calderan, and my mother too.\"",
    "\"Tower's been empty long as I can recall.\"", "\"Heartstone was empty for thirty years.\"", "\"The city used to own the tower.\"", "\"Her mother remembered the old owner.\"", "\"The market was founded by the old Duke.\""])
    assert.ok(flag(n).includes("historical_claim"), n);
  for (const n of ["\"I've never been inside.\"", "\"Couldn't tell you.\"", "\"Before my time.\"", "\"Never heard who owned it.\"", "\"No idea how long it's stood empty.\""])
    assert.deepEqual(flag(n), [], n);
  assert.ok(flag("Two children chase each other around a stone drinking trough; an old man dozes on a bench.").includes("permanent_fixture"));
  assert.deepEqual(flag("She sets down a bucket and a cloth bundle, then sips from a cup."), []);
});
