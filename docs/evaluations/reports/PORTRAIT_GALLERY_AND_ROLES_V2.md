# Portrait Gallery + Avatar/Full-Body Roles V2

**Date:** 2026-10-07.
**Follows:** `PERMANENT_APPEARANCE_V1.md` (`bde57fe`), `PERMANENT_APPEARANCE_EDITOR_BROWSER_QA.md` (`808d6ba`), `PORTRAIT_PROMPT_BUILDER_V1.md` (`94e20c0`) and `PORTRAIT_IMAGE_GENERATION_V1.md` (`14be24c`).

This pass replaces V1's model, one active portrait plus a version history, with four pieces:

- a per-character **Gallery**;
- two player-controlled **roles**, **Avatar** and **Full Body**;
- **batch generation** of 3 candidates per click;
- a **fullscreen viewer** and **Gallery deletion**.

It is a portrait media, domain and UI pass only. Unchanged: permanent-appearance semantics, prompt semantics, the OpenRouter client, eligibility, identity and naming, narrator and controller logic. **No paid calls were made.**

## 1. Previous V1 portrait model

- **Persistence:** `portraits?: [{ character_id, active_version_id?, versions[≤64], reference? }]`.
- **Generate:** one click made one provider call. On success the version was appended and became `active_version_id`, so every regeneration replaced what was shown.
- **Staleness:** computed against the active version only.
- **Display:** the Household card showed the active portrait; the scene sidebar and the character drawer showed none.

## 2. New Gallery model

The Gallery **is** `versions[]`; there is no separate collection. Each item remains a `CharacterPortraitVersion` with its own receipt:

- `model`, `cost_usd?`, `created_at`;
- `prompt_fingerprint`, `prompt_version`;
- `reference_used?`;
- `media_type`, `asset_file`.

**Avatar** and **Full Body** are roles: optional pointers to Gallery versions of the same record. One image may be the Avatar only, the Full Body only, both, or neither.

## 3. Avatar semantics

- **What it is:** the compact, recurring portrait.
- **How it is set:** by the first-batch bootstrap (section 5), or by **Set as Avatar** on any Gallery image. The previous holder loses the role; no file is copied.
- **No clearing:** once set, the Avatar always points at a Gallery image. The player changes it by assigning another image; the UI has no Clear Avatar control and the domain has no clear command.
- **Shown in:** the Household card, the scene sidebar, the sidebar household roster and the drawer's compact portrait. These use `object-fit: cover`, and no crop file is made.

## 4. Full Body semantics

- **Never automatic:** the Full Body is always chosen by the player. It starts absent, and it is still absent after the first batch.
- **Set and clear:** **Set as Full Body** assigns it. **Clear Full Body** removes the role and deletes no image.
- **Shown in:** the editor's Full Body slot, using `object-fit: contain`.
- **No fallback:** when no Full Body is selected, the slot shows **"No Full Body selected"** and *"No image selected. Choose one from the Gallery."* It never renders the Avatar. A unit test, a client test and the browser QA each check this.

## 5. First-batch bootstrap rule

The automatic Avatar is assigned only when both conditions hold, both evaluated on the state **before** the batch:

- `galleryWasEmptyBeforeBatch`;
- `avatar_version_id` was absent.

A batch with 0 successes adds nothing, so the next successful batch is still the first and bootstraps then.

The bootstrap Avatar is part of the **same** metadata commit as the batch's versions, so there is no intermediate state with images and no Avatar.

The domain command enforces the rule as well. `record_portrait_batch` rejects an `avatar_version_id` unless the record has no versions and no Avatar, and unless the named version belongs to this batch.

## 6. Random Avatar selection

The Avatar is chosen uniformly among **this batch's successful candidates only**, using `node:crypto` `randomInt(count)`. No seed is persisted.

A `portrait_pick` dependency is a test seam only. Its result is bounds-checked, and an out-of-range index throws, which aborts the batch and cleans it up. A test also exercises the default CSPRNG path and checks that the Avatar is always one of the successes.

