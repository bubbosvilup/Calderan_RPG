# D-09 Full Semantic Validator Calibration: BLOCKED (corpus not recoverable)

Date: 2026-10-04. Status: **not run.** No provider call, no production change, no rule change. D-09 is NOT closed.

## Corpus recovery

**Recovered: NO.** The raw bake-off artifacts (`saves/d09-reflection-bakeoff/`: `corpus.jsonl`, `manual-review.json`, `analysis-pass1.rows.json`, stability rows, `runs/*/results.jsonl`, `corpus-manifest.json`) were produced by the cloud session behind commit `01370e7`. They were gitignored, so they never left that machine. Searched:

- this working copy;
- all local and remote branches after `git fetch --all --prune` (no file matching `d09-reflection-bakeoff`, `analysis-pass1`, `manual-review.json`);
- `C:\Users\be_fr` recursively, plus drives D:, E:, F: and G: (depth 7), for `analysis-pass1.rows.json`, `corpus-manifest.json` and `stability-preregistration.json`;
- other Claude sessions on this machine: none reachable.

Per the task (section 1), outputs were not regenerated, nothing was relabelled, paid work stopped, and the four rules were not altered.

## Frozen candidate (for the eventual run)

| File | SHA-256 |
|---|---|
| `docs/evaluations/d09-reflection/semantic-rules.mjs` (git blob `360e841e`, unchanged since `397cad9`) | `cb3abd33b661decc8a62a8b980c15686f8589fe2fffa04728d171baa87c693cc` |
| `docs/evaluations/d09-reflection/semantic-calibrate.mjs` | `45622d9377c0ad6110ebc1e2ade521bcd83056e00bba23b01e4cf7a48ece8634` |

Expected corpus once recovered: 148 proposals (128 pass 1 + 20 stability). Labels: USEFUL 4, NEUTRAL 52, REDUNDANT 49, MISLEADING 36, HARMFUL 7. These counts come from `manual-review-pass1.py` and `manual-review-pass2.py`.

## Results

| Section | Result |
|---|---|
| Baseline accepted / four-rule full result / per rule / neutral review / anti-overfit | not run (no corpus) |
| Useful preservation (FX04, FX10, other two) | unknown; only the FX04 Qwen item (V3#3) has been checked, and it is preserved |
| Production candidate | **NO** (gate not evaluable) |
| Structured ownership | not implemented (section 11 runs only after the gate passes) |
| Live DeepSeek check | not run, 0 calls, $0.00 |
| Production changed | NO |

The only measured evidence is still the 20-item in-sample subset in `D09_SEMANTIC_REFLECTION_VALIDATOR.md`.

## Security

`.gitignore` now also covers `*.env`, `*APIKEY*`, `*apikey*`, `*api_key*` and `*api-key*` (commit `96efcfb`). `git check-ignore -v APIKEY.env` matches `.gitignore:11:*apikey*`. No credential file is tracked.

## D-09 status

**SOAK PENDING: semantic candidate not yet tested on the full corpus (corpus unavailable).**

## Next step

Copy `saves/d09-reflection-bakeoff/` from the machine or session that ran the bake-off into this repository, unchanged. Check `semantic-rules.mjs` against the hash above, then run:

```
node docs/evaluations/d09-reflection/semantic-calibrate.mjs --full saves/d09-reflection-bakeoff --rows <pass1 rows>,<stability rows>
```

Continue with this task's sections 2–27 only from that output.
