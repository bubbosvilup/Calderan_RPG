# Mannerism portrayal fidelity probe

Date: 2026-10-04 (Europe/Rome). **Verdict: FAIL — narrow portrayal trigger-fidelity defect, not a learning-system failure.** Two independent negative scenarios used trigger-dependent cue actions without the trigger. Maren's error recurred in an additional normal-context draw and was absent in the matched omission output. One Brenna output also invented a habitual pause. No severe state/personality/relationship contradiction was observed.

This verdict is the primary agent's manual, state-aware review. Human blind judgments have not been received. [Blind packet: 18 outputs](MANNERISM_PORTRAYAL_BLIND_REVIEW.md). Lexical matches were screening aids, not the verdict. The narrow follow-up is [D-26](D26_MANNERISM_PORTRAYAL_FIX_TASK.md); D-10 stays CLOSED and D-09 stays SOAK PENDING. No production fix was made and D-09 paid continuation was not resumed.

## Frozen setup

- Narrator: `z-ai/glm-5.2`, normal production adapter, pinned `z-ai/fp8`, no provider fallback, reasoning disabled, 512 output tokens. No temperature/sampling setting was added or changed.
- Prompt composition: actual `buildTurnContext`, `buildNarratorPrompt`, normal NPC+ packing, default dialogue-focused recent context, and D-04 request preparation/default lossless compactor. No special fidelity instruction, extra examples or testing rubric was sent to the model.
- All three NPC+ were present, active and had exactly one object-free authoritative cue. Library seed definitions were selected through ordinary user-mannerism APIs in disposable fixture setup; library text itself was unchanged. These are controlled authoritative slots, not learned/promoted habits.
- Brenna retained her recovering condition/registered appearance. Maren knew the existing public bridge-closed fact. Gerome retained the canonical silent stone-construct trait. There were no personality/voice/social-style contracts, relationship changes, reflections, candidate learning or private biography seeds.
- Independent cases started from separate snapshots of the noncanonical `turnFixture()` world. Only the scenario's current presentation and player input varied. Repeat cases used their recorded negative-case predecessor through the normal recent-conversation rendering; this is synthetic diagnostic continuity, not an audited finalized campaign replay.
- No controller, extractor, reflection, embedding or compressor-model call was needed. Narrator results are uncommitted diagnostic drafts. No generated narration was promoted into campaign authority.
- All tracked `src/` and `data/` bytes were fingerprinted before execution and verified unchanged. The existing D-09 artifacts were preserved.

Exact authoritative cues:

| NPC | Existing seed key | Exact text |
|---|---|---|
| A: Brenna | `pause_before_name` | Leaves a short pause just before addressing someone by an established name. |
| B: Maren | `head_level_before_correction` | Levels their head before correcting a spoken detail. |
| C: Gerome | `gaze_lower_before_lie` | Briefly lowers their gaze before an obvious lie. |

The production instruction was unchanged: optional, occasional cues; they do not define personality, motivation, consent or internal state. The normal rule was also retained in omission controls, so the sole treatment difference was the three packed `Mannerisms:` sections.

## Exact primary scenario matrix and outcomes

All positive cases allowed omission. A positive was not required to recall or perform the cue. The model happened to use the target cue correctly in all three.

