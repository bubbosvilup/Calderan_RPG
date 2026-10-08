import test from "node:test";
import assert from "node:assert/strict";
import { ANIME_QUALITY_TAGS, BENCHMARK_FRAMING, BENCHMARK_POSE, buildAnimeBenchmarkPrompt, buildAnimePortraitTags, flattenAnimePortraitTags } from "../src/campaign/anime-portrait-tags.js";
import { buildPortraitPrompt, portraitDetails } from "../src/campaign/portrait-prompt.js";
import type { ResolvedPermanentAppearance } from "../src/campaign/permanent-appearance.js";

/** Anime Portrait Model Benchmark V1: the conservative booru tag layer and the two benchmark dialects (not wired into production). */
const MIRA: ResolvedPermanentAppearance = {
  identity: { sex: "female", species: "Human", age: "adult, around thirty" },
  values: { height_cm: 178, weight_kg: 58, build: "lean", skin: "pale", eyes: "green", hair_color: "red", hair_texture: "wavy", hair_description: "long",
    scars: ["thin pale scar across the left cheek"], distinguishing_marks: ["freckles"], distinctive_traits: ["mole under the right eye"] },
  baseline: [{ source: "origin", text: "tall and gaunt" }],
  description: ["Tall and gaunt, with sharp cheekbones and a wary, watchful gaze."],
};
const appearance = (values: ResolvedPermanentAppearance["values"], identity: ResolvedPermanentAppearance["identity"] = {}): ResolvedPermanentAppearance => ({ values, identity, baseline: [], description: [] });

test("frozen Mira fixture: exact tags in the fixed group order", () => {
  const tags = buildAnimePortraitTags(MIRA);
  assert.deepEqual(tags.subject, ["1girl", "solo"]);
  assert.deepEqual(tags.appearance, ["tall female", "red hair", "long hair", "wavy hair", "green eyes", "pale skin", "scar", "freckles", "mole under eye"]);
  assert.deepEqual(flattenAnimePortraitTags(tags), ["anime illustration", "anime coloring", "1girl", "solo", "tall female", "red hair", "long hair", "wavy hair", "green eyes", "pale skin", "scar", "freckles",
    "mole under eye", "standing", "looking at viewer", "full body", "simple background", "grey background"]);
  assert.deepEqual(flattenAnimePortraitTags(tags), flattenAnimePortraitTags(buildAnimePortraitTags(MIRA)), "deterministic");
});

test("conservative: only whole closed-vocabulary values map; prose, weight, unknown builds and descriptions never become tags", () => {
  const t = buildAnimePortraitTags({ ...appearance({ hair_color: "copper with grey streaks", eyes: "grey-green, heavy-lidded", skin: "weathered", build: "gaunt", weight_kg: 140, height_cm: 177,
    hair_description: "shoulder-length, matted", scars: ["burn on the wrist", "slash across the face"], distinctive_traits: ["walks with a limp"] }, { sex: "female" }), description: ["red hair, green eyes, elf"] });
  assert.deepEqual(t.appearance, ["scar"], "a scar list yields the generic `scar` only; its prose is never parsed for location");
  const all = flattenAnimePortraitTags(t).join(", ");
  for (const banned of ["fat", "plump", "obese", "skinny", "thin", "gaunt", "copper", "grey eyes", "red hair", "elf", "limp", "scar on face"]) assert.ok(!all.includes(banned), banned);
});

test("subject, height thresholds, builds, species, features, skins and spelling", () => {
  assert.deepEqual(buildAnimePortraitTags(appearance({})).subject, ["1other", "solo"], "unknown sex never guesses");
  assert.deepEqual(buildAnimePortraitTags(appearance({ height_cm: 191, build: "Muscular" }, { sex: "male" })).appearance, ["tall male", "muscular male"]);
  assert.deepEqual(buildAnimePortraitTags(appearance({ height_cm: 189 }, { sex: "male" })).appearance, [], "below the deliberately high threshold");
  assert.deepEqual(buildAnimePortraitTags(appearance({ height_cm: 200 })).appearance, [], "no gendered height tag without an established sex");
  assert.deepEqual(buildAnimePortraitTags(appearance({ distinctive_traits: ["Pointed ears", "pointy ears"] }, { species: "Elf" })).appearance, ["elf", "pointy ears"], "Danbooru spelling, deduplicated");
  assert.deepEqual(buildAnimePortraitTags(appearance({ skin: "Dark brown", eyes: "Hazel eyes", hair_color: "Blond hair", hair_texture: "curly", hair_description: "very long" })).appearance,
    ["blonde hair", "very long hair", "curly hair", "brown eyes", "dark skin"]);
  for (const tag of flattenAnimePortraitTags(buildAnimePortraitTags(MIRA), { quality: true })) assert.equal(tag, tag.toLowerCase());
});

test("quality prefix only on request; never Pony score tags, deprecated or misleading booru tags", () => {
  const plain = flattenAnimePortraitTags(buildAnimePortraitTags(MIRA)), quality = flattenAnimePortraitTags(buildAnimePortraitTags(MIRA), { quality: true });
  assert.ok(!ANIME_QUALITY_TAGS.some(t => plain.includes(t)));
  assert.deepEqual(quality.slice(0, 3), ["masterpiece", "best quality", "very aesthetic"]);
  for (const banned of ["score_9", "score_8_up", "source_anime", "rating_safe", "newest", "absurdres", "lineart", "cel shading", "light background", "pointed ears"]) assert.ok(!quality.includes(banned), banned);
});

test("dialects: identical character details and frozen fixed lines; hybrid adds exactly the tag line; production v1 shares the details but no booru tags", () => {
  const natural = buildAnimeBenchmarkPrompt(MIRA, { dialect: "natural" }).split("\n"), hybrid = buildAnimeBenchmarkPrompt(MIRA, { dialect: "hybrid" }).split("\n");
  assert.deepEqual(hybrid.filter(l => !l.startsWith("Booru-style visual tags: ")), natural);
  assert.equal(hybrid.filter(l => l.startsWith("Booru-style visual tags: ")).length, 1);
  assert.ok(natural.includes(`Character details: ${portraitDetails(MIRA)}`));
  assert.match(natural[0]!, /^Anime fantasy character illustration/); assert.match(natural[0]!, /Not photorealistic/);
  assert.ok(natural.includes(BENCHMARK_POSE) && natural.includes(BENCHMARK_FRAMING), "benchmark dialects keep their frozen pre-v1 lines");
  // Image generation v1: production uses the anime Raena prompt (a deliberate change from the realistic V1 head), never booru tags.
  const production = buildPortraitPrompt({ appearance: MIRA, kind: "fullbody", trigger: "Anime illustration of" }).prompt;
  assert.match(production, /^Anime illustration of an adult fantasy RPG character/, "production head is the v1 anime head");
  assert.ok(production.includes(portraitDetails(MIRA)) && !/booru|1girl|masterpiece/i.test(production), "production prompt carries no booru tags");
});
