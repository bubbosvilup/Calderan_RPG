import { writeFile } from "node:fs/promises";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { DEFAULT_NARRATOR_MODEL, MiniMaxNarratorProvider, NARRATOR_PROVIDER_ROUTING } from "../llm/openrouter/minimax-narrator.js";
import { DEFAULT_CONTROLLER_MODEL, OpenRouterStateControllerProvider } from "../llm/openrouter/state-controller.js";
import { NARRATOR_OUTPUT_TOKENS, selectedModels } from "../app/provider-config.js";
import { controllerFallbackModels } from "../app/production.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { retrieveForTurn } from "../turn/retrieval-policy.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { buildNarratorPrompt } from "../turn/prompt-builder.js";
import { playerIntent } from "../turn/player-intent.js";
import { prepareNarratorRequest } from "../turn/context-budget.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { largeScene, richScene } from "./scene-foundation-fixtures.js";
import { apply, itemId, makeItem, promptFor, sceneBlock, sceneFixture, SCENE_ELSEWHERE } from "./scene-state-fixtures.js";
import type { RecentExchange } from "../turn/recent-conversation.js";
import type { GenerationRequest } from "../llm/types.js";

/**
 * Foundation certification, live part. Synthetic public fixtures only. At most SIX Narrator-only calls and THREE end-to-end turns,
 * no semantic retry, no image API. No key is read or printed: the placeholder below is replaced by the sandbox proxy.
 * Usage: NODE_USE_ENV_PROXY=1 node .build/src/dev/scene-state-foundation-live.js <out.json> [--dry]
 */
const out = process.argv[2] ?? "scene-state-foundation-live.json", dry = process.argv.includes("--dry");
const requests: { readonly url: string; readonly model: unknown; readonly status: number | null; readonly kind: string }[] = [];
const countingFetch: typeof fetch = async (input, init) => {
  const body = (() => { try { return JSON.parse(String(init?.body ?? "{}")) as { model?: unknown; models?: unknown; stream?: boolean }; } catch { return {}; } })();
  let status: number | null = null;
  try { const response = await fetch(input, init); status = response.status; return response; }
  finally { requests.push({ url: String(input instanceof Request ? input.url : input).replace(/\?.*$/, ""), model: body.models ?? body.model ?? null, status, kind: (body as { stream?: boolean }).stream ? "stream" : "json" }); }
};
const client = new OpenRouterClient({ api_key: () => "sandbox-proxy-injects-auth", fetch: countingFetch });
const models = selectedModels();
const narrator = new MiniMaxNarratorProvider(client, { model: models.narrator, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: true });
const controller = new OpenRouterStateControllerProvider(client, { model: models.controller, fallback_models: controllerFallbackModels() });
const ex = (player: string, narration: string): RecentExchange => ({ player, narration, status: "finalized" });
const config = { narrator: models.narrator, narrator_default: DEFAULT_NARRATOR_MODEL, narrator_route: NARRATOR_PROVIDER_ROUTING[models.narrator] ?? "OpenRouter default routing", narrator_max_output_tokens: NARRATOR_OUTPUT_TOKENS,
  narrator_reasoning: "disabled", controller: models.controller, controller_default: DEFAULT_CONTROLLER_MODEL, controller_fallbacks: controllerFallbackModels(), date: new Date().toISOString() };

