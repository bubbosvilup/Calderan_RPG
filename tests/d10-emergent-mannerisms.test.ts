import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mannerismFixture, MANNERISM_CORPUS } from "../src/dev/d10-mannerism-corpus.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignSnapshot } from "../src/campaign/types.js";
import { MANNERISM_LEARNING_POLICY as P, MANNERISM_TRIGGERS, requiredMannerismEvidence, type MannerismConcept } from "../src/campaign/mannerism-concepts.js";
import { observationDefinition, type ValidatedMannerismObservation } from "../src/campaign/mannerism-learning.js";
import { MannerismMaintenance, MANNERISM_EXTRACTOR_TASK, validateExtractedMannerisms, type MannerismExtractionRequest, type MannerismExtractor } from "../src/turn/mannerism-extraction.js";
import { mannerismView } from "../src/app/mannerism-view.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { packNpcPlus } from "../src/turn/npc-plus.js";
import { GameSession } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { mockNarrator, mockController } from "./turn-fixtures.js";
import { OpenRouterClient } from "../src/llm/openrouter/client.js";
import { OpenRouterMannerismExtractor } from "../src/llm/openrouter/mannerism-extractor.js";
import { createProductionDeps } from "../src/app/production.js";
import { mannerismExtractorModel } from "../src/app/provider-config.js";
import { readFile } from "node:fs/promises";
import { replayCalibratedMannerisms, type CalibratedReplayFixture } from "../src/dev/mannerism-calibration-replay.js";
import { MANNERISM_EXTRACTOR_SYSTEM, MANNERISM_EXTRACTION_SCHEMA } from "../src/turn/mannerism-extraction.js";

type Fixture = ReturnType<typeof mannerismFixture>;
const rows = (f: Fixture, id = "brenna") => f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === id)!.mannerisms!;
const candidates = (f: Fixture) => f.campaign.exportSnapshot().mannerism_learning!.candidates;
const tap: MannerismConcept = { action: "two_finger_tap", trigger: "while_waiting" };
function request(f: Fixture, narration: string, sequence = 1): MannerismExtractionRequest {
  return { turns: [{ sequence, narration, characters: [{ id: "brenna", name: "Brenna" }, { id: "maren", name: "Maren" }], items: [
    { id: "campaign_item_plain_shirt", name: "plain shirt", character_id: "brenna", worn: true }, { id: "campaign_item_cloth_doll", name: "cloth doll", character_id: "maren", worn: false },
  ] }], owned: f.campaign.exportSnapshot().premium_characters.flatMap(p => p.mannerisms!.map(m => ({ id: m.id, character_id: p.character_id, text: m.text }))), candidates: [] };
}
function wire(r: MannerismExtractionRequest, concept: MannerismConcept, character_id = "brenna", item: string | null = null, quote = r.turns[0]!.narration) {
  return { turn_sequence: r.turns[0]!.sequence, character_id, ...concept, evidence_quote: quote, requires_item_id: item, requires_entity_id: null, equivalent_owned_ids: [] };
}
const output = (r: MannerismExtractionRequest, observations: unknown[]) => JSON.stringify({ observations, owned_reviewed_ids: r.owned.map(m => m.id) });
function source(f: Fixture, narration = "Brenna taps two fingers while waiting.") {
  const seq = (f.campaign.exportSnapshot().mannerism_learning?.sequence ?? 0) + 1;
  f.campaign.maintainMannerisms({ kind: "finalized", expected_revision: f.campaign.revision, source: { turn_id: `turn_${seq}`, narration_hash: createHash("sha256").update(narration).digest("hex"), narration_length: narration.length,
    character_ids: ["brenna", "maren"], available_items: [{ character_id: "brenna", item_id: "campaign_item_plain_shirt", worn: true }, { character_id: "maren", item_id: "campaign_item_cloth_doll", worn: false }] } });
  return seq;
}
function consume(f: Fixture, observations: ValidatedMannerismObservation[]) {
  return f.campaign.maintainMannerisms({ kind: "observations", expected_revision: f.campaign.revision, through_sequence: f.campaign.exportSnapshot().mannerism_learning!.sequence, observations }).metrics;
}
function observe(f: Fixture, concept: MannerismConcept = tap, character_id = "brenna", requires_item_id?: string) {
  const sequence = source(f);
  return consume(f, [{ character_id, sequence, ...concept, span_start: 0, span_end: 20, equivalent_owned_ids: [], ...(requires_item_id ? { requires_item_id } : {}) }]);
}
const extractor: MannerismExtractor = { async extract(r) { return { text: output(r, r.turns.filter(t => t.narration.includes("two finger")).map(t => ({ ...wire({ ...r, turns: [t] }, tap), character_id: t.narration.startsWith("Maren") ? "maren" : "brenna" }))) }; } };

