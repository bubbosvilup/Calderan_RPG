# Caldrevan: Master Technical Debt Register

Status: Current. Audited 2026-10-12 on main `c0608a6`; **reconciled 2026-10-12 after consolidation blocks 1 to 3 (main `31d82cd`, 3334 tests) and block 4 turn reliability (working tree, 3377 tests)**. Original audit text is kept as history; use sections 1A and 1B for current status and ranking, and section 16 for the one canonical decision list. Strategy report: [Post-consolidation architecture review](evaluations/POST_CONSOLIDATION_ARCHITECTURE_REVIEW.md).
Companion: [Master Roadmap](MASTER_ROADMAP.md). Detailed evidence (file:line for every finding): [`evaluations/codebase_audit_2026-10-12/`](evaluations/codebase_audit_2026-10-12/) (five area audits, A to E).

This document lists everything the audit found that still needs fixing, cleaning, hardening, redesigning or implementing, ranked and de-duplicated across the five area audits. It is a planning document: nothing listed here was fixed during the audit.

## 0. How the audit was done, and its limits

- **Scope:** the whole repository (src, client, server, domain, pipeline, providers, persistence, tests, dev tooling, scripts, data, docs).
- **Method:** static reading of the code with file:line citations, import-graph and export analysis, grep over `process.env`, comparison of every normative doc against the code. Five independent read-only reviewers covered: (A) authority, economy, persistence; (B) identity, movement, Heartstone; (C) pipeline, context, providers, images; (D) UI/UX and docs; (E) repository, tests, replay, benchmark. Their reports are stored verbatim in the evidence folder.
- **Zero live calls.** No provider, image or network call was made.
- **Not run:** `npm test` and `npm run typecheck`. The audit sandbox has no `node_modules` (no `yaml`, no `@types/node`) and the network was not used to install them. Test counts below come from the latest commit reports (3278 at `c0608a6`). The flaky-test cause is from reading, not reproduction.
- **Not seen:** the UI was not launched (the world loader needs `yaml`), so UI findings are a static review of `client.js`, `index.html`, `style.css` and the read models. Findings that depend on rendering are marked "(static)". A procedure to complete the visual pass is in audit D, appendix.
- **Git state at audit start:** branch none (HEAD detached at `c0608a6`, which equals main after the Person Actual Offer fix), working tree clean, nothing staged. The Person Actual Offer work was already committed and pushed. Nothing was committed or pushed by the audit. Changes made by the audit: the new files under `docs/` and `docs/evaluations/codebase_audit_2026-10-12/`, and the objectively stale normative-doc edits listed in section 15.
- Sealed canon: no First Voice operational detail appears in this register.

Severity: **P0** data loss or authority breach in normal play; **P1** wrong durable state, exploitable rule hole, secrecy or safety gap reachable in normal play; **P2** correctness or robustness gap with bounded blast radius; **P3** hygiene or debt. Effort: **S** under a day, **M** 1-3 days, **L** over 3 days.
Classification vocabulary for cleanup items: KEEP, KEEP BUT DOCUMENT, RENAME, MOVE, MERGE, REFACTOR, DEPRECATE, ARCHIVE, DELETE CANDIDATE, UNKNOWN (needs human decision).

## 1. Verdict

**No P0 found.** The authority core holds: `prepare` on a cloned draft, whole-batch validation, a single synchronous commit, mandatory `expected_revision`, atomic and stale-safe Accept and promotion. Narrator prose cannot move gold, items, legal status or NPC+ promotion. The debt sits at the edges of that core.

The five items that matter most:

1. **Companion movement bug (P1, known).** A purchased person is left behind at the market when the player moves. Root cause found (section 5). It also opens an identity fork.
2. **Unaudited Narrator draft is streamed to the browser (P1).** The audit and redaction protect only the final text.
3. **SELL is a hole (P1).** It never checks ownership and deletes the item instead of transferring it.
4. **Prose-authorized irreversible actions remain:** manumission from raw player input, and character registration from narration regexes (no retire or merge command).
5. **Portrait safety gate is fail-open for unknown age (P1)**, while the romance gate is fail-closed.

Structural themes: six or more independent regex readers interpret the same narration; derived or media state bumps the authoritative revision and makes UI clicks go stale; economy is gold-only while the narrator thinks in silver; the repository hygiene gained by the 2026-10-03 cleanup has been reversed (1,863 tracked files, 310 of them in an ignored directory).

## 1A. Reconciliation after consolidation blocks 1 to 3 (2026-10-12)

Columns: **audit finding** (original text, below), **current status**, **fix commit**, **residual debt**.

