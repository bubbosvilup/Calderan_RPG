# Phase 1M.1 review — Kimi adoption & TurnEvidence grammar hardening — 2026-09-28

Reviewer: Claude (implementation agent). All qualitative classifications are agent-authored and pending human review; no LLM graded anything.

Scope:
- No architecture redesign, new model, command kind or campaign domain.
- DeepSeek `deepseek/deepseek-v4-flash-0731:nitro` and `CONTROLLER_POLICY` are unchanged.
- Persistence, retrieval, the coordinator and the save schema are untouched.
- No narrator retry was added.
- Phase 1M artifacts are preserved; everything here is additive.

## A. Default narrator migration

- **`src/llm/openrouter/minimax-narrator.ts`**
  - `DEFAULT_NARRATOR_MODEL` changed from `minimax/minimax-m2-her` to **`moonshotai/kimi-k2.5`**.
  - The new `MINIMAX_NARRATOR_MODEL` constant keeps MiniMax available.
  - The adapter is unchanged apart from the reasoning default below. It is generic OpenRouter streaming; the class keeps its historical name and has a comment saying it is not MiniMax-specific.
- **Selection is unchanged:** `selectedModels()` still reads `OPENROUTER_NARRATOR_MODEL` first, so an explicitly configured model is never overridden (tested with MiniMax). Qwen and MiniMax remain usable via configuration and evaluation aliases. Neither is an automatic fallback.
- **Verified in the real dev CLI:** `npm run play` printed `{"narrator":"moonshotai/kimi-k2.5","controller":"deepseek/deepseek-v4-flash-0731:nitro"}`.

## B. Reasoning

- **Adapter default:** every narrator request now sends `reasoning: {enabled: false}` unless a caller explicitly passes `disable_reasoning: false`, which only evaluation does.
- **Production path:** `narratorConfig()` in `turn-services.ts` sets `disable_reasoning: true` explicitly.
- **Why it's always sent:** models without reasoning ignore the field, since the narrator does not set `require_parameters`. Production therefore no longer depends on any provider default.
- **Offline tests** assert that the default request carries:
  - model `moonshotai/kimi-k2.5`;
  - `max_tokens` 384;
  - `reasoning` `{enabled:false}`;
  - `stream` true.
- **Controller request unchanged:** DeepSeek model, `CONTROLLER_POLICY`, and `reasoning {exclude:true, enabled:false}`.
- **Streaming unchanged:** event order is `turn_started → narration_delta → narration_completed → controller_started → state_proposed → state_committed → turn_completed`.
- **Online evidence:** all 75 captured paid Kimi evaluation requests finished with `finish_reason: stop`, and all 4 CLI smoke turns completed, with no truncation and no empty content.

## C. TurnEvidence grammar

`src/turn/turn-evidence.ts` grew from 114 to 184 lines. It is still a set of bounded templates over same-turn, already-resolved player intent; there is no general parser and no pronoun resolution beyond the existing rules. Every authorized command still has to equal a controller proposal (tested: acceptance narration with an empty proposal authorizes nothing).

New transfer forms. The object must resolve to the current same-turn offer.

| Form | Example (source) |
|---|---|
| List naming offered items (all named → `collective: true`, indexes `[0,1,2]`; partial list → only those named) | "She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts, taking them into her hands." (1M Kimi) |
| Bounded group phrases: `the N items/garments/pieces/things`, `all N`, `the stack/bundle/pile (of pink clothing)`, `the clothes/garments`, `the offered garments`. The count must equal the offer size; clothing nouns require an all-clothing offer. | "…taking the three items", "take all three garments", "the stack of pink clothing" |
| `before (carefully) taking X` | "Brenna hesitates, glancing down at her worn boots, before carefully taking the three items from Nicco's hands." (1M MiniMax) |
| `extends/holds out (one hand / her hands) to take X` | "she extended her hands to take all three garments" (1M Qwen) |
| Parenthetical subjectless action (sole present NPC, first clause only) | "(accepts the stack of pink clothing) Thanks." (1M MiniMax) |
| Past tense and `collect` added to the acceptance verbs; optional adverbs; lead-ins `After a (brief) pause/moment (of …),`, `Then`, `Finally`; subject followed by a comma (`Brenna, seated…,`) | |
| `reaches out and takes X`; `says, accepting X` *(first seen in the 1M.1 rerun)* | "She reaches out and takes them…", "…she says, accepting the bundle without comment on the hue." |
| Trailing modifiers stripped: `from Nicco's hands`, `into her arms/grasp/lap`, `without hesitation/comment (on …)`, `at once`, etc. | |

