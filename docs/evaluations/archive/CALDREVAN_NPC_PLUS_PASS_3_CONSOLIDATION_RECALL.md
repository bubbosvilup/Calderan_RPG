# Caldrevan NPC+ Pass 3 — long-term consolidation and state-proposal recall

**Date:** 2026-10-02. No commit or push.
**Inputs:** the [Pass 2](CALDREVAN_NPC_PLUS_PASS_2_DEVELOPMENT.md) and [Pass 1](CALDREVAN_NPC_PLUS_PASS_1_FOUNDATION.md) reports.
**Evidence:**

- `tests/npc-plus-pass-3.test.ts` (10 tests);
- the live run `h5-live/npcplus3.jsonl` (50 turns, with summary);
- a 4-turn draft-capture probe.

**Status: COMPLETE.**

| Run | Before | After |
|---|---|---|
| Tests (total / pass / fail / todo) | 1246 / 1242 / 0 / 4 | **1256 / 1252 / 0 / 4** |
| Replay | — | 25/25 |
| Golden | — | unchanged |
| `runTurn` | 168 lines | 168 lines |

## A. Consolidation model

**Folding.** When a development would leave the 16-entry recent window, `foldDevelopment` counts it into `dynamic.long_term` (`PremiumRollup`) in the **same revision** (inside `prepare`, exactly like Pass 2 writes). There is no prose, no model and no interpretation.

| Roll-up field | Content |
|---|---|
| `first_revision`, `last_revision`, `entries` | Span and number of consolidated entries |
| `lifecycle` | joined / left / rejoined / migrated counts |
| `relationships[]` (≤ 24 rows) | `actor_id`, `other_id`, `dimension`, `raises`, `lowers`, `first_revision`, `last_revision` |
| `conditions[]` (≤ 12 rows) | `condition`, `added`, `removed`, `last_revision` |
| `other_relationship_changes`, `other_condition_changes` | Changes from rows evicted when a table is full (least recently changed row first; deterministic) |
| `legal_changes`, `transactions{sale, gift, assignment, manumission}`, `moves`, `rules_added`, `contracts` | Counters |

**Invariants (tested):**

- **No double counting:** the roll-up equals a fold of exactly the entries that left the window, and `long_term.entries + recent.length = all entries`.
- **Replay-safe:** stale replays and second receipts fold nothing.
- **Order-independent:** the same batch in a different command order gives byte-identical state.
- **Bounded:** 30 distinct relationship rows keep 24 plus a count of 6, and the serialized size is bounded by the row caps.
- **Not current truth:** the roll-up never implies a current value. After 10 alternating trust steps, the relationship domain still says `none` while the roll-up counts raises and lowers.

**Strict validation:** revisions and references are checked, rows are unique, and a tampered roll-up does not load.

## B. Retention and recovery

**Recent entries.** These stay exact (Pass 2 handles: `npcmem:<id>:history:r<rev>.<n>`). When an entry is consolidated, its individual handle **expires** (tested).

**Roll-up recovery.** The roll-up is recoverable exactly at the source-based handle `npcmem:<id>:rollup:long_term`. The payload is `{"type":"consolidated_history", …}`, so it is never presented as the original events.

**Rendering:**

- **Tier B** gains at most one history token (`history: trust_hist>N:+3/-1`).
- **Tier C** gains at most one (`hist=trust_hist>N:+3/-1`, or `injured_hist:+2/-2`).
- **Choice of token:** a row matching the player's words, else the most active row involving Nicco, else none.
- **Caps unchanged:** 3 recent (B), 2 recent (C), 4k budget.

## C. Follow recall: root cause and repair

**Pass 2 symptom:** an NPC+ follow, with no `move_character` proposed.

**Repair** (authorization stage, not `runTurn`):

- Each completed `character_movements` evidence item for an **eligible mover** (the existing `movable` set: created characters and active authored NPC+) that the controller did not propose becomes a `move_character` **proposal**.
- Movers already at the destination are skipped.
- The unchanged authorizer still decides; derived proposals carry no quote and append after the controller's, keeping quote indices aligned.

**Tested:**

- "Come with me…" plus "Brenna follows him downstairs into the hall" moves Brenna (`authorized_narrative_confirmation`), with a clean audit and a `moved` development.
- Hesitation, refusal and a request with no follow narration produce no proposal and no move.
- A non-NPC+ authored Brenna with the same narration stays canon-placed.
- **One Pass 1 test changed deliberately:** completed narrated following is now proposed. The case was rewritten to "membership plus a glance at the stairs moves nobody".

**Live finding (10 runs plus a 4-run draft probe): the narrator never narrated the following.**

- All captured drafts leave Brenna upstairs ("Brenna did not follow. She was upstairs…").
- They follow the intent stage's existing left-behind note: whoever Nicco leaves stays unless they explicitly follow.
- With no completed-movement evidence, there is correctly nothing to derive: live derived proposals were 0/10.
- **Recall improves exactly where valid evidence exists:** deterministically proven. It is unexercised live, because the narrator chose not to produce following.

## D. Relationship recall investigation

**Pass 2: 0/6.** I traced the four candidate failure points with the six verbatim live Maren replies ("It wasn't much," "A small, uncertain smile…", "She needed someone here"…).

| Candidate | Finding |
|---|---|
| **A. Narrator did not establish evidence** | **Root cause.** No reply is the feeling character's own evidenced act. The verifier rejects all six for affection and trust (pinned by test); a positive control still verifies. |
| B. Evidence extraction missed it | No: there was nothing to extract |
| C. Controller failed to propose | Consistent with A: proposing would have been rejected |
| D. Authorization rejected | No proposal reached it |

