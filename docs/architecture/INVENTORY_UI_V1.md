# Inventory UI

Status: ACTIVE (rewritten 2026-10-11; replaces the 2026-10-10 card-based Inventory UI V1 report, which described a UI that no longer exists). Source of truth: `src/app/inventory-ui-view.ts`, `item-visuals.ts`, `item-visual-view.ts`, `src/ui/server.ts`, `src/ui/client.js`, `tests/ui/inventory-http.test.ts`.

## What the player sees

The Inventory screen is a compact **icon grid** of what Nicco physically carries or has equipped, with:

- an **All / Carried / Equipped** filter, case-insensitive **search**, and counts;
- a local **detail panel** for the selected item (selection, filters and search are browser state and never persisted): name, description, category, state ("Carried" or "Equipped · slot · worn/held"), and a "held for someone else" marker when Nicco holds an item owned by another (the owner is not named);
- **Gold** from authoritative funds (`snapshot.funds` for Nicco), or "Not tracked" when there is no tracked purse;
- a **read-only four-slot equipment presentation** (Head, Chest, Weapon, Boots) around Nicco's selected Full Body, or a silhouette when none exists.

The screen is read-only: there is no equip, unequip, drop, use or drag-and-drop, and no encumbrance. Gameplay continues through normal turns.

## Possession and ownership

Only items carried or equipped by Nicco appear (the engine's derived inventory). Ownership is not a filter: a borrowed or stolen item Nicco holds appears; a Nicco-owned item stored elsewhere does not. Ownership and possession are different fields ([Item domain](ITEM_DOMAIN.md)).

## Equipment presentation

Items map to slots by **authoritative category only**, never by name, description or slot string: `weapon` to Weapon, `armor` to Chest, `headwear` to Head, `footwear` to Boots. The domain's categories are weapon, armor, clothing, tool, consumable, document, valuable, material, miscellaneous, so **no item can currently fill Head or Boots**. Several items in one slot show a conflict marker; equipped items with no slot appear as unclassified. This is a projection, not an equipment system.

## Item visuals

Two roles, icon (grid) and detail. Precedence: the item's ready generated **sprite**, then the authored **template registry** (currently empty: no `/assets/items/` route or files exist yet), then a **category glyph** (`/api/item-glyph/<kind>`, a closed set of static SVGs), then a placeholder. A missing or failed image never hides the name or description. Pending sprites refresh while Inventory is open. Dynamic prose is rendered as inert text nodes. See [Image system](../IMAGE_SYSTEM.md).

## HTTP surface

`GET /api/inventory` returns the player-safe view (also embedded in `/api/session`); sprite reads go through a campaign-scoped route that serves only ready sprites of items in Nicco's inventory; glyphs are static. There are no write routes and no provider calls from opening the screen. Loopback-only access, same-origin write protection, CSP and no-store headers apply.

## Not saved

The view, equipment slots, icon metadata and capabilities are derived on every projection and never written to a save.
