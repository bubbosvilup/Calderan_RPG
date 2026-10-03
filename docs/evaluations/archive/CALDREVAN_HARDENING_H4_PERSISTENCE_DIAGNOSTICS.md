# Caldrevan hardening H4 — persistence and diagnostics

Date: 2026-10-01. Implementation pass; working tree left for review. No commit, push, paid provider calls, authored canon edits, golden regeneration, autosave, NPC+, gameplay features, or provider retry/fallback policy changes in H4.

## A. Executive result

H4 is complete. Saves have an ordered migration boundary and an explicit canon compatibility policy. Turns have opt-in, immutable, session-local diagnostics. CampaignState remains the sole mutable gameplay authority and the coordinator retains exactly one atomic commit.

| Measure | H3 baseline | H4 |
|---|---:|---:|
| Tests | 1099 | 1157 |
| Pass / fail / TODO | 1095 / 0 / 4 | 1153 / 0 / 4 |
| Test files | 61 | 63 |
| Curated replay | 25/25 | 25/25 |
| H2 golden | green | green, unchanged |
| Readable envelope versions | 1 | 1 and 2 |
| Current envelope / snapshot version | 1 / 1 | 2 / 1 |
| Production migration steps | 0 | 1: v1→v2 |
| New persistence / diagnostics tests | — | 48 / 10 |
| Intended / unintended gameplay changes | — | 0 / 0 |

There are intended persistence changes: newly written envelopes are v2; referenced label changes and unrelated additions can load; errors have actionable recovery hints. Migrated v1 saves retain strict dataset identity. Diagnostic sink exceptions cease to cause gameplay failure. These are infrastructure changes, not new gameplay rules.

## B. H3 baseline confirmation

Before source modification: `npm run typecheck` passed; `npm test` reproduced 1099 tests, 1095 passing, zero failing, four TODO; `npm run test:playthrough` reproduced 25/25. The full baseline included persistence, restore, H2 golden/invariants, and H3 context, knowledge and retrieval tests. H3's supplied report agrees with the reproduced baseline.

## C. Existing persistence model

The v1 envelope held format, schema_version, campaign_id, canonical_dataset_id, metadata (saved_at; optional created_at/engine_version), and snapshot. CampaignSnapshot was and remains schema v1. Files are bounded to 16 MiB, strict UTF-8 JSON, duplicate-key rejecting, with a 64-level JSON nesting bound. Snapshot validation rejects missing required domains and unknown fields.

Current is `save.json`; previous is `save.previous.json`. Loading selects one explicitly. A write captures the snapshot before filesystem awaits, validates current before rotation, creates exclusive `wx` temporary files with mode 0600, fsyncs file data, renames a copy of the valid old current over previous, then renames new current into place. Directory sync remains platform-dependent and is skipped on Windows. The two slots are not one filesystem transaction. Post-rename failures may mean a complete new file is already visible.

The write algorithm, link/path checks, cleanup, and permissions are unchanged. Existing injected write, backup write, rename, sync, cleanup and concurrency tests still pass. No claim of universal power-loss protection is added.

Manual-save-only is product design. Loading, migrating, diagnosing and completing turns never initiate a save.

## D. Versioned migration architecture

`src/persistence/save-migrations.ts` owns CURRENT_SAVE_VERSION=2 and the explicit registry. Key n performs only n→n+1. The dispatcher checks the raw top-level object/version, clones only data descriptors, freezes migration input, checks each output version, and detaches each output. Unknown future/unsupported ancient versions reject `unsupported_version`; malformed versions reject `invalid_save`; throwing, cycling or version-skipping transforms reject `migration_failed`.

Current-envelope validation and complete snapshot graph validation remain strict after migration. No restore occurs until these and compatibility succeed. Migration cannot modify a live campaign or either file.

The v2 bump is justified by an actual persisted shape change: required `canon_compatibility`, plus the reference manifest for the `references` policy. It is not version inflation for diagnostics. The real v1→v2 transform preserves all old fields, adds `canon_compatibility: strict`, and changes only envelope version. It cannot reconstruct historical canon evidence, so it does not invent a manifest. Unknown legacy fields survive migration and are then rejected. Snapshot version remains 1; no future campaign domain is introduced.

## E. Migration fixtures

Tests cover current, ancient, future, malformed/missing version, missing intermediate step, skipped version, cycle, throwing transform, and invalid output. A real v1 envelope migrates, validates, restores and exports identically. Accessor input is rejected without invoking the accessor.

The synthetic v1→v2→v3 fixture fills `domains.example_future_domain=[]`. It preserves unknown old data; the synthetic strict target validator rejects that data. A separately declared migration explicitly retires the old field and then passes target validation. This proves that defaults and unknown-field removal require migration policy rather than weakened current validation. Invalid output never reaches restore, and the live snapshot object remains unchanged.

