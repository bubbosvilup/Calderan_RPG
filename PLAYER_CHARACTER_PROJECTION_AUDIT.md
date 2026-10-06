# Player-facing character projection

The existing drawer layout is retained. Character disclosure now lives in one read-only `playerCharacterProjection(world, snapshot).project(characterId)` API with a typed, deeply frozen `PlayerCharacterView`. Internal IDs are accepted only inside the application; returned objects carry an opaque stable UI reference. `derivePlayUiView` adapts these same objects for scene entries and household entries. The household mini card can open the drawer, and the existing Story & knowledge tab now renders the projection. A future people view can consume this API without implementing its own knowledge serializer.

## Audit and disclosure rules

| Domain | Existing representation reused | UI boundary |
| --- | --- | --- |
| Identity | Dedicated identity-name facts and Nicco's `knows` edge; established promotion origin | Unknown canonical names stay masked. Name discovery grants no biography, role or secret access. |
| Role | `characterPublicProfile().occupation`; established origin role; role in a household Nicco belongs to | Canonical profile requires classified player/narrator visibility and a present, named or household subject. Membership role is confined to Nicco's known household. |
| Current condition | Existing `isPhysicalCondition` vocabulary; origin's established condition observations | Only current, present characters; origin conditions must still exist in current state. Arbitrary condition/presentation strings are withheld. |
| Location | Authoritative current co-location | Here is observable. Absent authoritative locations, authored home/work locations and inferred whereabouts are withheld. |
| Relationship | Canonical edge description and its inherited/overriding `KnowledgeAccess` | Owner and edge must pass public access. Runtime dimensions, scores and `relationshipHeadline` are narrator-facing and excluded. |
| Affiliation | Policy-bearing public faction `members`; membership in Nicco's own household | Public faction membership supplies a safe representation. Known household membership uses the factual label “Nicco's household” without exposing unclassified household names or IDs. Character `affiliations` is part of narrator portrayal and is never automatically disclosed. Secret factions remain hidden. |
| Appearance/profile | Existing public character-profile helper; immutable promotion appearance | Public species, sex, age band, occupation and appearance retain the canonical policy. Established campaign appearance remains available. Generic unproven profile overrides are withheld. |
| Public summary | Canonical `summary` | The authoring template explicitly defines this as `public_summary`; the owner must pass public access. |
| Story facts | Canonical entity/chunk facts explicitly bound to the subject, plus Nicco's campaign knowledge edges | Effective chunk/owner visibility must remain public. Identity facts are excluded. Beliefs, suspicions and rumors retain their status. Merely learning a name or having a publicly retrievable chunk does not mark its story as learned. |
| History | Learned `history` chunks; established origin background | Origin accounts retain their source rather than becoming objective history. Other learned sections remain visible as story facts. |
| Self-description | NPC+ contract evidence quotes | Contract capture requires a present character's first-person self-description in delivered narration. The quoted account is visible with attribution; inferred/stable contract text is not treated as a public personality diagnosis. |
| Recognized observations | NPC+ mannerism epistemic state, `known_by_character_ids`, and existing availability predicate | Requires Nicco recognition, observed/established state, current presence and satisfied prerequisites. |
| Knowledge boundaries | Public summary, explicitly learned facts, and a factual explanation of projection scope | Does not infer what an NPC knows or does not know from private knowledge grants. |

`isVisible` is reused from retrieval policy; missing policy is unclassified. Effective chunk/edge policy inherits its owner when absent. Canonical `known_by` is NPC-only, enforced by world validation; it is not a Nicco grant. Full NarrativeContext is **not** a public UI representation: it includes confidential encounters, narrator portrayal, current conditions, relationship dimensions and NPC-private knowledge. Being included there alone is not treated as player disclosure.

Every returned prose field passes identity/reference masking. Unknown canonical names, ungranted aliases/titles, secret entity labels, fact IDs, chunk IDs and internal machine references do not enter visible text. The projection never returns `private_notes`, purpose, morality, secret canon, relationship dimensions, private memories or reflection notes.

## Explicit gaps

- Generic campaign statements have no structured subject binding. Even a Nicco-known statement cannot reliably be assigned to a particular character without guessing from names or fact IDs; these are not attributed to cards.
- Runtime conditions/presentation outside the classified physical vocabulary or established-origin observations lack a player-knowledge boundary. No broad “all current state is observable” rule was introduced.
- Runtime relationship changes/headlines and NPC+ developments/rollups/reflections have no reliable player-disclosure provenance. They remain hidden; a canonical public relationship description does not reveal current private feelings.
- There is no explicit last-known-location store. Off-scene location stays unknown instead of exposing current omniscient state.
- Raw character affiliations have no per-association access policy. Public faction membership is supported; affiliation-only links require future explicit knowledge evidence.
- Generic appearance/profile edits have no public provenance. Campaign-established origin appearance is supported without exposing unproven overrides.
- No alias-specific discovery or player-known NPC knowledge/ignorance model exists. Neither is inferred from narrator permission metadata.

These gaps require explicit disclosure/provenance data in a separate engine task. This pass does not change narrator requests, campaign authority, P3/P6, relationship values, character state, save schemas, or the UI layout. No provider calls were made.

## Files and validation

New shared projection: `src/app/player-character-view.ts`. Layout adapter: `src/app/play-ui-view.ts`. Transport compatibility mapping: `src/ui/server.ts`. Existing drawer/household content binding: `src/ui/client.js`, `index.html`, and the existing paragraph style extended to Story & knowledge. Tests: `tests/player-character-view.test.ts` plus additive drawer tests in `tests/ui-v1.test.ts`.

Deterministic tests cover public/private roles, present/absent observable conditions, hidden/internal conditions, public/private relationship edges, private dimensions, public/secret affiliations, public summary/private notes, established campaign appearance and sourced history, unknown identity masking, unproven profile names, learned versus unlearned facts, rumor status, quoted NPC+ accounts, immutable shared scene/household objects, and inert Story-tab rendering.

Build/typecheck and diff checks passed. **56 focused projection/UI tests passed. Full suite: 2,487 tests, 2,484 passed, zero failed, three existing TODOs.** Local commit only; no push or paid calls.