test("D10 P2 labeled offline corpus: eight concrete cues accepted; all negative/ambiguous controls abstain", () => {
  const f = mannerismFixture(); assert.equal(MANNERISM_CORPUS.length, 25);
  let valid = 0, invalid = 0;
  for (const c of MANNERISM_CORPUS) {
    const r = request(f, c.narration);
    if (c.expected) {
      const result = validateExtractedMannerisms(output(r, [wire(r, c.expected, c.expected.character_id, c.expected.requires_item_id ?? null)]), r, f.campaign.exportSnapshot(), f.world);
      assert.equal(result.observations.length, 1, c.id); valid++;
      assert.ok(observationDefinition(result.observations[0]!, f.campaign.exportSnapshot()).text.length <= 160);
    } else {
      // Deliberately over-eager classifier: the engine must reject personality and invented possessions too.
      const actor = c.narration.startsWith("Maren") ? "maren" : "brenna";
      const concept: MannerismConcept = c.category === "unsupported" ? { action: "object_grip", trigger: "when_visibly_tense" } : tap;
      if (c.category !== "global_duplicate") assert.equal(validateExtractedMannerisms(output(r, [wire(r, concept, actor)]), r, f.campaign.exportSnapshot(), f.world).observations.length, 0, c.id);
      else {
        const g = mannerismFixture(); g.campaign.addMannerism({ expected_revision: g.campaign.revision, character_id: "brenna", definition: { canonical_key: "gaze_lower_before_lie", text: "Lowers their eyes before an obvious lie." } });
        const sequence = source(g, c.narration), q = request(g, c.narration, sequence);
        const v = validateExtractedMannerisms(output(q, [wire(q, { action: "gaze_lower", trigger: "before_lie" }, "maren")]), q, g.campaign.exportSnapshot(), g.world);
        assert.equal(consume(g, v.observations).observations_rejected_global_duplicate, 1); assert.equal(candidates(g).length, 0);
      }
      invalid++;
    }
  }
  assert.deepEqual([valid, invalid], [8, 17]);
});

test("D10 P2 extractor boundary rejects incomplete global review, extra keys, hallucinated quotes and hidden context", () => {
  const f = mannerismFixture(), narration = "Brenna taps two fingers while waiting.", r = request(f, narration);
  assert.throws(() => validateExtractedMannerisms(JSON.stringify({ observations: [], owned_reviewed_ids: [] }), r, f.campaign.exportSnapshot(), f.world), /Incomplete/);
  assert.throws(() => validateExtractedMannerisms(JSON.stringify({ observations: [], owned_reviewed_ids: r.owned.map(m => m.id), personality: "kind" }), r, f.campaign.exportSnapshot(), f.world));
  for (const text of [`Perhaps ${narration}`, `Nicco says: "${narration}"`, `Yesterday ${narration}`, "Brenna would tap two fingers while waiting.", "Brenna does not tap two fingers while waiting."]) {
    const q = request(f, text), quote = text.includes(narration) ? narration : text;
    assert.equal(validateExtractedMannerisms(output(q, [wire(q, tap, "brenna", null, quote)]), q, f.campaign.exportSnapshot(), f.world).observations.length, 0, text);
  }
  assert.equal(validateExtractedMannerisms(output(r, [wire(r, tap, "brenna", null, "Brenna drums two fingers while waiting.")]), r, f.campaign.exportSnapshot(), f.world).observations.length, 0);
});

