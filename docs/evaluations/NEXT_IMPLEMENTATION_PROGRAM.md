# Next implementation program

Date: 2026-10-13, main `ed7e85f`. Planning only: **no block below is approved or started.** Each block needs the user's explicit go-ahead, and blocks marked HUMAN DECISION REQUIRED also need the named decisions first. Repository cleanup stays CLOSED; nothing here reopens it.

Sources: the [product work plan](POST_CLEANUP_PRODUCT_WORK_PLAN.md) (every open item), the eight reviews it links, and the [dependency graph](POST_CLEANUP_DEBT_DEPENDENCY_GRAPH.md). The order departs from the old [Master Roadmap](../MASTER_ROADMAP.md) in two places, because the final code suggests it:

- A small correctness block (B1) comes before everything else: the reviews confirmed two live correctness gaps, AUD-1 statically and CTX-1 on the current data, that need no decision and have a small fix.
- Test trust (B2) comes before the larger blocks. Two of the eight browser checks cannot fail on a wrong result, and there is no CI. Certifying B4 to B8 on the current gates would overstate the evidence.

## At a glance

| Block | Name | Kind | Decision needed | Risk |
| --- | --- | --- | --- | --- |
| B1 | Reserved names and Narrator id masking | **first correctness block** | no | low |
| B2 | Test trust and the fast CI gate | testing / CI | C1 (CI host) for the workflow part only | low |
| B3 | UI trust and keyboard | UI correctness | no | low to medium |
| B4 | Persistence durability, save-compatible | **first persistence block** | C6 (fixture copies) for one step | medium |
| B5 | Pipeline lanes declared and observed | architecture | no | medium |
| B6 | Canonical NPC policy and NPC+ exits | product rule | **D5, D4, NPC+ demotion** | medium |
| B7 | Item identity and equipment foundation | **first item / economy block** | **ITM-2 meaning, container shape, owner kinds, D6 with the bump** | high |
| B8 | Containers and Property / Heartstone storage | product | **property ownership model; D5 for visitors** | high |
| W | Weather UI (independent track) | product UI | light (Q3, defaults recommended) | low |

**When Property becomes safe:** after B6 (D5 settled, so Property cannot promote canonical visitors by accident), B7 (slots, item kind and quantity), the schema 9 bump that B7 starts, B4 (save-size and store guards, because Property adds many records), and the UI scale bundle (keyed inventory nodes, list caps). That is B8. Before then, the [items and economy review](NEXT_ITEMS_ECONOMY_REVIEW.md) section 7 lists what breaks.

**When Weather UI can be done independently:** at any time; it needs no engine change. Doing it after B3 is recommended, because B3 fixes the header live region and keyboard focus that the weather display would sit next to.

**Blocks that need a user policy decision before implementation:** B6, B7, B8. B2's CI workflow file needs the CI host (C1). B4's real-fixture step needs C6. W needs a light display choice (Q3).

---

## B1. Reserved names and Narrator id masking

