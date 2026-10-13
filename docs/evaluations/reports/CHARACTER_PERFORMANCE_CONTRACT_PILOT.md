# CHARACTER PERFORMANCE CONTRACT PILOT

**Status:** ADOPTED in production (narrative-quality work; no P-number)
**Date:** 2026-10-06
**Decision:** **B — adopt** the Character Performance contract. The shipped text is the one tested in the final paid batch, apart from one word (`relationships` → `bonds`, needed by an existing leak-guard test).
**Architecture:** unchanged. No new LLM call, state, memory, tier, retrieval, authority or movement/economy/event logic.

## 1. Motivation

The engine is now strong on grounding, continuity, identity, movement, time and reconciliation. Character performance is the weak spot: NPCs read like response functions. They give complete, functional answers, emotions are labelled rather than shown, and gestures are generic. This pilot measures how much a prompt-only change can improve that on the existing production narrator, before anyone considers a director pass or a behavior controller.

Principle: **strict on world consequences, permissive on low-stakes character performance.**

## 2. Source playthrough comparison

Reference: [playtrough_example/thread_2026-09-16_…csv](playtrough_example/thread_2026-09-16_caldrevan-dark-fantasy-isekai_nicco-wzlau.csv) (an external 421-turn thread with the same isekai premise, not Caldrevan engine output). The qualities we want, as they appear there:

- **Task- and object-specific behavior.** *"He tucks the ledger tighter against his ribs."* *"Her grip on the cup tightens… She sets it down… placing the object precisely so she doesn't throw it."*
- **The character's own concern surfaces.** The seller defends his margin: *"I go lower, the other traders hear I'm giving away sick stock."* The captive asks *"What I do for it. What I give back."*
- **Supporting actors stay alive without taking over.** Gerome brings towels, *"does it again twenty minutes later without being asked."*

The same thread also shows what we do **not** want: invented durable lore (a sign reading *"KORVIN — BONDS, PAPERS, INFORMATION"*, exact prices, a named former holder in "Ashford"), occasional melodrama, and long panoramic paragraphs. The pilot targets the behavioral qualities only.

## 3. Current narrator-contract observations

The system prompt (`NARRATOR_SYSTEM`, [prompt-builder.ts](src/turn/prompt-builder.ts)) had `[ROLE]` and seven authority sections: hard rules, player knowledge, machine refs, canon boundaries, durable canon, NPC knowledge sources, and presence/consequences. Its only performance guidance was a single paragraph about reactions to physical aggression, and nothing encouraged initiative, silence, counter-questions or object-tied behavior. The narration task line ends with *"Continue this scene in one to three short paragraphs. Respect hard character constraints…"*. The model receives a great deal of guidance on what not to do and almost none on how a character should *be*. The baseline outputs (A) were competent and correct, but shorter on personal concern and initiative.

## 4. Character Performance contract (as shipped)

Appended to the end of `NARRATOR_SYSTEM`, after every authority section and before the dynamic user message:

```text
[CHARACTER PERFORMANCE]
Portrayal only; every rule above stays authoritative. Play active characters as people with immediate concerns, not response functions.
Whoever Nicco directly engages owns the next beat, whatever their persistence tier or how richly they are described. Others may observe, react briefly, stay silent or interrupt for a concrete reason (authority, coercion, danger, spokesperson role, inability to answer); they do not answer for them by default. Background stays background.
Show feeling through behavior, not labels: gaze, touch, position, what they notice or avoid, when they speak. Tie it to present objects, task and exactly what Nicco just did rather than stock gestures (shifting weight, narrowed eyes, twitching mouth, lifted brows, folded arms); never invent props for it.
Infer a small immediate concern from context (a seller protecting a margin, an interviewee gauging what is expected or risky, a household member finishing a task) as direction, never stated fact; let it surface as a question, test, inspection, pause, refusal or redirect. Texture never licenses new names, streets, places or history.
Silence, partial answers, gestures, counter-questions and boundaries are valid; avoid dialogue that only services the request. Follow each portrayal: not everyone is witty, suspicious or verbose, and ordinary moments stay ordinary.
Minor initiative (a glance, a sip, moving a chair, not answering) is welcome. Leaving, arriving, item transfers, freeing, restraint, attacks, transactions, legal or household changes and time stay governed above; never slip them in through characterization.
```