test("D10 P2 unsupported object, wrong owner and unworn clothing cannot be evidence", () => {
  const f = mannerismFixture();
  for (const [narration, id, concept] of [
    ["Maren grips her ring when visibly tense.", "ring", { action: "object_grip", trigger: "when_visibly_tense" }],
    ["Brenna clutches her cloth doll when visibly tense.", "campaign_item_cloth_doll", { action: "object_grip", trigger: "when_visibly_tense" }],
    ["Brenna smooths her plain shirt after an awkward moment.", "campaign_item_plain_shirt", { action: "clothing_smooth", trigger: "after_awkwardness" }],
  ] as const) {
    const r = request(f, narration); if (concept.action === "clothing_smooth") r.turns[0]!.items[0]!.worn = false;
    const v = validateExtractedMannerisms(output(r, [wire(r, concept, narration.startsWith("Maren") ? "maren" : "brenna", id)]), r, f.campaign.exportSnapshot(), f.world);
    assert.equal(v.observations.length, 0); assert.equal(v.metrics.observations_rejected_prerequisite, 1);
  }
});

test("D10 P2 independent moments: same turn counts once; aliases cluster; slots use 3/4/5 without replacement", () => {
  const f = mannerismFixture(), original = rows(f)[0]!;
  const sequence = source(f);
  const o = { character_id: "brenna", sequence, ...tap, span_start: 0, span_end: 20, equivalent_owned_ids: [] };
  consume(f, [o, { ...o, span_start: 21, span_end: 30 }]); assert.equal(candidates(f)[0]!.evidence.length, 1);
  observe(f); assert.equal(rows(f).length, 1); assert.equal(observe(f).mannerisms_promoted, 1); assert.equal(rows(f).length, 2);
  const gaze: MannerismConcept = { action: "gaze_lower", trigger: "before_lie" };
  for (let i = 0; i < 3; i++) observe(f, gaze); assert.equal(rows(f).length, 2);
  assert.equal(observe(f, gaze).mannerisms_promoted, 1); assert.equal(rows(f).length, 3);
  const pause: MannerismConcept = { action: "speech_pause", trigger: "before_name" };
  for (let i = 0; i < 4; i++) observe(f, pause); assert.equal(rows(f).length, 3);
  assert.equal(observe(f, pause).mannerisms_promoted, 1); assert.equal(rows(f).length, 4);
  const full = rows(f); observe(f, { action: "door_glance", trigger: "when_voice_raised" }); assert.deepEqual(rows(f), full);
  assert.deepEqual(rows(f)[0], original); assert.deepEqual([1, 2, 3].map(requiredMannerismEvidence), [3, 4, 5]);
  assert.ok(!rows(f)[1]!.text.includes("palm"), "normalization cannot invent a contact surface");
});

