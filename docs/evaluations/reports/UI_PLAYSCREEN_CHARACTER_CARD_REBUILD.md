# Play screen and NPC+ card rebuild

Implemented the two supplied PDF layouts in the existing vanilla UI: navy shell, magenta/cyan accents, serif transcript, thin top navigation, scene sidebar, compact household initials, bottom composer, location/gold card, and a right character drawer with a dark backdrop. The PDFs were visual references only; none of their sample people, balances, or scene values were seeded into the application.

## Files and data

- `src/ui/index.html`, `style.css`, `client.js`: visual layout, responsive stacking, participant selection, drawer, keyboard focus and close behavior.
- `src/ui/server.ts`: additive committed play-screen payload; existing endpoints and transport behavior retained.
- `src/app/play-ui-view.ts`, `game-session.ts`: read-only whitelist from the committed snapshot and existing session view. Reuses location, engine day/daypart, tracked gold, current participant presence, household membership, premium-character registration, identity knowledge, public canonical appearance/occupation, and campaign-established origin appearance/role. Stable opaque references bind selection without name lookup or displaying internal character IDs.
- `tests/ui-v1.test.ts`: existing assertions retained; added navigation/single-DOM, data, privacy, drawer, and final-only streaming checks.

The engine's day index is displayed as supplied (including Day 0). Missing purse records say “Not tracked”; missing character data is explicitly marked unavailable. Household counts describe current scene presence only; absent members' whereabouts are not exposed.

## Knowledge boundary and unavailable data

Canonical names require Nicco's existing identity-name knowledge. Unnamed created characters retain established descriptors. Unknown canonical participants use “Unfamiliar person”; the current session projection supplies no reliable player-known descriptor for them. Private canon, conditions, relationship dimensions, reflection notes, secret affiliations, and raw character IDs are not serialized into the public character payload. Only the requested canonical location ID is displayed.

Appearance uses public canonical fields for known identities or appearance established during promotion. Generic profile overrides without player-knowledge provenance are not surfaced. “With Nicco” and “State” remain “Not recorded”; affiliations say “None known” because no supported explicit player-known affiliation projection is available. Household and NPC+ badges use their actual registries. Temporary unpromoted narration-only people have no durable character binding in the existing session view and are not reconstructed from prose.

## Intentionally inactive

Nicco, Household, World, Debug and Save are semantic disabled navigation buttons. Upload, Generate, Edit NPC+, Personality, Relations, and Story & knowledge are disabled. Appearance, participant selection, close button, backdrop close, Escape, and drawer keyboard focus work. No portrait generation or paid provider calls were made. Full destination screens, portrait storage/generation, and knowledge-filtered relationship/state/affiliation projections remain follow-ups.

## Validation

Typecheck/build passed. The final complete regression suite reported **2,468 tests: 2,465 passed, zero failed, three existing TODOs**. The focused UI suites contain **37 passing tests**. Existing coverage continues to exercise normal composer submission, Enter/Shift+Enter, alternative responses, `/location` bypass and manual confirmation, streaming cleanup, session lifecycle, and committed-only updates. New coverage checks navigation, unique authoritative DOM nodes, actual day/gold/location ID, participants, stable identity binding, secret-field exclusion, drawer open/close, and draft-versus-final status updates. No game authority, narrator prompt, movement, economy, household, P3/P6/P11/P12, or save behavior was changed.

The connected browser runtime had no available browser. An isolated local headless Edge instance captured a disposable committed fixture session instead; no turn or save was submitted. Screenshots were visually inspected at 1440×1000 and 520×1000. Both widths had no horizontal overflow and exactly one location DOM node; the composer remained usable. The fixture's existing opening transcript is unchanged and is not evidence of its location; the status card reads committed state.

- [Desktop play](docs/ui-screenshots/play-desktop.png)
- [Desktop character drawer](docs/ui-screenshots/character-desktop.png)
- [Narrow play](docs/ui-screenshots/play-narrow.png)

Local commit only; no push.
