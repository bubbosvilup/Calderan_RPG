# Permanent Appearance V1

This follows up on `HOUSEHOLD_UI_AND_NPCPLUS_APPEARANCE_EDITOR_AUDIT.md` (commit `3938193`) and is dated 2026-10-07. It defines one permanent-appearance contract and gives the existing Household editor shell a narrow, safe save path. No paid provider calls were made.

## 1. Existing appearance architecture (audited)

| Source | Shape | Role in V1 |
| --- | --- | --- |
| Canonical `CharacterEntity.appearance` | **Prose only.** Species, sex and `age_band` are separate fields. | Immutable baseline prose. Read-only identity context. |
| `CharacterOriginSnapshot.established.appearance` | **Prose observations** (array), alongside sex/age/species | Immutable baseline evidence |
| `CharacterProfile.appearance` (`CharacterAppearance`) | Optional structured fields: `height_cm`, `weight_kg`, `build`, `hair.{color,texture,description}`, `eyes`, `skin`, `scars[{location?,description}]`, `distinguishing_marks[]`, `distinctive_traits[]`, `description`. Already validated and persisted. | **The one editable campaign layer** |
| Conditions, presentation, status, location | Runtime state | Never read by the resolver |

**Neither canon nor origin carries a structured appearance value**; both carry prose. Every structured value therefore comes from the profile. One historical detail matters: at promotion, `buildPromotedCharacter` copies the origin observations into `profile.appearance.description`, joined with "; ".

Before this pass:

- The narrator received canonical prose (in `baseline` and `identity.observable_appearance`) and the raw `profile.appearance` block **separately**, so the two could disagree.
- The player view showed canonical prose plus origin prose, and deliberately ignored profile appearance as unproven.
- The editor shell was disabled.

## 2. Final permanent-appearance contract

```
baseline prose (canonical authored appearance, origin observations)   ← immutable evidence, never parsed
+ CharacterProfile.appearance                                          ← the only editable layer, field by field
= ResolvedPermanentAppearance
```

There is no second persistence model and no new type of record: `CharacterProfile.appearance` is reused. An absent profile field means "no campaign value established"; it never means empty, unknown, or "delete canon".

## 3. Resolver shape

`src/campaign/permanent-appearance.ts` provides `resolvePermanentAppearance(world, snapshot, id, { canonical, overrides })`, which returns a frozen object:

- **`values`** — the established profile values, flattened (`hair_color`, `hair_texture`, `hair_description`, …). Scars appear as their descriptions, with the location in parentheses.
- **`baseline`** — the baseline prose, each entry tagged with its source (`canonical` or `origin`).
- **`description`** — the profile description if one is set, otherwise the baseline prose.
- **`identity`** — read-only species, sex and age, taken from origin, then profile, then canon.

Each caller decides two flags: whether canonical prose is public to its reader (`canonical`), and whether profile values are known to its reader (`overrides`).

Helpers in the same module:

- `appearanceLines`: human-readable lines.
- `narratorAppearance`: the compact narrator form.
- `applyAppearancePatch`: the narrow patch.

The result is stable and structured, so a future deterministic portrait-prompt builder can consume it directly.

## 4. Field precedence

Precedence is field by field:

1. **Structured fields** come only from the profile. No baseline structured values exist.
2. **Description:** a profile description wins over baseline prose. Otherwise the baseline prose is the effective description.
3. **The promotion-time copy is baseline.** A profile description that exactly equals the "; "-joined origin observations is that copy, so it is treated as baseline, not as an override.

Prose never overrides structured fields, and prose is never parsed into structured values. A structured override, such as hair color "white", sits alongside the baseline prose; it does not rewrite that prose.

## 5. Canonical behavior

- **Canon stays immutable.** YAML and the `WorldStore` are never written, and the test confirms the canonical entity is deep-equal before and after.
- **Canonical prose is baseline only.** The editor shows it as an inherited note. It is never copied into the profile on open or on save.
- **Editing a canonical character requires real management.** Profile overrides on a canonical record are allowed only when that character is a managed NPC+ household member.

## 6. Created-character behavior

