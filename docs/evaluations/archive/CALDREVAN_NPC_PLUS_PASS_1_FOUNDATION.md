# Caldrevan NPC+ Pass 1 — premium character foundation, context packing and recovery

**Date:** 2026-10-02. No commit or push; the working tree is left for review.
**Inputs:** the [H6 final audit](../CALDREVAN_HARDENING_H6_FINAL_AUDIT.md) and [H5.1 repair](../CALDREVAN_HARDENING_H5_1_LIVE_FINDINGS_REPAIR.md).
**Evidence:** `tests/npc-plus-pass-1.test.ts` (16 tests) and the deterministic stress matrix (section H).

## A. Architecture

| Piece | Location | Role |
|---|---|---|
| `PremiumCharacterState` domain | `src/campaign/types.ts`; `snapshot.premium_characters` | Persistent, authoritative premium state, keyed by `character_id` |
| Lifecycle | `src/campaign/premium-characters.ts` (`syncPremiumCharacters`) | Runs inside `CampaignState` preparation after every command of a proposal, so premium state changes only with a membership change, atomically, in the same revision |
| Context, packer, recovery | `src/turn/npc-plus.ts` | Tier B/C fragments, the single compact vocabulary, deterministic global packing, deep sources with stable handles, exact recovery |
| Integration | `context-builder.ts` (packed before the 32k check), `prompt-builder.ts` (`[NPC+ HOUSEHOLD CHARACTERS]`), `turn-diagnostics.ts` (`context.npc_plus`) | Context, prompt and diagnostics |
| Controller | stage `controller.ts` | `npc_plus` is stripped from the controller's prior state, as `npc_private_canon` already was |

**`runTurn`: 168 lines before, 168 after.** The coordinator is not touched by this pass.

**One-call narrator kept:** player input, then relevance, then pre-narration NPC+ recovery, then context, then one narrator call.

## B. PremiumCharacterState schema

```
PremiumCharacterState {
  character_id
  stable:   { personality_contract?, voice_contract?, moral_boundaries?[], baseline_social_style? }   // campaign-established overrides only
  dynamic:  { recent_developments: PremiumHistoryEntry[], long_term_summary?, private_memory_refs: fact_id[] }
  metadata: { created_revision, last_updated_revision, active_household_member }
}
PremiumHistoryEntry { kind: joined_household | left_household | rejoined_household | migrated_member, household_id, revision, world_minute }
```

**What it references and does not copy:**

- **Not stored:** legal status, location, membership, relationship values, conditions, inventory and canon biography. They stay in their domains.
- **`household_role`:** omitted from the record because `HouseholdMembership.role` is authoritative; it is rendered from there.
- **`active_household_member`:** kept as the brief asked, but strict snapshot validation requires it to equal current membership in a household Nicco keeps. It is an integrity-checked marker, not a second authority.
- **Stable fields:** empty in Pass 1. Authored traits and morality are **rendered from canon at context time and never copied** into the save, so unknown stays unknown and nothing is inferred from name, sex, species, profession or appearance.
- **No model call** creates or edits premium state.

**Validation rejects:**

- Nicco as NPC+;
- duplicate records;
- an unknown character, household or fact;
- an active flag that contradicts membership;
- a current member of a household Nicco keeps without premium state;
- future revisions;
- empty history.

## C. Lifecycle

| Event | Effect |
|---|---|
| A character becomes a current member of a household Nicco keeps (Nicco is a member with role `owner`), via `join_household` or `set_membership` | Creates premium state (`joined_household`) if absent, otherwise reactivates the same record (`rejoined_household`; `created_revision` unchanged) |
| Membership ends | Record kept, marked inactive, `left_household` appended; history is never deleted |
| Guest status, a household Nicco does not keep, relationships, purchase or legal holding, knowledge, presence, Nicco himself | **No NPC+** (tested) |

Origin is irrelevant: an authored NPC (Maren, Korvin) and a created character (Tomas, Lysa) both become NPC+.

