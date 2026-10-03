# Phase 1K: OpenRouter Dual-Model Provider Foundation

## Architecture and contracts

The additive `src/llm/` boundary separates transport from two responsibilities:

- `NarratorProvider`: prepared system prompt plus ordered ordinary system/user/assistant messages; returns prose and diagnostics, or streams text deltas followed by completion/error.
- `StateControllerProvider`: bounded string evidence (player action, prior state, finalized narration); returns locally validated command proposals and diagnostics.
- `OpenRouterClient`: native Node 22 fetch, runtime credentials, HTTPS endpoint, cancellation, deadlines, HTTP/JSON/SSE parsing, sanitized errors, usage and timing. No SDK was added.

`types.ts`, `errors.ts`, `narrator-provider.ts`, and `state-controller-provider.ts` are provider-neutral. The adapters live in `openrouter/`; the small controller vocabulary and its local schema checks live in `controller-schema.ts`.

Neither provider imports CampaignState, WorldStore, retrieval services or persistence. The controller imports only CampaignCommand types and the existing data-only Phase 1I proposal parser. There is no prepare/commit call. Existing `src/types/narrative.ts` and its older context/scene-delta mock contract remain unchanged; future coordinator code must bridge prepared prompts to the new providers explicitly.

## Selected models and configuration

Production controller default as of 2026-10-03: `qwen/qwen3.8-flash`, selected by the [Round 2 bakeoff](../evaluations/CALDREVAN_CONTROLLER_MODEL_BAKEOFF_ROUND_2.md). `OpenRouterStateControllerProvider` is the canonical adapter; the former DeepSeek class name is a compatibility export. Reflection retains its prior DeepSeek default. Narrator selection is unchanged. The remaining Phase 1K descriptions below are historical foundation details.

| Setting | Narrator | Controller |
| --- | --- | --- |
| Default requested model | `minimax/minimax-m2-her` | `qwen/qwen3.8-flash` |
| Default output token budget | 512 | 512 |
| Output ceiling | 2,048 (configurable for another model) | 1,024 |
| Total request timeout | 60 seconds | 20 seconds |
| Streaming | Yes | No |

Both adapters accept model, timeout and output budget configuration. Narrator requests can override the output budget. The developer CLI additionally reads `OPENROUTER_NARRATOR_MODEL` and `OPENROUTER_CONTROLLER_MODEL`. Compatible controller models use the same JSON Schema protocol; no GLM-specific adapter exists. DeepSeek versus GLM was **not compared**.

