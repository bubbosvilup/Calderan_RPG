# D-09 organic characterization usefulness soak

Verdict: **SOAK PENDING; D-09 CLOSED: NO.** This evaluation stopped at the first clear extraction failure, before the planned 25-turn Stage B completed. It establishes neither reflection usefulness nor uselessness. No production behavior was changed and no additional technical debt is assigned from this one contained rejection. Human characterization review is pending.

## Dataset and provenance

Baseline: `51d992119baaaf09a65dbca1b5d7fbc2b2cb7427`, evaluation branch `eval/d09-organic-soak`. Production source and canonical data were fingerprinted before paid execution and verified unchanged afterward. The evaluation scripts import the built engine; they do not patch providers or prompts. Run `npm run build --silent`, then `node docs/evaluations/d09-soak.mjs` for the unpaid preflight. Paid execution requires `--stage-b` and refuses an existing run marker. Do not delete the marker to reroll these results.

| Source | Coverage | What it can establish |
|---|---:|---|
| User CSV `playtrough_example/thread_2026-09-16_caldrevan-dark-fantasy-isekai_nicco-wzlau.csv` | 421 paired exchanges available; 160-exchange window, pairs 261–420, screened offline | Historical prose and recurring motifs; no compatible current-engine state or exposure attribution |
| Previous NPC+7 / continuation / NPC+8 / NPC+9 summaries | 31 + 30 + 120 + 120 = 301 archived live synthetic turns | Prior summaries report zero organic developments and zero reflections; full prompt/state/retrieval chains are unavailable |
| Current Stage B | 4 finalized synthetic turns of 25 planned; 3 NPC+ | Actual current engine/provider/lifecycle traces, first extraction batch, seed-cue rendering, save/load |
| New ablation/control generations | 0 | Not performed after paid stop |

The historical file SHA-256 is `245d5a69c70c8838e0234017a8789443ca67b5c0f09b8ba459ad6ef8d7dc14fb`. Name presence in the 160-exchange window: Brenna 160, Maren 112, Gerome 54. These are whole-exchange mentions, not independently attributed actor actions. Lexical screens for guardedness, vulnerability and body-language clichés co-occur across names and cannot prove that Gerome has human psychology or that any current subsystem caused homogenization.

No compatible organic campaign save was available. The local D-04 fixture save had no NPC+ and was preserved. Current execution used the noncanonical `turnFixture()` world, with three household memberships as scenario setup. No histories, relationships, reflections, candidates or promotions were seeded. The normal production membership behavior assigned one seeded mannerism per NPC; these are **not emergent acquisitions**. Brenna's registered recovering condition/appearance and Gerome's authored silent-construct trait remained the available baseline. Brenna and Maren had no authored personality/voice/social-style contracts. Historical biography was not imported into this sparse fixture.

All raw requests, provider output, finalized text, before/after snapshots, ledger, original plan, blind answer key and disposable save are ignored under `saves/d09-soak/`. Public reports contain no credentials. The blind packet contains 14 passages: ten selected mundane historical exchanges plus all four current finalized turns, with consistent anonymization and preceding context. It is a qualitative sample, not 14 independent trials or an A/B experiment.

## Frozen lifecycle and scope actually exercised

The harness composes `GameSession`, `TurnCoordinator`, the production narrator/controller/reflection/extractor providers, lexical retrieval, the default budget manager, and production lossless compaction wiring. Models stayed frozen: narrator `z-ai/glm-5.2`, controller and extractor `qwen/qwen3.8-flash`, reflection `deepseek/deepseek-v4-flash-0731:nitro`. Narrator output limit remained 512; reflection limit 600; extractor limit 2048; standard retry policy and disabled hidden reasoning remained unchanged. Cadence, schemas, prompts, retrieval weights and promotion thresholds 3/4/5 were not edited.

All four narrator/controller turns finalized once, with no retry, reconciliation, redaction, audit issue or rejected controller command. All controller proposals contained no commands. Mannerism maintenance journaled four finalized sources and processed sequence 4; the first extractor response failed validation nonblockingly. Reflection maintenance ran after finalized turns and skipped all four as not due. Compaction was not triggered. Retrieval mode was `none` on all four turns; the public bridge fact was already rendered as current state. No private sentinel appeared in captured narrator requests.

Actual organic relationship changes, knowledge acquisition/recall, movement continuity, long-term memory consolidation and later reflection recovery were **not reached**. They are not claimed as validated by this run. The plan included those interactions after turn 4 but paid execution stopped before them.

The final disposable campaign was saved and cold-loaded through `FileCampaignRepository`. Snapshot equality passed, including all three NPC+ slots and the learning journal/processed cursor. Saved and loaded snapshot digest: `5af48551f7781fbd529bc678bb6ecee90121ad2edb50687ffdc70907c48389b9`. The planned turn-12 continuation checkpoint was not reached; no post-load narrator turn was purchased.

## Spending and staged stop

Metering recorded exact OpenRouter `usage.cost` from every completed request. No pricing estimate was substituted for reported spend. A conservative pre-request bound used current public model prices; the evaluation hard cap was $3, below the requested approximately €7 stop and leaving the €3 reserve. No unmetered or failed transport calls occurred.