- **Origin stays immutable.** The origin snapshot is never written.
- **The profile is the campaign state.** Edits take effect in the resolved appearance immediately, and a character created without appearance details builds up overrides one field at a time.
- **Identity is untouched.** Name and name provenance are not changed by an appearance save.

## 7. Profile override semantics (patch)

| Patch value | Effect |
| --- | --- |
| Field omitted | Unchanged |
| A value | Sets that field |
| `null` | Clears that profile override |

Validation rules:

- **Text:** trimmed, with internal whitespace collapsed. It must be 1–200 characters; the description may be up to 2000.
- **Whitespace-only text is rejected.** Clearing is always an explicit `null`.
- **Height and weight:** whole numbers only. Height is 30–300 cm and weight is 1–500 kg. Units are labelled in the UI and never converted.
- **Lists** (scars, marks, traits): 1–12 distinct, non-empty lines, each at most 200 characters. Each scar line becomes the scar's description.
- **Rejected outright:** unknown or non-V1 keys (`name`, `appearance`, `usual_attire`, …), an empty patch, and non-object patches.
- **Applying is all or nothing.** A patch that fails validation writes nothing.

## 8. Clear/reset semantics

Clearing removes only that override; the empty `hair` object, and then `appearance` itself, are dropped when they become empty. Baseline values are never written to the profile to simulate a reset.

Because no structured baseline exists, clearing a structured field returns it to **unestablished**, with the baseline prose (for example canonical "copper-brown hair") still applying as prose. The audit's "baseline hair black → override white → clear → black" example is therefore satisfied at the prose level, not as a restored structured value.

Clearing a description returns to the baseline prose. A scar's stored location survives as long as the scars field is not edited. When the scars field is edited, its lines become descriptions only; this is documented in the patch code.

## 9. Fields editable in V1

| Group | Fields |
| --- | --- |
| Body | height (cm), weight (kg), build, skin |
| Hair | color, texture, description |
| Face & details | eyes, scars, distinguishing marks, distinctive traits (lists: one per line) |
| Description | general appearance |

The UI groups are presentation only; persistence is the existing flat or nested `CharacterAppearance`.

Age is **read-only**. It appears in the identity line and has no narrow, safe age-mutation path, so it is not moved into appearance and not edited.

## 10. Mock fields deliberately unsupported

| Mock field | Class | Decision |
| --- | --- | --- |
| Usual attire | C: temporary presentation | Not persisted here; clothing is current state |
| Posture / bearing | B or D | No own field. It may be written as a distinctive trait. |
| Face / facial structure / face shape | B | No own field. Use the description or a distinctive trait. |
| Measurements / body proportions | D | Unsupported |
| Exact apparent age | D | Age is read-only |
| Tattoos / piercings | B | Use distinguishing marks |

These were removed from the form, which now notes which details are not tracked. No schema was added.

## 11. Temporary/current appearance separation

The resolver never reads conditions, presentation, status, location or behavior. The test confirms that the origin condition "feverish" never appears in the resolved appearance or in the editor payload.

The narrator still receives `current` (conditions and presentation) as a separate block, unchanged.

## 12. PlayerCharacterView integration

The card's `appearance` text is now `appearanceLines(resolvePermanentAppearance(..., { canonical: <public canonical access>, overrides: <managed member> }))`, passed through the existing identity masking. When no profile values are known to the player, the output is **identical** to before: canonical prose plus origin prose.

Profile values are shown only for a **managed** NPC+ member, whose appearance Nicco himself authors in the editor. For anyone else they stay unproven and hidden; the existing `UNPROVEN_PROFILE_APPEARANCE` test, plus a new `UNPROVEN_BUILD` test, confirm this.

## 13. Narrator integration

`context-builder.ts` adds `permanent_appearance` (`narratorAppearance` of the resolver, with full narrator access) for any present character that has campaign appearance values. `prompt-builder.ts` then makes this the **only** appearance block for that character, and drops the raw `profile.appearance`, `baseline.appearance` and `identity.observable_appearance` copies. Characters without campaign values are serialized exactly as before.

`current` (conditions and presentation) stays separate. The context profile itself is unchanged, so the noun matching in `player-authored-events` keeps working.