**Possessive distraction guard.** "her worn boots" is resolved against state ownership: a present NPC owns an item with that head noun, so it is not a distracting mention of Nicco's `boots`. Item mentions now use word boundaries, so `ring` no longer matches inside "bring".

**Unchanged exclusions:** reach, touch, look, consider and inspect verbs; single ordinals; count mismatch; ambiguous actor; quotes, code and hypothetical frames.

New knowledge forms (`was_told_fact` or `heard_fact`). The content must be the fact statement (or its `is → was` variant) and the recipient must be the intent's recipient. `her`/`him` is accepted only when there is exactly one telling intent.

- `Nicco tells/told/informs <P> (that) X`, and `… explains/mentions X to <P>` (existing)
- `Nicco states/says/explains/mentions/reports to <P> (,) that X`
- `Nicco speaks/spoke (the words) (clearly) to <P>, telling her that X / stating that X`
- `Nicco turns to <P> and tells her (that) X` *(first seen in the 1M.1 rerun)*
- `<P> hears Nicco say/tell her/state (that) X`

Reaction, facial expression, silence, "seems to understand", "already knew it", "the narrator explains", and telling a different NPC all stay unauthorized (tested).

## D. Refusal / hedge precedence

- **Actual refusal** vetoes the affected intents:
  - explicit refusal words;
  - handing, pushing or returning the offer back;
  - a negated acceptance verb (`does not / did not / never / makes no move to` + take, accept, receive, reach, hear, listen, agree).
- **Not refusal:** "rather than refusal", "without refusing", and negations carrying a temporal hedge (`immediately`, `at first`, `right away`, `yet`).
- **Hedges before a confirmation are neutral**, so a later explicit acceptance wins. Examples: `not`, `maybe`, `unchanged`, `considering`, `hesitates`.
- **The same hedge after a confirmation retracts it** when it mentions the transfer or communication (take, keep, give, return, back, ownership, hear, tell and similar).
- **`unchanged` is no longer a veto keyword** by itself; "ownership … unchanged" still vetoes.
- **Receipt-not-equip:** a negated put-on/wear/change ("does not move to put anything on") is not doubt about a transfer, unless the turn has an equip intent.

| Narration | Before (1M) | After (1M.1) |
|---|---|---|
| "She did not reach out immediately… caution rather than refusal. After a brief pause, she extended one hand to take the stack…" | refused | **authorized** |
| "Nicco tells Brenna that the eastern bridge is closed. Brenna's grey eyes lift…, her seated posture unchanged." | refused | **authorized** |
| "Maren also stayed quiet, leaving the room's atmosphere unchanged…" | refusal of Brenna's telling | neutral |
| "Brenna takes all three garments. She hands them back to Nicco." | not a refusal ("hands back" was unknown) | **rejected** (retraction) |
| "Brenna takes all three garments, then immediately gives them back." | rejected | rejected |
| "Brenna takes the stack. Maybe she will not keep them." | accepted | **rejected** (doubt after acceptance) |
| "She makes no move to accept or refuse, waiting…" | rejected | rejected |
| "Her posture is unchanged." (knowledge) | — | no confirmation, no refusal |

**Regression caught by replay.** My first version of the retraction rule rejected Kimi's "She reaches out and takes them… She does not move to put anything on, only holds what she's been given." The receipt-not-equip exception fixes it; a regression test covers it, with a control confirming that "She does not want to keep them" still retracts.

## E. Record 115

The input and grounded fixture are unchanged. DeepSeek is unchanged.

**E1. Phase 1M recorded narration, offline replay through the final grammar.** No new prose.

| Run | Narration gist | 1M result | 1M.1 replay |
|---|---|---|---|
| Kimi #1 | "makes no move to accept or refuse" | refused | refused (correct) |
| Kimi #2 | "She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts…" | rejected | **3 authorized** |
| Kimi #3 | "I don't need your clothes" | none | none (correct) |
| Qwen #1 | hedge, then "extended one hand to take the stack" | false refusal | **3 authorized** |
| Qwen #2 | "did not reach out to take them" | refused | refused (correct) |
| Qwen #3 | "extended her hands to take all three garments" | rejected | **3 authorized** |
| MiniMax #1 | hovers only | rejected | rejected (correct) |
| MiniMax #2 | "(accepts the stack of pink clothing)" | rejected | **3 authorized** |
| MiniMax #3 | "…before carefully taking the three items" | rejected | **3 authorized** |

