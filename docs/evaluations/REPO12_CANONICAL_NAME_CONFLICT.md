# REPO-12: canonical_name_conflict on a captive's self-introduction

Status: diagnosis, fix and canonical-name collision policy completion (section 10), **uncommitted** working tree on top of main `845d778` (Repository Cleanup A), 2026-10-13. No live call. No repository cleanup, docs move, commit or push.

**Verdict: the engine was wrong; the browser expectation was right.** The partner identity guard charged a self-introduction to the bound conversation partner without reading who NarrationFacts says spoke it. The fix is in the guard, the consumer of the facts. NarrationFacts itself, the browser check and the Brenna fixture are unchanged. **REPO-12 is CLOSED.**

## 1. Baseline (main `845d778`, from an empty `.build`)

| Check | Result |
| --- | --- |
| `npm test` | 3664 tests, 0 fail |
| `npm run benchmark:modern` | 55/55, 0 known gaps |
| `scripts/actual-offer-browser-check.mjs` | A1 to C2 pass; **D1 times out** (`actual-offer-browser-check.mjs:113`, waiting for "Brenna" on the trade card) |
| Offline reproduction (same fixture, real `TurnCoordinator`, scripted narrator) | audit issues of turn D: `["canonical_name_conflict"]`; delivered narration cut to `The woman lifts her head from the straw.`; the captive's profile stays `{}` |

The reproduction rebuilds the browser fixture:

- Korvin's canonical name is known.
- `campaign_character_brenna` is a created, unnamed, enslaved person held by Korvin at `calderan_slave_market`.
- Turn C: `*looks at the woman in the cage* Korvin, what about her?`, Korvin quotes the price.
- Turn D: `What is your name?` → `The woman lifts her head from the straw. "My name is Brenna," she whispers.`

## 2. Q1: who is who in turn D (observed, not assumed)

| Role | Entity | Evidence |
| --- | --- | --- |
| Speaker resolved by NarrationFacts | `campaign_character_brenna` | `speaker_attribution` fact, method `explicit_dialogue_tag` ("she whispers"), subject `campaign_character_brenna` |
| Subject of the self-introduction | `campaign_character_brenna` | `self_introduction` fact, form `my_name_is`, name `Brenna`, subject `campaign_character_brenna` |
| Conversation partner | `korvin` | turn C recorded `conversation_partner_id = korvin`; turn D plan focus `korvin`, addressed `[korvin]`; `boundPartner(...) = korvin` |
| Entity that received the attempted binding | `korvin` | `partnerNameConflict` returned `{ partner_id: "korvin", canonical_name: "Korvin", names: ["Brenna"] }` |
| Entity the conflict was evaluated against | `korvin` (canonical name "Korvin") | `narratorIdentityGate(...).selfDisclosureName("korvin") = "Korvin"`; "Brenna" ≠ "Korvin" → `canonical_name_conflict` |

So NarrationFacts attributed the line correctly, to the captive. The guard ignored that attribution and evaluated the line as Korvin's rename.

Side observation, not part of the fix: the trailing `reference` fact for `she whispers.` resolves the pronoun to `mistress_elara` (a present canon woman) instead of the speaker. Nothing consumes that reference here. It is recorded for NarrationFacts follow-up (section 9).

## 3. Q2: does a canonical Brenna exist?

**No.** No world entity has the name or an alias matching "Brenna" (`world.listEntities()` filter: none). "Brenna" occurs only in `src/dev/` fixtures and tests. The captive is a campaign character (origin `created`) with no name.

| Case | Verdict |
| --- | --- |
| A) the temporary captive falsely treated as canonical Brenna | **No.** There is no canonical Brenna, and the captive's id was never confused with a canon id. |
| B) the captive merely uses the same surface name as someone | **Not applicable.** No canonical bearer of the name exists, and no other campaign person is called Brenna. |
| C) the guard mistakenly evaluates the line as a rename of Korvin to Brenna | **Yes, this is the bug.** |

### Intended naming policy (as documented, not read off the implementation)

| Rule | Source |
| --- | --- |
| The same name is never a merge: two people with the same name are two readings | ARCHITECTURE (block 11, identity facts); `scene-identity.ts` header ("Names never merge people") |
| Canon names are not global keys: an absent canon person's shared first name can belong to one described narrated speaker | `scene-identity.ts` header |
| A name from narration creates no Campaign Character (it stays provisional) | AUTH-2 (block 5B), `name-establishment.ts` header |
| A present unnamed persistent person who self-introduces is named on the same record | invariant I10, `name-establishment.ts` header ("Late naming") |
| A bound canonical partner cannot self-introduce under another name; the name is rejected, not rewritten | invariant I5, register section 6, `partner-identity-guard.ts` header |
| A canonical name is learned only through a truthful, attributed self-introduction | invariant I4 |
| Keep track refuses a canon figure's exact name, a persistent person's name, and two temporary people with the same name | ARCHITECTURE (Keep track, block 12) |