| Finding | Current status | Fix commit | Residual debt |
| --- | --- | --- | --- |
| IMG-1 portrait minor gate | FIXED offline (age no longer gates portraits; user decision) | `4b8fdc9` (block 1) | none; no dedicated live run |
| TRD-1 SELL ignores `owner_id` | FIXED offline (`item_not_owned`, rechecked at Accept) | `4b8fdc9` | custody/loan states (ITM-3) |
| TRD-2 goods offers on undelivered draft | FIXED offline (rechecked on delivered text) | `4b8fdc9` | no dedicated live run |
| TRD-1b SELL deletes the item | FIXED, live-certified (same item transferred; external custody for anonymous buyers) | `5edcd37` (block 2) | no merchant stock or wallet by design |
| TRD-3 two price parsers | FIXED offline (one grammar `trade-price.ts`) | `5edcd37` | `grounding-audit` and audit payment regexes remain separate readers (ARCH-2) |
| TRD-4 currency word list | FIXED offline (unit on a number or coin noun) | `5edcd37` | silver/copper recognised, settled in gold only (ECO-1) |
| TRD-5 offer identity | FIXED offline (terms digest) | `5edcd37` | none |
| TRD-10 payment narration guard | FIXED, live-certified (any standing offer) | `5edcd37` | production phrasing varies |
| MOV-1 non-NPC+ companions never follow | FIXED, live-certified (derived `followCandidates`) | `31d82cd` (block 3) | none known |
| MOV-3 follower predicate at ~8 sites | FIXED (shared by intent, authorization, audit) | `31d82cd` | remaining `activeNpcPlus` uses are authored-NPC+ location authority, departures, contracts |
| MOV-4 audit covers NPC+ only | FIXED (audit parity); residual **P3**: an escorted person narrated as staying behind is not audited | `31d82cd` | inverse audit (state follows the player's act; the Narrator is told) |
| MOV-2 `with <name>` ignored | CLOSED in the narrow deterministic form only (held person named and led by the player) | `31d82cd` | free people, unnamed, plural and pronoun forms unresolved by design |
| ID-1 identity fork | FIXED for held persons and household members (`persistent_identity_elsewhere`) | `31d82cd` | look-alike detection for unnamed people not built |
| PIPE-1 unaudited draft streamed | FIXED, live-certified (the browser receives status words only; the audited, committed narration arrives once, as one block) | block 4 (uncommitted at writing) | none for the stream; see CTX-2 |
| CTX-2 hidden information protection | PARTIAL: only the draft-stream leak is closed (nothing unaudited leaves the server) | block 4 | output-side deterministic leak check on the final text and prompt-side secrecy still open |
| PIPE-2 post-commit failure reported as turn failure | FIXED offline (injected faults at every post-commit point; result assembled before the commit; the turn reports success plus warnings) | block 4 | none known |
| REV-2 no idempotency | FIXED, live-certified for replay (mandatory `turn_key` + `expected_revision`, in-flight registry, 32 bounded persisted terminal receipts in the save file) | block 4 | receipts are bounded (an old key falls off); a crash before the save loses commit and receipt together, which makes re-execution correct; no durable queue |
| NARR-1 truncation loses the turn | FIXED, live-certified on the production model (cap 768, one 1024 recovery, never commit incomplete narration, max 2 logical / 3 physical attempts) | block 4 | truncation rate still unmeasured over a long run (the trace now records it); `narrator_truncated` after a failed recovery is still a lost turn |

Still open by decision: **TRD-11** (goods ledger, needs the ECO-1 schema), **ECO-1** (currency).

## 1B. Current top-20 (re-ranked on current code)

| # | ID | Sev | Item |
| --- | --- | --- | --- |
| 1 | PIPE-1 / CTX-2 | P1 | ~~Unaudited Narrator draft streamed to the browser~~ FIXED (block 4); CTX-2 residual: output-side leak check on the final text |
| 2 | AUTH-1 | P1 | ~~Manumission from regex on raw input, no confirmation~~ FIXED (block 5A): the words create a PendingConfirmation, only the player's Confirm commits |
| 3 | NARR-1 (new) | ~~P2 high~~ FIXED (block 4) | Narrator 512-token cap (was): length truncation is a lost, non-retryable turn; `finish_reason` not recorded; rate unmeasured |
| 4 | AUTH-2 | ~~P1~~ | ~~Permanent character creation from narration, no retire or merge~~ **FIXED (block 5B)** |
| 5 | ARCH-1 (new) | P2 high | Optional intelligence coupled to the authoritative core (absorbs REV-1, PIPE-3, REV-3). **Phase 1 (lifecycle / response path) FIXED in block 6; phase 2 (storage / revision stream) open for block 7** |
| 6 | REV-2 | ~~P2~~ FIXED (block 4) | Turn idempotency key and expected revision |
| 7 | PIPE-2 | ~~P2~~ FIXED (block 4) | Post-commit publication can throw after the commit |
| 8 | ARCH-2 (new) | P2 structural | Regex-per-feature interpretation architecture (absorbs PIPE-5/6/7) |
| 9 | PER-1 | P2 | 16 MB save cap fatal; drivers include `mannerism_learning` and unpruned `trade_offers` (TRD-12) |
| 10 | PER-2 / ID-2 | P2 | Scene participants lost on load; ephemeral ref counter restarts |
| 11 | ECO-1 | P2 | Gold-only settlement vs silver anchors (decision) |
| 12 | IMG-2 | P2 (was P1) | Image batches uncancellable; cost and UX, no state damage |
| 13 | TRD-11 / TRD-12 | P2 | No goods ledger; unpruned `trade_offers` |
| 14 | CTX-1 | P2 | Internal ids reach the Narrator; boundary-less masking |
| 15 | TEST-1 + CI-1 | P2 | Flaky lifecycle test; no CI |
| 16 | PIPE-9, PIPE-10, CTX-3, PIPE-4 | P2 | Context scaling: retrieval headroom, retrieval failure fails the turn, unbudgeted Controller envelope, prompt rebuilt per `getView()` |
| 17 | NPC-1 / NPC-2 | P2 | NPC+ rejoin; behaviour-activity decision |
| 18 | REPO-1, PER-4, PER-5 | P2 | Tracked `saves/` evidence; split migration chain; additive fields without schema bump |
| 19 | UI-1, UI-2, UI-3, UI-15 | P2 | Keyboard reachability, Accept/Promote language, live region |
| 20 | MOV-4 residual | P3 | Inverse audit of an escorted person narrated as staying |

PIPE-5/6/7 and PIPE-8 are subsumed by ARCH-2 or remain as listed in section 9.

## 1C. New architecture findings (2026-10-12)

| ID | Sev | Finding | Action | Effort |
| --- | --- | --- | --- | --- |
| ARCH-1 | P2 high | **Optional intelligence coupled to the authoritative core.** **Block 6 fixed PHASE 1 (lifecycle and response path):** a central optional-service registry (`src/app/optional-services.ts`); Mannerism and Reflection run detached after `turn_completed` with the session idle, never awaited, never owning the turn lock, and apply legacy writes only at idle (otherwise dropped as `write_deferred_core_priority`); sprites and portraits are off the core path (sprite QA is OFF by default and optional); `portraitBusy` no longer blocks a core turn; a permanent disabled-services matrix pins that disabling any service leaves core correctness identical. **PHASE 2 (storage and revision stream) is NOT closed and is block 7:** reflection journal, mannerism observations/candidates/journal, sprite and portrait bookkeeping still live in the authoritative snapshot and bump the revision (PER-3, REV-1). ARCH-1 is therefore not fully closed. Invariant: **disabling any optional service must not break core correctness** (now pinned by tests). | Block 7: side stores per the migration inventory (Reflection notes AND journal both move to the learning/enrichment side store; they are soft-promoted durable enrichment, not authoritative state) in `docs/evaluations/CONSOLIDATION_BLOCK6_CORE_OPTIONAL_SPLIT.md` sections 14-15. | M then L |
| ARCH-2 | P2 structural | **Regex-per-feature interpretation architecture approaching its scaling limit.** About 32 independent modules (about 43 detectors) own a grammar over player or narration text; movement, follow, destination, price and name vocabularies are each declared four to seven times; authorization/audit parity is by convention. Failure mode: new feature, new grammar, overlap, inconsistent facts, audit patch, non-linear regression surface (blocks 2 and 3 both showed it). No numeric limit is claimed. | Shared `NarrationFacts` extractor (strangler, movement slice first), domain policy over facts, authority classes (A/B/C), a bounded ambiguity verifier only after measurement. Not another always-on LLM. | L |
| NARR-1 | P2 high | Narrator `NARRATOR_OUTPUT_TOKENS = 512` (`provider-config.ts:6`, no env override); any `finish_reason != stop` throws a non-retryable `invalid_provider_response` (`client.ts:127-131`, `retry.ts`); the turn fails and the player resubmits; `finish_reason` is not in `GenerationMetadata`/`TurnTrace`. No truncation rate is measured anywhere in the repository; the reported one-in-18 is an unmeasured product observation. | Instrument first (finish reason, truncated calls, output tokens p95), raise to 768, constrained-regeneration recovery once, never commit from incomplete narration. | M |

### 1C.1 H1 closure checklist

Open H1 items are the D-08 "H1 TODOs" (`evaluations/CALDREVAN_DEBT_REGISTER_AFTER_PASS_10.md`, root `DEBT_REGISTER.md`). No TODO/FIXME markers exist in `src/`.

| Item | Verdict | Note |
| --- | --- | --- |
| `them` phantom handover | STILL REAL, DEFERRED | fail-closed; absorbed by NarrationFacts |
| First-name-only condition attribution | STILL REAL, DEFERRED | fail-closed; absorbed by NarrationFacts |
| Unnamed captive price | ALREADY FIXED (P8) | `tests/narration-survives-audit.test.ts:160` |
| Fronted-recipient receipt | STILL REAL, DEFERRED | fail-closed; absorbed by NarrationFacts |
| "Four H1 TODOs" in `ENGINE_FREEZE_PRE_UI.md` and the H6 audit | OBSOLETE (stale count, three remain) | historical documents untouched |

Policy "no new major feature until every H1 item is fixed or explicitly deferred with rationale": **accept**; all three survivors are deferred above with a rationale and an owner.

### 1C.2 Authority classification (principle, see ARCHITECTURE.md section 2c)

Class A low impact, no confirmation. Class B engine-verifiable, no confirmation if the evidence is strong, safe rejection on ambiguity. Class C irreversible or high impact, explicit player confirmation (trade settlement, NPC+ promotion, manumission, large property transfer, destructive actions). Manumission now follows Class C through a PendingConfirmation (AUTH-1 closed, block 5A). Remaining gap: narration-created characters are permanent (AUTH-2, OPEN, block 5B).

## 2. Priority summary (top 30): AUDIT SNAPSHOT, historical rank at `c0608a6`

> **Superseded for planning by section 1B.** Items marked FIXED in this table are closed; do not read this list as the current top priority.

| Rank | ID | Sev | Item | Effort |
| --- | --- | --- | --- | --- |
| 1 | MOV-1 | P1 | Non-NPC+ companions never follow (known bug); also feeds ID-1 | M | **[Status 2026-10-12, consolidation block 3: FIXED offline — MOV-1 (implicit narrated follow for held persons, household members and named invitees; the known "let's go home" bug); the predicate `followCandidates` in `src/turn/follow-candidates.ts`. Live certification: see docs/evaluations/CONSOLIDATION_BLOCK3_COMPANION_MOVEMENT.md. Audit text kept as history.]**
| 2 | PIPE-1 | P1 | Unaudited draft streamed to the player | S-M |
| 3 | TRD-1 | P1 | SELL ignores `owner_id` and deletes the item | S-M |
| 4 | AUTH-1 | P1 | ~~Manumission applied from regex on raw input, no confirmation~~ FIXED (block 5A) | M |
| 5 | IMG-1 | P1 | Portrait minor gate fail-open for unknown age | S | **[Status 2026-10-12, consolidation block 1: FIXED offline — IMG-1 (age no longer gates portraits, user decision 2026-10-12). Live certification still to do. Audit text above kept as historical.]**
| 6 | IMG-2 | P1 | Image batches uncancellable; abort mapped to a retryable error | M |
| 7 | AUTH-2 | ~~P1~~ | ~~Character registration/naming from narration is permanent (no retire/merge)~~ **FIXED (block 5B)** | M |
| 8 | ID-1 | P1 | Movement divergence can fork a person into two records | M (with MOV-1) | **[Status 2026-10-12, consolidation block 3: FIXED offline — the movement divergence is closed by MOV-1/MOV-2 and a new guard: a name that already belongs to a living persistent person elsewhere never creates a second record (`persistent_identity_elsewhere`). Audit text kept as history.]**
| 9 | ECO-1 | P2 | Gold-only settlement vs silver-denominated narrator anchors | M-L |
| 10 | TRD-2 | P2 | Goods offers authorized on the undelivered draft | S | **[Status 2026-10-12, consolidation block 1: FIXED offline — TRD-2 (offers rechecked on delivered text). Live certification still to do. Audit text above kept as historical.]**
| 11 | PIPE-2 | P2 | Post-commit publication can throw after the commit | S |
| 12 | TRD-3 | P2 | Two disagreeing price parsers; ages parsed as prices | M |
| 13 | PER-1 | P2 | 16 MB save cap makes autosave permanently fatal | M |
| 14 | REV-1 | P2 | Media/maintenance commits bump revision; mitigated in block 6 (a client revision stays valid across optional-only writes); side store = block 7 | M-L |
| 15 | REV-2 | P2 | `/api/turn` has no idempotency key | M |
| 16 | PIPE-3 | ~~P2~~ | ~~Post-turn maintenance delays the response~~ FIXED (block 6: detached after `turn_completed`); the revision-bump half is REV-1 / block 7 | M |
| 17 | CTX-1 | P2 | Internal IDs reach the Narrator; masking regex has no boundaries | S-M |
| 18 | PIPE-4 | P2 | `getView()` rebuilds the full narrator prompt on every call | S-M |
| 19 | PER-2 | P2 | Narrated captives (scene participants) lost on load | M |
| 20 | ID-2 | P2 | Ephemeral `scene_npc_<n>` counter restarts on load; false `person_unavailable` | S |
| 21 | NPC-1/2 | P2 | NPC+ who left the household cannot rejoin; behaviour-activity undecided | S + decision |
| 22 | UI-1 | P2 | Drawer Tab trap makes Promote/Edit/Generate unreachable by keyboard | S |
| 23 | UI-2/3 | P2 | Accept and Promote look like ordinary buttons; Accept has no confirm | S |
| 24 | UI-4 | P2 | Whole transcript sent every poll; DOM never trims | M |
| 25 | REPO-1 | P2 | `saves/` is gitignored but 310 evidence files are tracked | S |
| 26 | REPO-2 | P2 | 33 historical reports in the repo root, 570 files in evaluations | S-M |
| 27 | NAME-1 | P2 | `premium_*` legacy naming in schema and ~30 files | L (decision) |
| 28 | TEST-1 | P2 | Flaky lifecycle test on a real 1000 ms timer | S |
| 29 | CI-1 | P2 | No CI, lint, formatter or coverage; build never cleans `.build` | S-M |
| 30 | DOC-1 | P2 | Normative docs stale after three commits (applied in section 15) | S (done) |

## 3. Authority, revision, atomicity, idempotency

Audit A domains 1 and 2. The mutation inventory: every mutation goes through `prepare`/`commit` (turn commit at `turn-coordinator.ts:225`, `acceptTradeOffer`, `completeHeartstoneRite`, appearance and profile editors, location override, portrait and sprite metadata, mannerism and reflection maintenance, load-time canon reconciliation). The Controller cannot propose funds, legal status, person transfer, registration or acceptance.

Per-action behaviour:

| Action | Atomic unit | Stale/repeat | Partial success? |
| --- | --- | --- | --- |
| Actual Offer accept (goods and person) | one `prepare` | strict `expected_revision`; second click gets 409 or `offer_accepted` | state: no; side effects (sprites, participant retire) are separate and best-effort |
| Item transfer, movement | whole turn batch | turn base revision | rejected commands drop, authorized ones commit |
| NPC+ promotion | one `join_household` + derived premium state | strict; repeat refused | no |
| Naming/disclosure | joined to the turn batch | turn base revision | by design the turn commits and naming may be skipped (`identity_skipped`) |
| Save | snapshot captured before any await; temp+fsync+rename | `save_in_progress` guard | save and transcript append are separate (history is non-authoritative) |
| Image metadata | bytes finalized, then one metadata commit | commit uses current revision | crash between finalize and commit leaves orphan files |

| ID | Sev | Finding | Action | Effort |
| --- | --- | --- | --- | --- |
| AUTH-1 | P1 | ~~`manumit` was derived from a regex over raw player input and joined the turn batch.~~ **FIXED (block 5A).** The regex now only *recognises* an interpretation; the turn creates a `PendingConfirmation` (interaction metadata, save schema 6). The legal state changes only when the player presses Confirm (`POST /api/confirmation/confirm`, ref + `expected_revision`), a commit with zero provider calls. No semantic path (Narrator, Controller, regex, audit, repair) emits `manumit` or `set_legal_status` directly. Residual by design: the FREE grammar is unchanged and does not recognise bare "I free Maren." (no 'you'). | ~~Move to an explicit UI action~~ done | M |
| AUTH-2 | ~~P1~~ | ~~`establishNames` registers characters from delivered narration.~~ **FIXED (block 5B).** Lifecycle PROVISIONAL / PERSISTENT / RETIRED (not an NPC tier). Narration and a narration-established name now produce only a scene-local `ProvisionalPerson`; the sole producers of a persistent created character are the person Actual Offer Accept (same subject, atomic with the purchase) and the engine's canonical materialization. `retire_character` / `merge_characters` exist as human-invoked, PendingConfirmation-gated repairs (`requestRepair`), and a read-only fork scanner finds suspicious pairs. Residual: PER-2/ID-2 (provisional people and scene participants are lost on reload), no automatic repair by design, no `materialize_character` confirmation kind yet (reserved, no real persistence need), duplicates already saved by older builds still need a human scan and merge. | ~~Add retire/merge~~ done | M |
| AUTH-3 | P2 | Literal `"nicco"` appears 212 times in 60 non-dev files, including authority code (`item-transfer.ts:20`, `command-authorizer.ts`, `person-offers.ts`, `person-transactions.ts`), against one `activePlayerCharacterId()`. | One `playerId(snapshot)`; lint test forbidding new literals outside canon/opening. | M |
| REV-1 | P2 | Item-sprite and portrait metadata commits, mannerism bookkeeping and reflection bump the authoritative revision between turns (`item-sprite-jobs.ts`, `game-session.ts:199`). UI clicks rendered earlier go stale; the "TRADE COMPLETED" note keys on a revision-count heuristic (`trade-notes.ts:36`). | Move derived/media state out of the revision stream, or batch it; key the completed-note on the settlement revision plus a consumed flag. | M-L |
| REV-2 | P2 | `/api/turn` has no idempotency key or `expected_revision`; a retry after a dropped connection can run a second, different turn (`server.ts:192-215`). Streaming aborts the turn on `res.close`. | Client `turn_key` + `expected_revision`; return the stored outcome for a repeated key. | M |
| REV-3 | P2 | Turns are not blocked during a portrait batch (`game-session.ts:733-736` checks status but not `#portraitBusy`); the batch commits with the current revision, so an in-flight turn can fail `stale_turn` after spending LLM calls. | Block turns during batches, or re-check idle+revision immediately before the portrait commit. | S |
| PIPE-2 | P2 | After `campaign.commit` (`turn-coordinator.ts:225`), `recordExchange`, `participants.retire`, `assembleTurnResult` can throw; the player sees a failed turn that changed state and the exchange never enters recent memory. | Make post-commit publication non-throwing or build the result before the commit. | S |
| AUTH-4 | P2 | `personPlan` accepts any `register_character`/`set_legal_status`/`transfer_person` command shapes; only the transfer entry is checked at propose time (`trade.ts:126-131`, `validation.ts:215-222`). Latent (only engine code produces plans). | Closed id whitelist at propose and snapshot-validation time. | S |
| AUTH-5 | P2 | `characterForUpdate` silently registers a campaign record for any canonical id referenced by `set_condition`, `set_profile`, `place_item(equipped)` (`preparation.ts:11-19`). | Document, or require explicit materialization. | S |
| AUTH-6 | P3 | Load-time canon reconciliation changes state and bumps the revision (`canon-compatibility.ts:97-103`) with no ledger entry. | Test pinning that no other domain is touched; record in the load report. | S |
| AUTH-7 | P3 | `/api/location` is an unauthenticated (loopback-only) teleport exposed in the player UI. | Gate behind a dev flag or confirm. | S |
| AUTH-8 | P3 | One person sale is recorded in three places (`transactions[]`, `legal_statuses[].transfer`, `trade_offers[].settlement`); no invariant ties them. | Snapshot invariant: accepted person offer implies matching transaction. | S |
| REV-4 | P3 | Item-sprite `flush()` commits inside a `catch` without its own try/catch. | Wrap. | S |

## 4. Actual Offer, economy, items

Audit A domains 3 and 4. Behaviour verified: one active offer; supersession; withdrawal; automatic invalidation after every prepare (scene change, absent counterparty, item gone, person unavailable); Accept only via `POST /api/trade/accept`; BUY debits and creates items; SELL deletes items; person offers replay a stored plan; masking and "Slave" provisional label; rename on the same entity; save/load persists offers; Auction House and vendors have no model (excluded by word and name heuristics).

| ID | Sev | Finding | Action | Effort |
| --- | --- | --- | --- | --- |
| TRD-1 | P1 | SELL checks `itemHolder === player` but not `owner_id` (`trade.ts:120-125,182`). Lent or stolen items can be sold and permanently deleted. | Require ownership; produce `item_not_owned`. | S | **[Status 2026-10-12, consolidation block 1: FIXED offline — TRD-1 (SELL requires ownership, `item_not_owned`). Live certification still to do. Audit text above kept as historical.]**
| TRD-1b | P1 | SELL deletes the item rather than transferring it (`trade.ts:178-193`); with no counterparty wallet it is a gold faucet and the item cannot be re-bought or stolen back. | Transfer to the counterparty or a merchant-stock location; credit the purse when one exists. | M | **[Status 2026-10-12, consolidation block 2: FIXED offline. SELL transfers the same item (persistent buyer holds and owns it; anonymous buyer: external custody `unknown`/`null`); settlement records `custody`. Live certification not done.]**
| TRD-2 | P2 | Goods offers are authorized against the undelivered draft (`trade-authorization.ts:46`); the audit may then rewrite the narration and nothing re-checks the quote. A card can show a price the player never read. | Re-run goods authorization against the delivered text. | S |
| TRD-3 | P2 | Two independent price parsers disagree (`statedGold` vs `pricesOf`). A bare "Twenty-two." (an age) can become 22 gold (`person-offers.ts:94,119-122`); "for ten minutes" parses as a price; "four-fifty" is rejected. | One shared `extractGoldPrice()`, explicit unit required for prose prices, corpus tests. | M | **[Status 2026-10-12, block 2: FIXED offline. One grammar `src/turn/trade-price.ts` for goods and person offers; ages, durations and quantities are not prices. Live certification not done.]**
| TRD-4 | P2 | Currency filter rejects material words (`silver`, `copper`, `bronze`, `marks`, `crowns`; `trade-authorization.ts:21`); "silver locket for ten gold" and "silver-haired" (`person-offers.ts:42`) are falsely rejected; "gold crowns" passes `statedGold` but fails `NON_GOLD`. | Detect currency by number+unit patterns. | S-M | **[Status 2026-10-12, block 2: FIXED offline. Currency is a unit on a number or a coin noun; "silver locket", "silver-haired" no longer block; real silver/copper/marks and fractions remain unsupported and are never converted (ECO-1 open).]**
| TRD-5 | P2 | `sameOffer` compares controller-generated descriptions (`trade.ts:95-99`); a repeated quote supersedes an unchanged offer and the card's ref goes dead. | Offer terms digest (direction, price, normalized subject). | S | **[Status 2026-10-12, block 2: FIXED offline. Offer identity is a terms digest (direction, price, counterparty, subject); cosmetic wording keeps the same offer.]**
| TRD-6 | P2 | Goods name check passes if any one word is near the quote (`trade-authorization.ts:81-85`). Category resolution is first-match on name only and ignores the controller category (`trade.ts:36-49,168`). | Require all significant words; honour the controller category with validation. | S |
| TRD-7 | P2 | Auction exclusion uses venue-name and word heuristics; the real auction venue `calderan_slave_market` has no "auction" in its name; "bid" the verb false-blocks. Person and goods paths use different lists. | Canon flag `auction_house` plus scene state; unify lists. | M |
| TRD-8 | P2 | Withdrawal regex is too broad ("refuses", "no longer", "put it away") (`trade-authorization.ts:26`). | Require subject/price in the same sentence. | S |
| TRD-9 | P2 | Person subject resolution relies on layered regexes; two same-sex captives described by pronoun can pick the wrong person (`person-offers.ts:140-185`). Fails closed on ambiguity otherwise. | Golden tests for two captives; require a unique descriptor on the card. | M |
| TRD-10 | P2 | The "uncommitted purchase" audit runs only in person-trade scenes (`narration-audit.ts:656-664`); the Narrator can narrate payment for a goods offer before Accept. | Make it offer-aware. | S | **[Status 2026-10-12, block 2: FIXED offline. Any standing offer (goods, items, person) guards narrated payment/hand-over. Live certification with production Narrator phrasing not done.]**
| TRD-11 | P2 | Money is only partially conserved: goods BUY credits nobody, anonymous sales leave the economy, no ledger row for goods trades (`trade.ts:175-176`). `ACTUAL_OFFER.md` §6 claims a transaction record. | Goods `transactions` entry or generic ledger; fix the doc. | M | **[Status 2026-10-12, block 2: still OPEN, deliberately deferred: PersonTransaction is person-typed; a goods ledger needs a generic economy ledger type and schema change (ECO-1). The offer's own `settlement` is the interim audit trail.]**
| TRD-12 | P2 | `trade_offers` is never pruned; the schema caps it at 5000 (`validation.ts:287`); beyond it every prepare fails. Supersession churn (TRD-5) makes this reachable. | Prune closed offers into a compact ledger. | S-M |
| TRD-13 | P3 | Stale semantic-payment remnants: `TransactionDiagnostic.kind: "purchase"`, `transaction-acts.ts` `ACCEPT`, `economic-context.ts:13`. Harmless today, could be revived as authority by mistake. | Delete `purchase`, rename `ACCEPT`, add an import-guard test. | S |
| TRD-14 | P3 | Offers never expire in world time. | `expires_minute` once vendors exist. | S |
| ECO-1 | P2 | Settlement is integer gold, minimum 1 gold, but the narrator's anchors (`config/economy.yaml`) are in silver (bread 1 silver, room 5 silver). Everyday purchases can never become offers. | Decide: funds in integer silver internally (display G/S, schema 7) or gold-only anchors. Silver internally is the lower-risk migration. | M-L |
| ECO-2 | P3 | `tradePrice` is any integer 1 to 1,000,000; no check against anchors. Funds range differs (1e9). | Anchor sanity band diagnostics. | S |
| ECO-3 | P3 | `set_funds` is absent from the Controller schema (correct) but has no regression test. | Add the rejection test. | S |
| ECO-4 | P3 | No funds ledger of causes (only trade deltas). | `funds_ledger` when rewards/upkeep arrive. | M |
| ITM-1 | P2 | Equipment UI has four fake slots mapped by category; Head and Boots can never fill (no `headwear`/`footwear` categories); domain slots are free-form strings (`inventory-ui-view.ts:12-19`, `validation.ts:76`). | Canonical slot enum in the domain, validate in `place`, render from `position.slot`. | M |
| ITM-2 | P2 | `empty_slots` is persisted although derived, mutated in three places, and silently skipped for the player (no character record) (`items.ts:18-25`, `trade.ts:183-186`). | Compute, do not persist. | S |
| ITM-3 | P2 | Owner vs carrier is not an invariant; no loan/custody/theft state. `owner_id` may name a dead or absent character. | Explicit custody states once commerce matters (ties to TRD-1). | M |
| ITM-4 | P2 | Duplicate prevention is by normalized name and visible position; buying "a loaf" twice makes two items; substring name vetoes block unrelated items ("bread knife" vs "bread"). | Stable item key; `quantity`. | M |
| ITM-5 | P2 | No stacks, quantity, weight, containers or `contained_in`. A bundle is N rows against the 8-line cap. | `quantity` first, `container_id` with the Property work. | M |
| ITM-6 | P3 | No player-visible path to equip purchased gear (the authorizer rejects `place_item(equipped)` without evidence). | Explicit equip/unequip engine action (UI-confirmed). | M |

Missing for future commerce (roadmap, not defects): merchant inventories and wallets, services (rent a room), recurring costs (wages, upkeep), rewards and loot tables, Auction House (lot/bid/close model), debt (negative balance with creditor id), multi-currency. See [Master Roadmap](MASTER_ROADMAP.md), track T-ECON.

## 5. Movement and group movement (known bug)

Audit B domain 2. **Do not fix tonight; this is the full finding for the roadmap.**

Current architecture:
- Player movement is engine-only: `resolvePlayerTravel` (`player-travel.ts:34-73`) turns "let's go home" into a `runtime_delta` (home = `heartstone`). `with <name>` is parsed and discarded ("group wording grants no NPC authority"). The Controller has no `runtime_delta`; `move_character` for Nicco is rejected (`command-authorizer.ts:62-70`).
- NPC movement: (1) player-authored carry (`resolvePlayerCarry`), (2) narrated completed movement as evidence (`narratedMovements`, `character-movement.ts:307-356`), (3) departures (`leave_scene`, `scene-departure.ts`), (4) Controller `move_character` proposals, authorized only against narration evidence.
- There is **no party, follower or companion model** (`character-movement.ts:14-16`). Presence is location equality. Narration can propose multi-actor movement, one entry per character.
- Interaction participants stay behind by default at three layers: state, narrator note ("X stays there", `follow-invitation.ts`, `stages/intent.ts:113-117`), and foreground binding dropped on location change.

**Root cause (high confidence from code; not replayed):** the implicit-destination follow grammar ("she follows a step behind", "falls into step", `implicitFollows`, `character-movement.ts:241-289`) is gated by `followers = activeNpcPlus(...)` at every call site (`stages/authorization.ts:63`, `narration-audit.ts:501,508`). A purchased person is a Campaign NPC, not NPC+, so the grammar returns nothing, no `move_character` is authorized, and she stays at the market. The Narrator is also told non-NPC+ people "stay there", and the audit cannot flag the divergence for her (follow-claim checks use the same NPC+-only set). Explicit-destination follows ("follows him into Heartstone") do work for any created character.

| ID | Sev | Finding | Action | Effort |
| --- | --- | --- | --- | --- |
| MOV-1 | P1 | Non-NPC+ companions never follow via implicit narrated follow; no audit flag; narrator told to leave them. | Strategy below. | M | **[FIXED offline 2026-10-12, block 3]**
| MOV-2 | P2 | `with <name>` / "together" ignored; invitations read only for NPC+. | Optional escort step (needs product decision). | M | **[Status 2026-10-12, block 3: CLOSED in the narrow deterministic form only — a held person who is present, NAMED and led by the player's own words moves with Nicco in the same atomic batch (`resolveHeldEscort`). "with <name>" for free people and unnamed/plural/pronoun forms remain unresolved by design.]**
| MOV-3 | P2 | "Follower" expressed as `activeNpcPlus` at about 8 sites; no single predicate. | Extract `followCandidates`. | S | **[FIXED offline 2026-10-12, block 3: one pure derived predicate shared by intent notes, authorization and audit. Remaining `activeNpcPlus` uses are deliberate: authored NPC+ location authority (`movableCharacters`, `npcPlusEntrants`), stair/door departures, contracts.]**
| MOV-4 | P2 | Audit pronoun-arrival closure and follow claims cover NPC+ only, so created non-NPC+ people can silently diverge from narration. | Generalize with the predicate. | S | **[FIXED offline 2026-10-12, block 3: audit parity through the same candidate set. Residual: a narration that leaves an escorted person at the origin is not audited (the state follows the player's act and the narrator is told).]**
| MOV-5 | P3 | Stale invariant text ("no party, follower, companion") in code comments and the Controller prompt. | Update after the design. | S |
| MOV-6 | P3 | Multi-act player travel is ambiguous-by-design (nobody moves) with no player feedback. | Optional UI note. | S |

**Recommended implementation strategy (no persisted party):**
1. One pure predicate `followCandidates(snapshot, world, ids)` in `src/campaign/followers.ts` with explicit reasons: `npc_plus_active` (today), `held_by_player` (legal status enslaved or owned, holder = player), `household_member` (active member of a household the player keeps), `invited` (explicit invitation this turn, present character). Excluded: dead, inactive, refusing.
2. Swap it for `activeNpcPlus` at the call sites: `stages/intent.ts:113`, `stages/authorization.ts:63,67,91`, `narration-audit.ts:501,508,518`, `character-movement.ts:45,63`.
3. Split `leftBehindNotes` into stay / choice / (optional) escort; keep the NPC+ text byte-for-byte to protect `tests/golden/turn-pipeline.json`.
4. The audit then withdraws an unrecorded follow claim (`uncommitted_movement`) instead of diverging silently.
5. Update comments and the Controller prompt ("ownership never moves by itself; a narrated follow is evidence for held persons").
6. Only after product sign-off, an optional deterministic **escort** step: if the player's own words lead a held person ("let's go home, Lira", "I lead her home"), resolve a pre-narration `move_character` like carry does. Free persons stay narrative.
7. Do **not** add a persisted `party` domain: a stored follow list goes stale (the class of bug reported) and needs migration; if ever wanted, derive per turn from the reasons in step 1.

Tests required: purchased held person + "she follows a step behind" moves her; "she stays at the stall" does not; narrated follow while Nicco did not move is withdrawn; free uninvited created character does not follow implicitly (regression guard for "membership never moves"); invited free character honoured; two held persons with an ambiguous pronoun move nobody; Controller `move_character` to a wrong place is rejected; reload mid-trip creates no duplicate person after a self-introduction at arrival (covers ID-1); existing `location-continuity`, `movement-follow-interaction-matrix`, `follow-recognition-closure` stay green. A one-turn offline replay in the `location-continuity.test.ts:163` pattern would confirm the root cause in minutes.

## 6. Identity

Audit B domain 1. Five layers: canonical identity, campaign identity (`campaign_character_r<revision>_<slug>`), session-local scene participants (`scene_npc_<n>`), anonymous/unknown, and player knowledge (identity-name fact + knows edge for canonical, proven `profile.name` for created). Disclosure of canonical names is engine-owned (name request or self-introduction to one resolved partner; learned only from an attributed truthful self-introduction). Foreground binding is session continuity, never a campaign mutation. A conflicting name for a bound canonical partner is rejected, not rewritten.

### 6.1 Ways the same person can fork into two records

| # | Vector | Sev |
| --- | --- | --- |
| F1 | Movement divergence (MOV-1): she is left at the market, narration shows her at Heartstone, a self-introduction there registers a new `r<rev>_<slug>` record because `readScene` only treats PRESENT characters as known (`narrated-captives.ts:330,406`). | P1 |
| F2 | Revision-scoped ids never collide; dedupe rests entirely on the narration reader; absent campaign people with the same name are not linked to a "new" one. | P2 |
| F3 | The ephemeral `scene_npc_<n>` counter restarts on load (`scene-participants.ts:120`) and can equal a stored `origin_snapshot.ephemeral_ref`, falsely blocking Accept as `person_unavailable` (`trade.ts:76`). Exact ref format not traced ("verify"). | P2 |
| F4 | Late naming applies only to a PRESENT unnamed persistent character (`narrated-captives.ts:401-405`); an absent one cannot be late-named. | P2 |
| F5 | Canonical NPC re-cast as a created person is guarded by regex bearer checks; residual risk. | P2 |
| F6 | A name introduced on a turn where Nicco changes location is skipped (`location_changed`); the later naming has no linked participant. | P3 |
| F7 | A counteroffer reuses the planned id only if `ephemeral_ref` matches; a changed ref makes a second planned identity and breaks supersession (`person-offers.ts:349-355`, `trade.ts:90-97`). Verify. | P2 |
| F8 | No production code creates canonical-origin campaign records; authored-NPC+ branches are test-only. | P3 |

### 6.2 Identity invariant checklist

| # | Invariant | Enforced at | Gap |
| --- | --- | --- | --- |
| I1 | One person = one campaign id, never reused or rewritten. | `identity.ts:38-44`, `snapshot-validation.ts:42`, `set_profile` keeps the id | No uniqueness on `origin_snapshot.ephemeral_ref`. |
| I2 | A canonical NPC is never duplicated as a created person. | `narrated-captives.ts:409-420`, canonical casting, `partner-identity-guard.ts` | Regex-based. |
| I3 | Objective identity (engine) is independent of the label the player knows. | `narrator-identity.ts`, `prompt-builder.ts:239-251` | Masking is full-name/alias string replacement only; fragments not masked (verify). |
| I4 | A canonical name is learned only via a truthful attributed self-introduction (or host grant). | `canonical-name-disclosure.ts:75-165` | Heavy heuristic surface. |
| I5 | A bound canonical partner cannot self-introduce under another name. | `partner-identity-guard.ts`, audit `canonical_name_conflict` | Scope deliberately narrow. |
| I6 | Binding is session continuity, never a campaign mutation. | `foreground-binding.ts` | `#focus` not persisted while `conversation_partner_id` is. |
| I7 | Unnamed held person shown consistently as "Slave" until legitimately named; same id and offer ref after reveal. | three views | Implemented 3-4 times with different output ("Slave" vs "Young Slave"). |
| I8 | Created-name display = proven name only. | `knownCreatedName` | Narrator side uses `profile.name` directly; can diverge. |
| I9 | Name provenance outlives recent transcript. | `profile.name_source` | OK. |
| I10 | Late naming applies to the same record only when present and unnamed. | `narrated-captives.ts:401-405` | Absent unnamed person (F4). |
| I11 | An ephemeral participant becomes at most one persistent person, then retired. | `scene-participants.ts retire` | Counter restarts on load (F3). |
| I12 | Purchase never forks the subject across counteroffers. | `person-offers.ts:349-355` | Ref stability not schema-enforced (F7). |
| I13 | Canonical avatar bound to canonical id, never to name or request text. | `player-character-view.ts` | OK. |
| I14 | UI never receives hidden canonical names. | `ui/server.ts:37-48`, `text()` | `SessionView` still carries unmasked canonical names (`session-view.ts:96,104`); only server field selection hides them. |
| I15 | Identity facts live in one store. | `identity-knowledge.ts:4` | OK. |
| I16 | Person presence in state matches the person depicted in narration. | audit `absent_participant`, movement audit | NPC+-only for follows (MOV-4). |

| ID | Sev | Finding | Action | Effort |
| --- | --- | --- | --- | --- |
| ID-1 | P1 | Unrecorded follow can fork a person (F1). | Fix MOV-1; flag a strong self-introduction at a scene when an unplaced/unnamed campaign person with a matching description exists elsewhere. | M |
| ID-2 | P2 | Ephemeral ref counter resets on load, collides with stored refs. | Namespace the ref or seed `#next` from the snapshot; reload test. | S |
| ID-3 | P2 | The "Slave" provisional label is built in 3-4 places. | One `provisionalPersonLabel()` / `PersonIdentity` read-model module consumed by sidebar, card, offer view and narrator context. | M |
| ID-4 | P2 | No snapshot invariant on `ephemeral_ref` uniqueness or duplicate unnamed twins at one location. | Warn-level load-time check (save-compatible) plus a dev diagnostic. | S |
| ID-5 | P3 | `SessionView` carries unmasked canonical names. | Carry `display_name` only. | S |
| ID-6 | P3 | Narrator and UI use different proven-name rules. | Route both through `knownCreatedName` (move to `campaign/`). | S |
| ID-7 | P3 | Masking leak coverage for surname-only or first-name-only mentions. | Leak test over canon retrieval chunks. | S |
| ID-8 | P3 | Canonical campaign-record producer absent; authored-NPC+ branches test-only. | Decide: remove or add a deliberate producer. | decision |
| ID-9 | P3 | Participant plan not persisted while the partner id is. | Document or rebuild focus on load. | S |

Identity logic is scattered: "Slave" label (4 places), name-known (6 functions), masking (3 independent substitution engines), partner resolution (6 modules), person creation (3 modules each re-implementing dedupe), name-request regexes (4 places), "is present" (3 definitions). Consolidation candidate: a single `PersonIdentity` read model.

## 7. Heartstone and NPC+

Audit B domain 3. **Confirmed:** the architecture is explicit and player-authorized. UI posts `/api/npc-plus/promote` with an opaque ref and revision, then `GameSession.completeHeartstoneRite` issues one `join_household`; the premium (NPC+) record derives in the same `prepare`, one revision or none. Eligibility (`heartstone-rite.ts:174-186`): campaign record, not already NPC+, Heartstone household exists, Nicco is owner-member, character active, inside the Heartstone interior. Narration and Controller `join_household` into the Keeper's household are rejected (`command-authorizer.ts:96-98`). No legacy semantic rite completion code remains; vestiges are the generic voluntary-membership evidence path (live for other households and for `leave_household`), charter lore text, and a comment (`premium-characters.ts:12`).

| ID | Sev | Finding | Action | Effort |
| --- | --- | --- | --- | --- |
| NPC-1 | P2 | A promoted NPC+ who left cannot rejoin: the UI refuses `already_npc_plus` and narration is rejected. The domain supports rejoin (`premium-characters.ts:193-196`) but no production path reaches it. | Allow the same UI action as "welcome back" when premium exists and membership is not `member`. | S |
| NPC-2 | P2 (decision) | Behaviour-activity of a promoted NPC+ outside the household. Current: tier and editor stay, behaviour (prompt pack, reflections, mannerisms, follow authority, contracts, scene developments, stone recognition) is off because `activeNpcPlus` is membership-gated. | Recommended default: keep inactive, expose rejoin (NPC-1), show an "inactive NPC+" badge. If active is chosen, introduce `isActiveForBehaviour` and migrate ~20 sites in one pass. | decision + M |
| NPC-3 | P2 | No production producer of canonical-origin campaign records; authored NPC+ branches (`npcPlusEntrants`, `authoredNpcPlus`) are test-only. | Product decision: can a canon NPC be promoted? | decision |
| NPC-4 | P3 | `leave_household` for Nicco's household stays evidence-based; a narrated "I leave" demotes behaviour without a player action. | Document, or require confirmation. | S |
| NPC-5 | P3 | The rite does not check legal status, consent or relationship (an enslaved person can be promoted). By design. | Note in canon docs. | S |
| NPC-6 | P3 | `completeHeartstoneRite` swallows all commit exceptions into `campaign_validation_failed` (`game-session.ts:356`). | Log through the sink. | S |
| NPC-7 | P3 | Comment drift in `premium-characters.ts:12`. | Edit. | S |
| NAME-1 | P2 (decision) | `premium_characters`, `premium_reflections`, `PremiumCharacterState`, `premium-characters.ts`, `record_reflection`: 241 files mention "premium"; the product term is NPC+. | Save-compatible path: Phase 0 rename symbols/files only; Phase 1 migration accepting both keys on load; keep `activeNpcPlus`/`isNpcPlus` names; round-trip test with a v5 fixture. | L |

## 8. Persistence and schemas

Audit A domain 5. Snapshot schema 7, save file schema 7 (block 5B). Atomic write (temp + fsync + rename + directory fsync, Windows skips directory fsync), `previous` copy, rolling checkpoint backups, lock with heartbeat, 16 MB cap, soft delete.

| ID | Sev | Finding | Action | Effort |
| --- | --- | --- | --- | --- |
| PER-1 | P2 | The 16 MB serialized cap throws `invalid_save`, which is in `FATAL_SAVE`; autosave stops permanently and the player keeps playing an unsaveable campaign. Drivers: `mannerism_learning.candidates` (schema allows 800,000), `transactions`, unpruned `trade_offers`, pretty-printed JSON. | Warn at 50%, compact JSON, prune derived evidence and closed offers, make "too big" non-fatal with a visible banner. | M |
| PER-2 | P2 | `SceneParticipants` (narrated captives) are lost on every load; a described-but-unpriced captive loses identity, and a new offer after reload re-promotes under a different ref (duplicate person risk, ties to ID-2/F7). | Persist a compact participant registry or rebuild deterministically from `continuity`. | M |
| PER-3 | P2 | Derived or media state persisted in the authoritative snapshot: `active_household_member`, `empty_slots`, `price_indices`, mannerism journal/candidates, premium history diffs, sprite and portrait metadata. Safe (validated) but inflates saves and revisions. | Split core from derived/media side files with a recompute path (shares REV-1). | L |
| PER-4 | P2 | Migration logic split across two mechanisms (table `SAVE_MIGRATIONS` plus hard-coded snapshot 4->5->6 steps in `save-format.ts:102-106`); no ordered chain; no fixture matrix; migrated loads do not mark the session dirty. | One chain keyed by snapshot version; real older-schema fixtures per version; mark migrated sessions dirty once. | M |
| PER-5 | P2 | Additive optional fields (`price_indices`, `portraits`, `trade_offers`, `mannerism_learning`, ...) were added without a schema bump; the parser rejects unknown fields, so an older build reports `invalid_save` rather than `unsupported_version` and may quarantine a good newer save. | Bump on persisted-field additions or add a minimum-engine-version and map unknown-field failures to `unsupported_version`. | S-M |
| PER-6 | P2 | Legacy names: `premium_*` (NAME-1), `private_memory_refs` (`@deprecated`), portrait `active_version_id` decode, relationship `trust` legacy seed, `CampaignSaveFileV1/V2`, `canon_compatibility: "strict"` only from migration 1, `reference_used` unused. | Drop at the next migration. | M |
| PER-7 | P2 | Soft delete never purges; no restore UI or retention. | Retention command and restore. | M |
| PER-8 | P3 | Save, transcript append and asset cleanup are three steps; a crash can leave the transcript behind (accepted by design, history non-authoritative). | Document residual gap. | S |
| PER-9 | P3 | Lock staleness is time-based (90 s); a paused process can overwrite a newer save. | Monotonic `save_generation` in the file. | S |

## 9. Turn pipeline and context

Audit C domains 1 and 2. The real order (16 steps) runs: HTTP, `submitPlayerInput`, `runTurn`, intent resolution, projection, retrieval, prompt, Narrator draft (streamed), Controller proposal on the draft, authorization (including derived proposals from regex grammar over the draft), final `prepare` (receipt), audit/revision/redaction, commit preparation on the delivered text (names, disclosure, contracts, person offers), delivery, one commit, publication, then post-turn item sprites and maintenance. Authority is sound at the core; the only turn-time commit is `turn-coordinator.ts:225`.

| ID | Sev | Finding | Action | Effort |
| --- | --- | --- | --- | --- |
| PIPE-1 | P1 | The unaudited draft streams to the browser (`on_narrator_preview` -> `server.ts:201` -> `client.js:734`). Everything the audit exists to stop is visible for the controller+audit latency. Secrecy relies on prompt rules plus a regex audit that protects only the final text. | Product decision: stop streaming drafts (neutral "thinking" state) or stream through a conservative deterministic filter against names/aliases the player has not learned. | S-M |
| PIPE-5 | P2 | **[Status 2026-10-12: re-counted at about 32 independent modules, about 43 detectors; now tracked as ARCH-2.]** Six or more independent readers interpret the same text, each with its own grammar: Controller, authorization derived grammar, `deriveTurnEvidence`, audit, commit-prep, foreground binding, mannerism extractor, reflection. | One shared `NarrationFacts` claim extractor per text (draft, revision, delivered). | L |
| PIPE-6 | P2 | Commit-prep promotes people, records canonical-name knowledge, contracts and person offers from the delivered text after the audit and outside `authorizeWithEvidence` ("fourth authority lane"). | Document as a lane; emit as authorization diagnostics; consider a final audit over the batch. | M |
| PIPE-7 | P2 | Commands are fixed from the draft; if the revision or redaction reshapes the event, state may change without prose saying so. The only repair is a hard-coded English arrival sentence (D-13). | Generalize: verify every committed command is mentioned, append a templated sentence per omission. | M |
| PIPE-8 | P2 | Two delivery orders via `reliability_contract`; production uses the one that delivers narration before the commit (`turn-coordinator.ts:221` vs `225`). | Single post-commit mode; delete the flag. | S |
| PIPE-3 | ~~P2~~ FIXED (block 6) | ~~Post-turn work (mannerism bookkeeping, LLM every 4th turn, shadow reflection, sprite metadata) commits after `turn_completed` and delays the HTTP result.~~ Now launched detached after the core turn completes and the session is idle; no longer delays the response or owns the lock. The revision-bump half remains REV-1 (block 7). | Done; side store for bookkeeping = block 7. | M |
| PIPE-4 | P2 | `getView()` rebuilds a full narrator prompt on every call (about 43 call sites; `server.state()` calls it twice); a turn triggers 6-10 context builds. | Cache the budget by revision and input; build once. | S-M |
| PIPE-9 | P2 | The budget indicator excludes retrieval (up to 10,000 chars); auto-compaction at 0.9 can read "fine" while the real request breaches and throws `context_too_large`. `#lastInput` is set before the Narrator call. | Reserve retrieval headroom (about 3k tokens). | S |
| PIPE-10 | P2 | Retrieval failure (any exception or payload over the cap) fails the whole turn although retrieval is optional evidence. | Degrade, do not fail. | S |
| PIPE-11 | P3 | Retrieval trigger scans all entities each turn; linear in canon size. | Precomputed name index. | S |
| PIPE-12 | P3 | Turns/portraits/saves have no single operation lock; `shutdown` waits up to ~6 minutes for an uncancellable batch. | One `OperationLock` with a compatibility matrix and cancellation tokens. | M |
| CTX-1 | P2 | Internal IDs reach the Narrator (`prompt-builder.ts:302`, fact ids, item/location ids); masking covers only canonical NPC ids; protection is a prompt rule. ID masking regex has no word boundary (`narrator-identity.ts:48-50`), so an NPC id that is a prefix of another token would corrupt it (not reproduced; verify with a unit test). | Session-scoped opaque refs in the Narrator rendering; boundary-aware regex; output scan for id shapes. | S-M |
| CTX-2 | P1 (draft-stream leak FIXED in block 4; the rest stays open) | Hidden information is protected for the player only by prompt rules and a post-hoc regex audit (English, exact names). | Output-side deterministic leak check against names/aliases/titles the player has not learned, on every streamed chunk and the final text. | M |
| CTX-3 | P2 | The Controller envelope duplicates appearance data (`profile` and `permanent_appearance`), carries full social and every fact, has no token budget and is re-sent verbatim on retries. | Dedicated `ControllerView` with a 6-8k token cap. | M |
| CTX-4 | P2 | Retrieval is keyed on the player's input only; a follow-up without a named entity returns nothing; English-only regex triggers. | Add entities mentioned in the last 1-2 exchanges; locale-agnostic fallback. | M |
| CTX-5 | P2 | Context is built from different states in one turn (`base`, `projected`, `prepared`), 4-5 builds plus 6-10 via `getView`; the contract is implicit. | A named `TurnFrame` with lazy single builds. | M |
| CTX-6 | P3 | Foreground prioritization is spread across five modules. | One `FocusPlan`. | M |
| CTX-7 | P3 | Side-channel WeakMap metadata (gates, sizes): a cloned context loses its masking gate silently. | Make the gate an explicit field of a `NarratorView`. | M |

**Context-budget strategy (recommended):** separate token allowances for fixed system (~3.3k), authority (never-drop), focus (ranked), retrieval (reserved 2.5-3k), history and output; degrade by tier (NPC+ flavour, then background actors compact, then low-ranked facts/events, then NPC-NPC relationships, then older dialogue, then recent scene narration), failing closed only if authority alone exceeds the budget; calibrate the byte heuristic against provider `usage.prompt_tokens`; budget the Controller separately; cache by revision; add a synthetic 200-character / 500-fact / 100-item scale fixture.

Module hotspots (what it does / why risky / cleaner boundary / urgency / effort):
- `src/app/game-session.ts` (998 lines, 40+ methods): turn orchestration, autosave, transcript, portrait batches (a ~110-line method), trade accept, editors, rite, sprites, compaction, shutdown. Unrelated features share one mutable status machine. Cleaner: `TurnService`, `PortraitService`, `TradeService`, `AppearanceService`, `MaintenanceService` behind a thin facade with a shared operation lock. Medium; 3-5 days.
- `TurnCoordinator.runTurn` (160-line async generator, ~14 locals, diagnostics interleaved): cleaner is a pure `runStages()` returning a typed plan with diagnostics as a decorator. Low-medium; 2-3 days.
- `stages/authorization.ts::authorizeTurn`: parsing, dedupe, three derived-proposal generators, trade split and debug emission in one function. Cleaner: parse, dedupe, derive, decide, veto as pure functions. Medium; 2 days.
- `narration-audit.ts` (666 lines), `narrated-captives.ts` (543), `person-offers.ts` (374): regex grammar parsing and policy decisions mixed. Cleaner: parse (claims) vs judge (policy). Medium; 4-6 days.
- `context-builder.ts::buildTurnContext` (~95 lines): see CTX-7. Medium; 2-3 days.
- `src/ui/client.js` (1,171 lines, one file, untyped, global mutable state): UI debt.
- Provider/style knowledge leaking into domain: `context-budget.ts` imports app provider config; views import `RAENA_IMAGE_STACK`; `campaign/portrait-prompt.ts` holds style text and `portrait-prompt-v2-anime`; structured-output dialects embedded in schemas. Low; 0.5-2 days each.

## 10. Providers and LLM integration

Audit C domain 3. Topology verified in code (docs match): Narrator `z-ai/glm-5.2` pinned to route `z-ai/fp8`, no fallbacks, 60 s attempt, reasoning disabled; Controller `openai/gpt-6-luna` with native fallback `anthropic/claude-haiku-5.5`, 20 s, `require_parameters: true`; mannerism extractor Luna, no fallback; reflection locked to `claude-haiku-5.5`, only when `CALDREVAN_REFLECTION_MODE=shadow`; compressor off by default; sprite QA `claude-haiku-5.5`; images `Qwen/Qwen-Image` + Raena LoRA on `fal-ai` via the Hugging Face router, billed to `HF_TOKEN`; embeddings (Voyage) not wired in production. Retry: 2 attempts, 250-500 ms backoff, 120 s per-turn budget shared by Narrator, Controller and revision.

| ID | Sev | Finding | Action | Effort |
| --- | --- | --- | --- | --- |
| PRV-1 | P2 | Narrator is a single point of failure with no parameter guarantee (no `require_parameters`; if the pinned endpoint ignores `reasoning.enabled:false`, hidden reasoning consumes 512 tokens, `finish_reason: length`, non-retryable `invalid_provider_response`). An outage fails every turn. | Count `finish_reason_length` per model; consider `require_parameters`; offer a user-triggered "retry with backup narrator". | M |
| PRV-2 | P2 | Controller fallback shares one 20 s window; production runs non-strict (`strict_output` unset), accepting "normalized" malformed output. | Telemetry on `normalization_used`/`model_fallback`; move to strict once low; longer timeout for fallback. | S-M |
| PRV-3 | P2 | `Retry-After` and `limit_source` are captured but ignored by backoff. | Honour `Retry-After` within the remaining budget. | S |
| PRV-4 | P3 | `OPENROUTER_REFLECTION_MODEL` is decorative: the adapter rejects any other model and the throw is swallowed (`game-session.ts:826-828`); setting it silently disables reflection. | Remove the variable or fail loudly at startup; make qualification a config table. | S |
| PRV-5 | P3 | Mannerism extraction has no fallback; bookkeeping continues during an outage until `bounded_skip`. | Stop queueing after N failures; surface extractor health. | S |
| PRV-6 | P3 | Overriding `OPENROUTER_NARRATOR_MODEL` silently drops the provider pin. | Document or warn. | S |
| PRV-7 | P3 | Dead or misnamed integrations: `llm/openrouter/image-client.ts` and `CALDREVAN_PORTRAIT_*` env vars, `deepseek-controller.ts` alias, V1 `openrouter/context-compressor.ts`, `MiniMaxNarratorProvider`/`minimax-narrator.ts` (generic adapter running GLM), `KIMI_/GEMINI_/MINIMAX_NARRATOR_MODEL` constants, Voyage embeddings and the semantic index (never wired), `src/llm/huggingface/` (really the fal image client). | RENAME narrator adapter; DELETE CANDIDATE image-client and alias after repointing tests; UNKNOWN for Voyage/semantic retrieval. | M |
| PRV-8 | P3 | Docs omit the `APIKEY.env` script credential convention, the 120 s budget and the 20/60/180 s timeout table. | Add a timeouts section to `CONFIGURATION.md`. | S |

Environment variables: all listed and accurate against `docs/CONFIGURATION.md`; none used in `src/` is missing from the doc.

## 11. Image generation

Audit C domain 4. Player and NPC+ share one path (`generateNpcPortraitBatch`): 3 parallel slots with distinct seeds, atomic commit, recovery (one retry with a new seed for a content refusal, one same-seed retry for transient errors), a 6-call cap per batch, gallery cap 64, appearance fingerprint staleness, adult-only.

| ID | Sev | Finding | Action | Effort |
| --- | --- | --- | --- | --- |
| IMG-1 | P1 | The minor gate blocks only `ageStatus === "minor"`; `unknown` age is allowed (`player-character-view.ts:123`) while romance treats unknown as not adult. Created NPCs often have no age; the 500-char description is sent as data; age parsing handles digits and a short word list only. | Require `adult` (parity with the romance gate), explicit adult confirmation for created characters, scan the description for minor wording and spelled-out numbers. | S |
| IMG-2 | P1 | No `AbortSignal` through `runSlot`/`generate`; no cancel; `boundedFetch` maps any abort to a retryable transient error (`image-generator.ts:86-95`); the client gives up at 360 s but the server continues, bills and commits. | Batch-level `AbortSignal`, distinguish `cancelled`, abort on shutdown and via a cancel endpoint. | M |
| IMG-3 | P2 | Timeouts do not cover body reads (`boundedFetch` clears its timer when headers arrive). | Keep the timer until the body is read. | S |
| IMG-4 | P2 | Progress UI is a timer, not progress: stage text is a function of elapsed time; the hint says "about a minute" while the server allows 180 s per call and two sequential calls per slot. | Stream real per-slot events. | M |
| IMG-5 | P2 | No thumbnails and no cache headers; the six canon avatars are 2.1-2.5 MB each (14 MB), served whole with `no-cache`; generated images served `no-store`; `readPortraitAsset` hashes every stored file of every character per request. | Generate a 256 px thumbnail at stage time; immutable cache headers (tokens are content-addressed); token map per revision; re-encode canon avatars (about 100 KB each). | M |
| IMG-6 | P2 | Item sprites are unbounded: up to 2 generations at 992x992 plus up to 2 multimodal QA calls per created item, concurrent, no budget, no cost record. | Concurrency cap, per-session ceiling, 256-384 px, record cost. | S-M |
| IMG-7 | P2 | Cost accounting is partial (successful versions only; failed, refused and retried calls invisible; no per-campaign total; LLM cost never aggregated). | `image_calls` ledger plus running totals. | M |
| IMG-8 | P3 | Appearance fields mix narrative and visual text; raw `weight_kg`/`height_cm` go into the prompt. | A `visual_description` field; descriptors instead of numbers. | S |
| IMG-9 | P3 | The shared `calls >= 6` counter can misreport a slot's failure reason. | Per-slot cap plus batch cap. | S |
| IMG-10 | P3 | Unfinished reference-image feature: upload path exists, nothing consumes it; OpenRouter image client unreferenced. | Implement img2img or remove the upload UI and field. | S-M |
| IMG-11 | P3 | LoRA url and style pinned in source (`image-stack.ts`). | Move to `config/`. | S |
| IMG-12 | P3 | A gallery of 64 versions per character has no global quota. | Disk quota reporting. | S |

## 12. UI/UX

Audit D part 1 (static review; see section 0). 50 findings; the actionable ones:

| ID | Class | Sev | Finding and recommendation |
| --- | --- | --- | --- |
| UI-1 | ACCESSIBILITY / BUG | P2 | Drawer Tab trap cycles only close and the two tabs (`client.js:707-713`); Promote, Edit NPC+, Generate and Upload are unreachable by keyboard. Compute the focus list at keydown (as the lightbox does) or make `<main>` `inert`. |
| UI-2 | USABILITY | P2 | "Accept offer" (irreversible: gold, possibly a person) is an unstyled default button with no confirm; `trade-buy`/`trade-sell` classes have no CSS. One visual rule for "commits authoritative state": filled primary with the price in the label, distinct BUY/SELL border colours, inline Cancel/Confirm for person purchases; document in `UI.md`. |
| UI-3 | USABILITY | P2 | Promote is a bare up-arrow glyph, visually weaker than "Edit NPC+". Use a text button "Promote to NPC+" with a "Heartstone household rite" subline; reserve the filled style for Send and Accept. |
| UI-4 | PERFORMANCE | P2 | `/api/session` returns the whole transcript every call; 1 s polling during a turn, a 4 s save poll forever including background tabs; the DOM never trims. Poll with `after=<n>`, pause when `document.hidden`, collapse older exchanges or `content-visibility:auto`, skip unchanged sidebar rebuilds. |
| UI-5 | BUG | P2 | `/location` with a stale revision reports "The turn was discarded" though no turn ran (`game-session.ts:314`); the client ignores the server's `candidates`. Custom message and show candidates. |
| UI-6 | USABILITY | P2 | Editor revision captured on open; any intermediate commit (sprite metadata) makes Save/Generate fail and recovery loses typed edits. Portrait actions should send `currentRevision`; auto-retry once with the latest revision. |
| UI-7 | POLISH | P3 | Sidebar and Household lists are unbounded (20+ characters): cap at ~8 rows with "+N more". |
| UI-8 | RESPONSIVE | P3 | Long names lack `min-width:0` / `overflow-wrap:anywhere` in `.scene-participant`, `#character-name`, `.household-member` (static). |
| UI-9 | POLISH | P3 | `#location-id` prints the raw internal id (`calderan_slave_market`) to the player. |
| UI-10 | POLISH | P3 | Gold is a bare integer; add `Intl.NumberFormat` and the unit. |
| UI-11 | POLISH | P3 | Disabled World/Debug nav and Personality/Relations tabs cost header width; hide until built. |
| UI-12 | POLISH | P3 | Dead CSS: `.top-bar nav button:last-child` matches nothing; bare `article{grid-template-columns:100px ...}` hits every article. |
| UI-13 | CONSISTENCY | P3 | Three CSS dialects in `style.css`; undefined variables (`--panel`, `--danger`); hard-coded hex colours that should be tokens. |
| UI-14 | POLISH | P3 | Player `*action*` and speech look alike; apply the narration/dialogue colours inside `.player`. |
| UI-15 | ACCESSIBILITY | P2 | `#conversation` is `role="log" aria-live` and streaming does `replaceChildren` per token, so screen readers announce partial text. Draft bubble outside the live region. |
| UI-16 | USABILITY | P3 | "Regenerate with..." spends credits, appears under every narrator message, is undocumented, shows a raw `failure_code`. Gate behind a Debug toggle. |
| UI-17 | CONSISTENCY | P2 | Unknown identity decided by client string compares in three places and a server-fabricated "Unfamiliar household member" label in a dead legacy `household` payload; the category string can be "Met this campaign · name unknown" and miss the exact-match. Expose one boolean and a server-built `initial`; delete the legacy field. |
| UI-18 | CONSISTENCY | P3 | Player editor heading upper-cased, NPC headings not. |
| UI-19 | USABILITY | P3 | "Generate" and "Edit NPC+" both just open the editor. Rename to "Portrait editor". |
| UI-20 | PERFORMANCE | P3 | `renderInventory` rebuilds the grid per keystroke and per 2 s poll; fine to ~200 items. Debounce, key nodes by item id. |
| UI-21 | USABILITY | P3 | Head/Boots permanently "Empty" read as forgetfulness (ITM-1). Hide or label "No such item category yet". |
| UI-22 | USABILITY | P2 | Receipts are a client array re-appended after the newest narrator message on every render, drift down the chat and vanish on reload. Render once as a persistent server transcript entry at the point of the deal. |
| UI-23 | USABILITY | P3 | No reason shown when Accept is disabled during a turn; add `aria-describedby`. `.trade-label` (0.7rem, opacity .7) likely under 4.5:1 (static). |
| UI-24 | POLISH | P3 | Developer copy in production ("Check that npm run play:ui is running"); save failures go only to the hidden composer error. |
| UI-25 | USABILITY | P3 | Delete confirm looks like Cancel and does not say it is a soft delete. |
| UI-26 | ACCESSIBILITY | P3 | `switchView("play")` always focuses `#household-nav`; drawer tabs have no roving tabindex or arrow keys; the page behind drawer/lightbox is not `inert`; Escape works only with focus inside; the save button is an emoji; 18 declarations use 10-11px text. |
| UI-27 | USABILITY | P3 | The composer hint says "/ for commands" but only `/location` exists. |
| UI-28 | RESPONSIVE | P2 | At <=720px two scroll contexts and a soft-keyboard problem (`.story{height:75dvh}`); the 390px header wraps to >=90px; `.campaign-screen` overlaps the header (`inset:58px`); the editor stacks 15 fields and four prompt textareas. Bottom tab bar, "Scene" bottom sheet, prompts in `<details>`. (static) |
| UI-29 | CONSISTENCY | P3 | Logic duplicated in client JS instead of consuming facades: `dayLabel(minute)` vs server `date_text`; `NUMBER_RANGES` duplicating server validation; portrait eligibility text; raw status enum text; Accept enablement recomputed. Server should expose `date_text`, field ranges, `delete_blocked_reason`, `status_label`, `accept_blocked_reason`. |
| UI-30 | PERFORMANCE | P3 | Browser check scripts hard-code `/home/user/Calderan_RPG/.build`, `/opt/node-tools/...`, `/tmp/claude-0/browser/`; Playwright is not a devDependency. Parameterise. |

Answers to the audit questions: *Is it obvious which actions mutate authoritative state?* No (UI-2, UI-3). *Are ACCEPT and Promote distinguishable?* Only by location and wording. *Does the sidebar scale to 20+ characters?* Not designed for it (UI-7, UI-8). *Is unknown identity consistent?* Structurally masked server-side, string-matched client-side (UI-17). *Are loading states truthful?* The turn states are ("Draft", "Revising"); image progress is a timer (IMG-4). *Are errors actionable?* Accept errors yes; `/location` and developer copy no (UI-5, UI-24). *Mobile?* Usable but cramped (UI-28). Positive findings to preserve: opaque refs and revision guard on every mutation, no price/subject on the wire for trade, tier capabilities omit controls, text+icon (not colour alone) for BUY/SELL, honest generation timeout copy, CSP and loopback host check. No obsolete server route was found: every route has a caller.

## 13. Tests, dev tooling and repository hygiene

Audit E. 1,863 tracked files; 318 `.ts` files in `src`; `src/dev` is 91 files; 192 `*.test.ts` files plus 24 helpers and about 2,048 `test()` calls; 31.7k lines of tests. Production `src` is clean of TODO/FIXME/HACK, commented-out code and debug logging.

### 13.1 Repository and dead code

| ID | Item | Class | Sev | Action |
| --- | --- | --- | --- | --- |
| REPO-1 | `saves/` is gitignored but 310 files (about 11 MB, five `d09-*` evidence dirs, 17 `.log` files) are force-tracked; the same directory is the runtime campaign store. | ARCHIVE | P2 | Move cited evidence to `docs/evaluations/`, `git rm --cached -r saves/`, add a check that nothing under `saves/` is tracked. At minimum delete the `.log` files (about 3.5 MB). |
| REPO-2 | 33 root `.md` pass reports plus `longplaytrough_transcript.txt` (typo) and `playtrough_example/` (typo). Only `README.md` and `DEBT_REGISTER.md` are live. | MOVE / ARCHIVE | P2 | Move into `docs/history/`; rewrite the links in `docs/README.md`. |
| REPO-3 | `docs/evaluations/` holds 570 files (27 MB): 101 runnable `.mjs`, 221 json, 32 jsonl, 16 png outside any build. The 2026-10-03 cleanup (1,164 to 667 files) has been reversed. | ARCHIVE | P3 | Separate evidence from reports; consider a release tarball. |
| REPO-4 | 23 `src/dev` files with no importer, test, package script or script reference (listed in audit E §1); about 37 more reachable only through tests or scripts. | ARCHIVE / MOVE | P3 | Split `src/dev` into `tests/support` (fixtures), `tools/` (live and bench), delete orphans; keep it out of the production typecheck. |
| REPO-5 | Eight `src/dev/reflection-*` files are near-verbatim copies of `src/turn/structured/*` (about 1,230 duplicated lines, 2-8 differing lines per pair). | MERGE | P3 | Delete dev copies and repoint tests; collapse the version-stacked validators. |
| REPO-6 | 40 `scripts/*.mjs` (25 live, 15 offline), none in `package.json`; `scripts/tests/*.test.mjs` is not run by `npm test`. Keep `actual-offer-browser-check.mjs`, `explicit-promotion-browser-check.mjs`, `minor-debt-offline-guard.mjs`. | ARCHIVE | P3 | Archive the rest with their evaluation docs. |
| REPO-7 | `data/canonNPCAvatar/*.png` 14 MB and `city_map.png` 4.2 MB. | KEEP BUT DOCUMENT | P3 | Re-encode while keeping filenames (registry and tests pin them); see IMG-5. |
| REPO-8 | About 11 values with zero uses (`resolveMovement`, `DESTINATION_END`, `describeDate`, `describeClock`, `rivalsOf`, `isOverridden`, `hasOverrides`, `promotedLabel`, `PLAYER_ADULT_ONLY`, `UI_PLAYTEST_LOCATION`, `HEARTSTONE_KEEPER_ACCEPTANCE`, `PORTRAIT_KINDS`, `REVELATION_YEAR`, `TradeBlock`); 5 unused locals in production. | DELETE CANDIDATE | P3 | Verify no doc depends on them, delete, enable `noUnusedLocals`. |
| REPO-9 | Compatibility shells: `turn/sentences.ts` and `deepseek-controller.ts`, imported only by tests. | DEPRECATE | P3 | Repoint tests, delete. |
| REPO-10 | Test-infrastructure in `src/dev`: `turn-fixture.ts` (54 test importers), `turn-services.ts`, `scene-state-fixtures.ts`. | MOVE | P3 | To `tests/support/`. |
| REPO-11 | `DEBT_REGISTER.md` (root) is stale: it names `qwen/qwen3.8-flash` as production controller, a Gold/Silver P8 currency, and a 2026-10-06 date, and claims to be maintained. | UNKNOWN | P3 | Superseded by this register; a banner was added (section 15). |

### 13.2 Dependencies and toolchain

- Runtime dependency: `yaml ^2.9.1` only (used by `src/world/loader.ts`, `src/economy/economy.ts`, 4 tests). Dev: `typescript ^5.9.3`, `@types/node ^22.20.4`. Lockfile consistent. **No unused or duplicate dependencies.** `engines.node >=22` allows Node 24+ against 22 types.
- `tsconfig`: strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, NodeNext. Missing `noUnusedLocals/Parameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`. `include` covers `src` and `tests`, so `npm run build` compiles tests and `src/dev` into `.build`, which is never cleaned (stale compiled tests of deleted files keep running locally).
- A checkout without `npm ci` fails with TS2688 and the first error masks the rest.

| ID | Sev | Finding | Action |
| --- | --- | --- | --- |
| CI-1 | P2 | No CI, lint, formatter, coverage or browser runner (`.github` absent). | CI running `npm ci`, typecheck, build, test; add ESLint and a formatter only if wanted. |
| CI-2 | P3 | `.build` never cleaned; `npm test` globs flat. | `rm -rf .build` in `build` or a `clean` script. |
| CI-3 | P3 | `eval:playthrough` and `inspect:turn` both call `eval-hardening.js`; 18 of 25 npm scripts are dev CLIs. | Deprecate the legacy playthrough tooling. |

### 13.3 Test suite

| Type | About | Notes |
| --- | --- | --- |
| Unit and domain | 95 files | campaign state, item domain, calendar, weather, search, persistence, canon |
| Integration through `TurnCoordinator` (scripted providers) | 45 | `person-offer-e2e`, `household-turns`, `movement-follow-*`, `npc-plus-pass-*` |
| UI/server (fake DOM via `vm.runInNewContext` of `client.js`) | 10 | `ui-v1` (1,006 lines), `portrait-gallery` (782) |
| Deterministic scenario/golden | 6 | `turn-pipeline-golden`, `scene-state-foundation`, `playthrough` |
| Historical replay unit tests | 4 | anchors, comparator, regressions |
| Bake-off/benchmark unit tests with fake providers | 25 | |
| Live certification | 0 in `npm test` | live part is in `src/dev/*-live*.ts` and `scripts/` |

| ID | Sev | Finding | Action |
| --- | --- | --- | --- |
| TEST-1 | P2 | Flaky `generation lifecycle (player\|npc, fullbody)` (`tests/ui-v1.test.ts:957`): the test waits 1150 ms of real time and asserts "Generating…" / `/^[1-9] s$/`, but `client.js:289-312` refreshes that text from a 1000 ms `setTimeout` chain computed from `Date.now()`; the timer can fire at 999 ms, leaving "Request sent" / "0 s", and the next refresh comes after the assertion. Under 190+ parallel test processes the margin is ~150 ms. Both avatar and fullbody share the path; fullbody-only failures are incidental. Cause from reading, not reproduced. | Inject a clock into `client.js` or use `mock.timers`; never assert exact second boundaries on real time. |
| TEST-2 | P3 | 14 files assert on `src` source text (`ui-v1`, `canon-avatars`, `narrator-alternatives`, ...), e.g. `schema_version: 6;` appears in `types.ts`. | Behavioural schema tests, or keep as an explicit architecture-guard suite. |
| TEST-3 | P3 | 85 of 192 test files import `src/dev/*`; 40 are named after delivery passes (`npc-plus-pass-1..10`, `p3x`). | Move fixtures; rename by domain. |
| TEST-4 | P3 | Stale tests for obsolete architecture: 8 version-stacked reflection validators, bake-off helpers, Voyage, OpenRouter image client. | Merge/archive after the PRV-7 decisions. |
| TEST-5 | P3 | Real wall-clock waits (`ui-v1`, `provider-retry-h5`). | Fake timers. |
| TEST-6 | P2 | Weak coverage: true concurrent double-accept; accept after loading an older autosave; end-to-end "N companions move and persist across save/load"; real older-schema save fixtures (only synthetic); real-browser behaviour; malformed POST bodies on `/api/trade/accept` and `/api/location`; property tests for `save-format` and `character-movement`; performance regression guard. | Add; most belong in the modern benchmark. |
| TEST-7 | P3 | Deterministic tests use `mockNarrator`/`mockController`; real `createProductionDeps`, prompt wording, provider JSON, streaming and fallback ordering are covered only by fake `fetch` and manual live scripts. | Recorded-LLM replay layer (L2 of the benchmark). |
| TEST-8 | P3 | Test timing not measured (no deps in the audit sandbox). | Measure with the spec reporter once deps exist. |

## 14. Historical replay and the modern benchmark

Audit E sections 5 and 6.

**Historical replay is no longer a valid certification gate.** It feeds 421 historical player messages through live models with no explicit actions, so it cannot call Accept, Promote, location confirmation or mid-run load. Its oracle expects an in-turn person sale and rite-driven membership. A replay today would fail A-02, B-02, B-04, C-02, C-04 by construction. `payment_gap` and `handover_gap` are **obsolete**: payment never commits in the same turn as the offer. `isTransactionAct` survives only in the replay harness. The `user_messages.txt` input is not in the repo, so the run cannot be reproduced from a checkout; it also writes into the repo (`docs/evaluations/historical_replay/`, `saves/historical_replay/`).

| Keep | Obsolete |
| --- | --- |
| `summarizeSnapshot`/`turnState` (compact snapshot digests), `parseHistoricalMessages`, resume logic, the anchor-validation idea, `tests/playthrough/curated.json` fixtures (narrator-text-only, unaffected by explicit actions), `historical-windows.json`, the frozen oracle and reports as history | `payment_gap`/`handover_gap`, the 32-check oracle as a gate, `location_assists.json`, `iteration_*`/`probes` data, `replay-hardening.ts`, `replay-organic-discovery.ts`, `replay-stage-b.ts`, `eval-hardening.ts` |

Classification: DEPRECATE as a gate; ARCHIVE after extracting the digest helpers. Historical reports are not modified.

**Modern benchmark requirements** (not built). Principles: every step is an event of three kinds (`player_message`, `ui_action` calling the real `GameSession` method or route, `system` such as save/load or provider failure); provider outputs are data (recorded or authored) replayed through mock providers offline and ignored in live mode; expected state deltas are structural (ids, counts, revisions, gold, possession, legal status, household, NPC+ set, location, knowledge), never prose; explicit negatives are first-class (perfect rite prose + Controller join changes nothing until the UI action); deterministic seed, clock and a canon fingerprint in the scenario header; offline budget under 30 s; all outputs checked through the view layer (masking, id leaks). Coverage matrix: player messages, Narrator output (price forms, captives, introductions, departures, rite prose, audit rewrite), Controller output (invalid and forbidden proposals, stale revision), UI actions (accept: double, stale, unaffordable, superseded, withdrawn, after load; promote: eligible, ineligible, stale; location override; appearance; portraits), save/load points with full snapshot equality and a frozen older-schema save, trade accepts (goods, bundle, person, supersession), NPC+ promotion (same id, one revision, leaves household yet stays NPC+), movement and group movement (single and multi follower, invitation accept or decline, persistence across save/load, no duplicates), identity disclosure and masking, items, household, canonical characters, negative and security cases.
Scenario format `caldrevan-bench/1` (JSON): `world` fingerprint, `start`, `providers` (recorded, live, hybrid), `steps[]` with late-bound refs (`@offer(s1)`, `@rev(s1)`, `@char(s2)`) and mandatory `expect`, and `final` digest. Layers: L0 pure domain; L1 scripted scenarios (under 30 s, in `npm test`); L2 recorded replay keyed by request hash (invalidated by prompt change, so a failure says "re-record"); L3 hybrid differential; L4 live certification. Delivery plan: extract the digest helpers, build the runner around `GameSession`, port the existing stories (Actual Offer, explicit promotion, travel safe-switch, follow matrix) as the first ten scenarios, add a 100-turn market-to-Heartstone campaign with explicit Accept and Promote steps, add a recorder to the live dev scripts, retire the replay. Full format and layering: audit E §6.

## 15. Documentation

Audit D part 2. Result of comparing the normative docs with the code: topology, schema versions, image sizes, gallery cap, time constants and Heartstone mechanics are correct; every relative link resolves. Stale or missing items found (D-1 to D-18 in audit D) and the disposition:

| ID | Item | Disposition |
| --- | --- | --- |
| DOC-1 | Test count 3205 (CURRENT_STATE, TESTING) vs 3278 | **Fixed** |
| DOC-2 | `POST /api/campaigns/delete` missing from UI_ENGINE_CONTRACT and UI | **Fixed** |
| DOC-3 | UI.md lacks `/location`, narrator alternatives, save indicator | **Fixed** |
| DOC-4 | Foreground canonical identity binding (d4e9e22) absent from ARCHITECTURE and CURRENT_STATE | **Fixed** |
| DOC-5 | TESTING says there are no browser checks; ACTUAL_OFFER test list and identity tests | **Fixed** |
| DOC-6 | UI_ENGINE_CONTRACT reflection-model default wrong | **Fixed** |
| DOC-7 | P8 economy undocumented in normative docs; silver anchors vs gold settlement | **Fixed** (CURRENT_STATE, CONFIGURATION) |
| DOC-8 | Six alternate narrator ids undocumented | **Fixed** (CONFIGURATION) |
| DOC-9 | `/assets/items/` template tier documented as existing but is a stub | **Fixed** |
| DOC-10 | ROADMAP and CURRENT_STATE rows for identity binding, person offer, deletion, P8 | **Fixed** |
| DOC-11 | docs/README evaluation list and root-report list | **Fixed** (links to this register and roadmap added) |
| DOC-12 | `ACTUAL_OFFER.md` §6 claims goods trades "record the transaction" | **Open** (see TRD-11) |
| DOC-13 | `CANON_OVERVIEW.md` §10 author-only spoilers inside an indexed normative doc | **Open** (a move; needs a decision) |
| DOC-14 | Root `DEBT_REGISTER.md` stale | **Banner added** |
| DOC-15 | No freshness check: three commits left the set stale in one day | **Open**: link-check and staleness tripwire test |
| DOC-16 | Docs taxonomy: root pollution, evidence beside reports, superseded families at docs root | **Open**: target layout below |

Proposed taxonomy (nothing moved): `README.md` only at root; `docs/README.md`; `docs/current/` (NORMATIVE); `docs/architecture/`, `docs/world/`, `docs/authoring/`, `docs/schemas/` (ACTIVE); `docs/history/{reports,superseded,phases}/`; `docs/evidence/` (raw dirs, json, jsonl, mjs, `saves/d09-*`); `docs/media/`. Steps: relocate `saves/d09-*` and rewrite the D09 doc paths; move the 31 root reports and rewrite the links; add `docs/evidence/README.md` (never edited, never imported); add `tests/docs-links.test.ts` plus a staleness tripwire; archive the 27 MB of evidence as a release tarball if clone size matters.

## 16. Decisions needed from the author (canonical list, reconciled 2026-10-12)

One list. **D1 to D10** are the audit decisions with their current status; **D11 to D20** are the architecture decisions required (A to J of the post-consolidation review). Nothing is duplicated: where the earlier text and the new text overlap, the row below is authoritative.

| # | Decision | Status / recommendation |
| --- | --- | --- |
| D1 | Companion movement and escort | **ANSWERED.** No persisted party; derived per turn. Narrow held-person escort approved and implemented (block 3). Free-people and unnamed forms stay unresolved by design |
| D2 | Draft preview (PIPE-1): keep streaming with a leak filter, or neutral state | DECIDED in block 4 per the recommendation: neutral status words only, no fake streaming; the final audited prose appears once |
| D3 | Currency unit (ECO-1) | OPEN. Recommend integer silver internally, display G/S (schema 7) |
| D4 | NPC+ who leaves the household (NPC-1/2) | Direction: **inactive plus rejoin plus badge** (not yet confirmed or implemented) |
| D5 | Can a canonical NPC become a campaign record / NPC+ (NPC-3, ID-8) | OPEN. Decide before Property |
| D6 | `premium_*` rename (NAME-1) | **Deferred**, to be done as a clean schema migration (symbols now, key at the next schema bump) |
| D7 | Manumission as an explicit action (AUTH-1) | **Implemented (block 5A)**: Class C through a PendingConfirmation card |
| D8 | Voyage embeddings, semantic index, OpenRouter image client | **Folded into D13**; remove the image client, park the rest |
| D9 | Reference-image feature (IMG-10) | OPEN. Recommend remove the upload UI until needed |
| D10 | Repository cleanup depth (REPO-1..3) | OPEN. Do REPO-1 now, the rest with the docs taxonomy |
| D11 (A) | Reflection: core, shadow or remove | Recommend **SHADOW only**; delete dev copies, collapse version-stacked validators. Trade-off: forgoes a speculative feature |
| D12 (B) | Mannerism: core, shadow or remove | Recommend **optional active**, the one adaptive system; side-store the journal and move bookkeeping off the response path. Trade-off: needs the split |
| D13 (C) | Semantic retrieval: runtime, optional, tools or remove | Recommend **park in `tools/`**; lexical retrieval stays the production path |
| D14 (D) | Sprite generation / QA | Recommend an **optional side service**; QA reviewer **off by default**, remove if sprites stay acceptable |
| D15 (E) | Narrator max output | Recommend **768** now (with detection); 1024 only if p95 output exceeds about 600 tokens or truncation stays above about 1 percent |
| D16 (F) | Truncation recovery | Recommend **constrained regeneration once**; probe continuation before adopting it |
| D17 (G) | NarrationFacts timing | Recommend after the L1 benchmark (A8), **movement/follow slice first**, then price/offers, then names |
| D18 (H) | Targeted verifier | **Allowed later**: bounded enum output, only on ambiguity markers, behind a flag, after the ambiguity rate is measured; never a default always-on pass |
| D19 (I) | Action classes requiring confirmation | Classes A/B/C (section 1C.2); manumission to C; character creation needs a retire/merge path |
| D20 (J) | Optional service state | Recommend **side stores**, not `CampaignState`; promoted mannerisms stay authoritative |

## 17. Suggested fix order (audit-time; superseded by Wave A in the Master Roadmap)

1. **Wave 0, hygiene and safety (small, independent):** IMG-1, TRD-1, TRD-2, PIPE-2, REV-3, ID-2, UI-1, UI-5, TEST-1, REPO-1, CI-1, CI-2.
2. **Wave 1, correctness core:** MOV-1 with ID-1 (one change), PIPE-1 with CTX-1/CTX-2, AUTH-1, TRD-1b, TRD-3/TRD-4 (shared price extractor with a corpus), REV-2.
3. **Wave 2, durability:** PER-1, PER-2, PER-4/PER-5, REV-1/PER-3 (side store for media state), PIPE-3/PIPE-4/PIPE-9.
4. **Wave 3, product decisions:** ECO-1, NPC-1/NPC-2, AUTH-2, NAME-1 and PER-6 together in the next schema bump.
5. **Wave 4, structure:** `NarrationFacts` extractor (PIPE-5), `GameSession` decomposition, `PersonIdentity` read model, `ControllerView`, UI bundle (UI-2..4, UI-17, UI-22, UI-28), modern benchmark, repo and docs taxonomy.

The order of the product roadmap (Weather UI, Property) is in the [Master Roadmap](MASTER_ROADMAP.md).