The golden turn pipeline was regenerated (`H2_UPDATE_GOLDEN=1`). The **only** prompt difference across all 33 messages is fixture Brenna's line: the raw `profile.appearance` and the `observable_appearance: null` copy are replaced by one `permanent_appearance` block with the same values. The trace's context-size counters grew (3900 → 4022) because the trace serializes the turn context, which now carries the resolved block alongside the profile. The context-compaction token pin and the D04 band needed no recalibration.

## 14. Editor projection

`PlayerCharacterView.appearance_editor` is **null unless the character is eligible**. It is bounded and frozen, and contains:

- `identity`: the read-only species, sex and age lines;
- `fields`: one entry per editable field, with `key`, `label`, `group`, `kind` (number, text or lines), `unit`, `override` (the stored campaign value as text, or `null`) and `inherited` (the baseline that applies without an override; currently only the description has one).

It reuses the same projection and masking, so there is no second serializer. It contains no internal IDs, origin snapshot, `name_source`, conditions, private notes or revision markers; tests assert this. The editor saves against the session state's campaign `revision` captured when it opened.

## 15. Eligibility and authorization

Eligibility is the existing contract with one addition: the character must be **active**, meaning neither inactive nor dead. The full rule:

- not Nicco;
- active;
- NPC+ with `active_household_member`;
- a member, not the owner, of a household Nicco owns.

Canonical characters qualify only through that actual membership. Ordinary Campaign Characters do not qualify by being in the scene. Household and NPC+ rules are consumed, never changed.

## 16. Narrow mutation API

`GameSession.updateNpcAppearance({ ref, expected_revision, patch })` performs, in order:

1. Refuse if the session is closed or a turn is running.
2. Check that `expected_revision` equals the campaign's current revision.
3. Check that the opaque ref is well formed (24 hex characters).
4. Resolve the ref through the same projection, among characters marked editable.
5. Apply the patch with `applyAppearancePatch`.
6. Rebuild the profile as `{ ...existing profile, appearance }`. Name, `name_source`, age, sex, species, voice and aliases are preserved byte for byte.
7. Run one `set_profile` through `campaign.prepare` (existing validation), then `commit`.

An unchanged result returns `changed: false` and commits nothing, so the revision does not move. The controller, models, LLMs and YAML are not involved. Rejections use existing codes: `stale_turn`, `turn_in_progress`, `invalid_input` (with `field`) and `campaign_validation_failed`.

The HTTP route is `POST /api/appearance`. It returns 200 on success, 409 for a stale revision or a running turn, and 422 when the save is refused. It uses the existing loopback and same-origin guard and the 24 KB body cap.

## 17. Revision handling

The editor stores the revision it opened with. A save against an older revision is rejected as `stale_turn`, with nothing written and no unrelated state lost. There is no auto-merge in V1. The user can keep their edits, cancel, or reopen to refresh.

## 18. UI behavior

The existing shell, classes and dark navy / magenta / cyan style are kept; there is no redesign. Behavior:

- **Inputs show only stored overrides.** Inherited values are notes beneath each field ("Inherited: …", "Not established.", "Saved campaign value. Empty the field to clear it."). Opening the editor never prefills baseline values, so saving cannot backfill them.
- **Inputs fill only at specific moments:** on open, and after a committed save. A periodic state refresh updates the header but keeps unsaved edits.
- **Save is enabled** only when the form is valid (whole-number measurements) and at least one field differs from its stored override after normalization.
- **Emptying a field:** emptying a stored override sends `null` (an explicit clear); emptying a field that has no override sends nothing.
- **Save is never optimistic.** The UI re-renders from the committed state the server returns.
- **Stale or invalid responses** show an inline alert and keep every input.
- **Cancel and Back** write nothing and return to Household with the filter preserved.
- **Portrait controls:** Regenerate, Reference and the image prompt stay disabled or read-only.

## 19. Save/reload behavior

Appearance edits persist through the existing save and reload paths, and the editor reopens with the saved values. Saves with no appearance, or without `name_source`, load and resolve unchanged.

## 20. Save schema impact

**No version bump.** This pass edits only existing optional `CharacterProfile.appearance` fields that the validator already accepts. The save envelope is still v4 and the snapshot still v3, and no new persistence was required. The rule that a promotion-time copy is baseline is a projection rule, not stored provenance.

