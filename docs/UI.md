# UI (implemented controls only)

Status: Current. Last reconciled: 2026-10-12 (main c0608a6). Source of truth: `src/ui/index.html`, `client.js`, `server.ts`, and the read models in `src/app/`. Contract: [UI engine contract](UI_ENGINE_CONTRACT.md). The UI is a local vanilla web client (`npm run play:ui`); it reads read models and is never a gameplay authority.

## Navigation

Nicco, Inventory, Household, World (disabled placeholder), Debug (disabled placeholder), Campaigns (persistent mode), Save button and save status. The navigation shows Nicco's selected Avatar (or an initial).

## Screens

- **Campaigns start screen:** create, load or delete a persistent campaign (scenario registry). Delete is a two-step inline confirm and a soft delete; a campaign open in another process cannot be loaded or deleted. Recovery of damaged saves is reported, not hidden.
- **Play:** while a turn runs the pending bubble shows a status word (Thinking… / Narrating… / Resolving…) and never narrator prose; the audited narration appears once when the turn is committed (starred actions in muted blue italics, spoken dialogue in warm cream), composer, scene header (location, calendar date "Year 1191, Vesp Alpha 1, Stonewake"; time of day as tooltip), character cards for present people. The weather exists in the narrator's scene line only; **there is no weather UI**.
- **Nicco (player page):** appearance and visual editor sharing the NPC+ infrastructure in player mode (Avatar, Full Body, Gallery, generation). Nicco is not NPC+ and never gets a premium record.
- **NPC drawer:** tier-based. A small up-arrow ("Promote to NPC+") sits under the name and badges of an eligible campaign NPC only (from `character_capabilities.can_promote_to_npc_plus`); the first click opens an inline "Promote <name> to NPC+?" confirmation with Cancel / Promote, only Promote sends the one request, and the card re-renders as NPC+ without a reload. World/campaign NPCs are read-only; canonical NPCs may show an authored avatar. Controls exist only when the character's tier has them (Generate for managed visuals, Edit NPC+ for promoted characters). A control that exists may be disabled with a stated reason (inactive or dead, provider not configured, generation blocked). **Upload is not rendered** (flag off).
- **NPC+ editor:** Avatar, Full Body, Gallery (limit 64), pose selectors, "Generate 3" per kind, permanent appearance fields, Story & knowledge tab. Personality and Relations tabs are disabled placeholders.
- **Household:** active members and promoted NPC+ presentation.
- **Inventory:** compact icon grid with All / Carried / Equipped filters, search, local detail panel (selection is browser state), Gold from `snapshot.funds` (otherwise "Not tracked"), and a read-only four-slot equipment figure (Head, Chest, Weapon, Boots) with the player's Full Body or a silhouette. Items are mapped to slots by **category only** (weapon, armor, headwear, footwear); the domain has no headwear or footwear categories yet, so Head and Boots stay empty. More than one item per slot shows a conflict marker; equipped items without a slot appear separately. There is no equip/unequip action, drag and drop, or encumbrance.
- **Composer command:** only `/location <canonical id or name>` (administrative location correction, `POST /api/location`, revision-guarded); other text is game-world input.
- **Narrator alternatives:** when alternate models are configured (`src/app/narrator-alternatives.ts`), a "Regenerate with..." selector under narrator messages shows comparison-only alternatives that never change the story. A developer aid that spends credits.
- **Save indicator:** Saved / Unsaved changes / Saving / Save failed, refreshed every 4 s, plus the header Save button.

**Generation lifecycle (player and NPC+ editors share it):** one synchronous request (typically 30 to 90 s). The editor shows a sticky progress block (kind, stage, elapsed seconds, latency hint), three placeholder gallery tiles and scoped disabling of only the portrait controls; completion refreshes the gallery, failures show an inline error with retry, and the browser gives up after 6 minutes. See [the hardening report](evaluations/PLAYER_IMAGE_GENERATION_UX_HARDENING.md).

## Rules

Capabilities are derived per projection and never persisted. Tier-inappropriate controls are omitted. Images are display only. Details: [Inventory UI](architecture/INVENTORY_UI_V1.md), [Image system](IMAGE_SYSTEM.md), [Player character](architecture/PLAYER_CHARACTER.md).

## Actual Offer card (trade)
A compact card sits inline after the newest Narrator response while an offer is active: an `ACTUAL OFFER` label, `▼ BUY` or `▲ SELL` (text and icon, not colour alone), a `♟ Person` marker for people, the price in gold, the player-safe subject lines, and one **Accept offer** button. There is no Counteroffer button (negotiate in chat), no shop and no modal. Labels are player-visible only: an unknown enslaved person is "Slave" or "<descriptor> Slave", and the same card shows the name after a legitimate reveal. Accept sends only the offer ref and the rendered revision. An unaffordable BUY disables Accept and says so; a stale, superseded or lapsed offer shows a safe inline message (role=alert) and the card refreshes; withdrawal or lapse leaves a short notice and a settled offer leaves a receipt. See [Actual Offer](architecture/ACTUAL_OFFER.md).

## Turn requests

`POST /api/turn` carries `{ text, turn_key, expected_revision }`. The client makes one key per submission and retries a dropped connection with the SAME key (the server answers from the first result; `replayed: true`). A stale view returns 409 `stale_turn` before any provider call. A committed turn whose publication partly failed returns `ok: true` with `warnings`.
