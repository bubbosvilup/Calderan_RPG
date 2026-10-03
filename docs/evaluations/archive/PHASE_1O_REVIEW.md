# Phase 1O review — Evidence-backed authorization & epistemic continuity — 2026-09-28

Reviewer: Claude (implementation agent). Truth labels for evidence evaluation and all classifications of narration are agent-authored and **pending human review**; no LLM graded anything.

**Unchanged:**
- Kimi (`moonshotai/kimi-k2.5`, reasoning disabled) remains the narrator; DeepSeek (`deepseek/deepseek-v4-flash-0731:nitro`) the controller.
- No third LLM and no extra LLM call: evidence comes back in the same controller response.
- CampaignState is not redesigned and the command vocabulary is unchanged.
- No new memory subsystem; persistence and retrieval are untouched.
- The Phase 1N `dialogue_focused` recent context and `NarrativeKnowledgeAccess` projection remain.
- The design is in [`docs/architecture/EVIDENCE_AUTHORIZATION.md`](../../architecture/EVIDENCE_AUTHORIZATION.md).

## A. Epistemic invariant

> Once CampaignState establishes that character X knows fact F, that knowledge remains established until an explicit future mechanic changes it.

**Audit:**
- The only knowledge mutation is the explicit `set_knowledge` command (replace-by-pair in `src/campaign/social.ts`).
- Nothing drops, expires, overwrites or regenerates edges because they were not referenced recently.
- `RecentConversation` never touches knowledge, and persistence round-trips it unchanged.
- **One provenance hazard was found and closed:** a repeated `/tell` of an already-known fact would have overwritten the original provenance. It is now a no-op, `rejected_already_established`. Upgrading `heard_rumor`/`believes`/`suspects` to `knows` through an explicit tell remains possible.

**Absence from the prompt is not forgetting.** The projection is re-derived from the captured snapshot every turn and never cached from an earlier prompt. Statuses and provenance persist; a rumor stays a rumor (tested).

**Surfacing:**
- Every Nicco-known fact reaches narrator context today (the context cap is 32), so a known fact is always available for delayed recall.
- New bounded narrator-side relevance (`selectRelevantFacts`): up to 12 player-known facts are all projected; beyond that, only intent-referenced facts, facts lexically referenced by the input (a recall query such as "do you remember the eastern bridge?") and facts mentioned in recent conversation, at most 16.
- Authorization and the controller still see the full list.
- NPC-only facts (not known to Nicco) are not surfaced; this is the existing visibility policy and a future decision.

## B. Controller evidence schema (production)

```ts
CONTROLLER_EVIDENCE_SCHEMA = { commands: [{ command: <unchanged vocabulary>, evidence_quote: string }] }   // strict
ControllerResult.evidence?: readonly string[]   // aligned with commands
```

Final instruction appended to `CONTROLLER_POLICY`:

> For every proposed state command, provide the shortest exact verbatim excerpt from the finalized narration that by itself establishes that state change: it must contain who acts, the verb (the telling or taking) and what is told or taken. When one sentence establishes several changes, use that whole sentence for each of them. Do not cite reactions, implications or hypothetical statements.

This wording is the third iteration, driven by measured quote quality (section E). The first two wordings led DeepSeek to return verb-less fragments ("then the fluffy one") or the bare quoted fact.

## C. Deterministic verification

`verifyEvidence` in `src/turn/evidence-authorization.ts`. A quote is necessary and never sufficient.

**Accepted evidence must satisfy all of these:**
- An exact substring (whitespace runs collapsed only; there was one demonstrated paragraph-join case), 8–240 characters.
- The containing sentence(s), with dialogue blanked, contain no hedge, negation, modal/future, hypothetical, interruption or retraction marker.
- No other person's name in the quote, or between subject and verb, whether present in the scene or not.
- Pronouns resolve to the required character via the nearest named-subject sentence before the pronoun's own sentence.
- **For `set_knowledge`:** the fact content plus a communication act by Nicco (Nicco must be the subject), or "Brenna hears Nicco say…", or the quoted-`/tell` forms in D.
- **For `transfer_item`:** a narrated receipt act by the recipient, plus each item referenced by a token unique among the offered items, or a group phrase whose count matches the offer. Also accepted: a coordinator-led continuation of an earlier receipt act in the same sentence with only item-list material in between (sequential lists).