## F. Save round-trip properties

Four new representative scenarios run snapshot→envelope→serialization→decode→validation→restore→export with deep semantic equality: opening, rich campaign, legal purchase, late naming. Together they cover moved player/NPC, household, relationships, conditions, facts and knowledge provenance, scheduled events, created and unnamed characters, late naming, legal ownership, funds, transactions, inventory, stored/equipped items, and unknown values. Existing rich restore, identity continuity/save-load, ownership and household suites add coverage. Snapshot identity and array ordering remain stable; no command replay or canon mutation occurs.

## G. Corruption/recovery matrix

The new suite adds 18 direct corruption cases (including extra null/manifest cases), supplemented by existing whole-graph corruption tests and malformed-slot recovery tests. For every failure, existing live CampaignState remains unchanged. A valid previous slot may be explicitly selected; no failure automatically selects or repairs it.

| Required case | Exact code | Previous may be explicitly used? | Action |
|---|---|---|---|
| Truncated JSON | invalid_json | if valid | inspect slots; preserve corruption |
| Empty file | invalid_json | if valid | inspect slots |
| Random text | invalid_json | if valid | inspect slots |
| Wrong JSON top-level type | invalid_save | if valid | select valid slot/schema repair |
| Missing schema_version | invalid_save | if valid | select valid slot/schema repair |
| Future schema_version | unsupported_version | if supported | use supporting engine |
| Malformed timestamp | invalid_save | if valid | schema repair/select valid slot |
| Oversized save | invalid_save | if valid | inspect bounded save/schema repair |
| Missing required domain | invalid_save | if valid | schema repair/select valid slot |
| Unknown field | invalid_save | if valid | explicit migration/schema repair |
| Invalid character ID | reference_invalid | if valid | restore references/select valid slot |
| Invalid relationship endpoint | reference_invalid | if valid | restore references/select valid slot |
| Invalid legal holder | reference_invalid | if valid | restore references/select valid slot |
| Invalid location | reference_invalid | if valid | restore references/select valid slot |
| Invalid revision | invalid_save | if valid | schema repair/select valid slot |
| Malformed previous slot | invalid_json | no, that slot fails | retain both files; inspect separately |

`CampaignSaveError` retains typed codes and adds safe `recovery_hint` text to its public message. Raw filesystem/provider errors and paths are never interpolated.

Five new recovery scenarios pin: valid current loads current; corrupt current does not fall back and valid previous can be requested; both corrupt fail independently; incompatible current does not fall back to compatible previous; migratable current loads even when previous is corrupt. Reads preserve both bytes and live state. Existing save-over-corrupt-current refusal remains green.

## H. Dataset compatibility policy

Three questions are separate: engine envelope/snapshot schema, required world-canon compatibility, and exact authored dataset identity. The full SHA-256 dataset ID remains in the envelope and snapshot. It is not replaced by an unchecked constant.

| Candidate | Assessment |
|---|---|
| Strict hash only | strongest identity, but rejects every authored edit; retained for legacy evidence-free saves |
| Semantic/world schema version | says little about whether individual campaign references still exist |
| Canon compatibility version | small, but relies on authors remembering every incompatible edit |
| Hash plus compatibility epoch | useful for manual releases, but still needs reference checks and epoch discipline |
| Per-reference fingerprints | chosen; automatic evidence for the small referenced footprint, with existing graph validation |

New v2 saves use `references`. The manifest stores only sorted authored entity/chunk IDs and SHA-256 fingerprints, capped at 16,384 entries. Its footprint conservatively includes every snapshot string exactly matching an authored ID, plus authored Nicco. Duplicate entries, missing required entries and malformed fingerprints reject. All manifest entries must still exist. Fingerprints exclude only top-level name, display_name, summary, description and aliases; other properties stay conservative, including content, permissions, structural IDs, connections and character defaults. Object keys use deterministic code-point ordering; array order is preserved.

After compatibility succeeds, the detached snapshot's dataset identity is rebound to the current WorldStore and the existing whole-graph validator runs. This rebind changes identity metadata, not revision or campaign domains. Direct CampaignState.restore still requires strict identity. Save creation validates the original snapshot/world binding before manufacturing any manifest.

| Save case | Schema compatible? | Canon compatible? | Load? | Migration? | Reason |
|---|---|---|---|---|---|
| Exact current dataset, v2 | yes | yes | yes | no | references and graph validate |
| Harmless referenced summary/display label change, v2 | yes | yes | yes | no | excluded descriptive fields |
| Unrelated added entity, v2 | yes | yes | yes | no | footprint unchanged; graph valid |
| Missing referenced entity, v2 | yes | no | no | no | reference_invalid |
| Future envelope | no | not evaluated | no | unavailable | unsupported_version |
| Real old v1 envelope, exact dataset | yes | yes | yes | v1→v2 | strict legacy policy |
| Old v1 envelope after canon edit | yes | no | no | v1→v2 in memory | missing historical compatibility evidence; dataset_mismatch |
| Corrupted current | no | not evaluated | no | no | invalid_json/invalid_save |
| Valid explicit previous | yes | evaluated independently | yes if compatible | if v1 | user selects previous |