## 7. Batch generation semantics

One click on **Generate 3 options** produces exactly **3 independent `generator.generate` calls**. Each sends `n: 1`, because the configured model advertises `n = 1`. The server decides the batch size (`PORTRAIT_BATCH_SIZE = 3`); a browser-supplied `n` or `batch_size` is ignored, and a test checks this.

All 3 calls use:

- the same committed `PortraitPrompt`, with no added wording;
- the same attached reference, read once;
- the same configured model, resolution and aspect ratio.

The calls run concurrently with `Promise.allSettled`, so a batch never has more than 3 in flight. They share the client's promise-cached capability lookup.

## 8. Partial success

| Successes | Result |
| --- | --- |
| 3 | 3 versions added. Message: "3 portrait options generated." |
| 2 | 2 added. Message: "2 of 3 portrait options generated." |
| 1 | 1 added. Message: "1 of 3 portrait options generated." |
| 0 | Nothing added, no revision, no role or metadata change. Message: "Portrait generation failed. ‹reason›" |

On a first batch, the Avatar is chosen from the successes only. For example, if #1 and #3 succeed, the Avatar is #1 or #3.

Every failed candidate is logged by code and HTTP status. Provider bodies are never logged or returned.

## 9. Persistence changes

```
portraits?: [{ character_id, avatar_version_id?, full_body_version_id?, versions: CharacterPortraitVersion[≤64], reference? }]
```

**New narrow commands**, none of which are in the controller schema:

- `record_portrait_batch { character_id, versions[1..3], avatar_version_id? }`
- `set_portrait_avatar { character_id, version_id }`
- `set_portrait_full_body { character_id, version_id | null }`
- `delete_portrait_version { character_id, version_id }`

`set_portrait_reference` is unchanged. V1's `record_portrait` was removed. Commands are never persisted, so removing it touches no save.

**New whole-snapshot integrity check**, `validatePortraitRecords`, run on every restore and every commit:

- version IDs and asset files are unique per record;
- each role names a version of the **same** record;
- the record belongs to an existing campaign character.

## 10. active_version compatibility

`active_version_id` is now accepted as **legacy decode input only**:

| Stored | Decoded |
| --- | --- |
| `active_version_id: X` | `avatar_version_id: X` |
| `full_body_version_id` | stays absent; never derived |
| `active_version_id` and `avatar_version_id`, equal | `avatar_version_id` |
| `active_version_id` and `avatar_version_id`, different | rejected as an invalid save; never resolved silently |

`active_version_id` is never emitted again, so the next save writes `avatar_version_id`.

All old versions stay in the Gallery. The portrait an old save displayed is still displayed, and because it is now the Avatar, deleting it is blocked until another Avatar is chosen. Tests cover this by rewriting a real save file into the exact V1 shape.

## 11. Save-schema impact

**No bump.** The save envelope stays at 4 and the snapshot schema stays at 3. The change is additive and backward-compatible: V1 records decode losslessly through the legacy mapping inside the existing snapshot parser, so no migration step or version gate is needed. No old active portrait is discarded.

## 12. Role commands

**Methods:**

- `GameSession.setNpcPortraitAvatar({ ref, expected_revision, item })`
- `GameSession.setNpcPortraitFullBody({ ref, expected_revision, item | null })`

**Inputs:**

- `ref` is the opaque character ref;
- `item` is an **opaque Gallery item token**.

**Rejected:**

- a closed session, a running turn or a running batch;
- a stale revision;
- an ineligible or forged ref, including Nicco and unmanaged characters;
- a malformed token;
- a raw version ID, file name, path or asset URL;
- another character's or another campaign's token;
- a deleted image.

Assigning the image that already holds the role is a no-op with no revision change. A real change commits one revision.

## 13. Delete command

`GameSession.deleteNpcPortrait({ ref, expected_revision, item })`. The target must be in this character's Gallery and must hold no role.

