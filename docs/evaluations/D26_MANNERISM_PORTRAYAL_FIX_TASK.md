# D-26 — Mannerism portrayal trigger fidelity

Status: OPEN, nonblocking portrayal-quality debt. [Reproducing probe](MANNERISM_PORTRAYAL_FIDELITY.md). D-10 remains CLOSED; D-09 remains SOAK PENDING.

2026-10-04 update: one minimal shared-instruction trial passed deterministic checks but failed its 22-call live gate (Brenna 2/3, Maren 0/3). It was rolled back. **PROMPT-LEVEL CONTROL INSUFFICIENT.** No more prompt tuning in this pass. Next step is a separately scoped design for narrow conditional-cue audit/reconciliation, not an automatic implementation. [Trial and proposed design boundaries](D26_MANNERISM_PORTRAYAL_FIX.md).

Problem: GLM can preserve the small visible action while dropping its authoritative local condition. It paused Brenna in a silent, no-address scene and called the pause habitual; it leveled Maren's head while she confirmed an already correct fact. The latter repeated on the same frozen normal request and disappeared in one matched cue-omission output. This is a narrow narration failure, not malformed learning data or an invalid campaign commit.

Evidence is archived in `saves/mannerism-portrayal-probe/`: `output-A-negative.json`, `output-B-negative.json`, `output-control-B-negative-with.json`, and `output-control-B-negative-without.json`. The first two are independent scenario/cue families; the extra Maren draw replicates one scenario. No systematic other-NPC habit confirmation, personality generalization, neutral adjacent spam or severe state contradiction was reproduced. Do not broaden this task on the basis of those unobserved failure classes.

Separate-pass scope:

1. Inspect the existing narrator-side optional-cue instruction and its treatment of exact conditions. Prepare the smallest portrayal-only correction warranted by the evidence; do not implement it as part of this probe.
2. Preserve optional positive use. The narrator may naturally omit a cue when its trigger is present; absence is not a recall failure.
3. Prevent treating a conditional cue as a generic action/habit, including claiming an unrelated action is habitual without authority. Do not infer broad psychology, biography, consent or personality from cue presence.
4. Reuse the frozen scenario matrix and omission semantics as a regression evaluation, retaining this original failed dataset. Any new paid validation must be a separately identified run, never a replacement/reroll of these outputs.

Keep acquisition, 3/4/5 thresholds, extractor, candidates, global uniqueness, reflection, retrieval, seed definitions, narrator model/sampling and D-04 context logic unchanged. Do not switch to another model or delete cues globally to make the matrix pass. Any necessary change outside narrator portrayal requires its own justification and task.

Acceptance evidence: positive cases remain valid with correct use or natural omission; repeated independent negative cases no longer generalize cues beyond their triggers; no unsupported habitual claims or cue-derived personality/psychology; no severe contradiction; control pairs do not show obvious cue-driven distortion. Judge frequency qualitatively rather than setting an arbitrary ideal rate. Include human/manual review and distinguish omitted cues from misused cues. A single stochastic improvement does not close D-26.

After closure, resume D-09 only with enough natural current-engine structured developments and later-context reflection exposure to answer its original usefulness question. This task does not itself establish reflection utility.
