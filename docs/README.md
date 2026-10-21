# Caldrevan documentation index

Status: Current. Last reconciled: 2026-10-13 (Repository Cleanup B, documentation namespace, on top of main cc9cb7c; Repository Cleanup E added the dev tooling section of Testing; Cleanups F and G and the [post-cleanup repository audit](evaluations/POST_CLEANUP_REPOSITORY_AUDIT.md) on main `7e5e4ea`, which closes the repository cleanup program). Source of truth: the code on main. Authority order when documents disagree: **code, then tests, then authored data/canon, then the current documents below, then historical evidence.**

**One rule for the tree.** The repository root (`README.md`) and the documents linked from the first four sections below describe the project **as it is now**. Everything under [`evaluations/`](evaluations/) is **historical or machine evidence**: block, phase and pass reports, audits, live certifications, bakeoffs, migration notes and superseded documents. That evidence is preserved as written and never updated to match the present. Labels used below: **NORMATIVE** (the maintained description of current behavior) and **ACTIVE** (an accurate reference, possibly with clearly marked historical sections).

## 1. Current / normative: how the system works

| Question | Document |
| --- | --- |
| Where is the current architecture? | **NORMATIVE** [Architecture](ARCHITECTURE.md): governing model, mutation path, authority table, turn pipeline |
| How is narration read (movement, commerce, speaker, identity facts)? | **NORMATIVE** [NarrationFacts](architecture/NARRATION_FACTS.md) |
| How is persistence (save files, schema, side stores) documented? | **NORMATIVE** [Persistence](architecture/PERSISTENCE.md) (current format first; older sections marked historical) |
| What does the player/UI contract look like? | **NORMATIVE** [UI](UI.md), [UI engine contract](UI_ENGINE_CONTRACT.md) |
| How is the React frontend built, and how does it replace the legacy UI? | ACTIVE [Frontend architecture](architecture/FRONTEND_ARCHITECTURE.md), [UI migration roadmap](roadmap/UI_MIGRATION_ROADMAP.md) |
| How do trades and person offers work? | **NORMATIVE** [Actual Offer](architecture/ACTUAL_OFFER.md) |
| What is core and what is optional? | **NORMATIVE** [Optional services](architecture/OPTIONAL_SERVICES.md) |
| How are names, ids and reserved canonical names handled? | ACTIVE [Naming](architecture/NAMING.md) |
| Images (portraits, sprites, canon avatars)? | **NORMATIVE** [Image system](IMAGE_SYSTEM.md), ACTIVE [Item visual identity](architecture/ITEM_VISUAL_IDENTITY_V1.md) |
| Time, calendar, weather? | **NORMATIVE** [Time and environment](architecture/TIME_AND_ENVIRONMENT.md) |
| Heartstone and the household? | **NORMATIVE** [Heartstone](HEARTSTONE.md) |

Subsystem references (ACTIVE):

- **Turn and authority:** [Turn coordinator](architecture/TURN_COORDINATOR.md), [Evidence authorization](architecture/EVIDENCE_AUTHORIZATION.md), [Narrative authority](architecture/NARRATIVE_AUTHORITY.md), [Physical interaction](architecture/PHYSICAL_INTERACTION.md), [Transfer domain](architecture/TRANSFER_DOMAIN_V1.md), [LLM providers](architecture/LLM_PROVIDER.md).
- **Runtime state:** [Campaign state](architecture/CAMPAIGN_STATE.md), [Scene State Projection](architecture/SCENE_STATE_PROJECTION_V1.md) (NORMATIVE), [Narrative context](architecture/NARRATIVE_CONTEXT.md) (NORMATIVE), [Scene RAM](architecture/SCENE_RAM.md), [Item domain](architecture/ITEM_DOMAIN.md), [Player character](architecture/PLAYER_CHARACTER.md), [Inventory UI](architecture/INVENTORY_UI_V1.md), [City travel](architecture/CITY_TRAVEL.md).
- **Retrieval:** [Retrieval](architecture/RETRIEVAL.md), [Lexical search](architecture/LEXICAL_SEARCH.md), [Semantic search](architecture/SEMANTIC_SEARCH.md).
- **World and canon:** [Canon overview](world/CANON_OVERVIEW.md) (NORMATIVE; public summary plus a flagged author-only section), [Authored data architecture](architecture/AUTHORED_DATA_ARCHITECTURE.md).

## 2. Active status: where the project is

- **NORMATIVE** [Current state](CURRENT_STATE.md): what exists today, latest validated counts.
- **NORMATIVE** [Roadmap and known limitations](ROADMAP.md): what is next and what does not work yet.
- ACTIVE [Master Technical Debt Register](MASTER_DEBT_REGISTER.md): every open and closed debt item, with ids.
- ACTIVE [Master Roadmap](MASTER_ROADMAP.md): the long view, history of eras and the recommended order.

## 3. Guides: how to work on it

- [Project README](../README.md): what it is, how to run it.
- [One-click launcher](LAUNCHER.md): `Caldrevan.cmd` and `setup.cmd` (Windows): start, stop and log the game without npm commands.
- [Configuration](CONFIGURATION.md): environment variables, models, run modes.
- [Testing](TESTING.md): commands, authoritative runs, browser checks, dev tooling (where each tool lives, live versus offline, output and archive policy).
- Authoring: [Authoring guide](authoring/AUTHORING_GUIDE.md), [Geography](authoring/GEOGRAPHY.md), [Calderan spatial canon](authoring/CALDERAN_SPATIAL_CANON.md), templates in `authoring/templates/`.
- Schemas: [Entity schema](schemas/ENTITY_SCHEMA.md), [Knowledge chunks](schemas/KNOWLEDGE_CHUNKS.md).

## 4. Historical evidence: how it got here

Start at the [evaluations index](evaluations/README.md). It describes the collections without listing every file:

- **Consolidation and repository blocks** (2026-10-12/13): the `CONSOLIDATION_BLOCK*`, `REPOSITORY_CLEANUP_*` and `REPO12_*` reports directly under `evaluations/`, with their live evidence in `evaluations/consolidation_block*_live/`.
- **Older milestone reports** (P-numbered passes, fixes, audits, portrait and UI milestones, one-time search and sprite evaluations): [`evaluations/reports/`](evaluations/reports/), including their screenshots and contact sheets.
- **Phase 1 architecture records**: [`evaluations/phases/`](evaluations/phases/).
- **Superseded documents** (the old root debt register, pre-UI capability snapshots, the pre-implementation image and save/load audits): [`evaluations/superseded/`](evaluations/superseded/).
- **The 2026-10-12 full codebase audit** behind the debt register: [`evaluations/codebase_audit_2026-10-12/`](evaluations/codebase_audit_2026-10-12/).
- **Machine evidence** (traces, recorded live runs, frozen requests): the run directories under `evaluations/`. No test or active tool reads them; executable fixtures live in `tests/fixtures/` (see [Testing](TESTING.md)).
