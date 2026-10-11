# Explicit NPC+ Promotion / Heartstone Rite Simplification

Status: evaluation report (historical once written). **No commit. No push.** Offline only: no live provider call, no historical replay, the frozen oracle untouched. Normative docs updated: [Heartstone](../HEARTSTONE.md), [Current state](../CURRENT_STATE.md), [Architecture](../ARCHITECTURE.md), [UI](../UI.md), [UI-engine contract](../UI_ENGINE_CONTRACT.md), [Roadmap](../ROADMAP.md), [Testing](../TESTING.md).

## 1. Verdict
**DONE.** The Heartstone household rite now completes mechanically in exactly one way: the player's explicit confirmation in the UI. Automatic detection from Narrator wording is completely gone (no matcher, no evidence, no diagnostics, no Controller path). Full suite, typecheck and build pass; browser validation 13/13.

## 2. Previous design
The Narrator wrote a ceremony; `detectHouseholdRite` (turn/household-evidence.ts) read it semantically (oath meanings, barefoot, stone contact, voluntariness, Keeper acceptance); `riteMissing` (command-authorizer.ts) added state facts (inside Heartstone, no worn footwear, active) and either authorized the Controller's `join_household` or rejected it with `rite_incomplete` / `rite_not_voluntary`. The Controller prompt asked it to propose the join when the candidate voiced the choice. Promotion followed the membership. The historical replay showed the weakness: promotion depended on the model voicing an exact ceremony.

## 3. New product rule
The rite is **player-authored fiction**. The player narrates it freely; when they consider it complete they click the promotion control. That click is the authoritative signal. This is intentional, not a workaround. Canon (what the rite consists of in-world) is untouched lore and roleplay guidance; the engine no longer polices the performance.

## 4. Authority model
One authority: `GameSession.completeHeartstoneRite({ref, expected_revision})`. Narrator prose and Controller proposals can never complete the rite. A Controller-proposed `join_household` into the household Nicco keeps is rejected by authorization with `rejected_command_not_allowed` (diagnostic `unauthorized_mutation`), however perfect the scene.

## 5. Eligibility (`src/campaign/heartstone-rite.ts`, never reads prose)
Character exists in the campaign; is a persistent campaign character that is not the Player Character; is not already NPC+; is active (not inactive or dead, existing lifecycle fields); is currently inside Heartstone (its own location, via the existing interior rule `insideHeartstoneInterior`, so outdoors at the tower does not count; V1 limitation documented); the Heartstone household exists and Nicco is its Keeper (owner). Refusal codes: `character_not_found`, `not_campaign_npc`, `already_npc_plus`, `not_active`, `not_at_heartstone`, `household_unavailable`, `not_keeper`, plus `stale_turn` for a revision conflict. Messages are player-safe and carry no ids.

## 6. UI control
A small up-arrow (↑) button under the character name and badges in the character drawer, `aria-label` "Promote <name> to NPC+" and title "Promote to NPC+". Shown only when `character_capabilities.can_promote_to_npc_plus` is true, i.e. for an eligible `campaign_npc`. Never shown for the Player Character, world/canon NPCs without a campaign record, existing NPC+, inactive/dead or out-of-Heartstone characters.

## 7. Confirmation
First click opens an inline panel, no modal wizard: "Promote <name> to NPC+?" / "Confirm that <name> has completed the Heartstone household rite. This will add them to the household and permanently unlock NPC+ capabilities." with Cancel and Promote. Cancel sends nothing; Promote sends one request (`POST /api/npc-plus/promote {ref, expected_revision}`); errors show inline and the player can retry or cancel; success re-renders the card as NPC+ with no reload. No promotion form, wizard, role/appearance/portrait step or ceremony UI.

## 8. Domain command
`heartstoneRiteCommands(world, snapshot, id)` validates eligibility and returns the one command, a `join_household` into the Heartstone household. No new command kind was added: the rite's effect already is "membership + derived promotion". No UI-tier-only promotion exists.

## 9. Atomic household + NPC+ behavior
`campaign.prepare` runs `syncPremiumCharacters` after the join in the same preparation, so the membership and the `premium_characters[]` record (with the initial mannerism and the `joined_household` development) commit in **one revision**, or neither does. Forbidden states (member without premium, premium without member) cannot result. A refusal commits nothing and costs no revision. A second attempt on an NPC+ is refused (`already_npc_plus`): no duplicate record, no duplicate member, no revision. Promotion preserves the same character id and record, appearance, location, relationships, knowledge, items and authored avatar fallback (compared byte-for-byte in a test); no relationship, fund, item or consent changes. Leaving the household later never demotes (`activeNpcPlus` unchanged).

## 10. Capability derivation
`character_capabilities` gains `can_promote_to_npc_plus` and `promotion_unavailable_reason` (src/app/character-capabilities.ts, filled in src/app/player-character-view.ts from the same eligibility function the command uses). The reason is set for a campaign NPC that cannot be promoted now and null otherwise; the UI hides the control when false. After promotion the next projection exposes the NPC+ capabilities naturally (Avatar, Full Body, Gallery, generation, appearance editing); the client toggles nothing.

## 11. Canonical NPC behavior
A canonical authored NPC with a campaign record (for example Korvin placed in Heartstone) follows the same rule: promoting keeps the same identity, keeps the authored avatar as the fallback, and a selected NPC+ Avatar still wins. A world NPC with no campaign record is not promotable (`not_campaign_npc`). Identity masking is respected (the confirmation shows the masked label, "Unfamiliar person", for an unknown identity). No portrait is required.

## 12. Save/load and schema impact
Reloading keeps membership, the premium record, the same character id and the tier. **No schema change**: snapshot stays 6, save file 5, no rite state, no `rite_completed` flag, no migration (asserted by a test).

