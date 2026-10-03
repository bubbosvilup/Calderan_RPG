import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { CONTROLLER_POLICY, DEFAULT_CONTROLLER_MODEL } from "../llm/openrouter/state-controller.js";
import { CONTROLLER_SCHEMA } from "../llm/controller-schema.js";
import type { CampaignCommand } from "../campaign/types.js";
import { parseCampaignProposal } from "../campaign/validation.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { playerIntent } from "../turn/player-intent.js";
import { deriveTurnEvidence } from "../turn/turn-evidence.js";
import { authorizeCommands } from "../turn/command-authorizer.js";
import { turnFixture } from "./turn-fixture.js";
import { capturingFetch, settle, usageOf } from "./narrator-bakeoff.js";
import { verifyQuote, type QuotePolicy } from "./evidence-quote.js";

/**
 * Phase 1N EXPERIMENT (shadow only). Asks the unchanged DeepSeek controller, with one extra instruction, for a short verbatim
 * evidence quote per proposed command, then verifies deterministically. Nothing is ever committed; production TurnEvidence
 * stays authoritative. Compares against the current grammar on stored traces with agent-authored truth labels.
 */
export const SHADOW_INSTRUCTION = "For every command also return evidence_quote: one short exact verbatim substring (max 200 characters) of final_narration that shows the change actually happened. Copy it character for character. No reasoning, no paraphrase. If no such substring exists, do not propose the command.";
const commandItems = (CONTROLLER_SCHEMA as { properties: { commands: { items: unknown } } }).properties.commands.items;
export const SHADOW_SCHEMA = { type: "object", additionalProperties: false, required: ["commands"], properties: { commands: { type: "array", maxItems: 8, items: { type: "object", additionalProperties: false, required: ["command", "evidence_quote"], properties: { command: commandItems, evidence_quote: { type: "string" } } } } } };

