# Created-person identity binding fix

Follow-up to `LONG_PLAYTHROUGH_STATE_CONTINUITY_AUDIT.md`, 2026-10-07. Scope: RPG self-name disclosure, the reciprocal name question, canon first-name collisions, durable Campaign Character promotion, and the resulting scene visibility. **No paid provider calls.**

## 1. Root cause recap

A narration-created woman who answered `Mira.` never reached `establishNames`, so no `register_character` was ever proposed. Three independent blockers sat in `src/turn/narrated-captives.ts`:

- **A. Speech format.** The created-person reader only treated straight/curly quotes as speech. The narrator's RPG contract puts narration in `*single asterisks*` and leaves dialogue plain, so `Mira.` was read as narration.
- **B. Question grammar.** `ASK_NAME` did not treat `name's nicco, … what about you?` as a name question, so even a quoted bare `"Mira."` was not a self-answer.
- **C. Canon collision.** Every token of every canonical name was blocked. Because canon has `Mira Thorne`, the first name `Mira` was rejected even though Mira Thorne was absent.

**The live transcript (`longplaytrough_transcript.txt`) added one more blocker.** It was used only as reproduction evidence and nothing from it was imported. Every beat attributes the woman by pronoun only (`Her eyes stay half-open…` → `Mira.`). Pronoun history used to reset at every exchange, so the speaker would still have been unresolved after fixes A–C. The transcript also has no asterisks at all; the UI copy evidently dropped the RPG stars. Its prose is unambiguously RPG-shaped, so the fixtures restore the stars.

The transcript also shows that **she was bought for 50 gold** before being carried to Heartstone. If that acquisition had committed, she would have been an unnamed acquired Campaign Character and the right path would be late naming (`set_profile`), not promotion. Both paths are now covered (section 8). Whether the live purchase or travel committed is still unproven without the save/receipts, and it is out of scope for this pass.

## 2. Exact production changes

These are the only production changes; all are in `src/turn/narrated-captives.ts` and `src/turn/name-establishment.ts`.

- **`narrationUnits(…, options: { rpg?, carry? })`.** When `rpg` is set and the narration is valid RPG output (complete starred spans per `rpgNarration`, and `rpgDialogue` accepts it), the reader splits on stars:
  - starred spans keep the existing sentence/quote handling;
  - each plain line becomes a speech unit (`quoted: true`, `rpg: true`);
  - a plain line that carries a legacy attributed quote still goes through the legacy path.
- **Speaker of an RPG speech line.** It is the subject of the **immediately preceding narration beat** only, never stale history. A plural or compound subject leaves the line unattributed (`They…`, `The two women…`, `The woman and the girl…`), and so does a line with no preceding beat.
- **Pronoun carry (`rpg` mode only).** A she/he that cannot be resolved inside the current exchange binds to the **single** earlier scene subject of that established sex. If there are none or several, nothing binds.
- **`asksName(player)` (exported).** It accepts `ASK_NAME`, extended with `what do/should/shall I call you`. It also accepts a reciprocal `what/how about you`, `and you(rs)` or `, you?` that closes an input in which the player **first introduced himself as Nicco**.
- **RPG self-introductions need a speaker.** An unattributed plain line is nobody's self-introduction.
- **Canon nonduplication.** It is now actor-bound; see section 5.
- **`ReadOptions.rpg_speech` (opt-in).** Only `establishNames` passes it. Purchase/price resolution (`person-transactions`), narration audits and `character-contracts` keep their existing projection. That keeps P8 price authority unchanged; `p8-price-authority-audit` still passes untouched.
- **Doc comments** updated in both files.

The following are unchanged: the controller schema, `canonical-name-disclosure.ts` and `rpg-dialogue.ts` (reused, not modified), promotion authority, campaign validation, projections, UI, saves and temporal code.

## 3. RPG dialogue handling

```
*Her eyes stay half-open, fixed on his face. … Her fingers press flat against the cushion, then relax.*

Mira.

*She says it without ceremony…*
```

1. `Her eyes…` cannot resolve within the exchange, so it carries to the unique earlier female subject, `other:woman`, from `The tall woman lies on the sofa…`.
2. `The name lands…` has no subject, so the beat keeps `other:woman`.
3. `Mira.` becomes an RPG speech unit spoken by `other:woman`. Under a bounded name question it is a `self` introduction.