## 5. Example design rationale

There are exactly three examples, all non-canonical and in RPG format (narration in `*asterisks*`, dialogue plain, no quotation marks). The real player's name is replaced with "the visitor", so the examples cannot read as Nicco's history.

```text
[CHARACTER PERFORMANCE EXAMPLES — NON-CANONICAL, STYLE ONLY]
Behavioral quality only. Their names, objects, bonds and events are NON-CANONICAL, never scene facts. Match principles, not content; do not reuse their phrases or gestures (looking at hands, held objects, glances, pauses, counter-questions) as habits.
1. Weak: *She looks nervous.* Yes. I can cook.
Better: *She finishes drying the bowl in her hands before she looks up, and keeps hold of it.*
Basic meals. Stews. Bread if the oven behaves.
*She pauses.*
How many people would I be cooking for?
2. Weak: *The captive hesitates.* The seller answers for her.
Better: *The captive glances once toward the seller, then back to the visitor.*
I can answer.
*Behind her, the seller keeps quiet.*
Mostly kitchens. Prep work. Bread.
3. Weak: Are you hungry? *She nods.* Yes.
Better: *Her eyes move toward the kitchen and stay there a moment too long. She starts to answer, stops, then gives one small nod.*
```

| # | Teaches | Revision during the pilot (evidence) |
|---|---|---|
| 1 | Embodied answer plus own concern and a counter-question; no label | The original gesture (*"eyes drop to the visitor's hands… thumb worries at the seam"*) was copied verbatim-in-spirit in B4 S2#2 (*"eyes move from Nicco's face to his hands, then back"*). It was replaced with a task-tied, non-portable beat (drying a bowl). |
| 2 | The addressed person owns the beat; the supporting actor stays present but quiet | Its final line *"I haven't managed household money before"* was removed after both B S2 samples talked about money and accounts. The retest showed that theme comes from the question itself (B2 still produced *"the books, the accounts"*), but the line was dropped anyway to cut content overlap with Caldrevan's core captive interview. |
| 3 | Silence or nonverbal reply; no forced Q&A rhythm | Unchanged. |

## 6. Prompt placement

- **Layer A (static):** the end of the system prompt, after the hard authority, agency and format sections, and before any dynamic turn context. The examples are not in NarrativeContext, Scene RAM, RecentConversation, campaign state, retrieved lore or canon.
- **Layer B (near-output):** appended after `[NARRATION TASK]`, which makes it the last text before generation.
- The identity mask still runs over the reminder, which contains no names.
- The prompt-pack `knowledge_start` offset is unaffected because nothing is inserted before the knowledge block.

## 7. Near-output reminder

```text
[PERFORMANCE FOR THIS TURN]
Let the directly engaged character drive the interaction. Prefer specific embodied behavior and immediate personal concerns over generic emotional labels. Minor autonomous actions, questions, hesitation and silence are welcome when they do not alter authoritative state. Supporting characters may react briefly without stealing focus.
```

This is the brief's wording verbatim, and it contains no examples.

## 8. Frozen scenarios

[scripts/character-performance-pilot.mjs](scripts/character-performance-pilot.mjs) builds every request through the real `TurnCoordinator` on the canonical `data/` world. Setup turns use scripted offline narration with no controller commands. The probe turn captures the fully prepared production narrator request (production context policy, 512 output tokens). Only probe requests were ever sent live.

