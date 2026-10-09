# Item Domain V1

Item Domain V1 extends the existing campaign item domain (`CampaignItem`, `register_item` / `place_item` / `transfer_item`, `src/campaign/items.ts`). It does not add a second item system. What it adds is engine-allocated identity for objects that become persistent during play.

## Principles

**Item existence in prose is not a persistent item instance.** "There are cups, plates and knives on the table" creates nothing. An object is materialized only when state relevance requires identity: someone takes, receives, steals, stores or deliberately leaves it, its ownership matters, or later play must refer to that exact object. The decision is semantic and belongs to the State Controller. There is no verb grammar for "take", "grab", "buy" and so on.

**The Controller proposes materialization. The Engine allocates identity and commits truth.** The `create_item` proposal carries data only: name, description, category, optional owner and an initial position. It has no ID field, and an unknown key is rejected. The engine assigns the ID during the same atomic preparation that persists the item.

**Owner ≠ physical position.** `owner_id` is who is socially or legally recognized as owning the item; `position` is where it physically is.
- When Nicco steals a merchant's figurine, the owner stays the merchant and the position becomes carried by Nicco.
- Moving an item never transfers ownership. There is no `stolen` flag: the mismatch itself is the state.
- An omitted `owner_id` means unknown, and is never guessed. `null` means explicitly unowned.
- Owners are characters only in V1. Faction, household and institutional ownership is future work.

## Model

- **`CampaignItem`:** `id`, `origin`, `name`, `description?`, `category?`, `owner_id?`, one `position`, `acquisition?`, `created_revision?`.
- **`ItemPosition`:** the existing single discriminated union, `unknown | carried{character_id} | equipped{character_id, slot, mode} | stored{location_id}`.
  - `stored` means lying or kept at a location. V1 creation accepts `carried` and `stored` only.
  - An item has exactly one position by construction. Unknown keys are rejected, so a position cannot name two places.
- **`category`:** `weapon | armor | clothing | tool | consumable | document | valuable | material | miscellaneous`. It is optional and descriptive, with no gameplay effect.
- **ID:** `campaign_item_` + 8 digits, e.g. `campaign_item_00000001`. This follows the existing `campaign_<kind>_` prefix rule for created records, which also checks for collisions with canon.
  - The allocator is `CampaignSnapshot.next_item_sequence`, introduced in snapshot schema 6.
  - The allocator lives in the snapshot draft, so a rejected, failed, stale or no-op proposal consumes no ID and no revision.
  - The namespace is engine-only: `register_item` refuses it, and snapshot validation requires every engine ID to be `created`, below the allocator, and carrying `created_revision`.

## Authorization

`create_item` is in the controller schema. It goes through the existing evidence-authorization path, like `set_condition`: there is no grammar path, so only a verified, verbatim, unhedged narration quote that names the object completes it.

The authorizer checks structure only:
- The holder is present, or the location is the current scene.
- The owner, if given, resolves to a known character. Ownership is not physical presence: an absent owner is allowed, but the verified quote's sentence must name them ("Lord Pellan's signet ring"), so an absent owner is never inferred.
- The same-named item is not already at that position, so an item is never re-materialized.

`expected_revision` and atomic batch semantics are unchanged.

## Projection

- **Controller:** sees relevant items with stable IDs. That means `TurnContext.items` (items carried or worn by present people) and `TurnContext.items_here` (items lying at the current location). `items_here` is omitted when empty.
- **Narrator:** never sees engine IDs or `created_revision`. `[CURRENT EQUIPMENT]` renders engine items by name, and authored or legacy items are unchanged. `narratorCarriedLines` is the seam for a future inventory section. No inventory dump is added to ordinary turns.

## Save / load

Snapshot schema 5 → 6 (`migrateSnapshot5to6`, chained after 4 → 5) adds `next_item_sequence`:
- Existing items are kept exactly. Nothing is inferred from narration or transcripts.
- The allocator starts above any ID already in the namespace, otherwise at 1.
- A schema-5 file already carrying the field is malformed.
- Round-trips preserve IDs, owners, positions and the allocator exactly.

## Deliberately not in V1 (extension seams)

- **Containers:** add a `contained{item_id}` position variant. This keeps one position per item.
- **Equipment, slots and hand occupancy:** the existing `equipped` variant; this is Permanent Inventory work.
- **Archetypes and templates:** an optional `archetype_id` on the instance. This also covers merchant stock and pricing.
- **Stackables:** a quantity on archetype-backed instances. V1 treats every object as one instance.
- **Ownership transfer domain:** give, sell, steal, lend and return, with a ledger. `transfer_item` and `place_item` remain the minimal primitives.
- **Institutional or household ownership, and quest predicates over items.**
