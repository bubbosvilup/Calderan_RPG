# Consolidation Block 12: KPG-1 and PER-2 cleanup (Keep track)

Status: uncommitted working tree on top of main `a6d1bcd`, 2026-10-13. Scope: explicit provisional-person persistence (**Keep track**), the scene-identity persistence review, and the residual debt documentation reconciliation. This block replaces the previously considered ambiguity-verifier block: **no LLM verifier was added**, and Keep track itself calls no model.

## 1. Baseline

| Check | Result on `a6d1bcd` (before) |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm test` | 3637 tests, 3637 pass, 0 fail |
| `npm run benchmark:modern` | 45 scenarios, 44 PASS, 0 FAIL, 1 KNOWN PRODUCT GAP (I4, KPG-1) |

The known gap: a provisional person (a named apple seller, "My name is Maren.") could become a persistent `CampaignCharacter` only through the person Actual Offer Accept. Nothing let the player keep an arbitrary stranger, and an unnamed scene participant was lost on reload (PER-2), with its `scene_npc_<n>` counter restarting (ID-2).

## 2. Lifecycle audit

Where a provisional person lives today (unchanged by this block, read to design the primitive):

| Source | What it holds | Lifetime |
| --- | --- | --- |
| `readScene` (`narration-facts/scene-identity.ts`) | `NarratedPerson`: `narrated:<name>` for a named person, `narrated:<noun>` for an unnamed captive, the persistent id when narration names a persistent character | re-read every turn from the recent exchanges (restored on load as continuity) |
| `SceneParticipants` (`turn/scene-participants.ts`) | `scene_npc_<n>` participants the player addressed ("the guard"), with descriptor, role, `established_name` | session memory only |
| `linkedParticipant` (`turn/provisional-people.ts`) | the one participant that is a given narrated person | derived |

Field classification for materialization:

| Class | Fields |
| --- | --- |
| KEEP ON MATERIALIZATION | name (and `name_source`), sex, age, species, appearance, descriptor / noun, current location, the scene ref as `origin_snapshot.ephemeral_ref` (provenance and idempotency key), the evidence sentences that established them |
| DERIVE / NORMALIZE | captive → neutral role "narrated captive; legal status unestablished"; a disambiguated label ("Guard (2)"); a participant's `established_name` when narration never repeated it |
| DROP | condition, background claims, the participant's standing or role "slave" as a legal fact, the conversation-partner binding |
| REQUIRE DOMAIN AUTHORITY | legal status and holder, ownership, household membership, NPC+, relationships, inventory, funds, `current.conditions` |

## 3. Materialization contract

`src/turn/keep-track.ts`:

- `trackablePeople(...)` lists, deterministically and read-only, the provisional people of the current scene: (1) present named narrated people with no character id; (2) unnamed narrated people only when exactly one scene participant is that person (an unanchored noun can cover several people: fail closed); (3) the remaining present, not departed participants at the player's location. Each entry carries an opaque token `sha256("keep-track\0campaign_id\0ref\0location").slice(0,24)`.
- `keepTrackCommand(...)` builds exactly one `register_character` through the single existing builder `materializeProvisional`, with the new trigger `player_kept` and `identity_only: true` (condition and background are stripped). Origin `created`, status active, current location; a captive gets the neutral role so a later person offer binds to the same id.
- Invariants: the same ref at the same place always yields the same token and at most one character; a second press answers "already kept" with no revision (`keptCharacter` resolves the token against non-retired characters' `ephemeral_ref` + `location_id`); there is no second revision, no fuzzy match, no merge by name, no embedding and no model call.

Check order in `GameSession.keepTrack({token, expected_revision})`: closed / busy → malformed token (`unknown_person`) → already kept (ok, `already`, no revision) → stale revision → token not in the recomputed list (`unknown_person`: forged, other campaign, expired after moving away) → blocked reasons → commit one `register_character` → retire the linked scene participant (the scene never shows the same person twice).

Supporting changes: `identity_only` in `MaterializeInput`; trigger `player_kept` in `src/campaign/types.ts` and `validation.ts`; `TurnCoordinator.trackablePeople`; ID-2 fix `nextParticipantSeed(snapshot)`, which seeds the participant counter from the highest `scene_npc_<n>` recorded in characters' provenance and in offer plans.

## 4. Authority design

Keep track is a **Class C-style direct explicit action**, ref- and revision-guarded, like Accept and Promote to NPC+, and **not** a `PendingConfirmation` card. Reasoning:

- The player's button press is itself the authorization; nothing narration, the Controller or the player's typed words produce can reach it.
- The effect is small and reversible by operator tooling (an ordinary campaign NPC, retire/merge exist), so a second confirmation step adds friction without protecting anything.
- The client sends only an opaque token and `expected_revision`; the server recomputes the list and resolves the token, so the browser can name no id, name or payload.
- It reuses the one materialization builder, so the producers of `register_character` stay exactly three: campaign creation, the person Actual Offer Accept (`person-offers.ts`) and Keep track (`keep-track.ts`). The block 5B producer audit test now pins that list.

## 5. UI

- `GameSession.getProvisionalPeopleView()` → `{people:[{token,label,held,keepable,reason?}]}`, exposed as `state.provisional`; route `POST /api/people/keep` (200 / 409 stale or busy / 422 refused).
- `src/ui/index.html`, `client.js`, `style.css`: a "Temporary" group under the scene participants, one row per person with a **Keep track** button; a blocked row shows its reason and a disabled button; an error is shown on the row.
- Offline browser check `scripts/keep-track-browser-check.mjs`, **15/15 PASS**: (1) one provisional person listed; (2) affordance visible and enabled; (3) not among the persistent people; (4-5) one press sends exactly one request carrying only `token` and `expected_revision`; (6) the revision moves exactly once; (7) Hollis appears among the persistent people and (7b) his drawer opens as an ordinary campaign NPC; (8) the provisional row disappears; (9-10) after save and reload he is present once, with one created character; (11) no NPC+ control at the market; (11b) inside Heartstone the existing Promote to NPC+ control is offered. Same label: (S1) "Guard (1)" / "Guard (2)"; (S2) distinct 24-hex tokens; (S3) the request carries the second guard's token only; (S4) exactly that guard (`scene_npc_2`) is kept, the other stays temporary. Screenshots: `1-provisional`, `2-kept-drawer`, `3-after-reload`, `4-two-guards`, `5-second-guard-kept`, `6-heartstone-promote`.

## 6. Actual Offer interaction

| Case | Behavior | Evidence |
| --- | --- | --- |
| A, not kept | Accept materializes the subject exactly as before (`name_established`, one atomic batch with payment and legal transfer) | K8 |
| B, kept before the offer | the kept captive has the neutral captive role and no legal record; the later offer binds to that SAME id (`campaign_character_r3_lysa`) and Accept only pays and transfers legal status | K7 |
| C, Keep after Accept | the old token resolves to the bought character: `already`, no revision | K8 |
| D, stale token | refused (`stale` / `unknown_person`), nothing created | K6, unit tests |
| open offer | its subject cannot be kept (`offer_subject`: "Accepting it already keeps them") | K8 |

## 7. KPG-1

**CLOSED.** I4 now passes as an ordinary scenario: after several friendly turns the player's words alone persist nobody; the explicit Keep track then creates `["Hollis"]` with `kept`, revision delta 1, no NPC+ and no household. One NarrationFacts fix was needed: a speaker tag that is the self-introducer's own name ("*Hollis tips his cap.* "My name is Hollis."") was counted as a second self-speaker and the reading dropped Hollis; `readScene` now excludes `other:<that name>` from the competing speakers.

## 8. PER-2

Split:

- **PER-2A CLOSED (block 12):** a provisional person the player wants to keep survives save/reload as the same persistent id (Keep track), and **ID-2 is CLOSED** (participant counter seeded from the snapshot after reload, so a new participant never reuses a kept ref).
- **PER-2B OPEN (accepted limitation):** an unkept, unnamed scene participant is session-local and is not saved; a named provisional person is re-read after reload only while the restored recent exchanges still show them. Persisting unkept participants would make the snapshot remember people the player did not choose to keep, which this block deliberately does not do.

## 9. Save and reload (PERSIST-A..F)

`tests/provisional-keep-track.test.ts` (12 tests, all pass):

| ID | Check | Result |
| --- | --- | --- |
| PERSIST-A / E | keep a named person → save → reload: same id, name and location; the name is preserved | PASS |
| PERSIST-B | an untracked person is not persistent after reload | PASS |
| PERSIST-C | replay and stale tokens create no duplicate | PASS |
| PERSIST-D | keep an unnamed guard, then "My name is Doran": the same id is named in place | PASS |
| PERSIST-F | keep Tamsin, then the Heartstone rite: the same id becomes NPC+ and survives reload | PASS |

No schema bump: the persisted snapshot stays 8 (in memory 7); `player_kept` is an additive enum value, so an older build rejects a save containing it (forward-compatibility rule, PER-5 class).

## 10. Failure and idempotency

Fail closed, nothing created, no revision, for: a malformed token; a forged token; a token from another campaign; an expired token (the player moved away); a stale `expected_revision`; two present people sharing the name (`ambiguous_name`); a canon figure's exact name (`canonical_name`); a same-name persistent person elsewhere (`same_name_persistent`, never merged); the subject of an open offer (`offer_subject`). Already materialized → `{ok:true, changed:false, already:true}`, no revision. Identity-only facts are asserted (no conditions, no background, the captive role, no legal record). The HTTP route and the client's request body (token and revision only) are tested.

## 11. Benchmark

`npm run benchmark:modern`: **55 scenarios, 55 PASS, 0 FAIL, 0 KNOWN PRODUCT GAPS** (keep_track 10/10). I4 lost its `known_gap` mark and no replacement gap was manufactured. The known-gap gate in `tests/modern-benchmark.test.ts` now runs on a synthetic gap built from I1, and a new test asserts that no scenario is a known gap.

| ID | Purpose |
| --- | --- |
| K1 | narration, a self-introduced name, repeated appearances and the player's words persist nobody |
| K2 | Keep track creates one ordinary character in one revision with zero provider calls; a second press is `already`; a later turn rebinds to it |
| K3 | a kept person survives save/reload as the same character (`campaign_character_r3_hollis`) |
| K4 | an untracked person stays transient across save/reload |
| K5 | two guards are listed as "Guard (1)" / "Guard (2)"; keeping the second keeps only him |
| K6 | stale, forged and moved-away tokens are refused |
| K7 | Actual Offer case B (kept before the offer, same id) |
| K8 | Actual Offer cases A and C; the open offer's subject cannot be kept |
| K9 | Keep track then the Heartstone rite: same id NPC+ through reload (`campaign_character_r4_tamsin`) |
| K10 | a persistent Hollis exists elsewhere: the provisional Hollis is shown but cannot be kept (no merge by name) |

## 12. Live

`src/dev/keep-track-live.ts`, production `GameSession` → `TurnCoordinator` path, one attempt each, no reroll, no retry needed. Evidence: `docs/evaluations/keep_track_live/result_AB.json`. 11 provider calls in total (6 Narrator `z-ai/glm-5.2`, 5 Controller), about 59.7k tokens; the provider reported no cost figure.

| Run | What happened | Verdict |
| --- | --- | --- |
| **LIVE A** (Maren-like) | the Narrator described the apple seller; asked her name, she answered "Maren."; the sidebar offered exactly "Maren"; Keep track created `campaign_character_r3_maren` (trigger `player_kept`, ref `narrated:maren`, one revision, zero provider calls, replay `already`); she appeared among the persistent people and left the temporary list; the next turn ("*Maren looks at him a moment...*") created nobody; after save and reload she is present; no NPC+, household or legal status | **PASS** |
| **LIVE B** (unnamed, optional) | the porter was offered as "Laborer" (one scene participant); Keep track before any name created `campaign_character_r3_laborer` with no name; asked his name, he answered "Aldren." and the SAME id was named in place (`same_id: true`); after reload "Aldren" is present; nothing else created | **PASS** |

## 13. Residual debt audit

Every open item in `docs/MASTER_DEBT_REGISTER.md` was checked against the code (a static, read-only pass of `a6d1bcd` plus this tree; nothing was run for it): **165 items; 148 still exist, 12 are partial, 4 were already fixed, 1 cannot be verified statically** (TEST-8, test timing). By category: TECHNICAL DEBT 46, UI 33, PIPELINE 18, PERSISTENCE 17, DEFERRED SEMANTIC 17, PRODUCT GAP 14, CONTEXT 12, ECONOMY 8.

| Item | Verdict | Evidence |
| --- | --- | --- |
| KPG-1 | CLOSED (this block) | Keep track; I4 PASS |
| PER-2 | split: PER-2A CLOSED, PER-2B OPEN (P3, accepted) | section 8 |
| ID-2 (I11) | CLOSED (this block) | `nextParticipantSeed`; reload test |
| PER-1 | exists, P2 | `persistence/strict-json.ts:2,6`; `invalid_save` is fatal; the mannerism driver moved to the side store in block 7, `trade_offers` (TRD-12) remains |
| ECO-1 | exists, P2 (decision D3) | `config/economy.yaml` silver anchors vs integer gold funds (`validation.ts:130`) |
| TRD-11 | exists, P2, blocked on ECO-1 | goods BUY/SELL write no `transactions` row (`trade.ts:175-210`); DOC-12 is the same item |
| CTX-1 | exists, P2 | `prompt-builder.ts:227` puts `(${c.id})` in the prompt; `narrator-identity.ts` id pattern has no boundary |
| CTX-2 residual | partial, P2 | the draft stream is closed (block 4); no deterministic output-side leak check for unlearned names |
| PIPE-6 / PIPE-7 | exist, P2 (ARCH-2 residual) | commit preparation outside `authorizeWithEvidence`; commands fixed from the draft |
| H1 residuals | exist, P3, fail closed | `them` handover, shared first-name condition, fronted-recipient receipt |
| F readers | exist, P2 (ARCH-2 residual) | `evidence-authorization.ts`, `turn-evidence.ts` keep their own verb lists |
| `NAME_REQUEST` mismatch | exists, P3 | the disclosure gate and `asksName` disagree both ways (`identity-request.ts:6` vs `:17-36`) |
| `addressed_verb` residual | exists, P3, deliberate | recipient facts extracted (`identity-forms.ts:179`), unused by commerce (`commerce-evidence.ts:32-33`) |
| Closed ARCH / AUTH / REV | confirmed closed | ARCH-1 (blocks 6-7), ARCH-2 narration side (9-11), AUTH-1 (5A), AUTH-2 (5B), REV-2 (4), REV-1 optional part (7) |
| MOV-4 residual, I16, PIPE-8, ECO-3 | were still listed open; already CLOSED | block 9 `9d15212` inverse audit; block 4 `eb05734`; test from `7820d5a` |
| **AUTH-5 (most important finding)** | exists, P2 | `characterForUpdate` (`campaign/preparation.ts:11-20`, verified) creates a campaign record for any canonical id it changes, so "no production producer of canonical-origin records" (F8 / ID-8 / NPC-3) was untrue; by static reading such an NPC would become rite-eligible before decision D5. ID-8 raised to P2. Not reproduced; out of this block's scope |

Wrong register text corrected: §1C.2 (AUTH-2 called open), the §8 schema header (8, not 7), PRV-1 (768 + 1024 recovery, not 512), UI-15 (no per-token streaming), UI-30 (tooling, not performance), DOC-12 (path and self-contradiction), stale counts (`"nicco"` 240 in 77 files, "premium" 379 files, 32 orphan `src/dev` files, 2,003 tracked files). Duplicates mapped (for example ID-8 = NPC-3 = F8 = D5, REV-3 = UI-6, TRD-11 = DOC-12). About 25 severities lowered P2 → P3; ID-8 raised. The register now has section 1A.3 and one concise **Current residual debt** section that wins over audit-time row severities.

## 14. Documentation changes

README (authority table, lifecycle diagram PROVISIONAL → Keep track or Accept → PERSISTENT, testing, current status, known gaps now empty with the PER-2B limitation, roadmap: Weather UI then Property / Heartstone); `docs/ARCHITECTURE.md` (§2b Keep track row, §2c lifecycle and the Keep track paragraph with the authority decision, gate line); `docs/CURRENT_STATE.md` (header, §8d, tests, limitations); `docs/ROADMAP.md`; `docs/MASTER_ROADMAP.md` (header, T-IDENT, A10 wording, Wave A order); `docs/MASTER_DEBT_REGISTER.md` (section 13 above, the new "Current residual debt" section); `docs/UI_ENGINE_CONTRACT.md` (§7c2 Keep track); `docs/UI.md` (Temporary people); `docs/architecture/NARRATION_FACTS.md` (keep-track consumer row, self-introduction tag rule, known limits); `docs/architecture/PERSISTENCE.md` (Keep track and the PER-2 split); `docs/TESTING.md` (counts, block 12 layer, benchmark 55). Historical evaluation reports were not rewritten.

README fact check: the producers of `register_character` (three), the lifecycle, the known gaps (none in the benchmark), the roadmap, the test and benchmark counts, the save schema (persisted 8 / in memory 7), NarrationFacts and Actual Offer statements were checked against the code; README carries no historical milestone prose and does not list KPG-1.

## 15. Final counts

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npm test` | **3660 tests, 3660 pass, 0 fail** from a clean build (`.build` removed first; no rerun needed) |
| `npm run benchmark:modern` | 55 scenarios, 55 PASS, 0 FAIL, 0 KNOWN PRODUCT GAPS |
| Browser check | 15/15 PASS |
| Live | A PASS, B PASS |
| Code diff | new `src/turn/keep-track.ts` (137 lines); 15 modified source/test files, +275 / -30; new tests `tests/provisional-keep-track.test.ts`, benchmark K1-K10; new scripts `scripts/keep-track-browser-check.mjs`, `src/dev/keep-track-live.ts` |

