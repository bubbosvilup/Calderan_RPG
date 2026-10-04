# Cross-pipeline provider reliability contract

## Result and adoption boundary

**Candidate contract implemented and deterministic fault-injection gate PASS. No paid calls or campaign save mutation.** Generic production-safe additions preserve provider error codes, add normalized failure classes/attempt traces, guard maintenance against stale results, and isolate shadow observer exceptions. Maintenance remains one attempt by default. Technical retry and transaction publication changes for critical calls are **evaluation-only opt-in**, not enabled by the production factory. V2.2 semantics remain a separate dev candidate.

The existing application allows consumers to stop/cancel on delivered narration before commit. Moving publication across commit broke those cancellation/iterator and golden-trace tests during investigation. Default behavior was restored and all existing tests retained. `TurnCoordinator(...,{reliability_contract:true})` tests the candidate lifecycle; `OpenRouterStateControllerProvider(...,{strict_output:true})` disables historical normalization as an authority input. The candidate coordinator also rejects a normalized result from a legacy/custom provider, so enabling the transaction contract cannot silently accept repaired output. No major production reorder is merged.

## Provider inventory and criticality

| Path | Class | Default/current handling and candidate contract |
| --- | --- | --- |
| Narrator draft, MiniMax/OpenRouter adapter | Critical player-visible | Buffered draft; transport validates completion; candidate allows one technical retry before deliverable/commit |
| Controller/state proposal, Qwen/OpenRouter adapter | Critical authority | Proposal only, deterministic authorization and whole-batch prepare; candidate strict envelopes, one technical retry, fail closed |
| Reconciliation narrator | Critical when audit requires it | Same technical retry policy and shared turn budget; one existing semantic reconciliation, then existing bounded redaction; technical failure aborts uncommitted turn |
| Deterministic narration/grounding audit | Critical local stage, no provider | No technical reroll on semantic rejection; validates detached candidate state |
| Reflection/OpenRouter | Noncritical maintenance | Strict complete envelope and deterministic semantic checks; default one attempt, optional explicit one retry, then skip/no note |
| Mannerism extractor/OpenRouter | Noncritical maintenance | Default one attempt, optional explicit one retry; structural parsing before semantics; no failed observations/promotion; D-10 semantics unchanged |
| D-26 portrayal shadow | Diagnostic, currently deterministic, **no provider call** | No authority capability; unexpected observer exception logs a skip counter and cannot fail the turn |
| Offline/experimental shadow controller analysis | Diagnostic | No state commit; transport failure retained/logged, no retry loop; generic diagnostic wrapper provided for any future asynchronous shadow subcall |
| Context compressor/OpenRouter | Optional noncritical preparation | One call; complete JSON + exact deterministic source validation or fallback to existing context; no repair or authority mutation |
| Lossless compressor/OpenRouter | Optional noncritical preparation, current production uses deterministic compaction | One call; exact source/group/version/revision validation or fallback; no repair |
| Voyage embeddings: query/documents/indexing | Noncritical retrieval/index preparation | Native vector shape/count/dimension checks, bounded timeout/cancellation; lexical fallback for query search, failed indexing not admitted as completed index |

Every runtime provider adapter is accounted for; dev bakeoff/micro-probe tools use these adapters and do not constitute another campaign authority path. Retrieval as a whole remains critical if valid context cannot be built: it fails closed before narration/state commit. An embedding response ranks context and never authors campaign truth.

## Failure taxonomy and retry policy

Normalized classes: `transport_error`, `timeout`, `http_retryable`, `http_nonretryable`, `invalid_provider_response`, `finish_reason_length`, `empty_output`, `malformed_envelope`, `schema_invalid`, `parser_failure`, `stale_revision`, `reconciliation_failure`. Existing public `ProviderErrorCode` values remain compatible; optional `failure_class` supplies detail. HTTP status/error-event mapping distinguishes 429/5xx from other 4xx. Wire malformed JSON and empty completion are separate; finish reason `length` remains distinct even when content is syntactically complete. Local parser bugs are not automatically treated as retryable provider failures.

