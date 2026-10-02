# Caldrevan NPC+ Pass 2 — deterministic character development and live household check

**Date:** 2026-10-02. No commit or push.
**Inputs:** the [NPC+ Pass 1](CALDREVAN_NPC_PLUS_PASS_1_FOUNDATION.md) and [H6](CALDREVAN_HARDENING_H6_FINAL_AUDIT.md) reports.
**Evidence:**

- `tests/npc-plus-pass-2.test.ts` (11 tests);
- the live run `h5-live/npcplus2.jsonl` (48 turns, with summary);
- the stress matrix rerun.

## A. Executive result

**Status: COMPLETE.**

**What Pass 2 adds:**

- **Developments:** NPC+ now accumulates structured development history, derived only from committed authoritative changes.
- **Contracts:** stable personality / voice / social / moral contracts can be established only from explicit, quoted, first-person self-descriptions.
- **Retention:** bounded at 16 entries per character.
- **Rendering:** compact, relevance-ranked development tokens in Tier B and C, and exact structured recovery.

**Unchanged:**

- No model call, reflection, summarization, autonomy or personality inference.
- Controller and narrator architecture unchanged.
- `runTurn` stays at **168 lines**.

| Check | Result |
|---|---|
| Developments only from committed changes | yes: derived inside `prepare` from domain diffs; rejected, failed and replayed turns write nothing (tested) |
| No duplicate authority | yes: history only; current values stay in their domains (tested) |
| Contracts need explicit evidence | yes: 4 strict quoted patterns; 10 negative forms tested |
| Retention bounded | 16 newest entries, enforced at write and by validation |
| Recovery exact / private stays private | yes / yes |
| 32k stress scene (H3 mixed + 30 NPC+ with developments) | fits at 97.9% |
| Live NPC+ scenes | 48/48 success; 0 wrong or unexpected commits; 0 secret leaks; 0 unsupported contracts |
| Tests (total / pass / fail / todo) | 1235 / 1231 / 0 / 4 → **1246 / 1242 / 0 / 4** |
| Replay / golden | 25/25 / unchanged |

## B. Development event model

`PremiumHistoryEntry` is a closed, validated tagged union, stamped `{revision, world_minute}`:

| Kind | Fields | Written when the revision changes… |
|---|---|---|
| `joined_household` / `left_household` / `rejoined_household` / `migrated_member` | `household_id` | membership (Pass 1 lifecycle) |
| `relationship_changed` | `actor_id`, `other_id`, `dimension`, `from`, `to` | any dimension of an edge from or to them |
| `condition_added` / `condition_removed` | `condition` | their conditions |
| `legal_status_changed` | `from`, `to` (`free`, `enslaved`, `unestablished`), `holder_id?` | their legal status or holder |
| `person_transaction` | `transaction_id`, `transaction_kind` | a new ledger transaction with them as subject (sale, gift, assignment, manumission) |
| `household_rule_added` | `household_id`, `rule_id` | a new rule in a household they are a current member of |
| `moved` | `from?`, `to?` | their location (created record or authored runtime location); registration is not movement |
| `contract_established` | `field` | a campaign contract was set |

**How entries are written.** `syncPremiumCharacters` runs inside `CampaignState` preparation after a proposal's commands and **diffs the base and draft domains**. So an entry exists only in the same atomic revision as the committed change it records. A rejected proposal never reaches preparation, a failed turn never commits, a second receipt or a replay is stale, and narration alone changes no domain. All of this is tested.

**Ordering** is fixed by category, then by ID within a category. The same batch in a different command order gives byte-identical premium state (tested).

**No duplicate authority.** An entry is history: after `trust` goes low → moderate → low, both entries remain and the renderer shows the relationship domain's current value (`N{trust=0}`). Current state always wins.

## C. Stable contract evidence

**Source.** The only campaign source is an **explicit, unhedged, quoted first-person self-description**, attributed (existing speaker attribution) to a present **active** NPC+ in the **delivered** narration. Authored canon remains rendered from canon and is never copied.

**Path.** Contracts are established in commit preparation, the existing deterministic delivered-narration step that already establishes names, as an `establish_character_contract` command prepared with the turn. If it cannot be prepared it is dropped observably; the turn and its identity changes are kept.

| Field | Pattern (whole sentence) | Stored as |
|---|---|---|
| `moral_boundary` | "I will/would/shall never\|not…", "I'd never…", "I won't (ever)…", "I never…" + *hurt, harm, kill, strike, beat, abuse, betray, steal from, lie to, abandon, sell, torture* + a general object (not you/him/her/them/it/this/that/me/us) | `never hurt children` (accumulates, distinct) |
| `voice` | "I (always) speak plainly\|frankly\|bluntly\|softly\|quietly\|honestly\|my mind"; "I don't mince words" | `speaks plainly` (set once) |
| `social_style` | "I don't/never like\|trust\|care for crowds\|strangers\|nobles\|soldiers\|mages\|noise\|company\|people" | `dislikes crowds`, `distrusts strangers` (set once) |
| `personality` | "I've always been X (and Y)" | `stubborn` (set once) |

