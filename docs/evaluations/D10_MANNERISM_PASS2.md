# D-10 emergent mannerisms: Pass 2

> Historical Pass 2 result before calibration. Superseded by [Pass 2B](D10_MANNERISM_EXTRACTOR_CALIBRATION.md): 8/8 live recall, production extraction enabled independently, D-10 closed, and the complete implementation published together. The failure and opt-in statements below describe the earlier checkpoint.

2026-10-04. **D-10 IN PROGRESS; NOT CLOSED.** Deterministic acquisition and integration checks pass. The frozen live classifier returned no observations for any case, missing **all eight valid controls**. This fails the live recall gate. No Pass 2 commit, push or merge was made. Pass 1 was cleanly fast-forwarded and pushed to `main` at `f92c801d522bbb169a522af6babb9619087d1b95` before this work; implementation remains on local branch `feat/d10-emergent-mannerisms`.

## Implementation and cadence

[Session maintenance](../../src/app/game-session.ts) passes only `turn_completed.result.narration` to [MannerismMaintenance](../../src/turn/mannerism-extraction.ts), after delivery and before existing reflection. Drafts, hidden reasoning, controller proposals and failed turns are not inputs. The coordinator, controller mutation schema, movement authority and reflection mutation semantics are unchanged. Failed optional extraction cannot fail an already delivered turn.

Maintenance batches at most four eligible finalized turns into one strict extraction request every fourth qualifying source. A session-local queue retains only those four raw narrations; persisted state holds fingerprints, spans and candidate summaries. No eligible NPC+ and no candidates means no maintenance. Ordinary characters do not accumulate candidates; pre-NPC evidence is deferred and initial promotion still uses the reviewed Pass 1 seed.

The production adapter uses the selected controller model, currently **`qwen/qwen3.8-flash`**, independently of narrator **`z-ai/glm-5.2`**. Requests are non-streaming, require strict JSON-schema support, disable reasoning, cap output at 2,048 tokens and have a 20-second timeout. There are no automatic extractor retries. Busy post-turn status covers this bounded wait, as with reflection.

**Production safeguard:** because live recall failed, `createProductionDeps()` does not enable this extractor by default. Development hosts can explicitly supply `mannerism_extractor`, or set `ProductionOptions.enable_emergent_mannerisms: true`. Neither enables closure or changes the thresholds. Normal production play retains Pass 1 without paying for an unvalidated periodic classifier.

## Observation contract and filters

The strict wire object contains `observations` and `owned_reviewed_ids`. Each observation requires:

```ts
{
  turn_sequence: number;
  character_id: string;
  action: MannerismAction;
  trigger: MannerismTrigger; // "none" represents an absent trigger
  evidence_quote: string;
  requires_item_id: string | null;
  requires_entity_id: string | null;
  equivalent_owned_ids: string[];
}
```

There are seven supported action families: lowered gaze, two-finger tapping, pressed lips, smoothing clothing, gripping an object, a pause before addressing by name, and a door glance. Eight trigger codes form a deliberately narrow vocabulary. Generic smiles, pauses before answering and looking away abstain. Trigger-free acceptance is limited to distinctive two-finger taps and grounded object grips. Unknown behavior abstains rather than inventing characterization.

The model classifies observable behavior and compares it with every owned cue. Deterministic checks then require an exact contiguous quote beginning with the subject's actual name at a sentence boundary, a supported observable action and literal trigger, and a known eligible NPC+. Negated, hypothetical, future, remembered, quoted or other-character acts are rejected conservatively. Inference language excludes motives, personality, morality, relationships, attraction, sexual interests, consent, willingness and submission/dominance. Neutral physical cues in intimate scenes are not prohibited as a class.

Object/clothing observations must name the actual registered object, use its supplied ID, and pass both witnessed and current possession checks. Clothing must have been worn. Missing rings, dolls and weapons, another character's possession and missing entity prerequisites cannot be legitimized. Promotion rechecks prerequisites; Pass 1 suppresses an unavailable authoritative cue without deleting it. Generated text stays within 160 characters and adds no inferred motive, trigger, possession or contact surface.

These finite guards are backstops for a semantic classifier, not a general natural-language proof system. Whole-sentence/name restrictions deliberately trade recall for safety.

## Evidence, thresholds and bounds