test("D10 P2 anti-feedback and global semantic aliases include user edited and inactive owners; distinct actions coexist", () => {
  const f = mannerismFixture(); observe(f); observe(f); observe(f);
  assert.equal(observe(f).observations_rejected_existing_mannerism, 1);
  assert.equal(observe(f, tap, "maren").observations_rejected_global_duplicate, 1); assert.equal(candidates(f).length, 0);
  const m = rows(f)[1]!;
  f.campaign.editMannerism({ expected_revision: f.campaign.revision, character_id: "brenna", id: m.id, definition: { canonical_key: m.canonical_key, text: "Drums two fingertips while waiting." } });
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "leave_household", household_id: "campaign_household_d10", character_id: "brenna" }] });
  // Source contains only the active subject after its other owner leaves.
  f.campaign.maintainMannerisms({ kind: "finalized", expected_revision: f.campaign.revision, source: { turn_id: "inactive_owner", narration_hash: "a".repeat(64), narration_length: 100, character_ids: ["maren"], available_items: [] } });
  assert.equal(consume(f, [{ character_id: "maren", sequence: f.campaign.exportSnapshot().mannerism_learning!.sequence, ...tap, span_start: 0, span_end: 30, equivalent_owned_ids: [] }]).observations_rejected_global_duplicate, 1);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "join_household", household_id: "campaign_household_d10", character_id: "brenna" }] });
  observe(f, { action: "gaze_lower", trigger: "before_lie" }, "maren"); assert.equal(candidates(f).length, 1);
  observe(f, { action: "door_glance", trigger: "when_voice_raised" }, "maren"); assert.equal(candidates(f).length, 2);
});

test("D10 P2 candidate cap and deterministic expiry never decay authoritative cues", () => {
  const f = mannerismFixture(), originals = f.campaign.exportSnapshot().premium_characters;
  const concepts: MannerismConcept[] = ["before_lie", "before_disagreement", "while_waiting", "after_awkwardness", "when_visibly_tense", "before_name", "when_voice_raised", "none"].map(trigger => ({ action: "two_finger_tap", trigger: trigger as MannerismConcept["trigger"] }));
  for (const c of concepts) observe(f, c); const oldest = candidates(f).find(c => c.trigger === "before_lie")!.id;
  observe(f, { action: "gaze_lower", trigger: "before_lie" }); assert.equal(candidates(f).length, P.candidates_per_npc); assert.ok(!candidates(f).some(c => c.id === oldest));
  for (let i = 0; i < P.expiry_turns + 1; i++) { source(f); consume(f, []); }
  assert.equal(candidates(f).length, 0); assert.deepEqual(f.campaign.exportSnapshot().premium_characters, originals);
});

test("D10 P2 save/load preserves bounded independent evidence; corrupt provenance and duplicate concepts fail", () => {
  const f = mannerismFixture(); observe(f); observe(f);
  const save = serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-04T00:00:00.000Z"), f.world);
  const loaded = CampaignState.restore(f.world, decodeSave(save, f.world).snapshot); assert.deepEqual(loaded.exportSnapshot(), f.campaign.exportSnapshot());
  f.campaign = loaded; assert.equal(observe(f).mannerisms_promoted, 1);
  const g = mannerismFixture(); observe(g);
  for (const mutate of [
    (s: CampaignSnapshot) => { s.mannerism_learning!.candidates[0]!.evidence.push(s.mannerism_learning!.candidates[0]!.evidence[0]!); },
    (s: CampaignSnapshot) => { s.mannerism_learning!.candidates[0]!.action = "gaze_lower"; },
    (s: CampaignSnapshot) => { s.mannerism_learning!.candidates[0]!.evidence[0]!.narration_hash = "b".repeat(64); },
    (s: CampaignSnapshot) => { s.mannerism_learning!.processed_sequence += 99; },
  ]) { const s = structuredClone(g.campaign.exportSnapshot()) as CampaignSnapshot; mutate(s); assert.throws(() => CampaignState.restore(g.world, s)); }
  const old = structuredClone(g.campaign.exportSnapshot()) as CampaignSnapshot; delete old.mannerism_learning; assert.equal(CampaignState.restore(g.world, old).exportSnapshot().mannerism_learning, undefined);
  assert.ok(!save.includes("Brenna taps two fingers while waiting."), "save stores source fingerprints, not duplicate raw prose");
});

