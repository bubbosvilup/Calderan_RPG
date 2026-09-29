import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import type { GenerationRequest } from "../llm/types.js";
import type { NarratorProvider, NarratorStreamEvent } from "../llm/narrator-provider.js";
import type { TurnEvent } from "../turn/turn-types.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { NARRATOR_SYSTEM, type RecentContextMode } from "../turn/prompt-builder.js";
import { turnFixture } from "./turn-fixture.js";
import { onlineCoordinator, selectedModels } from "./turn-services.js";
import { capturingFetch, fingerprint, settle, usageOf } from "./narrator-bakeoff.js";
import { checkBakeoff } from "./narrative-checks.js";

/**
 * Phase 1N multi-turn authority evaluation. Uses the production coordinator path (onlineCoordinator) and therefore the real
 * RecentConversation; never the historical-window helper. An optional scripted first turn plants a known narrator error so its
 * propagation through production recent conversation can be measured. PAID when run without --dry-run.
 */
interface Sequence { readonly id: string; readonly purpose: string; readonly fixture?: { readonly brennaKnowsBridge?: boolean }; readonly ground_garments?: boolean; readonly scripted_first?: string; readonly turns: readonly string[] }
export const CONTAMINATION: readonly Sequence[] = [
  { id: "equipment_contamination", purpose: "Turn 1 narration wrongly says Brenna is barefoot; state keeps her boots equipped.",
    scripted_first: "Brenna stretches her legs out, bare feet pressed against the cool stone floor, toes curling. \"I'm fine,\" she says. \"Better than yesterday.\"",
    turns: ["*sits down across from her* How are you feeling today?", "*he pours her some water* Drink this. Are you cold at all?", "*he nods toward the stairs* Think you can walk down to the hall later?", "Good. Let's rest a bit first."] },
  { id: "knowledge_contamination", purpose: "Turn 1 narration wrongly has Maren state the bridge fact; she has no knowledge edge.",
    scripted_first: "Maren shrugs. \"Well enough. At least I'm not stuck across the river. The eastern bridge is closed, everyone knows that.\" She glances out the window.",
    turns: ["Maren, how are you settling in?", "We'll need supplies soon. Maren, any ideas where to get them?", "Could we send someone across the river tomorrow?", "Alright. Let's plan it tomorrow then."] },
  { id: "tell_acquisition", purpose: "Explicit /tell; if it commits, the next turn's projection must let Brenna use the fact.",
    turns: ["/tell campaign_fact_bridge_closed to brenna", "Brenna, what does that mean for getting supplies?"] },
];
export const STABILITY: readonly Sequence[] = [
  { id: "ten_turn_stability", purpose: "Equipment continuity, asymmetric knowledge (Brenna knows, Maren does not), dialogue, and an explicit transfer at turn 6.", fixture: { brennaKnowsBridge: true },
    turns: ["*sits down across from Brenna* How are you feeling this morning?", "Maren, you've been quiet. Sleep alright?", "*he stretches* We need to think about getting supplies from across the river.",
      "Brenna, Maren, does either of you know if the eastern bridge is open?", "Hm. Maren, what would you do in my place?", "I give boots to Brenna.",
      "Those should fit if yours wear out. *he glances at her feet* How are your own holding up?", "Yes.", "What do you mean?", "Let's all rest for a while."] },
];

/** Phase 1O live checks (Kimi + DeepSeek, production hybrid evidence authorization). */
export const PHASE_1O: readonly Sequence[] = [
  { id: "tell_variants", purpose: "Natural Kimi realizations of an explicit /tell; state should commit whenever the telling is narrated.", turns: ["/tell campaign_fact_bridge_closed to brenna"] },
  { id: "handover_115", purpose: "Record 115 three-garment handover under hybrid evidence authorization.", ground_garments: true, turns: ["*gives her the two pink shirt, one fluffy and thick one made of probably cotton, the shorts are also pink and should be alright for her narrow waist*"] },
  { id: "delayed_recall", purpose: "Tell Brenna, six unrelated turns (the telling leaves recent conversation), then ask Brenna (may use) and Maren (may not).",
    turns: ["/tell campaign_fact_bridge_closed to brenna", "How is the weather looking today?", "Gerome, sweep the floor please.", "*he stretches and yawns*", "Maren, did you sleep well?", "Let's check the window latch.", "Brenna, are you warm enough?",
      "Brenna, do you remember what I told you about the eastern bridge?", "Maren, have you heard anything about the eastern bridge?"] },
];
const args = process.argv.slice(2), flag = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const mode = args.includes("--stability") ? "stability" : args.includes("--phase1o") ? "phase1o" : "contamination";
const reps = Number(flag("--reps") ?? (mode === "stability" ? 1 : 3));
const only = flag("--sequences")?.split(",");
const sequences = (mode === "stability" ? STABILITY : mode === "phase1o" ? PHASE_1O : CONTAMINATION).filter(s => !only || only.includes(s.id));
const label = flag("--label") ?? "run";
const recentMode = flag("--recent") as RecentContextMode | undefined;
if (args.includes("--dry-run")) { console.log(JSON.stringify({ mode, reps, label, sequences, models: selectedModels() }, null, 2)); process.exit(0); }
if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("OPENROUTER_API_KEY is not set");
const dir = `.build/evaluations/phase-1n-${mode}-${label}-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}`;
await mkdir(dir, { recursive: true });
await writeFile(`${dir}/manifest.json`, JSON.stringify({ phase: "1N", mode, label, reps, recent_context: recentMode ?? "production default", models: selectedModels(), narrator_system_sha: fingerprint({ system_prompt: NARRATOR_SYSTEM, messages: [] }), sequences, created_at: new Date().toISOString(), note: "production onlineCoordinator + real RecentConversation; turn 1 of contamination sequences is scripted (no provider call)" }, null, 2) + "\n", { flag: "wx" });
console.log(`\n=== PAID ONLINE EVALUATION (OpenRouter) ===\nPhase 1N ${mode} (${label}): ${sequences.length} sequences x ${reps}; narrator ${selectedModels().narrator}, controller ${selectedModels().controller}\nOutput: ${dir}\n`);