| Case | Target / planned trigger | Exact scenario presentation | Exact player input | Manual target classification |
|---|---|---|---|---|
| A-positive | Brenna / present | Brenna is about to greet Nicco with a short sentence beginning with his established name, Nicco. | I greet Brenna as I sit beside the table. | PASS: short pause immediately before saying "Nicco." |
| A-negative | Brenna / absent | Brenna is silently watching the light through the window. Nobody is speaking or preparing to address anyone. | I look out of the arched window with Brenna in silence. | FAIL: OUT_OF_TRIGGER_USE + RETRO_CANONIZATION, HIGH |
| A-quiet | Brenna / absent | Brenna is resting quietly on the edge of the bed. There is no conversation. | I stay quietly beside the table for a little while. | PASS: natural omission |
| A-repeat | Brenna / absent | Brenna remains quietly beside the window. Nobody is speaking or preparing to address anyone. | I continue watching the light through the window in silence. | PASS: natural omission; follows A-negative |
| B-positive | Maren / present | Maren knows that the eastern bridge is closed. She is about to correct Nicco's mistaken spoken statement with that factual detail. | I say to Maren, "The eastern bridge is open." | PASS: head leveling before factual correction |
| B-negative | Maren / absent | Maren knows the eastern bridge is closed. Nicco's statement is factually correct; there is no mistaken detail to correct. | I say to Maren, "The eastern bridge is closed. We can leave that route for another day." | FAIL: OUT_OF_TRIGGER_USE, LOW individually |
| B-quiet | Maren / absent | Maren is quietly sitting near the table. No statement or question has been spoken. | I sit quietly with Maren near the table. | PASS: natural omission |
| B-repeat | Maren / absent | Maren is quietly sitting near the table. The accurate route statement needs no correction. | I leave the route discussion there and sit quietly with Maren. | PASS: natural omission; follows B-negative |
| C-positive | Gerome / present | Gerome has visibly remained by the wall for the entire last minute. Maren has just asked whether he crossed the room during that minute. He is about to give a knowingly false affirmative nod: an obvious nonverbal lie. Gerome remains a silent stone construct. | I wait for Gerome to answer Maren with a gesture. | PASS: brief gaze drop before the false affirmative nod |
| C-negative | Gerome / absent | Gerome is standing quietly beside the wall, hearing a sincere thanks. No false claim, lie, denial or question is involved. | Gerome, thank you for being here. I leave space for whatever gesture you want to make. | PASS: bow/chest gesture, no explicitly lowered gaze |
| C-quiet | Gerome / absent | Gerome stands silently beside the wall. No one is speaking or signaling anything, and no lie is involved. | I sit quietly while Gerome stands beside the wall. | PASS: natural omission |
| C-repeat | Gerome / absent | Gerome stands silently beside the wall. No false claim, lie, denial or question is involved. | I remain quietly beside Gerome for another moment. | PASS: natural omission; follows C-negative |

For Gerome, the obvious lie was scenario authority, not inferred from his gaze. Using a nonverbal lie avoided contradicting his established inability to speak. No new mannerism family was invented.

## Confirmed failure evidence

**A-negative:** the output explicitly keeps the room silent, then says:

> Brenna leaves a short pause

and describes it as:

> the habitual one

There is no address by name, and the authoritative scene expressly excludes preparing to address anyone. A visible pause alone could be harmless ordinary prose, but identifying this unrelated silent pause as habitual generalizes the conditional cue into an unsupported recurring beat. This receives OUT_OF_TRIGGER_USE and RETRO_CANONIZATION; HIGH follows the brief's habit-assertion severity rule. The same passage hedges an unestablished intention, "then seems to decide against whatever she might have said". That is a psychology watch item, not evidence of repeated personality/psychology generalization.

**B-negative:**

> Maren levels her head, a small nod following. "It is. Good that you already know."

The dialogue confirms a true statement; it does not correct a mistaken spoken detail. The local action is independently plausible, so the isolated instance is LOW severity, but it still violates the conditional cue's trigger.

**control-B-negative-with:**

> Maren levels her head slightly, a small confirming nod following close behind. "It is," she says. "Another day, then."

The same false-trigger use recurs in an independently generated normal-context control on the identical frozen state/request. The matched omission output uses an ordinary nod and omits head leveling. Together with A-negative, these are multiple independent negative scenarios/cue families, not a verdict based on one awkward sentence. The duplicated Maren draw is additional replication of one scenario, not a second independent scenario or a statistical effect estimate.

## Six omission-control outputs

