import { mkdir, writeFile } from "node:fs/promises";
import { loadWorld } from "../world/loader.js";
import { createOpeningCampaign } from "../campaign/opening-state.js";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import type { GenerationRequest } from "../llm/types.js";
import type { NarratorProvider } from "../llm/narrator-provider.js";
import type { TurnEvent } from "../turn/turn-types.js";
import { NARRATOR_SYSTEM } from "../turn/prompt-builder.js";
import { onlineCoordinator, selectedModels } from "./turn-services.js";
import { capturingFetch, fingerprint, settle, usageOf } from "./narrator-bakeoff.js";
import { checkEphemeralAuthority } from "./narrative-checks.js";
import { groundingManifest } from "./lore-grounding.js";
import { buildTurnContext } from "../turn/context-builder.js";

/**
 * Phase 1P paid live checks (Kimi narrator + DeepSeek controller, production coordinator, canonical opening). PAID unless --dry-run.
 * Inputs carry no hint about what any character should know; findings are regex candidates for manual review, not verdicts.
 */
const PHASE_1P = [
  { id: "smoke", turns: ["*stops an ordinary passer-by* \"Excuse me, where is the slave pen?\"", "*ignores the answer* \"Tell me what you know about me being a Light mage.\""] },
  { id: "continuity_5", turns: ["*stops an ordinary passer-by* \"Excuse me, where is the slave pen?\"", "\"Have you lived in Calderan long?\"", "*nods* \"Is the market busy this time of day?\"", "\"Do you know who lives in this tower?\"", "\"Thank you for your help.\""] },
  { id: "local_foreign_contrast", turns: ["*approaches a foreign traveler* \"Excuse me, do you know where the slave market is?\"", "*turns to an ordinary passer-by* \"Excuse me, where is the slave market?\""] },
] as const;
/** Phase 1Q lore boundary set: each question in a fresh opening campaign (no carry-over between probes). */
const PASSER = "*stops an ordinary passer-by*";
const PHASE_1Q = ([["light_magic", `${PASSER} "What can you tell me about Light magic?"`], ["heartstone_residents", `${PASSER} "Who lives in Heartstone?"`], ["auction_schedule", `${PASSER} "When do the slave auctions happen?"`],
  ["exact_route", `${PASSER} "What's the exact route to the slave market from here?"`], ["ordinary_chat", `${PASSER} "Lovely weather today, isn't it?"`]] as const)
  .flatMap(([id, input]) => [1, 2].map(rep => ({ id: `${id}_r${rep}`, turns: [input] })));
/** Phase 1R retrieval-recall and silent-history probes (A–F), fresh opening campaign each. */
const PHASE_1R = ([["A_auction_schedule", `${PASSER} "When do the slave auctions happen?"`], ["B_exact_route", `${PASSER} "What's the exact route to the slave market from here?"`],
  ["C_heartstone_owner", `${PASSER} "Who owned Heartstone before me?"`], ["D_tower_empty", `${PASSER} "How long has this tower been empty?"`],
  ["E_light_magic", `${PASSER} "What do people know about Light magic?"`], ["F_ordinary_chat", `${PASSER} "Busy day today?"`]] as const)
  .flatMap(([id, input]) => [1, 2].map(rep => ({ id: `${id}_r${rep}`, turns: [input] })));
const args = process.argv.slice(2);
const set = args.includes("--set") ? args[args.indexOf("--set") + 1] : undefined;
const SEQUENCES: readonly { readonly id: string; readonly turns: readonly string[] }[] = set === "lore" ? PHASE_1Q : set === "history" ? PHASE_1R : PHASE_1P;
if (args.includes("--dry-run")) { console.log(JSON.stringify({ sequences: SEQUENCES, models: selectedModels() }, null, 2)); process.exit(0); }
if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("OPENROUTER_API_KEY is not set");
const section = (prompt: string, name: string) => prompt.match(new RegExp(`\\[${name}[^\\]]*\\]\\n([\\s\\S]*?)\\n(?:\\n)?\\[`))?.[1] ?? null;
const world = await loadWorld("data");
const out = { phase: SEQUENCES === PHASE_1P ? "1P" : SEQUENCES === PHASE_1Q ? "1Q" : "1R", models: selectedModels(), narrator_system_sha: fingerprint({ system_prompt: NARRATOR_SYSTEM, messages: [] }), created_at: new Date().toISOString(),
  note: "PAID live run; production onlineCoordinator (lexical retrieval, hybrid evidence) on the canonical opening; findings are candidates, classifications in PHASE_1P_REVIEW.md", sequences: [] as unknown[] };
