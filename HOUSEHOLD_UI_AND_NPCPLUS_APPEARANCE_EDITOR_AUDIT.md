# Household UI and NPC+ appearance editor audit

## Household implementation and data sources

Household is a functional destination in the existing single-page shell. Close returns to Play without reloading, replacing the transcript or submitting a turn. Other navigation remains inactive. The two supplied PDFs guide layout only: none of their sample people, traits or activities are production data.

The overview consumes `derivePlayUiView` from committed session state. Its members are the existing household membership projection, excluding Nicco as already defined by `SessionView`. Unique opaque character refs prevent duplicate people from inflating counts across households. All, Here and Elsewhere filters use those same cards; aggregate counts remain unchanged by filtering. A zero-member household has a full-screen empty state. Before committed household data arrives, the screen says it is unavailable rather than inventing zero members.

The heading is "Household of the Heartstone" only when the real opening Heartstone household exists and Nicco is a current member. Other households use the generic "Household" heading; arbitrary household names have no disclosure contract and are not transported.

## Player knowledge, presence, relationships and conditions

Cards, scene participants and the existing read-only drawer reuse **one `PlayerCharacterView`**, including its stable opaque `ref`. Card-body clicks open that drawer; Edit is a separate button. There is no name lookup or second household/editor details serializer.

Public role, known relationship, observable conditions, name, appearance, affiliations, summary and learned story/history retain the projection's existing knowledge rules. Canonical public data uses the public character contract and visibility policy; created-character observations use established promotion origin; story facts require Nicco's knowledge edge. Unknown names remain masked. Private notes, private role, secret factions, hidden relationship dimensions, private memories, reflections and purpose/morality are not unlocked by management eligibility.

Here means the resolved current location equals Nicco's committed scene location and the character is neither inactive nor dead. Elsewhere means not currently present under that rule; it does **not** claim an exact destination. Off-scene `known_location` remains null, and the card shows Elsewhere. There is no last-known-location store or inference. Conditions are visible only here, using engine-classified observable physical tags or established origin observations. Arbitrary condition strings and presentation are hidden. Known relationship prose is distinct from internal runtime dimensions. Missing role/relationship/condition rows are omitted from the large cards.

No authoritative player-visible current-activity representation was found. There is no Doing row, task engine, duties/room assignment, or parsing of narration into activity/location/relationship.

## Editor eligibility and shell

The shared projection adds a read-only `appearance_editor_eligible` boolean: a non-player active NPC+ must currently belong to a household Nicco owns, and must not itself be that household's owner. A canonical person is eligible only after actual NPC+ household membership; arbitrary canonical people, temporary actors and unmanaged members receive no Edit button. Client checks also require household membership and the NPC+ flag. This boolean grants shell access, not permission to read private domains or mutate state.

Edit binds by opaque ref and opens the requested portrait/form layout. Back and Cancel return to Household, preserving the filter. All target appearance inputs are disabled. Apparent age can display an already-public canonical age band; other structured fields remain blank with explicit unavailable/not-tracked placeholders. Existing player-known appearance is displayed separately as prose. No prose is parsed into structured values.

Save is disabled; no appearance endpoint, edit DTO or write handler was added. Portrait, Regenerate and Reference are placeholders with disabled actions. Image prompt is read-only and explains the missing implementation. There is no fabricated prompt or portrait version strip.

## Current appearance architecture

| Source | Current representation and authority | Mutability / disclosure |
| --- | --- | --- |
| Canonical character | `CharacterEntity.appearance`: optional prose; species, sex, age band and occupation are separate public contract fields | Authored world data; not a UI management mutation. Public contract still requires owner visibility. |
| Promotion origin | `CharacterOriginSnapshot.established.appearance`: observed prose array, alongside established name/role/condition/background | Written once at promotion; no command edits origin afterward. Historical established evidence, not a current appearance editor model. |
| Campaign profile | `CharacterProfile.appearance: CharacterAppearance` | Existing optional validated/persisted fields, replaceable internally via `set_profile`; lacks an application appearance authoring/disclosure facade. |
| Current character state | Conditions, presentation, status and location | Runtime state, not permanent appearance. Presentation has no player-knowledge boundary and remains hidden. |
| NPC+ stable data and mannerisms | Contract evidence and separately modeled known/available observable mannerisms | Behavior/portrayal, not body structure. Private contract interpretation remains hidden; delivered quotes retain their account source. |
| Player-facing appearance | Public canonical appearance plus established origin appearance | Shared projection deliberately ignores unproven mutable profile appearance overrides. |
| Narrator-facing appearance | Canonical appearance/portrayal in NarrativeContext and campaign character profile in TurnContext | Richer engine context; receiving a field here does not grant the player knowledge of it. No narrator changes in this pass. |
| Portraits and prompts | UI placeholders only | No project portrait generation, deterministic image-prompt builder or version-history implementation found in the application/model/persistence source. |

