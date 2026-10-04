# D-09 Semantic Reflection Validator Calibration

Date: 2026-10-04. Status: **evaluation only, INCOMPLETE: the full frozen corpus was not available.** No production code, prompt, schema, provider, trigger, cursor, persistence or D-26 behaviour was changed. No provider calls were made ($0.00). D-09 is NOT closed.

## Blocker: the rated corpus is not on this machine

The bake-off (`D09_REFLECTION_PROVIDER_SCHEMA_BAKEOFF.md`, commit `01370e7`) ran in a cloud session. Its raw artifacts (`saves/d09-reflection-bakeoff/`: `corpus.jsonl`, `runs/*/results.jsonl`, `analysis-pass1.rows.json`, `manual-review.json`) are gitignored. They are not in this working copy or in any local or remote branch (checked: `main`, every `origin/claude/*` and `origin/eval/*`). The proposal texts can't be rebuilt without provider calls, and regenerating or relabelling is out of scope by instruction. So **the 148-proposal freeze (128 pass-1 + 20 stability) could not be done.**

What is available is the 20-item blinded V3 packet (`D09_REFLECTION_HUMAN_REVIEW_V3.md`). It holds 20 proposals that the unchanged validator ACCEPTED, with the full evidence catalog the model saw, the cited refs, request ID, arm and primary-agent label (answer key). It's a subset of about 75 accepted proposals (pass 1: 15+16+17+16; stability: 6+5). All numbers below come from this 20-item subset unless stated otherwise. **They are in-sample**: I read these items while writing the rules.

The harness is built against the exact bake-off file formats, so the full run is one command once the directory is copied back:

```
node docs/evaluations/d09-reflection/semantic-calibrate.mjs --full saves/d09-reflection-bakeoff \
  --rows saves/d09-reflection-bakeoff/analysis-pass1.rows.json,<stability analysis rows>.rows.json
```

## Frozen subset (provenance)

- Source: `docs/evaluations/D09_REFLECTION_HUMAN_REVIEW_V3.md` (in git at `01370e7`).
- Manifest: `saves/d09-semantic-validator/packet/manifest.json`. It records per proposal: ID (`V3#n`), request, arm, model/schema, kind, label, text, refs, old validator result, primary-agent label and a catalog hash. Packet SHA-256 and `manifest_sha256 = a7c24969c2f409d2d325829f3ce76a267816f55015eda1ffc24eb09761549499`. The harness refuses to overwrite a frozen manifest with different content.
- No label was changed or regenerated.

## Baseline

Full corpus (counted from the committed rubric scripts `manual-review-pass1.py` / `-pass2.py`, labels only, no texts): pass 1 (128 proposals) is USEFUL 2, NEUTRAL 46, REDUNDANT 44, MISLEADING 30, HARMFUL 6. Stability draw 2 (20 proposals) is USEFUL 2, NEUTRAL 6, REDUNDANT 5, MISLEADING 6, HARMFUL 1. Total 148: USEFUL 4, NEUTRAL 52, REDUNDANT 49, MISLEADING 36, HARMFUL 7. Accepted misleading+harmful rate per arm was 24–56%. A per-proposal accepted/rejected split for the full corpus needs the raw rows.

Subset (all 20 accepted by the current validator):

| | USEFUL | NEUTRAL | REDUNDANT | MISLEADING | HARMFUL |
|---|---|---|---|---|---|
| accepted (old validator) | 1 | 9 | 1 | 8 | 1 |

Accepted misleading+harmful rate: **45%** (9/20).

## Failure taxonomy (after inspecting the subset)

The four starting hypotheses held. No fifth family was warranted. Two were narrowed:

1. **CANON_RESTATEMENT → `reflection_restates_authority`.** A character-level kind (signature_pattern / emerging_role / stance) whose label contains only membership vocabulary or the character's own canon words, with at least one membership word. Example: `emerging_role/household_member`. A role word that isn't canon (`household_quartermaster`) is left alone. Label-only on purpose: the text of a restatement varies, but the label is the claim that gets stored.
2. **PASSIVE_MEMBERSHIP_ATTRIBUTION → `passive_membership_not_character_evidence`.** A character-level kind where every cited source is canon, membership, or `household_rule_added`, and at least one is `household_rule_added`. The evidence for that last kind says "it is not X's act". `shared_motif` is exempt: it may describe repeated environment.
3. **ABSENCE_AS_TENSION → `tension_from_missing_provenance`.** An `unresolved_tension` whose contrast side ("but / yet / while …") is an absence statement ("not recorded", "not documented", "none are recorded", "unknown", "no record/cause/attribution"). The absence words aren't banned in general. They only fail as the second half of a tension.
4. **SINGLE_AXIS_PSYCHOLOGY → `unsupported_character_inference`.** A small trait/temperament lexicon (passive, bystander, recipient, reactive, resigned, compliant, reluctant, hesitant, restless, unsettled …) in label or text when no cited source is the character's own statement (a contract). Relational-trust words like "cautious" are deliberately excluded, because "growing but cautious trust" over a recorded trust dimension is an accepted production example.

## Why each rule is deterministic

Rules read only the proposal kind, label, text and cited refs, plus the cited catalog entries' `{kind, text}`. Ownership of a development (self move, self relationship change, self statement, membership, membership context, condition state…) is recovered exactly from the fixed `describeDevelopment()` templates in `src/turn/reflection.ts`. The model doesn't write those strings. There are no embeddings, no model and no provider calls. Code: `docs/evaluations/d09-reflection/semantic-rules.mjs`. A production version should carry an explicit ownership field on `ReflectionEvidence` (like `movement_only`) instead of matching template text.

## Offline result (subset, all four rules)

