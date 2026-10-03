# Phase 1R review: retrieval recall and grounded historical claims (2026-09-29)

**Reviewer:** Claude (implementation agent). Live classifications are agent-authored and **pending human review**. The detector is review-only.

**Unchanged:**
- Kimi (`moonshotai/kimi-k2.5`, reasoning off) and DeepSeek (`deepseek/deepseek-v4-flash-0731:nitro`);
- CampaignState, hybrid evidence authorization, NarrativeKnowledgeAccess semantics, ephemeral participants, persistence, `dialogue_focused` recent context, and the Phase 1Q canon-boundary policy (extended, not replaced).

**Not added:** an LLM, belief revision, overhearing, episodic memory, a travel graph, a production regex blocker, retries or a second narrator call. Retrieval validation bounds are unchanged (at most 5 candidates per search).

## A. Retrieval miss root cause

Diagnosed with `searchDebug` on the exact Phase 1Q inputs. The causes are generic, not specific to these sentences.

1. **The whole player input was the query**, including the roleplay action `*stops an ordinary passer-by*`. "ordinary", "passer" and "by" matched unrelated records: `heartstone_lr` has a feature named "ordinary illumination".
2. **Function words scored.** "the", "an", "to", "s", "when", "what" and "here" all contributed. The coverage bonus *squares* the summed IDF of matched tokens, and "here" and "what" are rare in canon, so high-IDF filler dominated. For example, `calderan` scored 349 (coverage 298) against the market's 221 on the route query, largely through "here", "an", "s" and "to".
3. **No morphology.** "auctions" did not match "auction", nor "pens" "pen". Nothing linked "slave auction" to the slave market, whose authored text says "sale", not "auction". `davenport` won on its single "auctions" occurrence.
4. **Exact-name bonuses only apply when the whole query equals a name or alias**, so they never helped a sentence that contains a name.

Result: the market ranked 7th (auction query) and 4th (route query), outside the top-3 cutoff.

## B. Query normalization

- **Engine (`lexical-index.ts`):** deterministic plural folding (`stem`: auctions→auction, pens→pen, cities→city, classes→class), applied identically to index and query. There is deliberately no derivational stemming: slave ≠ slavery, mage ≠ magic.
- **Query-side stopwords:** function words and conversational filler (`QUERY_STOPWORDS`), never applied to indexed text. If a query is only stopwords, all its tokens are used.
- **Turn policy (`retrievalQuery`):** removes participant-introduction phrases (reusing the participant grammar) and roleplay asterisks. Other action content is kept, e.g. `*walks toward the slave market*`.

## C. Alias/entity weighting

`entityMentions` (turn policy) finds entities the query names:
- **explicit (tier 2):** a name, alias or display name as a token run. Single-word names count only when capitalized ("Davenport", "Heartstone").
- **near (tier 1):** a multi-word name or alias with the entity's own ancestor names removed ("Calderan Slave Market" → "slave market"; "Calderan slave pens" → "slave pens"), matched on its last two tokens. A tiny head-noun equivalence (market ≈ auction ≈ sale) lets "slave auctions" name the market. "Slavery" never matches "slave" (tested).
- **qualifier conflict:** a near match is dropped when the query explicitly names a location outside the entity's ancestry that does not contain its parent. "Slave market in Davenport" therefore mentions only `davenport`.
- **deictic (tier 1):** "this tower" is resolved against the scene location, its ancestors and its connections, preferring the container (`heartstone`, not `heartstone_lr`).
- **Candidate protection:** mentioned entities are ranked first. If the lexical pool missed one, it is fetched with a name query, so it survives the top-3 cutoff.
- **Canon:** no aliases were added and `search_context` was not stuffed.

## D. Scene-locality ranking

`localityRank` is the position of the closest scene ancestor containing a placed location (square → Calderan → West → continent).
- It is applied only as a **tiebreak** among placed locations whose scores are within 85% of their group's top.
- It never outranks an explicit name and never filters. Live and benchmark: "Where is the slave market in Davenport?" and "Tell me about Davenport." return `davenport` first while standing in Calderan.
- It is ranking context only; NPC permission is still decided by awareness scope.

## E. Query intent