test("D10 P2 candidate prerequisites are rechecked before promotion; no empty-batch stale promotion", () => {
  const f = mannerismFixture(), concept: MannerismConcept = { action: "object_grip", trigger: "when_visibly_tense" };
  observe(f, concept, "maren", "campaign_item_cloth_doll"); observe(f, concept, "maren", "campaign_item_cloth_doll");
  const sequence = source(f);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "place_item", item_id: "campaign_item_cloth_doll", position: { kind: "stored", location_id: "test_room" } }] });
  assert.equal(consume(f, [{ character_id: "maren", sequence, ...concept, requires_item_id: "campaign_item_cloth_doll", span_start: 0, span_end: 20, equivalent_owned_ids: [] }]).observations_rejected_prerequisite, 1);
  assert.equal(rows(f, "maren").length, 1);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "place_item", item_id: "campaign_item_cloth_doll", position: { kind: "carried", character_id: "maren" } }] });
  source(f); consume(f, []); assert.equal(rows(f, "maren").length, 1);
  observe(f, concept, "maren", "campaign_item_cloth_doll"); assert.equal(rows(f, "maren").length, 2);
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "place_item", item_id: "campaign_item_cloth_doll", position: { kind: "stored", location_id: "test_room" } }] });
  assert.ok(!packNpcPlus(f.world, f.campaign.exportSnapshot(), new Set(["maren"]), "Maren")!.lines.join("\n").includes("Grips cloth doll")); assert.equal(rows(f, "maren").length, 2);
});

test("D10 P2 maintenance cadence, stale/duplicate results and provider failure are bounded and non-authoritative", async () => {
  const f = mannerismFixture(); let calls = 0;
  const m = new MannerismMaintenance(f.world, { async extract(r) { calls++; assert.ok(Object.isFrozen(r.turns[0])); return extractor.extract(r); } });
  for (let i = 1; i <= 4; i++) {
    const result = { narration: "Brenna taps two fingers while waiting.", final_revision: f.campaign.revision };
    const run = await m.afterFinalizedTurn(f.campaign, `final_${i}`, result); assert.equal(run.status, i < 4 ? "queued" : "processed");
    assert.equal((await m.afterFinalizedTurn(f.campaign, `final_${i}`, result)).status, "not_needed");
  }
  assert.equal(calls, 1); assert.equal(rows(f).length, 2);
  const before = f.campaign.exportSnapshot(); assert.equal((await m.afterFinalizedTurn(f.campaign, "old", { narration: "Brenna taps two fingers while waiting.", final_revision: 1 })).status, "not_needed"); assert.equal(f.campaign.exportSnapshot(), before);
  for (const [provider, expected] of [
    [{ async extract() { throw new Error("unavailable"); } }, "provider_failed"],
    [{ async extract() { return { text: "not json" }; } }, "malformed"],
  ] as const) {
    const g = mannerismFixture(), broken = new MannerismMaintenance(g.world, provider);
    for (let i = 0; i < 4; i++) { const run = await broken.afterFinalizedTurn(g.campaign, `broken_${i}`, { narration: "Brenna taps two fingers while waiting.", final_revision: g.campaign.revision }); if (i === 3) assert.equal(run.status, expected); }
    assert.equal(rows(g).length, 1); assert.equal(candidates(g).length, 0);
  }
});

test("D10 P2 in-flight revision changes reject classification; cancellation never registers a finalized source", async () => {
  const f = mannerismFixture(), aborted = new AbortController(); aborted.abort();
  const m = new MannerismMaintenance(f.world, { async extract(r) { f.campaign.addMannerism({ expected_revision: f.campaign.revision, character_id: "maren", definition: { canonical_key: "neck_stretch", text: "Briefly tilts their head before replying." } }); return extractor.extract(r); } });
  assert.equal((await m.afterFinalizedTurn(f.campaign, "cancelled", { narration: "Brenna taps two fingers while waiting.", final_revision: f.campaign.revision }, aborted.signal)).status, "not_needed"); assert.equal(f.campaign.exportSnapshot().mannerism_learning, undefined);
  for (let i = 0; i < 4; i++) { const run = await m.afterFinalizedTurn(f.campaign, `stale_${i}`, { narration: "Brenna taps two fingers while waiting.", final_revision: f.campaign.revision }); if (i === 3) assert.equal(run.status, "stale"); }
  assert.equal(rows(f).length, 1); assert.equal(candidates(f).length, 0);
});

