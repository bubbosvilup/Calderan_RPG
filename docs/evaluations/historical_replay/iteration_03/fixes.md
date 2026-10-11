# Iteration 03 (assisted, full 421 turns): result and fixes applied afterwards

Result: MUST_MATCH 12/25 (see expected_vs_actual.md). 421/421 turns ok, 0 failed turns, 3056 s.
First causal divergence: turn 7. Nicco "pays up" for a quoted 400 gold; the seller never resolves the payment and no transaction commits; turn 8 lets Nicco walk away with her anyway.
Other divergences: extra fourth household rule at turn 84 (a paraphrase of charter rule 3).

Fixes made after this iteration (tests: 3158/3158):
1. Narrator rule: a quoted price that the player pays must be visibly resolved by the seller in the same reply (prompt-builder.ts; golden trace regenerated, only the system prompt differs).
2. add_household_rule rejects a restatement of an active rule topic (indoor footwear, family honesty, family protection); regression test in tests/historical-replay-regressions.test.ts. tests/household-runtime.test.ts used restatements as sample rules and now uses distinct rules.
3. canon-avatars source assertion updated for the Player branch in the scene round portrait.
(Earlier batch: multi-word number phrases, Player Avatar in the play screen.)
