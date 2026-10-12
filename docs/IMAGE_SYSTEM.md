# Image system

Status: Current. Last reconciled: 2026-10-12 (main c0608a6). Source of truth: `src/app/image-stack.ts`, `src/llm/huggingface/fal-image-client.ts`, `src/app/item-sprite-jobs.ts`, `src/app/canon-avatars.ts`, `src/app/character-capabilities.ts`, `src/app/item-visuals.ts`. Superseded by this document: `docs/image_system_audit.md`, `docs/image_system_v1_gap_analysis.md`.

## Principles

Images are **presentation only**. They never become narrative truth and never reach the narrator or the controller. Portrait and sprite bytes live in the asset store; only metadata is in the save.

## Generation stack

- Hugging Face router, provider `fal-ai`, endpoint `fal-ai/qwen-image`, base `Qwen/Qwen-Image` plus the `Raelina/Raena-Qwen-Image` anime LoRA (scale 1, trigger "Anime illustration of"). Billed to `HF_TOKEN`; OpenRouter is not used for images.
- Avatar 992 × 992, Full Body 800 × 1200.
- Each click produces a batch of three with unique seeds. Gallery limit 64 per character. One Avatar and one Full Body are selected per character.
- Appearance fingerprint: images made from an older appearance are marked stale.
- Age never gates portrait generation (decision 2026-10-12, IMG-1): minor, unknown or missing age generate normally; `generation_blocked` stays for non-age reasons only. The romance gate is a separate rule and is unchanged. One recovery attempt after a content refusal; no automatic provider retries otherwise.
- Reference images are not used for generation (text-to-image has no reference input); a reference attached earlier is kept, unused.

## Who can have visuals

Capabilities are derived per tier ([Current state §5](CURRENT_STATE.md#5-character-tiers)):

- **NPC+** and the **player (Nicco)** share the same editor: Avatar, Full Body, Gallery, generation, appearance editing. Nicco's surfaces are the editor and the navigation portrait; his Full Body also appears in the inventory figure.
- **Canonical authored NPCs** (six, `data/canonNPCAvatar/`) show an authored avatar through a registry keyed by stable character id. The browser receives only opaque tokens, so identity masking is respected. Precedence: selected NPC+ avatar > canon avatar > placeholder. The PNGs are about 2.3 MB each and served as full-size originals (known performance debt; no thumbnails).
- **Campaign NPCs** have no image workflow.
- **Upload is not available:** `AVATAR_UPLOAD_SUPPORTED` is `false`, so no Upload control is rendered. There is no upload pipeline.

## Item sprites

Engine-created items can receive a generated sprite through the same stack and storage, queued between turns (`ItemSpriteJobs`): metadata commits are synchronous and allowed only between gameplay turns, with no gameplay await and no automatic retries. A quality reviewer (`anthropic/claude-haiku-5.5`) checks results. Sprites are non-authoritative.

Item artwork resolves per role (icon, detail): item sprite > authored template registry (currently empty: no `/assets/items/` route or files exist yet; `src/app/item-visuals.ts`) > category glyph (`/api/item-glyph/<kind>`) > placeholder.
