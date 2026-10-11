# Player Character Visuals + Inventory / Equipment UI Foundation

## 1. Verdict
PLAYER_VISUALS_AND_INVENTORY_UI_FOUNDATION_READY. Nicco has the same visual editor as an NPC+ (Avatar, Full Body, Gallery, generation, permanent appearance, prompt previews) without becoming an NPC+. The Inventory is a responsive icon grid with a display-only four-slot equipment panel, a detail panel and authoritative Gold. No commit, no push.

## 2. Player UI architecture
The Nicco nav opens the shared `member-editor` surface in **player mode** (one DOM, one set of portrait/gallery JS, one pipeline). Header: NICCO / Player Character, Back to Play, Cancel, Save changes. Left column: Avatar, Generate avatars, Full Body, Generate full body, Gallery. Right column: editable identity (sex, species, apparent age) and appearance sections (body/hair/face/description), "Narrator sees" (the exact visible-appearance line), prompt previews. The old `player-view` section and its Edit/Cancel/Save mode were removed; fields are always editable like the NPC+ editor, Save posts only changed keys to `/api/player-character`. Server side: `player-visual-view.ts` builds an editor-shaped projection; `GameSession.#managedTarget` has a player branch, so generate / role / delete / lightbox reuse the existing methods.

## 3. NPC+ infrastructure reused
`portraitEditorView`, `portraitPromptPreviews`, `portraitAssetUrl` (extracted from the NPC projection, which now delegates to them), the `portraits[]` commands, asset store and opaque-token route, the batch generator (3 images, curated poses, adult gate, one batch at a time), the lightbox, kind rules and staleness fingerprint. No second image system.

## 4. Avatar / Full Body / Gallery
Capabilities (`tier: "player"`): avatar, full body, gallery, appearance all true; `can_edit_npc_plus` false; **Upload false and not rendered** (no upload pipeline exists). Generation is an explicit click only. Full Body never auto-selected and never replaced by the Avatar. A minor `apparent_age` blocks generation (same adult-only rule). The selected Avatar also feeds the small nav avatar next to "Nicco" (one resolver, `resolveCharacterAvatar`); other Nicco surfaces (chat labels) are text-only.

## 5. Appearance / context safety
Unchanged: the narrator still gets the compact visible-appearance line; nothing else. No portrait URL, token, file name, gallery state or UI metadata enters narrator/controller context (test P5/P6). Appearance edits mark existing images "older" through the shared fingerprint; images never change appearance.

## 6. Persistence / schema
Gap found: portraits required a `characters[]` record and Nicco has none. Fix without a schema bump: `portraits[]` records (keyed by `character_id`) may now belong to the active player character (`recordFor` and `validatePortraitRecords` in `src/campaign/portraits.ts`). Snapshot schema stays 6, save file schema stays 5, no migration, existing saves load (an old save simply has no player portrait record). No premium record, no `characters[]` entry is ever created (tests P1/P8/P9). Selected Avatar/Full Body survive save/load (P7).

## 7. Inventory: old vs new
Old: tall cards with large art placeholders and descriptions. New: header (NICCO / INVENTORY, "X items · Y carried · Z equipped", Gold, Back), All/Carried/Equipped + search kept; left Equipment panel, centre grid of icon cells (equipped marker, pending dot, no quantity because the domain has none, no empty filler cells so no capacity is implied), right detail panel (UI-local selection, hover title). Stacks at ≤1100px and ≤800px; no horizontal scroll at 1440/1000/700/390 (checked in Chromium).

## 8. Equipment presentation and domain limits
Exactly four slots: Head, Chest, Weapon, Boots. Mapping is by authoritative **category only**: weapon→Weapon, armor→Chest, headwear→Head, footwear→Boots. Limits: the item domain has no `headwear`/`footwear` categories, so Head and Boots stay empty for now; `clothing` and uncategorized equipped items are unclassified (counted in a note, never guessed from names). Two equipped items mapping to one slot show "Multiple equipped items"; nothing is repaired. The engine's own `slot` string is shown only in the item's state label. Armor→Chest is a presentation convention (flagged). Centre figure: Nicco's selected Full Body, else a neutral silhouette.

## 9. Item icon/detail architecture
`item-visuals.ts`: separate `icon` and `detail` roles; precedence specific item visual (ready sprite) > authored template (static registry keyed by item id or canonical id, `/assets/items/` URLs only, empty today) > category glyph > generic placeholder. Closed glyph set served at `/api/item-glyph/<kind>` (static SVG). No display-name-derived paths. Detail art is set only for the selected item. A broken image falls back to the category glyph.

## 10. Detail interaction
Click selects only (no fetch, no revision change). Shows artwork, name, category, description, state (carried / equipped slot + mode) and "Belongs to someone else" when the item is Nicco's possession but owned by another; never an id or debug field. The two opening documents are normal items with the document icon; full text stays in the existing document/lore inspection.

## 11. Money
Gold = `snapshot.funds` entry of Nicco, read on every inventory view; `null` shown as "Not tracked", never an invented 0. No client cache, no prose reconstruction (M1–M5).

## 12. Save/schema impact
Only the portrait ownership rule above. No new field for icons, slots or selection.

## 13. LLM/context impact
None. `inventory-ui-view.ts` and `item-visuals.ts` import nothing from the LLM, turn, retrieval or prompt layers; no image or LLM call is made by either screen.

## 14. Responsive
Verified with screenshots at 1440, 1000, 700, 390 (no horizontal scroll).

## 15. Tests
New `tests/player-visuals-inventory.test.ts` (9 tests covering P1–P11, I1–I4/I8–I10, E1–E8, M1–M5, existing-save render). Updated: player client test rewritten for the shared editor, two inventory client tests rewritten for the grid, one gallery test no longer lists Nicco as ineligible (he is now a valid target by design).

## 16–18. Typecheck / build / full suite
See the final reply for the counts of the last run.

## 19. Remaining debt
Add `headwear`/`footwear` item categories (and optionally a sub-category for clothing) so Head/Boots can populate; authored template icons; an Upload pipeline; the shared editor still shows the deferred "Reference image" block for Nicco; drag/equip is intentionally absent.

## 20. Recommended next pass
Item domain categories for equipment slots + authored icon registry, then equip/unequip as an engine command.
