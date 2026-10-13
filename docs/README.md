# Caldrevan documentation index

Status: Current. Last reconciled: 2026-10-13 (consolidation block 11 on top of main 7345549). Source of truth: the code on main. Authority order when documents disagree: **code, then tests, then authored data/canon, then the latest reports, then older active docs, then historical plans.**

Labels: **NORMATIVE** (the maintained description of current behavior), **ACTIVE** (accurate reference), **HISTORICAL** (a record of a past decision or evaluation; may describe things that no longer exist), **SUPERSEDED** (replaced; carries a pointer to its replacement). Evaluation reports under `docs/evaluations/` and the report files in the repository root are historical and are never rewritten.

## Start here

- [Project README](../README.md): what it is, how to run it.
- **NORMATIVE** [Current state](CURRENT_STATE.md): where the project is now.
- **NORMATIVE** [Architecture](ARCHITECTURE.md): governing model, mutation path, authority table.
- **NORMATIVE** [Roadmap and known limitations](ROADMAP.md).
- ACTIVE [Master Technical Debt Register](MASTER_DEBT_REGISTER.md) and [Master Roadmap](MASTER_ROADMAP.md) (2026-10-12 full audit; detailed evidence in [evaluations/codebase_audit_2026-10-12/](evaluations/codebase_audit_2026-10-12/)).
- [Configuration](CONFIGURATION.md): environment variables, models, run modes.

## Architecture

- **NORMATIVE** [Architecture](ARCHITECTURE.md)
- **NORMATIVE** [NarrationFacts](architecture/NARRATION_FACTS.md) (the one narration reader per turn: movement, commerce, dialogue / speaker, identity, recipient and reference facts; who decides what; residual reader classification); report: [CONSOLIDATION_BLOCK11](evaluations/CONSOLIDATION_BLOCK11_FINAL_SEMANTIC_ARCHITECTURE.md)
- **NORMATIVE** [Actual Offer V1](architecture/ACTUAL_OFFER.md) (player-authorized trade: lifecycle, settlement, masking, exclusions); report: [ACTUAL_OFFER_V1](evaluations/ACTUAL_OFFER_V1.md) (evaluation, historical)
- ACTIVE [Turn coordinator](architecture/TURN_COORDINATOR.md), [Evidence authorization](architecture/EVIDENCE_AUTHORIZATION.md), [Narrative authority](architecture/NARRATIVE_AUTHORITY.md), [Physical interaction](architecture/PHYSICAL_INTERACTION.md), [Transfer domain](architecture/TRANSFER_DOMAIN_V1.md)
- **NORMATIVE** [Optional services](architecture/OPTIONAL_SERVICES.md) (core / optional boundary, OFF semantics, consolidation gate); report: [CONSOLIDATION_BLOCK6](evaluations/CONSOLIDATION_BLOCK6_CORE_OPTIONAL_SPLIT.md)
- ACTIVE [LLM providers](architecture/LLM_PROVIDER.md) (contract; Phase 1K model choices are historical)
- ACTIVE [Naming](architecture/NAMING.md)

## Runtime / Engine

- **NORMATIVE** [Scene State Projection V1](architecture/SCENE_STATE_PROJECTION_V1.md), [Narrative context](architecture/NARRATIVE_CONTEXT.md)
- ACTIVE [Campaign state](architecture/CAMPAIGN_STATE.md), [Item domain](architecture/ITEM_DOMAIN.md), [Player character](architecture/PLAYER_CHARACTER.md), [City travel](architecture/CITY_TRAVEL.md), [Scene RAM](architecture/SCENE_RAM.md)
- **NORMATIVE** [Time and environment](architecture/TIME_AND_ENVIRONMENT.md) (calendar, seasons, climate, weather, exposure)
- **NORMATIVE** [Heartstone](HEARTSTONE.md)
- ACTIVE Retrieval: [Retrieval](architecture/RETRIEVAL.md), [Lexical search](architecture/LEXICAL_SEARCH.md), [Semantic search](architecture/SEMANTIC_SEARCH.md)

## World / Canon

- **NORMATIVE** [Canon overview](world/CANON_OVERVIEW.md) (public summary plus a flagged author-only section)
- ACTIVE [Authoring guide](authoring/AUTHORING_GUIDE.md), [Geography](authoring/GEOGRAPHY.md), [Calderan spatial canon](authoring/CALDERAN_SPATIAL_CANON.md), [Authored data architecture](architecture/AUTHORED_DATA_ARCHITECTURE.md), templates in `authoring/templates/`
- ACTIVE [Entity schema](schemas/ENTITY_SCHEMA.md), [Knowledge chunks](schemas/KNOWLEDGE_CHUNKS.md)

## UI

- **NORMATIVE** [UI](UI.md) (implemented controls), [UI engine contract](UI_ENGINE_CONTRACT.md)
- ACTIVE [Inventory UI](architecture/INVENTORY_UI_V1.md), [Player character](architecture/PLAYER_CHARACTER.md)
- Screenshots: `ui-screenshots/` (historical captures)

