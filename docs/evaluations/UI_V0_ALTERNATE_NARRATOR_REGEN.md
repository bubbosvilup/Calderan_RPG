# UI V0 alternate narrator regeneration

## 1. Purpose

Playtest-only comparison of one finalized narrator message against an explicitly selected alternate model. P10 remains SOFT OPEN: this tool collects observations and makes no quality verdict, score, production model recommendation, or automatic selection.

## 2. Architecture

`src/app/narrator-alternatives.ts` owns disposable comparison storage and a provider observation wrapper. `play.ts` opts into the wrapper through `createProductionDeps`; normal application sessions retain their existing wiring. `server.ts` associates a retained request with a successful turn's narrator message and exposes `POST /api/alternative`. The browser sends only that message ID and an allowed model ID. The endpoint calls the existing narrator adapter directly, once, without a turn pipeline or retry wrapper.

## 3. Exact request retention/reuse

Observation occurs at the provider boundary, after prompt building, context preparation/compaction, identity masking, focus projection and the one-shot UI opening setup. It clones and freezes the system prompt and every history/current-action message, in order, with the effective output token budget (production default 512). There is no new prompt, extra instruction, alternative history, retrieval, or later-state reconstruction.

When reconciliation generates a revision, the retained envelope is the last prepared request associated with the finalized delivery. Original deterministic audit/redaction can change the displayed text after generation; comparisons reuse that generation input and display raw alternate output without running audits. A failed turn receives no comparison ID. Beginning the next turn clears any failed pending capture.

The cache retains at most 200 finalized requests and their alternatives in memory. Eviction removes the oldest request/results. No campaign serialization, database, save, debug export, or request endpoint contains this cache. Existing expired transcript messages remain visible with their comparison control disabled. Server restart/reset loses requests and alternatives; page reload within the same server session restores them.

## 4. State isolation

The comparison service has no campaign, controller, coordinator, reflection, mannerism extraction, compaction, retrieval or persistence dependency. Regeneration changes only its own result map. It never changes revisions, scene/time, gold/inventory, knowledge, relationships, NPC promotion, RecentConversation, traces or save state. The server responds directly with comparison results without invoking `getView` or a game operation. Future canonical turns continue from the original narration/history. There is no replace, use, branch, or replay action.

## 5. Supported models

Exactly these entries are accepted, validated on the backend; there is no free-text model field:

| Label | OpenRouter model ID |
| --- | --- |
| MiMo-V2.6-Flash | `xiaomi/mimo-v2.6-flash` |
| Space Bunny Alpha | `stealth/space-bunny-alpha` |
| GPT-5.6 Sol | `openai/gpt-5.6-sol` |
| DeepSeek V4 Flash 0731 | `deepseek/deepseek-v4-flash-0731` |
| Hy4 preview | `tencent/hy4-preview` |
| GLM 5.3 Flash | `z-ai/glm-5.3-flash` |

## 6. UI behavior

A small accessible `Regenerate with…` select appears only on generated finalized narrator messages with a retained request. The deterministic opening and player messages have no control; provisional/failed turns are never added to the finalized transcript. Selection disables the control and shows `Generating alternative…`. Results appear underneath the original, labelled `Alternative · <model label>`, in first-selection order. Different models coexist; repeating a model replaces its previous result in place. Errors appear locally, preserve prior results and original text, and reset selection for an explicit retry. Provider text uses `textContent`, including literal markup.

## 7. Routing

Production remains `z-ai/glm-5.2`, provider order `["z-ai/fp8"]`, `allow_fallbacks: false`. Existing environment overrides remain unchanged. The production model, routing map, shared adapter and client source bytes are unchanged.

Alternates pass the explicit model with `provider: null` to the existing adapter, omitting the provider-routing field and using ordinary OpenRouter routing. There is no pinned GLM route, forced provider or automatic alternate model fallback. Existing returned actual model/provider metadata is retained on each comparison result and returned with the result, without a new dashboard.

## 8. Model-specific parameters

No model-specific tuning or capability table is introduced. The shared adapter preserves the original output budget and neutral `reasoning: { enabled: false }`, without enabling reasoning modes. No temperature, verbosity or sampling override is added; production has no such configured parameters. The transport differs only by model and removal of the production provider pin. Abort signals and per-attempt deadlines are ephemeral transport details; the comparison uses the adapter's normal 60-second timeout rather than an expired original signal/deadline.

There is no existing capability negotiation mechanism to reuse. Unsupported model/parameter/provider errors produce the compact failure message with exactly one call; there is no speculative filtering, automatic retry or changed-parameter second call. Any future compatibility adjustment needs evidence from an explicit manual request and a narrow follow-up change.

## 9. Security

Both original and alternate calls use the same backend OpenRouter client and environment key. The browser receives neither the key nor prepared requests. Existing loopback/Host, same-origin POST, JSON/content-size, CSP and no-store boundaries also protect the new endpoint. Invalid message/model combinations do not call a provider. Provider errors are caught and replaced with a fixed local message; raw errors, prompts and secrets are not logged. The observer has no logging and cannot fail a canonical turn.

## 10. Tests

All validation is deterministic and offline, including actual adapter transport tests with mock fetch and browser behavior with a DOM harness. New coverage exercises the six-model allowlist, finalized-only controls, original request identity after later turns, revision capture, unchanged system/history/action/budget bytes, model/routing-only transport differences, one-call behavior, coexistence/order/replacement, generating feedback, error preservation/retry, cache bounds, backend-only authorization and no controller/state/trace/history mutations. Continuing after a comparison retains canonical dialogue and excludes alternate dialogue.

Validation: `npm run typecheck`; `npm test`; `npm run test:playthrough`; focused `node --test .build/tests/narrator-alternatives.test.js .build/tests/ui-playtest.test.js`.

Results: typecheck PASS; unit suite 2092 total, 2088 PASS, 0 failures, 4 existing TODOs; playthrough 25/25 PASS; focused UI/comparison suite 12/12 PASS. P1/P1.2, P3.2, P6.2, P8 and P9 behavior remains unchanged. Existing exact adapter/client/config hash assertions are preserved rather than updated. Paid/live calls: 0.

## 11. Limitations

No live model availability, capability or prose-quality claim has been verified. A listed model may be unavailable or reject an unchanged neutral parameter. Comparison output is intentionally unaudited and cannot become canonical. Cache eviction/restart prevents later regeneration of expired inputs. There are no batch calls, historical-save request recovery, persisted comparisons, streaming alternative drafts or automatic evaluation. A lost HTTP response may have completed server-side; page reload recovers stored results before another explicit selection.

## 12. Manual comparison plan

1. With a backend key, launch `npm run play:ui` and complete one ordinary turn with the default GLM 5.2 narrator. Observe the original response.
2. On that finalized response explicitly choose GLM 5.3 Flash. Compare RPG formatting, name discipline, foreground/background relevance, action progression and restraint about prices.
3. Explicitly choose MiMo-V2.6-Flash or GPT-5.6 Sol for the same message. Both alternatives remain beside the original. Repeat a selected model to confirm in-place replacement; if a provider fails, retry explicitly.
4. Submit the next player action. Confirm the continuation follows only the original narration and canonical state, including gold/time/inventory and established identity.
5. Repeat a small set of observation/dialogue/progression turns, recording qualitative examples. Keep P10 soft open; do not infer a production migration from the existence of this utility.

This plan was not executed: no paid smoke test or model matrix was run.
