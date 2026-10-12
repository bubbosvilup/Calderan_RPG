# Caldrevan: current state

Status: Current. Last reconciled: 2026-10-12 (main c0608a6). Source of truth: the current main working tree.

This is the best "where are we now?" document. Details live in the linked documents; historical results live in [evaluation reports](evaluations/), which are never rewritten.

## 1. What Caldrevan is

A deterministic engine for long-running, AI-narrated roleplay set on the continent Helion, starting in the West at Calderan. The player is Nicco, an otherworlder who arrives at the Calderan slave market and holds the Heartstone Tower. Models write prose and propose changes; the engine owns truth (see [Architecture](ARCHITECTURE.md)). A local web UI (`npm run play:ui`) plays persistent campaigns with autosave.

## 2. Core architecture (one line each)

Player input → `GameSession` → `TurnCoordinator` → Narrator (draft) → State Controller (proposal) → schema validation → evidence authorization → narration audit → `expected_revision` + `CampaignState.prepare` → one atomic commit → derived read models and Scene State Projection → UI and next turn context. Authored canon is immutable; retrieval is informational; the UI only reads read models.

## 3. Implemented systems

| System | Status |
| --- | --- |
| Authored canon (YAML), `WorldStore`, visibility tiers | Complete for the current canon; restricted tiers withheld from public channels |
| Campaign state: characters, items, households, knowledge, relationships, funds, schedules | Complete (V1 domains) |
| Turn pipeline with evidence authorization and narration audit | Complete |
| Scene State Projection (`[CURRENT SCENE]`) and prompt cleanup | Complete |
| Controller authorization and diagnostics hardening | Complete |
| Item lifecycle (pickup, drop, handoff, placement) with intent binding, bounded narrator-receipt recovery, per-item conflict rejection, evidenced ownership | Complete (supported placement paths only) |
| Major canon lore migration and canon gap closure | Complete |
| Calendar V1, Season V1, Weather V1, environment exposure | Complete (engine and read model); no weather UI yet |
| Foundation re-certification and Pre-Property Debt Zero | Complete |
| Heartstone: opening documents, household rules, household rite, rite → NPC+ promotion, recognition warmth | Complete; the rite is player-authored fiction completed by an explicit UI promotion action (see [Heartstone](HEARTSTONE.md)) |
| NPC tiers and derived UI capabilities | Complete |
| Canonical NPC authored avatars | Complete (six characters) |
| Player character visuals: Avatar, Full Body, Gallery, generation, appearance editing | Complete |
| Inventory grid, equipment presentation (4 slots, read-only), item icon/detail visual roles, authoritative Gold | Foundation complete |
| Item sprite generation for engine-created items (non-authoritative, queued between turns) | Implemented (see [Image system](IMAGE_SYSTEM.md)) |
| Persistent campaigns: manual save, autosave, recovery, scenario registry | Complete |
| Reflection (D-09) | Deferred; opt-in shadow mode only, never exposed to narration |
| Foreground canonical identity binding (partner binding, conflicting-name guard; `d4e9e22`) | Complete, live-certified (see [Architecture](ARCHITECTURE.md)) |
| Person Actual Offer end to end (spoken prices, stable subject, Slave NPC on Accept, same-entity rename; `c0608a6`) | Complete |
| Campaign deletion (soft delete to `saves/.deleted/`, composer command `/location`) | Complete |
| P8 Economic Baseline V1 (`config/economy.yaml`, selective narrator price anchors) | Complete (anchors only; not a settlement currency) |

## 4. Current model topology (verified in code)

| Role | Model | Notes |
| --- | --- | --- |
| Narrator | `z-ai/glm-5.2` | fixed provider route `z-ai/fp8`, `allow_fallbacks: false`, hidden reasoning disabled |
| State Controller | `openai/gpt-6-luna` | fallback `anthropic/claude-haiku-5.5` through OpenRouter's native `models` fallback; `require_parameters: true`, `allow_fallbacks: true`, reasoning excluded |
| Mannerism extractor | `openai/gpt-6-luna` | `require_parameters: true`, reasoning disabled |
| Reflection | `anthropic/claude-haiku-5.5` | single model, no fallback; only active when `CALDREVAN_REFLECTION_MODE=shadow` (default `off`) |
| Item sprite quality reviewer | `anthropic/claude-haiku-5.5` | reviews generated item sprites |
| Context compressor | none by default | optional `CONTEXT_COMPRESSOR_MODEL`; the lossless compactor works without a model |
| Images | `Qwen/Qwen-Image` + `Raelina/Raena-Qwen-Image` LoRA on `fal-ai` via the Hugging Face router | billed to `HF_TOKEN`; OpenRouter is not used for images |