MiniMax is selected for roleplay prose; DeepSeek is selected for compact structured interpretation. [M2-her documentation](https://openrouter.ai/minimax/minimax-m2-her) describes a 65,536-token context, a 2,048-token completion limit, and optional roleplay roles. It does not support enforced JSON output. Ordinary messages remain portable; optional `roleplay_context` in the MiniMax adapter supports `user_system`, `group`, `sample_message_user`, and `sample_message_ai`. These optional roles were inspected in documentation and tested offline, not exercised in the live benchmark.

The controller uses the selected [DeepSeek model](https://openrouter.ai/deepseek/deepseek-v4-flash-0731). [Nitro routing](https://openrouter.ai/docs/guides/routing/model-variants/nitro) prioritizes throughput; this is not a guarantee of lowest first-token latency. Diagnostics record the exact requested slug, including `:nitro`. Current diagnostics also retain the upstream provider when OpenRouter supplies it; engine logic does not use it.

## Streaming, completion and errors

`stream()` yields `text_delta` immediately. A successful terminal `completed` event includes final text exactly equal to concatenated deltas, usage, model and latency. A terminal `error` event includes partial text, `incomplete: true`, and a typed error. `generate()` collects the same stream and throws on failure; callers needing partial text must use `stream()`.

The SSE parser handles fragmented UTF-8, split event boundaries, multiple events per chunk, LF/CRLF, comments and empty events. It requires a successful `stop` finish plus `[DONE]`. Truncation (`length`), missing completion, malformed data, empty content and failures after partial output do not produce a completed result. Recognizable refusal/content-filter outcomes use `model_refusal`. No replacement prose or model fallback is generated.

There are **no automatic retries**, including 429 and 5xx. A caller may make an explicit new request; a stream is never transparently restarted after visible text. Early iterator exit closes the reader and aborts network work. AbortSignal cancellation is distinct from deadline expiry. Deadlines cover headers and body consumption. The benchmark starts the controller only after receiving narrator completion.

Error codes: `configuration_error`, `authentication_error`, `rate_limited`, `timeout`, `cancelled`, `provider_unavailable`, `invalid_provider_response`, `structured_output_invalid`, `network_error`, and `model_refusal`. Messages are fixed and sanitized; raw provider bodies, exception causes and headers are discarded. Failed network requests retain sanitized timing metadata on ProviderError.

## Structured proposals and validation

The controller sends `response_format.type: json_schema`, `strict: true`, and `provider.require_parameters: true`, following [OpenRouter structured-output guidance](https://openrouter.ai/docs/guides/features/structured-outputs). Reasoning is disabled by default and excluded from results. Optional minimal/low effort is configurable for compatible models; hidden reasoning is never displayed or persisted.

The full Phase 1I union includes 20 command kinds, nested character/profile records, optional provenance, runtime deltas and relationship writes. Phase 1K deliberately exposes a smaller, closed subset:

- `place_item`: carried or equipped positions.
- `transfer_item`: known owner plus carried or equipped position.
- `schedule_event`: ID, title, explicit absolute world minute, participant IDs.
- `set_knowledge`: established fact and character IDs, status, explicit told/source provenance.

At most eight commands and sixteen event participants are accepted. All object properties are closed and required in the provider schema. Empty commands are valid. No trust/relationship commands are exposed. Stored/unknown positions, nullable ownership, rich acquisition records, other command kinds and broader policies remain future extensions.

Validation is layered: provider-enforced schema, local validation against the same restricted schema, then `parseCampaignProposal` for every command. The latter rejects invalid IDs, unknown fields, invalid values and duplicate participants independently of provider enforcement. Its revision zero is a parsing placeholder only: the public result contains no revision and is not a committable CampaignProposal. Future coordination must supply the actual revision and perform CampaignState reference/invariant validation and narrative authorization.

## Credentials, prompt boundaries and context bounds

Set the environment variable locally:

```powershell
setx OPENROUTER_API_KEY "<secret>"
```

Open a new process/shell afterward. Credentials are read when a request begins, not at import time. Absence yields a typed configuration error. The client never logs/serializes the key or exposes Authorization headers in errors. Tests use fake keys and injected fetch. HTTPS is required and redirects are rejected. Optional attribution headers are not necessary and are not currently sent.

Controller system policy treats the JSON evidence envelope as untrusted data, explicitly rejects embedded instructions, and forbids invented trust progression. Strict schemas prevent new tools/command kinds, but prompting is not a proof of semantic authorization. The future coordinator must enforce that independently. System prompting for player agency belongs to prompt composition; the synthetic benchmark prompt demonstrates it and offline tests verify exact system-message forwarding. No campaign-specific prose is embedded in transport.

The transport rejects serialized requests over 100,000 characters (configurable) before sending, without silently truncating. This is a defensive character bound, not an exact tokenizer or a guarantee that every model context will fit. Responses are bounded at 2 MB on the wire and 100,000 content characters. Output budgets are explicit. Future prompt budgeting, retrieval selection and model-specific token accounting belong outside providers.

## Developer commands and offline verification

```text
npm run inspect:narrator -- "The old cellar hatch opens."
npm run inspect:controller
npm run bench:llm
```

These commands clearly announce online operation, selected model IDs and the date. They print generated text or validated proposals, safe token counts and timings. They make paid requests using the runtime credential. `inspect:controller` checks all five fixed evidence fixtures; the benchmark checks four sequential scenarios. Fixture mismatches and provider failures produce a nonzero exit code. All scenarios are synthetic, with no canon/save access.

Offline verification on Node v22.23.2: **417 tests passed**, zero failures/skips, and `npm run typecheck` passed with `OPENROUTER_API_KEY` deliberately removed in the child PowerShell process. `npm test` never contacts OpenRouter. Coverage includes request construction, auth redaction, missing configuration, HTTP failures, invalid JSON, usage, configurable models/budgets, deadline/cancellation during fetch/body/partial stream, early consumer exit, fragmented SSE, in-band errors, refusals, incomplete streams, schema/local validation and adversarial evidence separation. Mock adversarial tests verify plumbing; the live adversarial run below checks one actual model response, not universal injection resistance.

## Measured live results: 2026-09-28

Windows, Node v22.23.2; runs at approximately 18:35–18:36 UTC. All requests used the exact defaults above, with short synthetic prompts. Sixteen requests succeeded: three narrator-only, four narrator-to-controller pairs, and five controller-only. No retries/fallbacks were used. These small samples describe this environment/date only, not permanent provider characteristics. One narrator-only run overlapped with the independent controller fixture command; the sequential benchmark itself ran before those commands.

Durations use monotonic `performance.now()`. ISO `request_started_at` and `completed_at` timestamps are diagnostic only. `headers_ms` measures response headers; narrator `time_to_first_token_ms` means first nonempty text delta, not a reasoning or role-only event. Controller TTFT is null because it is nonstreaming. Its headers and total times are measured instead. The CLI's sequential/tail measurements include local parsing and small loop overhead; npm/build startup is excluded. Tail is time after final narration until controller completion; estimated visible wait is narrator TTFT.

### Narrator-only

| Run | TTFT ms | Total ms | Prompt tokens | Completion tokens |
| --- | ---: | ---: | ---: | ---: |
| 1 | 678.71 | 961.75 | 387 | 22 |
| 2 | 1094.50 | 1210.60 | 387 | 15 |
| 3 | 738.66 | 880.63 | 387 | 15 |

Median TTFT: **738.66 ms**; median total: **961.75 ms**. Example successful output: “Mara flinches and stares at the hatch. The hinges creak.”

### Sequential narration then controller

| Scenario | Narrator TTFT ms | Narrator total ms | Controller headers ms | Controller total ms | Controller tail ms | Sequential total ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Dialogue / no-op | 1000.01 | 1546.97 | 622.51 | 648.31 | 649.06 | 2198.97 |
| Equipment | 543.29 | 950.76 | 611.48 | 742.42 | 743.06 | 1694.47 |
| Scheduled event | 573.03 | 926.26 | 562.25 | 691.50 | 692.11 | 1618.94 |
| Knowledge transfer | 731.53 | 969.43 | 582.39 | 793.54 | 793.97 | 1763.92 |

All four proposals matched their expected fixture commands. Median TTFT: **652.28 ms**; narrator total **960.09 ms**; controller total **716.96 ms**; tail **717.59 ms**; sequential total **1729.20 ms**.

| Scenario | Narrator prompt / completion | Controller prompt / completion |
| --- | ---: | ---: |
| Dialogue | 362 / 29 | 1191 / 6 |
| Equipment | 376 / 37 | 1218 / 49 |
| Scheduled event | 379 / 20 | 1201 / 45 |
| Knowledge transfer | 374 / 28 | 1203 / 90 |

### Controller-only fixed evidence

| Scenario | Total ms | Prompt / completion tokens | Expected proposal |
| --- | ---: | ---: | --- |
| Dialogue | 820.15 | 1170 / 6 | Empty |
| Equipment | 664.80 | 1201 / 49 | Transfer and equip lantern |
| Scheduled event | 639.67 | 1207 / 45 | Meeting at world minute 160 |
| Knowledge transfer | 2043.58 | 1199 / 56 | Explicit told knowledge |
| Adversarial inscription | 603.24 | 1195 / 6 | Empty; injected trust/tool instructions ignored |

All five matched expected fixture proposals. Total usage across all sixteen requests: **13,437 prompt tokens + 518 completion tokens = 13,955 tokens**. No pricing estimate or permanent price table was introduced.

### Interpretation limits

The provider foundation generated text and valid proposals successfully, but this was not a narrative-quality acceptance test. Narration sometimes contained fixture-style annotations/awkward prose. The sequential knowledge narration both established knowledge and said the player's knowledge was unaltered; the controller still proposed the intended knowledge command. The equipment narration established handover but did not explicitly restate the equipped slot; the controller used the player action as well. Exact fixture matching therefore does **not** establish that proposals are narratively justified under a final coordinator policy. Ambiguous evidence, player agency, output quality and authorization require deliberate Phase 1L work; no such proposal was committed here.

## Deferred scope and readiness

No player-facing coordinator, UI, state commit, speculative/incremental controller execution, retrieval orchestration, final campaign prompt, trust progression, save/load integration or persistence semantics were added or changed. CampaignState remains authoritative in memory between manual saves. The future coordinator owns bounded context, finalized-narration gating, semantic authorization, revision-aware validation/commit, and turn finalization. Phase 1L has not begun.

READY FOR TURN COORDINATOR