## 13. Warmth
Recognition warmth is still derived from Keeper + active membership; the action stores nothing. A test shows ordinary stone before and gentle warmth after.

## 14. Narrator impact
None required. No prompt text asks the Narrator to manage the ritual (the old narrator prompt never did). The Narrator may roleplay the ceremony in any wording.

## 15. Controller impact
The Controller prompt now says never to propose `join_household` for the household Nicco keeps; an oath, ceremony or welcome is never a join (the policy hash was updated deliberately in the model-fallback test). `leave_household` voiced choices and the generic voiced join path for other households are unchanged. Defence in depth: authorization rejects the proposal even if one arrives.

## 16. Semantic matcher cleanup, 17. Deleted/retired code
Removed: `detectHouseholdRite`, `oathMissing`, `HouseholdRite`, and their constants (`COERCION`, `BAREFOOT`, `STONE_CONTACT`, `KEEPER_ACCEPT`, `KEEPER_NEGATED`, `OATH_PARTS`, `OATH_HEDGE`, `speechOf`) from `src/turn/household-evidence.ts`; `riteMissing` and `FOOT_SLOT` from `command-authorizer.ts`; the rite branch of `join_household` authorization (replaced by the single rejection); `household_rites` from turn evidence and its wiring; the diagnostic codes `rite_incomplete`, `rite_not_voluntary` and the `rite_missing:` description. Retained on purpose: `detectHouseholdChoices` (voiced `leave_household`, generic join for other households), `HEARTSTONE_CANONICAL_OATH`, `openingOathText`, `HEARTSTONE_KEEPER_ACCEPTANCE` (canonical display text pinned by a lore test; `HEARTSTONE_KEEPER_ACCEPTANCE` is now lore-only), the world charter YAML (lore), the generic `signals`/`code` fields of authorization diagnostics, `insideHeartstoneInterior` (reused). Dead-code audit: a repository search for `detectHouseholdRite`, `riteMissing`, `oathMissing`, `household_rites`, `rite_incomplete`, `rite_not_voluntary`, `rite_missing`, `keeper_acceptance`, `stone_contact` finds nothing in `src/`, `tests/` or `scripts/`; the only hit is the historical report `HEARTSTONE_HOUSEHOLD_RITE.md` (HISTORICAL ONLY, intentionally unchanged). Dev corpora: the controller benchmark case `n_household_join` no longer expects a join (oath is never a join).

## 18. Test changes
Removed (category B, semantic-engine): the rite detection tests R1-R15 and C4-C10 in `tests/heartstone-rite.test.ts` (membership+promotion from prose, coercion/unconscious/vague cases, rite outside Heartstone/footwear, oath matching, pose variations, Maren-like candidate). Kept (category A, lore): C1-C3 charter text, C11-C12 no love/obedience, C14-C15 retrieval, D1-D10 documents, T1-T10 warmth, now set up through the explicit action. Rewritten: `controller-authorization-hardening` (join is rejected, relationship still commits), `household-turns` end-to-end (oath in fiction promotes nobody, then the explicit action does), `controller-model-fallback` (policy hash). New (category C, promotion domain): `tests/explicit-npc-plus-promotion.test.ts` (18 tests) covering P1-P20, the two automatic-rite negatives with a perfect canonical rite, the no-prose positive, promotion distinct from membership, and the HTTP route (200/409/422, no ids). New in `tests/ui-v1.test.ts`: confirmation flow (open, cancel, confirm sends one request with only ref + revision, success re-render as NPC+, refusal shown inline) and arrow absent for canon/ineligible/NPC+. Final suite: 3205/3205.

## 19. Browser validation
Chromium/Playwright against the real server (`scripts/explicit-promotion-browser-check.mjs`, screenshots `explicit_promotion_*.png`): campaign NPC Brenna shows the arrow; click opens the confirmation with no request; Cancel works with no request; second click and Promote send exactly one request; Brenna becomes NPC+, the arrow disappears, Generate and Edit NPC+ appear, she shows in the Household view, no page reload, one revision; no arrow for an already-NPC+, for the Player; a campaign-record canonical NPC (masked identity) is eligible. **13/13 checks passed.**

## 20. Docs updated
Heartstone (rite section rewritten: canon vs engine, authority, eligibility, replay implication), Current state, Architecture (player-authorized state changes), UI (drawer arrow), UI-engine contract (new section 7c), Roadmap (limits and future polish), Testing (test files, count). Historical reports and the oracle untouched.

## 21. Remaining limitations
- Eligibility requires the character to be inside Heartstone's interior; outdoors at the tower is refused. Players who narrate the rite elsewhere must bring the character in first.
- An NPC not currently shown in the scene or household has no card to click (the control lives in the drawer).
- The arrow is hidden (not disabled) for an ineligible campaign NPC; `promotion_unavailable_reason` is available in the read model for a future hint.
- Future certification scenarios and replay benchmarks must trigger the promotion explicitly; a natural-language transcript alone cannot (documented in Heartstone and Roadmap). The old replay expectation for the rite is intentionally superseded.

## 22. Future optional polish
A richer promotion screen (role, appearance confirmation, portrait step), a disabled-with-reason arrow, and an undo/demotion policy were deliberately left out (KISS).

## 23. Single source of authority
`GameSession.completeHeartstoneRite` → `heartstoneRiteCommands` → one `join_household` → CampaignState preparation (`syncPremiumCharacters`) → one atomic revision.

## 24. Validation
Typecheck and build clean; full `npm test` result recorded below.

Full suite: **3205/3205 pass, 0 fail** (npm test); typecheck and build clean.

No commit. No push.
