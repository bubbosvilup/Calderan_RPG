# Historical and machine evidence

Status: index of the historical namespace (created by Repository Cleanup B, 2026-10-13). Nothing in this directory describes the current system. For current truth start at the [documentation index](../README.md).

Every report here is **evidence, preserved as written**. Test counts, commit hashes, file paths, model names and conclusions inside a report are those of its own date. Reports are never updated to match the present: a later report or a current document supersedes them.

## Collections

| Where | What |
| --- | --- |
| `CONSOLIDATION_BLOCK*.md`, `POST_CONSOLIDATION_ARCHITECTURE_REVIEW.md`, `REPOSITORY_CLEANUP_*.md`, `REPO12_*.md` (this directory) | The 2026-10-12/13 consolidation and repository blocks, newest last by number. Live evidence: `consolidation_block*_live/`, `keep_track_live/`, `person_offer_live/`, `foreground_identity_live/` |
| other `*.md` files directly here, and [`archive/`](archive/) | Earlier evaluations, hardening passes, bakeoffs, D-series reflection work, live certifications and data passes (2026-09 to 2026-10-12). `archive/` holds the oldest Phase 1 evaluation runs |
| [`reports/`](reports/) | Milestone reports that used to sit in the repository root and one-time evaluations that used to sit in `docs/architecture/` (P3 to P12 passes, identity and movement fixes, portrait and UI milestones, lexical/semantic search and sprite evaluations), with their screenshots ([`reports/ui-screenshots/`](reports/ui-screenshots/)) and contact sheets ([`reports/portrait-benchmark-anime/`](reports/portrait-benchmark-anime/)) |
| [`phases/`](phases/) | Phase 1 architecture records (Phase 1A runtime foundation, 1B scene deltas, 1E world canon and its audit, 1F retrieval foundation, the Phase 1 decisions) |
| [`superseded/`](superseded/) | Documents that once described the current state and were replaced: the old root debt register (now [Master Technical Debt Register](../MASTER_DEBT_REGISTER.md)), the pre-UI capability and freeze snapshots, the pre-implementation image and save/load audits and design |
| [`codebase_audit_2026-10-12/`](codebase_audit_2026-10-12/) | The five-area full codebase audit behind the debt register |
| [`d09-reflection/evidence/`](d09-reflection/evidence/), `historical_replay/`, `h5-live/`, `pass10/`, `p12-*`, `movement-follow-closure/`, other run directories | Machine evidence: traces, recorded live runs, frozen requests, fixtures |

## Links inside moved reports

Repository Cleanup B moved 47 reports here **byte for byte** (pure `git mv`; the full move table is in [Repository Cleanup B](REPOSITORY_CLEANUP_B_DOCUMENTATION_NAMESPACE.md), section 4). Their relative links were written for their original location (the repository root, `docs/` or `docs/architecture/`) and were deliberately not rewritten. To follow one, resolve it from the original location given in the move table.

## Nothing executable reads this directory

Since Repository Cleanup B2 no test, production module or active tool reads or writes here. Files that tests used to read (for example `p12-scene-continuity/fixture-world.json`, `pass10/follow-choice-live.jsonl`, `historical_replay/HISTORICAL_TURN_ANCHORS.json`) stay here unchanged as evidence; tests read byte-identical copies under `tests/fixtures/` (provenance and hashes in `tests/fixtures/provenance.json`). Active tools write new runs to the gitignored `artifacts/local/evaluations/`; a run becomes evidence here only when someone copies it in on purpose. The only code that still touches this directory is four historical reproduction tools (the Phase 1N/1O evidence re-scorers, the D09 harnesses and the D09 receipt audit), allowlisted in `tests/evaluation-history-isolation.test.ts`. See [Repository Cleanup B2](REPOSITORY_CLEANUP_B2_FIXTURE_DECOUPLING.md).
