# Caldrevan NPC+ Pass 4 — audit precision and retrieval de-duplication

**Date:** 2026-10-02. No commit or push.
**Input:** the [NPC+ Pass 3](CALDREVAN_NPC_PLUS_PASS_3_CONSOLIDATION_RECALL.md) report.
**Evidence:**

- `tests/npc-plus-pass-4.test.ts` (4 tests; 37-sentence participation matrix);
- the live run `h5-live/npcplus4.jsonl` (36 turns, with summary);
- a 5-run draft probe.

**Status: COMPLETE.**

| Run | Before | After |
|---|---|---|
| Tests (total / pass / fail / todo) | 1256 / 1252 / 0 / 4 | **1260 / 1256 / 0 / 4** |
| Replay | — | 25/25 |
| Golden | — | unchanged |
| **`runTurn`** | 168 lines | **164 lines** |

`runTurn` shrank because the retrieval-diagnostics block moved into the observer.

## A. Root cause

**Two `absent_participant` rules matched names, not participation:**

- **Authored NPCs:** any sentence containing the name of an authored NPC who is not in the scene was flagged.
- **Created characters:** flagged on any mention unless a crude absence word ("had", "left", "earlier"…) was present.

**What that caught:** references *about* an absent person ("Brenna did not follow. She stayed upstairs."; "Korvin is a slaver who works at the market") were treated as the person *participating*. In Pass 3 that produced 28 of 38 live audit issues, including all 10 redacted answers to lore questions about the absent Korvin.

## B. Audit rule before and after

**New detector.** Both rules now ask one deterministic question, `participatesInScene(sentence, names)` (`src/turn/scene-participation.ts`). With quotes blanked except for attribution, a sentence counts as participation when the absent character is one of these:

1. **The subject of an act:** a verb after the name, optionally separated by an appositive or adverbs ("Korvin hands Nicco the key", "Nearby, Dell Harrow sat hunched…").
2. **The subject of a presence predicate** ("is here", "is standing at the door", "stands beside Nicco").
3. **The attributed speaker of a quote** ('"Pay me," Korvin says.' / '"…," says Korvin.').
4. **The object of a current interaction** ("Nicco hands Brenna the boots", "asks Korvin").

**Not participation:**

- **Stative or habitual predicates:** is/was without presence, has/had, stays/stayed/remain(s/ed), works, lives, sells, trades, deals, owns, knows, left, did, modals, never/usually/often…
- **Possessives.**
- **A name that is a preposition's object** ("knows of Korvin…", added after the live probe).
- **Two new shared gates** (built from shared cue groups, matrix-locked, no local negation regex):
  - `absent_reference` on the clause up to the act: negation, contractions, hypotheticals ("if… were"), imagining, and a new `RECOLLECTION` group (remember\*, recall\*, according to, used to, thinks/thought of);
  - `past_displacement` on the words right after the act: yesterday, earlier, ago, last night.

**Preserved:**

- The created-character `ABSENCE` allowance (remembering an exit);
- the staff and authored-companion presence rules;
- the H5.1 movement audit and NPC+ movement;
- player agency;
- scene authority.

## C. Positive and negative matrix (tested)

| Allowed (reference) | Flagged (participation) |
|---|---|
| "Brenna did not follow. She stayed upstairs." | "Brenna walks into the hall." |
| "Korvin is a slaver who works at the market." / "Korvin usually works at the slave market." | "Korvin says the price is fair." / '"Pay me," Korvin says.' / '"Pay me," says Korvin.' |
| "I remember what Korvin told me." / "Nicco remembers Korvin." | "Korvin hands Nicco the key." / "Korvin quietly takes the coins." |
| "What do I know about Korvin?" / "According to Korvin, …" | "Brenna stands beside Nicco." / "Korvin is here, arms folded." / "Brenna is standing at the door." |
| "Korvin had told him yesterday…" / "Korvin said yesterday that…" / "What Brenna said earlier…" | "Korvin looks at him and laughs." / "Korvin, the slaver, steps forward." |
| "If Korvin were here, he would haggle." / "Korvin isn't here." / "Korvin never comes here." | "Nearby, Korvin sat hunched at the counter." |
| "Brenna, Gerome and Maren remain above." / "Brenna used to sit by that window." | "Brenna follows him down the stairs into the hall." |
| "What Nicco knows of Korvin comes from…" / "Talk about Korvin makes him uneasy." | "Nicco hands Brenna the boots." |

**Audit integration** (tested):

