# Caldrevan documentation index

Status: Current. Last reconciled: 2026-10-11. Source of truth: the code on main. Authority order when documents disagree: **code, then tests, then authored data/canon, then the latest reports, then older active docs, then historical plans.**

Labels: **NORMATIVE** (the maintained description of current behavior), **ACTIVE** (accurate reference), **HISTORICAL** (a record of a past decision or evaluation; may describe things that no longer exist), **SUPERSEDED** (replaced; carries a pointer to its replacement). Evaluation reports under `docs/evaluations/` and the report files in the repository root are historical and are never rewritten.

## Start here

- [Project README](../README.md): what it is, how to run it.
- **NORMATIVE** [Current state](CURRENT_STATE.md): where the project is now.
- **NORMATIVE** [Architecture](ARCHITECTURE.md): governing model, mutation path, authority table.
- **NORMATIVE** [Roadmap and known limitations](ROADMAP.md).
- [Configuration](CONFIGURATION.md): environment variables, models, run modes.

## Architecture

- **NORMATIVE** [Architecture](ARCHITECTURE.md)
- ACTIVE [Turn coordinator](architecture/TURN_COORDINATOR.md), [Evidence authorization](architecture/EVIDENCE_AUTHORIZATION.md), [Narrative authority](architecture/NARRATIVE_AUTHORITY.md), [Physical interaction](architecture/PHYSICAL_INTERACTION.md), [Transfer domain](architecture/TRANSFER_DOMAIN_V1.md)
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

- **NORMATIVE** [Persistence](architecture/PERSISTENCE.md) (snapshot schema 6, save file schema 5)
- SUPERSEDED [save_load_audit.md](save_load_audit.md), [save_load_v1_design.md](save_load_v1_design.md) (implemented)

## Testing

- **NORMATIVE** [Testing](TESTING.md)

## Roadmap

- **NORMATIVE** [Roadmap and known limitations](ROADMAP.md)

## Evaluation reports and historical documents