| Stage / family | Paid calls | Reported USD |
|---|---:|---:|
| Stage A offline/preflight | 0 | 0 |
| Stage B narrator | 4 | 0.018218560 |
| Stage B controller | 4 | 0.001140734 |
| Stage B extractor | 1 | 0.000488970 |
| Reflection / compressor / embeddings | 0 | 0 |
| Stage C / ablation / model judge | 0 | 0 |
| **Total** | **9** | **0.019848264** |

Total provider tokens: narrator 14,924 input / 702 output; controller 9,613 / 16; extractor 2,160 / 351. Account usage independently moved from $18.953224217 to $18.973072481: the delta exactly matches the ledger. Remaining account credit was $12.026927519. Approximate cost €0.01768, using [ECB EUR/USD reference data](https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml), dated 2026-10-02, EUR 1 = USD 1.1225; that dated rate is archived in the budget preflight.

Stage B was planned for 25 turns and stopped at turn 4 under the brief's clear-failure stop rule. Stage C was not justified by useful but insufficiently long reflection evidence: there was no reflection exposure. No rerolls, schema repair on live data, forced developments, corrective paid probes or model substitutions were performed.

## Reflection usefulness

| Measure | Current result |
|---|---:|
| Post-turn due checks | 4 |
| Triggered/provider calls | 0 |
| Notes generated / retained / retrieved | 0 / 0 / 0 |
| Relevant later uses / never-used generated notes | 0 / 0 |
| USEFUL / REDUNDANT / NEUTRAL / MISLEADING / HARMFUL | 0 / 0 / 0 / 0 / 0 |

There are no generated notes requiring a per-note source span, abstraction judgment or later-use chain. Zero is an empty population, **not** a favorable safety/usefulness score. Consequently there are no useful later-context examples and no comparison between reflection and existing memory/relationship/contract context.

The current trigger is structured evidence: at least three developments since the cursor, rollup change, or new contract evidence. Ordinary dialogue or mannerism observations alone do not feed this trigger. Each NPC had only its initial membership development here; all four traces say `skipped_not_due`. Archived 301-turn zero-reflection summaries are consistent with underexposure but do not establish the cause for every historical scene. No trigger change is proposed from this evaluation.

## Mannerisms: acquisition and portrayal are separate

| NPC | Seeded | Model-proposed observations | Accepted | Final candidates | New promotions | Slot occupancy |
|---|---:|---:|---:|---:|---:|---:|
| Brenna | 1 | 1 | 0 | 0 | 0 | 1/4 |
| Maren | 1 | 1 | 0 | 0 | 0 | 1/4 |
| Gerome | 1 | 1 | 0 | 0 | 0 | 1/4 |

All three were present and eligible in all four turns, and all three seed cues were rendered in every captured request. A manual **agent** reading, not a human verdict or automated extractor metric, finds cue-like pause prose for Brenna in turns 1–2, head leveling for Maren in turns 3–4, and gaze lowering for Gerome in turn 4. Broad action rates are therefore 2/4, 2/4 and 1/4 per present-NPC turn. Brenna and Maren each have a one-turn interval between those two appearances; Gerome has no measurable recurrence interval. At least one cue-like action appears in every turn. Four quiet scenes are too short to establish a long-run spam rate or a universal desirable rate.

| Passage | Provisional agent assessment | Reason |
|---|---|---|
| Turn 1, Brenna | NOTICEABLE BUT ACCEPTABLE | Pause after the greeting is locally plausible, though exact cue equivalence is not proven |
| Turn 2, Brenna | NOTICEABLE BUT ACCEPTABLE; recurrence flag | Another pause immediately afterward; its trigger is weaker than a quoted incoming word |
| Turn 3, Maren | FORCED / trigger weak | Head leveling accompanies a `do` versus `stay` contrast rather than a clearly established factual correction |
| Turn 4, Maren | NOTICEABLE BUT ACCEPTABLE | Correction of how Gerome's gesture is being read supplies a more plausible local trigger |
| Turn 4, Gerome | CONTRADICTORY to the cue's trigger | Gaze lowering appears despite no obvious lie; this is not evidence that Gerome actually lied |

These classifications need human review. Mere action overlap cannot prove causal influence of the cue: no omission ablation was run. Object/clothing prerequisites were not exercised; no garment, doll or possessed object was invented to execute a seeded cue. Gerome remained physically a stone construct and did not speak. Slot definitions and authoritative personality/relationships were not contaminated. However, narrator prose contains ungrounded portrayal hints: Maren's claim about prior `stay` instructions and turn-4 claims that Gerome `does it sometimes` are not established by fixture authority. The distinction between safe state and questionable prose matters.

Processed-batch metrics report zero candidates, reinforcements, promotions, existing-cue feedback rejections and global duplicate blocks because parsing failed before observation-level accounting. Those zero counters are **not** positive evidence that anti-feedback/global uniqueness were challenged successfully in this soak. No emergent learning chain reached 3/4/5; thresholds remain frozen and cannot be assessed from this dataset.

## Contained extraction failure and offline reproduction

