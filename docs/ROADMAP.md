# Roadmap and known limitations

Status: Current. Last reconciled: 2026-10-11. Source of truth: the code and tests on main; each row below was checked against them.

## Complete

| Item | Notes |
| --- | --- |
| Engine foundation: state, turn pipeline, evidence authorization, narration audit, persistence | |
| Scene State Projection and prompt cleanup | |
| Controller/authorization hardening and subsystem hardening | |
| Canon lore migration and canon gap closure | |
| Weather System V1 (calendar, seasons, climate, weather, exposure) | engine and read model only |
| Foundation re-certification, item pickup/lifecycle, Pre-Property Debt Zero | |
| Heartstone: opening documents, household rules, rite, rite = household + NPC+, recognition warmth | see [Heartstone](HEARTSTONE.md) |
| Canon NPC avatars; player visuals and appearance editing | |
| Item sprite generation for engine-created items | non-authoritative |
| Persistent campaigns (manual save, autosave, recovery) | schema 6 / save 5 |
| Explicit NPC+ / Heartstone promotion (semantic rite cleanup) | player action only; see [Heartstone](HEARTSTONE.md) |
| Actual Offer V1 (goods and person trade, player-accepted) | see [Actual Offer](architecture/ACTUAL_OFFER.md) |


## Partial / foundation only

| Item | What exists | What is missing |
| --- | --- | --- |
| Equipment slot presentation | read-only 4 slots mapped by item category | authoritative slot domain, equip/unequip, headwear/footwear categories |
| Item visual asset system | sprite > template > glyph > placeholder; sprite jobs | curated authored template library; thumbnails |
| Inventory UI | grid, filters, detail panel, Gold | actions (equip, drop, use) |
| Reflection (D-09) | opt-in shadow mode | deliberately deferred; never exposed to narration |

## Not yet complete (not implemented)

Full Property system (generic property entity, containers and property storage, room use/ownership, upgrades), equipment mechanics and equip/unequip, encumbrance, economy history, world event ledger, deeper rumor propagation, NPC routines beyond current schedules, quest engine, combat, medicine, **Weather UI** (next), World and Debug screens, avatar Upload.

## Next

Weather UI, then Property/Heartstone property work, then the systems above as prioritized by the author. Later, if needed: merchant/vendor capabilities on top of Actual Offer, an Auction House engine (a different lot/bid model), multi-currency, a richer promotion UI, equipment, full commerce/stock simulation, and a scripted-action-log certification benchmark ([Testing](TESTING.md)).

## Known limitations

- Actual Offer V1: whole-number gold only; no vendor inventory, Auction House or person SELL; sold goods leave the tracked scope; person offers are read from narration, not Controller-proposed; legacy internal `premium` naming remains (`premium_characters[]`; product term is NPC+).

- No Property system and no containers (items are `unknown`, `carried`, `equipped` or `stored(location_id)` only; `inventory.ts` states "no containers in V1").
- An `equipped` item position exists (free-form slot string plus worn/held mode, e.g. initial equipment), but there is no equipment slot domain or slot validation, and the model cannot equip by itself (`transfer_item` to `equipped` without established evidence is rejected). The UI's four slots are a read-only projection by item category; Head and Boots stay empty because the domain has no `headwear`/`footwear` categories (categories: weapon, armor, clothing, tool, consumable, document, valuable, material, miscellaneous).
- No encumbrance or weight limit.
- No weather UI; weather appears only in the narrator's scene line and the `environment` read model.
- No avatar Upload (`AVATAR_UPLOAD_SUPPORTED = false`); canon avatars are about 2.3 MB PNGs served at full size.
- No automatic NPC+ demotion; promotion is persistent. Whether a promoted NPC+ who left the household stays behavior-active (`activeNpcPlus`) is an open user decision.
- Reference images are not used for generation.
- Weather has no temperature physics, wind, humidity or survival effects; South has no named settlements.
- Evidence authorization is conservative: ambiguous narration may fail to commit a change (false negatives preferred).
- World and Debug navigation entries are disabled placeholders; the NPC+ Personality and Relations tabs are placeholders.
- The `premium-characters.ts` header comment says household membership is the only promotion trigger; this is still true (the rite is `join_household`, now issued only by the player's explicit promotion action).
- The promotion UI is a single arrow with an inline confirmation; a richer promotion screen (roles, appearance check, portrait step) is optional future polish. Certification scenarios and replay benchmarks must trigger the promotion explicitly; transcript replay alone cannot.
