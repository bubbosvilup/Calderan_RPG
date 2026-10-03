# Caldrevan hardening H1 — deterministic language and invariant hardening

**Date:** 2026-10-01
**Type:** implementation pass. Nothing committed or pushed; the working tree is left for human review.
**Inputs:** [CALDREVAN_HARDENING_GAP_TO_TARGET_AUDIT.md](../CALDREVAN_HARDENING_GAP_TO_TARGET_AUDIT.md) (and its JSON), [CALDREVAN_CODEBASE_ARCHITECTURE_HEALTH_AUDIT.md](../CALDREVAN_CODEBASE_ARCHITECTURE_HEALTH_AUDIT.md).

---

## A. Executive result

H1 is complete against all 20 completion criteria.

- **Validation:** typecheck clean. Full suite **1040 tests: 1036 pass, 0 fail, 0 skipped, 4 todo**, up from 947. Curated replay **25/25**. City graph and retrieval benchmarks are identical to the baseline.
- **Language layer:** the 13 independent negation/modality regexes at 14 call sites, plus one inline refusal veto, now live in **one policy table** (`src/turn/language/gates.ts`). That table is built from **10 shared cue categories** (`cues.ts`). No call site keeps a local gate regex.
- **Equivalence:** every migrated gate is proven identical to a verbatim copy of its pre-H1 regex across a 1,300+ probe corpus. The only exceptions are the documented changes below, and those are themselves asserted probe by probe.
- **Duplicates removed:** regex escaping went from 16 implementations (12 named, 4 inline) to **1**. `quotedSpans`, `blankQuotes` and `sentencesOf` went from 2 each to 1. Number-word tables went from 4 to 1.
- **Coverage added:** all 11 `TurnFailure` codes now have direct tests (6 did before). The deterministic core has property, permutation and idempotency suites. `parent ≠ travel` is locked by an explicit test. There is a locked negation/modality matrix, and a correct-narration-survives-audit corpus.

**Two things need your attention before you accept H1:**

1. **Three of the eight behaviour changes go beyond what the audit identified.** All three only *remove* authorizations or durable state, never add any. I found them with H1's own adversarial and stress tests and treated them as fail-safe fixes. They are marked **[REVIEW]** in section I. One of them is a real authorization-firewall defect: before H1, "Brenna **attempts to** take the boots" *authorized* the handover.
2. **The corpus measured four pre-existing over-redactions.** They are outside H1's scope and were not fixed. Each is recorded as a `todo` test that shows in every run (section J).

---

## B. Characterization baseline (before any source change)

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | 947 / 947 |
| `npm run test:playthrough` | 25 / 25 |
| Gate inventory | 13 distinct local gates at 14 sites, plus an inline refusal veto at `evidence-authorization.ts:151`. All 15 were extracted from source as **full, untruncated** literals. The audit's grep-truncation mistake was not repeated. |

The verbatim legacy literals are kept in `tests/language-gates.test.ts` as `LEGACY`. That test was written and passing **before** any gate was migrated, and every migration step was checked against it.

---

## C. Shared language architecture

```
src/turn/language/
  text.ts     escapeRegExp, QUOTED_SPAN_SOURCE, quotedSpans, blankQuotes, sentencesOf, exactNamePattern
  numbers.ts  NUMBER_WORDS, TENS, CARDINAL_WORD_ALTERNATION, numberWordValue, numberValue
  cues.ts     10 cue categories + cueGate()   ← shared lexical interpretation
  gates.ts    GATES (15 entries) + DISQUALIFY_FAILSAFE   ← caller-specific policy, one entry per call site
```

**Design: shared lexical interpretation plus caller-specific policy, not a universal veto.** `cues.ts` defines *what a cue is*, in separate categories:

