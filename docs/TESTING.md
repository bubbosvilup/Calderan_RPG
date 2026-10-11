# Testing

Status: Current. Last reconciled: 2026-10-11. Source of truth: `package.json`, `tests/`, `scripts/`.

## Commands

| Command | What it does | Spends credits |
| --- | --- | --- |
| `npm run typecheck` | `tsc --noEmit` | no |
| `npm run build` | compile to `.build/` | no |
| `npm test` | build, then `node --test .build/tests/*.test.js` | **no**: offline, providers are faked or injected; no live LLM or image call |

Latest recorded result for this reconciliation: **3205 tests, 0 failed** (after the explicit NPC+ promotion pass, see [report](evaluations/EXPLICIT_NPC_PLUS_PROMOTION_RITE_SIMPLIFICATION.md); the Heartstone rite tests are `explicit-npc-plus-promotion.test.ts` and `heartstone-rite.test.ts`, browser check `scripts/explicit-promotion-browser-check.mjs`). Do not hardcode counts elsewhere; historical reports keep their own.

## Layers

1. Unit and domain tests (campaign state, items, households, calendar, weather, authorization).
2. Matrix and replay tests (evidence, intent, controller schema, recorded turns).
3. Persistence, migration and save/load tests.
4. UI and read-model tests (`ui-*.test.ts`, `inventory-ui.test.ts`, capabilities, item visuals).
5. Canon and data validation (authored YAML, climate profiles, exposure).
6. Determinism guards (no `Date`/`Intl`/`Math.random` in the calendar).

## Tools that can spend credits (never run by `npm test`)

Anything needing `OPENROUTER_API_KEY` or `HF_TOKEN`: `inspect:narrator`, `inspect:controller`, `bench:llm`, `play`, `play:ui` (live play and image generation), `eval:*`, `benchmark:controller`, `review:playthrough`, and `scripts/*live*`, `*smoke*`, `*bakeoff*`, `d09-*`, `anime-portrait-benchmark*`. Offline inspection tools: `inspect:time`, `inspect:scene`, `inspect:context`, `inspect:search`, `inspect:save`, `eval:retrieval`.

## Browser QA

There is no automated browser test suite in the repo; UI behavior is covered by server/read-model tests. Browser checks (screenshots in `docs/ui-screenshots/`) were manual or ad hoc.

## Historical replay harness (dev, live, not part of `npm test`)

`src/dev/historical-replay.ts` replays the 421 historical player messages through the real engine from a fresh campaign (live Narrator and Controller; run with `OPENROUTER_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1` inside the sandbox, and `npm test` WITHOUT that variable). `src/dev/historical-replay-compare.ts` scores the result against the frozen oracle (`evaluations/HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md`) with all 32 MUST_MATCH checks; a unit test asserts the check count. `--anchors <file>` adds the frozen replay-only turn anchors (`evaluations/historical_replay/HISTORICAL_TURN_ANCHORS.json`, hash-pinned) to the Narrator's last user message through `ProductionOptions.narrator_wrapper`; anchors never write state, and production source outside `src/dev` must not reference them (tested). Reports: [pass 1](evaluations/HISTORICAL_CAMPAIGN_REPLAY_CERTIFICATION.md), [pass 2](evaluations/HISTORICAL_REPLAY_FIDELITY_PASS2.md).

## Player-authorized actions: how to test

- **Heartstone:** explicit-action tests (`explicit-npc-plus-promotion.test.ts`) replaced the semantic oath-matcher tests; prose never promotes.
- **Actual Offer** (`actual-offer-v1.test.ts`, `actual-offer-ui.test.ts`): test separately offer interpretation (goods G, negotiation N, person P, negatives for auction/silver/questions/hypotheticals), UI presentation, identity masking (security regression), acceptance settlement and atomicity, idempotency, persistence (save/load) and browser behavior. Offline browser check: `node scripts/actual-offer-browser-check.mjs` (scripted narrator/controller, zero live calls).
- **Future certification policy.** A transcript-only replay cannot certify player-authorized actions (the frozen 421-turn oracle is historical and is not modified). A future ~100-turn benchmark should be designed against the current architecture with a scripted **action log**: per relevant turn the player input, Narrator response, Controller result, any explicit player action (`accept_trade_offer`, `completeHeartstoneRite`, save/load) and the expected authoritative delta, plus the expected final state. This is a recommendation; it is not built. The historical replay harness (`payment_gap`) still expects in-turn person transfer and needs adapting before it is run again.
