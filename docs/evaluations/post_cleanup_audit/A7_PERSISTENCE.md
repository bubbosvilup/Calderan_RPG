# A7: persistence and schema safety across the repository cleanups (861396c..7e5e4ea)

This audit is read-only. It used `git diff -M 861396c 7e5e4ea`, `git log`, `git show` and grep, plus a python3 helper that reads git output only. That helper extracted every string literal on changed, non-comment, non-import lines and compared them per file and in aggregate. Nothing was built or run.

**Verdict: PASS. There are 0 FINDINGS.** No serialized key string, schema number, migration step, revision rule or optional side-state semantic changed. The changed hunks in the audited files are only:

- comments
- identifier renames
- internal validation/diagnostic message text (Cleanup G: "promotion" → "materialization")
- file moves and import paths
- the Cleanup C reflection-module consolidation, which keeps every persisted value

## Commits in range

```
7e5e4ea Repository Cleanup G: lifecycle vocabulary
9d27f81 Repository Cleanup F: test taxonomy, naming and discoverability
d94cde9 Repository Cleanup E: dev tooling, scripts, archive audit, test reliability
26c2be5 Repository Cleanup D7: src/turn optional folder, final report
47e254b Repository Cleanup D6: src/turn identity folder
bd4981c Repository Cleanup D5: src/turn coordinator folder
2a0e242 Repository Cleanup D4: src/turn authorization and audit folders
a0ee7a0 Repository Cleanup D3: src/turn context folder
c785b9a Repository Cleanup D2: src/turn movement folder
f49a5c9 Repository Cleanup D1: src/turn items and commerce folders
057ee3b Repository Cleanup C: Reflection consolidation
4dc4f05 Repository Cleanup B2: evaluation fixture decoupling
feba138 Repository Cleanup B: documentation namespace normalization
cc9cb7c REPO-12: partner guard reads the NarrationFacts subject; canonical names and aliases are reserved handles   <- product work
845d778 Repository Cleanup A: build discipline, artifacts/local, portable tooling, D09 evidence out of saves/
```

cc9cb7c (product work) touched only:

- `src/turn/{canonical-name-reservation,keep-track,name-establishment,partner-identity-guard}.ts`
- `src/world/canonical-names.ts`
- 2 tests
- docs

It touched none of the persistence or schema files audited here. Its behavior changes are identity policy (see A8) and do not affect any saved field. The one new string `canonical_name_reserved` is a diagnostic `identity.skipped` reason, not a saved field.

## Per-area results

| Area | Files | Diff 861396c..7e5e4ea | Result |
|---|---|---|---|
| Save version / migrations | `src/persistence/**`: save-format.ts, save-migrations.ts, optional-store.ts, pending-confirmations.ts, turn-receipts.ts, campaign-session.ts, campaign-repository.ts, strict-json.ts, transcript.ts, canon-compatibility.ts, errors.ts, filesystem.ts | **0 lines changed** | PASS |
| Snapshot schema number | `src/campaign/snapshot-validation.ts` (`CURRENT_SNAPSHOT_VERSION = 7`, :23), `validation.ts:286` (`schema_version: integer(7, 7)`), `campaign-state.ts:57,105` (`schema_version 7`) | message text only (2 lines) | PASS |
| Save schema number | `save-migrations.ts:5` `CURRENT_SAVE_VERSION = 8`; `save-format.ts:42,81,216` (`schema_version: 8`); `optional-state.ts:72,125` (8/7) | 0 lines changed | PASS |
| Migration behavior | `src/persistence/save-migrations.ts` (v1→…→v8 steps, snapshot 4→5, 5→6, 6→7) and `optional-state.ts` store migration | 0 lines changed | PASS |
| Serialized field names | `src/campaign/types.ts`, `validation.ts`, `snapshot-validation.ts`, `src/persistence/*` | types.ts: 3 comment lines. validation.ts: 1 comment, 1 message. snapshot-validation.ts: 2 messages. persistence: 0 | PASS |
| Semantic revision rules | `src/campaign/campaign-state.ts` (`:82-87` authoritative-partition revision, `:139-150` commit) | 1 comment line (:68) | PASS |
| Optional side-state | `src/campaign/optional-state.ts` (`OPTIONAL_STORE_NAMES = ["learning","media"]`, `corePartition`, `clampLearning`); `src/persistence/optional-store.ts` (`learning.json`/`media.json`, `OPTIONAL_STORE_VERSIONS {learning:1, media:1}`, key list :44) | 0 lines changed (both) | PASS |

