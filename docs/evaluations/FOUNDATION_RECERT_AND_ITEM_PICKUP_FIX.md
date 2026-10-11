# Foundation Re-certification and Item Pickup / Inventory Lifecycle Fix

Authored on top of the uncommitted Temporal & Environmental Systems V1 (base 7820d5a). **Not committed, not pushed.**

## 1. Executive verdict
FOUNDATION_RECERTIFIED_WITH_MINOR_KNOWN_LIMITATIONS. Pickup of an existing item is now semantically correct end to end; drop and handoff are consistent with it. 3046/3046 tests, typecheck and build clean, no save-schema change. Live smoke: pickup and continuity succeeded; the live drop turn is inconclusive for a non-state reason (section 29).

## 2. Baseline
Calendar, season, weather, canon migration and gap closure all on the working tree (3027 tests before this pass). Item domain: `src/campaign/{items,inventory,item-transfer}.ts`; pickup/drop is `place_item`, handoff is `transfer_item`.

## 3. Bug reproduction
Offline harness `src/dev/item-lifecycle-inspector.ts` (real TurnCoordinator, real evidence verification, scripted narrator and controller, stubbed wire). Eight scenarios A-H plus three live turns. Findings before the fix:
- A, B, F, G: pickup of a tracked item lying here commits and the item is in the inventory. The state machine itself was correct.
- C: the controller omitted the command: no mutation (nothing_intended).
- H: narration "He picks it up and weighs it." with the quote not naming the item: rejected (`placed_item_not_named`), so the item stayed on the ground.
- E: narration "Nicco looks at the sword on the floor." with a pickup proposal was AUTHORIZED and committed: the verifier only checked that the item was named, with no act check.
- C/D/H: `SessionView.player.inventory` listed Nicco-owned items lying on the ground (`owner_id === "nicco" && position stored`), while the UI inventory did not.
- Live run 1, turn 1: the controller quoted "Nicco's hand closes around the grip ... where it rests on the floor." and the lift was in the next sentence; rejected (`no_completed_placement_act` after the new verb check, `placed_item_named` before it only by luck).

## 4. Root cause
Three independent causes, none in the state transition:
1. **Evidence authorization accepted or refused on the wrong signal.** The place_item branch only required "one word of the item's name appears in the quote". There was no act check (so "looks at the sword" picked it up) and no way to read a receipt whose object is a pronoun or whose act is completed in the next sentence (so real pickups were refused).
2. **A second inventory rule in `SessionView`.** `player.inventory` was computed from `carried by nicco OR (owner nicco AND stored)`, so ownership leaked into inventory and the facade disagreed with the UI inventory and the domain query layer.
3. **Same-name ambiguity was unguarded.** With two items sharing a name word, the quote accepted whichever id the controller chose.

## 5. Authoritative item model
One field, `CampaignItem.position` (`unknown | carried | equipped | stored`), plus a separate `owner_id`. Documented in `docs/architecture/ITEM_DOMAIN.md` (new "Placement lifecycle" section).

## 6. Placement invariants
An item has exactly one position: carried/equipped by one character, or stored at one location, or unknown. Carried implies no location; stored implies no carrier. The schema cannot express both, so no normalization was needed.

## 7. Pickup semantics
`place_item` to `carried(actor)` from `stored(here)`: same id, owner unchanged, one atomic commit, one revision increment.

## 8. Drop semantics
`place_item` to `stored(here)` from `carried`/`equipped`: carrier cleared, placed here, owner unchanged, inventory excludes it, the next SSP lists it and the Controller's `items_here` carries it.

## 9. Handoff semantics
`transfer_item` unchanged (Pass C); regression test P11 confirms the carrier moves and the owner does not.

## 10. Ownership vs carrier
Independent facts. Picking up Brenna's sword leaves Brenna the owner and Nicco the carrier; the SSP renders "Nicco carries Sword; owner: Brenna" and no theft, loan or permission is inferred.

## 11. Existing item vs create_item
A duplicate `create_item` for a lying item is refused (already established); test P19 confirms exactly one sword remains and the controller policy says picking up an existing item is never create_item.

## 12. Evidence authorization
Place_item branch rewritten (`src/turn/evidence-authorization.ts`): the quote must name the item (or a sentence-local alias: sword/blade/knife/dagger), narrate a completed act by the right actor (pickup verbs: picks up, takes, grabs, lifts, retrieves, scoops, pockets, ...; put-down verbs: sets/puts down, lays, drops, leaves, ...), and contain no attempt, refusal, approach, glance, touch or intention (`PLACEMENT_NOT_COMPLETED`). Pronoun subject and object resolve to the nearest preceding named sentence; markdown-leading punctuation is handled by the existing Pass B fix. A quote that opens the act may be completed by the very next sentence only. A put-down narrated from the item's side counts only if the quote names the item. Ambiguity gives `ambiguous_item`.

## 13. Inventory projection
All views derive from `position`: `inventoryItems`, `getPlayerInventoryView`, `SessionView.player.inventory` (now `carriedItems`) and `equipment`, the SSP, the Controller `items` / `items_here`. Order is by item id.

## 14. SessionView / facade
`player.inventory` now lists exactly the carried items; ground, NPC-carried and owned-elsewhere items are excluded; ordering is deterministic.

## 15. SSP behavior
Distinguishes carried by the player, carried by an NPC, lying here and owned-elsewhere; no owner == carrier inference. Verified after commit (tests P7, P12, P18, P25).

## 16. Save / load
Pickup and drop round-trip identically (P8); no schema change.

