# Pre-Property Debt Zero Pass

Date: 2026-10-10. Base: main 7820d5a plus the uncommitted canon gap closure, temporal/environmental V1 and foundation re-certification/item pickup fix. This pass is uncommitted and unpushed.

## 1. Executive verdict

**PRE_PROPERTY_DEBT_CLEARED_WITH_INTENTIONAL_LIMITATIONS.**

Every limitation the earlier reports recorded for the item, evidence and weather foundations was re-checked against the current tree. Each is fixed or explicitly classified as intentional (sections 5, 41-43). 3076/3076 tests pass (30 new; a handful of existing tests realigned to the new, stricter behavior, section 37), `npm run typecheck` and `npm run build` are clean, and the save schema is unchanged. The eight "not acceptable to leave" items of the brief are all closed (section 41).

## 2. Scope and hard limits kept

No commit, no push. No Property, containers, tower inventory, aggregate resources, equipment overhaul, encumbrance, combat or medicine. No lore change, no Calendar redesign, no image calls, no LLM classification where deterministic logic suffices, no second inventory truth, no weaker atomicity or evidence authorization. Historical reports are untouched. The live smoke ran only after the full offline suite was green.

## 3. Starting state

3046/3046 tests, typecheck and build clean. Known: the Controller chooses the evidence quote and a weak quote lost a real pickup/drop; "I pick up the sword" created no intent; contradictory authorized commands applied in order; the alias table held four words; the weather had a fresh draw every seven days; weather was always "outside"; some places had no climate.

## 4. Audit method

Every prior report's limitation section (Pass B section 18, Pass C section 23, SSP certification section 27, Canon migration open-lore list, Temporal V1 section 40, Foundation re-certification section 37) was read and each line reproduced or disproved against the current tree, by test or by direct inspection. Reports were not edited.

## 5. Limitation audit table

| Source | Limitation | Still reproducible before this pass | Fixable now | Action | Result |
|---|---|---|---|---|---|
| Pass B 18.1 | Proposal-first: Controller omits a command the grammar confirms, nothing commits | Yes (pickup/drop) | Yes | Intent binding + bounded recovery | FIXED for place_item; other kinds INTENTIONAL (they have no explicit-intent grammar) |
| Pass B 18.2 | Receipt vocabulary closed | Yes | Partly | Recovery scans the whole draft with the same verifier; vocabulary not widened | FIXED in effect for placements; vocabulary itself INTENTIONAL |
| Pass B 18.3 | Pronoun-only quote with Nicco antecedent refused | Yes | No (safety) | Unchanged; recovery reads pronoun continuation inside the draft | INTENTIONAL |
| Pass B 18.4 | Condition tag choice not validated beyond term check | Yes | Out of scope | none | UNRELATED to item/weather |
| Pass B 18.5 | Conflicting distinct commands fail preparation and lose the turn's mutations | Yes | Yes | Conflict rejection before commit, per item | FIXED |
| Pass B 18.6 | Transfers not bound to player intent | No (Pass C bound them) | n/a | Regression test kept | CLOSED earlier |
| Pass C 23 | Same-name distinct items | Yes | Yes | Authoritative qualifiers, else `ambiguous_item` | FIXED |
| Pass C 23 | Conflicting authorized commands apply in order | Yes | Yes | Rejected before commit | FIXED |
| Pass C 23 | create_item owner can follow the player's wording | Yes | Yes | Owner kept only when evidenced | FIXED |
| SSP 27.1-27.10 | SSP content/duplication notes | Unchanged | No | Not item/weather debt | HISTORICAL REPORT / UNRELATED |
| Temporal 40 | 7-day weather seam | Yes | Yes | Sliding window | FIXED |
| Temporal 40 | No indoor semantics | Yes | Yes | `environment_exposure` | FIXED |
| Temporal 40 | Mountains/seas/coasts have no weather | Yes | Yes | Climate audit and four authored profiles | FIXED (Mist Sea and continent INTENTIONAL) |
| Temporal 40 | South parent has no weather | Yes | No (lore undecided) | Explicit derived status | INTENTIONAL, now explicit |
| Foundation 37 | Weak Controller quote rejects a real pickup/drop | Yes | Yes | Bounded recovery | FIXED |
| Foundation 37 | No pickup intent binding | Yes | Yes | Deterministic grammar | FIXED |
| Foundation 37 | Contradictory placement later wins | Yes | Yes | Rejected before commit | FIXED |
| Foundation 37 | Alias table small | Yes | Yes | Generic resolver | FIXED |
| Foundation 38 | Containers, equipment slots, stacks | n/a | Out of scope | none | INTENTIONAL (Property era) |

