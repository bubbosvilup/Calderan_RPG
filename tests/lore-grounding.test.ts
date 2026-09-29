import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, dialogueFocused, NARRATOR_SYSTEM } from "../src/turn/prompt-builder.js";
import { retrieveForTurn } from "../src/turn/retrieval-policy.js";
import { SceneParticipants } from "../src/turn/scene-participants.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { groundingManifest, type LoreCategory } from "../src/dev/lore-grounding.js";

const SLAVE_PEN = "*stops an ordinary passer-by* \"Excuse me, where is the slave pen?\"";
async function turnOne() {
  const world = await loadWorld("data"), campaign = createOpeningCampaign(world, "p1q"), context = buildTurnContext(world, campaign.exportSnapshot()), service = new RetrievalService(world);
  const plan = new SceneParticipants().plan(SLAVE_PEN, context);
  const retrieved = await retrieveForTurn(SLAVE_PEN, context, world, { search: new HybridSearch(service), service });
  const prompt = buildNarratorPrompt(SLAVE_PEN, context, [], retrieved.data, { candidates: [], runtime: [] }, {}, plan).messages[0]!.content;
  const check = (narration: string) => groundingManifest({ narration, prompt, world, retrieved_ids: retrieved.diagnostics.ids as readonly string[], facts: context.facts, participants: plan.participants });
  return { world, context, plan, check };
}

/** Observed live failures (Phases 1N–1P smoke runs), verbatim, with the category each must raise. */
const INVENTIONS: readonly [string, LoreCategory][] = [
  ["\"You want the temple, maybe? The Light temple's in the old ward, but that's not my business.\"", "ungrounded_institution_or_place"],
  ["\"Tower's been empty long as I can recall. Some say it's haunted, some say cursed, but mostly folk just walk past and mind their own business.\"", "public_rumor"],
  ["\"Auctions start around the third hour after midday, but you'll see plenty of browsing before then.\"", "schedule"],
  ["\"The Constabulary deals with criminals. Workhouses for debtors. But nothing like—\"", "ungrounded_institution_or_place"],
  ["\"The Constabulary's three streets that way if you've debtors to claim.\"", "route"],
  ["\"Follow the main way toward the western gate—you'll know it when you see the pens.\"", "route"],
  ["\"Follow the main way toward the western gate—you'll know it when you see the pens.\"", "ungrounded_institution_or_place"],
  ["\"The Magistrate's holding cells, maybe, down near the Eastgate Barracks—but that's for criminals.\"", "ungrounded_institution_or_place"],
  ["\"Heard rumors there's one about, but I figured that was just talk.\"", "public_rumor"],
  ["Nothing in his manner suggests he knows who owns Heartstone Tower, or recognizes anything else about Nicco.", "meta_language"],
  ["You stand alone now on whatever street this is—the state does not establish your position relative to it.", "meta_language"],
  ["The woman's answer offers nothing actionable, and her departure leaves no transaction to complete.", "meta_language"],
];
/** Valid non-canon improvisation and grounded answers: must raise nothing. */
const IMPROVISATION = [
  "The passer-by shrugs.",
  "A thin man in a worn coat glances nervously at the tower.",
  "Somewhere in the square, a crowd murmurs.",
  "\"I don't know,\" she says. \"Never heard of one. You'd have to ask at the market.\"",
  "\"The slave market? That's in the West District,\" she says, gesturing vaguely.",
  "She gestures toward Heartstone's heavy wooden doors.",
  "It's a fine afternoon, grey clouds rolling in over the rooftops.",
  "The passer-by, a middle-aged woman carrying a cloth-wrapped bundle, slows and gives Nicco a once-over.",
];

