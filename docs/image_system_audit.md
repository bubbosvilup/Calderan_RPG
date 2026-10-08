# Caldrevan image system: audit (read-only)

**Date:** 2026-10-08. **Repo state:** `3123656` (latest commit).

**Scope.** This document describes what exists today, before the decided v1 stack is integrated: Raena-Qwen-Image via Hugging Face Inference Providers, `fal-ai` pinned. **No code was changed for this audit.**

**History.** The system was built in four passes, each with a report at the repo root:

1. `PERMANENT_APPEARANCE_V1.md`;
2. `PORTRAIT_PROMPT_BUILDER_V1.md`;
3. `PORTRAIT_IMAGE_GENERATION_V1.md` (OpenRouter);
4. `PORTRAIT_GALLERY_AND_ROLES_V2.md` (Gallery, Avatar / Full Body roles, batch of 3).

The anime model benchmark (`ANIME_PORTRAIT_MODEL_BENCHMARK_V1.md`) added an unwired prompt dialect.

---

# Current architecture

**The image system is already a complete, layered feature, but bound to OpenRouter.** It has four layers:

| Layer | Responsibility | Key code |
| --- | --- | --- |
| Appearance → prompt (domain, pure) | Resolve the permanent appearance from canon, origin observations and the player-edited profile; build a deterministic text prompt and a fingerprint of it | `src/campaign/permanent-appearance.ts`, `src/campaign/portrait-prompt.ts` |
| Portrait metadata (domain) | A per-character **Gallery** of versions, plus **Avatar** and **Full Body** roles and one optional **reference**; validated commands; snapshot integrity | `src/campaign/portraits.ts`, `src/campaign/types.ts`, `src/campaign/validation.ts`, `src/campaign/snapshot-validation.ts` |
| Generation + files (application) | Batch orchestration, locking, staging and finalizing files, a single metadata commit, role/delete/reference mutations, the asset read path | `src/app/game-session.ts`, `src/app/portrait-store.ts` |
| Provider (infrastructure) | An OpenRouter Image API client behind the `PortraitImageGenerator` interface | `src/llm/openrouter/image-client.ts` (wired in `src/app/production.ts`) |
| UI | Local HTTP routes and browser client: editor portrait column, Gallery, lightbox, Avatar on compact surfaces | `src/ui/server.ts`, `src/ui/client.js`, `src/ui/index.html`, `src/ui/style.css` |

**Where the provider seam is.** `SessionDeps.portrait_generator: PortraitImageGenerator` has a single method, `generate({ prompt, references, signal }) → { bytes, media_type, model, cost_usd?, latency_ms }`. **This is the natural place to plug in a Hugging Face / fal-ai generator.** The rest of the pipeline (batching, staging, roles, persistence, UI) does not know which provider is behind it.

---

# Current generation flow

## Flow 0: an NPC becomes NPC+ (no image work)

| # | File / function | Input → output | State |
| - | --- | --- | --- |
| 0.1 | `src/campaign/premium-characters.ts` `syncPremiumCharacters()` (runs inside every `prepareCampaignChange`) | A character joining Nicco's household → a `premium_characters[]` record with `active_household_member: true` | **Persistent** (campaign snapshot) |
| 0.2 | `src/app/player-character-view.ts` `project()` (≈ line 140, `editable`) | The NPC+ is an active member of Nicco's household (not Nicco, not dead or inactive) → `appearance_editor_eligible: true` and an `appearance_editor` projection | Derived (recomputed on every view) |

**Promotion never generates an image**; this is a tested invariant (`tests/portrait-gallery.test.ts`, "creation and NPC+ promotion never generate").

## Flow A: edit the permanent appearance (feeds the prompt)

