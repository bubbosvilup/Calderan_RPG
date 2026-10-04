# Structured reflection wire V2 — request-scoped identifier enums

Reviewed 2026-10-04, Europe/Rome. **Reliability gate FAIL at local equivalence. Blocker OTHER: AUTHORITATIVE_VISIBLE_CATALOG_MISMATCH.** No provider inference, authentication or endpoint calls were made. No semantic OOS was run. V2.3 remains FROZEN / semantic PASS; production unchanged; D-09 SOAK PENDING. The candidate must not be adopted or used for the missing-exposure soak.

## DOCUMENTATION REVIEW

The established [documentation research](STRUCTURED_REFLECTION_DOCUMENTATION_RESEARCH.md) was read before empirical work and remains unchanged. Its existing enum/closed-object success, maxLength enforcement failures and uniqueItems rejection were preserved; no basic compatibility probe was repeated.

A bounded additional official-source search addressed only the newly relevant enum-cardinality/schema-size question. [Alibaba structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output) lists Qwen3.8-Flash for JSON Schema and lists enum among supported types. No applicable numeric enum-cardinality, schema-byte or grammar-complexity ceiling was located there. [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs) states provider enforcement varies; no applicable numeric limit was located. The [official provider changelog](https://github.com/OpenRouterTeam/ai-sdk-provider/blob/main/CHANGELOG.md) and targeted official repository/issue searches supplied no applicable size guarantee. This is a bounded search finding, not proof no limit exists. Other providers' limits and Alibaba Agent Studio document-extraction limits were excluded as inapplicable. Review receipts: `saves/structured-reflection-wire-v2/documentation-review.json`.

## ROOT CAUSE

The historical reliability blocker remains SCHEMA_CONFORMANCE: prose in identifier/reference fields and one canonical-only duplicate statement reference. Exact request-scoped handles would address that failure mechanism more faithfully than maxLength. However, the frozen corpus does not universally make the validator's authoritative citation catalog visible to the provider. This prevents the proposed visible-only enums from preserving contextual canonical acceptance.

## REQUEST-SCOPED DOMAINS

The evaluation-only generator is `src/dev/reflection-wire-v2.ts`. It clones WIRE_ALIBABA_V1 without changing that source or any semantic source. It derives deterministic sorted exact strings, retains canonical string/array bounds, and omits uniqueItems only on the provider wire.

- Evidence refs: exact same-subject handles in the provider-visible request, each entry checked against the captured authoritative catalog. No evidence text, invented authority or hidden handles are added.
- Statement refs: authoritative V2.2 provenance links whose quoted-statement handle is exposed in this request. N/A is forbidden. Statement events are not manufactured into independent quote handles.
- Locations: exact from/to identifiers of same-subject, subject-owned provider-visible movement evidence. V2/V2.3 compare locations to the exact ordered endpoints of selected support; a larger known-location set is unnecessary for this field. Repeated locations remain legal.
- Other finite IDs: not added; A/B/C did not collectively pass safety.

Families with no visible location domain or fewer than two distinct visible statement handles are omitted from the candidate anyOf rather than submitting empty enums of unknown provider compatibility. This pruning would be safe only if visible and authoritative claim eligibility agree. Hidden valid quote handles make that premise false in the captured corpus; the gate detects it. No provider acceptance of the candidate is claimed.

## LOCAL EQUIVALENCE

Checked all 40 frozen requests: the same 24-request V3 representative screen (three per family) and 16 distinct confirmation requests (two per family). Request/snapshot hashes and the frozen V2.3/canonical/prompt hashes were checked before deriving domains.

Generated candidates cover all eight families: complete and subinterval trajectories, current snapshot contrasts, paired relationship intervals, condition/membership/environmental intervals, movement intervals, and authoritative quote pairs with direct quote/event provenance combinations. Archived proposals are reused only after unchanged V2.3 accepts them locally. Every accepted proposal is tested at each confidence level and with each canonical-compatible additional catalog handle. Empty envelopes are checked separately. This is a representative contextual safety check, not a universal enumeration of every envelope or a new semantic OOS.

| Measure | Result |
| --- | ---: |
| Requests | 40 |
| Canonical-structural-valid and V2.3-accepted samples | 29,415 |
| Wire false rejections | 3,474 |
| Affected requests | 9 |
| Safety negatives | 204 |
| Local gate | FAIL |

Coverage: relationship trajectory 6,738; contrast 930; parallel 1,680; condition 2,328; membership 3,993; movement 5,520; self statements 6,501; environmental motif 1,725. Counts include confidence/context variants, not independent statistical observations.

All safety checks pass: short prose evidence refs, foreign valid-looking refs, N/A statement refs and invented location prose are rejected by the wire. Duplicate evidence refs remain wire-permitted and canonical-rejected; duplicate statement refs are checked likewise wherever a statement branch exists. These structural negative checks do not establish provider enforcement.

Raw local samples, negatives, sizes, exact rejection paths/values and request/snapshot/wire hashes are saved under `saves/structured-reflection-wire-v2/`. The build script is reproducible with `npm run build --silent` followed by `node docs/evaluations/d09-reflection/request-wire-v2-build.mjs`.

## SCHEMA SIZE

Measured compact JSON UTF-8 bytes of the full request-specific schema, not estimated model tokens:

| Metric | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| Schema bytes | 3,973 | 4,310 | 5,086 |
| Evidence enum values | 5 | 8 | 21 |
| Statement enum values | 0 | 0 | 5 |
| Location enum values | 0 | 0 | 4 |

Largest request-specific enum: 21 evidence handles. These are modest measured byte/cardinality values, but provider token overhead and full-schema grammar acceptance remain unmeasured because the local gate failed. No empirical arbitrary-size search occurred.

## PROJECTION SAFETY

Counterexample: `V23_OOS_fixture_relationship_contrast_1_1` exposes eight entries while its captured canonical catalog contains nine. Hidden snapshot `npcrel:maren:brenna` remains acceptable as an evidence reference under V2.3. The following archived trajectory, with that additional canonical-compatible context reference, is structurally canonical-valid and V2.3-accepted:

```json
{
  "subject_character_id": "maren",
  "evidence_refs": [
    "npcmem:maren:history:r6.0",
    "npcmem:maren:history:r8.0",
    "npcmem:maren:history:r10.0",
    "npcmem:maren:history:r12.0",
    "npcmem:maren:history:r14.0",
    "npcrel:maren:brenna"
  ],
  "confidence": "low",
  "claim": {
    "type": "relationship_trajectory",
    "target_character_id": "brenna",
    "dimension": "trust",
    "from": "none",
    "to": "moderate",
    "direction": "increase",
    "transition_count": 2
  }
}
```

Wire rejection is exactly `$.proposals[0].evidence_refs[5] = "npcrel:maren:brenna"`, outside the visible enum. This is existing validator behavior; neither trajectory support selection nor hidden authority was changed.

A second mechanism affects self statements: in `V23_OOS_engine_self_statement_synthesis_2_3`, the validator accepts authoritative pair `npcmem:brenna:contract:0` / `npcmem:brenna:contract:1`, while the second handle is hidden from the provider. Exact rejection includes `$.proposals[0].claim.statement_refs[1] = "npcmem:brenna:contract:1"`. Some event-provenance variants also produce this failure with visible evidence refs.

Across failing samples, 2,430 have out-of-domain evidence refs and 2,298 have out-of-domain statement refs; these counts overlap. No out-of-domain location was found in the accepted local samples. Five claim families are affected; movement-family failures come from additional hidden evidence context, not locations. Full exact receipts are in `false-rejections.json`.

Adding hidden handles to the provider schema would expose authority that the request intentionally withheld; dropping those canonical-valid proposals would violate the required equivalence. Neither workaround was applied. A single counterexample suffices to disprove equivalence; thousands of positive samples cannot cancel it.

## PAID-PROBE JUSTIFICATION

The unresolved provider hypothesis remains: does Alibaba/Qwen enforce request-scoped enum values on the full dynamic reflection schema? Documentation, minimal enum probes and maxLength failures do not answer it. The user requires local equivalence PASS before any paid call. That prerequisite failed, so paid probing is prohibited. The runner checks the failed local gate before credentials, authentication, metadata or inference and was verified to exit there. No new paid dispatch marker or physical ledger exists.

## 24-REQUEST SCREEN

Preregistered, not run. Logical dispatched 0; physical 0; first/final usability not measured; 429, wire invalid, canonical-only invalid, enum violations, malformed, length, timeout, retries and recovered receipts all 0 observed across zero calls. Cost $0; median/P95 latency not applicable. Zero observed enum violations does not constitute an enforcement result.

Frozen intended configuration: qwen/qwen3.8-flash; Alibaba only; no fallbacks; require_parameters true; 600 tokens; 20-second timeout; reasoning disabled/excluded. V3 pacing unchanged (concurrency one, 1,000 ms launch floor, 250 ms completion gap, Retry-After honored, 6/12-second fallback 429 cooldown), at most two attempts, technical retries only, no repair/quality/semantic reroll. Shared call cap 48. No tuning or additional experiment occurred.

## CONFIRMATION

Not run: local equivalence failed before the screen. Sixteen distinct requests were checked locally and preregistered, but none dispatched. Final usability/failures not measured.

## FAILURES

**OTHER — AUTHORITATIVE_VISIBLE_CATALOG_MISMATCH**, a local contextual-equivalence blocker. Not ENUM_NOT_ENFORCED, SCHEMA_SIZE_OR_COMPLEXITY, CANONICAL_ONLY_UNIQUENESS or RATE_LIMIT: there is no new provider receipt supporting those classifications. Existing SCHEMA_CONFORMANCE reliability remains unresolved.

## FREEZE

No qualified WIRE_ALIBABA_V2 freeze. The candidate generator and request-specific schema hashes are recorded for reproducibility only; `freeze.json` explicitly states NOT_QUALIFIED_DO_NOT_ADOPT. A dynamic wire has a generator hash and per-request schema hashes, not one universal generated-schema hash. No configuration becomes eligible for the missing-exposure soak.

Unchanged authority:

- V2.3 source: `10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d`
- Canonical schema: `c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba`
- Prompt: `fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09`
- Prior WIRE_ALIBABA_V1: `ba621d1dd29bddbd0e5688027211896b4734b73f5ff696d61e2ee789a08042fd`

## NEXT STEP

Resolve the captured request's citation-visibility contract before another reliability experiment: determine whether every handle V2.3 accepts for citation must be exposed in the provider input, including quoted statements accessible through authoritative provenance. Keep hidden current-truth authority and citation eligibility explicitly accounted for, then require a fresh local equivalence gate. The documentation does not grant enum decoding authority to reconcile hidden versus visible evidence. No request rewrite, semantic change or automatic next experiment is performed here.

Targeted missing-exposure soak remains pending. Production changed NO.

## TESTS

`npm run typecheck`: PASS. `npm test`: 1,965 passed, zero failures, the same four TODOs. `npm run test:playthrough`: 25/25, zero failures. Three focused tests cover exact/repeated movement endpoints, local uniqueness, hidden-authority false rejection and altered visible payload rejection. The first sandbox unit launch was prevented by Node worker `spawn EPERM`; the requested suite was rerun successfully with the sandbox escalation, without changing the tests or test command.

Commits created: none. Main at `2ffeabe` (`docs: research structured reflection provider constraints`). Working tree contains the new evaluation report, generator, three evaluation scripts and focused tests; no tracked pre-existing file was changed. Raw artifacts are in the ignored `saves/structured-reflection-wire-v2/` directory. Offline final verification checks frozen source/schema/prompt/prior-wire and request/snapshot/schema hashes, zero dispatch, test results and credential absence.
