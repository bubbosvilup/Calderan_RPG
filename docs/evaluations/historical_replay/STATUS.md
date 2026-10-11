# Historical replay: STATUS

- Phase: PASS 2 FINISHED (final report: `../HISTORICAL_REPLAY_FIDELITY_PASS2.md`)
- Oracle frozen: YES (`oracle-v1`, sha256 in ORACLE_SHA256.txt); no corrections made
- Comparator: 32 MUST_MATCH checks. Anchors: 19 (`HISTORICAL_TURN_ANCHORS.json`, sha256 file alongside)
- Best full run: iteration 09, MUST_MATCH 22/32 (pass 1 best re-scored: iteration 04, 24/32 but without a real sale). Progression pass 2: 15, 20, 17, 22, 22, 18
- Loop stopped by directive (budget; no new subsystem could change the score). Segments 11 and 12 (turns 1-84) were targeted checks
- Open: goods purchases and silver (funds band), Maren anonymous sale live, Heartstone rite for Brenna/Maren, Controller item creation
- Git: no commit, no push (working tree only)
- Resume (only if explicitly wanted): `NODE_USE_ENV_PROXY=1 OPENROUTER_API_KEY=proxy-injected node .build/src/dev/historical-replay.js --iter NN --messages <user_messages.txt> --assist docs/evaluations/historical_replay/location_assists.json --anchors docs/evaluations/historical_replay/HISTORICAL_TURN_ANCHORS.json`
