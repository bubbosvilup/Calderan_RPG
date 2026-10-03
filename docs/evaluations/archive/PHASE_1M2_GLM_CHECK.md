# Phase 1M.2 — isolated GLM 5.2 narrator check — 2026-09-28

Reviewer: Claude (implementation agent). Classifications are agent-authored and pending human review; no LLM graded anything.

Question: **does GLM 5.2 behave materially better than Kimi on the narrator problems currently blocking us?** Those problems are stale-history equipment and NPC knowledge leakage; this check also covers agency, record 115, `/tell` and Ironbound.

## A. Setup

- **Narrator:** `z-ai/glm-5.2`, verified in the live OpenRouter catalog. It supports `reasoning`; 1M context.
- **Controller:** `deepseek/deepseek-v4-flash-0731:nitro`, unchanged. Same policy, schema, TurnEvidence grammar, authorizer and CampaignState.
- **Request policy:** identical to production Kimi.
  - Generic OpenRouter narrator adapter.
  - `reasoning: {enabled: false}`, which GLM honoured: 0 reasoning tokens on every request and every run finished with `finish_reason: stop`.
  - 384 output tokens, no sampling parameters, streaming.
- **No code, prompt, grammar, fixture or default change.** The existing `npm run eval:narrators -- --model z-ai/glm-5.2` path was used. `DEFAULT_NARRATOR_MODEL` remains `moonshotai/kimi-k2.5`.
- **Upstream:** Baidu, on every GLM request.
- **Paid requests:** 44 GLM (1 probe, 24 targeted, 10 Stage A, 9 full-loop turns) and 10 paired Kimi. 0 provider failures.

## B. Cases

| Set | Cases | Comparison |
|---|---|---|
| Targeted, narrator-only | equipment: `eq_r173`, `eq_r53`, `eq_feet`; knowledge: `kn_r43`, `kn_supplies`, `kn_supplies_brenna_knows`. All `@1m1` (current prompt), ×4 each | **Byte-identical prompts** (same fingerprints) to the Phase 1M.1 Kimi `@1m1` run |
| Stage A, narrator-only, historical windows | Ironbound, r35 (agency), r173 (agency/secrets), r43 (multi-NPC, Gerome), r591 (multi-NPC), ×2 each | **Paired**: GLM and Kimi interleaved on the same current prompts |
| Stage B, full loop | r115 ×3, `/tell` ×3, r11 (ordinary dialogue), r47 (agency), r53 | GLM only; Kimi reference = Phase 1M.1 rerun and confirmation |

## C. Equipment precedence

Structured state says Brenna's boots are equipped and worn; the historical prose describes her barefoot.

| 12 targeted responses | Boots followed | Barefoot followed | No footwear assertion | Self-contradiction |
|---|---:|---:|---:|---:|
| Kimi (Phase 1M.1, same prompts) | 0 | 7 | 5 | 1 ("bare toes… boots still on her feet") |
| **GLM 5.2** | 1 | **9** | 2 | 2 explicit contradictions: "her boots sat worn and ready by the bed, but her feet were bare"; "feet that hadn't seen boots since before she arrived" |

- In paired Stage A r173, both models went barefoot 2/2. GLM #2 again moved the boots off: "the worn leather of her boots sitting beside her where she'd kicked them off earlier".
- Without historical prose (Stage B), GLM kept the boots, as Kimi does: "Her own worn leather boots stayed on her feet".
- **GLM is not better here, and it is somewhat more willing to rewrite the equipped state outright.**

## D. Knowledge isolation

Maren has no knowledge edge for the bridge fact.

| Case | Kimi: Maren states/acts on the fact | GLM: Maren states/acts on the fact |
|---|---:|---:|
| kn_r43 | 1/4 | **0/4** |
| kn_supplies (direct question to Maren) | 4/4 | 4/4 |
| kn_supplies_brenna_knows | 4/4 | 2/4 clear + 1 hedged ("But if the eastern bridge is closed…") + 1 avoided |
| **Total** | **9/12** | **6/12 clear, +1 hedged** |

- **Common-knowledge framing:** both models produce it. GLM once said "The eastern bridge is closed — everyone knows that".
- **Invented surrounding lore:** both invent it (ferries, apothecaries, wardens). GLM also once invented a Gerome capability ("Gerome can cross the riverbed").
- **Brenna:** in the variant where she legitimately knows the fact, she never voiced it for either model, since she is narrated as feverish.
- **Summary:** GLM leaks somewhat less on the less-tempting cases, but still leaks every time on the direct question. The sample is small and the difference isn't material for the blocker.