[Learning policy](../../src/campaign/mannerism-concepts.ts) exposes configurable source constants:

| Slot being acquired | Independent finalized moments required |
|---|---:|
| 2 | 3 |
| 3 | 4 |
| 4 | 5 |

These thresholds impose scarcity, not psychological confidence. The same paragraph or repeated observation in one source contributes once. Normalized action/trigger/prerequisite identity clusters same-character aliases across distinct turns. Each candidate retains at most five independent evidence references containing source sequence, revision, event ID, SHA-256 fingerprint and quote offsets. Progress is derived state, never authoritative portrayal.

Per NPC+: **eight candidates maximum**. When exceeded, higher independent evidence count wins, followed by more recent evidence and stable ID order. A candidate expires when more than **40 finalized maintenance-source turns** pass without reinforcement. The source journal retains **16 entries**. A batch accepts at most **32 observations**, **64 present eligible NPC+**, **256 witnessed item entries**, and **128 owned cues**; a request above the global ownership limit fails closed instead of silently omitting owners. Serialized request data is limited to 80,000 characters.

Automatic promotion fills only an empty authoritative slot, appends source `emergent`, and never edits or replaces seeded/user/emergent entries. At four cues it stops acquisition for that character. Existing cues do not decay.

## Global semantics and feedback

All authoritative cues, including inactive owners and user-created/edited entries, are reviewed before accumulation. The model must acknowledge the complete ownership ID set; missing/extra review IDs fail closed. It reports equivalent owned IDs. Independent deterministic normalization compares supported synonyms and action/trigger identity, with trigger-free concepts conservatively covering matching triggered actions. Canonical keys remain an additional check.

Equivalent own behavior is rejected **before** candidate reinforcement. Another owner's equivalent behavior is likewise rejected, not reworded. Deterministically conflicting candidates are retired, and promotion rechecks the current global registry, including cues promoted earlier in the same batch. Only candidates reviewed in the current batch can promote; empty maintenance cannot promote stale evidence. A generic verb does not equate lowered gaze before a lie with a door glance during raised voices.

Supported-family object equivalence is deliberately conservative: similar action/trigger concepts can collide even with different objects. Arbitrary free-text semantics depend on model review. The live run did not establish that review's usefulness because it extracted nothing.

## Persistence and future UI

The optional `CampaignSnapshot.mannerism_learning` extension follows existing snapshot version 3 / save version 4 conventions. Older saves without it load without invented candidates, replay or retroactive seeding. Strict restore checks bound arrays and independent evidence, source fingerprints, revisions, cursors, candidate concept consistency and duplicate concepts. Normal save/load preserves accumulated candidate evidence and all authoritative ownership, including user edits.

Raw pending narrations are session-local: loading can discard up to three **not-yet-classified** sources. Already accumulated candidate evidence is preserved. Persistent source references are internal journal event IDs plus fingerprints/offsets; they do not constitute a second narration archive. Long-expired journal prose must be obtained from an external retained turn trace if a developer wants to inspect it.

[Future view contract](../../src/app/mannerism-view.ts) returns authoritative text/source/user-edited state and occupied/max slots. Candidate text, evidence count and required count appear only with explicit developer access. Candidates are absent from normal narrator/controller context. No UI was built.

Metrics: `observations_considered`, `observations_rejected_personality`, `observations_rejected_prerequisite`, `observations_rejected_existing_mannerism`, `observations_rejected_global_duplicate`, `observations_rejected_evidence`, `candidates_created`, `candidates_reinforced`, `candidates_expired`, `mannerisms_promoted`. Optional session diagnostics expose counts and provider metadata, not raw prose.

## Offline corpus and integration

[Frozen labeled corpus](../../src/dev/d10-mannerism-corpus.ts): **25 cases** comprising eight valid controls, five personality controls, three unsupported possessions, three sexual/consent inference controls, three ambiguous abstentions, two recorded finalized engine golden narrations, and one global duplicate. The two saved-play cases come from `tests/golden/turn-pipeline.json`; they are recorded engine turns, **not an organic player-save sample**.

Deterministic boundary validation accepts **8/8 valid** controls. Deliberately over-eager proposed observations for negative controls are rejected; the global duplicate control is rejected by domain ownership. Personality **5/5**, unsupported prerequisites **3/3**, prohibited intimate inference **3/3**, ambiguous abstentions **3/3**, saved ordinary play **2/2**, and global duplicate **1/1** are protected. These are offline validation results, not measured model recall or a statistical generalization.

