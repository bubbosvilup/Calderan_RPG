import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProductionDeps, GameSession } from "../app/index.js";
import type { SessionDeps } from "../app/game-session.js";
import type { SessionEvent } from "../app/game-session.js";
import { SLAVE_MARKET_V1 } from "../app/scenarios.js";

/**
 * Consolidation Block 4: LIVE certification (evaluation only) of turn reliability on the production GameSession -> TurnCoordinator -> Narrator/Controller path.
 *
 *  A  a normal turn: the Narrator request carries the 768 cap, the browser-facing events are neutral progress only, ONE Controller call, ONE commit, the generation
 *     metadata is in the trace; a repeat of the same turn_key is a replay that calls no provider.
 *  B  forced truncation on the REAL production model: ONLY the first Narrator request's `max_tokens` is lowered (so the provider itself ends with finish_reason=length);
 *     every later request is untouched. Expect: partial never delivered, exactly one recovery request (cap 1024), one Controller call, one commit.
 *
 * No reroll loops: one attempt per scenario. Usage: NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=placeholder node .build/src/dev/consolidation-block4-live.js
 */
const NARRATOR_MODEL = "z-ai/glm-5.2";
interface Wire { readonly n: number; readonly kind: "narrator" | "other"; readonly model: unknown; readonly max_tokens: unknown; readonly forced_cap?: number; readonly system_head: string; readonly recovery_notice: boolean; readonly status?: number }
const wire: Wire[] = [];
let forceFirstNarratorCap: number | undefined;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
  if (!url.includes("openrouter.ai") || typeof init?.body !== "string") return realFetch(input, init);
  const body = JSON.parse(init.body) as Record<string, any>, narrator = body.model === NARRATOR_MODEL;
  const system = String(body.messages?.[0]?.content ?? "");
  let forced: number | undefined;
  if (narrator && forceFirstNarratorCap !== undefined) { forced = forceFirstNarratorCap; forceFirstNarratorCap = undefined; body.max_tokens = forced; }
  const entry: Wire = { n: wire.length + 1, kind: narrator ? "narrator" : "other", model: body.model, max_tokens: body.max_tokens, ...(forced !== undefined ? { forced_cap: forced } : {}),
    system_head: system.slice(0, 48).replace(/\s+/g, " "), recovery_notice: system.includes("OUTPUT BUDGET NOTICE") };
  const response = await realFetch(input, { ...init, body: JSON.stringify(body) });
  wire.push({ ...entry, status: response.status });
  return response;
}) as typeof fetch;