## 17. Revision behavior
Success: exactly one increment (2 to 3). Rejected or no-op: none.

## 18. Diagnostics
Existing codes reused: `controller_invalid_command`, `insufficient_confirmation`, `already_established`; evidence checks added: `pickup_narrated`, `putdown_narrated`, `placement_not_completed`, `no_completed_placement_act`, `ambiguous_item`, `placed_item_not_named`.

## 19. Conflict handling
`mutation-diagnostics` already reports same-item conflicts (pickup+drop, pickup+handoff). Contradictory commands apply in order; the later wins and the conflict is observable. This limitation is unchanged.

## 20. Future Property compatibility
Containers and property storage add a position variant (`contained` / property location); pickup, drop and handoff stay position transitions. Nothing hard-codes "ground or player only".

## 21. Temporal recertification
`world_minute` is the only stored clock; calendar, season, observances, climate and weather remain derived and deterministic (tests T1-T23 green, no persisted environment fields).

## 22. Weather recertification
Deterministic per campaign / minute / location; no `Math.random`; bounded reconstruction; no `set_weather`; the narrator sees only the compact derived summary. The 7-day segment seam limitation remains.

## 23. SSP recertification
Derived only, deterministic, bounded and secrecy-safe, built from one snapshot, current truth beats history (scene-state-foundation and projection suites, goldens).

## 24. Controller isolation
No calendar or weather in the Controller context (T21). Item ids and positions remain technical. One policy sentence added (below); hash re-pinned.

## 25. Retrieval separation
Placement comes from CampaignState only; retrieval never decides where an item is.

## 26. Prompt-size impact
Narrator prompt: none. Controller policy: one sentence (about 35 tokens), hash `1f55b50c...` to `bcc16e7c...` re-pinned deliberately.

## 27. Offline tests
`tests/item-lifecycle.test.ts` (19 tests) covers P1-P28: pickup identity / carrier / owner / ground removal / inventory / SSP / save-load / drop / handoff / foreign ownership / already carried / look and touch / refusal / ambiguity / absent item / NPC pickup / no create_item / conflicts / revision / ordering / mismatch conservatism / placement beats history / no duplicate placement in the prompt / controller technical only / schema unchanged. F1-F12 are covered by the existing foundation suites plus the temporal tests (scene-state-foundation, scene-state-projection, turn-pipeline-golden, temporal-environmental), unchanged and green.

## 28. Live smoke
One campaign, three turns, production topology (glm-5.2 narrator, Luna controller), no images, 7 requests in the final run (3 earlier runs: 7 and 6 requests).
- Turn 1 "picks up the sword from the floor": committed, revision 2 to 3, `place_item` carried by Nicco, owner nicco, inventory includes it.
- Turn 2 "I check the edge of the sword I am holding": no proposal, no duplicate, no revision.
- Turn 3 "sets the sword down": inconclusive (section 29).

## 29. Live smoke diagnostics
Raw JSON: `/mnt/project-files/foundation-recert-item-pickup/` (`item-lifecycle-live.json` final; `...run1-before-window-fix.json`, `...run2-pickup-ok-drop-quote.json` history). Run 1 exposed the two-sentence receipt (fixed); run 2 exposed the surface vocabulary and the controller's weak quote choice. In the final run the narrator wrote a valid drop ("The blade meets the floorboards with a dull, quiet clap") but the Controller quoted an unrelated negated sentence ("a grip that isn't there anymore"), so authorization rejected it correctly and the sword stayed carried. No state corruption. The surface vocabulary now includes floorboards. Offline replay of the exact narration shows the verifier accepts it when the quote is the right sentence. A policy sentence asks the controller to quote the sentence that names the item.

## 30. Schema impact
None. No new fields, save format unchanged (P28).

## 31. Files created
`src/dev/item-lifecycle-inspector.ts`, `src/dev/item-lifecycle-live.ts`, `tests/item-lifecycle.test.ts`, this report.

## 32. Files modified
`src/turn/evidence-authorization.ts`, `src/app/session-view.ts`, `src/llm/openrouter/state-controller.ts`, `tests/controller-model-fallback.test.ts` (hash), `docs/architecture/ITEM_DOMAIN.md`.

## 33. Tests added / updated
19 added, 1 updated (policy hash). Total 3046.

## 34. Typecheck
`npm run typecheck`: clean.

## 35. Build
`npm run build`: clean.

## 36. Full test suite
3046/3046.

## 37. Known limitations
- The quote is chosen by the Controller; a weak quote (negated or unrelated sentence) rejects a real pickup or drop. State stays safe.
- No explicit-pickup player-intent binding: "I pick up the sword" creates no intent candidate, so a controller that omits the command commits nothing. Adding one would widen grammar authorization, so it was deliberately not done.
- Contradictory placement commands apply in order.
- The alias table is small (sword, blade, knife, dagger).
- Weather 7-day seam, indoor/outdoor weather: unchanged.

## 38. Remaining item-domain debt
Intent-bound pickup; alias table growth; containers and storage; equipment slots and encumbrance; stacks.

## 39. Foundation final verdict
Recertified: one snapshot per turn, atomic commit, derived SSP never persisted, controller isolation, retrieval non-authoritative, save/load equality, deterministic calendar and weather, all green.

## 40. Recommendation for Property / Heartstone
May start. Extend `ItemPosition` with a storage variant; keep placement transitions through `place_item`; derive property inventories from positions, never a second array. Consider the intent-bound pickup first if live omission recurs.