The resulting origin evidence is `Mira: "Mira."`.

Capitalized words are never names by themselves. A name needs a name question with a bare answer, or an explicit `My name is` / `I'm` / `Call me` pattern. It also needs an attributed, non-plural speaker.

## 4. Reciprocal-name grammar

| Input | Name question? |
| --- | --- |
| `name's nicco, i'm the keeper of the heartstone, what about you?` | yes |
| `Name's Nicco, what about you?` / `My name is Nicco. What about you?` / `I'm Nicco. And you?` / `NAME'S NICCO — how about you?` / `i am nicco, you?` / `I'm Nicco… and yours?` / `I'm Nicco — what do I call you?` | yes |
| `I'm tired. What about you?` / `I like tea. What about you?` / `What about you?` / `And you?` / `You alright? What about you?` / `Tea is good. And you?` / `What about you, Nicco?` / `I'm Nicco, nice to meet you.` / `I'll call you Mira.` / `What are your names?` | no |

The reciprocal phrase must **close** the input and must come **after** the player's own `Nicco` introduction. Generic reciprocal language never asks for a name on its own.

## 5. Canon collision policy, before and after

**Before:** a name was rejected if any token of any canonical character name matched it, whether or not that character was present.

**After**, the checks run in order:

1. **A present canonical bearer of the name.** The name is already in `known` (present people's names and tokens), so it is skipped as before. Case B.
2. **A self-introduction claimed by a present persistent speaker, or by several speakers.** Skipped, as before.
3. **An absent canonical bearer** (the token appears in some canonical full name). The name is skipped if any of these holds:
   - **exact:** the name *is* that person's whole name (a mononym canon character);
   - **referenced:** the canonical full name (`Mira Thorne`) appears anywhere in the scene's player inputs or narration (Case D, rumor/discussion);
   - **not bound:** the name was not introduced only by **one** described narrated speaker (`other:<woman|man|girl|…>`) through self-introduction. Pattern, third-party and verb-subject (`Mira nods`) introductions keep the canonical block (Case C).
4. **Otherwise the name belongs to that actor.** Case A: a distinct woman named Mira.

Names are not treated as unique keys: a first name, or even a full name, can belong to more than one person.

## 6. How canonical nonduplication stays protected

- **Present Mira Thorne speaking** (`mudlarks_herbs`): `Mira.`, `Mira Thorne.` and `My name is Mira Thorne.` all produce no commands.
- **Absent Mira Thorne, full name in the scene:** `Mira Thorne.`, `My name is Mira Thorne.`, `Do you know Mira Thorne? What's your name?` → `Mira.`, and `Have you heard of Mira Thorne?` all produce no commands.
- **Ambiguous speakers:** compound subjects, plural questions, two plausible earlier subjects, and a verb-subject `Mira` all produce no commands.
- **P3 canonical self-disclosure is untouched:** P3/P3.1/P3.3/P3.4/P3.5 and `canonical-casting` pass unchanged.

## 7. Exact Mira regression

These tests are in `tests/created-person-identity-binding.test.ts`.

- **Setup:** Heartstone LR, minute 600. Prior exchange: `*The tall woman lies on the sofa, her breathing shallow and feverish…*`. There is no Campaign Character, Household or NPC+ for her.
- **Turn 1:** input `name's nicco, i'm the keeper of the heartstone, what about you?`, delivered RPG narration with a plain `Mira.`. Exactly one `register_character` is produced.
- **Turn 2:** `so your name is Mira?` → `Mira.` produces no commands, so there is no duplicate.
- **End-to-end:** the same two turns run through `TurnCoordinator` with a scripted mock narrator. The delivered narration is unchanged, the identity result lists `Mira`, the commit is atomic, and the second turn promotes nothing.
- **Fallback:** if the first turn uses `I'm tired. What about you?`, nothing is established, and the explicit confirmation turn establishes her once.

## 8. Campaign Character promotion result

| Field | Value |
| --- | --- |
| ID | `campaign_character_r<revision>_mira` |
| Profile | name `Mira`, sex `female` (from the established noun) |
| Status | `active` |
| Current location | `heartstone_lr` |
| Origin snapshot | `narrator_ephemeral` / `name_established`, location `heartstone_lr`, established name `Mira`, descriptor `woman` |
| Evidence | attributed, e.g. `Mira: "Mira."` |
| Record keys | `current, id, origin, origin_snapshot, profile` only |

No other state changes:

- premium characters, Households, relationships, knowledge edges and legal statuses are unchanged;
- the canonical `mira_thorne` entity is deep-equal before and after;
- no record named "Thorne" is created.

**Late naming variant:** an acquired unnamed woman (`purchase_unnamed_subject`) at Heartstone LR answering the same reciprocal turn gets `set_profile` naming **on the same record**, with no promotion.

## 9. Scene/UI result

`deriveSessionView` → `derivePlayUiView` participants are `["Mira", "Nicco"]`. There is no scene-membership flag and no UI change; the existing co-located active-character derivation is what makes her appear.

## 10. Negative ambiguity tests

None of these produce a command:

- **Generic reciprocal phrasing:** `I'm tired. What about you?`, `Tea is good. And you?`, and a bare `What about you?`.
- **Unattributed speech:** `Mira.` before any beat; `Mira.` inside narration only.
- **Third-party naming:** `Her name is Mira.` and `Her name is Sovela.`, spoken by the old man.
- **Player naming:** `I'll call you Mira.` and `I'll call you Sovela.`.
- **Rumors and memory:** `There was a woman named Mira/Sovela, once.`; a narrated memory of "a girl named Mira".
- **Ambiguous speakers:** `What are your names?` with a plural subject; `The woman and the girl look up` (with both a colliding and a non-colliding name); a pronoun with two plausible earlier female subjects (both names); the speaker resolving to Nicco.
- **Canonical Mira Thorne:** present, or referenced by full name (section 6).
- **Verb-subject actor:** `Mira nods` with a colliding name stays blocked.

## 11. P3 regression status

P3, P3.1, P3.3, P3.4, P3.5, `identity-continuity-stress` and `canonical-casting` all pass unchanged. `canonical-name-disclosure.ts` was not modified. The created-person path imports the existing `rpgNarration`/`rpgDialogue` contract and does not change it.

## 12. Household/NPC+ non-involvement

Promotion creates a Campaign Character only. The tests assert there are no premium characters, Households, relationships or knowledge edges, and that the record has exactly the five base keys.

## 13. Deferred: name provenance

This pass adds no `acquisition_kind`, source-character persistence, save schema change, narrator prompt origin evidence, RecentConversation change or memory. Existing promotion-origin evidence is preserved, and the evidence now carries the attributed RPG speech line. The audit's history-eviction characterization is unchanged and still passes.

## 14. Deferred: temporal work

Nothing temporal changed: sleep grammar, wait, `world_minute`, temporal grounding, until-night, mana recovery and the elapsed-time narration guard are all as before. The audit's three sleep characterizations are unchanged and still pass.

## 15. Tests

- **New:** `tests/created-person-identity-binding.test.ts`, 10 tests.
- **Converted:** in `tests/long-playthrough-continuity-audit.test.ts`, the 4 identity characterizations that asserted the defect are now acceptance expectations. The eviction and sleep characterizations are untouched.
- **Focused run:** created-person binding, audit, narrator-persistence, narrated-promotion, scene-participants, canonical-casting, P3/P3.1/P3.3/P3.4/P3.5, identity-continuity-stress and P8 price audit. **161 passed, 0 failed.**
- **Full suite:** 2513 tests, 2510 passed, **0 failed**, 3 TODO. The 3 TODOs are pre-existing known-limitation tests that also appear in the baseline (2503 tests, 0 failed, 3 TODO).
- `npm run typecheck`: PASS. `npm run build`: PASS.

## 16. Paid calls / cost

0 paid calls and 0 OpenRouter calls; all providers in the tests are local mocks. Cost: 0.

## 17. Changed files

- `src/turn/narrated-captives.ts`
- `src/turn/name-establishment.ts`
- `tests/created-person-identity-binding.test.ts` (new)
- `tests/long-playthrough-continuity-audit.test.ts`
- `CREATED_PERSON_IDENTITY_BINDING_FIX.md` (new)

The user-supplied `longplaytrough_transcript.txt` is left untracked and uncommitted.