**E2. Phase 1M.1 Stage B rerun: fresh Kimi narration, 1M.1 prompt and fixture.** This is the measured online result. The grammar at run time did not yet have the "reaches out and takes" and "says, accepting" forms, which were added afterwards (section C).

| Run | Narration | Proposal | Online result | Final-grammar replay |
|---|---|---|---|---|
| #1 | "She reaches out and takes them, gathering the shirts and shorts in her large hands. … She does not move to put anything on, only holds what she's been given." | 3 correct | rejected, insufficient confirmation | **3 authorized** |
| #2 | "\"I can carry them for you,\" she says, accepting the bundle without comment on the hue." | 3 correct | rejected, insufficient confirmation | **3 authorized** |
| #3 | "I'm not in a position to carry anything extra right now." … "making no move to accept the garments" | [] | none (correct refusal) | none |

**E3. Held-out confirmation: fresh Kimi narration with the FINAL grammar, ×5.** No grammar change was made after this run.

| Run | Narration | Result |
|---|---|---|
| #1 | "Brenna takes the items from Nicco's hands, gathering the cotton shirt, the thick fluffy shirt, and the shorts together." | **rejected (grammar false negative).** "She wears her own worn *leather* boots" set the distraction guard: the adjective run was longer than the possessive exception allows. |
| #2 | "I'll carry them. For now." "She accepts the shirts and shorts from Nicco's hands…" | **3 authorized** (collective) |
| #3 | "I don't wear pink." "She makes no move to take any of it." | none (correct refusal) |
| #4 | "She accepts them, gathering the shirts and shorts into her hands." "She makes no move to put anything on…" | **3 authorized** (collective) |
| #5 | "I'm not going to carry your clothes for you." | none (correct refusal) |

In every E2/E3 trace the equipment stayed correct: no garment was equipped and `brenna_boots` remained worn. Brenna refused in 3 of 8 fresh turns, which is legitimate NPC agency and correctly produces no commit.

## F. Knowledge

Input `/tell campaign_fact_bridge_closed to brenna`. DeepSeek proposed the correct told edge in every turn.

| Set | Explicit narrated telling | Authorized | Misses |
|---|---|---:|---|
| 1M Kimi, replay | 3/3 | **3/3** (was 1/3) | — |
| 1M.1 rerun, online | 3/3 | 2/3 | "Nicco turns to Brenna and tells her that…" (form then added; replay 3/3) |
| Held-out confirmation, online | 5/5 | **2/5** | #1 and #3 put Nicco's words in quotation marks (`"The eastern bridge is closed," he says.`); #4 "Nicco turns to Brenna, who sits alert despite her recovering condition, and tells her that…" (relative clause) |

- **Quoted dialogue** is still never evidence, by design (for example the `Brenna says "Brenna takes them."` test). Whether player-authorized `/tell` intent may accept Nicco's own quoted statement of the exact fact is a policy decision, deliberately not taken here.
- **Confirmation #3:** Brenna also claims "I heard as much from the merchants three days past". Rejecting told provenance there is defensible.
- **Other invented lore:** Brenna occasionally adds bridge details ("the old stone crossing past the mill", "only passable route to the low markets"). No state was affected.

## G. Kimi equipment precedence (targeted, narrator-only)

- **Setup:** structured state says `brenna_boots` are equipped and worn; the historical window describes Brenna barefoot. Cases: r173, r53, and a synthetic footwear-salient input ("How do your feet feel today?").
- **Design:** 4 repeats per case under each prompt variant, on identical fixtures. The variants differ **only** by the `[STATE PRECEDENCE]` block (offline test).
- **Classification** is manual: which footwear state the narration asserts.

| Prompt | Followed structured state (boots) | Followed stale history (barefoot) | No footwear assertion |
|---|---:|---:|---:|
| Phase 1M (no block) | 1 | 3 | 8 |
| Phase 1M.1 (block) | 0 | **7** (one self-contradictory: "Her bare toes curl… Brenna's worn boots still on her feet") | 5 |

**No improvement.** The direction is worse, though 12 vs 12 is too small to claim a real regression. Vivid barefoot history dominates.

