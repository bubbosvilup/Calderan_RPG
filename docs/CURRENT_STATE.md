# Caldrevan: current state

Status: Current. Last reconciled: 2026-10-13 (main 861396c plus the uncommitted Repository Cleanup A working tree). Source of truth: the current main working tree.

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
| Turn reliability (block 4): neutral progress instead of a draft stream, post-commit failures as warnings, `turn_key` idempotency with 32 persisted terminal receipts, Narrator truncation recovery (cap 768, one 1024 regeneration, max 2 logical / 3 physical attempts) | Complete; live-certified on the production model; see [report](evaluations/CONSOLIDATION_BLOCK4_TURN_RELIABILITY.md) |
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
| Reflection (D-09) | Deferred; opt-in shadow mode only. Producer OFF = no calls and no new notes; validated persisted notes are soft-promoted (Narrator-visible) |
| Foreground canonical identity binding (partner binding, conflicting-name guard; `d4e9e22`) | Complete, live-certified (see [Architecture](ARCHITECTURE.md)) |
| Person Actual Offer end to end (spoken prices, stable subject, Slave NPC on Accept, same-entity rename; `c0608a6`) | Complete |
| Campaign deletion (soft delete to `saves/.deleted/`, composer command `/location`) | Complete |
| P8 Economic Baseline V1 (`config/economy.yaml`, selective narrator price anchors) | Complete (anchors only; not a settlement currency) |
| NarrationFacts (blocks 9-11): ONE narration reader per turn (`src/turn/narration-facts/`) for movement, commerce, dialogue / speaker, identity, recipient and reference facts; authorization, Actual Offer, name establishment, the partner guard and the audit read the same facts | Complete; KPG-2 closed in block 11; see [NarrationFacts](architecture/NARRATION_FACTS.md) |

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

## 8c. Pending confirmations and manumission (block 5A)

- **Implemented:** a generic `PendingConfirmation` mechanism (interaction metadata in the save file, schema 6; confirmation card in the Play page; `POST /api/confirmation/confirm|cancel`). Manumission is its first and only production kind: the player's words ("I hereby free you, Maren.") create a card, nothing changes in the world until the player presses Confirm (zero provider calls, revalidated at that moment). The Narrator sees the act as a proposed action awaiting confirmation, never as a completed one, and the audit rejects prose that claims it as done. See [Architecture](ARCHITECTURE.md) (Class C versus PendingConfirmation) and [Persistence](architecture/PERSISTENCE.md).
- **Not changed:** Actual Offer Accept and NPC+ Promote keep their own explicit actions. The FREE grammar is unchanged (bare "I free Maren." is not recognised). AUTH-2 is CLOSED in block 5B (section 8d).

## 8d. Character lifecycle and identity repair (block 5B)

- **Implemented:** AUTH-2 closed. Narration (and a name it establishes) creates only a PROVISIONAL, scene-local person; a persistent `CampaignCharacter` is created only inside an explicitly authorized action: the player's **Keep track** on that exact person (block 12) or the person Actual Offer Accept, which materializes the same subject atomically with the purchase. RETIRED is a third lifecycle state (snapshot schema 7, save file schema 7: `CampaignCharacter.retirement`). Lifecycle is not an NPC tier.
- **Product consequences (accepted):** a named narrated stranger does not appear in the NPC drawer or among the persistent people until the player keeps them; until then they are listed under "Temporary" in the scene sidebar, are remembered only while the recent-exchange window holds them (named people are re-read after a reload from the restored exchanges; unnamed scene participants are not, PER-2B), and cannot be promoted to NPC+.
- **Repair tooling (operator only):** `retire_character` and `merge_character` through `PendingConfirmation` (`POST /api/repair/request`, then the ordinary confirm/cancel). Preconditions fail closed (player, canonical, dead, NPC+, household, legal state, items, funds, active offers; merge also names, species, sex, age, location, relationships, equipment slots). Retired characters are excluded from every live target.
- **Diagnostics:** read-only identity-fork scanner (`npm run build && node .build/src/dev/scan-identity-forks.js --out <dir> <saves>`). Same name alone is not evidence; every finding says HUMAN REVIEW REQUIRED.
- **Not changed:** Actual Offer and NPC+ Promote keep their own explicit actions; AUTH-1 stays CLOSED; no automatic duplicate repair exists.
- **Keep track (block 12, KPG-1 CLOSED):** each temporary person in the scene sidebar has a **Keep track** button. The browser sends only an opaque, campaign-bound token and `expected_revision` (`POST /api/people/keep`); the server recomputes the scene's provisional people (`src/turn/keep-track.ts`) and commits exactly one `register_character` for that SAME identity (origin `created`, trigger `player_kept`, current location, the identity facts narration established; a captive gets the neutral role "narrated captive; legal status unestablished"). It is idempotent (a second press answers "already kept" without a revision), makes no provider call, never matches fuzzily or merges by name, and adds no household, NPC+, legal status, ownership, relationship or inventory. It fails closed on an unknown, forged, other-campaign, expired or stale token, on two present people sharing the name, on a canon figure's name, on a same-name persistent person elsewhere, and on the subject of an open person offer. A later self-introduction names the kept id in place; Promote to NPC+ works on a kept person with its unchanged Heartstone eligibility. Report: [Block 12](evaluations/CONSOLIDATION_BLOCK12_KPG1_PER2_CLEANUP.md).

