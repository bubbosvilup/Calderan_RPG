# Item Visual Identity / Sprite Generation V1

Implemented 2026-10-09. No commit. Existing Item Domain and Permanent Inventory work remains intact. CampaignItem is authoritative for identity, ownership and physical position; inventory remains derived. Snapshot schema remains **6**.

## 1. Luna smoke re-run

Key existence and production client initialization passed without exposing credentials. The production resolver selects `openai/gpt-6-luna`, with `anthropic/claude-haiku-5.5` fallback. The existing authentication preflight returned **HTTP 401**. Stopped immediately: **0 Luna calls, 0 retries, no fallback call**. Authentication is still unresolved; no live semantic or structural grades can be claimed.

| Case | Luna proposal | Engine result | Grade |
| --- | --- | --- | --- |
| Put existing Silver Knife down | Not requested | Not run | BLOCKED_AUTH |
| Pick same knife back up | Not requested | Not run | BLOCKED_AUTH |
| Take absent Pellan's ring | Not requested | Not run | BLOCKED_AUTH |
| Reuse existing materialized item | Not requested | Not run | BLOCKED_AUTH |

The four deterministic inventory pipeline regressions pass, but do not replace live Luna evaluation. Reproducible runner: `scripts/item-inventory-live-smoke.mjs`; captured result: `docs/evaluations/ITEM_INVENTORY_LIVE_SMOKE.json`. No inventory semantic policy change was made because no repeatable live semantic issue was observed.

## 2. Existing image-stack audit

Reusable components:

- `src/app/image-stack.ts`: configured Qwen Image/Raena LoRA, HF router, pinned fal-ai endpoint, prompt trigger, image sizes and billing convention.
- `src/llm/image-generator.ts`: provider-neutral request/result interface, safe typed errors, image signature/size validation, bounded transport and recovery classification.
- `src/llm/huggingface/fal-image-client.ts`: production generation and credential-free image download from approved hosts. No provider migration or credential added.
- `src/app/portrait-store.ts`: campaign-local hashed identity folders, validated filenames, staged atomic writes, bounded reads and asset enumeration. Item IDs use the same storage identity mechanism; no bytes enter campaign JSON.
- `src/app/portrait-assets.ts` and `src/persistence/campaign-repository.ts`: live/retained-save reference protection, missing assets and orphan reporting; extended to item sprites.
- `GameSession` portrait generation: already asynchronous, keeps gameplay available during provider requests, waits for idle before committing metadata, and supports bounded portrait retry. There is no general-purpose image job queue.
- UI portrait serving already resolves authoritative metadata into store reads. Items now expose a parallel application read seam over the same store; no UI route or inventory UI is implemented.

Item-specific extensions are the visual-description field, sprite state, deterministic prompt, small session-local job queue, safe player read model and creation-only scheduling. Portrait galleries, roles and portrait retry behavior remain unchanged.

## 3. Item description model

`description`: one concise gameplay/narrative sentence about the object; may retain relevant context such as taking a figurine from a counter. Suitable for the player and relevant narration/controller context.

`visual_description`: persistent internal visible appearance used to recreate the object. Excludes ownership, IDs, location, transaction/history, temporary condition, secret lore and unsupported meaningful detail. Modest generic visual completion is allowed. Policy constrains the semantic authoring; deterministic schema validation enforces nonempty bounded text, not a natural-language semantic classifier.

Both fields are mandatory for **new engine create_item commands**. Existing authored and legacy CampaignItems remain valid with neither field; migration never fabricates appearance or calls providers. Audited runtime registration and development fixtures include legacy items without appearance, so optional persisted fields are necessary.

## 4. Controller create_item change

Both strict owner-known and owner-unknown create_item schema variants now require `description` and `visual_description`. The same controller proposal supplies them; no second creation/enrichment LLM request. Engine IDs, positions, absent-owner grounding, evidence authorization and atomic creation are preserved. Application visual maintenance commands are excluded from the Controller schema and rejected by its parser. Contract hashes and valid creation fixtures were updated.

## 5. Stability rule

Visual identity is established at creation or a one-time explicit legacy enrichment. `enrich_item_visual` refuses an already established identity. Routine place/transfer commands change neither description nor sprite. There is no appearance-mutation or regeneration system in V1.

## 6. Visual metadata

CampaignItem adds optional `visual_description` and `sprite`:

```ts
type ItemSprite =
  | { status: "none" }
  | { status: "pending" }
  | { status: "failed"; error_code: string }
  | { status: "ready"; asset_ref: string;
      generated_from_visual_description: string };
```

Absent sprite reads as `none`. Ready references are validated bare store filenames and must match the item's exact established visual description. Only media metadata is added; ownership/position/allocator are unaffected. No raw bytes or provider response bodies are stored.

## 7. Async sprite flow

The existing coordinator atomically commits the item and finishes gameplay. GameSession detects newly committed engine items and queues their IDs. On session idle, the small queue records pending and starts provider work without awaiting it in the turn. Provider completion stages/finalizes the asset and queues ready/failed metadata. Metadata commits wait for idle, avoiding stale-turn revision conflicts; autosave is notified on each visual change.

Queue identity is the item ID. Pending/ready requests are suppressed. Moving or transferring existing items schedules nothing. Failed items can be explicitly retried. Shutdown waits for running sprite work; campaign swaps/orphan cleanup observe the job's busy state, while ordinary player input remains available during image generation.

## 8. Provider/model reused

Hugging Face router, pinned `fal-ai`, endpoint `fal-ai/qwen-image`, base `Qwen/Qwen-Image`, style `Raelina/Raena-Qwen-Image`, existing HF_TOKEN. Square **992 x 992** output uses the configured avatar size. Existing production FalImageClient and PortraitAssetStore are injected from GameSession dependencies. No new SDK, paid provider or credentials.

## 9. Sprite prompt template

`itemSpritePrompt()` accepts only name, category and visual_description, plus the configured style trigger. It produces deterministic text:

```text
Anime illustration of a fantasy game inventory item.
Object: [name].
Category: [category or miscellaneous].
Appearance: [visual_description]
Single isolated object, centered, fully visible, readable silhouette, detailed consistent anime fantasy illustration, plain neutral background. No human model, no hands, no scene or environment, no text, no labels, no watermark, no decorative frame, no UI chrome.
```

No transcript, owner biography, scene/location lore, item ID or narrative description is consulted. The current stack does not advertise dependable transparency; plain neutral backgrounds are requested. Prompts cannot guarantee provider adherence (see live review below).

## 10. Failure and retry

Provider/configuration/storage failures produce failed metadata with a safe code. Item identity, owner, position and next ID sequence are unchanged. Explicit retry moves failed to pending and uses the same item ID. V1 makes one provider attempt per job and performs **no automatic retries**; NPC portrait retry behavior is unchanged.

Legacy missing appearance has an explicit lazy enrichment callback seam. Without an injected enricher, a requested legacy sprite becomes failed with `missing_visual_description`, without an image call. Trusted application code can establish a one-time appearance and retry. No LLM enricher is configured, and no bulk backfill runs. Stale enrichment completion fails safely, preserves the established identity and removes its unrecorded asset.

## 11. Save/load/migration

Optional fields fit schema 6, with no schema bump. Ready references and exact appearance round-trip through normal saves; live, current, previous and backup asset reference collection includes item sprites. Persisted pending jobs are safely restarted once by GameSession load; failed items await explicit retry. Loading old items neither invents fields nor schedules their generation. Save migration itself performs zero LLM/image calls. A restarted pending provider request cannot guarantee provider-level deduplication after process loss; V1 prevents duplicate work within the session.

## 12. Player/NPC consistency and future read model

Every CampaignItem uses the same pipeline regardless of player, campaign NPC, NPC+ or future merchant ownership. Sprite identity follows the item through movement/ownership changes.

`itemVisualView`, `inventoryVisualView` and `GameSession.getInventoryVisuals(characterId)` expose ID, name, narrative description, category, sprite status, ready asset reference and position/equipment state. They omit visual_description. Narrator projection also removes sprite metadata and visual prose. `GameSession.readItemSprite(itemId)` resolves only a ready canonical item reference into bounded store bytes; no caller-supplied path is accepted. No inventory UI built.

## 13. Live image smoke

HF_TOKEN existence checked without exposing its value. **2 real generations, 0 retries**, through production FalImageClient, ItemSpriteJobs and campaign-layout PortraitAssetStore. Both immediately reached pending, completed ready and persisted their assets and campaign save. No additional calls were made.