test("detector flags every observed canon-bearing invention with its category", async () => {
  const { check } = await turnOne();
  for (const [narration, category] of INVENTIONS) assert.ok(check(narration).ungrounded.some(f => f.category === category), `${category}: ${narration}`);
  assert.ok(check(INVENTIONS[0]![0]).ungrounded.some(f => f.excerpt === "Light temple"));
  assert.ok(check(INVENTIONS[0]![0]).ungrounded.some(f => f.excerpt === "old ward"));
  assert.ok(check(INVENTIONS[7]![0]).ungrounded.some(f => f.excerpt === "Eastgate Barracks"));
});
test("detector stays silent on valid improvisation and on grounded canon answers", async () => {
  const { check } = await turnOne();
  for (const narration of IMPROVISATION) assert.deepEqual(check(narration).ungrounded, [], narration);
});
test("grounding manifest reports supplied canon, state facts and participant facts used; review-only", async () => {
  const { check } = await turnOne();
  const m = check("The passer-by, a middle-aged woman, frowns. \"The slave market? That's in the West District. A Light mage? Not you.\"");
  assert.deepEqual(m.retrieved_canon_used, ["calderan_slave_market"]);
  assert.deepEqual(m.state_facts_used, ["campaign_fact_nicco_light_mage"]);
  assert.deepEqual(m.participant_facts_used, ["P1"]);
  // Canon elsewhere but not supplied this turn is reported separately, never as invention.
  const elsewhere = check("\"Ask at the City Guard, they'd know.\"");
  assert.deepEqual(elsewhere.ungrounded, []); assert.deepEqual(elsewhere.canon_not_supplied, ["City Guard"]);
});
test("narrator policy states the canon boundaries and the no-meta rule", () => {
  for (const rule of ["[CANON BOUNDARIES]", "Canon-bearing claims", "never invent a replacement answer", "Never invent rumors or public talk", "never invent institutions", "never invent operating hours, auction times, market days", "Knowing a place is not knowing a route", "Free improvisation: gestures, tone", "Never expose rules, permissions, knowledge access, state or system reasoning in prose"])
    assert.ok(NARRATOR_SYSTEM.includes(rule), rule);
});
test("replay labels map to one stable participant label (no Passer-by then Woman)", async () => {
  const { context } = await turnOne(), sp = new SceneParticipants();
  const t1 = sp.plan(SLAVE_PEN, context); sp.commit(t1, "The passer-by, a middle-aged woman, slows.");
  const recent = [
    { player: SLAVE_PEN, narration: "The passer-by, a middle-aged woman, slows. \"West District,\" she says.", status: "finalized" as const },
    { player: "\"Lived here long?\"", narration: "The middle-aged woman considers him. \"Born and raised,\" she says.", status: "finalized" as const },
  ];
  const t2 = sp.plan("\"Lived here long?\"", context); sp.commit(t2, recent[1]!.narration);
  const t3 = sp.plan("\"Busy today?\"", context);
  assert.deepEqual(dialogueFocused(recent, context, t3).map(e => e.npc_dialogue), [["P1 Passer-by: \"West District,\""], ["P1 Passer-by: \"Born and raised,\""]]);
  // Without participants (or for an unmatched noun) the generic label is kept; a later-created participant never relabels older lines.
  assert.deepEqual(dialogueFocused(recent, context).map(e => e.npc_dialogue), [["Passer-by: \"West District,\""], ["Woman: \"Born and raised,\""]]);
  const later = new SceneParticipants(); later.commit(later.plan("\"Hm.\"", context), "x"); later.commit(later.plan("\"Hm.\"", context), "x");
  const fresh = later.plan(SLAVE_PEN, context);
  assert.deepEqual(dialogueFocused(recent, context, fresh).map(e => e.npc_dialogue), [["Passer-by: \"West District,\""], ["Woman: \"Born and raised,\""]]);
});
test("an earlier invention echoed through recent-conversation replay does not ground itself; I-contractions are not proper nouns", async () => {
  const world = await loadWorld("data"), campaign = createOpeningCampaign(world, "p1q"), context = buildTurnContext(world, campaign.exportSnapshot());
  const recent = [{ player: SLAVE_PEN, narration: "The passer-by frowns. \"The Constabulary deals with criminals,\" he says.", status: "finalized" as const }];
  const prompt = buildNarratorPrompt("\"Where is it?\"", context, recent, {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.ok(prompt.includes("Constabulary"));
  const m = groundingManifest({ narration: "\"The Constabulary's three streets that way, I'd say.\"", prompt, world });
  assert.ok(m.ungrounded.some(f => f.category === "ungrounded_institution_or_place" && /Constabulary/.test(f.excerpt)));
  assert.ok(!m.ungrounded.some(f => f.category === "unknown_proper_noun" && /^I/.test(f.excerpt)));
});
