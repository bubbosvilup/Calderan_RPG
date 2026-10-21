# UI (implemented controls only)

Status: Current. Last reconciled: 2026-10-18 (UI-3: the React UI is the only UI; the vanilla client is removed). Source of truth: `src/ui-client/` (React), `src/ui/server.ts` (transport) and the read models in `src/app/`. Contract: [UI engine contract](UI_ENGINE_CONTRACT.md). The UI is a local web client served by the play server (`Caldrevan.cmd` on Windows, or `npm run play:ui`, then `http://127.0.0.1:3000/app/`; `/` forwards there). It reads read models and is never a gameplay authority: every mutation is an existing API call that carries the rendered `expected_revision`, and eligibility (promotion, editing, offers, confirmations) arrives as engine flags.

## Build and routes

`npm run ui:build` writes `dist/ui-client/`, served at `/app/`. Without a build, `/app` answers 404 with the build instruction. Routes: `/app/` (campaigns), `/app/play[/<campaign id>]` (the story), and under the same prefix `household`, `inventory`, `character/player`, `characters/<opaque ref>` (the NPC+ editor) and `settings`. A page URL without a campaign id forwards to the open campaign; a URL naming a campaign that is not open offers to open it and never loads it implicitly. Architecture: [Frontend architecture](architecture/FRONTEND_ARCHITECTURE.md). Parity evidence: [UI-3 report](evaluations/UI3_FINAL_MIGRATION_AND_LAUNCHER.md).

## Navigation

One navigation in every session page header: Play, Household, Inventory, the player's name, Settings. On narrow screens it takes its own row. The composer draft survives moving between pages. The old World and Debug placeholders and the Personality / Relations tabs are not rendered (unfinished features have no controls).

## Screens

- **Campaigns (`/app/`):** list, Load (current slot, previous save or latest backup for a damaged one), create (name and scenario), Close the open campaign, Delete with a modal confirmation naming the campaign (refused by the server for the open campaign or one open elsewhere). Load reports are shown. The disposable playtest server has no campaign list.
- **Play:** while a turn runs the transcript shows a status word (Thinking… / Narrating… / Resolving…) and never narrator prose; the audited narration appears once on commit. Composer, scene header (location, calendar date; time of day as tooltip), people in the scene, temporary people with **Keep track**, the Actual Offer card, pending confirmations, save indicator and Save, standing save banners (too large, near the limit, autosave paused). The composer accepts only `/location <canonical id or name>` as a command (revision-guarded). Weather exists in the narrator's scene line only; there is no weather UI.
- **Household:** every member of the read model with avatar, NPC+ badge, role, presence, relationship and state; All / Here / Elsewhere filters and a search (display only). Names arrive masked by the server. A card opens the character drawer (with the single explicit NPC+ promotion flow when the engine allows it) and, for an NPC+ the engine reports as editable, an **Edit** link.
- **NPC+ editor (`characters/<ref>`):** permanent appearance form (changed fields only, reference text never copied), Avatar / Full Body figures, the Gallery with the Lightbox, pose selectors, batch generation, select, clear and delete with confirmation. Shown only when `can_edit_npc_plus` and an `appearance_editor` arrive; otherwise the page gives the engine's reason. There is no reference-image upload and no image-to-image.
- **Player character (`character/player`):** the same studio in player mode. Nicco is not NPC+.
- **Inventory:** All / Carried / Equipped filters, search, item detail, polling while an item illustration is pending, gold from the read model, owner versus position, a read-only equipment figure and slot list. No equip action, drag and drop or encumbrance.
- **Settings:** the open campaign (Close), whether the narrator provider is configured, and the health of the optional services from `GET /api/optional-services` (diagnostic only; it claims nothing about Reflection or Mannerism effects).
- **Narrator alternatives:** when alternate models are configured, a "Compare with another model" control under a comparable narrator message requests a comparison-only alternative on an explicit press (it can spend credits and never changes the story).
- **Character drawer:** tier-based. A small up-arrow ("Promote to NPC+") sits under the name of an eligible campaign NPC only (`character_capabilities.can_promote_to_npc_plus`); the first click opens "Promote <name> to NPC+?" with Cancel / Promote; only Promote sends the one request. A person the Narrator merely introduced is not a campaign NPC and never appears in the drawer until **Keep track** or buying them.
- **Temporary people:** a "Temporary" group lists the scene's provisional people ("Guard (1)" / "Guard (2)" when labels collide), each with **Keep track** (one request: opaque token and revision). The row disappears and the same person appears as an ordinary campaign NPC (no NPC+, household or relationship).

Known limitation: an NPC+ who left the household has no card in the read model (only its name in `promoted`), so it cannot be listed or edited until the read model carries one.

**Generation lifecycle (player and NPC+ editors share it):** one synchronous request (typically 30 to 90 s). The editor shows a sticky progress block (kind, stage, elapsed seconds, latency hint), three placeholder gallery tiles and scoped disabling of only the portrait controls; completion refreshes the gallery, failures show an inline error with retry, and the browser gives up after 6 minutes. See [the hardening report](evaluations/PLAYER_IMAGE_GENERATION_UX_HARDENING.md).

## Rules

Capabilities are derived per projection and never persisted. Tier-inappropriate controls are omitted. Images are display only. Details: [Inventory UI](architecture/INVENTORY_UI_V1.md), [Image system](IMAGE_SYSTEM.md), [Player character](architecture/PLAYER_CHARACTER.md).

## Actual Offer card (trade)
A compact card sits inline after the newest Narrator response while an offer is active: an `ACTUAL OFFER` label, `▼ BUY` or `▲ SELL` (text and icon, not colour alone), a `♟ Person` marker for people, the price in gold, the player-safe subject lines, and one **Accept offer** button. There is no Counteroffer button (negotiate in chat), no shop and no modal. Labels are player-visible only: an unknown enslaved person is "Slave" or "<descriptor> Slave", and the same card shows the name after a legitimate reveal. Accept sends only the offer ref and the rendered revision. An unaffordable BUY disables Accept and says so; a stale, superseded or lapsed offer shows a safe inline message (role=alert) and the card refreshes; withdrawal or lapse leaves a short notice and a settled offer leaves a receipt. See [Actual Offer](architecture/ACTUAL_OFFER.md).

## Turn requests

`POST /api/turn` carries `{ text, turn_key, expected_revision }`. The client makes one key per submission and retries a dropped connection with the SAME key (the server answers from the first result; `replayed: true`). A stale view returns 409 `stale_turn` before any provider call. A committed turn whose publication partly failed returns `ok: true` with `warnings`.