Relevant source: `src/campaign/types.ts`, `validation.ts`, `characters.ts`, `promotion.ts`, `projections.ts`, `mannerisms.ts`; `src/world/character-contract.ts`; `src/scene/narrative-context-builder.ts`; `src/app/player-character-view.ts`, `play-ui-view.ts`, `game-session.ts`; `src/persistence/save-format.ts`; `docs/authoring/AUTHORING_GUIDE.md`.

**Structured fields already exist: YES.** `CharacterAppearance` supports optional height_cm, weight_kg, build, hair color/texture/description, eyes, skin, scars, distinguishing_marks, distinctive_traits and description. Age is separate (`exact` years or `approximate` description). The target measurements, face, usual attire and posture/bearing do not have dedicated structured fields. These existing fields are not necessarily populated or legitimately known to Nicco.

**A safe application editing path exists: NO.** `set_profile` is an internal command that replaces the entire profile, not a narrow appearance edit. `GameSession` supplies no managed appearance edit API with membership enforcement, revision checking and provenance/disclosure handling. Wiring it directly would risk overwriting other profile fields and diverging from the drawer's established appearance source. Optional structured fields existing in a save is therefore insufficient to enable Save.

## Gaps and recommended KISS next model

Do not introduce a second permanent-appearance campaign domain. Start with the existing optional `CharacterProfile.appearance`, treating absence as unestablished, and add only confirmed missing requirements in a separately scoped pass. Keep immutable origin as historical evidence and canonical authoring as a fallback; do not rewrite them when editing current appearance.

The next implementation needs one explicit resolved permanent-appearance contract shared by narration, player projection and a deterministic portrait prompt builder. It needs a narrow application mutation that validates current management eligibility and expected revision, merges only supported appearance fields into the existing profile, and records which edits/observations are legitimately player-known. A generic `set_profile` or automatic conversion of prose must not be the UI boundary. Define fallback/override precedence and observable/known provenance before exposing profile values. Unestablished traits stay absent, and public knowledge must never be inferred merely from narrator access.

Keep mutable condition, temporary presentation/clothing and behavior distinct from permanent physical appearance. Existing origin prose may describe clothing as well as physical traits: display it as an established account, without promoting every sentence to a permanent structured trait. Do not invent missing height, hair, measurements or clothing. Adding attire or posture later requires an explicit decision about temporary versus permanent state.

Narrator integration would require the same resolver to avoid contradictory canonical/origin/profile descriptions. This pass changes none of those reads or prompts. Portrait generation could safely consume only explicitly known/resolved physical appearance through a deterministic builder, never raw NPC+ state, secrets, hidden affiliations or private notes. It should remain separate from turn submission and only be implemented under a future authorized scope.

## Save and schema implications

The existing save envelope is version 4; the campaign snapshot is version 3. Optional profile appearance fields already have validators and round-trip persistence. Editing existing fields would not inherently require a new campaign domain or schema version. New fields or provenance still require deliberate validation, backward compatibility and migration review. No save format, validator, schema, migration or campaign authority was changed here. The new eligibility flag and overview title are read-only UI projection data, not persisted campaign state.

## Deliberately omitted

No permanent-appearance model implementation; no prose/LLM parsing; no speculative persistence; no narrator/controller/P3/P6/P8/P11/P12 changes; no relationships or personality editing; no story/knowledge editing; no household mechanics; no activity or last-known-location inference; no image provider calls, image generation, image-prompt builder, portrait versioning or unrelated navigation screens.

## Verification

Typecheck and build passed. Focused projection/UI tests cover actual managed membership, off-scene privacy, shared immutable refs, counts and filters, navigation/drawer reuse, unknown identities, observable versus secret conditions, known versus private relationships, disabled editor fields/Save, Cancel/Back, no network writes, no inferred activities and the full empty state. Existing projection coverage also exercises public/private role and summary, public/secret affiliation, created appearance, private notes and unknown canonical names.

Full suite: **2,495 tests; 2,492 passed; 0 failures; 3 existing TODO cases**. The focused projection/UI group comprises **64 passing tests**, including the new application eligibility case. Typecheck and build passed. The three TODO cases concern existing handover/condition/receipt grammar and are unrelated to this UI pass.

No connected browser was available. Used the already installed headless Edge with an isolated local QA fixture and a coordinator that rejects turns. Production contains none of its example people. Live checks verified three actual members, two Here and one Elsewhere; filtering; editor eligibility/navigation; disabled Save; zero horizontal overflow at 1440 and 520 pixels; and identical session responses before and after all UI interactions.

Screenshots:

- [Household desktop](docs/ui-screenshots/household-desktop.png)
- [Elsewhere filter](docs/ui-screenshots/household-filtered.png)
- [Editor desktop](docs/ui-screenshots/household-editor.png)
- [Household narrow](docs/ui-screenshots/household-narrow.png)
- [Editor narrow](docs/ui-screenshots/household-editor-narrow.png)

Paid calls: **0**. No OpenRouter, image provider, live turn or paid evaluation ran.
