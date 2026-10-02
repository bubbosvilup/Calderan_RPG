import { appendFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { turnFixture } from "./turn-fixture.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { movableCharacters, narratedMovements } from "../turn/character-movement.js";
import { activeNpcPlus } from "../campaign/premium-characters.js";
import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import { narratorConfig, selectedModels } from "./turn-services.js";
import { escapeRegExp as esc, sentencesOf } from "../turn/language/text.js";
import type { GenerationRequest } from "../llm/types.js";
import type { CampaignCommand } from "../campaign/types.js";

/**
 * Post-Pass-10 follow-choice LIVE probe (evaluation only; never imported by production). Narrator-only: the exact production narrator
 * request is captured from a real TurnCoordinator turn on a clean household (Nicco, Brenna, Maren, Gerome in the Observation room), then
 * one variant transform is applied and ONLY the narrator is called. No controller, no audit: the RAW FIRST DRAFT is classified.
 *
 *   node .build/src/dev/probe-follow-choice-live.js                       # dry plan (no calls)
 *   node .build/src/dev/probe-follow-choice-live.js --live --samples 3 --sample-start 0 --budget-eur 0.35 --eur-per-usd 0.95
 *
 * Budget: prices are fetched from OpenRouter's public models API. Spend is accounted from reported usage and accumulated across
 * resumed batches (read back from the JSONL). New calls stop at EUR 0.30 (exploration stop) and never exceed --budget-eur (hard cap).
 */
const args = process.argv.slice(2), flag = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const out = flag("--out") ?? "docs/evaluations/pass10/follow-choice-live.jsonl";
const live = args.includes("--live"), samples = Number(flag("--samples") ?? 3), start = Number(flag("--sample-start") ?? 0);
const budgetEur = Number(flag("--budget-eur") ?? 0.35), softStopEur = 0.30, eurPerUsd = Number(flag("--eur-per-usd") ?? 0.95);
type Variant = "production" | "pass9_note" | "away_labels";
const VARIANTS: readonly Variant[] = (flag("--variants")?.split(",") as Variant[] | undefined) ?? ["production", "pass9_note", "away_labels"];
const INVITATIONS: readonly { readonly input: string; readonly invited: readonly string[] }[] = [
  { input: "I go down to the main hall. Maren, come with me.", invited: ["Maren"] },
  { input: "I go down to the main hall. Maren, would you come with me?", invited: ["Maren"] },
  { input: "I go down to the main hall. Maren, come along if you want.", invited: ["Maren"] },
  { input: "I go down to the main hall. Gerome, join me downstairs.", invited: ["Gerome"] },
  { input: "I go down to the main hall. Anyone who wants can come with me.", invited: ["Brenna", "Gerome", "Maren"] }, // production note order
];
if (budgetEur <= 0 || budgetEur > 0.35 || !(eurPerUsd > 0) || samples < 1 || samples > 5) { console.error("REFUSED: budget-eur in (0, 0.35], samples 1..5"); process.exit(2); }

const MEMBERS = ["brenna", "maren", "gerome"] as const;
/** Identical clean baseline for every sample: membership only, Nicco and all three NPC+ in the Observation room, no conversation. */
function fresh(extra: readonly CampaignCommand[] = []) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_household", id: "campaign_household_home", name: "Home" },
    { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...MEMBERS.map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id })), ...extra] });
  return f;
}
/** The exact production narrator request for this input (captured from a real turn; the stub narrator/controller only end the turn). */
async function capturedRequest(input: string): Promise<GenerationRequest> {
  const f = fresh(), service = new RetrievalService(f.world), text = "Nicco goes down the stairs.";
  let captured: GenerationRequest | undefined;
  const meta = { model: "capture", usage: {}, latency: { request_started_at: "", headers_ms: 0, time_to_first_token_ms: 0, completed_at: "", elapsed_total_ms: 0 } };
  const co = new TurnCoordinator(f.world, { async generate() { throw new Error("unused"); }, async *stream(r: GenerationRequest) { captured ??= r; yield { type: "text_delta" as const, text }; yield { type: "completed" as const, result: { text, ...meta } }; } },
    { async propose() { return { commands: [], ...meta }; } }, { service, search: new HybridSearch(service) });
  for await (const _ of co.runTurn({ campaign: f.campaign, player_input: input })) void _;
  return captured!;
}
const FROM = "Observation room", TO = "Main hall";
const joinNames = (n: readonly string[]) => n.join(", ");
/** Pass 9 invited note (no pre-turn presence clarification), for one or several invited people. */
const pass9Note = (who: readonly string[]) => `Nicco leaves ${FROM} for ${TO}. ${joinNames(who)} ${who.length === 1 ? "was" : "were"} invited to come along and ${who.length === 1 ? "decides" : "each decide"} freely whether to follow him: do not assume either choice. If someone follows, narrate that completed choice explicitly; if someone stays, narrate that instead. Do not have Nicco bring or carry anyone.`;
function applyVariant(v: Variant, content: string, who: readonly string[]): string {
  if (v === "production") return content;
  if (v === "pass9_note") return content.split("\n").map(l => l.startsWith(`Nicco leaves ${FROM} for ${TO}. ${joinNames(who)} `) ? pass9Note(who) : l).join("\n");
  let s = content;
  for (const name of who) s = s.replace(`${name} (away)`, `${name} (in ${FROM})`).replace(new RegExp(`(${esc(name)}: [^\\n]*?); away;`), `$1; in ${FROM};`);
  return s;
}
const hash = (r: GenerationRequest) => createHash("sha256").update(JSON.stringify({ s: r.system_prompt, m: r.messages })).digest("hex").slice(0, 16);