Fifteen focused Pass 2 tests additionally cover:

- same-turn duplication, alias clustering, 3/4/5 thresholds, four-slot/no-overwrite behavior;
- own narrator feedback, other-NPC equivalence, inactive owners and user edits;
- candidate cap/expiry, item disappearance before promotion and suppression afterward;
- save/load progress, old-field absence and corrupt independent provenance;
- incomplete schema/global review, malformed/provider failures, cancellation and in-flight stale revisions;
- production provider wire contract and opt-in gate, private candidate view;
- real `GameSession`/`TurnCoordinator` finalized turns, later prompt packing and failed drafts.

In the real offline coordinator integration, four finalized Brenna tap turns promote slot 2; the next four repetitions are rejected as existing-cue feedback (**zero reinforcement**); four equivalent Maren turns are blocked globally. A failed controller turn contributes no source. A second multi-turn integration clusters two differently worded Maren gaze moments into one candidate, saves/loads it, and promotes after a third distinct moment. No paid narrator or controller turn was required for these deterministic integrations.

## Live validation: failed recall gate

[Evaluator](../../src/dev/eval-mannerisms.ts) was invoked once after offline checks passed:

```text
node .build/src/dev/eval-mannerisms.js --live-25
```

The evaluator freezes the labeled corpus, requests and implementation hashes before calling the model, limits the run to seven calls, writes a single-run marker, saves every raw model response and replays accepted observations through the deterministic candidate domain. No retries, prompt changes or rerolls occurred.

| Batch | Cases | Expected valid | Extracted | Cost USD | Latency ms |
|---|---:|---:|---:|---:|---:|
| gaze/tap aliases | 4 | 4 | 0 | 0.000146080 | 1,659.6 |
| clothing/object/cadence/door | 4 | 4 | 0 | 0.000112976 | 1,272.8 |
| personality | 4 | 0 | 0 | 0.000109826 | 1,214.4 |
| personality/missing possessions | 4 | 0 | 0 | 0.000111176 | 980.3 |
| intimate inference/ambiguous smile | 4 | 0 | 0 | 0.000110126 | 1,301.4 |
| ambiguous/recorded finalized play | 4 | 0 | 0 | 0.000111026 | 1,107.6 |
| globally owned gaze | 1 | 0 | 0 | 0.000077006 | 1,294.9 |

Provider: **Alibaba** on all seven requests. Live totals:

- **25 cases / seven paid calls**, valid recall **0/8 (0%)**, false negatives **8**.
- Raw model and accepted false positives **0**; negative abstention **17/17**.
- Semantic duplicate errors **0**, but positive alias extraction was not exercised successfully. No permanent cue was acquired in this live matrix.
- Malformed responses/provider failures **0**. Every response acknowledged the supplied ownership IDs and returned `observations: []`.
- Total measured cost **$0.000778216**; all seven responses reported cost.
- Total latency **8.831 seconds**; mean **1.262 seconds**, median **1.273 seconds**, maximum **1.660 seconds** per batch.

Reproducible local artifacts are under ignored `saves/d10-mannerisms/pass2/`: `frozen-manifest.json`, `batch-1.json` through `batch-7.json`, domain replay records, `summary.json`, and `paid-run.started`. They contain no credentials. The empty-list response is visible in every raw record. This does not justify closing D-10 on safety alone.

## Verification and remaining blocker

Final verification: **1,884 tests: 1,880 passed, zero failures, same four TODOs**. Typecheck passes. Dedicated playthrough remains **25/25**. Existing runtime-cycle/architecture guards, context goldens, Pass 1 tests and controller/reflection isolation pass.

**Exact closure blocker:** production Qwen classifier over-abstains on every valid cue (0/8 live recall). Repair/review the classifier contract and obtain fresh bounded live evidence for positive extraction and semantic alias review before enabling automatic production extraction or closing D-10. This pass made no further paid requests after the failed matrix. Broader unsupported action families and organic player-save coverage remain explicit validation limits.

**D-10 CLOSED: NO.** D-09 remains separate. D-04/D-05 stay closed; D-06 is unchanged. Pass 2 stays local and uncommitted because the requested green gate for commit/push was not met.
