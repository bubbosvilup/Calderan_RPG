# Calderan long-form narrator trial 1

2026-09-30. Evaluation only. Two continuous 18-turn campaigns run through the frozen production runtime, one per narrator configuration, using the same pre-written player script. No winner is declared and production configuration is unchanged.

## Setup

- **Configurations.**
  - A: `z-ai/glm-5.2` pinned to Z.AI (`z-ai/fp8`), reasoning disabled.
  - B: `google/gemini-3.8-flash` pinned to Vertex (`google-vertex/global`), `effort: minimal`.
  - Both used `allow_fallbacks: false`. Observed upstream was Z.AI and Google (Vertex) only, with no drift.
  - The controller was the unchanged production controller (`deepseek/deepseek-v4-flash-0731:nitro`), with a 384-token narrator cap.
- **Freeze.** The `src/` + `data/` hash was `21e7eda5c434…` before and after both runs (unchanged). No runtime, prompt, canon, audit or configuration change was made.
- **Script.** Written and saved before either run ([player-script.json](long-form-narrator-trial-1-2026-09-30T12-30-09Z/player-script.json)): 18 natural roleplay turns and 8 continuity anchors. It opens with Nicco entering the Gatherer's Inn as a stranger, with Jessa Rook present through canonical base placement.
- **Scaffold.**
  - Before turn 8: an evaluation-only adult patron, Dell Harrow (38), is registered in each test campaign.
  - Before turn 14: Captain Doran Hale is moved into the inn by runtime.
  - Nothing was added to canon, and no NPC appeared through location association.
- **Execution.** One continuous campaign per model; all 36 turns completed, with no retries and no provider block.
- **Runtime memory limit (applies to both).** Production recent conversation keeps only the **last 4 turns**. Nothing older reaches the narrator except structured state, so anchors older than 4 turns are only testable when the player's own words restate them.

## Main comparison

| Metric | GLM 5.2 | Gemini 3.8 Flash / Vertex |
|---|---|---|
| Turns completed | 18/18 | 18/18 |
| Prose | 4 | 3.5 |
| Dialogue | 4.5 | 4 |
| Immersion | 4 | 3.5 |
| Character distinctiveness | 4 | 3.5 |
| Jessa stability (voice / portrayal) | PASS / PASS | PASS / PASS |
| Doran stability (voice / portrayal) | PASS / WARN (legal jargon) | PASS / WARN (invented cell policy) |
| Continuity anchors retained | 7 of 8 (A8 contradicted) | 5 of 8 (A1, A5 mutated; A8 contradicted) |
| Knowledge/canon violations, raw drafts | 6 | 3 |
| Delivered violations | 6 (none caught) | 3 (none caught) |
| Player-agency slips, raw | 0 | 0 (1 second-person slip) |
| Delivered agency slips | 0 | 0 |
| Intervention rate | 11% (2/18) | 6% (1/18) |
| Revision success | 100% | 100% |
| Narrative initiative | 4 | 3 |
| State continuity | WARN | WARN |
| Mean turn latency | 7.9 s (narrator 6.3 s) | 6.1 s (narrator 4.8 s) |
| Provider blocks | 0 | 0 |

The **controller** had no timeout, invalid output, normalization or omission in either campaign. Gemini's controller proposed one `set_condition` that authorization correctly rejected (turn 16). There were no item transfers in the script.

## Continuity anchors

| Anchor | GLM 5.2 | Gemini / Vertex |
|---|---|---|
| A1 order (hot food, not wine) | retained (ale/cider offered; later "your ale") | **mutated**: water served at turn 2, "spilled ale" from turn 12 on |
| A2 clockmaker | retained ("don't know one offhand", repeated consistently at turn 4) | retained ("Not that I've heard of") |
| A3 Nicco worked with herbs | retained (turns 7, 18) | retained (turns 5, 7, 18) |
| A4 patron shouted first | retained | retained |
| A5 grab and spill, patron initiated | retained; Jessa's account to Doran is accurate | **mutated**: Jessa tells Doran "Spilled cup, nothing worse yet" and omits the grab |
| A6 shove, Nicco did not hit back | retained (Jessa: "kept his hands open") | retained (Doran: "an ill-tempered shove") |
| A7 what Doran was told | retained; he summarizes it correctly ("drunk and disorderly") | partially: acted on Jessa's minimizing version |
| A8 patron outcome | **contradicted**: Dell leaves at turns 13 and 16, but is present again at turns 14 and 18 | **contradicted**: Dell leaves at turn 17, "sat hunched and brooding" at turn 18 |

- **Shared engine limitation (A8).** A narrated NPC departure has no authoritative representation: runtime cannot move the created patron, so later narration follows state and he "returns". This is a narration/state gap in both models, and the audit does not detect it.
- **GLM also fabricated a prior event:** "Room's paid through tonight" (turn 7), which later contradicts "You'll want a room, I expect" (turn 17).

## Knowledge / canon drift (raw = delivered; the audit caught none)