| # | File / function | Input → output | State |
| - | --- | --- | --- |
| A.1 | `client.js` `openEditor()` / `renderEditor()` (lines 35, 80) | The opaque card `ref` → form filled with stored overrides only (inherited text is a note) | Transient (browser) |
| A.2 | `client.js` `saveEditor()` (105) → `POST /api/appearance` | `{ ref, expected_revision, patch }` | – |
| A.3 | `server.ts` → `GameSession.updateNpcAppearance()` (`game-session.ts:189`) | Patch → `applyAppearancePatch()` (`permanent-appearance.ts:113`) → one `set_profile` command | **Persistent:** `characters[].profile.appearance` |
| A.4 | `player-character-view.ts` → `resolvePermanentAppearance()` (`permanent-appearance.ts:54`) → `buildPortraitPrompt()` (`portrait-prompt.ts:69`) | Resolved appearance → `{ prompt, negative_prompt, fingerprint }`, shown read-only in the editor | Derived (never stored) |

## Flow B: generate portraits (one click, a batch of 3)

| # | File / function | Input → output | State |
| - | --- | --- | --- |
| B.1 | `client.js` `portraitRequest("/api/portrait/generate")` (242, button at 266) | `{ ref, expected_revision }` only; the browser never sends a prompt, model or size | Transient: `portraitBusy`, "Generating 3 options…" |
| B.2 | `server.ts` (≈76) → `GameSession.generateNpcPortraitBatch()` (`game-session.ts:234`) | Validates: session idle, no batch running (`#portraitBusy`), revision current, eligible target (`#managedTarget`, 216), Gallery has 3 free slots (max 64) | Transient lock |
| B.3 | same | Prompt = `editor.portrait_prompt.prompt` (the **realistic V1 prompt**); fingerprint; the reference bytes read from the store if attached | – |
| B.4 | `Promise.allSettled` of 3 × `generator.generate()` (262) | 3 concurrent provider calls | – |
| B.5 | `OpenRouterImageClient.generate()` (`image-client.ts`) | `POST https://openrouter.ai/api/v1/images {model, prompt, resolution "1K", aspect_ratio "2:3", n?, input_references?}` with `OPENROUTER_API_KEY` → base64 → validated bytes | – |
| B.6 | `PortraitAssetStore.stage()` (`portrait-store.ts`) | Bytes → private `.tmp-*` file per success | Disk (temporary) |
| B.7 | Wait until the session is idle (282); re-check eligibility and that the fingerprint is unchanged | – | – |
| B.8 | `store.finalize()` → `portrait_<12 hex>.<ext>`; random Avatar pick on the first batch (`#pick`, `crypto.randomInt`) | – | **Disk** (final files) |
| B.9 | One `record_portrait_batch` command (`portraits.ts:18`) | `versions[]` (+ `avatar_version_id` on the first batch) | **Campaign snapshot** (in memory until saved) |
| B.10 | Projection → `PortraitEditorView` + card `avatar_url` (`player-character-view.ts` ≈176–202) | Opaque tokens, `/api/portrait/asset/<32 hex>` URLs, per-image stale flags | Derived |
| B.11 | `client.js` `renderPortrait()` / `renderGallery()` (143 / 171) | Avatar slot, Full Body slot, Gallery grid, result message "N of 3 portrait options generated." | Browser |
| B.12 | `GET /api/portrait/asset/<token>` → `GameSession.readPortraitAsset()` (434) → `store.read()` | Token → bytes; matched only against the **current** campaign's metadata | Disk read |

## Flow C: roles, delete and reference

| Action | Route → method | Effect |
| --- | --- | --- |
| Set Avatar | `POST /api/portrait/avatar` → `setNpcPortraitAvatar()` (352) | `set_portrait_avatar`; no file copy |
| Set / clear Full Body | `POST /api/portrait/full-body` → `setNpcPortraitFullBody()` (359) | `set_portrait_full_body` (`null` clears it) |
| Delete Gallery image | `POST /api/portrait/delete` → `deleteNpcPortrait()` (376) | Blocked for role holders; commits the metadata first, then deletes the file; a failed delete leaves a logged orphan |
| Attach / remove reference | `POST /api/portrait/reference` → `setNpcPortraitReference()` (394) | PNG/JPEG/WebP ≤ 4 MB, signature-checked, stored as `reference_*.ext` and **sent to every generation** as `input_references` |

---

# Relevant files