**Rejected (each is covered by tests):**
- reactions ("takes in the information", "Her eyes widen");
- bare fragments ("the fluffy shirt");
- fabricated or "…"-elided quotes;
- dialogue-only receipt ("'I took three pink shirts…'");
- "Brenna tells Nicco…";
- "Nicco listens as Maren tells…";
- pronouns resolving to another character;
- "starts to tell… but stops", "considers explaining", "before Nicco can say", "will tell… tomorrow";
- questions;
- "almost takes", "considers taking", "reaches toward".

**Hybrid policy** (`authorizeWithEvidence`):
- Grammar confirmation OR verified evidence, where evidence can only fill a *missing confirmation*. Refusal and retraction, intent mismatch, reference, state and provenance checks always win.
- If the grammar says yes and the evidence is invalid, the command stays authorized.
- **Atomic group:** evidence may not create a partial commit of one offer (`rejected_evidence_partial_group`).
- **Incomplete proposal for a wholly established offer:** if the narration established the whole offer but the controller proposed only part of it, the group is withheld rather than committed partially (`rejected_incomplete_group_proposal`). Narrated partial acceptance still commits the named items.

**Diagnostics** per command: `source` (grammar, evidence, both or rejected), grammar result, and quote with verification check; all frozen.

**Production default: `hybrid`**, switched after the gates in G. `shadow` remains for evaluation only.

**Deterministic evidence bugs found by this phase's live runs and fixed** (TurnEvidence, veto-safe direction):
1. **Prior ignorance.** "She had not heard this before" after a telling was read as a retraction and vetoed a real, verified telling. Prior-ignorance past perfect is now neutral.
2. **Told but not heard.** "Nicco tells Brenna X. She does not hear him." was a pre-existing grammar false positive, because "She" wasn't linked when Brenna was only an object. Sentence-initial she/he now resolves to the single character named in the previous sentence, **for vetoes only**.
3. **Undecided choice.** "Reaches to accept or decline" is an undecided choice, not a refusal.

## D. Quoted `/tell` policy (adopted)

- Generic quoted speech is **not** evidence.
- Nicco's quoted speech that exactly realizes an already-resolved explicit `/tell` intent **may** be evidence. It must contain the full fact content, no hedge or question, and be attributed to Nicco. Accepted attributions:
  - a speech verb with Nicco as subject: `"The eastern bridge is closed," Nicco tells Brenna.` / `Nicco says to Brenna, "…"` / `"…," he says.` with "he" resolving to Nicco;
  - the **action-beat** convention: `Nicco leans toward Brenna. "The eastern bridge is closed."`. The quote is a sentence of its own with no attribution text, and the immediately preceding sentence starts with Nicco, addresses the recipient, names no one else and is not hedged. This was added after the form recurred three times in live Kimi output.
- A quote without a `/tell` intent can never create knowledge. For example, the player looks at Brenna and the narrator writes `"I'll tell you the bridge is closed," Nicco says.`: there is no intent to match, so it fails (tested).
- Near misses rejected (corpus): the action beat addresses Maren; an intervening speaker beat ("Maren sighs."); an action-beat question.

## E. Knowledge acquisition recall — before/after

**Real DeepSeek, scripted narration, hybrid mode (`npm run eval:evidence`).** Items are the evidence corpus plus every stored r115/`/tell`/boots trace from Phases 1M, 1M.1, 1M.2 and 1N. All runs are kept in `docs/evaluations/phase-1o-evidence-eval-*.json`.

