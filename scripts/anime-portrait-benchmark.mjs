// Anime Portrait Model Benchmark V1 (ANIME_PORTRAIT_MODEL_BENCHMARK_V1.md). Paid OpenRouter Image API calls; run deliberately, stage by stage:
//   npm run build --silent
//   node scripts/anime-portrait-benchmark.mjs freeze            # writes fixture + prompts + spend estimate; NO calls
//   node scripts/anime-portrait-benchmark.mjs stage1            # 4 models x 3, hybrid prompt, no reference
//   node scripts/anime-portrait-benchmark.mjs controls          # Krea 2 Medium + Seedream: 1 natural + 1 hybrid-with-quality each
//   node scripts/anime-portrait-benchmark.mjs stage2 <modelA> <modelB> <reference-file>   # 3 each, same reference + hybrid prompt
// Outputs only under saves/portrait_benchmark_anime/ (gitignored). No campaign, Gallery, role or reference metadata is touched.
// No retries: a failed or unattractive candidate is recorded as is. A hard cumulative spend cap aborts before exceeding it.
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
const { OpenRouterImageClient } = await import("../.build/src/llm/openrouter/image-client.js");
const { buildAnimeBenchmarkPrompt, buildAnimePortraitTags, flattenAnimePortraitTags } = await import("../.build/src/campaign/anime-portrait-tags.js");

const OUT = "saves/portrait_benchmark_anime", LEDGER = join(OUT, "calls.jsonl"), HARD_CAP_USD = 1.0;
/** Live prices recorded before any call (research/ JSON): Seedream & Gemini from endpoint records; Krea from the catalog per-token rate
 *  (Krea endpoint pricing is unpublished; OpenRouter's own comparison post reports Krea 2 Medium billing $0.03). */
export const MODELS = [
  { id: "krea/krea-2-medium", price: 0.030, max_refs: 1 },
  { id: "krea/krea-2-medium-turbo", price: 0.015, max_refs: 1 },
  { id: "bytedance-seed/seedream-5-0-flash", price: 0.018, max_refs: 14 },
  { id: "google/gemini-3.1-flash-image", price: 0.067, max_refs: 14 },
];
/** Frozen Mira fixture (a ResolvedPermanentAppearance): identical for every model, dialect and stage. */
export const MIRA = Object.freeze({
  identity: { sex: "female", species: "Human", age: "adult, around thirty" },
  values: { height_cm: 178, weight_kg: 58, build: "lean", skin: "pale", eyes: "green", hair_color: "red", hair_texture: "wavy", hair_description: "long",
    scars: ["thin pale scar across the left cheek"], distinguishing_marks: ["freckles"], distinctive_traits: ["mole under the right eye"] },
  baseline: [{ source: "origin", text: "tall and gaunt" }],
  description: ["Tall and gaunt, with sharp cheekbones and a wary, watchful gaze."],
});
const prompts = {
  natural: buildAnimeBenchmarkPrompt(MIRA, { dialect: "natural" }),
  hybrid: buildAnimeBenchmarkPrompt(MIRA, { dialect: "hybrid" }),
  hybrid_quality: buildAnimeBenchmarkPrompt(MIRA, { dialect: "hybrid", quality: true }),
};
const slug = id => id.replace(/[^a-z0-9]+/gi, "_");
async function spent() { if (!existsSync(LEDGER)) return 0; return (await readFile(LEDGER, "utf8")).split("\n").filter(Boolean).map(l => JSON.parse(l)).reduce((a, c) => a + (c.cost_usd ?? c.estimated_usd ?? 0), 0); }
async function generate({ stage, model, label, prompt, reference }) {
  const meta = MODELS.find(m => m.id === model);
  const before = await spent();
  if (before + meta.price > HARD_CAP_USD) throw new Error(`hard cap: ${before.toFixed(3)} + ${meta.price} > ${HARD_CAP_USD}`);
  const client = new OpenRouterImageClient({ model, resolution: "1K", aspect_ratio: "2:3", n: 1 });
  const started = Date.now();
  const entry = { stage, model, label, prompt_dialect: prompt.dialect, at: new Date().toISOString(), reference: reference ? reference.name : null };
  try {
    const image = await client.generate({ prompt: prompt.text, ...(reference ? { references: [{ media_type: reference.media_type, bytes: reference.bytes }] } : {}) });
    const ext = image.media_type === "image/png" ? "png" : image.media_type === "image/jpeg" ? "jpg" : "webp";
    const file = join(OUT, stage, `${slug(model)}__${label}.${ext}`);
    await mkdir(join(OUT, stage), { recursive: true }); await writeFile(file, image.bytes);
    Object.assign(entry, { ok: true, file, media_type: image.media_type, bytes: image.bytes.length, latency_ms: image.latency_ms, wall_ms: Date.now() - started,
      ...(image.cost_usd !== undefined ? { cost_usd: image.cost_usd } : { estimated_usd: meta.price, cost_unreported: true }) });
  } catch (error) {
    Object.assign(entry, { ok: false, code: error?.code ?? "error", status: error?.status ?? null, wall_ms: Date.now() - started });
  }
  await appendFile(LEDGER, JSON.stringify(entry) + "\n");
  console.log(`${entry.ok ? "OK  " : "FAIL"} ${stage} ${model} ${label} ${entry.ok ? `${entry.latency_ms}ms $${entry.cost_usd ?? `~${entry.estimated_usd}`}` : `${entry.code} ${entry.status ?? ""}`}`);
  return entry;
}
const batch = (stage, model, prompt, reference, prefix = "c") => Promise.all([1, 2, 3].map(k => generate({ stage, model, label: `${prefix}${k}`, prompt, reference })));

