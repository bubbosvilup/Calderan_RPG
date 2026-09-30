# Calderan live NPC regression — Repair 1.2

2026-09-30. Small diagnostic/fix pass after [Repair 1.1](CALDERAN_LIVE_NPC_REGRESSION_REPAIR_1_1.md). No canon, portrayal, retrieval or physical-interaction change was made; `data/` is unmodified.

## Files changed

- **Controller diagnostics:**
  - [errors.ts](../../src/llm/errors.ts): optional debug-only `ControllerParseDiagnostic` on `ProviderError`.
  - [controller-schema.ts](../../src/llm/controller-schema.ts): `diagnoseControllerOutput` reports why the output failed. Strict parsing is unchanged.
  - [deepseek-controller.ts](../../src/llm/openrouter/deepseek-controller.ts): attaches raw output text, model, `finish_reason`, usage, expected schema and parse error.
  - [turn-coordinator.ts](../../src/turn/turn-coordinator.ts) and [turn-services.ts](../../src/dev/turn-services.ts): an optional `debug_sink` receives it with campaign ID, base revision, player input and stage. The record is never part of any player-facing event.
- **Dialogue premise and gesture/thought agency:** [narration-audit.ts](../../src/turn/narration-audit.ts).
- **Tests and harness:** [live-regression-repair-1-2.test.ts](../../tests/live-regression-repair-1-2.test.ts) (new) and [live-npc-regression-repair-1-2.mjs](../../scripts/live-npc-regression-repair-1-2.mjs) (new, gift step only).
- **Handover evidence:** unchanged. The Repair 1.1 Mereth retraction fix remains and is verified.

## New deterministic tests (6)

- **Parse failure:** keeps raw output and metadata, classifies JSON, schema and campaign-validation failures, and leaves parsing strict.
- **Debug sink:** receives the diagnostic; player-facing events never contain the raw output.
- **Dialogue premise:** the exact Mereth line ("I don't give gifts twice … Keep them … They aren't coming back to me") is flagged. Four other presupposing lines are flagged. The allowed denials ("I never actually gave them to you", "You can't return what I still have", "I was offering them, not handing them over") and conditionals pass, as do ordinary gift turns and cases where Nicco really holds the item.
- **Agency (flagged):** the exact Livia sentence, plus all nine examples from the brief (gestures, nods, smiles, thoughts, beliefs, decisions, suspicions, looks, feelings).
- **Agency (allowed):** authored gestures and thoughts, passive or involuntary consequences ("is shoved", "is struck and his head snaps back", "loses his balance"), authored speech, and authored returns.
- **Retraction:** the exact Mereth sentence ("she says, her grey eyes appraising him … she might give any of her charges") does not retract the handover.

## Offline gates

| Gate | Result |
|---|---|
| `npm test` | 844/844 (838 + 6) |
| `npm run test:playthrough` | 25/25 |
| `npm run typecheck` | pass |

## Live gift-step diagnostic

`2026-09-30T03:24:43Z`, exact input `<Name> gives Nicco a pair of leather boots.`, one attempt each, no return step. Artifacts are in [live-npc-regression-repair-1-2-2026-09-30T03-24-43-666Z](live-npc-regression-repair-1-2-2026-09-30T03-24-43-666Z/manifest.json).

| NPC | Gift committed | Outcome |
|---|---|---|
| Sister Mereth | No | Controller `structured_output_invalid`; nothing was shown or committed. The retraction fix was not reached live. |
| Mira Thorne | No | The draft narrated a clean handover ("Nicco takes the boots from her."), but the controller proposed `{"commands":[]}`. The audit flagged the uncommitted handover, and the revision delivered Mira still holding the boots out. State and narration agree. The "footwear" category evidence was not exercised (the draft said "boots"). |

**Raw-controller diagnostic (Mereth).** Upstream `Phala`, model `deepseek/deepseek-v4-flash-0731:nitro`, `finish_reason: stop`, 2242 prompt / 54 completion tokens. Raw output:

```json
{"commands":[{"kind":"transfer_item","item_id":"campaign_item_regression_leather_boots","owner_id":"nicco","position":{"kind":"carried","character_id":"nicco"},"evidence":"Nicco takes the boots from her."}]}
```

Parse error: `schema_mismatch`, matching neither accepted shape. The command itself is correct. The model mixed the two schemas: it used the flat legacy command shape and added an `evidence` field inside the command, instead of `{"command": …, "evidence_quote": …}`. The requested `json_schema` (strict) was evidently not enforced upstream. This most likely also explains Repair 1.1's three identical failures, though those raw bodies were not captured.

## Remaining issues

- **Controller reliability is now the main blocker for inbound gifts.** The upstream ignores the strict schema (malformed hybrid output) or omits the proposal (`commands: []`) even when the draft narrates a clear handover. Strict parsing and proposal-first authority correctly prevent any mismatch, but gifts do not commit.
- The Mereth retraction fix and the "footwear" category evidence are verified deterministically only; neither was reached live.
- All other items listed in Repair 1 and 1.1 are unchanged and out of scope here.

REPAIR 1.2 ISSUES REMAIN
