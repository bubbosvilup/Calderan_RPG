# D-26 mannerism portrayal trigger fidelity fix attempt

2026-10-04, Europe/Rome. **PROMPT-LEVEL CONTROL INSUFFICIENT. D-26 remains OPEN.** One candidate was validated offline, frozen, and tested with exactly 22 fresh narrator calls. Maren failed all three required fresh observations; her confirming head-leveling also reappeared in the normal control and disappeared in its omission counterpart. The candidate was withdrawn from production after validation. No further prompt tuning, model switch, auditor implementation, merge or main push was performed.

D-10 remains CLOSED. D-09 remains SOAK PENDING and was not resumed. [Original probe](MANNERISM_PORTRAYAL_FIDELITY.md), [new blind packet](D26_MANNERISM_PORTRAYAL_BLIND_REVIEW.md), [open task](D26_MANNERISM_PORTRAYAL_FIX_TASK.md).

## Diagnosis and exact attempted change

Production packs each available cue as its complete original prose under `Mannerisms:`, e.g. `- Levels their head before correcting a spoken detail.` Action and condition are not split into structured fields, but neither is the condition removed. Cue keys/registry metadata are not narrator-facing. The shared instruction did not explicitly bind performance to the actual local condition and called cues recurring; that language could license generalized habituality.

Exact original shared instruction:

```text
Mannerisms are small optional recurring cues: use occasionally and naturally, never in every scene or as caricature. They do not define personality, motivation, consent or internal state. Never invent objects, prerequisites or facts to perform them.
```

Exact single candidate:

```text
Mannerisms are optional local portrayal cues: use occasionally and naturally, never in every scene or as caricature. Use a conditional cue's action only when its stated condition actually occurs in this scene; omission is valid even then. Do not generalize it or infer personality, psychology, motivation, morality, relationship meaning, consent or attraction. Cue presence establishes neither prior recurrence nor other characters' knowledge: habituality and recognition require independent authoritative history/knowledge. Never invent objects, prerequisites or facts to perform a cue.
```

Only `MANNERISM_NARRATOR_RULE` was temporarily changed. Individual cue text and packing stayed identical; no forbidden-word list or recurrence regex audit was added. The optional/occasional/natural/no-caricature safeguards remained. Production **after** this task is restored to the original rule, because the candidate failed the closure gate. Candidate source and deterministic tests are archived under the ignored fresh-run directory rather than installed as an ineffective fix.

Unchanged throughout: acquisition, extractor prompt/schema, candidate logic/expiry/caps, 3/4/5 thresholds, global uniqueness, seed library, reflection, retrieval, narrator model/route/settings, controller, campaign authority, save schema and D-04 budgeting/compaction. No controller/extractor/reflection/embedding call occurred.

## Offline validation before paid dispatch

Three focused tests exercised actual narrator packing with the existing authored pause-before-name, head-level-before-correction and gaze-lower-before-lie seeds. They checked intact action plus condition, optional positive omission, explicit condition binding, no cue-derived psychology, and independent history/knowledge requirements, without snapshotting a whole prompt. The existing packing test's wording assertion was updated while testing the candidate. Fixture setup included normal player household membership; no acquisition behavior was changed.

After correcting test setup/obsolete wording assertions, the frozen candidate passed:

- Typecheck.
- 1,889 tests: 1,885 pass, zero failures, the same four accepted TODOs.
- Playthrough 25/25.
- 22 focused D-10/D-26 tests.

No paid dispatch happened before the offline suite passed. Those tests prove the contract reaches the model, not that the stochastic model obeys it.

## Frozen fresh run

Source: all 18 original requests/snapshots under `saves/mannerism-portrayal-probe/`. Each request received exactly one substitution: old shared instruction to the candidate above. System prompt, cue definitions, scenarios, snapshot hashes, recent conversation, input, omission semantics and production provider settings were preserved. All 22 request digests, original source-file digests and fixture hashes were frozen before the first paid call. No mid-run edits occurred.

The original repeat-case requests retain their original predecessor conversation. In particular B-repeat still carries the original Brenna route question, rather than being silently rebuilt from a favorable new response. This preserves the frozen regression requests; it is diagnostic synthetic continuity, not newly finalized campaign play.