type Truth = "yes" | "no" | "ambiguous";
interface Item { readonly key: string; readonly source: string; readonly case_id: "r115" | "knowledge_tell"; readonly input: string; readonly narration: string; readonly truth: Truth; readonly note?: string }
const R115_INPUT = "*gives her the two pink shirt, one fluffy and thick one made of probably cotton, the shorts are also pink and should be alright for her narrow waist*";
const TELL = "/tell campaign_fact_bridge_closed to brenna";
/** Agent-authored truth: did the narration actually establish the whole event (all three garments / an explicit telling)? */
const LABELS: Record<string, Truth> = {
  "1m:kimi:r115#1": "no", "1m:kimi:r115#2": "yes", "1m:kimi:r115#3": "no", "1m:kimi:knowledge_tell#1": "yes", "1m:kimi:knowledge_tell#2": "yes", "1m:kimi:knowledge_tell#3": "yes",
  "1m:qwen:r115#1": "yes", "1m:qwen:r115#2": "no", "1m:qwen:r115#3": "yes", "1m:qwen:knowledge_tell#1": "ambiguous", "1m:qwen:knowledge_tell#2": "ambiguous", "1m:qwen:knowledge_tell#3": "yes",
  "1m:minimax:r115#1": "no", "1m:minimax:r115#2": "yes", "1m:minimax:r115#3": "yes", "1m:minimax:knowledge_tell#1": "ambiguous", "1m:minimax:knowledge_tell#2": "no", "1m:minimax:knowledge_tell#3": "ambiguous",
  "1m1:kimi:r115#1": "yes", "1m1:kimi:r115#2": "yes", "1m1:kimi:r115#3": "no", "1m1:kimi:knowledge_tell#1": "yes", "1m1:kimi:knowledge_tell#2": "yes", "1m1:kimi:knowledge_tell#3": "yes",
  "conf:kimi:r115#1": "yes", "conf:kimi:r115#2": "yes", "conf:kimi:r115#3": "no", "conf:kimi:r115#4": "yes", "conf:kimi:r115#5": "no",
  "conf:kimi:knowledge_tell#1": "yes", "conf:kimi:knowledge_tell#2": "yes", "conf:kimi:knowledge_tell#3": "ambiguous", "conf:kimi:knowledge_tell#4": "yes", "conf:kimi:knowledge_tell#5": "yes",
  "glm:z-ai-glm-5-2:r115#1": "yes", "glm:z-ai-glm-5-2:r115#2": "yes", "glm:z-ai-glm-5-2:r115#3": "yes", "glm:z-ai-glm-5-2:knowledge_tell#1": "ambiguous", "glm:z-ai-glm-5-2:knowledge_tell#2": "ambiguous", "glm:z-ai-glm-5-2:knowledge_tell#3": "yes",
  "1n:kimi:tell#1": "yes", "1n:kimi:tell#2": "yes", "1n:kimi:tell#3": "yes",
};
export const ADVERSARIAL: readonly Item[] = [
  { key: "adv:A1", source: "synthetic", case_id: "r115", input: R115_INPUT, truth: "no", note: "NPC hypothetical in dialogue", narration: "Brenna eyes the clothes. \"If you had given me these a week ago, I would have taken them,\" she says. She leaves them in his hands." },
  { key: "adv:A2", source: "synthetic", case_id: "r115", input: R115_INPUT, truth: "no", note: "negated", narration: "Brenna does not take the shirts or the shorts. She shakes her head." },
  { key: "adv:A3", source: "synthetic", case_id: "r115", input: R115_INPUT, truth: "no", note: "refusal followed by discussion", narration: "Brenna refuses the clothes. They talk for a while about colors; she admits that taking them would be kind, but she does not." },
  { key: "adv:A4", source: "synthetic", case_id: "r115", input: R115_INPUT, truth: "no", note: "dialogue about an event that did not happen now", narration: "\"I took three pink shirts from a merchant once,\" Brenna says, smiling. She does not reach for these." },
  { key: "adv:A5", source: "synthetic", case_id: "r115", input: R115_INPUT, truth: "no", note: "accepts then hands back", narration: "Brenna takes the three garments, looks at them, then hands them back. \"Keep them.\"" },
  { key: "adv:A6", source: "synthetic", case_id: "r115", input: R115_INPUT, truth: "yes", note: "item-by-item across sentences", narration: "Brenna gathers up the cotton shirt. Then the fluffy one. Then the shorts." },
  { key: "adv:A12", source: "synthetic", case_id: "r115", input: R115_INPUT, truth: "no", note: "imagined", narration: "Brenna imagines taking the three items, then decides against it." },
  { key: "adv:A7", source: "synthetic", case_id: "knowledge_tell", input: TELL, truth: "no", note: "question in NPC dialogue", narration: "Maren leans in. \"Did Nicco tell Brenna the eastern bridge is closed?\" Nobody answers." },
  { key: "adv:A8", source: "synthetic", case_id: "knowledge_tell", input: TELL, truth: "no", note: "abandoned telling", narration: "Nicco opens his mouth to tell Brenna that the eastern bridge is closed, then thinks better of it and says nothing." },
  { key: "adv:A9", source: "synthetic", case_id: "knowledge_tell", input: TELL, truth: "no", note: "NPC reports another source and disbelieves", narration: "Brenna says, \"Someone told me the eastern bridge is closed, but I do not believe it.\"" },
  { key: "adv:A10", source: "synthetic", case_id: "knowledge_tell", input: TELL, truth: "yes", note: "quoted realization of /tell", narration: "Nicco leans toward Brenna. \"The eastern bridge is closed,\" he tells her quietly." },
  { key: "adv:A11", source: "synthetic", case_id: "knowledge_tell", input: TELL, truth: "yes", note: "relative clause", narration: "Nicco turns to Brenna, who sits alert by the window, and tells her that the eastern bridge is closed." },
];
async function loadTraces(tellFile: string | undefined): Promise<Item[]> {
  const items: Item[] = [];
  const add = (prefix: string, source: string, records: { key: string; alias: string; case_id: string; input: string; narration: string }[]) => {
    for (const r of records.filter(r => r.case_id === "r115" || r.case_id === "knowledge_tell")) {
      const key = `${prefix}:${r.alias}:${r.key}`, truth = LABELS[key];
      if (truth) items.push({ key, source, case_id: r.case_id as Item["case_id"], input: r.input, narration: r.narration, truth });
    }
  };
  const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
  add("1m", "phase-1m-stage-b", (await json("docs/evaluations/archive/phase-1m-stage-b-20260928T2044.json")).records);
  add("1m1", "phase-1m1-stage-b", (await json("docs/evaluations/archive/phase-1m1-stage-b-20260928T2118.json")).records);
  add("conf", "phase-1m1-confirmation", (await json("docs/evaluations/archive/phase-1m1-confirmation-20260928T2125.json")).records);
  add("glm", "phase-1m2-glm", (await json("docs/evaluations/archive/phase-1m2-glm-check-20260928T2146.json")).runs.stage_b.records);
  const tell = tellFile ? (await readFile(tellFile, "utf8")).split("\n").filter(Boolean).map(l => JSON.parse(l) as { rep: number; turns: { input: string; narration: string }[] }) : [];
  for (const s of tell) { const key = `1n:kimi:tell#${s.rep}`, truth = LABELS[key]; if (truth) items.push({ key, source: "phase-1n-tell-before", case_id: "knowledge_tell", input: s.turns[0]!.input, narration: s.turns[0]!.narration, truth }); }
  return items;
}

