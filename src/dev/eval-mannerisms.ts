import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { mannerismFixture, MANNERISM_CORPUS } from "./d10-mannerism-corpus.js";
import { OpenRouterMannerismExtractor } from "../llm/openrouter/mannerism-extractor.js";
import { DEFAULT_CONTROLLER_MODEL } from "../llm/openrouter/state-controller.js";
import { MANNERISM_EXTRACTOR_SYSTEM, MANNERISM_EXTRACTOR_TASK, MANNERISM_EXTRACTOR_PROMPT_VERSION, MANNERISM_EXTRACTION_SCHEMA, validateExtractedMannerisms, type MannerismExtractionRequest } from "../turn/mannerism-extraction.js";
import { freezeSnapshot } from "../campaign/validation.js";

/** Explicit paid developer command. Single frozen 25-case run; no retries or cherry-picked reruns. */
async function main() {
  const mode = process.argv[2];
  if (!["--live-25", "--calibrate-qwen", "--compare-luna"].includes(mode ?? "")) throw new Error("Use --calibrate-qwen after offline checks; --compare-luna only if calibrated Qwen recall is below 6/8. Seven calls per model.");
  const calibrated = mode !== "--live-25";
  if (mode === "--compare-luna") {
    const qwen = JSON.parse(await readFile("saves/d10-mannerisms/pass2b/qwen/summary.json", "utf8"));
    if (qwen.cases !== 25 || qwen.paid_calls !== 7 || qwen.accepted_valid >= 6) throw new Error("Luna comparison is not authorized: completed calibrated Qwen recall must be below 6/8.");
  }
  const model = mode === "--compare-luna" ? "openai/gpt-5.6-luna" : DEFAULT_CONTROLLER_MODEL;
  if (!process.env.OPENROUTER_API_KEY?.trim()) throw new Error("Missing OPENROUTER_API_KEY; no paid call made.");
  const directory = calibrated ? `saves/d10-mannerisms/pass2b/${mode === "--compare-luna" ? "luna" : "qwen"}` : "saves/d10-mannerisms/pass2";
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "paid-run.started"), new Date().toISOString(), { flag: "wx" });
  const extractor = new OpenRouterMannerismExtractor(undefined, { model });
  const batches = [];
  for (let i = 0; i < MANNERISM_CORPUS.length; i += 4) {
    const cases = MANNERISM_CORPUS.slice(i, i + 4), f = mannerismFixture();
    if (cases.some(c => c.category === "global_duplicate")) f.campaign.addMannerism({ expected_revision: f.campaign.revision, character_id: "brenna", definition: { canonical_key: "gaze_lower_before_lie", text: "Lowers their eyes before an obvious lie." } });
    const request: MannerismExtractionRequest = {
      turns: cases.map((c, n) => ({ sequence: n + 1, narration: c.narration, characters: [{ id: "brenna", name: "Brenna" }, { id: "maren", name: "Maren" }], items: [
        { id: "campaign_item_cloth_doll", name: "cloth doll", character_id: "maren", worn: false }, { id: "campaign_item_plain_shirt", name: "plain shirt", character_id: "brenna", worn: true },
      ] })),
      owned: f.campaign.exportSnapshot().premium_characters.flatMap(p => p.mannerisms!.map(m => ({ id: m.id, character_id: p.character_id, text: m.text }))), candidates: [],
    };
    batches.push({ f, cases, request: freezeSnapshot(request) as unknown as MannerismExtractionRequest });
  }
  if (calibrated) {
    const baseline = JSON.parse(await readFile("saves/d10-mannerisms/pass2/frozen-manifest.json", "utf8"));
    if (JSON.stringify(baseline.cases) !== JSON.stringify(MANNERISM_CORPUS) || JSON.stringify(baseline.requests) !== JSON.stringify(batches.map(b => b.request))) throw new Error("Frozen corpus/requests changed; no paid calls made.");
  }
  const prompt_sha256 = createHash("sha256").update(MANNERISM_EXTRACTOR_SYSTEM + "\n" + MANNERISM_EXTRACTOR_TASK).digest("hex");
  const schema_sha256 = createHash("sha256").update(JSON.stringify(MANNERISM_EXTRACTION_SCHEMA)).digest("hex");
  if (mode === "--compare-luna") {
    const prior = JSON.parse(await readFile("saves/d10-mannerisms/pass2b/qwen/frozen-manifest.json", "utf8"));
    if (prior.prompt_sha256 !== prompt_sha256 || prior.schema_sha256 !== schema_sha256) throw new Error("Prompt/schema cannot change for comparison.");
  }
  const manifest = { model, prompt_version: MANNERISM_EXTRACTOR_PROMPT_VERSION, system_prompt: MANNERISM_EXTRACTOR_SYSTEM, task_prompt: MANNERISM_EXTRACTOR_TASK, schema: MANNERISM_EXTRACTION_SCHEMA, prompt_sha256, schema_sha256, cases: MANNERISM_CORPUS, requests: batches.map(b => b.request), max_paid_calls: batches.length,
    corpus_sha256: createHash("sha256").update(JSON.stringify(MANNERISM_CORPUS)).digest("hex"),
    code_sha256: createHash("sha256").update((await Promise.all(["src/turn/mannerism-extraction.ts", "src/campaign/mannerism-learning.ts", "src/campaign/mannerism-concepts.ts"].map(p => readFile(p, "utf8")))).join("\n")).digest("hex") };
  await writeFile(join(directory, "frozen-manifest.json"), JSON.stringify(manifest, null, 2));
  const results: unknown[] = [], latencies: number[] = [];
  let rawProposals = 0, validatedProposals = 0, acceptedProposals = 0; const aliasFamilies: string[] = [];
  let calls = 0, cost = 0, costMissing = 0, falsePositives = 0, rawFalsePositives = 0, falseNegatives = 0, duplicates = 0, malformed = 0, acceptedValid = 0, aliasErrors = 0;
  for (const [index, b] of batches.entries()) {
    const start = performance.now(); calls++;
    let response: Awaited<ReturnType<typeof extractor.extract>> | undefined, error: string | undefined;
    try { response = await extractor.extract(b.request); } catch (e) { error = e instanceof Error ? e.message : "provider_failed"; }
    const latency = performance.now() - start; latencies.push(latency);
    if (response?.metadata.cost_usd === undefined) costMissing++; else cost += response.metadata.cost_usd;
    await writeFile(join(directory, `batch-${index + 1}.json`), JSON.stringify({ case_ids: b.cases.map(c => c.id), request: b.request, response, error, latency_ms: latency }, null, 2));
    let accepted = [] as ReturnType<typeof validateExtractedMannerisms>["observations"], raw: { turn_sequence: number }[] = [], metrics: unknown;
    try {
      if (!response) throw new Error(error);
      raw = JSON.parse(response.text).observations;
      const validated = validateExtractedMannerisms(response.text, b.request, b.f.campaign.exportSnapshot(), b.f.world); accepted = validated.observations; metrics = validated.metrics;
    } catch { malformed++; }
    rawProposals += raw.length; validatedProposals += accepted.length;
    for (const turn of b.request.turns) b.f.campaign.maintainMannerisms({ kind: "finalized", expected_revision: b.f.campaign.revision, source: {
      turn_id: `live_case_${index}_${turn.sequence}`, narration_hash: createHash("sha256").update(turn.narration).digest("hex"), narration_length: turn.narration.length,
      character_ids: turn.characters.map(c => c.id), available_items: turn.items.map(i => ({ character_id: i.character_id, item_id: i.id, worn: i.worn })),
    } });
    const domain = b.f.campaign.maintainMannerisms({ kind: "observations", expected_revision: b.f.campaign.revision, through_sequence: b.request.turns.length, observations: accepted });
    acceptedProposals += domain.metrics.candidates_created + domain.metrics.candidates_reinforced;
    for (const c of b.f.campaign.exportSnapshot().mannerism_learning!.candidates) if (c.evidence.length >= 2) aliasFamilies.push(`${c.character_id}:${c.action}:${c.trigger}`);
    for (const [n, c] of b.cases.entries()) {
      const observations = accepted.filter(o => o.sequence === n + 1), rawCount = raw.filter(o => o.turn_sequence === n + 1).length;
      if (c.expected) {
        const correct = observations.some(o => o.character_id === c.expected!.character_id && o.action === c.expected!.action && o.trigger === c.expected!.trigger && o.requires_item_id === c.expected!.requires_item_id);
        if (correct) acceptedValid++; else falseNegatives++;
        if (observations.some(o => o.action !== c.expected!.action || o.trigger !== c.expected!.trigger)) aliasErrors++;
      } else if (c.category === "global_duplicate") {
        if (b.f.campaign.exportSnapshot().mannerism_learning!.candidates.length || b.f.campaign.exportSnapshot().premium_characters.some(p => p.mannerisms?.some(m => m.source === "emergent"))) duplicates++;
      } else { falsePositives += observations.length; rawFalsePositives += rawCount; }
      results.push({ id: c.id, category: c.category, raw_observations: rawCount, accepted: observations });
    }
    await writeFile(join(directory, `domain-${index + 1}.json`), JSON.stringify({ metrics, domain_metrics: domain.metrics, candidates: b.f.campaign.exportSnapshot().mannerism_learning!.candidates }, null, 2));
    console.log(JSON.stringify({ batch: index + 1, calls, cases: b.cases.length, accepted: accepted.length, latency_ms: Math.round(latency) }));
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const summary = { model, prompt_version: MANNERISM_EXTRACTOR_PROMPT_VERSION, raw_proposals: rawProposals, validated_proposals: validatedProposals, accepted_proposals: acceptedProposals, alias_families: aliasFamilies, paid_calls: calls, cases: MANNERISM_CORPUS.length, valid_cases: 8, accepted_valid: acceptedValid,
    false_positives: falsePositives, raw_model_false_positives: rawFalsePositives, false_negatives: falseNegatives, semantic_duplicate_errors: duplicates, alias_errors: aliasErrors, malformed_batches: malformed,
    cost_usd: cost, cost_missing_calls: costMissing, latency_ms: { total: latencies.reduce((a, b) => a + b, 0), mean: latencies.reduce((a, b) => a + b, 0) / calls, median: sorted[Math.floor(sorted.length / 2)], max: Math.max(...latencies) },
    green: falsePositives === 0 && acceptedValid >= (calibrated ? 6 : 8) && duplicates === 0 && aliasErrors === 0 && malformed === 0 && (!calibrated || aliasFamilies.length > 0), results };
  await writeFile(join(directory, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ ...summary, results: undefined }, null, 2));
  if (!summary.green) process.exitCode = 1;
}
await main();