| Category | Examples |
|---|---|
| A. `NEGATION` | not, never, nor, cannot, no (fixed), no longer, without… |
| `NEGATIVE_CONTRACTION` / `TYPED_NEGATIVE_CONTRACTION` | won't, don't… (narration needs the apostrophe; player-typed input may omit it) |
| B1. `REFUSAL` | refus\*, declin\*, reject\* |
| B2. `RETRACTION` | steps back, hands … back, stops, hesitat\* (fixed), thinks better… |
| B3. `INSTRUCTION` | tells/asks/orders *X* to |
| C1. `MODAL` | would, could, should, might, may, can, will, shall |
| C2. `CONDITIONAL` | if, unless, whether, until, were to, suppose |
| C3. `EPISTEMIC` | maybe, perhaps, probably, seems, as if, seems to… |
| D. `INTENT` | tries to, attempts to, about to, almost, nearly, pretends, threaten\*… |
| E. `OBSERVATION` | looks, glances, stares, toward(s), for the door |
| F. `TEMPORAL` | later, someday, tonight, yesterday… |

`gates.ts` decides *which categories each classifier treats as "not a completed, asserted act"*, with a doc comment naming the call site and the reason for its policy. Adding a word to `cues.ts` changes no gate until a gate lists it. `cueGate()` compiles case-insensitive, non-global patterns, so repeated `.test` calls carry no `lastIndex` state; a test asserts this.

**Subject and pronoun resolution: evaluated, not extracted.** There are three implementations, each with deliberately different and already-tested semantics:

- `narrated-captives` uses a recency history with sex compatibility.
- `scene-departure` uses subject continuity.
- `character-movement` uses "unique compatible candidate".

Merging them into one primitive would change behaviour in at least two of the three. H1 leaves them separate and documents the difference. The one defect found (section I, change 6) was fixed in place. Whether to consolidate is an H2 decision.

---

## D. Utility consolidation

