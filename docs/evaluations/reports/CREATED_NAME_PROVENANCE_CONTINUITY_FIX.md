# Created name provenance continuity fix

This is a follow-up to `LONG_PLAYTHROUGH_STATE_CONTINUITY_AUDIT.md` and `CREATED_PERSON_IDENTITY_BINDING_FIX.md`, dated 2026-10-07. It is scoped to how the narrator remembers where a created Campaign Character's name came from. No paid provider calls were made.

## 1. Root cause

A created character keeps `profile.name` durably. The only record of *how* that name was learned lived in the delivered transcript, and RecentConversation keeps at most 12 exchanges and is not saved. Once the introduction was evicted, or after a reload, the narrator still knew the name was "Mira" but no longer knew that she had said it herself. That gap allowed narration such as "you gave me a name to go with the shirt."

The narrator projection, `context-builder.ts` `promoted()` serialized as `established_at_promotion`, carried only the label, role, descriptor and background.

## 2. Existing persisted evidence audit

| Case | What was persisted | Could the source be recovered deterministically? |
| --- | --- | --- |
| 1. Self-introduction (promotion) | `origin_snapshot.evidence` strings such as `Mira: "Mira."`, plus the trigger `name_established` | **No.** The strings are display-formatted (`label: "quote"`) and capped at 8 units. `NameIntroduction.kind` and speaker were never persisted, and the same trigger also covers narration and third-party introductions. |
| 2. Player assignment | Nothing; `I'll call you Mira` establishes nothing | Not a durable path |
| 3. Third-party introduction | Evidence strings only | **No.** The introducing speaker is not recorded as a type. |
| 4. Narrator pattern (`a woman named Lysa`) | Evidence strings only | **No.** It is the same shape as case 3. |
| 5. Late naming (`set_profile`) | **Nothing.** `set_profile` changes only `profile.name`, and the origin snapshot is immutable, so the purchase-time snapshot stays as it was. | **No.** There is no evidence at all. |
| 6. Acquired unnamed character names herself | Same as case 5 | **No** |

The turn result's `identity.promoted`/`named` is per-turn and not saved. Save/load round-trips the snapshot exactly.

## 3. Whether new persistence was necessary

**Yes.** Late naming (cases 5 and 6) has no evidence to project, and re-parsing display strings for promotions would be a guess. Section 4 describes the one new optional field.

## 4. Final provenance representation

The new field is `CharacterProfile.name_source?: NameSource`, where

```ts
type NameSource = "self_disclosed" | "narrator_introduced" | "introduced_by_other";
```

- **Why on the profile.** It describes `profile.name`. Late naming already rewrites the whole profile through `set_profile`, so no new command was needed and the origin snapshot stays immutable. The record keeps exactly its five base keys.
- **Validation.** It is an optional choice in `validation.ts`; unknown values are rejected.
- **Backward compatibility.**
  - Old saves have no field, so their provenance stays unknown and nothing is guessed or migrated.
  - New saves stay valid under the current schema.
  - A save containing the field cannot be loaded by older builds, the usual cost of a new optional field.
- **No timestamps or IDs.** The learned-at time and speaker ID are not stored; the existing origin snapshot already records the promotion minute.

## 5. Self-disclosure path

The source is decided from the introductions that established the name, in `name-establishment.ts` `nameSource()`:

1. any `self` introduction gives `self_disclosed`;
2. otherwise a narration-voice `pattern` gives `narrator_introduced`;
3. otherwise a quoted `pattern` attributed to another speaker gives `introduced_by_other`; the speaker must not be Nicco and must not be the person themself;
4. anything else gives no field.

`buildPromotedCharacter` writes the field only when there is a name, and the origin evidence is left unchanged. Exact Mira case: `profile.name_source = "self_disclosed"`, and the evidence still contains `Mira: "Mira."`.

One small enabling change was needed in `narrated-captives.ts`. Quoted `pattern` introductions now keep their unit speaker, as `self` introductions already did, so rule 3 can exclude Nicco. Promotion decisions do not change, because `selfSpeakers` still filters on `kind === "self"`.

## 6. Late naming path

`readScene` namings come only from `self` introductions. The late-naming `set_profile` therefore writes `{ ...profile, name, name_source: "self_disclosed" }` on the **same record**. The ID, origin snapshot, legal status, household and other state are unchanged.

## 7. Player-assignment handling

**Not currently supported.** `I'll call you Mira` establishes nothing, so nothing can be mislabeled. There is deliberately no `player_assigned` value; validation rejects it, and the test covers that.

A narrator line in which Nicco introduces someone (`"This is Sovela," Nicco says.`) can still promote a person through the existing pattern path. Its provenance is recorded as unknown, never as self or third party.

## 8. Third-party handling

- Supported: `*The old man nods toward the woman.*` / `This is Sovela.` in RPG form, and `"This is Sovela," he says.` in legacy form, when Sovela acts in the scene. Both record `introduced_by_other`.
- Still not supported: an introduced person who never acts or speaks (`Her name is Sovela.` about someone absent). It stays `not_in_scene`, unchanged.

## 9. Unknown provenance behavior

The provenance sentence is omitted in all of these cases:

