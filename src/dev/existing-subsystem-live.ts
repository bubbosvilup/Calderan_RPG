import { writeFile } from "node:fs/promises";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterStateControllerProvider } from "../llm/openrouter/state-controller.js";
import { NARRATOR_OUTPUT_TOKENS, selectedModels } from "../app/provider-config.js";
import { controllerFallbackModels } from "../app/production.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { diagnoseMutation } from "../turn/mutation-diagnostics.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import type { TurnDebugRecord, TurnEvent } from "../turn/turn-types.js";
import { apply, makeItem, sceneFixture, SCENE_ELSEWHERE } from "./scene-state-fixtures.js";

/**
 * Consolidation Pass C final smoke: AT MOST TWO end-to-end turns (primed receipt re-test; rusty-sword materialization) (production Narrator + Controller + fallback), each with the
 * full mutation diagnostics. No semantic retry, no image API, synthetic public fixtures only. No key is read or printed: the placeholder
 * below is replaced by the sandbox proxy.
 * Usage: NODE_USE_ENV_PROXY=1 node .build/src/dev/existing-subsystem-live.js <out.json> --live
 */
const out = process.argv[2] ?? "controller-authorization-live.json";
if (!process.argv.includes("--live")) { console.log("Refusing to call providers without --live."); process.exit(0); }
const requests: { readonly model: unknown; readonly status: number | null }[] = [];
const countingFetch: typeof fetch = async (input, init) => {
  const body = (() => { try { return JSON.parse(String(init?.body ?? "{}")) as { model?: unknown; models?: unknown }; } catch { return {}; } })();
  let status: number | null = null;
  try { const response = await fetch(input, init); status = response.status; return response; } finally { requests.push({ model: body.models ?? body.model ?? null, status }); }
};
const client = new OpenRouterClient({ api_key: () => "sandbox-proxy-injects-auth", fetch: countingFetch });
const models = selectedModels();
const narrator = new MiniMaxNarratorProvider(client, { model: models.narrator, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: true });
const controller = new OpenRouterStateControllerProvider(client, { model: models.controller, fallback_models: controllerFallbackModels() });
const away = [{ kind: "move_character" as const, character_id: "pellan", location_id: SCENE_ELSEWHERE }, { kind: "move_character" as const, character_id: "gerome", location_id: SCENE_ELSEWHERE }];

async function live(id: string, f: ReturnType<typeof sceneFixture>, input: string, prime?: { player: string; narration: string }) {
  const service = new RetrievalService(f.world), debug: TurnDebugRecord[] = []; let record: TurnDiagnostics | undefined;
  const coordinator = new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) }, { debug_sink: r => debug.push(r), diagnostics_sink: r => { record = r as TurnDiagnostics; } });
  if (prime) coordinator.recent(f.campaign).add({ ...prime, status: "finalized" });
  const before = requests.length, events: TurnEvent[] = [];
  for await (const ev of coordinator.runTurn({ campaign: f.campaign, player_input: input })) events.push(ev);
  const last = events.at(-1)!;
  const result = last.type === "turn_completed" ? last.result : undefined, failed = last.type === "turn_failed" ? last : undefined;
  const diagnostic = diagnoseMutation({ ...(result ? { result } : {}), ...(failed ? { failed } : {}), ...(record ? { diagnostics: record } : {}), debug });
  const entry = { id, input, requests: requests.slice(before), narration: result?.narration ?? failed?.narration ?? "", controller_proposal: result?.controller_proposal ?? [],
    authorization: result?.authorization.map(a => ({ kind: a.command.kind, authorized: a.authorized, reason: a.reason, source: a.source, grammar: a.grammar, evidence: a.evidence })) ?? [],
    controller: record?.controller ? { model: record.controller.model, response_model: record.controller.response_model, fallback: record.controller.model_fallback, parse_success: record.controller.parse_success, proposed_count: record.controller.proposed_count } : undefined,
    debug_kinds: debug.map(d => d.kind), diagnostic };
  console.log(`== ${id} :: ${input}\n${entry.narration}\n-> verdict=${diagnostic.verdict} code=${diagnostic.code ?? "-"} revision ${diagnostic.revision_before}->${diagnostic.revision_after} requests=${entry.requests.length}\n`);
  return entry;
}
const only = process.argv.find(a => a.startsWith("--only="))?.slice(7);
const results: unknown[] = [];
const e1 = sceneFixture({ id: "pc_live1", commands: away });
apply(e1.campaign, makeItem({ name: "Sword", description: "A plain iron sword.", owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } }));
if (!only || only === "1") results.push(await live("live 1: primed receipt", e1, "*hands Brenna the sword*", { player: "Brenna: Give me the sword. I'll take it.", narration: "Brenna holds out her hand, palm up, her eyes fixed on the blade at Nicco's hip. \"Give me the sword. I'll take it,\" she says, steady and impatient." }));
const e2 = sceneFixture({ id: "pc_live2", commands: away });
if (!only || only === "2") results.push(await live("live 2: rusty sword", e2, "*finds a rusty sword discarded on the ground, picks it up and claims it as his own*"));
const final = { sword_holder_1: e1.campaign.exportSnapshot().items.map(i => ({ id: i.id, name: i.name, position: i.position, owner: i.owner_id })), items_2: e2.campaign.exportSnapshot().items.map(i => ({ id: i.id, name: i.name, position: i.position, owner: i.owner_id })) };
await writeFile(out, JSON.stringify({ config: { narrator: models.narrator, controller: models.controller, fallbacks: controllerFallbackModels(), date: new Date().toISOString() }, provider_requests: { total: requests.length, requests }, results, final_state: final }, null, 1));
console.log(`requests total: ${requests.length}; final: ${JSON.stringify(final)}`);