| File | Role | Status |
| --- | --- | --- |
| `src/campaign/types.ts` (≈230–294) | `CharacterPortraitVersion`, `CharacterPortraitReference`, `CharacterPortraitRecord`; the commands `record_portrait_batch`, `set_portrait_avatar`, `set_portrait_full_body`, `delete_portrait_version`, `set_portrait_reference` | Active |
| `src/campaign/portraits.ts` | Command handlers, `MAX_PORTRAIT_VERSIONS = 64`, `PORTRAIT_BATCH_SIZE = 3`, `validatePortraitRecords`, asset and item tokens, `avatarPortrait` / `fullBodyPortrait` | Active |
| `src/campaign/validation.ts` | Parsers (portrait version / reference / record; legacy `active_version_id` → `avatar_version_id`) | Active |
| `src/campaign/snapshot-validation.ts` | Calls `validatePortraitRecords` on every restore and commit | Active |
| `src/campaign/campaign-state.ts` | Dispatch and deterministic ordering of `portraits` | Active |
| `src/campaign/permanent-appearance.ts` | 12 appearance fields, resolver, patch validation | Active |
| `src/campaign/portrait-prompt.ts` | `buildPortraitPrompt` (**realistic V1 dialect**), `portraitDetails`, `PORTRAIT_*` constants, `portraitFingerprint`, `PORTRAIT_PROMPT_VERSION = "portrait-prompt-v1"` | Active (prompt to be replaced or extended) |
| `src/campaign/anime-portrait-tags.ts` | Booru tag mapper + `buildAnimeBenchmarkPrompt` (natural / hybrid anime dialects) | **Experimental, not wired** |
| `src/app/game-session.ts` | Generation, roles, delete, reference, asset read, lock, idle wait | Active |
| `src/app/portrait-store.ts` | `PortraitAssetStore` (stage, finalize, discard, remove, read; path-safety) | Active |
| `src/app/player-character-view.ts` | `PortraitEditorView`, `avatar_url`, `portrait_prompt` projection | Active |
| `src/app/production.ts` (≈72–75) | Wires `OpenRouterImageClient(portraitImageConfig())`, `PortraitAssetStore(<save_dir>/portraits)`, `portrait_log` | Active (provider to replace) |
| `src/app/app-errors.ts` | `portrait_generation_failed` code | Active |
| `src/llm/openrouter/image-client.ts` | `OpenRouterImageClient`, `PortraitImageGenerator` interface, `decodeImage` / `sniffImage`, `ImageGenerationError` codes | Active (the interface stays; the client gets replaced) |
| `src/ui/server.ts` | `PORTRAIT_ROUTES` (generate, avatar, full-body, delete, reference), `GET /api/portrait/asset/<token>` | Active |
| `src/ui/client.js` (≈127–300, 303–350, 368–390, 453–510) | Editor portrait column, Gallery, lightbox, delete confirm; Avatar on the Household card, scene sidebar, roster and drawer | Active |
| `src/ui/index.html` (33, 47, 51) | Portrait column markup, lightbox, drawer portrait | Active; the drawer has **placeholder** Upload / Generate / Edit NPC+ buttons (disabled) |
| `src/ui/play.ts`, `src/app/ui-playtest.ts` | Play UI entry: a **disposable** campaign `ui_playtest`, save dir `saves/ui_playtest`, "no saves" | Active |
| `tests/portrait-gallery.test.ts` (20), `portrait-image.test.ts` (3), `portrait-prompt.test.ts` (5), `anime-portrait-tags.test.ts` (5), `permanent-appearance.test.ts` (8), `ui-v1.test.ts` (portrait UI parts) | Test coverage (see the relevant sections) | Active |
| `scripts/anime-portrait-benchmark*.mjs` | Benchmark tooling (OpenRouter) | Research only |
| External: `Desktop/backoff_img/huggingface_tests/*` (outside the repo) | HF / fal research harness (`hf_benchmark.py` etc.); **the only working HF-routed code** | Research only; Python, not part of the app |

---

# NPC+ image / domain fields

