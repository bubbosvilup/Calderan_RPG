# D09 reflection evidence (historical)

Status: HISTORICAL evidence, preserved byte-for-byte.

These five directories hold the frozen D09 reflection evaluation evidence: plans, freezes, captured requests and receipts, analyses and the runner copies.

| Directory | Report |
| --- | --- |
| `d09-qualifying-reflection-eligibility/` | [D09 qualifying reflection eligibility](../../D09_QUALIFYING_REFLECTION_ELIGIBILITY.md) |
| `d09-final-matched-ablation/` | [D09 final matched narration ablation](../../D09_FINAL_MATCHED_NARRATION_ABLATION.md) |
| `d09-final-relationship-ablation/` | [D09 final relationship unique-value ablation](../../D09_FINAL_RELATIONSHIP_UNIQUE_VALUE_ABLATION.md) |
| `d09-unique-value-matched-ablation/` | [D09 unique-value matched ablation](../../D09_UNIQUE_VALUE_MATCHED_ABLATION.md) |
| `d09-reflection-utility-review/` | [D09 reflection utility and packing review](../../D09_REFLECTION_UTILITY_AND_PACKING_REVIEW.md) |

**Location history.** Until Repository Cleanup A (2026-10-13) these files lived under `saves/d09-*` and were force-added there. `saves/` is gitignored and is also the runtime save root, so the evidence was moved here with `git mv`; every file is a pure rename, and its content is unchanged.

Paths recorded inside the evidence describe the historical pre-cleanup commit and were deliberately not rewritten. Examples are `saves/d09-...` in freezes, runner copies, hashes and the reports. The active harnesses in `scripts/d09-*.mjs` now read and write this directory.
