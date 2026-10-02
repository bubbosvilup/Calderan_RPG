import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { turnFixture } from "./turn-fixture.js";
import { onlineCoordinator, selectedModels } from "./turn-services.js";
import { runPlayTurn } from "./play-turn.js";
import { OpenRouterReflectionProvider } from "../llm/openrouter/reflection-provider.js";
import { reflectionEvidence, type ReflectionProvider } from "../turn/reflection.js";
import type { ReflectionDiagnostics } from "../turn/reflection-diagnostics.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import type { Usage } from "../llm/types.js";
import type { DeepReadonly } from "../types/readonly.js";

/** Pass 7: real providers, multi-turn households; only membership/setup precedes play. NO premium development/contract/reflection seeds. */
const SESSIONS = [
  { id: "meals", turns: [
    "Good morning, Brenna and Maren. How are you both doing?",
    "Maren, would you help me decide what we should do for breakfast?",
    "Brenna, you're welcome to sit at the table with us. Would that be comfortable?",
    "I pull a chair over to make room at the table. No hurry; we can talk while we eat.",
    "Maren, what would make an ordinary morning here feel easier for you?",
    "I'm happy to listen. We don't need to agree on everything to share breakfast.",
    "Brenna, could you help me keep an eye on the hearth while we tidy up?",
    "Thank you both for helping. Is there anything either of you would rather do differently?",
    "I go down to the main hall. Maren, would you like to come along?",
    "Maren, do you prefer having company while doing chores, or a little quiet?",
    "Let's take a short break here before going back upstairs.",
    "I go back upstairs to the observation room. Maren, you can join me if you like.",
    "Brenna, did you manage to get some quiet while we were downstairs?",
    "Would eating together again this evening suit both of you?",
    "Before we finish, is there anything we left unsaid this morning?",
  ] },
  { id: "chores", turns: [
    "Brenna, Maren, the room could use a little tidying. What shall we tackle first?",
    "I'll start by clearing space at the table. Could one of you help me?",
    "Maren, tell me if I'm putting something where you don't want it.",
    "Brenna, is there a small task you'd like to take, or would you rather rest?",
    "I appreciate the help. We can leave anything difficult until later.",
    "Maren, I think keeping the table clear makes things easier. Do you disagree?",
    "I hear you. Let's try your arrangement for a while and see how it works.",
    "Brenna, what do you think of the compromise?",
    "I go down to the main hall. Brenna, would you come with me to look at the hearth?",
    "Brenna, can you show me where you'd leave room for people to sit?",
    "No need to finish everything today. Let's pause and see how you're feeling.",
    "I go back upstairs to the observation room. Brenna, you're welcome to come back with me.",
    "Maren, what did you end up doing while we were away?",
    "Tomorrow I can help with the same job again if that would be useful.",
    "Thank you both. What should we leave for another day?",
  ] },
  { id: "disagreement", turns: [
    "Maren, Brenna, I'd like us to talk about sharing the room comfortably.",
    "I tend to prefer a quiet room in the morning. How do you feel about that?",
    "Maren, if you want to talk while working, please say so. I'm listening.",
    "Brenna, what would work for you? You don't have to take my side.",
    "I disagree about keeping silent all morning. Could we find a middle ground?",
    "We can take turns choosing a quiet time instead of having one person decide.",
    "Maren, would that answer your concern, or have I misunderstood?",
    "Thank you for saying it plainly. I'd rather hear a disagreement than guess.",
    "I go down to the main hall for a change of air. Would either of you like to join me?",
    "We can sit for a minute. There's no need to settle the whole discussion at once.",
    "Would doing a small task together help, or would you prefer a break?",
    "I go back upstairs to the observation room. Anyone who wants can come with me.",
    "How does the room feel after that short break?",
    "I can make space at the table again. Is there anything else you need?",
    "Let's leave room to reconsider our arrangement tomorrow. How does that sound?",
  ] },
  { id: "assistance", turns: [
    "Brenna, Maren, would either of you like some company while we get ready for the day?",
    "Brenna, I can move a chair closer if that would help. Would you like me to?",
    "Maren, would you help me make some room at the table?",
    "Thank you. Tell me if I'm getting in your way instead of helping.",
    "Brenna, is there something you would prefer to handle yourself?",
    "I'll respect that. You can ask if you change your mind.",
    "Maren, how do you feel about how we divided the work?",
    "I think we should stop for a meal soon. Does either of you want to finish something first?",
    "I go down to the main hall to sit by the hearth. Maren, you're welcome to come.",
    "Maren, could you help me choose a comfortable place for us to sit?",
    "We can keep each other company for a little while without doing another chore.",
    "I go back upstairs to the observation room. Maren, would you like to come back with me?",
    "Brenna, how was the room while we were away?",
    "I'd be glad to help with the table again tomorrow. Would that be welcome?",
    "Is there anything either of you still needs before we take a rest?",
  ] },
] as const;
const dry = process.argv.includes("--dry"), outIndex = process.argv.indexOf("--out");
const out = outIndex >= 0 ? process.argv[outIndex + 1]! : `docs/evaluations/h5-live/npcplus7${dry ? "-dry" : ""}.jsonl`;
const reviewOut = out.replace(/\.jsonl$/, ".review.json"), summaryOut = out.replace(/\.jsonl$/, ".summary.json");
if (!dry && !process.env.OPENROUTER_API_KEY?.trim()) throw new Error("OPENROUTER_API_KEY missing; no paid calls made");
const models = selectedModels();
type Rates = { prompt: number; completion: number };
const rates: Record<string, Rates> = {};
if (!dry) {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  const catalog = await response.json() as { data: { id: string; pricing: { prompt: string; completion: string } }[] };
  for (const id of Object.values(models)) {
    const row = catalog.data.find(r => r.id === id || r.id === id.replace(/:nitro$/, ""));
    if (!row) throw new Error("Public model pricing unavailable; refusing an unpriced live evaluation");
    rates[id] = { prompt: Number(row.pricing.prompt), completion: Number(row.pricing.completion) };
    if (!Number.isFinite(rates[id]!.prompt) || !Number.isFinite(rates[id]!.completion) || rates[id]!.prompt < 0 || rates[id]!.completion < 0) throw new Error("Invalid public pricing");
  }
}
const sessionsIndex = process.argv.indexOf("--sessions");
const requestedSessions = sessionsIndex >= 0 ? process.argv[sessionsIndex + 1]!.split(",") : SESSIONS.map(s => s.id);
const sessions = SESSIONS.filter(s => requestedSessions.includes(s.id));
if (!sessions.length || requestedSessions.some(id => !sessions.some(s => s.id === id))) throw new Error("Unknown organic session");
const tokenIndex = process.argv.indexOf("--max-tokens");
const budget_usd = 1, max_tokens = tokenIndex >= 0 ? Number(process.argv[tokenIndex + 1]) : 250_000;
if (!Number.isSafeInteger(max_tokens) || max_tokens <= 0) throw new Error("Invalid token cap");
let tokens = 0, usd = 0, executed = 0, gameplayFailures = 0, calls = 0, accepted = 0, rejected = 0, developments = 0, wrongReflectionCommits = 0, leaks = 0;
const charged = { narrator_input: 0, narrator_output: 0, controller_input: 0, controller_output: 0, reflection_input: 0, reflection_output: 0 };
const latencies: number[] = [], contexts: number[] = [], contextDeltas: number[] = [];
const byReason: Record<string, number> = {}, kinds: Record<string, number> = {}, reflected = new Set<string>();
let updated = 0, added = 0, dueChecks = 0, stopped: string | undefined;
const sessionSummaries: unknown[] = [], review: unknown[] = [];
const countHistory = (s: ReturnType<ReturnType<typeof turnFixture>["campaign"]["exportSnapshot"]>) => s.premium_characters.reduce((n, p) => n + p.dynamic.recent_developments.length + (p.dynamic.long_term?.entries ?? 0), 0);
const domainsWithoutReflection = (s: ReturnType<ReturnType<typeof turnFixture>["campaign"]["exportSnapshot"]>) => { const { revision: _r, premium_reflections: _f, ...domains } = s; return JSON.stringify(domains); };
const price = (usage: Usage | undefined, model: string, family: "narrator" | "controller" | "reflection") => {
  const input = usage?.prompt_tokens ?? 0, output = usage?.completion_tokens ?? 0;
  charged[`${family}_input`] += input; charged[`${family}_output`] += output; tokens += input + output;
  usd += input * (rates[model]?.prompt ?? 0) + output * (rates[model]?.completion ?? 0);
};
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify({ kind: "header", pass: 7, dry, models, pricing_source: "https://openrouter.ai/api/v1/models", rates_per_token: rates,
  date: new Date().toISOString(), planned_turns: sessions.reduce((n, s) => n + s.turns.length, 0), sessions: sessions.map(s => s.id), budget_usd, max_tokens, history_seeded: false, reflection_max_characters: 1 }) + "\n");