A technical retry resends the same logical request, same semantic body, same captured authoritative revision, without intervening mutation. Existing D-05 machinery supplies budget, backoff, cancellation/stale checkpoints and attempt records. Critical candidate default: **attempt 1 + one retry**, 250–500 ms backoff, existing shared 120 s provider budget, timeout retry capped at 30 s. Custom D-05 policies retain their existing maximum of three attempts; no new unbounded retry architecture. Default maintenance: **one attempt then skip**, avoiding extra D-20 delay. Optional explicitly injected policy enables one technical retry in the tested maintenance candidate; it is not enabled by production.

Only technical invalidity triggers retry: malformed/empty/invalid/schema-invalid output, length, timeout, transport reset, 429/5xx. Auth/config/refusal/cancellation/nonretryable HTTP and semantic content rejection never trigger quality rerolls. The existing bounded reconciliation pass is an explicit architectural correction for audit failure, not a preference-based reroll. Prompt/model/routing/token budgets are not increased to make retries succeed.

ANY OpenRouter structured completion with finish reason `length` is invalid, even if its text parses. Plain narrator completion is free text; the adapter conservatively rejects all length completions. There is no arbitrary prose grammar validator. Valid deliverable checks are complete transport, nonempty consistent text, bounded length, resolved existing audit/reconciliation/redaction, and current revision.

Strict parsers accept one exact JSON envelope, including ordinary surrounding JSON whitespace. They reject fences, trailing prose/objects, missing braces, bad enums and unknown fields. No balanced-object extraction, field coercion or guessed JSON repair feeds candidate authority. Production's historical controller R1 normalization is preserved by default for compatibility and is explicitly outside the new strict contract until adoption; in strict mode it is diagnostic-only. Old evaluation diagnostic extraction remains excluded from authority.

## Current order and candidate invariants

Current production: input/context → draft → controller → deterministic authorization → detached whole-batch preparation → audit/reconciliation → commit preparation → **emit narration** → revision checkpoint → atomic commit → finalized history/turn result. This protects state from provider failures, but a cancellation at narration publication can leave visible uncommitted text. It is documented rather than hidden behind a passing candidate test.

Candidate: input/context → complete provider outputs → deterministic authorization → detached candidate preparation → audit/reconciliation → prepare nonempty final deliverable → final revision/cancellation checkpoint → **single atomic commit** → finalized history/scene continuity → publish already validated narration/result → maintenance. No await/callback/yield between final checkpoint and commit. An exhausted narrator/controller/reconciliation failure publishes no draft, consumes no authoritative turn and returns the existing controlled `turn_failed`/application failure path. Player input can be submitted again. No new deterministic invented story fallback.

Provider attempts share logical request identity (`turn_id:base_revision:subsystem` in candidate diagnostics), prior-state revision and semantic body. A technical failure cannot apply a partial delta. Authorization/expected_revision/SceneDelta remain unchanged. An external revision change aborts safely before another attempt or commit; it never silently reuses stale output. Active-turn exclusion prevents concurrent effects. Iterator abandonment before a valid deliverable remains uncommitted; once candidate publication starts the commit has already occurred.

These guarantees are process-local. The application has no durable commit-and-publish outbox or cross-process idempotency ledger: process crash or publication-consumer exception after commit is not an exactly-once network delivery guarantee. Production adoption needs an explicit decision about consumer cancellation semantics and potentially durable publication, rather than a casual reorder here.

## Maintenance and diagnostics

Reflection technical/parse failure writes no note and preserves player-delivered state. Semantic rejection is evaluated once and is not retried; existing cursor behavior is unchanged. Extractor failure admits no observation or promotion; existing finalized-source queue/processed-sequence housekeeping may still occur. Retrying extraction validates once and applies at most one observation batch. Stale responses abort maintenance before note/observation effects. Optional maintenance retries require the same frozen request and revision; signal cancellation is respected where the current extractor interface provides it.

