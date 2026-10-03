# D-10 emergent mannerism extractor calibration: Pass 2B

2026-10-04. **D-10 CLOSED.** Calibrated **`qwen/qwen3.8-flash`** reaches **8/8 accepted positive recall**, with **zero accepted personality, unsupported-world, NSFW/consent or ambiguous false positives** on the unchanged frozen 25-case corpus. Live gaze and tapping aliases reinforce shared candidates. Real finalized-turn replay proves slot-2 promotion, narrator packing, feedback protection, cross-NPC uniqueness and save/load. Luna comparison was **not run**: Qwen passed its gate.

## Diagnosis before editing

Inspected the exact old system prompt, JSON-only user task, strict schema, all seven stored requests and raw responses, eight positive controls, and deterministic quote/action/prerequisite validation. Every old response was structurally valid and acknowledged ownership IDs but emitted `observations: []`. There were no positive proposals for downstream validation to reject.

The contract described a **mannerism** as “repeatable,” opened with “Most turns contain NO qualifying observation,” required a “distinctive” gesture, and never expressly separated a first observed act from an established recurring habit. The user message contained only serialized data. Trigger codes were supplied in the schema without explanatory mappings in the prompt. Together these instructions primed abstention and left the model's actual proposal duty unclear.

The diagnosed contract defect is **observation versus established mannerism conflation**. Repetition and permanence belong to deterministic accumulation, not the extractor. Internal model reasoning was not available; there was no separate ablation isolating each wording change. The unchanged corpus moving from 0/8 to 8/8 after contract-only calibration supports this diagnosis without claiming access to the model's reasoning.

## Calibrated contract

[Prompt and task](../../src/turn/mannerism-extraction.ts) now state:

- An observation means a supported action happened **once** in this finalized turn.
- A first-ever literal occurrence must be reported even with an empty candidate list.
- The extractor does not establish habits, count repetition, decide permanence or promote cues.
- The engine validates proposals and later requires 3/4/5 independent supporting moments.
- Each of the seven existing action families and eight existing trigger codes has a literal description. No vocabulary was broadened.
- Evidence is the shortest exact contiguous span proving actor/action/stated trigger, copied from source with the supplied name and IDs. The model does not compose candidate prose.

The user task explicitly requests occurrence extraction before the JSON data. Two small positive examples use unrelated characters Orin and Vessa (trigger-free two-finger tapping; lips before disagreement). Two negative examples show personality and an unsupported necklace. None copies a frozen evaluation stimulus. Personality/motive/relationship/sexual/consent exclusions, object requirements, ownership review and hypothetical/negated/future/remembered/quoted-act rejection remain explicit.

Prompt version: **`d10-observation-v2`**. Schema: original **observation schema v1**, unchanged.

Frozen hashes, written before the first dispatch:

```text
prompt+task SHA-256:
7d296e1796c85cf1ea573afe163891a3d3cc5e7f4fbc80f1938e1b1ac525413d
schema SHA-256:
301a552e4b04f7668e5f571431d00afdb3ec5a4e7d93fb8fa7872ce0d5c4dc9f
corpus SHA-256:
062bb3f6de5411600c7dc0862a398e93eab84dc89c761fdecea6adaeb7029006
```

No prompt edits occurred after dispatch began. There were no retries or rerolls.

## Unchanged safety boundary

Pre-edit hashes were captured and rechecked for the deterministic validator, extraction schema block, finalized maintenance implementation, learning domain and concept/policy source: **5/5 unchanged**. The new prompt is the only behavioral calibration before paid dispatch. Evaluation diagnostics changed to report raw/validated/admissible counts and apply the requested >=6/8 gate; corpus, labels, requests, batching and deterministic replay stayed the same. The evaluator asserts that all cases and request data exactly match the previous frozen manifest.

Quote/source validation, supported-action checks, prerequisite authority, personality/NSFW exclusions, delivered-turn provenance, semantic uniqueness, pre-accumulation feedback rejection, four slots, 3/4/5 thresholds, eight-candidate cap, 40-turn expiry, no-overwrite and persistence were not loosened or redesigned. See [Pass 2 implementation details](D10_MANNERISM_PASS2.md).

