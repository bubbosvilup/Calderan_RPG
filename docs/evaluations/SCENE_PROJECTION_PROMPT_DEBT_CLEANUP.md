# Scene Projection / Prompt Debt Cleanup — Consolidation Pass A

Base: `main` at `1106278` (Scene State Projection V1/V1.1 + foundation certification). Offline, deterministic, no live API calls, no commit, no push.
Measurements marked "before" were taken on a clean worktree of `1106278`; "after" on this working tree. All fixtures are the synthetic public ones
(`richScene`, `largeScene`, `idealScene`).

## 1. Executive summary

The certified architecture is unchanged: authoritative domains → one `TurnContext` → `SceneStateProjection` (derive) → deterministic focus → bounded
renderer → `[CURRENT SCENE]`. The projection is still derived-only, never persisted, never mutates, and no new domain, schema, save field, Controller
field or live call was added. What changed is **what the focus stage keeps and how the renderer words it**:

| Debt | Cleanup |
|---|---|
| Knowledge listed every present person with no edge | Positive/differentiated holders only; a person with no edge is named **only** when the turn is about them |
| Households listed the complement set of the room, once per household | Households open only for **engaged** people / explicit reference / rule relevance; only engaged or legally tied non-members are named; "presence ≠ membership" is stated once in the Social header |
| 20 background actors each listed with `CrowdN carries BundleN` | Ordinary carried inventory of people the turn is not about is omitted (referenced items always survive; items someone *else* owns stay visible) |
| `the unfamiliar person (confidential encounter: …)` | `the unfamiliar person` (secrecy stays in the identity gate / CKA) |
| `[CURRENT AUTHORITATIVE CHARACTERS]` repeated conditions/status/presentation and the raw `current_location` id | Narrator-side `current` keeps only what CURRENT SCENE did not state; the technical location id is gone |
| Player profile emitted `Household: Heartstone (owner)` every turn | Removed (CURRENT SCENE Social owns it when relevant; CKA `H1` owns the permission) |
| NPC+ repeated `toward Nicco: trust low` / `N{…}` already in Social | Narrator-side trim, only for people whose edge CURRENT SCENE actually rendered |
| `Maren no longer has the condition "dazed"` etc. | Cleared-condition history never shown; a condition *gain* only while ≤ 30 min old; history of non-engaged people dropped |
| One subsystem could eat most of the block | Per-section soft budgets with explicit "not listed for space" notes; the 6,000-char global bound is unchanged |

Headline numbers (before → after, `largeScene`, "Brenna, are you alright?"): CURRENT SCENE **5,993 → 2,575 chars (−57 %)**, full narrator prompt
**17,547 → 12,575 chars (4,389 → 3,145 est. tokens, −28 %)**, knowledge lines 5 → 1, household lines 5 → 1, non-member lists 5 → 0, background item lines
20 → 0. The rich fixture drops 2,051 → 1,879 chars; the ideal fixture 977 → 938 (nothing to remove there, by design).

Verdict: **CLEANUP COMPLETE WITH MINOR KNOWN LIMITS** (section 19/20). Full suite, typecheck and build are green (section 15/16).

## 2. Duplication audit (phase 1)

Classes: **A** required permission/control duplicate · **B** required behavioral guidance · **C** unnecessary descriptive duplicate · **D** technical-metadata leak.
Source: the full narrator prompt of `richScene` before the change (`1106278`), plus `largeScene`.

