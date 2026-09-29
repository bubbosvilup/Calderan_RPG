import test from "node:test";
import assert from "node:assert/strict";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { StateControllerProvider } from "../src/llm/state-controller-provider.js";
import { parseControllerEvidenceProposal } from "../src/llm/controller-schema.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { EVIDENCE_CORPUS as BASE_CORPUS, EVIDENCE_CORPUS_EXTRA, OFFER, TELL, type EvidenceCase } from "../src/dev/evidence-corpus.js";
const EVIDENCE_CORPUS = [...BASE_CORPUS, ...EVIDENCE_CORPUS_EXTRA];
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { authorizeWithEvidence, verifyEvidence, type EvidenceMode } from "../src/turn/evidence-authorization.js";
import { projectKnowledgeAccess, renderKnowledgeAccess, selectRelevantFacts } from "../src/turn/narrative-authority.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { collect, metadata } from "./turn-fixtures.js";

const tell: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
const garments: CampaignCommand[] = ["pink_cotton", "pink_fluffy", "pink_shorts"].map(item_id => ({ kind: "transfer_item", item_id, owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } }));

function prepare(c: Pick<EvidenceCase, "input" | "narration" | "ground_garments" | "brenna_knows">) {
  const { world, campaign } = turnFixture(!!c.ground_garments, c.brenna_knows ? { brennaKnowsBridge: true } : {});
  const snapshot = campaign.exportSnapshot(), context = buildTurnContext(world, snapshot);
  const intent = playerIntent(c.input, context, snapshot, world);
  return { snapshot, context, intent, evidence: deriveTurnEvidence(intent, c.narration, context) };
}
/** Every contiguous word window of the narration within quote bounds: what a maximally adversarial controller could cite. */
function windows(narration: string): string[] {
  const spans = [...narration.matchAll(/\S+/g)].map(m => [m.index, m.index + m[0].length] as const), out = new Set<string>();
  for (let i = 0; i < spans.length; i++) for (let j = i; j < spans.length; j++) {
    const text = narration.slice(spans[i]![0], spans[j]![1]);
    if (text.length > 240) break;
    if (text.length >= 8) out.add(text);
  }
  return [...out];
}

const negatives = EVIDENCE_CORPUS.filter(c => c.truth === "negative"), positives = EVIDENCE_CORPUS.filter(c => c.truth === "positive");
test("corpus size meets the Phase 1O gate: 30+ negative/adversarial cases", () => { assert.ok(negatives.length >= 30, String(negatives.length)); assert.ok(positives.length >= 10); });
for (const c of negatives) test(`adversarial controller cannot commit (${c.category}): ${c.narration.slice(0, 70)}`, () => {
  const { snapshot, context, intent, evidence } = prepare(c);
  assert.ok(intent.candidates.length > 0);
  assert.deepEqual(authorizeWithEvidence(intent.candidates, undefined, evidence, c.narration, context, snapshot, "hybrid").filter(d => d.authorized), [], "grammar path");
  for (const [i, command] of intent.candidates.entries()) for (const quote of windows(c.narration)) {
    if (!verifyEvidence(command, quote, c.narration, context, intent.candidates).verified) continue;
    const quotes = intent.candidates.map((_, j) => (j === i ? quote : ""));
    const decided = authorizeWithEvidence(intent.candidates, quotes, evidence, c.narration, context, snapshot, "hybrid");
    assert.deepEqual(decided.filter(d => d.authorized).map(d => d.command), [], `quote: ${quote}`);
  }
  // Also every command quoting the same window at once (a colluding controller).
  for (const quote of windows(c.narration)) {
    const decided = authorizeWithEvidence(intent.candidates, intent.candidates.map(() => quote), evidence, c.narration, context, snapshot, "hybrid");
    assert.deepEqual(decided.filter(d => d.authorized).map(d => d.command), [], `shared quote: ${quote}`);
  }
});
for (const c of positives) test(`positive evidence authorizes the whole intended event (${c.category}): ${c.narration.slice(0, 60)}`, () => {
  const { snapshot, context, intent, evidence } = prepare(c);
  const quotes = intent.candidates.map((_, i) => c.quotes![Math.min(i, c.quotes!.length - 1)]!);
  const decided = authorizeWithEvidence(intent.candidates, quotes, evidence, c.narration, context, snapshot, "hybrid");
  assert.deepEqual(decided.map(d => d.authorized), intent.candidates.map(() => true), JSON.stringify(decided.map(d => [d.reason, d.evidence?.check])));
  const shadow = authorizeWithEvidence(intent.candidates, quotes, evidence, c.narration, context, snapshot, "shadow");
  for (const d of shadow) assert.ok(d.source === "grammar" || d.source === "both" || d.source === "rejected");
});

