# D-26 organic shadow appendix: D-09 V2

2026-10-04. **OPEN — NEEDS MORE SHADOW DATA.** The production gate remained frozen at `fefb1e0`. Fifty new finalized turns of a disposable synthetic campaign yielded no gate findings. This does not establish high precision or absence of portrayal violations. [Main soak report](D09_ORGANIC_CHARACTERIZATION_SOAK_V2.md), [gate contract](D26_EPISTEMIC_SHADOW_GATE.md), [human packet](D09_HUMAN_REVIEW_V2.md).

## Denominators and findings

| Metric | Organic finalized sample |
|---|---:|
| Finalized turns | 50 |
| Turns with packed cues | 35 |
| Cue exposures / conditional exposures | 105 / 105 |
| Emergent / observed / established exposures | 105 / 0 / 0 |
| OUT_OF_TRIGGER | 0 |
| UNSUPPORTED_RECURRENCE | 0 |
| UNSUPPORTED_AWARENESS | 0 |
| Unique turns with findings | 0 |
| Finding rate per cue exposure | 0 / 105 = 0% |
| Manual TP / ambiguous / FP among emitted findings | 0 / 0 / 0 |

There is no emitted finding to classify for severity, snapshot stability or precision. **Precision is undefined**, not 100%. Paired narrator-only ablations are a separate diagnostic sample and do not inflate the organic denominator.

All three NPCs retain one seeded cue with effective epistemic state emergent and empty recognized-by. Missing legacy fields derive conservatively; no occurrence advances state or creates awareness. Generation-time diagnostics store the actual packed-state denominators. Existing autonomous finding snapshots are preserved without reinterpretation, although this run has no new finding record.

Per NPC: 35 exposures. Brenna's pause-after-quoted-word cue has two manually recognizable performances (T20/T41), with a boundary at T23; this authored family is not among the gate's initial pause-before-name matcher. Maren has 16 head-level performances with mixed correction/clarification/opinion contexts. Gerome has no gaze-lowering lie cue performance; his ordinary bows and stillness are not treated as that cue. The initial supported family subset accounts for 70 of 105 exposures; generic habitual descriptions of stone stillness are not a reason to ban recurrence globally.

## Manual coverage observations outside the gate

These are **manual observations, not emitted gate findings**, and do not rewrite the zero finding count or invent generation-time events:

| Turn / NPC | Manual assessment | Generation-time authority and local reason |
|---|---|---|
| T6 / Maren | AMBIGUOUS, LOW | Seeded/emergent, recognized-by empty, cue packed. Subject-bound head leveling before answering an opinion question, without a clear mistaken spoken detail; independent coincidence remains plausible |
| T41 / Maren | TRUE POSITIVE, MODERATE | Seeded/emergent, recognized-by empty, cue packed. Head leveling and explicit correction of “our/your” although retained player wording already used “our”; a correction is manufactured rather than required |

The gate's narrow OUT_OF_TRIGGER matcher needs strong explicit local absence evidence, such as a factually correct confirmation. Ordinary organic inputs rarely provide the synthetic “factually correct/no mistaken detail” scaffolding. T41 is therefore a coverage miss, not proof that shadow-only behavior is unsafe or that repair can already be automated. Broader detection must be designed offline in a separate task, with coincidence controls and source-bound evidence; no matcher, prompt or text repair changed during this soak.

The T20 mannerism ablation invents prior water delivery in both conditions, which is a continuity flaw outside these three gate classes. T8 ablation's habitual reference concerns Gerome's canonical stillness, not his gaze-before-lie cue, so it is not labeled unsupported cue awareness. Retained past cue performance also survives current-cue omission; T23 head leveling appears in both paired outputs. These cases reinforce the need to separate cue attribution from general narrator style.

## Decision and evidence location

No false-positive example exists among emitted findings. Zero emitted positives cannot estimate precision or recurrence/awareness-rule recall. Unsupported epistemic states were not organically exercised: all exposures remained emergent; established/recognized-by controls belong to the earlier offline corpus, not this organic sample.

**Phase C repair design: insufficient organic gate evidence.** Collect a richer source campaign and evaluate coverage against these frozen manual misses before deciding per-rule repair. Keep D-26 OPEN — NEEDS MORE DATA. Do not conflate D-09's missing reflection chain with a D-26 repair verdict.

Ignored evidence under `saves/d09-soak-v2/`: 50 turn records preserve original diagnostics, generation-time authority/request data, local raw narration and review observations; `metrics.json`, `manual-review.json`, checkpoint reviews and `verification.json` supply totals and freeze proofs. Source/save and production files were unchanged; there are no authoritative gate events, acquired manners or awareness changes from this observer.