## E. Record 115 (full loop)

| Run | Narration | DeepSeek | TurnEvidence / authorization | State |
|---|---|---|---|---|
| #1 | "She takes the fluffy shirt first, turning it over in her large hands, then the cotton shirt, and finally the shorts, which she drapes across her lap." | 3 correct transfers | none; 3 × `rejected_insufficient_confirmation` | rev 1 → 1 |
| #2 | "She turned the thick fluffy shirt over… She took the cotton shirt next… added them to the pile… All three were accepted." | 3 correct | none; 3 rejected | rev 1 → 1 |
| #3 | "She took the pink cotton shirt, then the fluffy one, and finally the shorts, laying them across her lap." | 3 correct | `accepted_transfer` for **pink_cotton only**; the other 2 rejected | rev 1 → 2 (cotton only) |

- **Relevance, outcome and continuity:** GLM followed the handover every time, with a clear acceptance 3/3 (Kimi's fresh runs: 5 accepted, 3 refused; both are valid). It recited "carried but unworn" and kept the boots on. No agency violation.
- **Grammar misses (recorded, not fixed):**
  - GLM narrates the handover item by item across clauses or sentences ("first… then… finally", "the fluffy one", "next"), which the grammar does not cover.
  - Run #3 produced a **partial commit**: 1 of 3 garments. Only an expected command committed, so it isn't a false positive, but the resulting state (cotton shirt only) is narrower than the narration (all three).
- **Online TP:** 1/9 garment commands for GLM, versus Kimi's held-out confirmation of 6/9 across its accepted runs.

## F. `/tell` knowledge case (full loop)

| Run | Explicit telling narrated | Result |
|---|---|---|
| #1 | no. Brenna repeats "The eastern bridge… Closed." but no telling is narrated | rejected (fact not communicated) |
| #2 | no ("absorbing the news") | rejected |
| #3 | yes: "Nicco tells Brenna that the eastern bridge is closed." | **authorized**, told edge, rev 1 → 2 |

- GLM added **no invented bridge lore**. Kimi added some in several runs ("the old stone crossing past the mill", "only passable route to the low markets").
- GLM never gave the fact to Maren; she "looked up at the mention", which is hearing, not stating.
- GLM narrates Nicco's act of telling less often (1/3, versus Kimi 8/8 across its rerun and confirmation), so fewer commits under the current grammar.

## G. Ironbound

Supplied fact: "Ironbound is a guild of smiths. No other lore about it is established."

| Run | Kimi | GLM |
|---|---|---|
| #1 | fact used, no extra lore | fact used ("no halls named, no masters listed…"), no extra lore |
| #2 | fact used, then **Nicco speaks, reaches for the cup and invents backstory** ("You were fevered, bound in iron. I cut you free.") | fact used ("That much is common enough"), no extra lore |

Both respect retrieval. Neither denies the fact or invents replacement lore.

## H. Player agency / continuity

| Response set | Kimi | GLM |
|---|---|---|
| Paired Stage A (10 each) | **1 takeover** (Ironbound #2) | 0 |
| Targeted (24 each) | 0 | 0 |
| Stage B (GLM 9; Kimi rerun 17) | r509 invented Nicco disclosure; r47/r173 echo the player's words as Nicco dialogue | 0; r47 no echo |

- **Comprehension:** GLM read r53 correctly (Brenna "drawing herself up against the wall as instructed"). Kimi misread it as addressed to Gerome in both earlier Stage B runs.
- **Gerome:** silent in every response from both models.
- **Speaker clarity:** good for both.
- **GLM habits:**
  - Tense drift within replies (present to past).
  - Some reportorial or meta lines: "The room contains what it has been described to contain", "not listed among carried equipment", "carried but unworn".
  - Carries historical props (e.g. "a man in pink shorts").
- **Kimi's Brenna voice** is slightly more distinctive. Overall dialogue and roleplay quality is comparable.

## I. Latency / cost

Small samples; single runs per window.

| | TTFT median (p25–p75), ms | Narrator total median, ms | Full turn median | Reported narrator cost |
|---|---|---|---|---|
| Targeted, same 24 prompts: Kimi 1M.1 | 1,354 (1,296–1,662) | 7,222 | — | $0.0270 |
| Targeted: **GLM** | **893** (819–1,185) | **4,222** | — | **$0.0124** |
| Paired Stage A (10): Kimi | 1,167 (983–1,414) | 4,362 | — | $0.0132 |
| Paired Stage A (10): **GLM** | **906** (839–1,045) | **3,679** | — | **$0.0046** |
| Stage B: Kimi rerun (17) / confirmation (10) | 1,112 / 797 | 3,876 / 2,578 | 4,572 / 3,563 | — |
| Stage B: **GLM** (9) | **719** (687–787) | 3,027 | 4,057 (3,820–4,214) | $0.0029 (+ controller $0.0038) |

- **Tokens:** GLM targeted used 64,596 prompt / 5,108 completion tokens; paired Stage A GLM 25,390 / 1,808 versus Kimi 25,352 / 1,725. GLM prompts in the full loop were about 12.9k.
- **Upstreams:** GLM was served by Baidu only; Kimi by Novita, SiliconFlow and AtlasCloud.
- **Experiment total reported:** about $0.046 (GLM $0.0203 narrator + $0.0038 controller, paired Kimi $0.0132, probe $0.0005).

## J. State safety

- **0 false-positive durable mutations** in GLM's 9 full-loop turns, and 0 incorrect controller proposals.
- The only commits were expected commands: cotton shirt only in r115 #3, the told edge in `/tell` #3, and no others.
- Authorization was not loosened.
- **Noted risk:** r115 #3's partial commit leaves state narrower than the narration. That is safe but inconsistent, and caused by the grammar, not the model.

## K. Offline verification

With no code changes, network disabled and the API key removed: `npm test` 581/581, `npm run test:playthrough` 25/25, `npm run typecheck` passes.

## Comparison

| Problem | Kimi observed | GLM 5.2 observed |
|---|---|---|
| Player agency | occasional takeover (1/10 paired; r509 disclosure; echoing player lines) | none observed (0/44) |
| Stale-history equipment | 7/12 barefoot, 1 self-contradiction | 9/12 barefoot, 2 explicit rewrites of equipped boots |
| NPC knowledge leak | 9/12 | 6/12 (+1 hedged); still 4/4 on direct question |
| Retrieval use | 2/2 correct | 2/2 correct |
| Persistent invention | bridge lore, NPC lore in tempting cases | similar lore in tempting cases; one Gerome capability; no bridge lore in `/tell` |
| Scene relevance | good; r53 misread twice | good; r53 read correctly |
| Dialogue / RP quality | strong, slightly more distinctive Brenna | strong; some tense drift and meta or recital lines |
| Explicit, grammar-compatible outcomes | high (`/tell` 8/8 explicit) | lower (`/tell` 1/3 explicit; item-by-item handovers) |
| TTFT (median) | about 0.8–1.35 s | about 0.7–0.9 s |
| Total narrator latency (median) | about 2.6–7.2 s | about 3.0–4.2 s |
| Cost (same prompts) | baseline | about ½ or less (Baidu routing) |

## Conclusion

GLM 5.2 is a credible narrator, and on agency, comprehension, latency and cost it compares favorably in this small sample. It does **not** materially improve the two blocking problems:
- **Equipment precedence** is as bad or worse, with explicit rewrites of the equipped boots.
- **Knowledge isolation** is only marginally better, and still 4/4 leaks when the conversation invites it.

Under the current grammar, its item-by-item and implicit style also yields fewer commits, including one partial commit. On this evidence the blockers are not narrator-specific, and switching would not remove them. GLM is worth keeping as a configured alternative.

KIMI STILL PREFERRED

---

Artifacts:
- `docs/evaluations/phase-1m2-glm-check-20260928T2146.json`: all four runs (probe, targeted, paired Stage A, Stage B), with manifests, records and summaries.
- Raw runs in `.build/evaluations/`:
  - `phase-1m-stage-a-2026-09-28T2146` (probe)
  - `phase-1m-stage-targeted-2026-09-28T2146`
  - `phase-1m-stage-a-2026-09-28T2148`
  - `phase-1m-stage-b-2026-09-28T2150`
- Test logs: `.build/phase-1m2-tests.txt`, `.build/phase-1m2-playthrough-tests.txt`.
