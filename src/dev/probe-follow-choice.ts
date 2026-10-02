import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { turnFixture } from "./turn-fixture.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { movableCharacters, narratedMovements } from "../turn/character-movement.js";
import { activeNpcPlus } from "../campaign/premium-characters.js";
import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { applyVariant, type VariantId } from "./follow-choice-variants.js";
import { classifyFollowChoice, type FollowChoice } from "./follow-choice-classify.js";
import { NARRATOR_OUTPUT_TOKENS, selectedModels } from "./turn-services.js";
import type { GenerationRequest } from "../llm/types.js";
import type { CampaignCommand } from "../campaign/types.js";

/**
 * NPC+ Pass 10 — OPTIONAL narrator-only follow-choice probe. NOT run in Pass 10 (no API key in the authoring environment).
 *
 *   node .build/src/dev/probe-follow-choice.js [--variants production,pass9_note] [--samples 3] [--invitations 0,1,2]
 *        [--live --price-in <usd per M> --price-out <usd per M> --eur-per-usd <x> --budget-eur 1.0] [--out docs/evaluations/pass10/probe.jsonl]
 *
 * Default is a DRY plan: it prints the exact number of calls and a conservative cost bound and calls nothing. A live run needs
 * OPENROUTER_API_KEY, explicit prices, and a budget of at most EUR 1.50; it refuses when the pessimistic bound (every call at the
 * full prompt plus the full output cap) exceeds the budget, and stops when the measured spend reaches it. One narrator call per sample, no
 * controller, no audit: the RAW FIRST DRAFT is classified (FOLLOW / STAY / AMBIGUOUS / OTHER). There is no target distribution.
 */
const args = process.argv.slice(2), flag = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const INVITATIONS = ["I go down to the main hall. Maren, come with me.", "I go down to the main hall. Would you come with me, Maren?", "I go down to the main hall. Come along if you want, Maren.",
  "I go down to the main hall. Brenna, join me downstairs.", "I go down to the main hall. Anyone who wants can come with me."] as const;
const variants = (flag("--variants") ?? "production").split(",") as VariantId[], samples = Number(flag("--samples") ?? 3);
const picked = (flag("--invitations") ?? "0,1,2,3,4").split(",").map(Number), live = args.includes("--live");
const priceIn = Number(flag("--price-in")), priceOut = Number(flag("--price-out")), eurPerUsd = Number(flag("--eur-per-usd")), budgetEur = Number(flag("--budget-eur") ?? 1);
const calls = variants.length * picked.length * samples;
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 10 || calls > 120 || budgetEur <= 0 || budgetEur > 1.5) { console.error("REFUSED: samples 1..10, at most 120 calls, budget-eur in (0, 1.5]"); process.exit(2); }