test("D10 P2 real finalized coordinator turns promote, pack and suppress feedback; failed drafts stay out", async () => {
  const f = mannerismFixture(), service = new RetrievalService(f.world), runs: { status: string; metrics: { observations_rejected_existing_mannerism: number; observations_rejected_global_duplicate: number } }[] = [];
  let text = "Brenna taps two fingers while waiting.", fail = false;
  const narrator = { async generate() { return mockNarrator(text).generate({} as never); }, async *stream() { yield* mockNarrator(text).stream({} as never); } };
  const session = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, "saves/d10-offline-never-written"), mannerism_extractor: extractor, mannerism_diagnostics_sink: r => runs.push(r),
    createCoordinator: hooks => new TurnCoordinator(f.world, narrator, { async propose(r) { if (fail) throw new Error("controller failed"); return mockController([]).propose(r); } }, { service, search: new HybridSearch(service) }, { provider_retry: false, diagnostics_sink: hooks.diagnostics_sink }),
  }, f.campaign);
  for (let i = 0; i < 4; i++) assert.ok((await session.submitPlayerInput("I wait quietly.")).ok);
  assert.equal(rows(f).length, 2); const cue = rows(f)[1]!.text;
  assert.ok(packNpcPlus(f.world, f.campaign.exportSnapshot(), new Set(["brenna"]), "Brenna")!.lines.join("\n").includes(cue));
  for (let i = 0; i < 4; i++) assert.ok((await session.submitPlayerInput("I wait quietly.")).ok);
  assert.equal(runs.at(-1)!.metrics.observations_rejected_existing_mannerism, 4); assert.equal(rows(f).length, 2);
  text = "Maren taps two fingers while waiting.";
  for (let i = 0; i < 4; i++) assert.ok((await session.submitPlayerInput("I wait quietly.")).ok);
  assert.equal(runs.at(-1)!.metrics.observations_rejected_global_duplicate, 4); assert.equal(rows(f, "maren").length, 1);
  const before = f.campaign.exportSnapshot().mannerism_learning; fail = true;
  assert.equal((await session.submitPlayerInput("I wait quietly.")).ok, false); assert.deepEqual(f.campaign.exportSnapshot().mannerism_learning, before);
  assert.equal(candidates(f).length, 0);
});

test("D10 P2 future UI and narrator keep unpromoted candidate evidence private", () => {
  const f = mannerismFixture(); observe(f);
  assert.equal("candidates" in mannerismView(f.campaign.exportSnapshot(), "brenna")!, false);
  assert.deepEqual(mannerismView(f.campaign.exportSnapshot(), "brenna", true)!.candidates?.map(c => [c.evidence_count, c.required_count]), [[1, 3]]);
  const candidate = candidates(f)[0]!;
  assert.ok(!JSON.stringify(buildTurnContext(f.world, f.campaign.exportSnapshot())).includes(candidate.id));
  assert.ok(!packNpcPlus(f.world, f.campaign.exportSnapshot(), new Set(["brenna"]), "Brenna")!.lines.join("\n").includes(candidate.text));
});