## Offline calibration before paid calls

All eight labeled positives still have representable admissible observations. Existing hard negatives, ambiguous controls, unsupported possession and global duplicate tests remain protected. A new transport-to-domain regression checks the separate first-occurrence task and returns a literal trigger-free proposal with **no prior candidate**: the engine accepts one evidence entry but does not promote it. This tests observable behavior through the provider/parser/maintenance boundary rather than just snapshotting prompt text.

Pre-live checks: typecheck passed; **1,885 tests, 1,881 passed, zero failures, same four TODOs**; playthrough **25/25**. No paid calls occurred before these checks.

## Frozen live matrix

[Evaluator](../../src/dev/eval-mannerisms.ts):

```text
node .build/src/dev/eval-mannerisms.js --calibrate-qwen
```

Same model, 25 cases, seven batches, schema, requests and labels as Pass 2. The 25 cases contain eight positives, five personality controls, three unsupported possessions, three NSFW/consent controls, three ambiguous controls, two recorded finalized engine golden narrations, and one owned global duplicate. Recorded engine golden turns are not an organic player-save sample.

| Batch | Cases | Raw proposals | Quote/grounding validated | Admitted to learning | Cost USD | Latency ms |
|---|---:|---:|---:|---:|---:|---:|
| Gaze and two-finger aliases | 4 | 4 | 4 | 4 | 0.000418040 | 4,998.3 |
| Clothing/object/cadence/door | 4 | 4 | 4 | 4 | 0.000291424 | 6,332.6 |
| Personality | 4 | 0 | 0 | 0 | 0.000105444 | 1,330.7 |
| Personality/unsupported possessions | 4 | 0 | 0 | 0 | 0.000106794 | 1,621.9 |
| NSFW/consent/ambiguous smile | 4 | 0 | 0 | 0 | 0.000105744 | 1,533.8 |
| Ambiguous/recorded finalized play | 4 | 0 | 0 | 0 | 0.000106644 | 1,418.6 |
| Globally owned gaze | 1 | 1 | 1 | 0 | 0.000093304 | 2,020.2 |
| **Total** | **25** | **9** | **9** | **8** | **0.001227394** | **19,256.1** |

Provider: **Alibaba**, all seven calls. Every response was structured-valid, acknowledged all supplied ownership IDs and completed without a provider error.

**Raw versus accepted:** nine literal proposals pass quote/action/grounding validation. The ninth describes an actual behavior already owned by another NPC and explicitly reports that owner's ID. The unchanged global-uniqueness domain rejects it **before acquisition**. Eight proposals enter candidate learning; no live-matrix permanent promotion occurs because each positive family has only one or two independent moments.

| Metric | Result |
|---|---:|
| Accepted positive recall | **8/8 (100%)** |
| False negatives | **0** |
| Raw hard-negative proposals | **0** |
| Accepted personality FP | **0/5** |
| Accepted unsupported-world FP | **0/3** |
| Accepted NSFW/consent FP | **0/3** |
| Raw and accepted ambiguous FP | **0/3** |
| Recorded ordinary-play FP | **0/2** |
| Global semantic duplicate acquisition errors | **0/1** |
| Admitted-learning precision on these labels | **8/8 (100%)** |
| Malformed responses | **0** |

Negative/abstention controls admit **0/17** acquisition observations. The owned duplicate is a supported literal occurrence, but not eligible acquisition evidence; it is not personality pollution. Its separate rejection is retained in domain metrics.

Mean batch latency **2.751 seconds**, median **1.622 seconds**, maximum **6.333 seconds**; total **19.256 seconds**. Cost reported for every call: **$0.001227394**. This pass uses exactly **seven paid calls**; Luna and narrator paid calls: **zero**. Historical failed Pass 2 cost is separate ($0.000778216).

## Positive alias proof and integration