test("verifier rejects fragments, reactions, fabrications and bounds violations", () => {
  const { context, intent } = prepare({ input: OFFER, narration: "", ground_garments: true });
  const n = "Brenna glances at them. She takes the fluffy shirt first, then the cotton shirt, and finally the shorts.";
  assert.equal(verifyEvidence(garments[1]!, "the fluffy shirt", n, context, intent.candidates).check, "no_receipt_act_in_quote");
  assert.equal(verifyEvidence(garments[1]!, "She grabs the fluffy shirt first", n, context, intent.candidates).check, "quote_not_verbatim");
  assert.equal(verifyEvidence(garments[1]!, "She", n, context, intent.candidates).check, "quote_length");
  assert.equal(verifyEvidence(garments[1]!, undefined, n, context, intent.candidates).check, "no_quote");
  assert.equal(verifyEvidence(garments[1]!, "She takes the fluffy shirt first", n, context, intent.candidates).verified, true);
  const k = prepare({ input: TELL, narration: "" });
  assert.equal(verifyEvidence(tell, "Brenna takes in the information.", "Brenna takes in the information.", k.context, k.intent.candidates).check, "fact_content_missing");
});
test("controller evidence schema: parses command plus verbatim quote; rejects missing quote or unknown fields", () => {
  const ok = parseControllerEvidenceProposal(JSON.stringify({ commands: [{ command: tell, evidence_quote: "Nicco tells Brenna that the eastern bridge is closed." }] }));
  assert.deepEqual(ok, [{ command: tell, evidence_quote: "Nicco tells Brenna that the eastern bridge is closed." }]);
  for (const bad of [{ commands: [{ command: tell }] }, { commands: [{ command: tell, evidence_quote: "x", reasoning: "because" }] }, { commands: [tell] }]) assert.throws(() => parseControllerEvidenceProposal(JSON.stringify(bad)));
});