async function shadowPropose(item: Item) {
  const { world, campaign } = turnFixture(item.case_id === "r115"), snapshot = campaign.exportSnapshot(), context = buildTurnContext(world, snapshot);
  const intent = playerIntent(item.input, context, snapshot, world);
  const wire = capturingFetch(), c = new OpenRouterClient({ fetch: wire.fetch });
  let text = "", error: string | null = null, latency: number | null = null;
  try {
    for await (const event of c.request({ model: DEFAULT_CONTROLLER_MODEL, max_tokens: 700,
      messages: [{ role: "system", content: `${CONTROLLER_POLICY}\n${SHADOW_INSTRUCTION}` }, { role: "user", content: JSON.stringify({ player_action: item.input, prior_state: JSON.stringify({ base_revision: snapshot.revision, context, explicit_intent: intent.candidates }), final_narration: item.narration }) }],
      response_format: { type: "json_schema", json_schema: { name: "campaign_proposal_with_evidence", strict: true, schema: SHADOW_SCHEMA } }, provider: { require_parameters: true }, reasoning: { exclude: true, enabled: false } }, false, 20_000)) {
      if (event.type === "text_delta") text += event.text; else latency = event.metadata.latency.elapsed_total_ms;
    }
  } catch (e) { error = e instanceof Error ? e.message : "error"; }
  await settle(wire.captures[0]);
  let proposals: { command: CampaignCommand; evidence_quote: string }[] = [];
  try {
    const raw = (JSON.parse(text) as { commands: { command: unknown; evidence_quote: unknown }[] }).commands;
    proposals = raw.map(p => ({ command: parseCampaignProposal({ expected_revision: 0, commands: [p.command] }).commands[0]!, evidence_quote: String(p.evidence_quote) }));
  } catch { if (!error) error = "structured_output_invalid"; }
  const grammarEvidence = deriveTurnEvidence(intent, item.narration, context);
  const grammar = authorizeCommands(intent.candidates, grammarEvidence, context, snapshot).map(d => d.authorized);
  const statement = context.facts[0]?.statement;
  const decide = (policy: QuotePolicy) => intent.candidates.map((candidate, i) => {
    const p = proposals.find(p => isDeepStrictEqual(p.command, candidate));
    if (!p) return { accepted: false, reason: "not_proposed", quote: null as string | null };
    const quoteProblem = verifyQuote(item.narration, p.evidence_quote, candidate, statement, policy);
    if (quoteProblem) return { accepted: false, reason: quoteProblem, quote: p.evidence_quote };
    // Firewall: same validity/refusal policy as production, with the verified quote standing in for grammar confirmation.
    const evidence = { ...grammarEvidence, narrator_confirmations: [{ kind: candidate.kind === "set_knowledge" ? "was_told_fact" as const : "accepted_transfer" as const, command_indexes: [i], collective: false, source_sentence: p.evidence_quote }] };
    const d = authorizeCommands([candidate], evidence, context, snapshot)[0]!;
    return { accepted: d.authorized, reason: d.reason, quote: p.evidence_quote };
  });
  const extra = proposals.filter(p => !intent.candidates.some(c => isDeepStrictEqual(c, p.command))).map(p => p.command);
  return { candidates: intent.candidates.length, proposals, error, latency_ms: latency, usage: usageOf(wire.captures[0]), grammar, strict: decide("strict"), quoted_tell: decide("quoted_tell"), extra_proposals_blocked: extra };
}
const outcome = (decisions: readonly boolean[]) => decisions.length && decisions.every(Boolean) ? "all" : decisions.some(Boolean) ? "partial" : "none";
const tellFile = process.argv.find(a => a.endsWith(".jsonl"));
if (process.argv.includes("--list")) { for (const i of [...await loadTraces(tellFile), ...ADVERSARIAL]) console.log(i.key, i.truth, i.case_id); process.exit(0); }
if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("OPENROUTER_API_KEY is not set");
const items = [...await loadTraces(tellFile), ...ADVERSARIAL];
console.log(`\n=== PAID ONLINE EVALUATION (OpenRouter) - SHADOW ONLY, NOTHING COMMITTED ===\n${items.length} OpenRouter shadow proposals (${DEFAULT_CONTROLLER_MODEL})\n`);
type Row = Item & Awaited<ReturnType<typeof shadowPropose>> & { grammar_outcome: string; strict_outcome: string; quoted_tell_outcome: string };
const rows: Row[] = [];
for (const item of items) {
  const r = await shadowPropose(item);
  const row = { ...item, ...r, grammar_outcome: outcome(r.grammar), strict_outcome: outcome(r.strict.map(d => d.accepted)), quoted_tell_outcome: outcome(r.quoted_tell.map(d => d.accepted)) };
  rows.push(row);
  console.log(JSON.stringify({ key: item.key, truth: item.truth, grammar: row.grammar_outcome, strict: row.strict_outcome, quoted_tell: row.quoted_tell_outcome, reasons: r.strict.map(d => d.reason), error: r.error }));
}
const score = (field: "grammar_outcome" | "strict_outcome" | "quoted_tell_outcome") => {
  const s = { tp_all: 0, partial_on_yes: 0, fn: 0, tn: 0, fp_any_on_no: 0, ambiguous_accepted: 0, ambiguous_rejected: 0 };
  for (const r of rows) {
    const o = r[field];
    if (r.truth === "yes") { if (o === "all") s.tp_all++; else if (o === "partial") s.partial_on_yes++; else s.fn++; }
    else if (r.truth === "no") { if (o === "none") s.tn++; else s.fp_any_on_no++; }
    else if (o === "none") s.ambiguous_rejected++; else s.ambiguous_accepted++;
  }
  return s;
};
const summary = { items: rows.length, by_truth: { yes: rows.filter(r => r.truth === "yes").length, no: rows.filter(r => r.truth === "no").length, ambiguous: rows.filter(r => r.truth === "ambiguous").length },
  grammar: score("grammar_outcome"), shadow_strict: score("strict_outcome"), shadow_quoted_tell: score("quoted_tell_outcome"),
  extra_proposals_blocked: rows.reduce((n, r) => n + r.extra_proposals_blocked.length, 0), shadow_errors: rows.filter(r => r.error).length,
  cost_usd: Math.round(rows.reduce((n, r) => n + (r.usage.provider_reported_cost_usd ?? 0), 0) * 1e6) / 1e6 };
const out = `docs/evaluations/phase-1n-shadow-evidence-${Date.now()}.json`;
await writeFile(out, JSON.stringify({ purpose: "Phase 1N shadow controller-evidence experiment. Nothing committed; production TurnEvidence authoritative. Truth labels are agent-authored.", instruction: SHADOW_INSTRUCTION, summary, rows }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output: out, summary }, null, 2));