console.log(`\n=== PAID ONLINE EVALUATION (OpenRouter) ===\nPhase 1P: ${SEQUENCES.length} sequences; narrator ${selectedModels().narrator}, controller ${selectedModels().controller}\n`);
for (const seq of SEQUENCES) {
  const campaign = createOpeningCampaign(world, `p1p_${seq.id.toLowerCase()}`), narratorWire = capturingFetch(), controllerWire = capturingFetch(), requests: GenerationRequest[] = [];
  const coordinator = await onlineCoordinator(world, false, p => ({ generate: p.generate.bind(p), stream: (r: GenerationRequest) => { requests.push(r); return p.stream(r); } }) satisfies NarratorProvider,
    { narrator_client: new OpenRouterClient({ fetch: narratorWire.fetch }), controller_client: new OpenRouterClient({ fetch: controllerWire.fetch }) });
  const turns = [];
  for (const input of seq.turns) {
    const before = campaign.exportSnapshot(), n = narratorWire.captures.length, c = controllerWire.captures.length, events: TurnEvent[] = [];
    for await (const e of coordinator.runTurn({ campaign, player_input: input })) events.push(e);
    const last = events.at(-1)!, result = last.type === "turn_completed" ? last.result : undefined;
    await settle(narratorWire.captures[n]); await settle(controllerWire.captures[c]);
    const after = campaign.exportSnapshot(), prompt = requests.at(-1)?.messages[0]?.content ?? "", narration = events.filter(e => e.type === "narration_delta").map(e => (e as { text: string }).text).join("");
    turns.push({ input, runtime_location: before.runtime.scene.player_location, outcome: result ? "success" : (last as { code?: string }).code ?? last.type, narration,
      scene_participants: result?.scene_participants ?? null, scene_participants_block: section(prompt, "SCENE PARTICIPANTS"), player_profile_block: section(prompt, "NICCO / PLAYER PROFILE"),
      knowledge_access: section(prompt, "CHARACTER KNOWLEDGE ACCESS"), recent_conversation: section(prompt, "RECENT CONVERSATION"), retrieved_canon: section(prompt, "RETRIEVED CANON"),
      retrieval: result?.retrieval ?? null, narrator_prompt: prompt, controller_proposal: result?.controller_proposal ?? null, authorization: result?.authorization ?? null,
      authorized_commands: result?.authorized_commands ?? null, revision: { before: before.revision, after: after.revision }, state_changed: JSON.stringify(before) !== JSON.stringify(after),
      findings: checkEphemeralAuthority(narration),
      grounding: groundingManifest({ narration, prompt, world, retrieved_ids: (result?.retrieval.ids ?? []) as readonly string[], facts: buildTurnContext(world, before).facts, participants: result?.scene_participants?.plan.participants ?? [] }), context_characters: result?.context_characters ?? null, latency: result?.latency ?? null,
      narrator_usage: usageOf(narratorWire.captures[n]), controller_usage: usageOf(controllerWire.captures[c]) });
    const t = turns.at(-1)!;
    console.log(JSON.stringify({ seq: seq.id, input, outcome: t.outcome, participants: result?.scene_participants?.after.map(p => [p.id, p.role, p.standing, p.descriptor ?? null]), retrieval: result?.retrieval.ids, rev: after.revision, findings: t.findings.map(f => f.category), ungrounded: t.grounding.ungrounded.map(f => `${f.category}: ${f.excerpt.slice(0, 60)}`) }));
  }
  out.sequences.push({ id: seq.id, turns });
}
await mkdir("docs/evaluations", { recursive: true });
const file = `docs/evaluations/phase-${out.phase.toLowerCase()}-live-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}.json`;
await writeFile(file, JSON.stringify(out, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output: file }));
