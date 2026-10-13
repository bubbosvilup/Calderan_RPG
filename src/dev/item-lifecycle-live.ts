import { writeFile } from "node:fs/promises";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterStateControllerProvider } from "../llm/openrouter/state-controller.js";
import { NARRATOR_OUTPUT_TOKENS, selectedModels } from "../app/provider-config.js";
import { controllerFallbackModels } from "../app/production.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { TurnCoordinator } from "../turn/coordinator/turn-coordinator.js";
import { diagnoseMutation } from "../turn/coordinator/mutation-diagnostics.js";
import type { TurnDiagnostics } from "../turn/coordinator/turn-diagnostics.js";
import type { TurnDebugRecord, TurnEvent } from "../turn/turn-types.js";
import { apply, makeItem, sceneFixture, SCENE_ELSEWHERE, SCENE_LOCATION } from "./scene-state-fixtures.js";
import { inspectInventory, inspectItem } from "./item-lifecycle-inspector.js";

/**
 * Item lifecycle live smoke: TWO end-to-end turns (pickup, drop; ordinary language) on ONE campaign (production Narrator + Controller + fallback), each with the
 * full mutation diagnostics. No semantic retry, no image API, synthetic public fixtures only. No key is read or printed: the placeholder
 * below is replaced by the sandbox proxy.
 * Usage: NODE_USE_ENV_PROXY=1 node .build/src/dev/item-lifecycle-live.js <out.json> --live
 */
const out = process.argv[2] ?? "item-lifecycle-live.json";
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
const f = sceneFixture({ id: "item_live", commands: away });
apply(f.campaign, makeItem({ name: "Sword", description: "A plain iron sword.", owner_id: "nicco", position: { kind: "stored", location_id: SCENE_LOCATION } }));
const swordId = f.campaign.exportSnapshot().items.find(i => i.name === "Sword")!.id;
const service = new RetrievalService(f.world), debug: TurnDebugRecord[] = []; let record: TurnDiagnostics | undefined;
const coordinator = new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) }, { debug_sink: r => debug.push(r), diagnostics_sink: r => { record = r as TurnDiagnostics; } });
const results: unknown[] = [];
async function turn(id: string, input: string) {
  const before = requests.length, revision = f.campaign.revision, events: TurnEvent[] = []; debug.length = 0;
  for await (const ev of coordinator.runTurn({ campaign: f.campaign, player_input: input })) events.push(ev);
  const last = events.at(-1)!, result = last.type === "turn_completed" ? last.result : undefined, failed = last.type === "turn_failed" ? last : undefined;
  const diagnostic = diagnoseMutation({ ...(result ? { result } : {}), ...(failed ? { failed } : {}), ...(record ? { diagnostics: record } : {}), debug });
  const entry = { id, input, narration: result?.narration ?? failed?.narration ?? "", draft: result?.narration_reconciliation?.draft ?? null, requests: requests.slice(before).length, controller_proposal: result?.controller_proposal ?? [],
    authorization: result?.authorization.map(a => ({ kind: a.command.kind, authorized: a.authorized, reason: a.reason, source: a.source, evidence: a.evidence })) ?? [],
    revision: [revision, f.campaign.revision], item: inspectItem(f as never, swordId), inventory: inspectInventory(f as never, "nicco"),
    item_count: f.campaign.exportSnapshot().items.filter(i => /sword/i.test(i.name ?? "")).length, diagnostic };
  console.log(`== ${id} :: ${input}\n${entry.narration}\n-> verdict=${diagnostic.verdict} code=${diagnostic.code ?? "-"} revision ${entry.revision.join("->")} item=${JSON.stringify(entry.item.position)} owner=${entry.item.owner} in_inventory=${entry.item.in_inventory_of.join(",") || "-"} swords=${entry.item_count}\n`);
  results.push(entry);
}
// Debt Zero smoke: ordinary language, two turns (about four provider requests): the explicit intents are bound deterministically and the receipt decides.
await turn("live 1: pickup", "I pick up the sword.");
await turn("live 2: drop", "I put the sword down on the floor.");
await writeFile(out, JSON.stringify({ config: { narrator: models.narrator, controller: models.controller, fallbacks: controllerFallbackModels(), date: new Date().toISOString() }, provider_requests: { total: requests.length, requests }, results }, null, 2));
console.log(`requests total: ${requests.length}`);
