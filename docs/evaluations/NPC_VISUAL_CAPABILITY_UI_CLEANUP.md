# NPC visual capability / UI tier cleanup

Verdict: NPC_UI_TIERS_CLEAN. 3114/3114 tests (16 new), typecheck and build clean. No save-schema change (snapshot 6, save file 5). No image or LLM calls. No commit, no push.

## Tier model discovered
- Authoritative NPC+ truth = the `premium_characters[]` record (`isNpcPlus`). Created by `syncPremiumCharacters` on household join (including the Heartstone rite). Household membership is separate; `activeNpcPlus` is a household-bound behavior gate.
- Derived UI tier (`src/app/character-capabilities.ts`, new): `world_canon` (no campaign record), `campaign_npc` (campaign record, no premium record), `npc_plus` (premium record). No new boolean, nothing persisted.

## Root causes
1. Lower tiers: `src/ui/index.html` hard-coded `<button disabled>Upload</button><button disabled>Generate</button>` in the portrait block and `<button disabled>Edit NPC+</button>` in the drawer footer for EVERY character. They were never wired, so the disabled controls appeared for every tier.
2. True NPC+ (Mira-like): the same static buttons were also never enabled for NPC+. In addition the real editor eligibility (`editable` in `player-character-view.ts`) required `active_household_member` AND a household Nicco owns AND a current non-owner membership, i.e. it was tied to `activeNpcPlus`/household. A promoted NPC+ who left, or whose household role changed, lost editing. Location (here/elsewhere), authored-vs-runtime origin, image existence and stale UI state were NOT causes.

## Capability derivation (read model)
`PlayerCharacterView.character_capabilities`: tier, portrait_display, portrait_editable, can_upload_avatar, can_generate_avatar, can_show_full_body/manage, can_show_gallery/manage, can_edit_npc_plus, can_edit_appearance, edit_unavailable_reason, generate_unavailable_reason. One pure function `characterCapabilities`. Editing now follows promotion: `editable = promoted && not Nicco && status not inactive/dead`. The household requirement and the active gate are gone from the UI derivation. Lifecycle behavior is unchanged.

## UI changes (`src/ui/index.html`, `src/ui/client.js`)
- Static disabled Upload/Generate/Edit NPC+ removed; the drawer renders `#character-portrait-actions` and `#character-footer-actions` from the capabilities (`renderCharacterActions`).
- World/canon and campaign NPC: passive placeholder or portrait, read-only info, no Upload, Generate, Edit NPC+, Full Body or Gallery.
- NPC+: Generate and Edit NPC+ enabled, both open the existing editor (which holds Avatar/Full Body generation, Gallery, appearance editing). A promoted NPC+ who is not a household member opens the editor from the drawer via the new `editableCharacters` map.
- Legitimate disabled states keep a stated reason (`title`): inactive/dead NPC+ (Edit NPC+), blocked generation (adult-only rule). Request-in-flight and gallery-limit logic inside the editor is untouched.
- Upload: no Avatar upload pipeline exists (only the deferred reference image), so `can_upload_avatar` is false for all tiers via `AVATAR_UPLOAD_SUPPORTED = false`; enabling it later is a one-line change plus a control.

## Promotion behavior
Same character id and opaque ref, no duplicate; capabilities flip on the next projection; the avatar association (`avatar_url`) is unchanged. Authored canon characters promoted by household join receive NPC+ capabilities.

## Tests
`tests/npc-visual-capability.test.ts` (read model: U1-U8, U14-U22, inactive reason, determinism, schema) and eight client tests appended to `tests/ui-v1.test.ts` (drawer per tier, former-member editor, disabled-with-reason, blocked generation). Existing tests realigned: `player-character-view` eligibility now follows promotion; ui-v1 mocks carry `character_capabilities`.

## Remaining visual-system debt
No Avatar upload; the drawer shows Generate/Edit as shortcuts into the editor rather than inline Gallery; Personality/Relations tabs are still static disabled placeholders (not tier controls); campaign NPCs have no image workflow; the household list still shows only current members (former NPC+ are reached from the scene drawer).
