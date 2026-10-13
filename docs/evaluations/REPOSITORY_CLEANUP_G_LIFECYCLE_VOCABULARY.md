# Repository Cleanup G: lifecycle vocabulary

Status: historical record of a completed cleanup (2026-10-13). Baseline main `9d27f81` (Repository Cleanup F). Current vocabulary lives in [Architecture](../ARCHITECTURE.md) (character lifecycle), the [README](../../README.md#character-lifecycle) and [Testing](../TESTING.md#test-taxonomy).

Purpose: repository wording matches the identity lifecycle without changing it. PROVISIONAL → PERSISTENT is **materialization**; Campaign NPC → NPC+ is **promotion**. Semantic naming only: no command, serialized field, character ID format, prompt text, diagnostic key, test expectation or gameplay rule changed.

## 1. Baseline

| Item | Value |
|---|---|
| HEAD | `9d27f81` (main = origin/main = `claude/project-thread-gfj7p8`), clean tree |
| Tests | 3699 / 3699 (Cleanup F) |
| Benchmark | `benchmark:modern` 55/55, 0 known gaps |
| Architecture | 359 modules, 0 runtime back-edges |
| The known misuse | `src/campaign/promotion.ts` exported `buildPromotedCharacter(PromotionInput)`, `promotedCharacterId` and `promotedLabel`: the PROVISIONAL → PERSISTENT builder, named as a promotion. Recorded as a residual in the block 12 report and in the debt register's technical-debt row |

## 2. Terminology inventory

Every current occurrence (source, tests, scripts, current docs) of promote*, materializ*, provisional, persistent, retired, ephemeral, temporary, premium, npc_plus / NPC+, campaign_npc, campaign character and created character was listed per token and classified before anything changed. Historical material is counted apart (5738 occurrences under `docs/evaluations/`, `src/dev/historical/`, `scripts/historical/`, `tests/frozen/`, `tests/support/historical/`, `tests/fixtures/`): HISTORICAL TEXT, untouched. The first pass is automatic (file and line context). Every row it labelled MISLEADING was then reviewed by hand, and the rows still labelled after G were reviewed again (section 12).

| Term | Class (automatic first pass) | Before | After |
|---|---|---|---|
| campaign character | CORRECT DOMAIN TERM | 101 | 101 |
| campaign_npc | CORRECT DOMAIN TERM | 28 | 28 |
| created character | CORRECT DOMAIN TERM | 42 | 43 |
| ephemeral | CORRECT DOMAIN TERM | 132 | 131 |
| ephemeral | SAVE-SCHEMA TERM | 70 | 70 |
| materializ | CORRECT DOMAIN TERM | 115 | 339 |
| npc_plus | CORRECT DOMAIN TERM | 990 | 995 |
| npc_plus | PUBLIC/UI TERM | 28 | 28 |
| persistent | CORRECT DOMAIN TERM | 292 | 296 |
| persistent | PUBLIC/UI TERM | 3 | 3 |
| persistent | SAVE-SCHEMA TERM | 32 | 32 |
| premium | BACKWARD-COMPAT TERM (legacy NPC+ name, NAME-1) | 188 | 189 |
| premium | SAVE-SCHEMA TERM | 384 | 384 |
| promot | CORRECT DOMAIN TERM (NPC+ promotion) | 353 | 354 |
| promot | CORRECT DOMAIN TERM (other domain: mannerism / Reflection / focus) | 76 | 75 |
| promot | MISLEADING LIFECYCLE TERM (materialization called promotion) | 314 | 87 |
| promot | SAVE-SCHEMA TERM | 71 | 75 |
| provisional | CORRECT DOMAIN TERM | 329 | 351 |
| provisional | PUBLIC/UI TERM | 16 | 16 |
| provisional | SAVE-SCHEMA TERM | 17 | 17 |
| retired | CORRECT DOMAIN TERM | 165 | 165 |
| retired | PUBLIC/UI TERM | 1 | 1 |
| retired | SAVE-SCHEMA TERM | 136 | 136 |
| temporary | CORRECT DOMAIN TERM | 160 | 160 |
| temporary | PUBLIC/UI TERM | 5 | 5 |

"materializ" grows by 224 because the corrected words and symbols now say it. The 87 rows still labelled MISLEADING after G are false positives of the heuristic, reviewed one by one in section 12. None of them calls PROVISIONAL → PERSISTENT a promotion in current prose or in a current symbol.

Hand review of the 314 automatic MISLEADING rows before G:

- **227 changed**, because they called materialization a promotion: the primitive's symbols and their call sites, comments, 21 test titles, local helper names, assert messages, internal validation messages and current docs.
- **87 kept** (section 12).

The other terms were already correct:

- `provisional`, `persistent`, `retired`, `campaign_npc`, `campaign character` and `created character` were used in their lifecycle or tier meaning.
- `ephemeral` and `temporary` name the scene-local kinds of PROVISIONAL (narrator-created people and the temporary scene-participant registry) and the public "temporary person" wording of Keep track.
- `ephemeral_ref` and `source: "narrator_ephemeral"` are save schema.

None of them was wrong, so none was renamed.

## 3. Normative vocabulary

| Word | Meaning |
|---|---|
| PROVISIONAL | a scene-local, unmaterialized person reading (a narrator-created person, named or not, or a temporary scene participant); never in the snapshot |
| PERSISTENT | a Campaign Character with a stable persisted identity (`CampaignSnapshot.characters[]`) |
| RETIRED | a persistent identity kept as history (`retirement` set), reached only by a confirmed repair |
| MATERIALIZATION | PROVISIONAL → PERSISTENT: `materializeProvisional` → `buildMaterializedCharacter`, reached only by the player's Keep track or the person Actual Offer Accept |
| PROMOTION | Campaign NPC → NPC+ only (the Heartstone rite, `premium_characters`). NPC+ is a tier, not persistence |

Other established senses of "promote" stay, outside the lifecycle:

- a mannerism candidate is promoted to an established mannerism (optional learning);
- narrator focus promotes a present character to a richer portrayal tier;
- authored-content docs promote a feature to an entity.

The rule is written in `docs/TESTING.md` (lifecycle words), `README.md` and the lifecycle section of `docs/ARCHITECTURE.md`.

## 4. Symbol rename map

| Was | Now | Kind |
|---|---|---|
| `src/campaign/promotion.ts` | `src/campaign/materialization.ts` | module (git mv) |
| `buildPromotedCharacter` | `buildMaterializedCharacter` | function |
| `PromotionInput` | `MaterializationInput` | interface |
| `promotedCharacterId` | `materializedCharacterId` | function (ID format unchanged: `campaign_character_r<revision>_<slug>`) |
| `promotedLabel` | `materializedLabel` | function (still unused, REPO-8) |
| parameter `promotedRevision` | `materializedRevision` | parameter |
| `context-builder.ts` local `promoted` | `materializedOrigin` | local |
| `campaign-status.ts` local `promoted` | `materialized` | local (dev) |
| tests: `promoted(c)` helpers (2 files) | `materialized(c)` | test helper |
| test: `promotedNames` (it returns provisional names) | `provisionalNames` | test helper |
| test: `promote(line)` (it returns a provisional person's background) | `provisionalBackground` | test helper |

**Symbol references.** 69 replacements in 21 files: 3 production modules (`provisional-people.ts`, `campaign-status.ts`, `materialization.ts`), one browser check, the tests and support files, the debt register and `TURN_COORDINATOR.md`.

**Rename-mapped import graph.** The TypeScript graph of `src/`, `tests/` and `scripts/` was built before and after, with `promotion.ts` mapped to `materialization.ts`. Both have 3362 runtime edges and 4524 edges including type imports, with 0 missing and 0 extra. The one new module is the guard test.

**Graph hash.** `check:architecture` reports a new runtime graph hash only because a module path changed. It still finds 359 modules and 0 runtime back-edges.

Kept, because renaming them would change saves, prompts or recorded output:

| Name | Why it stays |
|---|---|
| `origin_snapshot.promoted_revision`, `promoted_world_minute` (and the `MaterializationInput.promoted_revision` field that fills it) | save schema; documented as "when the person was materialized" in the module header and the architecture doc |
| `origin_snapshot.source: "narrator_ephemeral"`, `ephemeral_ref` | save schema |
| `established_at_promotion` (narrator character context key, `prompt-builder.ts`) | Narrator prompt wire; renaming it changes every prompt that carries a materialized person |
| `promoted_on_acceptance` (person-offer diagnostic detail) | asserted diagnostic key |
| `Promoted characters:` / `Established at promotion:` / `promoted at revision` (`formatCampaignStatus` debug view) | asserted dev output |
| `promotion_proximity` (identity-fork scanner signal kind) | output format of the scanner the user runs on local saves; its detail text now says "materialized within" |
| "Promotion Pass 1.1" in 11 comments, the `TURN_COORDINATOR.md` heading and its report link | names of a historical pass, not lifecycle wording |

## 5. Materialization terminology

Wherever the text meant PROVISIONAL → PERSISTENT, it now says "materialize", "materialization" or "materialized":

- **Comments:** 64 words in 25 production and test files: person offers, scene identity, trade settlement, origin snapshot types, validation, permanent appearance, context builder, coordinator, commit preparation, intent, narration audit, scene participants, canonical targets and the materialization module itself.
- **Strings:** 12. These are 5 internal validation messages, 2 identity-fork scanner detail texts and 5 assert messages.
- **Test titles:** 21 (section 9).
- **Current docs** (section 9).

Corrections beyond the word:

- **Module header.** It now states what the primitive is, that it is not NPC+ promotion, and who its real production callers are. The old header said "only the purchase trigger is production-wired", which has been stale since Keep track (block 12).
- **"promoted by name".** It became "materialized under a name". Since AUTH-2 a name alone materializes nobody, so these comments describe records that carry a name, not a name that acted.
- **`identity` field comment in `turn-types.ts`.** It described pre-AUTH-2 behavior ("characters promoted because a proper name was established"). It now describes what the field carries: provisional people, late namings and skips.

## 6. NPC+ promotion terminology

Unchanged and correct (354 occurrences after G):

- the Heartstone rite: `completeHeartstoneRite` and the route `POST /api/npc-plus/promote`;
- the capability fields `can_promote_to_npc_plus` and `promotion_unavailable_reason`, plus `characterCapabilities` with its `promoted` input and `SessionView.promoted`;
- the UI promotion arrow (`#character-promote-*`, `renderPromotion`);
- `tests/npc-plus/explicit-promotion.test.ts` and `scripts/browser/explicit-promotion-browser-check.mjs`;
- the docs: `HEARTSTONE.md`, `ROADMAP.md` and the UI debt rows.

The guard (section 9) checks that the materialization primitive imports nothing from NPC+ or household modules and writes no NPC+ state.

## 7. Premium terminology audit

585 current occurrences of "premium" (historical material excluded), by meaning:

| Meaning | Occurrences | Examples | Decision |
|---|---|---|---|
| A + B. NPC+ tier under its legacy name | about 577 | save keys `premium_characters` (229) and `premium_reflections` (129, the NPC+ Reflection store); types `PremiumCharacterState`, `PremiumHistoryEntry`, `PremiumRollup`, `PremiumContractField`, `PremiumContractEvidence`, `PremiumReflection` (48); constants `PREMIUM_DEVELOPMENT_RETENTION`, `PREMIUM_ROLLUP_LIMITS` (19); functions `syncPremiumCharacters`, `preparePremiumCommand`, `premiumRecord`, `premiumHistory` (13); module `premium-characters.ts` (22 references); comments "premium record / premium state"; the Narrator block text "Premium continuity for household members" | kept; NAME-1 stays OPEN |
| C. image / media | 0 | | none exists |
| D. separate persistence concept | 0 current | `premium_bytes` in a historical soak tool measures the size of the NPC+ store (A) | none current |
| E. unrelated commercial / provider | 7 | "premium timber" in authored canon (`data/` and two canon tests) | correct English, untouched |

Why NAME-1 is not closed here:

- **The keys are save schema.** A rename needs the schema bump and a dual-key load. User decision D6 bundles that with the next migration, in Wave 3 together with PER-6.
- **A symbols-only rename splits the concept.** Renaming only the symbols now would give one concept two names (`snapshot.premium_characters: NpcPlusRecord[]`) until the bump.
- **Frozen material depends on it.** The frozen Reflection oracle (`tests/frozen/reflection/reflection-v2.ts`) imports `PremiumHistoryEntry`, and frozen material is not edited.
- **The Narrator text is prompt wire.**

The table above is the rename map for the schema-bump block.

## 8. Persistence compatibility decisions

- **Schema.** No serialized key, value, command kind, schema number or migration changed. The snapshot and save file schemas stay at 8.
- **Files.** No file under `src/persistence/` changed. `src/campaign/validation.ts` and `snapshot-validation.ts` changed only error message text and comments.
- **Character IDs.** Unchanged: `materializedCharacterId` produces the same `campaign_character_r<revision>_<slug>`, and the tests that assert IDs pass unchanged.
- **Save/load suites,** all green in the full run:
  - `tests/persistence/` (5 files);
  - `tests/session/campaign-lifecycle.integration.test.ts`;
  - `tests/identity/created-person-persistence.test.ts`;
  - `tests/identity/created-name-provenance.test.ts` (save/reload provenance);
  - `tests/identity/keep-track.test.ts`;
  - `tests/npc-plus/explicit-promotion.test.ts` (P17 save/load);
  - `tests/optional/optional-store-migration.test.ts`.

## 9. Tests and docs updates

Test titles rewritten because the lifecycle word was wrong (21; no assertion changed):

| File | Before | After |
|---|---|---|
| `commerce/narrated-captive-purchase.test.ts` | Brenna live shape: a narrator-invented captive is promoted, legally set up under the seller and bought in ONE proposal | Brenna live shape: a narrator-invented captive is materialized, legally set up under the seller and bought in ONE proposal |
| `commerce/narrated-captive-purchase.test.ts` | Maren live shape: a second narrated captive is promoted once, unpapered, with Brenna already home and nothing else changing | Maren live shape: a second narrated captive is materialized once, unpapered, with Brenna already home and nothing else changing |
| `commerce/narrated-captive-purchase.test.ts` | failed purchases never promote: funds, ambiguity, seller authority, stale revision, replay, missing price | failed purchases never materialize: funds, ambiguity, seller authority, stale revision, replay, missing price |
| `commerce/narrated-captive-purchase.test.ts` | unnamed captive: promoted under the narration's description, never an invented name; not re-promoted afterwards | unnamed captive: materialized under the narration's description, never an invented name; not re-materialized afterwards |
| `commerce/narrated-captive-purchase.test.ts` | duplicate names: a different narrated Brenna is a different person with a collision-safe ID; a present one is never re-promoted | duplicate names: a different narrated Brenna is a different person with a collision-safe ID; a present one is never re-materialized |
| `commerce/narrated-captive-purchase.test.ts` | non-invention: only established facts survive promotion; names imply nothing; hedged ages establish nothing | non-invention: only established facts survive materialization; names imply nothing; hedged ages establish nothing |
| `commerce/seller-continuity.test.ts` | seller continuity: a woman promoted by name BEFORE she was narrated as held (no captive role) is still the captive the seller later prices as 'the woman' — no unnamed duplicate | seller continuity: a woman materialized under a name BEFORE she was narrated as held (no captive role) is still the captive the seller later prices as 'the woman' — no unnamed duplicate |
| `context/background-grounding.test.ts` | F/I. purchase promotion: a verified origin survives; an invented named place is not frozen; other facts unchanged; nothing added | F/I. purchase materialization: a verified origin survives; an invented named place is not frozen; other facts unchanged; nothing added |
| `identity/created-name-provenance.test.ts` | promoted self-disclosed Mira: provenance survives RecentConversation eviction and save/reload, bounded and evidence-preserving | materialized self-disclosed Mira: provenance survives RecentConversation eviction and save/reload, bounded and evidence-preserving |
| `identity/created-person-persistence.test.ts` | historical Maren, named first: her name promotes her before the sale; the anonymous whittler sells her; no duplicate | historical Maren, named first: the sale materializes her under her established name; the anonymous whittler sells her; no duplicate |
| `identity/current-character-name-projection.test.ts` | promotion-time names, unnamed descriptors and unproven profile names keep their behavior | materialization-time names, unnamed descriptors and unproven profile names keep their behavior |
| `identity/current-character-name-projection.test.ts` | old saves: no name_source still loads; a promotion-time name shows, an unproven late profile name is not inferred | old saves: no name_source still loads; a materialization-time name shows, an unproven late profile name is not inferred |
| `identity/identity-continuity-edge-cases.test.ts` | naming while Nicco moves: the person may be left behind, so nobody is promoted anywhere (H1 location_changed) | naming while Nicco moves: the person may be left behind, so nobody is materialized anywhere (H1 location_changed) |
| `identity/identity-continuity-edge-cases.test.ts` | canonical NPC names are never promoted as narrator-created people | canonical NPC names are never materialized as narrator-created people |
| `identity/identity-continuity-edge-cases.test.ts` | a present persistent person is never re-promoted when narration repeats her name | a present persistent person is never re-materialized when narration repeats her name |
| `identity/long-playthrough-identity.regression.test.ts` | audit (fixed): non-colliding quoted self-name answers the reciprocal introduction and promotes a durable scene member once | audit (fixed): non-colliding quoted self-name answers the reciprocal introduction and, once authorized, materializes a durable scene member once |
| `identity/long-playthrough-identity.regression.test.ts` | audit (fixed): unquoted RPG ${name} self-answer promotes on the reciprocal turn; confirmation does not duplicate | audit (fixed): unquoted RPG ${name} self-answer materializes once, after authorization, on the reciprocal turn; confirmation does not duplicate |
| `identity/long-playthrough-identity.regression.test.ts` | audit (fixed): promotion keeps attributed evidence and narrator context keeps the self-disclosure source after history eviction | audit (fixed): materialization keeps attributed evidence and narrator context keeps the self-disclosure source after history eviction |
| `identity/scene-participants.test.ts` | 5-turn coordinator continuity: same participant, stable descriptor, correct replay speaker, no promotion or durable mutation | 5-turn coordinator continuity: same participant, stable descriptor, correct replay speaker, no materialization or durable mutation |
| `images/permanent-appearance.test.ts` | created origin evidence + profile override; the promotion-time copy is baseline, not an override; conditions excluded | created origin evidence + profile override; the materialization-time copy is baseline, not an override; conditions excluded |
| `turn/turn-stages.test.ts` | CommitPreparation: location_changed suppresses new promotions (semantics unchanged by the stage extraction) | CommitPreparation: location_changed suppresses new materializations (semantics unchanged by the stage extraction) |

Three titles were reworded beyond the word, because the old wording described pre-AUTH-2 behavior (a name that "promotes"):

- "the sale materializes her under her established name";
- "and, once authorized, materializes a durable scene member once";
- "self-answer materializes once, after authorization, on the reciprocal turn".

Each describes exactly what its unchanged body asserts.

**Assertion lines touched: 36, all mechanical.** They cover:

- a renamed helper identifier (`materialized(c)`, `provisionalNames`, `provisionalBackground`);
- five assert messages;
- one trailing comment;
- the producer-audit pin in `tests/authority/explicit-character-materialization.test.ts`. Its expected file list follows the module move (`["src/campaign/materialization.ts", "src/turn/identity/provisional-people.ts"]`) and its search pattern follows the symbol (`/buildMaterializedCharacter\(/`).

No other expected value changed. Per-file case counts are identical to Cleanup F for all 226 existing files.

**Guard.** `tests/architecture/lifecycle-vocabulary.architecture.test.ts` has 2 tests:

1. No current source, test, script or doc names `buildPromotedCharacter`, `PromotionInput`, `promotedCharacterId`, `promotedLabel` or `campaign/promotion.(js|ts)`, and the old module does not exist.
2. The materialization module exports `buildMaterializedCharacter`, imports no NPC+ or household module, and does not touch `premium_characters` or households.

It bans no word, so NPC+ promotion stays legal. Mutation check: an untracked `tests/support/tmp-mutation.ts` that named `buildPromotedCharacter` failed test 1; removing it restored 2/2. During the final run the guard caught a real reintroduction: the debt register's new closure note named the old symbol. The note was reworded and the full suite re-run green.

**Current docs updated:**

| Doc | Change |
|---|---|
| `README.md`, `docs/ARCHITECTURE.md` | the normative pair of words in the lifecycle sections |
| `docs/architecture/TURN_COORDINATOR.md` | materialization primitive, its callers, settlement re-stamp, sellers |
| `docs/architecture/NARRATIVE_AUTHORITY.md` | temporary participants and the background guardrail; the Phase 1S "promotion" option is now called materialization, noted as provided by Keep track |
| `docs/architecture/CITY_TRAVEL.md` | vocabulary |
| `docs/TESTING.md` | the lifecycle-words rule, the guard, the latest result |
| `docs/CURRENT_STATE.md` | status line |
| `docs/MASTER_DEBT_REGISTER.md` | status, closed-recently list, residual row, NAME-1 and PER-6 audit notes, PIPE-6 wording |

Historical reports were not touched.

## 10. Validation

From an empty `.build`, each step separately:

| Step | Result |
|---|---|
| `npm run clean` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm test` (build included) | **3701 tests, 3701 pass, 0 fail** (3699 + 2 guard) |
| `npm run benchmark:modern` | **55/55**, 0 known gaps, failing none |
| `npm run check:architecture` | 359 modules, 28 source back-edges (type imports, unchanged), **0 runtime back-edges** |
| `npm run check:docs` | 44 files, **0 broken** |
| per-file case counts vs Cleanup F | identical for all 226 files; +1 file (the guard, 2 tests) |
| identity suites (`tests/identity/`, 24 files) and provisional / materialization suites (`tests/authority/explicit-character-materialization`, `tests/identity/keep-track`, `created-person-*`, `identity-continuity-edge-cases`, `tests/commerce/narrated-captive-purchase`, `seller-continuity`) | green in the full run |
| save/load suites (section 8) | green in the full run |
| rename-mapped import graph | identical (section 4) |
| `actual-offer-browser-check.mjs` | exit 0 |
| `block5b-browser-check.mjs` | exit 0 |
| `block6-browser-check.mjs` | exit 0 |
| `block7-browser-check.mjs` | exit 0 |
| `confirmation-browser-check.mjs` | exit 0 |
| `explicit-promotion-browser-check.mjs` | exit 0 |
| `keep-track-browser-check.mjs` | exit 0 |
| `turn-reliability-browser-check.mjs` | exit 0 |

All eight browser checks ran:

- keep-track and explicit-promotion, as required;
- actual-offer, because person materialization paths were renamed;
- block7, because it builds a character with the renamed function;
- the other four, as the standard set.

No live call, no image call.

## 11. Debt closures

- **Lifecycle vocabulary residual: CLOSED.** This was the block 12 report residual and the register's technical-debt row. The materialization primitive is now `buildMaterializedCharacter` in `src/campaign/materialization.ts`. Materialization and NPC+ promotion no longer share a name in current code, tests or docs, and a guard enforces it.
- **NAME-1: re-audited, still OPEN.** It is schema-bound (section 7).
- **PER-6: re-audited, still OPEN.** Every item in it is a serialized name or a decode path.
- No other item changed.

## 12. Remaining vocabulary debt

The 87 rows the automatic pass still flags, reviewed:

| Group | Rows | Decision |
|---|---|---|
| NPC+ promotion in UI CSS, client, tests, browser check, capabilities, roadmap and UI debt rows | 42 | correct |
| Mannerism promotion, Reflection "soft-promoted", narrator focus, rumor → knowledge, feature → entity (authoring docs) | 21 | correct, other domains |
| "Promotion Pass 1.1" provenance, the TURN_COORDINATOR heading and report link, a removed `promotion-local` splitter | 15 | historical names |
| Save, prompt, diagnostic and dev-output names (section 4 "Kept" table) and the test campaign id `promotion_<n>` | 7 | kept for compatibility |
| `scripts/evaluation/casting-trace.mjs` prints `identity?.promoted`, a field that no longer exists (it prints nothing since AUTH-2) | 2 | stale evaluation tool, reported to the final audit; not changed (tool output) |

Still open:

- NAME-1 and PER-6, which wait for the schema bump;
- `established_at_promotion`, to be renamed only with a prompt-version change, if ever;
- the casting-trace field.

## 13. Final audit handoff

The final audit starts from the pushed Cleanup G commit. Facts it needs:

- **Materialization primitive:** `src/campaign/materialization.ts`. Its only caller is `materializeProvisional`.
- **Lifecycle guard:** `tests/architecture/lifecycle-vocabulary.architecture.test.ts`.
- **NAME-1 and PER-6** are schema-bound and stay with the next migration.
- **`casting-trace.mjs`** reads a removed field.
- **Save schema** 8, unchanged.
