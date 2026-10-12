# Caldrevan: Master Roadmap

Status: Current (audit snapshot). Audited: 2026-10-12 on main `c0608a6`. Companion: [Master Technical Debt Register](MASTER_DEBT_REGISTER.md) (every ID below, e.g. `MOV-1`, refers to it). Day-to-day status lives in [Current state](CURRENT_STATE.md) and [Roadmap and known limitations](ROADMAP.md); this document is the long view.

How it was reconstructed: git history on this clone starts on 2026-10-05 (50 commits; earlier work is squashed), so earlier eras are rebuilt from the dated reports in [`evaluations/`](evaluations/), the Phase documents in [`architecture/`](architecture/), the root pass reports and `DEBT_REGISTER.md`. Dates are the report dates; where a precise date was not available the era carries a range. The "next" order at the end is a recommendation, not a decision.

## 1. What has been built (from the beginning)

### Era 0: engine foundations (Phase 1, to late September 2026)
- **World runtime and canon foundation** (Phases 1A to 1E): authored YAML canon, `WorldStore`, visibility tiers, Scene RAM and scene deltas, mana runtime. Records: [Phase 1 decisions](architecture/PHASE_1_DECISIONS.md), [Phase 1E](architecture/PHASE_1E.md), [Scene RAM](architecture/SCENE_RAM.md), [Scene delta engine](architecture/SCENE_DELTA_ENGINE.md).
- **Retrieval** (Phase 1F onward): lexical index, optional semantic index, evaluation harnesses. [Retrieval](architecture/RETRIEVAL.md), [Lexical search](architecture/LEXICAL_SEARCH.md), [Semantic search](architecture/SEMANTIC_SEARCH.md). Semantic search was never wired into production.
- **Campaign state and the turn pipeline**: `CampaignState` with `prepare`/`commit` and mandatory `expected_revision`; Narrator draft, State Controller proposal, schema validation, evidence authorization, narration audit, atomic commit. [Campaign state](architecture/CAMPAIGN_STATE.md), [Turn coordinator](architecture/TURN_COORDINATOR.md), [Evidence authorization](architecture/EVIDENCE_AUTHORIZATION.md), [Narrative authority](architecture/NARRATIVE_AUTHORITY.md).
- **Domains**: items and transfers ([Item domain](architecture/ITEM_DOMAIN.md), [Transfer domain V1](architecture/TRANSFER_DOMAIN_V1.md), physical interaction), households, knowledge, relationships, funds, schedules, city travel.

### Era 1: providers, reliability, hardening (late September to 2 October)
- Narrator cross-model bake-off (2026-09-30); Controller bake-offs rounds 2 and 3, switch to Qwen then later models; Controller reliability pass 1 (2026-09-30); provider reliability contract; retry lifecycle (D-05).
- **Hardening H1 to H6** (H6 final audit 2026-10-01): gap-to-target audit, live robustness, diagnostics, retry benchmarks, live findings repair.
- **D-series**: D-04 deterministic lossless context compaction (closed 2026-10-03); D-05 retry validation (closed); D-06 occasional structured-output failures (minor, open); D-09 Reflection (engineering pass, semantic validators v2 to v23, production integration; narrative utility unproven, so deferred to opt-in shadow mode); D-10 emergent NPC+ mannerisms (closed, calibrated); D-26 mannerism epistemic fidelity (open, shadow).
- **NPC+ passes 1 to 10** (closure 2026-10-02): premium state for promoted characters, follow grammar, follow-choice classification, recognition closure.

### Era 2: movement closure and engine freeze (2 to 5 October)
- Movement/follow debt closure and final movement closure (D-01, D-02, D-07, D-11, D-13, D-14, D-15, D-24).
- **Engine closure before UI (2026-10-02)**: verdict `ENGINE_READY_FOR_UI_WITH_NON_BLOCKING_DEBT`; app facade `src/app` (`GameSession`, `SessionView`, `AppError`, `TurnTrace`); engine freeze register.
- Repository cleanup (2026-10-03, 1,164 to 667 files; since reversed, see REPO-1..6).
- Playthrough tooling and the 421-turn historical transcript (later the replay oracle).