**Decision:** no code change. Making polite or grateful prose mutate relationships would violate the conservative policy. Pass 3 live, HH_C: again 0 proposals in 10 runs.

## E. Real-canon recovery

**Finding.** Authored canon has **no public NPC chunks**: all 9 self-chunks are private (Korvin, Bartolomhew, Blackthorn, Brother Aven, Captain Doran Hale, Dren, Mistress Elara, Sister Mereth). An authored character's public canon is their **entity content**.

**Change.** That content is now a public deep source (`npcmem:<id>:canon:entity`, exact payload = `entity.content`). It is recovered only when the NPC+ is **absent**, since a present character's content is already in the scene baseline.

**Tested on real data (Korvin as Heartstone NPC+):**

- A relevant question while he is away recovers his public canon exactly (1 recovery).
- An unrelated question recovers nothing.
- With Korvin present, nothing is re-recovered.
- His private chunk is `holder_private`, never on an NPC+ line, and never player knowledge.

**Live (CH_*, 30 turns):**

| Scenario | Result |
|---|---|
| Public question | Recovery hits 10/10 |
| Unrelated question | 0/10 (no unnecessary recovery) |
| Private question | Korvin deflects in his own voice ("That's a hell of a thing to ask…"); no narration-voice leak of his private canon in any captured excerpt |

## F. Headroom

**Tested:** H3 mixed (30 present, 64 facts, 32 events, 64 knowledge edges) plus 30 NPC+, each with **16 full recent entries and a non-empty roll-up** (20 condition and trust rounds). The scene stays **under 32k**, with every present person kept, the addressed member pinned at Tier B and NPC+ ≤ 4k.

**Unchanged:** the 4k cap, the 3 / 2 recent caps and the priority order (authority > B > C > roll-up/deep).

**Live:** context average 6,806 characters, maximum 15,579 (the market scene).

## G. Live results

5 scenarios × 10 runs = 50 turns. Cost **$0.185**.

| Scenario | Success | Reconciled / redacted | Proposals → commits | Recovery | Notes |
|---|---|---|---|---|---|
| HH_D NPC+ follow | 10/10 | 10 / 0 | move 0 → 0 | — | Nicco moved 10/10. Brenna never narrated following (left-behind note). `absent_participant` 18 and `player_agency` 6. |
| HH_C relationship | 10/10 | 2 / 0 | relationship 0 → 0 | — | Root cause A (section D) |
| CH_public | 10/10 | 10 / **10** | none | **10/10** | Answers name the absent Korvin → `absent_participant` → redacted (see below) |
| CH_private | 10/10 | 2 / 0 | none | 0 (present) | No private leak |
| CH_unrelated | 10/10 | 0 / 0 | none | 0/10 | Clean |

**Totals:**

- 50/50 success;
- **0 wrong or unexpected commits**, **0 secret leaks**;
- reconciliation 48% and redaction 20%, overall.

**Measured debt behind those rates.** The existing `absent_participant` rule flags **any mention** of an absent authored NPC, not only one acting in the scene:

- "Brenna did not follow. She was upstairs" is flagged.
- So is any answer to "What do I know about Korvin's trade?" when Korvin is away.

It produced 28 of the 38 issues. It does not come from NPC+: H3 retrieval returns the same Korvin canon for that question. It does decide the redaction outcome of lore questions about absent people.

## H. Tests

**New tests (`tests/npc-plus-pass-3.test.ts`):**

- the 17th entry consolidates; counters equal an exact fold;
- no loss and no double counting; current authority unaffected;
- stale replay and second receipt; order independence;
- caps and eviction counting; bounded size;
- save/load round trip; exact typed roll-up recovery; expired consolidated handle; tampered roll-up rejected;
- Tier B and C history tokens, with caps unchanged;
- follow recall positive;
- request, hesitation, refusal and non-NPC+ negatives;
- relationship root cause pinned with the live sentences plus a positive control;
- real-canon public, unrelated and private;
- H3 mixed + 30 NPC+ with full histories and roll-ups.

**Other suites:** NPC+ Pass 1 and 2, H3, H4, H5 and H5.1 are green (Pass 1: one deliberate update). Typecheck passes, and `npm test` gives 1256 / 1252 / 0 / 4.

## I. Remaining debt

1. **`absent_participant` mention-versus-presence.** It flags absent authored NPCs who are only talked about. This is the main driver of live reconciliation and redaction in household and lore scenes (28 of 38 issues here).
2. **Live follow never occurs.** The left-behind note and the narrator's caution mean NPC+ following is not narrated, so the recall repair is not exercised live. Whether household members should be *offered* the choice to follow is a design question.
3. **Relationship changes stay rare by design.** The narrator seldom writes evidenced relationship acts.
4. **The recovered public canon can duplicate an H3 retrieval payload** of the same entity.
5. **Carry-overs:**
   - authored destination-less departure;
   - the 32k ceiling at about 98% for full-household scenes;
   - contract recall low (Pass 2);
   - H6 reconciliation and redaction;
   - four H1 TODOs.

## J. Recommendation for Pass 4

**Pass 4 should be a bounded audit-precision repair, not new NPC+ features.**

1. **Narrow `absent_participant`** to absent characters **acting, speaking or being present** in the scene, not merely referenced, recalled or discussed. Keep the current behaviour for staff and authored companions. Re-measure the reconciliation and redaction of these live scenarios (expected to fall sharply).
2. **De-duplicate NPC+ recovered canon** against the same turn's H3 retrieval payload.
3. **Optionally,** a design decision on whether the left-behind note should leave an NPC+ room to *choose* to follow (consent stays narrated; state stays authoritative).
4. **Then return to NPC+ depth** (reflection or autonomy), on top of the consolidated history.

CALDREVAN NPC+ PASS 3 COMPLETE