**Vetoes:** shared gates (`audit_hypothetical`, `captive_fact_hedge`) and a question mark. **Never a contract** (tested):

- behaviour ("hesitates, quiet and shy");
- a single reaction ("shouts once");
- a situational promise ("I won't hurt you");
- hedged ("Maybe I've always been…"), questioned or conditional statements;
- another speaker's claim about them;
- narration's own voice;
- "I don't like this".

**Stability.** An established set-once field is never rewritten. Later contradiction ("I always speak softly") is ignored by evidence extraction, and the campaign layer rejects a direct rewrite. Each contract keeps its verbatim quote and revision (`stable.contract_evidence`) and adds a `contract_established` development.

**Player-authored establishment was not added.** Dictating an NPC's inner traits from the player's side would cut against the existing NPC-agency stance. This is flagged as a deliberate omission.

## D. Retention

**Policy:** the **newest 16 entries per NPC+** (`PREMIUM_DEVELOPMENT_RETENTION`). They are appended in revision order and the oldest are dropped at write time. Snapshot validation rejects more than 16.

**What survives rotation:**

- `metadata.created_revision`;
- the stable contracts with their evidence (not subject to retention);
- the current truth in every domain.

**Rotation does not erase character continuity:** after rotation, the household lifecycle survives as metadata plus current membership. Longer history belongs to a later consolidation pass; nothing is summarized here.

## E. Context rendering and recovery

**Tier B** (pinned, present and addressed) shows:

- personality, voice, social style, morality (campaign contracts first, then authored canon);
- household role;
- relationship toward Nicco;
- up to **3** developments, chosen by deterministic relevance and shown chronologically.

**Relevance** weights:

| Signal | Weight |
|---|---:|
| Development's subject matches player-input words | +40 |
| Involves Nicco, or a transaction | +20 |
| Involves another named NPC+ | +10 |
| Recency | rank |

**Tier C** shows `core`, `voice`, `social`, `role`, `N{…}` and up to **2** development tokens, from the single documented vocabulary: `trust>N:L→M`, `+cond:injured`, `-cond:injured`, `legal:enslaved→free`, `sale` / `gift` / `assignment` / `freed`, `rule+`, `moved:<location>`, `contract:<field>`, `joined` / `left` / `rejoined` / `migrated`. Example: `Tomas: core=?; role=?; N{trust=L}; recent=-cond:injured,trust>N:0→L`.

**Recovery.**

- **Handles are now stable across retention:** `npcmem:<id>:history:r<revision>.<ordinal>`.
- **The payload is the exact structured entry** (JSON), which is tested by deep equality.
- **Canon and knowledge recovery and private-source handling are unchanged from Pass 1:** private material is never rendered by NPC+.

## F. Headroom

The Pass 1 matrix was rerun, with created persons that have a voice and a relationship toward Nicco.

| Scene | Pass 1 total (% of 32k) | Pass 2 total (% of 32k) | NPC+ after packing (Pass 2) | Tiers B / C / D |
|---|---:|---:|---:|---|
| 1 NPC+ | 5,281 (16.5) | 5,320 (16.6) | 254 | 1 / 0 / 0 |
| 5 NPC+ | 7,273 (22.7) | 7,416 (23.2) | 638 | 1 / 4 / 0 |
| 10 NPC+ | 9,766 (30.5) | 10,041 (31.4) | 1,118 | 1 / 9 / 0 |
| 20 NPC+ | 14,749 (46.1) | 15,282 (47.8) | 2,078 | 1 / 19 / 0 |
| 30 present, 30 NPC+ | 19,729 (61.7) | 20,522 (64.1) | 3,038 | 1 / 29 / 0 |
| **H3 mixed + 15 NPC+** | 31,253 (97.7) | **31,337 (97.9)** | 2,053 | 1 / 7 / 7 |
| **H3 mixed + 30 NPC+** | 31,471 (98.3) | **31,325 (97.9)** | 1,429 | 1 / 4 / 25 |

**Reading:**

- The 4k maximum is unchanged.
- The headroom-aware budget keeps the H3 mixed scene representable. A dedicated test adds three relationship developments to each of 30 members and still fits under 32k with the addressed member pinned at Tier B.
- **Priority holds:** authority > B > C > deep/history.

## G. Live household evaluation

**Setup.** Fixture tower with a household Nicco keeps; Brenna, Maren and Gerome are active NPC+. **8 scenarios × 6 runs = 48 turns**, production retry, GLM 5.2 narrator and DeepSeek controller. Cost **$0.132** (219k / 10k narrator tokens, 186k / 0.6k controller tokens).

