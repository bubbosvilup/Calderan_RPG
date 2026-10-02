import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { turnFixture } from "./turn-fixture.js";
import { onlineCoordinator, selectedModels } from "./turn-services.js";
import { runPlayTurn } from "./play-turn.js";
import { DiscoveryAggregate, MotifTracker, observeOrganicTurn, type OrganicTurnDiagnostics } from "./organic-discovery.js";
import { OpenRouterReflectionProvider } from "../llm/openrouter/reflection-provider.js";
import type { ReflectionDiagnostics } from "../turn/reflection-diagnostics.js";
import type { TurnDiagnostics } from "../turn/turn-diagnostics.js";
import type { TurnResult } from "../turn/turn-types.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import type { Usage } from "../llm/types.js";
import type { DeepReadonly } from "../types/readonly.js";

/**
 * NPC+ Pass 8: longer organic household play with three NPC+ (Brenna, Maren, Gerome). Setup is membership only; the harness applies
 * NO campaign commands after setup and never scripts a state change. Every turn is observed by src/dev/organic-discovery.ts.
 * Outputs: <out>.jsonl (safe structured diagnostics only), <out>.review.jsonl (delivered narration + matched sentences, for human
 * review), <out>.summary.json (pipeline counts, motifs, cost/latency).
 */