## Hunk classification: `src/campaign/` (the only changed persistence-adjacent sources)

All of these hunks come from 7e5e4ea (Cleanup G), except where noted.

| File:line (HEAD) | Change | Class |
|---|---|---|
| `campaign-state.ts:68` | comment "promotion" → "materialization" | comment-only |
| `character-lifecycle.ts:8` (D6 47e254b) | comment path `turn/provisional-people.ts` → `turn/identity/provisional-people.ts` | comment-only |
| `characters.ts:20` | comment | comment-only |
| `characters.ts:24-28` | `fail(...)` message text changed. Field paths stay `origin_snapshot`, `origin_snapshot.promoted_revision`, `origin_snapshot.promoted_world_minute`, `origin_snapshot.location_id`. Conditions unchanged. | message text |
| `identity-fork-scanner.ts:28` | doc comment | comment-only |
| `identity-fork-scanner.ts:79,81` | scanner `detail` text. The signal `kind` strings `"origin_provenance"` and `"promotion_proximity"` are unchanged. Scanner report only, never saved. | message text |
| `promotion.ts` → `materialization.ts` (R058) | file move (D1 f49a5c9: comment path; G: rename). Identifiers renamed: `PromotionInput`→`MaterializationInput`, `promotedCharacterId`→`materializedCharacterId` (param `promotedRevision`→`materializedRevision`), `buildPromotedCharacter`→`buildMaterializedCharacter`, `promotedLabel`→`materializedLabel`. The id template stays `` `r${rev}_${slug}` `` with `campaignId("character", …)`. The input keeps `promoted_revision` and the output keeps `origin_snapshot` fields. The new header comment states the serialized names are deliberately kept. | rename-only + comments |
| `permanent-appearance.ts:10,51,79` | comments | comment-only |
| `premium-characters.ts:56` (D7 26c2be5) | comment path | comment-only |
| `snapshot-validation.ts:59-60` | `fail(...)` message text; field paths and conditions unchanged | message text |
| `trade.ts:74,215` | comments | comment-only |
| `types.ts:51,53,140` | doc comments (`label`, `ephemeral_ref`, `TradeSubject`); field names unchanged | comment-only |
| `validation.ts:211` | comment | comment-only |
| `validation.ts:219` | person-plan `fail` message text. `PERSON_PLAN_KINDS` (`register_character`, `set_legal_status`, `transfer_person`) unchanged. | message text |

The literal-diff helper found that the only string literals that changed anywhere in `src/campaign`, `src/persistence` and `src/app` are the 9 message/detail strings above and the template-literal *variable name* in `materializedCharacterId`. It found no change to a key, enum or choice literal.

## Other code that writes persisted data (checked because it produces saved values)