- **NAME:** Reserved names and Narrator id masking.
- **PURPOSE:** Close the two correctness gaps that the reviews confirmed and that need no product decision. A person bought through an Actual Offer must not be materialized under another identity's canonical name or alias. Narrator-facing text must not have internal ids substituted inside ordinary words.
- **DEBT CLOSED:** AUD-1 (with the AUD-1a outcome: the offer is blocked with `canonical_name_reserved`, as Keep track does); CTX-1's substring defect (the id pattern in `src/turn/identity/narrator-identity.ts:48` gets the same letter and number boundaries as the name pattern at `:45`). It also adds a deterministic, log-only diagnostic for internal ref shapes (`NPC\d+`, `P\d+`, raw ids) in delivered text, the first step of CTX-A2. Enforcement is left to CTX-A2.
- **DEPENDENCIES:** none.
- **SCOPE:** `src/turn/commerce/person-offers.ts` (reserved-handle check before the subject at `:332` and the named seller at `:349`, over the scene's identity facts as `keep-track.ts:99-110` does); `src/turn/identity/canonical-name-reservation.ts` (header: three lanes); `src/turn/identity/narrator-identity.ts` (boundary on the id pattern); a diagnostic in the narration audit or the turn trace; docs `docs/architecture/NAMING.md`, `docs/architecture/ACTUAL_OFFER.md` (refusal reason), register rows AUD-1 and CTX-1.
- **NON-GOALS:** no change to the NarrationFacts scene reading or its canon rules; no change to Keep track or late naming; no re-check of offers already saved (legacy limitation, recorded); no enforcement or redaction for leaked refs; no D5 work; no schema change.
- **FILES/DOMAINS LIKELY TO CHANGE:** `src/turn/commerce/`, `src/turn/identity/`, `src/turn/audit/` or `src/app/turn-trace.ts`, `tests/identity/`, `tests/commerce/`, `tests/context/`, two architecture docs.
- **TEST STRATEGY:** first a characterization test that fails on current code (a described captive who introduces themself with a canonical alias, then Accept); the regression rows R13 to R18 of the [AUTH-5 review](NEXT_AUTH5_CANONICAL_MATERIALIZATION_REVIEW.md) section 8.2; a masking test with an id that is a substring of common words, plus a scan of `data/` prose for every id used as a substring; full suite, benchmark, `check:architecture`, `check:docs`.
- **BROWSER/LIVE REQUIREMENTS:** the Actual Offer and Keep track browser checks must stay green. No live calls.
- **STOP CONDITIONS:** the characterization test does not fail on current code (then AUD-1 is not real as described: report, do not fix); the fix needs the "drop the name, keep the offer" variant (a product choice); any benchmark scenario changes; any NarrationFacts consumer changes output.
- **EXPECTED USER-VISIBLE RESULT:** a captive who claims a canonical name produces no purchasable offer for that exchange, with a clear refusal reason in the debug trace. Narrator prose stops showing fragments like "chil" plus an id inside words.
- **RISK LEVEL:** low.

## B2. Test trust and the fast CI gate

- **NAME:** Test trust and the fast CI gate.
- **PURPOSE:** Make "green" mean what it says before the larger blocks rely on it, and give the repository a first automatic gate.
- **DEBT CLOSED:** TEST-8 (timing measured and recorded); the two report-only browser checks assert and exit non-zero on a wrong result (proposed TEST-9); Playwright declared as a pinned devDependency (REPO-14 part); the test that writes into the repository `saves/` uses a temporary directory (proposed TEST-10/11); wall-clock budget assertions made robust (proposed TEST-12); `node --check` over `scripts/**/*.mjs` (proposed TEST-14); stale `docs/TESTING.md` paragraphs (proposed TEST-15). After C1 is decided: CI-1 FAST PR (`npm ci`, typecheck, `check:architecture`, `check:docs`, script syntax check, `npm test`).
- **DEPENDENCIES:** none for the test-trust part; C1 (CI host) and C2 (platforms, Node majors) for the workflow.
- **SCOPE:** `scripts/browser/confirmation-browser-check.mjs`, `scripts/browser/turn-reliability-browser-check.mjs`, `package.json` (devDependency, maybe a script), the named tests, `docs/TESTING.md`, and (after C1) one workflow file.
- **NON-GOALS:** no product code; no renaming of the milestone-named scripts unless the user asks (REPO-14 remainder); no coverage threshold; no live certification workflow; no lint or formatter unless C4 says so; no change to what the tests assert, except making report-only checks assert what they already print.
- **FILES/DOMAINS LIKELY TO CHANGE:** `scripts/browser/`, `tests/tooling/`, `tests/context/` (the saves writer), `package.json`, `package-lock.json`, `docs/TESTING.md`, a CI workflow directory.
- **TEST STRATEGY:** each changed browser check must fail when its expectation is broken (shown once with a deliberately wrong expectation, then reverted), and pass on the current code; full suite, benchmark, all 8 browser checks.
- **BROWSER/LIVE REQUIREMENTS:** all 8 browser checks. No live calls.
- **STOP CONDITIONS:** a report-only check turns out to fail on the current code once it asserts (a real product bug: report, do not fix in this block); declaring Playwright changes the lockfile beyond Playwright and its own dependencies; the CI host is not decided (stop before the workflow file).
- **EXPECTED USER-VISIBLE RESULT:** none in the game; for the user, a recorded suite timing and, once C1 is chosen, a check on every push.
- **RISK LEVEL:** low.

## B3. UI trust and keyboard

- **NAME:** UI trust and keyboard.
- **PURPOSE:** Fix correctness and reachability on the existing screens.
- **DEBT CLOSED:** the transcript window desync after 500 entries (new, P2: the client must track position, not count, against the server's sliding window at `src/app/game-session.ts:1255` and `src/ui/client.js:974,1030`); UI-1 (the drawer's Tab cycle includes Promote and its confirm); focus kept or restored after Accept, Confirm, Keep track, Promote and inventory selection; inventory cells keep their button role (new N3); live-region and pending-state announcements (UI-15, N5); UI-5 location correction copy and the mis-encoded arrow (`game-session.ts:393`); UI-23 disabled-reason text; UI-24 save-failure visibility.
- **DEPENDENCIES:** none (B2 makes a keyboard browser check meaningful; soft).
- **SCOPE:** `src/ui/client.js`, `src/ui/index.html`, `src/ui/style.css`, the one server message string, `tests/ui/`, one new keyboard browser check.
- **NON-GOALS:** no new screens; no visual redesign of Accept and Promote beyond labels (UI-2 and UI-3 visual language stays in the polish bundle); no person-purchase confirm step (Q1 decision); no polling redesign (UI-4 is the scale bundle); no change to UI-31 (user decision: open, no patch).
- **FILES/DOMAINS LIKELY TO CHANGE:** `src/ui/`, `src/app/game-session.ts` (copy only), `tests/ui/`, `scripts/browser/`.
- **TEST STRATEGY:** a unit test for the transcript cursor that crosses 500 entries, and for a loaded campaign with 500 saved entries; keyboard unit tests (Tab, Shift-Tab, Escape) on the drawer; a keyboard browser check that reaches Promote; full suite and all browser checks.
- **BROWSER/LIVE REQUIREMENTS:** all browser checks, plus the new keyboard check. No live calls.
- **STOP CONDITIONS:** the cursor fix needs a server API change beyond adding an index or offset field (then design it with the user); any change to what the engine commits; a browser check changes outcome.
- **EXPECTED USER-VISIBLE RESULT:** long sessions keep showing new turns without a reload; Promote and every confirm can be reached and used with the keyboard; focus does not jump after actions; the location correction message reads correctly.
- **RISK LEVEL:** low to medium.

## B4. Persistence durability, save-compatible

- **NAME:** Persistence durability, save-compatible.
- **PURPOSE:** Make saves fail safely and visibly before any schema change, and give the later schema 9 bump real fixtures and measurements.
- **DEBT CLOSED:** P0 to P5 of the [persistence review](NEXT_PERSISTENCE_HARDENING_REVIEW.md) section 6: a scale fixture and measured save, load and prepare times (P0); PER-1 as a distinct non-fatal size code with a warning threshold, also for manual save and quit-save (P1); compact JSON on write, which the reader already accepts (P2); side-store guards: a write cap equal to the read cap (N1), checkpoint copies or a previous generation of the stores (N2), and a media clamp on loading an older slot (N3) (P3); warn-level identity diagnostics for duplicate `narrated:` refs and offer subjects (ID-4 with N5, F7, AUTH-8) (P4); real older-save fixtures and load tests per version (PER-4, TEST-6 part) (P5, needs C6).
- **DEPENDENCIES:** none; C6 for P5.
- **SCOPE:** `src/persistence/` (save-format, campaign-repository, optional-store, errors), `src/app/game-session.ts` (error surface), `src/ui/client.js` (size banner), `tests/persistence/`, `tests/fixtures/` (with provenance), docs `docs/architecture/` persistence pages.
- **NON-GOALS:** **no schema bump, no migration, no change to serialized keys or the revision rules**; no offer pruning (needs the persisted ID allocator, schema 9); no derived-field removal; no PER-6 / NAME-1 rename; no repair of duplicate identities (diagnostics only).
- **FILES/DOMAINS LIKELY TO CHANGE:** `src/persistence/`, `src/campaign/optional-state.ts` (clamp only), `src/app/`, `src/ui/`, `tests/persistence/`, `tests/fixtures/`.
- **TEST STRATEGY:** round-trip and crash-point tests for each guard; an older build reading a compact save (simulated with the current reader, which already parses both); fixture load tests per historical version; the existing persistence suites; full suite and benchmark persistence scenarios.
- **BROWSER/LIVE REQUIREMENTS:** the block 7 browser check (optional state) and the turn-reliability check. No live calls.
- **STOP CONDITIONS:** any change to `CURRENT_SAVE_VERSION`, `CURRENT_SNAPSHOT_VERSION` or a serialized key; a guard that would refuse an existing valid save; a fixture copy without a provenance entry; a measured result that contradicts the review's growth model by an order of magnitude (report before acting).
- **EXPECTED USER-VISIBLE RESULT:** an oversized save shows a clear warning instead of a vague retryable error; saves are smaller on disk; a damaged side store no longer blocks every backup.
- **RISK LEVEL:** medium.

## B5. Pipeline lanes declared and observed

- **NAME:** Pipeline lanes declared and observed.
- **PURPOSE:** Make every path that puts a command into a commit explicit and visible, without changing what commits, so that PIPE-7 can be measured and decided.
- **DEBT CLOSED:** PIPE-6 (the four commit-preparation producers outside the preferred authorization path, which are late naming `set_profile`, the Nicco `create_fact` and `set_knowledge` lane, `establish_character_contract` and the person `propose_trade_offer`, are declared and recorded in `TurnResult.authorization` and the trace); the committed-command list built from the final batch, not the batch before commit preparation (new observability finding); AUD-2 (commit preparation, `character-contracts.ts` and `household-evidence.ts` take the turn's shared NarrationFacts) behind a parity test; the pipeline document corrections in `docs/architecture/TURN_COORDINATOR.md` and `NARRATIVE_AUTHORITY.md`.
- **DEPENDENCIES:** none.
- **SCOPE:** `src/turn/stages/commit-preparation.ts`, `src/turn/stages/result.ts`, `src/turn/coordinator/turn-coordinator.ts`, `src/app/turn-trace.ts`, `src/turn/authorization/character-contracts.ts`, `src/turn/authorization/household-evidence.ts`, two architecture docs, `tests/turn/`, `tests/authority/`.
- **NON-GOALS:** no delivered-text coverage enforcement (PIPE-7 is the next block and needs a decision); no change to which commands commit; no move of the F evidence readers into NarrationFacts (scheduled with robust transfers); no Controller schema change.
- **FILES/DOMAINS LIKELY TO CHANGE:** `src/turn/stages/`, `src/turn/coordinator/`, `src/turn/identity/`, `src/turn/authorization/`, `src/app/turn-trace.ts`, docs.
- **TEST STRATEGY:** a parity test that runs the shared-facts and the fallback readers on the benchmark corpus and the receipt corpus and requires equal output before switching; lane-record tests per producer; the committed-list test with a TRD-2 dropped offer; full suite and benchmark (55/55 with identical outcomes).
- **BROWSER/LIVE REQUIREMENTS:** all browser checks. No live calls.
- **STOP CONDITIONS:** the parity test finds any difference (report the cases; switching then needs a decision); any benchmark outcome changes; a runtime import cycle appears.
- **EXPECTED USER-VISIBLE RESULT:** none in play; the debug trace shows every lane that changed state in a turn.
- **RISK LEVEL:** medium.

## B6. Canonical NPC policy and NPC+ exits (HUMAN DECISION REQUIRED)

- **NAME:** Canonical NPC policy and NPC+ exits.
- **PURPOSE:** Replace two accidental product rules with deliberate ones: a canonical NPC's tier and rite eligibility currently follow an incidental record, and a narrated leave from the household is irreversible.
- **DEBT CLOSED:** AUTH-5 / ID-8 / NPC-3 / F8 under decision D5 (recommended Option A: canonical records stay overlays, the tier follows the origin, the rite refuses canonical NPCs; no schema change); NPC-1 and NPC-4 under decision D4 (the recommended direction is "inactive plus rejoin plus badge", and a narrated leave becomes a player-confirmed act); the NPC+ demotion question; the doc contradictions (`docs/HEARTSTONE.md:42`, `docs/CURRENT_STATE.md:61`, the `docs/ARCHITECTURE.md` lifecycle section).
- **DEPENDENCIES:** decisions D5, D4 and "can an NPC+ ever be demoted or retired". B1 first is recommended (soft).
- **SCOPE:** `src/campaign/heartstone-rite.ts`, `src/app/player-character-view.ts`, `src/app/character-capabilities.ts`, `src/turn/authorization/command-authorizer.ts` (leave lane), `src/app/confirmation-kinds.ts` (if a leave becomes a confirmation), `src/campaign/premium-characters.ts` (only if D4 needs a rejoin), tests in `tests/npc-plus/` and `tests/authority/`, docs.
- **NON-GOALS:** no new path for canonical NPCs into Heartstone; no canonical visitors or residents (Property-era, Option C); no demotion of existing NPC+ records; no change to `characterForUpdate` semantics for conditions or for Nicco; no PER-6 / NAME-1 rename.
- **FILES/DOMAINS LIKELY TO CHANGE:** `src/campaign/`, `src/app/`, `src/turn/authorization/`, `tests/npc-plus/`, `tests/authority/`, docs.
- **TEST STRATEGY:** the regression matrix in the [AUTH-5 review](NEXT_AUTH5_CANONICAL_MATERIALIZATION_REVIEW.md) section 8.1; leave and rejoin tests per D4; benchmark keep_track, identity and household scenarios.
- **BROWSER/LIVE REQUIREMENTS:** the explicit promotion, Keep track and confirmation browser checks. No live calls.
- **STOP CONDITIONS:** any decision is missing; an existing NPC+ record would change state on load; any save becomes unloadable.
- **EXPECTED USER-VISIBLE RESULT:** the Promote control appears only for people the player made into Campaign NPCs; an NPC+ who says they are leaving asks the player to confirm, and (per D4) can come back.
- **RISK LEVEL:** medium.

## B7. Item identity and equipment foundation (HUMAN DECISION REQUIRED)

- **NAME:** Item identity and equipment foundation.
- **PURPOSE:** Give items the identity, slots and quantities that containers and Property need, and give the player a working equip action.
- **DEBT CLOSED:** ITM-1 (a canonical slot set, `headwear` and `footwear` categories, validated in `place()`); ITM-2 (the meaning of `empty_slots`: it also stores "known empty" knowledge, so it cannot simply be derived, which is a decision); the SELL path's direct position rewrite routed through shared placement (`src/campaign/trade.ts:197-203`); ITM-6 (a UI-confirmed equip and unequip action keyed by item, not by a one-word name); ITM-4 with the quantity half of ITM-5 (a kind key replacing name-string identity in the create dedupe and the settlement veto; quantity with split and merge rules). It opens the schema 9 bump, planned together with D6 (PER-6 / NAME-1) and the persistence schema-9 items (persisted offer ID allocator, PER-3 residue, one migration chain).
- **DEPENDENCIES:** decisions on the ITM-2 meaning, the container shape (position variant or `container_id`), non-character owners, and whether the bump carries D6; B4 (fixtures and guards) before the bump.
- **SCOPE:** `src/campaign/items.ts`, `item-transfer.ts`, `inventory.ts`, `trade.ts`, `types.ts`, `validation.ts`, `snapshot-validation.ts`, `src/persistence/save-migrations.ts`, `src/turn/items/`, `src/turn/authorization/command-authorizer.ts`, `src/turn/commerce/trade-authorization.ts`, the UI inventory, tests, docs `docs/architecture/ITEM_DOMAIN.md`.
- **NON-GOALS:** no containers yet (B8); no Property UI; no currency change (D3); no ledger; no loans or theft records (robust transfers).
- **FILES/DOMAINS LIKELY TO CHANGE:** `src/campaign/`, `src/persistence/`, `src/turn/items/`, `src/turn/authorization/`, `src/turn/commerce/`, `src/ui/`, `tests/items/`, `tests/persistence/`, `tests/commerce/`.
- **TEST STRATEGY:** migration tests from every fixture version to 9; property tests for split and merge; item and commerce suites; benchmark trade and person_trade scenarios; equip browser check.
- **BROWSER/LIVE REQUIREMENTS:** Actual Offer browser check plus a new equip check. No live calls.
- **STOP CONDITIONS:** any decision is missing; a migration cannot map an existing item without guessing; the bump would need a second bump soon after (re-plan with the user).
- **EXPECTED USER-VISIBLE RESULT:** clothing and gear go to the right slots, including head and feet; the player can equip and unequip from the inventory; identical items stack.
- **RISK LEVEL:** high.

## B8. Containers and Property / Heartstone storage (HUMAN DECISION REQUIRED)

- **NAME:** Containers and Property / Heartstone storage.
- **PURPOSE:** The user's next product item: storage in Heartstone rooms and furniture, and the Property screen.
- **DEBT CLOSED:** ITM-5 (containers); ITM-3 minimum (one effective-location resolver across containers; the agreed non-character owner kinds); the UI scale bundle items Property needs (UI-20 keyed inventory nodes, UI-7 caps, opaque item refs).
- **DEPENDENCIES:** B6, B7, the schema 9 bump, B4, the UI scale bundle; decisions on structured property ownership versus the deed item, and D5 for canonical visitors.
- **SCOPE:** `src/campaign/` (positions, inventory, effective location), `src/world/` (authored containers, which the world schema already supports at `src/world/validation.ts:212-214`), `src/app/` (a stored-items read model), `src/ui/` (Property screen), data for Heartstone furniture, tests, docs `docs/HEARTSTONE.md`.
- **NON-GOALS:** no buying, renting or selling of property unless the economy stage comes first; no merchant stock; no NPC routines; no Weather.
- **FILES/DOMAINS LIKELY TO CHANGE:** `src/campaign/`, `src/world/`, `src/app/`, `src/ui/`, `data/locations/calderan/heartstone/`, tests, docs.
- **TEST STRATEGY:** containment invariants (no cycles, one effective holder); offer invalidation for contained items; selling a container; Property browser check at desktop and phone widths with the scale fixture.
- **BROWSER/LIVE REQUIREMENTS:** all browser checks plus a Property check. A short live smoke may be proposed separately; it is not part of this block unless the user asks.
- **STOP CONDITIONS:** any upstream block not done; any decision missing; containment needs a change in authority semantics.
- **EXPECTED USER-VISIBLE RESULT:** the player can store and take items in Heartstone and see what is where.
- **RISK LEVEL:** high.

## W. Weather UI (independent track)

- **NAME:** Weather UI.
- **PURPOSE:** Show the weather that the engine already computes.
- **DEBT CLOSED:** none (new screen element); it settles one player-facing clock format (UI-29 part).
- **DEPENDENCIES:** none required; after B3 recommended; a light display decision (Q3: location card or header; no forecast; recommended: location card first, no forecast).
- **SCOPE:** `src/ui/server.ts` (forward a field-by-field environment subset next to `date_text` at `:46`), `src/ui/client.js` and `index.html` (display), using the narrator's exposure wording (for example "Outside weather" indoors), neutral text where no climate exists.
- **NON-GOALS:** no engine change, no reroll, no forecast, no weather physics, no persistence change.
- **FILES/DOMAINS LIKELY TO CHANGE:** `src/ui/`, `tests/ui/`, `scripts/browser/` (one check).
- **TEST STRATEGY:** view-model tests for each exposure and the no-climate case; one browser check.
- **BROWSER/LIVE REQUIREMENTS:** one new browser check; no live calls.
- **STOP CONDITIONS:** the display needs data the read model does not have (then it is engine work, not W).
- **EXPECTED USER-VISIBLE RESULT:** the current weather is visible next to the location.
- **RISK LEVEL:** low.

---

## After these blocks

In dependency order, each needing its own approval: PIPE-7 delivered-text coverage (after B5, per-class decision); CTX-A2 enforcement and CTX-B budgets (after B1; one decision on narrator-only canon reaching the Controller); CTX-C retrieval quality (independent); the UI scale and polish bundles; robust transfers (rest of ITM-3, TRD-6, TRD-8); economy and transaction history after D3 (ECO-1, TRD-11 including the SELL buyer debit, ECO-4, TRD-12 pruning with the persisted ID allocator, then ECO-2, TRD-7, TRD-14); the world event ledger, reusing the ledger shape; knowledge and rumors; NPC routines.
