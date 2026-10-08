# Image system: v1 gap analysis

**Baseline:** repo `3123656`. **Decided v1:** `Raelina/Raena-Qwen-Image` via Hugging Face Inference Providers, `fal-ai` pinned, `HF_TOKEN`.

The details behind each row are in `docs/image_system_audit.md`.

## Core

| FEATURE | CURRENT | REQUIRED V1 | GAP | FILES LIKELY AFFECTED |
| --- | --- | --- | --- | --- |
| Credential | `OPENROUTER_API_KEY` read per request by `OpenRouterImageClient`; no HF references in `src` | `HF_TOKEN` from the environment, never logged or stored | New env handling + a "not configured" message | new `src/llm/huggingface/…` client; `src/app/production.ts`; `src/app/game-session.ts` (PORTRAIT_MESSAGES) |
| HF routed inference | None | `POST https://router.huggingface.co/fal-ai/<providerId>` (raw `fetch`, matching the repo convention; no SDK installed) | New provider client implementing `PortraitImageGenerator` | new client file; `production.ts` |
| fal-ai pinned provider | OpenRouter only | Provider fixed to `fal-ai`; endpoint from HF's live provider mapping (`fal-ai/qwen-image`) | Mapping lookup (cached) + pinning | new client; maybe `provider-config.ts` |
| Raena model | Default `bytedance-seed/seedream-5-0-flash` (`portraitImageConfig`) | `Raelina/Raena-Qwen-Image` | Configuration change (keep an env override) | new client; `production.ts`; `image-client.ts` (config type) |
| Style trigger / LoRA | No style concept; realistic V1 prompt head | Trigger "Anime illustration of …"; LoRA `loras:[{path: <HF mapping adapterWeightsPath URL>, scale: 1}]` built by the client | New: LoRA entry construction + trigger in the prompt | new client; `src/campaign/portrait-prompt.ts` |
| Avatar generation | No avatar framing; the Avatar is a role on a 2:3 full-body image, CSS-cropped | Bust-up generation at 992×992 | **New kind / framing** + size per request; generate-avatar action | `portrait-prompt.ts`; `types.ts` + `validation.ts` (version `kind`/size); `game-session.ts`; `server.ts`; `client.js`; `index.html` |
| Full-body generation | Yes: 2:3 1K via OpenRouter `aspect_ratio` | 800×1200 head-to-feet via `image_size` | Size parameter instead of aspect ratio; framing kept | new client; `portrait-prompt.ts` |
| Prompts from NPC+ appearance | Yes: deterministic `buildPortraitPrompt` from 12 resolved fields (realistic dialect); unwired anime dialect in `anime-portrait-tags.ts` | Anime / Raena prompt from the same resolved appearance, adult-explicit, with "high-collared, modest neckline" for avatars | Rewrite the head/framing; reuse `portraitDetails`; bump `PORTRAIT_PROMPT_VERSION`. Existing images become stale (expected) | `portrait-prompt.ts`; `anime-portrait-tags.ts` (reuse or retire); `player-character-view.ts` (preview); tests |
| Prompt-based pose selection | None: one fixed `PORTRAIT_POSE` line | A pose/expression clause per generation (front, 3/4, hand on hip, hand near face, wink, kneeling + peace sign, cute/shy) | New pose presets + selection (UI + request); validated server-side (no free text from the browser, or bounded text) | `portrait-prompt.ts`; `game-session.ts`; `server.ts`; `client.js`; `index.html` |
| Seed generation | Never sent or stored | A random seed per call (`crypto.randomInt`), sent and recorded | Seed in the generator request + version metadata | `image-client.ts` interface; new client; `types.ts`; `validation.ts`; `game-session.ts` |
| Negative prompt | Built (`PORTRAIT_NEGATIVE_PROMPT`) but never sent | The shared negative prompt sent (supported by `fal-ai/qwen-image`) | Add it to the generator request | interface; new client |
| Bounded retries | None anywhere in the image path | Up to 2 retries with backoff for 429 / 5xx / timeouts | New retry loop (client level) | new client |
| 504 retry | 504 → `provider_unavailable`, no retry | Retried (it occurred under parallel load) | Covered by the bounded retry | new client |
| Content refusal + new-seed retry | 422 → `invalid_provider_response` ("unusable response") | Detect fal 422 `content_policy_violation` (not billed) → retry **once** with a fresh seed → else a clear "refused by the provider" | New error code + a one-time reseed path; a cap per batch | new client; `image-client.ts` (`ImageGenerationErrorCode`); `game-session.ts` (messages, batch loop) |
| Image asset persistence | Yes: `PortraitAssetStore` files under `<save_dir>/portraits/<campaign>/<hash>/`; staged and finalized; tested across restart | Same | **None** (keep). Caveat: the Play UI's disposable campaign orphans files on restart | — (Play UI persistence is a separate save/load task) |
| Image metadata persistence | Yes: `snapshot.portraits` (version: model, fingerprint, created_at, media type, file, cost?, reference_used?) | Plus seed, provider, kind/framing, size, pose preset, billable units, LoRA ID, exact prompt (or prompt version) | Additive optional fields (backward-compatible decode, as in V2) | `types.ts`; `validation.ts`; `portraits.ts`; `game-session.ts` |
| NPC+ link to the selected avatar / full body | Yes: `avatar_version_id`, `full_body_version_id` (roles, validated, no fallback) | Same; plus a rule for which kinds may take which role | A kind-aware role rule (for example, Full Body only from full-body images) | `portraits.ts`; `game-session.ts`; `player-character-view.ts`; `client.js` |
| Generation history / alternatives | Yes: Gallery `versions[]` ≤ 64; batch of 3; lightbox; delete; stale markers | Same (fits cleanly) | Show kind/pose per item; maybe filter avatar vs full body | `player-character-view.ts`; `client.js`; `style.css` |
| Loading / error UI state | Batch busy state + one status line + inline error; partial "N of 3" | Clear per-generation progress, refusal vs failure messaging, retry visibility | Better messages + states (refused, retried); maybe per-candidate progress | `client.js`; `index.html`; `style.css`; `game-session.ts` (outcome fields) |
| Cost recording | `cost_usd` only if the provider returned it (OpenRouter `usage.cost`) | Units from `x-fal-billable-units` (on the POST for `qwen-image`) × price ($0.02 for ≤ 1 MP) | Header capture + price table; "implied" semantics | new client; `types.ts` (fields) |
| Tests | 20 + 3 + 5 + 5 + 8 + UI tests around the OpenRouter fake generator | Same coverage for the HF client (fake fetch) + reseed / retry / refusal + kinds / poses | New client tests; generator fakes gain seed/size; prompt goldens regenerated | `tests/portrait-*.test.ts`, `tests/ui-v1.test.ts`, new `tests/hf-image-client.test.ts` |

## Optional (not core)

| FEATURE | CURRENT | REQUIRED V1 | GAP | FILES LIKELY AFFECTED |
| --- | --- | --- | --- | --- |
| Multiple-Angles turnaround | None | Optional later "Generate turnaround" from a Full Body (`fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA`, image-to-image queue endpoint, $0.035/view) | New image-to-image path (queue polling; units on the result GET) | new client; `game-session.ts`; UI |
| sal076 moe style | None | Optional per-NPC style switch (same endpoint and price) | A style field + model choice | prompt + metadata + UI |
| Pose-reference systems (AnyPose) | None | Not in v1 | — | — |
| Reference image | Yes: one per character, sent as `input_references` (OpenRouter) | `fal-ai/qwen-image` text-to-image has **no reference input** | **Behaviour decision:** keep the reference for a later image-to-image feature, or hide it in v1 (it would otherwise be stored but unused) | `game-session.ts`; `client.js`; `index.html` |
