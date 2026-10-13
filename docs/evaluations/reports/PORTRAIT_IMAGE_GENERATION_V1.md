# Portrait Image Generation V1

**Date:** 2026-10-07.
**Follows:** `PERMANENT_APPEARANCE_V1.md` (`bde57fe`), `PERMANENT_APPEARANCE_EDITOR_BROWSER_QA.md` (`808d6ba`) and `PORTRAIT_PROMPT_BUILDER_V1.md` (`94e20c0`).

This pass connects the deterministic `ResolvedPermanentAppearance → PortraitPrompt` pipeline to real image generation through OpenRouter's dedicated Image API, for managed NPC+ characters. **Exactly one paid call was made: the authorized live probe, $0.018.**

## 1. Official OpenRouter docs checked

| Document | What it contributed |
| --- | --- |
| `docs/guides/overview/multimodal/image-generation.md` (Image Generation guide) | Discovery, request and response shape, `input_references`, billing |
| `docs/api/api-reference/images/generate-an-image.md` (OpenAPI reference) | Status codes: 400, 401, 402, 403, 404, 413, 429, 500, 502, 524, 529 |
| `docs/llms.txt` index | Page discovery |

The confirmed contract:

- **Endpoint:** `POST https://openrouter.ai/api/v1/images`, with `model` and `prompt` required.
- **Response:** `data[].b64_json`, `data[].media_type` whenever the format is identifiable, and optional `usage.cost`.
- **References:** `input_references` takes `[{ type: "image_url", image_url: { url } }]`, where `url` is HTTP(S) or a base64 data URL.
- **Capability descriptors:** `enum`, `range` or `boolean`. An absent key means the endpoint does not support that parameter.
- **Billing is all-or-nothing.** A failed generation is not billed and surfaces as a 502.
- **There is no negative-prompt parameter** anywhere in the request table.

## 2. Live capability discovery (free; recorded before implementation)

**`GET /api/v1/images/models`** listed 59 image models. The Seedream 5.0 entries:

| Model | Resolution | `n` | Reference images |
| --- | --- | --- | --- |
| `bytedance-seed/seedream-5-0-flash` | 1K, 2K | 1 | 0–14 |
| `seedream-5-0-lite` | 2K, 4K | 1–4 | — |
| `seedream-5-0-pro` | 1K, 2K | — | — |

**`GET /api/v1/images/models/bytedance-seed/seedream-5-0-flash/endpoints`** returned one endpoint:

- **Provider:** `seed`.
- **Supported parameters:**
  - `resolution`: `["1K", "2K"]`;
  - `aspect_ratio`: includes `2:3` and `3:4`;
  - `n`: 1–1;
  - `input_references`: 0–14;
  - `seed`: boolean.
- **Pricing:** `output_image` $0.018 per image; `input_image` $0 per image.
- `allowed_passthrough_parameters: []` and `supports_streaming: false`.
- **No negative-prompt parameter is advertised.**

## 3. Model choice

The default is Seedream 5.0 Flash: a cheap single-image generation and editing model that accepts references, which suits frequent single-subject reference portraits. The architecture is not tied to it: the model, resolution and aspect ratio are configuration, validated against the live endpoint record.

## 4. Exact model slug

`bytedance-seed/seedream-5-0-flash`. The dated slug `…-20261001` given in the brief **does not exist** in the live catalog, so it was not used.

## 5. Resolution and aspect ratio

1K at **2:3**. Both are advertised, and 2:3 suits a full-body figure. 2K is not the default.

The defaults can be overridden with `CALDREVAN_PORTRAIT_MODEL`, `CALDREVAN_PORTRAIT_RESOLUTION` and `CALDREVAN_PORTRAIT_ASPECT_RATIO`. Every override is validated against the live capabilities before any generation.

## 6. Current pricing structure

$0.018 per output image and $0 per input reference image, both from the live endpoint record. The game never estimates cost; it records `usage.cost` only when the provider returns it.

## 7. Provider client

`src/llm/openrouter/image-client.ts` defines `OpenRouterImageClient`, which implements the injectable `PortraitImageGenerator` seam. Its responsibilities:

- Fetch the live per-endpoint capability record once per client and cache it in memory; a failed lookup is retried on the next use.
- Validate the configured resolution, aspect ratio, `n` and the reference count.
- Send `POST /images` with a dedicated **120 s** timeout. The request is raced against the abort signal, so the bound holds even if the transport ignores cancellation.
- Map errors to safe codes and decode and validate the returned image.

It knows nothing about campaigns, characters, storage or the UI. The key comes from `OPENROUTER_API_KEY` and is read per request; it is never logged, returned or stored.

## 8. Request and response shape

**Request:**

