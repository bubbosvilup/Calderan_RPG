import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GameSession, type SessionDeps } from "../app/game-session.js";
import { mannerismFixture } from "./d10-mannerism-corpus.js";
import { FileCampaignRepository } from "../persistence/campaign-repository.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { OpenRouterMannerismExtractor } from "../llm/openrouter/mannerism-extractor.js";
import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterStateControllerProvider } from "../llm/openrouter/state-controller.js";
import { NARRATOR_OUTPUT_TOKENS, mannerismExtractorModel } from "../app/provider-config.js";
import { readProviderStatus, controllerFallbackModels } from "../app/production.js";
import { resolveOptionalServices } from "../app/optional-services.js";

/**
 * Consolidation Block 7: minimal LIVE certification (evaluation only) of the optional side stores on the production GameSession -> TurnCoordinator path.
 *  LIVE A  four mannerism-eligible turns with learning ON: the extractor is detached; the LEARNING STORE (not the snapshot) receives the finalized-turn journal;
 *          extraction itself never changes the semantic revision (the revision at the turn's return equals the revision after the detached work settles);
 *          a client's expected_revision from the turn's view is still valid for the next turn.
 *  (LIVE B Reflection is certified deterministically: the producer is OFF by default and not safely enabled for a paid live run.)
 * One attempt, no reroll. Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/consolidation-block7-live.js
 */
interface Wire { readonly n: number; readonly model: unknown; readonly start_ms: number; end_ms?: number; status?: number }
const T0 = Date.now(), now = () => Date.now() - T0, wire: Wire[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (!url.includes("openrouter.ai") || typeof init?.body !== "string") return realFetch(input, init);
  const entry: Wire = { n: wire.length + 1, model: (JSON.parse(init.body) as { model?: unknown }).model, start_ms: now() }; wire.push(entry);
  const response = await realFetch(input, init); entry.end_ms = now(); entry.status = response.status; return response;
}) as typeof fetch;

async function main(): Promise<void> {
  const outDir = join("artifacts", "local", "evaluations", "consolidation_block7_live"); await mkdir(outDir, { recursive: true });
  const saves = join(outDir, "saves_a"), f = mannerismFixture(), service = new RetrievalService(f.world), status = readProviderStatus();
  const narrator = new MiniMaxNarratorProvider(undefined, { model: status.narrator_model!, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: true });
  const controller = new OpenRouterStateControllerProvider(undefined, { model: status.controller_model!, fallback_models: controllerFallbackModels() });
  const extractorModel = mannerismExtractorModel(), runs: unknown[] = [];
  const repository = new FileCampaignRepository(f.world, saves);
  const session = GameSession.fromCampaign({ world: f.world, repository, autosave: false,
    optional_services: resolveOptionalServices({ mannerism_learning: true, reflection: false, portrait_generation: false, item_sprite_generation: false, sprite_qa: false }, {}),
    mannerism_extractor: new OpenRouterMannerismExtractor(new OpenRouterClient(), { model: extractorModel }), mannerism_diagnostics_sink: (r: unknown) => runs.push(r),
    createCoordinator: (hooks: Parameters<SessionDeps["createCoordinator"]>[0]) => new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) }, { diagnostics_sink: hooks.diagnostics_sink }) } as never, f.campaign);
  const inputs = ["Brenna, sit with me a moment. I am waiting for the kiln to cool.", "I wait quietly, watching Brenna and Maren.", "Brenna, what are you thinking while we wait?", "I keep waiting beside Brenna."];
  const turns: Record<string, unknown>[] = [];
  let stateVersion = f.campaign.stateVersion;
  for (const [i, input] of inputs.entries()) {
    const outcome = await session.submitPlayerInput(input);
    const atReturn = f.campaign.revision, versionAtReturn = f.campaign.stateVersion;
    await session.optionalSettled();
    turns.push({ n: i + 1, ok: outcome.ok, error: outcome.ok ? null : outcome.error, revision_at_return: atReturn, revision_after_optional: f.campaign.revision,
      state_version_advanced_by_optional: f.campaign.stateVersion > versionAtReturn });
    stateVersion = f.campaign.stateVersion;
  }
  void stateVersion;
  const next = await session.submitPlayerInput("I wait a little longer.", { expected_revision: f.campaign.revision });
  await session.optionalSettled();
  const saved = await session.save();
  const id = f.campaign.exportSnapshot().campaign_id, file = JSON.parse(await readFile(join(saves, id, "save.json"), "utf8")) as { schema_version: number; optional_state?: unknown; snapshot: Record<string, unknown> };
  const store = JSON.parse(await readFile(join(saves, id, "optional", "learning.json"), "utf8")) as { bound_revision: number; data: { mannerism_learning?: { sequence: number; processed_sequence: number; journal: unknown[]; candidates: unknown[] } } };
  const extractorCalls = wire.filter(w => w.model === extractorModel).map(w => ({ ...w }));
  const verdict = {
    all_turns_ok: turns.every(t => t.ok === true) && next.ok,
    extractor_called: extractorCalls.length >= 1,
    extraction_never_changes_revision: turns.every(t => t.revision_at_return === t.revision_after_optional),
    expected_revision_valid_after_background_work: next.ok === true,
    learning_store_received_the_journal: (store.data.mannerism_learning?.journal.length ?? 0) >= 4,
    snapshot_has_no_mannerism_learning: !("mannerism_learning" in file.snapshot) && file.schema_version === 8,
    markers_present: !!file.optional_state, save_ok: saved.ok === true,
  };
  const out = { generated_at: new Date().toISOString(), wire_total: wire.length, verdict, turns, extractor_calls: extractorCalls, runs_recorded: runs.length,
    learning_store: { bound_revision: store.bound_revision, sequence: store.data.mannerism_learning?.sequence, processed_sequence: store.data.mannerism_learning?.processed_sequence, journal: store.data.mannerism_learning?.journal.length, candidates: store.data.mannerism_learning?.candidates.length } };
  await writeFile(join(outDir, "result.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ wire_total: wire.length, verdict, learning_store: out.learning_store }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
