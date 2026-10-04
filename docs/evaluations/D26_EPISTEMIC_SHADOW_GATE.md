# D-26 epistemic mannerisms and shadow portrayal gate

2026-10-04, Europe/Rome. **PHASE A+B COMPLETE. D-26 remains OPEN — SHADOW DATA COLLECTION.** Production distinguishes a portrayal cue, historical recurrence and character recognition. A deterministic observer logs narrowly supported suspicious portrayal after existing audit/reconciliation; it cannot edit or reject narration, request reconciliation, call a provider, or mutate campaign authority. D-10 remains CLOSED; D-09 remains SOAK PENDING and can resume with shadow logging.

The earlier [portrayal probe](MANNERISM_PORTRAYAL_FIDELITY.md) and [failed prompt-only attempt](D26_MANNERISM_PORTRAYAL_FIX.md) remain historical evidence. This implementation does not claim to repair or close their narrative failure.

## Authority and persistence

Acquisition source remains `seeded | emergent | user`. Recurrence is a separate optional persisted `epistemic_state: emergent | observed | established`. `known_by_character_ids` is a separate, bounded, unique list of valid character references, identifying recognition of a recurring habit rather than attendance or one witnessed occurrence.

| Source / operation | Recurrence default | Recognition default |
|---|---|---|
| Initial seeded cue | emergent | empty |
| User-created cue | emergent | empty |
| Engine promotion through existing independent 3/4/5 evidence | established | empty |
| Manual definition edit | reset to emergent | reset to empty |

Emergent permits appropriate portrayal without inventing any earlier occurrence. Observed supports an occurrence, not a general habit. Established supports recurrence, without universal frequency or arbitrary character recognition. There is no automatic population of recognition from presence, witnessing, narrator claims or gate findings.

Automatic advancement of owned seeded/user cues is **deferred**. The existing extractor intentionally excludes owned cues to prevent feedback into acquisition. Safely separating occurrence history from that anti-feedback path would broaden D-10. This pass stores and interprets observed status but does not manufacture occurrence evidence or create a new learning loop. Engine promotion records established status using its existing proof; thresholds, caps, expiry, acceptance logic, uniqueness and the seed library are unchanged.

Save wrapper/schema versions stay unchanged. Optional fields extend the strict parser; old snapshots load without mutation or fabricated evidence. Effective missing status derives to emergent for seeded/user/edited cues, and established for unedited engine-emergent cues. Missing recognition derives to empty. New creations persist explicit defaults. Save/load, legacy loading, invalid awareness references and manual-edit reset are covered by tests.

Future UI should show mannerism text, acquisition source, recurrence, recognized-by and user-edited status separately. It must not present source `emergent` as recurrence `emergent`, claim a habitual observer from room attendance, or imply a gate finding advances authority. No UI or status override tool is added here.

## Compact narrator packing

Before:

```text
- Levels their head before correcting a spoken detail.
```

After:

```text
- Levels their head before correcting a spoken detail. [recurrence=emergent; recognized_by=nobody]
```

Recognition IDs render as names when present. One shared rule explains optional local performance, the three recurrence states, recognition limits and prohibition of cue-derived history/psychology/consent. Original action and condition remain intact. No source provenance, evidence arrays, revision fields, fingerprints, candidate counts or canonical keys are packed.

Production budgeting/compaction is unchanged. For the eight normal frozen scenes, the existing context estimator measures **+104 input tokens per request**, including three metadata suffixes and the shared-rule change. This is an estimate, not provider tokenizer attribution. Two omission controls remove only cue lines, retain the same shared rule and state, and contribute zero packed exposures.

## Shadow observer and diagnostic contract

Lifecycle: final deliverable chosen by existing audit/reconciliation → commit preparation → shadow observation → delivery → existing authoritative commit/publication. It observes generation-time projected mannerisms and only cues surviving actual final prompt packing. `runTurn` remains within its existing 164-line architectural ceiling; data preparation is a helper, not another turn responsibility.

Only these rules exist:

| Rule | Conservative support |
|---|---|
| OUT_OF_TRIGGER | Exact finite cue action plus explicit local absence of its condition: silent preword pause, confirmation rather than correction, gaze lowering in an explicitly no-lie scene |
| UNSUPPORTED_RECURRENCE | Explicit habitual wording attached to the matched action clause when state is emergent or observed |
| UNSUPPORTED_AWARENESS | Explicitly named other speaker recognizes the locally matched behavior, without membership in the generation-time recognized-by set |

Initial families are pause before a named address, head leveling before spoken correction, and gaze lowering before an obvious lie. Unknown families count as packed exposures but do not acquire invented semantic matchers. Pronouns require an unambiguous local owner. Quoted/reported actions are excluded. Generic pausing, tilting, looking down, unrelated recurrence words, another character's habit, established omniscient recurrence and authorized observers are negative controls. There is no global word ban, psychology classifier or generic prose check.

Every finding owns its turn/event/revision identifiers, character and cue identities/text/source, `epistemic_state_at_generation`, copied `known_by_at_generation`, rule, safe matched action span, bounded local context, narration digest, expected trigger, trigger/recurrence booleans, reason enum and speaker identity when applicable. Findings and recognition snapshots are immutable. A focused test changes later cue state and recognition and proves earlier findings remain stable.