### Era 3: P-series live-playtest fixes and first UI (5 to 8 October)
- P3.1 to P3.5 identity gating, controlled canonical name disclosure, participant continuity, name knowledge commit; P6.1 narrator focus projection; P8 economic baseline and price anchors (`config/economy.yaml`); P10 observation; P11 KISS time-of-day and temporal action resolver; P12.1/P12.2 bounded recent scene narration and canonical departure reconciliation; canonical NPC casting fix; character performance contract pilot.
- Player travel authority and location safe-switch (2026-10-06); created-person identity binding and name provenance (2026-10-07); long-playthrough continuity audit.
- **UI**: playtest shell V0 (2026-10-05), immersive playtest V1 with provisional streaming (2026-10-06), play-screen rebuild and player-safe NPC drawer (2026-10-07), Household overview and NPC+ appearance editor shell.
- **Images**: Permanent Appearance V1, Portrait Prompt Builder V1, Portrait Image Generation V1, Portrait Gallery with Avatar/Full Body roles (V2), anime portrait benchmark (all 2026-10-07), player sheet and NPC image system (2026-10-08).

### Era 4: foundations for property and simulation (9 to 11 October)
- **Scene State Projection V1/V1.1** and foundation certification (`[CURRENT SCENE]`, `npm run inspect:scene`), prompt debt cleanup (Consolidation Pass A), Consolidation Pass B+C hardening, Controller/authorization hardening, subsystem hardening.
- **Major canon lore migration** (Helion / Aureth / The First Voice) and **canon gap closure**; canon docs.
- **Calendar V1, Season V1, Weather V1** with environment exposure (engine and read model only); narrator keeps HH:MM time.
- Foundation re-certification, item pickup and lifecycle fix, **Pre-Property Debt Zero**.
- **Heartstone**: opening documents, household rules, rite, recognition warmth; **Canon NPC avatars**; **player visuals** and Inventory UI (grid, read-only 4-slot equipment presentation, authoritative Gold); item sprite generation; persistent campaigns (manual save, autosave, recovery, schema 6 / save 5); image generation UX hardening.
- Historical replay fidelity passes 1 and 2 (best 22/32 on the oracle), which exposed that transcript-only replay cannot represent explicit actions.

### Era 5: player-authorized state transitions (11 to 12 October)
- **Explicit NPC+ promotion** (`4883956`..`1cae42e`): the Heartstone rite is completed only by the player's UI action; semantic rite inference removed.
- **Actual Offer V1** (`729990e`): goods BUY/SELL and person BUY as player-accepted `TradeOffer`s; atomic Accept; masking; "player-authorized state transitions" architecture principle.
- Colour/calendar UI polish (`66631f8`); campaign deletion (soft delete, `63af784`).
- **P0 foreground canonical identity binding** (`d4e9e22`): objective partner identity, conflicting-name guard, live certification (both scenarios pass).
- **Person Actual Offer end to end** (`c0608a6`): spoken price forms, stable subject across supersession, Slave NPC on Accept, same-entity rename; 3278 tests.
- **Consolidation blocks 1 and 2** (2026-10-12; block 1 on main `4b8fdc9`, block 2 on main after live certification): IMG-1, TRD-1, TRD-2, TRD-1b, TRD-3, TRD-4, TRD-5, TRD-10 fixed offline; 3313 tests. TRD-11 and ECO-1 open.

### Current capability snapshot
Playable persistent campaign on a local web UI with autosave; canon-grounded narration on `z-ai/glm-5.2` and a Controller on `openai/gpt-6-luna` (fallback `claude-haiku-5.5`); player-authorized trade and promotion; masked identity; derived calendar and weather; item lifecycle and Gold; player and NPC+ image workflows on Qwen-Image + Raena LoRA; 3278 offline tests (latest recorded run), zero live calls in `npm test`.

## 2. What remains: tracks

Items reference the debt register. "Roadmap" means new capability; "Debt" means a fix from the register.

### T-MOVE: companions and group movement
- **Done (consolidation block 3, 2026-10-12):** MOV-1, MOV-3, MOV-4 and ID-1 fixed offline with the derived per-turn predicate `followCandidates` (`src/turn/follow-candidates.ts`; reasons `npc_plus_active`, `held_by_player`, `household_member`, `invited_this_turn`), shared by intent notes, authorization and audit; MOV-2 closed in the narrow form only (a held person named and led by the player moves with Nicco in the same atomic batch). The known bug "let's go home leaves the purchased person at the market" is fixed. No persisted party. Report: [block 3](evaluations/CONSOLIDATION_BLOCK3_COMPANION_MOVEMENT.md).
- **Next (roadmap):** reverse audit for an escorted person narrated as staying behind; player feedback for ambiguous multi-act travel (MOV-6); a derived-per-turn "party" view (never persisted) for the UI scene panel; follow state in the benchmark.
- **Later:** NPC routines beyond schedules; travel parties across the city map; pursuit and separation rules (needs combat/threat design).

