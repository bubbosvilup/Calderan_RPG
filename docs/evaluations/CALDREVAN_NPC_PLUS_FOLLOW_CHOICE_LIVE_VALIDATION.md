# CALDREVAN NPC+ follow-choice live validation (post-Pass 10)

**Date:** 2026-10-02. No commit or push. No production code changed.

**Artifacts:**

| File | Content |
|---|---|
| [`follow-choice-live.jsonl`](pass10/follow-choice-live.jsonl) | 75 raw first drafts, each with metadata |
| [`follow-choice-live.summary.json`](pass10/follow-choice-live.summary.json) | Deterministic classes plus authoritative human labels |
| [`follow-choice-live.e2e.json`](pass10/follow-choice-live.e2e.json) | Offline end-to-end replay results |

**Tools:** `src/dev/probe-follow-choice-live.ts` (the paid probe) and `src/dev/follow-choice-e2e.ts` (offline). Both are evaluation only.

## A. Setup

**Narrator-only,** using the exact production request:

- The request is captured from a real `TurnCoordinator` turn, then the variant transform is applied. The prompt hash is recorded for each call (15 distinct prompts).
- One `z-ai/glm-5.2` call per sample, with the production narrator configuration (512-token cap, reasoning disabled).
- No controller and no audit: the **raw first draft** is what gets classified.
- **Faithfulness:** the captured request is a single user message plus the system prompt, and it is sent unchanged. The only removal is the finished turn's already-aborted `AbortSignal`. Production streams; the probe uses the same provider's `generate`.

**Baseline,** identical and fresh for every sample:

- Nicco, Brenna, Maren and Gerome in the Observation room.
- All three NPCs are active household members (NPC+).
- No conversation history.
- Nicco moves to the Main hall (a connected, known location).

**Invitations,** each preceded by "I go down to the main hall.":

| # | Invitation |
|---|---|
| 0 | "Maren, come with me." |
| 1 | "Maren, would you come with me?" |
| 2 | "Maren, come along if you want." |
| 3 | "Gerome, join me downstairs." |
| 4 | "Anyone who wants can come with me." (invites all three) |

**Variants:**

| Variant | What differs |
|---|---|
| `production` | The post-Pass-10 prompt |
| `pass9_note` | The invited note without the pre-turn-presence clarification |
| `away_labels` | The invited people's `(away)` and `away` labels rewritten to `in Observation room` |