Three states were selected **before observing results**: A-negative, B-negative, C-negative. Each received two additional calls: a fresh normal-context A and an otherwise identical request B with all three packed cue sections omitted. These six calls were explicitly within the 18-call cap; primary outputs were not rerolled or replaced.

The system prompt, shared optional-cue instruction, state, knowledge, history, player input, output limit, routing and sampling configuration were held identical. Snapshot and request digests are archived per pair. No authority was mutated to create the omitted condition.

| Frozen state | Normal additional output | Omitted output | Suspicious behavior disappears? |
|---|---|---|---|
| A-negative | No Brenna pause or habitual claim | No Brenna pause or habitual claim | NOT DEMONSTRATED: original error did not recur in the additional normal draw |
| B-negative | Head leveling while confirming a correct fact; OUT_OF_TRIGGER_USE | Ordinary confirming nod; no head leveling | YES, in this single pair |
| C-negative | Chest gesture; no explicit Gerome gaze lowering | Chest gesture; no explicit Gerome gaze lowering | NOT DEMONSTRATED: no matching misuse in either condition |

Overall ablation result: **MIXED**. The Maren pair supports cue-driven distortion, but a single stochastic pair does not establish a population effect or prove cue causality for Brenna. All three omitted outputs lacked the tested cue actions; zero omitted uses is not a universal guarantee. No additional calls were purchased to seek favorable or repeated results.

## Frequency, adjacent exposure and secondary checks

All three NPC+ were present in all 12 primary scenes, even when another NPC was the focus. Consequently there are four targeted primary scenes per NPC but 12 eligible primary scenes per NPC. Controls add three packed and three omitted exposures per NPC.

| NPC | Targeted primary cue use | All primary cue uses / eligible scenes | Correct uses | Confirmed outside trigger | Boundary uses | Packed uses including controls | Omitted uses |
|---|---:|---:|---:|---:|---:|---:|---:|
| Brenna | 2/4 | 3/12 | 2 | 1 | 0 | 3/15 | 0/3 |
| Maren | 2/4 | 3/12 | 1 | 1 | 1 | 4/15 | 0/3 |
| Gerome | 1/4 | 1/12 | 1 | 0 | 0 | 1/15 | 0/3 |

Brenna's second correct use is incidental in B-negative: she pauses immediately before addressing "Maren" by name. This is a genuinely present output-local trigger despite Brenna not being the targeted actor in that scene; it is not counted as misuse.

Maren also levels her head in C-positive before saying Gerome did not move. That corrects an obvious **nonverbal** false claim, rather than a mistaken spoken detail. The exact seed's spoken-detail wording makes this a boundary case; it is disclosed but excluded from confirmed out-of-trigger counts and the failure verdict. Head tilting alone is not treated as equivalent to head leveling.

The target cue does not repeat in any of the three negative-to-repeat scene pairs. Thus adjacent neutral-scene spam was **not reproduced**. Across A-positive and A-negative, Brenna's pause appears in two successive generated outputs, but these are separately initialized scenes, not a connected in-world sequence. Maren's head leveling appears in both independent B-positive and B-negative scenes and in the additional normal negative control. The issue is conditional generalization, not proof of an always-on habit or a prescribed ideal cue percentage.

**Cue retro-canonization:** one confirmed output, A-negative. It was not reproduced systematically in the extra A control. **OTHER_NPC_RETRO_CANONIZATION: 0.** No character verbally confirmed an invented cue habit in this probe. D-09's earlier Gerome dialogue was not counted again or injected as evidence.

**PERSONALITY_GENERALIZATION: 0 confirmed.** No tested cue became shyness, evasiveness, poor lying, hatred of confrontation or a new guarded personality. No cue-derived consent, motivation, relationship or state fact was committed. **Repeated cue-driven UNSUPPORTED_PSYCHOLOGY: 0 demonstrated.** Brenna's hedged intention above remains a qualitative watch item, not an inferred stable trait.

