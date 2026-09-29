# Phase 1C: Narrative Context Foundation

`NarrativeContext` is the explicit data boundary between the deterministic engine
and a future narrator. It is not a prompt, a player-facing response, or a serialized
WorldStore. [Types](../../src/types/narrative.ts) and the
[builder](../../src/scene/narrative-context-builder.ts) implement this boundary.

## Responsibilities

`SceneRam` remains an internal projection containing full canonical location
records and exact physical presence. It must never be sent directly to an LLM.
`buildNarrativeContext(world, runtime)` derives fresh Scene RAM, checks narrator
visibility, and constructs an immutable allowlisted projection. It takes no caller-
supplied scene snapshot that could be stale or belong to another runtime.

A future narrator adapter consumes that context and returns text and an optional
proposed `SceneDelta`. Only the delta engine can validate and commit changes.
Producing narrative text or returning a proposal does not mutate the runtime.

## Primary context only

The context contains `runtime_revision` and `scene`:

| Scene field | Included data |
| --- | --- |
| `player_location` | Current location ID, name, display name, summary, brief canonical introduction, features, and secret marker; null if explicitly narrator-hidden |
| `location_ancestry` | Visible ancestors, immediate parent through root, with ID, names, summary, and secret marker only |
| `world_time` | Numeric `{ world_minute }`, copied from the runtime scene |
| `player_resources` | Player-only `{ mana: { current, max } }` from runtime, with no abilities or lore expansion (Phase 1E) |
| `present_characters` | Visible, physically present NPCs with ID, names, summary, introduction, traits, and secret marker; sorted by canonical ID |

Features contain only name and description. Traits are the authored compact trait
strings; the builder does not infer, rewrite, or generate them. An ancestor's long
content/features are not copied. NPC locations are used to derive exact presence
but authored starting locations are not projected as current facts.

No chunks are selected in Phase 1C, even if a chunk has an explicit narrator-visible
policy. No descendants, siblings, remote mentions, historical events, related lore,
factions, relationships, aliases, connections, search cues, inventories, `known_by`
lists, or player/persona records are expanded. Nicco is never a present NPC.

## Narrator visibility

Every primary candidate (current location, ancestors, present NPCs) is checked
against its own explicit entity `knowledge` policy before projecting its fields.
Entity policies do not inherit from location parents.

- `visibility.narrator: false`: omit the entity completely, including its ID/name.
  A hidden current location produces `player_location: null`; hidden ancestors/NPCs
  have no placeholder entry. Other explicitly permitted primary records can remain.
- `visibility.narrator: true`: the allowlisted fields may be included.
- No entity policy: throw `NarrativeContextError`; missing policy is never public.
  This also applies to an unclassified ancestor or physically present NPC, rather
  than quietly presenting an incomplete scene as classified.

Every included record carries `secret: !knowledge.visibility.player`. `secret: true`
means narrator-only/non-player knowledge for that whole projection, including nested
features and traits. This machine-readable marker is retained without prompt prose.
It does not itself enforce secrecy in future generated output. A future narrator
integration must preserve that distinction and avoid unjustified direct disclosure.

Player visibility and `known_by` never grant narrator access. No player/NPC epistemic
inference occurs. Unclassified remote records do not matter because they are not
primary candidates. Hidden records are excluded before size checks, so their body
content is not inspected for projection. Errors expose a field and entity ID for
engine diagnostics; they are not narrator context and must not be forwarded as lore.

The entity policy covers all its projected fields. Canon authors must keep shared
summaries and features free of facts restricted to a different chunk; this builder
does not semantically redact prose. When later selecting chunks, their explicit
policy must override the entity policy for the passage, with omission inheriting
from the entity. That future selection is not implemented here.

Phase 1D replaces the initial structural examples with explicitly classified
Heartstone root/LR/CY/U1 canon and subsequently adds F1. These records build NarrativeContext normally.
Unclassified records still fail clearly; inspection never supplies a default policy.

## Bounded projection and determinism

