# UI V0 RPG format seed

`src/app/ui-playtest.ts` owns `UI_PLAYTEST_FORMAT_SEED` and a session-local one-shot narrator setup hook. Production forwards that hook through `SessionHooks` to `TurnCoordinator`, after existing context preparation and before generation. The first request appends the seed to the system prompt and prepends the deterministic opening as an assistant message. Startup makes no provider call. Later turns add neither the seed nor a compact reminder; retries of the initial request reuse its prepared prompt.

Existing history projection remains unchanged: production uses dialogue-focused history that extracts quoted dialogue, so full previous narrator prose and unquoted RPG dialogue are not guaranteed to survive that projection. This limits the history-based format-retention experiment; no history redesign was made.

Sampling, output budget (512 tokens), provider and route remain unchanged: default `z-ai/glm-5.2` through OpenRouter, pinned to `z-ai/fp8`, fallback disabled. No output processing, controller/state logic, retrieval, D-09 or other narrator behavior changes.

Files changed: `src/app/ui-playtest.ts`, `src/app/game-session.ts`, `src/app/production.ts`, `src/turn/turn-coordinator.ts`, `tests/ui-playtest.test.ts`, and this note.

Tests: `npm run typecheck` passed; `npm test` passed (2,024 pass, zero failures, four TODOs); `npm run test:playthrough` passed (25/25); focused `node --test .build/tests/ui-playtest.test.js` passed (4/4). The sandbox initially blocked Node child processes (`spawn EPERM`); the suites passed with approved process-launch permissions. Focused UI checks cover paragraph markup, provider-free startup, first-request seed/example, and absence on second and third requests (including recovery after failure). Existing provider contract tests cover unchanged wire settings. Four existing TODOs preserved.

Exact opening:

```text
*Suddenly there is daylight, dust, and the sound of voices all around Nicco.*

*Packed earth and loose gravel stretch across a broad square. Feet and wagon traffic have churned its surface into uneven tracks. The air carries the smell of animals and close-packed people. Somewhere ahead, a voice calls out above the bargaining; another answers with a price.*

*Holding pens stand beside the auction area. People wait inside them while buyers gather outside, looking them over. A handler brings a captive out for display. The conversation nearby continues without a pause.*

*At the edge of the auction, clerks attend to sale papers. Guards patrol through the traffic. Caravans are being loaded and unloaded, and people step around the work on their way between the pens and the sellers beyond. There is no hush around the trading, no attempt to conceal what is being bought.*

*The next price is called. Between the auction crowd and the holding pens, a strip of open ground remains.*
```