interface Case { readonly id: string; readonly input: string; readonly recent: readonly RecentExchange[]; readonly world: ReturnType<typeof richScene>["world"]; readonly campaign: ReturnType<typeof richScene>["campaign"]; readonly retrieval?: boolean }
async function narrate(request: GenerationRequest): Promise<{ text: string; usage?: unknown; model?: unknown; error?: string }> {
  let text = "", usage: unknown, model: unknown, error: string | undefined;
  try { for await (const ev of narrator.stream(request)) { if (ev.type === "text_delta") text += ev.text; else if (ev.type === "completed") { usage = ev.result.usage; model = ev.result.model; } else if (ev.type === "error") error = String(ev.error?.message ?? ev.error); } }
  catch (cause) { error = String((cause as Error).message); }
  return { text, usage, model, ...(error ? { error } : {}) };
}
function cases(): Case[] {
  const rich = richScene({ canon: true } as never), stale = richScene({ id: "stale_scene" });
  apply(stale.campaign, { kind: "transfer_item", item_id: itemId(stale.campaign, "Sword"), mode: "return", position: { kind: "carried", character_id: "nicco" } } as never);
  const big = largeScene();
  const retr = richScene({ canon: true } as never);
  return [
    { id: "L1 multi-system scene", input: "Brenna, are you alright? And why are you carrying my sword?", recent: [], ...rich },
    { id: "L2 stored item + current location", input: "Where did I leave the letter?", recent: [], ...rich },
    { id: "L3 knowledge scopes", input: "Brenna, Maren, what do you two know about the West Gate incident, the eastern bridge and the grain tax?", recent: [], ...rich },
    { id: "L4 stale transcript conflict", input: "Brenna, how do you feel? And what time of day is it?", recent: [ex("Good morning, Brenna.", "*Bright morning light fills the room. Brenna, rested and cheerful, holds Nicco's sword and Maren sits unhurt.*")], ...stale },
    { id: "L5 large bounded scene", input: "Brenna, are you alright? Look around the room.", recent: [], ...big },
    { id: "L6 retrieval + current state", input: "What does the household tradition say about the sword and the hearth, and where is the sword right now?", recent: [], retrieval: true, ...retr },
  ];
}
async function promptOf(c: Case) {
  if (!c.retrieval) { const p = promptFor(c.world, c.campaign, c.input, c.recent); return { request: prepareNarratorRequest(p.request, undefined, undefined), scene: sceneBlock(p.text), retrieved: false }; }
  const context = buildTurnContext(c.world, c.campaign.exportSnapshot(), { input: c.input }), snapshot = c.campaign.exportSnapshot(), intent = playerIntent(c.input, context, snapshot, c.world);
  const service = new RetrievalService(c.world), r = await retrieveForTurn(c.input, context, c.world, { service, search: new HybridSearch(service) });
  const request = buildNarratorPrompt(c.input, context, c.recent, r.data, intent, { knowledge_relevance_input: c.input });
  return { request: prepareNarratorRequest(request, undefined, undefined), scene: sceneBlock(request.messages[0]!.content), retrieved: JSON.stringify(r.data).includes("hangs above the great hearth") };
}
const result: Record<string, unknown> = { config, narrator_only: [], end_to_end: [] };
const list = cases();
for (const c of list) {
  const prompt = await promptOf(c);
  const base = { case: c.id, input: c.input, recent: c.recent, retrieval_in_prompt: prompt.retrieved, scene_block: prompt.scene, prompt_chars: JSON.stringify(prompt.request).length };
  if (dry) { (result.narrator_only as unknown[]).push(base); console.log(`DRY ${c.id}: scene ${prompt.scene.length} chars, prompt ${base.prompt_chars}, retrieval=${prompt.retrieved}`); continue; }
  const answer = await narrate(prompt.request);
  (result.narrator_only as unknown[]).push({ ...base, response: answer.text, usage: answer.usage, model: answer.model, ...(answer.error ? { error: answer.error } : {}) });
  console.log(`== ${c.id}${answer.error ? ` ERROR ${answer.error}` : ""}\n${answer.text}\n`);
}
if (!dry) {
  const narratorCalls = requests.length;
  // End-to-end turns: the real TurnCoordinator with the production Narrator + Controller configuration.
  const turn = async (id: string, f: ReturnType<typeof sceneFixture>, inputs: readonly string[]) => {
    const service = new RetrievalService(f.world), coordinator = new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) });
    const log: unknown[] = [];
    for (const input of inputs) {
      const before = requests.length, base = f.campaign.revision, scenes: string[] = [];
      scenes.push(sceneBlock(coordinator.contextRequest(f.campaign).messages[0]!.content));
      let narration = "", failed: string | undefined, committed: unknown;
      for await (const ev of coordinator.runTurn({ campaign: f.campaign, player_input: input })) {
        if (ev.type === "narration_completed") narration = (ev as { text?: string }).text ?? narration;
        if (ev.type === "turn_failed") failed = (ev as { code?: string }).code;
        if (ev.type === "state_committed") committed = { revision: (ev as { revision?: number }).revision };
      }
      const next = sceneBlock(coordinator.contextRequest(f.campaign).messages[0]!.content);
      log.push({ input, scene_before: scenes[0], scene_after: next, narration, committed, failed, revision: [base, f.campaign.revision], provider_requests: requests.slice(before) });
      console.log(`== ${id} :: ${input} -> ${failed ?? "ok"} (revision ${base} -> ${f.campaign.revision})\n${narration}\n`);
    }
    return { id, turns: log };
  };
  const e1 = sceneFixture({ id: "e2e_item", commands: [{ kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE }, { kind: "move_character", character_id: "gerome", location_id: SCENE_ELSEWHERE }] });
  apply(e1.campaign, makeItem({ name: "Sword", description: "A plain iron sword.", owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } }));
  const e2 = sceneFixture({ id: "e2e_condition", commands: [{ kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE }, { kind: "move_character", character_id: "gerome", location_id: SCENE_ELSEWHERE }] });
  const e3 = sceneFixture({ id: "e2e_movement", commands: [{ kind: "move_character", character_id: "pellan", location_id: SCENE_ELSEWHERE }] });
  const marker = () => requests.length;
  void marker;
  (result.end_to_end as unknown[]).push(await turn("E2E1 item handover", e1, ["*hands Brenna the sword*"]));
  (result.end_to_end as unknown[]).push(await turn("E2E2 condition continuity", e2, ["*punches Maren hard in the stomach*"]));
  (result.end_to_end as unknown[]).push(await turn("E2E3 movement continuity", e3, ["/go Cellar"]));
  result.provider_requests = { narrator_only_calls: narratorCalls, total: requests.length, e2e_requests: requests.length - narratorCalls, requests };
  result.final_state = { sword_holder: e1.campaign.exportSnapshot().items.map(i => ({ name: i.name, position: i.position, owner: i.owner_id })), maren_conditions: e2.campaign.exportSnapshot().characters.find(c => c.id === "maren")?.current?.conditions ?? [], player_location: e3.campaign.exportSnapshot().runtime.scene.player_location };
}
await writeFile(out, JSON.stringify(result, null, 1));