// Coordinator-level behavior with scripted narration and an evidence-returning controller.
function scripted(narrations: readonly string[], seen: GenerationRequest[] = []): NarratorProvider {
  let i = 0;
  return { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = narrations[Math.min(i++, narrations.length - 1)]!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
}
function controllerWith(turns: readonly { commands: CampaignCommand[]; evidence?: string[] }[]): StateControllerProvider {
  let i = 0; return { async propose() { const t = turns[Math.min(i++, turns.length - 1)] ?? { commands: [] }; return { commands: t.commands, ...(t.evidence ? { evidence: t.evidence } : {}), ...metadata }; } };
}
function coordinator(fixture: ReturnType<typeof turnFixture>, narrations: readonly string[], turns: readonly { commands: CampaignCommand[]; evidence?: string[] }[], mode: EvidenceMode, seen: GenerationRequest[] = []) {
  const service = new RetrievalService(fixture.world);
  return new TurnCoordinator(fixture.world, scripted(narrations, seen), controllerWith(turns), { service, search: new HybridSearch(service) }, { evidence_authorization: mode });
}
async function turn(c: TurnCoordinator, campaign: ReturnType<typeof turnFixture>["campaign"], input: string) {
  const last = (await collect(c.runTurn({ campaign, player_input: input }))).at(-1)!;
  assert.equal(last.type, "turn_completed");
  return last.type === "turn_completed" ? last.result : undefined!;
}
for (const [label, narration, quote] of [
  ["quoted /tell", "Nicco turns to Brenna. \"The eastern bridge is closed,\" he says.", "\"The eastern bridge is closed,\" he says."],
  ["relative clause", "Nicco turns to Brenna, who sits alert despite her recovering condition, and tells her that the eastern bridge is closed.", "tells her that the eastern bridge is closed"],
  ["colon", "Nicco speaks the fact plainly: the eastern bridge is closed.", "Nicco speaks the fact plainly: the eastern bridge is closed."],
] as const) test(`hybrid commits a narrated tell the grammar misses (${label}); shadow does not`, async () => {
  for (const mode of ["hybrid", "shadow"] as const) {
    const f = turnFixture(), result = await turn(coordinator(f, [narration], [{ commands: [tell], evidence: [quote] }], mode), f.campaign, TELL);
    const d = result.authorization[0]!;
    assert.equal(d.grammar?.authorized, false); assert.equal(d.evidence?.verified, true);
    if (mode === "hybrid") {
      assert.equal(d.reason, "authorized_controller_evidence"); assert.equal(d.source, "evidence"); assert.equal(result.final_revision, result.base_revision + 1);
      assert.deepEqual(f.campaign.exportSnapshot().knowledge.find(k => k.character_id === "brenna")?.provenance, { source_character_id: "nicco", acquisition_kind: "told" });
    } else { assert.equal(d.authorized, false); assert.equal(d.source, "rejected"); assert.equal(result.final_revision, result.base_revision); }
  }
});
test("reaction evidence, failed telling and Nicco quote without a /tell intent never commit", async () => {
  for (const [input, narration, quote] of [
    [TELL, "Brenna takes in the information. Her eyes widen.", "Brenna takes in the information."],
    [TELL, "Nicco starts to tell Brenna that the eastern bridge is closed, but stops.", "tell Brenna that the eastern bridge is closed"],
    ["*looks at Brenna*", "\"I'll tell you the eastern bridge is closed,\" Nicco says.", "\"I'll tell you the eastern bridge is closed,\" Nicco says."],
  ] as const) {
    const f = turnFixture(), before = f.campaign.exportSnapshot();
    await turn(coordinator(f, [narration], [{ commands: [tell], evidence: [quote] }], "hybrid"), f.campaign, input);
    assert.deepEqual(f.campaign.exportSnapshot(), before, narration);
  }
});
test("group transfer: sequential evidence commits all three garments in one revision (fixes the 1M.2 partial commit)", async () => {
  const f = turnFixture(true), n = "Brenna looks over the offered clothes. She took the pink cotton shirt, then the fluffy one, and finally the shorts, laying them across her lap.";
  const q = "She took the pink cotton shirt, then the fluffy one, and finally the shorts";
  const result = await turn(coordinator(f, [n], [{ commands: garments, evidence: [q, q, q] }], "hybrid"), f.campaign, OFFER);
  assert.deepEqual(result.authorized_commands, garments);
  assert.equal(result.final_revision, result.base_revision + 1);
  assert.deepEqual(result.authorization.map(d => d.source), ["both", "evidence", "evidence"]);
  for (const id of ["pink_cotton", "pink_fluffy", "pink_shorts"]) assert.deepEqual(f.campaign.exportSnapshot().items.find(i => i.id === id)!.position, { kind: "carried", character_id: "brenna" });
});
test("group transfer: evidence for only part of one offer is withdrawn rather than committing a partial group", async () => {
  const f = turnFixture(true), n = "Brenna looks over the offer. She took the cotton shirt next. She turned the thick fluffy shirt over in her large hands. The shorts drew a longer look.";
  const result = await turn(coordinator(f, [n], [{ commands: garments, evidence: ["She took the cotton shirt next.", "She turned the thick fluffy shirt over", "The shorts drew a longer look."] }], "hybrid"), f.campaign, OFFER);
  assert.deepEqual(result.authorized_commands, []);
  assert.equal(result.authorization[0]!.reason, "rejected_evidence_partial_group");
});
test("refusal/retraction wins over controller evidence (accept then return)", async () => {
  const f = turnFixture(true), n = "Brenna takes all three garments. She hands them back to Nicco.";
  const result = await turn(coordinator(f, [n], [{ commands: garments, evidence: ["Brenna takes all three garments.", "Brenna takes all three garments.", "Brenna takes all three garments."] }], "hybrid"), f.campaign, OFFER);
  assert.deepEqual(result.authorized_commands, []);
  assert.ok(result.authorization.every(d => d.reason === "rejected_recipient_refused"));
});
test("grammar yes + invalid evidence stays authorized (existing safe path is never failed by evidence)", async () => {
  const f = turnFixture(), result = await turn(coordinator(f, ["Nicco tells Brenna that the eastern bridge is closed."], [{ commands: [tell], evidence: ["fabricated quote that is not there"] }], "hybrid"), f.campaign, TELL);
  assert.equal(result.authorization[0]!.source, "grammar"); assert.equal(result.authorization[0]!.evidence?.check, "quote_not_verbatim"); assert.equal(result.authorized_commands.length, 1);
});
test("re-telling an already known fact is a no-op that preserves the original status and provenance", async () => {
  const f = turnFixture(false, { brennaKnowsBridge: true }), before = f.campaign.exportSnapshot();
  const result = await turn(coordinator(f, ["Nicco tells Brenna that the eastern bridge is closed."], [{ commands: [tell] }], "hybrid"), f.campaign, TELL);
  assert.equal(result.authorization[0]!.reason, "rejected_already_established");
  assert.deepEqual(f.campaign.exportSnapshot(), before);
});

// Delayed recall: knowledge lives in CampaignState, not in conversational RAM.
const UNRELATED = ["How is the weather?", "Gerome, sweep the floor please.", "*he stretches*", "Maren, did you sleep well?", "Let's check the window latch.", "Brenna, are you warm enough?"];
async function longSession(first: { narration: string; commands: CampaignCommand[]; evidence?: string[] }, statusFixture?: (f: ReturnType<typeof turnFixture>) => void) {
  const f = turnFixture(); statusFixture?.(f);
  const seen: GenerationRequest[] = [];
  const narrations = [first.narration, ...Array.from({ length: 18 }, (_, i) => `Brenna nods. Gerome waits. (${i})`), "Brenna answers."];
  const c = coordinator(f, narrations, [{ commands: first.commands, ...(first.evidence ? { evidence: first.evidence } : {}) }, ...Array.from({ length: 19 }, () => ({ commands: [] }))], "hybrid", seen);
  await turn(c, f.campaign, TELL);
  for (let i = 0; i < 18; i++) await turn(c, f.campaign, UNRELATED[i % UNRELATED.length]!);
  const last = await turn(c, f.campaign, "Brenna, Maren, do you remember what I said about the eastern bridge?");
  return { f, c, seen, last };
}
test("20-turn delayed recall: Brenna still CAN USE the told fact after the telling left recent conversation; Maren still cannot", async () => {
  const { f, c, seen } = await longSession({ narration: "Nicco turns to Brenna. \"The eastern bridge is closed,\" he says.", commands: [tell], evidence: ["\"The eastern bridge is closed,\" he says."] });
  const prompt = seen.at(-1)!.messages[0]!.content;
  assert.ok(!prompt.includes("The eastern bridge is closed,\\\" he says"), "original narration rotated out of recent conversation");
  assert.equal(c.recent(f.campaign).entries().some(e => e.narration.includes("he says")), false);
  assert.match(prompt, /Brenna: CAN USE F1 \(knows\)/); assert.match(prompt, /Maren: CAN USE none; DO NOT USE F1/);
  assert.deepEqual(f.campaign.exportSnapshot().knowledge.find(k => k.character_id === "brenna"), { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } });
});
test("20-turn negative recall: a failed telling never becomes knowledge later", async () => {
  const { f, seen } = await longSession({ narration: "Nicco starts to tell Brenna that the eastern bridge is closed, but stops.", commands: [tell], evidence: ["tell Brenna that the eastern bridge is closed"] });
  assert.match(seen.at(-1)!.messages[0]!.content, /Brenna: CAN USE none; DO NOT USE F1/);
  assert.ok(!f.campaign.exportSnapshot().knowledge.some(k => k.character_id === "brenna"));
});
test("20-turn status preservation: a rumor stays a rumor (no silent upgrade to knows)", async () => {
  const { f, seen } = await longSession({ narration: "Brenna nods.", commands: [] }, fx => fx.campaign.apply({ expected_revision: fx.campaign.revision, commands: [{ kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "heard_rumor" } }] }));
  assert.match(seen.at(-1)!.messages[0]!.content, /Brenna: CAN USE F1 \(heard_rumor\)/);
  assert.equal(f.campaign.exportSnapshot().knowledge.find(k => k.character_id === "brenna")?.status, "heard_rumor");
});
test("bounded relevance: with many known facts, an explicit recall query surfaces the referenced fact and its holder's status", () => {
  const f = turnFixture();
  const commands: CampaignCommand[] = Array.from({ length: 20 }, (_, i) => [
    { kind: "create_fact", fact: { id: `campaign_fact_filler_${i}`, content: { kind: "campaign", statement: `Filler statement number ${i} about lanterns.`, truth: "true" } } },
    { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: `campaign_fact_filler_${i}`, status: "knows" } },
  ] as CampaignCommand[]).flat();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [...commands, { kind: "set_knowledge", knowledge: tell.kind === "set_knowledge" ? tell.knowledge : undefined! }] });
  const context = buildTurnContext(f.world, f.campaign.exportSnapshot());
  assert.equal(context.facts.length, 21);
  const access = projectKnowledgeAccess(context, {}, { input: "Brenna, do you remember the eastern bridge?" });
  assert.deepEqual(access.facts.map(x => x.id), ["campaign_fact_bridge_closed"]);
  assert.match(renderKnowledgeAccess(access), /Brenna: CAN USE F1 \(knows\)/);
  assert.equal(selectRelevantFacts(context.facts, { input: "Hello there." }).length, 0);
  assert.equal(selectRelevantFacts(context.facts.slice(0, 5), { input: "Hello there." }).length, 5, "small sets are projected in full");
});
test("verifier: 'he' resolves relative to its own sentence when a quote spans two sentences; paragraph breaks match as spaces", () => {
  const { context, intent } = prepare({ input: TELL, narration: "" });
  const n = "Nicco turns to Brenna. \"The eastern bridge is closed,\" he says.";
  assert.equal(verifyEvidence(tell, n, n, context, intent.candidates).check, "nicco_quoted_tell");
  const para = "\"The eastern bridge is closed,\" he says.\n\nBrenna nods slowly.";
  const withSubject = "Nicco turns to Brenna. " + para;
  assert.equal(verifyEvidence(tell, "\"The eastern bridge is closed,\" he says. Brenna nods slowly.", withSubject, context, intent.candidates).verified, true);
  assert.equal(verifyEvidence(tell, "\"The eastern bridge is closed,\" he says.", "Maren turns to Brenna. " + para, context, intent.candidates).check, "no_nicco_communication_act");
});
test("elliptical continuation: accepted only after the recipient's receipt act with list-only material in between", () => {
  const { context, intent } = prepare({ input: OFFER, narration: "", ground_garments: true });
  const ok = "Brenna glances at them. She took the pink cotton shirt, then the fluffy one, and finally the shorts, laying them across her lap.";
  assert.equal(verifyEvidence(garments[1]!, "then the fluffy one", ok, context, intent.candidates).verified, true);
  assert.equal(verifyEvidence(garments[2]!, "and finally the shorts, laying them across her lap", ok, context, intent.candidates).verified, true);
  const interrupted = "Brenna glances at them. Brenna takes the cotton shirt and looks at the fluffy one, then at the shorts.";
  assert.equal(verifyEvidence(garments[1]!, "the fluffy one", interrupted, context, intent.candidates).verified, false);
  assert.equal(verifyEvidence(garments[2]!, "then at the shorts", interrupted, context, intent.candidates).verified, false);
});
test("production default is hybrid: a coordinator without options commits a verified evidence-backed tell", async () => {
  const f = turnFixture(), service = new RetrievalService(f.world);
  const c = new TurnCoordinator(f.world, scripted(["Nicco turns to Brenna. \"The eastern bridge is closed,\" he says."]), controllerWith([{ commands: [tell], evidence: ["\"The eastern bridge is closed,\" he says."] }]), { service, search: new HybridSearch(service) });
  const result = await turn(c, f.campaign, TELL);
  assert.equal(result.authorization[0]!.source, "evidence"); assert.equal(result.final_revision, result.base_revision + 1);
});
test("prior-ignorance narration after a telling is not a retraction (Phase 1O live delayed-recall rep 2)", async () => {
  const n = "Nicco turns to Brenna and tells her that the eastern bridge is closed.\n\nBrenna's grey eyes meet his with mild surprise. She had not heard this before. \"Closed?\" she repeats.";
  const f = turnFixture(), result = await turn(coordinator(f, [n], [{ commands: [tell], evidence: ["Nicco turns to Brenna and tells her that the eastern bridge is closed."] }], "hybrid"), f.campaign, TELL);
  assert.equal(result.authorized_commands.length, 1); assert.deepEqual(result.turn_evidence.narrator_refusals, []);
  const doubt = turnFixture(), refused = await turn(coordinator(doubt, ["Nicco tells Brenna that the eastern bridge is closed. She does not hear him."], [{ commands: [tell], evidence: ["Nicco tells Brenna that the eastern bridge is closed."] }], "hybrid"), doubt.campaign, TELL);
  assert.deepEqual(refused.authorized_commands, []);
});
test("incomplete controller proposal for a wholly established group is withheld, not partially committed (v5 tp03)", async () => {
  const f = turnFixture(true), n = "Brenna looks at the offered clothes. She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts, taking them into her hands.";
  const result = await turn(coordinator(f, [n], [{ commands: [garments[0]!], evidence: ["She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts, taking them into her hands."] }], "hybrid"), f.campaign, OFFER);
  assert.deepEqual(result.authorized_commands, []); assert.equal(result.authorization[0]!.reason, "rejected_incomplete_group_proposal");
  const partial = turnFixture(true), named = await turn(coordinator(partial, ["She accepts the pink cotton shirt and the pink shorts."], [{ commands: [garments[0]!, garments[2]!] }], "hybrid"), partial.campaign, OFFER);
  assert.deepEqual(named.authorized_commands, [garments[0], garments[2]], "a narrated partial acceptance still commits the named items");
});
test("undecided 'accept or decline' is not a refusal, and the veto pronoun fallback uses only the previous sentence", async () => {
  const f = turnFixture(true), n = "Nicco holds out the clothes toward Brenna. The tall woman looks at them, considering. She sits alert as she reaches to accept or decline. Brenna takes the items from Nicco's hands, gathering the cotton shirt, the thick fluffy shirt, and the shorts together.";
  const q = "Brenna takes the items from Nicco's hands, gathering the cotton shirt, the thick fluffy shirt, and the shorts together.";
  const result = await turn(coordinator(f, [n], [{ commands: garments, evidence: [q, q, q] }], "hybrid"), f.campaign, OFFER);
  assert.deepEqual(result.authorized_commands, garments);
});
test("live action-beat /tell narrations (Phase 1O tell rep 2, recall-confirm rep 2) commit through evidence", async () => {
  const live = [
    "Nicco turns to Brenna. \"The eastern bridge is closed.\"\n\nBrenna's grey eyes focus on him, her muscular frame still seated but alert. \"I hadn't heard that,\" she says. \"Do you know for how long?\"",
    "Nicco leans toward Brenna. \"The eastern bridge is closed.\"\n\nBrenna's grey eyes sharpen, though she gives no sign of recognizing the information. She sits alert in her chair, the old scars on her wrists visible as she shifts. \"Closed?\" She considers this. \"I hadn't heard. What's the trouble there?\"",
  ];
  for (const n of live) for (const q of ["\"The eastern bridge is closed.\"", n.slice(0, n.indexOf("\n"))]) {
    const f = turnFixture(), result = await turn(coordinator(f, [n], [{ commands: [tell], evidence: [q] }], "hybrid"), f.campaign, TELL);
    assert.deepEqual(result.authorized_commands, [tell], `${q} :: ${result.authorization[0]!.evidence?.check}`);
  }
});