**Where appearance is stored:** `characters[].profile.appearance` (`CharacterAppearance`, `types.ts:5`). These are campaign overrides edited in the Household editor. Canon prose and origin observations are merged at read time by `resolvePermanentAppearance`.

**Where image data is stored:** `CampaignSnapshot.portraits?: CharacterPortraitRecord[]`, one record per character:

```
{ character_id, avatar_version_id?, full_body_version_id?, versions: CharacterPortraitVersion[≤64], reference? }
CharacterPortraitVersion = { version_id, prompt_version, prompt_fingerprint, model, created_at, media_type, asset_file, cost_usd?, reference_used? }
```

| Wanted field | Exists? | Where / note |
| --- | --- | --- |
| Physical description | **yes** | `profile.appearance`: height, weight, build, skin, eyes, hair (color / texture / description), scars, distinguishing marks, distinctive traits, description |
| Outfit / clothing | **no** | Deliberately excluded (clothing is current state); the prompt uses a fixed `PORTRAIT_CLOTHING` line |
| Style | **no** | Implicit in the prompt head (realistic V1); no per-character or per-version style field |
| Avatar | **yes** | `avatar_version_id` (role pointer into the Gallery) |
| Full-body image | **yes** | `full_body_version_id` (role pointer; may be absent) |
| Generated prompt | **partial** | Not stored; only `prompt_fingerprint` (16 hex) + `prompt_version`. Text is rebuilt from the current appearance, so **the exact prompt behind an old image is not recoverable** |
| Generation seed | **no** | Never sent and never stored |
| Model | **yes** | `version.model` (the provider slug) |
| Provider | **no** | Not stored (implicitly OpenRouter) |
| LoRA / style adapter | **no** | — |
| Pose / framing variant | **no** | One fixed full-body framing for every generation (no avatar framing) |
| Source / reference image | **yes** | `record.reference` (one per character), with `version.reference_used` |
| Image history / alternatives | **yes** | `versions[]` is the Gallery (≤ 64), with per-image staleness |
| Cost | **yes** (optional) | `version.cost_usd` (from the provider when reported) |
| Kind (avatar vs full body) | **no** | Every version is the same 2:3 full-body render; "Avatar" is a role + CSS crop, not a separately framed image |

---

# UI flow

| Element | Location | Behaviour |
| --- | --- | --- |
| Editor entry | Household view → card "Edit" (`client.js` `renderHousehold`, 303) | Opens the member editor for eligible NPC+ only |
| **Avatar slot** | Editor portrait column (`index.html:33`) | Round 88 px frame, cover crop; "No avatar yet" / "Current Avatar" / "· older appearance"; "Change via Gallery" |
| **Full Body slot** | Same column | 2:3 frame, `contain`; explicit "No Full Body selected" (never falls back to the Avatar); "Clear Full Body" |
| Generate button | "Generate 3 options" | One click = one batch; disabled while busy or when the Gallery is full; progress text; result text "N of 3 portrait options generated." |
| Regenerate | Same button | Appends to the Gallery; roles never change automatically |
| Loading | `portraitBusy` state | Button disabled + status line. **No per-image progress; 3 parallel calls; no cancel** |
| Errors | `#portrait-error` (inline) / `#lightbox-error` | Server message (provider codes mapped to plain sentences); the old images stay |
| Variant selection | Gallery grid + lightbox (prev/next, Esc, arrows) | "Set as Avatar", "Set as Full Body", "Delete" (with confirmation; blocked for role holders) |
| Reference | "Reference" / "Replace reference" / "Remove reference" | File input, PNG/JPEG/WebP ≤ 4 MB |
| Appearance-editor interaction | Prompt preview textareas (read-only) | Saving the appearance refreshes the preview and marks images "older appearance" (stale) |
| Compact surfaces | Household card, scene sidebar avatar, sidebar roster circle, character drawer (`client.js` 329, 385, 478, 504) | Use **Avatar only**, cover crop; initial-letter placeholder otherwise |
| Drawer | `index.html:47–51` | Shows the Avatar; **placeholder** Upload / Generate / Edit NPC+ buttons (disabled, unwired) |