const SESSIONS = [
  { id: "breakfast", turns: [
    "Good morning, everyone. Did anyone sleep badly?",
    "Gerome, could you bring up some bread and the kettle from downstairs?",
    "Maren, would you help me set the table by the window?",
    "Brenna, sit wherever is comfortable. You don't need to help this morning.",
    "I pour tea for whoever wants it.",
    "Maren, you seem quiet. Is something on your mind?",
    "That's fair. Thank you for telling me.",
    "Brenna, how is the recovery going? Honestly.",
    "I'm sorry I was short with everyone yesterday. I was tired, but that's no excuse.",
    "Who wants the last slice of bread? I'd rather someone else had it.",
    "Gerome, thank you for keeping the fire going overnight.",
    "I go downstairs to the main hall to fetch more water. Maren, would you come with me?",
    "Maren, can you hold the door while I carry the bucket?",
    "Let's sit by the hearth for a moment before going back up.",
    "Maren, what do you like most about living here so far?",
    "And what do you like least? You can be honest.",
    "I go back upstairs to the observation room. Maren, come back up with me if you like.",
    "Brenna, did you manage some quiet while we were gone?",
    "I think we should agree who clears the table each morning. Any thoughts?",
    "Brenna, you don't have to take a turn until you're stronger.",
    "Maren, would you mind taking tomorrow's turn instead of Brenna?",
    "Thank you. I'll take the day after.",
    "I start clearing the cups from the table.",
    "Is there anything anyone needs before we go about the day?",
  ] },
  { id: "chores", turns: [
    "The tower needs a proper cleaning today. Where should we start?",
    "Gerome, could you sweep the stairs while we tidy up here?",
    "Maren, could you help me fold the blankets?",
    "Brenna, would you sort the cups and tell us which ones are chipped?",
    "I open the window to air the room out.",
    "Maren, you fold them differently than I do. Show me your way.",
    "Your way is better. Let's do it like that from now on.",
    "Brenna, are you getting tired? Stop whenever you need to.",
    "I go down to the main hall to clean the long table. Brenna, would you like to come and sit by the hearth while I work?",
    "Brenna, if you're up to it, could you tell me where the cleaning cloths went?",
    "I scrub the long table while we talk.",
    "Gerome, when you finish the stairs, could you check the hearth?",
    "Brenna, I'd value your opinion: should the table stay here or move nearer the fire?",
    "Alright, we'll leave it where it is.",
    "I go back upstairs to the observation room. Brenna, you can stay by the fire or come up, as you prefer.",
    "Maren, how did the blankets go while I was downstairs?",
    "You've done more than your share today. Thank you.",
    "I notice the floor by the bed is still dusty. I'll get it myself.",
    "Maren, do you want to rest, or keep going a little longer?",
    "Let's leave the rest for tomorrow.",
    "I sit down at the table for a moment.",
    "Maren, is there anything about how we share the work that bothers you?",
    "I hear you. I'll try to ask before deciding for everyone.",
    "Good work today, all of you.",
  ] },
  { id: "friction", turns: [
    "Maren, Brenna, I noticed some tension about the window last night. Can we talk about it?",
    "Maren, you like it open. Brenna, you'd rather it closed. Is that right?",
    "Brenna, tell me what bothers you about the cold.",
    "Maren, what about you? Why do you want it open?",
    "I think both reasons are fair. I don't want to just pick a side.",
    "What if it stays open during the day and closed at night?",
    "Maren, you look unhappy with that. Say so if you are.",
    "I'm sorry, Maren. I didn't mean to brush your concern aside.",
    "Brenna, would you be willing to compromise a little too?",
    "Thank you both for being patient with each other.",
    "Gerome, could you make sure the fire is warm enough at night so the window matters less?",
    "I go down to the main hall to let things settle. Anyone who wants can come along.",
    "I sit at the long table and rest my head in my hands for a moment.",
    "If anyone's here with me, I'd appreciate the company.",
    "I go back upstairs to the observation room.",
    "How is everyone feeling now?",
    "Maren, you were right to speak up earlier. I'd rather hear it than have you stay silent.",
    "Brenna, I know you don't like conflict. You handled that well.",
    "Let's try the new arrangement for a few days and talk again.",
    "Maren, is there anything else you'd like to change about how we live here?",
    "I'll think about that. It's a reasonable request.",
    "Brenna, do you feel safe here with us?",
    "I'm glad. If that ever changes, tell me.",
    "Let's have something warm to drink and leave it at that for today.",
  ] },
  { id: "evening_care", turns: [
    "It's getting dark. Brenna, how are you feeling this evening?",
    "Gerome, could you bring another blanket for Brenna?",
    "I check whether Brenna's tea is still warm.",
    "Maren, you've been looking after Brenna a lot today. Thank you.",
    "Brenna, is there anything that would make the night easier?",
    "I sit beside the bed so Brenna doesn't have to raise her voice.",
    "Brenna, can I ask what happened before you came here? Only if you want to tell me.",
    "That's alright. You don't owe me that story.",
    "Maren, do you ever miss where you lived before?",
    "Thank you for trusting me with that.",
    "I go down to the main hall to bank the fire for the night. Gerome, come with me.",
    "Gerome, show me how you usually bank the coals.",
    "I go back upstairs to the observation room. Gerome, come back up with me when you're done.",
    "Brenna, Maren, is it warm enough up here now?",
    "Do either of you trust me to make decisions for this household? I'd like an honest answer.",
    "I understand. I'll try to earn it.",
    "Maren, would you keep an eye on Brenna tonight if I fall asleep first?",
    "Brenna, is it alright with you if Maren checks on you?",
    "I put another log on the fire up here.",
    "Let's all try to get some rest.",
    "I blow out the lamp by the window.",
    "Goodnight, everyone.",
    "I wake briefly in the night. Is everyone alright?",
    "I go back to sleep.",
  ] },
  { id: "errands", turns: [
    "We need to bring the spare chairs up from the main hall. Who can help?",
    "I go down to the main hall. Gerome, Maren, come with me.",
    "Gerome, could you carry the heavier chair?",
    "Maren, can you take the small stool?",
    "I go back upstairs to the observation room with the chairs.",
    "Brenna, where would you like the chairs placed?",
    "Brenna, you seem stronger today. Does it feel that way to you?",
    "Maren, I left my notebook downstairs. Would you fetch it for me?",
    "That's fine, I'll get it myself later.",
    "Brenna, would you like to walk downstairs with me? Only if you feel up to it.",
    "I go down to the main hall slowly. Brenna, take my arm if you want.",
    "Let's sit by the hearth. Take your time catching your breath.",
    "Brenna, it's good to see you on your feet.",
    "Gerome, is there anything that needs fixing in the hall?",
    "I look around the hall for my notebook.",
    "Brenna, are you ready to go back up, or would you like to stay down here a while?",
    "I go back upstairs to the observation room.",
    "Maren, thank you for keeping things in order while we were away.",
    "Maren, I'd like your help planning tomorrow's errands.",
    "What would you change about the way we've arranged the room today?",
    "Let's try it your way.",
    "Gerome, would you move the table a little closer to the window?",
    "Thank you, all of you. This place feels more like a home than it did.",
    "Let's rest before supper.",
  ] },
] as const;
const NPCS = ["brenna", "maren", "gerome"] as const;
const dry = process.argv.includes("--dry"), outIndex = process.argv.indexOf("--out");
const out = outIndex >= 0 ? process.argv[outIndex + 1]! : `docs/evaluations/h5-live/npcplus8${dry ? "-dry" : ""}.jsonl`;
const reviewOut = out.replace(/\.jsonl$/, ".review.jsonl"), summaryOut = out.replace(/\.jsonl$/, ".summary.json");
// Optional replay dump (base/final snapshots + observed TurnResult fields) for offline re-observation; keep it in scratch, not the repo.
const replayIndex = process.argv.indexOf("--replay-out"), replayOut = replayIndex >= 0 ? process.argv[replayIndex + 1] : undefined;
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
  }
}
const sessionsIndex = process.argv.indexOf("--sessions");
const requested = sessionsIndex >= 0 ? process.argv[sessionsIndex + 1]!.split(",") : SESSIONS.map(s => s.id);
const sessions = SESSIONS.filter(s => requested.includes(s.id));
if (!sessions.length || requested.some(id => !sessions.some(s => s.id === id))) throw new Error("Unknown organic session");
const tokenIndex = process.argv.indexOf("--max-tokens");
const budget_usd = 1, max_tokens = tokenIndex >= 0 ? Number(process.argv[tokenIndex + 1]) : 1_600_000;
let tokens = 0, usd = 0, executed = 0, failures = 0, dueChecks = 0, dueCharacters = 0, reflectionCalls = 0, accepted = 0, rejectedNotes = 0, leaks = 0, stopped: string | undefined;
const charged = { narrator_input: 0, narrator_output: 0, controller_input: 0, controller_output: 0, reflection_input: 0, reflection_output: 0 };
const narratorMs: number[] = [], controllerMs: number[] = [], reflectionMs: number[] = [];
const aggregate = new DiscoveryAggregate();
const sessionSummaries: unknown[] = [], acceptedReview: unknown[] = [];
const price = (usage: Usage | undefined, model: string, family: "narrator" | "controller" | "reflection") => {
  const input = usage?.prompt_tokens ?? 0, output = usage?.completion_tokens ?? 0;
  charged[`${family}_input`] += input; charged[`${family}_output`] += output; tokens += input + output;
  usd += input * (rates[model]?.prompt ?? 0) + output * (rates[model]?.completion ?? 0);
};
await mkdir(dirname(out), { recursive: true });
const passIndex = process.argv.indexOf("--pass"), pass = passIndex >= 0 ? Number(process.argv[passIndex + 1]) : 8;
const header = { kind: "header", pass, dry, models, rates_per_token: rates, date: new Date().toISOString(), npc_plus: NPCS, sessions: sessions.map(s => s.id),
  planned_turns: sessions.reduce((n, s) => n + s.turns.length, 0), budget_usd, max_tokens, history_seeded: false, reflection_triggers_changed: false };