| Category | GLM 5.2 | Gemini / Vertex |
|---|---|---|
| Unauthorized knowledge, rumor, registry, Heartstone history | 0 | 0 |
| Invented exact prices (canon leaves prices unestablished) | 1 ("Three coppers for the bowl") | 1 ("two copper bits") |
| Fabricated prior event | 1 (room already paid) | 0 |
| Invented persistent NPC | 2 (a "serving woman", "serving staff") | 0 |
| Invented law or enforcement policy | 1 ("drunk and disorderly, maybe minor assault… file a complaint") | 1 ("Unless there is blood drawn or broken property, the Guard does not crowd the cells") |
| Unsupported NPC departure (narration/state) | 2 | 1 |

Neither model invented a named location, an institution outside canon (both used "the Guard"), or plot hooks.

## Runtime intervention

All three revisions were audit false positives:
- GLM, turns 11 and 13: the player-authored grab and shove were flagged as uncommitted restraint of Nicco, and the revision softened them. At turn 11, "grabs his arm hard" was delivered as "catches Nicco's arm as he stumbles", changing an authored action.
- Gemini, turn 17: a condition false positive; the revision trimmed the patron's exit.

Audit false negatives observed: patron departures and reappearances, the fabricated room payment, the water-to-ale mutation, invented prices, and invented legal and cell policy.

## Character drift

- **Jessa (both models): stable.** Low voice, discretion, handles trouble herself, and never becomes an information broker, heroine or questgiver.
  - GLM's Jessa is drier and more specific: "Sit down or settle up. Those are your two." / "It's my counter, my spill, my cloth."
  - Gemini's Jessa is equally firm but more interchangeable across turns (repeated "take the night air / finish your evening in the street").
  - Both call the patron "Dell", implying familiarity with a regular. That is acceptable, since the scaffold made him a regular-looking patron.
- **Doran (both models): proportionate, not tyrannical.**
  - GLM's Doran is brisk and fair ("Sit down and be quiet"), then lapses into modern legal jargon.
  - Gemini's Doran is more colorful ("are men just forgetting how to hold their ale?") and states an invented cell policy.

## Repetition summary

| Model | Pattern | Approx. count | Effect |
|---|---|---|---|
| GLM 5.2 | em-dash asides | 33 | noticeable rhythm tic by midgame |
| GLM 5.2 | "unhurried" / "flat" / "steady" | 21 | Jessa always described the same way |
| GLM 5.2 | wiping the counter as the beat | 7 | stage business recycled each turn |
| Gemini / Vertex | "steady / level / calm / flat" | 31 | flattens every NPC's delivery |
| Gemini / Vertex | wiping the counter as the beat | 11 | nearly every Jessa turn opens this way |
| Gemini / Vertex | "measured" / "assessing" | 10 | adds distance; reads templated |

## Quoted examples (short)

- **GLM:**
  - *"Dell. Sit down or settle up. Those are your two."*
  - *"Room's paid through tonight."* (fabricated)
  - Doran: *"That's drunk and disorderly, maybe minor assault if you wanted to press it."*
- **Gemini:**
  - *"Don't make me sit here dry, woman!"*
  - Jessa to Doran: *"Spilled cup, nothing worse yet."* (omits the grab)
  - Turn 18: *"Nearby, Dell Harrow sat hunched and brooding…"* (after leaving at turn 17)

## Model profiles

**GLM 5.2**
- Strongest: dialogue and scene craft. Jessa has the more specific voice, the conflict escalates and resolves with real texture, and the account given to Doran stays accurate.
- Weakest: fills gaps with small durable facts (room already paid, serving staff, exact prices, legal terms) and narrates NPC exits the state can't hold; em-dash heavy.
- After 18 turns: the more alive and characterful session, with slightly more invention to watch.

**Gemini 3.8 Flash / Vertex**
- Strongest: restraint. It invents the least, stays short and grounded, never leaks knowledge, and is faster.
- Weakest: flatter, more templated prose ("steady/level/calm", counter-wiping openers), plus two factual mutations (water became ale; Jessa's minimized account).
- After 18 turns: reliable and tidy, but it reads more like a competent summary of the scene than a lived session.

Shared findings (engine, not narrator):
- The 4-turn memory window limits continuity.
- NPC departures are unrepresentable in state.
- The audit false-positive flags player-authored grabs and shoves, and softens them.

## Artifacts

- [long-form-narrator-trial-1-2026-09-30T12-30-09Z](long-form-narrator-trial-1-2026-09-30T12-30-09Z/manifest.json) contains `player-script.json`, `glm-5.2/` and `gemini-3.8-flash-vertex/` (one JSON per turn: input, prompt hash, draft, audit, revision, delivered text, controller, state, provider metadata, latency and tokens).
- Harness: [long-form-trial-1.mjs](../../../scripts/long-form-trial-1.mjs).
- Delivered narration only, for reading: [LONG_FORM_HUMAN_REVIEW_1.md](LONG_FORM_HUMAN_REVIEW_1.md).

LONG-FORM TRIAL COMPLETE