Configuration and environment variables: [Configuration](CONFIGURATION.md). Earlier models (MiniMax M2-her narrator, DeepSeek controller, Qwen controller) are historical.

## 5. Character tiers

| Tier | Meaning | UI |
| --- | --- | --- |
| World / canon NPC | Authored world character with no campaign record | read-only drawer; may show an authored canonical avatar; no NPC+ tooling |
| Campaign NPC | Persistent runtime character (campaign record) that is not promoted | read-only presentation; no image workflow; an eligible one (active, inside Heartstone, Nicco the Keeper) shows the small up-arrow "Promote to NPC+" (`can_promote_to_npc_plus`) |
| NPC+ | Promoted: an authoritative `premium_characters[]` record exists | Avatar, Full Body, Gallery, generation, editable permanent appearance |
| Player character | Separate semantic type (`player_characters[0]`); Nicco is **not** NPC+ | same visual editor infrastructure; no premium record is ever created for Nicco |

Capabilities are **derived** in the read model on every projection (`src/app/character-capabilities.ts`) and never persisted. Tier-inappropriate controls are omitted rather than shown disabled; an NPC+ action may still be disabled for a runtime reason (inactive or dead character, provider not configured).

**Promoted NPC+ versus `activeNpcPlus`.** *Promoted* (`isNpcPlus`) is the persistent promotion milestone: the premium record. `activeNpcPlus` is the narrower behavior gate: promoted **and** currently an active household member. A promoted character does not stop being NPC+ when they leave the household; UI editing follows promotion (subject to inactive/dead restrictions), not household presence. There is no automatic demotion.

## 6. Heartstone (summary)

Nicco starts as lawful owner and holder of the Heartstone Tower, recognized by the normal civil and property registry. He carries two real items, `Deed of Ownership — Heartstone Tower` and `Heartstone Household Charter`. Three household rules are seeded. The household rite is roleplayed in fiction; the player explicitly confirms completion through the UI promotion action (`completeHeartstoneRite`), which atomically establishes active household membership and NPC+ promotion. The engine no longer infers the rite from narration. Recognized people feel gentle supernatural warmth through bare skin on the interior stone; others feel ordinary stone. The Heartstone is not sentient. Full detail: [Heartstone](HEARTSTONE.md). The full Property system is **not** implemented.

## 7. Images

Hugging Face-routed `fal-ai` text-to-image with the Raena anime LoRA. Avatar (992 × 992) and Full Body (800 × 1200) roles, batches of three with unique seeds, a Gallery (limit 64), selected Avatar and Full Body per character, an appearance fingerprint that marks older images stale, adult-only generation, one recovery for a content refusal. Player and NPC+ share the same infrastructure. Images never become narrative truth and never reach the narrator or controller. Details: [Image system](IMAGE_SYSTEM.md).

## 8. Items and inventory

One position per item (`unknown`, `carried`, `equipped`, `stored(location_id)`); the owner is a separate field (owner ≠ carrier). Inventory is derived from positions. Conflicting authorized mutations for one item are rejected for that item while unrelated valid commands still commit; exact duplicates are deduplicated. The Inventory screen is a compact icon grid with All/Carried/Equipped filters, search, a local detail panel, Gold from authoritative funds, and a read-only four-slot equipment presentation (Head, Chest, Weapon, Boots) mapped by item category only. Details: [Item domain](architecture/ITEM_DOMAIN.md), [Inventory UI](architecture/INVENTORY_UI_V1.md), [UI](UI.md).