## 6. Item debt A-D

A weak Controller quote: fixed by bounded recovery (section 9). B no pickup intent binding: fixed (sections 7-8). C later wins: fixed (section 14). D small alias vocabulary: fixed (section 12).

## 7. Pickup/drop intent binding

`src/turn/item-intent.ts`. The player's own words are parsed by a closed grammar into `bound | ambiguous | absent | attempt`. The intent never mutates state and never proves success. A Controller that proposed no matching placement gets the bound command proposed as a derived command (appended after the Controller's, so quote indexes stay aligned); authorization decides it exactly as before, on a verified receipt.

## 8. Grammar

Documented in `docs/architecture/ITEM_DOMAIN.md`. Pickup: pick up / pick it up / take / grab / lift / retrieve / snatch / pocket / scoop / collect / gather. Drop: put/set/lay/place down, drop, discard, toss, leave here, place on the floor. Not completed intent: try, attempt, reach for, look at, touch, think about, want, would/could/might/maybe, can I, refuse, about to, questions. "take X from <person>" is a transfer and is ignored. More than one item action in one input binds nothing. Drop is included.

## 9. Bounded evidence recovery

`recoverPlacementReceipt` runs only for `place_item` location placements rejected for missing confirmation in hybrid mode. It scans the CURRENT narrator draft only, with the very same receipt verifier, and requires exactly one completed act (adjacent supporting sentences count as the same act; two separated acts are `recovery_ambiguous_evidence`). The command itself never changes; only the quote is supplied.

## 10. Whole-draft contradiction gate

Recovery stops on a failed attempt, refusal, prevention, "instead", another actor taking/leaving the item, an undo in the same sentence ("picks up the sword and then drops it"), a later reversal, the item falling away, and the item being lost ("crumbles to dust"). The first live run exposed none of these; the last two were found by the adversarial corpus and closed in this pass.

## 11. Diagnostics

`MutationDiagnostic` outcomes carry `evidence.source` (`controller_quote` | `recovered_narrator_receipt`), `original_quote`, `original_check` and `signals`. New distinct codes: `conflicting_item_mutations`, `duplicate_command_deduped`, `ambiguous_item`, `item_not_present` (reserved), `controller_item_mismatch`, `ownership_not_evidenced`. Recovery refusals appear as the check names `recovery_no_receipt`, `recovery_contradictory_outcome`, `recovery_another_actor`, `recovery_ambiguous_evidence`.

## 12. Generic alias system

`src/turn/item-resolution.ts`, order: exact normalized name, significant name tokens (singularized), authored category word, small validated category registry (`item-reference.ts`: footwear, clothing, weapon/blade, jewelry). "plain iron sword" resolves to iron sword / sword / blade / weapon; "wooden cup" to cup; "satchel" does NOT become "bag" because no category data supports it. The old NOUN_ALIASES table is gone; evidence and intent share one resolver.

## 13. Same-name resolution

Qualifiers only: a distinguishing name word ("rusty cup"), owner possessives ("Brenna's cup", "my cup"), held. Otherwise `ambiguous_item`, no mutation. An exact full-name match breaks a tie.

## 14. Conflict rejection before commit

After authorization and before assembly, authorized `place_item`/`transfer_item` commands on one item must agree on the end position (and transfer mode). Disagreement rejects EVERY command on that item with `conflicting_item_mutations`; no revision is made. Documented choice: only the conflicting item's commands are rejected; unrelated authorized commands in the same batch still commit (each was validated against the same pre-turn state, and `CampaignState.prepare` still gates the whole batch atomically).

## 15. Exact duplicates

Identical effects collapse: the later command becomes `duplicate_command_deduped` and is not applied twice. A harmless duplicate never rejects the turn.