GameSession already emits the finalized player turn before post-turn maintenance, but awaits maintenance before returning/allowing the next command. D-20 remains open; this task does not introduce background work or double the default maintenance latency. Reflection has no request AbortSignal yet; optional retry protects revision but does not add cancellation capability that the interface lacks. D-26 currently has no provider dependency; the diagnostic wrappers use zero retries and swallow logger failures.

## Observability and measured rates

Candidate turn diagnostics expose counters for critical physical calls, technical retries/recoveries/exhaustion, degraded player failures, state commits after retry, duplicate prevention, stale revision and shadow skips. Attempt records preserve normalized failure classes, retry reasons, final outcome, provider wall time and logical request ID; no request content/credentials is added. Maintenance run records expose equivalent attempt traces, and `ReliabilityMetrics` supports maintenance counters/skips/length/timeout/invalid counts. Reconciliation failure phase is retained in existing phase diagnostics rather than discarding the underlying provider class.

Live critical usable response rate: **unmeasured**. Live maintenance usable response rate under this contract: **unmeasured**. Live technical retry recovery rate: **unmeasured**. Fault injection demonstrates deterministic recovery behavior, not an SLO/SLA estimate. Historical V2.1 structured reflection usable envelopes were 39/48 (81.25%, 18.75% unusable); this does not estimate narrator or controller reliability and is not a new sample.

## Fault injection and verification

29 new contract tests cover:

- Narrator actual wire timeout/malformed/length then success; failed drafts never publish, same body, state already committed at candidate publication; two failures yield controlled uncommitted failure.
- Controller technical malformed/length/empty/schema/parser faults then success, exact same request and one effect; actual strict OpenRouter adapter malformed/timeout/length/hybrid schema failure then success; two failures cause zero mutation.
- Reconciliation malformed then recovery or exhaustion, always before commit.
- Reflection malformed/length/provider failure default skip, no note or player-state mutation; optional generic maintenance retry recovers length and counts attempts.
- Extractor malformed skip or retry success, no duplicate observations/promotion.
- Diagnostic failure logs/skips and cannot propagate, including logger failure; current D-26 has no provider fault to induce.
- Stale revision during retry aborts before a second provider attempt; concurrent duplicate/pre-deliverable abandonment cannot commit.
- Strict JSON rejects prose/fences/truncation/unknown fields; auth/HTTP 400/refusal and semantic rejection do not retry.

All four V2.2 tests plus these 29 contract tests passed in the focused run (33/33). Existing D-05/transaction/golden/controller tests remain unchanged and pass with production defaults. Full required results are recorded in ignored `saves/provider-reliability/{typecheck,unit,playthrough}.log`; 1,942 unit/integration passes (1,946 total), same four accepted TODOs, zero failures, playthrough 25/25. Offline retry traces and normalized counters are in `retry-traces.json`; no credentials.

Live micro-probe: **not run; zero physical calls; cost $0**. Actual adapter wire fault injection already verifies response handling deterministically; another small stochastic provider sample would not establish live rates. No 48-call OOS was constructed or run.

## Production changes, readiness and limitations

Generic production reliability changed: **YES**, failure-class metadata/attempt observability, strict maintenance failure/stale guards and diagnostic exception isolation. Production critical retry policy, controller normalization and narration/commit order changed: **NO**, new contract is opt-in evaluation only. No production code imports V2.2 semantic validation.

Both development workstreams pass as **candidate/evaluation gates**. Ready for one new independent V2.2 semantic OOS using the tested technical handling, with preregistered original logical requests and separately counted physical technical retries. This does not assert that production already satisfies the full new publication contract. Production transaction adoption remains an explicit compatibility/durability task before advertising that guarantee to players. D-09 remains **SOAK PENDING**; eventual semantic OOS success must precede structured production integration and real later-use/retrieval/narration ablation. D-10 stays closed, D-26 stays diagnostic/shadow, and cursor/D-20 remain separate.