```
{ model, prompt, n: 1, resolution: "1K", aspect_ratio: "2:3", input_references?: [{ type: "image_url", image_url: { url: "data:<type>;base64,…" } }] }
```

The `prompt` is the server-built `PortraitPrompt.prompt`, sent **unchanged**.

**Response handling:**

- `data` must contain exactly one image with a non-empty `b64_json`.
- `media_type` is captured if present.
- `usage.cost` is captured if present.
- The model and the local latency are recorded.
- A remote image URL is never required.

## 9. Negative-prompt handling

**Omitted.** Neither the Image API nor the model's endpoint has a negative-prompt field, and the brief says to omit rather than guess. The negative prompt still appears read-only in the editor preview. Its exclusions (no weapons, text or other people) are already present as fixed lines in the positive prompt.

## 10. Image validation

Before anything is written, the client checks:

- strict base64;
- at most 15 MB decoded;
- a byte-signature match: PNG, JPEG or WebP only;
- that a declared `media_type` agrees with the bytes.

SVG, other formats, empty data and corrupt data are rejected as `invalid_image`. Nothing is ever named `.png` without proof.

## 11. Storage layout

`src/app/portrait-store.ts` defines `PortraitAssetStore`. Files live at:

```
<save_dir>/portraits/<campaign_id>/<sha256 character token>/<portrait_N_hex | reference_hex>.<png|jpg|webp>
```

In production that is `saves/portraits/…`, which is gitignored.

- **No raw IDs or names on disk.** The character directory is a hash, not a character ID or name.
- **Store-generated file names.** They are validated by pattern, and every resolved path must stay inside the root.
- **Safe writes.** Each image is written to a private `.tmp-*` file first and only then renamed into place, never over an existing portrait.

## 12. Portrait persistence model

An optional additive snapshot extension, alongside `price_indices` and `mannerism_learning`:

```
portraits?: [{ character_id, active_version_id?, versions: CharacterPortraitVersion[≤64], reference? }]
CharacterPortraitVersion = { version_id, prompt_version, prompt_fingerprint, model, created_at, media_type, asset_file, cost_usd?, reference_used? }
CharacterPortraitReference = { media_type, asset_file, uploaded_at }
```

There are two narrow campaign commands, handled in `src/campaign/portraits.ts`:

- `record_portrait` appends a version and makes it active;
- `set_portrait_reference` sets or removes the reference.

Both are validated, including the formats of file names, fingerprints, models, timestamps and costs. The controller schema does not include them. **Nothing is stored in `CharacterProfile`.**

## 13. Save-schema impact

**No version bump.** The field is optional and additive, like the earlier extensions. Older saves load with portraits absent, and nothing is invented for them. Image bytes are never written into the save JSON.

## 14. Versioning

- The first generation becomes version 1 and is active.
- Each regeneration adds a version and makes it active **only after** the provider call, the file finalize and the metadata commit have all succeeded.
- Earlier files are never overwritten or deleted.
- Version IDs look like `portrait_<n>_<random hex>` and are never names.
- There is a limit of 64 versions per character.

## 15. Prompt fingerprint and staleness

Every version stores the fingerprint of the exact preview prompt it was generated from. A portrait is **stale** when that fingerprint differs from the fingerprint of the current committed prompt.

When an appearance save makes the portrait stale, the old portrait stays visible with the status "Appearance changed since this portrait was generated." Regeneration is never automatic.

## 16. Generation mutation API

`GameSession.generateNpcPortrait({ ref, expected_revision })` is the only generation entry point. Before any provider call it checks:

- that the session is open and no turn is running;
- the portrait lock, so only one generation runs per session;
- that the revision is the one the editor opened with;
- that the ref belongs to an eligible managed NPC+ that is active, a member of a household Nicco owns, and not Nicco.

The server then builds the prompt from the committed appearance. It reads the reference file, if one is attached, from the store, never from a URL.

`setNpcPortraitReference({ ref, expected_revision, image })` attaches a reference, or removes it when `image` is `null`.

`readPortraitAsset(token)` serves stored files by opaque token.

## 17. Network and state atomicity

The steps run in this order:

1. Validate the request.
2. Build the prompt.
3. Call the provider.
4. Decode and validate the image.
5. Stage the temporary file.
6. **Wait until the session is idle,** so a portrait commit never lands under a running turn.
7. Re-check eligibility, and that the prompt fingerprint is unchanged.
8. Finalize the file.
9. Run `prepare` and `commit` **synchronously,** at the current revision (a rebase when only unrelated state changed).
10. Expose the new portrait.

Failure behavior at each point:

| Failure point | Result |
| --- | --- |
| Before the provider call | No call is made and no cost is incurred |
| Provider error | Nothing is written |
| After staging | The temporary file is discarded |
| After finalize, before commit | The finalized file is removed |

In every failure case the campaign revision, the metadata and the active portrait are unchanged.

