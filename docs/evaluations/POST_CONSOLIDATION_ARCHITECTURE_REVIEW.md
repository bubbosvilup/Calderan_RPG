# Post-consolidation architecture review

Date: 2026-10-12. Base: main `31d82cd` (branch `claude/project-thread-gfj7p8`, working tree clean at start). `npm run typecheck` clean; last recorded `npm test` **3334/3334** (consolidation block 3). Documentation and review only: no source change, no live provider call, no commit, no push.

Method and limits. Read in full: the debt register, the roadmap, CURRENT_STATE, ARCHITECTURE, ROADMAP, TESTING, `architecture/ACTUAL_OFFER.md`, and the block 2 and block 3 reports (block 1 has no standalone report; its record is the register annotations and CURRENT_STATE). `TURN_COORDINATOR.md`, `NARRATIVE_AUTHORITY.md` and `EVIDENCE_AUTHORIZATION.md` were read by structure and the sections that matter here, not line by line. Three read-only inventories (model-facing subsystems, text readers, H1 and truncation) were produced by delegated readers; every figure that drives a decision was re-checked against the code by me (called out below as "verified"); the rest is marked "reader-reported". Nothing was run live. Counts of lines and files are approximate.

## 1. Executive verdict

The authority core is sound and the three consolidation blocks closed the correctness bugs that were reachable in normal play (SELL hole, price parsers, offer identity, companion movement, identity fork). What is **not** sustainable for a single maintainer is the shape of what surrounds that core:

1. **Interpretation layer.** About 32 independent modules each own a regex grammar over player or narration text (about 43 detectors counting the narration audit's). Movement, follow, departure, arrival, price, name and item vocabularies are each declared four to seven times. Every recent block had to touch several grammars plus their audit twin (block 3 changed five call sites and an existing test oracle). This is **ARCH-2**: the scaling problem is already visible, though no precise limit can be claimed.
2. **Optional intelligence is entangled with the authoritative core.** Mannerism learning (on by default), item-sprite generation, portrait batches and, when enabled, reflection all commit through the same `CampaignState` revision stream and share the `GameSession` status machine. Disabling any of them does not break correctness (verified by reading), but *enabling* them delays the HTTP result, bumps the revision (stale UI clicks), or blocks turns (`#portraitBusy`). This is **ARCH-1**.
3. **A real, frequent, unmeasured reliability loss.** The Narrator is capped at 512 output tokens; a `finish_reason=length` is a non-retryable failed turn and the finish reason is not recorded in production traces. The reported rate of about one lost turn in 18 is **an unmeasured product observation**; no narrator truncation rate exists anywhere in the repository.

Verdict: **sustainable with a planned consolidation wave; not sustainable if product systems (Property, quests, combat) add more grammars first.** Recommendation: Stabilization, then Architecture Consolidation (Wave A, section 19), then product expansion. Weather UI may proceed in parallel. Property should wait. No rewrite is proposed.

## 2. Current open-debt ranking (top 20, re-evaluated on current code)

Severity was re-judged, not copied. "Was" is the audit rank.

| # | ID | Sev | Item | Change vs audit |
| --- | --- | --- | --- | --- |
| 1 | PIPE-1 / CTX-2 | P1 | Unaudited Narrator draft streamed to the browser; secrecy rests on prompt rules and a post-hoc regex audit | was 2; now the top P1 |
| 2 | AUTH-1 | P1 | Manumission from regex on raw player input, no confirmation (irreversible) | was 4 |
| 3 | NARR-1 (new) | P2 high | Narrator 512-token cap; length truncation is a lost, non-retryable turn; `finish_reason` not recorded | new; frequency-driven (about 1/18 reported, unmeasured) |
| 4 | AUTH-2 | P1 | Permanent character creation from narration, no retire or merge | was 7 |
| 5 | ARCH-1 (new) | P2 high | Optional intelligence coupled to the authoritative core (revision stream, response path, status machine) | new; absorbs REV-1, PIPE-3, REV-3 |
| 6 | REV-2 | P2 | `/api/turn` has no idempotency key; prerequisite for any in-turn recovery | was 15; raised |
| 7 | PIPE-2 | P2 | Post-commit publication can throw after the commit | was 11 |
| 8 | ARCH-2 (new) | P2 structural | Regex-per-feature interpretation architecture | new; absorbs PIPE-5/6/7 |
| 9 | PER-1 | P2 | 16 MB cap makes autosave permanently fatal; drivers include unpruned `trade_offers` (TRD-12) and `mannerism_learning` | was 13; raised (learning journal is on by default) |
| 10 | PER-2 / ID-2 | P2 | Scene participants lost on load; ephemeral ref counter restarts; ID-1 guard covers held and household people only | was 19/20 |
| 11 | ECO-1 | P2 | Gold-only settlement vs silver-denominated anchors (decision pending) | was 9 |
| 12 | IMG-2 | P2 | Image batches uncancellable (cost and UX, no state damage) | was 6 (P1); **downgraded** |
| 13 | TRD-11 / TRD-12 | P2 | No goods ledger; unpruned `trade_offers` | open by decision |
| 14 | CTX-1 | P2 | Internal ids reach the Narrator; boundary-less masking regex | was 17 |
| 15 | TEST-1 + CI-1 | P2 | Flaky lifecycle test on a real timer; no CI | was 28/29; raised (it erodes trust in a 3334-test gate) |
| 16 | Context scaling: PIPE-9, PIPE-10, CTX-3, PIPE-4 | P2 | Budget excludes retrieval; retrieval failure fails the turn; Controller envelope unbudgeted; `getView()` rebuilds the prompt | grouped |
| 17 | NPC-1 / NPC-2 | P2 | NPC+ who left cannot rejoin; behaviour-activity undecided | was 21 |
| 18 | REPO-1 + PER-4/PER-5 | P2 | 310 tracked files under gitignored `saves/`; migration chain split; additive fields without a schema bump | grouped |
| 19 | UI bundle 1: UI-1, UI-2, UI-3, UI-15 | P2 | Keyboard reachability, Accept/Promote language, live region | was 22/23 |
| 20 | MOV-4 residual | P3 | Escorted person narrated as staying behind is not audited (state follows the player's act; Narrator is told) | **reduced from P2 to P3**; bounded and visible |

Closed since the audit and removed from the list: IMG-1, TRD-1, TRD-2, TRD-1b, TRD-3, TRD-4, TRD-5, TRD-10 (offline; TRD-1b and TRD-10 also live), MOV-1, MOV-3, MOV-4 (core), ID-1, MOV-2 (narrow form). Still open by decision: TRD-11, ECO-1.

## 3. Fixed findings from blocks 1 to 3

| Finding | Status | Commit | Residual |
| --- | --- | --- | --- |
| IMG-1 | fixed offline (age no longer gates portraits, user decision) | `4b8fdc9` | none; decision recorded |
| TRD-1 | fixed offline (`item_not_owned`, rechecked at Accept) | `4b8fdc9` | custody and loan states (ITM-3) |
| TRD-2 | fixed offline (offers rechecked on delivered text) | `4b8fdc9` | no dedicated live run |
| TRD-1b | fixed, live-certified (SELL transfers the same item; external custody for anonymous buyers) | `5edcd37` | no merchant stock or wallet by design |
| TRD-3, TRD-4 | fixed offline (one grammar, `trade-price.ts`); unit is a number-attached coin | `5edcd37` | silver and copper recognised but settled in gold only (ECO-1) |
| TRD-5 | fixed offline (offer identity is a terms digest) | `5edcd37` | none |
| TRD-10 | fixed, live-certified (standing offer guards narrated payment) | `5edcd37` | production phrasing varies |
| MOV-1 | fixed, live-certified (held, household and named-invitee followers) | `31d82cd` | none known |
| MOV-3 | fixed (one derived predicate `followCandidates`) | `31d82cd` | remaining `activeNpcPlus` uses are authored-NPC+ location authority, departures, contracts |
| MOV-4 | fixed (audit parity); residual reduced to P3 | `31d82cd` | inverse audit |
| MOV-2 | closed only in the narrow deterministic escort form | `31d82cd` | free people, unnamed, plural, pronoun forms unresolved by design |
| ID-1 | fixed for held persons and household members | `31d82cd` | look-alike detection for unnamed people not built |

## 4. Model-facing subsystem inventory

Facts about wiring were re-checked in `production.ts`, `play.ts`, `game-session.ts` (`#postTurn`, `submitPlayerInput`) and `campaign-state.ts` (verified); line and test-file counts are reader-reported and loose.

| Subsystem | Class | Runs in the real UI? | Model / provider | Where it runs | Authoritative revision impact | Disabling it changes core correctness? | Demonstrated value |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Narrator | **CORE** | yes | `z-ai/glm-5.2`, pinned route `z-ai/fp8`, no fallback, 512 tokens | every turn (second call on audit revision) | none directly | it is the game | the product |
| State Controller | **CORE** | yes | `openai/gpt-6-luna`, fallback `claude-haiku-5.5` | every turn, blocking | proposals only; the one turn commit | it is the game | evidence-authorized state |
| Portrait / image generation | **OPTIONAL ACTIVE** | yes (user click) | fal `Qwen-Image` + Raena LoRA via Hugging Face (`HF_TOKEN`) | on click; 3 slots, up to 6 calls | `record_portrait_batch`, `set_portrait_*`, `delete_portrait_version`: one revision each | no | high (player visuals, NPC+ avatars) |
| Item sprite generation | **OPTIONAL ACTIVE** | yes (every created item) | same fal stack, 992x992 | background after a turn, up to 2 rounds | `set_item_sprite` pending then ready/failed plus `enrich_item_visual`: about 2 revisions per item | no | moderate; cost unbounded (IMG-6) |
| Sprite QA reviewer | **DEPRECATED CANDIDATE** | yes (inside sprite jobs) | `claude-haiku-5.5` multimodal, no retries | per sprite round | folded into the sprite commits | no | unproven; a second model on a cosmetic path |
| Mannerism extraction / learning (D10) | **OPTIONAL ACTIVE** (on by default) | yes | `openai/gpt-6-luna` | post-turn, awaited; model call every 4th finalized turn | `maintainMannerisms`: a bookkeeping commit on **every eligible turn** plus a batch commit; promoted mannerisms land in `premium_characters[].mannerisms` | no (off by a code option only; no env switch) | calibrated live (D-10 closed); narrative utility not independently measured |
| D26 epistemic fidelity | **SHADOW / EXPERIMENTAL** | partly | none (deterministic tags and a shadow-mode portrayal gate) | per turn, read-only | none | no | diagnostic |
| Reflection (D09) | **SHADOW / EXPERIMENTAL** | **no** (`reflection_mode: "off"` hard-coded in `play.ts`) | `claude-haiku-5.5` when `CALDREVAN_REFLECTION_MODE=shadow` | post-turn, awaited | `record_reflection`, one revision | no | none shown to the player or the Narrator (`include_reflections:false`); utility unproven |
| D09 infrastructure (8 version-stacked validators, ~12 dev harnesses) | **REMOVE CANDIDATE** (dev copies, REPO-5) / **DEPRECATED CANDIDATE** (validators) | no | n/a | dev only | n/a | no | historical |
| Lossless context compaction | **CORE** (model-free) | yes | none | on demand and post-turn | none (session-local cache) | rejects turns with `context_too_large` if required and failing | high |
| V1 / optional compressor providers | **REMOVE CANDIDATE** | no (env-gated or unwired) | OpenRouter | n/a | none | no | none |
| Semantic retrieval (Voyage `voyage-4`) | **DEPRECATED CANDIDATE** (park in `tools/`) | **no** (`embedding_provider` never passed) | Voyage | retrieval | none | no (lexical retrieval is the production path) | never wired; D-22 untested live |
| Lexical retrieval | **CORE** (model-free) | yes | none | per turn when required | none | the Narrator loses canon grounding | high |
| NPC+ behaviour / prompt pack | **CORE** (deterministic) | yes | none | context build | none | NPC+ portrayal degrades | high |
| OpenRouter image client | **REMOVE CANDIDATE** | no (dead code) | `seedream` | n/a | none | no | none |

Coupling facts (verified): `submitPlayerInput` returns only after `#postTurn`, which awaits mannerism extraction (status `post_turn`, further input answers `turn_in_progress`); `#portraitBusy` rejects turns, saves, profile edits and portrait mutations while a batch runs; `finishPreparation` bumps the revision whenever the snapshot changed, so every learning, reflection, sprite and portrait commit is an authoritative revision.

## 5. Recommended core subsystem set

The proposition "only about 3 to 4 model-facing subsystems should be actively maintained as first-class runtime systems" **holds for this repository, with one refinement**: distinguish *first-class* (their failure or absence changes turn correctness, or they sit in the turn path) from *maintained optional services* (isolated, with a disable contract).

- **Core, first class (2):** Narrator, Controller. Everything that decides what is true.
- **Optional, maintained (2):** image generation (portraits **and** item sprites, one service, one provider), and **one adaptive system**.
- **Which adaptive system:** **Mannerism learning, not Reflection.** Mannerism is already on, has live calibration, and feeds the Narrator through deterministic cue lines. Reflection is off in the real UI, its notes never reach the Narrator or the player, and it carries about 1,500 lines of schema plus 8 version-stacked validators and a dozen dev harnesses for an unproven benefit. Both do **not** deserve permanent active runtime status; Reflection should be **SHADOW** (opt-in, diagnostic, never in the response path) and its dev duplicates removed.
- **Target active count:** **4** (Narrator, Controller, image service, mannerism). Today the real UI exercises **six model-facing call paths** (Narrator, Controller, mannerism extractor, portrait generation, sprite generation, sprite QA reviewer); the sprite QA reviewer is the first to cut.

## 6. Candidates to shadow, disable or remove

| Candidate | Action | Why |
| --- | --- | --- |
| Reflection (D09) | keep **shadow** only; delete `src/dev/reflection-*` copies and collapse version-stacked validators | off in the UI, unproven value, largest maintenance surface |
| Sprite QA reviewer | **disable by default**, then remove if sprites remain acceptable | second model on a cosmetic path; up to 2 extra calls per item |
| Semantic retrieval + Voyage | **park** in `tools/` | never wired in production |
| OpenRouter image client; V1 compressor providers | **remove** | dead code |
| Mannerism learning | keep **optional active**, but move bookkeeping off the response path and off the revision stream | on by default; commits every eligible turn |
| D26 | keep as deterministic shadow diagnostics | no model cost |

## 7. Regex-reader inventory

Counting rule (reader-reported): a module is an independent reader if it owns at least one regex or grammar of its own over player or narration text; orchestrators, type-only files and LLM-based modules excluded; the narration audit counts once. **About 32 independent readers; about 43 counting the narration audit's 12 sub-detectors.** The wiring of every listed module was not individually re-verified, so treat the count as 30 to 35.

Readers by text read:

- **Player input:** `player-travel`, `natural-actions`, `follow-invitation`, `follow-candidates` (escort), `character-movement.resolvePlayerCarry`, `person-transactions` (manumission), `item-intent`, `temporal-action`, `player-authored-events`, `canonical-interaction-targets`, `identity-request`, `transaction-acts`.
- **Narrator draft / delivered text:** `character-movement.narratedMovements`, `scene-departure`, `scene-participants`, `scene-participation`, `narrated-captives`, `name-establishment` (consumes `readScene`), `canonical-name-disclosure`, `foreground-binding`, `partner-identity-guard`, `person-offers`, `trade-authorization`, `trade-price`, `turn-evidence`, `evidence-authorization`, `household-evidence`, `character-contracts`, `physical-interaction`, `grounding-audit`, `background-grounding`, `mannerism-portrayal-gate`, `narration-audit`.

Concrete overlaps where one sentence class is read by several modules:

- **Movement / destination verbs:** at least six vocabularies (`character-movement` CARRY/WALK/TO, `player-travel`, `natural-actions` MOVE and DESTINATION_END, `scene-departure` DEPART_ACT, `narration-audit` NICCO_GO/ARRIVE/PLAYER_GO, `canonical-interaction-targets`). Authorization and the audit re-read the same draft sentences with different regexes; parity is by convention, not shared code (block 3 had to wire the shared candidate set into three audit calls by hand).
- **Follow:** `FOLLOW_VERB` in `character-movement`, `FOLLOWS_NICCO` in `scene-departure`, a verb stem list in `scene-participants`; the player's side is read by `follow-invitation`, `follow-candidates` and `canonical-interaction-targets`.
- **Destination phrases:** the TO-preposition list is declared in `character-movement` (several times), `player-travel`, `scene-departure` and `narration-audit`; resolution is shared (`resolveDestination`), extraction is not.
- **Price:** `trade-price.ts` is the single grammar for offers, but `grounding-audit` (its own PRICE), `narration-audit` (payment regexes) and `transaction-acts` (PRICE_TALK_CUE) remain separate readers.
- **Names:** `NAME_REQUEST` / `SELF_INTRODUCTION` are shared, but `narrated-captives` keeps a near-duplicate (ASK_NAME / OWN_NAME), and name establishment is split across `readScene`, `foreground-binding` and `canonical-name-disclosure`.
- **Hedge and negation:** `GATES` (about 18 gates, used in about 15 modules) is genuinely shared, but `trade-authorization`, `turn-evidence`, `evidence-authorization`, `temporal-action`, `item-intent` and `narration-audit` keep local hedge regexes.
- **Departures:** `narratedDepartures` is shared (authorization, audit, evidence), a good example of the target.

Shared today: `language/text.ts` primitives, `GATES` (hedge, negation, modality), `numbers.ts`. **Not shared:** any action vocabulary (verbs, prepositions, destination extraction, price grammar beyond `trade-price`).

## 8. ARCH-1: optional intelligence coupled to the authoritative core

Severity: **P2 high** (architectural; no durable-state corruption, but it shapes latency, stale UI, save size and maintenance).

Evidence (verified unless marked): mannerism bookkeeping commits per eligible turn and delays the HTTP result; sprites add about two revisions per created item and share the idle-only commit gate; a portrait batch blocks turns; reflection (when enabled) is awaited post-turn; derived and media state are persisted in the snapshot (PER-3); the revision-counted "TRADE COMPLETED" note keys on a heuristic (REV-1).

**Desired invariant: disabling any optional service must not break core correctness.** Current status per service (by reading; **not yet pinned by a test matrix**):

| Service | Disabled-safe today? | Enabled-coupling that violates the spirit of the invariant |
| --- | --- | --- |
| Reflection | yes (default off) | awaited post-turn when on; one revision per run |
| Mannerism learning | yes (code option only; no env switch) | post-turn await, per-turn revision bump, journal inflates saves (PER-1) |
| Portrait / image generation | yes (no token: clear failure) | `#portraitBusy` blocks turns, saves and edits; commit waits for idle |
| Item sprite generation | yes (silent failure) | two revisions per item; can invalidate a UI click rendered earlier |
| Sprite QA reviewer | yes | extra model call per round |
| Semantic retrieval | yes (never wired) | n/a |
| Context compaction | partial: a required but failing compaction rejects turns (`context_too_large`) | it is deterministic and model-free; treat as core |

## 9. ARCH-2: regex-per-feature interpretation architecture

Severity: **P2 structural; scaling problem already visible**; no precise limit is claimed.

Failure mode: new feature, then a new grammar, which overlaps existing grammar, which yields inconsistent facts or policy, which is patched in the audit or in a revision, which expands the regression surface non-linearly. Evidence in the last three blocks:

- Block 2: two price parsers disagreed (TRD-3); a live run found the Controller encoding a player SELL as BUY, needing a policy-pin change.
- Block 3: one feature (companions) touched `follow-invitation`, `intent`, `authorization`, three audit calls, `name-establishment`, and an existing matrix oracle plus a persistence test that encoded older policy.
- The three surviving H1 items (section 12) are all interpretation problems: pronoun or name attribution and an unrecognised recipient form.
- Movement parity between authorization and audit exists only because block 3 introduced a shared *predicate*; the *grammar* is still duplicated.

## 10. Target: shared NarrationFacts (three layers)

**Layer A, structured fact extraction (deterministic first).** One extractor per text (player input, Narrator draft, revision, delivered text) produces typed, descriptive `TurnFacts`, never state mutations:

- `speaker`, `mention(entity_ref)`, `movement{actor, destination_phrase, resolved_destination?, completed}`, `arrival`, `departure`, `name_introduction{who, name}`, `price_quote{amount, unit, subject_span}`, `offer_withdrawal`, `transfer_claim`, `payment_claim`, `relationship_or_contract_claim`.
- Every fact carries its source span, a **modality** (completed, hedged, negated, hypothetical, past, quoted) derived from the existing shared `GATES`, and a **confidence** with an explicit **ambiguity marker** (`ambiguous: {kind, candidates[]}`) when it cannot resolve to one referent.

**Layer B, domain policy and validation.** Domains consume shared facts and return `authorized | ambiguous | unsupported | conflicting`. `CampaignState` still owns truth; evidence authorization is unchanged in principle.

**Layer C, player confirmation** only for selected irreversible or high-impact actions (section 14).

Migration is incremental (strangler), not a rewrite: build the extractor for the worst-overlapping slice first (movement, follow, departure, arrival: six vocabularies today), prove parity against the existing corpus and goldens (legacy output equals facts-derived output), switch authorization and audit to the shared facts, then delete the legacy grammar. Next slices: price and offers, then names and identity. The audit, authorization and commit-prep read **the same facts object**, which removes parity-by-convention.

Explicitly **not** the answer: another always-on general LLM (verifier, auditor, reconciler) in the default turn. Provider cost, latency and disagreement would grow, and the engine's strength is that truth is deterministic.

## 11. Targeted ambiguity verifier (optional, bounded)

Assessment: **worth having later, only after NarrationFacts, and only after the ambiguity rate is measured.**

Flow: the deterministic extractor marks a fact `ambiguous`; deterministic validation tries to resolve it; only if it cannot, a narrow structured call receives the exact sentence, the candidate entity refs and **one question**, and returns a bounded enum or one candidate ref (never prose, never a new entity). Result recorded in the trace; any failure or timeout falls back to the safe default (fail closed).

Where it would materially beat more regexes: pronoun antecedent among two or more eligible people (the unresolved-pronoun case tested in block 3), "which captive is 'her'" (TRD-9), "is 22 an age or a price", whether "there" means the arrival, a fronted recipient. Where it must **not** be used: modality and negation (deterministic gates are fine), anything that would create a person or upgrade a Class C action, and any turn where the first pass is unambiguous. Constraints: reuse the existing Controller model and provider with a tiny schema (no new model), cache by sentence hash, cap calls per turn, and ship behind a flag after measuring that fewer than a small fraction of turns need it.

## 12. H1 closure inventory

Located by reading (reader-reported, spot-confirmed): the only genuine open H1 carry-overs are **D-08 "H1 TODOs"**, listed in `docs/evaluations/CALDREVAN_DEBT_REGISTER_AFTER_PASS_10.md` (four, ACCEPTED) and, current, in the root `DEBT_REGISTER.md` (**three**). There are no TODO, FIXME or XXX markers in `src/`. Every `H1` mention in code is a comment labelling a past fix.

| # | Item | Verdict | Evidence / rationale |
| --- | --- | --- | --- |
| 1 | `them` phantom handover | **STILL REAL, deferred** | fail-closed over-redaction; an antecedent problem; absorbed by NarrationFacts |
| 2 | First-name-only condition attribution | **STILL REAL, deferred** | fail-closed non-confirmation; name attribution; absorbed by NarrationFacts |
| 3 | Unnamed captive price | **ALREADY FIXED** | resolved by P8; `tests/narration-survives-audit.test.ts:160` ("Formerly a KNOWN over-redaction TODO; resolved by P8") |
| 4 | Fronted-recipient receipt | **STILL REAL, deferred** | fail-closed; recipient-form coverage; absorbed by NarrationFacts |
| - | "four H1 TODOs" in `ENGINE_FREEZE_PRE_UI.md:22` and the H6 audit (line 143) | **OBSOLETE (stale count)** | historical documents left untouched; the count is three |
| - | Comments tagged H1 in `language/*`, `scene-departure`, `name-establishment`, `commit-preparation`, `turn-types`, `grounding-audit` | **no action** | they label fixes, not debt |

Policy under evaluation: "No new major feature until every H1 item is fixed or explicitly deferred with rationale." **Recommendation: accept.** All three survivors are low-impact, fail-closed and are recorded here with a rationale and an owner (the NarrationFacts migration), so the gate is satisfiable today. Apply the same rule to any open P1 carry-over.

## 13. Authority classification (architectural principle)

Extends ARCHITECTURE.md section 2b ("Player-authorized state transitions"):

- **Class A, low impact / reversible:** no confirmation. Ordinary movement, scene focus, non-destructive interaction state.
- **Class B, important but engine-verifiable:** no confirmation if the evidence is strong; **safe rejection on ambiguity**. Name disclosure, NPC movement and follows, item pickup directly evidenced, the held-person escort (the player's own act, verified by name).
- **Class C, irreversible or high impact:** explicit player confirmation. Trade settlement, NPC+ promotion, manumission, large property transfer, any destructive or discard action added later.

Where current actions stand: trade settlement (C, done: Accept), NPC+ promotion (C, done), campaign deletion (C, done), **manumission (should be C; today B-by-regex, AUTH-1)**, **character creation from narration (B, but permanent with no retire path: needs the retire/merge command or a provisional-name quarantine, AUTH-2)**, `leave_household` evidenced by narration (B; NPC-4 notes it demotes behaviour without a player action).

## 14. Narrator output cap and truncation findings

Verified in code:

- `NARRATOR_OUTPUT_TOKENS = 512` (`src/app/provider-config.ts:6`); provider default is also 512, ceiling 2048 (above it a `configuration_error`); no environment override exists. The bake-off harness used 384 and one document calls that "the production cap" (documentation mismatch, historical).
- Reasoning is disabled; the pinned route sends no `require_parameters` (PRV-1).
- `client.ts` (verified, lines 124 to 131): any `finish_reason` other than `stop` throws `invalid_provider_response`; `length` carries failure class `finish_reason_length`; `content_filter` is `model_refusal`. A stream that ends without a finish is also `invalid_provider_response`.
- `retry.ts` (reader-reported): `invalid_provider_response` is non-retryable; only rate limit, timeout, network error and provider unavailable are retried (2 attempts). The narrator retries an empty or stream-inconsistent completion, **not** a length truncation.
- The turn fails (`narrator_failed`, `turn_failed incomplete:true`), nothing is committed (final revision equals base), the player resubmits manually. Partial text is not used.
- **Not recorded in production traces:** `finish_reason` is not in `GenerationMetadata` or `TurnTrace`; only the failure class survives on the thrown error. Dev harnesses record it.

Evidence on frequency: **no narrator truncation rate is measured anywhere in the repository.** Bake-off runs at 384 saw all `stop`; production-config live runs report all calls succeeding; the only measured length terminations are non-narrator (reflection model: 1 of 64 first attempts; others in structured reflection reliability reports). The Controller's `structured_output_invalid` rate (1 of 569) is a different failure. The reported "about one lost turn per 18" (about 5.6 %) is therefore an **anecdotal product observation requiring measurement**; PRV-1 describes a plausible mechanism, not a measured one.

## 15. Output cap recommendation: 512 vs 768 vs 1024

| Cap | Truncation risk | Latency / cost | Quality / context | Verdict |
| --- | --- | --- | --- | --- |
| 512 (now) | highest; about 380 words including action markup | lowest | long scenes with dialogue and receipts get cut | keep only if measurement shows it is fine |
| **768** | markedly lower for ordinary turns | cost grows only with tokens actually generated; latency rises with long outputs | adds about 256 tokens to the output reserve in the context policy | **recommended initial step** |
| 1024 | lowest | longer worst-case latency; invites verbosity creep and slower streaming | larger reserve eats budget | escalate only on evidence |

Recommendation: **768 plus explicit truncation detection**, not a blind increase. Escalate to 1024 only if, after instrumentation, the p95 narrator output exceeds roughly 600 tokens or the truncated rate stays above about 1 % at 768. Raising the cap does not by itself fix the failure mode (a long enough answer still truncates), which is why detection and recovery come first.

## 16. Truncation recovery design (not implemented)

Requirements: detect incomplete output from the provider finish reason; **never commit state from incomplete narration**; do not replay the whole turn blindly; preserve the semantic direction where possible; only the final delivered text goes through audit, authorization and the single commit; one authoritative commit.

Design:

1. **Detect.** Carry `finish_reason` in `GenerationMetadata` and `TurnTrace`; on `length`, keep the partial text as a provisional, uncommitted value (the adapter already yields `incomplete:true` with the text).
2. **Recover, preferred: constrained regeneration, once.** Same context and the same prepared request, with a one-line suffix that the previous attempt exceeded the output limit and the answer must be complete in a stated budget, and a raised cap for this retry only (for example 1024). The Controller and the audit then see one coherent narration, exactly as in a normal turn.
3. **Alternative to evaluate, continuation.** Send the partial as an assistant prefix and request only the closing part, then join. Faster and closer to the original direction, but support for assistant-prefill on the pinned route is **not verified** and splicing risks tone seams, duplicated beats and a Controller proposal based on a joined text. It needs a bounded probe (a later live step, not part of this review) before being relied on.
4. **Cheap deterministic fallback, optional.** Trim to the last complete sentence only when the cut falls in trailing descriptive prose and the remaining text still ends cleanly; otherwise fail the turn as today.
5. **Invariants.** Recovery happens before the Controller call, inside the same turn and the same `expected_revision`; the preview stays visual-only; if recovery fails the turn fails exactly as now. Idempotency (REV-2) and non-throwing publication (PIPE-2) are prerequisites because the turn gains a second Narrator call.

Assessment: with the current provider, **constrained regeneration is the safer first implementation**; continuation is a performance optimisation to adopt only after a probe shows it is reliable.

## 17. Truncation observability

Record per turn and aggregate by model and provider: narrator calls; truncated calls (`finish_reason=length`); recovery attempts and recovery successes; average and p95 output tokens; turns aborted due to truncation; provider and model; and the distribution of `finish_reason` overall. Without these, future cap decisions stay anecdotal. The first deliverable of the truncation work is the instrumentation, before any cap change.

## 18. Core versus optional services (conceptual split, not implemented)

**Core engine:** `CampaignState` and persistence, turn authority (prepare/commit, evidence authorization), identity, location and movement, items, economy and trade, households and NPC+, and the Narrator/Controller contract.

**Optional services:** Reflection, Mannerism learning, portrait and image generation, sprite generation, semantic retrieval, and analytics or evaluation-like adaptive systems.

Boundary: optional services **consume events and read models** (for example `turn_completed`, an item created, a settled offer) and **produce optional enrichment** (a portrait, a sprite, a mannerism candidate, a reflection note) into their **own store**. They never mutate core state directly. Core reads enrichment through a read-model join keyed by stable ids; absence of enrichment is a normal state ("feature absent"). A service registry (flags, health, last error) makes each service independently switchable; the session status machine gains no state for them beyond a non-blocking "background work" indicator.

### Disable contract

| Service | enabled | disabled |
| --- | --- | --- |
| Reflection | optional notes for diagnostics; never shown to the Narrator | NPCs behave identically; no notes |
| Mannerism learning | learned cue lines enrich NPC+ portrayal | NPC+ still behaves from authored and manual mannerisms; no learning |
| Portrait / image generation | generated avatars and full-body images | player and NPC data intact; placeholder or canon avatar only |
| Sprite generation (and QA) | generated item sprites | item exists and works; template or glyph fallback |
| Semantic retrieval | hybrid recall | lexical retrieval (already the production path) |

A disabled service means "feature absent", never "engine degraded". Recommended guard: a **disabled-services test matrix** that runs the scenario suite with each service off and asserts identical core state and identical revisions.

## 19. Revision-stream implications (REV-1 through this lens)

Mutations that bump the authoritative revision today but are not authoritative gameplay truth:

| Mutation | Nature | Recommendation |
| --- | --- | --- |
| `record_portrait_batch`, gallery versions | media metadata | **side media store**; core keeps only the *selected* avatar/full-body reference |
| `set_portrait_avatar`, `set_portrait_full_body`, `set_portrait_reference`, `delete_portrait_version` | user-authored selection | keep authoritative (low frequency, player intent) but decouple UI staleness (UI-6) |
| `set_item_sprite` (pending, ready, failed), `enrich_item_visual` | derived media bookkeeping, about 2 per item | side store keyed by item id; no revision |
| `record_reflection` / `premium_reflections` | reflection journal | append-only enrichment store |
| `maintainMannerisms` "finalized" (every eligible turn) and "observations" | learning journal and candidates | side store; only **promoted** (established) mannerisms, which the player can edit and which shape portrayal, stay in `premium_characters[]` |
| premium history diffs, `price_indices`, `empty_slots`, `active_household_member` | derived (PER-3) | recompute at load; stop persisting |

Keep authoritative: gameplay and identity truth (characters, items, positions, funds, legal status, households, knowledge, relationships, offers and settlements), player-authored profile edits, and the promoted mannerisms. Everything else belongs in a side store, a derived cache, a media metadata store or an append-only enrichment store. This also removes stale UI clicks (REV-1), shrinks saves (PER-1/PER-3), and lets the response return at `turn_completed` (PIPE-3). No migration is designed here.

## 20. Recommended consolidation wave (Wave A: architecture consolidation)

Ordered, with dependencies:

| Step | Content | Depends on | Size |
| --- | --- | --- | --- |
| A1 | H1 closure checklist and stale-doc fixes (section 12) | none | S |
| A2 | **Narrator truncation hardening**: persist `finish_reason`, metrics, cap 768, constrained-regeneration recovery | A6 (recovery only; instrumentation can start at once) | M |
| A3 | PIPE-1 decision implemented (neutral draft state) and CTX-1/CTX-2 leak filter plan | decision D2 | S-M |
| A4 | Authority classification policy and **AUTH-1 explicit manumission action**; AUTH-2 retire/merge design | decision D7 | M |
| A5 | **Optional-service/core split, phase 1**: service flags, remove post-turn work from the response path, disabled-services test matrix; phase 2 side stores (REV-1/PER-3) | A6 | M then L |
| A6 | Turn idempotency (REV-2) and non-throwing publication (PIPE-2) | none | M |
| A8 | Modern benchmark, L1 scripted scenarios (needed as the regression net for A9) | none | L |
| A9 | **Shared NarrationFacts**, movement/follow/departure/arrival slice first, then price/offers, then names | A8 | L |
| A10 | Targeted ambiguity verifier, flagged | A9 plus measured ambiguity rate | S-M |

Suggested order: A1, then A6 with A2 and A3 in parallel, then A4 and A5, then A8, A9, A10. The recommended **next engineering block (Block 4)** is *turn delivery safety and truncation*: A6 + A2 + A3 (idempotency and publication hardening, truncation instrumentation and recovery, neutral draft state), because it removes the most player-visible loss and the top P1 together.

## 21. Roadmap impact

Recommended phase order: **Stabilization (done through block 3), then Architecture Consolidation (Wave A), then product expansion**, rather than adding semantic grammars first.

- **Weather UI: may proceed in parallel.** It is presentation over an existing engine and read model; it adds no new text grammar and no model-facing service. It only needs small UI items (UI-7, UI-9, UI-10, UI-14).
- **Property: should wait** for at least A2 (so a new commerce-adjacent flow is not built on a lossy Narrator), the authority classification (A4, since property transfer is Class C), the canonical-NPC policy, `quantity`/`container_id` and equipment slots, and ideally the first NarrationFacts slice (Property adds ownership and transfer grammar).
- **Quest engine, combat, medicine, NPC routines, rumor and faction simulation: wait** until NarrationFacts and the optional-service split exist; each would otherwise add a grammar and an enrichment writer to the revision stream.

## 22. Author decisions still required

The single canonical list lives in `MASTER_DEBT_REGISTER.md` section 16 (D1 to D20). Open items that gate the wave:

| Decision | Recommendation | Trade-off |
| --- | --- | --- |
| D2 Draft preview (PIPE-1) | neutral "thinking" state until a deterministic leak filter exists | loses live typing feel |
| D11 Reflection | **shadow only**; delete dev copies | forgoes a speculative feature |
| D12 Mannerism | keep optional active, side-store its journal | needs the split (A5) |
| D13 Semantic retrieval | park in `tools/` | none in production |
| D14 Sprite QA / generation | optional side service; QA off by default | slightly lower sprite quality |
| D15 Narrator cap | **768** now, 1024 only on evidence | small latency cost |
| D16 Truncation recovery | constrained regeneration first; probe continuation | one extra call on truncation only |
| D17 NarrationFacts timing | after A8, movement slice first | delays new features |
| D18 Targeted verifier | allowed later, bounded, behind a flag | measure first |
| D19 Confirmation classes | A/B/C as in section 13; manumission to C | one more UI action |
| D20 Optional service state | **side stores**, not `CampaignState` | a migration (not designed yet) |
| D3 Currency (ECO-1) | integer silver internally, display G/S (schema 7) | migration |
| D5 Canonical NPC promotion | decide before Property | none until then |

## Modified documents

`docs/MASTER_DEBT_REGISTER.md` (reconciliation, fresh top 20, ARCH-1/ARCH-2, H1 closure, canonical decisions), `docs/MASTER_ROADMAP.md` (Wave A, phase order), `docs/ARCHITECTURE.md` (authority classes and the optional-service invariant), `docs/ROADMAP.md`, `docs/CURRENT_STATE.md` (pointer), `docs/TESTING.md` (truncation and disabled-service benchmark planning). Historical reports are untouched.