## 8b. Trade (Actual Offer V1) and player-authorized actions
- **Implemented:** goods BUY and SELL and person BUY as `TradeOffer`s ([Actual Offer](architecture/ACTUAL_OFFER.md)). An offer is a pending proposal; only the player's Accept settles it (`POST /api/trade/accept`, ref + `expected_revision`), atomically and at most once. One active offer; a new offer supersedes the old; counteroffers happen in chat; persists through save/load (optional `trade_offers` field, schemas 6/5 unchanged). Card is masked (unknown enslaved people show "Slave" / "<descriptor> Slave").
- **Currency:** settlement is whole-number gold only (no silver, decimals or exchange). The narrator's price anchors (`config/economy.yaml`, P8 Economic Baseline) may be written in silver (10 silver = 1 gold) but never settle; see the [debt register](MASTER_DEBT_REGISTER.md) (ECO-1).
- **Person Accept:** accepting a person offer always leaves a persistent Campaign NPC (reused, canonical or created from the authoritative subject), shown as "Slave" until the name is learned; a later self-introduction renames the same entity.
- **Not supported (intentionally):** Auction House, vendor inventories/wallets/stock/shops, person SELL. Sold goods leave the tracked scope (V1).
- **Heartstone:** explicit promotion works (↑ action, `completeHeartstoneRite`); there is no semantic rite inference and Narrator prose cannot promote ([Heartstone](HEARTSTONE.md)).
- **NPC+:** the product term; the persisted record is still named `premium_characters[]` (legacy internal naming, not renamed).
- **Pattern:** high-impact transitions are player-authorized ([Architecture §2b](ARCHITECTURE.md)); ordinary state is still inferred.

## 9. Time and environment

`world_minute` is the only stored clock. Calendar, seasons, observances, climate and weather are derived. Epoch: `world_minute 0` = Year 1191, Vesp Alpha 1, 00:00, Stonewake, first day of autumn. Twelve 30-day months (Aurel, Sol, Vesp, Hiem × Alpha/Med/X), six-day week, five intercalary Suns (six in leap years), six-hour weather blocks with a bounded sliding continuity window, per-place `environment_exposure`. No weather UI yet. Details: [Time and environment](architecture/TIME_AND_ENVIRONMENT.md).

## 10. UI surfaces

Play, Nicco (player page), NPC drawer, NPC+ editor, Household, Inventory, Campaigns start screen, Save control. **World** and **Debug** navigation entries exist but are disabled placeholders. See [UI](UI.md).

## 11. Save and schema

Snapshot schema **6**; save file schema **5** (older save schemas migrate on load; the source file is never rewritten by a load). Campaign saves live in `saves/campaigns/<campaign_id>/` with portraits inside the campaign folder. Derived data (calendar, weather, capabilities, equipment slots, item icon metadata) is never saved. See [Persistence](architecture/PERSISTENCE.md).

## 12. Tests

See [Testing](TESTING.md). Latest recorded run: **3287 tests, 0 failed** on top of `878acd3` (consolidation block 1: IMG-1, TRD-1, TRD-2 fixed; previously 3278 at `c0608a6`) ([report](evaluations/PERSON_ACTUAL_OFFER_END_TO_END_FIX.md)) (offline; `npm test` makes no live LLM or image call). Historical reports keep their own counts.

## 13. Major known limitations

See the maintained list in [Roadmap](ROADMAP.md#known-limitations). Headlines: no Property system or containers, no authoritative equipment-slot domain or equip/unequip, no encumbrance, no avatar upload pipeline, no `headwear`/`footwear` item categories, no weather UI, no automatic NPC+ demotion, canonical avatars are served as full-size originals. Open trade debts: TRD-1b (SELL deletes the item instead of transferring it to the counterparty), TRD-3/TRD-4 (two disagreeing price parsers; currency filter rejects material words). Fixed 2026-10-12 (offline): IMG-1 (age never gates portraits), TRD-1 (SELL needs ownership, `item_not_owned`), TRD-2 (goods offers rechecked on the delivered text); see [debt register](MASTER_DEBT_REGISTER.md).

## 14. Next major systems

Property domain (containers and property storage), equipment domain (categories, slots, equip/unequip), weather UI, then the broader simulation systems listed in the [Roadmap](ROADMAP.md).