- a weak quote-opening name (`"Lysa. Twenty."`);
- a quote introducing someone that is attributed to no one, or to Nicco;
- old records;
- unnamed records, even if a source were supplied;
- records whose evidence happens to *look* self-disclosed but which have no field. This is tested with `Mira: "My name is Mira."` evidence and no field.

## 10. Narrator projection

There is one shared projection point, `context-builder.ts` `promoted()`. It adds `name_provenance` to `established_origin`, which the existing prompt line serializes as `established_at_promotion`. The raw `name_source` enum is removed from the projected profile, so the source appears exactly once.

Prompt form, from `NAME_PROVENANCE`:

| Source | Sentence |
| --- | --- |
| `self_disclosed` | `They told Nicco this name themselves; Nicco did not give it.` |
| `narrator_introduced` | `Narration introduced them by this name; not self-disclosed, not given by Nicco.` |
| `introduced_by_other` | `Another speaker introduced them by this name; not self-disclosed, not given by Nicco.` |

No other serializer was added; the UI, NPC card and household views are untouched. The UI reads specific profile fields, so the new field does not surface there.

## 11. RecentConversation eviction regression

Covered in `tests/created-name-provenance.test.ts` for both the promoted case (A) and the late-named acquired case (B). Each test runs this sequence:

1. Establish the name through the reciprocal RPG `Mira.` turn.
2. Add 13 more completed exchanges, so the original exchange is evicted; the test asserts it is gone.
3. Build the context and the narrator prompt.
4. Assert that Mira's character line contains the self-disclosure sentence and neither of the other two.
5. Assert that the line contains no raw enum and no raw evidence quote.

The audit's eviction characterization now asserts the fix: the raw quote is still absent, and the provenance sentence is present.

## 12. Save/reload regression

Both A and B are checked after `createSaveFile` → `serializeSave` → `decodeSave` → `CampaignState.restore`:

- the field survives the round trip;
- the prompt still carries the sentence after eviction;
- an old-shape record (no field) round-trips and stays unknown.

## 13. P3 non-impact

- No P3 code changed; `canonical-name-disclosure.ts` and `identity-knowledge.ts` are untouched.
- Canonical Mira Thorne in her shop has no `established_origin` and no `name_source`, and the prompt contains no provenance sentence.
- The P3, P3.1, P3.3, P3.4, P3.5, identity-continuity-stress and canonical-casting suites pass unchanged.
- No helper is shared with P3's `told` provenance; the two models stay separate.

## 14. Context/token impact

The prompt grows only for a present created character with a known source. It grows by one key and one fixed sentence, at most 90 characters (asserted). The test bounds the growth at the sentence length plus 40 characters.

All prompt-size tests pass with no recalibration: golden turn pipeline, context-compaction token pin, D04 band and coordinator prompt bounds. No golden fixture has a sourced created character, and none of the sentences contains the banned word.

## 15. Privacy impact

- The sentences are fixed strings. They contain no IDs, no quotes, no speaker names (the third-party sentence deliberately does not name the speaker) and no timestamps.
- Provenance is shown only for characters already in narrator context: present characters whose naming took place in Nicco's scene.
- The change adds no private notes, affiliations, NPC-private knowledge or relationship/reflection data.

## 16. Tests

- **New:** `tests/created-name-provenance.test.ts`, 6 tests, covering:
  - promoted self-disclosure: eviction, reload, evidence kept, no duplicate;
  - late naming: eviction, reload, same record;
  - narrator and third-party sources;
  - unknown cases: Nicco introducing someone, weak names, old saves, look-alike evidence, unnamed records;
  - player naming and canonical P3;
  - validation, bounded size, and no IDs.
- **Updated:** the audit eviction characterization was converted to acceptance.
- **Focused:** provenance, identity binding, audit, narrator-persistence, narrated-promotion, persistence, context-compaction, P3/P3.1/P3.3/P3.4/P3.5, identity-continuity-stress and canonical-casting: **197 passed, 0 failed.**
- **Full suite:** 2519 tests, 2516 passed, **0 failed**, 3 TODO (pre-existing known-limitation tests).
- Typecheck: PASS. Build: PASS.

## 17. Paid calls

0. All providers in the tests are local mocks.

## 18. Files changed

- `src/campaign/types.ts`: `NameSource` and `CharacterProfile.name_source`
- `src/campaign/validation.ts`: the optional profile field
- `src/campaign/promotion.ts`: `PromotionInput.name_source`
- `src/turn/name-establishment.ts`: `nameSource()`, and late naming marked as self-disclosed
- `src/turn/narrated-captives.ts`: pattern introductions keep their quote speaker
- `src/turn/context-builder.ts`: `NAME_PROVENANCE` and the projection
- `tests/created-name-provenance.test.ts` (new)
- `tests/long-playthrough-continuity-audit.test.ts`
- `CREATED_NAME_PROVENANCE_CONTINUITY_FIX.md` (new)

## 19. Deferred temporal work

Unchanged and next: sleep grammar, wait, `world_minute`, dayparts, until-night, mana recovery and elapsed-time narration grounding. The audit's three sleep characterizations still assert today's behavior.

**Observed, out of scope:** `player-character-view.ts` names a created character from `origin_snapshot.established.name`. A late-named acquired character, whose origin snapshot has no name, may therefore still show the label rather than "Mira" in the UI drawer. This is a UI projection issue and has not been changed.