- An absent authored NPC who stays upstairs is not flagged; one walking in or speaking from the doorway is.
- Created Dell sitting at the counter is still flagged; "the stool Dell had left" and "remembers Dell Harrow's face" are not.
- A canon recital about the absent Korvin is not flagged.
- **Every pre-existing `absent_participant` test passes unchanged:** the inn regression, authored companions, Doran Hale, Mistress Elara, staff and H5.1 co-movement.

## D. Retrieval de-duplication

**Rule:** identity is by **source**, never text similarity.

- An H3-fetched entity record matches NPC+ handle `npcmem:<id>:canon:entity`.
- A fetched chunk matches `npcmem:<id>:canon:<chunk_id>`.

**Effect:** a recovered NPC+ line whose source H3 already fetched becomes `Recovered for Korvin [npcmem:korvin:canon:entity]: same source as [RETRIEVED CANON] (shown there once).`

- The payload appears exactly once in the prompt, and the handle stays visible, so nothing is lost.
- Recovery is kept intact when H3 did not fetch the source.
- Private sources are never recovered lines, so de-duplication cannot surface or move them; a private-chunk retrieval record changes nothing.

**Observable:** `TurnDiagnostics.retrieval.npc_plus_duplicates_removed`, counts only.

## E. Live re-measurement

Same scenarios, Pass 3 (40 turns) against Pass 4 (36 turns). Production retry. Cost **$0.13**.

| Metric | Pass 3 | Pass 4 |
|---|---:|---:|
| Success | 40/40 | 36/36 |
| Reconciliation | 22 (55.0%) | **9 (25.0%)** |
| Redaction | 10 (25.0%) | **0 (0.0%)** |
| `absent_participant` issues | 28 | **4** |
| Recovery hits (CH_public) | 10/10 | 9/9 |
| Duplicate payloads removed | n/a | **9/9** |
| Wrong or unexpected commits / secret leaks | 0 / 0 | **0 / 0** |
| Context average | 7,213 | 7,213 |

| Scenario | Pass 3 reconciled / redacted / absent | Pass 4 reconciled / redacted / absent |
|---|---|---|
| HH_D follow | 10 / 0 / 18 | 5 / 0 / 1 (`player_agency` 4) |
| CH_public | 10 / 10 / 10 | 3 / 0 / 3 |
| CH_private | 2 / 0 / 0 | 1 / 0 / 0 |
| CH_unrelated | 0 / 0 / 0 | 0 / 0 / 0 |

**The 4 remaining flags:**

- A 5-run draft probe of CH_public found the cause of one false positive, "What Nicco knows **of Korvin** comes from local canon". The preposition-object rule fixed it after the run.
- The flagged drafts of the other 3 were not captured, so they are **unverified**: they could be true participation or residual false positives.
- The `player_agency` issues in HH_D are unchanged behaviour (narration of Nicco's movement details).

## F. Regression validation

**Commands:**

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm test` | **1260 / 1256 / 0 / 4** (same four TODOs) |
| `npm run test:playthrough` | 25/25 |
| H2 golden | unchanged |
| `runTurn` | 164 lines |

**Suites:** H3, H4, H5, H5.1 and NPC+ Pass 1–3 are all green. `tests/language-gates.test.ts` is purely additive: two new gates, each with a reference literal and a locked matrix row. No existing assertion changed.

## G. Remaining debt

1. **Pronoun continuations are not resolved.** "Korvin is away. He laughs." does not flag "He laughs", which is conservative toward allowing.
2. **The detector is lexical.** An unusual absent-participation phrasing (e.g. "Korvin's voice cuts through the room") is not caught. Possessive subjects are deliberately allowed.
3. **3 residual live flags are unverified.**
4. **Carry-overs:**
   - live follow never narrated (design);
   - relationship changes rare (by design);
   - contract recall low;
   - authored destination-less departure;
   - the 32k ceiling at about 98% for full-household scenes;
   - H6 reconciliation and redaction (household and lore scenes are now 25% / 0%);
   - four H1 TODOs.

## H. Recommendation for Pass 5

**1. A small live re-baseline** of the broad H5 matrix (about 100 turns). It checks that the audit-precision change lowers reconciliation and redaction outside household scenes too, with draft capture for any `absent_participant` flag so residuals can be classified.

**2. Then resume NPC+ depth on the consolidated foundation:** a first bounded **reflection** step that turns roll-ups and recent developments into structured, evidence-cited stance notes. Constraints:

- a model is allowed only behind the existing evidence and authorization path;
- no free prose becomes authority.

CALDREVAN NPC+ PASS 4 COMPLETE