test("D10 P2B provider uses validated independent model, strict schema, no reasoning/streaming; production enables extraction", async () => {
  const f = mannerismFixture(), r = request(f, "Brenna taps two fingers while waiting."); let calls = 0;
  const client = new OpenRouterClient({ api_key: () => "offline-test-key", fetch: async (_url, init) => {
    calls++; const body = JSON.parse(String(init?.body)); assert.equal(body.model, "qwen/qwen3.8-flash"); assert.equal(body.stream, false);
    assert.deepEqual(body.reasoning, { exclude: true, enabled: false }); assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(body.provider, { require_parameters: true }); assert.equal(body.max_tokens, 2048);
    return new Response(JSON.stringify({ choices: [{ message: { content: output(r, [wire(r, tap)]) }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30, cost: 0.00001 }, provider: "offline" }));
  } });
  const response = await new OpenRouterMannerismExtractor(client).extract(r); assert.equal(calls, 1); assert.equal(response.metadata.cost_usd, 0.00001);
  assert.equal(validateExtractedMannerisms(response.text, r, f.campaign.exportSnapshot(), f.world).observations.length, 1);
  assert.ok((await createProductionDeps()).mannerism_extractor instanceof OpenRouterMannerismExtractor);
  assert.equal((await createProductionDeps({ enable_emergent_mannerisms: false })).mannerism_extractor, undefined);
  assert.ok((await createProductionDeps({ enable_emergent_mannerisms: true })).mannerism_extractor instanceof OpenRouterMannerismExtractor);
  assert.equal(mannerismExtractorModel({ OPENROUTER_CONTROLLER_MODEL: "other/controller", OPENROUTER_NARRATOR_MODEL: "other/narrator" }), "qwen/qwen3.8-flash");
  assert.equal(mannerismExtractorModel({ MANNERISM_EXTRACTOR_MODEL: " separate/extractor ", OPENROUTER_CONTROLLER_MODEL: "other/controller" }), "separate/extractor");
  assert.equal(mannerismExtractorModel({ MANNERISM_EXTRACTOR_MODEL: "   " }), "qwen/qwen3.8-flash");
});

test("D10 P2 actual alias evidence from distinct finalized moments shares one candidate; reload keeps its first two moments", async () => {
  const f = mannerismFixture();
  const provider: MannerismExtractor = { async extract(r) { return { text: output(r, r.turns.filter(t => t.narration.includes("lie")).map(t => wire({ ...r, turns: [t] }, { action: "gaze_lower", trigger: "before_lie" }, "maren"))) }; } };
  let maintenance = new MannerismMaintenance(f.world, provider);
  for (const [i, narration] of ["Maren lowers her gaze immediately before an obvious lie.", "Maren looks down just before telling a lie.", "The room is quiet.", "The room is still."].entries()) await maintenance.afterFinalizedTurn(f.campaign, `alias_${i}`, { narration, final_revision: f.campaign.revision });
  assert.equal(candidates(f).length, 1); assert.equal(candidates(f)[0]!.evidence.length, 2);
  f.campaign = CampaignState.restore(f.world, decodeSave(serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-04T00:00:00.000Z"), f.world), f.world).snapshot);
  maintenance = new MannerismMaintenance(f.world, provider);
  for (const [i, narration] of ["Maren drops her eyes before telling an obvious lie.", "The room is quiet.", "The room is quiet.", "The room is quiet."].entries()) await maintenance.afterFinalizedTurn(f.campaign, `reloaded_${i}`, { narration, final_revision: f.campaign.revision });
  assert.equal(rows(f, "maren").length, 2); assert.equal(rows(f, "maren")[1]!.source, "emergent"); assert.equal(candidates(f).length, 0);
});

test("D10 P2 model semantic matches outside the normalization vocabulary block acquisition before evidence", () => {
  const f = mannerismFixture(); const sequence = source(f), own = rows(f)[0]!.id, other = rows(f, "maren")[0]!.id;
  const base = { character_id: "brenna", sequence, ...tap, span_start: 0, span_end: 20 };
  const result = consume(f, [{ ...base, equivalent_owned_ids: [own] }, { ...base, equivalent_owned_ids: [other] }]);
  assert.equal(result.observations_rejected_existing_mannerism, 1); assert.equal(result.observations_rejected_global_duplicate, 1); assert.equal(candidates(f).length, 0);
});

test("D10 P2B first literal occurrence is extractable without an established candidate; the engine alone delays promotion", async () => {
  const f = mannerismFixture(); let calls = 0;
  const provider = new OpenRouterMannerismExtractor(new OpenRouterClient({ api_key: () => "offline-test-key", fetch: async (_url, init) => {
    calls++; const body = JSON.parse(String(init?.body));
    assert.match(body.messages[0].content, /An OBSERVATION means.*ONCE/);
    assert.match(body.messages[0].content, /never happened before and candidates is empty/);
    assert.match(body.messages[0].content, /You do not establish habits/);
    for (const trigger of MANNERISM_TRIGGERS) assert.ok(body.messages[0].content.includes(trigger));
    assert.ok(body.messages[1].content.startsWith(MANNERISM_EXTRACTOR_TASK));
    const r = JSON.parse(body.messages[1].content.slice(MANNERISM_EXTRACTOR_TASK.length)) as MannerismExtractionRequest;
    assert.deepEqual(r.candidates, []); const t = r.turns.find(t => t.narration === "Brenna drums two fingertips.")!; assert.ok(t);
    const observation = wire({ ...r, turns: [t] }, { action: "two_finger_tap", trigger: "none" });
    return new Response(JSON.stringify({ choices: [{ message: { content: output(r, [observation]) }, finish_reason: "stop" }], usage: {} }));
  } }));
  const maintenance = new MannerismMaintenance(f.world, provider);
  for (const [i, narration] of ["Brenna drums two fingertips.", "The room is quiet.", "The room is quiet.", "The room is quiet."].entries()) await maintenance.afterFinalizedTurn(f.campaign, `first_occurrence_${i}`, { narration, final_revision: f.campaign.revision });
  assert.equal(calls, 1); assert.equal(candidates(f).length, 1); assert.equal(candidates(f)[0]!.evidence.length, 1);
  assert.equal(rows(f).length, 1, "one admitted occurrence cannot establish or promote a permanent cue");
});

test("D10 P2B frozen live observations keep safety/alias decisions and complete real finalized promotion after reload", async () => {
  const frozen = JSON.parse(await readFile("tests/fixtures/d10-calibrated-extraction.json", "utf8")) as CalibratedReplayFixture & { prompt_sha256: string; schema_sha256: string };
  assert.equal(createHash("sha256").update(MANNERISM_EXTRACTOR_SYSTEM + "\n" + MANNERISM_EXTRACTOR_TASK).digest("hex"), frozen.prompt_sha256);
  assert.equal(createHash("sha256").update(JSON.stringify(MANNERISM_EXTRACTION_SCHEMA)).digest("hex"), frozen.schema_sha256);
  let raw = 0, validated = 0, acquired = 0, globallyRejected = 0;
  for (const [i, b] of frozen.batches.entries()) {
    const f = mannerismFixture(); if (i === 6) f.campaign.addMannerism({ expected_revision: f.campaign.revision, character_id: "brenna", definition: { canonical_key: "gaze_lower_before_lie", text: "Lowers their eyes before an obvious lie." } });
    raw += JSON.parse(b.response.text).observations.length;
    const v = validateExtractedMannerisms(b.response.text, b.request, f.campaign.exportSnapshot(), f.world); validated += v.observations.length;
    if (i >= 2 && i <= 5) assert.equal(v.observations.length, 0, "hard negative and ambiguous live batches must remain empty");
    for (const t of b.request.turns) source(f, t.narration);
    const m = consume(f, v.observations); acquired += m.candidates_created + m.candidates_reinforced; globallyRejected += m.observations_rejected_global_duplicate;
    if (i === 0) assert.deepEqual(candidates(f).map(c => c.evidence.length), [2, 2]);
  }
  assert.deepEqual([raw, validated, acquired, globallyRejected], [9, 9, 8, 1]);
  const proof = await replayCalibratedMannerisms(frozen);
  assert.equal(proof.finalized_turns, 16); assert.equal(proof.slot_2_promoted, true); assert.equal(proof.paid_calls, 0);
});
