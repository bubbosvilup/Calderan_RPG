# Phase 1M review — Narrator bake-off & selection — 2026-09-28

Reviewer: Claude (implementation agent). **Every qualitative judgment below is agent-authored and has not been ratified by a human.** No LLM graded any output; deterministic checks only flag candidates, and I read every generated response. The architecture was not redesigned. DeepSeek (`deepseek/deepseek-v4-flash-0731:nitro`) remained the controller throughout. The production/default narrator is still `minimax/minimax-m2-her`, and `npm run play` is unchanged. Phase 1K/1L/1L.1 artifacts are untouched, and no next phase was started.

## A. Method

Two stages, same prompts, same bounded context, same corpus, same deterministic state machinery.

- **Stage A (narrator-only):** 11 cases (16 generations per model with repeats) sent to 5 models. No controller call and no campaign mutation. Each case's narrator request is built by the same functions `TurnCoordinator` uses: fresh fixture, `buildTurnContext`, `playerIntent`, lexical `retrieveForTurn`, `buildNarratorPrompt` with an empty recent conversation, then the Phase 1L.1 evaluation-only historical window. An offline test proves this request is byte-identical to what the coordinator sends. The request is built once per case and sent unchanged to every model (prompt fingerprints in the manifest).
- **Adult probe:** a separate narrator-only provider-behavior check (section G).
- **Stage B (full loop):** the two finalists run the Phase 1L.1 12 historical state cases plus the explicit knowledge case through Narrator → DeepSeek → TurnEvidence → authorizer → CampaignState. Repeats: record 115 ×3 and knowledge ×3, giving 17 turns per model. MiniMax ran as a same-day **baseline reference** (not a finalist).
- **Equal request policy:**
  - 384 output tokens for all models.
  - No sampling parameters sent (provider defaults, identical to production).
  - `reasoning: {enabled: false}` for all models.
  - Streaming.
  - 60 s timeout.
  - Models interleaved per case and run sequentially, so no concurrency confound.
- **Why reasoning is disabled:** a pre-run probe showed Kimi K2.5 and Qwen 3.8 Flash reason by default. Qwen spent its whole 120-token probe budget on hidden reasoning and returned empty content (`finish_reason: length`). Kimi generated 589 reasoning tokens and took 13.5 s. MiniMax, Euryale and Cydonia do not list `reasoning` as a supported parameter; it is ignored for them.
- **Retries:** infrastructure failures (HTTP 429, timeout) could be retried on resume, up to 3 attempts, and every attempt is recorded. A clearly labeled supplementary pass (attempts 4–6) filled the last Qwen gaps plus one Cydonia gap (section B). Truncation and other model behavior were never retried.

**Tooling added (development only):**
- `npm run eval:narrators -- --stage a|adult|b [--model alias] [--cases …] [--dry-run] [--resume dir [--retry-infra [--max-attempts n]]] [--summarize dir]`
  - It prints `=== PAID ONLINE EVALUATION ===` before any request, and `--dry-run` sends nothing.
  - Results are appended per model as each request finishes (resumable JSONL).
  - Each run records a manifest with: date, models, case IDs, prompt fingerprints, `NARRATOR_SYSTEM` sha, output budget, request policy and corpus sha.
  - No API key is recorded.
- An evaluation-side `fetch` tee records upstream provider, `finish_reason`, usage, reasoning tokens and OpenRouter's reported `usage.cost`. The engine client is unchanged. This is what distinguishes **truncation** from other invalid output: the client itself still reports both as `invalid_provider_response`.
- Engine-adjacent changes: an opt-in `disable_reasoning` narrator config (unset leaves the request byte-identical, which is tested), and an evaluation-only narrator override in `turn-services.ts` that cannot touch the controller model, policy or client (tested).

## B. Candidates

All five slugs were verified in the live OpenRouter catalog before any paid request. No candidate needed provider-layer changes beyond the reasoning flag.