| Target | Result |
| --- | --- |
| The Avatar | "Choose another Avatar before deleting this image." |
| The Full Body | "Choose another Full Body image or clear Full Body first." |
| Both roles | "This image is the Avatar and the Full Body. Choose another Avatar, and another Full Body image or clear Full Body, before deleting it." |

The domain command refuses to delete a role holder as well. A record left with no versions and no reference is dropped.

## 14. Delete/file atomicity

The order is: validate, **commit the metadata removal**, then delete the file. The file is never deleted first.

If file deletion fails after the commit:

- the Gallery is already correct;
- the file stays as a **safe orphan**, which is never served, because tokens resolve only through committed metadata;
- the diagnostic `{ code: "orphaned_asset" }` is logged;
- the delete still succeeds for the player.

`PortraitAssetStore.remove` now reports success instead of swallowing errors silently. Tests cover both the ordering and an orphan left by a failed removal.

## 15. Gallery limit

The limit stays at **64**. A batch is refused **before any provider call** unless all 3 possible versions fit, that is, at most 61 existing versions. The refusal says **"Gallery is full. Delete some unused portraits first."**

The projection's `can_generate_batch` disables the button, and the client also refuses the click. Nothing is ever deleted automatically. Tests cover 62 versions (refused, 0 calls) and 61 (allowed, which fills the Gallery to 64).

## 16. Staleness

Staleness is per image: each version's `prompt_fingerprint` is compared with the current committed prompt fingerprint.

The projection exposes:

- `avatar.stale`;
- `full_body.stale`;
- a `stale` flag on every Gallery item.

How each surface shows it:

| Surface | Text |
| --- | --- |
| Avatar slot | "Current Avatar · older appearance" |
| Full Body slot | "Appearance changed since this image was generated." |
| Gallery thumbnails and viewer | "Older appearance" badge |

Stale images are never deleted or disabled, and roles never move to newer images on their own.

## 17. Reference separation

The single uploaded reference is unchanged and stays separate. It is not a Gallery item or a role, and an upload is never added to the Gallery.

Attaching, replacing or removing it changes generation guidance only; Avatar, Full Body and the Gallery are untouched, and tests check this. An Avatar or Full Body image is never used as the reference automatically; a "Use as reference" action is deferred.

## 18. PlayerCharacterView projection

**On every projected card:**

- `avatar_url: string | null`, which replaces V1's `portrait_url`. It carries the Avatar only, never the Full Body.

**Editor-only (managed members):** `appearance_editor.portrait` contains:

```
{ avatar: { url, stale } | null, full_body: { url, stale } | null,
  gallery: [{ token, url, is_avatar, is_full_body, stale, generated_at, model_label, reference_used }],
  gallery_limit, batch_size, can_generate_batch, reference_attached, reference_url }
```

**Never exposed:** file names, paths, version IDs, character IDs, fingerprints and costs.

**Gallery item token:** `sha256("portrait-item:" + campaign + character + version)`. It is distinct from the asset URL token, so knowing an image URL does not give its action handle, and a test checks this. The asset route rejects item tokens.

Only managed characters ever get portraits. A character who later leaves the household keeps the Avatar on compact surfaces, because it is player-authored media; the Gallery and the roles stay editor-only.

## 19. Household usage

The large Household card uses the **Avatar** with a cover crop. Without one it keeps the initial placeholder. The Full Body is never used there.

## 20. Scene sidebar usage

"In the scene" participants show the **Avatar** inside the round badge with a cover crop. Without one they keep the initial or "?". The sidebar household roster circles use the Avatar the same way. Nothing is generated automatically.

## 21. Character drawer usage

The drawer's compact identity portrait uses the **Avatar** with a cover crop; the "No portrait yet" label and the initial hide when an Avatar exists. The drawer has no larger visual area, so the Full Body is not forced into it and the drawer was not redesigned. Its placeholder Upload and Generate buttons are pre-existing and still disabled.

## 22. Full Body editor usage

The editor's portrait column was redesigned; the rest of the editor is unchanged. It now has five sections:

1. **Avatar:** a round 88 px frame, "No avatar yet" or "Current Avatar", and **Change via Gallery**, which focuses the first Gallery item.
2. **Full Body:** a 2:3 frame using `contain`, either **"No Full Body selected"** or the image, a status line, and **Clear Full Body** when one is set.
3. **Generation:** **Generate 3 options**, a progress and result status line, and inline errors.
4. **Reference:** the existing attach, replace and remove controls, with "Reference attached" or "No reference attached".
5. **Gallery:** a thumbnail grid with an "N of 64" count and an empty state.

## 23. Lightbox/gallery UX

**Thumbnails** use a 2:3 cover crop and carry:

- role badges, **Avatar** and **Full Body**, both when one image holds both;
- a quiet **Older appearance** badge when stale;
- chips: **Avatar** and **Full Body** side by side, with **Delete** beneath. A chip for a role the image holds is filled pink, disabled and `aria-pressed`.

Clicking a thumbnail opens the viewer.

**Viewer:**

- a modal dialog with a large `contain` image and "Portrait N of M";
- badges, and previous and next buttons that wrap around;
- Close, **Set as Avatar**, **Set as Full Body** and **Delete**;
- metadata: the generation date and time, the model label, and "Reference used". There are no IDs, file names, paths, fingerprints or costs.

**Keyboard:**

- Escape closes the viewer, or first cancels a pending delete confirmation;
- the Left and Right arrows move between images;
- Tab is trapped inside the dialog;
- focus returns to the thumbnail when the viewer closes.

The viewer stays on the same image after a role change, and leaving the editor closes it.

**Delete:**

- An image holding a role is **blocked before any confirmation**, with the role message shown in place.
- An unassigned image opens the viewer on that image with an explicit "Delete this image from the Gallery? This cannot be undone." and **Delete image** or **Keep it**.
- A confirmed delete closes the viewer.

## 24. HTTP routes

| Route | Body | Calls |
| --- | --- | --- |
| `POST /api/portrait/generate` | `{ ref, expected_revision }` | `generateNpcPortraitBatch` |
| `POST /api/portrait/avatar` | `{ ref, expected_revision, item }` | `setNpcPortraitAvatar` |
| `POST /api/portrait/full-body` | `{ ref, expected_revision, item \| null }` | `setNpcPortraitFullBody` |
| `POST /api/portrait/delete` | `{ ref, expected_revision, item }` | `deleteNpcPortrait` |
| `POST /api/portrait/reference` | unchanged | `setNpcPortraitReference` |
| `GET /api/portrait/asset/<32 hex>` | unchanged | `readPortraitAsset` |

**Status codes:**

- 200 on success;
- 409 for a stale revision or a busy session;
- 502 for a provider failure;
- 422 for a refusal, including a full Gallery and a blocked delete.

The browser never sends a path, file name, version ID, character ID, prompt, model or batch size; extra fields are ignored. The existing loopback and same-origin guards apply to every route.

## 25. Concurrency

**V1 rules that still hold:**

- one batch per session at a time; a double submit returns `turn_in_progress`, and the UI also blocks double clicks;
- the character's appearance is locked during its batch;
- turns are **not** blocked; the commit waits for the session to be idle and then re-checks eligibility and the prompt fingerprint.

**New in V2:** role assignment, delete and reference changes are refused while any batch runs, so no role mutation can race the batch commit.

Tests cover:

- a turn running mid-batch, after which the batch commits;
- a turn that changes Mira's appearance mid-batch, after which the batch is refused, its staged files are discarded and the Avatar is marked stale;
- an unrelated location change mid-batch, onto which the batch rebases in one revision.

## 26. Batch commit atomicity

After all 3 calls settle, the steps run in this order:

1. Validate and stage each success.
2. Wait for the session to be idle.
3. Re-check eligibility and the fingerprint.
4. Finalize all successful files.
5. Make **one** `prepare` and `commit` call carrying every successful version and any bootstrap Avatar. That is one revision per batch, and it runs synchronously.

If anything fails after finalizing, including the commit itself, **every finalized file of the batch is removed**, and staged temporary files are always discarded. There is never a half-batch in campaign state.