- Reports: [docs/evaluations/](evaluations/) (immutable history; the newest relevant ones are [Documentation reconciliation](evaluations/DOCUMENTATION_RECONCILIATION_CURRENT_STATE.md), [Player visuals and inventory](evaluations/PLAYER_VISUALS_INVENTORY_UI_FOUNDATION.md), [Canon NPC avatars](evaluations/CANON_NPC_AUTHORED_AVATAR_INTEGRATION.md), [Heartstone household rite](evaluations/HEARTSTONE_HOUSEHOLD_RITE.md), [Temporal and environmental systems](evaluations/TEMPORAL_ENVIRONMENTAL_SYSTEMS_V1.md), [Pre-property debt zero](evaluations/PRE_PROPERTY_DEBT_ZERO_PASS.md)).
- HISTORICAL phase documents: [Phase 1_DECISIONS](architecture/PHASE_1_DECISIONS.md), [Phase 1E](architecture/PHASE_1E.md), [Phase 1E.2 audit](architecture/PHASE_1E_2_AUDIT.md), [Retrieval foundation](architecture/RETRIEVAL_FOUNDATION.md), [Scene delta engine](architecture/SCENE_DELTA_ENGINE.md), [Lexical search evaluation](architecture/LEXICAL_SEARCH_EVALUATION.md), [Semantic search evaluation](architecture/SEMANTIC_SEARCH_EVALUATION.md)
- SUPERSEDED [Engine capabilities before UI](ENGINE_CAPABILITIES_PRE_UI.md), [Engine freeze register](ENGINE_FREEZE_PRE_UI.md)
- HISTORICAL report files in the repository root (preserved as written): [ANIME_PORTRAIT_MODEL_BENCHMARK_V1.md](../ANIME_PORTRAIT_MODEL_BENCHMARK_V1.md) · [CANONICAL_NPC_CASTING_EPHEMERAL_DUPLICATION_AUDIT_FIX.md](../CANONICAL_NPC_CASTING_EPHEMERAL_DUPLICATION_AUDIT_FIX.md) · [CHARACTER_PERFORMANCE_CONTRACT_PILOT.md](../CHARACTER_PERFORMANCE_CONTRACT_PILOT.md) · [CREATED_NAME_PROVENANCE_CONTINUITY_FIX.md](../CREATED_NAME_PROVENANCE_CONTINUITY_FIX.md) · [CREATED_PERSON_IDENTITY_BINDING_FIX.md](../CREATED_PERSON_IDENTITY_BINDING_FIX.md) · [CURRENT_CHARACTER_NAME_PROJECTION_FIX.md](../CURRENT_CHARACTER_NAME_PROJECTION_FIX.md) · [DEBT_REGISTER.md](../DEBT_REGISTER.md) · [HOUSEHOLD_UI_AND_NPCPLUS_APPEARANCE_EDITOR_AUDIT.md](../HOUSEHOLD_UI_AND_NPCPLUS_APPEARANCE_EDITOR_AUDIT.md) · [LONG_PLAYTHROUGH_STATE_CONTINUITY_AUDIT.md](../LONG_PLAYTHROUGH_STATE_CONTINUITY_AUDIT.md) · [P11_KISS_TIME_OF_DAY_FOUNDATION.md](../P11_KISS_TIME_OF_DAY_FOUNDATION.md) · [P11_TEMPORAL_SYSTEM_AUDIT.md](../P11_TEMPORAL_SYSTEM_AUDIT.md) · [P12_1_BOUNDED_RECENT_SCENE_NARRATION.md](../P12_1_BOUNDED_RECENT_SCENE_NARRATION.md) · [P12_2_CANONICAL_DEPARTURE_RECONCILIATION.md](../P12_2_CANONICAL_DEPARTURE_RECONCILIATION.md) · [P12_IMMEDIATE_SCENE_CONTINUITY_AUDIT.md](../P12_IMMEDIATE_SCENE_CONTINUITY_AUDIT.md) · [P3_3_CANONICAL_NAME_DISCLOSURE_FINAL.md](../P3_3_CANONICAL_NAME_DISCLOSURE_FINAL.md) · [P3_3_P10_P11_REGENERATION_FIX.md](../P3_3_P10_P11_REGENERATION_FIX.md) · [P3_4_CANONICAL_PARTICIPANT_CONTINUITY.md](../P3_4_CANONICAL_PARTICIPANT_CONTINUITY.md) · [P3_5_CANONICAL_NAME_KNOWLEDGE_COMMIT.md](../P3_5_CANONICAL_NAME_KNOWLEDGE_COMMIT.md) · [P8_ECONOMIC_BASELINE_PRICE_ANCHORS.md](../P8_ECONOMIC_BASELINE_PRICE_ANCHORS.md) · [PERMANENT_APPEARANCE_EDITOR_BROWSER_QA.md](../PERMANENT_APPEARANCE_EDITOR_BROWSER_QA.md) · [PERMANENT_APPEARANCE_V1.md](../PERMANENT_APPEARANCE_V1.md) · [PLAYER_CHARACTER_PROJECTION_AUDIT.md](../PLAYER_CHARACTER_PROJECTION_AUDIT.md) · [PLAYER_MOVEMENT_LOCATION_CONSISTENCY_AUDIT_FIX.md](../PLAYER_MOVEMENT_LOCATION_CONSISTENCY_AUDIT_FIX.md) · [PLAYER_TRAVEL_AUTHORITY_AND_LOCATION_SAFESWITCH_IMPLEMENTATION.md](../PLAYER_TRAVEL_AUTHORITY_AND_LOCATION_SAFESWITCH_IMPLEMENTATION.md) · [PLAYER_TRAVEL_AUTHORITY_FULL_AUDIT_AND_PLAN.md](../PLAYER_TRAVEL_AUTHORITY_FULL_AUDIT_AND_PLAN.md) · [PORTRAIT_GALLERY_AND_ROLES_V2.md](../PORTRAIT_GALLERY_AND_ROLES_V2.md) · [PORTRAIT_IMAGE_GENERATION_V1.md](../PORTRAIT_IMAGE_GENERATION_V1.md) · [PORTRAIT_PROMPT_BUILDER_V1.md](../PORTRAIT_PROMPT_BUILDER_V1.md) · [TEMPORAL_ACTION_RESOLVER_V1.md](../TEMPORAL_ACTION_RESOLVER_V1.md) · [UI_PLAYSCREEN_CHARACTER_CARD_REBUILD.md](../UI_PLAYSCREEN_CHARACTER_CARD_REBUILD.md) · [UI_V1_IMMERSIVE_PLAYTEST_INTERFACE.md](../UI_V1_IMMERSIVE_PLAYTEST_INTERFACE.md)