| Truth | CURRENT SCENE | Other location | Purpose / class | Decision | Risk |
|---|---|---|---|---|---|
| Current location (name) | `Location:` | `[CURRENT AUTHORITATIVE CHARACTERS]` `current_location` | D: raw id `heartstone_lr` | **REMOVE** (narrator side) | None: scene names the place, Present lists who is here |
| Location id | – (never rendered) | same as above; `[RETRIEVED CANON]` carries entity records for canon queries | D | **REMOVE** from characters block; retrieval untouched | Tests that grepped the id were adapted |
| Time | `Time: 19:42 — Evening` | `TEMPORAL GROUNDING` rule (rule text only, no value) | B: rule, not a duplicate value | KEEP | – |
| Presence | `Present:` | `[PRESENT AND ABLE TO REACT]`, `[BACKGROUND PRESENT]` | B: who may react / background-actor control | KEEP | Different function (reaction permission) |
| Confidential-encounter flag | (was `Present:` parenthetical) | `[PRESENT AND ABLE TO REACT]` says `CONFIDENTIAL ENCOUNTER … name them only if…` for engaged people; identity gate masks the name | A/B in the identity machinery; the scene parenthetical was permission metadata | **REMOVE from scene** | The mask + CKA + that guidance still protect the identity |
| Character status / conditions / presentation | `Character state:` | `[CURRENT AUTHORITATIVE CHARACTERS]` `current.conditions/status/presentation` | C | **REMOVE** from the characters block **when the scene rendered that person's state** (kept otherwise) | A budget-omitted state would otherwise vanish, hence the conditional |
| Equipment / carried items / ownership | `Items:` | none (item ids stay Controller-only) | – | single owner already | – |
| Mana, money | `Player:` | `economicBlock` (prices/market guidance only, no balance) | – | single owner | – |
| Household membership (Nicco) | `Social:` when relevant | **player profile** `Household: Heartstone (owner)` every turn; CKA `H1` | profile line = C; CKA = A | **REMOVE** profile line; KEEP CKA | Narrator no longer sees the household unless relevant or listed in CKA `H1` |
| Household members/roles of NPCs | `Social:` Household line (members) | NPC+ `household role:` / `role=` | NPC+ role is portrayal (distinct) | KEEP both (role is not in Social) | – |
| Household rules | `Social:` when relevant | none | – | single owner | – |
| Relationship toward Nicco | `Social:` `X → Nicco: NEUTRAL (trust low)` | NPC+ `toward Nicco: …` (Tier B) / `N{…}` (Tier C); Developments; NPC+ `recent=` tokens | structured state: C in NPC+; history: distinct | **TRIM** NPC+ edge only when the scene rendered it; KEEP history | Controller NPC+ context untouched |
| Knowledge facts | `Knowledge:` (differentiated, relevant) | CKA `Facts:` and `CAN USE / DO NOT USE` | CKA = A (hard gate) | KEEP both; **COMPACT** the scene side | Scene never weakens CKA |
| Hard character constraints | – | `[HARD CHARACTER CONSTRAINTS]` | B | KEEP | – |
| Scheduled events | `Scheduled:` | none | – | single owner | – |
| Recent developments | `Recent recorded developments:` | NPC+ `recent (rN): joined, trust>N:0→L` | distinct (history vs recency); scene negated-condition lines were C | **COMPACT** (value rules, phase 9); KEEP NPC+ tokens | Residual overlap documented in section 19 |
| Transcript | – | `[RECENT CONVERSATION]` | subordinate by wording | KEEP | – |

Nothing was removed before its distinct purpose was shown redundant: every REMOVE row has a surviving owner, and the conditional on the characters
block is exactly the "budget-omitted state" case.

## 3. Knowledge before / after (phase 2)

Rule (`focusedSceneStateProjection`): a fact is still listed by the same eligibility as before (referenced by the turn, or held by an engaged
non-player). What changed is the **`unrecorded` list**: a person with no recorded edge is named only if
(a) their display name appears in the player's input, or (b) the fact is what the turn asks about and the person is engaged. Everyone else is silent.
Silence is never rendered as ignorance; the header (`recorded entries only; having no entry is not proof a person is ignorant`) is unchanged.

Before (`largeScene`, "Brenna and Maren, what do you know about the grain tax?", five lines, 1,667 chars of section body):

```
- "The grain tax will double at harvest." [truth unestablished]: known by Nicco; heard only as a rumor by Brenna; no recorded knowledge entry for Gerome, Maren, the unfamiliar person, Crowd0, Crowd1, Crowd10, … Crowd9.
- "Public rumor number 0 circulates.": known by Nicco; heard only as a rumor by Crowd0; no recorded knowledge entry for Brenna, Gerome, Maren, the unfamiliar person, Crowd1, … Crowd9.
  (… three more of the same shape)
```

After (2 lines, 283 chars; Maren is named because the player named her; no crowd, no rumor spam):

```
- "The grain tax will double at harvest." [truth unestablished]: known by Nicco; heard only as a rumor by Brenna; no recorded knowledge entry for Maren.
- "The eastern bridge is closed." [the claim is false]: known by Nicco; believed by Maren; no recorded knowledge entry for Brenna.
```

For "Brenna, are you alright?" the whole section is one line (113 chars): `"The grain tax will double at harvest." … known by Nicco; heard only as a rumor by Brenna.`
Scopes (`knows / believes / suspects / heard_rumor`), truth qualification and identity gating are untouched. `[CHARACTER KNOWLEDGE ACCESS]` is not edited
(it is built from `projectKnowledgeAccess`, not from the scene) and is asserted by a test.