**Worth preserving:**

- **Explicit-click only:** generation is never automatic.
- **Opaque tokens:** the browser only ever sends opaque tokens.
- **The role model:** the Avatar / Full Body distinction, with no fallback between them.
- **The Gallery:** delete safety and the lightbox UX.
- **Stale markers.**
- **Committed-state-only rendering.**
- **Browser QA:** all of this was verified in a real browser at 1440 / 1024 / 390 px (`PORTRAIT_GALLERY_AND_ROLES_V2.md`).

---

# Persistence / storage

| What | Where | Format |
| --- | --- | --- |
| Image bytes | `<save_dir>/portraits/<campaign_id>/<sha256(campaign:character)[:24]>/portrait_<12 hex>.<png\|jpg\|webp>` (references: `reference_<hex>.<ext>`) | Real files; never data URLs in state or saves; never inside the save JSON |
| Image metadata | `CampaignSnapshot.portraits` → saved by `FileCampaignRepository` (`saves/<campaign>/save.json`) | Small JSON (≈ 200 B per version, ≤ 64 versions per character) |
| Browser access | `/api/portrait/asset/<sha256(campaign:character:file)[:32]>` | Opaque token, computed server-side; never a path |
| Temporary files | `.tmp-<hex>` next to the final files | Discarded on failure |

**How the paths are built:**

- **Relative only.** The store root is computed from `save_dir`; metadata stores the file **name**, never a path, so absolute paths cannot break.
- **Validated.** Names are checked by pattern and every resolved path must stay inside the root.

**Restart behaviour:**

| Context | Result |
| --- | --- |
| **Engine / tests** (`GameSession.save()` + `loadCampaign()`) | Portraits survive a restart. Tested: a new session over the same save and store serves the same Gallery and roles |
| **Current Play UI** (`src/ui/play.ts`) | Starts `createUIPlaytestSession` ("Disposable campaign; no saves"): fixed `campaign_id = "ui_playtest"`, store at `saves/ui_playtest/portraits/ui_playtest/…`. There is **no save or load route and no enabled Save button.** **Every UI restart loses all campaign state, including portrait metadata, while the image files stay on disk as orphans** |

**Dangers:**

| Danger | Status |
| --- | --- |
| Losing images on restart | **Yes, in the current Play UI** (no save/load exposed). Not in the engine |
| Absolute paths breaking | No: relative, name-only metadata |
| Orphaned images | (a) Every UI restart orphans all generated files. (b) A failed delete is logged as `orphaned_asset`. (c) Saving older revisions or reverting a save can leave files no metadata references. **There is no garbage collection** |
| Duplicated assets | None: each version is a unique file; roles reference, never copy |
| Save files becoming huge | No: bytes are never in the save; ≤ 64 versions × ≈ 200 B per character |
| Same `campaign_id` reused | Every Play UI session reuses `ui_playtest`, so new files mix with old orphans in one folder. Version IDs are random, so no collision, but disk use grows without bound |

---

# Error handling

| Situation | Current behaviour | Where |
| --- | --- | --- |
| Provider HTTP errors | Mapped to safe codes: 401/403 auth, 402 credits, 429 rate-limited, 400/404/413 unsupported, 408/524 timeout, **≥ 500 → provider_unavailable (incl. 504)**, other → invalid_provider_response | `image-client.ts` `#httpError` (131) |
| **Content refusal (fal 422 `content_policy_violation`)** | **Not recognised.** 422 → `invalid_provider_response` ("returned an unusable response") | same |
| **Retries** | **None** (no client retry, no session retry); the batch simply counts failures | `game-session.ts` 262–280 |
| Partial batch | Successes kept and committed in one revision; message "N of 3 …"; 0/3 → error, nothing changed | same |
| Timeout | Client 120 s timeout, raced against abort | `image-client.ts` |
| Invalid image bytes | Strict base64, a 15 MB cap, a signature check, and a declared-type match | `decodeImage` |
| Concurrency | One batch per session; appearance, roles, delete and reference are locked during a batch; the commit waits for idle and re-checks the fingerprint | `game-session.ts` |
| Diagnostics | `portrait_log({code, status})` → `console.warn`; never bodies or keys | `production.ts:75` |
| Seeds | **Never sent**, so a refusal cannot be retried "with a new seed"; every call is random anyway | — |

