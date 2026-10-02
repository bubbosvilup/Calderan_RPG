# CALDREVAN NPC+ Pass 8: organic development discovery

**Date:** 2026-10-02. No commit or push.
**Inputs:** the [Pass 7](CALDREVAN_NPC_PLUS_PASS_7_ORGANIC_REFLECTION.md), [Pass 2](CALDREVAN_NPC_PLUS_PASS_2_DEVELOPMENT.md) and [Pass 3](CALDREVAN_NPC_PLUS_PASS_3_CONSOLIDATION_RECALL.md) reports.
**Evidence:**

- a live run of 120 turns ([JSONL](h5-live/npcplus8.jsonl), [summary](h5-live/npcplus8.summary.json), [narration review](h5-live/npcplus8.review.jsonl));
- a human review of every flagged turn and of every audit-revised draft;
- `tests/npc-plus-pass-8.test.ts` (9 tests).

**Unchanged:**

- Reflection triggers: still 3 developments.
- No conversation-driven state, no fake developments and no seeding.
- No new domain or memory system.

## A. Executive result

**Status: COMPLETE.** In 120 organic turns:

- **0 NPC+ developments** were recorded.
- **0 reflection calls** were made.
- **The only state commits were Nicco's own 12 moves.**

The zero is now explained and located. It has two causes, which differ by domain.

1. **Movement is the one domain where ordinary household play clearly should create state, and it fails mainly at the narrator** (cause A).
   - Of 6 outbound "come with me" invitations, the narrator declined 5. It kept the NPC+ behind and often repeated the engine's own left-behind note: "Gerome, Brenna, and Maren remain upstairs".
   - The sixth invitation was narrated as a voluntary follow (errands turn 2: "Maren's lighter steps came after"). Two things then failed:
     - the movement grammar found no evidence, because it needs "to <destination>" (cause B);
     - the controller proposed nothing (cause C).
   - The audit then flagged both followers as `absent_participant`, and the revision erased them.
   - Two NPC+-initiated trips downstairs were also lost: the grammar found no destination (B), and the controller proposed `leave_scene`, which is invalid for authored NPC+ (C). Authorization rejected that proposal correctly.
2. **Relationships, contracts and conditions: mostly expected behavior** (cause F).
   - The narration contained courtesy, apology acceptance, mild softening and hedged trust. None of these is verifier-grade evidence, and policy says they should not be.
   - There are two borderline vocabulary misses (B):
     - Brenna's "Yes… I do [feel safe]";
     - Maren keeping her promise to watch Brenna overnight.
   - The one relationship proposal (trust↑ on "But thank you.") was politeness and was correctly rejected (D works as intended).
   - The only condition issue was an audit **false positive**: "the light … falls" was read as Gerome being knocked down. It is now repaired.

There is **no evidence that the state model lacks a needed domain** (cause E). The development that is actually lost, a voluntary follow, already has a domain: movement, with a `moved` history entry.

## B. Observation method and observed interaction classes

**New evaluation-only modules.** None is imported by gameplay, and none touches `runTurn`.

| Module | Role |
|---|---|
| `src/dev/organic-discovery.ts` | Observer, per-turn classifier, motif tracker and aggregate |
| `src/dev/eval-organic-discovery.ts` | Live harness |
| `src/dev/replay-organic-discovery.ts` | Offline re-observation of a scratch replay dump, with no provider calls |

**What the observer reads.** The observer reads the already-published `TurnResult` and the base and final snapshots. For each turn it does four things:

1. **Detects interaction candidates** for each active NPC+:
   - a tense-agnostic lexical net over sentences that the NPC+ leads, and over dialogue attributed to them;
   - 20 classes, including help, protection, refusal, disagreement, apology, gratitude, practical care, following, staying, food, chores, responsibility, boundaries, trust and distrust, affection and hostility.
2. **Runs the production verifiers in shadow:**
   - `verifyRelationshipEvidence`, run over every delivered sentence and quoted span, for every present NPC+ → target pair and all 16 dimension/direction steps, using the same level bounds as `CampaignState`;
   - the completed-movement evidence;
   - `contractCommands`;
   - household choices.

   The question each check answers is: *if this had been proposed, would it have verified?*