Narrator: `z-ai/glm-5.2`, pinned `z-ai/fp8`, fallback disabled, reasoning disabled, 512 output tokens, no sampling overrides. The production retry wrapper was used; all 22 calls succeeded first attempt. The original failed evidence remained unchanged. New artifacts are separate under `saves/mannerism-portrayal-probe/d26-fix/`.

Exact scenario/input matrix is recorded in the original report and frozen manifests. Target cues stayed:

| NPC | Cue | Positive trigger | Negative trigger |
|---|---|---|---|
| Brenna | Leaves a short pause just before addressing someone by an established name. | About to greet Nicco by name | Silent, nobody preparing an address |
| Maren | Levels their head before correcting a spoken detail. | Correct Nicco's false bridge-open claim; knows closed | Confirm Nicco's correct bridge-closed statement |
| Gerome | Briefly lowers their gaze before an obvious lie. | Authoritative knowingly false affirmative nod | Sincere thanks; explicitly no lie/false claim |

For each NPC, its quiet and negative-to-repeat scenarios also remained unchanged.

## Matrix/manual classifications

Reviewer: **primary agent, state-aware manual review**. User/human blind judgments are pending. Quotes were checked against raw text; word matches alone did not determine classifications. All 22 outputs were reviewed. Positive omission was permitted; all three positive outputs happened to use the target cue correctly.

| Output | Classification | Evidence/qualification |
|---|---|---|
| A-positive | PASS | Pause followed by "Nicco." |
| A-negative | OUT_OF_TRIGGER, LOW | "She left a short pause" described as one that might precede words, "but none came"; no name-address |
| A-quiet | PASS | Natural omission |
| A-repeat | PASS | Natural omission |
| B-positive | PASS | Levels head before stating closed, correcting the false open claim; stylistic wording does not erase the factual correction |
| B-negative | OUT_OF_TRIGGER, LOW | "Maren levels her head" then "It is closed," she agrees |
| B-quiet | PASS | Natural omission |
| B-repeat | PASS | Natural omission |
| C-positive | PASS for Gerome | Gaze dips before the knowingly false affirmative nod |
| C-negative | OUT_OF_TRIGGER + UNSUPPORTED_PSYCHOLOGY | "he lowered his gaze" despite no lie, given appreciative inward meaning |
| C-quiet | PASS | Natural omission |
| C-repeat | PASS | Natural omission |

The Brenna negative is an actor-specific preword pause, not merely a room remaining silent. Its coincidental-action interpretation is possible; this manual review flags the explicit preword framing and absent address at LOW severity. Even treating it more leniently cannot rescue closure: Maren's independent family fails 0/3 unequivocally.

Gerome's negative says the lowered gaze occurs in the manner of "someone who has heard a sincere thing and holds it carefully". This adds an unestablished psychological reading to the out-of-trigger action. It is one confirmed cue-related psychology concern, not evidence of a stable new personality. A bow/head inclination alone in the controls was not conflated with explicit gaze lowering.

Maren again levels her head while correcting Gerome's **nonverbal** lie in C-positive. As in the original probe, this is a boundary relative to the exact spoken-detail seed and is disclosed but excluded from confirmed failure counts. The verdict does not depend on it.

## Focused replication: closure gate fails

Two extra fresh calls per previously failing negative family used the exact new frozen normal request; no whole-matrix reruns or corrective prompts were purchased.

| Family | Matrix observation | Extra 1 | Extra 2 | Fresh passes / runs |
|---|---|---|---|---:|
| Brenna no-address | OUT_OF_TRIGGER, LOW | PASS, omitted | PASS, omitted | **2/3** |
| Maren confirms true fact | OUT_OF_TRIGGER | OUT_OF_TRIGGER | OUT_OF_TRIGGER | **0/3** |

Maren extra 1: "Maren levels her head. 'The bridge, yes.'" Extra 2: "Maren levels her head. 'It is,' she says." The latter explicitly describes no correction, only confirmation, and adds an unestablished prior-arrival timing detail. This timing detail is not counted as a mannerism-habit assertion; it is a separate unsupported-history watch item.

The two families required 3/3 fresh passes each. Neither gate passed. No further tuning is justified in this authorized pass.

## Matched controls, recurrence and frequency

