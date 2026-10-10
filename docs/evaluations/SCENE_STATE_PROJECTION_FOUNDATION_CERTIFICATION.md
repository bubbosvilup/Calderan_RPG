# Scene State Projection — Foundation Certification

Scope: audit, deterministic integration tests, diagnostics, live validation. No gameplay feature, schema, save format or runtime fix was added. Synthetic public fixtures only (nothing under `data/`). Live raw data: `SCENE_STATE_PROJECTION_FOUNDATION_LIVE.json`.

## 1. Executive verdict

**CERTIFIED WITH MINOR KNOWN LIMITATIONS.** Scene State Projection is a safe integration boundary: it is derived from ONE snapshot per turn, has one authoritative owner per field, never mutates anything, never persists, keeps secrets out of every section (tested through items, schedule, relationships and developments), and behaves coherently when ten subsystems interact in one turn. No high-severity secrecy, mixed-revision or duplicate-authority issue was found. The limitations (section 27) are bounded and none blocks building on it.

## 2. Actual production pipeline

```
SOURCES (campaign snapshot + world, one revision)
├── runtime: location, world clock, mana
├── campaign characters: presence, conditions, status, legal state
├── campaign items: position, owner, name (+ canonical display_name)
├── funds
├── knowledge edges over campaign facts (facts Nicco knows)
├── relationships / households / rules
├── scheduled events (with Nicco as participant)
└── validated NPC+ developments (re-checked against current state)
        ↓  buildTurnContext(world, snapshot, {input, recent_text})  [also registers scene extras in a WeakMap]
TurnContext  (Controller sees this, byte-identical)
        ↓  buildSceneStateProjection(context)
SceneStateProjection (derived, never stored)
        ↓  focusedSceneStateProjection(projection, Narrator Focus signals + intent ids + input)
FocusedSceneState (deterministic relevance/caps)
        ↓  renderSceneStateProjection(...)   max 6000 chars, whole entries only
[CURRENT SCENE]  → narrator prompt `state` section (first block)
```
Separately and unchanged: Retrieval (`[RETRIEVED CANON]`), Background Grounding (`[BACKGROUND GROUNDING]`), recent transcript, `[HARD CHARACTER CONSTRAINTS]`, `[CHARACTER KNOWLEDGE ACCESS]`. Verified by test: none of them enters `[CURRENT SCENE]` and `[CURRENT SCENE]` is identical with or without grounding/retrieval.

In `TurnCoordinator.runTurn`: base snapshot → `resolveTurnIntent` → `projectTurnIntent` (context from the base snapshot, or from a detached projected snapshot when the player authored runtime effects) → retrieval → `composeTurnPrompt` → narrator draft → Controller proposal → authorization → `campaign.prepare` → audit → ONE `campaign.commit`.

## 3. Source-of-truth map (phase 2)

| Field | Authoritative source | Projection derivation | Can conflict? | Precedence | Persisted? |
| --- | --- | --- | --- | --- | --- |
| Location (+About, Features) | runtime scene location + world entity | `context.primary.scene` | with transcript/retrieval prose | structured state | no (runtime owns it) |
| Time `HH:MM — daypart` | runtime world clock | `temporalGrounding(world_minute)` | transcript ("morning") | clock | no |
| Present people | runtime presence / character locations | `context.characters` | transcript, scene plan | runtime presence | no |
| Names shown | identity gate (learned names) | `sceneDisplayNames` (gate-aware) | canonical hidden name | gate | no |
| Character state | `CampaignCharacter.current` (conditions, status) | `context.characters[].current` | NPC+ history, transcript | current state | no |
| Items (carrier/placement) | `CampaignItem.position` | `context.items` / `items_here` | transcript, retrieval | CampaignItem | no |
| Item owner | `CampaignItem.owner_id` | same | prose ownership | CampaignItem | no |
| Item label | item.name → canonical display_name → name (handles rejected) | scene extras `item_labels` | machine handle vs display name | existing human label, else source name | no |
| Mana | runtime mana | `context.primary` runtime | transcript | runtime | no |
| Gold | campaign funds | `context.primary` / funds | transcript | funds | no |
| Knowledge | campaign knowledge edges (+ fact truth) for facts Nicco knows | `context.facts`/`knowledge` | CKA is the permission gate | CKA for usability; edges for scope | no |
| Households / rules | household domain | `context.social` | NPC+ premium text | household domain | no |
| Legal state | person legal state | `context.social.legal` | prose | legal domain | no |
| Relationships | relationship edges | `context.social` | NPC+ text | edges | no |
| Scheduled events | campaign scheduled events (Nicco participant) | `context.scheduled_events` | transcript | event domain | no |
| Recent developments | NPC+ history, validated | scene extras `developments`, re-checked vs current state | stale history | current state | no |