/** The production movement grammar on the projected arrival (Nicco in the Main hall): a completed follow of `id` to the arrival? */
function grammarFollow(narration: string, id: string): boolean {
  const f = fresh([{ kind: "runtime_delta", delta: { player_location: "test_hall", time_advance_minutes: 1 } }]), s = f.campaign.exportSnapshot();
  return narratedMovements(narration, movableCharacters(s, ["test_room", "test_hall"], f.world), { origin: "test_room", arrival: "test_hall" }, buildTurnContext(f.world, s), f.world, activeNpcPlus(s))
    .some(m => m.character_id === id && m.location_id === "test_hall");
}
// Deterministic first-pass classification (human review follows for ABSENCE_CONTRADICTION, AMBIGUOUS and OTHER).
const FALSE_ABSENCE = /\b(?:not there to (?:hear|answer)|(?:was|were)n'?t there|(?:was|were) not (?:there|in the room|present|with him)|not (?:in|within) (?:the room|earshot)|out of earshot|away from (?:this|the) floor|(?:is|was|were) away\b|elsewhere in the (?:tower|house|building)|not (?:here|there) to (?:hear|answer)|(?:didn't|did not|never) hear|had (?:already )?(?:gone|left)|not (?:present|around) when|no one (?:was )?(?:there|upstairs) to)\b/i;
const REFUSAL = /(?:^|["“]\s*)No[,.!]|\b(?:declin\w*|refus\w*|(?:shak\w*|shook) (?:her|his|its) head|I'?d rather (?:not|stay)|I'll stay|not (?:right )?now|go (?:on )?without me|you go ahead)\b/i;
const STAY = /\b(?:does(?:n't| not) follow|did(?:n't| not) follow|stays?\b|stayed|remains?\b|remained|(?:keeps?|kept) (?:her|his|its) (?:seat|place)|no (?:footsteps|one|answer|reply) follow\w*|doesn't move|does not move|did not move)/i;
const HESITATION = /\b(?:hesitat\w*|wavers?|wavered|considers?|considered|uncertain|torn)\b/i;
const PRESENCE = /\b(?:looks? up|looked up|watch\w*|glanc\w*|nods?|nodded|answers?|answered|says?|said|calls?|called|rises?|rose|stands?|stood|turns?|turned|smil\w*|meets? his)\b/i;
type Primary = "FOLLOW" | "STAY" | "REFUSAL" | "HESITATION" | "AMBIGUOUS" | "ABSENCE_CONTRADICTION" | "OTHER";
function classifyPerson(text: string, name: string) {
  const id = name.toLowerCase(), sentences = sentencesOf(text.replace(/\s+/g, " "));
  // A pronoun-led sentence continues the immediately preceding sentence that named this person.
  const about: string[] = []; let last = false;
  for (const s of sentences) {
    const named = new RegExp(`\\b${esc(name)}\\b`, "i").test(s), pronoun = /^\W*(?:she|he|it|her|his|its)\b/i.test(s);
    if (named || (pronoun && last)) about.push(s);
    last = named || (pronoun && last);
  }
  const ctext = about.join(" ");
  const completed_follow = grammarFollow(text, id);
  const false_absence = FALSE_ABSENCE.test(ctext);
  const refusal = REFUSAL.test(ctext), stay = STAY.test(ctext) || (/\bno (?:footsteps|one) follow/i.test(text));
  const hesitation = HESITATION.test(ctext);
  const primary: Primary = false_absence ? "ABSENCE_CONTRADICTION" : completed_follow ? "FOLLOW" : refusal ? "REFUSAL" : stay ? "STAY" : hesitation ? "HESITATION" : about.length ? "AMBIGUOUS" : "OTHER";
  return { name, primary, false_absence, completed_follow, completed_stay: stay && !completed_follow, mentions_pre_turn_presence: PRESENCE.test(ctext) && !false_absence, mentioned: about.length > 0 };
}
const ORDER: readonly Primary[] = ["ABSENCE_CONTRADICTION", "FOLLOW", "REFUSAL", "STAY", "HESITATION", "AMBIGUOUS", "OTHER"];

const requests = INVITATIONS.map(() => undefined as GenerationRequest | undefined);
for (const [i, inv] of INVITATIONS.entries()) requests[i] = await capturedRequest(inv.input);
// Pre-flight: every control variant must change the prompt (no silent no-op variant); production must equal the capture.
for (const [i, inv] of INVITATIONS.entries()) for (const v of VARIANTS) {
  const r = requests[i]!, changed = r.messages.some(m => applyVariant(v, m.content, inv.invited) !== m.content);
  if ((v === "production") === changed) { console.error(`PREFLIGHT FAILED: variant ${v} on invitation ${i} ${changed ? "changed" : "did not change"} the prompt`); process.exit(4); }
}
const prior = existsSync(out) ? (await import("node:fs")).readFileSync(out, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l) as { cost_eur: number; variant: string; invitation: number; sample: number }) : [];
let spentEur = prior.reduce((n, r) => n + r.cost_eur, 0);
const plan: { variant: Variant; invitation: number; sample: number }[] = [];
for (let sample = start; sample < start + samples; sample++) for (const variant of VARIANTS) for (let invitation = 0; invitation < INVITATIONS.length; invitation++)
  if (!prior.some(p => p.variant === variant && p.invitation === invitation && p.sample === sample)) plan.push({ variant, invitation, sample });

let rates = { prompt: 0, completion: 0 };
const model = selectedModels().narrator;
if (live) {
  if (!process.env.OPENROUTER_API_KEY?.trim()) { console.error("BLOCKED: OPENROUTER_API_KEY missing; no paid call made"); process.exit(3); }
  const catalog = await (await fetch("https://openrouter.ai/api/v1/models")).json() as { data: { id: string; pricing: { prompt: string; completion: string } }[] };
  const row = catalog.data.find(r => r.id === model || r.id === model.replace(/:nitro$/, ""));
  if (!row) { console.error("BLOCKED: no public price for the narrator model"); process.exit(3); }
  rates = { prompt: Number(row.pricing.prompt), completion: Number(row.pricing.completion) };
}
const chars = (r: GenerationRequest) => r.system_prompt.length + r.messages.reduce((n, m) => n + m.content.length, 0);
const pessimisticEur = plan.reduce((n, p) => n + (chars(requests[p.invitation]!) / 3 * rates.prompt + narratorConfig().max_output_tokens * rates.completion) * eurPerUsd, 0);
console.log(JSON.stringify({ mode: live ? "LIVE" : "DRY_PLAN", model, calls: plan.length, already_spent_eur: +spentEur.toFixed(4), rates_usd_per_token: rates,
  pessimistic_batch_eur: live ? +pessimisticEur.toFixed(4) : "fetch prices with --live", budget_eur: budgetEur, prompt_hashes: requests.map(r => hash(r!)) }));
if (!live) process.exit(0);
if (spentEur + pessimisticEur > budgetEur) { console.error(`REFUSED: already spent EUR ${spentEur.toFixed(4)} + pessimistic batch EUR ${pessimisticEur.toFixed(4)} exceeds the hard cap EUR ${budgetEur}`); process.exit(2); }

const narrator = new MiniMaxNarratorProvider(undefined, narratorConfig());
mkdirSync(dirname(out), { recursive: true });
for (const p of plan) {
  if (spentEur >= softStopEur) { console.error(`STOPPED: exploration stop at EUR ${spentEur.toFixed(4)}`); break; }
  const inv = INVITATIONS[p.invitation]!, base = requests[p.invitation]!;
  // The captured request carries the finished turn's (already aborted) network signal; drop it. Prompt content is untouched.
  const { signal: _finishedTurn, ...captured } = base;
  const request: GenerationRequest = { ...captured, messages: base.messages.map(m => ({ ...m, content: applyVariant(p.variant, m.content, inv.invited) })) };
  const t0 = performance.now(), r = await narrator.generate(request), latency_ms = Math.round(performance.now() - t0);
  const input_tokens = r.usage.prompt_tokens ?? 0, output_tokens = r.usage.completion_tokens ?? 0;
  const cost_usd = input_tokens * rates.prompt + output_tokens * rates.completion, cost_eur = cost_usd * eurPerUsd;
  spentEur += cost_eur;
  const people = inv.invited.map(n => classifyPerson(r.text, n));
  const classification = ORDER.find(c => people.some(x => x.primary === c))!;
  appendFileSync(out, JSON.stringify({ variant: p.variant, invitation: p.invitation, invitation_text: inv.input, sample: p.sample, prompt_hash: hash(request), model: r.model,
    classification, absence_claim: people.some(x => x.false_absence), explicit_follow: people.some(x => x.completed_follow), explicit_stay_or_refusal: people.some(x => x.completed_stay || x.primary === "REFUSAL"),
    ambiguous: classification === "AMBIGUOUS", people, input_tokens, output_tokens, latency_ms, cost_usd, cost_eur, output: r.text }) + "\n");
  console.log(JSON.stringify({ ...p, classification, spent_eur: +spentEur.toFixed(4) }));
}
const rows = (await import("node:fs")).readFileSync(out, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l) as { variant: string; classification: Primary; absence_claim: boolean; cost_eur: number; input_tokens: number; output_tokens: number; latency_ms: number });
const summary = { model, eur_per_usd: eurPerUsd, rates_usd_per_token: rates, calls: rows.length, spent_eur: +rows.reduce((n, r) => n + r.cost_eur, 0).toFixed(4),
  by_variant: Object.fromEntries(VARIANTS.map(v => { const vr = rows.filter(r => r.variant === v); return [v, { calls: vr.length,
    classes: Object.fromEntries(ORDER.map(c => [c, vr.filter(r => r.classification === c).length])), false_absence_calls: vr.filter(r => r.absence_claim).length,
    false_absence_rate: vr.length ? +(vr.filter(r => r.absence_claim).length / vr.length).toFixed(3) : null }]; })),
  tokens: { input: rows.reduce((n, r) => n + r.input_tokens, 0), output: rows.reduce((n, r) => n + r.output_tokens, 0) },
  latency_ms_p50: [...rows.map(r => r.latency_ms)].sort((a, b) => a - b)[Math.floor(rows.length / 2)] ?? null, classification: "deterministic first pass; see report for human review" };
writeFileSync(out.replace(/\.jsonl$/, ".summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ calls: summary.calls, spent_eur: summary.spent_eur }));