| Frozen negative state | New normal control | New omission control | Result |
|---|---|---|---|
| Brenna | No pause or habitual claim | No pause or habitual claim | No distortion reproduced in this pair |
| Maren | Head leveling; text explicitly says "not correcting, just confirming" | Ordinary nod, no head leveling | Cue-driven distortion supported again by this single matched pair |
| Gerome | Head inclination; no explicit gaze lowering | Head inclination/open hand; no explicit gaze lowering | Primary error not reproduced in this pair |

Controls retained the same new shared rule; only the three packed cue sections were omitted. Unrelated dialogue/prose varied naturally between stochastic draws. There is no measured systematic personality change or flattening from omission, but three pairs cannot establish equivalence. Overall controls: **MIXED; one clear Maren distortion pair**.

Confirmed out-of-trigger counts across this run: Brenna **1**, Maren **4** (primary, normal control, two focused repeats), Gerome **1**. Three correct positive uses. No target cue repeats across any connected negative-to-repeat case pair; no cue occurs in the six primary quiet/repeat target scenes. Thus adjacent neutral spam was not demonstrated. Repeated Maren confirmation misuse is the primary failure, not a prescribed desirable frequency.

Unsupported cue habituality/retro-canonization: **0** in this fresh run. Personality generalization: **0 confirmed**. Other-NPC retro-canonization: **0**. Cue-derived unsupported psychology: **1**, Gerome's appreciative gaze interpretation. Severe cue-related contradiction: **0**. Absence of a habit claim in these 22 outputs does not establish that the candidate fixed that class universally.

Manual review distinguishes unrelated narrative flaws: A-negative places Gerome's tread downstairs despite the supplied present-state baseline; the omission controls contain ordinary inward-state metaphors; a replica adds Maren's unestablished route history. These uncommitted draft issues are not asserted as campaign-state mutations or proof of cue causality. No audit/controller ran, so this probe does not certify delivery of these drafts by the complete production lifecycle.

## Cost and latency

| Family | Narrator calls | Exact reported USD |
|---|---:|---:|
| Primary | 12 | 0.039628400 |
| Matched controls | 6 | 0.016614360 |
| Focused replication | 4 | 0.006648800 |
| **Total** | **22** | **0.062891560** |

No other paid calls, retries, missing costs or rerolls. Exact provider `usage.cost` reconciles account usage from $19.031558681 to $19.094450241, delta $0.062891560. Remaining account credit: $11.905549759. Median provider completion latency **4.058 s**; range **2.493–7.921 s** across 22 calls. The evaluator enforced the 22 physical-call limit and conservative $1 cost cap.

## Rollback and final verification

The ineffective shared-rule change and candidate-only tests were removed from production after the complete frozen run. Their exact source, tests and offline results are retained in the ignored fresh-run directory for review. Baseline production files and the existing D-10 test were restored byte-for-byte; no ineffective prompt change was merged merely because deterministic tests passed.

Restored production validation: typecheck PASS; 1,886 total / 1,882 pass / zero failures / same four TODOs; playthrough 25/25. Fresh-run hashes prove no production edits during dispatch, all original evidence preserved, cue-only omission semantics and exact same requests for focused replicas. The candidate evaluation harness refuses dispatch against the restored old rule; the archived run is read-only and cannot be rerolled through its normal entry point.

Commit: **none for an ineffective production fix**. Main: unchanged at `51d992119baaaf09a65dbca1b5d7fbc2b2cb7427`; no push. Documentation and evaluation scripts remain reviewable on `eval/d09-organic-soak`.

## Next narrow stage: design only

Propose a separate narrator audit/reconciliation design limited to **selected conditional mannerisms** and their local evidence. It should pair a suspected action span with the character's actual packed cue and inspect the stated trigger, using existing state/history/knowledge for grounding. Do not scan all narration for banned words or add new acquisition/knowledge/schema machinery.

The design must distinguish name-address pauses from ordinary silence, true-detail confirmation from factual correction, and gaze lowering before a demonstrably false claim from unrelated thanks. Unsupported habit assertions require separate recurrence/observer-knowledge evidence; ordinary "again" or authored mute traits are not violations. Ambiguous generic gestures need conservative handling to avoid over-redaction. Reuse the existing bounded reconciliation seam, with targeted tests and false-positive controls, before proposing any extra runtime calls or new metadata. No second-stage implementation is authorized or performed by this result.

**D-26 CLOSED: NO. Prompt-level correction sufficient: NO.** D-10 CLOSED; D-09 SOAK PENDING.