## 21. Name/identity regression

The late-named acquired NPC+ (`profile.name = "Mira"`, `name_source = self_disclosed`, origin label "the woman") shows "Mira" on the card, the editor header and the drawer. After the save, the following are all unchanged, and the tests assert each:

- name and `name_source`;
- the opaque ref;
- character ID and current state;
- the origin snapshot;
- households, NPC+, relationships and legal statuses.

## 22. Privacy

The editor payload and the whole session state carry no `name_source`, origin snapshot, purchase trigger, private notes, conditions, internal IDs or revision markers; the HTTP test checks the full state. Canonical baseline prose goes through the existing public-access rule and the unknown-name masking. Management eligibility unlocks only the appearance editor. It does not unlock secrets, affiliations, private knowledge, reflection or relationship dimensions.

## 23. Image-generation deferral

Not implemented: portrait generation, reference upload, regenerate, versions and history, and prompt building or persistence. No image API, provider key or call was added.

## 24. Tests

- **New: `tests/permanent-appearance.test.ts`, 8 tests:**
  - canonical baseline plus override, clearing, and canon unchanged;
  - created origin plus override, the promotion copy treated as baseline, conditions excluded, and no backfill;
  - patch semantics and invalid inputs;
  - the end-to-end Mira flow: open, narrow save, the player view, the narrator's single block, reopen, save/reload, no-op save, and clear;
  - stale revision, plus unknown, forged, Nicco, ordinary-character and invalid-patch rejections with no mutation;
  - the HTTP route: 200, 409 and 422, with no private fields in the state;
  - eligibility: inactive and unmanaged canonical characters;
  - unmanaged readers never see profile values, and old records still work.
- **Updated: `tests/ui-v1.test.ts`.**
  - The editor test now checks that only stored overrides are shown, inherited notes, Save disabled until a real change, trimming treated as no change, an invalid number keeping Save disabled, Cancel/Back writing nothing, unsupported mock fields removed, and portrait controls disabled.
  - A new save-flow test checks that only changed fields are posted against the opened revision, a stale conflict keeps the edits, and a successful save refills from committed state.
- **Updated: `tests/golden/turn-pipeline.json`**, regenerated; the diff contains only the appearance-block move (section 13).
- **Focused:** appearance, player-character-view, ui-v1, ui-playtest, name projection, created-person and provenance, persistence, save-hardening, context-compaction, application-closure, golden, household, NPC+ and campaign/validation suites: **690 passed, 0 failed.**
- **Full suite:** 2542 tests, 2539 passed, **0 failed**, 3 TODO (pre-existing known-limitation tests).
- Typecheck: PASS. Build: PASS.
- **Not checked in a browser.** The layout uses existing classes plus small additions for textareas and notes; no headless screenshot was taken in this pass.

## 25. Paid calls

0.

## 26. Changed files

- `src/campaign/permanent-appearance.ts` (new): the resolver, display and narrator forms, and the patch
- `src/app/player-character-view.ts`: the card uses the resolver; the active rule; `appearance_editor`
- `src/app/game-session.ts`: `updateNpcAppearance` and `AppearanceOutcome`
- `src/ui/server.ts`: `POST /api/appearance`
- `src/ui/client.js`: editor fill, dirty detection, patch and save
- `src/ui/index.html`: editor fields
- `src/ui/style.css`: small additions for textareas, notes, the identity line and errors
- `src/turn/context-builder.ts`: `permanent_appearance` for characters with campaign values
- `src/turn/prompt-builder.ts`: one appearance block per character
- `tests/permanent-appearance.test.ts` (new)
- `tests/ui-v1.test.ts`
- `tests/golden/turn-pipeline.json`
- `PERMANENT_APPEARANCE_V1.md` (new)

## 27. Deferred V2 work

- A deterministic portrait-prompt builder over `ResolvedPermanentAppearance`, followed by image generation, references and versions.
- Structured scar locations in the editor.
- Age editing, if a narrow, safe path is designed.
- Whether attire or posture deserve their own permanent fields; they need a decision on temporary versus permanent state.
- Concurrent-edit merging.
- A browser layout check of the activated form.