## 18. Concurrency

- One generation runs per session at a time; a second request returns "already being generated".
- The character's appearance is locked while its generation runs, so `updateNpcAppearance` is refused for that character.
- Turns are **not** blocked; the commit waits for the session to be idle instead.
- Unrelated state, such as a location correction, may change during a generation; the commit rebases onto it, and a test covers this.

## 19. HTTP routes

| Route | Body | Responses |
| --- | --- | --- |
| `POST /api/portrait/generate` | `{ ref, expected_revision }` | 200 OK; 409 stale or busy; 502 provider failure; 422 refused |
| `POST /api/portrait/reference` | `{ ref, expected_revision, image: { data_base64 } \| null }` | Body capped at 6 MB; the reference itself at most 4 MB |
| `GET /api/portrait/asset/<32 hex>` | — | The file, or 404 |

The browser **never** supplies the prompt, model, path or character ID. Extra fields are ignored, and a test sends `prompt` and `model` and checks they have no effect. The existing loopback and same-origin guards apply to all three routes.

## 20. Asset serving

The URL token is `sha256(campaign:character:file)`, so no ID, name or path can be derived from it. The server only matches tokens against the **current** campaign's metadata.

- Traversal attempts, unknown tokens and other campaigns' tokens all return 404.
- Responses use the stored media type with `nosniff` and `no-store`.

## 21. UI states

**Editor portrait column:**

- the placeholder with "No portrait yet" and a **Generate portrait** button;
- **Generating…**, with the buttons disabled, a status line, and double-submit blocked;
- the image at a 2:3 frame with **Regenerate**;
- "Portrait N of M · model" metadata;
- the stale status;
- an inline error, with the old image kept;
- **Reference** and **Replace reference**, with "Reference attached" and a **Remove reference** link.

A quiet note explains that each click generates one image from the saved appearance, and that a reference only guides the look and never changes the appearance.

**Household card:** shows the active portrait in place of the initial. There is no model picker and no automatic generation.

## 22. Regenerate

Regenerate rebuilds the prompt from the **current** committed appearance, using the current fingerprint and the attached reference if there is one. It adds a new version, keeps the old ones and clears the stale status.

## 23. Reference support

**Implemented,** with a maximum of one image:

- PNG, JPEG or WebP, at most 4 MB, signature-checked server-side;
- stored as a local file and recorded with bounded metadata;
- sent as a base64 data URL in `input_references`, and never as a user URL, so there is no SSRF path;
- used consistently by every generation while attached; versions record `reference_used`;
- removable.

It is guidance only: there is no vision extraction and nothing is written back to appearance.

## 24. Failure behavior

| Failure | Message shown to the player |
| --- | --- |
| Missing key | "set OPENROUTER_API_KEY and restart" |
| 401 / 403 | Key rejected |
| 402 | Insufficient credits |
| 429 | Rate-limited |
| Timeout (or 408 / 524) | Timed out |
| 400 / 404 / 413, or a configuration the model doesn't support | Unsupported configuration |
| 5xx | Provider failed |
| Malformed JSON or a missing image | Unusable response |
| Corrupt image or wrong type | Unusable image |
| Storage error | Could not be stored |
| Stale revision | Reopen the editor |
| No longer eligible | Character can no longer be edited |
| Appearance changed during generation | Not saved; generate again |

Provider bodies are never shown. The server log receives the error code and HTTP status only. In every case the existing portrait stays visible, unsaved appearance edits stay intact, and no portrait state changes.

## 25. Security and privacy

- **The key never leaves the server.** It is read only on the server and is never in the UI, logs, saves or reports.
- **No paths or IDs reach the browser.** Filesystem paths, asset file names and internal IDs never appear in UI payloads; tests and the browser QA check this.
- **The prompt is the bounded V1 prompt.** It contains no private notes and no hidden canon, as already tested in the prompt builder.
- **Uploads are validated.** They must be images within the size limit and are never URLs.
- **The asset route is traversal-safe.**
- **Derived media only.** A generated image never mutates appearance; tests show the character record, households, NPC+ and relationships are unchanged after generation.

## 26. Save, reload and restart

Portrait metadata persists through save and reload. After a restart, a new `GameSession` over the same save and portrait store serves the same image; this is tested. Old saves have no portrait.

## 27. Browser QA

The QA ran in headless Edge against the real Play UI, with a **fake** generator (no provider calls) that returns the probe JPEG after 2.5 s and fails on its second call with a 402. Viewports were 1440, 1024 and 390.

Verified states:

1. no portrait;
2. generating, where a double click sent **one** call;
3. generated: the image displays and the header still says Mira;
4. the Household card shows the portrait;
5. stale after an appearance save;
6. a failed regenerate keeps the old image and shows "The image provider reports insufficient credits.";
7. a reference attached through the real file input;
8. regenerating with the reference (the fake recorded `references: 1`);
9. the 1024 and 390 px layouts.

