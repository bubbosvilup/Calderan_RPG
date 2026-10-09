# Sprite fidelity hardening

2026-10-09. Narrow prompt-only pass. No commit. No Controller, item-domain, inventory, state/schema, provider/model/LoRA configuration, UI or generation-lifecycle redesign. No Luna calls in this pass.

## 1. Current prompt drift cause

Audit completed before edits. The old item prompt asked for a fantasy game inventory item and detailed consistent anime fantasy illustration. Those phrases likely encouraged extra fantasy design and ornamental detail; this is an inference from the prompt and prior images, not a controlled causal result. Appearance had no explicit precedence over stylistic invention. Constraints were a short trailing list, and item requests omitted the negative prompt already supported by the production client.

The production stack is unchanged: Hugging Face router, pinned fal-ai endpoint `fal-ai/qwen-image`, `Qwen/Qwen-Image`, `Raelina/Raena-Qwen-Image`, LoRA scale 1, square 992 x 992. Portrait requests and retries remain unchanged.

## 2. Prompt changes

Removed the fantasy-item/detailed-fantasy wording. The new template describes a clean object illustration and conservative object study, makes exact appearance authoritative, preserves stated simplicity/geometry/materials, and prohibits unsupported design features and presentation elements. Name/category remain labels; they cannot authorize lore or embellishment. Input visual_description is copied verbatim and never rewritten. No owner/location/history/transcript/engine ID metadata is consulted.

Constraints allow a figure or base explicitly forming part of the object, avoiding accidental contradiction for figurines. Ornament, straps, cloth, magic, symbols and glow are permitted only when explicitly described. No automatic image rejection, vision classifier or regeneration loop was added.

## 3. Style trigger decision