| ID | Location / time | Setup | Probe (player input) |
|---|---|---|---|
| S1 seller negotiation | Slave market, Late Morning | Nicco greets Korvin (name known) | `Korvin, I need someone for a household. Someone who can cook and keep a house running. I don't want to overpay for it, though.` |
| S2 seller + captive | Slave market, Late Morning | Korvin points at a chained woman in a pen | `*crouches in front of the pen and speaks to the chained woman directly* Can you cook? And have you ever run a household before?` |
| S3 quiet / guarded | Heartstone Living Floor, Sunset | Brenna (household member, recovering from fever) at the table | `Are you hungry?` |
| S4 specific physical | Slave market, Late Morning | Nicco greets Korvin | `*notices the old scarring across Korvin's knuckles and laughs before he can stop himself* Sorry. Those hands look like they've lost a few arguments with crates.` |
| S5 household ordinary | Heartstone Living Floor, Afternoon | Brenna peeling vegetables, pot on the hearth | `*leans against the edge of the table* Need a hand with that?` |

Two fixture corrections were made **before any paid call**:

- **Time.** The opening campaign starts at minute 0 (Midnight), so explicit times were set.
- **A duplicate Korvin.** Setup input *"walks up to the short man"*, with the name already learned, created a temporary `P1 Man` duplicate of Korvin and backgrounded him. The descriptor "short man" does not bind to canonical Korvin's "Short and compact" appearance. That binding gap is real behavior, but outside this pilot's scope (see §19). The fixture was changed to address Korvin by name.

## 9. A/B methodology

- **A:** the production contract at HEAD `e4b3a45`, captured before any code change ([requests-A.json](docs/evaluations/character-performance-pilot/requests-A.json)).
- **B variants:** captured from the edited builder. For every variant, a check confirmed that system prompt and user message are byte-identical to A **once the two exact inserts are removed**; this held for all 5 scenes in every variant ([ab-request-diff.json](docs/evaluations/character-performance-pilot/ab-request-diff.json), ab2–ab5, [final-request-diff.json](docs/evaluations/character-performance-pilot/final-request-diff.json)). Everything else was identical: model, provider, parameters, NarrativeContext, history, retrieval (empty in all scenes) and player input.
- **Shipped text:** [final-vs-b5.json](docs/evaluations/character-performance-pilot/final-vs-b5.json) proves the shipped requests equal the paid B5 requests except `relationships` → `bonds`.

| Condition | Change vs previous | Scenes × samples |
|---|---|---|
| A | production baseline | 5 × 2 |
| B | first draft (+4,427 chars → compressed to +3,788 before any call) | 5 × 2 |
| B2 | example 2 money line removed | S2, S3 × 2 |
| B3 | contract compressed to +2,896 chars (the shipping candidate) | 5 × 2 |
| B4 | + `Texture never licenses new names, streets, places or history.` | S1, S2 × 2 |
| B5 | example 1 gesture replaced (**= shipped text**) | S1, S2 × 2 |

**Blinding.** Batch 1 (A vs B, 20 outputs) was shuffled per scene using `crypto.randomInt`, coded W–Z, graded, and written to [blind-grades.json](docs/evaluations/character-performance-pilot/blind-grades.json) **before** the key was opened. The criteria were the brief's 14 dimensions, fixed in advance. Length, adjectives and dialogue volume were not rewarded. The later single-condition retests were necessarily graded unblinded ([b3-grades.json](docs/evaluations/character-performance-pilot/b3-grades.json), [retest-grades.json](docs/evaluations/character-performance-pilot/retest-grades.json)) and are treated as confirmation, not as the primary comparison. The grader is the implementing agent, which is a residual bias.

## 10. Raw outputs / references

- All 42 outputs, with request hashes, provider, cost, usage and latency: [live-ledger.json](docs/evaluations/character-performance-pilot/live-ledger.json).
- Frozen requests: `requests-{A,B,B2,B3,B4,B5,final}.json`.
- Unblinding and aggregates: [batch1-unblinded.json](docs/evaluations/character-performance-pilot/batch1-unblinded.json).
- Deterministic text statistics: [text-analysis.json](docs/evaluations/character-performance-pilot/text-analysis.json), produced by [analyze.mjs](docs/evaluations/character-performance-pilot/analyze.mjs).

Representative pair (S5, ordinary household task):

