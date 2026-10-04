# D-09 reflection V2.3 development

**SEMANTIC DEV: PASS. This is development regression, not independent OOS or production authorization.** Production reflection/model and turn publication ordering remain unchanged. D-09 stays SOAK PENDING.

## Root cause and architecture

The sole V2.2 lost useful object, `V22_OOS_engine_relationship_contrast_2_1:1`, cites trust none→low→moderate and wariness none→low→moderate→high. Its final changes occurred at different revisions. V2 requires a cited snapshot or both final changes in the same revision; V2.1/V2.2 preserve that requirement. They reject missing_positive_evidence even though the authoritative current catalog snapshot proves moderate trust and high wariness.

The collector in src/dev/reflection-v2.ts constructs directional relationship snapshots from CampaignSnapshot relationships, with exact owner/subject/target and capture revision. The catalog is engine authority supplied independently of provider output. Model proposals cannot create or amend it. Full catalog authority is already consulted for omitted events and stale-state checks. V2.3 uses this existing boundary for this one current-state claim family; it does not search arbitrary uncited facts for other claim types. The caller must supply the catalog from the same captured validation state; this module does not fetch live state or establish production commit freshness.

## Contrast policy

A proposal **need not cite the snapshot handle** when it cites owned same-subject/target history for **both compared dimensions**. Alternatively it may cite the matching directional snapshot itself. All original references must exist uniquely and belong to the subject. Movement-only, one-dimension-only or unrelated references cannot authorize the comparison.

Current truth must come from one uniquely latest, owned directional snapshot in the full authoritative catalog. Both dimensions must be explicit, distinct and positive, and match the claimed values. Missing/ambiguous/foreign authority rejects; mismatched state rejects; stale cited snapshots or relevant changes newer than the authority snapshot reject. Same-revision contradictory changes also reject. Historical changes establish provenance, not simultaneous historical truth or the current endpoint. Other recognized facts may remain compatible context; unknown evidence classes still reject.

Verified current authority is passed to unchanged V2.2 closedness/entitlement checks internally; the diagnostic and accepted persisted proposal retain the model's original refs. A separate authority_ref identifies the verification snapshot. Rendering stays deterministic and uses recorded directional feelings. All non-contrast validation and all batch duplicate/size/instruction checks are unchanged. Historical trajectories, paths, lifecycle/condition sequences and self-statement proof still require their cited history.

The schema and prompt are unchanged. The prompt remains more conservative, asking for a cited snapshot or same-revision final changes; loosening prompt wording is outside this task. Provenance/versioning remain unchanged. There is no production caller of V2.3.

## Development regression

| Required result | Observed |
|---|---:|
| Lost useful recovered | 1/1 |
| Previously accepted useful preserved | 57/57 |
| Misleading retained rejected | 9/9 |
| Known factual errors retained rejected | 4/4 |
| Factual errors admitted | 0 |
| Previously accepted neutral lost | 0 |
| Non-contrast diagnostic changes | 0 |
| Unrelated-ref false positive | 0 |
| Stale-state control admissions | 0 |

V2.2's 100 reviewed OOS objects are **development only** for V2.3. Fourteen explicit controls cover recovered contrast, current mismatch, absent/no authority, stale cited snapshots (different and equal values), movement-only refs, partial provenance, foreign/ambiguous authority, unknown refs, same/none dimensions and events newer than authority. Five repository tests exercise the authority boundary and unchanged historical-proof requirement. Existing V2.2 provenance tests run unchanged, including direct/event/mixed links, invalid selectors, missing/foreign/ambiguous identity and unsafe/performed-role fields. Non-contrast diagnostics are byte-equivalent on the prior reviewed dataset; the four accepted attributed self statements retain quotation and have zero performed-role leaks.

## Freeze

- Source: `10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d` (src/dev/reflection-v23.ts).
- Schema: `c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba` — identical to V2.2.
- Prompt: `fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09` — identical to V2.2.
- Evidence version 2; provenance model version 1.
- Reason-code set: unchanged V2.2, SHA-256 `9c0a4fbdba02061e70a300892ab3e20ee481c8ab46c41cf0dc53e73284d07a25`; the complete set and dependency hashes are in the freeze artifact.
- V2/V2.1/V2.2 remain byte-for-byte unchanged.

## Verification and next step

Typecheck PASS. Unit/integration **1947 passed, 0 failed, same 4 TODO (1951 total)**; playthrough **25/25**. Candidate frozen before the provider experiment. Local ignored artifacts in saves/d09-reflection-v23 contain the freeze, complete development outcomes/control diagnostics and test logs. No new semantic OOS was run.

Reliability investigation found no usable candidate and did not complete a valid three-arm comparison. Work next on provider/wire-schema compatibility and exact enforcement, preserving this semantic freeze. Do not rerun semantic OOS until a reliable configuration is established; then a separately authorized independent OOS must exercise provenance/extras and useful controls. No production integration is authorized here.