Retained the existing `Anime illustration of` trigger exactly. The [Raena model card](https://huggingface.co/Raelina/Raena-Qwen-Image) identifies it as the recommended prefix and describes an anime-oriented aesthetic; it does not establish framing as a trigger effect. There is insufficient evidence to assign decorative drift specifically to the trigger rather than the old fantasy wording/LoRA/model prior. A shortened trigger is not documented as equivalent. No trigger A/B comparison was run: all three allowed calls tested the requested objects with the hardened current trigger.

## 4. Negative prompt support

Real support confirmed: `ImageGenerationRequest.negative_prompt` exists; FalImageClient forwards it as `negative_prompt` in its existing request body; provider tests assert the exact wire field. The [fal Qwen Image API schema](https://fal.ai/models/fal-ai/qwen-image/api) documents that input. No unsupported provider fields were introduced.

Only item jobs now supply this concise negative prompt:

```text
decorative frame, border, UI chrome, text, labels, watermark, hands holding the object, extra person, scene, environment, decorative background, extra objects, presentation pedestal, floating particles, unrequested glow, unsupported ornament, extra jewelry, unrequested runes, unrequested symbols, unrequested gems, unrequested filigree
```

The wording targets unrequested features rather than rewriting or stripping any feature in the item's appearance. Negative prompting is advisory and does not guarantee adherence.

## 5. Final item sprite prompt template

```text
Anime illustration of a clean inventory object illustration.

Object:
[name]

Category:
[category, default miscellaneous]

Exact appearance:
[visual_description, unchanged]

Instructions:
Depict exactly the described object. Render the object literally and conservatively as a simple isolated object study. The exact appearance description is the visual authority; object name and category are labels, not permission to add details. Preserve the stated shape, materials, colours and simplicity. If described as plain or simple, keep it plain or simple. Do not embellish.
Do not add any visible feature unsupported by the exact appearance description. Do not add symbols, gems, engravings, ornament, magical effects, straps or cloth unless explicitly described. Do not redesign the object into a more fantasy version. Do not infer rank, ownership, culture or lore.
Single object only. Centered. Fully visible. Readable silhouette. No hands holding it. No person or human model; a figure explicitly forming part of the described object is allowed. No scene. No environment. No text, label or watermark. No border, frame or UI chrome. No presentation pedestal or elements around the object; a base explicitly belonging to the described object is allowed. No decorative background. No floating particles. No glow unless explicitly described. No symbols or ornament unless explicitly described.
Plain neutral background.
```

## 6. Deterministic and focused tests

**62 passed, zero failures**: item sprite prompt tests, item visual tests, HF image-client tests, portrait prompt/image/gallery regressions. Four new prompt tests check determinism, metadata isolation, nonmutation/verbatim appearance, explicit unsupported-feature restrictions, preservation of described object features, unchanged trigger and supported negative-prompt wire shape. Item job tests confirm that only item requests receive the item negative prompt. Typecheck passed.

## 7. Live image results

Exactly **3 production image calls, zero automatic retries**. HF credential presence checked without exposing its value. FalImageClient -> ItemSpriteJobs -> existing PortraitAssetStore was used; all three assets completed ready and were persisted. All three visual_description values remain byte-identical to the supplied test descriptions. Manual review only; review grades did not reject images or mutate item state.

| Check | Plain Silver Knife | Plain Signet Ring | Sealed Letter |
| --- | --- | --- | --- |
| Object identity | Correct knife | Correct silver signet ring | Recognizable sealed letter |
| Major geometry | Straight plain blade, dark wooden handle; ordinary small guard/rivets | Oval face and ring band, raised rim/metal highlights | Folded envelope-like off-white paper and dark red seal |
| Plain/simple | Respected on object | Respected | Mostly respected |
| Unsupported ornament | No major ornate guard, runes, gems or glow | No crest, gem or filigree | Minor raised seal rim and short embossed line |
| Extra objects | None | None | None |
| Decorative border/frame | None | None | None |
| Text | **Object/Silver Knife labels, category-like heading, pseudo-caption** | None | None |
| Scene/background clutter | Caption layout/divider on neutral background | None | None |
| Major appearance contradiction | No major object contradiction; presentation text violates sprite constraints | None obvious | None; minor unsupported seal detail |
| Grade | **FAIL** | **PASS** | **PARTIAL** |

Captured requests, seeds, exact descriptions, file references and detailed manual review: `docs/evaluations/ITEM_SPRITE_FIDELITY_SMOKE.json`. Reproducible bounded runner: `scripts/item-sprite-fidelity-smoke.mjs`.

Assets:

- Knife: `docs/evaluations/item-sprite-fidelity-assets/turn_fixture/portraits/3ebdfc7f320d97456a162116/portrait_item_2c254e2aa68d4e43.png`
- Ring: `docs/evaluations/item-sprite-fidelity-assets/turn_fixture/portraits/8da9745030a430c898ddf6e5/portrait_item_766df3175a5d824e.png`
- Letter: `docs/evaluations/item-sprite-fidelity-assets/turn_fixture/portraits/648231d89146f281e0b1c841/portrait_item_93624d6fca1580af.png`

## 8. Fidelity grade and success threshold

**Overall fidelity: PARTIAL. Required success threshold: NOT MET.**

- All three recognizable: yes.
- No decorative border/frame: yes, all three.
- At least two without major unsupported ornament: yes.
- No text/hands/full scene: **no**, because the knife has labels/captions.
- No major object appearance contradiction: yes; the knife still violates presentation constraints.

Compared with the earlier smoke, the knife lost its ornate fantasy guard and decorative frame and has the requested wooden handle. However, these are three samples with different seeds/descriptions, not statistical proof of a general fidelity gain. Headings and the long instruction block appear to have been interpreted as a presentation sheet on the knife. This is a plausible cause of the text leakage, not an isolated causal finding. The evaluated template was not repeatedly retuned after the budget was exhausted.

## 9. Provider change decision

No provider/model/LoRA migration. These results do not justify migration yet; the simple ring is acceptable and major framing/ornament drift is absent in this small sample. The remaining text failure needs a further bounded prompt-side experiment before polished item cards. No fourth image was generated and no untested trigger change was made.

## 10. Files changed in this pass

Modified:

- `src/campaign/item-sprite-prompt.ts`: literal template and item-only negative prompt constant.
- `src/app/item-sprite-jobs.ts`: pass that supported negative prompt to the existing generator; lifecycle/state logic unchanged.
- `tests/item-visual.test.ts`: updated wording expectations and item request negative-prompt assertion.

Created:

- `tests/item-sprite-prompt.test.ts`
- `scripts/item-sprite-fidelity-smoke.mjs`
- `docs/evaluations/ITEM_SPRITE_FIDELITY_SMOKE.json`
- `docs/evaluations/item-sprite-fidelity-assets/` (three PNGs)
- `docs/architecture/SPRITE_FIDELITY_HARDENING.md` (this report)

Existing uncommitted milestone work was preserved. No item identity fields, Controller policies, provider configuration, portrait prompts or UI files changed in this pass.

## 11. Full suite

`npm test`: **2,743 passed, 0 failed, 0 skipped**. Typecheck passed. Full suite uses the normal Node worker runner; sandbox escalation allowed the workers. Focused validation passed before live generations. No test suite required live calls.

## 12. Remaining gaps before Inventory UI

- Knife text/presentation leakage remains a blocking fidelity limitation for a clean item sprite. A future bounded prompt experiment should test a less sheet-like layout without headings/caption cues, keeping exact appearance authoritative.
- Letter seal still has a small unsupported stamp-like line/rim; exact visible detail is not guaranteed by this model.
- Three samples are insufficient to guarantee reliability across item categories or explicitly ornamented items. No automatic QA or regeneration was added.
- Existing inventory read/asset seams are available; UI implementation remains deferred. Stable appearance, state, persistence, retry and duplicate suppression are unchanged.

No commit. Stop after the report.