Without historical prose (Stage B, CLI smoke), Kimi consistently kept the boots: "her worn leather boots remained on her feet" (r3, r35, r43, r169, r509, CLI). Historical windows are evaluation-only; production gets no playthrough history. The production risk is Kimi's *own* earlier turns in recent conversation, which the precedence block also covers and which was not tested separately.

## H. Kimi knowledge isolation (targeted, narrator-only)

- **Setup:** only Nicco knows *The eastern bridge is closed*. Maren has no edge. In `brenna_knows`, Brenna also has an edge.
- **Cases:** r43 (Kimi leaked 2/2 in Phase 1M), a direct supplies question addressed to Maren, and the same question with Brenna knowing.
- **Design:** ×4 per case per variant.

| Case | Maren states the fact — 1M prompt | — 1M.1 prompt |
|---|---:|---:|
| kn_r43 | 0/4 | 1/4 |
| kn_supplies | 4/4 | 4/4 |
| kn_supplies_brenna_knows | 4/4 | 4/4 |
| **Total** | **8/12** | **9/12** |

**No improvement.** When the conversation directly invites it, Kimi treats a closed bridge as common knowledge ("Everyone knows that", "Has been for days") and invents surrounding lore (ferrymen, fords, apothecaries). Brenna, who legitimately knows the fact in the last variant, never stated it (0/8); she is narrated as feverish.

**A plausible structural cause:** the existing hard rule "Unknown means unestablished, not false or hidden", together with "No edge means awareness is unestablished", can be read as permission to voice unestablished awareness. The new rule did not override that reading. The fix belongs in how awareness is presented to the narrator (future work), not in more prose.

In Stage B, Kimi once had Nicco himself volunteer the fact in r509 (a disclosure not in the player input: an **agency violation**). No auto-repair: no edge was created and no state changed. The diagnostic `npc_knowledge_leak_candidate` flagged all targeted leaks; it also flags the intended recipient in `/tell` cases (expected; a candidate only).

## I. State safety

**0 false-positive durable mutations:**
- Phase 1M.1 Stage B rerun: 17 turns.
- Held-out confirmation: 10 turns.
- CLI smoke: 4 turns.
- Offline replays: 51 Phase 1M turns and 17 Phase 1M.1 turns.

Incorrect controller proposals were all rejected (for example `place_item ring → finger` after r25: `rejected_controller_mismatch`). Receipt never equipped. No equipment or knowledge auto-repair exists or was added.

## J. Stage B metrics

Causal split per expected command. The Phase 1M baseline is Kimi Stage B from 2026-09-28T2044.

| | 1M Kimi (online) | 1M.1 rerun (online) | Held-out confirmation (online, final grammar) |
|---|---:|---:|---:|
| Turns / expected commands | 17 / 13 | 17 / 13 | 10 / 20 |
| **TP / FP / FN** | 2 / 0 / 11 | 3 / 0 / 10 | **8 / 0 / 12** |
| Controller correct → authorizer accepted | 1 (+r39 runtime) | 2 (+r39) | 8 |
| Controller correct → authorizer rejected | 8 | 7 | 6 |
| … of which the narration actually established it (grammar false negative) | 5 | 6 | 5 (+1 "already knew") |
| Controller omitted, narration unsupported (refusal/deferral) | 3 | 3 | 6 |
| Controller omitted despite supporting narration | 0 | 0 | 0 |
| Incorrect controller proposal, rejected | 1 | 1 | 0 |
| Narrator/provider failure | 0 | 0 | 0 |

Offline replay of recorded text through the final grammar (no new prose; 0 FP):

| Recorded set | TP at run | TP replayed |
|---|---:|---:|
| 1M Kimi (17 turns) | 2 | **7** |
| 1M Qwen | 1 | **8** |
| 1M MiniMax | 1 | **7** |
| 1M.1 Kimi rerun (17 turns) | 3 | **10** (every remaining miss is a genuine refusal) |

**Interpretation.**
- The grammar now captures all the phrasings observed in both recorded sets without a single false positive.
- On fresh held-out narration it captured 4 of 7 narrated successes (r115 2/3, knowledge 2/5 with quoted speech the main gap). Improvement is real but partial.
- Kimi keeps producing new valid surface forms, and each extension only buys partial generalization. Per the brief, expansion stopped here and this is reported rather than continued.

## K. Prompt impact

- `NARRATOR_SYSTEM` is unchanged (1,582 chars).
- New `NARRATOR_STATE_PRECEDENCE` block, **504 chars**, placed immediately before `[CURRENT AUTHORITATIVE SCENE]`. It is generic, with no fixture names (tested):

