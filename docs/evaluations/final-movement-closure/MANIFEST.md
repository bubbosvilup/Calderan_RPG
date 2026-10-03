# Final movement closure — raw live batch manifest

The 13 raw live JSONL batches behind [CALDREVAN_FINAL_MOVEMENT_DEBT_CLOSURE.md](../CALDREVAN_FINAL_MOVEMENT_DEBT_CLOSURE.md) were removed from the
tracked tree in the repository cleanup. They are retained in git history at commit `9faa6b8` (links below). No test reads them;
the live wordings that mattered are promoted verbatim into `tests/live-movement-regression.test.ts` and `tests/final-movement-closure.test.ts`.
Regenerate new batches with `src/dev/probe-final-movement-live.ts`.

| Batch | Rows | Bytes | Cost (EUR, summed `cost_eur`) | SHA-256 (first 16) |
|---|---:|---:|---:|---|
| [live-batch1.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch1.jsonl) | 100 | 184684 | 0.2641 | `8af2d076a34ebe4e` |
| [live-batch2.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch2.jsonl) | 100 | 184199 | 0.2391 | `763465b37bcb2847` |
| [live-batch3.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch3.jsonl) | 120 | 221684 | 0.2794 | `a600d0aaa38ae4e1` |
| [live-batch4.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch4.jsonl) | 120 | 220469 | 0.2662 | `2c2d07c0010a4246` |
| [live-batch5.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch5.jsonl) | 120 | 221056 | 0.2779 | `fef352859c450891` |
| [live-batch6.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch6.jsonl) | 120 | 221496 | 0.2696 | `2062275c7d676cec` |
| [live-batch7.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch7.jsonl) | 120 | 222531 | 0.2696 | `344c1c299d696685` |
| [live-batch8.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch8.jsonl) | 120 | 224901 | 0.2784 | `0712d6e653c04352` |
| [live-batch9.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch9.jsonl) | 192 | 350567 | 0.4487 | `f05666d09d784435` |
| [live-batch10.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch10.jsonl) | 192 | 357256 | 0.4378 | `c0d0e1f20888d4b4` |
| [live-batch11.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch11.jsonl) | 192 | 352024 | 0.4322 | `6814ea7a06a01980` |
| [live-batch12.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch12.jsonl) | 192 | 350904 | 0.4457 | `4ed3e99dfd5b9db6` |
| [live-batch13.jsonl](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/final-movement-closure/live-batch13.jsonl) | 192 | 358112 | 0.4606 | `8bf65b4e0e4a6b6c` |