## 4. Household before / after (phase 3)

Relevance rule (deterministic). "Engaged" = Narrator Focus foreground, a person the intent / participant plan targets, a person named in the input,
the player, or the sole other person in the room. A household is shown when: an engaged present member (other than Nicco) belongs to it; it or a member is
named; the input is a membership/household/rule question; a rule overlaps the input or a referenced item; or a present non-member is **legally tied** to
someone (owned/held), because that is exactly the person the narrator must not call a member. Members merely standing in the room open nothing.
Non-members are named only when engaged or legally tied (max 4), never as the complement set. "Presence / residence ≠ membership" now lives once, in the Social header:
`household membership is only what is listed here, never inferred from being present or living somewhere`.

Before (`largeScene`, "Brenna, are you alright?", 1,835 chars of Social body): five `Household …` entries, each followed by `Present but NOT household members:` + ~20 names + `Living or staying somewhere is not membership.`

After:

```
Social (authoritative; legal ownership is not consent, loyalty or affection; household membership is only what is listed here, never inferred from being present or living somewhere):
- Household Heartstone: keeper Nicco; members: Brenna, Maren.
- Brenna → Nicco: NEUTRAL (trust low).
```

"Crowd7, are you alright?" opens `House1` only. "Which households are there, and who are the members?" opens all five (explicit query) without any non-member list.
"Brenna and Gerome, are you both alright?" adds `Present, not members: Gerome.`

## 5. Background items before / after (phase 4)

Foreground/engaged carriers: unchanged (worn/held required; ordinary carried capped at 8, droppable). Referenced items: required, carry their description.
People the turn is not about: ordinary carried inventory omitted; a carried item **owned by someone else** (ownership ≠ possession) stays, max 2 per holder;
worn/held items are capped at 4 in total. The omission is stated once: `N further carried or worn items not listed.`

Before: 20 lines `CrowdN carries BundleN.` plus 35 "not listed". After: 0 Crowd lines, `55 further carried or worn items not listed.` "What is in Bundle12?" →
exactly `- Crowd12 carries Bundle12.`; "Crowd3, what are you carrying?" → exactly `Crowd3 carries Bundle3.` Inventory, the engine and the Controller's `items` are untouched (asserted).
The previously certified "next turn shows the committed transfer" case (`Brenna carries Sword; owner: Nicco` on an unrelated input) still holds through the owner ≠ carrier rule.

## 6. Identity label cleanup (phase 5)

`Present:` no longer renders `(confidential encounter: identity, role and affiliations are not public)`. The line is now the neutral observable descriptor from the
existing identity gate (`- the unfamiliar person`). The `confidential` flag remains on `ScenePresence` as derived data (tests, diagnostics) but is not rendered.
The guidance that *does* carry an instruction (`[PRESENT AND ABLE TO REACT]` → "CONFIDENTIAL ENCOUNTER … name them only if the player already named them…") is class B
behavioral guidance for engaged people and is deliberately kept. Tests: no canonical name, no role/affiliation, no `confidential|encounter|identity|hidden|secret` wording in CURRENT SCENE.

## 7. `[CURRENT AUTHORITATIVE CHARACTERS]` audit (phase 6)

Fields and their unique purpose: `identity` (ref, observable label, known name/aliases/affiliations → portrayal + identity gate), `baseline` (summary/content/traits/portrayal → characterization),
`profile` (name, aliases, authored profile data), `canonical_awareness`, `established_at_promotion`, `permanent_appearance` → all unique, kept.
`current` is runtime state: `conditions`, `status`, `presentation` are CURRENT SCENE's; `current_location` is a technical id.

Change (narrator side only, `narratorPortrayalCurrent`): `current_location` is always dropped; `status/conditions/presentation` are dropped when the scene actually rendered that
person's state line (`RenderedScene.states`), otherwise kept so a budget omission can never erase them. An empty `current` disappears. The Controller context is not touched.
Before: `…"current":{"conditions":["winded"],"current_location":"heartstone_lr"},…`; after: the key is absent. Nicco's line lost `"current":{"current_location":"heartstone_lr"}`.

## 8. Player profile household audit (phase 7)