None of these says a shared surface name implies a shared identity. I5 protects **the partner's own** self-introduction. It never authorised charging someone else's line to the partner.

## 4. Q3: the invariant and canonical names

**Invariant (now enforced):** a self-introduction by entity X is never evaluated as a rename or identity claim for an unrelated conversation partner Y.

The guard now counts a self-introduction against the partner only when its NarrationFacts subject may be the partner:

- the subject is the partner itself;
- the subject is a scene-local description the partner fits (`other:man` for Korvin, never `other:woman`);
- the line is unattributed;
- the speaker is ambiguous and the partner is one of the candidates.

Narrated people in the scene reading are filtered the same way, by their speaker keys.

May X establish a name matching a canonical character? From the rules that existed during the diagnosis (no new policy was invented there; the user's decision in section 10 then completed the last row):

| X is | What the existing rules give | Covered by |
| --- | --- | --- |
| a present canon character | their own canonical name is learned on the canon id; no duplicate | R7 |
| a narrated or temporary person, using an absent canon figure's whole name (a mononym or full name) | no provisional person: the canon figure owns the name | R2 (canonical collision) |
| a narrated or temporary person, using a shared first name | allowed for one described self-speaker when the canon full name is not referenced | existing scene-identity tests |
| a present unnamed persistent person | at diagnosis: late naming (I10) on the same record with no canon-name exception. **Now (section 10): an exact canonical name or alias is refused; the record stays unnamed** | section 10 |
| a persistent person who already has a name | cannot claim another name | existing scene-identity rule |

## 5. Root cause

`src/turn/partner-identity-guard.ts`, `partnerNameConflict`, had two paths that ignored who spoke:

1. **`spoken`** (spoken self-introduction facts of the delivered narration) assumed that `noCompetingSpeaker` "already established that no other person is their speaker". But `noCompetingSpeaker` is given only the narration's `*starred*` beats. A narration written as plain prose (`The woman lifts her head from the straw. "My name is Brenna," she whispers.`) has no beats, so the check passed vacuously. The guard never read the `self_introduction.subject` that NarrationFacts had already resolved.
2. **`own`** (named narrated people of the scene reading) took every non-persistent person who self-introduced in the exchange, whatever their speaker keys. That made a narrated woman's "My name is Lira" a conflict for Korvin too (R1).

The actual-offer D1 line hit path 1: the captive is persistent, so path 2 skipped her, and the `self_introduction` fact charged "Brenna" to Korvin. The audit then asked for a revision, the scripted narrator repeated the same text, and the delivery kept only the first sentence. The late naming never ran on the revised text, so the trade card stayed "Red-haired Slave".

Why it went unseen: every guard test (P0 hotfix T1 to T23) speaks through starred beats or a description that *is* the partner. None had another identified person speak in plain prose while a canonical partner was bound. The check has failed since at least `7345549` (block 10), before NarrationFacts identity facts existed.

## 6. Code fix

Only `src/turn/partner-identity-guard.ts` changed in `src/`, and no new prose reading was added. The guard consumes the NarrationFacts subject (`self_introduction.subject.entity_id` / `candidates`) and the scene reading's speaker keys, and compares them with the partner through the existing `compatible` / `headNoun` (`canonical-interaction-targets.ts`, already used by `noCompetingSpeaker` for the same "does this description fit the bound partner" question).

```ts
const fits = (key: string) => key === partner || (key.startsWith("other:") && compatible(i.context, partner, headNoun(key.slice(6))));
const own = reading.persons.filter(p => ... && p.keys.every(fits) && ...);
const mayBePartner = (s) => s.entity_id ? fits(s.entity_id) : !s.candidates.length || s.candidates.some(fits);
const spoken = identity.flatMap(f => f.kind === "self_introduction" && f.voice === "speech" && mayBePartner(f.subject) && ...);
```

What did not change:

- the reject-not-rewrite policy;
- the `canonical_name_conflict` audit issue;
- NarrationFacts;
- name establishment and Keep track;
- the gates (`GATES` untouched);
- the browser check;
- the save schema.

There is no special case for Brenna, for the browser test, or for any name.

## 7. Regression matrix (`tests/partner-identity-subject.test.ts`)

Real `data/` world, the real `TurnCoordinator`, scripted offline narration, Korvin as the bound partner unless stated otherwise.

| # | Scenario | Expected and asserted | Without the fix |
| --- | --- | --- | --- |
| R1 | Korvin is the partner (plan focus `korvin`); a narrated, non-persistent captive says `"My name is Lira," she whispers.` | no conflict; line delivered intact; provisional person Lira; no Campaign Character; Korvin unchanged | **FAIL** (conflict) |
| R2 | The browser line: the persistent unnamed captive says `"My name is Brenna," she whispers.` | no conflict; narration not cut; the SAME `campaign_character_brenna` named Brenna (`self_disclosed`); no canonical Brenna; Korvin unchanged | **FAIL** (conflict) |
| R2 (canonical collision) | A narrated captive claims an absent canon figure's exact name, `Pellan` | no conflict charged to Korvin; no provisional person (canon owns the name); no duplicate | pass |
| R3 | Korvin: `"My name is Korvin. You already knew that."` | no conflict; the captive is not named Korvin; no duplicate Korvin | pass |
| R4 | The captive: `"His name is Korvin," she whispers.` | not a self-introduction; no conflict; the captive is not named | pass |
| R5 | Two unnamed captives present: `A woman behind the bars whispers, "My name is Lira."` | fail closed: nobody named Lira, neither captive named; Korvin unchanged | pass |
| R6 | A kept persistent captive (`player_kept`) says `"My name is Sela"` | no conflict; same id named Sela in place; no new character; origin snapshot untouched | **FAIL** (conflict) |
| R7 | Korvin's name not yet known; he self-identifies as `"My name is Korvin."` | name learned on the canon id `korvin`; no campaign duplicate; the captive is not named | pass |

All the existing guard cases still pass, including the P0 hotfix suite `tests/foreground-canonical-binding.test.ts` (T1 to T23):

- an invented name from the described partner ("The man leans back. \"My name is Varro\"") is still rejected;
- a bare name answering a name question is still rejected;
- an unattributed `"I am Varro."` is still rejected.

## 8. Validation (diagnosis fix; the final run after section 10 is in section 10.5)

All runs below start from an empty `.build`. None of them made a live call.

| Step | Result |
| --- | --- |
| `npm run clean` | `.build` absent |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | **3672 tests, 3672 pass, 0 fail** (+8: `tests/partner-identity-subject.test.ts`) |
| `npm run benchmark:modern` | **55/55 PASS**, 0 FAIL, 0 known product gaps |
| `npm run check:architecture` | exit 0: 372 modules, **0 runtime back-edges** |
| Focused identity suites | **212/212** |
| `actual-offer-browser-check.mjs` | **21/21 PASS** (D1 now passes: the same offer re-renders as Brenna) |
| Other browser checks | block5b 13/13, block6 15/15, block7 19/19, explicit-promotion 13/13, keep-track 15/15; confirmation and turn-reliability exit 0 |

The focused identity suites are:

- the new matrix;
- the P0 hotfix `foreground-canonical-binding`;
- the block 11 `narration-facts-identity` tests;
- canonical casting;
- created-name provenance;
- created-person identity binding;
- identity continuity stress;
- objective vs known identity;
- p31 identity gating;
- p35 name knowledge commit;
- provisional Keep track;
- person Actual Offer (`actual-offer-v1`, `actual-offer-ui`, `person-offer-e2e`).

The runtime graph sha changed (`2c33f87b…` → `e6f09d3b…`) because the guard now imports `canonical-interaction-targets.ts`, which `canonical-name-disclosure.ts` already imported. That is one new acyclic edge and no new cycle.

After the fix, the offline trace gives:

- turn D audit issues `[]`;
- the delivered text is the full line;
- `campaign_character_brenna.profile = { name: "Brenna", name_source: "self_disclosed" }`;
- `partnerNameConflict` returns `undefined`.

## 9. Residual and follow-ups (not changed here)

- **NarrationFacts pronoun reference:** in `she whispers.`, the trailing `reference` fact resolves "she" to `mistress_elara` instead of the speaker. Nothing consumes it here; it is worth a NarrationFacts look.
- **Late naming with a canon figure's exact name:** found here and decided by the user; resolved in section 10.
- **Bare-word answers:** answering `What is your name?`, a bare quoted word such as `"Water," she whispers.` still late-names the persistent person "Water" (the existing bare-name answer rule). It was seen while building the control turn of section 10; it is unrelated to canonical names and was not changed.
- I5's description in the register now has the subject rule. Its gap column ("Scope deliberately narrow") still holds.

## 10. Canonical name collision policy completion (user decision, 2026-10-13)

### 10.1 Decision

Canonical character names and aliases are **reserved identity handles**. A non-canonical person, provisional or persistent, must not acquire an exact canonical name or alias that belongs to another identity, whether through self-introduction or name disclosure.

The collision fails closed **for the name establishment only**. It must not:

- merge the person with the canonical identity;
- replace the person's id;
- rename the canonical character;
- create another character;
- infer that the speaker "must really be" the canonical character.

### 10.2 Implementation

Existing machinery only: no new prose parser, no NarrationFacts change, no special case for Pellan.

- **`src/world/canonical-names.ts`** (new). It builds the reserved handles from the authored world, each mapped to the canonical id or ids that own it: every character's `name`, `display_name` and `aliases`, with case and inner spacing normalized and the result memoized per `WorldStore`.
  - `canonicalHandleOwners(world, name)` returns the owners.
  - `reservedForAnotherIdentity(world, name, self?)` ignores the character's own id, so a canonical character's own name is never a collision.
- **`src/turn/canonical-name-reservation.ts`** (new). It is the one rule for both sides of materialization. A name is checked as itself and as the whole name its `self_introduction` fact gave (`full_name`). That matters because "My name is Doran Hale" establishes the token "Doran" but claims the alias "Doran Hale". The handles come from the shared NarrationFacts identity facts, not from the prose.
- **`name-establishment.ts`** applies the rule in two places:
  - **after materialization**, to late naming: a persistent unnamed record that claims a reserved handle gets no `set_profile`. It is reported in `identity.skipped` with the new reason `canonical_name_reserved`, which joins the existing `canonical_partner_conflict` / `duplicate_name` / `persistent_identity_elsewhere` convention;
  - **before materialization**, to the provisional reading: no provisional person carries a reserved handle (same skip reason).
- **`keep-track.ts`** now checks the same rule, aliases and the claimed whole name included, where it used to check only `world` entity names. The block keeps its existing reason `canonical_name`.
- **No audit issue.** `canonical_name_conflict` stays the partner guard's own issue, and the narration is not revised. The person said the name, and only the engine's name establishment refuses it.

### 10.3 Regressions (`tests/canonical-name-reservation.test.ts`, 7 tests)

| # | Case | Asserted |
| --- | --- | --- |
| handles | handle table | `Pellan` → `pellan`; `"  doran   HALE "` → `captain_doran_hale` (alias); `Mira` is not a handle; `Korvin` is not reserved against `korvin` itself but is reserved against anyone else |
| 1 | unnamed persistent non-canonical person: `"My name is Pellan," she whispers.` (canonical Pellan exists) | same id; name unset; `identity.skipped` has `{Pellan, canonical_name_reserved}`; no character created; nobody carries the handle; no campaign record for `pellan`; the player learns nothing about Pellan; origin snapshot unchanged |
| 2 | the same with the alias `"My name is Doran Hale,"` | the same, with the established token "Doran" skipped and nobody named "Doran" or "Doran Hale" |
| 3 | Korvin (name not yet known) says `"My name is Korvin."` | allowed and reused: the name is learned on `korvin`; no campaign duplicate; no reservation skip |
| 4 | non-canonical unique name `"My name is Sela,"` | allowed: the same id is named Sela (`self_disclosed`) |
| 5/6 | rejected collision vs an identical control turn in which the captive says nothing | the same final revision; identical character records (id, origin, profile, location) and legal statuses: no rename, merge or duplicate |
| before | a narrated captive says "My name is Pellan"; Keep track over participants named `Doran Hale`, `Pellan`, `Sela` | no provisional Pellan; Keep track blocks `Doran Hale` (alias) and `Pellan` with `canonical_name`, and lets `Sela` through |

The R2 Brenna case and the whole R1-R7 matrix are unchanged: Brenna is not a canonical handle.

### 10.4 Doc updates

- `docs/architecture/NAMING.md`: the normative paragraph "Reserved canonical handles".
- `docs/architecture/NARRATION_FACTS.md`: the consumer rows for `name-establishment.ts`, `keep-track.ts` and `partner-identity-guard.ts`.
- `docs/ARCHITECTURE.md`: the Keep track fail-closed list.
- `docs/TESTING.md` and `docs/CURRENT_STATE.md`.
- Register invariant I10 (late naming never takes a reserved handle).

### 10.5 Final validation (from an empty `.build`, no live call)

| Step | Result |
| --- | --- |
| `npm run clean` | `.build` absent |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 |
| `npm test` | **3679 tests, 3679 pass, 0 fail** (+7). First run: 3678/3679, where the one failure was the known flaky `generation lifecycle (npc, fullbody)` (timing). Rerun once per standing order: 3679/3679 |
| `npm run benchmark:modern` | **55/55 PASS**, 0 FAIL, 0 known product gaps |
| `npm run check:architecture` | exit 0: 374 modules (+2 new), **0 runtime back-edges** |
| Focused identity suites (section 8 list + the new file) | **219/219** |
| Browser checks | **8/8 green**: actual-offer 21/21, block5b 13/13, block6 15/15, block7 19/19, explicit-promotion 13/13, keep-track 15/15, confirmation and turn-reliability exit 0 |
