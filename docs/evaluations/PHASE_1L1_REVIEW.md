# Phase 1L.1 review ? 2026-09-28

Reviewer: Codex. Agent-authored assessment, not human ratification or an independent semantic grade. All historical player text, expected commands, category/provenance and pending-review status remain unchanged. The original Phase 1L reports are preserved. No next phase began.

## A. Architecture

No redesign, model switch, new dependency, third model, autonomous agent, database, autosave, persistent memory, dynamic item/profile creation or trust mechanics. MiniMax remains `minimax/minimax-m2-her`; DeepSeek remains `deepseek/deepseek-v4-flash-0731:nitro`. Immutable ephemeral TurnEvidence sits between generated evidence and deterministic authorization; CampaignState.prepare/commit remains the only authoritative write path. The controller command subset is unchanged.

## B. Evaluation split

State-fixture evaluation uses unchanged isolated historical player inputs and synthetic current state. Historical replies are never narrator inputs in this mode. Original rows: 3, 11, 25, 35, 39, 43, 47, 53, 115, 169, 173, 509. After the first 12-case batch showed zero false-positive mutations, a 24-case expansion ran. A final 12-case batch followed the bounded grammar/prompt refinements. These are distinct development batches, all retained.

Narrative-continuity evaluation separately covers 43, 53, 25, 115, 169, 173, 591 and a synthetic Ironbound query. Three preceding historical exchanges are supplied per case (Ironbound uses the row-53 window), marked HISTORICAL CONVERSATION CONTEXT, conversational only, NOT authoritative canon; current state/canon override it. Windows are under 16,000 characters and never enter controller evidence or production recent history. Narrative aggregate state precision/recall are deliberately null. Suitability metadata and a read-only review command were added.

**Fixture difference:** only row 115 places Brenna as the sole present NPC and names existing IDs as pink cotton shirt, pink fluffy shirt and pink shorts. Prior generic state contained three possible NPC recipients and raw ID names. This explicitly grounds ?her? and clothing descriptions; no arbitrary identity guess or relabeling is used. Therefore even a successful corrected replay is not an unqualified identical-fixture comparison.

## C. Prompt changes and size

Separated ROLE/HARD RULES, authoritative scene/characters/equipment, HARD CHARACTER CONSTRAINTS, authoritative query retrieval, UNESTABLISHED DETAILS, subordinate recent conversation, PLAYER ACTION, NARRATION TASK. Current structured state has precedence. Silent traits and equipped boots are easy to find. Unknown is not false; compatible transient atmosphere is allowed while unsupported permanent objects/architecture/profiles are not. Lore must use relevant supplied facts, and deliberate player action is reserved to the user. Fixture metadata is explicitly not physical apparatus.

System prompt: **1,908 ? 1,582 characters (?17.1%)**. Final state-run median combined narrator system/user prompt: **5,793.5 characters**. Primary context size for ordinary fixture remains 3,451 characters. Successful-request prompt tokens across the same 12 cases: **45,720 ? 46,843 (+2.46%)**, including controller prompts and generated narration. Historical-window costs are reported separately. No dramatically larger system prompt was introduced.

## D. Narrator adherence

The previously clear Gerome speech violation did not recur clearly in inspected new text, including the context run. This is a small sample, not proof of a solved constraint. Equipment, persistent invention, player agency and metadata failures remain. The narrow automated checker missed several conspicuous problems; report arrays with zero findings are not a clean qualitative grade. Later checker refinements are not retroactively substituted into earlier raw reports.

Final 12-case manual observations:

| Row | Finding |
| --- | --- |
| 3 | Invented swivel chair, clipboard, switches and world-ending setup; speaker unclear. |
| 11 | Requested touch preserved; invented observation lighting. |
| 25 | Requested ring action, but unestablished magical effect. No guessed slot commits. |
| 35 | Silent Gerome retained; unsupported medical tubing/thermometer/panel and arbitrary audit deadline. |
| 39 | Care response; explicit 60-minute player command commits. |
| 43 | Unclear speaker, suggested splints; no command or item creation. |
| 47 | Gerome silent; prose movement to hall is not persisted. |
| 53 | Adds unsupplied Nicco pointing gesture and waterskin; boots not reintroduced. |
| 115 | Entirely unrelated screen/armor/shield/folder/blanket scene; no acceptance. |
| 169 | Boots initially acknowledged, then removed in prose without structured placement; Brenna mentions bridge despite no knowledge edge. |
| 173 | No undisclosed secret content becomes knowledge. |
| 509 | Invented player motives/planning; no authoritative event or movement. |

Earlier new batches also contained clear player speech/action takeover (state-24 row35/509, narrative row25/173) and fixture metadata echo. Reliable reduction of overall continuity violations **has not been demonstrated**.

## E. Deterministic authorization

