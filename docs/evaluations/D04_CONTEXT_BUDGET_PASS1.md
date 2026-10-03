# D-04 context budget / lifecycle — Pass 1

D-04 remains IN PROGRESS. No compressor, provider calls, UI, knowledge mutations or save schema changes were introduced.

## Existing path

Canon + CampaignState/runtime → buildTurnContext (visibility, relevance, detached NarrativeContext, social state, knowledge grants, NPC+ packing) → intent projection → conditional permission-aware retrieval → composeTurnPrompt/buildNarratorPrompt (knowledge-access rendering, dialogue-focused recent conversation) → narrator provider. TurnCoordinator retains 12 finalized exchanges under 16,000 serialized characters. Reflection remains post-turn. Production controller remains `qwen/qwen3.8-flash`.

Existing independent safeguards remain: 32,000 serialized turn-context characters, 6,000 rendered knowledge-access characters, scene field limits, and narrator output bounds. They are not model token-window checks. NPC+ uses its existing 4,000-character packing allowance and headroom. No repository tokenizer or billing-token estimator existed.

## Accounting and configuration

ContextBudgetManager is the single token-accounting implementation. Estimate = ceil(UTF-8 bytes / 4); deterministic approximate accounting, not billing tokens. The default operational request envelope is 16,000 tokens, **not an asserted provider/model context window**. Configure `ProductionOptions.context_policy` for the actual deployment/provider; no model-specific size table was added.

Usable budget = request envelope − narrator output (existing NARRATOR_OUTPUT_TOKENS, 512) − provider/framing overhead (256) − safety reserve (512) − estimated system instructions. Current system instructions estimate 1,970; usable budget is 12,750 tokens. The numerator estimates serialized narrator messages, including inline instructions and framing; those inline instructions therefore consume usable capacity rather than being omitted. Thresholds are centralized: warning 80%, auto 90%, hard 100%, inclusive and distinct. Actual composed requests expose `context_budget` in turn diagnostics; no full context is logged.

Between-turn metrics rebuild the same filtered projection and prompt with retained dialogue, no hypothetical next player action or query-specific retrieval. They describe the active between-turn pack, not a promise about the next query. Query-specific retrieval, temporary turn participants and intent can increase the actual request; diagnostics measure that actual request. An existing projection failure still fails closed through the coordinator; a view remains readable with no budget snapshot if projection cannot be assembled.

## Lifecycle and contracts

Existing `idle` = READY; `running_turn` = PROCESSING_TURN; existing `post_turn` also blocks input; new `compacting_context` = COMPACTING_CONTEXT. GameSession owns the status. Auto maintenance runs after successful turn/reflection completion and before READY. Preflight guards already-crowded new/loaded sessions before accepting input. Manual entry point: `requestContextCompaction({ reason: "manual" })`. Both triggers use the same service. Busy turns, overlapping compaction, saves during maintenance, and closed sessions reject operations.

SessionView exposes budget, current maintenance trigger, and last result. Status events let a UI observe maintenance immediately. The default service returns `unavailable` explicitly; it discards nothing and never claims success. Exceptions become observable `failed` results; active context and authoritative state remain intact, and status returns to READY. If usage still exceeds auto threshold, further turns are rejected and another maintenance request reports availability; there is no queued narration or deadlock. Manual save/shutdown remain possible after maintenance settles.

The service receives only a detached narrator request and reason. Pass 1 deliberately admits only unavailable/failed results. Pass 2 must add validated candidate creation and atomic activation, preserving the old pack on failure and verifying epistemic/visibility constraints. No successful activation is simulated now. `CONTEXT_COMPRESSOR_MODEL` has an independent accessor, unset by default; no model is selected or invoked.

## Crowded baseline

Reproduce without network: `npm run build` then `node .build/src/dev/d04-context-baseline.js`. Synthetic opening campaign: 7 active NPC+, each knowing the same 32 substantial ledger facts (224 NPC knowledge edges); Nicco also knows these facts. Existing context selection shows 32 facts; existing prompt relevance caps the ledger query at 16 campaign facts per NPC (112 displayed campaign permissions). This differs from the historical 7×32 displayed-fact shape and preserves current production selection behavior.

- Filtered serialized turn context: **34,484 characters**.
- Diagnostic narrator messages: **3,291 estimated tokens / 12,750 usable = 25.81%**.
- Knowledge-access block: **1,252 estimated tokens**; scene/state and other inline prompt content account for the larger remainder. System instructions separately reserve 1,970 tokens.
- Exact serialized narrator request: **21,150 UTF-8 bytes**.
- Existing `context_too_large`: **YES**, from the 32,000-character context gate, even though the diagnostic prompt token ratio is low. This is a separate ceiling; Pass 1 does not resolve it.

The developer-only `inspect_serialized` hook captures the already-filtered derived pack immediately before that existing gate. The baseline script composes the diagnostic prompt from that capture; the rejected pack is never sent to a provider. `serializeContextBaseline` exports the exact narrator request, policy, estimator identifier and budget for repeatable bakeoffs. Source campaign/private hidden state is not exported. Outputs go to ignored `saves/d04-context/baseline.json` and `measurements.json`; no raw dumps are committed.

## Verification and Pass 2

Focused tests cover deterministic estimates, threshold boundaries, configuration validation, manual/auto/preflight/post-turn lifecycle, overlap, backend input blocking, unavailable/failure preservation, visible-only export (hidden sentinel), and save/load transient-state exclusion. Existing application tests continue to cover processing-turn blocking and authoritative save reconstruction. One existing save/load assertion now excludes derived budget metrics because recent dialogue is intentionally session-local.

Validation: typecheck passes; full suite 1,769 tests, 1,765 passes, zero failures, same four accepted TODOs; playthrough 25/25. No narrator/controller prompt semantics were changed.

Pass 2 must implement candidate validation/atomic activation and explicitly reconcile the serialized-context and rendered-knowledge gates with the derived-pack pipeline. Benchmark fidelity (including knowledge permissions), compression ratio, final estimate, latency and cost against identical ignored snapshots; keep compressor model independent. Extend diagnostics and lifecycle events for successful activation and do not persist transient metrics or operations into authoritative saves.