## D. Context tiers

| Tier | Content | Where | Lossy? |
|---|---|---|---|
| **A** | Identity, location, legal status, membership, rules, conditions, knowledge permissions, relationship values | The existing turn context (H3 never-drop) | **Never.** Outside the NPC+ budget, and never traded for flavour |
| **B** | Present, active NPC+ named by the player, or addressed ("you") when they are the only present NPC+: personality / voice / morality / household role / stance toward Nicco / latest event / deep refs | `npc_plus.lines`, pinned | Compact, readable |
| **C** | Every other active NPC+: `Brenna: core=…; role=…; N{trust=M,wary=L}; recent=joined_household; away; deep=[…]` | `npc_plus.lines` | Deterministic caveman form, no generated prose |
| **D** | Canon background chunks, lifecycle history, campaign memories | Not in the prompt; stable handles only | Recoverable exactly |

**Vocabulary** (`NPC_PLUS_VOCABULARY`, the only one):

- **Dimensions:** `trust`, `wary`, `aff`, `prot`, `resp`, `fear`, `host`, `rom`.
- **Levels:** `0` none, `L` low, `M` moderate, `H` high.
- **Keys:** `core`, `voice`, `role`, `N{…}` (their relationship toward Nicco), `recent`, `deep`.

Every token renders exactly one authoritative value: `trust=M` *is* the relationship domain's `moderate`. There is no second copy, which is tested by changing the relationship and checking that premium state is unchanged while the rendering follows.

## E. Packer and recovery

**Packer (`packNpcPlus`)** is deterministic and makes no model or embedding call.

- **Signals:**

  | Signal | Weight |
  |---|---:|
  | Named or addressed by the player | +1000 (pinned) |
  | Present | +100 |
  | Non-`none` relationship toward Nicco | +10 |
  | Recency of the latest event | ≤ +5 |

  Ties break by snapshot order.
- **Order of filling:** pinned Tier B, then a pinned character's Tier C if their B does not fit, then optional Tier C by score, then up to 2 recovered PUBLIC deep sources that share a distinctive word with the input.
- **Output:** in stable snapshot order.