for (const session of sessions) {
  const f = turnFixture();
  // Membership is the scenario baseline, not development seeding. No commands are applied by this harness after setup.
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: "campaign_household_organic", name: "Tower household" },
    { kind: "set_membership", household_id: "campaign_household_organic", membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...["brenna", "maren"].map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_organic", character_id })),
  ] });
  const baseline = f.campaign.exportSnapshot();
  if (baseline.premium_characters.some(p => p.dynamic.recent_developments.some(e => e.kind !== "joined_household") || p.stable.contract_evidence?.length || p.dynamic.long_term)
    || baseline.premium_reflections.length) throw new Error("Organic scenario unexpectedly seeded");
  const turnDiagnostics: TurnDiagnostics[] = [];
  const service = new RetrievalService(f.world);
  const meta = { model: "dry", usage: {}, latency: { request_started_at: "", headers_ms: null, time_to_first_token_ms: null, completed_at: "", elapsed_total_ms: 0 } };
  const coordinator = dry ? new TurnCoordinator(f.world, { async generate() { throw new Error("unused"); }, async *stream() {
    yield { type: "text_delta", text: "Brenna nods toward the table." }; yield { type: "completed", result: { text: "Brenna nods toward the table.", ...meta } };
  } }, { async propose() { return { commands: [], ...meta }; } }, { service, search: new HybridSearch(service) }, { diagnostics_sink: d => { turnDiagnostics.push(structuredClone(d) as TurnDiagnostics); } })
    : await onlineCoordinator(f.world, false, p => p, { diagnostics_sink: d => { turnDiagnostics.push(structuredClone(d) as TurnDiagnostics); } });
  const reflectionProvider = dry ? { async reflect() { return { text: '{"proposals":[]}' }; } } : new OpenRouterReflectionProvider();
  let sessionTurns = 0, sessionDevelopments = 0, sessionCalls = 0;
  for (const [turn, input] of session.turns.entries()) {
    if (tokens >= max_tokens || usd >= budget_usd) { stopped = tokens >= max_tokens ? "tokens" : "budget"; break; }
    const before = f.campaign.exportSnapshot();
    const reviewEvidence = new Map<string, ReturnType<typeof reflectionEvidence>>();
    const provider: ReflectionProvider = { async reflect(request) {
      reviewEvidence.set(request.character.id, reflectionEvidence(f.world, f.campaign.exportSnapshot(), request.character.id));
      return reflectionProvider.reflect(request);
    } };
    const events: { type: string }[] = [];
    let gameplayDomains: string | undefined, postTurnChars = 0, reflectionDiagnostic: DeepReadonly<ReflectionDiagnostics> | undefined;
    turnDiagnostics.length = 0;
    const runs = await runPlayTurn({ ...f, coordinator, request: { campaign: f.campaign, player_input: input }, reflection_provider: provider,
      reflection_diagnostics_sink: d => { reflectionDiagnostic = d; dueChecks++; }, publish: event => {
        events.push({ type: event.type });
        if (event.type === "turn_completed") {
          gameplayDomains = domainsWithoutReflection(f.campaign.exportSnapshot()); postTurnChars = JSON.stringify(buildTurnContext(f.world, f.campaign.exportSnapshot(), { input })).length;
          if (event.result.narration.includes("HIDDEN_SECRET_SENTINEL")) leaks++;
        }
      } });
    const after = f.campaign.exportSnapshot(), diag = turnDiagnostics.at(-1)!;
    const organic = countHistory(after) - countHistory(before); developments += organic; sessionDevelopments += organic;
    if (gameplayDomains !== undefined && gameplayDomains !== domainsWithoutReflection(after)) wrongReflectionCommits++;
    if (events.at(-1)?.type !== "turn_completed") gameplayFailures++;
    executed++; sessionTurns++;
    contexts.push(JSON.stringify(buildTurnContext(f.world, after, { input })).length); if (postTurnChars) contextDeltas.push(contexts.at(-1)! - postTurnChars);
    price(diag.narrator?.usage, models.narrator, "narrator"); price(diag.revision_narrator?.usage, models.narrator, "narrator"); price(diag.controller?.usage, models.controller, "controller");
    for (const r of runs) {
      if (r.status !== "no_evidence") { calls++; sessionCalls++; latencies.push(r.provider_ms ?? 0); }
      price(r.usage as Usage | undefined, models.controller, "reflection");
      if (r.status === "committed") {
        reflected.add(`${session.id}:${r.character_id}`); accepted += r.accepted.length; updated += r.updated_notes ?? 0; added += r.new_notes ?? 0;
        for (const p of r.accepted) {
          kinds[p.kind] = (kinds[p.kind] ?? 0) + 1;
          review.push({ session: session.id, turn: turn + 1, character_id: r.character_id, note: p,
            evidence: (reviewEvidence.get(r.character_id) ?? []).filter(e => p.evidence_refs.includes(e.ref)),
            support: "PENDING_HUMAN_REVIEW", usefulness: "PENDING_HUMAN_REVIEW" });
        }
      }
      rejected += r.rejected.length; for (const rj of r.rejected) byReason[rj.reason] = (byReason[rj.reason] ?? 0) + 1;
    }
    await appendFile(out, JSON.stringify({ session: session.id, turn: turn + 1, input, gameplay: diag, organic_developments: organic, reflection: reflectionDiagnostic ?? null }) + "\n");
    console.log(JSON.stringify({ session: session.id, turn: turn + 1, gameplay: events.at(-1)?.type, organic_developments: organic, reflection_calls: runs.length, accepted: runs.reduce((n, r) => n + r.accepted.length, 0), tokens, estimated_usd: usd }));
  }
  sessionSummaries.push({ session: session.id, turns: sessionTurns, developments: sessionDevelopments, calls: sessionCalls,
    final_reflection_notes: f.campaign.exportSnapshot().premium_reflections.map(r => ({ character_id: r.character_id, count: r.notes.length })) });
  if (stopped) break;
}
const sorted = [...latencies].sort((a, b) => a - b), percentile = (q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null;
const summary = { status: stopped ? "STOPPED_BY_CAP" : "FINISHED", stopped, dry, executed_turns: executed, gameplay_failures: gameplayFailures, organic_developments: developments,
  due_checks: dueChecks, actual_reflection_calls: calls, calls_per_100_turns: executed ? calls / executed * 100 : 0, reflected_characters: [...reflected],
  accepted, rejected, rejected_by_reason: byReason, kinds, new_notes: added, updates: updated, charged_tokens: charged, estimated_usd: usd,
  latency_p50_ms: percentile(.5), latency_p95_ms: percentile(.95), context_max_chars: Math.max(0, ...contexts), context_delta_max: Math.max(0, ...contextDeltas),
  wrong_reflection_commits: wrongReflectionCommits, secret_sentinel_leaks: leaks, sessions: sessionSummaries, pending_human_reviews: review.length };
await writeFile(reviewOut, JSON.stringify(review, null, 2) + "\n"); await writeFile(summaryOut, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ summary: summaryOut, review: reviewOut, ...summary }));