The projection owns no field. Every row is read-only.

## 4. Snapshot / revision consistency (phase 3)

**Can `[CURRENT SCENE]` be a mixed-revision view? No.** `buildNarratorPrompt` receives one `TurnContext`; that context is built from exactly one snapshot object (`projected` when the player authored runtime effects, otherwise the base snapshot — `projectTurnIntent`, `intent.ts:109-110`). `registerSceneExtras` is called inside `buildTurnContext` with that same snapshot, and the WeakMap key is that context object. Focus signals (`intentSceneSignals`) are item/fact/event ids from the intent resolved against `base_context` of the same base revision; ids are stable across the detached projection. Tested: a context built from revision R keeps showing revision R's time and conditions after the campaign advances (`lifecycle: ... mixed-revision`). Residual (not mixed truth): the transcript is intentionally from earlier revisions and is subordinate to state.

## 5. Turn temporal semantics (phase 4)

`CURRENT SCENE` = **the committed state at the start of the turn, plus only the player-authored runtime effects already validated and projected into a detached snapshot (movement, waiting, mana)**. It is never the Controller's or the Narrator's result.

For "I hand Brenna the sword": the handover is a *candidate*, not a runtime effect. The Narrator sees the state BEFORE the receipt (Nicco carries the Sword) plus the intent (`Player-directed handover…`). Order: intent resolution → projection → retrieval → narrator draft → Controller proposal → authorization → `prepare` → audit → commit. The transfer commits only at the end; the NEXT turn's scene shows Brenna as carrier, owner unchanged (tested offline; in the live E2E1 the transfer was not committed, see section 21).
Movement (`/go`): projected before narration (the Narrator already sees the new location and +minutes); committed at the end. Resource change (`/mana`): projected before narration (75/100 seen pre-commit, committed state still 80). Condition, knowledge and event changes: Controller-proposed, so visible only on the next turn after commit.

## 6. Derived-only guarantee

Tests: building, focusing and rendering do not mutate the campaign snapshot, revision, `TurnContext`, knowledge, items, social state or schedule; repeated builds are byte-identical; nothing of the projection is in the saveable snapshot.

## 7. Cross-subsystem integration

One rich fixture (`src/dev/scene-foundation-fixtures.ts::richScene`): Heartstone LR, 19:42, Nicco/Brenna/Maren/Gerome, Brenna winded, Maren minor injury, Gerome silent construct, Sword (owner Nicco, carrier Brenna), equipped cloak, 15 ordinary carried items, stored Letter, stored Cellar key elsewhere, Mana 80/100, 4 Gold, three knowledge facts with all scopes (knows / believes / heard_rumor, one false, one unknown truth), household + rule, relevant and irrelevant relationships, near and distant events, a current and a stale development. All 27 required assertions pass on the whole block.

## 8. Conflict / stale-state results

A transcript item carrier, B stale development, C "morning" vs 19:42, D retrieved baseline vs runtime, E ownership prose: in all five the block follows structured state; the retrieval text stays outside the scene block and after it in the prompt. Live L4 confirmed the Narrator follows the block over a stale transcript.

## 9. Relevance / omission

Omitted state is never declared nonexistent (no "no household", "carries nothing"). The prompt wording says absence from the block alone proves nothing, and a fact every present person holds identically is left out of the scene but stays in CHARACTER KNOWLEDGE ACCESS. Referenced entities survive: 12th carried item, 9th stored item, household rule, distant event named, queried fact.

