# Documentation reconciliation / current-state update

Date: 2026-10-11. Base: main 36f9ee1 plus this uncommitted documentation pass. Scope: documentation only. No code, data, canon or behavior was changed. No commit, no push.

## 1. Verdict

DOCUMENTATION_RECONCILED_WITH_REMAINING_GAPS (listed in section 17). The central entry points now exist and agree with the code: an index, a current-state overview, an architecture document with the authority table, a roadmap with verified known limitations, and per-area references. Stale statements found by the final grep were corrected or labelled.

## 2. Files audited

All of `README.md`, `docs/*.md`, `docs/architecture/*.md`, `docs/authoring/*.md`, `docs/schemas/*.md`, and the headings of the evaluation reports and 31 root report files; code and data were read for verification (production wiring, provider config, image stack, sprite jobs, premium characters, Heartstone charter and recognition, calendar/climate/weather/environment, turn coordinator, `play.ts`, capabilities, inventory UI view, migrations, public canon YAML).

## 3. Files updated (41)

`README.md` (rewritten), `docs/UI_ENGINE_CONTRACT.md`, `docs/architecture/{INVENTORY_UI_V1 (rewritten), PLAYER_CHARACTER, PERSISTENCE, LLM_PROVIDER, TURN_COORDINATOR, EVIDENCE_AUTHORIZATION, CAMPAIGN_STATE, AUTHORED_DATA_ARCHITECTURE, PHASE_1_DECISIONS}`, `docs/schemas/ENTITY_SCHEMA.md`, `docs/authoring/{AUTHORING_GUIDE, GEOGRAPHY, CALDERAN_SPATIAL_CANON}`, plus status labels on the other architecture documents, `ENGINE_CAPABILITIES_PRE_UI`, `ENGINE_FREEZE_PRE_UI`, `image_system_audit`, `image_system_v1_gap_analysis`, `save_load_audit`, `save_load_v1_design`. CRLF line endings were preserved.

## 4. Files created

`docs/README.md` (index), `docs/CURRENT_STATE.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/HEARTSTONE.md`, `docs/IMAGE_SYSTEM.md`, `docs/CONFIGURATION.md`, `docs/UI.md`, `docs/TESTING.md`, `docs/architecture/TIME_AND_ENVIRONMENT.md`, `docs/world/CANON_OVERVIEW.md`, and this report.

## 5. Historical reports left unchanged

Everything under `docs/evaluations/` (no edits) and the 31 report files in the repository root. They are listed as historical in the index.

## 6. Obsolete documents marked

Superseded: `ENGINE_CAPABILITIES_PRE_UI`, `ENGINE_FREEZE_PRE_UI`, `image_system_audit`, `image_system_v1_gap_analysis`, `save_load_audit`, `save_load_v1_design` (implemented). Historical: Phase 1E, 1E.2 audit, 1_DECISIONS, retrieval foundation, scene delta engine, sprite hardening and quality V2, search evaluations. Model names in `TURN_COORDINATOR`, `EVIDENCE_AUTHORIZATION` and `LLM_PROVIDER` were annotated as historical.

## 7. Architecture reflected

Governing model, mutation path diagram, three context channels, authority table (`docs/ARCHITECTURE.md`).

## 8. Canon reflected

`docs/world/CANON_OVERVIEW.md`: Helion, regions and elements, Year 0/491/1191, Church, creation myth and the Four (public), Light/Shadow, Beastfolk with their limits, governance, Nicco not related to Aureth, no Merovar, no objective dragons. Hidden truth appears only at a high level in a flagged author-only section; sealed operational details, the hidden communication mechanism and the secret group name are not in any document. A pre-existing reference to a sealed holder's id in `AUTHORED_DATA_ARCHITECTURE.md` was removed.

## 9. UI reflected

`docs/UI.md` lists only implemented controls (including disabled placeholders and the absent Upload and weather UI). `UI_ENGINE_CONTRACT` gained the inventory view, player visual view and `scene.environment`.

## 10. Image system reflected

HF router, `fal-ai/qwen-image` + Raena LoRA, `HF_TOKEN`, sizes, batches, gallery limit, adult-only, canon avatars (precedence, opaque tokens, ~2.3 MB), item sprites, no Upload.

## 11. Heartstone reflected

Ownership, opening items, rules, rite, rite = household + NPC+, warmth, non-sentience, floor plan, Property not implemented.

## 12. Items and inventory reflected

One position plus a separate owner, derived inventory, per-item conflict semantics (in the current-state and architecture docs), four-slot category-only presentation and the headwear/footwear gap.

## 13. Calendar and weather reflected

`TIME_AND_ENVIRONMENT.md`; stale "no calendar" statements corrected in the UI contract.

## 14. Model and config reflected

`CONFIGURATION.md` and the topology table in `CURRENT_STATE.md`. Note: `src/llm/openrouter/image-client.ts` and its `CALDREVAN_PORTRAIT_*` variables remain in code but are unused by production (documented as legacy).

## 15. Roadmap reconciliation

`ROADMAP.md`: complete, partial, not-yet-complete lists and 11 known limitations, each checked against the code (for example `AVATAR_UPLOAD_SUPPORTED = false`, `inventory.ts` "no containers in V1", item categories, `transfer_item` to `equipped` rejected without evidence).

## 16. Schema versions

Snapshot **6**, save file **5** (`types.ts`, `save-format.ts`, `migrateSnapshot5to6`). `PERSISTENCE.md` previously said snapshot 5; corrected.

## 17. Remaining documentation gaps

- `docs/evaluations/` and root reports still contain old model names, counts and canon names by design.
- Phase-era architecture documents carry only a status line, not a per-statement audit.
- `PERSISTENCE.md` keeps long historical Phase 1J sections below the current banner.
- `docs/ui-screenshots/` are old captures.
- The comment in `premium-characters.ts` ("Household membership is the ONLY trigger") was not changed (docs-only pass); it remains true because the rite is a household join.
- The legacy OpenRouter image client is dead code in production.

## 18. Test result

`npm run typecheck`: clean. `npm run build`: clean. `npm test`: **3138 tests, 3138 pass, 0 fail, 0 skipped** (offline).

## 19. Cross-link and index status

All relative links in the 51 changed or created markdown files were checked; the only broken target was `RUNTIME_FOUNDATION.md` (a document that no longer exists), now replaced by plain text. The report link target exists after this file. The index is `docs/README.md`.