---

# Save/load dependencies

**Must eventually be serialized (it already is, inside `CampaignSnapshot`, by the existing engine save):**

- `characters[].profile.appearance` (the prompt source);
- `premium_characters[]` (NPC+ status and eligibility);
- `households` (eligibility);
- `portraits[]`: Gallery metadata, roles and the reference pointer.

**Belongs in the save as references only:** image **file names** and metadata. The bytes are not saved; they stay in `<save_dir>/portraits/…`.

**Must not go into the save:**

- image bytes and data URLs;
- asset tokens (derived);
- prompt text (derived; only a fingerprint and version);
- the HF token;
- provider responses;
- per-session busy state.

**Current persistence mechanisms:**

- `FileCampaignRepository` (atomic save with a previous slot) via `GameSession.save()` and `GameSession.loadCampaign()`;
- `PortraitAssetStore` for files.

**Both work and are tested, but the Play UI uses neither:** it runs a disposable campaign and offers no save or load.

**What is lost today when Caldrevan (the Play UI) restarts:** the whole campaign, meaning the conversation, characters, NPC+ appearance edits and portrait metadata. The portrait **files** remain on disk, unreferenced.

**Coupling to watch when save/load arrives:**

- The asset store path is derived from `save_dir` **and** `campaign_id`. Saving under a different campaign ID, or copying a save without its `portraits/<campaign_id>/` folder, breaks image resolution. The images then show as missing, but are not corrupted.
- The save/previous-slot rotation has no matching rotation for portrait files. Loading the previous slot can reference files the current slot deleted, or leave orphans.

---

# Dead/experimental code

| Item | Status |
| --- | --- |
| `src/campaign/anime-portrait-tags.ts` (`buildAnimePortraitTags`, `buildAnimeBenchmarkPrompt`) | **Experimental, unused by production.** Built for the OpenRouter anime benchmark. Partly superseded: Raena uses natural language with the trigger "Anime illustration of"; the booru tag line was benchmarked only on OpenRouter models |
| `src/campaign/portrait-prompt.ts` V1 head ("realistic dark-fantasy setting…") | **Active but stylistically obsolete:** v1 is anime-only. `PORTRAIT_NEGATIVE_PROMPT` is shown in the editor but **never sent** (OpenRouter has no negative-prompt field) |
| `src/llm/openrouter/image-client.ts` | Active; becomes **replaceable** under the v1 decision. Its `PortraitImageGenerator` interface, `decodeImage`, `sniffImage` and `ImageGenerationError` are reusable |
| `CALDREVAN_PORTRAIT_MODEL / _RESOLUTION / _ASPECT_RATIO` | OpenRouter-specific configuration |
| Drawer Upload / Generate / Edit NPC+ buttons (`index.html:47,51`) | **Dead placeholders** (disabled, unwired) |
| `scripts/anime-portrait-benchmark*.mjs`, `saves/portrait_benchmark_anime/`, `saves/portrait_probe/` | Research artifacts (scripts committed; `saves/` gitignored) |
| Legacy `active_version_id` decoding (`validation.ts`) | Intentional V1-save compatibility; keep it |
| `OpenRouterImageClient.validate()` "send `n` only if advertised" | Specific to OpenRouter capability records |
| Duplicates | None in-app. The Python HF harness on the Desktop duplicates concepts (capture, billing, retries) outside the repo, as research tooling |

---

# Risks

1. **Provider swap at the seam.** `PortraitImageGenerator.generate()` takes `{prompt, references}` and has no seed, negative prompt, size, model/LoRA or style. The HF / fal stack needs:
   - `seed` (for the refusal retry);
   - `negative_prompt`;
   - `width` / `height` (992² vs 800×1200);
   - the LoRA model ID.

   The interface must widen, and every fake generator in the tests changes with it.
