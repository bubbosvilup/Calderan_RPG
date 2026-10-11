# Historical Campaign Replay: Certification Report

Status: evaluation report (historical once written). No commit, no push. Oracle: [HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md](HISTORICAL_CAMPAIGN_EXPECTED_FINAL_STATUS.md) (frozen, oracle-v1, never edited). Checkpoints: `historical_replay/iteration_NN/`, best state `historical_replay/best_final_state.json`, `best_expected_vs_actual.md`.

## 1. Verdict
**PARTIAL: engine integrity certified, historical end-state NOT reproduced.** In the best run (iteration 04) 18 of 25 MUST_MATCH checks pass. No corruption, no duplicate identities, no ledger inconsistency, save/load round trip clean. The seven remaining mismatches all hang on one chain: the person purchase never commits because the live narrator does not resolve the sale the way the engine requires, so Brenna/Maren never become household members or NPC+ and no gold is spent. This is not a proven engine fault: engine and narrator agree that nothing was bought, and the oracle's prices (5 and 3 gold) are not reachable under the current economy (quotes of 200 to 400 gold per person).

## 2. Iterations
| Iter | Mode | Turns | MUST_MATCH | Notes |
|---|---|---|---|---|
| 00 | pilot | 4 | n/a | harness smoke |
| 01 | strict | 85 (aborted) | n/a | cascade from the travel contract (see 4) |
| 02 | assisted | 99 (aborted) | n/a | purchase never committed; stopped to fix the price parser |
| 03 | assisted | 421 | 12/25 | 0 failed turns, 3056 s |
| 04 | assisted | 421 | 18/25 | 1 transient controller failure (turn 172), 3082 s |
Assisted = logged `overridePlayerLocation` corrections (`location_assists.json`), the official manual path. Probes (single-purpose short runs) are in `historical_replay/probes/`. Starting mismatch count: 13 of 25 MUST_MATCH (iteration 03 baseline); final: 7. Full replays: 4 full or partial plus 2 complete 421-turn runs.

## 3. Bugs found and fixed (all generic, no oracle injection, no turn conditioning)
1. **P0 price parsing**: "four hundred gold" was read as 100 (trailing word). New shared number-phrase grammar (`src/turn/language/numbers.ts`) used by `person-transactions.ts`. Tests: number table, seller multi-word price paid in full, over-purse payment blocks.
2. **Narrator ignored a paid quote** (turn 7 of the history): prompt rule added that a quoted price the player pays must be resolved by the seller in the same reply. Effect in iteration 04: the narrator no longer lets the buyer leave unresolved with the same seller silently (it redirected to another seller).
3. **Household rule restatement**: the player's wording of charter rule 3 created a fourth active rule. `add_household_rule` now rejects restatements of an active topic (indoor footwear, family honesty, family protection). Test added; one older test used restatements as samples and was changed.
4. **Nicco Avatar UI**: the main-play round portrait of the player ignored the selected Player Avatar (the player entry carries no card). It now uses the central resolver. Test added in tests/ui-v1.test.ts; one source assertion in canon-avatars updated.

## 4. Findings not fixed
- **Travel contract (strict replay)**: partial or implicit destinations ("to the tower") do not move the player by design (tested negative), so a verbatim history cascades. Handled by logged assists only.
- **Seller continuity**: a canonical partner who stops being named falls out of the foreground; the narrator may then invent a different seller. The engine cannot authorize a sale it did not see offered.
- **Player-asserted handovers**: the player's own text ("puts her on his back") is treated as having happened (agency rule), so a captive can leave with the player without a committed sale.
- **Silver amounts**: funds are integer gold; silver quotes are not converted (no policy yet).
- **Economy vs oracle**: current economy quotes hundreds of gold per person; oracle expected 5 and 3 gold. Money and funds checks therefore cannot pass here and are attributed to current canon, not edited in the oracle.
- **Premises not canon** (ring, golem, medical supplies): the narrator improvises them; Gerome therefore exists only as a narrator-established character.

## 5. Identity masking and "Dorric"-style duplication
Probe iteration 94 (`probes/iteration_94`) reproduced the symptom: asking the unfamiliar seller his name led to a descriptor-voiced temporary participant that received a personal name ("Marten", created) instead of resolving to the canonical Korvin id. Consequence in that probe: one extra created character with a made-up personal name; no alias, knowledge record or scene-actor corruption was observed in the state summary, and retrieval contamination was not measured. In both full runs (03, 04) F-01, F-02 and F-07 pass: no created duplicate of Korvin, Dren, Elara or any canonical name. The root fix (name-request-scoped exclusive match or forbidding temporary participants from taking personal names) is not implemented because existing tests deliberately forbid weak casting; it is the first item for next work. No Korvin hardcoding was added, and spoiler safety is unchanged.

## 6. Household, NPC+, items, money, health, knowledge, relationship, Heartstone, save/load
- Household: exactly three charter rules in iteration 04 (after fix 3). Members: Nicco only (Brenna/Maren not promoted because no purchase). Gerome exists once, not a member.
- NPC+: none promoted (blocked by the purchase chain).
- Items: Deed and Charter kept by Nicco, no duplicates (G-13 pass); halberd, scalpel and prop daggers not created (narrator-dependent, SHOULD only).
- Money: funds 500, no payments, ledger consistent (H-01 pass). Maren's 40 gold not modelled (SHOULD, untracked).
- Heartstone: Nicco ends inside; the rite never completed (Brenna left the campaign flow in iteration 03; in 04 no candidate was promoted).
- Health, knowledge, relationships: no corruption; only a few adjust_relationship rejections.
- Save/load: round trip true in iterations 03 and 04.

## 7. Tests and quality gates
Typecheck, build and full suite: **3158 tests, 0 failed** (baseline 3153, plus the replay regressions and the UI test). Golden pipeline trace regenerated deliberately (only the narrator system prompt changed, +244 characters). Provider requests: at least one narrator and one controller call per submitted turn (about 421 each per run).

## 8. Certification matrix
| Domain | Result |
|---|---|
| Identity, duplicates | PASS in full runs; masking name bug reproduced in a probe, open |
| Funds ledger | PASS |
| Items | PASS (no duplicates, Deed kept) |
| Household rules | PASS after fix |
| Person purchase | OPEN |
| Household membership, NPC+ | BLOCKED by purchase |
| Gerome, Maren creation | PASS (iteration 04) |
| Avatar UI | PASS |
| Save/load | PASS |

## 9. Remaining mismatches (iteration 04)
A-02 funds, B-02 Brenna sale, B-04 Brenna member/NPC+, C-02 Maren sale, C-04 Maren member/NPC+, E-02 members, E-05 NPC+; SHOULD: halberd, scalpel, daggers. Oracle internal note: the oracle states 32 MUST_MATCH but 25 were implemented in the comparator.

## 10. Next work
1. Seller continuity for a canonical partner voiced via a descriptor; 2. silver handling policy; 3. name-request-scoped exclusive casting to remove the invented personal name; 4. optionally a purchase-completion hint when the player pays a quoted price and the seller's reply is a refusal to hand over.

No commit. No push.
