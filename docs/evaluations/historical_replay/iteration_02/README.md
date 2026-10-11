# Iteration 02 (assisted replay, aborted)

Assisted replay (location corrections from `location_assists.json`). Aborted around turn 100 because the very first purchase never committed (price parsing and seller identity gaps, see iteration 03), so the campaign state stayed at the opening and later turns added no information. Kept as evidence: telemetry in `turns.jsonl`, narration and unsafe traces under `saves/`.