/** A fresh household fixture: Nicco upstairs in the Observation room with Brenna and Maren as active NPC+ (Nicco keeps the household). */
function fresh(extra: readonly CampaignCommand[] = []) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_household", id: "campaign_household_home", name: "Home" },
    { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...["brenna", "maren"].map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id })), ...extra] });
  return f;
}
async function capturedRequest(input: string): Promise<GenerationRequest> {
  const f = fresh(), service = new RetrievalService(f.world), text = "Nicco goes down the stairs.";
  let captured: GenerationRequest | undefined;
  const meta = { model: "capture", usage: {}, latency: { request_started_at: "", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "", elapsed_total_ms: 0 } };
  const co = new TurnCoordinator(f.world, { async generate() { throw new Error("unused"); }, async *stream(r: GenerationRequest) { captured ??= r; yield { type: "text_delta" as const, text }; yield { type: "completed" as const, result: { text, ...meta } }; } },
    { async propose() { return { commands: [], ...meta }; } }, { service, search: new HybridSearch(service) });
  for await (const _ of co.runTurn({ campaign: f.campaign, player_input: input })) void _;
  return captured!;
}
/** The production movement grammar on the projected arrival: did the draft narrate a completed follow of `name` to Nicco's arrival? */
function grammarFollow(narration: string, name: string): boolean {
  const f = fresh([{ kind: "runtime_delta", delta: { player_location: "test_hall", time_advance_minutes: 1 } }]), s = f.campaign.exportSnapshot(), id = name.toLowerCase();
  return narratedMovements(narration, movableCharacters(s, ["test_room", "test_hall"], f.world), { origin: "test_room", arrival: "test_hall" }, buildTurnContext(f.world, s), f.world, activeNpcPlus(s))
    .some(m => m.character_id === id && m.location_id === "test_hall");
}
const plan = [] as { variant: VariantId; invitation: number; sample: number }[];
for (const variant of variants) for (const invitation of picked) for (let sample = 0; sample < samples; sample++) plan.push({ variant, invitation, sample });
const requests = new Map<number, GenerationRequest>();
for (const i of picked) requests.set(i, await capturedRequest(INVITATIONS[i]!));
const pessimisticUsd = plan.reduce((n, p) => n + (Math.ceil(requests.get(p.invitation)!.messages.map(m => m.content).join("").length + requests.get(p.invitation)!.system_prompt.length) / 3 * (priceIn || 0) + NARRATOR_OUTPUT_TOKENS * (priceOut || 0)) / 1e6, 0);
console.log(JSON.stringify({ mode: live ? "LIVE" : "DRY_PLAN", calls: plan.length, narrator_model: selectedModels().narrator, pessimistic_cost_eur: Number.isFinite(pessimisticUsd * eurPerUsd) ? +(pessimisticUsd * eurPerUsd).toFixed(4) : "unknown until --price-in/--price-out/--eur-per-usd are given", budget_eur: budgetEur }));
if (!live) process.exit(0);
if (!process.env.OPENROUTER_API_KEY?.trim() || !(priceIn > 0) || !(priceOut > 0) || !(eurPerUsd > 0)) { console.error("BLOCKED: live needs OPENROUTER_API_KEY, --price-in, --price-out and --eur-per-usd (no reliable cost accounting otherwise: no paid call is made)"); process.exit(3); }
if (pessimisticUsd * eurPerUsd > budgetEur) { console.error(`REFUSED: pessimistic bound EUR ${(pessimisticUsd * eurPerUsd).toFixed(3)} exceeds the budget`); process.exit(2); }
const narrator = new MiniMaxNarratorProvider(new OpenRouterClient(), { model: selectedModels().narrator, max_output_tokens: NARRATOR_OUTPUT_TOKENS, disable_reasoning: true });
const out = flag("--out") ?? "docs/evaluations/pass10/probe-follow-choice.jsonl"; mkdirSync(dirname(out), { recursive: true });
let spentUsd = 0; const tally: Record<string, Record<FollowChoice, number>> = {}; const rows: string[] = [];
for (const p of plan) {
  if (spentUsd * eurPerUsd >= budgetEur) { console.error("STOPPED: budget reached"); break; }
  const base = requests.get(p.invitation)!, name = INVITATIONS[p.invitation]!.includes("Brenna") ? "Brenna" : "Maren";
  const content = applyVariant(p.variant, base.messages.map(m => m.content).join("\n"), { from: "Observation room", to: "Main hall", who: name });
  const r = await narrator.generate({ system_prompt: base.system_prompt, messages: [{ role: "user", content }], max_output_tokens: NARRATOR_OUTPUT_TOKENS });
  spentUsd += ((r.usage.prompt_tokens ?? 0) * priceIn + (r.usage.completion_tokens ?? 0) * priceOut) / 1e6;
  const choice = classifyFollowChoice(r.text, name, grammarFollow(r.text, name));
  (tally[`${p.variant}/${p.invitation}`] ??= { FOLLOW: 0, STAY: 0, AMBIGUOUS: 0, OTHER: 0 })[choice]++;
  rows.push(JSON.stringify({ ...p, choice, excerpt: r.text.slice(0, 500) }));
}
writeFileSync(out, rows.join("\n") + "\n");
console.log(JSON.stringify({ spent_eur: +(spentUsd * eurPerUsd).toFixed(4), tally }, null, 2));
