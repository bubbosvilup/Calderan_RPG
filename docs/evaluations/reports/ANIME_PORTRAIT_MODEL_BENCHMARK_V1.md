# Anime Portrait Model + Danbooru Prompt Benchmark V1

**Date:** 2026-10-07. **Follows:** Portrait Prompt Builder V1 (`94e20c0`), Portrait Image Generation V1 (`14be24c`), Portrait Gallery and Roles V2 (`c9684d5`).

Caldrevan portraits get **one visual direction: grounded, mature anime / anime-fantasy illustration.**

This pass benchmarked four live OpenRouter image models against one frozen Mira fixture. It also designed and tested a conservative Danbooru/booru-style tag layer and a hybrid prompt format.

**The production model and the production prompt were not changed;** the recommendation in section 24 is for a separate follow-up commit after review.

**Paid calls:** 22 image outputs, **$0.6311**, all costs provider-reported.

> **Scoring caveat:** all rubric scores come from one reviewer, the implementing agent, who scored image by image. The blinded sheets (section 14) exist so a human can re-score without seeing model names.

---

## 1. Research sources

Research came before any paid call. The catalog and capability lookups are free GETs, and the raw JSON is kept in `saves/portrait_benchmark_anime/research/`.

| Source | What it gave |
| --- | --- |
| `GET /api/v1/images/models` (live, 59 models) | Slugs, descriptions, supported parameters |
| `GET /api/v1/images/models/<slug>/endpoints` per candidate | Resolution, aspect ratios, `n`, `input_references`, pricing, passthrough parameters |
| `GET /api/v1/models?output_modalities=image` | Per-token image pricing, including Krea, whose endpoint pricing is unpublished |
| [OpenRouter Krea 2 Medium page](https://openrouter.ai/krea/krea-2-medium) | "particular strengths in illustration, anime, painting, and other expressive artistic styles"; "From $0.03/image" |
| [OpenRouter image-model comparison post](https://openrouter.ai/blog/insights/image-generation-models-compared/) | Krea 2 Medium "billed us $0.03", pricing "not published" |
| [OpenRouter image benchmarks](https://openrouter.ai/benchmarks/media/images) | Categories; **there is no "Anime & Manga" category** (see below) |
| [Krea 2 developer docs](https://www.krea.ai/docs/developers/krea-2/overview) | Medium is "strongest on: illustration, anime, painting…"; Large is "rawer, more textured"; no negative prompt; no tag guidance |
| [Google Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) | Gemini 3.1 Flash Image costs 1120 output tokens per 1K image at $60/M tokens, so **$0.067/image** |
| [Animagine XL 3.1](https://huggingface.co/cagliostrolab/animagine-xl-3.1) and [4.0](https://huggingface.co/cagliostrolab/animagine-xl-4.0) model cards | Origin of `very aesthetic`, `masterpiece`, `best quality`, `newest`, `safe`, `high score` |
| [Pony Diffusion V6 XL](https://civitai.com/models/257749/pony-diffusion-v6-xl) | `score_9…score_4_up`, `source_anime`, `rating_safe`, described as calibrated to that checkpoint |
| NoobAI-XL model cards ([Hugging Face](https://huggingface.co/Laxhar/noobai-XL-Vpred-0.5)) | Prefix "masterpiece, best quality, newest, absurdres, highres, safe" |
| Live Danbooru tag index (`/tags.json`, 31 tags checked; `research/danbooru-tags.txt`) | Tag existence, post counts, deprecation |

**On the "Anime & Manga" benchmark.** The live OpenRouter benchmark page lists Evaluations, Styles (Portraits), Improbable Scenes, Count, Text, Spatial Relations, Negation, Editing and Consistency. There is no Anime & Manga category to consult, so no external anime ranking was available. This is one reason no fifth model was added (section 6).

## 2. Why Danbooru/booru tags

Booru tags are a compact, widely trained visual vocabulary for anime characters: subject count, hair, eyes, marks and composition.

Even general models that prefer natural language have seen them extensively. As a supporting semantic block they restate established facts tersely, they are deterministic, and they cost nothing.

The hybrid format keeps the existing semantic prompt and adds one tag line. It never replaces the prompt with a tag wall.

## 3. Which tags are truly generic

These are plain Danbooru general tags (category 0), checked live with post counts. They are not tied to any checkpoint.

| Group | Tags kept (post count) |
| --- | --- |
| Subject | `1girl` / `1boy` / `1other` (131k), `solo` |
| Composition | `full body` (1.30M), `standing` (1.35M), `looking at viewer` (4.98M), `simple background` (2.93M), `grey background` (388k) |
| Hair | `long hair`, `medium hair`, `short hair`, `very long hair`, `wavy hair` (151k), colour tags |
| Eyes and skin | `<colour> eyes`, `pale skin` (75k), `dark skin` (413k) |
| Features | `scar` (174k), `scar on face` (110k), `freckles` (65k), `mole` (408k), `mole under eye`, **`pointy ears`** (611k) |
| Body | `tall female` (6.4k) / `tall male`, `muscular female` (39k) / `muscular male` |
| Colouring | **`anime coloring`** (59.8k) |

**Corrections the live index forced:**

| Assumed tag | Reality | Used instead |
| --- | --- | --- |
| `cel_shading` | **deprecated**, 0 posts | `anime coloring` |
| `lineart` | means *uncoloured line art* | not used as a tag; "clean lineart" stays in the prose intent |
| `light background` | not a tag | `grey background` |
| `three-quarter view` | not a tag | — |
| `pointed ears` | not the tag | `pointy ears` |
| `tall` | deprecated | gendered `tall female` / `tall male` |
| `slender`, `thin`, `gaunt` | not tags | none; `skinny` exists but is loaded and is deliberately unused |

## 4. Which quality tags are model-family-specific

| Tag(s) | Family | Status here |
| --- | --- | --- |
| `score_9`, `score_8_up`, `score_7_up`, `source_anime`, `rating_safe` | Pony Diffusion V6 only, described as calibrated to its training | **Not used** |
| `masterpiece`, `best quality` | Animagine and NoobAI/Illustrious-family quality buckets | **Tested**: no benefit (section 12) |
| `very aesthetic` | Animagine 3.1 aesthetic-score bucket | **Tested**: no benefit |
| `newest`, `year 2026` | Animagine and NoobAI period tags; `newest` covers 2021–2024 in Animagine 3.1 | **Not used** |
| `absurdres`, `highres` | Danbooru resolution metadata, used as SDXL-checkpoint prompts | **Not used** |
| `safe` / `rating_*` | Animagine and Pony rating vocabularies, which differ | **Not used** |

None of the tested OpenRouter models is a booru-trained SDXL checkpoint. Their providers publish no tag guidance: Krea's docs say nothing about tags or negative prompts, and Seedream and Gemini are general instruction models.

## 5. Final hybrid prompt format tested

**Dialects** (`buildAnimeBenchmarkPrompt`). Both describe the character with the **same production details text** and keep the same fixed clothing, pose, framing and constraint lines verbatim:

- **A — natural:** fixed anime intent → `Character details:` → clothing → pose → framing → constraints.
- **B — hybrid:** the same, plus one line, `Booru-style visual tags: …`, inserted after the intent.
- **B + quality:** the tag line is prefixed with `masterpiece, best quality, very aesthetic`.

**Tag group order:** style → subject → species → body → hair → face, eyes and skin → scars and features → pose → composition.

## 6. Model candidates

| Model | Why |
| --- | --- |
| `krea/krea-2-medium` | Strongest hypothesis: officially "strongest on illustration, anime" |
| `krea/krea-2-medium-turbo` | Same family; the cheap and fast iteration candidate |
| `bytedance-seed/seedream-5-0-flash` | Current production control; references proven in V1 |
| `google/gemini-3.1-flash-image` | Strong general and editing model, 14 references; the consistency challenger |

**No fifth model was added.**

- **Krea 2 Large:** officially the photoreal and "rawer, more textured" tier, at 2× the price.
- **FLUX.3, Qwen Image 3, Recraft V4.1:** no anime-specific evidence was found, and the Anime & Manga benchmark the brief expected does not exist.

Adding a model without evidence would only have increased spend.

## 7. Live capability table

| Model (exact live slug) | Resolution | 2:3 | `n` | References | Notes |
| --- | --- | --- | --- | --- | --- |
| `krea/krea-2-medium` | 1K only | yes | **not advertised** | 0–1 | Passthrough: `styles`, `image_style_references`, `creativity`, `intensity`, … |
| `krea/krea-2-medium-turbo` | 1K only | yes | **not advertised** | 0–1 | Same passthroughs |
| `bytedance-seed/seedream-5-0-flash` | 1K, 2K | yes | 1–1 | 0–14 | `seed` |
| `google/gemini-3.1-flash-image` | 512, 1K, 2K, 4K | yes | 1–1 | 0–14 | Two providers (AI Studio, Vertex) |

**Output sizes at 1K, 2:3:**

| Model | Size | Format |
| --- | --- | --- |
| Krea 2 Medium and Turbo | 832×1248 | PNG |
| Seedream 5 Flash | 786×1176 | JPEG |
| Gemini 3.1 Flash Image | 848×1264 | PNG |

None of these endpoints advertises a negative-prompt parameter. Per the brief, none was invented.

## 8. Live pricing table

| Model | Price per image (1K) | Source |
| --- | --- | --- |
| Krea 2 Medium | $0.030 | Catalog per-token rate × Seedream-calibrated tokens per image; matches the model page and the comparison post; **billed $0.03** |
| Krea 2 Medium Turbo | $0.015 | Catalog rate; **billed $0.015** |
| Seedream 5.0 Flash | $0.018 (input images $0) | Endpoint record; **billed $0.018** |
| Gemini 3.1 Flash Image | $0.067 (1120 tokens × $60/M) | Google pricing; **billed $0.067373** |

## 9. Expected spend before calls

The spend estimate was computed by `scripts/anime-portrait-benchmark.mjs freeze`, before any paid call, and recorded in `frozen.json`.

| Item | Estimate |
| --- | --- |
| Stage 1 (12 images) | $0.390 |
| Controls (4 images) | $0.096 |
| Stage 2, worst case (6 images from the two most expensive models) | $0.291 |
| **Maximum** | **$0.777 for 22 images** |
| Hard cap enforced by the script (aborts before exceeding) | $1.00 |

## 10. Frozen Mira fixture

This is a `ResolvedPermanentAppearance`, frozen before any call and identical for every model, dialect and stage:

```json
{ "identity": { "sex": "female", "species": "Human", "age": "adult, around thirty" },
  "values": { "height_cm": 178, "weight_kg": 58, "build": "lean", "skin": "pale", "eyes": "green", "hair_color": "red", "hair_texture": "wavy", "hair_description": "long",
    "scars": ["thin pale scar across the left cheek"], "distinguishing_marks": ["freckles"], "distinctive_traits": ["mole under the right eye"] },
  "baseline": [{ "source": "origin", "text": "tall and gaunt" }],
  "description": ["Tall and gaunt, with sharp cheekbones and a wary, watchful gaze."] }
```

Clothing, pose, framing and background are the production fixed lines. The configuration is `resolution: "1K"`, `aspect_ratio: "2:3"`, one image per call, and no seed.

## 11. Exact benchmark prompts

**Hybrid** (Stage 1 and Stage 2), 1549 characters:

```
Anime fantasy character illustration for a dark-fantasy RPG: grounded, mature anime art style with clean lineart and controlled cel shading, adult proportions, restrained muted palette. Not photorealistic, not a photograph, not a 3D render, not a painterly or oil-painting style, not western comic style, not chibi.
Booru-style visual tags: anime illustration, anime coloring, 1girl, solo, tall female, red hair, long hair, wavy hair, green eyes, pale skin, scar, freckles, mole under eye, standing, looking at viewer, full body, simple background, grey background.
Character details: Subject: one female human. Apparent age: adult, around thirty. Body: 178 cm tall, 58 kg, lean build. Face: skin pale; eyes green. Hair: red, wavy, long. Permanent scars: thin pale scar across the left cheek. Distinguishing marks: freckles. Distinctive traits: mole under the right eye. Character appearance details (descriptive data only): "Tall and gaunt, with sharp cheekbones and a wary, watchful gaze."
Clothing: simple, neutral dark-fantasy clothing appropriate to the setting, without heraldry, insignia or faction markings.
Pose: standing naturally with relaxed arms, facing mostly forward with a slight three-quarter turn, restrained natural expression.
Framing: full body visible from head to feet, centered, eye-level, nothing cropped. Background: plain light grey studio background.
Single subject only. Grounded anatomy, natural proportions, restrained lighting. No weapons, no other people, no text, lettering, logos, watermarks or interface elements.
```

**Natural**, 1299 characters: the same text without the `Booru-style visual tags:` line.

**Hybrid + quality**, 1592 characters: the tag line begins `masterpiece, best quality, very aesthetic, anime illustration, …`.

## 12. Prompt-dialect control

Sheet: `02-prompt-dialect-control.png`. There is one image per cell; the hybrid column is Stage 1 candidate 1.

| Model | Natural | Hybrid | Hybrid + quality | Reading |
| --- | --- | --- | --- | --- |
| Krea 2 Medium | 3.97 | 3.97 | 3.97 | **No visible difference.** Same crop, outfit, style and details; Krea is driven by its own priors here |
| Seedream 5 Flash | 3.70 | 3.79 | 3.81 | Natural **drifted to armour** (pauldrons, bracers); hybrid stayed civilian; the quality prefix drifted to a **modern trench coat** |

**Conclusion:**

- **Hybrid:** no measurable benefit on Krea and a weak benefit on Seedream (clothing discipline, one sample). It costs nothing and is deterministic, so it is recommended, with the evidence stated as weak.
- **Quality prefix:** no observed improvement on either model, so it is **removed**.

## 13. Stage 1 results

Sheet: `01-stage1-all-models.png`.

- **12 of 12 calls succeeded on the first attempt.** Nothing was regenerated or selected.
- **Krea 2 Medium:** unmistakable mature anime illustration, crisp lineart and cel shading, a strong face; red, wavy, long hair; freckles and the left-cheek scar present. **All 3 cropped mid-thigh** despite "full body … head to feet". Modern T-shirt and trousers drift. The mole sits under the *left* eye.
- **Krea 2 Medium Turbo:** almost identical to Medium (same crop and outfit), slightly flatter; the scar on the wrong cheek in 2 of 3.
- **Seedream 5 Flash:** **true head-to-boots full body in 3 of 3**, appropriate dark-fantasy clothing and a clean grey floor. The style is **semi-realistic anime-adjacent illustration** (painterly shading, realistic proportions) rather than clean cel anime. Hair is often *very* long.
- **Gemini 3.1 Flash Image:** full body in 3 of 3, appropriate clothing, flat clean colouring. The style reads as a **western graphic novel or comic**, which the contract excludes. The hair is auburn and the gaunt build is underplayed. It is the most expensive at $0.067.

## 14. Blind contact sheet mapping

Sheets: `01b-stage1-blind.png` (A–D) and `03b-reference-finalists-blind.png` (X/Y). The mapping was assigned by a CSPRNG shuffle and is stored separately in `docs/portrait-benchmark-anime/blind-mapping.json`.

| Blind label | Model |
| --- | --- |
| A | `krea/krea-2-medium` |
| B | `google/gemini-3.1-flash-image` |
| C | `bytedance-seed/seedream-5-0-flash` |
| D | `krea/krea-2-medium-turbo` |
| X (Stage 2) | `bytedance-seed/seedream-5-0-flash` |
| Y (Stage 2) | `krea/krea-2-medium` |

## 15. Stage 1 rubric scores

Each image was scored 0–5 per dimension. The full per-image vectors are in `scripts/anime-portrait-benchmark-scores.mjs`.

| Dimension | Krea 2 Medium | Krea Turbo | Seedream 5 Flash | Gemini 3.1 Flash |
| --- | --- | --- | --- | --- |
| 1 Anime style fidelity | **5** | **5** | 3 | 2 |
| 2 Physical fidelity | 4 | 4 | 4 | 3 |
| 3 Face | 4 | 4 | 3 | 3 |
| 4 Hair | **5** | **5** | 4 | 3.3 |
| 5 Permanent details | 4 | 3.3 | 3.3 | 4 |
| 6 Anatomy | 4 | 4 | 4 | 4 |
| 7 Full-body compliance | **1** | **1** | **5** | **5** |
| 8 Background | 5 | 5 | 4.7 | 5 |
| 9 Clothing | 2 | 2 | 5 | 4.7 |
| 10 Hallucination | 5 | 5 | 4 | 4 |
| 11 Visual quality | 4 | 3.7 | 4 | 4 |
| 12 Usefulness as a Caldrevan NPC portrait | 2 | 2 | 3 | 3 |

Values are means over 3 images.

## 16. Stage 1 ranking

The weighting is the brief's; the 10% reference weight is redistributed proportionally over the other 90%.

| Rank | Model | Mean | Worst | SD | Usefulness |
| --- | --- | --- | --- | --- | --- |
| 1 | Krea 2 Medium | **3.97** | 3.97 | 0.00 | 2 |
| 2 | Krea 2 Medium Turbo | 3.90 | 3.81 | 0.07 | 2 |
| 3 | Seedream 5.0 Flash | 3.84 | 3.79 | 0.04 | **3** |
| 4 | Gemini 3.1 Flash Image | 3.51 | 3.46 | 0.04 | 3 |

**Stage 1 winner on the weighted rubric:** Krea 2 Medium.

## 17. Stage 2 finalists

**Finalists: Krea 2 Medium and Seedream 5.0 Flash.**

Turbo (3.90) and Seedream (3.84) are within scoring noise. A tie-break rule was stated before Stage 2: rank by usefulness (Seedream 3 vs Turbo 2, driven by full-body compliance), and do not spend both finalist slots on one model family. Turbo is a distilled Medium with near-identical outputs, so it would add no information.

**Reference:** Gemini Stage 1 candidate 2. A **non-finalist** image was chosen so that neither finalist sees its own style. It is full body, with the scar and freckles visible. Its slightly different hue (auburn) and rendering also test whether the reference overpowers the text (rubric item 17).

## 18. Reference-image results

Sheet: `03-reference-finalists.png`. 6 of 6 calls succeeded.

**Krea 2 Medium (1 reference supported):**

- The outputs are **almost indistinguishable from its text-only Stage 1**: same T-shirt, same thigh crop, hair red rather than the reference's auburn.
- It **barely uses the reference** as a character reference.
- Its `image_style_references` passthrough exists, but it is a different, style-transfer feature that this pass did not test.

**Seedream 5 Flash (up to 14 references):**

- The outputs **reproduce the reference almost exactly**: outfit, belt and pouch, pose, face, hair. Identity preservation is excellent.
- The reference **overrides the text**: hair went from red to auburn, and the rendering adopted the reference's comic style.
- In production, the reference is the player's chosen image, so this strength becomes "Seedream follows the attached reference faithfully, including its style".

## 19. Reference rubric scores

| Dimension (0–5) | Krea 2 Medium | Seedream 5 Flash |
| --- | --- | --- |
| 13 Identity preservation from the reference | 1 | **5** |
| 14 Hair and face consistency | 2 | **5** |
| 15 Body and build consistency | 2 | **5** |
| 16 Style consistency | **5** | 4 |
| 17 Reference does *not* override the text (5 = never) | **5** | 2 |
| **Reference score (mean)** | 3.0 | **4.2** |
| **Production score** (Stage 1 rubric + reference at 10%) | **3.88** | **3.88** (worst 3.84) |

## 20. Cost / latency

Latency is the client-measured provider latency (`latency_ms`), as a mean.

| Model | $/image | Batch of 3 | Latency, text-only | Latency, with reference | Billed in this benchmark |
| --- | --- | --- | --- | --- | --- |
| Krea 2 Medium | $0.030 | $0.090 | 10.0 s (10.5 s for the controls) | 18.8 s | $0.2400 (8 images) |
| Krea 2 Medium Turbo | $0.015 | $0.045 | 6.6 s | — | $0.0450 (3) |
| Seedream 5.0 Flash | $0.018 | **$0.054** | 14.1 s (14.5 s for the controls) | 16.3 s | $0.1440 (8) |
| Gemini 3.1 Flash Image | $0.0674 | $0.202 | 10.1 s | — | $0.2021 (3) |

Production runs a batch's 3 calls concurrently, so a batch takes about one call's latency.

## 21. Consistency / variance

Every model was very consistent within its own batch (weighted SD ≤ 0.07).

- **Krea's SD is 0:** it is extremely repeatable. That includes repeating its crop and its modern-outfit failure; the 3 candidates are near-duplicates, which reduces the value of a "choose from 3 options" batch.
- **Seedream** varies the outfit while keeping the character, which is more useful for a Gallery.
- **Gemini** varies little.

## 22. Raw-quality winner

**Krea 2 Medium** has the best anime style fidelity (5/5 every time), the best faces and hair, and the highest Stage 1 weighted score (3.97). Its look is exactly the intended mature anime illustration, but its outputs are not usable as Full Body references as they stand (section 23).

## 23. Production-value winner

**Seedream 5.0 Flash.** It ties Krea 2 Medium on the weighted production score (3.88 vs 3.88), and it wins on the two production gates the brief asks to weight beyond aesthetics:

1. **Consistently usable candidates.** All 6 text-only and reference images are true full-body references. Krea produced **0 of 11** full-body images (8 Medium, 3 Turbo), which makes it unusable for the Full Body role that V2 introduced.
2. **Reference support.** Seedream has strong identity preservation and up to 14 references. Krea effectively ignores its single reference, which the brief says to "penalize materially".

Seedream is also the cheapest full-body batch, $0.054 for 3. Its weakness is anime fidelity, 3/5: it is semi-realistic, anime-adjacent illustration.

## 24. Recommended default model

**Keep `bytedance-seed/seedream-5-0-flash` and move it to the anime prompt.**

- The model slug, the configuration and `CALDREVAN_PORTRAIT_MODEL` stay unchanged; there is no model switch.
- The recommended change is to the **prompt only**: replace the production head "realistic dark-fantasy setting…" with the anime intent and the hybrid tag line. That is a separate, tiny follow-up commit after review.
- The anime intent already moved Seedream from the V1 realistic look to anime-adjacent illustration.

**Runner-up: Krea 2 Medium, conditional.** It is the right look, but needs a fix for:

- framing: it crops mid-thigh at 2:3 even with explicit "head to feet";
- reference behaviour: it ignores the character reference.

A ≈$0.09 follow-up (9:16 aspect ratio and full-body emphasis, 3 images) could promote it. If it then frames correctly, a hybrid pipeline becomes attractive: Krea for the first anime look, then Seedream with that image as the reference.

## 25. Recommended prompt dialect

**Hybrid** (anime intent + booru tag line + unchanged character details + fixed composition and constraints). The evidence is weak but non-negative, and the tag line is deterministic and free.

## 26. Recommended fixed tag block

```
anime illustration, anime coloring, <1girl|1boy|1other>, solo, …appearance tags…, standing, looking at viewer, full body, simple background, grey background
```

There is no quality prefix. Do not use `lineart` or `cel shading` as tags; they stay in the prose intent ("clean lineart and controlled cel shading").

## 27. Recommended conditional appearance tags

`buildAnimePortraitTags`, in `src/campaign/anime-portrait-tags.ts`, maps a field only when the **whole normalized value**, or a whole list item, is in a closed vocabulary.

**Rules:**

- **Subject:** female → `1girl`, male → `1boy`, otherwise `1other`; always `solo`.
- **Species:** `elf` → `elf, pointy ears`; `half-elf` → `pointy ears`.
- **Body:**
  - `tall female` from 178 cm, `tall male` from 190 cm (deliberately high);
  - `muscular` → `muscular female` / `muscular male`;
  - lean, slim, gaunt and similar builds produce **no tag**;
  - **weight never maps to a tag.**
- **Hair:**
  - colour: black, brown, blonde, red/auburn, orange, grey/silver, white and others → `<colour> hair`;
  - texture: straight, wavy, curly → `<texture> hair`;
  - length from an exact `hair_description` value: very short, short, medium or shoulder-length, long, very long, bald.
- **Eyes and skin:** eye colours → `<colour> eyes`; pale or fair → `pale skin`; dark → `dark skin`; tan → `tan`.
- **Scars and features:**
  - any scar → `scar` only (scar prose is never parsed for location);
  - exact feature items: freckles, mole, mole under eye (left or right), pointed or pointy ears → `pointy ears`, heterochromia, eyepatch, facial scar → `scar on face`.

**Output:** lower-case, deduplicated, in fixed group order. Unknown values are omitted, never guessed.

## 28. Tags rejected after the benchmark

| Tag | Reason |
| --- | --- |
| `masterpiece`, `best quality`, `very aesthetic` | No observed benefit; the Seedream sample drifted to modern clothing |
| `score_*`, `source_anime`, `rating_safe` | Pony-only; not tested |
| `newest`, `year 2026`, `absurdres`, `highres`, `safe` | Checkpoint-specific; not tested |
| `cel shading` | Deprecated on Danbooru |
| `lineart` | Means uncoloured line art |
| `light background` | Not a tag |
| `three-quarter view` | Not a tag |
| `white background` | Not used; `grey background` with the production grey studio line already gives a clean, light, non-white reference background |

## 29. Paid calls

**22 image outputs:**

- **Stage 1:** 12 (4 models × 3);
- **Controls:** 4 (Krea and Seedream: natural plus hybrid with quality);
- **Stage 2:** 6 (2 finalists × 3).

All 22 succeeded on the first attempt, with no retries or regenerations. Capability, catalog and pricing lookups were free GETs.

## 30. Total benchmark cost

**$0.6311** of a pre-computed maximum of $0.777. Every call reported its cost; nothing was estimated.

| Stage | Cost |
| --- | --- |
| Stage 1 | $0.3911 |
| Controls | $0.0960 |
| Stage 2 | $0.1440 |

## 31. Output image and contact-sheet paths

**Raw outputs (gitignored):**

- `saves/portrait_benchmark_anime/stage1/`, `controls/` and `stage2/`;
- `calls.jsonl`, the per-call ledger: model, label, latency, cost, file;
- `frozen.json`: the fixture, tags, prompts and spend estimate;
- `research/`: the catalog, endpoint and Danbooru-tag snapshots.

**Contact sheets** (committed copies in `docs/portrait-benchmark-anime/`; originals in `saves/portrait_benchmark_anime/sheets/`):

- `01-stage1-all-models.png`
- `01b-stage1-blind.png`
- `02-prompt-dialect-control.png`
- `03-reference-finalists.png`
- `03b-reference-finalists-blind.png`
- `blind-mapping.json`

**Scripts:**

| Script | Purpose |
| --- | --- |
| `scripts/anime-portrait-benchmark.mjs` | `freeze`, `stage1`, `controls` and `stage2`; hard $1 cap; no retries |
| `scripts/anime-portrait-benchmark-scores.mjs` | Recorded scores and derived metrics |
| `scripts/anime-portrait-benchmark-sheets.mjs` | Contact sheets via headless Edge; images only proportionally fitted |

## 32. Production changes made

The **production model, configuration and portrait prompt are unchanged.** Three code changes were made:

1. **`src/llm/openrouter/image-client.ts`:** `n` is now sent **only when an accepting endpoint advertises it**. V1's own contract says an absent key means the parameter is unsupported, and the Krea 2 endpoints do not advertise `n`. Seedream advertises `n`, so its requests are byte-identical. A test is added.
2. **`src/campaign/portrait-prompt.ts`:** the details section and the fixed clothing, pose, framing and constraint lines are exported (`portraitDetails`, `PORTRAIT_*`) so the anime dialects reuse them verbatim. Production output is byte-identical; the existing golden and prompt tests pass unchanged.
3. **New `src/campaign/anime-portrait-tags.ts`:** the tag builder and the benchmark dialect builder. It is **not wired** into generation.

**Tests:**

- new `tests/anime-portrait-tags.test.ts` (5 tests): exact fixture tags, conservative mapping, thresholds and spelling, the quality and score exclusions, and dialect parity with an unchanged production prompt;
- one new client test in `tests/portrait-image.test.ts`.

**Results:**

| Run | Result |
| --- | --- |
| Focused: tags, image client, prompt and Gallery | 34 passed, 0 failed |
| Full suite | **2583 tests: 2580 passed, 0 failed, 3 TODO**, the pre-existing known-limitation tests |
| Typecheck | PASS |
| Build | PASS |

## 33. Deferred follow-up

1. **Switch the production prompt to the hybrid anime dialect on Seedream.** A tiny commit: change the head line, add the tag line, bump `PORTRAIT_PROMPT_VERSION` so existing images show as stale, and regenerate the golden tests. Not done here, by instruction.
2. **Krea framing probe (≈$0.09):** 9:16 aspect ratio and stronger full-body wording, 3 images. If it fixes the crop, evaluate a hybrid pipeline: Krea for the first look, then Seedream with that image as the reference.
3. **Krea `image_style_references` and `styles` passthroughs:** style transfer, distinct from character references; untested.
4. **The production framing line says "studio background",** which may pull models toward photography. Consider "plain light grey background" with the anime prompt.
5. **Left/right placement** of scars and moles was unreliable on every model. Consider not stating sides, or accept it.
6. **A second human rater** should score the blinded sheets; this report's scores come from one reviewer.
7. **A second fixture** (male and non-human, for example an elf with pointy ears) to check the conditional tags across subjects.