The live model maps both Maren gaze variants to `gaze_lower/before_lie`, and both Brenna finger variants to `two_finger_tap/while_waiting`. Replaying each original batch through the unchanged domain creates **two candidates with two independent evidence entries each**. This establishes positive semantic clustering from actual live responses, not just fabricated offline classifier output.

[Replay implementation](../../src/dev/mannerism-calibration-replay.ts) uses those accepted live gaze decisions in **16 actual `GameSession`/`TurnCoordinator` finalized fixture turns**, with no HTTP calls:

1. Two differently worded occurrences plus two quiet turns reach the four-turn cadence, creating one two-evidence candidate.
2. Normal save serialization/decoding and campaign restore preserve the candidate and snapshot exactly.
3. A third independently finalized occurrence, followed by quiet turns, promotes slot 2 after three distinct source moments. The existing user cue is unchanged.
4. The subsequent real narrator request contains **“Lowers their gaze before an obvious lie.”**
5. Four post-promotion equivalent occurrences are rejected as existing-cue feedback, with **zero reinforcement**.
6. Four equivalent occurrences by the other NPC are rejected by campaign-global uniqueness. No candidate or additional cue is acquired.

The third moment reuses an accepted live classification for the same fixture prose at a new finalized source; it is not another paid classification. Source sequences and ownership envelopes are rebound for replay. Other-NPC subject substitution is a deterministic uniqueness test, not a claim that an additional live request was made. All promotion/feedback checks run through the normal quote validator and domain.

The [credential-free frozen response fixture](../../tests/fixtures/d10-calibrated-extraction.json) retains all seven real responses, metadata and request data, plus prompt/schema/corpus hashes. A regression revalidates every response and this finalized replay without network access. The test also checks that prompt/schema hashes remain frozen.

## Production decision

Winning extractor: **`qwen/qwen3.8-flash`**. Luna comparison: **NOT RUN**, because calibrated Qwen recall is >=6/8 and all safety/alias gates pass. No extra model was tested or selected.

Production extraction is **enabled by default** in `createProductionDeps()`. `ProductionOptions.enable_emergent_mannerisms: false` explicitly disables it. The independent **`MANNERISM_EXTRACTOR_MODEL`** setting overrides the validated default; an empty/unset value uses Qwen. This setting never inherits `OPENROUTER_CONTROLLER_MODEL`. Production controller stays Qwen and narrator stays GLM; configuration regression tests prove independent default and override behavior.

Cadence remains **one extraction batch per four eligible finalized sources**. With no eligible NPC+/candidate work, at full capacity without remaining learning work, or before a source batch is due, no extractor call is made. Existing empty-character maintenance can expire candidates without calling the model. No new lexical prefilter was introduced. Timeout/output/global-owner bounds and optional nonblocking failure behavior remain unchanged.

## Final checks and verdict

Final checks: **1,886 tests, 1,882 passed, zero failures, same four TODOs**; typecheck passes; dedicated playthrough **25/25**. Seventeen focused Pass 2/2B tests cover the full acquisition boundary and frozen live replay. Architecture/runtime-cycle and existing context/controller/reflection tests remain green.

**D-10 CLOSED: YES.** All required gates pass: >=6/8 live recall (8/8 achieved), zero accepted hard false positives, live alias reinforcement, deterministic promotion integration, global ownership, anti-feedback, save/load and no-overwrite. The small finite-family corpus is bounded evidence, not proof of broad organic usefulness. Conservative source/name restrictions, unsupported action families and bounded pending-source loss on reload remain documented implementation limits. **D-09 organic reflection usefulness remains separate; D-04/D-05 stay closed; D-06 is unchanged.**

Raw artifacts are ignored under `saves/d10-mannerisms/pass2b/`: safety baseline, Qwen frozen manifest and seven request/response/domain records, summary, integration proof and check logs. No prompt edits or additional paid requests followed the first calibrated output.

Pass 1 baseline: `main` at `f92c801`. Complete preserved Pass 2 plus calibrated Pass 2B is published together from `feat/d10-emergent-mannerisms` with commit subject **`feat: add emergent npc mannerism learning`**, then fast-forwarded to main after checks. The commit containing this report identifies the complete implementation.