## 16. create_item multiplicity

`establishedCount` (two/three/four/five, a pair/couple of, twin, both; capped at five; default 1). "Two identical iron cups" creates two; a repeated single object creates one.

## 17. create_item ownership

Independent of existence and placement. `owner_id` is kept only when a sentence naming the item also names the owner (possessive, belongs to, owned by, property of, gift for/to, sold to, "X's now", a lender's own "his/her ...") or the player claims "my/mine". Mention, discovery, carrying or standing beside the object never sets an owner. When not evidenced the item is still created, with no owner, and the signal `ownership_not_evidenced` is recorded. Ownership never determines inventory.

## 18. `owner_id: null`

Rule `R2_NULL_OPTIONAL_OWNER` in `normalizeControllerOutput`: a literal null on a create_item's optional owner (flat or nested) is dropped. A null elsewhere, or a non-null non-string, still fails strictly. Unrelated commands in the same output are not poisoned.

## 19. Intent / receipt / proposal triangle

Intent A + narration A + Controller A: accepted. Intent A, narration picks A, Controller B: `controller_item_mismatch`, nothing moves. Intent A, narration fails to lift A, Controller A: rejected. Ambiguous intent: any Controller placement is `ambiguous_item`. An intent that matches nothing here (`absent`) enforces nothing: the engine's existing reference checks decide.

## 20. Autonomous NPC actions

Without a player item intent nothing changes; an NPC pickup still needs the Controller's command and a verified receipt (tested).

## 21. Transfer regression

Pass C transfer-intent binding is untouched. Two realigned tests: a hand-off chain (Brenna then Maren) and handoff plus lend of one item are now rejected up front instead of failing preparation.

## 22. Inventory equality

Domain `inventoryItems/carriedItems` = SessionView = UI = SSP, unchanged and re-tested after recovery.

## 23. Read-model audit

`SessionView`, the UI client and the SSP read `CampaignItem.position` through `src/campaign/inventory.ts` or per-turn context. Other `position.kind` reads (narration audit, natural actions, mannerism extraction) are per-turn queries over the same single field, not a second inventory. `SessionView.player.inventory` was already fixed to `carriedItems` in the previous pass. New read-model field: `scene.environment.exposure` and a weather `note`.

## 24. Controller policy audit

One sentence changed, no workaround wording was obsolete: owner only when the narration says whose it is (mention/finding/carrying never makes it anyone's) and one create_item per stated identical object. Hash re-pinned: `b7163221...c9a0e` (was `bcc16e7c...`), schema hash unchanged.

## 25. Save/load

Nothing derived is persisted (intent, evidence source, exposure, weather, signals). Save/load equivalence after a recovered pickup is tested; a new test also asserts no such text appears in the snapshot.

## 26. Property compatibility

`stored(location_id)` means "physically at that place" (floor, table, shelf), never "floor". A container or property position is a new variant beside it. Documented.

## 27. Performance bounds

Intent resolution over 400 items x 20 calls and 2000 weather lookups finish well inside a 4 s test ceiling. Weather costs exactly 28 small draws per lookup (unchanged). Recovery scans at most 60 sentences.

## 28. Weather seam

`weatherAt` now reconstructs a sliding window: block N starts a chain `WEATHER_LOOKBACK_BLOCKS` (27) earlier. Pure function of (seed, profile, N), any call order, nothing persisted, O(28). Measured persistence across the old boundary 0.217 vs 0.207 inside a week: the seam is gone. **Behavior note:** because the derivation changed, the weather at a given minute differs from before for campaigns in progress. Weather is derived, never saved, so nothing breaks, but a player may see a different past/future sequence after updating.

## 29. Indoor/outdoor exposure

No existing field existed. Added `environment_exposure: indoor | outdoor | sheltered | unknown` (optional, validated, authored per place, NEVER inherited; climate is). Authored: Heartstone LR, U1, F1 `indoor`; courtyard and outside square `outdoor`. Everything else is `unknown`.

## 30. Rendering

Outdoor renders `Weather: ...`; indoor, sheltered and unknown render `Outside weather: ...`. Nothing says rain falls inside. The Controller envelope stays byte-identical.

## 31. Climate-less location audit

99 locations audited. Before: climate-less were the continent, Dragon's Teeth Mountains, Chained Bay, Mist Sea, Silent Ocean, Sorrow Sea. Now authored with the NEAREST EXISTING profile (no new profile, no lore): mountains east_cold_continental, Chained Bay (West's maritime region) and Sorrow Sea (west) west_cool_maritime, Silent Ocean (east) east_cold_continental. The continent (mixed, no single zone) and the Mist Sea (north, no authored side) stay climate-less on purpose. A test pins exactly those two.

## 32. South parent

`needs_climate_zone` is surfaced in SessionView as weather `note: "Climate zone unresolved"`; the narrator receives no weather line and no technical text. INTENTIONAL (the South's halves are undecided lore).

## 33. Calendar regression

No Calendar code changed; calendar tests and the weather tests that depend on it pass.

## 34. Item test matrix

New file `tests/debt-zero.test.ts` (I1-I21 in the file) plus realigned tests. Mapping: grammar positives I1, non-completed I2, drop I3, omission recovery I4, wrong quote I5, good quote source I6, contradiction corpus I7, ambiguous receipts I8, triangle I9, autonomous NPC I10, drop recovery I11, aliases I12, same-name I13, conflicts I14-I15, multiplicity I16, ownership I17, null owner I18, save/load I19, inventory equality and `stored` semantics I20, performance I21. Brief items 21-24 (autonomous NPC, transfer regression, inventory equality, save/load) are I10, the realigned Pass B/C tests, I20, I19.

## 35. Weather test matrix

W1-W3 purity and call-order independence, W4 seam, W5 early-campaign window, W6-W8 exposure authoring/non-inheritance/labels, W9 SessionView and prompt consistency, W10 South status, W11 climate coverage, W12 save untouched, W13 calendar regression.

## 36. Adversarial evidence corpus

Covered across `item-lifecycle` and `debt-zero`: success, attempt, refusal, negation, look/touch, pronoun continuation, markdown, two sentences, wrong actor, wrong item, ambiguity, contradiction (reversal, falling, destruction), conflicting commands, duplicate commands, create_item ownership and multiplicity. Passive/receipt-only drops ("The blade meets the floor...") verify through the existing item-side landing rule.

## 37. Existing tests changed (and why)

Six items from Pass B/C/permanent-inventory were realigned because the behavior is now deliberately stricter or more helpful: chained hand-off and handoff+lend are rejected before commit (2); two recipients "later wins" is now a rejection (1); an unrelated or missing Controller quote no longer loses a placement the draft proves (permanent-inventory); a refused create_item no longer swallows an explicit pickup (item-lifecycle P19, existing-subsystem D8); a created item with an unevidenced owner is ownerless (item-domain A/B). Plus data/golden/scene-label adjustments: geography field list, climate list, compaction token estimate (2912 to 2910), the regenerated pipeline golden (dataset hash, with earlier temporal changes) and temporal scene labels.

## 38. Files changed in this pass

New: `src/turn/item-intent.ts`, `item-resolution.ts`, `item-ownership.ts`, `tests/debt-zero.test.ts`, this report. Modified: `evidence-authorization.ts`, `stages/authorization.ts`, `turn-types.ts`, `mutation-diagnostics.ts`, `controller-schema.ts`, `state-controller.ts` (policy), `weather.ts`, `environment.ts`, `scene-state-projection.ts`, `scene-state-render.ts`, `session-view.ts`, `entities.ts`, `validation.ts`, nine location YAMLs (exposure on five, climate on four), `item-lifecycle-live.ts`, `ITEM_DOMAIN.md`, `AUTHORED_DATA_ARCHITECTURE.md`, and seven test files.

## 39. Validation

`npm run typecheck` clean. `npm run build` clean. `npm test`: 3076/3076, 0 failed. Focused suites run during development: item-lifecycle, permanent-inventory, transfer-domain, controller-authorization-hardening, existing-subsystem-hardening, item-domain, controller-reliability, controller-model-fallback, temporal-environmental, geography, golden pipeline.

## 40. Live smoke

Placeholder key; the sandbox proxy injected auth; no images; one campaign (synthetic public fixture); production Narrator `z-ai/glm-5.2`, Controller `openai/gpt-6-luna` with the Haiku fallback; no semantic retry. Run after the offline suite was green. Artifact: `/mnt/project-files/pre-property-debt-zero/live-smoke.json`.

* **Run 1 (5 requests).** Turn 1 "I pick up the sword.": committed, sword carried by Nicco, revision 2->3. Turn 2 "I put the sword down on the floor.": REJECTED `ambiguous_evidence`; the Controller proposed the right drop but quoted "Nicco's hand opens, empty now, ..." (hedge gate) and the draft had no sentence naming the sword's landing, so recovery correctly found no receipt; the narration was then rewritten by the reconciliation call. The harness did not yet record the draft, so the exact draft is not available; this is an honest inconclusive-but-safe result, not a pass.
* **Run 2 (5 requests, after adding draft capture).** Turn 1 committed (quote "he lifts it from its place", `pickup_narrated`). Turn 2 committed: drop to the current location, revision 3->4, owner unchanged (Nicco), out of the inventory; the quote was "The blade meets the floor...", `putdown_narrated`.
* Total 10 provider requests over two runs (about 4 per run was estimated; the extra request is the narration reconciliation call). Both turns of run 2 were committed by the Controller's own correct quote; the recovery path was exercised offline, not observed live.

## 41. Global old-limitation sweep (brief section 31: not acceptable to leave)

| Item | Status |
|---|---|
| Explicit pickup lost solely because the Controller omitted the command | FIXED (I4) |
| Valid action lost solely because the Controller quoted the wrong sentence | FIXED (I5, I11) |
| Silently applied contradictory same-item mutations | FIXED (I14, I15) |
| Ownership determining inventory | Never true; re-verified (I20) |
| Ownership inferred from carrying | FIXED (I17) |
| `owner_id:null` poisoning | FIXED (I18) |
| Arbitrary same-name resolution | FIXED (I13, I9) |
| Artificial weather seam | FIXED (W4) |

## 42. Old limitations now closed

Foundation re-certification section 37 (all five bullets except containers/slots), Pass C section 23 (three of four items), Pass B 18.1/18.5, Temporal V1 section 40 (first three bullets; the fourth is explicit).

## 43. Intentional limitations that remain

1. One item ends a turn in one position: a hand-off chain through two holders in a single turn is rejected whole for that item.
2. Recovery covers `place_item` location placements only (not transfers, create_item, conditions).
3. The intent grammar is a closed English grammar; other phrasing falls back to the Controller plus a verified quote.
4. A Narrator draft that never names the item's placement still produces no mutation, and "intent never proves success" is kept (this is the live run 1 drop).
5. Possessive pronouns alone ("her dagger") are not ownership evidence.
6. Mist Sea and the continent have no climate; the South parent stays unresolved.
7. Exposure is authored on five places; every other place is `unknown` and reads "Outside weather".
8. Adjacent displayed weather blocks come from overlapping, not identical, 28-block chains (smooth, not strictly one chain).
9. Receipt vocabulary and the Narrator's variance remain the ceiling of what is committed.
10. Containers, equipment slots, encumbrance, stacks: Property-era work.

## 44. New risks introduced

Weather sequence change for in-progress campaigns (derived, not saved). Stricter conflicts mean a rare legitimate chain in one turn needs two turns. Data edits change the dataset hash, so existing saves load under the strict/compatible canon rules as with any data edit.

## 45. Not done on purpose

Property/Heartstone, containers, tower inventory, aggregates, equipment overhaul, encumbrance, combat, medicine, UI, image calls, new climate profiles, lore changes.

## 46. Save schema

Unchanged. `environment_exposure` is world data (YAML), not campaign state.

## 47. Recommendations

Weather UI next on the new read model; before Property, one fresh live re-certification turn that lets the recovery path fire naturally (needs a Controller that quotes weakly, which cannot be forced deterministically).

## 48. Property readiness verdict

**READY, with the intentional limitations in section 43.** The item foundation has one position truth, deterministic intent binding, bounded recovery, atomic per-item conflicts, evidenced ownership and a generic resolver; the environment foundation has no artificial seam and an exposure concept Property rooms can use. No Property work started.
