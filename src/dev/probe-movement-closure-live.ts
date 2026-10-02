import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { turnFixture } from "./turn-fixture.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { characterLocation } from "../turn/character-movement.js";
import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import { narratorConfig, selectedModels } from "./turn-services.js";
import type { GenerationRequest } from "../llm/types.js";
import type { NarratorProvider } from "../llm/narrator-provider.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { TurnEvent } from "../turn/turn-types.js";

/**
 * Movement/follow debt closure LIVE probe (evaluation only; never imported by production). The REAL narrator (production request, audit,
 * one revision, redaction, authorization, commit) runs on a clean household; the controller is a stub that proposes nothing, so every
 * move is derived from the narration by the engine. One JSONL row per call: draft, revision, delivered text, issues and final locations.
 *
 *   node .build/src/dev/probe-movement-closure-live.js --scenario d07 --samples 3 --out docs/evaluations/movement-follow-closure/d07-live.jsonl [--live]
 *
 * Hard cap EUR 15 across the closure pass; this probe stops a batch at --budget-eur (default 0.50). Prices come from OpenRouter's public models API.
 */
const args = process.argv.slice(2), flag = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const live = args.includes("--live"), samples = Number(flag("--samples") ?? 2), scenario = flag("--scenario") ?? "d07";
const out = flag("--out") ?? `docs/evaluations/movement-follow-closure/${scenario}-live.jsonl`, budgetEur = Number(flag("--budget-eur") ?? 0.5), eurPerUsd = Number(flag("--eur-per-usd") ?? 0.95);

interface Case { readonly label: string; readonly input: string; readonly members: readonly string[]; readonly setup?: readonly CampaignCommand[]; readonly follow?: string }
const HOME = ["brenna", "maren", "gerome"];
const CASES: Readonly<Record<string, readonly Case[]>> = {
  // Authored NPC+ with no destination: the player sends someone away or the NPC+ leaves for "somewhere".
  d07: [
    { label: "go out for a while", input: "Maren, go out for a while. I want some quiet.", members: ["maren"] },
    { label: "take a walk", input: "Maren, I'll stay here and read. Why don't you take a walk and come back later?", members: ["maren"] },
    { label: "nicco leaves alone, npc says she goes out", input: "I sit down by the window and start reading. Maren, do what you like.", members: ["maren"] },
    { label: "two women, one sent out", input: "Brenna stays with me. Maren, you can step out for a bit.", members: ["brenna", "maren"] },
    { label: "run an errand", input: "Maren, could you go and fetch some bread for us?", members: ["maren"] },
  ],
  // Natural follow forms on a descent, full pipeline (D-12 end to end).
  d12: [
    { label: "invite maren", input: "I go down to the main hall. Maren, come with me.", members: HOME },
    { label: "invite gerome", input: "I go down to the main hall. Gerome, join me downstairs.", members: HOME },
    { label: "invite anyone", input: "I go down to the main hall. Anyone who wants can come with me.", members: HOME },
  ],
  // Two eligible women, pronoun-led follows (D-11).
  d11: [
    { label: "invite both", input: "I go down to the main hall. Brenna, Maren, come with me.", members: ["brenna", "maren"] },
    { label: "invite brenna", input: "I go down to the main hall. Brenna, come with me.", members: ["brenna", "maren"] },
    { label: "anyone", input: "I go down to the main hall. Anyone who wants can come along.", members: ["brenna", "maren"] },
  ],
};
const cases = CASES[scenario];
if (!cases) { console.error(`unknown scenario ${scenario}`); process.exit(2); }

function household(members: readonly string[]) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_household", id: "campaign_household_home", name: "Home" },
    { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...members.map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id }))] });
  return f;
}
const meta = { model: "stub", usage: {}, latency: { request_started_at: "", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "", elapsed_total_ms: 0 } };
const plan = Array.from({ length: samples }, (_, s) => cases.map((c, i) => ({ c, i, s }))).flat();
console.log(JSON.stringify({ mode: live ? "LIVE" : "DRY_PLAN", scenario, calls_min: plan.length, model: selectedModels().narrator }));
if (!live) process.exit(0);
if (!process.env.OPENROUTER_API_KEY?.trim()) { console.error("BLOCKED: OPENROUTER_API_KEY missing; no paid call made"); process.exit(3); }
const catalog = await (await fetch("https://openrouter.ai/api/v1/models")).json() as { data: { id: string; pricing: { prompt: string; completion: string } }[] };
const model = selectedModels().narrator, row = catalog.data.find(r => r.id === model || r.id === model.replace(/:nitro$/, ""));
if (!row) { console.error("BLOCKED: no public price for the narrator model"); process.exit(3); }
const rates = { prompt: Number(row.pricing.prompt), completion: Number(row.pricing.completion) };
mkdirSync(dirname(out), { recursive: true });
let spent = existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).reduce((n, l) => n + (JSON.parse(l) as { cost_eur: number }).cost_eur, 0) : 0;
const inner = new MiniMaxNarratorProvider(undefined, narratorConfig());
for (const { c, i, s } of plan) {
  if (spent >= budgetEur) { console.error(`STOPPED at EUR ${spent.toFixed(4)}`); break; }
  const f = household(c.members), service = new RetrievalService(f.world);
  let prompt_tokens = 0, completion_tokens = 0, calls = 0;
  const narrator: NarratorProvider = {
    generate: async (r: GenerationRequest) => { const x = await inner.generate(r); calls++; prompt_tokens += x.usage.prompt_tokens ?? 0; completion_tokens += x.usage.completion_tokens ?? 0; return x; },
    async *stream(r: GenerationRequest) { calls++; for await (const e of inner.stream(r)) { if (e.type === "completed") { prompt_tokens += e.result.usage.prompt_tokens ?? 0; completion_tokens += e.result.usage.completion_tokens ?? 0; } yield e; } },
  };
  const co = new TurnCoordinator(f.world, narrator, { async propose() { return { commands: [], ...meta }; } }, { service, search: new HybridSearch(service) });
  let result; let error: string | undefined;
  try { for await (const e of co.runTurn({ campaign: f.campaign, player_input: c.input }) as AsyncIterable<TurnEvent>) if (e.type === "turn_completed") result = e.result; }
  catch (e) { error = e instanceof Error ? e.message : String(e); }
  const snap = f.campaign.exportSnapshot(), where = Object.fromEntries(["brenna", "maren", "gerome"].filter(id => c.members.includes(id)).map(id => [id, characterLocation(snap, f.world, id)]));
  const cost_eur = (prompt_tokens * rates.prompt + completion_tokens * rates.completion) * eurPerUsd;
  spent += cost_eur;
  const rec = result?.narration_reconciliation;
  appendFileSync(out, JSON.stringify({ scenario, case: c.label, sample: s, input: c.input, delivered: rec?.delivered, draft: rec?.draft, revision: rec?.revision,
    final: result?.narration, issues: rec?.issues.map(x => `${x.kind}:${x.character ?? ""}:${x.sentence}`), repaired_arrivals: rec?.repaired_arrivals, where,
    movements: result?.turn_evidence.character_movements?.map(m => `${m.character_id}->${m.location_id}`), decisions: result?.authorization.map(d => `${d.command.kind}:${d.authorized ? "ok" : d.reason}`),
    error, narrator_calls: calls, prompt_tokens, completion_tokens, cost_eur }) + "\n");
  console.log(JSON.stringify({ case: c.label, sample: s, delivered: rec?.delivered, where, issues: rec?.issues.length ?? 0, spent_eur: +spent.toFixed(4) }));
}
console.log(JSON.stringify({ spent_eur: +spent.toFixed(4) }));