`queryIntent` uses priority route > schedule > history > location > lore. Listener or conversation questions stay unclassified ("Where are you going?", "What is your name?", "When will you be done?"; tested).
- **Retrieval trigger:** intent triggers retrieval, so history questions with no topic word now retrieve ("How long has this tower been empty?").
- **Grounding focus:** a generic `[QUESTION FOCUS]` line for route, schedule, history and location. For example: "Schedule question: times, days, hours or frequencies come only from supplied canon or state; otherwise the speaker does not know." It never contains an answer and is excluded from the `[RETRIEVED CANON]` JSON.
- **Latent bug found and fixed:** the Phase 1P lore pattern ended in `[a-z]\b`, so "What is Light magic?" never matched.

## F. Retrieval benchmark

**Phase 1R compact turn-level benchmark** (`src/dev/turn-retrieval-benchmark.ts`): 25 queries typed as a player would, from the opening scene. Groups: slave-market variants ×10, Davenport ×3, Heartstone ×3, Calderan ×2, Light magic ×2, Inquisition ×2, Ironbound ×3.

| | Top1 | Recall@3 | Recall@5 |
|---|---:|---:|---:|
| Turn policy (production) | **25/25** | **1.00** | **1.00** |
| Engine only (same stemmed engine, raw input, no policy) | 19/25 | 0.92 | 1.00 |

Every slave-market wording (market, markets, slave-market, auction, auctions, pen, pens, route, get to, and the full smoke input) puts `calderan_slave_market` at rank 1. The queries were authored by the implementer, so this is a regression gate, not an independent quality estimate.

**Phase 1H historical benchmark** (`npm run eval:retrieval`, lexical, 44 cases): no regression; improved.

| | Top1 | Recall@5 | MRR@5 | Multi-answer Recall@5 |
|---|---:|---:|---:|---:|
| Before 1R | 30/34 | 0.851 | 0.927 | 0.462 |
| After 1R | **31/34** | **0.894** | **0.951** | **0.615** |

- Ironbound, regional geography, magic and the known aliases (Port of Chains, Unchained Haven, Fortress on the Edge) all still pass.
- "where do pirates operate?" now retrieves blackwater, and "slave market border" now ranks khar_dune first.
- The remaining failures predate 1R: "pirate city", "church investigators", "legendary rare magic", "magic specializations", "slave trade West".

## G. Historical-claim policy

Added to `[CANON BOUNDARIES]`:
- History is canon-bearing: how long a place stood empty, who owned, built or lived in it, when something was founded, what a parent remembers. It must be supplied, never inferred.
- Being local permits using supplied local canon, not creating history.
- Personal experience ("I've never been inside") is allowed; persistent world history ("it's been empty since I was a child") is not.
- Natural uncertainty examples: "Before my time", "Never heard who owned it".
- **Fixtures:** small transient props (bucket, parcel, cup, cloth bundle) are free. Fixed or semi-permanent public fixtures (bench, trough, fountain, statue, pavilion) are canon-bearing scene architecture.

## H. Historical detector (review-only)

New `lore-grounding` categories:
- **`historical_claim`:** "has been X since/for", "was owned/built/founded/abandoned…", "used to belong/own", "belongs to the city/crown…", "for years/decades/generations", "since I was a boy/child", "long as I can recall", "my/her mother remembers/remembered/too", "empty since/for".
- **`permanent_fixture`:** trough, fountain, statue, bench, pavilion, well, monument and similar, unless supplied.

**Tests:**
- all 8 observed or brief-listed history forms are flagged;
- none of the 5 uncertainty or personal-experience lines ("I've never been inside", "Before my time", "Never heard who owned it", "No idea how long it's stood empty", "Couldn't tell you") is flagged;
- "stone drinking trough / bench" is flagged; "bucket / cloth bundle / cup" is not.

**False positives:** "Church keeps" (keep as a castle noun) was found live and fixed by dropping "keep". Grounded rumors are still flagged: "Folk say it's rare" and "They say it's one of the rare kinds" are supported by the `light_and_shadow` canon ("known through stories… rumor"). The rumor pattern cannot see canon support.

## I. Awareness audit

Records retrieved often in Phases 1P/1Q, classified from their authored text:

| Record | Decision | Reason (authored canon) |
|---|---|---|
| `heartstone_lr` | `private` | Interior of a private residence (Heartstone "is a private residence"); passers-by have not been inside |
| `heartstone_u1` | `private` | Same; its "full extent is not completely understood" |
| `heartstone_square` | `local:calderan` | Public open city space outside the tower |
| `main_city_structure` | `local:calderan` | Calderan's district themes: what residents plausibly know |
| `davenport` | `public` | West's principal port city, "The Port of Chains": basic identity |
| `light_and_shadow` | `public` | Authored as "known more through stories, records, rumor": common, story-level awareness |
| `inquisition` | `public` | Authored reputation: "feared" for its authority, secrecy and reputation |
| `learned_arts_guild` | `local:west` | "A national guild … in West" |
| `west_slavery` | **unclassified** | Mixed: legality is common in West, but trafficking networks (falsified provenance, corruption) are not ordinary knowledge. Needs a chunk split before classification |
| `frostspire` | **unclassified** | A distant East frontier town; ordinary awareness in Calderan is not established |

Retrieval and awareness stay separate. Live: `heartstone` itself (unclassified) was DO NOT USE for the passer-by in the history probes, which matches the correct behavior ("Never heard who owned it").

## J. Slave-market probes (live, 4 turns)

Export: `docs/evaluations/phase-1r-live-2026-09-29T0147.json`.

| Probe | Retrieval (top-3) | Narration | Classification |
|---|---|---|---|
| A r1 "When do the slave auctions happen?" | market, davenport, calderan (intent schedule, market near-named) | "The market's in the West District… as for when they hold the sales… I don't keep track." | correct grounded answer + natural uncertainty |
| A r2 | same | "Couldn't say. I know the market's in the West District… You want times, ask someone who works there." | correct + uncertainty |
| B r1 "What's the exact route…" | market, blackwater, main_city_structure (intent route) | "West District. That's all I could tell you." **plus a narrator meta sentence:** "She offers no streets, no turns, no gates—only that general direction and the flat statement that the market is publicly known." | correct; **meta-language** |
| B r2 | same | "That's in the West District… Can't give you streets or turns—I'm no guide" | correct; in-character route refusal |

- The Phase 1Q failures did not recur: no Davenport-only answer, no South District.
- Schedules invented: 0. Routes invented: 0. Named institutions invented: 0.

## K. Heartstone-history probes (live, 4 turns)

| Probe | Retrieval | Narration | Classification |
|---|---|---|---|
| C r1 "Who owned Heartstone before me?" | heartstone (explicit), cy, f1 (intent history) | "I wouldn't know. Never heard who owned it… Never been inside, myself. It's stood empty long as I've noticed it, but that's only my own years. Before my time…" | natural uncertainty. The "empty" line is explicitly personal and hedged: a borderline case |
| C r2 | same | "I couldn't tell you. Before your time, and before mine. Never heard who owned it… maybe someone at the market keeps records" | natural uncertainty; minor unsupported civic detail |
| D r1 "How long has this tower been empty?" | heartstone (deictic), f1, lr | "Can't say I've ever been inside, friend. Before my time, whatever happened there… You the one taking it over, then?" | natural uncertainty |
| D r2 | same | "Couldn't tell you. Before my time… Never saw anyone coming or going, myself. Never been inside… whoever keeps the property records" | natural uncertainty |

- **Phase 1Q comparison:** that run had "Empty since I was a boy… Belongs to the city…" and "empty long as I've lived in Calderan, and my mother too".
- **Now:** no invented ownership or history; the detector flagged 0 historical claims.

## L. Semantic contradictions

- **Resolved:** Calderan-market questions no longer produce Davenport-only answers (A ×2), and the wrong "South District" did not recur (B ×2).
- **Remaining (outside the targeted set):**
  - E r1 invented a lore detail, "Old tales about healers who could mend wounds with a touch". Canon does not associate Light with healing publicly; that association exists only in Nicco's private profile. It is not a Nicco disclosure, but it is ungrounded lore.
  - F r2 (ordinary chat) invented a schedule: "Market day's tomorrow". The detector caught it.
- **Grounded as expected:** E r2 stayed fully grounded (rare; Shadow too; not good or evil; the Church and Inquisition pay attention), matching public `light_and_shadow` and `inquisition`.

## M. State safety

- **Live:** 12 probes, 0 controller proposals, 0 authorized commands, revision 1 → 1 on every turn, false durable mutation 0.
- **Detector:** review-only; no narration is rejected, retried or patched.