| Utility | Before | After | Notes |
|---|---:|---:|---|
| Regex escape | **16** (12 named: `esc` ×9, `escape`, `escapeName` ×2; plus 4 identical inline expressions) | **1** (`escapeRegExp`) | All 16 were byte-identical. The inline copies included one in `retrieval-policy.ts`; replacing it is a literal-identical substitution with no retrieval behaviour change. |
| `quotedSpans` | 2 | 1 | the dev copy in `evidence-quote.ts` now imports it |
| `blankQuotes` | 2 | 1 | |
| `sentencesOf` | 2 (one shadowing, behaviourally different) | 1 | `sentences.ts` is now a two-line compatibility re-export |
| Number-word tables | 4 (`grounding-audit`, `person-transactions`, `narrated-captives`, and `evidence-authorization`'s `numberWords`) | 1 | the phrase extras ("a dozen", "a hundred", "half a", bare "hundred") stay as explicit local extensions |
| `exactNamePattern` | new | used at 2 sites | `narration-audit` household claims and `person-transactions` name matching (identical any-term, whole-word, case-insensitive semantics) |

**Divergence that is intentional and kept:**

- **`STOP` word sets (6).** Each is scoped to its own purpose:
  - `evidence-authorization`: quote word overlap
  - `grounding-audit`: content overlap for prior-event support
  - `narrated-captives`: capitalised words that are never names
  - `narration-audit`: private-fact word overlap
  - `narrative-authority`: fact relevance
  - `dev/lore-grounding`: dev evaluation only

  They are not merged. Merging would change matching in every one of these modules.
- **Quote patterns with capture groups or caps.** `narrated-captives` `QUOTE` (1–800 characters, captures text), `prompt-builder` `QUOTE` (1–400), `narration-audit` `quotesIn` (captures inner text), and `player-intent`'s `/schedule "title"` syntax all need capture semantics that the general primitive doesn't have. They are left as they are.
- **The narration-unit segmenter in `narrated-captives` (`narrate()`).** It splits quote-free narration into attribution units, including at "…". It is not a sentence splitter for evidence. It was not the audit's shadowed splitter and is unchanged.

---

## E. Sentence splitting

The shadowing local `sentencesOf` (`narrated-captives.ts:319`, not quote-aware, splitting at "…") is **removed**. Promotion `origin_snapshot` background evidence now uses the canonical splitter.

**What actually changed (MEASURED).** Narration units reaching `establishedFacts` contain no quotes: narration segments are already split around quotes, and quoted units are the inner text of one quote. So the only behavioural difference is the Unicode ellipsis. "Worked in the mines… till they shut." is now **one** background claim, not the fragment "Worked in the mines…". No existing promotion fixture changed.

**Ellipsis policy, deliberate and tested:**

- `…` is not a boundary; it marks a pause inside one utterance.
- A typed ASCII `...` followed by whitespace still ends a sentence, as it did in **both** splitters before H1.

Tests: `language-primitives` (dialogue punctuation, attribution, line breaks, ellipsis table) and `identity-continuity-stress` (an end-to-end promotion whose quoted background contains "…").

---

## F. Number parsing

There is now one canonical table: zero–nineteen, the tens to ninety, and compounds below 100.

| Parser | Before | After |
|---|---|---|
| `person-transactions` (stated purchase price) | one–twelve, fifteen, tens to fifty, "hundred". **"for fourteen gold" did not parse and silently fell back to the seller's offer of five.** | canonical cardinals + "hundred" |
| `grounding-audit` (invented-price detection) | one–nineteen, tens to fifty, phrase extras | canonical cardinals + phrase extras |
| `narrated-captives` (age) | its own 0–99 parser | the canonical parser (same function, re-exported) |
| `evidence-authorization` (group count) | {two..five} | `numberWordValue`; its regex only ever captures two–five, so this is exactly equivalent |

The audit asked for 13/14 to be fixed. Unifying the table also extends both price parsers to sixty–ninety. That is bounded, already supported by the age parser, and keeps detection and negotiation in agreement. Compound price phrases ("twenty-five gold") are **not** newly supported, because widening was forbidden; the existing behaviour (the regex reads "five") is recorded as a limitation.

Tests: direct parser tests, plus call-path tests:

- "for fourteen gold" pays 14; "for 14 gold" pays 14; "Done." pays the offered 5.
- "Fourteen copper" and "14 copper" are both detected as prices.
- A player's word amount supports the same digit amount.

---

## G. Negation / modality model

There is one locked matrix: 15 gates × 26 cues, with every cell asserted (`tests/language-gates.test.ts`). The gates are *expected* to differ; the matrix makes every difference explicit, so any future change to a gate or cue flips a visible cell.

Invariants asserted alongside the matrix:

- No gate vetoes a plain assertion ("She takes it.").
- Only `disqualify` and `refusal` veto refusal. This is a recorded fact, not a fix: whether departure, household or other gates should also treat refusal as a veto is a policy question left for review.
- After H1, no gate treats "no hesitation", "no warning" or "no word" as negation.

**Correction to the audit's framing.** The audit said the bare-`no` false positive "causes over-redaction". Through the real call paths:

- In `disqualify` and `departure_not_done` it caused **false negatives on valid evidence**. A valid handover or departure was not authorized, which then forced reconciliation.
- In `audit_negated` and `grounding_hedged` it caused **under-flagging**. "No warning: Dell grips Nicco's arm" slipped past the constraint audit.
- In `disqualify`, "no hesitation" was also vetoed by the retraction cue `hesitat\w*`, not only by `no`. Both are fixed.

---

## H. Gate migration table

Each gate was migrated one module at a time: capture verdicts, equivalence test, replace, focused tests, full suite. The full suite was green after every module.

| Gate (site) | Old local logic | Shared primitives used | Intended behaviour change? | Tests |
|---|---|---|---|---|
| `disqualify` (evidence-authorization) | 60-alternative regex + `n't`/`'ll`/`?` | NEGATION, MODAL, CONDITIONAL, EPISTEMIC, INTENT, REFUSAL, RETRACTION, INSTRUCTION | **Yes:** changes 1, 2, 3 | equivalence, matrix, firewall adversarial suite (12 categories), call path |
| `refusal` (evidence-authorization:151, inline) | `refus\|declin\|reject` | REFUSAL | No | equivalence, matrix |
| `movement_not_done` (character-movement) | 42-alternative regex | MODAL, INTENT, TEMPORAL, EPISTEMIC, CONDITIONAL, OBSERVATION, NEGATION | No | equivalence, matrix, continuity suites |
| `departure_not_done` (scene-departure) | 40-alternative regex | NEGATION, MODAL, CONDITIONAL, INTENT, OBSERVATION, EPISTEMIC | **Yes:** change 1 | equivalence, matrix, departure call path |
| `grounding_hedged` (grounding-audit) | 17-alternative regex | CONDITIONAL, MODAL, EPISTEMIC, NEGATION, NEGATIVE_CONTRACTION | **Yes:** change 1 | equivalence, matrix, grounding call path |
| `household_not_a_choice` (household-evidence) | 15 alternatives incl. "for now", "tonight" | CONDITIONAL, EPISTEMIC, MODAL, NEGATION, TEMPORAL + local "don't know" | No | equivalence, matrix, household suites |
| `relationship_hedged` (household-evidence) | 12 alternatives | CONDITIONAL, EPISTEMIC, MODAL, INTENT | No | equivalence, matrix |
| `captive_fact_hedge` (narrated-captives) | 14 epistemic alternatives | EPISTEMIC, MODAL | No | equivalence, matrix, promotion suites |
| `audit_negated` (narration-audit) | 13 alternatives | NEGATION, INTENT, MODAL, CONDITIONAL | **Yes:** change 1 | equivalence, matrix, condition/constraint call path |
| `audit_source_denial` (narration-audit `citesSource`, inline) | 14 alternatives + `n't\s*$` | CONDITIONAL, NEGATION, NEGATIVE_CONTRACTION; `contraction: "at_end"` | No | equivalence, matrix |
| `audit_hypothetical` (narration-audit) | 8 alternatives | CONDITIONAL, MODAL, EPISTEMIC | No | equivalence, matrix |
| `audit_denied` (narration-audit, function-local) | 13 alternatives | NEGATION, NEGATIVE_CONTRACTION, CONDITIONAL, MODAL, EPISTEMIC | No | equivalence, matrix |
| `natural_action_hedge` (natural-actions) | 36 alternatives, no markers | INTENT, MODAL, EPISTEMIC, TYPED_NEGATIVE_CONTRACTION, NEGATION, CONDITIONAL, TEMPORAL | No | equivalence, matrix, natural-action suites |
| `transaction_hedge` (person-transactions) | 15 alternatives | CONDITIONAL, EPISTEMIC, MODAL, NEGATION, TYPED_NEGATIVE_CONTRACTION, INTENT + local "how much", "let me look/see/think" | No | equivalence, matrix, purchase suites |
| `player_event_negated` (player-authored-events) | 31 alternatives (already had the safe `no`) | NEGATION, INTENT, MODAL, CONDITIONAL | No | equivalence, matrix |

`src/dev/evidence-quote.ts` still has its own `HEDGE`. It belongs to the frozen Phase 1N dev shadow experiment, is never used for production commits, and is left unchanged so historical experiment results stay reproducible.

---

## I. Intended behaviour changes

Every change below is documented in code, locked by tests, and only *removes* an authorization, a veto that hid an assertion, or durable state. **Unintended verdict changes: zero.** The equivalence test proves it per probe; the full suite and replay are green.

| # | Change | Audit-identified? | Direction | Tests |
|---:|---|---|---|---|
| 1 | **Bare `no`:** `disqualify`, `departure_not_done`, `grounding_hedged` and `audit_negated` use the shared `no(?! (?:warning\|hesitation\|word))`, the fix `player_event_negated` already had | Yes | valid handovers and departures are recognised; real assertions are no longer hidden from the audit | equivalence ("fix only removes vetoes"), matrix, four call paths |
| 2 | **Hesitation scoping in `disqualify`:** "no hesitation" and "without hesitation" are not a hesitation | Yes. The audit verified this exact phrase as a defect but misattributed the cause to `no` alone | valid handovers are recognised | call path, corpus |
| 3 | **[REVIEW] Firewall fail-safe:** `disqualify` gains act-scoped attempt and epistemic cues (`attempts to`, `attempted to`, `trying to`, `reaches/reaching for`, `seems to`, `seemed to`, `probably`, `possibly`). **Before H1, "Brenna attempts to take the boots", "seems to take" and "probably takes" AUTHORIZED the handover.** | **No.** Found by the H1 firewall adversarial suite (brief §10: fail-safe takes precedence) | tightening only; can never authorize state | adversarial suite, matrix, a check that ordinary prose ("seems relieved as she takes the boots") still authorizes, and the existing evidence corpus (no regressions) |
| 4 | **Splitter:** promotion evidence uses the canonical, quote-aware splitter | Yes | fewer fragment claims | section E |
| 5 | **Numbers:** one canonical table; 13–19 and the tens to ninety parse in both price parsers | Yes (13/14); the tens extension follows from unification | correct stated prices; consistent detection | section F |
| 6 | **[REVIEW] Departure pronouns:** a compound subject ("Dell and Bram argue. He walks out.") gives no referent, and a subject of established incompatible sex is never the referent ("Lysa glares at Dell. He walks out." never removes Lysa). Subject continuity is preserved ("Dell glares at Bram. He walks out." is still Dell, as the existing fixtures require). | **No.** Found by H1 stress tests: **before H1, "Dell and Bram argue. He walks out." removed Dell from the scene.** | narrowing only | stress tests; all existing departure fixtures unchanged |
| 7 | **[REVIEW] Naming during movement:** when Nicco changes location in the same turn, name promotion is skipped with reason `location_changed`. **Before H1, the chestnut boy calling "I'm Tomas!" as Nicco stepped into Heartstone created a durable Tomas *inside Heartstone*.** Late naming of an existing person is unaffected. | Partly. The audit raised this as an open question (medium #15); H1 decided the semantics fail-safe | prevents durable state in a possibly wrong place; costs promotion of people met on arrival in that same turn | stress tests |
| 8 | **Identity-skip diagnostic:** the silent `catch` around identity establishment now records `TurnResult.identity_skipped` and a debug-sink `identity_establishment_skipped` record. The policy is unchanged: the turn still commits. | Yes | additive; non-authoritative | stress test with an injected failure |

**TurnCoordinator changes are minimal.** The identity catch now captures its reason (change 8), and `establishNames` receives `{ location_changed: origin !== arrival }` (change 7). No stage was extracted. No code was reordered, no checkpoint or yield moved, the commit location is unchanged, and the async boundaries are unchanged.

---

## J. Correct-narration-survives-audit corpus

`tests/narration-survives-audit.test.ts` holds 15 valid narrations run through the **full turn pipeline**. Each must be delivered verbatim as the draft: exactly one narrator call (no reconciliation), zero audit issues, and every proposal authorized. Mechanics covered:

- item handover: plain, ", no hesitation", "without hesitation"
- dialogue with a question
- quoted speech containing action words
- descriptive observation
- weather "with no warning"
- player movement
- a character following
- carrying
- a departure ("No word to anyone, Dell … walks out")
- condition establishment (minor injury with evidence)
- naming
- purchase (with a stateful offer carried across turns)
- a household rule declaration

All 15 pass.

**Measured pre-existing over-redaction, not fixed (recorded as `todo` tests, visible in every run):**

| # | Valid narration that is reconciled or redacted today | Cause | Suggested owner |
|---:|---|---|---|
| 1 | "Brenna takes the boots from Nicco and sets **them** by her chair." | The audit's "possible transfers" treat `them` as covering every one-item offer, so a phantom ring handover is flagged. Independent of H1: it reproduces with no gate cue present. H1's fix only stopped masking it. | H2/H3 audit work |
| 2 | "Dell staggers back…, winded, and glares at Nicco." | The condition subject matches full profile names only ("Dell Harrow"), so "winded" is attributed to **Nicco** | audit attribution |
| 3 | Seller: "Three gold for the girl." (unnamed narrated captive) | `trade_negotiation` requires a recorded legal state, so the asking price is flagged as invented | grounding/negotiation |
| 4 | "**Without hesitation,** Brenna takes the boots." | The receipt grammar needs the recipient to lead the clause; H1 did not widen the grammar | language coverage (deliberately out of scope) |

---

## K. Property / invariant testing

`tests/core-properties.test.ts` uses a seeded PRNG and no external dependency, so every run explores the same cases.

| Property | Cases |
|---|---|
| A. Revision monotonicity: a changed batch increments exactly once; a no-op never increments and keeps the identical snapshot object | 300 generated batches, both outcomes exercised |
| B. Single-use receipts: double commit, structured clone, spread copy, `null` and a foreign campaign's receipt never commit | 5 forgeries |
| C. Stale receipts: older-base receipts, stale or future `expected_revision`, and replayed no-op receipts are refused | 4 cases |
| D. Order independence: 5 independent commands in all 120 permutations produce one snapshot | 120 |
| E. Stable data: input key order never changes the snapshot; restating data with reordered keys is a no-op | 2 cases |

---

## L. TurnFailure coverage

Coverage went from 6/11 codes to **11/11**. `tests/turn-failures.test.ts` ends with a test asserting coverage of the full code list.

Every case asserts the same contract:

- the snapshot object is identical afterwards
- revision and world time are unchanged
- no `state_committed` event is emitted
- no finalized conversation entry is recorded
- the failed draft never re-enters the prompt
- where the cause is transient, the same campaign then commits the handover **exactly once** with working providers

| Code | Triggers tested |
|---|---|
| `invalid_input` | empty, whitespace-only, 4001 characters (4000 is accepted) |
| `context_invalid` | a campaign from another dataset |
| `context_too_large` | 17 scheduled events (deterministic and *not* retry-safe: asserted to recur); a narrator draft over 24k characters |
| `retrieval_failed` | the search provider throws; no raw error leaks |
| `invalid_runtime_intent` | `/wait 99999`, `/wait 0` |
| `stale_turn` | mutation during the controller call |
| `turn_in_progress` | a concurrent turn; the lock is released afterwards |
| `cancelled` | pre-aborted signal (no provider call); abort mid-stream |
| `narrator_failed` | provider timeout, empty completion, completion that disagrees with the stream, and **failure of the reconciliation revision after preparation** |
| `controller_failed` | timeout, rate limit, invalid structured output |
| `campaign_validation_failed` | an authorized batch that fails final validation, atomically |

Provider retry was **not** implemented; that is H5.

---

## M. Character continuity tests

`tests/identity-continuity-stress.test.ts`, plus existing coverage that was confirmed rather than duplicated:

| Scenario | Result |
|---|---|
| Naming while Nicco moves | skipped, `location_changed` (change 7) |
| Naming on a stationary turn after arrival | promoted at the arrival location |
| Late naming after a scene change (unnamed purchased girl) | same ID, `purchase_unnamed_subject` origin kept, legal holder and household membership on the same ID, survives save/load |
| Promotion evidence containing quoted dialogue with "…" | one claim, no fragment |
| Canonical NPC name (Korvin) | never promoted |
| A present person's name repeated | never re-promoted |
| Two same-name people (different exchanges / same exchange) | already covered: `narrated-promotion.test.ts:150`, `narrator-persistence.test.ts:91-105` |
| Person stays behind and is revisited | one record, one location, survives save/load |
| Ambiguous / sex-incompatible pronouns | change 6 |
| Identity preparation failure | turn commits; skip is observable (change 8) |

**Simultaneous movement and attribution:**

- A leaves while B stays.
- A and B both leave.
- Nicco moves while Maren only *says* she'll follow; the controller's `move_character` is rejected and she stays.
- Explicit carrying moves only the carried person.
- "looks toward the door" is not leaving.
- Quoted "I'm leaving" is not leaving.
- Quoted narration-like speech is not a departure.

No fuzzy identity merging exists or was added.

---

## N. Route invariants

- **Edge order:** permuting outgoing-edge and entity declaration order (reverse, seeded shuffle, odd/even interleave) never changes any route across all 36 pairs of a synthetic graph.
- **Ties:** equal-cost routes break deterministically by node-ID sequence, in either declaration order.
- **Unreachable:** unreachable destinations, non-locations and unknown IDs return `undefined`; origin equal to destination is the 0-minute route.
- **Real Calderan graph, 400 seeded pairs:** total minutes equal the sum of traversed edges, every edge is authored with that cost, nodes are consecutive, results repeat, and `WorldStore` is byte-identical before and after.
- **`parent ≠ travel`:** siblings under one parent, parent↔child, and "reaching one child reaches its sibling" are all unreachable in a synthetic graph. A container with no authored entrance resolves only to itself. In real canon, all five Calderan districts have zero connections and no route to or from their children.

---

## O. Metrics

| Metric | Before | After |
|---|---:|---:|
| Tests (`npm test`) | 947 | **1040** (1036 pass, 4 todo, 0 fail) |
| `test(` call sites | 542 | 640 |
| Test files | 48 | 55 |
| TurnFailure codes with a direct test | 6 / 11 | **11 / 11** |
| Local negation/modality gate regexes in `src/turn` | 13 distinct at 14 sites, + 1 inline refusal veto | **0** (15 policy entries in 1 registry) |
| Shared language primitives | 0 | 11 text/number primitives + 10 cue categories + 1 gate builder |
| Regex-escape implementations | 16 | **1** |
| `quotedSpans` / `blankQuotes` definitions | 2 / 2 | 1 / 1 |
| `sentencesOf` definitions | 2 | 1 |
| Number-word tables | 4 | 1 |
| Regex literals in `src/turn/*.ts` (excluding `language/`) | 185 | 181 |
| Named regex constants in `src/turn/*.ts` | 71 | 59 |
| Intended behaviour changes | — | 8 (3 marked [REVIEW]) |
| **Unintended behaviour changes** | — | **0** |
| Typecheck | pass | pass |
| Curated replay | 25 / 25 | 25 / 25 |
| City graph (78 / 156 / 71 / 0 unreachable / 106 min) | — | identical |
| Turn retrieval benchmark (policy 25/25; engine 18/25) | — | identical |

**Score projection (JUDGEMENT, not measured):** the gap audit projected H1 at code health +2.5 to +4.0, core deterministic +2.0 to +3.5, and functional runtime +1.0 to +2.0. Nothing in H1 contradicts that range. A measured re-score belongs to H6.

---

## P. Remaining H1 limitations

1. **The four over-redaction / false-negative `todo` cases in section J.**
2. **`player_event_negated` still treats "without hesitation" in player input as negation.** It is pre-existing, not audit-identified, and was left unchanged.
3. **`disqualify` does not veto bare "seems" or "as if" unrelated to the act** (by design; see change 3). Bare "as if" was already vetoed before H1 through the `if` cue, and that is preserved.
4. **Subject continuity remains a heuristic.** "Dell glares at Bram. He walks out." resolves to Dell. Only compound and sex-incompatible subjects were narrowed.
5. **Compound price phrases are not parsed** ("twenty-five gold" reads as 5 in grounding); unchanged.
6. **Change 7 gives up promoting a person first named in the same turn Nicco arrives somewhere.** That person stays ephemeral; asking again on the next turn promotes them correctly.
7. **No standalone "escape scanner" script exists in this repository.** The baseline audit's mention corresponds to the save path-escape regressions (`persistence.test.ts`) and the CSV escaping tests, both of which ran in the green suite.
8. **`npm run eval:retrieval` was not run** because it calls the paid Voyage provider. The deterministic retrieval suites and the offline turn retrieval benchmark ran.

---

## Q. Validation results

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | 1040 tests: 1036 pass, 0 fail, 0 cancelled, 0 skipped, 4 todo |
| `npm run test:playthrough` | 25 / 25 |
| Authored-data / world validation | green (authored-data, authoring, world, world-canon, geography, Calderan/West canon suites) |
| City / travel | `inspect-city` identical; city-travel and new route properties green |
| Retrieval (deterministic) | retrieval, lexical, semantic (fixture provider) and recall suites green; offline benchmark identical |
| Save / load | persistence and campaign-restore green; round-trips in the stress tests |
| Narrator persistence / location continuity / household-legal | green |
| Line endings | every touched file keeps its prior convention (LF, or CRLF where HEAD is CRLF) |
| Paid model calls | none |

**Scope confirmation:**

- No `CampaignCommand` variant was added and no controller vocabulary changed.
- No retrieval, context, save or provider architecture changed. The only touch outside `src/turn` gates was the identical escape substitution in `retrieval-policy.ts`.
- No NPC+ code exists.

---

## R. H2 readiness

**Ready.** H2 was gated on H1 so that a decomposition of `runTurn` would be protected by tests, and that protection now exists:

- every language gate is pinned verdict-for-verdict
- every failure path has a contract test
- the core has property tests
- the survives-audit corpus will catch a decomposition that changes delivery

Recommendations for H2 based on what H1 found:

1. **Write the golden end-to-end test before extracting any stage.** It should assert the event sequence and a byte-identical `TurnResult` across the corpus scenarios.
2. **Carry the two minimal H1 coordinator changes into `CommitStage`:** the identity-skip diagnostic, and `location_changed` computed from origin and arrival.
3. **Decide whether to consolidate subject and pronoun resolution** (three implementations, section C).
4. **The audit fixes for `todo` cases 1–3 are better done after H2,** once audit ownership sits in its own `AuditStage`.

CALDREVAN HARDENING H1 COMPLETE
