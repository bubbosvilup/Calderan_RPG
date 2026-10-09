# Sprite Quality V2

Evaluation date: 2026-10-10. No commit. Existing uncommitted milestones preserved.

1. **Current quality pipeline audit.** ItemSpriteJobs is a session-local async queue; metadata commits wait for gameplay idle. It shares the portrait generator and asset store, but has its own lifecycle. The image contract returns bounded PNG/JPEG/WebP bytes and optional provider/seed/billing diagnostics. Production remains HF router → fal-ai → Qwen/Qwen-Image + Raelina/Raena-Qwen-Image LoRA. The current Raena trigger is `Anime illustration of`. The provider supports the item-only `negative_prompt` field. Before V2, valid bytes went straight to stage/finalize and ready; there was no image reviewer, OCR or local analysis seam. Queue/running/completed state was ephemeral; persisted sprite metadata was only status, ready asset reference and exact source appearance, or safe failure code. Portrait metadata is richer but is not copied into items.

   **Placement:** validate bytes → review in memory → stage/finalize accepted bytes → publish ready when idle. Review happens before finalization and even before staging. Rejected bytes never enter the normal campaign asset tree. Existing store discard/remove safeguards continue to clean up storage/commit failures. No additional persisted attempt metadata is needed.

2. **QA implementation.** `SpriteQualityReviewer.review` takes only image bytes/media type, name, category and visual_description. It returns `{accepted:boolean,reasons:stable-code[]}`. Runtime validation rejects unknown codes, duplicate codes, verbose/extra fields, acceptance with reasons and rejection without reasons. `OpenRouterSpriteQualityReviewer` uses the existing OpenRouter transport with the existing Haiku 5.5 model. Its image content parts are confined to the new adapter; the byte-pinned text transport remains exactly unchanged. Production injects the reviewer into GameSession's item queue. No new provider or dependency.