| Alias | Slug | Upstream seen | Context | Notes |
|---|---|---|---:|---|
| MiniMax (baseline) | `minimax/minimax-m2-her` | Minimax | 65k | params: max_tokens/temperature/top_p only |
| Euryale | `sao10k/l3.3-euryale-70b` | NextBit | 131k | |
| Cydonia | `thedrummer/cydonia-24b-v4.1` | Parasail | 131k | |
| Kimi | `moonshotai/kimi-k2.5` | Novita, SiliconFlow, AtlasCloud | 262k | hybrid reasoning (disabled) |
| Qwen | `qwen/qwen3.8-flash` | Alibaba | 1M | hybrid reasoning (disabled) |

Infrastructure outcomes in Stage A (all attempts):

| Model | Attempts | Completed | Truncated | HTTP 429 | Timeout |
|---|---:|---:|---:|---:|---:|
| MiniMax | 16 | 10 | **6** | 0 | 0 |
| Euryale | 19 | 16 | 0 | 2 | 1 |
| Cydonia | 27 | 16 | 0 | 11 | 0 |
| Kimi | 16 | 16 | 0 | 0 | 0 |
| Qwen | 35 | 16 | 0 | **19** | 0 |

- Qwen and Cydonia completed 16/16 keys only after the supplementary attempts.
- All 429s came from upstream providers ("Provider returned error"). They are infrastructure failures and are not counted as narrative failures.
- In Stage B (a later time window), all 51 turns completed with no provider failures.

## C. Stage A corpus

The source is the curated historical corpus (421 pairs, 24 curated cases; `source_sha256` recorded). It is used as evaluation evidence, not as canonical prose or authoritative state. Player inputs are unchanged, and the historical assistant replies were not used as target completions.

| Case | Context | Repeats | Failure modes |
|---|---|---:|---|
| r43 | 3-exchange window | 2 | Gerome silence, multi-NPC, agency |
| r53 | window | 1 | tower/Gerome intro, equipment |
| r25 | window | 1 | short context-dependent ring action |
| r115 | window, grounded garments | 2 | multi-item handover, relevance |
| r169 | window | 2 | equipment continuity, household dialogue, contamination |
| r173 | window | 2 | secrets/knowledge, agency |
| r591 | window | 1 | multi-NPC, name correction |
| ironbound | row-53 window (as 1L.1) | 2 | retrieval / lore adherence |
| knowledge_tell | state only | 1 | explicit communication |
| r35 | state only | 1 | agency, Gerome, persistent invention |
| r3 | state only | 1 | persistent invention, short input |

Historical windows are the Phase 1L.1 method: three preceding exchanges, marked **HISTORICAL CONVERSATION CONTEXT … NOT authoritative canon; current structured state and canon override it**, and never used as controller evidence. The prompt is the Phase 1L.1 hardened prompt, unchanged, including its sections ROLE, HARD RULES, AUTHORITATIVE SCENE/CHARACTERS/EQUIPMENT, HARD CHARACTER CONSTRAINTS, RETRIEVED CANON, UNESTABLISHED DETAILS, RECENT, PLAYER ACTION and NARRATION TASK. Median prompt size: about 10.5k characters with a window, about 5.7k state-only.

*Pre-existing observation:* the source heading literally reads `RETRIEVED CANON ? AUTHORITATIVE` (a mangled dash in `prompt-builder.ts`). It was left as-is, since changing it would change prompt semantics mid-comparison.

## D. Hard adherence results (Stage A)

These are counts of clear failures across each model's 16 responses, by my manual reading. MiniMax's six truncated partial texts are included because a player sees them in the stream.

| Model | Player agency takeover | Gerome speaks | Equipment contradiction | NPC knowledge leak | Persistent invention | Relevance failure | Metadata / prompt / serialization leak | Incoherent |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| MiniMax | **4** | 0 | 2 | 0 | **6** | **4** | **11** | 2 |
| Euryale | **6** (+1 mild) | 0 | 1 | 0 | 4 | 2 | 2 | 0 |
| Cydonia | 4 (+2 mild) | 0 | 1 | 0 | **6** | 1 | **6** | **5** |
| Kimi | **0** | 0 | **4** | **2** | 3 minor | 1 (misread) | 6 (mostly state recital) | 0 |
| Qwen | **0** | 0 | 2 | 0 | 0 major | 0 | 4 | 0 |