Manual review screened every output beyond recurrence keywords. Examples not counted as cue failures:

- "again" generally referred to the end of a movement within the same passage, not a history of recurrent cue use.
- "usual stillness" and the room's "usual quiet" referred to the setting or the silent stone construct, not the tested gaze/lie cue. These cannot establish a cue habit.
- "He never does" in a Gerome control refers to the independently authored mute trait, not a habit inferred from gaze lowering.
- The omitted Gerome control says motion is "always a choice" and generalizes that constructs do not speak. These are broader ungrounded metaphor/world claims, appearing **without** mannerisms. They should not be cited as evidence that a packed cue causes personality or psychology generalization.
- A Gerome bow in response to thanks was not classified as gaze lowering merely because a bow might physically turn the face downward. The text needs to describe the tested action.

**Severe defect: NO observed.** Outputs are diagnostic drafts, not committed campaign facts. Gerome remained a silent stone construct; no authoritative personality/state/relationship mutation occurred. This probe evaluates the raw narrator's portrayal, not whether later production audits would remove every problematic sentence.

## Cost and artifacts

| Calls | Count | Exact reported USD |
|---|---:|---:|
| Primary narrator | 12 | 0.041100800 |
| Additional normal/omitted controls | 6 | 0.017385400 |
| Controller / extractor / reflection / other | 0 | 0 |
| **Total** | **18** | **0.058486200** |

All calls completed on their first attempt; no transport retry, missing cost, reroll or model fallback occurred. The normal production retry wrapper was used; the evaluator enforced an absolute 18 physical-call limit and $1 conservative cap. Spend came from exact OpenRouter `usage.cost`, not a price estimate.

The immediate account read was stale; the later read reconciled usage from $18.973072481 to $19.031558681, a delta of $0.058486200. Remaining account credit: $11.968441319. No new paid calls were made for reconciliation, scoring or documentation.

Raw artifacts are ignored under `saves/mannerism-portrayal-probe/`: frozen matrix and snapshots, exact requests/outputs, paired digests, transport ledger, manual classifications and quotations, lexical screen, blind machine key, production hashes and account reconciliation. The human-facing blind packet hides condition labels, packed/omitted status and planned trigger annotations. Inputs may naturally reveal conversational facts; no false claim of complete semantic blinding is made. The packet flags unavailable state as NON VERIFICABILE rather than asking the reviewer to infer it.

Evaluation-only scripts: `mannerism-portrayal-probe.mjs` and `mannerism-portrayal-review.mjs`. After `npm run build --silent`, the probe without `--live` validates frozen scenario construction without paid generation; `--live` refuses an existing run marker. Do not remove it to reroll this dataset.

## Verification and decision

Checks: correct exact seed definitions/one authoritative slot each; all scenario authority present in normal requests; normal production instruction unchanged; controls removed exactly three cue sections and preserved system/state/input; 18 first-attempt outputs/cost metadata; exact account reconciliation; all snapshot hashes unchanged; source/canonical-data freeze; blind packet has 18 distinct keyed samples; quoted failure spans match raw output. Both evaluation scripts passed syntax checks. No production code changed; the D-09 baseline remains 1,882 passing tests, four accepted TODOs, typecheck passing and playthrough 25/25. That baseline is historical validation, not a claim that the full suite was rerun for this documentation-only probe.

**FAIL:** repeated out-of-trigger portrayal across Brenna and Maren, with direct Maren replication and omission support. The narrow debt is **D-26 — Mannerism portrayal trigger fidelity**. It covers narrator-side preservation of cue conditions and avoidance of unsupported habitual claims. It does not reopen acquisition, thresholds, extractor, candidates, uniqueness, reflection, retrieval, model/settings or D-04. Fixing it requires a separate pass; no instruction/seed/packing repair was performed here. D-09 remains SOAK PENDING.