3. **Text leakage detection.** Vision inspects the entire image for words, captions, labels, title/UI lettering and significant pseudo-text/glyph blocks. No OCR dependency and no pixel repair. Haiku 5.5 image input is documented by [OpenRouter](https://openrouter.ai/anthropic/claude-haiku-5.5). The live reviewer caught both knife images' obvious headings, labels and pseudo-text.

4. **Acceptance/rejection policy.** Stable reasons are `text_leakage`, `decorative_frame`, `multiple_objects`, `human_present`, `scene_present`, `major_visual_mismatch`. Only clear defects are rejected. Harmless shading, perspective, background tone, mild ornament without material contradiction and small stylistic variation are allowed. Figures/bases explicitly belonging to the described object are allowed. Review errors use `review_failed`, not an accepted verdict. The policy is visual only and cannot issue gameplay commands.

5. **Bounded regeneration.** Production uses two explicitly enumerated attempts, never recursion: initial → one clean regeneration only after a valid rejection. Two rejections result in `quality_rejected`. Image/provider/storage errors terminate the cycle; a missing, unavailable or malformed reviewer fails closed with `review_failed`, without generating more images. No paid re-review. Pending spans the entire cycle; accepted images become ready only after QA and finalization. A later explicit request for a failed item starts a new bounded cycle. Ready assets and movement/ownership changes do not schedule QA. Interrupted pending jobs retain the existing resume behavior; a resumed session starts a new bounded cycle because no attempt counter is persisted.

6. **Second-attempt prompt.** It is flat, short and preserves visual_description verbatim. It requests one isolated object on a neutral background, explains that the previous rendering was rejected, demands literal shape/materials/simplicity, and excludes text, pseudo-lettering, labels, captions, watermark, borders, presentation graphics, people, hands, environments and extra details. Symbols/ornament are allowed only if explicitly described. No rejected image, reviewer prose or reason-dependent prompt injection. Neither description nor visual_description is rewritten; Controller/Luna is never called by QA.

7. **Style comparison.** Two knife samples used identical seed (104911), dimensions, full hardened item prompt, negative prompt, provider, model and LoRA; only the trigger differed. `Anime illustration of` was rejected for `text_leakage`. Reduced `Illustration of` was rejected for `text_leakage` and `decorative_frame`. Reduced is not clearly better, so production retains the current trigger. NPC portraits are unchanged. This is a single paired comparison, not broad statistical evidence.

   The knife's second image was deliberately reserved for the required controlled style experiment, not the stricter production retry. Both count against its two-image limit. No third knife image was requested. The other three items exercised the real ItemSpriteJobs path. The strict second-attempt path was verified deterministically; this live smoke did not validate a successful strict regeneration because the remaining items passed initially.

8. **Negative prompt.** Concise item-only exclusions now put text, captions, labels, letters, words, typography, watermark, UI, frame, border, presentation sheet and catalog layout first. Existing object isolation/unsupported embellishment exclusions remain. No global portrait negative prompt change.

9. **Metadata/save impact.** No CampaignItem fields added, no schema bump (schema 6 retained). Reasons and attempt counts remain ephemeral, with optional evaluation JSON outside campaign saves. Ready/failed metadata is sufficient for save/load and retry. Existing ready assets are not re-reviewed or regenerated. Campaign identity, ownership, position and both descriptions remain authoritative and unchanged in every live fixture, including the rejected knife.

10. **Inventory UI impact.** No UI edits or new button. Existing pending, ready and failed placeholders cover QA naturally. No intermediate ready flash. No provider/model prose exposed to the player. QA is specific to item sprites, not NPC portrait generation.

11. **Deterministic QA results.** Nine new tests cover acceptance/finalization, rejection without staging, second acceptance, two rejections/no third image, first and second review errors, malformed acceptance, fresh explicit retry, immutable gameplay fields and IDs, unchanged descriptions, no review on movement/transfer, strict result validation, retry prompt authority, and visual-only request serialization without fallback. Existing item visual tests now explicitly inject an accepting local reviewer. Temporary rejected bytes are never staged, which is stronger than staging then discarding.

12. **Live quality smoke.** Reproducible runner: `npm run build --silent` then `node scripts/item-sprite-quality-smoke.mjs`. It refuses to overwrite an existing report to prevent accidental repeated paid calls. The report includes requests, seeds, per-attempt QA, image/debug paths and gameplay equality checks. Debug images are evaluation-only; campaign-style evaluation storage contains only three accepted assets.

   | Item | First QA | Second sample / QA | Images | Final state / grade |
   |---|---|---|---:|---|
   | Silver Knife | Rejected: text_leakage | Reduced-style comparison; rejected: text_leakage, decorative_frame | 2 | failed quality_rejected / FAIL art, correct QA rejection |
   | Signet Ring | Accepted | None | 1 | ready / PASS |
   | Sealed Letter | Accepted | None | 1 | ready / PASS under practical policy |
   | Simple Key | Accepted | None | 1 | ready / PASS |

   Manual inspection confirmed the knife's clear text and the second image's frame. Accepted images have no obvious labels/captions or presentation frames. The letter has a small seal flourish, a remaining fidelity detail tolerated by the practical reviewer; no significant text block. The ring's face is viewed in perspective and is plain; the key is isolated with a rectangular bow. No major contradiction was identified in the accepted set.

13. **Total image calls.** 5, of maximum 8. Per object: 2/1/1/1. Both style comparison calls are included. No additional tuning or provider calls after the smoke.

14. **QA calls/provider.** 5 paid vision request attempts through existing OpenRouter, model `anthropic/claude-haiku-5.5`. No model fallback configured or used. OpenRouter auth preflight HTTP 200 is separate and not a QA call. Role: conservative visual gate between byte validation and campaign asset storage. Credentials were checked for presence and never printed. No inference cost figure was invented.

15. **Files created in this pass.** `src/llm/sprite-quality.ts`; `src/llm/openrouter/sprite-quality-reviewer.ts`; `tests/sprite-quality.test.ts`; `scripts/item-sprite-quality-smoke.mjs`; this report; `docs/evaluations/ITEM_SPRITE_QUALITY_SMOKE.json`; `docs/evaluations/item-sprite-quality-assets/` (5 debug samples + 3 accepted copies); focused/full test logs.

16. **Files modified in this pass.** `src/app/item-sprite-jobs.ts`, `src/campaign/item-sprite-prompt.ts`, `src/app/game-session.ts`, `src/app/production.ts`, `tests/item-visual.test.ts`. Some are untracked files from earlier milestones; these are V2 deltas, not the entire dirty tree. OpenRouter client bytes were restored exactly. No item-domain, Controller, UI, provider/model/LoRA or save-format changes.

17. **Focused tests.** Final focused run: 58/58 passed, including new QA, item visual/prompt, inventory UI, save/load, HF provider, portrait image and the byte-pinned RPG transport contract. Evidence: `docs/evaluations/SPRITE_QUALITY_FOCUSED.log`.

18. **Typecheck.** `npm run typecheck --silent` passed after the final adapter change. Build passed.

19. **Full suite.** Final run: **2755/2755 passed**, zero failures, recorded after the transport restoration in `docs/evaluations/SPRITE_QUALITY_FULL.log`. The initial run passed 2754/2755 with only the pinned source-byte contract failing; the transport was restored without weakening the test, and the full suite was rerun.

20. **Success threshold.** Live art threshold met at 3/4 ready. No accepted image has an obvious label/caption, decorative frame or major appearance contradiction. Every item uses at most two images. Gameplay equality checks passed for all four fixtures. QA correctness does not mean the knife art problem is solved: it is safely rejected.

21. **Provider migration warranted? MAYBE.** Current stack remains usable for 3/4 simple objects, and QA protects the inventory from visibly bad art. Knife presentation/text leakage remains repeatable and reduced style did not help. This small smoke is insufficient to justify immediate migration, and it did not live-test the strict retry on the knife. No migration performed.

22. **Remaining gaps.** Knife text leakage; small wax-seal embellishment; limited sample size and stochastic vision decisions; strict regeneration proven with mocks but not successful live in this run. QA adds one bounded vision request per generated candidate and fails closed during reviewer outages. Retry after process interruption starts a new cycle rather than preserving paid-call history across crashes. Historical pre-V2 smoke scripts do not inject a reviewer; the V2 runner is the supported quality evaluation path. No OCR, crop, blur, mask, inpaint, provider switch, bulk review or unbounded tuning.