async function main(): Promise<void> {
  const outDir = join("artifacts", "local", "evaluations", "consolidation_block4_live"), saveDir = join("saves", "consolidation_block4_live");
  await mkdir(outDir, { recursive: true }); await mkdir(saveDir, { recursive: true });
  const base = await createProductionDeps({ save_dir: saveDir, persistent_campaigns: true, reflection_mode: "off" });
  const { portrait_generator: _pg, item_sprite_reviewer: _sr, autosave: _as, ...rest } = base; void _pg; void _sr; void _as;
  const deps: SessionDeps = { ...rest, autosave: false, unsafe_trace: true };

  const scenario = async (label: string, input: string, opts: { force_cap?: number; repeat?: boolean }) => {
    const campaign = SLAVE_MARKET_V1.create(deps.world, `block4_${label.toLowerCase()}_${Date.now()}`);
    const session = GameSession.fromCampaign(deps, campaign, { opening_text: SLAVE_MARKET_V1.opening_text });
    const events: SessionEvent[] = []; const mark = wire.length;
    const key = `block4_${label.toLowerCase()}_${Date.now().toString(36)}`, revision = campaign.revision;
    if (opts.force_cap !== undefined) forceFirstNarratorCap = opts.force_cap;
    const started = performance.now();
    const outcome = await session.submitPlayerInput(input, { turn_key: key, expected_revision: revision, onEvent: e => events.push(e) });
    const elapsed_ms = Math.round(performance.now() - started), sent = wire.slice(mark), after = campaign.revision;
    const progress = events.filter(e => e.type === "turn_progress").map(e => (e as { phase: string }).phase);
    const eventTypes = events.map(e => e.type), trace = outcome.ok ? outcome.trace : undefined;
    const narration = outcome.ok ? outcome.narration : "";
    let replay: Record<string, unknown> | undefined;
    if (opts.repeat && outcome.ok) {
      const before = wire.length, again = await session.submitPlayerInput(input, { turn_key: key, expected_revision: revision });
      replay = { ok: again.ok, replayed: again.ok ? again.replayed === true : false, same_narration: again.ok && again.narration === narration, same_turn_id: again.ok && again.turn_id === outcome.turn_id,
        provider_calls: wire.length - before, revision_after_replay: campaign.revision };
    }
    const usage = JSON.stringify(trace?.usage ?? {}); let tokens = 0, cost = 0;
    for (const m of usage.matchAll(/"total_tokens":(\d+)/g)) tokens += Number(m[1]); for (const m of usage.matchAll(/"cost(?:_usd)?":([\d.]+)/g)) cost += Number(m[1]);
    const entry = { label, input, ok: outcome.ok, error: outcome.ok ? null : outcome.error, turn_key: key, revision_before: revision, revision_after: after, state_changed: after > revision, elapsed_ms,
      neutral_progress: progress, event_types: eventTypes, narration, narration_chars: narration.length, narrator_requests: sent.filter(w => w.kind === "narrator").length,
      non_narrator_requests: sent.filter(w => w.kind === "other").length, wire: sent, narrator_generation: trace?.narrator_generation ?? null, publication_warnings: trace?.publication_warnings ?? [],
      usage: trace?.usage ?? null, total_tokens: tokens, cost_usd: cost, replay };
    console.log(JSON.stringify({ label, ok: entry.ok, state_changed: entry.state_changed, narrator_requests: entry.narrator_requests, other_requests: entry.non_narrator_requests, progress, replay: replay ?? null,
      generation: trace?.narrator_generation ? { logical: trace.narrator_generation.logical_generations, physical: trace.narrator_generation.physical_attempts, truncation: trace.narrator_generation.truncation } : null }));
    await session.shutdown({ discard_unsaved: true });
    return entry;
  };
  const input = "I look around the market and nod politely to the nearest vendor.";
  const A = await scenario("A_normal", input, { repeat: true });
  const B = await scenario("B_forced_truncation", input, { force_cap: 24 });
  const totalRequests = wire.length, narratorRequests = wire.filter(w => w.kind === "narrator").length;
  const verdict = {
    A_ok: A.ok && A.event_types.includes("turn_completed"), A_cap_768: A.wire.filter(w => w.kind === "narrator").every(w => w.max_tokens === 768), A_one_narrator_request: A.narrator_requests === 1,
    A_neutral_progress_only: A.neutral_progress.length > 0 && A.neutral_progress.every(p => ["thinking", "narrating", "resolving"].includes(p)), A_replay_zero_provider_calls: A.replay?.provider_calls === 0 && A.replay?.replayed === true,
    B_first_request_cap_forced: B.wire.find(w => w.kind === "narrator")?.forced_cap === 24, B_truncation_detected: B.narrator_generation?.truncation.detected === true,
    B_recovery_cap_1024: B.wire.filter(w => w.kind === "narrator" && w.recovery_notice).every(w => w.max_tokens === 1024) && B.wire.some(w => w.recovery_notice),
    B_one_recovery_request: B.wire.filter(w => w.recovery_notice).length === 1, B_recovered_and_completed: B.ok && B.narrator_generation?.truncation.recovery_result === "succeeded",
    B_max_physical_3: (B.narrator_generation?.physical_attempts ?? 99) <= 3, B_partial_not_delivered: B.ok && B.narration_chars > 40,
  };
  await writeFile(join(outDir, "run.json"), JSON.stringify({ verdict, total_provider_requests: totalRequests, narrator_requests: narratorRequests, total_tokens: A.total_tokens + B.total_tokens, cost_usd: A.cost_usd + B.cost_usd, A, B }, null, 2));
  console.log(JSON.stringify({ verdict, totalRequests, narratorRequests, tokens: A.total_tokens + B.total_tokens, cost: A.cost_usd + B.cost_usd }, null, 1));
}
await main();