const [command, ...args] = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
if (command === "freeze") {
  const stage1 = MODELS.reduce((a, m) => a + 3 * m.price, 0);
  const controls = 2 * 0.030 + 2 * 0.018;
  const stage2Max = [...MODELS].sort((a, b) => b.price - a.price).slice(0, 2).reduce((a, m) => a + 3 * m.price, 0);
  const frozen = { frozen_at: new Date().toISOString(), fixture: MIRA, tags: buildAnimePortraitTags(MIRA), flat_tags: flattenAnimePortraitTags(buildAnimePortraitTags(MIRA)),
    flat_tags_quality: flattenAnimePortraitTags(buildAnimePortraitTags(MIRA), { quality: true }), prompts, models: MODELS, config: { resolution: "1K", aspect_ratio: "2:3", n: 1 },
    expected_spend_usd: { stage1, controls, stage2_max: stage2Max, max_total: stage1 + controls + stage2Max, hard_cap: HARD_CAP_USD, max_images: 12 + 4 + 6 } };
  await writeFile(join(OUT, "frozen.json"), JSON.stringify(frozen, null, 2));
  console.log(JSON.stringify(frozen.expected_spend_usd, null, 2)); console.log(prompts.hybrid);
} else if (command === "stage1") {
  for (const settled of await Promise.allSettled(MODELS.map(m => batch("stage1", m.id, { dialect: "hybrid", text: prompts.hybrid })))) if (settled.status === "rejected") console.error(settled.reason.message);
} else if (command === "controls") {
  for (const model of ["krea/krea-2-medium", "bytedance-seed/seedream-5-0-flash"]) await Promise.all([
    generate({ stage: "controls", model, label: "natural", prompt: { dialect: "natural", text: prompts.natural } }),
    generate({ stage: "controls", model, label: "hybrid_quality", prompt: { dialect: "hybrid_quality", text: prompts.hybrid_quality } })]);
} else if (command === "stage2") {
  const [a, b, refFile] = args;
  const bytes = await readFile(refFile), media_type = refFile.endsWith(".png") ? "image/png" : refFile.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const reference = { name: refFile, bytes, media_type };
  await Promise.all([a, b].map(model => batch("stage2", model, { dialect: "hybrid", text: prompts.hybrid }, reference, "r")));
} else console.error("usage: freeze | stage1 | controls | stage2 <modelA> <modelB> <reference>");
console.log(`cumulative spend: $${(await spent()).toFixed(4)}`);