| Item | Provider/persistence | Visual review |
| --- | --- | --- |
| Ivory Figurine | PASS: pending -> ready; file and save persisted | Recognizable ivory figurine, isolated/full visibility/neutral background; ornate carving and clothing detail exceeds the supplied appearance. |
| Silver Knife | PASS: pending -> ready; file and save persisted | Readable isolated knife; provider adds ornate guard/handle and a decorative border despite plain/no-ornament/no-frame instructions. Art-direction compliance PARTIAL. |

Captured result: `docs/evaluations/ITEM_SPRITE_LIVE_SMOKE.json`. Generated campaign/assets: `docs/evaluations/item-sprite-smoke-assets/turn_fixture/`. Reproducible runner: `scripts/item-sprite-live-smoke.mjs`. The provider's embellishment is a remaining quality limitation; there was no tuning loop or third generation.

## 14. Files created in this pass

- `src/campaign/item-sprite-prompt.ts`
- `src/app/item-sprite-jobs.ts`
- `src/app/item-visual-view.ts`
- `tests/item-visual.test.ts`
- `scripts/item-inventory-live-smoke.mjs`
- `scripts/item-sprite-live-smoke.mjs`
- `docs/evaluations/ITEM_INVENTORY_LIVE_SMOKE.json`
- `docs/evaluations/ITEM_SPRITE_LIVE_SMOKE.json`
- `docs/evaluations/item-sprite-smoke-assets/` (two PNGs, current/previous save and retained backup)
- `docs/architecture/ITEM_VISUAL_IDENTITY_V1.md` (this report)

## 15. Files modified in this pass

- `src/campaign/types.ts`, `validation.ts`, `items.ts`, `snapshot-validation.ts`: descriptions and compatible visual metadata/invariants.
- `src/llm/controller-schema.ts`, `src/llm/openrouter/state-controller.ts`: strict proposal field and concise policy.
- `src/turn/item-projection.ts`: keep visual metadata internal.
- `src/app/game-session.ts`: creation scheduling, idle completion, read/retry/settle seams and lifecycle handling.
- `src/app/portrait-assets.ts`, `src/persistence/campaign-repository.ts`: protect referenced item assets.
- `tests/item-domain.test.ts`, `tests/permanent-inventory.test.ts`, `tests/controller-model-fallback.test.ts`: valid new creation fixtures/expectations and contract hashes.

The pre-existing inventory/referenced-character files and uncommitted authorizer/coordinator/documentation changes were preserved; they are not newly implemented work in this pass. Optional session-view/characterPossessions cleanup was deferred to avoid changing existing UI semantics.

## 16. Focused validation

**169 / 169 tests passed**, including 11 new item-visual tests. Covered item domain, permanent inventory, Controller schema/policy/fallback/reliability, save/load/migration/persistence/session hardening, projections/secrecy, deterministic prompts, async sprite jobs, existing portrait prompt/gallery/image tests and HF image-client regressions.

New tests cover required/nonempty descriptions, immutable appearance through stored/carried/equipped/transfer, prompt/context isolation, player/narrator metadata omission, one nonblocking job, pending/ready suppression, failed retry, offline failure survival, idle completion preserving prepared gameplay receipts, schema-6 save round-trip, actual asset persistence/retained reference protection, lazy legacy behavior, interrupted pending resume, production GameSession creation scheduling, continued input during pending art, safe asset reads and stale enrichment failure.

Typecheck passed. Whitespace verification passes with the repository's CRLF files treated as CRLF (`git -c core.whitespace=cr-at-eol diff --check`). Tests make no live API calls.

## 17. Full suite

Final `npm test`: **2,739 passed, 0 failed, 0 skipped**. Node worker spawning required sandbox escalation; the full normal command ran successfully. Earlier full run before the final stale-enrichment regression: 2,738 passed. Final focused/type/build validation all passed.

## 18. Remaining gaps before Inventory UI

- OpenRouter authentication must be corrected before the four pending live Luna cases can be evaluated.
- Current provider visual fidelity is partial: reduce unsupported ornament/frame drift before using these as polished item cards. No provider migration or automatic image rejection/regeneration was added.
- Wire the future inventory UI and image-serving route to the read model/asset seam; visual_description stays internal.
- Choose an explicit legacy visual-description enrichment policy/provider when needed; the lazy seam exists, but no enrichment LLM or mass backfill is configured.
- UI decisions remain for carried/equipped inventory versus owned stored items; the existing session-view behavior remains intact.
- Merchant stock/pricing, transaction expansion and permanent appearance mutation remain outside this milestone.

No commit was made. Work stops after this report.
