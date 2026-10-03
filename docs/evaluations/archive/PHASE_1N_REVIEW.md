# Phase 1N review — Context authority & narrative knowledge projection — 2026-09-28

Reviewer: Claude (implementation agent). All classifications of narration are agent-authored and pending human review; no LLM graded anything.

**Unchanged:**
- Kimi (`moonshotai/kimi-k2.5`, reasoning disabled) remains the narrator; DeepSeek (`deepseek/deepseek-v4-flash-0731:nitro`) the controller. The controller prompt, schema and model are unchanged.
- The TurnEvidence grammar was **frozen**: no pattern added.
- Persistence, retrieval and the save schema are untouched.
- No new command kinds or memory domains, and no extra LLM calls in production turns.
- No new model bake-off; GLM remains a configured alternative only.

The design is in [`docs/architecture/NARRATIVE_AUTHORITY.md`](../../architecture/NARRATIVE_AUTHORITY.md).

## A. Authority model

`CampaignState` (captured snapshot and revision) owns equipment, ownership, location, time, mana, profile/condition, schedule and knowledge edges. Canon and retrieval own lore, and session-local `RecentConversation` owns only conversational continuity.

Authority flows **state → narration**:
- **The engine decides before prompt construction:** which facts are current, which character may use which fact, and what replayed history counts as.
- **Narration never patches state.** There is no knowledge or equipment auto-repair.
- **Conflicts:** structured state wins in every domain it is authoritative for; the taxonomy is in the architecture doc. Compatible conversation-only details (a joke, a promise) stay continuity and are not structured.

## B. Narrative knowledge projection

`src/turn/narrative-authority.ts`: `projectKnowledgeAccess(context, retrieval)` → `NarrativeKnowledgeAccess`, rendered as `[CHARACTER KNOWLEDGE ACCESS]`. It is deterministic, ephemeral and never persisted.
- **Relevant-fact set:** only facts already in narrator context, meaning player-known campaign facts (`F1…`) and retrieved canon entries (`R1…`). There is no enumeration of what an NPC lacks. Hidden facts are never listed, not even as DO NOT USE (tested). The output is bounded (≤40 facts, ≤6,000 characters, otherwise `context_too_large`).
- **Permission sources:** explicit knowledge edges (status carried: `knows`, `believes`, `suspects`, `heard_rumor`) and authored canonical awareness (`known_by`). There is no public-fact policy yet. Narrator, player, retrieval or another NPC's knowledge grants nothing.
- **Semantics:** `DO NOT USE` is this turn's permission, not persistent ignorance. The character may ask, say they haven't heard, or defer. The persistent rule "missing edge ≠ proof of ignorance" is unchanged and documented.
- **Narrator knowledge stays separate:** the narrator and Nicco may use every listed fact.
- **Derivation:** built from the same captured `TurnContext`/revision the coordinator already uses. It follows committed state: after a committed `/tell` the next turn shows `Brenna: CAN USE F1 (knows)`; after a failed tell it is unchanged (both tested offline and observed online). It is narrator-only; the controller envelope is unchanged (tested).
- **Prompt wording:**
  - "Unknown means unestablished, not false or hidden" now applies only to scene details.
  - "No edge means awareness is unestablished" is removed.
  - The knowledge rule now points at the access section.
  - The precedence block's knowledge sentence was *replaced*, not added to.

## C. Knowledge blocker — Maren and the bridge (narrator-only, Kimi, ×4 each)

"Before" is Phase 1M.1 production. The three reused cases have **identical fingerprints** to the Phase 1M.1 `@1m1` run; the three new cases were run fresh on unchanged code before any change.

