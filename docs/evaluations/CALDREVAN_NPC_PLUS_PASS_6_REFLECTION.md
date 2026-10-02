# Caldrevan NPC+ Pass 6 — bounded, evidence-cited reflection

**Date:** 2026-10-02. No commit or push.
**Inputs:** the [Pass 5](CALDREVAN_NPC_PLUS_PASS_5_LIVE_REBASELINE.md) and [Pass 3](CALDREVAN_NPC_PLUS_PASS_3_CONSOLIDATION_RECALL.md) reports.
**Evidence:**

- `tests/npc-plus-pass-6.test.ts` (9 tests, model stubbed);
- two live runs: `h5-live/npcplus6.jsonl` (48 turns) and `npcplus6b.jsonl` (36 turns, after the faithfulness fix);
- a human review of all 140 accepted notes.

**Status: COMPLETE.**

| Run | Before | After |
|---|---|---|
| Tests (total / pass / fail / todo) | 1260 / 1256 / 0 / 4 | **1269 / 1265 / 0 / 4** |
| Replay | — | 25/25 |
| Golden | — | unchanged |
| `runTurn` | 164 lines | **164 lines** (untouched) |

**One flagged limitation (section G):** the model still slightly over-interprets in about 4 of 55 notes ("recurring" from a single episode). These are not forbidden categories, so the deterministic validator cannot judge them.

## A. Architecture

```
turn commits normally (runTurn unchanged)
  └─ explicit post-turn step: reflectAfterTurn(campaign, world, provider)          src/turn/reflection.ts
       due check (≥3 new developments | roll-up changed | new contract)
       → evidence catalog (public sources only)
       → ONE structured call (cheap controller-class model)                        src/llm/openrouter/reflection-provider.ts
       → strict parse (off-schema or >6 proposals ⇒ whole output fails closed)
       → deterministic validation of each proposal
       → deterministic merge + per-kind caps
       → separate `record_reflection` revision against the evidence revision (a newer turn ⇒ stale ⇒ dropped)
```

**Never authority.** Reflection writes only the new `premium_reflections` domain. It never touches relationships, contracts, legal status, membership, conditions, location, inventory, knowledge or canon. This is tested: every other domain is byte-identical after a committed reflection.

**Failure is harmless.** A provider error, malformed output or a stale revision changes nothing and cannot affect a turn.

**Integration.** The live harness runs it after each completed turn with `--reflect`. The engine provides `reflectAfterTurn` as the post-turn operation, and the CLI play loop is not yet wired (debt).

## B. Schema (snapshot schema 2, unreleased in this working tree)

```
PremiumReflection { character_id, notes: ReflectionNote[], last_reflected_revision }
ReflectionNote   { id ("r<rev>_<kind>_<n>"), kind: stance | signature_pattern | shared_motif | emerging_role | unresolved_tension,
                   label (snake_case ≤ 32), text (≤ 200), evidence_refs[1..8], confidence: low | medium | high,
                   created_revision, updated_revision }
command          record_reflection { character_id, notes, reflected_revision }   // active NPC+ only
```

**Campaign-layer validation:**

- unique note IDs;
- per-kind caps;
- bounded text and refs;
- no future revisions;
- evidence handles of **this character only** (`npcmem:<id>:…` or `npcrel:<id>:x` / `npcrel:x:<id>`).

**Migration.** The legacy 2 → 3 migration adds `premium_reflections: []`; three legacy-save test builders were updated to drop the new domain.

## C. Trigger policy

**Due when an active NPC+ has any of:**

- ≥3 recent developments after `last_reflected_revision`;
- a roll-up whose `last_revision` is newer;
- a newly established contract.

**Never due** from conversation alone, or with only the joining entry.

**Bounds:**

- At most `max_characters` per post-turn step: 1 by default, 2 in the live harness.
- An all-rejected run still records `last_reflected_revision`, so the same evidence is not re-sent every turn.

## D. Evidence validation (deterministic, per proposal)

**Catalog.** The catalog holds what exists now for that character:

- recent developments, presented as **explicit sentences** stating what was recorded and what was not (cause, author);
- the roll-up;
- contract evidence;
- **public** canon;
- current relationship state.

