# Current character name projection fix

This is a follow-up to `CREATED_PERSON_IDENTITY_BINDING_FIX.md` (`a25d1f1`) and `CREATED_NAME_PROVENANCE_CONTINUITY_FIX.md` (`7d281c8`), dated 2026-10-07. It is a projection-only fix. No paid provider calls were made.

## 1. Root cause

`src/app/player-character-view.ts` chose a created character's player-facing name from the **immutable origin snapshot** first, in two places:

- **The card name.** `named = origin ? !!origin.established.name : …` and `name = origin.established.name ?? …`. An acquired woman whose origin has no name stayed "the woman", and the card was marked name-unknown, after late naming set `profile.name = "Mira"`.
- **The prose-masking table.** Each created record's label was `established.name ?? origin.label ?? profile.name`. Any profile name that differed from the origin's established name was *substituted back* to that label. So "Mira" was also rewritten to "the woman" in every public text field.

The origin snapshot is history: what was known at creation. The current name lives in the profile.

## 2. Every affected projection path found

| Surface | Path | Affected |
| --- | --- | --- |
| Card (`PlayerCharacterView.name`, `name_known`, `category`) | `playerCharacterProjection().project` | **yes**, fixed |
| Prose masking of all card text | `playerCharacterProjection` substitution table | **yes**, fixed |
| Scene sidebar ("In the scene") | `derivePlayUiView` → `participants[].name` / `.card` from the shared projection | inherited, fixed |
| Character drawer | `client.js` `openCharacter(card)`, using the participant's or household member's card | inherited, fixed |
| Household overview and cards; server `household` list | `derivePlayUiView` → `household[].members` (cards); `server.ts` sends `name` when `name_known` | inherited, fixed |
| Appearance editor header | `client.js`, from the household card | inherited, fixed |
| `SessionView.scene.present[].name` / `household[].members[].name` | `session-view.ts` `name()`: already `profile.name ?? origin.label` | not sent to the Play UI client; unchanged |
| Dev status CLI | `dev/campaign-status.ts`: already `profile.name ?? origin.label` | dev only; unchanged |

Only the shared projection reaches the UI client, so the fix is a single place. No Household-specific or drawer-specific serializer exists or was added.

## 3. Previous precedence (created characters)

1. If an origin snapshot exists: `origin.established.name`; otherwise `origin.label` as "name unknown".
2. If there is no origin snapshot: `profile.name`.
3. Any differing profile name was masked to the label.

## 4. New precedence

One shared helper, `knownCreatedName(record)` in `player-character-view.ts`, is used for the card name, `name_known` and the masking table:

1. **The current `profile.name`,** when play established it. That means either:
   - it equals the promotion-time `origin.established.name`, or
   - name establishment wrote it together with its provenance (`profile.name_source` present), as late naming does.
2. **Otherwise the origin's established name.** This covers an unproven profile override on an origin-bearing record.
3. **No name.** The card shows the origin label or descriptor ("the woman") with `name_known: false`, or the existing "Unfamiliar person" fallback.

A record without an origin snapshot keeps the pre-existing rule: its profile name.

Renaming a character who already has a name is not a supported path: late naming applies only to an unnamed record. If it ever happens with provenance, the current name wins and the origin stays as history.

## 5. Knowledge-boundary handling

The rule does **not** treat every `CharacterProfile.name` as public. This is the audit of writers of a created profile name:

- **Promotion,** in `name-establishment.ts` or `person-transactions.ts`, through `buildPromotedCharacter`: the profile name is the established name taken from delivered narration in Nicco's scene.
- **Late naming,** in `name-establishment.ts` `set_profile`: the character's own self-disclosure in Nicco's scene, which now writes `name_source`.
- **The controller** cannot emit `register_character` or `set_profile`; neither is in its schema.

Any other profile name on an origin-bearing record has no evidence, and it stays hidden and masked; the existing "unproven profile" posture is kept. `name_source` is used only as that evidence. Its raw values never reach the UI, and the test asserts this.