## 9. Time and environment

`world_minute` is the only stored clock. Calendar, seasons, observances, climate and weather are derived. Epoch: `world_minute 0` = Year 1191, Vesp Alpha 1, 00:00, Stonewake, first day of autumn. Twelve 30-day months (Aurel, Sol, Vesp, Hiem × Alpha/Med/X), six-day week, five intercalary Suns (six in leap years), six-hour weather blocks with a bounded sliding continuity window, per-place `environment_exposure`. No weather UI yet. Details: [Time and environment](architecture/TIME_AND_ENVIRONMENT.md).

## 10. UI surfaces

Play, Nicco (player page), NPC drawer, NPC+ editor, Household, Inventory, Campaigns start screen, Save control. **World** and **Debug** navigation entries exist but are disabled placeholders. See [UI](UI.md).

## 11. Save and schema

Save file schema **8**, persisted snapshot schema **8** (the composed in-memory snapshot stays schema 7-shaped). v7 → v8 is lazy and explicit: loading never rewrites; the first save moves reflection / mannerism-learning / item-sprite / portrait-Gallery state to the **side stores** `<campaign>/optional/learning.json` and `media.json` and writes per-domain markers; the marker, never store existence, decides authority (details in [Persistence](architecture/PERSISTENCE.md)). Selected avatar / full-body ids and promoted mannerisms stay authoritative. Campaign saves live in `saves/campaigns/<campaign_id>/` with portraits inside the campaign folder. Derived data (calendar, weather, capabilities, equipment slots, item icon metadata) is never saved. See [Persistence](architecture/PERSISTENCE.md).

## 11b. Core engine and optional services (block 6)

The core engine (CampaignState, persistence, turn authority, identity, movement, items, trade, legal state, households, PendingConfirmation) is separate from the optional services (Reflection, Mannerism learning, portraits, item sprites, sprite QA, semantic retrieval). Optional work runs detached after `turn_completed` and never blocks, fails or alters a turn; disabling any of it leaves core behavior identical. Defaults: Mannerism, portraits and sprites ON; Reflection, sprite QA and semantic retrieval OFF. Since block 7 their durable state lives in side stores and never moves the revision (section 11c). See [Optional services](architecture/OPTIONAL_SERVICES.md).

## 11c. Optional state side stores (block 7)

Optional enrichment and media bookkeeping (Reflection journal and notes, mannerism observations/candidates/journal, item sprite status, portrait Gallery history) no longer lives in the authoritative snapshot and never moves the semantic revision: a client's `expected_revision` stays valid through background work, a Gallery batch / sprite / note / mannerism observation is not a revision, selecting an avatar and an actual mannerism promotion bump it exactly once. Reflection notes remain durable and Narrator-visible with the producer OFF. **ARCH-1 is closed; the Consolidation Gate is complete.** Context compaction is CORE (derived, awaited after commit, outside the optional registry). See [Optional services](architecture/OPTIONAL_SERVICES.md).

## 12. Tests