A test forces a commit refusal: a turn records portraits mid-batch, which invalidates the bootstrap. The test then checks that no file from the failed batch remains.

## 27. Browser QA

**Setup:**

- **Browser:** headless Edge, driven over the DevTools protocol by disposable scratch scripts that were not committed.
- **Target:** the real Play UI and `GameSession`, over a scratch save with Mira and a second managed member, Sovela.
- **Generator:** a **fake**. Each candidate is a distinct procedurally drawn 400×600 PNG, delivered after 2.5 s, with a control port to fail chosen candidates.
- **Viewports:** 1440, 1024 and 390.

**Result: 51 of 51 checks passed.**

| Area | Verified |
| --- | --- |
| First generation | no Avatar, no Full Body and an empty Gallery; nothing generated on open; double click gave **3** calls; generating state; 3 options with exactly one Avatar badge; Full Body empty with no fallback |
| Compact surfaces | Household card, scene sidebar, sidebar roster and drawer use the Avatar; a member without one keeps the initial |
| Subsequent batch | 6 images; Avatar and Full Body unchanged |
| Roles | Avatar set from a thumbnail; Full Body set from the viewer; the same image holding both; Clear Full Body |
| Viewer | opens on the clicked image; arrows move with wrap-around; Escape closes; metadata has no internals |
| Delete | dual-role and Avatar images blocked; an unassigned image deleted after confirmation; the viewer closed; the deleted asset returns 404 |
| Staleness | after an appearance save: Avatar "older appearance", Gallery markers, Full Body stale text |
| Reference | attached through the real file input; roles and Gallery unchanged; the next batch sent the same reference to all 3 candidates; roles unchanged afterwards |
| Reload | Gallery and roles come back from committed state |
| Partial 2/3 on Sovela | 2 images, one of them the Avatar, Full Body empty, "2 of 3 portrait options generated." |
| Total failure 0/3 | failure message; nothing changed |
| Privacy | no path, file name, version ID, fingerprint or key in the DOM or `/api/session`, checked twice |
| Layout at 1024 and 390 | no horizontal overflow in the editor, viewer or Household; viewer actions visible |

One fix came out of the QA. At 1440 the 280 px column wrapped each chip onto its own line. The chips are now a two-column grid with Delete spanning beneath, and a held role is shown as a filled chip instead of a "✓" suffix.

Screenshots `30-…` to `48-…` are in `docs/ui-screenshots/appearance-editor/`.

## 28. Tests

**New: `tests/portrait-gallery.test.ts`, 21 tests.** It runs the session lifecycle against a fake generator whose bytes identify the candidate they came from.

**Updated: `tests/portrait-image.test.ts`.** It now holds only the provider-client tests (2); the V1 session tests moved, rewritten for V2, into the gallery file.

**Updated: `tests/ui-v1.test.ts`.** It adds 7 client tests for V2 and updates the editor projection fixture and the HTML assertion.

Coverage of the required list:

| # | Requirement | Where |
| --- | --- | --- |
| 1–3 | Creation and promotion never generate; generation is explicit only | gallery: "creation and NPC+ promotion never generate…" |
| 4, 26, 27 | Exactly 3 calls, at most 3 concurrent, same prompt | gallery: "first batch 3/3…" and HTTP |
| 5–9 | First batch at 3/3, 2/3, 1/3 and 0/3; Avatar drawn from the successes only | gallery: "first batch 3/3", "first batch 2/3 / 1/3" (each pick index), "0/3", "default randomness" |
| 10, 11 | Later batches never change the Avatar; Full Body never automatic | gallery: "subsequent batches…" and "first batch 3/3" |
| 12–15 | Dual role; Avatar, Full Body and clear | gallery: "roles…"; UI: "roles from thumbnails" |
| 16–21 | Blocked deletes; unassigned delete; metadata before file; orphan | gallery: "delete: …blocked…", "delete: a file that cannot be removed…" |
| 22–24 | V1 save migrates to Avatar; no Full Body; every version kept | gallery: "V1 save…" and "snapshot decode…" |
| 25 | Gallery limit prevents paid calls | gallery: "Gallery limit…" |
| 28, 39 | Same reference for all 3; reference never alters roles | gallery: "reference…" |
| 29, 30 | Partial keeps successes; total failure changes nothing | gallery: 2/3, 1/3 and 0/3 |
| 31, 32 | One revision per batch; a failed commit cleans the batch files | gallery: "first batch 3/3" and "a failed metadata commit…" |
| 33 | Stale revision prevents provider calls | gallery: "stale revision, bad refs…" |
| 34, 35 | Appearance change mid-batch blocks the commit; turns stay compatible | gallery: "a turn may run during a batch…" |
| 36–38 | Avatar, Full Body and Gallery staleness | gallery: "staleness is per image…"; UI: lightbox test |
| 40–47 | Compact projection uses the Avatar; placeholders; Full Body slot; no fallback; Household, sidebar and drawer | gallery: "compact projection…"; UI: "first generation", "compact surfaces" |
| 48, 49 | Opaque tokens; no path, ID or key leaks | gallery: "first batch 3/3", "role validation…", HTTP |
| 50–53 | Viewer state and actions; previous and next; delete confirmation; double submit | UI: "lightbox", "delete", "first generation"; gallery: lock test |
| 54, 55 | Save, reload, restart | gallery: "first batch 3/3" (restart) and "V1 save…" (reload) |
| 56 | Full regression | below |

**Results:**

| Run | Result |
| --- | --- |
| Focused: gallery, image client and UI | **71 passed, 0 failed** |
| Full suite (`node --test .build/tests/*.test.js`) | **2577 tests: 2574 passed, 0 failed, 3 TODO**, the pre-existing known-limitation tests |
| Typecheck (`tsc --noEmit`) | PASS |
| Build | PASS |

## 29. Paid calls

**0.** All tests and the browser QA used local fakes. The provider transport was validated in V1, and no live probe was needed for the batch mechanics.

## 30. Changed files

**New:**

- `tests/portrait-gallery.test.ts`
- `PORTRAIT_GALLERY_AND_ROLES_V2.md`
- `docs/ui-screenshots/appearance-editor/30-…` to `48-…`

**Modified:**

| File | Change |
| --- | --- |
| `src/campaign/types.ts` | Role fields on the record; the four new commands; `record_portrait` removed |
| `src/campaign/validation.ts` | Command schemas; portrait-record parser with the legacy `active_version_id` → `avatar_version_id` mapping |
| `src/campaign/portraits.ts` | Batch, role and delete handlers; `validatePortraitRecords`; item token; Avatar and Full Body lookups; `PORTRAIT_BATCH_SIZE` |
| `src/campaign/snapshot-validation.ts` | Runs the portrait integrity check |
| `src/app/game-session.ts` | `generateNpcPortraitBatch`; `setNpcPortraitAvatar`, `setNpcPortraitFullBody` and `deleteNpcPortrait`; `portrait_pick` seam |
| `src/app/player-character-view.ts` | `avatar_url` and the Gallery and role editor projection |
| `src/app/portrait-store.ts` | `remove` now reports success |
| `src/ui/server.ts` | The new portrait routes |
| `src/ui/index.html`, `src/ui/client.js`, `src/ui/style.css` | Portrait column, Gallery, viewer and compact Avatar surfaces |
| `tests/portrait-image.test.ts`, `tests/ui-v1.test.ts` | Updated as described in section 28 |

## 31. Deferred work

- "Use as reference" from a Gallery image.
- Garbage collection of orphaned files left by a failed post-commit delete, plus maintenance tooling.
- A larger Full Body area in the drawer or an NPC+ dossier, and removing the drawer's disabled Upload and Generate placeholders.
- Pagination or virtualization of the Gallery.
- Bulk deletion.
- A per-batch cost summary in the UI. Costs are summed only from what the provider reports; failed calls are never estimated.
- Startup capability prefetch, 2K output, and per-character model selection, carried over from V1.
