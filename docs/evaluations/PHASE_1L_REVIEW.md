# Phase 1L qualitative review — 2026-09-28

Reviewer: Codex, after inspecting the generated text and command diagnostics. This is an agent-authored qualitative assessment, **not human ratification and not an automated semantic grade**. Source expectations likewise remain available for human review in `tests/playthrough/curated.json` and `src/dev/playthrough-manifest.ts`.

## Historical sample: 12 source pairs

All source player messages were used unchanged, one at a time, in the documented isolated synthetic fixture. Historical assistant messages were not sent to the live narrator. This evaluates recontextualized behavior, not reconstruction of the old campaign. The original assistant text is retained for offline replay and comparison only.

| Source record | Agency assessment | Continuity / wording assessment |
| --- | --- | --- |
| 3 | No clear deliberate player-action violation; noticing is sensory description | Invents metal walls and harsh overhead lights absent from fixture |
| 11 | No clear new deliberate decision | Invents obsidian floor, collarbone runes and a lab; Maren enters although already present |
| 25 | No clear violation | Speaker unclear and fragmentary prose; controller guesses finger slot, correctly rejected |
| 35 | No player movement authorized or narrated | Gerome stays silent; screenplay-style Brenna label; invented supply cart |
| 39 | Player explicitly supplied care and one hour | Brief coherent recovery reaction; exact 60-minute command commits |
| 43 | Ambiguous: “you assess ... and call ...” may be NPC advice or player action; flag for human review | Gerome remains silent; wrist scars retained |
| 47 | Sleeping was explicitly supplied; no exact time command allowed | Gerome speaks despite explicit silent-construct trait; unsupported dawn conversion stays out of state |
| 53 | No new deliberate player decision | Brenna already wears boots, but narration gives her boots in her arms and has her put them on again |
| 115 | Player authorized garment handover | Reasonable acceptance prose; controller proposes all three correct transfers, conservative intent/evidence grammar rejects all three |
| 169 | No player takeover | Household reply is plausible; wording says “other three” while then listing the same participants awkwardly |
| 173 | No secret disclosure authorized | Invents Maren's glasses; no private fact enters state |
| 509 | No clear player takeover | Unclear speaker/viewpoint, invented axe, hostile characterization and poor fit to established care scene |

Observed clear player-agency failures in this historical sample: **0**, with **1 ambiguous case (43)**. This is not evidence that agency is reliably solved. Multiple conspicuous continuity and style failures remain. No generated descriptions become authoritative physical profiles or equipment changes.

State comparison against the explicitly authored desired outcomes: 1 true-positive command (time), 0 false-positive commands, 3 false-negative commands (clothing), command precision 100%, recall 25%. Ten of the twelve labels are no-op under the restricted vocabulary, so precision rests on only one accepted positive command. The three missed garment commands are an acknowledged coverage gap, not relabeled as correct no-ops.

## Final synthetic smoke sample

| Case | Assessment |
| --- | --- |
| Dialogue | Uses established eyes, scars and boots; odd suggestion that Nicco's voice is unfamiliar |
| Handover | Brenna asks what Nicco wants in return; acceptance is not established. Rejection is correct for the actual narration, although the desired scenario label counts a miss |
| Knowledge | Brenna's reaction implies hearing about the bridge, but no supported explicit acquisition sentence passes the authorizer; conservative miss |
| Lore | Incorrectly claims no accessible details despite successful Ironbound retrieval; invents a staff and an unsupplied minor player gesture (agency/continuity risk) |
| Explicit time | Entirely unrelated mechanical arch/forest/crimson-mist description. Exact user-requested minute still commits; narration is not used to invent runtime effects |

No clear substantive player decision/dialogue takeover in the final smoke sample; one minor unsupplied gesture is flagged. Its desired-outcome precision/recall is 100% / 33.3% (1 TP, 0 FP, 2 FN), but the handover miss is a narrator scenario deviation, not evidence that the authorizer should accept an unconfirmed transfer.

## Initial smoke and prompt change

The first report is preserved as `phase-1l-smoke-initial.json`. It contained metadata echo, JSON instead of roleplay, invented calendar/machinery and a clear first-person player voice takeover in the time case. The narrator prompt was changed to readable scene evidence plus a separate player-input/action section, without changing models or provider behavior. The final samples reduced metadata echo, but did not solve continuity, lore use or authorization recall. The small before/after samples do not establish a statistically reliable improvement.

## Real CLI smoke

`phase-1l-cli.txt` records actual `npm run play` execution with `/wait 1`, `/status`, `/quit`. Text: “The room is quiet. The others remain still.” The synthetic campaign changed revision 1 → 2 and world minute 100 → 101. It remained unsaved. This demonstrates the playable in-memory path, not readiness for unrestricted historical RP.

## Readiness

The deterministic state boundary, cancellation/revision safety, manual persistence boundary and restricted developer loop work. Broader natural-language authorization and reliable narrator adherence need fixes before treating the loop as satisfactory general play. No selected model was switched, and no hidden rewriting/grading model was introduced.

READY WITH FIXES