See [Testing](TESTING.md). Build discipline (Repository Cleanup A): `npm run build` deletes `.build/` first, so `npm test` and the benchmark never run a stale compiled test; `npm run clean` and `npm run check:architecture` exist; private tool output goes to the gitignored `artifacts/local/`. Latest recorded run (REPO-12 working tree on top of `845d778`, clean `.build`): **3679 tests, 0 failed**; benchmark 55/55, 0 known gaps; canonical character names and aliases are reserved identity handles that no non-canonical person acquires (late naming, the provisional reading and Keep track; [Naming](architecture/NAMING.md)); the partner identity guard now charges a self-introduction to the partner only when its NarrationFacts subject may be the partner ([REPO-12](evaluations/REPO12_CANONICAL_NAME_CONFLICT.md)). Earlier (Repository Cleanup A on top of `861396c`): **3664 tests, 0 failed**; benchmark 55/55, 0 known gaps. Earlier (uncommitted block 12 on top of `a6d1bcd`): **3660 tests, 0 failed** (+23 = Keep track tests, benchmark scenarios K1-K10 and the updated gates; `npm run benchmark:modern`: 55 scenarios, 55 PASS, 0 KNOWN PRODUCT GAPS, 0 FAIL; I4 / KPG-1 now passes; see [Block 12](evaluations/CONSOLIDATION_BLOCK12_KPG1_PER2_CLEANUP.md)); earlier (block 11 on top of `7345549`): **3637 tests, 0 failed** ( +38 = NarrationFacts identity / speaker / recipient / reference tests, the twelve source-level architecture assertions and benchmark scenarios I5-I13; `npm run benchmark:modern`: 45 scenarios, 44 PASS, 1 KNOWN PRODUCT GAP (I4, KPG-1), 0 FAIL; C8 / KPG-2 now passes; see [Block 11](evaluations/CONSOLIDATION_BLOCK11_FINAL_SEMANTIC_ARCHITECTURE.md)); earlier (uncommitted block 10 on top of `9d15212`): **3599 tests, 0 failed** (3578 at block 9; benchmark 36 scenarios, 34 PASS, 2 KNOWN PRODUCT GAPS; see [Block 10](evaluations/CONSOLIDATION_BLOCK10_NARRATIONFACTS_COMMERCE.md)); earlier (block 9 on top of `45eae19`): **3578 tests, 0 failed** (3545 at block 8; +33 = NarrationFacts movement and location-claim tests and benchmark scenarios M4-M11; `npm run benchmark:modern`: 28 scenarios, 27 PASS, 1 KNOWN PRODUCT GAP, 0 FAIL, location-claim patch included, see [Block 9](evaluations/CONSOLIDATION_BLOCK9_NARRATIONFACTS_MOVEMENT.md)); earlier (block 8 on top of `56e4f0e`): **3545 tests, 0 failed** (3520 at block 7; +25 = the modern benchmark: 20 scenarios and 5 format gate tests; `npm run benchmark:modern` reports 19 PASS, 1 KNOWN PRODUCT GAP, 0 FAIL, see [Block 8](evaluations/CONSOLIDATION_BLOCK8_MODERN_BENCHMARK.md)); earlier: **3480 tests** at block 6 (3460 at block 5B, 3425 at block 5A, 3377 at block 4); earlier: **3334 tests, 0 failed** on top of `5edcd37` (consolidation block 3, offline + one focused live run; 3313 after block 2, 3287 after block 1; 3278 at `c0608a6`) ([report](evaluations/PERSON_ACTUAL_OFFER_END_TO_END_FIX.md)) (offline; `npm test` makes no live LLM or image call). Historical reports keep their own counts.

Companion movement (block 3): who MAY follow Nicco is derived per turn by `followCandidates` (`src/turn/follow-candidates.ts`: active NPC+, held person, household member, person invited by name this turn); it is never persisted and never moves anyone by itself. A candidate moves only through a completed narrated follow of that same person, or, for a held person the player names and leads ("Alright Maren, ..., let's go home"), through the deterministic escort committed in the same atomic batch as Nicco's travel. Report: [block 3](evaluations/CONSOLIDATION_BLOCK3_COMPANION_MOVEMENT.md).

Strategic review after the consolidation blocks: [Post-consolidation architecture review](evaluations/POST_CONSOLIDATION_ARCHITECTURE_REVIEW.md) (open-debt ranking, ARCH-1/ARCH-2, Wave A).

## 13. Major known limitations

See the maintained list in [Roadmap](ROADMAP.md#known-limitations). Headlines: no Property system or containers, no authoritative equipment-slot domain or equip/unequip, no encumbrance, no avatar upload pipeline, no `headwear`/`footwear` item categories, no weather UI, no automatic NPC+ demotion, canonical avatars are served as full-size originals, PER-2B (unkept unnamed scene participants are forgotten on reload; section 8d). Closed in block 12: KPG-1 (Keep track) and PER-2A / ID-2 (reload-safe participant ids). Fixed in consolidation blocks 1-2: IMG-1, TRD-1, TRD-2, TRD-1b (SELL transfers the same item), TRD-3/TRD-4 (one price grammar), TRD-5 (offer terms digest), TRD-10 (pending-offer narration guard). Closed in block 11: KPG-2 (unattributed plain price line). Open trade debt: TRD-11 goods ledger and ECO-1 currency model; see [debt register](MASTER_DEBT_REGISTER.md).

## 14. Next major systems

Property domain (containers and property storage), equipment domain (categories, slots, equip/unequip), weather UI, then the broader simulation systems listed in the [Roadmap](ROADMAP.md).