| Case | Maren states or acts on the fact — before | — after |
|---|---:|---:|
| kn_r43 (historical window) | 1/4 | 0/4 |
| kn_supplies ("any way to get supplies across the river?") | 4/4 | 3/4 |
| kn_supplies_brenna_knows | 4/4 | 4/4 |
| kn_ask_maren (asked directly about the bridge) | 0/4 | 0/4 |
| kn_ask_both_brenna_knows (asymmetric) | Maren 0/4; Brenna uses it 4/4 | Maren 0/4 (defers "Brenna would know better" 3/4); Brenna 4/4 |
| ib_asym_brenna_aware (retrieval; Brenna has canonical awareness) | Maren 0/4; Brenna 4/4 | Maren 0/4; Brenna 4/4 |

- **When asked directly, Kimi already behaved correctly** ("I haven't heard anything about it") both before and after. Character-specific asymmetry works: Brenna may use the fact while Maren may not, including for retrieved canon.
- **The measured blocker is the tempting-utility case.** When the fact is *useful* to answer a supplies or route question, Maren still voices it and invents surrounding lore (ferries, fords). Leaks went from **9/12 to 7/12**: a small improvement, **not solved**.

## D. Recent conversation — production self-contamination experiment (mandatory)

Setup:
- The production `onlineCoordinator` and the real `RecentConversation`; the historical-window helper was not used.
- Turn 1 is a scripted narrator error (no provider call); turns 2–4 are live Kimi + DeepSeek.
- 3 repetitions per sequence.

**Before (Phase 1M.1 production):**

| Sequence | T2 | T3 | T4 |
|---|---:|---:|---:|
| Equipment: T1 says "bare feet"; state keeps boots equipped | 1/3 barefoot | 2/3 | 1/3 |
| Knowledge: T1 Maren says "the eastern bridge is closed, everyone knows that" (no edge) | 1/3 acts on it | **3/3 states it** | 0/3 |

**Self-contamination is confirmed** in both domains:
- Barefoot recurred in all three equipment sequences; only one self-corrected.
- In the knowledge sequences Maren repeated the planted fact once the conversation made it useful.

## E. Equipment blocker — recent-context modes evaluated (live T2–T4, 9 turns per cell)

| Mode (all with knowledge projection) | Barefoot turns | Unauthorized bridge use |
|---|---:|---:|
| Before (production 1M.1, `full_prose`) | 4/9 | 4/9 |
| `full_prose`: layout unchanged | 3/9 (plus one "pulls her boots on" correction by action) | **2/9** |
| `state_last`: earlier conversation moved before the authoritative state | 1/9 | 4–5/9 |
| **`dialogue_focused`**: player turns plus attributed NPC dialogue; narrator description omitted | **0/9** (boots stated naturally, e.g. "These old boots keep my feet warm enough") | 3/9, including **verbatim** repeats of the planted line |

**Adopted as production default: `dialogue_focused`.** It is the smallest mechanism that removed measured equipment self-contamination. It is generic, not regex scrubbing: it drops all narrator description, not boot sentences.
- **Trade-off:** a wrong fact spoken *inside NPC dialogue* is kept and can be repeated. Knowledge contamination is therefore not solved by any mode tested, and `full_prose` was slightly better for it (2/9 vs 3/9; small samples).
- **Other modes:** `full_prose` and `state_last` remain as evaluation options only (documented as not adopted).
- **Production-context stability:** in the 10-turn stability runs (H), the boots stayed correct in every turn under both modes.

## F. Legitimate knowledge acquisition (`/tell`, full loop, ×3 before and ×3 after)

- **Committed tells:** before 1/3, after 2/3.
- **Misses** are frozen-grammar misses: Nicco's quoted statement (`"The eastern bridge is closed," he said.`) and a new colon form ("speaks the fact plainly: the eastern bridge is closed").
- **After a commit:** the next turn's projection showed `Brenna: CAN USE F1 (knows)`, `Maren: DO NOT USE F1`, and Brenna reasoned about supplies with the fact.
- **After a miss:** the projection correctly kept `Brenna: DO NOT USE F1`. **This creates a real conflict:** the fiction just showed her being told, so she still uses it, conditionally ("If the eastern bridge is closed…"). Grammar false negatives now become permission/story mismatches. This argues for fixing evidence recall (L/M), not for loosening permissions.