Same world/runtime state produces structurally equal context. Arrays have stable
order; all returned objects and arrays are frozen. Fields are explicitly copied,
so no raw entity, runtime authority, or mutable alias crosses the boundary.
Earlier contexts remain unchanged after movement or time advances.

No tokenizer or new dependency was added. `NARRATIVE_CONTEXT_LIMITS` supplies simple
initial bounds measured using JavaScript string length (UTF-16 code units):

| Bound | Limit |
| --- | --- |
| IDs, names, display names, feature names | 200 characters each |
| Summaries | 600 characters each |
| Current-location/NPC introductions | 2000 characters each |
| Feature descriptions | 400 characters each |
| Individual traits | 200 characters each |
| Features per current location; traits per NPC | 24 each |
| Visible ancestors | 16 |
| Visible present NPCs | 24 |
| Total projected entity text, including IDs and repeated names | 16000 characters |

Exceeding a bound throws `NarrativeContextError`, identifying the field and entity
where relevant. No strings are silently truncated and no permitted candidates are
silently dropped to fit. These limits are not token estimates and do not constrain
canonical authoring. Keep primary introductions concise and place longer passages
in semantic chunks for future explicit selection. Future token budgets should cover
primary projections, selected chunks, recent conversation, persona, instructions,
and user input separately. None of those extra sections is implemented now.

## Runtime revisions and expected revision

`RuntimeState.revision` is a read-only getter starting at zero. It is runtime
metadata, not another scene clock or a field added to minimal `SceneState`.
Every successfully committed delta with any actual location/time/mana change increments
the revision exactly once, even if it changes multiple fields. A successful no-op
and any rejection leave it unchanged. Primitive movement/time calls use the same
path. Revision overflow is rejected before committing any changes.

`SceneDelta.expected_revision` is optional. When present it must be a nonnegative
safe integer equal to the current runtime revision. A mismatch (including a future
revision) is a stale-proposal error, even for a no-op. Validation and commit are
synchronous; there is no asynchronous gap. Standalone `validateSceneDelta` callers
must supply its fourth `runtimeRevision` argument when checking guarded proposals.
`applySceneDelta` always supplies and rechecks the actual revision.

Contexts capture the revision they describe. Future adapters should copy it into
proposed deltas, so an intervening change causes atomic rejection. Omission preserves
the existing local API. This is optimistic concurrency within one runtime only:
no request IDs, replay ledger, persistence, or cross-process locking. A guarded
no-op can be accepted repeatedly because it does not advance revision. Unguarded
time advances can still be applied repeatedly.

## Narrator adapter contract and mock integration

`NarratorTurnInput` contains only `context: NarrativeContext` and `user_message`.
`NarratorTurnOutput` contains `text` and optional `scene_delta`. `Narrator.narrate`
may return that output synchronously or through a promise. These are TypeScript
contracts only, not model-output parsing or a guarantee that external output is valid.

The test-only scripted narrator returns a supplied response without world reasoning
or invented canon. The integration test demonstrates:

1. Build living-room context at minute 100/revision 0 with Brenna present.
2. Pass context and a user message to the mock.
3. Receive fixture text and a delta proposing kitchen movement, Brenna movement,
   two minutes, and `expected_revision: 0`.
4. Apply the proposal through the runtime; revision becomes 1 and time becomes 102.
5. Rebuild Scene RAM and NarrativeContext; both reflect kitchen presence.
6. Verify the original context is unchanged and a stale retry changes nothing.

The mock lives only in tests. There is no production turn coordinator, network
adapter, prompt, model call, or automatic delta generation.

## Future enrichment and next phase

Future retrieval may enrich context with separately selected and classified
secondary passages. It must not bypass the primary visibility boundary, import raw
Scene RAM, or expand the entire world. Phase 1C adds no retrieval, conversation,
persona injection, persistence, frontend, or other gameplay mutations.

Phase 1D instead establishes the [canon authoring foundation](../authoring/AUTHORING_GUIDE.md)
and a development context inspector. The previously suggested turn coordinator is
not implemented. [Phase 1E](PHASE_1E.md) adds compact world lore and runtime player
mana without changing the secondary-lore exclusion or introducing retrieval.