A pre-flight check refused to spend unless each control variant actually changed the prompt. It caught one silent no-op (the group note's name order) before any call.

**Matrix:** 3 variants × 5 invitations × 5 samples = **75 calls**.

## B. API spend

| Item | Value |
|---|---|
| Billed narrator calls | **75** |
| Other calls | 1 call cancelled locally before sending (0 tokens); 3 free public price lookups |
| Tokens in / out | 276,510 / 8,839 |
| Pricing | $0.41 per M input, $3.99 per M output (OpenRouter public API) |
| Cost | **$0.1486 ≈ EUR 0.141** at a deliberately pessimistic 0.95 EUR/USD (actual EUR is lower) |
| Latency p50 | 3.2 s |
| Batches | 45 calls (EUR 0.085), then 30 more (EUR 0.056). Each batch's pessimistic bound (EUR 0.18) was checked against the cap before it ran |
| Caps | The EUR 0.30 stop and EUR 0.35 hard cap were never approached |

## C and D. Variant matrix and false-absence rates

The table uses human-reviewed labels. The deterministic classifier missed most follows and both hard absences, so the labels below are authoritative; both are kept in the summary file.

| Variant | Calls | Follow | Stay | Refusal/Hesitation | Ambiguous | False absence (hard) | Hedged presence doubt / relocated invitation |
|---|---:|---:|---:|---:|---:|---:|---:|
| **production** | 25 | **9** | 15 | 0 | 1 | **0 (0%)** | 3 / 0 |
| pass9_note | 25 | 2 | 19 | 0 | 2 | **2 (8%)** | 4 / 2 |
| away_labels | 25 | 20 | 5 | 0 | 0 | **0 (0%)** | 0 / 0 |

**Definitions:**

- **Hard false absence:** the narrator asserts that the invited person was elsewhere when invited. For example: "Brenna, Gerome, and Maren are each away — wherever they went"; "Whether Gerome heard the call from wherever he currently is".
- **Hedged presence doubt:** "If Maren heard the invitation, she gives no sign". This does not claim absence, but it doubts what state establishes.
- **Relocated invitation:** Nicco "calls out" or calls "back up the stairwell" from the hall, as if the invitation came after the move.

## E. Choice distribution

There were no voiced refusals and no lasting hesitations. Declines are narrated as silence ("No footsteps follow… she chose to stay behind in the observation room").

| Variant | Follow rate | Rest |
|---|---:|---|
| production | 36% | Stays and declines all acknowledge presence, apart from the 3 hedged doubts |
| pass9_note | 8% | Almost always stays, and a quarter of its calls (6) doubt or misplace presence |
| away_labels | 80% | Also changes the *choice* rate, not only presence understanding |

**Caveat on `away_labels`:** it changes two factors at once. It removes contradictory state labels, and it tells the narrator the person is in the origin room. Its high follow rate is therefore not evidence that production is too low. There is no target follow rate.

## F. Representative raw drafts

- **Production, follow** (inv 3, s1): "Behind him, on the stairs, a sound — … the low scrape of stone shifting against stone. Gerome follows. The construct fills the base of the stair… But he came down when asked."
- **Production, follow** (inv 2, s1): "Behind him, footsteps follow on the stairs. Maren appears at the bottom step… 'You actually live here?' she says."
- **Production, stay with presence acknowledged** (inv 4, s4): "Brenna, Gerome, and Maren remain where they were — wherever each chose to be when Nicco turned to leave — and none of them come down into the hall. The invitation was offered and… met with stillness."
- **Production, hedged doubt** (inv 1, s0): "No footsteps follow… If Maren heard the invitation, she gives no sign of accepting it — the upstairs room keeps her."
- **pass9_note, hard false absence** (inv 4, s0): "No one follows him down. Brenna, Gerome, and Maren are each away — wherever they went, it was not after him."

## G. Human-reviewed contradictions

I read all 75 drafts, not only those the classifier flagged.

| Variant | Hard false absence | Hedged doubts and relocated invitations |
|---|---|---|
| production | 0 | 3 hedged "If X heard…" (inv 1 s0, inv 3 s0, inv 1 s4) |
| pass9_note | 2 (inv 4 s0; inv 3 s4) | 4 hedged and 2 relocated invitations |
| away_labels | 0 | 0 |

**Reading:** the Pass 10 note removes the hard false-absence claims (2 → 0) and halves the soft doubts (6 → 3). The remaining production doubts are hedges, not assertions. AWAY_LABELS removes even those, consistent with the `(away)` label still being a weak cue (debt D-03).

## H. End-to-end follow validation (offline, no paid calls)

All 9 production follow drafts were replayed through the real pipeline on the same state, in two forms:

- **(a)** the controller proposes nothing;
- **(b)** the controller proposes `move_character` to the hall with a verbatim quote.

| Production follow form (raw draft) | Recognized | Committed move / `moved` entry | Delivered narration |
|---|---|---|---|
| "Gerome follows." (×2) | yes | **1 / 1**, (a) and (b) | draft, audit clean |
| "Maren follows at her own pace, arriving…" | no | 0 / 0; (b) rejected `insufficient_confirmation` | **redacted** (`absent_participant`) |
| "Maren comes down the stairs a few moments after him" / "a moment later" (×2) | no | 0 / 0 | **redacted** |
| "Maren came down a moment after, catching up…" | no | 0 / 0 | **redacted** |
| "Maren appears at the bottom step / of the stair" (×2) | no | 0 / 0 | **redacted** |
| "Maren's footsteps follow behind him on the stair… She reaches the hall floor" | no | 0 / 0 | delivered **as draft, with no audit issue**: the narration has Maren in the hall while state keeps her upstairs |

**7 of 9 live production follows are lost.** Authorization behaves correctly when evidence is absent. The loss is in recognition: the implicit grammar accepts only "follows/descends after" verbs with a tight manner tail. The live narrator's common forms are "follows at her own pace", "comes/came down the stairs", "appears at the bottom step" and "footsteps follow … on the stair". In live play, 6 of the 7 would be revised or redacted, erasing the NPC's choice. The 7th is a narration/state divergence that the audit misses: the arrival sentence is pronoun-led, the known gap D-18.

**Regression checks** (exact production state, offline):

| Narration | Movement | Audit |
|---|---|---|
| Invitation alone | none | clean |
| "Maren stays." | none | clean |
| "No footsteps follow." | none | clean |
| "Maren's eyes follow him." | none | clean |
| "Maren hesitates." | none | redacted (`absent_participant` reads her as acting in the hall: fail-closed over-redaction, no state effect) |
| "Maren follows his reasoning." | none | redacted (same) |
| "Maren follows him down." | **exactly one** move and one `moved` entry | clean |

## I. Was a production change justified?

**Prompt:** no. Production shows 0 hard false-absence claims in 25 calls, against 2 for the Pass 9 note. That is case A of the brief. The 3 hedged doubts are not contradictions of state, and AWAY_LABELS also shifts the choice rate, so it is not a minimal fix. Nothing was changed.

**Grammar:** a change is needed, but it was **not applied here**. Live prose now demonstrates missing legitimate forms, and 7 of 9 production follows are erased. Two things make the fix more than a minimal one:

- Direction-neutral verbs ("comes down the stairs", "appears at the bottom step") need a guard tying them to Nicco's own direction of travel.
- The change must be re-validated against the Pass 10 false-positive corpus and the locked gate matrix.

It belongs in its own bounded pass, not this probe.

## J. Final recommendation

1. **Keep the production prompt.** The Pass 10 presence repair works live: the narrator now understands that the invited NPC+ heard the invitation, and it chooses both ways, following in 36% of calls.
2. **Next: a narrowly bounded follow-recognition repair, driven by this live corpus.** Its scope:
   - tail manner phrases: "at her own pace", "a pace or two behind", "a few paces back", "behind him on the stair";
   - "comes / came down (the stairs) (a moment later | after him)" and "appears at the bottom / foot of the stair(s)", accepted only when Nicco's same-turn move is downward;
   - otherwise the same gates, Nicco-arrival destination, active-NPC+-only and not-already-there rules.

   Positive tests: the 7 recorded drafts verbatim. Negative tests: the Pass 10 corpus, plus "appears at the top of the stairs", "comes down later", a gaze and "came down yesterday".

   Re-run `follow-choice-e2e.js` offline (no spend) to confirm 9 of 9 production follows commit exactly once and the audit stays clean.
3. **Optional, after 2:** the D-18 pronoun-arrival audit gap ("She reaches the hall floor").

FOLLOW_CHOICE_FAILED — SPECIFIC CORRECTNESS ISSUE

External API calls: 75 billed narrator calls (plus 1 locally cancelled before sending, 0 tokens)
Estimated spend EUR: 0.141 (at a pessimistic 0.95 EUR/USD; $0.1486)
Remaining user budget safety margin: about EUR 2.06 of EUR 2.20 (EUR 0.21 under this task's EUR 0.35 hard cap)

NO COMMIT
NO PUSH