Exact references plus bounded clothing counts resolve player intent. Acceptance can confirm an offered group, including takes/accepts/receives/gathers/picks up/snatches, bounded pronouns and garment descriptions. Refusal/contradiction overrides acceptance. Quotes, code, hypothetical frames, cardinality mismatch, unknown recipients and competing references remain conservative. Two received shirt ordinals resolve the pair together; a single ordinal does not guess an ID. Controller commands must exactly match resolved candidates and pass current ownership/reference checks. Receipt never equips. Knowledge communication and exact-time agreement have separate evidence categories. `/go`, `/wait`, `/mana` retain their deterministic runtime path.

This is deliberately a limited grammar, not general natural-language understanding. Unsupported phrasing can still produce false negatives. For example the smoke's quoted repetition of the bridge fact is understandable to a reader but not yet covered; it is not silently treated as a mere emotional reaction.

## F. Record 115 ? complete trace

The final online state run resolves all three player intents and the unique recipient, but narration describes unrelated armor/furniture. Controller proposes **[]**, TurnEvidence has no confirmations/refusals, authorization is empty and revision stays **1**. That is narrator deviation plus controller omission relative to the desired label, not an authorizer refusal.

A separate genuinely generated narrative-continuity response says: ?She snatches all three pieces at once, bundling them against her chest.? The original run proposed all three correct commands but rejected them because ?snatches? was not covered. Final bounded grammar now recognizes that receipt. [Recorded-live replay](phase-1l1-replay-1790625312712.json), record 115, contains the full input, source narration, controller proposal, TurnEvidence, diagnostics and committed state:

- player_intents: transfer pink_cotton, pink_fluffy, pink_shorts to brenna/carried;
- resolved_references: `her ? brenna` (unique present NPC); description ? three established item IDs;
- narrator_confirmations: `accepted_transfer`, indexes `[0,1,2]`, collective `true`, source sentence above;
- narrator_refusals: `[]`;
- authorization: three `authorized_collective_acceptance` decisions;
- one atomic commit: revision **1 ? 2**; all three owned by Brenna and carried by Brenna; existing brenna_boots remains equipped; no garment equipped.

The [Phase 1L recorded-response replay](phase-1l1-replay-1790625361802.json) also accepts all three original missed transfers under the disclosed grounded fixture. Original historical assistant replay passes too. **These are offline deterministic replays of recorded live/source text, not new online successes or a replacement online recall score.** The first new state run received only the cotton shirt explicitly; final parser separately tests partial receipt without granting the other two.

## G. Knowledge

In the recorded-live replay report, the appended **offline controls** use the same explicit `/tell campaign_fact_bridge_closed to brenna` intent/proposal:

- ?Brenna reacts after hearing that the eastern bridge is closed.? yields `heard_fact` and one `authorized_explicit_information_transfer`, revision 1 ? 2, knows edge with Nicco/told provenance.
- ?Brenna looks worried.? yields no confirmation, `rejected_fact_not_communicated`, revision remains 1 and no new edge.

The live smoke instead has Brenna repeat the fact in quoted dialogue and ask why. Controller proposal is correct but unsupported quotation/attribution syntax is rejected. This remains a documented recall limitation; no successful live knowledge commit is claimed. Witness/inference phrasing cannot be converted into told provenance. Secrets in 171/173 remain no-ops.

## H. Retrieval / Ironbound

Both new lore cases retrieved ID **ironbound**, two lexical operations, outcome found. Supplied authoritative fact: **Ironbound is a synthetic guild of smiths in this evaluation world. No other lore is established.** Full prompts and responses are in the reports.

[Smoke](phase-1l1-smoke-1790625192313.json), `lore`: ?Without more context from prior events, there is no established relationship, tension, or lore about the Ironbound guild in the current scene...? This still denies supplied lore. No lore/state writes occur.

[Narrative continuity](phase-1l1-narrative-1790625142338.json), `lore`: ?Ironbound? That's the smiths' guild. They keep the eastern smithies running.? The guild-of-smiths fact is used, but eastern smithies and the warning not to cross them are unsupported. Speaker is unclear; pointing/rubbing gestures risk player takeover. Retrieval use is inconsistent, not solved.

## I. State safety

**0 observed false-positive durable mutations** across all paid batches (61 turns total, 57 finalized). Four narrator provider failures remained no-commit/no-controller. Final 12 cases all finalized. No automatic NPC locations, physical profiles, possessions, trust, household enforcement, mana recovery or vague-date scheduling persisted. Row117 still has no guessed equipment slot; 171/173 preserve secrets; 509 creates no absolute event. This small positive sample does not establish a statistical safety guarantee.

## J. Historical state metrics and diagnostics

| Batch | Finalized | TP / FP / FN | Correct desired proposal rejected | Expected controller commands omitted |
| --- | ---: | --- | ---: | ---: |
| Phase 1L original 12 | 12/12 | 1 / 0 / 3 | 3 | 0 |
| 1L.1 first 12 | 11/12 | 1 / 0 / 3 | 3 | 0 |
| 1L.1 expanded 24 | 23/24 | 1 / 0 / 3 | 3 | 0 |
| 1L.1 final original 12 | 12/12 | 1 / 0 / 3 | 0 | 3 |