3. **Traces each candidate** through proposal → authorization → commit → `PremiumHistoryEntry`, and assigns one of the six outcomes.
4. **Records outputs in two places:**
   - ordinary diagnostics: IDs, class names, check names and counts only (tested: they contain no narration text);
   - a separate review artifact holding the narration for human review.

**Sample and setup:**

- 5 sessions × 24 turns: breakfast, chores, friction, evening care and errands.
- Brenna, Maren and Gerome are active NPC+ members of Nicco's tower household.
- Setup is membership only. No seeded developments, relationships, contracts or notes; the harness checks this.
- The harness applies no commands after setup.
- Player inputs are ordinary household speech and actions: meals, chores, room changes with invitations, requests and refusals, disagreement and compromise, apology, thanks, and questions about trust and safety.
- **Real providers:** GLM 5.2 narrator and DeepSeek controller.

An earlier 10-turn attempt (about $0.024) was stopped and discarded. It revealed that the narrator's past-tense prose escaped the first lexicon. The lexicon was fixed, and the replay dump was added so that later tuning would not need paid reruns.

## C. Pipeline drop-off counts (120 turns)

| Stage | Count |
|---|---:|
| Meaningful interaction candidates (lexical, deduplicated per NPC+ and class per turn) | 102 |
| Follow invitations by the player (6 outbound, 3 for the return trip) | 9 |
| Evidence detections, total | **0** |
| — relationship evidence, in bounds / out of bounds | 0 / 0 |
| — relationship near misses (one hedged sentence: "…concern, *maybe*…", matched against 9 pairs) | 9 |
| — movement evidence (NPC+) | 0 |
| — contract evidence | 0 |
| — household-choice evidence | 0 |
| Controller proposals | 8 |
| — involving an NPC+ | 5 |
| — by kind | `move_character` 3, `leave_scene` 2, `set_knowledge` 2, `adjust_relationship` 1 |
| Authorization accepted / rejected | **0 / 8** |
| Committed NPC+ commands | 0 |
| Committed commands of any kind | 12 `runtime_delta` (Nicco's moves) |
| Premium developments | **0** |
| Reflection due checks / due characters / calls | 120 / 0 / 0 |

All 8 rejections were correct:

| Rejection | Count | Reason |
|---|---:|---|
| `move_character: rejected_already_established` | 2 | The NPC+ was already in the room the controller wanted to move them to; the narration's "follows him back up" contradicted state, and state was right |
| `move_character: rejected_reference_invalid` | 1 | The controller tried to move Nicco |
| `leave_scene: rejected_reference_invalid` | 2 | Wrong command kind for an authored NPC+ (see D, movement) |
| `set_knowledge: rejected_controller_mismatch` | 2 | A bridge fact that nobody told |
| `adjust_relationship: rejected_insufficient_confirmation` | 1 | Gratitude |

**The automated outcome classes are provisional; the human-reviewed result follows.**

| Outcome | Automated (102 candidates) | After human review: movement hits, audit-erased drafts, relational moments |
|---|---:|---|
| NO_STATE_EXPECTED | 91 | All 91 confirmed. In addition: 3 lexical false positives ("grey eyes following the conversation"), 5 return trips where the NPC+ was already in that room, 1 round-trip errand within one turn, 5 invitations the narrator declined, 2 apologies with no hostility to lower, 2 explicitly hedged trust answers, and 1 boundary ("not yet") |
| VALID_EVIDENCE_NOT_DETECTED | 10 | **5 real cases:** errands 2 follow (Gerome and Maren), evening-care 2 Gerome's errand downstairs, friction 22 "I do [feel safe]" (borderline), evening-care 17→23 Maren watching Brenna (borderline). The other 7 automated hits were reclassified above |
| EVIDENCE_DETECTED_NO_PROPOSAL | 0 | 0. The verifiers never found usable evidence, so controller recall was never the binding constraint once evidence existed |
| PROPOSED_BUT_REJECTED | 1 | **3.** Friction 18 trust↑ on thanks (correct rejection). Chores 24 and errands 24: Maren goes downstairs, the controller proposed `leave_scene` (wrong kind, correctly rejected) |
| COMMITTED_EXISTING_DOMAIN | 0 | 0 |
| MISSING_DOMAIN_REPRESENTATION | 0 | 0 (see E) |

## D. Relationship evidence and movement findings

### Relationships

| Case | Turn | Verdict |
|---|---|---|
| "But thank you." → controller trust↑ | friction 18 | **Correctly rejected as too weak** (politeness) |
| Apology acceptance: "It's alright", "if you're saying it, then it's said" | friction 8, breakfast 9 | **Correctly not recorded.** Hostility is `none`, so lowering it would be out of bounds anyway |
| "Trust isn't a word I scatter around, but you're closer to earning it than most" (Brenna); "yes, for now" (Maren) | evening care 15 | **Correctly not recorded.** Both explicitly hedge or defer trust |
| "That's a longer story than I have breath for… not yet" | evening care 7 | Boundary. **Correctly not recorded** |
| "Yes," she says simply. "I do." (answering "do you feel safe here with us?") | friction 22 | **Strong-ish but missed.** It is an unhedged first-person statement, but it concerns the household and place, not a specific person, and it answers a leading question. No verifier vocabulary (`trust`/`fear`) covers "feel safe". Borderline. |
| Maren: "Of course… If anything changes, I'll wake you", then is "still awake as promised" | evening care 17 → 23 | **The strongest organic relationship candidate:** sustained, fulfilled care for another member. The existing protectiveness (Maren → Brenna) could represent it, but the verifier needs protect/shield/defend wording, and the act was a request that was granted. **Missed by vocabulary;** whether it should count is a policy question (see K). |
| Softening: "not quite a smile", "shoulders eased" | friction 17, evening care 10 | **Correctly too weak** |

**No case reached "detected but never proposed"** (shadow verifier hits: 0 in bounds). Relationship recall is limited by what the narrator writes and by the verifier's vocabulary, not by the controller or by authorization. That agrees with the Pass 3 root cause.

### Movement: where it stops, by invitation

| Turn | Invitation | Stop | Cause |
|---|---|---|---|
| breakfast 12 | "Maren, would you come with me?" | "no footsteps follow" | A |
| chores 9 | Brenna, come and sit by the hearth | The draft left it open ("hers to decide"); the audit flagged the mention; the revision is an empty hall | A |
| friction 12 | "Anyone who wants can come along" | "No one followed him down" | A |
| evening care 11 | "Gerome, come with me" | "Nicco is alone. Gerome, Brenna, and Maren remain upstairs" (the note's own wording) | A |
| **errands 2** | "Gerome, Maren, come with me" | **The draft narrates both following.** No movement evidence (no "to <destination>"); no proposal; the audit flags `absent_participant` ×2; the revision erases them | **B + C** |
| errands 10 → 11 | Brenna agrees ("I think I can manage that") and waits at the stairs; next turn, "take my arm" | "no footsteps follow… remain upstairs" | A, contradicting the previous turn |

The left-behind note (`stages/intent.ts`) states as fact that each person left behind "stays there", and permits following only if it is "narrated explicitly". The narrator treats this as an instruction: in 5 of 6 outbound invitations it narrated refusal or absence.

After a declined invitation, later turns often *presuppose* the follow, through the player's own inputs or the narrator's continuity. This produced most of the run's 7 `absent_participant` issues (breakfast 15/16, errands 12/13) and 5 harmless "follows him back up" sentences about NPC+ who never left. **In every case state stayed correct.**

NPC+-initiated departures were narrated three times:

- Gerome fetching a blanket ("He descends out of view");
- Maren "I'll head down", twice.

None had a destination clause. Both of Maren's got a `leave_scene` proposal, which exists only for created characters and is correctly rejected. This is the carried-over Pass 2/3 debt "authored destination-less departure", now measured live.

## E. Recurring behavior (observation only; nothing persisted)

Distinct turns per session (`MotifTracker`, at least 2 turns):

| Behavior | Observed | Reading |
|---|---|---|
| Maren tidies or folds | 4–13 turns in every session | Mostly **player-requested** chores. Not evidence of a role. |
| Brenna tidies or sorts | 3–6 turns in 4 sessions | Same. Often the player asked her. |
| Maren sits by or looks out the window | 2–3 turns in 3 sessions; 18 narrations overall | **Unprompted** and recurring across sessions: the best `signature_pattern` candidate. Texture, not consequence. |
| Maren / Brenna check the door or window | 2–4 turns in 3 sessions | Weak; partly from the window-arrangement plot |
| Gerome "motionless near the wall/stairhead" | 65/120 narrations | **Rendered from canon** ("Silent stone construct"), not development |
| Brenna's wrist scars catch the light | 14 narrations | Rendered from the profile (`Old wrist scars`): narrator flavor |
| Brenna's "grey eyes tracking" | 58 narrations | Narrator flavor from the profile |

**No `shared_motif` occurred:** there were no repeated two-person rituals. **One `emerging_role`-like sequence** appeared: Maren as Brenna's watcher (evening care 4 "She needed someone here", 17, 23). It was single-session and partly requested.

Most recurrence is either player-prompted or a rendering of existing profile and canon details. A persisted motif built on these would mostly echo authored data. No domain change is warranted from this sample.

## F. Condition narration findings

There was **1** `uncommitted_condition` in 120 turns. It was a false positive:

- **Sentence:** "He carries it… and sets it down…, angling it so the light from outside falls across the surface."
- **What happened:** the sentence is led by "He" (Gerome), so "falls" was attributed to him as `knocked_down`, and the turn was redacted.
- **Verdict:** pure scenery; no NPC+ development was lost.

Every other condition-like phrase in the sample was descriptive texture:

- Brenna "still carried the drawn look of someone not yet past an illness". She already holds the authoritative `recovering` condition.
- Breathlessness after the stairs.

None is an unrecorded persistent condition. In this domestic sample, the condition audit's issues are **narrator flavor**, not lost authority.

## G. Organic development rate

| Run | Turns | Developments |
|---|---:|---:|
| Pass 7 | 61 | 0 |
| Pass 8 | 120 | 0 |
| **Combined** | **181** | **0.0 per 100 turns** |

If the errands-2 follow had survived, the rate would have been 2 `moved` developments in 120 turns. If every invitation the narrator declined had instead been accepted and recorded, it would have been at most about 12.

## H. Reflection trigger rate

| Measure | Value |
|---|---:|
| Due checks | 120 |
| Due character observations | 0 |
| Reflection calls | 0 |
| Accepted notes | 0 (zero-denominator; no human review was needed or fabricated) |

Reflection latency remains unmeasured live.

**Gameplay cost and latency:**

| Measure | Value |
|---|---|
| Tokens, total | 1,014,189 |
| — narrator input / output | 537,567 / 19,884 |
| — controller input / output | 455,590 / 1,148 |
| Estimated cost | **$0.306** (OpenRouter public per-token rates; not an invoice) |
| Narrator p50 / p95 | 3,381 / 4,539 ms |
| Controller p50 / p95 | 1,042 / 2,006 ms |
| Context maximum | 5,208 characters |
| Delivered as draft / revision / redacted | 105 / 12 / 3 |
| Gameplay failures | 0 |
| Secret-sentinel leaks | 0 |
| Reflection-induced gameplay changes | 0 (checked each turn) |

## I. Demonstrated defects

1. **Repaired: a condition-audit false positive on ambient motion.**
   - **Scope:** `OBJECT_MOTION` in `narration-audit.ts` is used only to strip non-person motion before condition matching. It now also strips ambient subjects (light, sunlight, shadow, glow, dust, ash, rain, snow, silence, darkness, …) that fall, spill, pour, drip and so on (the existing object-motion verbs).
   - **Positive tests:**
     - the live errands-22 sentence is clean;
     - "a shadow falls… dust falls through the beam" is clean.
   - **Negative tests:**
     - "He trips and falls to the floor" is still flagged;
     - "He falls to the floor as the light shifts…" is still flagged;
     - "Light falls across Brenna as she collapses…" is still flagged.
   - **Effect on the run:** this is the only gameplay-semantic change in Pass 8. It would have changed exactly one turn here (errands 22: redacted → clean draft).
2. **Documented, not repaired: lost voluntary following and NPC+ departures.**
   - **Mechanism:** the narrator's follow narration has no "to <destination>" clause ("Maren's lighter steps came after", "He descends out of view", "Maren follows a step behind"). Grammar recall is therefore zero. The controller does not propose `move_character`, and for NPC+ departures it chooses `leave_scene`. The audit then erases the follow.
   - **Why not repaired here:** the 1.3 grammar is conservative by design ("the destination must resolve to one concrete known location"). Only one live outbound follow existed. A repair now would be unmeasurable while the narrator declines 5 of 6 invitations. It needs to be designed together with the left-behind note (K).

**Not defects:**

- the 5 continuity slips of the "follows him back up" kind: state was right, and authorization rejected the only proposal;
- all 8 rejections;
- all of the relationship non-recording.

There were no wrong commits, no leaks, and no change in authority.

## J. Recommended state-model changes

**None.** The evidence does not show a missing domain.

| Lost item | Existing representation |
|---|---|
| Lost follows | `move_character` → `moved` |
| Maren's sustained care | Protectiveness (Maren → Brenna) |
| "I feel safe" | Trust or fear, if it is ever judged strong enough |

Recurring chores and window-sitting are player-prompted or rendered from canon. Generic `conversation_memory`, `important_event`, `emotional_event` and `interaction_score` were not added, and nothing here argues for them. Persisting motifs is still premature.

## K. Recommendation for Pass 9

**Pass 9 should be consent-preserving NPC+ following, the single largest measured loss.** It must not involve trigger loosening, relationship widening or new domains.

1. **Rewrite the left-behind note for active NPC+ only.** For other characters, keep the current note. For an invited active NPC+, the note should state neutrally that the invitation was made and that the NPC+ decides. It must not assert "X stays there". Consent stays narrated: no automatic following and no party model.
2. **Add a bounded implicit-destination follow rule.** On a turn where Nicco moved, a completed follow led by the NPC+ resolves to Nicco's arrival location. It covers:
   - "<NPC+> follows (him / a step behind)";
   - "<NPC+>'s (foot)steps / tread came after / follow".

   Under the existing `NOT_DONE` gates, a gaze, a hedge or a refusal still yields nothing. Positive and negative tests are required, including "eyes following the conversation".
3. **Controller guidance:** an authored NPC+'s departure is `move_character` with a known destination, never `leave_scene`. Authorization stays unchanged.
4. **Re-measure with this harness.** Same 5 sessions; the replay dump allows offline lexicon and observer changes. **Success:** invited follows become committed `moved` developments only when the narration shows the NPC+ choosing to come. Meanwhile:
   - `absent_participant` falls;
   - there are no unrequested moves.
5. **Leave the relationship vocabulary unchanged until a targeted sample exists.** Pass 9 may *observe* fulfilled-promise care ("keeps watch over", "stays awake for") as a candidate protectiveness form, but should not adopt it on two borderline cases.
6. **Reflection stays untouched.** With following recorded, three developments per NPC+ become reachable organically. Whether that happens is the next honest measurement of reflection quality.

## Validation

| Check | Before | After |
|---|---|---|
| `npm run typecheck` | PASS | **PASS** |
| `npm test` (total / pass / fail / todo) | 1286 / 1282 / 0 / 4 | **1295 / 1291 / 0 / 4** (same 4 TODOs) |
| `npm run test:playthrough` | 25/25 | **25/25** |
| H2 golden | unchanged | **byte-identical, not regenerated** |
| Prior NPC+ suites and context stress | PASS | **PASS** |
| `runTurn` | 164 lines | **164 lines** (untouched) |

**New tests (9).** The observer classifies:

- committed protection as COMMITTED_EXISTING_DOMAIN, with a `relationship_changed` development;
- the same narration without a proposal as EVIDENCE_DETECTED_NO_PROPOSAL, with nothing committed;
- a hedged hug proposal as PROPOSED_BUT_REJECTED;
- gratitude, and an out-of-bounds apology, as NO_STATE_EXPECTED;
- a follow cue without movement as VALID_EVIDENCE_NOT_DETECTED (review required).

The remaining tests check that:

- diagnostics carry no narration text, while the review artifact does;
- the observer never mutates the campaign;
- motif recurrence counts distinct turns;
- the ambient-light condition repair holds, with positive and negative cases.

**Replication:**

1. Build, then run `node .build/src/dev/eval-organic-discovery.js --out <new.jsonl> --replay-out <scratch.replay.jsonl>`. Options: `--dry`, `--sessions`, `--max-tokens`.
2. Re-observe offline with `node .build/src/dev/replay-organic-discovery.js <scratch.replay.jsonl> <summary.json> [<review.jsonl>]`.

The replay dump contains full snapshots and is kept in scratch, not in the repository.

CALDREVAN NPC+ PASS 8 COMPLETE