`Household: Heartstone (owner). Household roles are controlled facts (H refs in [CHARACTER KNOWLEDGE ACCESS]), not public knowledge.` was emitted every turn.
It restated (a) the household membership that Social already states when relevant and (b) the permission that CKA `H1 household "Nicco is owner of the household Heartstone."` already grants.
It is not a permanent identity fact the narrator needs on every turn, so it was removed from `playerProfile`. Household domain and Controller visibility are unchanged (`context.player_profile.households` still exists).
Residual: on a turn where the household is neither relevant nor in CKA, the narrator does not see it — intended ("household truth enters once, through the relevance path").

## 9. NPC+ duplication audit (phase 8)

| NPC+ content | Class | Decision |
|---|---|---|
| personality / voice / morality / social style / mannerisms | portrayal guidance | keep |
| `household role:` / `role=` | structured, but Social lists members without roles | keep |
| `toward Nicco: trust low` (Tier B) / `N{trust=L}` (Tier C) | **current structured relationship state** | owned by CURRENT SCENE Social → trimmed from NPC+ **only if the scene rendered that edge** |
| `recent (rN): joined, trust>N:0→L, rule+` / `recent=` | historical development | keep (see section 10) |
| `deep=[…]` handles | recovery pointers | keep |

Implementation: `withoutStatedRelationship` (npc-plus.ts) rewrites the two fragment shapes at render time; `RenderedScene.relationships` says which edges survived rendering. If the scene drops
or never shows an edge, NPC+ keeps its own. Controller's `npc_plus` lines are not modified.

## 10. Developments value audit (phase 9)