const scriptedMetadata = { model: "scripted-contamination", usage: {}, latency: { request_started_at: "scripted", headers_ms: null, time_to_first_token_ms: null, completed_at: "scripted", elapsed_total_ms: 0 } };
for (const seq of sequences) for (let rep = 1; rep <= reps; rep++) {
  const { world, campaign } = turnFixture(!!seq.ground_garments, seq.fixture ?? {});
  const narratorWire = capturingFetch(), controllerWire = capturingFetch();
  const requests: GenerationRequest[] = [];
  let calls = 0;
  const coordinator = await onlineCoordinator(world, false, provider => {
    const stream = (request: GenerationRequest): AsyncIterable<NarratorStreamEvent> => {
      requests.push(request);
      if (calls++ === 0 && seq.scripted_first) return (async function* () { yield { type: "text_delta" as const, text: seq.scripted_first! }; yield { type: "completed" as const, result: { text: seq.scripted_first!, ...scriptedMetadata } }; })();
      return provider.stream(request);
    };
    return { generate: provider.generate.bind(provider), stream } satisfies NarratorProvider;
  }, { narrator_client: new OpenRouterClient({ fetch: narratorWire.fetch }), controller_client: new OpenRouterClient({ fetch: controllerWire.fetch }), ...(recentMode ? { recent_context: recentMode } : {}), ...(flag("--evidence") ? { evidence_authorization: flag("--evidence") as "shadow" | "hybrid" } : {}) });
  const turns = [];
  for (const [index, input] of seq.turns.entries()) {
    const before = campaign.exportSnapshot(), context = buildTurnContext(world, before), captured = narratorWire.captures.length;
    const events: TurnEvent[] = [];
    for await (const event of coordinator.runTurn({ campaign, player_input: input })) events.push(event);
    const last = events.at(-1)!, result = last.type === "turn_completed" ? last.result : undefined;
    const narration = events.filter(e => e.type === "narration_delta").map(e => (e as { text: string }).text).join("");
    const scripted = index === 0 && !!seq.scripted_first;
    const capture = scripted ? undefined : narratorWire.captures[captured];
    await settle(capture);
    const prompt = requests.at(-1)!.messages[0]!.content;
    turns.push({ turn: index + 1, input, scripted, narration, outcome: result ? "success" : last.type === "turn_failed" ? `turn_failed:${last.code}` : "unknown",
      recent_conversation_in_prompt: prompt.match(/\[(?:RECENT|EARLIER) CONVERSATION[^\]]*\]\n([\s\S]*?)\n\n\[/)?.[1] ?? null,
      knowledge_access_in_prompt: prompt.match(/\[CHARACTER KNOWLEDGE ACCESS[^\]]*\]\n([\s\S]*?)\n\n\[/)?.[1] ?? null,
      prompt_fingerprint: fingerprint(requests.at(-1)!), prompt_characters: prompt.length,
      findings: checkBakeoff(narration, input, context, result?.retrieval.ids ?? []),
      footwear: { barefoot: narration.match(/[^.!?\n]*\b(?:bare(?:foot|feet| feet| foot| soles?| toes?| ankles?)|shoeless|without (?:her )?boots)\b[^.!?\n]*/i)?.[0] ?? null, boots: narration.match(/[^.!?\n]*\bboots?\b[^.!?\n]*/i)?.[0] ?? null },
      controller_proposal: result?.controller_proposal ?? null, authorization: result?.authorization.map(a => ({ kind: a.command.kind, reason: a.reason, source: a.source ?? null, grammar: a.grammar ?? null, evidence: a.evidence ?? null })) ?? null, authorized_commands: result?.authorized_commands ?? null,
      revision: { before: before.revision, after: campaign.revision },
      brenna_boots: campaign.exportSnapshot().items.find(i => i.id === "brenna_boots")?.position ?? null,
      knowledge_edges: campaign.exportSnapshot().knowledge.filter(k => k.fact_id === "campaign_fact_bridge_closed").map(k => ({ character_id: k.character_id, status: k.status, provenance: k.provenance ?? null })),
      latency: result?.latency ?? null, usage: scripted ? null : usageOf(capture), upstream_provider: capture?.upstream_provider ?? null });
    console.log(JSON.stringify({ seq: seq.id, rep, turn: index + 1, scripted, outcome: turns.at(-1)!.outcome, barefoot: !!turns.at(-1)!.footwear.barefoot, leak: turns.at(-1)!.findings.filter(f => f.category === "npc_knowledge_leak_candidate").map(f => f.excerpt.split(":")[0]), rev: campaign.revision }));
  }
  await appendFile(`${dir}/${seq.id}.jsonl`, JSON.stringify({ sequence: seq.id, rep, purpose: seq.purpose, turns }) + "\n");
}
console.log(JSON.stringify({ output: dir }));