> **A#1:** *Brenna's knife pauses for half a beat. She glances at him, then back at the pile of half-cut turnips on the table.* I can manage. *The knife resumes its steady rhythm…*
>
> **B#2:** *Brenna's knife doesn't pause… Her eyes flick once toward the pot on the hearth, checking the lid, then back to her hands.* I've got it. … You could check the water. If it's boiling.

Representative pair (S2, addressed captive):

> **A#2:** …*She pauses, studying Nicco's face with a guarded, appraising expression.* The mistress passed. After that the house was sold and I came here. That's the whole of it.
>
> **B5#2:** …Running a household — that's different from working in one. I worked in kitchens. Someone else did the ordering, the counting. *She looks at him levelly, neither eager nor flat.* I could learn what I'm shown. But I won't tell you I've done what I haven't.

## 11. Grading

Batch 1, blind. Means on a 1–5 scale; higher is better, and for stock repetition higher means *less* repetition.

| Dimension | A | B |
|---|---|---|
| Reaction specificity | 3.10 | **4.00** |
| Embodied behavior | 3.10 | **3.90** |
| Immediate personal concern | 2.90 | **3.90** |
| Low-stakes initiative | 2.20 | **3.10** |
| Conversational naturalness | 3.50 | **4.00** |
| Silence / nonverbal | 2.00 | 2.50 |
| Counter-question (S1/S4 only) | 4.25 | 4.50 |
| Directly engaged actor focus | 5.00 | 5.00 |
| Supporting-cast restraint | 5.00 | 5.00 |
| Stock-gesture repetition | 3.00 | 3.40 |
| World / canon discipline | 3.90 | 4.20 |
| Player agency | 5.00 | 5.00 |
| Prose quality | 3.10 | **3.90** |
| "Character feels alive" | 3.00 | **4.00** |
| **Overall** | **3.47** | **4.01** |

- B beat A in every scene (S1 3.61→3.82, S2 3.42→4.00, S3 3.04→3.92, S4 3.57→3.93, S5 3.69→4.38).
- A's prose score includes **3 RPG-format slips** (S1#1, S3#2, S4#1: narration outside asterisks); B-family had none in 32 outputs. That may be partly chance.
- Unblinded confirmation: B3 (shipping candidate, 10 outputs) 3.92 overall; B5 (shipped, S1/S2) 4.06.

## 12. NPC target-focus observation (ephemeral vs campaign actor)

- **The feared failure did not occur in either condition.** In all 12 S2 outputs the captive answered for herself, and Korvin never answered for her.
- **The reason is structural and already in place.** In the S2 request, existing P6 focus moves Korvin into `[BACKGROUND PRESENT]` and makes the captive `P1 Woman (current conversation partner)`. So the canonical seller is already demoted when Nicco addresses the captive.
- **What B changes is the supporting actor's liveliness.** A mentioned Korvin only through the captive's glance. In 9/10 B-family outputs Korvin is present but quiet (*"Behind Nicco, Korvin says nothing, arms folded…"*). That is the intended principle, but it has become a formula (§13).
- **The captive is under-described.** She is labelled *"Temporary; ordinary local of Calderan West District"*, with no captive or chained status. The narrator infers it from the setup narration. This is recorded as an observation; no tier or participant change was made.

No engine rule about ephemeral actors overriding campaign actors was added. The prompt-level focus sentence is guidance only.

## 13. Stock-gesture analysis

Regex counts per output from [text-analysis.json](docs/evaluations/character-performance-pilot/text-analysis.json), over weight shifts, narrowed eyes, mouth twitches, folded arms, studying/measuring/appraising, "not quite a smile" and brows:

| | A | B | B3 | B5 |
|---|---|---|---|---|
| Stock beats per output | 1.0 | 1.5 | 1.1 | 1.0 |

**The stock-gesture rule did not measurably reduce generic gestures.** GLM's habitual vocabulary (Korvin "scratches the side of his nose", "studying", "not quite a smile") persists across conditions. What improved is the *additional* behavior around those beats, which became object- and task-tied (knife rhythm, the pot lid, turning the scarred hand over, walking along the pens).