Valuable after state has been rendered: a **trust/relationship change** (recency is information), a **legal-status change** and a **person transaction** (rare, meaningful), a **fresh condition gain** (≤ 30 minutes: the recency of an injury can matter).
Low value: a **cleared condition** (current state — the condition's absence — fully defines it), an **older condition gain** (state already says it), and **any history of a person the turn is not about** (background people are continuity context only).
Rules live in `focusedSceneStateProjection` (`SCENE_FOCUS_LIMITS.condition_gain_recent_minutes = 30`); derivation still validates every entry against current state first (stale entries never reach focus). No ledger was introduced.
Before (rich): `Brenna toward Nicco … (0m ago)` + `Maren no longer has the condition "dazed" (0m ago)`; after: only the first. Large scene: three trust lines (two for crowd members) → one.

## 11. Per-section budget design (phase 10)

Global `max_chars = 6,000` is unchanged and stays the final bound. New `SCENE_SECTION_SOFT_BUDGETS` (chars of section body):

Section body sizes in characters (title line excluded), measured on `1106278` (before) and on this tree (after):

| Section | Soft budget | rich before → after | large (ordinary) before → after | worst measured large query, after | Rationale |
|---|---|---|---|---|---|
| state | 300 | 47 → 47 | 252 → 252 | 252 | fits today's crowd (≈ 10 optional background lines); bites above that |
| items | 700 | 360 → 368 | 1,074 → 542 | 542 | Nicco's inventory + a handful of stored items fit; crates drop first |
| knowledge | 700 | 281 → 187 | 1,642 → 113 | 283 (two named people) | ≈ 3–4 differentiated facts with names |
| social | 900 | 192 → 100 | 1,835 → 100 | 693 (explicit "which households" query) | the explicit all-households query must still fit |
| scheduled | 450 | 74 → 74 | (cut at global bound) → 251 | 251 | four near events |
| developments | 300 | 115 → 61 | (cut at global bound) → 61 | 61 | cap of 3 anyway |

(In the certified large scene the global 6,000 bound had to cut `Scheduled` and `Developments` entirely — they were starved by knowledge and households. After the cleanup both are present.)
Each budget is the measured worst case of the large fixture rounded up with ≈ 15–25 % headroom, so it does not touch the rich or large scenes but starts dropping optional entries in a bigger crowd (a 40-person scene is tested).

Algorithm: after rendering entries, per section drop **optional** entries (lowest score first, latest first on ties) until the section is within its budget; required entries
(engaged people's state, worn/held/referenced items, legal status, shown households) may exceed it; whole entries only; an explicit note follows (`- N more character states not listed for space.`, same for facts, social entries, events; items keep their existing notes);
then the unchanged global drop pass.

## 12. Large scene before / after (phase 11–12)

Before (`1106278`, 5,993 chars) — see the certification; shape: 25 Present lines, 12 state lines, 36 item lines (20 `CrowdN carries BundleN`), 5 knowledge lines with ~23-name "no entry" lists, 5 households each with a ~20-name non-member list, 3 `Crowd → Nicco` relationships.

After (2,575 chars), "Brenna, are you alright?":

```
Character state:
- Brenna is winded.
- Maren has a minor injury.
- Crowd0 is winded.  … (10 background lines, all optional)
Items:
- Brenna carries Sword; owner: Nicco.
- Nicco wears Wool cloak (back).
- Nicco carries Brass compass.
- Nicco carries Trinket0. … Trinket6.
- Letter is stored here; owner: Nicco.
- Crate0 … Crate4 are stored here.
- 55 further carried or worn items not listed.
- 35 further items are stored here, not listed.
Player:
- Mana: 80/100
- Money: 4 Gold
Knowledge (recorded entries only; having no entry is not proof a person is ignorant):
- "The grain tax will double at harvest." [truth unestablished]: known by Nicco; heard only as a rumor by Brenna.
Social (authoritative; …household membership is only what is listed here, never inferred from being present or living somewhere):
- Household Heartstone: keeper Nicco; members: Brenna, Maren.
- Brenna → Nicco: NEUTRAL (trust low).
Scheduled:
- Gathering 0: in 18m (20:00, today); with Crowd0, Nicco.  … (3 more)
Recent recorded developments (history; current state above wins):
- Brenna toward Nicco: trust moved from none to low (0m ago).
```

"Crowd7, are you alright?": `Crowd7 carries Bundle7.` is the only background item, only `Household House1` opens, one development line for Crowd7 (2,685 chars).

## 13. Prompt size before / after

| Case | CURRENT SCENE chars | Full prompt chars | Est. tokens | Knowledge lines | Household lines | Non-member lines | Background item lines |
|---|---|---|---|---|---|---|---|
| large / ordinary | 5,993 → **2,575** | 17,547 → **12,575** | 4,389 → **3,145** | 5 → 1 | 5 → 1 | 5 → 0 | 20 → 0 |
| large / knowledge question | 5,979 → 2,745 | 18,152 → 13,287 | 4,540 → 3,323 | 5 → 2 | 5 → 1 | 5 → 0 | 20 → 0 |
| large / household question | 5,837 → 2,840 | 16,378 → 11,898 | 4,095 → 2,975 | 4 → 0 | 5 → 5 | 5 → 0 | 20 → 0 |
| large / Crowd7 | 5,993 → 2,685 | 16,506 → 11,715 | 4,129 → 2,930 | 5 → 2 | 5 → 1 | 5 → 0 | 20 → 1 |
| large / Bundle12 | 5,977 → 2,014 | 16,486 → 11,040 | 4,123 → 2,761 | 5 → 0 | 5 → 0 | 5 → 0 | 20 → 1 |
| rich / ordinary | 2,051 → 1,879 | 9,027 → 8,579 | 2,260 → 2,148 | 2 → 2 | 1 → 1 | 1 → 0 | 0 → 0 |
| rich / sword at the table | 1,770 → 1,525 | 6,862 → 6,438 | 1,717 → 1,610 | 0 → 0 | 1 → 1 | 1 → 0 | 0 → 0 |
| ideal / ordinary | 977 → 938 | 5,942 → 5,785 | 1,486 → 1,447 | 1 → 1 | 0 → 0 | 0 → 0 | 0 → 0 |

Raw vs focused projection size (JSON chars, `largeScene` ordinary): raw 98,296 → 98,953 (only the new `kind` field per development); focused 35,774 → 12,322; rendered 5,993 → 2,575.
Tokens use the repo's `estimateContextTokens` (bytes/4 approximation).

## 14. Foundation contract regression (phase 14)

Unchanged and asserted by the existing certification suites plus `tests/scene-prompt-debt-cleanup.test.ts`:
one logical snapshot / no mixed revision; derived-only and never persisted; no mutation (snapshot JSON and revision identical after prompting the large scene); save/load equivalence;
current state > history (stale developments still filtered at derivation, cleared-condition history now also dropped at focus); identity gate (no hidden name, no role, no framework wording);
no secret leak (`LORE` sentinels, `Seraph`, `SECRET_VISUAL_SENTINEL`); no technical item/fact/event/character/household ids or location ids; ownership ≠ possession; missing edge ≠ ignorance;
CKA remains the hard gate (its text is asserted); Retrieval and Background Grounding blocks untouched; referenced entities survive caps and budgets; whole-entry drops with explicit notes (omission ≠ falsehood);
HH:MM time kept; unestablished-details rule and scene guidance text unchanged.

## 15. Test results

`npm test` (build + `node --test .build/tests/*.test.js`): **2882 tests, 2882 pass, 0 fail, 0 skipped** (baseline `1106278`: 2849/2849; +33 new tests in `tests/scene-prompt-debt-cleanup.test.ts`).
Included suites: Scene State Projection, foundation certification, narrator focus, prompt builder, knowledge, identity/secrecy, household/social/legal, item/inventory, transfer, NPC+, retrieval, Background Grounding, context compaction, save/load, TurnCoordinator (golden pipeline).
Sixteen pre-existing tests failed on the first full run because they pinned the behaviour being cleaned up (wording, the removed profile line, a pinned prompt-size estimate, and the narrator-prompt goldens); each was adapted or its golden regenerated deliberately (section 17). No assertion about the foundation contract was weakened.

New tests by phase: knowledge (5), households (8), items (5), identity (1), characters block (2), player profile (1), NPC+ (2), developments (2), budgets (3), determinism + contract (4).

## 16. Typecheck / build

`npm run typecheck`: clean. `npm run build`: clean.

## 17. Files modified

Source: `src/turn/scene-state-projection.ts` (development `kind`), `src/turn/scene-state-focus.ts` (engagement, knowledge/household/item/relationship/development relevance, `person_ids`),
`src/turn/scene-state-render.ts` (identity wording, household wording, notes, soft budgets, `RenderedScene.relationships/states`), `src/turn/prompt-builder.ts` (player profile, characters block, NPC+ trim, person signals), `src/turn/npc-plus.ts` (`withoutStatedRelationship`).
Tests: new `tests/scene-prompt-debt-cleanup.test.ts`; adapted `scene-state-projection`, `scene-state-foundation`, `baseline-cleanup`, `household-turns`, `narrated-promotion`, `context-compaction` (pinned prompt-token estimate 3,050 → 2,860);
goldens regenerated deliberately with `H2_UPDATE_GOLDEN=1` (`golden/scene-state-ideal.txt`: one knowledge line lost `; no recorded knowledge entry for Maren`; `golden/turn-pipeline.json`: only narrator-prompt strings changed — removed `current` runtime copies, the profile household line, the Social header wording and the non-member line wording).
Docs: this report; short addendum in `docs/architecture/SCENE_STATE_PROJECTION_V1.md`.

## 18. Schema / save impact

None. No change under `src/campaign`, `src/persistence`, `src/types`, no new snapshot field, no migration, revision untouched. `SceneDevelopment.kind` and `RenderedScene.relationships/states` are in-memory, never serialized. Controller context byte-identical (the golden diff shows no Controller request change).

## 19. Known limitations

1. **Engagement is heuristic and conservative toward silence.** A created NPC the player addresses by description ("the baker") is engaged only through the participant plan / intent / name; otherwise their state is optional and budget-droppable. The characters-block conditional keeps their `current` state in that case.
2. **Scheduled events** still list near events with unengaged participants (`Gathering 0 … with Crowd0, Nicco`). Not in scope; capped at 4 and by the 450-char budget.
3. **Nicco's own ordinary inventory** (7 trinkets) is still listed; it is capped (8), droppable and now bounded by the items budget.
4. **NPC+ `recent=` tokens and the scene's Recent developments** can still both mention the same trust change (history vs recency; different owners by design).
5. `baseline.summary` and `baseline.content` in the characters block are identical strings for many fixture characters; they are authored portrayal data and were left alone.
6. A household that is neither relevant nor in CKA is not visible to the narrator (by design after phase 7); `H1` in CKA remains the permission fact.
7. Carried-by-bystander items owned by someone else are always shown (≤ 2 per holder); a crowd of 20 such items would still be capped but not zero.
8. The live Controller/handover open point from the certification (E2E sword handoff) is unrelated to this pass and untouched.

## 20. Recommendation

The narrator-facing scene is now ~57 % smaller on the stress fixture, free of framework wording and of the complement-set enumerations, with every omission silent rather than negative and every hard gate unchanged.
**Yes — Scene Projection / prompt debt cleanup is complete enough to move to roadmap item 2, Controller + authorization diagnostics/hardening**, carrying limitations 1–3 as non-blocking debt (all are size/relevance tuning, none is a correctness risk).
Suggested follow-up when convenient: a diagnostics-enabled live turn for the open handover question, and an optional smoke of the narrator on the large scene to confirm no behavioural regression from the smaller prompt (not run: this pass is offline by instruction).