```
[STATE PRECEDENCE]
Current structured state is the present truth. Recent or historical conversation may contain stale descriptions; on conflict, follow the structured state and ignore the stale detail.
Current equipment is authoritative. Do not remove, replace or contradict equipped items unless the player action or current state explicitly changes them.
NPCs may only state or act on facts they are established to know, believe, suspect or have heard. Narrator knowledge does not become NPC knowledge.
```

- **Production recent conversation** remains subordinate to structured state: `[RECENT CONVERSATION — SUBORDINATE TO CURRENT STATE]`, now reinforced by the block. Historical playthrough context remains evaluation-only (`withHistoricalContext` is used only by evaluation tooling).
- **Development fixture prose** (`src/dev/turn-fixture.ts`, evaluation-only, never under `data/`): the placeholder "Synthetic evaluation fixture." is replaced with minimal natural text ("A quiet upstairs room with a narrow bed, a small table and an arched window…", "Brenna's worn leather boots."). Ironbound's fixture text dropped "synthetic… evaluation world". Item names and all registered state are unchanged, and there is an opt-in `brennaKnowsBridge` variant for H.
- **Prompt size:**
  - Window prompts grew about 609 chars (e.g. r43 10,801 → 11,410).
  - State-only prompts grew similarly (knowledge 5,721 → 6,330).
  - Stage B Kimi narrator prompt tokens: 22,113 → 25,091 (+13%).
- **Thin-fixture echoes:** "Synthetic evaluation fixture" echoes disappeared. Two "test room" and several "…remains unestablished" meta phrases remain, as does inventory recital ("The sturdy boots, pink cotton shirt… stay in Nicco's possession").

## L. Latency (Kimi; small samples, upstream routing varies)

| ms, median (p25–p75) | 1M Kimi Stage B | 1M.1 rerun | Confirmation (10) | Targeted narrator-only (48) |
|---|---|---|---|---|
| TTFT | 1,295 (960–2,150) | **1,112** (1,050–1,385) | 797 (774–1,069) | 1,380 (1,156–1,708) |
| Narrator total | 4,783 | 3,876 | 2,578 | 4,983 |
| Controller tail | 792 | 836 | 1,027 | — |
| Full turn | 5,507 (3,756–7,481) | **4,572** (4,277–4,899) | 3,563 | — |

- **CLI smoke** (4 turns):
  - TTFT: 2,170 / 1,070 / 1,518 / 1,625 ms.
  - Full turn: 5,080 / 3,353 / 7,038 / 7,410 ms.
- **Upstream providers:** Novita, SiliconFlow and AtlasCloud.
- This is within the Phase 1M Kimi envelope (TTFT around 1.1–1.4 s, turn around 4.5–5.5 s). No stable-performance claim.

## M. Usage (OpenRouter-reported `usage.cost`; no runtime price table)

| Run | Narrator prompt / completion | Controller prompt / completion | Reported cost |
|---|---|---|---:|
| Targeted (48, narrator-only) | 127,273 / 8,938 | — | $0.0553 |
| Stage B rerun (17) | 25,091 / 2,251 | 42,788 / 516 | $0.0118 + $0.0117 |
| Confirmation (10) | 13,555 / 952 | — | $0.0047 + $0.0037 |
| CLI smoke (4) | 6,402 / 422 | 10,010 / 139 | not captured (production client does not record cost) |

Phase total reported: about **$0.087**, plus the uncaptured CLI smoke (4 turns).

## N. CLI smoke — real production default

`npm run play -- --debug` on the default development fixture, input piped. Log: `.build/phase-1m1-cli-smoke.txt`. Banner: narrator `moonshotai/kimi-k2.5`, controller DeepSeek.

| Turn | Narration (excerpt) | Result |
|---|---|---|
| "Hello, Brenna. How are you feeling?" | "Better than I was… the fever's broken." | no proposal; revision 1 → 1 |
| `/wait 5` | "Five minutes pass in the observation room…" | runtime delta; world minute 100 → 105; revision 1 → 2 |
| "I give boots to Brenna." | "'I won't wear them,' she says. 'I've my own.' She gestures toward her worn leather boots, already on her feet. … She reaches out and takes the boots from Nicco's hands…" | `authorized_narrative_confirmation`; boots carried by Brenna; her own boots still worn; revision 2 → 3 |
| `/tell campaign_fact_bridge_closed to brenna` | "Nicco tells Brenna that the eastern bridge is closed. … Maren's attention has drifted to the arched window, apparently unaware of the bridge's status." | `authorized_explicit_information_transfer`; told edge; revision 3 → 4 |