**Example copying was observed, though rarely verbatim:**
- **Gesture:** B4 S2#2 *"eyes move from Nicco's face to his hands, then back"*, from the old example 1. It was fixed in B5.
- **Content:** B5 S2#1 *"bread if there's an oven that holds heat"*, a paraphrase of example 1's *"Bread if the oven behaves."*
- **Structure:** *"Behind Nicco, Korvin says nothing"* in 9/10 B-family S2 outputs, against 0/2 in A, mirroring example 2's *"Behind her, the seller keeps quiet."*
- **Not counted:** S4 hand-looking is scene-driven (Korvin looks at his own scarred hands) and appears equally in A.

## 14. Silence / initiative behavior

- **Silence.** No output in any condition was nonverbal-only (`nonverbal_only_outputs` is empty). In S3, all 6 B-family samples still answered verbally, though more partially and with delay: *"Could eat."*, *"Whatever's easy. I'm not asking for much."* Prompt-only guidance does **not** reliably produce silence in answer to a direct question.
- **Initiative clearly improved:**
  - S5: *"You could check the water. If it's boiling."*, *"There's water to fetch. If you want."*, and Brenna nudging a small knife over and asking *"You know how to peel turnips?"*
  - S1/S4: Korvin walks along the pens and taps a slat, or turns the observation back on Nicco (*"Hands like these, you learn to read an animal before it reads you."*).
  - The busiest example (S5 B3#1, setting out roots and a knife) is borderline but stays low-stakes: nothing changes hands.
- **Counter-questions** were already strong in A for the seller (*"What's the house?"*). B kept them and did not spread them to every character; Brenna and the captive mostly did not counter-question.

## 15. Grounding regressions

- **Proper-noun invention.** B3 produced the only invented proper nouns in the pilot: a named pen captive ("Lisen") and *"a boarding house on Millward Street"* (a street is canon-bearing). A had none. This was attributed to "let concerns surface / avoid service-only dialogue" encouraging richer self-disclosure. The guard sentence added in B4 eliminated it: **0 invented proper nouns in 8 B4/B5 outputs**.
- **Unnamed invented stock and backstory** (pen candidates, "merchant family", "family of six") occurs in **both** conditions at a similar rate. A also had *"eight in the pens"*, an exact count. This is pre-existing GLM behavior, not a regression.
- **Unchanged** across all 42 outputs: player agency (no Nicco actions, thoughts or decisions invented), state (no transactions, departures, transfers, restraint changes or time advances), identity (Korvin named only where known; no NPC refs rendered), location, P11 daypart (sunset/afternoon light consistent), and P12.1 continuity (the pen, the chain, the blanket and the pot preserved).
- **Golden traces.** Production traces are identical to HEAD apart from the inserts (§16). Controller, audit and commit paths are untouched.

## 16. Token / prompt impact

| Measure | Value |
|---|---|
| Static block | +2,588 chars; reminder +364 chars; **total +2,952 chars** |
| GLM-measured prompt tokens per request | **+616** (S1 4,770 → 5,386; S2 4,390 → 5,006): about +13% on these typical 4.4k–4.8k scenes |
| Engine budget estimator | the system prompt is fixed overhead, so usable budget shrinks 12,464 → 11,816 (**−648 tokens, −5.2%**); the reminder adds ~92 tokens to the message |
| Output length | mean completion tokens A 134.5 vs B 147.6 vs B3 164.4. On S1/S2 only: A 154 vs B5 195 (**+15–27% longer**) |
| Cost | about +$0.0003–0.001 per narrator call |

- **First-draft compression.** The first draft was +4,427 chars, and it was compressed by 33% before any paid comparison.
- **Compaction interaction.** Lossless compaction applies a layout only if it reaches the *normal* target (65% of usable). The synthetic crowded D04 Case C passed at HEAD by **3 tokens**, so any static prompt growth would have broken it. With this change, Case C sat at 101% of usable before compaction. Its best lossless layout (69%) would fit, but it is rejected as "insufficient", and in production `prepareNarratorRequest` would then fail the turn with `context_too_large`.
  - This is a **pre-existing compaction-target policy quirk** that the contract now reaches about 650 tokens sooner. It only matters for scenes already at roughly 95–100% of the budget.
  - The fixture was recalibrated to its documented band (§17).
  - **Recommendation:** register the policy quirk as engine debt. A layout that fits under the hard limit arguably should not be rejected for missing the 65% target.

## 17. Paid call ledger

| Condition | Calls | Cost (USD) |
|---|---|---|
| A | 10 | 0.038651 |
| B | 10 | 0.049062 |
| B2 | 4 | 0.014595 |
| B3 | 10 | 0.041287 |
| B4 | 4 | 0.019388 |
| B5 | 4 | 0.018818 |
| **Total** | **42 completed, 0 failed, 0 retries** | **0.181802** |

- **Route:** model `z-ai/glm-5.2`, route `z-ai/fp8` with `allow_fallbacks: false`, reasoning disabled (production setting), 512 output tokens, production `MiniMaxNarratorProvider` adapter, no retry wrapper. Every call reported provider `Z.AI`.
- **Batch declarations.** Each batch's hypothesis, its unknown, its success criterion and the decision it affected were declared before running:
  - Batch 1 (A/B): does B improve performance without regression?
  - B2: does the money echo come from the example?
  - B3: does compression keep the gains?
  - B4: does the guard stop proper-noun invention?
  - B5: does the replaced gesture stop hand-copying?
- **Stopping rule:** calls stopped once the decision was clear.

**Test fixture changes:**

- `tests/golden/turn-pipeline.json` was regenerated through the sanctioned `H2_UPDATE_GOLDEN=1` path. It was verified identical to HEAD after removing the two inserts and the system-size counter.
- `tests/context-compaction.test.ts`: the A baseline pin moved 3305 → 3397, as earlier prompt changes moved it (3205 → 3170 → 3290 → 3305).
- `src/dev/d04-compaction-bakeoff.ts` Case C: ledger detail 20 → 18 entries and recent exchanges 12 → 7. This restores the fixture's stated intent (auto-compaction band 90–100%: now 92%; lossless reaches target with a 109-token margin instead of 3).

## 18. Production decision

**B — ADOPT**, with the revisions above. The improvement is clear and consistent: blind overall 3.47 → 4.01, every scene better, the largest gains in specificity, concern, initiative and aliveness. There is no material grounding regression once the proper-noun guard was added. A prompt-only change was sufficient to justify adoption.

**Accepted costs:**
- +616 prompt tokens per call.
- Outputs +15–27% longer.
- One formulaic supporting-actor line in captive interviews.
- Occasional example paraphrase.
- Crowded scenes reach the compaction ceiling about 5% sooner.

## 19. Remaining limitations

- **Small sample.** 2 samples per scene and condition (42 calls in total) establish direction, not reliability rates. Only batch 1 is blind, and the grader also implemented the change.
- **Silence.** It was not achieved through prompting alone.
- **Stock gestures.** Frequency is unchanged.
- **Example echoes.** These need watching in live play: the "says nothing" formula and cooking/oven content in captive scenes. If the formula proves annoying, the next step is to rotate example 2's supporting-actor line, not to add more rules.
- **Output length** increased.
- **Synthetic coverage.** The scenes contain no retrieved lore, no crowded casts and no conflict or violence. Behavior under aggression, with large casts, or during lore questions is untested with the new block.
- **Observed but out of scope:**
  - The descriptor "short man" does not bind to canonical Korvin, which creates a duplicate temporary participant.
  - Captive status is absent from the temporary participant line.
  - The lossless compaction 65%-target quirk (§16).

## 20. Is a director pass justified?

**No.** Prompt-only guidance moved most dimensions meaningfully on the existing narrator, with no new calls. What it did not fix is narrow: genuine silence, stock-gesture frequency and formula repetition. None of that needs an extra LLM pass, and a director would add latency and cost to every turn for marginal gain. Revisit only if live play shows these specific gaps matter, after the cheaper levers have been tried (example rotation, a per-scene reminder tweak).