**Private sources (holder-private canon, NPC-only facts) are never in the catalog** and cannot be cited (tested with Korvin's private chunk).

| Check | Rule |
|---|---|
| Shape | Kinds, label pattern, text ≤ 200, 1–8 unique refs, confidence enum; extra fields rejected |
| Evidence exists | Every ref must be in the catalog: invented or stale handles become `unknown_evidence` |
| Minimum evidence | stance: a strong ref (relationship state, roll-up ≥2, contract) or ≥2 refs; pattern / motif / role: ≥2 events; tension: ≥2 refs **and** a contrast word (but, while, yet, although, though, despite, even as, whereas, versus) |
| Forbidden inference | romance or attraction; diagnosis or trauma; secrets, hidden motives, backstory or childhood; absolute or official claims; **reliance, dependence, reciprocity** (added after live review) |
| People | Named people must be the character, Nicco, or someone the cited evidence involves. Any other capitalized mid-sentence word must be a known non-character world name: no invented people. |
| Duplicates | Same kind with the same label or normalized text within one batch is rejected |

## E. Merge and caps

**Matching is deterministic**, never fuzzy and never cross-topic.

- A proposal **updates** the existing note of the same kind with the **same label or same normalized text**: its text, confidence and refs are refreshed, while its ID and creation revision are kept.
- Otherwise it is added.

**Pruning.** Existing notes lose refs that no longer resolve (for example, history rotated into the roll-up). A note with no refs left is removed: no evidence, no note.

**Caps:** stance 4, signature_pattern 4, shared_motif 4, emerging_role 3, unresolved_tension 3. Overflow drops the lowest confidence first, then the oldest update.

## F. Context and recovery

- **Tier B** shows at most **2** notes (`reflection: unresolved tension "…"; stance "…"`).
- **Tier C** shows **1** token (`refl=tension:trust_and_wariness`, `stance:…`, `pattern:…`, `role:…`, `motif:…`).
- **Ranking:** confidence, then kind priority (tension > stance > pattern > role > motif), then recency.
- **The 4k global budget is unchanged.** The H3 mixed scene plus 30 NPC+, each at full reflection caps, stays under 32k (tested).

**Recovery:**

- `npcmem:<id>:reflection:<note_id>` returns the exact note (`type: "reflection_note"`, text, refs, confidence, revisions).
- Contract evidence is now recoverable at `npcmem:<id>:contract:<n>`.
- Reflection is narrator context only: never player knowledge, never authority.

## G. Live reflection examples (human-reviewed)

**Setup.** Household scenes (Brenna and Maren as NPC+) seeded with committed developments. Six themes: care, disagreement, protection, ritual, contradiction, unrelated.

**Run 1 (48 turns) found a faithfulness defect.** Of 85 accepted notes, about **12 were unsupported**:

- **8 claimed rule authorship** ("Brenna joined the household and immediately contributed two new rules", "Maren is actively shaping the group's operating norms"). The evidence only recorded that a rule was added to their household.
- **2 misread direction or reciprocity** ("Trust from Nicco rose", "may not be fully reciprocated").
- **2 claimed reliance** ("especially relying on Maren's protectiveness", "leans on Nicco").
- Several "within the same minute" or "rapid" claims came from my seeding all events at world minute 0, a scenario artifact.

**Root cause:** developments were given to the model as raw JSON.

**Fix:**

- Each development is rendered as an explicit sentence, for example "A household rule was added to a household Brenna belongs to. Who proposed it is not recorded; it is not Brenna's act", or "Brenna's trust toward Nicco moved low → moderate. A recorded state change; what caused it is not recorded".
- The prompt forbids causes, authorship, reliance and reversed relationship direction.
- Scenario seeds are spread half a day apart.
- Reliance, dependence and reciprocity became deterministic rejections.

**Run 2 (36 turns, after the fix):**

- 55 accepted notes: **0 authorship claims, 0 direction errors.**
- 4 notes with mild overreach: one "developing reliance" and one label "reciprocal_wariness", both now rejected by the guard; two "recurring setback" readings of a single injury episode, residual.

**Representative accepted notes (run 2):**

- *unresolved_tension*, Brenna: "Trust toward Nicco reached moderate while affection remained low, leaving an imbalance between closeness and warmth in that bond." (3 refs)
- *signature_pattern*, Brenna (contradiction scene): "Her trust and wariness toward Nicco have risen in parallel steps, showing a cautious engagement pattern." (4 refs). The contradiction is kept, not flattened.
- *stance*, Maren: "Maren's protectiveness toward Brenna has grown over time and is now moderate." (3 refs)
- *signature_pattern*, Maren: "Two household rules were added over time while Maren belonged to the household, though she did not propose them." (2 refs)

| Live metric | Run 1 | Run 2 |
|---|---:|---:|
| Turns / success | 48 / 100% | 36 / 100% |
| Reflection calls (all committed, none malformed or failed) | 64 | 48 |
| Accepted / rejected proposals | 85 / 29 | 55 / 26 |
| Unsupported accepted notes (human review) | ~12 (14%) | 4 (7%) → 2 now guard-rejected |
| Duplicate notes | 0 | 0 |
| Turn reconciliation / redaction | 10.4% / 4.2% | 8.3% / 2.8% |
| Wrong commits / unexpected kinds / leaks | 0 / 0 / 0 | 0 / 0 / 0 |
| Context average | 5,051 | 5,052 |
| Reflection tokens (in / out) and cost | 63.6k / 10.6k, about $0.014 | 46.2k / 7.0k, about $0.010 |
| Turn cost | $0.113 | $0.085 |

## H. Rejected examples

**Live, both runs, 55 rejections in total:** `insufficient_evidence` 23, `invalid_shape` 16, `tension_without_contrast` 16.

- **insufficient_evidence:** "Brenna begins as a tall woman still recovering from an illness, suggesting early caution." This is a stance citing canon only.
- **invalid_shape:** labels with spaces or more than 4 words ("recovering household member").
- **tension_without_contrast:** "Brenna shows both low trust and low hostility toward Nicco…". Two lows are no tension; rejected correctly.

**Deterministic tests:** secret plans, falling in love, childhood, trauma, "completely", unsupported or invented people, invented handles, reliance and reciprocity are all rejected, and more than 6 proposals fails the whole output closed.

## I. Safety and correctness

| Check | Result |
|---|---|
| Non-authority | Every other domain is byte-identical; reflection never changes state outside its own domain |
| Every note has valid evidence | Enforced at both layers; refs are pruned and notes removed when evidence vanishes |
| Contradictions preserved | Tension notes kept in the contradiction scenario |
| Fail-closed paths | Malformed, provider failure and stale all leave state untouched (tested) |
| Private evidence | Never in the catalog; citing it is `unknown_evidence` |
| Bounded state and context | Per-kind caps; Tier B 2, Tier C 1; 4k cap; 32k stress test |
| Turns | `runTurn` untouched |

**Live:** 0 wrong commits and 0 leaks across 84 turns.

## J. Remaining debt

1. **Semantic over-interpretation residue** (about 2/55 after the guard: "recurring" from a single episode) cannot be judged deterministically. Mitigated by caps, confidence and "interpretation only" rendering.
2. **The CLI play loop does not call `reflectAfterTurn` yet.** Only the harness does.
3. **Live reflection has used seeded histories.** Organic live development volume is low (Pass 5), so reflection will trigger rarely in real play.
4. **Reflection-call latency is not recorded** in diagnostics (only tokens).
5. **Carry-overs:**
   - retry not live-exercised;
   - non-retryable controller output (~1 per 100–570 turns);
   - `uncommitted_condition` as the leading audit issue;
   - the 32k ceiling for full households;
   - authored destination-less departure;
   - four H1 TODOs.

## K. Recommendation for Pass 7

1. **Wire `reflectAfterTurn` into the play loop** as a non-blocking post-turn step, with timing and outcome diagnostics.
2. **Add an organic-history live check:** longer multi-turn household sessions without seeding, to see real trigger rates and note quality.
3. **Optionally,** a second deterministic faithfulness rule: "recurring" or "repeated" wording requires ≥2 distinct episodes (not an add/remove pair of one episode).

Reflection autonomy, goals and personality evolution remain out of scope until organic data shows stable, faithful notes.

CALDREVAN NPC+ PASS 6 COMPLETE
