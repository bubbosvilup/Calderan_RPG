import assert from "node:assert/strict";
import { mannerismFixture } from "./d10-mannerism-corpus.js";
import { CampaignState } from "../campaign/campaign-state.js";
import { GameSession } from "../app/game-session.js";
import { FileCampaignRepository } from "../persistence/campaign-repository.js";
import { createSaveFile, decodeSave, serializeSave } from "../persistence/save-format.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { packNpcPlus } from "../turn/npc-plus.js";
import { validateExtractedMannerisms, type MannerismExtractor, type MannerismExtractionRequest, type MannerismRun } from "../turn/mannerism-extraction.js";
import type { GenerationRequest } from "../llm/types.js";

export interface CalibratedReplayFixture {
  model: string;
  summary: { green: boolean; accepted_valid: number };
  batches: { request: MannerismExtractionRequest; response: { text: string } }[];
}

/** Reuses recorded live extraction decisions in real finalized fixture turns; makes no HTTP/provider calls. */
export async function replayCalibratedMannerisms(frozen: CalibratedReplayFixture) {
  assert.ok(frozen.summary.green && frozen.summary.accepted_valid >= 6);
  const f = mannerismFixture(), batch = frozen.batches[0]!;
  const live = validateExtractedMannerisms(batch.response.text, batch.request, f.campaign.exportSnapshot(), f.world).observations;
  const alias = live.filter(o => o.action === "gaze_lower" && o.trigger === "before_lie" && !o.requires_item_id && !o.requires_entity_id);
  assert.equal(alias.length, 2, "frozen live model must have supplied both gaze aliases");
  const target = alias[0]!.character_id, other = target === "maren" ? "brenna" : "maren";
  const targetName = target === "maren" ? "Maren" : "Brenna", otherName = other === "maren" ? "Maren" : "Brenna";
  const catalog = alias.map(o => {
    const turn = batch.request.turns.find(t => t.sequence === o.sequence)!;
    return { narration: turn.narration, quote: turn.narration.slice(o.span_start, o.span_end), observation: o };
  });
  const original = f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === target)!.mannerisms![0]!;
  const runs: MannerismRun[] = [], prompts: string[] = [];
  let narration = "The room is quiet.", replayBatches = 0;
  const provider: MannerismExtractor = { async extract(request) {
    replayBatches++;
    const observations = request.turns.flatMap(t => {
      const match = catalog.find(c => t.narration === c.narration || t.narration === c.narration.replace(targetName, otherName));
      if (!match) return [];
      const isOther = t.narration.startsWith(otherName), o = match.observation;
      return [{ turn_sequence: t.sequence, character_id: isOther ? other : target, action: o.action, trigger: o.trigger,
        evidence_quote: isOther ? match.quote.replace(targetName, otherName) : match.quote,
        requires_item_id: null, requires_entity_id: null, equivalent_owned_ids: [] }];
    });
    // Rebind source/ownership envelope only. The live action/trigger/quote decision remains unchanged.
    // Feedback/global ownership below is checked by the real deterministic domain, not a new paid model call.
    return { text: JSON.stringify({ owned_reviewed_ids: request.owned.map(m => m.id), observations }) };
  } };
  const metadata = { model: "finalized-fixture-replay", usage: {}, latency: { request_started_at: "2026-10-04T00:00:00.000Z", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "2026-10-04T00:00:00.000Z", elapsed_total_ms: 0 } };
  const inspect = (request: GenerationRequest) => prompts.push(JSON.stringify(request.messages));
  const narrator = {
    async generate(request: GenerationRequest) { inspect(request); return { text: narration, ...metadata }; },
    async *stream(request: GenerationRequest) { inspect(request); yield { type: "text_delta" as const, text: narration }; yield { type: "completed" as const, result: { text: narration, ...metadata } }; },
  };
  const service = new RetrievalService(f.world);
  const sessionFor = () => GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, "saves/d10-mannerisms/pass2b/replay-not-written"),
    mannerism_extractor: provider, mannerism_diagnostics_sink: r => runs.push(r), createCoordinator: hooks => new TurnCoordinator(f.world, narrator,
      { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { diagnostics_sink: hooks.diagnostics_sink, provider_retry: false }),
  }, f.campaign);
  let session = sessionFor(), finalizedTurns = 0;
  const play = async (text: string) => {
    narration = text;
    const result = await session.submitPlayerInput(`I wait quietly beside ${targetName}.`);
    assert.ok(result.ok, "fixture narration must actually finalize before extraction");
    assert.equal(result.narration, text); finalizedTurns++;
  };
  await play(catalog[0]!.narration); await play(catalog[1]!.narration);
  await play("The room is quiet."); await play("The room is quiet.");
  const candidate = f.campaign.exportSnapshot().mannerism_learning!.candidates.find(c => c.character_id === target)!;
  assert.equal(candidate.evidence.length, 2); assert.notEqual(candidate.evidence[0]!.sequence, candidate.evidence[1]!.sequence);
  const saved = serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-04T00:00:00.000Z"), f.world);
  const beforeLoad = f.campaign.exportSnapshot();
  f.campaign = CampaignState.restore(f.world, decodeSave(saved, f.world).snapshot);
  assert.deepEqual(f.campaign.exportSnapshot(), beforeLoad); session = sessionFor();
  await play(catalog[0]!.narration);
  for (let i = 0; i < 3; i++) await play("The room is quiet.");
  const promoted = f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === target)!.mannerisms!;
  assert.equal(promoted.length, 2); assert.deepEqual(promoted[0], original); assert.equal(promoted[1]!.source, "emergent");
  assert.equal(runs.at(-1)!.metrics.mannerisms_promoted, 1);
  const cue = promoted[1]!.text;
  assert.ok(packNpcPlus(f.world, f.campaign.exportSnapshot(), new Set([target]), targetName)!.lines.join("\n").includes(cue));
  for (let i = 0; i < 4; i++) await play(catalog[i % 2]!.narration);
  const feedback = runs.at(-1)!.metrics;
  assert.equal(feedback.observations_rejected_existing_mannerism, 4); assert.equal(feedback.candidates_reinforced, 0);
  assert.ok(prompts.slice(-4).some(p => p.includes(cue)), "subsequent real narrator request must contain the promoted cue");
  for (let i = 0; i < 4; i++) await play(catalog[i % 2]!.narration.replace(targetName, otherName));
  const duplicate = runs.at(-1)!.metrics;
  assert.equal(duplicate.observations_rejected_global_duplicate, 4);
  assert.equal(f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === other)!.mannerisms!.length, 1);
  assert.deepEqual(f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === target)!.mannerisms, promoted);
  assert.equal(f.campaign.exportSnapshot().mannerism_learning!.candidates.length, 0);
  return { source_model: frozen.model, finalized_turns: finalizedTurns, cached_extraction_batches: replayBatches, paid_calls: 0,
    live_alias_evidence_before_load: 2, evidence_preserved_on_load: true, independent_moments_for_promotion: 3, slot_2_promoted: true,
    narrator_context_contains_cue: true, cue, post_promotion_feedback_blocked: feedback.observations_rejected_existing_mannerism,
    feedback_reinforcement: feedback.candidates_reinforced, other_npc_duplicates_blocked: duplicate.observations_rejected_global_duplicate, no_overwrite: true };
}
