# Controller reliability pass 1

2026-09-30. Makes controller structured output robust to one safe, semantically equivalent JSON shape, without weakening authorization. It follows the raw capture in [Repair 1.2](archive/CALDERAN_LIVE_NPC_REGRESSION_REPAIR_1_2.md). No canon, portrayal, narrator knowledge rule, narration audit, physical interaction, retrieval or transfer semantics changed; `data/` is unmodified.

## Changes

**Normalization** ([controller-schema.ts](../../src/llm/controller-schema.ts), [deepseek-controller.ts](../../src/llm/openrouter/deepseek-controller.ts))

Order of parsing:

```text
raw JSON → strict evidence parse → strict legacy parse → (only if both fail) normalization rule R1 → the same strict evidence parse → unchanged authorization
```

`R1_FLAT_COMMAND_WITH_EVIDENCE` applies only when:
- the top level is exactly `{"commands": [...]}` with at most 8 entries;
- every entry is either already canonical (`{command, evidence_quote}`), or a flat command whose non-evidence fields match exactly **one** command schema, plus exactly **one** string evidence field named `evidence_quote` or `evidence` (the existing `ControllerResult.evidence` contract name).

The rule moves that field into the canonical wrapper and nothing else. It infers no missing field, supplies no default, and repairs no value. Any other shape rejects the whole output.

**Diagnostics** (debug-only `debug_sink`, never in turn events)
- On failure, the Repair 1.2 raw diagnostic now also carries the raw shape, whether normalization was attempted, the rule, the normalized JSON (if any), the reason, and the final strict-parse result.
- On success after normalization, a `controller_normalized` record carries the raw text and the same fields.
- A `controller_omission_candidate` record is emitted when a deterministic candidate has verified narration evidence (grammar confirmation or evidence verifier) but the controller proposed nothing matching. Nothing is synthesized.

**Harness:** [live-controller-reliability-1.mjs](../../scripts/live-controller-reliability-1.mjs), gift step only.

## Deterministic tests

[controller-reliability.test.ts](../../tests/controller-reliability.test.ts) (5 tests):

- **Positive:**
  - The exact captured Mereth output normalizes and strict-parses to the same transfer, with evidence and rule recorded.
  - Canonical output is untouched (no normalization record).
  - Mixed entries normalize independently: `transfer_item`, `set_knowledge` and `set_condition` as flat entries, with both evidence key names, alongside a canonical entry.
- **Negative (all still `structured_output_invalid`, with the normalization reason recorded):**
  - invalid JSON;
  - a nested `command` beside flat fields;
  - `evidence` plus `evidence_quote` together;
  - a missing `owner_id`;
  - an unknown extra field;
  - a malformed position;
  - an unknown command kind;
  - non-string evidence;
  - a flat entry without evidence beside evidence entries;
  - an extra top-level key.
- **Authorization not bypassed** (normalized Mereth output driven through the real coordinator):
  - With a verified handover, the gift commits and the record goes only to the debug sink.
  - With no narrated handover, it is rejected and nothing commits.
  - If the holder doesn't own the item, it is rejected (`rejected_reference_invalid`).
  - If the holder is absent, it is rejected (`rejected_reference_invalid`).
  - If state changes during the controller call, the turn fails as `stale_turn` and nothing commits.
- **Omission:**
  - `{"commands":[]}` with a verified narrated handover produces one omission record, and nothing is synthesized.
  - With no narrated evidence, no omission record is produced.

## Offline gates

| Gate | Result |
|---|---|
| `npm test` | 849/849 (844 + 5) |
| `npm run test:playthrough` | 25/25 |
| `npm run typecheck` | pass |

## Tiny live check

`2026-09-30T03:40:59Z`, exact input `<Name> gives Nicco a pair of leather boots.`, one attempt each, no reruns. Artifacts are in [controller-reliability-1-2026-09-30T03-40-59-399Z](controller-reliability-1-2026-09-30T03-40-59-399Z/manifest.json).

| NPC | Raw controller category | Normalized? | Proposal? | Authorized? | Gift committed? | Narration/state agree? |
|---|---|---|---|---|---|---|
| Sister Mereth | canonical | not needed | yes (`transfer_item` → Nicco) | yes (grammar: handover to Nicco) | **yes** | yes |
| Mira Thorne | canonical | not needed | yes (`transfer_item` → Nicco) | yes (controller evidence: receipt by Nicco) | **yes** | yes |

No `{"commands":[]}` returns occurred, so there are no omission candidates. Both upstream calls were served by `Phala`.

## Remaining issues

- The normalization path was **not exercised live**: both controllers returned canonical output this time. It is validated deterministically against the exact captured output.
- Two live turns cannot measure the omission rate. The `controller_omission_candidate` record is in place to measure it on larger runs; omissions themselves are deliberately not fixed in this pass.
- Upstream strict-schema non-enforcement (the cause of the hybrid shape) is still an external behavior. The engine now tolerates that one lossless shape and still rejects everything else.

CONTROLLER RELIABILITY IMPROVED
