// Anime Portrait Model Benchmark V1: the recorded rubric scores (one reviewer, scored image by image) and the derived metrics.
// node scripts/anime-portrait-benchmark-scores.mjs  → prints the tables used in ANIME_PORTRAIT_MODEL_BENCHMARK_V1.md
// Dimensions 1–12 (0–5): style, physical, face, hair, details, anatomy, full_body, background, clothing, hallucination, quality, usefulness.
// Reference dimensions 13–17 (0–5): identity, hair_face, body, style_consistency, no_overpower (5 = the reference never overrides the text).
export const STAGE1 = {
  "krea/krea-2-medium": [[5, 4, 4, 5, 4, 4, 1, 5, 2, 5, 4, 2], [5, 4, 4, 5, 4, 4, 1, 5, 2, 5, 4, 2], [5, 4, 4, 5, 4, 4, 1, 5, 2, 5, 4, 2]],
  "krea/krea-2-medium-turbo": [[5, 4, 4, 5, 3, 4, 1, 5, 2, 5, 4, 2], [5, 4, 4, 5, 3, 4, 1, 5, 2, 5, 3, 2], [5, 4, 4, 5, 4, 4, 1, 5, 2, 5, 4, 2]],
  "bytedance-seed/seedream-5-0-flash": [[3, 4, 3, 4, 3, 4, 5, 5, 5, 4, 4, 3], [3, 4, 3, 4, 4, 4, 5, 5, 5, 4, 4, 3], [3, 4, 3, 4, 3, 4, 5, 4, 5, 4, 4, 3]],
  "google/gemini-3.1-flash-image": [[2, 3, 3, 3, 4, 4, 5, 5, 5, 4, 4, 3], [2, 3, 3, 4, 4, 4, 5, 5, 5, 4, 4, 3], [2, 3, 3, 3, 4, 4, 5, 5, 4, 4, 4, 3]],
};
export const CONTROLS = {
  "krea/krea-2-medium natural": [5, 4, 4, 5, 4, 4, 1, 5, 2, 5, 4, 2], "krea/krea-2-medium hybrid_quality": [5, 4, 4, 5, 4, 4, 1, 5, 2, 5, 4, 2],
  "bytedance-seed/seedream-5-0-flash natural": [3, 4, 3, 4, 3, 4, 5, 5, 3, 3, 4, 3], "bytedance-seed/seedream-5-0-flash hybrid_quality": [3, 4, 3, 4, 4, 4, 5, 5, 3, 4, 4, 3],
};
export const STAGE2 = {
  "krea/krea-2-medium": [[1, 2, 2, 5, 5], [1, 2, 2, 5, 5], [1, 2, 2, 5, 5]],
  "bytedance-seed/seedream-5-0-flash": [[5, 5, 5, 4, 2], [5, 5, 5, 4, 2], [5, 5, 5, 4, 2]],
};
export const PRICE = { "krea/krea-2-medium": 0.03, "krea/krea-2-medium-turbo": 0.015, "bytedance-seed/seedream-5-0-flash": 0.018, "google/gemini-3.1-flash-image": 0.067373 };
/** Brief weighting: style 15, physical 15, face 10, hair/details 10, anatomy 10, full body 8, background/clothing 7, hallucination 5,
 *  quality 10, reference 10. Stage 1 (no reference) renormalizes the other 90. */
export function weighted(s, reference) {
  const parts = [[s[0], 15], [s[1], 15], [s[2], 10], [(s[3] + s[4]) / 2, 10], [s[5], 10], [s[6], 8], [(s[7] + s[8]) / 2, 7], [s[9], 5], [s[10], 10], ...(reference === undefined ? [] : [[reference, 10]])];
  return parts.reduce((a, [v, w]) => a + v * w, 0) / parts.reduce((a, [, w]) => a + w, 0);
}
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length, sd = xs => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2)));
const r2 = x => Math.round(x * 100) / 100;
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("anime-portrait-benchmark-scores.mjs")) {
  console.log("model | mean | worst | sd | usefulness mean | $/image | batch of 3");
  for (const [model, rows] of Object.entries(STAGE1)) {
    const w = rows.map(r => weighted(r));
    console.log(`${model} | ${r2(mean(w))} | ${r2(Math.min(...w))} | ${r2(sd(w))} | ${r2(mean(rows.map(r => r[11])))} | ${PRICE[model]} | ${r2(PRICE[model] * 3 * 1000) / 1000}`);
  }
  console.log("\ncontrols (weighted, stage-1 formula):");
  for (const [k, r] of Object.entries(CONTROLS)) console.log(`${k} | ${r2(weighted(r))}`);
  console.log("\nfinalists with reference (stage-1 rubric + mean of reference dims 13–17 at 10%):");
  for (const [model, rows] of Object.entries(STAGE2)) {
    const ref = mean(rows.map(r => mean(r))), s1 = STAGE1[model];
    const full = s1.map(r => weighted(r, ref));
    console.log(`${model} | reference ${r2(ref)} | production ${r2(mean(full))} | worst ${r2(Math.min(...full))} | dims ${rows[0].join("/")}`);
  }
}
