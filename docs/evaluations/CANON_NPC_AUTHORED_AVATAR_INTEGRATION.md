# Canon NPC authored avatar integration

Verdict: CANON_AVATARS_INTEGRATED. The six PNGs arrived on main (4ce556f, valid PNGs, 1086-1152 x 1366-1448) and were verified. 3129/3129 tests, typecheck and build clean. Visual check done in real Chromium (Playwright, real server and real files): all six drawers and round portraits load the same image, face intact, zero Upload/Generate/Edit controls. No commit, no push, no image generation.

## Mapping (explicit registry `src/app/canon-avatars.ts`, keyed by stable authored id)
korvin → Korvin_avatar.png; mistress_elara → Elara_avatar.png; bartolomhew → Bartholomew_avatar.png (filename spelling differs, canonical id unchanged); blackthorn → Blackthorn_avatar.png; captain_doran_hale → DoranHale_avatar.png; brother_aven → Aven_avatar.png. All six ids exist as authored characters; no canonical data renamed.

## Static serving
`data/canonNPCAvatar/` was not web-served by the app. It is now served in place (single source of truth, no copies) through `GET /api/canon-avatar/<token>`. The token is an opaque 24-hex hash of the id (found while testing: the first version put the authored id in the URL and existing identity-masking tests correctly failed, since an unnamed Korvin would have been revealed). The file name comes only from the registry; ids, names, path-like text and unregistered tokens are 404. `createPlaytestServer` takes an optional directory for tests. The URL is emitted only when the file exists, so a missing asset yields the placeholder.

## Precedence (one deterministic order)
selected NPC+ Avatar → authored canonical avatar → passive placeholder. Created characters never use the registry. The projection (`avatar_url`) is the only place this is decided.

## UI
Drawer, scene round portrait and household round portrait already render `card.avatar_url`; all three now show the same URL. No client path logic, no second asset. Existing CSS (`object-fit: cover; object-position: top center`, circular mask) is unchanged.

## Read-only and promotion
The avatar adds no capability, no premium record, no household change (tests A10-A12). A promoted canon NPC keeps the authored image as fallback until an NPC+ Avatar is selected, which then wins (A13, A14); same id, no duplicate.

## Schema and context
No campaign or save change (snapshot 6, save file 5). The registry is not referenced by context-builder, scene projection/render, prompt builder or retrieval (asserted by test).

## Tests
`tests/canon-avatars.test.ts` (A1-A6, A9-A16, route safety, no-context) plus one drawer/round-portrait test in `tests/ui-v1.test.ts`. Added a real-file test (six PNG signatures, URLs resolve with the default directory).

## Assets
All six present and valid. Source of truth stays `data/canonNPCAvatar/` (served in place; ~2.3 MB each, so the browser downloads full-size images for round portraits; a thumbnail derivative is possible future work).