| Metric | Value |
|---|---|
| Turn success | 48/48 (no retries needed) |
| Reconciliation / redaction | **25.0% / 2.1%** (12 reconciled: 11 clean revisions, 1 redacted) |
| Reconciliation excluding the follow scenario | 6/42 = 14.3% |
| Total turn p50 / p95 | 5.9 / 10.5 s |
| Context size | average 4,647, max 5,086 characters (~16% of 32k) |
| NPC+ section | average 326 characters; 30 Tier B, 114 Tier C, 0 Tier D selections |
| Recovery hits | 0 (the fixture characters have no canon chunks; no public deep source matched) |
| Wrong state commits / unexpected commit kinds | **0 / 0** |
| Secret sentinel in narration | **0** (Maren's private fact never leaked in 6 private-memory runs) |
| Unsupported personality establishment | **0** contracts committed |
| Player agency | 4 `player_agency` detections, all revised; 0 delivered |
| Proposals | 6 proposed, 6 authorized (all `add_household_rule` in HH_E, 6/6) |

| Scenario | Outcome |
|---|---|
| A: one member | 1/6 reconciled (`uncommitted_condition`) |
| B: three members | clean 6/6; Tier C for all three |
| C: relationship | no relationship change proposed or committed; 3/6 reconciled (`private_player_fact` 2, `uncommitted_condition` 1) |
| D: follow | Nicco moved 6/6. The controller **never proposed** Brenna's move, so her narrated following was caught as `absent_participant` (5/6) and revised. Brenna correctly stays: no automatic following. |
| E: household rule | committed 6/6; developments `household_rule_added` written for members |
| F: self-description | 0 contracts. Brenna gave genuine moral statements ("I wouldn't turn my back on someone who needed help", "I wouldn't turn on someone who sheltered me") that sit outside the strict patterns ("would" form, unlisted verbs). This is a conservative false negative, by design. |
| G: private memory | Maren deflects ("I don't know what you mean"); sentinel 0; 1 reconciled |
| H: unrelated | clean 6/6 |

**Comparison with the household-like baseline.** H5 overall reconciliation was 18.3% (H5.1 movement scenarios 26.4%) and redaction 6.3% (H5.1 5.7%). This run's 25.0% is driven by the follow scenario (6/6), which is the same co-movement pattern H5.1 identified. Excluding it gives 14.3%, and redaction is lower (2.1%). The sample is small (48 turns), so no improvement or regression is claimed.

## H. Tests

**New tests (`tests/npc-plus-pass-2.test.ts`):**

- one committed relationship change writes one exact entry, and current truth stays in the domain;
- condition, legal, transaction, rule and movement entries;
- invalid or stale proposals, unconsumed or duplicate receipts and replays write nothing;
- retention at 16, deterministic ordering, command-order independence;
- a rejected proposal and a failed turn write nothing;
- explicit self-descriptions establish the four fields, and 10 indirect or hedged forms do not;
- a full turn commits a contract with its evidence and development, and contradiction and direct rewrite are refused;
- canon stays the source (Korvin's traits rendered, not copied);
- Tier B ≤ 3 and Tier C ≤ 2 developments, relevance-ranked; exact history recovery;
- save/load preserves developments and contracts; tampered or over-long history is rejected;
- H3 mixed + 30 NPC+ with developments fits.

**Pass 1 tests updated deliberately (3):**

- relationship changes now write history (premium contracts still unchanged);
- history handles are now `r<revision>.<n>` with exact JSON payloads;
- the determinism strip pattern was updated for the new `recent (rN):` format.

**Coverage outside the new file:** authored NPC+ movement, migration and private recovery remain covered by the Pass 1 suite (green). Validation passes: typecheck, 1246 / 1242 / 0 / 4, playthrough 25/25, golden unchanged, `runTurn` 168.

## I. Remaining debt

1. **Contract recall is deliberately low.** "Would / wouldn't" moral statements and unlisted verbs are not captured (0/6 live). Widening patterns needs care: every widening risks invented permanent traits.
2. **Controller follow recall.** Narrated following of an NPC+ is rarely proposed as `move_character`, so following is reconciled away rather than committed. It is safe, but players asking an NPC+ to come along will usually see them stay. This drives the D-scenario reconciliation.
3. **Relationship changes rarely commit live** (0/6 in C), so relationship developments will be sparse until relationship evidence improves.
4. **Recovery hit rate is unmeasured on real canon.** The fixture characters have no chunks; it needs an authored-NPC household scene.
5. **Retention drops older history** with no consolidation yet.
6. **Carry-overs:** authored destination-less departure; the context ceiling at 97–98% for full-household scenes; H6 reconciliation and redaction above target; four H1 TODOs.

## J. Pass 3 recommendation

**Pass 3: bounded consolidation, plus a controller-proposal recall check.**

1. **Deterministic long-term consolidation of entries leaving retention:** counted, structured roll-ups (for example `relationship trust: 3 raises, 1 lower since r12`), still no prose model.
2. **A small evidence-recall improvement for NPC+ following and relationship changes:** controller guidance or a deterministic follow-evidence proposal, through existing authorization.
3. **A real-canon household live check** (authored NPC+ with chunks) to measure recovery hits and private-canon behaviour.
4. **Leave reflection, autonomy and personality evolution until consolidated history exists.**

CALDREVAN NPC+ PASS 2 COMPLETE