**Per-model detail:**

- **MiniMax (baseline).**
  - Truncates at 384 tokens on 6/16. This explains the 1L.1 "provider failures" on rows 43/173.
  - Emits literal `\n` escapes (12/16 by the final checker).
  - Hallucinates `[Status]`, `[Reputation]`, `[ItemState]` and `[Time]` blocks, and leaks `Hard Constraints: Gerome does not speak…`.
  - **Writes the player's next turn**: `user name=tilovir *I shrug*…` (r169#1), `User name: talkior *he chuckles*…` (r173#1), and Nicco's dialogue in r173#2.
  - Regurgitates the historical window as JSON (r169#2).
  - Turns fixture metadata into sci-fi apparatus ("POWER SOURCE DETECTED", "mana storage display 95/100", r25).
  - Repeats the 1L.1 metal walls and machinery (r3).
  - Brenna goes barefoot despite equipped boots (r169 ×2).
- **Euryale.** The worst for agency: Nicco's thoughts, gaze, search and dialogue (r25, r43#2, r35, knowledge), and "This is Gerome," he says (ironbound #1). Its r3 response is metadata as fiction: "synthetic evaluation fixture", an "Authorized Personnel Only" door, and Brenna says "I'm Brenna, your evaluator". It invents Brenna's "abilities" (r169#2).
- **Cydonia.**
  - Frequent word salad: "no immediate discordance between involuntary consequences and the weather" (r53), elves and henge stones and a supply room "singing its lullaby about tissues and shoes" (r169#1), "the Muzak hums on" (r43#2).
  - Calls Brenna "The synthetic girl".
  - In r35, Nicco searches for and **finds** a thermometer and IV equipment in an invented cabinet.
  - Invents Ironbound lore ("the house at Ironbound Gate") in r173.
- **Kimi.**
  - No Nicco takeover in Stage A.
  - **Knowledge leak:** Maren says "The eastern bridge is closed" in both r43 runs, although only Nicco holds that edge.
  - **Historical contamination:** bare feet in 3 of the 5 historical-window responses that mention Brenna's footwear (r53, r169#2, r173#2). It kept the boots correctly in r169#1: "Brenna's worn boots still laced tight… doesn't move to remove the boots".
  - Once put Nicco's carried boots "on his feet" (r115#1).
  - In thin state-only fixtures it recites inventory and state: "Nicco is now carrying the boots, the pink cotton…", and once "The synthetic evaluation fixture of the room".
  - Minor inventions: "Korvin's crew", Maren's red hair.
- **Qwen.**
  - No takeover, no knowledge leak, no major persistent invention.
  - **Contamination:** barefoot in both r169 runs, including an explicit contradiction: "She doesn't move to take off her boots—she is already barefoot".
  - Recurrent "synthetic air / synthetic fixture" echoes in thin fixtures.

**Gerome silence** held for every model and every response. It no longer separates candidates.

**Relevance / record 115:** all five models stayed on the handover scene in all Stage A runs. The 1L.1 unrelated screen/armor/shield scene did not recur. MiniMax's relevance failures are on Ironbound (an irrelevant 30-token line, then lore ignored) and on short state-only inputs.

**Deterministic checker** (final version re-applied to all stored text; run-time counts are also kept in the export): MiniMax `serialization_artifact` 12, `metadata_echo` 7; Cydonia `metadata_echo` 2, `prompt_vocabulary_echo` 1; Kimi `prompt_vocabulary_echo` 2, `metadata_echo` 1; Qwen `retrieved_lore_denial` 2. The regexes miss much of what the table above records, for example state recital, most agency takeovers and word salad. These counts are candidates, not a grade. Checker refinements made during the phase:
- `prompt_vocabulary_echo` and `serialization_artifact` were added.
- `retrieved_fact_unused` now fires only for an explicit lore query. "magic" in r173 incidentally retrieves Ironbound, and ignoring that record is correct.

## E. Retrieval (Ironbound)

The supplied fact: *"Ironbound is a synthetic guild of smiths in this evaluation world. No other lore is established."*

| Model | #1 | #2 |
|---|---|---|
| MiniMax | irrelevant 30-token reply, no lore | no lore; scene continues |
| Euryale | lore ignored; Nicco speaks and touches Brenna | Nicco recites the fact verbatim, including "evaluation world" |
| Cydonia | fact used, plus "synthetic… canonical history" echo; Nicco dialogue; invented "artiste's house" | "evaluation world" echo; Nicco dialogue; invented backstory |
| Kimi | **fact used ("a guild of smiths—nothing more has reached him"), nothing invented** | **same** |
| Qwen | **denies**: "he knows nothing about the Ironbound… no awareness edges" | **denies**: "Nicco knows nothing about the Ironbound" |

Only Kimi used the supplied fact without denial, replacement lore or player takeover (2/2). Its wording ("remains unestablished") mildly echoes prompt vocabulary. Qwen reproduces the MiniMax 1L.1 failure class (denying supplied lore) 2/2. No lore or state writes occur in any case.

## F. Character / RP quality (qualitative, agent-authored)

- **Kimi:** the strongest voice when history is supplied. Brenna is terse, wary and dry ("Bad men wanting to use you—that's not a secret. That's just Tuesday."), and dialogue is always clearly attributed. In thin state-only fixtures its prose turns reportorial and recites state. It tends to import stale history (bare feet, borrowed shirt).
- **Qwen:** controlled, grounded prose with good Brenna voice ("Acceptable… One would have sufficed for laundry rotation."). It is the most cautious about Nicco's agency. It is sometimes flat and uses asterisk italics when the history does.
- **Euryale:** fluent and warm but generic ("eyes sparkling"), sometimes stilted ("She is not sure…" repeated). Its biggest problem is narrating Nicco.
- **Cydonia:** capable of good dialogue (r115, r169#2) but unstable, veering into incoherence and meta.
- **MiniMax:** vivid when it works (r115#2), but the RP-template artifacts (user turns, status blocks) make it unsafe.
- **Multi-NPC distinctness:** Kimi and Qwen keep Gerome silent and Maren mostly passive. Kimi gave Maren unsupported knowledge. Euryale moves NPCs freely (Brenna and Maren leave to fetch items).

## G. Adult-content suitability (separate provider-behavior probe)

This is not part of the historical benchmark.
- **Setup:** two explicitly adult, enthusiastically consenting partners (Nicco and a synthetic 34-year-old innkeeper) in a locked inn room, run through the production prompt builder over a throwaway world, with no campaign state and no controller.
- **Probes:** an initiation probe and a continuation probe, 2 generations each per model.
- **Handling:** generated text is kept only under `.build/`; the export `phase-1m-adult-probe-20260928T2039.json` contains classifications only.

| Model | Result |
|---|---|
| MiniMax | continued normally (brief; addresses "you") |
| Euryale | continued normally, most explicit; also narrates Nicco's sensations and intent (agency) |
| Cydonia | continued normally, explicit; Nicco dialogue and meta line in one run |
| Kimi | continued normally, sensual but less graphic |
| Qwen | continued normally, sensual but less graphic |

No refusals, moralizing, character breaks, safety lectures or content-filter errors (two 429s were retried and are infrastructure only). This is distinct from RP quality: Kimi and Qwen tend toward less explicit description without refusing. Whether that is sufficient is a user product decision.

## H. Latency

Stage A narrator-only, completed responses, ms (small samples; upstream providers vary):

| Model | n | TTFT p25 / **median** / p75 | Total p25 / **median** / p75 |
|---|---:|---|---|
| MiniMax | 10* | 713 / **806** / 923 | 1,541 / **2,143** / 3,472 |
| Euryale | 16 | 654 / **3,246** / 13,412 | 13,449 / **21,246** / 31,091 |
| Cydonia | 16 | 753 / **883** / 982 | 4,955 / **7,298** / 14,674 |
| Kimi | 16 | 1,207 / **1,337** / 1,830 | 3,135 / **4,076** / 5,905 |
| Qwen | 16 | 1,207 / **1,468** / 1,730 | 3,547 / **4,479** / 5,033 |

\*MiniMax's six truncated responses are excluded; their totals were 4.1–5.7 s.

Stage B full loop (17 turns each):

| Model | TTFT median (p75) | Narrator total median | Controller tail median | Full turn median (p25–p75) |
|---|---|---:|---:|---|
| Kimi | 1,295 (2,150) | 4,783 | 792 | **5,507** (3,756–7,481) |
| Qwen | 1,067 (1,468) | 3,697 | 826 | **4,706** (3,809–5,368) |
| MiniMax (baseline) | 612 (766) | 1,489 | 857 | **2,417** (2,184–2,876) |

- Kimi and Qwen roughly double TTFT versus MiniMax but stay around 1–1.5 s. Their full turns are about 2–3 s longer, mostly because they write complete paragraphs.
- Euryale's TTFT tail (p75 13 s, one 60 s timeout) is disqualifying for streaming UX.
- None of this establishes stable provider performance.

## I. Usage / cost evidence

These are the cost values OpenRouter reported per request (`usage.cost`); no pricing is hardcoded anywhere.

| Stage A (16 keys) | Prompt tok | Completion tok | Reported cost |
|---|---:|---:|---:|
| MiniMax | 25,984† | 1,887† | $0.0101† |
| Euryale | 36,225 | 4,366 | $0.0268 |
| Cydonia | 39,205 | 3,583 | $0.0127 |
| Kimi | 36,384 | 3,204 | $0.0224 |
| Qwen | 37,205 | 2,478 | $0.0038 |

†5 of 6 truncated MiniMax requests returned no usage (the stream was aborted before the usage chunk), so these figures undercount.

- **Stage B narrator + controller:** Kimi $0.0127 + $0.0118; Qwen $0.0021 + $0.0058; MiniMax $0.0094 + $0.0032.
- **Adult probe:** $0.0079.
- **Total reported spend:** about $0.13 for the whole phase (a lower bound).

Cost is not a differentiator at this scale.

## J. Stage A finalists

**Kimi K2.5 and Qwen 3.8 Flash.** They are the only candidates with zero player-agency takeovers and zero incoherent outputs, and both have acceptable TTFT (median 1.3–1.5 s) and non-refusing adult behavior. Kimi is uniquely correct on retrieval, and Qwen had the fewest inventions. The others were excluded:
- Euryale for systematic agency takeover and latency.
- Cydonia for incoherence, metadata leakage and agency.
- MiniMax for truncation, serialization/template leakage, and writing player turns.

Latency alone did not decide this: Cydonia had the second-best TTFT and was excluded.

## K. Stage B full-loop results

Expected commands per model: 13 (r39 runtime 1, r115 3×3, knowledge 1×3).

| | Kimi | Qwen | MiniMax (baseline ref.) |
|---|---:|---:|---:|
| Finalized turns | 17/17 | 17/17 | 17/17 |
| TP / **FP** / FN | 2 / **0** / 11 | 1 / **0** / 12 | 1 / **0** / 12 |
| Controller correct → authorizer rejected | 8 | 12 | 12 |
| Controller omitted, narration unsupported | 3 | 0 | 0 |
| Controller omitted despite supporting evidence | 0 | 0 | 0 |
| Incorrect controller proposals (all rejected) | 1 | 2 | 0 |
| Narrator refusal / provider failure | 0 | 0 | 0 |

The deterministic "authorizer rejected" bucket mixes correct and incorrect rejections. My manual split of whether the narration actually established the expected event:

| | Kimi | Qwen | MiniMax |
|---|---|---|---|
| r115 narration clearly accepts all three | 1/3 (#1 defers, #3 Brenna refuses) | 2/3 (#2 refuses) | 2/3 (#1 only hovers) |
| Knowledge narration explicitly tells | **3/3** | 1/3 explicit + 2 implicit | 0 explicit (2 implied; #2 claims she already knew "for years") |
| **Grammar false negatives** (narration supported, rejected) | 3 transfers + 2 knowledge | 6 transfers + 1 knowledge | 6 transfers |
| Correct rejections (narration did not establish) | 3 (#1 deferral) | 3 (#2 refusal) | 3 (#1) + knowledge #2 |

- **The recall bottleneck is now the bounded TurnEvidence grammar, not narrator relevance.** Phrasings it misses include:
  - "She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts" (a list object);
  - "before carefully taking the three items";
  - "(accepts the stack of pink clothing)";
  - "extended her hands to take all three garments";
  - "Nicco speaks to Brenna, telling her that…";
  - "stating that the eastern bridge was closed".
- **The grammar also produces false refusals.** Hedges such as "did not reach out immediately… caution rather than refusal" and neutral sentences containing "unchanged" veto a later explicit acceptance or telling.
- Stage B uses state-fixture mode (no historical window), so Stage A contamination did not apply. Both finalists kept Brenna's boots correct on r169 (Kimi: "You're aware I'm wearing boots.").
- Both finalists **misread r53** in this mode, treating the instruction to sit and eat as addressed to Gerome.
- Kimi invented Nicco dialogue once (r115#2: "These are for you," he says). Kimi and Qwen also tended to echo the player's own words back as quoted Nicco speech (r47, r509). That repeats the player rather than inventing new content, but it reads poorly.
- Same-day MiniMax, full loop and state-only: sci-fi terminals and "integration modules" (r25); "this test is about your mental fortitude" (r3); an invented thermometer, IV bag and stand (r35); someone donning Nicco's boots and garments while "grinning at chat" (r43); an invented NPC "Althales" (r173); first-person romance (r39). None produced a durable write.

## L. Record 115 — finalist traces

The input is unchanged; the grounded fixture has Brenna as the only present NPC, with the pink cotton shirt, pink fluffy shirt and pink shorts. Player intents resolve all three transfers (`her → brenna`). Full records (input, narration, proposal, TurnEvidence, authorization, final state) are in `phase-1m-stage-b-20260928T2044.json`.

| Run | Narration (excerpt) | DeepSeek proposal | TurnEvidence | Authorization | Revision |
|---|---|---|---|---|---|
| Kimi #1 | "You want me to carry all that?"… "She makes no move to accept or refuse" | 3 correct transfers | refusal on "makes no move to accept or refuse" | 3 × `rejected_recipient_refused` (correct: not accepted) | 1 → 1 |
| Kimi #2 | *Nicco: "These are for you," he says* … "She accepts the pink cotton shirt, the pink fluffy shirt, and the pink shorts, taking them into her hands." | 3 correct | none | 3 × `rejected_insufficient_confirmation` (**grammar false negative**; also agency violation) | 1 → 1 |
| Kimi #3 | "I don't need your clothes"… makes no move to accept | [] | none | — (`controller_omitted_evidence_absent`, correct) | 1 → 1 |
| Qwen #1 | "did not reach out immediately… caution rather than refusal… she extended one hand to take the stack, accepting the cotton shirt, the fluffy shirt, and the shorts" | 3 correct | refusal on the hedge sentence | 3 × `rejected_recipient_refused` (**grammar false refusal**) | 1 → 1 |
| Qwen #2 | "did not reach out to take them… ignoring the offered items entirely" | 3 correct | refusal | 3 × `rejected_recipient_refused` (correct) | 1 → 1 |
| Qwen #3 | "she extended her hands to take all three garments… 'I'll keep these'" | 3 correct | none | 3 × `rejected_insufficient_confirmation` (**grammar false negative**) | 1 → 1 |

Both finalists **follow the handover scene every time**, which answers the Phase 1L.1 question about narrator relevance. The already-fixed collective grammar still covers too few of the natural acceptance forms these narrators produce, and no garments committed. No guessed equip occurred, `brenna_boots` stayed equipped, and there were zero false positives.

## M. Knowledge case — finalist traces

Input `/tell campaign_fact_bridge_closed to brenna`; DeepSeek proposed the correct `set_knowledge` (told by Nicco) in all 6 finalist turns.

| Run | Communication in narration | Evidence | Result |
|---|---|---|---|
| Kimi #1 | "Nicco tells Brenna that the eastern bridge is closed." | `was_told_fact` **plus** false refusal on "…her seated posture unchanged" | rejected (refused) |
| Kimi #2 | "Nicco speaks to Brenna, telling her that the eastern bridge is closed." Brenna adds invented lore: "only crossing for thirty leagues" | none | rejected (fact not communicated) |
| Kimi #3 | "Nicco tells Brenna that the eastern bridge is closed." | `was_told_fact` | **authorized_explicit_information_transfer; revision 1 → 2** |
| Qwen #1 | "…as he spoke. The information about the eastern bridge's closure registered…" | none | rejected |
| Qwen #2 | "…as the message was delivered…" + "unchanged" sentence | false refusal | rejected |
| Qwen #3 | "Nicco spoke the words clearly to Brenna, stating that the eastern bridge was closed." | none | rejected |

- Kimi states communication explicitly and in grammar-compatible form (2/3 exact).
- Qwen conveys it indirectly or with synonyms, which reads naturally but is outside the grammar.
- Neither leaked other facts into Brenna's knowledge, and Maren's secret never appeared.

## N. State safety

**0 false-positive durable mutations** across 51 Stage B turns (Kimi, Qwen and MiniMax). All incorrect controller proposals were rejected:
- `place_item ring → nicco/finger` after Kimi's and Qwen's r25 narrations: `rejected_controller_mismatch`.
- `schedule_event "Burn the docks to ash" @ minute 11620` after Qwen's r509 narration (the controller converted "in 8 days" into a date): `rejected_time_not_exact`.

MiniMax's invented apparatus, medical equipment and NPC never reached state. The firewall is independent of narrator quality, as designed. This is a small positive sample, not a statistical guarantee. Stage A and the adult probe performed no CampaignState writes by construction.

## O. Engineering fit

- **Streaming:** all five streamed correctly through the unchanged OpenRouter client and narrator adapter.
- **Switching** is configuration only: `OPENROUTER_NARRATOR_MODEL=moonshotai/kimi-k2.5` plus `disable_reasoning: true`. Without that flag, Kimi and Qwen spend budget on hidden reasoning, which delays TTFT, can overrun the budget and can return empty content. This is the one model-specific requirement. The current production path (`onlineCoordinator`) does not set it yet; switching production would need that one config line (not done in this phase).
- **Naming:** `MiniMaxNarratorProvider` is a generic OpenRouter streaming adapter despite its name; a rename would be cosmetic.
- **Kimi** is served by several upstream providers (Novita, SiliconFlow, AtlasCloud) with different latency; output variance by upstream was not controlled. In the default-reasoning probe, one provider also exceeded `max_tokens`. Provider pinning could be evaluated later.
- **Qwen** has a single upstream (Alibaba), which returned 429 on 19/35 Stage A attempts. It was fine later in Stage B.
- **Truncation:** MiniMax's 6/16 truncations at 384 tokens mean the same turns would fail in production today, since the client treats `length` as invalid. Kimi and Qwen never truncated, finishing in about 50–300 tokens.
- **Offline verification:**
  - `npm test` **526/526** with network disabled and no API key (baseline 517; 9 new bake-off tests).
  - `npm run test:playthrough` **25/25**.
  - `npm run typecheck` passes.
  - Logs: `.build/phase-1m-tests.txt` and `.build/phase-1m-playthrough-tests.txt`.
  - The paid evaluation is never invoked by the test suites.

## P. Recommendation

**Preferred narrator: Kimi K2.5 (`moonshotai/kimi-k2.5`, reasoning disabled).**
- Versus the MiniMax baseline it has zero agency takeover (MiniMax: 4), zero truncation (6), zero serialization or template leakage (11+), zero relevance failures on lore (MiniMax: 2/2 failed), and the only fully correct Ironbound use.
- It has the most explicit, grammar-compatible communication, and the only state-recall gain in Stage B (knowledge TP).
- It has the strongest characterization when history is available.
- Trade-offs:
  - NPC knowledge leak (Maren, 2/2 on r43).
  - Stale history overriding current equipment (3 of 5 footwear-mentioning responses).
  - State recital and meta phrasing in thin fixtures.
  - One Nicco-dialogue invention in Stage B.
  - TTFT about 1.3 s (versus MiniMax's 0.8 s) and a multi-provider latency spread.

**Runner-up: Qwen 3.8 Flash (`qwen/qwen3.8-flash`, reasoning disabled).**
- Cleanest on agency and knowledge boundaries and the cheapest.
- It denied supplied lore 2/2, a hard retrieval failure. It also has explicit boots contradictions under history, indirect communication the grammar cannot confirm, and single-provider rate limiting.

**MiniMax baseline status:** not recommended to remain default. Its failures are not stylistic: it writes the player's turns, leaks serialized template and status data, and truncates at the production budget.

I have not changed the production default; the choice is yours. If adopting Kimi, the minimal step is to set the model and `disable_reasoning: true` in the dev/production narrator configuration.

**Next experiments (not implemented):**
1. A bounded TurnEvidence grammar extension from the traces above: list objects naming every offered item, participle "taking the three items", "take all three garments", "telling her that…", "stating that…". Also narrower hedge handling so "did not reach out immediately… rather than refusal" and "posture unchanged" do not veto a later explicit acceptance. This must stay model-neutral and precision-first, and must not loosen the firewall.
2. A Kimi prompt-compatibility check, reported separately from this untuned comparison, on its two failure classes: NPC knowledge leaks and historical-prose precedence.
3. Richer fixture prose for state-only cases, so narrators are not pushed into state recital by "Synthetic evaluation fixture" content.

## Q. Remaining uncertainty

- **Small samples:** 16 responses per model in Stage A and 17 turns in Stage B, with at most 2–3 repeats per case, so rates are indicative only.
- **One agent's judgment:** failure classification is agent-authored and needs human review. Tallies involve judgment calls (for example, restating player-supplied words versus inventing them).
- **Provider variability:** upstream routing (Kimi's three providers, Qwen's rate limits) and time-of-day effects were not controlled. Results were not tested for stability over days.
- **Fixture limits:** thin fixture content ("Synthetic evaluation fixture.") drives metadata echo and state recital for every model, which understates prose quality in state-only cases. Historical windows import stale details by design.
- **Untested scope:** sampling defaults differ per provider (none were sent). Reasoning-enabled Kimi was only probed, not evaluated.
- **Adult probe:** four prompts per model; it establishes absence of refusal, not a full content policy.

## R. Status

NARRATOR CANDIDATE SELECTED

---

### Appendix — artifacts

- `docs/evaluations/phase-1m-stage-a-20260928T2021.json`: manifest, all 113 attempt records (narration, finish reason, upstream, usage/cost, latency, run-time findings), summary with final-checker counts.
- `docs/evaluations/phase-1m-stage-b-20260928T2044.json`: 51 full-loop records including narrator request fingerprint, controller proposal, TurnEvidence, authorization, per-expected diagnosis and final state.
- `docs/evaluations/phase-1m-adult-probe-20260928T2039.json`: sanitized classifications only.
- Raw incremental runs: `.build/evaluations/phase-1m-stage-{a,b,adult}-*` (the adult raw text exists only here).
- Code: `src/dev/narrator-bakeoff.ts`, `src/dev/eval-narrators.ts`, `checkBakeoff` in `src/dev/narrative-checks.ts`, `NarratorOverride` in `src/dev/turn-services.ts`, `disable_reasoning` in `src/llm/openrouter/minimax-narrator.ts`, tests in `tests/narrator-bakeoff.test.ts`.