## I. Canon drift matrix

Eight synthetic variants are tested. Removal fixtures rename the entity and its authored references together so WorldStore itself remains valid, while the save's original ID no longer exists.

| Drift | New v2 save | Reason |
|---|---|---|
| A. Descriptive summary change | loads | omitted from fingerprint |
| B. Unrelated location added | loads | outside saved footprint |
| C. Referenced location removed | reference_invalid | required original ID absent |
| D. Display name changed | loads | ID remains stable |
| E. Referenced authored NPC removed | reference_invalid | required original ID absent |
| F. Structural ID changed | reference_invalid | required original ID absent |
| G. Unrelated location travel graph changed | loads | outside saved footprint |
| H. Saved location travel graph changed | dataset_mismatch | referenced connection fingerprint changes |

Deliberate conservative limits: authored content edits can still reject; unrelated added NPCs requiring new runtime locations fail existing graph completeness validation. H4 does not silently seed newly authored NPCs into old campaigns or migrate canon content.

## J. TurnDiagnostics model

`src/turn/turn-diagnostics.ts` defines IDs/revisions/outcome/failure, stage timings, retrieval, context, draft/revision narrator, controller, authorization, audit and commit groups. IDs are process-local monotonic `turn-N`; they never determine outcomes or enter state. Success, failure and abandoned generator closure are observable. Fields for stages not reached are absent rather than fabricated.

Enable via `new TurnCoordinator(..., { diagnostics_sink: record => ... })`. No campaign session log or telemetry service is created. Consumers can collect a bounded evaluation log externally. The sink receives a detached, deeply frozen record in generator finalization, exactly once per finalized/closed turn. Diagnostics are not TurnResult, TurnEvent payloads, RecentConversation, CampaignSnapshot or saves.

## K. Stage timing model

Fifteen named boundaries are available: input_intent, projection, retrieval, prompt_composition, narrator, controller, authorization, preparation, audit, reconciliation, reconciliation_narrator, reconciliation_audit, commit_preparation, commit, publication. Optional reconciliation boundaries exist only when executed. Nested timing excludes child durations from the parent, so reconciliation does not count its narrator latency as deterministic work. Timers surround actual operations, excluding pauses while consumers process yielded events.

`provider_ms` measures narrator/controller invocation wall time, not provider CPU or billable time. `deterministic_ms` measures local boundaries. Retrieval reports its separate end-to-end latency; a live semantic retrieval implementation may include embedding I/O in that retrieval boundary. Timings are approximate observational wall time, not deterministic state or a comprehensive CPU profile.

## L. Retrieval/context diagnostics

Retrieval reports triggered, actual mode, returned IDs/reference count, fetched count, payload characters, latency, lexical use, existing lexical fallback status/reason, failure code, and unchanged named limits. Query text is omitted by default; `diagnostics_include_query` explicitly enables it and must be treated as sensitive debug output. No candidate summaries, fetched canon, restricted text or prompt dumps enter this record.

Context reports serialized/max characters, people/items shown, fact/event totals and shown counts, relationship totals/shown, omitted non-present household members, H3 projection counts, and whether compact knowledge-access rendering was used. Failure reports the context_too_large phase; when projection fails before a context exists, no fabricated context sizes are supplied. Sizes reuse the existing H3/retrieval serialization checks through a weak size cache/internal return field; diagnostics do not serialize the context or canon payload again.

## M. Narrator/controller diagnostics

Draft and revision narrator records separately report completed status, streamed and final text character counts, model, reported latency and usage. No full narration is copied. Controller reports model, usage/latency, local strict proposal parse outcome, proposed count/kinds and normalization use. Proposed count does not mean committed count. Provider failures retain the safe public provider code and diagnostic phase.

The common provider contracts do not expose a reliable separate provider identifier or general finish reason; those fields are intentionally omitted. Failed calls without model/usage metadata do not manufacture it. Existing explicitly opt-in controller parse debug records remain supported separately.

## N. Authorization/audit diagnostics

Authorization maps each decision to kind, authorized status, reason and evidence-check identifier. It excludes the command payload and evidence quote. Audit reports issue count/kinds, attempted reconciliation, revision issue count/kinds, redaction and delivered draft/revision/redacted mode. All four unchanged H1 TODO cases therefore have the counters needed for future live-run measurement; H4 does not repair their grammar or grounding rules.