Ordinary diagnostics contain action-only spans and structured reason context, not surrounding dialogue/private prose. Evaluation explicitly opts into `include_local_text: true`; full local text, prompts, snapshots, provider ledgers and review manifests stay under ignored `saves/d26-shadow/`. The gate has no repair/provider/campaign capability. Normal production diagnostics run it; absent diagnostics sinks simply produce no observer output. Invalid inputs return an invalid-input diagnostic instead of throwing into gameplay. Bounds are 24,000 delivered characters, 256 cue exposures and 64 findings.

## Offline replay and controls

Replay covers **40 archived outputs**: the original 18-call probe and previous 22-call failed fix, without paid calls or modifying old artifacts. The two original primary A/B failures are detected: A generates OUT_OF_TRIGGER and UNSUPPORTED_RECURRENCE; B generates OUT_OF_TRIGGER. Valid original correction and Gerome lie produce no finding.

Replay yields **10 findings across nine outputs**: manual review classifies **9 TP, 1 ambiguous, 0 FP**. The ambiguous previous-fix A-negative explicitly frames a preword pause with no subsequent address; an incidental-pause interpretation remains plausible. It is retained as ambiguous rather than used to claim precision. Review is by the primary agent with state access, not a user/human blind judgment.

Separate offline corpus: **15 negative/valid controls, zero false positives**; four positive cases yield five expected findings. They include observed-versus-habit distinction and an established cue with both unauthorized and authorized named observer. The original spoken-versus-nonverbal-correction boundary remains a manual boundary, not an expanded deterministic rule. Unsupported psychological attribution is outside gate scope and remains manually reviewable.

After paid dispatch, an additional offline attachment control narrowed recurrence checking to the action clause, excluding another character's habit in the next sentence. Frozen prompts and narrator outputs were untouched. Final gate reinspection of all ten frozen live outputs gives byte-identical diagnostic results and unchanged snapshots; no further provider calls occurred.

Known coverage limits: possessive/nominal gaze descriptions, ambiguous pronouns, recognition dialogue in another paragraph, implicit corrections and insufficient absence evidence can escape detection. Sparse finite matching intentionally prefers missed cases to global inference. Zero findings does not certify all narration or cue causality.

## Frozen fresh live mini-validation

Exactly **10 physical narrator calls**, first attempt each; eight normal scenarios and two matched omission controls. This is not a new 22-call matrix. Normal scenes cover A positive/negative/quiet, B positive/negative/quiet, C positive/negative; omission controls reuse A/B negative state/input. Prompts, snapshots, original source hashes and provider configuration were frozen before dispatch; source did not change during the run. There were no rerolls, controller/extractor/reflection/embedding calls or campaign commits.

Production request path uses normal context construction, narrator prompt packing, lossless context preparation and the existing retry wrapper. Narrator remains `z-ai/glm-5.2`, pinned `z-ai/fp8`, no fallback, reasoning disabled, 512 output tokens and no sampling overrides. The evaluator inspects uncommitted narrator drafts; the production lifecycle test separately verifies final-delivery placement and no gate-induced reconciliation/provider call.

| Measure | Result |
|---|---:|
| Physical / logical narrator calls | 10 / 10 |
| Normal / omitted requests | 8 / 2 |
| Packed / conditional cue exposures | 24 / 24 |
| Emergent / observed / established exposures | 24 / 0 / 0 |
| Findings | 1 |
| OUT_OF_TRIGGER / UNSUPPORTED_RECURRENCE / UNSUPPORTED_AWARENESS | 1 / 0 / 0 |
| Manual TP / ambiguous / FP | 1 / 0 / 0 |
| Exact reported provider cost | **0.033238880 USD** |
| Unmetered calls | 0 |

The sole live finding is B-negative: Maren levels her head while agreeing with Nicco's correct bridge statement. The action is preserved in the delivered draft. Its matched omission counterpart gives an ordinary nod. A-negative and C-negative omit the respective tested cue actions; positive cases portray the cues in appropriate contexts. All ten outputs were manually reviewed; omission is permitted and general prose/private-state metaphors are not automatically recategorized as mannerism findings. These small synthetic observations are not a population precision estimate or proof that metadata fixes the model.

Raw evidence: `paid-run.started.json`, `ledger.json`, ten `output-*.json`, `summary.json`, `offline-replay.json`, `review-manifest.json`, and `final-gate-reinspection.json` in ignored `saves/d26-shadow/`. Reproduction: build, then run `docs/evaluations/d26-shadow-validation.mjs` offline, or `--reinspect` for existing live outputs; `docs/evaluations/d26-shadow-review.mjs` writes controls/review. `--live` refuses an existing run marker and caps physical calls at 12 / cost at 1 USD. No automatic paid rerun is authorized by these scripts.

## Validation and decision

- Typecheck passes.
- Full suite: 1,897 tests, 1,893 pass, zero failures, the same four accepted TODOs.
- Playthrough: 25/25.
- Focused D-10/D-26 suite: 47/47.
- Persistence, legacy defaults, source/state distinction, recognition validation, safe diagnostics, immutable history and no repair/provider/authority effects verified.

**D-10 CLOSED. D-26 OPEN — SHADOW DATA COLLECTION. D-09 SOAK PENDING.** Phase A+B is complete; resume D-09 with shadow logging when starting that separate task. Repair, automatic owned-cue recurrence advancement and a broader matcher require subsequent evidence and are not implemented in this pass.