- **`src/app/game-session.ts`** (D3-D7, G): only import paths (`../turn/<folder>/...`) and 1 comment (`:579`). The rest of `src/app` is the same: import paths and comments only.
- **Reflection consolidation (C 057ee3b; D7 move to `src/turn/optional/structured-reflection-maintenance.ts`).** These notes go into the learning side store (`premium_reflections`).
  - The persisted note fields are unchanged:
    - `structured: { format_version: 1, semantic_version: 'V2.3-CVC-E1', source_revision, proposal }`
    - `REFLECTION_SEMANTIC_VERSION = 'V2.3-CVC-E1'` (`src/turn/structured/reflection-schema.ts:44`), formerly `E1_VERSION`
    - the validator `validation.ts:194` `choice('V2.3-CVC-E1')` is unchanged
  - The claim-type → `ReflectionKind` map `kinds` (`structured-reflection-maintenance.ts:50`) and the label `prefixes` table are byte-identical.
  - The id scheme `r${revision}_${kind}_${serial}` is unchanged.
  - The diff of the old against the new maintenance file is imports plus renamed identifiers: `E1_SCHEMA`→`REFLECTION_SCHEMA`, `E1_VERSION`→`REFLECTION_SEMANTIC_VERSION`, `structuredReflectionEvidenceE1`→`reflectionEvidenceCatalog`, `environmentalE1Context`→`reflectionContext`, `citationScopedReflectionWireE1`→`reflectionWire`, `evaluateStructuredOutputE1`→`evaluateReflectionOutput`.
  - Removed literals:
    - `CANONICAL`, `WIRE_DEEPINFRA_V1` and `WIRE_ALIBABA_V1` were evaluation-only wire profile names.
    - `LEGACY_KIND` (with `stance`/`signature_pattern`/…) belonged to the evaluation-only `legacyComparisonProposal`. The `ReflectionKind` enum stays in `types.ts:251`/`validation.ts:167`.
    - The old `validateReflectionWire` failure labels were also removed.

    None of these were persisted. The provider-facing failure codes `empty_output`/`malformed_envelope`/`schema_invalid` are still in `parseProductionReflection`.
  - Behavior equivalence is pinned against frozen oracle copies (`tests/frozen/reflection/*`, moved R094-R099 from `src/dev/`) by `tests/reflection/reflection-oracle-equivalence.test.ts`.
- **Optional mannerism extraction** (`src/turn/optional/mannerism-extraction.ts`, D7 move): import paths only. No changed literal.
- **`src/turn/identity/*`, `src/turn/commerce/*`** (moves D1/D6; behavior in cc9cb7c only): no changed serialized literal. `canonical_name_reserved` is a diagnostic skip reason. The `"character"` literal in keep-track.ts was moved into `src/world/canonical-names.ts` (canonical entity-type filter).

## Data files and tests

- **`saves/` deletions (A 845d778):** 310 D09 evaluation evidence files moved R100 to `docs/evaluations/d09-reflection/evidence/`. They are not runtime saves or fixtures that save-format code reads.
- **`tests/fixtures/*` "A" entries (B2 4dc4f05):** copies of evaluation fixtures for decoupling (canon fixture worlds, movement/follow jsonl, historical-replay anchors). They are not save files.
- **Persistence, optional-store, migration and campaign-state tests** were moved by F 9d27f81:
  - `tests/persistence/{campaign-restore,premium-state-tamper,save-format-and-assets,save-migration-hardening,save-repository}.test.ts`
  - `tests/optional/*`
  - `tests/world/campaign-state.test.ts`
  - `tests/identity/character-lifecycle-repair.test.ts`
  - `tests/authority/pending-confirmation-foundation.test.ts`

  The only non-import changes in these files are test-title rewording ("block 7 …" prefix dropped) and one source-path string (`src/turn/context-compaction.ts` → `src/turn/context/context-compaction.ts`). No assertion changed. They still assert save schema 8, snapshot schema 7, the v5→v6→v7→v8 migrations and the optional-only revision rules.

## FINDINGS

None. Specifically:

- no change to any serialized key string
- no change to `schema_version` 8 / snapshot 7, optional store versions 1/1, `format: "caldrevan_campaign_save"` or `OPTIONAL_STORE_FORMAT`
- no change to any migration step
- no change to the revision rule (`authoritative` partition → +1 / +0)
- no change to optional side-state composition or clamping

## Expected-vs-actual check

| Expected | Actual |
|---|---|
| comments only | yes |
| identifier renames | yes (Cleanup G; serialized `promoted_*` names deliberately kept) |
| internal error message text "promotion" → "materialization" | yes: characters.ts ×4, snapshot-validation.ts ×2, validation.ts ×1, plus 2 fork-scanner diagnostic details |
| file moves | yes (`promotion.ts`→`materialization.ts`; src/turn foldering D1-D7; reflection layers C) |
| anything else | none in the audited files |