Commit reports preparation changed/count/kinds, attempted/succeeded, promotion count, identity skip and location-change naming guard. It exposes no receipt internals. Base/final revision are on the record. Cancellation at the last checkpoint does not report a commit attempt.

## O. Failure classification

All public TurnFailure codes and H2's legacy mutable stage mapping remain unchanged. Diagnostics identify the operation boundary instead: for example authorization errors still have the legacy controller_failed code but diagnostic phase authorization; reconciliation audit errors retain narrator_failed with reconciliation_audit phase. Input, retrieval, narrator and controller failures have direct injected tests. H2 cancellation/staleness and failure coverage remain green.

## P. Diagnostic sink behaviour

Sync sink exceptions and async sink promise rejections are consumed. Legacy debug emission is protected against synchronous exceptions too, preserving its existing identity-skip and controller parse/normalization records. Tests prove successful reconciled turns still complete with failing sinks, async failures do not become unhandled rejections, and closing an uncommitted generator reports abandoned and releases the campaign lock. A sink can delay its caller through its own synchronous work; the engine cannot make arbitrary user callbacks cheap.

## Q. Privacy/secret safety

Tests compare enabled/disabled events, snapshots, narrator prompt and controller request after excluding only pre-existing volatile timing/signal values. They are equal. Default diagnostics exclude private user input, narrator text, canonical passage text, full prompts, prior state and evidence prose. Diagnostic IDs/timings do not appear in save output. Restricted H3 knowledge projection/audit and retrieval visibility are unchanged.

Existing full controller debug material remains opt-in through debug_sink. Enabling sensitive query output is a separate explicit flag. No filesystem logger, cloud telemetry, prompt service or paid provider invocation is added.

## R. Performance

Reproduce with `npm run build --silent` then `node .build/tests/diagnostics-benchmark-h4.js`. Offline clean fixture, setup excluded, 30 warm-ups per mode, seven alternating blocks of 100 turns per mode; medians of block means. Enabled measurement includes frozen sink emission. Samples are in `CALDREVAN_HARDENING_H4_DIAGNOSTIC_BENCHMARK.json`.

Measured disabled 1.566 ms, enabled 1.690 ms, added 0.124 ms (7.94%) on this very short provider-free fixture. Another run measured 0.037 ms (2.26%); clock/GC variance is material at this scale. Absolute overhead is sub-millisecond; the relative figure is not a claim of zero overhead. There are no extra world scans, prompt construction, provider calls or campaign preparation because diagnostics are enabled. JSON serialization for context/retrieval sizes is reused; emitted data consists of bounded IDs/counts/status.

## S. Regression matrix

Final commands: typecheck, full npm test, replay, and focused persistence, campaign restore, save hardening, campaign state, H2 golden/invariants, turn failures, H3 context scale/knowledge/retrieval benchmark, H1 identity continuity/narration-survives-audit, city travel and diagnostics. Focused matrix: 262 tests, 258 passing, zero failing, four TODO.

H2 golden remains unchanged. H3 suites preserve all 16 real known_by grants, restricted_canon audit, no secret/forbidden retrieval results, >24 permissions, 114-person capacity probe, fact/event selection and genuine context_too_large. City travel, purchase/carry, household membership, location continuity, late naming, unknown versus hidden, stale/cancelled failure atomicity and exactly one turn commit are green. No data/city-graph file was touched by H4.

Existing assertions changed intentionally: save-format future envelope cases use version 3 (v2 is current); descriptive canon edits are accepted for new reference-policy saves, while an explicit strict-policy assertion preserves legacy rejection. Direct snapshot restore's strict dataset check remains unchanged.

## T. Remaining H4 debt

Legacy saves require their exact original dataset until an explicit save against it creates new reference evidence. Conservative fingerprints still reject referenced content and structural edits, and added canonical NPC runtime defaults require a future explicit migration policy. Reference-footprint scanning is a conservative superset, so prose equal to an authored ID can add an unnecessary dependency. There is no canon-content migration, distributed lock or universal filesystem power-loss guarantee.

Provider identity/finish reason and detailed pre-context overflow dimensions remain unavailable from current contracts. Retrieval boundary time is not split into embedding-provider/local CPU time. Optional JSONL storage was deliberately not added: the sink is sufficient for H5 aggregation, and avoids creating another persistence lifecycle. Live semantic/provider quality remains untested.

## U. H5 readiness

Ready for offline-to-live evaluation work with explicit provider authorization. Migration, corruption/recovery, strict validation, canon drift, non-authoritative diagnostics, secrecy, and disabled/enabled equivalence are covered. The four H1 TODOs remain for their owning future pass. No official health/maturity rescore is issued; H6 owns it. JUDGEMENT: persistence extensibility and observability improve substantially, with conservative compatibility and platform durability limits stated above.

CALDREVAN HARDENING H4 COMPLETE
