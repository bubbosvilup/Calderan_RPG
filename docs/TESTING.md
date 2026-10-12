# Testing

Status: Current. Last reconciled: 2026-10-12 (main c0608a6). Source of truth: `package.json`, `tests/`, `scripts/`.

## Commands

| Command | What it does | Spends credits |
| --- | --- | --- |
| `npm run typecheck` | `tsc --noEmit` | no |
| `npm run build` | compile to `.build/` | no |
| `npm test` | build, then `node --test .build/tests/*.test.js` | **no**: offline, providers are faked or injected; no live LLM or image call |

Latest recorded result: **3334 tests, 0 failed** on top of `5edcd37` (consolidation block 3: `consolidation-block3.test.ts`, 21 tests, plus the product-path regression in `person-offer-e2e.test.ts`; block 2: `consolidation-block2.test.ts`, 26 tests; block 1 had 3287); earlier recorded run 3278 at `c0608a6` (see [report](evaluations/PERSON_ACTUAL_OFFER_END_TO_END_FIX.md); the Heartstone rite tests are `explicit-npc-plus-promotion.test.ts` and `heartstone-rite.test.ts`, browser check `scripts/explicit-promotion-browser-check.mjs`). Do not hardcode counts elsewhere; historical reports keep their own.

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

Browser checks are not part of `npm test`; UI behavior is covered by server/read-model tests. Two scripted Playwright checks exist for development (`scripts/explicit-promotion-browser-check.mjs`, `scripts/actual-offer-browser-check.mjs`; offline, scripted providers, they need the `.build` output and a Playwright install, and their paths are environment-specific). Screenshots in `docs/ui-screenshots/` are older manual captures.

## Historical replay harness (dev, live, not part of `npm test`)

`src/dev/historical-replay.ts` replays the 421 historical player messages through the real engine from a fresh campaign (live Narrator and Controller; run with `OPENROUTER_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1` inside the sandbox, and `npm test` WITHOUT that variable). `src/dev/historical-replay-compare.ts` scores the result against the frozen oracle (`evaluations/HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md`) with all 32 MUST_MATCH checks; a unit test asserts the check count. `--anchors <file>` adds the frozen replay-only turn anchors (`evaluations/historical_replay/HISTORICAL_TURN_ANCHORS.json`, hash-pinned) to the Narrator's last user message through `ProductionOptions.narrator_wrapper`; anchors never write state, and production source outside `src/dev` must not reference them (tested). Reports: [pass 1](evaluations/HISTORICAL_CAMPAIGN_REPLAY_CERTIFICATION.md), [pass 2](evaluations/HISTORICAL_REPLAY_FIDELITY_PASS2.md).

## Player-authorized actions: how to test

- **Heartstone:** explicit-action tests (`explicit-npc-plus-promotion.test.ts`) replaced the semantic oath-matcher tests; prose never promotes.
- **Actual Offer** (`actual-offer-v1.test.ts`, `actual-offer-ui.test.ts`): test separately offer interpretation (goods G, negotiation N, person P, negatives for auction/silver/questions/hypotheticals), UI presentation, identity masking (security regression), acceptance settlement and atomicity, idempotency, persistence (save/load) and browser behavior. Offline browser check: `node scripts/actual-offer-browser-check.mjs` (scripted narrator/controller, zero live calls).
- **Identity:** `foreground-canonical-binding.test.ts`, `person-offer-e2e.test.ts` (spoken price forms, stable subject, Slave NPC on Accept, rename). Live certification harnesses `src/dev/identity-live-cert.ts` and `src/dev/person-offer-live-cert.ts` spend credits and are never run by `npm test`.
- **Future certification policy.** A transcript-only replay cannot certify player-authorized actions (the frozen 421-turn oracle is historical and is not modified). A future ~100-turn benchmark should be designed against the current architecture with a scripted **action log**: per relevant turn the player input, Narrator response, Controller result, any explicit player action (`accept_trade_offer`, `completeHeartstoneRite`, save/load) and the expected authoritative delta, plus the expected final state. This is a recommendation; it is not built. The historical replay harness (`payment_gap`) still expects in-turn person transfer and needs adapting before it is run again.