## 10. Budget / large scene

`largeScene()`: 20 present + 20 away, 30 carried packs, 20 crowd bundles, 40 stored crates, 4 households, 30 relationships, 30 facts, 10 events, secrets enabled. Rendered scene **5993 / 6000 chars**; full narrator prompt 30 233 chars of request JSON (< 100 000 transport bound); deterministic across builds; whole lines only; never-drop truth (location, time, mana, gold, Brenna's sword and state, equipped cloak) present; no secret or id leaked. `context_too_large` is a pre-existing TurnContext limit (100 000 serialized chars of never-drop state); measured growth (serialized chars) per dimension: present 30→64.7k, 60→88.9k; carried packs 100→73.3k; stored 100→71.3k. It is reached only by combining several oversized dimensions.

## 11. WeakMap lifecycle

A production contexts carry extras; B repeated projection equal; C a JSON/structured clone has no extras and degrades safely (no crash, no hidden name); D two live contexts from different snapshots never cross-contaminate (older context never sees newer state); E no global string-keyed cache exists (WeakMap keyed by the context object only).

## 12. Identity / secrecy

Unlearned authored people (Pellan, absent Korvin), a confidential encounter (Seraph) and restricted/holder-only/author-only canon appear in no section, including item owner, scheduled participants, relationships and developments ("owner: someone not present"; "Brenna toward the unfamiliar person"; unknown participants omitted from the "with" list). A learned name is disclosed.

## 13. Knowledge access interaction

`[CURRENT SCENE]` is before and separate from `[CHARACTER KNOWLEDGE ACCESS]`. In the same prompt the hard gate still reads `Maren: CAN USE F1 (believes), H1; DO NOT USE F2, F3` while the scene lists the West Gate fact as known by Nicco and Brenna. The scene block states that having no entry is not proof of ignorance. Live L3 showed no epistemic leakage.

## 14. Retrieval interaction

Ordinary turns carry none; a canon turn adds `[RETRIEVED CANON]` after the scene; it never enters the scene and grants no NPC access (the "retrieval grant no NPC access" rule is unchanged). Live L6: retrieved tradition used, runtime state won.

## 15. Background Grounding interaction

The block is separate; the scene block is identical with and without it; a rebuilt scene next turn contains none of it.

## 16. Save / load

After a JSON round trip the narrator-visible scene is equal; no projection or extras are in the save; extras are re-registered by normal context construction.

## 17. Multi-turn offline

T0 Nicco carries the sword → T1 handed to Brenna (owner Nicco, no loan wording) → T2 Brenna winded → T3 Letter stored → T4 fact learned → T5 condition cleared and sword returned. The scene tracked committed truth at every revision and kept no stale state.

## 18. Duplication audit (phase 15)

| Truth | CURRENT SCENE | Other prompt location | Justified duplicate? |
| --- | --- | --- | --- |
| Location | `Location: Heartstone LR` | `[CURRENT AUTHORITATIVE CHARACTERS]` JSON `current_location":"heartstone_lr"` (technical id), Nicco profile | **No** — pre-existing, descriptive, contains a technical id |
| Time | `19:42 — Evening` once | `TEMPORAL GROUNDING:` rule (rule text, no value) | Yes |
| Presence | `Present:` | `[PRESENT AND ABLE TO REACT]`, `[BACKGROUND PRESENT]` | Yes (distinct function: who may react) |
| Character state | `Brenna is winded.` | `[CURRENT AUTHORITATIVE CHARACTERS]` JSON `conditions:["winded"]` | **No** — duplicated descriptive state |
| Equipment/items | `Items:` once | none | n/a |
| Money / mana | once | none | n/a |
| Household | `Household Heartstone…` (only when relevant) | `[NICCO / PLAYER PROFILE]` `Household: Heartstone (owner)` every turn; `[NPC+ HOUSEHOLD CHARACTERS]`; CKA `H1` | Partly: CKA is a permission boundary (yes); the profile line and NPC+ text defeat household relevance filtering (**No**) |
| Relationship | `Brenna → Nicco: NEUTRAL (trust low)` | `[NPC+ HOUSEHOLD CHARACTERS]` relationship keys | Portrayal guidance (yes) |
| Schedule | once | none | n/a |

Deterministic count test: mana, gold, time, supper, household, relationship, sword and cloak each appear exactly once in the scene-owned part. The duplicates above are pre-existing blocks outside Scene State Projection; reported, not fixed.

## 19. Live model configuration (phase 22, read from production code today)

- Narrator: `z-ai/glm-5.2` (`DEFAULT_NARRATOR_MODEL`, no env override set), fixed provider route `z-ai/fp8` with `allow_fallbacks:false`, reasoning disabled, 512 max output tokens.
- Controller: primary `openai/gpt-6-luna`; fallback `anthropic/claude-haiku-5.5` (`DEFAULT_CONTROLLER_FALLBACK_MODELS`, env `OPENROUTER_CONTROLLER_FALLBACK_MODELS` unset); `require_parameters:true`, `allow_fallbacks:true`, reasoning disabled.
- No key was read or printed (the sandbox proxy injects auth); no provider configuration was modified.

## 20. Live Narrator results (6 calls)

| Call | Result | Notes |
| --- | --- | --- |
| L1 multi-system | **PARTIAL** | winded used; carrier/owner correct ("It's yours"); no borrowed/stolen; no dump. Invented "off the rack", "commotion outside" (H) |
| L2 stored item | **PARTIAL** | Letter in the room, no cellar confusion; invented "a surface near the room's edge", hearth unlit (H) |
| L3 knowledge | **PASS** | Brenna: West Gate known, tax only as talk, bridge unknown; Maren: bridge held belief (confident), disclaims the rest; no leak |
| L4 stale transcript | **PASS** | followed evening/winded/no sword; ignored the "bright morning" transcript |
| L5 large scene | **PASS** | coherent, relevant state used, unfamiliar person unnamed, no ids, no recital |
| L6 retrieval + state | **PARTIAL** | tradition used, runtime won; mechanical contrast narration, invented bare mantel (H) |

Across all six: location/people/state/ownership/resources respected; epistemic scopes respected; no technical IDs; no secrets; no clock overfitting. Remaining defects are Narrator-model invention of minor placement/atmosphere (class H).

## 21. End-to-end TurnCoordinator results (3 turns)

| Turn | Result | Notes |
| --- | --- | --- |
| E2E1 item handover | **PARTIAL** | narration fine; **transfer not committed** (rev 2→2); next scene correctly still shows Nicco carrying. Offline replay with a correct proposal but no evidence quote is rejected (`rejected_insufficient_confirmation`); whether the live Controller omitted the proposal or the evidence check rejected it is undetermined (needs a diagnostics-enabled turn; budget was spent). Class I/J, not Scene Projection |
| E2E2 condition | **INCONCLUSIVE** | narration describes a knock-down but no condition was committed (rev 1→1); next scene correctly shows none |
| E2E3 movement | **PASS** | `/go Cellar` 1→2; next scene Cellar, 19:43 Evening, Nicco + two unfamiliar persons; narrator showed two figures, consistent |

## 22. Provider call counts

Narrator-only 6; E2E: Narrator 3, Controller 3; **12 HTTP requests total, 0 retries, 0 revision narrations, 0 turn failures**. Fallback-model usage was not captured by this harness (the Controller request listed both models). Authorization: E2E1 and E2E2 committed nothing. No image calls.

## 23. Failure classification

- E2E1 not committed: **I/J** (Controller proposal or conservative evidence authorization). Reproducible in part offline.
- E2E2 no condition committed: **I/J**.
- Minor invented placement/atmosphere (L1, L2, L6): **H**.
- Duplicated descriptive state in `[CURRENT AUTHORITATIVE CHARACTERS]` / profile household line: **G/D** (pre-existing prompt composition), cosmetic.
- No A, B, C, E, F, K, L failures.

## 24. Full test results

`npm test`: 2849 tests, 2849 pass, 0 fail, 0 skipped, 0 todo (baseline before this pass: 2824; +25 foundation tests). All requested focused areas (scene-state, narrator focus, prompt builder, budget/compaction, identity/secrecy, knowledge, retrieval, background grounding, items/inventory, transfer, social/household/legal, scheduled events, save/load, TurnCoordinator) are part of this suite and passed.

## 25. Typecheck / build

`npm run typecheck` clean; `npm run build` clean.

## 26. Files created / modified in this pass

Created: `src/dev/scene-foundation-fixtures.ts`, `src/dev/scene-state-foundation-live.ts`, `tests/scene-state-foundation.test.ts`, this document, `SCENE_STATE_PROJECTION_FOUNDATION_LIVE.json`. Modified (fixtures only): `src/dev/scene-state-fixtures.ts` (options `constraints`, `canon`). No production source changed in this pass.

## 27. Known limitations

1. Scene Knowledge shows only facts Nicco knows (TurnContext design); NPC-only facts never appear in the scene (consistent with secrecy; CKA remains the NPC gate).
2. Scheduled events require Nicco as participant; unlearned participants are silently omitted from "with".
3. `[CURRENT AUTHORITATIVE CHARACTERS]` repeats conditions and a technical location id; the player profile always names Nicco's household; NPC+ text restates relationships (pre-existing duplication, section 18). Technical ids also exist in the CKA `Facts:` list; the scene block itself is id-free.
4. Item label fix depends on authored data: when `display_name` equals the handle the handle remains.
5. WeakMap extras are object-identity scoped; a cloned context loses owner names / labels / developments (degrades safely).
6. The 6000-char budget is nearly full in the stress scene (5993); the drop path works but headroom is thin.
7. TurnContext hard limit (100 000 chars of never-drop state) is pre-existing.
8. The Narrator model still invents small placements/atmosphere; the system prompt allows compatible transient atmosphere.
9. Transfer/condition commit via the live Controller is conservative (E2E1/E2E2); unrelated to this layer but relevant to any domain relying on narrated changes.
10. `Maren no longer has the condition "dazed"` removal-history lines carry low value.

## 28. Foundation readiness verdict

**B. CERTIFIED WITH MINOR KNOWN LIMITATIONS.** Safe to build on; limits above are bounded.

## 29. Future subsystem integration contract

A subsystem that contributes to Scene State Projection should:
1. keep authoritative state in its own domain (persisted via the campaign snapshot), never in the projection;
2. expose a deterministic read projection reachable from ONE snapshot (so it joins `TurnContext` or the scene-extras registered by `buildTurnContext` for that same snapshot);
3. store no narrator-specific text in domain state (rendering is the adapter's job);
4. provide relevance signals (ids it was referenced by the intent, present-person links, input vocabulary) so focus can include/omit it deterministically — never "always required" unless it is a never-drop authority (location, time, presence, legal state);
5. supply a narrator-safe adapter: no technical ids, no `visual_description`/asset metadata, neutral wording that does not infer story (loan/theft/ignorance);
6. keep Controller-actionable ids separate (Controller sees `TurnContext`, byte-identical);
7. apply secrecy/visibility upstream, including every secondary path (owner names, participants, relationships, developments): use the identity gate (`sceneDisplayNames`/`externalName`) rather than world names;
8. round-trip through save/load and rebuild from a restored snapshot with equal output (tests: save/load, derived-only, multi-turn);
9. let current state beat history (re-validate any history entry against current state before showing it);
10. be bounded: per-subsystem caps and a `required` set, whole entries dropped lowest-priority first, an omission note ("not listed") instead of silence, and a size test with the large-scene fixture;
11. never become a second owner of a field already listed in section 3, and add a row to that table;
12. add its facts to the prompt once (check the duplication table) and keep permission boundaries (CKA) separate from descriptive state.

## 30. Recommendation

Property / Heartstone Resource Domain **may begin now**, provided it follows the contract above, adds its adapter and focus rules to the existing three modules (not a new prompt block), and extends `richScene`/`largeScene` plus the foundation tests. Separately (not blocking): review the Controller/evidence path for handovers (E2E1) with a diagnostics-enabled run before Property work depends on narrated item changes; and consider removing the duplicated descriptive lines in `[CURRENT AUTHORITATIVE CHARACTERS]` and the always-on profile household line when convenient.
