# Heartstone household rite, canon, opening documents and stone warmth

Verdict: HEARTSTONE_RITE_COMPLETE. 3098/3098 tests (22 new in `tests/heartstone-rite.test.ts`), typecheck and build clean. Save schema unchanged. No commit, no push.

## 1. Rite = NPC+ promotion event
- One truth: the `premium_characters[]` record (existing NPC+ representation) IS the promotion. `isNpcPlus(snapshot, id)` is the single reader. `syncPremiumCharacters` runs inside preparation, so `join_household` + membership + promotion are one atomic revision, or nothing commits.
- Evidence (`src/turn/household-evidence.ts`, `detectHouseholdRite`): the candidate's own voiced oath (five essentials matched semantically, never by byte equality), voluntariness (no coercion, unconscious candidate, forced or compelled words, ambiguous silence), barefoot, direct stone contact, explicit Keeper acceptance (a spoken acceptance may follow its attribution in the next sentence). The Narrator establishes, the Controller proposes, authorization (`riteMissing` in `command-authorizer.ts`) verifies the receipt plus state (inside Heartstone, no worn footwear, active candidate).
- A rejected rite uses `rejected_reference_invalid`, so no verified quote can complete it. New diagnostics: `rite_incomplete`, `rite_not_voluntary`.
- No automatic demotion. Leaving the household flips membership only; the record stays. `SessionView.promoted` lists every promoted character with `household_member`, without ids.

## 2. Canon (normative, not paraphrased)
`src/campaign/heartstone-charter.ts`: the three rules, the canonical oath (display text only), the Keeper acceptance example. The matcher is separate from the display text. Lore (retrievable, not injected every turn): `heartstone_household_charter` (rules, rite, oath, variation, acceptance, voluntary conditions), `heartstone_stone_recognition`, `heartstone_deed_of_ownership`. The three rules are seeded as household rules at opening.

## 3. Opening documents
`Deed of Ownership — Heartstone Tower` and `Heartstone Household Charter` are real CampaignItems from initialization (owner Nicco, carried by Nicco, category document), through the existing item model. Possession is not legal ownership. Context carries only the short description; full text is retrievable on inspection.

## 4. Stone warmth (derived)
`src/campaign/heartstone-recognition.ts`: `recognizedByHeartstone`, `insideHeartstoneInterior`, `stoneFeel`. Nothing persisted. Keeper and active members feel gentle warmth through bare skin inside Heartstone; everyone else feels ordinary stone. The narrator receives one compact line (`HEARTSTONE_STONE_LINE`) only inside Heartstone. It names no one and canonizes no hot/cold split.

## 5. Existing tests realigned
Opening items shift counts (items, rules, lore entities, retrieval/semantic document counts, one compaction token pin). Household oath fixtures now use the canonical oath, a separate acceptance paragraph and a separate Nicco-referencing line for the relationship. Golden pipeline regenerated: diff is the two opening items plus the stone line (and the calendar date line from the earlier temporal pass in the scene golden).
JOIN regex widened to accept `decided/chose/chosen/swears` as past or third-person forms.

## 6. Open flags
- `activeNpcPlus` (the behavior gate) still goes inactive when a member leaves; `isNpcPlus` and `promoted` keep the promotion. Intentional, but worth a product decision.
- The evidence layer treats "will" as a hedge in the quoted sentence ("I will stay" fails; "I have decided to stay" passes). Pre-existing conservative rule, consistent with "prefer false negatives".
- The Controller policy text does not mention the full rite for Heartstone joins (policy hash left untouched).

No commit. No push.