## N. Prompt / token / latency impact

- **System prompt:** 3,161 → 3,772 characters (+611, about +150 tokens) for the history and fixture policy. `[QUESTION FOCUS]` adds about 150 characters only on classified questions.
- **Live medians (12 turns):** narrator prompt 2,745 tokens (range 1,840–2,952); completion 118.
- **Latency (medians):** TTFT 1.42 s; narrator total 2.16 s; full turn 2.93 s.
- **Retrieval:** median 2.1 ms, max 5.7 ms. It is still local and bounded: one pool search of ≤5, plus at most one name search per mentioned entity missing from the pool.
- **Cost:** $0.0176 for the 12 live turns.

## Offline verification (network disabled, API keys cleared)

- `npm test`: **714/714** (the Phase 1Q baseline was 705).
- **New tests:** `tests/retrieval-recall.test.ts` (9):
  - stemming;
  - query cleaning;
  - the intent table, including listener exclusions;
  - intent-triggered retrieval;
  - entity mentions (near names, head equivalence, qualifier conflict, deixis, slavery ≠ slave);
  - locality vs explicit naming;
  - the benchmark gate;
  - destination retrieval plus focus line for route/schedule/history;
  - history and fixture policy plus detector corpora.
- **Updated tests:** awareness maps (authoring, geography, world-canon), plural folding ("pirate" now matches "pirates"; "pirats"/"piracy" still do not), and the Phase 1H lexical top-1 30 → 31.
- `npm run test:playthrough`: **25/25**. `npm run typecheck`: pass.

## O. Remaining limitations

1. **Meta-language persists occasionally** (B r1 narrator sentence). The Phase 1Q prompt rule reduces it but does not eliminate it.
2. **Non-targeted invention:** a market-day schedule in ordinary chat; healer tales on the Light probe; vague record-keepers ("someone at the market keeps records", "property records").
3. **History boundary judgment is prompt-only.** Kimi complied in 4/4 probes, with one hedged personal line. Nothing deterministic prevents history invention.
4. **Detector:** lexical; grounded rumors are still flagged; meta sentences phrased as narration ("She offers no streets…") and invented lore details are missed.
5. **Benchmark independence:** the turn-level benchmark was authored with the fix and is a regression gate. The Phase 1H set is the independent check.
6. **Near-name matching** covers multi-word names and aliases with ancestor qualifiers. Single-word generic heads ("the market") rely on lexical ranking plus the locality tiebreak.
7. **`west_slavery` needs a chunk split** before it can be classified. `frostspire` stays conservative.
8. **Travel:** the slave market still has no `/go` connection.
9. **Out of scope:** overhearing, belief revision, long-term memory.

## P. Status

All Phase 1R success criteria are met in the targeted live set and offline:
- `calderan_slave_market` is top-3 (in fact top-1) for every wording variant;
- no Davenport-only answer and no South District;
- no invented Heartstone ownership or history in the 4 silent-history probes;
- 0 invented schedules, routes or institutions in probes A–E;
- 0 false durable mutations;
- the Phase 1H benchmark improved.

The residual issues (one meta sentence, non-targeted invention) belong to the general narrator-compliance track, not to retrieval or history grounding.

RETRIEVAL AND HISTORY HARDENED

---

### Artifacts
- `docs/evaluations/phase-1r-live-2026-09-29T0147.json`: 12 live probes with full prompts, retrieval query/intent/mentions/top candidates, access rows, grounding manifests, proposals and state.
- Code:
  - `src/retrieval/lexical-index.ts` (`stem`, `QUERY_STOPWORDS`);
  - `src/turn/retrieval-policy.ts` (`retrievalQuery`, `queryIntent`, `entityMentions`, `rankForTurn`);
  - `src/turn/scene-participants.ts` (`stripParticipantIntroductions`);
  - `src/turn/prompt-builder.ts` (history and fixture policy, `[QUESTION FOCUS]`);
  - `src/turn/turn-types.ts` (retrieval diagnostics);
  - `src/dev/turn-retrieval-benchmark.ts`;
  - `src/dev/lore-grounding.ts` (`historical_claim`, `permanent_fixture`);
  - `src/dev/eval-participants.ts` (`--set history`).
- Canon: awareness on 8 records (see I). No aliases or content changed.
- Tests: `tests/retrieval-recall.test.ts`.