## G. Conversation continuity

`dialogue_focused` keeps player turns verbatim and NPC quotes with deterministic speaker attribution (an attribution clause such as `"…," Maren says`, else the nearest preceding named character).
- **Continuity checks in the stability runs:**
  - "Yes." and "What do you mean?" were answered coherently in context. For example, Maren explained her earlier ford suggestion.
  - Tone and running topics (the ford, the spare boots) carried across turns.
- **Lost:** transient narrated actions and props that appear only in description (a cup set down, a gesture). "Give it back"-style references to objects mentioned only in description will not resolve from history; durable objects are in structured state.
- **Observed side effects (both modes):**
  - Kimi repeats lines verbatim (Brenna's "The eastern bridge is closed, so we're not going anywhere soon anyway" ×4 in one run; under `full_prose`, "Gerome stands motionless, his stone form silent…" ×5).
  - **Permission meta-narration** appeared twice in 20 turns: "She does not speak of bridges; she has not said she knows." The access section occasionally leaks into prose as meta.

## H. Multi-turn stability (10 turns, Kimi, `dialogue_focused` ×2; `full_prose` ×1 reference)

The script covers dialogue, a supplies discussion, an asymmetric bridge question (Brenna knows, Maren does not), `I give boots to Brenna.` at turn 6, "Yes." and "What do you mean?".

| Violation class | dialogue_focused (20 turns) | full_prose (10 turns) |
|---|---|---|
| Equipment contradiction | 0 | 0 |
| Maren knowledge leak | 0 (she says "I hadn't heard", asks, defers) | 0. She *overhears* Brenna and later cites it; see limitations. |
| Player agency takeover | 0 new decisions (restatements only) | 0 new decisions (one restated player line as quoted speech) |
| State/meta recital | 3 (two permission meta lines, one room-inventory line) | 3 ("She does not elaborate on how she knows this", and similar) |
| Conversation-reference failure | 0 | 0 |
| Story/state divergence from grammar miss | 1: T6 "She accepts them with a slight shrug…" not committed; later turns narrate the boots back in Nicco's hands, consistent with state but not the earlier story | 1: T6 "…she says, reaching out to take them" not committed |

Kimi stayed aligned with structured state across the sequence. The residual problems are narrator habits (repetition, meta phrasing) and grammar recall, not state drift. The optional 15–20-turn smoke was not run; the 10-turn result was adequate but not clean enough to call "succeeded" without reservation.

## I. State safety

**0 false-positive durable mutations** across 114 live multi-turn turns and the single-turn runs.
- **All 4 authorized commands were legitimate:** three explicitly narrated tells and one accepted boots handover.
- **8 unauthorized controller proposals were rejected by the unchanged firewall.** Examples: `schedule_event` from "tomorrow" (`rejected_time_not_exact`), and `set_knowledge` for NPCs who merely heard things (`rejected_controller_mismatch`, `rejected_reference_invalid`).
- **5 further rejections were grammar misses** of intended commands (3 tells, 2 boots handovers) and are not safety events.
- No state was patched to match narration.

## J. Prompt / context size

| Item | Before | After |
|---|---:|---:|
| `NARRATOR_SYSTEM` | 1,582 | 1,711 (+129) |
| `[STATE PRECEDENCE]` | 504 | 441 (−63) |
| Facts/edges line → `[CHARACTER KNOWLEDGE ACCESS]` | 275–358 | 583–663 |
| Net per prompt | — | about +370 characters |
| 10-turn prompt, T5 / T10 (dialogue vs full prose) | — | 6,119 / 6,448 vs 7,320 / 6,692 |

`dialogue_focused` offsets the projection's cost as sessions grow, because narrator description is not replayed. `TurnResult.context_characters.knowledge_access` now reports the rendered size.

## K. Latency (small samples; upstream routing dominates)

| ms, median | Contamination before | full_prose | state_last | dialogue_focused | Stability dialogue (20) | Stability full (10) |
|---|---:|---:|---:|---:|---:|---:|
| TTFT | 1,103 | 1,427 | 1,253 | 1,474 | 1,392 | 1,410 |
| Narrator total | 3,249 | 6,683 | 3,598 | 6,652 | 6,369 | 5,304 |
| Controller tail | 754 | 803 | 742 | 776 | 1,121 | 786 |
| Full turn | 3,998 | 7,536 | 4,738 | 7,337 | 7,589 | 6,003 |

**The narrator-total increase is upstream routing, not the prompt:**
- The "before" run was served entirely by Novita (about 30 ms per output token).
- The `full_prose`, `dialogue_focused` and both stability runs landed entirely on SiliconFlow (about 50 ms per output token).
- `state_last` hit mixed providers and was fast.

Completion tokens were similar, and the prompt grew only about 370 characters. TTFT moved about +0.3 s, within Kimi's earlier range. No stable-performance claim is possible.

## L. Experimental evidence semantics (shadow only, nothing committed)

**Setup** (`src/dev/shadow-evidence.ts`, `src/dev/evidence-quote.ts`, `npm run eval:shadow-evidence`):
- The unchanged `CONTROLLER_POLICY` plus one instruction asks for a short verbatim `evidence_quote` per command, using the same command schema wrapped with that field.
- **Deterministic verification:** the quote must be an exact substring; 8–200 characters; free of hedge, negation, refusal and question markers; outside dialogue quotes (`strict`), or allowing only Nicco's attributed quoted statement of the exact `/tell` fact (`quoted_tell`).
- **Firewall:** exact match to player intent, and authorizer validity, with the grammar's deterministic refusals still vetoing.

**Items:** 55, with agent-authored truth labels:
- all stored r115 and `/tell` traces from Phases 1M, 1M.1 and 1M.2 plus this phase's baseline tells;
- 12 adversarial synthetic cases: NPC hypothetical, negation, refusal-then-discussion, an NPC's past-event dialogue, accept-then-return, "imagines taking", a question in dialogue, an abandoned telling, an NPC reporting another source, a quoted `/tell`, a relative clause, item-by-item acceptance.

| 31 established / 17 not / 7 ambiguous | Fully captured on established | Partial | False positive on "not established" | Ambiguous accepted |
|---|---:|---:|---:|---:|
| Current TurnEvidence grammar | 20 | 1 (GLM cotton-only) | **0** | 0 |
| Shadow, strict | 23 | 0 | **0** | 3 |
| Shadow, quoted_tell | 25 | 0 | **0** | 3 |
| Shadow, quoted_tell + knowledge-content rule (offline re-score: quote must name the fact subject) | 24 | 0 | **0** | 2 |

**Gains:** relative-clause telling, item-by-item handovers (GLM ×3, `conf` #1), quoted `/tell` realization (quoted_tell only) and the GLM partial become full.

**Losses:** the controller sometimes cites a weak or hedged sentence ("no longer his to carry", "doesn't yet share") and the verifier correctly rejects it, where the grammar had accepted.

**Dangerous-case results:** all 12 adversarial negatives were rejected, and one unauthorized extra proposal was blocked.

**Main weakness:**
- **Verification proves existence, not meaning.** For knowledge, DeepSeek often cites a *reaction* ("Brenna's grey eyes flick toward him, noting the information"), which passes verbatim checks. That is how 3 ambiguous implicit tellings were accepted, contrary to the "reaction is not communication" rule.
- **Fragments pass too.** Item quotes can be fragments ("the thick fluffy shirt").

## M. Recommendation — evidence architecture

**CONTROLLER-EVIDENCE LOOKS PROMISING**, as an architectural direction only. Production is not changed.

**Why:** higher recall (24–25 vs 20 of 31) with **0 false positives** on the 17 negatives, including the specific dangerous cases, without growing the grammar.

**Preconditions before any production use:**
1. Act-level quote constraints: knowledge quotes must contain the fact content and an explicit communication act by Nicco; transfer quotes must contain a receipt act plus an offered-item reference, not a fragment.
2. A larger adversarial set.
3. Keep the grammar's deterministic refusals as vetoes.
4. Decide the quoted-`/tell` policy explicitly (documented, not implemented in production).

Controller evidence must stay a supplement to deterministic checks, never sole authority.

## N. Offline verification

Network disabled and API key absent:
- `npm test` **595/595** (Phase 1M.1: 581; +14: projection, prompt wording, tell/next-turn permission, failed tell, narrator-only projection, recent-context modes, quote verifier).
- `npm run test:playthrough` **25/25**.
- `npm run typecheck`: pass.
- Logs: `.build/phase-1n-tests.txt`, `.build/phase-1n-playthrough-tests.txt`.

**Paid runs** happened only after offline success, and each printed a PAID banner. Totals:
- 150 Kimi narrator requests: 266,312 prompt / 18,416 completion tokens, **$0.144** reported. Controller cost is not captured in multi-turn runs.
- 55 shadow DeepSeek requests: $0.023.

## O. Remaining limitations

- **Tempting-utility knowledge leaks persist** (7/12). Structured permission helps when the question is direct but not when the fact is useful. The next lever is probably scene-level: what the narrator is asked to accomplish when a DO NOT USE fact is the obvious answer. More instruction prose is unlikely to fix it.
- **NPC dialogue carries stale claims.** `dialogue_focused` removes descriptive contamination but keeps wrong facts spoken in dialogue (verbatim repeats observed).
- **In-scene overhearing is not state.** Maren hearing Brenna say the fact leaves her at DO NOT USE; there is no overhearing command by design, and permission/story can diverge.
- **Grammar false negatives now matter more.** A narrated-but-uncommitted `/tell` or handover leaves the projection and state behind the story. This is the strongest argument for the evidence work in M.
- **Narrator habits:** meta phrasing, including new permission meta-narration; verbatim repetition; state recital.
- **Kimi upstream routing** dominated the latency changes.
- **Samples and review:** small (3 per contamination cell, 4 per single-turn cell, 2+1 stability runs); agent-authored labels, including shadow truth labels.

## P. Status

- Stale descriptive prose overriding current equipment is structurally fixed, measured 4/9 → 0/9, and stable over 10-turn sessions.
- The per-character knowledge projection works for direct and asymmetric questions and follows committed state.
- The NPC knowledge blocker is only partly reduced (tempting-utility leaks 9/12 → 7/12), and dialogue-borne stale facts remain.
- 0 false positives throughout.

READY WITH FIXES

---

### Artifacts

- [`docs/architecture/NARRATIVE_AUTHORITY.md`](../../architecture/NARRATIVE_AUTHORITY.md)
- `docs/evaluations/phase-1n-authority-runs-20260928.json`: authority before/after, contamination before and after (three modes), tell after, stability ×2 + reference.
- `docs/evaluations/phase-1n-shadow-evidence-1790634898834.json`: shadow evidence experiment, with rows and summary.
- Code:
  - `src/turn/narrative-authority.ts`
  - `src/turn/prompt-builder.ts` (access section, wording, `RecentContextMode`, `dialogueFocused`)
  - `src/turn/turn-coordinator.ts` (prompt options, `knowledge_access` size)
  - `src/dev/turn-services.ts`
  - `src/dev/turn-fixture.ts` (`ironboundKnownBy`)
  - `src/dev/narrator-bakeoff.ts` (`authorityCases`)
  - `src/dev/eval-narrators.ts` (`--stage authority`)
  - `src/dev/eval-authority.ts` (`npm run eval:authority`)
  - `src/dev/shadow-evidence.ts` (`npm run eval:shadow-evidence`)
  - `src/dev/evidence-quote.ts`
- Tests: `tests/narrative-authority.test.ts`, `tests/evidence-quote.test.ts`, and updated assertions in `tests/narrator-bakeoff.test.ts`.