## Images

- **NORMATIVE** [Image system](IMAGE_SYSTEM.md)
- ACTIVE [Item visual identity](architecture/ITEM_VISUAL_IDENTITY_V1.md)
- HISTORICAL [Sprite fidelity hardening](architecture/SPRITE_FIDELITY_HARDENING.md), [Sprite quality V2](architecture/SPRITE_QUALITY_V2.md), `portrait-benchmark-anime/`
- SUPERSEDED [image_system_audit.md](image_system_audit.md), [image_system_v1_gap_analysis.md](image_system_v1_gap_analysis.md)

## Persistence

- **NORMATIVE** [Persistence](architecture/PERSISTENCE.md) (save file schema 8, optional side stores)
- SUPERSEDED [save_load_audit.md](save_load_audit.md), [save_load_v1_design.md](save_load_v1_design.md) (implemented)

## Testing

- **NORMATIVE** [Testing](TESTING.md)

## Roadmap

- **NORMATIVE** [Roadmap and known limitations](ROADMAP.md)

## Evaluation reports and historical documents

- Consolidation reports (2026-10-12/13, newest first): [Block 11 final semantic architecture](evaluations/CONSOLIDATION_BLOCK11_FINAL_SEMANTIC_ARCHITECTURE.md) · [Block 10 commerce facts](evaluations/CONSOLIDATION_BLOCK10_NARRATIONFACTS_COMMERCE.md) · [Block 9 movement facts](evaluations/CONSOLIDATION_BLOCK9_NARRATIONFACTS_MOVEMENT.md) · [Block 8 modern benchmark](evaluations/CONSOLIDATION_BLOCK8_MODERN_BENCHMARK.md) · [Block 7 optional state](evaluations/CONSOLIDATION_BLOCK7_OPTIONAL_STATE_MIGRATION.md) · [Block 6 core / optional split](evaluations/CONSOLIDATION_BLOCK6_CORE_OPTIONAL_SPLIT.md) · [Block 5B character lifecycle](evaluations/CONSOLIDATION_BLOCK5B_CHARACTER_LIFECYCLE.md) · [Block 5A pending confirmation](evaluations/CONSOLIDATION_BLOCK5A_PENDING_CONFIRMATION.md) · [Block 4 turn reliability](evaluations/CONSOLIDATION_BLOCK4_TURN_RELIABILITY.md) · [Block 3 companion movement](evaluations/CONSOLIDATION_BLOCK3_COMPANION_MOVEMENT.md) · [Block 2 commerce integrity](evaluations/CONSOLIDATION_BLOCK2_COMMERCE_INTEGRITY.md) · [Post-consolidation review](evaluations/POST_CONSOLIDATION_ARCHITECTURE_REVIEW.md); live evidence in `evaluations/consolidation_block*_live/`.
- Reports: [docs/evaluations/](evaluations/) (immutable history; other recent ones are [Documentation reconciliation](evaluations/DOCUMENTATION_RECONCILIATION_CURRENT_STATE.md), [Player visuals and inventory](evaluations/PLAYER_VISUALS_INVENTORY_UI_FOUNDATION.md), [Canon NPC avatars](evaluations/CANON_NPC_AUTHORED_AVATAR_INTEGRATION.md), [Heartstone household rite](evaluations/HEARTSTONE_HOUSEHOLD_RITE.md), [Temporal and environmental systems](evaluations/TEMPORAL_ENVIRONMENTAL_SYSTEMS_V1.md), [Pre-property debt zero](evaluations/PRE_PROPERTY_DEBT_ZERO_PASS.md), [Foreground canonical identity binding](evaluations/FOREGROUND_CANONICAL_IDENTITY_BINDING_P0.md), [Person Actual Offer end to end](evaluations/PERSON_ACTUAL_OFFER_END_TO_END_FIX.md), [Player image generation UX hardening](evaluations/PLAYER_IMAGE_GENERATION_UX_HARDENING.md)).
- HISTORICAL phase documents: [Phase 1_DECISIONS](architecture/PHASE_1_DECISIONS.md), [Phase 1E](architecture/PHASE_1E.md), [Phase 1E.2 audit](architecture/PHASE_1E_2_AUDIT.md), [Retrieval foundation](architecture/RETRIEVAL_FOUNDATION.md), [Scene delta engine](architecture/SCENE_DELTA_ENGINE.md), [Lexical search evaluation](architecture/LEXICAL_SEARCH_EVALUATION.md), [Semantic search evaluation](architecture/SEMANTIC_SEARCH_EVALUATION.md)
- SUPERSEDED [Engine capabilities before UI](ENGINE_CAPABILITIES_PRE_UI.md), [Engine freeze register](ENGINE_FREEZE_PRE_UI.md)
- HISTORICAL report files in the repository root (preserved as written): [ANIME_PORTRAIT_MODEL_BENCHMARK_V1.md](../ANIME_PORTRAIT_MODEL_BENCHMARK_V1.md) · [CANONICAL_NPC_CASTING_EPHEMERAL_DUPLICATION_AUDIT_FIX.md](../CANONICAL_NPC_CASTING_EPHEMERAL_DUPLICATION_AUDIT_FIX.md) · [CHARACTER_PERFORMANCE_CONTRACT_PILOT.md](../CHARACTER_PERFORMANCE_CONTRACT_PILOT.md) · [CREATED_NAME_PROVENANCE_CONTINUITY_FIX.md](../CREATED_NAME_PROVENANCE_CONTINUITY_FIX.md) · [CREATED_PERSON_IDENTITY_BINDING_FIX.md](../CREATED_PERSON_IDENTITY_BINDING_FIX.md) · [CURRENT_CHARACTER_NAME_PROJECTION_FIX.md](../CURRENT_CHARACTER_NAME_PROJECTION_FIX.md) · [DEBT_REGISTER.md](../DEBT_REGISTER.md) · [HOUSEHOLD_UI_AND_NPCPLUS_APPEARANCE_EDITOR_AUDIT.md](../HOUSEHOLD_UI_AND_NPCPLUS_APPEARANCE_EDITOR_AUDIT.md) · [LONG_PLAYTHROUGH_STATE_CONTINUITY_AUDIT.md](../LONG_PLAYTHROUGH_STATE_CONTINUITY_AUDIT.md) · [P11_KISS_TIME_OF_DAY_FOUNDATION.md](../P11_KISS_TIME_OF_DAY_FOUNDATION.md) · [P11_TEMPORAL_SYSTEM_AUDIT.md](../P11_TEMPORAL_SYSTEM_AUDIT.md) · [P12_1_BOUNDED_RECENT_SCENE_NARRATION.md](../P12_1_BOUNDED_RECENT_SCENE_NARRATION.md) · [P12_2_CANONICAL_DEPARTURE_RECONCILIATION.md](../P12_2_CANONICAL_DEPARTURE_RECONCILIATION.md) · [P12_IMMEDIATE_SCENE_CONTINUITY_AUDIT.md](../P12_IMMEDIATE_SCENE_CONTINUITY_AUDIT.md) · [P3_3_CANONICAL_NAME_DISCLOSURE_FINAL.md](../P3_3_CANONICAL_NAME_DISCLOSURE_FINAL.md) · [P3_3_P10_P11_REGENERATION_FIX.md](../P3_3_P10_P11_REGENERATION_FIX.md) · [P3_4_CANONICAL_PARTICIPANT_CONTINUITY.md](../P3_4_CANONICAL_PARTICIPANT_CONTINUITY.md) · [P3_5_CANONICAL_NAME_KNOWLEDGE_COMMIT.md](../P3_5_CANONICAL_NAME_KNOWLEDGE_COMMIT.md) · [P8_ECONOMIC_BASELINE_PRICE_ANCHORS.md](../P8_ECONOMIC_BASELINE_PRICE_ANCHORS.md) · [PERMANENT_APPEARANCE_EDITOR_BROWSER_QA.md](../PERMANENT_APPEARANCE_EDITOR_BROWSER_QA.md) · [PERMANENT_APPEARANCE_V1.md](../PERMANENT_APPEARANCE_V1.md) · [PLAYER_CHARACTER_PROJECTION_AUDIT.md](../PLAYER_CHARACTER_PROJECTION_AUDIT.md) · [PLAYER_MOVEMENT_LOCATION_CONSISTENCY_AUDIT_FIX.md](../PLAYER_MOVEMENT_LOCATION_CONSISTENCY_AUDIT_FIX.md) · [PLAYER_TRAVEL_AUTHORITY_AND_LOCATION_SAFESWITCH_IMPLEMENTATION.md](../PLAYER_TRAVEL_AUTHORITY_AND_LOCATION_SAFESWITCH_IMPLEMENTATION.md) · [PLAYER_TRAVEL_AUTHORITY_FULL_AUDIT_AND_PLAN.md](../PLAYER_TRAVEL_AUTHORITY_FULL_AUDIT_AND_PLAN.md) · [PORTRAIT_GALLERY_AND_ROLES_V2.md](../PORTRAIT_GALLERY_AND_ROLES_V2.md) · [PORTRAIT_IMAGE_GENERATION_V1.md](../PORTRAIT_IMAGE_GENERATION_V1.md) · [PORTRAIT_PROMPT_BUILDER_V1.md](../PORTRAIT_PROMPT_BUILDER_V1.md) · [TEMPORAL_ACTION_RESOLVER_V1.md](../TEMPORAL_ACTION_RESOLVER_V1.md) · [UI_PLAYSCREEN_CHARACTER_CARD_REBUILD.md](../UI_PLAYSCREEN_CHARACTER_CARD_REBUILD.md) · [UI_V1_IMMERSIVE_PLAYTEST_INTERFACE.md](../UI_V1_IMMERSIVE_PLAYTEST_INTERFACE.md)
