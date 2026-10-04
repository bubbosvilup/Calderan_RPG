# D-09 V2.2 development provenance gate

## Result and scope

**Development PASS. No new semantic OOS and no semantic production adoption.** Both V2.1 useful provenance losses recover, all four misleading catches remain rejected, all three known factual-error claims remain rejected, and all 34 V2.1 accepted useful claims remain accepted. Historical V2.1 OOS is DEVELOPMENT ONLY here; its original decisions/review/raw artifacts are retained unchanged. This is not an independent quality pass.

V2.2 is isolated in `src/dev/reflection-v22.ts`. It delegates all non-self-statement claims to frozen V2.1, retains V2 exact validation and deterministic rendering, and introduces no new claim type or free prose. Production reflection still uses its existing free-text schema. Cursor, cadence, D-10 semantic validation, D-26 authority, campaign/movement/knowledge/relationship rules and save schema are unchanged.

## Provenance root cause and identity model

The two V2.1 losses selected existing quoted contract handles through nested `statement_refs`, but the outer `evidence_refs` cited the matching `contract_established` history entries. Literal handle intersection wrongly treated distinct handles for the same source as missing proof.

Authoritative native structures retain contract `field`, `revision`, `quote`, character ownership, and a matching history entry with `kind=contract_established`, `field`, `revision`. The V2 collector already gives quotes the derived identity `statement:<subject>:<revision>:<field>`. V2.2 uses this exact identity, verifies payload/outer revision consistency and ownership, and requires unique statement identity and a uniquely linked history event. Quote text similarity is never used.

`structuredReflectionEvidenceV22` exposes `provenance` on both the authoritative quote and its uniquely matching history entry: `statement_ref`, `statement_id`, `origin_revision`, `field`, `source_event_ref`. It derives this candidate metadata from existing authoritative structures; it does not invent or migrate persisted production IDs. If history has been rolled away or the event link is ambiguous, `source_event_ref` is null and event equivalence is unavailable. An exact authoritative quote handle can still be used directly. Catalogs are trusted collector outputs, not model-authored authority; arbitrary externally forged catalogs are outside this boundary.

## Policy and retained safety

Nested `statement_refs` are the semantic proof. Every selector must resolve to a unique, owned, authoritative quoted contract with the expected native identity. For each selected quote the outer refs must include its own handle **or** its uniquely linked history event. Compatible additional context may coexist; context alone does not prove an uncited statement. A history-event handle is never accepted as a nested statement selector. Two representations of one source never count as two independent statements.

After deterministic equivalence resolves, selected quote handles are supplied to the unchanged V2.1 support validator. Original proposal refs are preserved in the result; diagnostics expose canonical quotes and linked source events without adding independent evidence counts. V2 checks still require distinct revisions/identities and safe bounded verbatim attribution. Wrong count/direction/path/episodes/ownership, unknown refs, ambiguous contracts/events, wrong contract identity, different-source outer events, unbacked quote handles, unsafe quotes and performed-role fields remain rejected. No LLM, embeddings, fuzzy quote match, JSON repair or reinterpretation of intent as performed action.

The rendered meaning remains `explicitly stated: <quotes>`. Recording meals plus reporting counts or marking loaned tools supports attributed commitments; it does not establish that the character acts as quartermaster.

## Development regressions

| Check | Result |
| --- | --- |
| V2.1 useful losses recovered | 2/2 |
| V2.1 misleading catches retained | 4/4 |
| Known factual-error rejections retained | 3/3 |
| V2.1 accepted useful preserved | 34/34 |
| New performed-role leakage | None; forbidden payload test rejects |

Recovered IDs: `V21_engine_state_self_statement_1_1:0` and `V21_engine_state_self_statement_1_3:0`. Their matching history/contract identity is preserved alongside replay diagnostics in `saves/d09-reflection-v22/dev-regression.json`. Replay preserves original valid-envelope/batch handling and does not promote malformed diagnostic extraction to acceptance.

Four focused V2.2 tests cover direct/event/mixed provenance; nonexistent/foreign/event-as-selector/wrong identity/wrong event; ambiguous identity and invented quote-only backing; unsafe quotation, insufficient independence and performed-role side channels. Existing V2/V2.1 tests remain unchanged: all 20 focused semantic tests passed. Final full validation: typecheck PASS, 1,942 unit/integration passes with zero failures and the same four TODOs, playthrough 25/25.

## Freeze

Source SHA-256: `ca226a81952c31120ff02e2d49e8399182bea8f664c796592d88f9b5c838d0cf`.

Schema SHA-256: `c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba`.

Prompt SHA-256: `fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09`.

Schema unchanged from V2.1: YES. Prompt unchanged: YES. Evidence structure version: 2. Provenance model version: 1. Reason set: V2.1 plus `invalid_statement_provenance`; complete set/hash and immutable V2/V2.1 source dependencies are recorded in `d09-reflection/v22-freeze.json` and the ignored raw freeze. No candidate edits after final freeze and no API calls in this task.

## Readiness and next step

**Ready for a new independent candidate V2.2 OOS: YES**, after the separately tested candidate reliability contract passes final required checks. This readiness applies to evaluation with technical handling enabled, not production transaction adoption. The reliability report documents why turn publication order and strict controller handling remain opt-in evaluation changes.

The next semantic task should preregister genuinely new requests and enough realized useful corroborating/context and scoped contradictory-extra exposure. The previous V2.1 corpus is not fresh validation. A future OOS pass would precede structured reflection production integration and later-use/retrieval/narration ablation. D-09 remains **SOAK PENDING**.