### T-IDENT: identity
`PersonIdentity` read model (ID-3, ID-6); reload-safe ephemeral refs (ID-2) and scene-participant persistence (PER-2); snapshot identity invariants and a duplicate-person diagnostic (ID-4); partial-name masking leak suite (ID-7); retire/merge command for false-positive characters (AUTH-2); canonical-NPC campaign-record policy (NPC-3, ID-8). Invariant checklist: register §6.2.

### T-ECON: economy and commerce
- **Debt first:** SELL ownership and transfer (TRD-1, TRD-1b), delivered-text revalidation (TRD-2), shared gold-price extractor (TRD-3, TRD-4), offer digest (TRD-5), canon auction/vendor flags (TRD-7), goods ledger (TRD-11), pruning (TRD-12).
- **Currency decision** (ECO-1): integer silver internally, display G/S (schema 7), align anchors, authorizers, UI.
- **Roadmap in dependency order:** funds ledger with causes (ECO-4) -> `quantity` on items (ITM-4, ITM-5) -> merchant wallets and stock as items held by merchants -> services (rent, meals, lodging) -> recurring costs (wages, upkeep, taxes) -> rewards and loot tables -> debt (creditor ids) -> multi-currency and exchange -> Auction House as a separate lot/bid/close engine (`ACTUAL_OFFER.md` §13) -> person SELL.
- Hardening options for natural-language price extraction (register §4): single parser, explicit unit, evidence sentence on the card, controller-proposed person offers alongside the narration reader.

### T-ITEMS: items, equipment, property
- Canonical equipment slot enum and category set incl. headwear/footwear (ITM-1); equip/unequip as a UI-confirmed engine action (ITM-6); stop persisting `empty_slots` (ITM-2); custody/loan states (ITM-3); stacks and weight (ITM-5).
- **Property system** (Heartstone property work): generic property entity, containers and property storage, room use/ownership, upgrades. Depends on `quantity`/`container_id`, the canonical-NPC policy and the Persistence split (PER-3).
- Item visual asset system: authored template library and thumbnails; sprite concurrency/size/cost caps (IMG-6).

### T-WEATHER: Weather UI
Next product feature in the existing roadmap: calendar and weather in the scene header/sidebar, exposure hints, a read-only weather panel. Engine and read model exist; there is no manual reroll by design. Needs UI items UI-9, UI-10, UI-14 and the sidebar density work (UI-7) to land cleanly.

### T-NPC+: Heartstone and NPC+
Rejoin via the same UI action (NPC-1); decide behaviour-activity (NPC-2); richer promotion screen (roles, appearance check, portrait step) and visible promote affordance (UI-3); Personality and Relations tabs; avatar Upload pipeline (currently `AVATAR_UPLOAD_SUPPORTED = false`); `premium_*` to `npc_plus` naming migration (NAME-1); decision on automatic demotion (currently none).

### T-PIPE: pipeline, context, providers
- **Safety first:** PIPE-1 / CTX-2 draft preview policy and deterministic leak filter; CTX-1 opaque refs and boundary-aware masking; PIPE-2 non-throwing publication; PIPE-8 single delivery order.
- **Performance:** PIPE-4 and PIPE-9 (cached budget, retrieval headroom); PIPE-3 respond before maintenance; PIPE-10 degrade-not-fail retrieval; PIPE-11 name index.
- **Structure:** `NarrationFacts` claim extractor (PIPE-5/6/7); `TurnFrame`; `ControllerView` with a token budget (CTX-3); tiered context-budget strategy (register §9); `OperationLock` and `GameSession` decomposition (PIPE-12).
- **Providers:** narrator health counters and optional user-triggered backup route (PRV-1); strict Controller output once normalization is rare (PRV-2); honour `Retry-After` (PRV-3); remove decorative env var (PRV-4); delete dead integrations (PRV-7).
- **D-series carry-overs:** D-06 occasional structured-output invalid (minor); D-09 reflection stays opt-in shadow; D-19 reconciliation/redaction rate; D-22 turn-level semantic retrieval not live-tested (decision on semantic search); D-26 mannerism epistemic fidelity shadow collection.

### T-IMG: images
Adult-only parity (IMG-1); cancellation (IMG-2); body-read timeouts (IMG-3); real per-slot progress (IMG-4); thumbnails, cache headers, canon avatar re-encode (IMG-5); cost ledger (IMG-7); visual-description field (IMG-8); decide reference images (IMG-10). Later: avatar Upload, reference-image conditioning, regeneration of canonical avatars, headwear/footwear art.

### T-PERSIST: persistence
Save size budget and non-fatal oversize (PER-1); unified migration chain with real older-schema fixtures (PER-4); forward-compat error mapping and bump discipline (PER-5); derived/media side store (PER-3, REV-1); legacy field removal (PER-6); delete retention and restore (PER-7); save generation counter (PER-9).