## 6. Late-name acceptance case

Setup: an acquired unnamed woman (`purchase_unnamed_subject`, label "the woman") is a household member at `heartstone_lr`. She then gives the reciprocal-question answer `Mira.`.

**Before naming:**
- the card shows "the woman", with `name_known: false`;
- the sidebar shows "the woman".

**After naming, the record:**
- `set_profile` gives `profile.name = "Mira"` and `name_source = "self_disclosed"`;
- the origin snapshot is deep-equal to before, and `established.name` is still absent;
- the character count is the same, so there is no duplicate.

**After naming, the projections:**
- the card shows "Mira", with `name_known: true` and a Household category;
- the sidebar entry and its drawer card show "Mira";
- the Household member card shows "Mira";
- "the woman" no longer appears among the participants.

## 7. Promotion-time-name regression

A character promoted as "Mira" (`profile.name == origin.established.name == "Mira"`) still displays "Mira", with `name_known: true`.

## 8. Unnamed fallback

An unnamed acquired character still displays its label or descriptor, "the woman", with `name_known: false`. A created record whose unproven profile name is `UNPROVEN_NAME` also displays "the woman", and the string appears nowhere in the Play UI view.

## 9. Canonical non-impact

The canonical branch is unchanged: identity-name knowledge, P3 visibility and unknown-name masking.

- Canonical Mira Thorne, unknown to Nicco, is still "Unfamiliar person" with no "Mira" or "Thorne" in her card.
- A canonical record carrying an unproven profile name, even with a `name_source` value, is still not named by it.
- The existing canonical tests ("a known canonical name does not grant unproven profile names or aliases", masking and gating) pass unchanged.
- A created "Mira" reveals nothing about Mira Thorne.

## 10. Opaque-ref stability

The ref is still `sha256(campaign_id:id)`. It is identical before and after naming, and the test asserts this. Selection, drawer, household and scene bindings use the ref or ID, never the name. No name-based lookup was introduced, and the client code is unchanged.

## 11. Household and drawer propagation

The sidebar, drawer, Household overview and editor header all consume the same `PlayerCharacterView` card, so the corrected name propagates with no surface-specific code.

## 12. Old-save behavior

- Records without `name_source` load unchanged; the save schema is unchanged.
- A promotion-time name (profile name equal to the established name) displays as before.
- A record late-named **before** name provenance existed has a profile name, no established name and no `name_source`. Under the previous rules it was not player-visible, and its source cannot be shown from saved data. This fix does **not** infer provenance for it, so it keeps displaying its label. The case is documented and tested.

## 13. Tests

- **New:** `tests/current-character-name-projection.test.ts`, 4 tests:
  - the late-named acquired woman across the card, sidebar, drawer and Household; same ID and ref; origin unchanged; no duplicate; no raw enum;
  - promotion-time names, the unnamed fallback and unproven created names;
  - old saves: loading, a promotion-time name, a legacy late name not inferred, and a provenance-bearing late name surviving reload;
  - canonical gating unchanged, an unknown canonical Mira Thorne masked, and no canonical leak.
- **Focused:** name projection, player-character-view, ui-v1, ui-playtest, created-person identity, created-name provenance, narrator-persistence, Household and P3/identity suites: **226 passed, 0 failed.**
- **Full suite:** 2533 tests, 2530 passed, **0 failed**, 3 TODO (pre-existing known-limitation tests).
- Typecheck: PASS. Build: PASS.

## 14. Paid calls

0.

## 15. Changed files

- `src/app/player-character-view.ts`: `knownCreatedName()`, used for the card name, `name_known` and the masking table
- `tests/current-character-name-projection.test.ts` (new)
- `CURRENT_CHARACTER_NAME_PROJECTION_FIX.md` (new)

Name establishment, name provenance, P3, scene participants, Household and NPC+ mechanics, the temporal resolver, the narrator prompt, the controller, the save schema and the UI client were not touched.