Parallel audit note (received during the block) applied: the final counts come from a clean `.build`; the new test, browser check and live harness have behavior names (`tests/provisional-keep-track.test.ts`, `scripts/keep-track-browser-check.mjs`, `src/dev/keep-track-live.ts`, evidence in `docs/evaluations/keep_track_live/`); vocabulary is PROVISIONAL → PERSISTENT = materialization, Keep track = the explicit player source of it, Campaign NPC → NPC+ = promotion; the new source is the value `player_kept` in the existing `origin_snapshot.trigger` union (no second provenance system); no module was moved or renamed; Keep track creates an ordinary Campaign NPC and the derived NPC+ tier is unchanged.

## 16. Remaining debt

Grouped as in the register's **Current residual debt** section (P2 items only; the P3 list is in the register):

- **Product gap:** ID-8 / NPC-3 (canon NPC records and NPC+, decision D5, implicit path via AUTH-5); NPC-1 / NPC-2 (NPC+ rejoin and behaviour outside the household); ITM-3, ITM-4, ITM-5 (owner vs carrier, stable item key and quantity, containers).
- **Technical debt:** AUTH-5; CI-1; TEST-1; TEST-6; REPO-1.
- **Persistence:** PER-1; PER-4; TRD-12; F7; I1. PER-2B is P3 and accepted.
- **Economy:** ECO-1; TRD-11; TRD-6; TRD-7.
- **Context:** CTX-1; CTX-2 residual; CTX-3; CTX-4; PIPE-9.
- **Pipeline:** PIPE-6, PIPE-7 (ARCH-2 residual); PIPE-4; PIPE-10; PRV-1; PRV-2; IMG-2.
- **UI:** UI-1; UI-2; UI-4; UI-5; UI-17; UI-22; UI-28.
- **Deferred semantic:** the F evidence readers; TRD-9.

Vocabulary residual: `buildPromotedCharacter` in `src/turn/provisional-people.ts` names the PROVISIONAL → PERSISTENT materialization builder with "promote" (promotion means Campaign NPC → NPC+). It was not renamed here, because no modules or symbols are renamed in this block; it belongs to the repository cleanup.

## 17. Recommendation for next feature work

The consolidation is complete and the benchmark records no known product gap. Proceed with the roadmap's feature order: **Weather UI** (presentation over the existing deterministic weather read model), then **Property / Heartstone property**, which still needs its prerequisites first (the canonical-NPC policy, `quantity` / `container_id`, equipment slots). Keep the benchmark as the before/after net; add a scenario per new domain rather than a new semantic grammar outside NarrationFacts. Open user decisions that do not block Weather UI: whether a promoted NPC+ who leaves the household stays behavior-active, real avatar Upload, and whether PER-2B should ever change.
