# Configuration and environment

Status: Current. Last reconciled: 2026-10-12 (main c0608a6). Source of truth: `src/app/production.ts`, `src/app/provider-config.ts`, `src/app/image-stack.ts`, `src/ui/play.ts`, `src/llm/openrouter/*`, `src/llm/huggingface/*`. Never put a key in the repo, a doc, a save or a log.

## Environment variables

| Variable | Required | Effect |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | yes, for live play | Narrator, State Controller, mannerism extractor, reflection, compressor and sprite reviewer. Read per request, never copied or logged. |
| `OPENROUTER_NARRATOR_MODEL` | no | Overrides the narrator model (default `z-ai/glm-5.2`). |
| `OPENROUTER_CONTROLLER_MODEL` | no | Overrides the controller model (default `openai/gpt-6-luna`). |
| `OPENROUTER_CONTROLLER_FALLBACK_MODELS` | no | Comma list for OpenRouter's native `models` fallback, or `none`. Unset = `anthropic/claude-haiku-5.5`. |
| `MANNERISM_EXTRACTOR_MODEL` | no | Independent extractor model (default `openai/gpt-6-luna`); never inherits the controller setting. |
| `CALDREVAN_REFLECTION_MODE` | no | `off` (default) or `shadow`; anything else throws. Producer OFF means no calls and no new notes; validated persisted notes stay Narrator-visible (soft-promoted). |
| `CALDREVAN_MANNERISM_LEARNING`, `CALDREVAN_PORTRAIT_GENERATION`, `CALDREVAN_ITEM_SPRITES`, `CALDREVAN_SPRITE_QA`, `CALDREVAN_SEMANTIC_RETRIEVAL` | no | `on`/`off` switches for the other optional services (defaults: on, on, on, **off**, **off**). Resolved once by `resolveOptionalServices`; an explicit `optional_services` option wins. Never saved. See [Optional services](architecture/OPTIONAL_SERVICES.md). |
| `OPENROUTER_REFLECTION_MODEL` | no | The qualified reflection adapter accepts only its default (`anthropic/claude-haiku-5.5`). |
| `CONTEXT_COMPRESSOR_MODEL` | no | Optional model for the context compressor; unset means the lossless compactor only. |
| `HF_TOKEN` | for images | Hugging Face token with Inference Providers access. Read per request, never logged. Absent: image generation fails with a clear message and the UI reports it. |
| `VOYAGE_API_KEY`, `CALDREVAN_EMBEDDING_ADAPTER` | no | Only for opt-in semantic retrieval (dev inspection tools). Lexical retrieval is the default and needs no key. |
| `CALDREVAN_PORTRAIT_MODEL`, `CALDREVAN_PORTRAIT_RESOLUTION`, `CALDREVAN_PORTRAIT_ASPECT_RATIO` | no | Legacy knobs of the superseded OpenRouter image client (`src/llm/openrouter/image-client.ts`). Production no longer uses it; images go through `HF_TOKEN`. |

## Narrator output budget

Ordinary cap `NARRATOR_OUTPUT_TOKENS = 768` (`src/app/provider-config.ts`, no env override); the single truncation-recovery regeneration uses 1024 (`NARRATOR_RECOVERY_OUTPUT_TOKENS`). Model, route (`z-ai/fp8`, no fallbacks), reasoning and Controller are unchanged. Hard per-turn bounds: 2 logical Narrator generations, 3 physical provider attempts.

## Non-environment configuration

`config/economy.yaml` (P8 reference prices, loaded by `src/economy/economy.ts`; anchors may be in silver, settlement is gold only) and the six alternate narrator ids in `src/app/narrator-alternatives.ts` (UI comparison selector only: not defaults, not environment-configurable).

## Default models

See the topology table in [Current state](CURRENT_STATE.md#4-current-model-topology-verified-in-code). The Narrator uses a fixed provider route with no fallbacks; the Controller has a native fallback. Earlier models (MiniMax M2-her, DeepSeek, Qwen controllers) are historical and referenced only in old reports and benchmark scripts.

## Running

| Command | Meaning |
| --- | --- |
| `npm run play:ui` | Local web UI on `127.0.0.1:3000`. Default: **persistent campaigns** under `saves/campaigns/<campaign_id>/`, start screen, manual Save, autosave, save on Ctrl+C. |
| `npm run play:ui -- --port=4000` | Different port. |
| `npm run play:ui -- --playtest` | Disposable `ui_playtest` session under `saves/ui_playtest/`; never saved, discarded on shutdown. |
| `npm run play` | Terminal dev harness. |

## Saves

Snapshot schema 7, save file schema 7 ([Persistence](architecture/PERSISTENCE.md)). Portraits live inside each campaign folder. Derived data is never saved.