The only extractor response was valid JSON but used `id=mannerism_r2_n0` and `id=mannerism_r2_n1` in `equivalent_owned_ids`, while `owned_reviewed_ids` correctly copied the exact IDs. The strict ID validator rejected the first prefixed ID:

```text
mannerism_extraction.observations[0].equivalent_owned_ids[0]: expected bounded lowercase snake_case ID
```

The batch status was `malformed`; learning advanced the processed cursor without accepting any observation. The response also proposed a pause quote beginning `She`, a window glance labeled `door_glance` with no supported trigger, and a construct quote beginning `Then the construct`. These violate actor/action/trigger evidence requirements independently of the prefixed IDs.

An offline diagnostic copy stripped only `id=`; it did not repair quotes, triggers, concepts or live state. Production validation then considered three proposals, rejected two for evidence and one for unsupported concept/trigger, and accepted zero. This confirms a concrete provider-quality failure but does not show loss of a valid observation in this batch. The raw replay still rejects deterministically. No production repair, per-observation salvage policy, prompt tightening or D-10 reopening was performed. A single rejected response cannot establish its organic failure frequency.

**Severe defects: NONE observed.** There was no authority leakage, invalid state commit, cross-character learned habit, identity change, save corruption or uncontrolled spending. The extraction failure and weak cue triggers are review findings, not a claim that these issues are harmless at scale.

## Ablation and character differentiation

Reflection pairs: **0**; there were no notes in any frozen request. Buying identical omission prompts would not measure reflection utility. Mannerism pairs: **0**; the clear-failure stop halted further paid work. Preferred/tied/worse counts for both systems are **unmeasured**, not zero-quality effects. No substitute LLM judge was purchased.

Historical passages support recognizably different roles: Brenna often organizes and responds bluntly; Maren learns/practices and negotiates independence; Gerome is conveyed through nonverbal service. These are qualitative readings of historical prose, not proof of current NPC+ causation. Shared guardedness, body tension and emotional-softening patterns occur; their long-term homogenization rate is unmeasured.

For the current four-turn fixture, the provisional assessment is Gerome **DISTINCT** in modality/physical identity, Brenna and Maren **PARTIALLY DISTINCT** in their immediate conversational roles but similarly quiet/reserved. This is 1 distinct / 2 partially distinct / 0 conclusively homogenized, with too little evidence for durable personality differentiation. Neither sparse authored profiles nor absent reflection justify attributing the similar affect to reflection. Sarcasm, intimidation, trauma softening and flattening require the human passages review and a longer natural campaign.

[Blind review packet](d09_review_packet.md) and [human worksheet with key after judgments](D09_HUMAN_REVIEW.md) contain 14 samples. **No human judgments have been received at report time.** Agent assessments above are not entered as human votes. The machine key remains ignored under `saves/d09-soak/review-key.json`.

## Context contribution

These are the repository's `estimateContextTokens` UTF-8-bytes/4 heuristic, **not provider-token attribution**. Actual provider prompt totals are shown separately. NPC+ total includes its shared explanation/rule as well as packed character lines; cue totals are already included and must not be added again.

| Turn | Reflection estimate | Cue-only estimate | Cues + shared rule | Complete NPC+ block | Actual narrator prompt tokens |
|---|---:|---:|---:|---:|---:|
| 1 | 0 | 51 | 113 | 398 | 3,632 |
| 2 | 0 | 51 | 113 | 359 | 3,692 |
| 3 | 0 | 51 | 113 | 359 | 3,764 |
| 4 | 0 | 51 | 113 | 357 | 3,836 |

Per-request packed NPC+ character payload ranged 673–835 characters, within the unchanged 4,000-character cap. Reported budget usage ranged 17.97–19.69%; there were no context warnings or maintenance requests. Contribution was small here; this says nothing about a long campaign with notes, recovered history or many active NPC+. Mean complete NPC+ estimate: 368.25; total across four requests: 1,473. Cue-plus-rule estimate: 113 per request / 452 cumulative. Reflection contribution: zero.

## Validation and next evidence needed

- `npm run typecheck`: passed.
- `npm test`: 1,886 total, 1,882 passed, zero failures, same four accepted TODOs.
- `npm run test:playthrough`: 25/25 passed, zero failures.
- Exact final save/load snapshot equality: passed; continuation after load was not exercised.
- Production source/canonical-data freeze: passed. Evaluation artifacts and debt-status documentation only.

D-09 is **SOAK PENDING**, not IMPORTANT technical debt merely because organic reflection evidence is insufficient. D-04 and D-05 stay closed; D-06 is untouched; D-10 stays closed. The brief's 100–200 genuine current-engine organic finalized turns, later reflection uses, 5–10 small omission pairs per exposed system, and human quality judgments remain unmet. Do not close D-09 or run Stage C just to force a note into existence.

The next evidence should come from a compatible disposable copy of an actual played campaign with natural structured developments, preserving this failed batch as part of the dataset. Review the contained extraction response and trigger fidelity before authorizing further paid measurement; keep any production fix in a separate focused task. Human review of the present packet can qualify the characterization observations but cannot supply the missing reflection/later-context exposure.