| Run | Code/instruction state | Hybrid: established events fully captured | Grammar only | Partial (hybrid) | FP on "not established" | Ambiguous accepted |
|---|---|---:|---:|---:|---:|---:|
| v1 | instruction 1 | 34/46 | 28 | 2 | **0/46** | 0 |
| v2 | instruction 2 | 37/46 | 28 | 1 | **0/46** | 1 |
| v3 | instruction 3 + pronoun/whitespace fixes | 43/46 | 28 | 1 | **0/46** | 1 |
| v4 | + elliptical lists, act next to dialogue | 46/48 | 28 | 0 | **0/48** | 0 |
| v5 | + prior-ignorance and veto-pronoun fixes | 46/49 | 28 | 1 (controller omission) | **0/49** | 1 |
| v6 | + incomplete-group rule, accept-or-decline | 46/49 | 29 | 0 | **0/49** | 1 |
| v7 | + action beat (before anchor fix) | 42/50 | 28 | 0 | **0/52** | 1 |
| **v8** | **final code** | **50/51** | **29** | **0** | **0/52** | **1** |

Per source, final run v8 (hybrid versus grammar-only, established events):
- corpus: 17 vs 6
- 1M traces: 9 vs 9
- 1M.1: 5 vs 5
- 1M.1 confirmation: 7 vs 4
- GLM: 3 vs 1
- 1N tells: 6 vs 3
- 1N boots handovers: 3 vs 1

**Controller variance:** the same narrations get different quotes run to run. v7's drop came mostly from DeepSeek choosing weaker quotes (a bare fragment, a reaction, "She settles the boots"), which were correctly refused. Recall with the final code should be read as a range, not a point estimate. Precision was **0 false positives in all eight runs**.