Across all states there was no horizontal overflow, no path, ID or key in the DOM, the sticky Save stayed visible at desktop widths, and the prompt boxes were unchanged.

One fix came out of the QA: the editor frame used a fixed 420 px height, which letterboxed the 2:3 image. It now uses `aspect-ratio: 2/3`, and the image fills the frame.

Screenshots `20-…` to `28-…` are in `docs/ui-screenshots/appearance-editor/`.

## 28. Tests

**New: `tests/portrait-image.test.ts`, 9 tests.**

- The client:
  - the exact request body (prompt unchanged, no negative prompt);
  - the reference data-URL shape;
  - cached capabilities;
  - decoding and cost;
  - missing cost left unknown;
  - 401, 402, 429, 500, 502, 400 and 524;
  - malformed JSON, an empty data array and two images;
  - blank, corrupt or non-image data, a type mismatch and SVG;
  - timeout;
  - a missing key (no request sent);
  - an unsupported configuration (never generates).
- The Mira session flow:
  - the provider receives the previewed prompt exactly;
  - file and metadata, fingerprint and cost;
  - appearance and identity unchanged;
  - no leaks;
  - save, reload and restart.
- Staleness, a failed generation with nothing changed, and regenerate keeping the old version.
- Stale revision and bad refs never reach the provider, plus the concurrency lock and the rebase.
- Nicco and unmanaged characters are rejected.
- References: validation, consistent use and removal.
- Asset access: tokens, traversal, cross-campaign reads, and old saves.
- The HTTP routes: a browser-supplied prompt is ignored, the asset is served, traversal returns 404, and a stale request returns 409.

**Updated: `tests/ui-v1.test.ts`.**

- A new portrait UI flow: generation only on an explicit click; ref and revision only; double-submit blocked; generating state; success; failure keeps the image; the Household card image.
- The editor HTML assertion was updated.

**Results:**

- Focused (portrait image and prompt, appearance, projection, UI, name, provenance, persistence, save hardening, application closure and Household): **195 passed, 0 failed.**
- Full suite: 2557 tests, 2554 passed, **0 failed**, 3 TODO (pre-existing known-limitation tests).
- Typecheck: PASS. Build: PASS.

## 29. Paid calls

**1**: the single authorized live probe. Capability discovery and the docs are free GET requests. All tests and the browser QA used local fakes.

## 30. Live-probe cost

**Recorded before the call:**

| Item | Value |
| --- | --- |
| Model | `bytedance-seed/seedream-5-0-flash` |
| Resolution / aspect ratio | 1K, 2:3 |
| Advertised price | $0.018 per output image, $0 per input image |
| Why one call was needed | Mocks cannot prove the real response shape, bytes, media type and cost field end to end |

**Result:**

- The call succeeded in about 14 s with `usage.cost` **$0.018**.
- It returned a JPEG of 786×1176, 144 KB.
- The file was stored, the metadata committed, and the image was served back through the token route.
- A visual check confirmed a single full-body figure on a plain grey background, with no weapon and no text. Quality was not judged.
- The probe campaign and image are kept at `saves/portrait_probe/` (gitignored).

## 31. Changed files

**New:**

- `src/llm/openrouter/image-client.ts`
- `src/app/portrait-store.ts`
- `src/campaign/portraits.ts`
- `tests/portrait-image.test.ts`
- `PORTRAIT_IMAGE_GENERATION_V1.md`
- `docs/ui-screenshots/appearance-editor/20-…` to `28-…`

**Modified:**

- `src/campaign/types.ts`: portrait types, the snapshot extension and the commands
- `src/campaign/validation.ts`: portrait parsers and commands
- `src/campaign/campaign-state.ts`: dispatch and ordering
- `src/campaign/portrait-prompt.ts`: an exported `portraitFingerprint`; prompt content is unchanged
- `src/app/game-session.ts`: generate, reference, asset lookup and the lock
- `src/app/player-character-view.ts`: portrait status and URLs
- `src/app/app-errors.ts`: the `portrait_generation_failed` code
- `src/app/production.ts`: the generator, store and log wiring
- `src/ui/server.ts`, `src/ui/client.js`, `src/ui/index.html`, `src/ui/style.css`
- `tests/ui-v1.test.ts`

## 32. Deferred V2 work

- Quality benchmarking across models.
- 2K output.
- A version-history picker ("Use this portrait") and image deletion or garbage collection; there is currently no cleanup of old versions.
- More than one reference.
- Per-character model selection or a model picker.
- A live preview of unsaved appearance.
- Showing the portrait in the character drawer and the scene sidebar.
- A seed parameter.
- Startup capability prefetch.