### T-UI: UI/UX
- **Bundle 1 (trust and safety):** keyboard reachability (UI-1), Accept/Promote visual language and confirm (UI-2, UI-3), live-region fix (UI-15), identity boolean/`initial` from the server (UI-17), error copy (UI-5, UI-24).
- **Bundle 2 (scale):** transcript paging and polling (UI-4), sidebar caps and long names (UI-7, UI-8), persistent receipts (UI-22), inventory node keys (UI-20).
- **Bundle 3 (responsive and polish):** mobile layout (UI-28), token/CSS cleanup (UI-12, UI-13), dead code removal, doc'd `/location` and alternatives (UI-16, UI-27), facade fields replacing client logic (UI-29).
- **Future screens:** World and Debug (currently disabled placeholders), Weather UI, Property/containers, Personality and Relations tabs, equipment actions, quest/journal when a quest engine exists. Complete the visual audit with a seeded 20+ character / 300-item campaign (register §0).
- Fix `scripts/*browser-check` portability and adopt Playwright as a documented dev dependency.

### T-TEST: tests and certification
- **Modern benchmark** (register §14): runner around `GameSession`, `caldrevan-bench/1` scenarios, recorded Narrator/Controller layer, live certification layer; port the existing stories first, then a 100-turn market-to-Heartstone campaign with explicit Accept and Promote steps; retire the historical replay as a gate.
- Fix the flaky lifecycle test with an injected clock (TEST-1); move `src/dev` fixtures to `tests/support` (REPO-10); rename pass-numbered tests by domain; add the missing concurrency, load-older-save, companion-persistence, malformed-body and fuzz tests (TEST-6); measure suite timing; scale fixture (200 characters / 500 facts / 100 items).
- CI with `npm ci`, typecheck, build, test; `noUnusedLocals`; `.build` clean (CI-1, CI-2).

### T-WORLD: content and simulation (not started)
Quest engine; combat and medicine; deeper rumor propagation; world event ledger; economy history; NPC routines beyond schedules; South settlements; weather physics (temperature, wind, humidity, survival effects); additional canonical avatars and authored item templates; `world`/`debug` authoring tools. These depend on T-ECON, T-ITEMS and T-IDENT foundations and should not start before the Wave 1 safety work below.

### T-REPO: repository and docs
Evidence/history reorganisation and the `saves/` tracking fix (REPO-1..3, DOC-16); orphan and duplicate pruning (REPO-4, REPO-5, REPO-8, REPO-9); docs link test and staleness tripwire (DOC-15); relocate canon author-only section (DOC-13); keep this register and roadmap reconciled on each milestone.

## 3. Recommended sequence

| Wave | Goal | Contents |
| --- | --- | --- |
| 0 | Safe, independent fixes (days) | IMG-1, TRD-1, TRD-2, PIPE-2, REV-3, ID-2, UI-1, UI-5, TEST-1, REPO-1, CI-1/CI-2 |
| 1 | Correctness and secrecy core | MOV-1 + ID-1, PIPE-1 + CTX-1/CTX-2, AUTH-1, TRD-1b, shared price extractor (TRD-3/4), REV-2 |
| 2 | Durability and responsiveness | PER-1, PER-2, PER-4/PER-5, media side store (REV-1/PER-3), PIPE-3/4/9, UI bundle 1 |
| 3 | Product features already planned | **Weather UI**, then **Property/Heartstone property** (after canonical-NPC policy, `quantity`/`container_id`, equipment slots) |
| 4 | Commerce depth | ECO-1 currency decision, funds ledger, merchant wallets and stock, services |
| 5 | Structure and certification | `NarrationFacts`, `GameSession` decomposition, `PersonIdentity`, modern benchmark, repo/docs taxonomy |
| 6 | Simulation | quests, routines, rumors, combat, medicine |

This inserts Waves 0 to 2 before the existing "Weather UI next, then Property" order. Weather UI itself does not depend on them and can run in parallel with Wave 2; Property should wait for Wave 1 (identity and movement) and the equipment/quantity prerequisites. Decisions that gate the waves are in register §16.

## 4. Definition of done for a milestone
A roadmap item is done when: code and offline tests pass in CI; the change is expressed as a facade/projection the UI consumes (no domain rule recreated in `client.js`); any new player-visible irreversible action is a player-authorized, `expected_revision`-guarded, single-revision action with a stale and a repeated-click test; save/load round-trip is covered with a fixture; identity invariants (register §6.2) still hold; normative docs and this register/roadmap are updated; and, for model-facing changes, a live certification run is recorded in `evaluations/` without modifying earlier reports.