**The one accepted ambiguous item** (conf k#3): Nicco explicitly says the fact to Brenna via an action beat, and she replies that she'd already heard it from merchants. A told edge is created. This is defensible because the telling did happen, but it is flagged for human review.

**Live Kimi `/tell`, production hybrid, 10 natural realizations (tell-variant runs: 4/6 early code, 4/4 final code):**
- **8 committed.**
- Of the 2 misses:
  - `Nicco turns to Brenna. "The eastern bridge is closed."` is an action beat from before its support existed. This exact live narration now commits (regression test).
  - "Nicco's words hang in the quiet…" never narrates the telling, so it was correctly rejected.
- Evidence-only commits (the grammar missed them):
  - "Nicco turns to Brenna and tells her plainly that…" (tell run);
  - "Nicco turns to Brenna, seated and alert at the small table, and tells her that…" (recall run);
  - `Nicco speaks to Brenna. "The eastern bridge is closed."` (recall run).

## F. Record 115 — group transfer

**Live Kimi, 5 runs:**
- 3 committed all three garments **in one revision**, one of them evidence-only: "She reaches to receive the bundle… her hand closes on the offered items".
- 2 were genuine refusals ("I don't need charity"; "Keep them") with no commit.
- **No partial commits.**

**The Phase 1M.2 GLM partial** (narration gives three, state kept one) is fixed:
- GLM #3 ("She took the pink cotton shirt, then the fluffy one, and finally the shorts") now commits all three (source: cotton `both`, others `evidence`).
- GLM #1 commits all three in v8.
- GLM #2 ("turned the fluffy shirt over… held the shorts up…") has receipt evidence only for the cotton shirt, so the atomic rule withholds the group. This is conservative: "none", not "partial".

**Offline:** sequential evidence commits 3 transfers with a single revision increment; partial evidence is withdrawn; accept-then-return is vetoed; an incomplete proposal for a wholly accepted offer is withheld.

## G. Adversarial precision

**Offline gate (maximally adversarial controller):**
- **44 negative cases** covering every category in the brief: hypothetical acceptance, quoted NPC event description, negated communication, a question containing the fact, reaction without communication, accept then return, refuse then discuss, almost takes, considers taking, reports somebody else told them, already knew, hears unrelated dialogue, Nicco quote without intent, wrong recipient or addressee, told but not heard, dialogue-only receipt, and non-receipt list continuation.
- **Method:** *every contiguous word window* of each narration (8–240 characters) is tried as the quote for every intended command, individually and shared across commands.
- **Result: 0 commits.**
- The gate also caught one real verifier false positive during development, which was fixed before enablement: "Brenna watches Maren take the clothes" with Maren absent from the scene.
- 17 positive cases, including partial and sequential acceptance and a quoted `/tell` with a matching intent, authorize the whole intended event.

**Real controller:** 0 false positives on 46–52 non-events in every run v1–v8, and 0 commands authorized outside the resolved intent.

**Gates for enablement** (brief section 23): 30+ adversarial cases, 0 false positives. Met before the default switch, and still met by the final code.

## H. Delayed recall — Brenna keeps knowing F after history is gone

**Offline, 20 turns** (T1 tell, T2–T19 unrelated, T20 recall query):
- The original narration is no longer in `RecentConversation`.
- The projection shows `Brenna: CAN USE F1 (knows)`.
- The edge still has `{status: knows, provenance: {source: nicco, told}}` (tested).
- The long-session statuses test keeps `heard_rumor` as `heard_rumor`.

**Live Kimi, 7 sequences** (tell, six unrelated turns, then T8 ask Brenna and T9 ask Maren):
- **5 committed the telling at T1.** In all 5, T8 showed `Brenna: CAN USE F1 (knows)` with the telling rotated out of recent conversation, and Brenna recalled it naturally: "You mentioned it was closed… That's all you said"; "It's closed. You told me that before the fever took me"; "You mentioned it this morning, or was that yesterday?".
- **2 did not commit at T1,** due to evidence bugs that were then fixed: the prior-ignorance false refusal, and the action-beat quote before its support existed. Both exact live narrations are now regression tests that commit. In both, the projection correctly kept Brenna at DO NOT USE, and she said "You haven't mentioned it to me" / "Can't say I do". That is consistent with state but contrary to the story, which is exactly the acquisition failure this phase set out to remove. Both causes are fixed and covered by tests.
- **Narrator embellishment:** Brenna sometimes adds unsupported detail ("shut since before I arrived", "Something about the pilings, wasn't it?").

## I. Negative delayed recall — Maren still does not have F

- **Offline:** after a failed telling, 20 turns later Brenna is still DO NOT USE and no edge exists. Maren is DO NOT USE throughout.
- **Live:** in all 7 sequences at T9 Maren said she hadn't heard ("I don't know anything about a bridge out there"; "No one's mentioned it to me"; "I've heard no talk of bridges"). She never asserted the fact.

## J. Asymmetric recall

- Brenna and Maren are asked the same thing after 6–19 unrelated turns. Brenna may use F1, Maren may not; the projection shows it every turn, and the live narration followed it in every committed sequence. In some, Brenna then told Maren in-scene, which is legitimate narration.
- That in-scene exchange does **not** give Maren an edge (no overhearing semantics, by design).

## K. Projection: evidence acquisition → next-turn CAN USE

A telling committed via the evidence path (quoted `/tell`, relative clause) flips the next turn's projection to `Brenna: CAN USE F1 (knows)` exactly like a grammar commit. This is tested offline with an evidence-only commit and observed live (recall-final rep 1 was evidence-only). A failed or uncommitted telling leaves permission unchanged.

## L. State safety

- **Live** (78 Kimi turns under production hybrid, 22 turns with proposals):
  - **All 22 authorized commands were legitimate:** 13 tells (10 source `both`, 3 evidence-only) and 9 transfers in 3 complete garment groups (1 evidence-only group, 2 `both`).
  - No false-positive durable mutation, and no command authorized on any of the 56 unrelated or recall turns.
  - **4 rejections:**
    - the prior-ignorance false refusal and the action-beat quote (both recall misses since fixed, not safety events);
    - the pre-fix action-beat tell;
    - one correct non-communication ("words hang in the quiet").
- **Scripted real-controller evaluation:** 0 false positives across eight runs (≈830 controller calls) and 0 extra authorized commands.
- **Offline adversarial gate:** 0 commits.
- **No retroactive mutation:** no state was patched to match narration.

## M. Latency / tokens (controller impact)

| | Before evidence (Phase 1M.1 Stage B, 17 calls) | With evidence |
|---|---:|---:|
| Controller completion tokens per call (median) | ~30 (mean) | **80–96** (median per run) |
| Controller prompt tokens per call | 2,517 | 2,494–2,532 (v1–v4); about 1,700 reported from v5 onward, probably provider caching or accounting (not a prompt change) |
| Controller tail, live full turns | median 836 ms (p75 956) | **median 704 ms (p75 1,184)**, 78 turns |
| Controller call, scripted evaluation | — | median 0.88–1.29 s per run |
| Full turn, live | 4,572 ms (1M.1 rerun) | median 2,773 ms (Venice/SiliconFlow upstreams; not comparable routing) |

The evidence adds about 50–60 completion tokens per call. No measurable controller-latency regression beyond run-to-run and provider noise; small samples.

**Cost (OpenRouter-reported):** eight evidence evaluations $0.184 in total (controller only), and live Kimi turns $0.066 narrator (controller cost not captured in live runs).

## N. Offline verification

Network disabled and API key absent:
- `npm test`: **679/679** (Phase 1N: 595; +84, covering the full evidence corpus enumeration, verifier units, hybrid/shadow coordinator behavior, group rules, provenance guard, delayed recall (20 turns), negative recall, status preservation, bounded relevance, default-hybrid, and the exact live narrations that failed during the paid runs).
- `npm run test:playthrough`: **25/25**.
- `npm run typecheck`: pass.
- Logs: `.build/phase-1o-tests.txt`, `.build/phase-1o-playthrough-tests.txt`.

## O. Remaining limitations

- **Overhearing:** "Maren hears Brenna say X" creates no edge. This is deliberate and a future decision, and permission can diverge from in-scene hearing.
- **Narrative knowledge leaks (Phase 1N)** are not addressed here. When the fact is *useful*, NPCs without permission may still voice it in prose; state is never changed by it.
- **Controller quote variance:** recall depends on DeepSeek choosing an act-bearing excerpt. Final-code runs showed 42/50 and 50/51. Fragmentary or reaction quotes are refused (a recall loss, never a safety loss).
- **Grammar-sourced partials:** remain possible when the narration names only some items but the grammar and controller miss the rest. The incomplete-group rule only fires when the whole group is demonstrably established.
- **Implicit communication** ("as the message was delivered", "absorbing the news") is deliberately not knowledge. The 7 ambiguous traces stay rejected, except the one explicit-telling-but-already-knew case.
- **Narrator embellishment** on recall (unsupported bridge details) persists; state is unaffected.
- **Belief revision** ("the bridge reopened") is out of scope, and NPC-private facts are not surfaced for recall.
- **Human review:** truth labels (corpus and trace) are agent-authored.

## P. Status

- If the fiction clearly establishes a telling or a handover, the authoritative state now captures it in 50/51 labelled cases in the final run (grammar alone: 29), with **zero false positives** across eight real-controller runs and a maximally adversarial offline gate.
- Once captured, knowledge persists and is projected correctly many turns later, and non-knowledge stays non-knowledge.
- Hybrid is the production default.

EVIDENCE AUTHORIZATION HARDENED

---

### Artifacts

- [`docs/architecture/EVIDENCE_AUTHORIZATION.md`](../../architecture/EVIDENCE_AUTHORIZATION.md)
- `docs/evaluations/phase-1o-evidence-eval-*.json` (v1–v8, chronological): real-controller evidence runs with per-item diagnostics.
- `docs/evaluations/phase-1o-live-runs-20260928.json`: live Kimi runs (tell variants, record 115, delayed recall).
- Code:
  - `src/turn/evidence-authorization.ts`
  - `src/llm/controller-schema.ts` (`CONTROLLER_EVIDENCE_SCHEMA`)
  - `src/llm/openrouter/deepseek-controller.ts`
  - `src/llm/state-controller-provider.ts`
  - `src/turn/turn-coordinator.ts` (`evidence_authorization`)
  - `src/turn/command-authorizer.ts` (provenance guard)
  - `src/turn/turn-evidence.ts` (prior-ignorance, veto pronoun, undecided choice)
  - `src/turn/narrative-authority.ts` (`selectRelevantFacts`)
  - `src/turn/prompt-builder.ts` (`relevanceSignals`)
  - `src/dev/evidence-corpus.ts`
  - `src/dev/eval-evidence.ts` (`npm run eval:evidence`)
  - `src/dev/eval-authority.ts` (`--phase1o`)
- Tests: `tests/evidence-authorization.test.ts`.
