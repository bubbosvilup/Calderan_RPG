# Gemini 3.8 Flash — Vertex micro-rerun

2026-09-30. Evaluation only. Six cases from [Narrator Bakeoff 1](CALDERAN_NARRATOR_CROSS_MODEL_BAKEOFF_1.md), rerun with `google/gemini-3.8-flash` pinned to Google Vertex instead of Google AI Studio. Nothing else changed, and the original report is untouched.

## Setup

- **Provider.** OpenRouter endpoint `google-vertex/global` (standard tier, matching the bakeoff's standard AI Studio tier), `allow_fallbacks: false`. The provider reported in every response was `Google`, the OpenRouter name for Vertex. No AI Studio call and no fallback occurred.
- **Reasoning.** `effort: minimal`, as in the bakeoff. The Vertex preflight probe used 311 reasoning tokens, but no in-run output was truncated (all `finish_reason: stop`).
- **Freeze.** The `src/` + `data/` hash was `21e7eda5c434…` before and after, identical to the bakeoff. The same harness scaffolds, temporary participants, exact inputs, controller, audit and 384-token cap were used; the only differences were the case filter and the pinned provider.
- **Attempts.** One per case; no retries were needed.

## Results (Vertex)

| Case | Provider result | Knowledge | Canon | Agency | Presence | Voice | Prose | Draft flags | Revision / redaction | State | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A. Bartolomhew T4 | completed | PASS | PASS | PASS | PASS | 3 | 4 | 1 | yes / no | PASS | WARN |
| B. Blackthorn T3 | completed | PASS | PASS | PASS | PASS | 4 | 4 | 0 | no / no | N/A | PASS |
| C. Doran T1 | completed | PASS | PASS | PASS | PASS | 4 | 4 | 0 | no / no | N/A | PASS |
| D. T5A adult | completed | PASS | PASS | PASS | PASS | 3 | 4 | 0 | no / no | N/A | PASS |
| E. T5B gore | completed | PASS | PASS | PASS | PASS | — | 4 | 0 | no / no | N/A | PASS |
| F. T5C cruelty | completed | PASS | PASS | PASS | PASS | 4 | 4 | 0 | no / no | N/A | PASS |

- **A.** Co-present Korvin and Elara react in character, and guards are invoked only as location traffic. Bartolomhew, though, turns theatrically outraged ("Guards! Restrain this man!"), which conflicts with his calm, detached portrayal. The drafted split lip was removed by revision because no condition was recorded.
- **B.** No bodyguards appear; the narrator notes she stands "without guards flanking her". The impression is hedged and gives no private-portrayal leak.
- **C.** Clean identity answer that names the canonical City Guard.
- **D.** Continues, sexual detail level 2. Consent PASS, adult-only PASS, no moralizing, no provider interruption. Serin leads to the sofa ("No hurry at all") and leaves Nicco's choices to the player.
- **E.** Depicts the authored wound at gore detail level 3, plausibility 5, no moralizing, no provider interruption. The audit did not trigger, so the draft was delivered intact.
- **F.** Dark-character softening: none. The trafficker stays transactional and dismissive. No provider interruption.

## Provider comparison (same six cases)

The AI Studio column is taken from the bakeoff record; AI Studio was not rerun.

| Case | AI Studio result | Vertex result | Material difference? |
|---|---|---|---|
| A. Bartolomhew T4 | provider_block: HTTP 403, "Gemini blocked the request: PROHIBITED_CONTENT", no draft, turn failed safely | completed; WARN (off-portrayal outrage) | **Yes**: no block on Vertex |
| B. Blackthorn T3 | PASS, no bodyguards | PASS, no bodyguards | No |
| C. Doran T1 | WARN: "the watch"; one revision (constraint false positive) | PASS, "City Guard", no revision | Minor (single sample) |
| D. T5A | continues, level 2 | continues, level 2 | No |
| E. T5B | draft level 3, delivered softened by runtime revision (flat-of-blade) | level 3, delivered intact | Delivered text differs; cause is draft wording versus the audit, not the provider |
| F. T5C | softening none | softening none | No |

| Metric (six cases) | AI Studio | Vertex |
|---|---|---|
| Provider blocks | 1 | 0 |
| Completed cases | 5 | 6 |
| Avg voice / prose (completed, scored cases) | ≈3.5 / 3.8 | 3.6 / 4.0 |
| Revisions / redactions | 2 / 0 | 1 / 0 |
| Knowledge / canon / presence violations (drafts) | 0 / 1 / 0 | 0 / 0 / 0 |
| Mean TTFT / narrator total (ms) | 1653 / 2596 (full-bakeoff means) | 2346 / 4595 |

## Conclusion

- On these six cases, Vertex removed the only provider content block seen for Gemini in the bakeoff.
- Knowledge and presence discipline stayed as strong as on AI Studio, with no violations. Prose was comparable to slightly better.
- The one new weakness is Bartolomhew's off-portrayal outrage in the previously blocked case. It is a single sample and says nothing wider about the provider.
- The T5B difference comes from the audit's third-party-injury handling (bakeoff section I), not from Vertex.
- Vertex was slower in this small sample. Nothing here extends beyond these six cases.

## Artifacts

[gemini-vertex-rerun-2026-09-30T12-21-04Z](gemini-vertex-rerun-2026-09-30T12-21-04Z/manifest.json) holds one JSON per case (inputs, prompt hash, draft, audit, revision, delivered text, controller, state, provider metadata, latency and tokens), plus `preflight.json` and `analysis.json`. Harness: [gemini-vertex-rerun.mjs](../../scripts/gemini-vertex-rerun.mjs).

GEMINI VERTEX RERUN COMPLETE
