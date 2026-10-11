# UI (implemented controls only)

Status: Current. Last reconciled: 2026-10-11. Source of truth: `src/ui/index.html`, `client.js`, `server.ts`, and the read models in `src/app/`. Contract: [UI engine contract](UI_ENGINE_CONTRACT.md). The UI is a local vanilla web client (`npm run play:ui`); it reads read models and is never a gameplay authority.

## Navigation

Nicco, Inventory, Household, World (disabled placeholder), Debug (disabled placeholder), Campaigns (persistent mode), Save button and save status. The navigation shows Nicco's selected Avatar (or an initial).

## Screens

- **Campaigns start screen:** create or load a persistent campaign from the scenario registry; recovery of damaged saves is reported, not hidden.
- **Play:** streamed narration (starred actions in muted blue italics, spoken dialogue in warm cream), composer, scene header (location, calendar date "Year 1191, Vesp Alpha 1, Stonewake"; time of day as tooltip), character cards for present people. The weather exists in the narrator's scene line only; **there is no weather UI**.
- **Nicco (player page):** appearance and visual editor sharing the NPC+ infrastructure in player mode (Avatar, Full Body, Gallery, generation). Nicco is not NPC+ and never gets a premium record.
- **NPC drawer:** tier-based. A small up-arrow ("Promote to NPC+") sits under the name and badges of an eligible campaign NPC only (from `character_capabilities.can_promote_to_npc_plus`); the first click opens an inline "Promote <name> to NPC+?" confirmation with Cancel / Promote, only Promote sends the one request, and the card re-renders as NPC+ without a reload. World/campaign NPCs are read-only; canonical NPCs may show an authored avatar. Controls exist only when the character's tier has them (Generate for managed visuals, Edit NPC+ for promoted characters). A control that exists may be disabled with a stated reason (inactive or dead, provider not configured, generation blocked). **Upload is not rendered** (flag off).
- **NPC+ editor:** Avatar, Full Body, Gallery (limit 64), pose selectors, "Generate 3" per kind, permanent appearance fields, Story & knowledge tab. Personality and Relations tabs are disabled placeholders.
- **Household:** active members and promoted NPC+ presentation.
- **Inventory:** compact icon grid with All / Carried / Equipped filters, search, local detail panel (selection is browser state), Gold from `snapshot.funds` (otherwise "Not tracked"), and a read-only four-slot equipment figure (Head, Chest, Weapon, Boots) with the player's Full Body or a silhouette. Items are mapped to slots by **category only** (weapon, armor, headwear, footwear); the domain has no headwear or footwear categories yet, so Head and Boots stay empty. More than one item per slot shows a conflict marker; equipped items without a slot appear separately. There is no equip/unequip action, drag and drop, or encumbrance.

**Generation lifecycle (player and NPC+ editors share it):** one synchronous request (typically 30 to 90 s). The editor shows a sticky progress block (kind, stage, elapsed seconds, latency hint), three placeholder gallery tiles and scoped disabling of only the portrait controls; completion refreshes the gallery, failures show an inline error with retry, and the browser gives up after 6 minutes. See [the hardening report](evaluations/PLAYER_IMAGE_GENERATION_UX_HARDENING.md).

## Rules

Capabilities are derived per projection and never persisted. Tier-inappropriate controls are omitted. Images are display only. Details: [Inventory UI](architecture/INVENTORY_UI_V1.md), [Image system](IMAGE_SYSTEM.md), [Player character](architecture/PLAYER_CHARACTER.md).