await writeFile(out, JSON.stringify(header) + "\n"); await writeFile(reviewOut, JSON.stringify(header) + "\n");
if (replayOut) await writeFile(replayOut, "");

for (const session of sessions) {
  const f = turnFixture();
  // Membership only (scenario baseline, not development seeding). No command is applied by this harness after setup.
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [
    { kind: "create_household", id: "campaign_household_organic", name: "Tower household" },
    { kind: "set_membership", household_id: "campaign_household_organic", membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...NPCS.map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_organic", character_id })),
  ] });
  const baseline = f.campaign.exportSnapshot();
  if (baseline.premium_characters.some(p => p.dynamic.recent_developments.some(e => e.kind !== "joined_household") || p.stable.contract_evidence?.length || p.dynamic.long_term)
    || baseline.premium_reflections.length || baseline.relationships.length) throw new Error("Organic scenario unexpectedly seeded");
  const turnDiagnostics: TurnDiagnostics[] = [];
  const sink = (d: DeepReadonly<TurnDiagnostics>) => { turnDiagnostics.push(structuredClone(d) as TurnDiagnostics); };
  const service = new RetrievalService(f.world);
  const meta = { model: "dry", usage: {}, latency: { request_started_at: "", headers_ms: null, time_to_first_token_ms: null, completed_at: "", elapsed_total_ms: 0 } };
  const dryText = "Maren sets a bowl of porridge in front of Nicco. \"Thank you for asking,\" she says. Brenna stays by the window.";
  const coordinator = dry ? new TurnCoordinator(f.world, { async generate() { throw new Error("unused"); }, async *stream() {
    yield { type: "text_delta", text: dryText }; yield { type: "completed", result: { text: dryText, ...meta } };
  } }, { async propose() { return { commands: [], ...meta }; } }, { service, search: new HybridSearch(service) }, { diagnostics_sink: sink })
    : await onlineCoordinator(f.world, false, p => p, { diagnostics_sink: sink });
  const reflectionProvider = dry ? { async reflect() { return { text: '{"proposals":[]}' }; } } : new OpenRouterReflectionProvider();
  const motifs = new MotifTracker();
  let sessionTurns = 0, sessionDevelopments = 0, sessionCalls = 0;
  for (const [turn, input] of session.turns.entries()) {
    if (tokens >= max_tokens || usd >= budget_usd) { stopped = tokens >= max_tokens ? "tokens" : "budget"; break; }
    const before = f.campaign.exportSnapshot();
    let result: TurnResult | undefined, gameplayDomains: string | undefined, reflection: DeepReadonly<ReflectionDiagnostics> | undefined;
    turnDiagnostics.length = 0;
    const runs = await runPlayTurn({ ...f, coordinator, request: { campaign: f.campaign, player_input: input }, reflection_provider: reflectionProvider,
      reflection_diagnostics_sink: d => { reflection = d; dueChecks++; }, publish: event => {
        if (event.type === "turn_completed") { result = event.result; gameplayDomains = JSON.stringify({ ...f.campaign.exportSnapshot(), revision: 0, premium_reflections: [] }); }
      } });
    const after = f.campaign.exportSnapshot(), diag = turnDiagnostics.at(-1);
    executed++; sessionTurns++;
    if (!result) failures++;
    price(diag?.narrator?.usage, models.narrator, "narrator"); price(diag?.revision_narrator?.usage, models.narrator, "narrator"); price(diag?.controller?.usage, models.controller, "controller");
    if (diag?.narrator?.latency_ms !== undefined) narratorMs.push(diag.narrator.latency_ms);
    if (diag?.controller?.latency_ms !== undefined) controllerMs.push(diag.controller.latency_ms);
    dueCharacters += reflection?.due_count ?? 0;
    for (const r of runs) {
      if (r.status !== "no_evidence") { reflectionCalls++; sessionCalls++; reflectionMs.push(r.provider_ms ?? 0); }
      price(r.usage as Usage | undefined, models.controller, "reflection");
      accepted += r.accepted.length; rejectedNotes += r.rejected.length;
      for (const p of r.accepted) acceptedReview.push({ session: session.id, turn: turn + 1, character_id: r.character_id, note: p, support: "PENDING_HUMAN_REVIEW", usefulness: "PENDING_HUMAN_REVIEW" });
    }
    let observed: OrganicTurnDiagnostics | undefined;
    if (result) {
      // Observe against the gameplay commit only (a reflection revision, if any, is excluded from the "after" domains).
      if (gameplayDomains !== JSON.stringify({ ...after, revision: 0, premium_reflections: [] })) throw new Error("Reflection changed a gameplay domain");
      if (result.narration.includes("HIDDEN_SECRET_SENTINEL")) leaks++;
      const { diagnostics, review } = observeOrganicTurn({ world: f.world, before, after, player_input: input, turn: result });
      observed = diagnostics; motifs.record(turn + 1, diagnostics); sessionDevelopments += diagnostics.counts.premium_developments;
      aggregate.add(diagnostics);
      if (replayOut) await appendFile(replayOut, JSON.stringify({ session: session.id, turn: turn + 1, input, before, after, observed: { narration: result.narration, controller_proposal: result.controller_proposal,
        authorized_commands: result.authorized_commands, authorization: result.authorization.map(d => ({ command: d.command, authorized: d.authorized, reason: d.reason })),
        turn_evidence: { character_movements: result.turn_evidence.character_movements, household_choices: result.turn_evidence.household_choices }, narration_reconciliation: result.narration_reconciliation } }) + "\n");
      await appendFile(reviewOut, JSON.stringify({ session: session.id, turn: turn + 1, input, delivered: diag?.audit?.delivered, ...review }) + "\n");
    }
    await appendFile(out, JSON.stringify({ session: session.id, turn: turn + 1, gameplay: diag ?? null, organic: observed ?? null, reflection: reflection ?? null }) + "\n");
    console.log(JSON.stringify({ session: session.id, turn: turn + 1, ok: !!result, candidates: observed?.counts.interaction_candidates, evidence: observed?.counts.evidence_detections,
      proposals: observed?.proposal_kinds, developments: observed?.counts.premium_developments, reflection_calls: runs.length, tokens, usd: +usd.toFixed(4) }));
  }
  sessionSummaries.push({ session: session.id, turns: sessionTurns, developments: sessionDevelopments, reflection_calls: sessionCalls, motifs: motifs.motifs(), unrepresented_recurring: motifs.unrepresented(),
    final_relationships: f.campaign.exportSnapshot().relationships.length, final_npc_locations: f.campaign.exportSnapshot().runtime.npc_locations.filter(n => (NPCS as readonly string[]).includes(n.character_id)) });
  if (stopped) break;
}
const pct = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : null; };
const summary = { status: stopped ? "STOPPED_BY_CAP" : "FINISHED", stopped, dry, executed_turns: executed, gameplay_failures: failures, pipeline_counts: aggregate.counts, ...aggregate,
  reflection: { due_checks: dueChecks, due_character_observations: dueCharacters, calls: reflectionCalls, accepted, rejected: rejectedNotes, provider_ms_p50: pct(reflectionMs, .5), provider_ms_p95: pct(reflectionMs, .95) },
  latency: { narrator_p50_ms: pct(narratorMs, .5), narrator_p95_ms: pct(narratorMs, .95), controller_p50_ms: pct(controllerMs, .5), controller_p95_ms: pct(controllerMs, .95) },
  charged_tokens: charged, total_tokens: tokens, estimated_usd: usd, secret_sentinel_leaks: leaks, sessions: sessionSummaries, accepted_note_review: acceptedReview };
await writeFile(summaryOut, JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ summary: summaryOut, status: summary.status, executed, outcomes: summary.outcomes, reflection: summary.reflection, usd }));