2. **Node has no official HF Python client.** The decided stack was validated with `huggingface_hub.InferenceClient` (Python), but the app is TypeScript/Node. The options:
   - **`@huggingface/inference`** (official JS SDK). Its LoRA handling and fal parameter mapping must be **re-verified** in JS; it was only checked in Python.
   - **Raw HTTP** to `router.huggingface.co/fal-ai/fal-ai/qwen-image` with the payload proven in the research (`prompt`, `image_size`, `seed`, `negative_prompt`, `loras`). Simpler and fully controllable, but it re-implements the router contract.

   **The project convention favours raw HTTP.** There is exactly **one runtime dependency (`yaml`)**, `@huggingface/inference` is **not installed**, and every existing provider client (OpenRouter LLM and image) uses plain `fetch` with its own timeout and error mapping.

   **The catch:** with raw HTTP the app must build the LoRA entry itself, from HF's provider mapping (`GET /api/models/<id>?expand[]=inferenceProviderMapping` → `adapterWeightsPath`). The Python SDK did that automatically.
3. **Avatar vs Full Body semantics change.**
   - **Today:** every image is a 2:3 full-body render, and the Avatar is a crop of one of them.
   - **v1:** separate **avatar** (992×992, bust-up) and **full-body** (800×1200) generations.

   That needs a per-version **kind / framing** and size, two generate actions or a mode, and a decision on whether an avatar-framed image may be assigned to the Full Body role.
4. **Prompt replacement and staleness.** Switching to the anime / Raena prompt changes every fingerprint, so **every existing image becomes "older appearance"**. That is correct, but visible. `PORTRAIT_PROMPT_VERSION` should bump.
5. **Content refusals.**
   - **422 is currently "unusable response".** It needs its own code, a one-time retry with a new seed, and a player message.
   - **Queue endpoints:** an output-stage refusal can surface as an SDK `KeyError 'images'`, seen in research with the fal queue endpoints.
6. **The batch of 3 and the refusal rate.** Up to 25% of Raena avatars with deep necklines were refused in research. 3 parallel calls plus a retry per refusal can mean up to 6 calls per click. Bound it per batch.
7. **Billing and cost recording.** HF returns no dollar cost, only `x-fal-billable-units` (on the POST for `qwen-image`). The `cost_usd` semantics change: computed from units × price, not provider-reported.
8. **Orphans and persistence.** The Play UI loses metadata every restart. The image integration should not be judged done until save/load or at least a persistent campaign exists, or generated images will look "lost".
9. **Licence.** Raena (apache-2.0) and Qwen-Image (apache-2.0) are fine. The Krea / FLUX research models are not relevant now.

---

# Gaps versus decided v1 stack

**What exists and should be kept:**

- the appearance editor and resolver;
- the Gallery, roles, batch-of-3 orchestration and locking;
- staging and finalizing files with a single metadata commit;
- opaque asset serving;
- delete safety and the lightbox;
- Avatar on compact surfaces;
- stale markers;
- the `PortraitImageGenerator` seam.

**What must change:**

| Area | Change needed |
| --- | --- |
| **Provider** | HF-routed fal-ai, `HF_TOKEN`, model `Raelina/Raena-Qwen-Image` (the LoRA is attached by HF's mapping; trigger "Anime illustration of"), replacing OpenRouter |
| **Request shape** | Seed, negative prompt and size per call |
| **Prompting** | An anime / Raena prompt with avatar vs full-body framing and prompt-based pose and expression |
| **Error policy** | Bounded retry for 504 / 5xx / 429; a content-refusal code with one retry using a fresh seed |
| **Metadata** | Seed, provider, kind (avatar / full body), size, billable units and the exact prompt per version |
| **UI** | Separate avatar and full-body generation (or a framing choice), clearer per-call progress and refusal messaging |
| **Persistence** | A persistent campaign or save/load, outside this integration but a prerequisite for images surviving restarts |

**Not core (optional):** a Multiple-Angles turnaround, a sal076 moe style, pose-reference systems.

The detailed table is in `docs/image_system_v1_gap_analysis.md`.