- Streaming deltas printed live and every turn finalized.
- `/status` shows revision 4 and `unsaved: true`, and the session ended with unsaved changes. There was no autosave, and the save schema and repository are untouched.

## O. Offline verification

With network disabled (preload guard) and `OPENROUTER_API_KEY` removed:
- `npm test`: **581/581** (Phase 1M: 526; 55 new tests covering grammar, precedence, knowledge, the reasoning default, env override, streaming order, targeted variants and the leak diagnostic).
- `npm run test:playthrough`: **25/25**.
- `npm run typecheck`: pass.
- Logs: `.build/phase-1m1-tests.txt`, `.build/phase-1m1-playthrough-tests.txt`.

Paid runs happened only after offline success, and each printed `=== PAID ONLINE EVALUATION ===`.

## P. Remaining limitations

- **Free-form grammar gaps (measured on held-out text):**
  - Nicco's quoted statement of the fact (a policy question).
  - Relative clauses between recipient and verb.
  - The distraction guard's fixed adjective window ("her own worn leather boots").
  - Paraphrased or unnamed descriptors ("the thick fluffy shirt").

  Kimi generates new valid forms steadily. More templates give diminishing, partial returns; a different evidence strategy should be weighed before growing this further.
- **Stale history:** still present and not fixed by prompt. Kimi follows vivid barefoot history in most footwear-asserting responses (G). Its effect on production recent conversation (Kimi's own prior turns) is untested.
- **Knowledge leakage:** still present and not fixed by prompt. Maren voices the bridge fact in 9/12 tempting runs (H). The likely cause is the "unestablished ≠ false" framing, which needs a structural treatment rather than more instruction text.
- **Narrator habits:** state recital and "unestablished" meta phrasing in thin fixtures; echoing the player's words back as Nicco's dialogue (r47, r173); one invented Nicco disclosure (r509); the r53 misread persists without history.
- **Provider variability:** Kimi routed across three upstreams with a visible latency spread.
- **Sample sizes:** small (12 per targeted cell, 10–17 Stage B turns).
- **Human review:** all classifications are agent-authored.

## Q. Status

The production default is now Kimi with reasoning explicitly disabled. It is configurable and state-safe (0 false positives), and it works end to end in the CLI. The grammar measurably reduces false negatives on every recorded trace set and partially on held-out narration.

The two Kimi adherence problems this phase targeted with prompt hardening (stale-history equipment and NPC knowledge leakage) were **not** improved by it. Held-out recall also shows the grammar is still chasing phrasing.

READY WITH FIXES

---

### Artifacts

- `docs/evaluations/phase-1m1-targeted-20260928T2112.json`: 48 targeted narrator-only records (`@1m` / `@1m1` variants).
- `docs/evaluations/phase-1m1-stage-b-20260928T2118.json`: 17-turn Stage B rerun, measured online.
- `docs/evaluations/phase-1m1-confirmation-20260928T2125.json`: held-out r115 ×5 and knowledge ×5 with the final grammar.
- `docs/evaluations/phase-1m1-grammar-replay-1790630565043.json`: Phase 1M Stage B (51 turns) replayed through the final grammar.
- `docs/evaluations/phase-1m1-grammar-replay-1790630565260.json`: Phase 1M.1 rerun (17 turns) replayed through the final grammar.
- `.build/phase-1m1-cli-smoke.txt`: CLI smoke transcript with debug results.
- Code:
  - `src/turn/turn-evidence.ts`
  - `src/turn/prompt-builder.ts` (`NARRATOR_STATE_PRECEDENCE`)
  - `src/llm/openrouter/minimax-narrator.ts`
  - `src/dev/turn-services.ts`
  - `src/dev/turn-fixture.ts`
  - `src/dev/narrator-bakeoff.ts` (`targetedCases`, `withoutStatePrecedence`)
  - `src/dev/eval-narrators.ts` (`--stage targeted`, `--repeats`, `--max-attempts`)
  - `src/dev/replay-stage-b.ts`
  - `src/dev/narrative-checks.ts` (`npc_knowledge_leak_candidate`)
- Tests: `tests/turn-evidence-1m1.test.ts`, `tests/narrator-bakeoff.test.ts`, `tests/llm-provider.test.ts`.
