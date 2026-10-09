# Inventory UI V1

Implemented 2026-10-10. No commit. Inventory UI comes now; Sprite Quality V2 remains the next milestone.

## Player behavior

The main navigation now includes **Inventory**. Nicco's screen presents responsive item cards with an illustration, name, narrative description, category and carried/equipped badge. Equipped items show their slot and worn/held state. It includes counts, All/Carried/Equipped filters, case-insensitive search and a Back to Play control that returns keyboard focus to Inventory navigation.

Only items physically carried or equipped by Nicco appear, using existing `inventoryItems()` semantics. Ownership is not used as a filter: borrowed or stolen items held by Nicco appear, while Nicco-owned items stored elsewhere do not. The UI remains read-only; gameplay actions continue through normal player turns. No equip/unequip, move, give, sell, merchant, transaction or sprite-generation buttons were introduced.

Missing metadata, pending generation, failed generation and missing image files all have useful placeholders. A failed/missing illustration never hides the item's name/description. Ready images use contain sizing rather than cropping. Pending sprites refresh every two seconds while Inventory is open without refreshing the story; polling stops when the view closes or no pending sprites remain. Refresh failures retain the last cards and retry the read after four seconds. This is HTTP refresh only, never image-generation retry.

Campaign changes clear filters, search and stale cards. Late inventory responses cannot replace a newer campaign's view. Dynamic item prose is rendered as inert text nodes; no model-authored HTML is inserted.

## Existing architecture reused

`GameSession.getPlayerInventoryView()` projects the existing `getInventoryVisuals("nicco")` read model, removing storage filenames and replacing ready references with campaign-scoped sprite URLs. It adds no campaign state or inventory array to saves. `visual_description`, sprite error codes and provider prompts are not sent to the UI. Snapshot schema remains 6.

The HTTP server exposes:

- `GET /api/inventory`: current campaign, revision and player-safe item cards, or an empty list when no campaign is active.
- `GET /api/inventory/sprite/:campaignId/:itemId`: resolves a ready image through the existing `readItemSprite()` application seam. The campaign must be active and the item must currently be in Nicco's inventory. Missing files and foreign/stored/NPC items return 404. Filenames and paths are never accepted from the browser.
- Existing `/api/session` responses include the same inventory projection for initial and post-turn rendering.

Loopback, same-origin write protection, CSP, no-store and existing file validation are preserved. There are no new write routes, provider calls or state mutations from opening the screen. Player, NPC and NPC+ items still share the same CampaignItem/inventory/visual pipeline; V1 exposes the player inventory only, not arbitrary NPC possessions.

## Files

Modified:

- `src/app/game-session.ts`: player-safe Inventory UI projection.
- `src/ui/server.ts`: inventory JSON and scoped asset reads.
- `src/ui/index.html`: navigation, screen, filters, search and empty/card container.
- `src/ui/client.js`: safe card rendering, filters/search, placeholders, pending reads and campaign-change handling.
- `src/ui/style.css`: responsive cards and wrapping navigation; item cards override conversation-specific article styling.
- `tests/ui-v1.test.ts`: inventory client regressions and navigation expectation.

Created:

- `tests/inventory-ui.test.ts`: HTTP integration, state/persistence/security and zero-generation regression.
- `docs/architecture/INVENTORY_UI_V1.md`: this report and milestone order.

All pre-existing uncommitted item/inventory/visual milestone work is preserved. No changes to Controller policy, item identity, sprite quality prompts, provider/model or retry lifecycle were made in this UI pass.

## Validation

Focused tests: **77 passed, zero failures**, covering Inventory UI, existing UI/HTTP/campaign behavior, item visual identity and permanent inventory. Full `npm test`: **2,746 passed, zero failures/skips**. Typecheck passed. The final keyboard-focus return was additionally checked in the client tests after the full run.

Coverage includes carried/equipped counts, owned-but-stored exclusion, held-but-not-owned inclusion, four sprite statuses, safe ready-image reads, foreign campaign and NPC/stored item denial, missing files, unchanged save schema, save/load projection roundtrip, zero generation on UI reads, inert prose/XSS handling, filter/search/empty states, pending completion, late-response campaign isolation and keyboard focus.

Browser skill was used to attempt visual validation. Runtime discovery returned **no available browsers** after its supported troubleshooting checks. Therefore desktop/mobile visual and interactive browser QA was not performed; responsive CSS and client/HTTP behavior were validated by inspection and deterministic tests. A connected browser is still needed for visual acceptance.

## Next: Sprite Quality V2

The agreed order is Inventory UI V1 first, then a separate Sprite Quality V2 pass:

1. Address text leakage in generated sprites, including the presentation-sheet labels seen in the knife sample.
2. Decide whether a rejection/regeneration strategy is warranted and define a bounded policy before implementation.
3. If needed, evaluate a different style trigger or a second rendering pass without assuming a provider migration.

None of those quality changes are included here. Existing images are displayed as supplied; current rendering defects are not hidden or automatically regenerated. No paid/live image or LLM calls, and no commit.