**Budget.** One global budget per scene: the smaller of **4,000 characters** and the **headroom left by the authoritative context** (32k minus the authority's serialized size minus a 600-character reserve, divided by a 1.1 JSON-escape factor). The budget is hard; pinned fragments get first claim on it.

This headroom rule was added after the stress check showed that a fixed 4k budget pushed the H3 mixed 30-person scene into `context_too_large` (section H). NPC+ now degrades toward Tier D and never causes the overflow itself.

**Recovery (`NpcContextRecovery { handle, character_id, kind, visibility, exact_payload }`).**

- **Handles are stable and source-based:** `npcmem:<id>:canon:<chunk_id>`, `npcmem:<id>:history:<n>`, `npcmem:<id>:knowledge:<fact_id>`.
- **Sources are derived on demand** from canon, premium state and runtime. There is no second store and no cache.
- **Recovery returns the exact source**, for example the canon chunk's full `content`.
- **Unknown handles and non-NPC+ characters return nothing.**

**Disclosure (H3 rules reused).**

- **Private sources are never rendered by NPC+.** These are narrator-only canon this character is `known_by`, and facts only they know; their visibility is `holder_private`.
- **Holder-scoped use of private canon stays on the existing `[NPC-PRIVATE CANON]` path.** Recovery permission is not disclosure.
- **Tested with Korvin's private background:** recovered exactly, absent from the NPC+ lines, at most once in the prompt (on the H3 holder line), not in player knowledge, and no knowledge state is created.
- **Narrator-only canon the character does not know is not recoverable.**

**Diagnostics** (`TurnDiagnostics.context.npc_plus`, no payload text): `active_count`, `candidate_fragments`, `selected_fragments`, `chars_before`, `chars_after`, `omitted_fragments` (candidates not used, including the unused alternate tier of a selected character), `recovery_refs`, `recovered`, `tier_counts {B, C, D}`.

## F. Authored NPC movement decision

**Decision:** canonical identity and background stay authored canon (YAML untouched). Once an authored character is an **active NPC+**, their current location is runtime-authoritative (`runtime.npc_locations`) and moves through the **same evidence and authority rules** as a created character.

**Changes:**

- `movableCharacters(…, world)` includes active authored NPC+.
- The `move_character` authorization accepts an active authored NPC+ only with completed narrated movement evidence.
- The absent-participant audit accepts an authored NPC+ that the prepared turn has already placed in the scene.

**Unchanged:**

- No automatic following; membership, ownership and requests never move anyone.
- Authored NPCs that are not NPC+ stay canon-placed.
- `leave_scene` stays created-only. An authored NPC+ narrated simply leaving, with no destination, is unrepresentable, and the H5.1 audit flags it.

**Tested:**

- An NPC+ Brenna follows from completed narration (authorized, audit clean).
- A request plus a proposal moves nobody.
- Membership without evidence moves nobody, and unsupported following is flagged as `uncommitted_movement`.
- A non-NPC+ Brenna with the same narration and proposal stays.

## G. Persistence migration

**Versions:**

- Snapshot schema **1 → 2** (`premium_characters` required).
- Save envelope **2 → 3**, via the explicit migration key `2`.
- Legacy v1 saves chain 1 → 2 → 3.

**Migration:** the 2 → 3 step converts the snapshot. With no other current members of a household Nicco keeps, the domain is **empty**. Otherwise it derives one record per such member (empty stable fields, a `migrated_member` history entry at the saved revision).

**Deviation from the brief, flagged:** the brief asked for "old saves load with an empty premium domain". Under strict validation, every current member must have premium state, so empty-only would have made old saves with members unloadable. The records are derived from the save's own authoritative membership, not inferred.

**Validation:** strict validation is not weakened. Old snapshots reach the current schema only through migration, and direct restore of a schema-1 snapshot is `unsupported_version`.

**Existing tests updated deliberately:** 7 version-bound assertions now encode the new versions (snapshot 2, envelope 3; legacy fixtures carry a schema-1 snapshot; broken legacy output now fails inside the real 2 → 3 step as `migration_failed`). No assertion was weakened.

## H. Context stress results

Real Calderan data, Heartstone Square. Created persons each have a voice and a relationship toward Nicco; "Person000, come here." is addressed. NPC+ characters are counts after packing.

| Scene | Total context | % of 32k | NPC+ before → after | Omitted (tiers B / C / D) | Result |
|---|---:|---:|---:|---|---|
| 1 present, 0 NPC+ / 1 NPC+ | 4,795 / 5,281 | 15.0 / 16.5 | — / 215 → 215 | 1 (1/0/0) | ok |
| 5 present, 5 NPC+ | 6,335 → 7,273 | 19.8 → 22.7 | 495 → 495 | 1 (1/4/0) | ok |
| 10 present, 10 NPC+ | 8,260 → 9,766 | 25.8 → 30.5 | 845 → 845 | 1 (1/9/0) | ok |
| 20 present, 20 NPC+ | 12,110 → 14,749 | 37.8 → 46.1 | 1,545 → 1,545 | 1 (1/19/0) | ok |
| 30 present: 15 NPC+ / 30 NPC+ | 15,960 → 18,033 / 19,729 | 49.9 → 56.4 / 61.7 | 1,195 / 2,245 | 1 (1/14/0) / 1 (1/29/0) | ok |
| H3 mixed (30 present, 64 facts, 32 events, 30 relationships, 64 knowledge edges) | 28,421 | 88.8 | — | — | ok |
| H3 mixed + 15 NPC+ (fixed 4k budget, **before** the headroom fix) | — | — | — | — | **context_too_large** |
| H3 mixed + 15 NPC+ (headroom budget) | 31,253 | 97.7 | 3,355 → 1,969 | 8 (1/7/7) | ok |
| H3 mixed + 30 NPC+ (headroom budget) | 31,471 | 98.3 | 6,325 → 1,573 | 25 (1/5/24) | ok |

**Reading:**

- NPC+ costs about 75–110 characters per member at Tier C, and Tier B about 215.
- The added total includes the members' Tier A household rows, which are authority, not NPC+.
- The H3 30-person case is not made structurally worse: NPC+ packs to the remaining headroom, and only genuine authority growth can now reach the 32k ceiling.
- **H6 debt 5 still stands:** a full household scene sits at 97–98%.

## I. Tests

**Results:**

| Run | Before | After |
|---|---|---|
| `npm test` (total / pass / fail / todo) | 1219 / 1215 / 0 / 4 | **1235 / 1231 / 0 / 4** |
| `npm run typecheck` | pass | pass |
| `npm run test:playthrough` | 25/25 | **25/25** |
| H2 golden | — | unchanged |

H3 secrecy and context, H4 persistence, H5 retry and the H5.1 movement and identity suites are all green.

**New tests (`tests/npc-plus-pass-1.test.ts`):**

- join creates NPC+ for authored and created characters;
- Nicco is never NPC+ (including a forged snapshot);
- leave preserves and deactivates; rejoin reactivates the same record;
- no other trigger creates NPC+;
- unknown personality stays unknown, and canon traits are rendered but not stored;
- relationship values are not duplicated;
- global budget, with Tier A intact at a tiny budget;
- deterministic packing, independent of membership order;
- exact recovery; private recovered memory is not rendered and is not player knowledge;
- old-save migration (empty and derived);
- save/load round trip, and a tampered active flag is rejected;
- authored NPC+ moves from completed evidence;
- a request alone, or membership, never moves them;
- authored non-NPC+ NPCs stay canon-placed;
- the prompt section appears only with NPC+;
- the stress matrix;
- the H3 mixed-scene headroom.

**Accidental impact on reconciliation and redaction:** none is possible in scenes without an active NPC+, because the context and prompt are byte-identical (no `npc_plus` field, golden unchanged). Live impact with NPC+ was not measured: there was no paid run, as the brief asked.

## J. Remaining debt

1. **Authored NPC+ simple departure** (no destination) is unrepresentable (`leave_scene` is created-only). The audit keeps the prose honest.
2. **Context ceiling:** full-household scenes reach 97–98% of 32k. NPC+ now yields, but authority growth (membership rows, knowledge edges) still has nowhere to go.
3. **Tier B content is thin until later passes write state.** Pass 1 writes no personality, voice or development content beyond lifecycle events; created characters show "unknown" until play or a later pass establishes them.
4. **Recovery relevance is a word-overlap rule** (≥5-letter words), with no paraphrase recall.
5. **Live reconciliation and redaction effect of the NPC+ section is unmeasured.** H6 debt 1 is unchanged.
6. **H6 carry-overs:** `runTurn` at 168 lines (not grown), live retry still unobserved, four H1 TODOs.

## K. Pass 2 recommendation

**Pass 2: deterministic premium state writers plus a small live check.**

1. **Write `recent_developments` from committed authoritative events** for NPC+ characters: relationship steps, condition changes, purchases or manumissions involving them, rules they are subject to. Store them as structured entries derived from commands in the same revision. Still no model.
2. **Establish stable contracts only from explicit evidence:** a player-authored or narrated self-description routed through the existing evidence and authorization path, never inferred.
3. **Add a bounded live matrix** (about 50 turns) for household scenes: measure reconciliation and redaction with the NPC+ section, prompt size and recovery hits.
4. **Leave autonomy, reflection, summarization and memory consolidation for Pass 3+,** once Pass 2 state exists to reflect on.

CALDREVAN NPC+ PASS 1 COMPLETE