| Metric | Count |
|---|---|
| TP_BAD_REJECT (accepted MISLEADING/HARMFUL now rejected) | **8 / 9** |
| FN_BAD_ESCAPE | 1 (V3#17) |
| FP_USEFUL_REJECT | **0 / 1** |
| FP_NEUTRAL_REJECT | **5 / 9** |
| REDUNDANT_REJECT | 1 / 1 |
| Accepted misleading+harmful rate | 45% → 17% (1 of 6 still accepted) |

Per rule (fired on: bad / useful / neutral / redundant; request groups):

| Rule | bad | useful | neutral | redundant | unique bad catches | groups |
|---|---|---|---|---|---|---|
| reflection_restates_authority | 1 | 0 | 1 | 0 | 0 | 2 |
| passive_membership_not_character_evidence | 6 | 0 | 4 | 0 | 1 | 8 |
| tension_from_missing_provenance | 1 | 0 | 1 | 1 | 0 | 2 |
| unsupported_character_inference | 6 | 0 | 0 | 0 | 1 | 6 |

Ablation (remove one rule): without `passive_membership` the result is 7 bad caught, **2 neutral lost**. Without any of the other three, the rule set loses at most one bad catch or one redundant catch. **The three-rule variant (authority + tension + inference) is the more conservative candidate**: 7/9 bad caught, 0 useful, 2 neutral lost.

### Neutral collateral (all five, inspectable)

| Item | Note | Rule |
|---|---|---|
| V3#2 | unresolved_tension `rule_additions_alone`: "…but her own role in them is not recorded." | tension_from_missing_provenance |
| V3#5 | signature_pattern `house_rule_changes`: household accumulated rules while she remained a member | passive_membership |
| V3#8 | emerging_role `household_member`: "…yet her own contribution is never recorded." | restates_authority + passive_membership |
| V3#12 | signature_pattern `household_rules_accumulation` | passive_membership |
| V3#16 | signature_pattern `subject_to_rules` | passive_membership |

Each of these is a case the task brief itself names as a reject target ("emerging_role: household_member", "own role is not recorded → unresolved tension", signature from household rules the NPC didn't author). The primary-agent labels and the brief disagree at this boundary. Same evidence shape, rules-only signature_pattern, was labelled NEUTRAL in V3#5/#12/#16 and MISLEADING in V3#13/#14/#18. Label wording is the only difference. These five go to the human packet. They aren't counted as acceptable losses on my own judgement.

### Bad notes still escaping

- V3#17 shared_motif `rule_additions`: "Four distinct events record the addition of household rules affecting Brenna's membership." The fault is the invented phrase "affecting Brenna's membership". `shared_motif` is exempt from the passive rule by design, and catching it would need a phrase-level rule. Left as an escape.
- Unknowable without the full corpus: pass-1 failure reasons that this subset doesn't show well. Examples are factual errors (wrong counts or minutes, 5 items) and invented contrasts or presence (15 items). None of the four rules targets counting errors.

## Anti-overfit / group check

Leave-one-request-group-out over 14 request groups: for each held-out group, only rules that also catch a bad accepted note in some other group are applied. Result: **8 of 8 bad catches survive**. Rules without outside support in a held-out group: `tension_from_missing_provenance` (held out FX02) and `reflection_restates_authority` (held out play:T51:maren). Each of those catches was also made by another rule, so held-out catches don't drop. The two high-yield rules fire in 6–8 different groups across played, played-state and fixture requests. Caveat: this only checks that no rule depends on one request. It is **not** out-of-sample evidence, because the rules were written after reading all 20 items.

## Production candidate gate

**NO, not decidable.** The hard requirement is zero accepted USEFUL rejected *on the frozen corpus*. The subset holds 1 of the 4 known USEFUL proposals (pass-1 #85/#86 and FX04/FX10 from stability draw 2 are missing). FX10 is a trust trajectory "with modest interpretation", exactly the shape `unsupported_character_inference` could hit if its text uses a lexicon word. Neutral loss on the subset (5/9 with four rules, 2/9 with three) is also not yet "modest" by any agreed standard. Per section 22, no production or branch integration was made and **no live validation was run (0 provider calls, $0.00)**. Qwen check: not run.

## Tests

Rules self-test (`--selftest`, written to `saves/d09-semantic-validator/rules-selftest.json`): 16 cases, 2 rejects and 2 valid controls per family, all pass. The controls cover a real non-canon role (quartermaster), moves plus rules, a shared_motif over rules, a real trust-vs-affection tension, the useful condition tension, a literal two-step trust chronology, and a trait word backed by the character's own contract. No production tests were added because production is unchanged. Repository suite (production unchanged): `npm run typecheck` exit 0. `npm test`: 1897 tests, 1893 pass, 0 fail, 4 TODO (the accepted four). `npm run test:playthrough`: 25/25. Logs: `saves/d09-semantic-validator/*.log`.

## Artifacts

`saves/d09-semantic-validator/packet/`: `manifest.json`, `decisions.json` (per-proposal old/new decision, reason codes, cited-ref ownership), `diff.md`, `metrics.json` (metrics, leave-one-group-out, ablation); `rules-selftest.json`; suite logs. No credentials. Code: `docs/evaluations/d09-reflection/semantic-rules.mjs`, `semantic-calibrate.mjs`. Human packet: `D09_SEMANTIC_VALIDATOR_REVIEW.md`, 15 items: the accepted USEFUL, the 5 newly rejected NEUTRAL, 6 caught bad and 3 boundary cases, outcomes hidden until the answer key.

## Limitations

- 20 of about 75 accepted proposals, all in-sample, 1 USEFUL. All labels are the primary agent's, not a human's.
- Synthetic play: almost all evidence is `household_rule_added` and `moved`, so rules 1–2 are tuned to the dominant failure of a narrow corpus.
- Template-text ownership is exact today but would break silently if `describeDevelopment` wording changed. A production version should use structured fields.

## Recommendation

Copy `saves/d09-reflection-bakeoff/` from the bake-off machine and run the full mode unchanged (rules frozen as committed, no edits before the run). Proceed to a branch candidate only if it shows 0 USEFUL rejected (especially FX10/FX04 stability draw 2) and acceptable neutral loss. If it does, start with the **three-rule variant**. Keep `passive_membership_not_character_evidence` only if the human packet confirms that rules-only signature/role notes should be rejected even when labelled NEUTRAL.

## D-09 status

**D-09 SOAK PENDING: semantic validator candidate not yet validated (frozen corpus unavailable locally; subset result promising).**