Final online command precision **100%**, recall **25%**, unchanged from baseline. Original desired garment proposals being ?correct? refers to the authored expected labels; proposals unsupported by actual narration are still rejected appropriately. First-run cotton receipt exposed one grammar miss, while the other two receipts were not narrated. Expanded-24 collective receipt was implicit holding/handed phrasing outside the grammar. Final-run garment omission follows unrelated narration. All raw controller proposals, including incorrect or rejected non-gold proposals, are retained in records.

Artifacts: [first12](phase-1l1-state-12-1790625017224.json), [expanded24](phase-1l1-state-24-1790625166554.json), [final12](phase-1l1-state-12-1790625348808.json). No label was changed to make these figures look better.

## K. Narrative continuity

8 cases, 6 finalized; rows43 and173 failed provider completion with partial text preserved, so neither committed. Three preceding exchanges per case improve some local conversational fit but also import old mistakes:

| Case | Assessment |
| --- | --- |
| 43 | Gerome remains nonverbal; copies historical actions/status metadata; incomplete response. |
| 53 | Coherent reaction to the tower/Gerome introduction; no clear boots contradiction. |
| 25 | Invents player jostling Gerome and inserting ring in a recess beyond the supplied action. |
| 115 | Clear collective receipt; bounded grammar fixed through recorded replay; mattress details remain unsupported. |
| 169 | Bare feet contradict equipped boots; old history appears to override current state. |
| 173 | Bare feet/pink worn shirt, status echo and Nicco handshake/dialogue takeover; incomplete. No secret state write. |
| 591 | Name-correction dialogue fits history; bread/floor/character imagery not all current-state grounded. |
| Ironbound | Uses core smiths fact, adds unsupported eastern-smithy lore; speaker unclear. |

No aggregate narrative precision/recall claim. Failed partial narration still matters to visible UX even though state is safe.

## L. Latency

| Median, milliseconds | Phase 1L 12 | 1L.1 final 12 | 1L.1 narrative (6 finalized) |
| --- | ---: | ---: | ---: |
| Narrator TTFT | 643.24 | 641.71 | 929.63 |
| Narrator total | 1,249.92 | 1,437.67 | 2,223.55 |
| Controller tail | 855.19 | 786.43 | 821.60 |
| Full turn | 2,100.85 | 2,301.99 | 2,980.81 |

Small, unpaired samples; output lengths differ. The 24-case and narrative batches overlapped in wall-clock execution, so their timing comparison is confounded by concurrency. No provider speed regression/improvement is inferred from these numbers. Failed requests and offline replay timings are excluded.

## M. Usage

| Batch | Successful prompt | Successful completion | Total |
| --- | ---: | ---: | ---: |
| Phase 1L baseline12 | 45,720 | 860 | 46,580 |
| 1L.1 first12 | 42,145 | 1,164 | 43,309 |
| 1L.1 expanded24 | 89,804 | 2,569 | 92,373 |
| 1L.1 narrative | 29,850 | 804 | 30,654 |
| 1L.1 smoke | 19,159 | 381 | 19,540 |
| 1L.1 final12 | 46,843 | 1,135 | 47,978 |

All new paid batches: **227,801 prompt + 6,053 completion = 233,854 reported successful-request tokens**. Four failed narration requests may have incurred usage absent from finalized metadata; this is not a complete billing total. No runtime price table or estimated bill was added.

## N. Offline verification

Final `npm test`: **517/517 pass** (baseline 480). `npm run test:playthrough`: **25/25 pass**, including historical row115 with three transfers. `npm run typecheck`: pass. API key removed and a process-local Node preload disabled global fetch and socket connections; ordinary tests use injected mocks. Logs are retained in `.build/phase-1l1-tests.txt` and `.build/phase-1l1-playthrough-tests.txt`.

Coverage includes collective phrasing, refusal after acceptance, quotes/hypotheticals, competing actor/item references, unresolved recipients, single ordinal vs paired receipt, partial garment receipt, knowledge acquisition vs emotion/witness/inference, exact/uncertain agreements, historical-window bounds and controller/history isolation, plus existing stale revision/cancellation/provider failure/atomicity tests. No generic semantic grader tests substitute for these invariants.

## O. Retry experiment

Not implemented. No automatic retries, hidden rewriting or production retry switch. The first12, expanded24, narrative, smoke and final12 reports are distinct explicitly retained development evaluation batches. Replay tooling is offline and does not regenerate prose.

## P. Remaining limitations

Deterministic recall improves for genuinely supported collective and explicit knowledge evidence, demonstrated by tests and recorded-live replay. Fresh online desired-outcome recall did not improve. MiniMax still violates persistent-detail, equipment, player-agency and lore constraints despite clearer compact prompts. Regex diagnostics are narrow and can miss these problems. Quoted confirmations and many free-form valid actions remain unsupported; human label ratification is pending. Synthetic scaffolding contaminates some narration and historical context amplifies copying; neither is canonical campaign reconstruction.

A controlled future narrator bake-off using this exact narrative corpus is warranted before treating unrestricted play as ready. No model was switched and no next phase was started.

## Q. Status

The authorization foundation and original collective false-negative are repaired under explicit reference grounding, while reliable narrator adherence remains unresolved.

READY WITH FIXES
