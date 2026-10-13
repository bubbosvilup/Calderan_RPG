# Next block prompts

Date: 2026-10-13, main `ed7e85f`. **These are prompts only. None has been executed, and none may be executed without the user's explicit instruction.** They implement the first five blocks of the [Next implementation program](NEXT_IMPLEMENTATION_PROGRAM.md): B1 to B5. B6, B7 and B8 need product decisions before a prompt can be written, so they are not here.

Each prompt is self-contained and ready to paste. Starting assumptions were verified statically on `ed7e85f` (code read, nothing executed). An implementer must re-verify them first, because main may have moved.

Shared rules, repeated inside each prompt so that every prompt stands alone:

- Repository `bubbosvilup/Calderan_RPG`, branch from the current `main`.
- Source of truth order: code, tests, authored data, current docs, historical evidence. Never edit historical evidence under `docs/evaluations/` except to add this block's report.
- No live provider calls and no image generation. `inspect:turn`, `benchmark:controller`, `inspect:narrator`, `inspect:controller` and `bench:llm` are live: do not run them.
- Never run two builds or test runs at the same time (`npm run build` deletes `.build/` first).
- Vocabulary: PROVISIONAL to PERSISTENT is materialization; Campaign NPC to NPC+ is promotion, and only that.
- No AI model names in code, docs or commit messages.

---

## Prompt 1: B1 Reserved names and Narrator id masking

```text
TASK: Block B1, "Reserved names and Narrator id masking", in bubbosvilup/Calderan_RPG.

Re-verify these starting assumptions on current main before changing anything (they were verified statically on ed7e85f):
1. The person Actual Offer plan materializes the purchase subject and a named seller with materializeProvisional in src/turn/commerce/person-offers.ts (about :332 and :349). Nothing on that path calls claimsReservedHandle. claimsReservedHandle has two callers: src/turn/identity/name-establishment.ts and src/turn/identity/keep-track.ts (about :110, block code canonical_name).
2. The scene reading's canon guard compares canonical full names only, so a described person who introduces themself with a canonical alias, or with a name that keeps a canonical token, can become the offer subject.
3. src/turn/identity/narrator-identity.ts builds the name pattern with letter and number lookarounds (about :45) but the id pattern without any boundary (about :48). The NPC id "dren" is therefore replaced inside words such as "children" in Narrator-facing text.
4. No check scans delivered narration for internal ref shapes (NPC<n>, P<n>, raw character ids).
If any assumption is false, STOP and report.

SCOPE:
A. AUD-1. Write a characterization test FIRST that fails on current code: a described captive in an Actual Offer scene introduces themself with a canonical alias of another person; Accept then materializes them under that name. If this test does not fail on current code, STOP and report (AUD-1 is not real as described).
   Then fix: before each materializeProvisional in the person offer plan, build the identity facts of the scene narration the same way keep-track does and call claimsReservedHandle(world, identity, name). On a hit, block the offer with reason canonical_name_reserved (fail closed, like Keep track). Pass options.world into the purchase scope if needed.
   Update the header of src/turn/identity/canonical-name-reservation.ts to name three lanes. Logic unchanged.
B. CTX-1 substring defect. Give the id pattern in narrator-identity.ts the same letter and number boundaries as the name pattern. Add a test with an id that is a substring of common words (use "dren" and "children"). Add a test that scans every authored prose string in data/ for each canonical id occurring inside a longer word and checks the masked output keeps the word intact.
C. Leaked-ref diagnostic, log only. After delivery, detect internal ref shapes in the delivered text and record a diagnostic in the turn trace (or the narration audit's diagnostics). Do NOT redact, revise or fail the turn.
D. Docs: docs/architecture/NAMING.md (the offer lane), docs/architecture/ACTUAL_OFFER.md (refusal reason canonical_name_reserved), register rows AUD-1 (closed, correct path) and CTX-1 (substring part closed; the rest stays open) in docs/MASTER_DEBT_REGISTER.md.

INVARIANTS: NarrationFacts output unchanged for every consumer; Keep track, late naming and the identity-fork scanner unchanged; no save schema change; offers already saved are not re-checked (record this as a known legacy limitation in the report); authority semantics unchanged except the new fail-closed refusal.

TESTS TO ADD/RUN: the characterization test; regression rows for exact alias, alias with a different case, a full name keeping a canonical token, a seller self-introduction, an earlier-exchange self-introduction, and a non-reserved name that must still produce an offer; the masking tests. Run: npm run clean, npm run typecheck, npm run build, npm test, npm run benchmark:modern, npm run check:architecture, npm run check:docs, then the Actual Offer and Keep track browser checks (node scripts/browser/actual-offer-browser-check.mjs, node scripts/browser/keep-track-browser-check.mjs) after the build, never concurrently. Log each exit code separately.

NON-GOALS: no change to the scene reading's canon rules; no "drop the name and keep the offer" variant (that is a product choice); no redaction for leaked refs; no D5 / AUTH-5 work; no persistence change; no live calls.

ACCEPTANCE CRITERIA: the characterization test failed before the fix and passes after; all suites green with test count = previous + the new tests and no test removed or weakened; benchmark 55/55 (or the current count) with identical outcomes; 0 runtime cycles; docs 0 broken; both browser checks green; report docs/evaluations/RESERVED_NAMES_AND_ID_MASKING.md with before and after evidence.

COMMIT/PUSH POLICY: do not commit or push until the user explicitly authorizes it in the thread. When authorized: one commit "Reserved names in person offers and Narrator id masking", fast-forward main, update the working branch.

STOP CONDITIONS: an assumption above is false; the characterization test does not fail on current code; the fix needs the name-drop variant; any benchmark outcome or NarrationFacts output changes; any persistence change appears necessary; any live call would be needed.
```

## Prompt 2: B2 Test trust and the fast CI gate

```text
TASK: Block B2, "Test trust and the fast CI gate", in bubbosvilup/Calderan_RPG.

Re-verify these starting assumptions on current main before changing anything (verified statically on ed7e85f):
1. There is no .github/ directory and no CI configuration.
2. scripts/browser/confirmation-browser-check.mjs and scripts/browser/turn-reliability-browser-check.mjs print a JSON report and exit non-zero only when Playwright throws. The other six checks assert or set an exit code.
3. Playwright is not in package.json (devDependencies are @types/node and typescript); the browser checks load it from PLAYWRIGHT_MODULE or NODE_PATH via scripts/lib/browser-env.mjs.
4. npm test = npm run build && node --test ".build/tests/**/*.test.js"; it already runs the modern benchmark tests and the playthrough replay. Four architecture guards call git ls-files, so tests need a git work tree.
5. A context test writes saves into the repository saves/ folder rather than a temporary directory; three tests assert hard wall-clock limits; scripts/**/*.mjs is never syntax-checked; docs/TESTING.md still describes "three checks" with environment-specific paths.
If any assumption is false, STOP and report.

SCOPE (part 1, test trust, no decision needed):
A. Measure and record suite timing (TEST-8): total npm test time and per-file durations with a spec or junit reporter, benchmark per-scenario time, each browser check. Record the numbers in docs/TESTING.md.
B. Make the two report-only browser checks assert exactly what they already print and exit non-zero on a wrong outcome. Prove each one fails once with a deliberately wrong expectation (do not commit that), then passes on current code.
C. Declare Playwright as a pinned devDependency (exact version) and keep scripts/lib/browser-env.mjs working with PLAYWRIGHT_MODULE / NODE_PATH as before. Do not download browsers in npm install hooks.
D. Move the context test's saves to a temporary directory; make wall-clock budget assertions robust (generous bounds, or measure relative work instead of time) without weakening what they protect; add a script syntax check (node --check over scripts/**/*.mjs) as an npm script; correct the stale docs/TESTING.md paragraphs.

SCOPE (part 2, the FAST PR workflow): HUMAN DECISION REQUIRED BEFORE IMPLEMENTATION.
The user must choose the CI host (C1) and the platforms and Node majors to claim (C2). Stop after part 1 and ask. Do not write any workflow file before the answer.
After the answer (outline only, to be confirmed): npm ci; npm run typecheck; npm run check:architecture; npm run check:docs; the script syntax check; npm test. No secrets, no live calls, no browser job until the user approves a FULL PR tier.

INVARIANTS: no product code change; no test removed, skipped or weakened; the lockfile changes only for Playwright and its own dependencies.

TESTS TO ADD/RUN: npm run clean, typecheck, build, test, benchmark:modern, check:architecture, check:docs, the new syntax check, and all 8 browser checks (after the build, never concurrently). Log each exit code.

NON-GOALS: no renaming of milestone-named scripts unless the user asks; no lint or formatter; no coverage threshold; no live certification workflow; no product changes.

ACCEPTANCE CRITERIA (part 1): every browser check can fail on a wrong result and passes on current code; all gates green; timing recorded in docs/TESTING.md; report docs/evaluations/TEST_TRUST_AND_FAST_GATE.md.

COMMIT/PUSH POLICY: do not commit or push until the user explicitly authorizes it in the thread. When authorized: commit "Test trust: asserting browser checks, Playwright dependency, timing", fast-forward main, update the working branch. The workflow file, if approved later, is a separate commit.

STOP CONDITIONS: a report-only check fails on current code once it asserts (a real product bug: report it, do not fix it here); the lockfile change goes beyond Playwright; the CI host is not decided (stop before part 2); any product file would change.
```

## Prompt 3: B3 UI trust and keyboard

```text
TASK: Block B3, "UI trust and keyboard", in bubbosvilup/Calderan_RPG.

Re-verify these starting assumptions on current main before changing anything (verified statically on ed7e85f):
1. GameSession.getTranscript returns this.#transcript.slice(-500) (src/app/game-session.ts about :1255). src/ui/client.js keeps a counter `shown`, renders data.messages.slice(shown) (about :974) and sets shown = data.messages.length (about :1030). Once the window is full, new turns are never rendered until a reload.
2. The character drawer's focus cycle omits the Promote button and its confirm (client.js about :683-689), so a keyboard-only player cannot promote to NPC+.
3. Focus is not restored after Accept, Confirm, Keep track or Promote; inventory cells are buttons given role="listitem"; the inventory grid rebuild drops focus.
4. The manual location correction message in game-session.ts (about :393) contains a mis-encoded arrow ("â†’") and shows the raw location id.
If any assumption is false, STOP and report.

SCOPE:
A. Transcript cursor: the client tracks a stable position, not a count (for example a monotonically increasing entry index or turn id sent by the server), and renders only entries after the last rendered one. A loaded campaign with 500 saved entries must render new turns. Keep the payload shape backward compatible (add a field; do not remove one).
B. Keyboard: include Promote and its confirm in the drawer's focus cycle; Escape closes as today; restore focus to a sensible element after Accept, Confirm, Keep track, Promote and inventory selection; inventory cells keep their button semantics inside a list.
C. Live regions: the pending bubble and the offer and confirmation cards are announced once, not on every render (UI-15, N5).
D. Copy: fix the arrow encoding and show the location's display name in the correction message (UI-5); disabled-reason text for disabled actions (UI-23); a visible save failure (UI-24).

INVARIANTS: the engine commits exactly what it committed before; no change to authority, offers, confirmations or Keep track semantics; UI-31 stays as is (user decision: open, no patch).

TESTS TO ADD/RUN: unit tests in tests/ui/ for the cursor across 500 entries and for a loaded 500-entry campaign; keyboard tests (Tab, Shift-Tab, Escape) for the drawer; a new browser check that reaches Promote by keyboard only and asserts the result. Run: npm run clean, typecheck, build, test, benchmark:modern, check:architecture, check:docs, all browser checks plus the new one (after the build, never concurrently).

NON-GOALS: no new screens; no Accept / Promote visual redesign (labels only); no person-purchase confirm step (decision Q1); no polling redesign (UI-4 is a later bundle); no mobile layout work; no Weather UI.

ACCEPTANCE CRITERIA: all suites green, test count increased by the new tests, none removed or weakened; all browser checks green, including the keyboard check; report docs/evaluations/UI_TRUST_AND_KEYBOARD.md.

COMMIT/PUSH POLICY: do not commit or push until the user explicitly authorizes it in the thread. When authorized: commit "UI trust: transcript cursor, keyboard path, focus, copy", fast-forward main, update the working branch.

STOP CONDITIONS: an assumption is false; the cursor fix needs a server API change beyond an added field; any engine-visible behavior changes; a browser check changes outcome.
```

## Prompt 4: B4 Persistence durability, save-compatible

```text
TASK: Block B4, "Persistence durability, save-compatible", in bubbosvilup/Calderan_RPG. Follow docs/evaluations/NEXT_PERSISTENCE_HARDENING_REVIEW.md section 6, steps P0 to P5 only.

Re-verify these starting assumptions on current main before changing anything (verified statically on ed7e85f):
1. CURRENT_SAVE_VERSION = 8 (src/persistence/save-migrations.ts:5) and CURRENT_SNAPSHOT_VERSION = 7 (src/campaign/snapshot-validation.ts:23).
2. The save reader accepts compact and pretty JSON (src/persistence/strict-json.ts); saves are written pretty-printed.
3. An oversized save produces an error the UI presents as retryable (src/ui/client.js about :1169), for autosave, manual save and quit-save alike.
4. Side stores (learning.json, media.json) are size-capped on read but not on write; checkpoints do not copy the side stores; the media store is not clamped when an older slot is loaded.
5. Trade offer IDs are allocated as highest existing plus one (src/campaign/trade.ts about :145).
If any assumption is false, STOP and report.

SCOPE:
P0. A scale fixture (about 200 characters, 500 facts, 100 items, 1,000 trade offers with a realistic goods and person mix) and a dev measurement of save, load and prepare time and bytes per top-level key. Offline only. Record the numbers in the report.
P1. A distinct, non-fatal save-size error code with a warning threshold below the cap; the UI shows a clear banner; quit distinguishes oversize from corruption.
P2. Write compact JSON for the save file and the side stores.
P3. Side-store guards: the read cap also on write (mapped to the P1 code); checkpoints copy the side stores (or one previous generation of each store is kept); loading an older slot clamps the media store to that slot.
P4. Warn-level identity diagnostics at load: duplicate narrated refs and unnamed twins, offer subjects across counteroffers, accepted person offers whose transaction is missing. Diagnostics only, no repair.
P5. HUMAN DECISION REQUIRED BEFORE IMPLEMENTATION for this step only: the user must approve copying the real saves under docs/evaluations/item-sprite-smoke-assets/ and docs/evaluations/consolidation_block7_live/ into tests/fixtures/ (decision C6, with provenance entries). Without approval, skip P5 and say so.

INVARIANTS: no schema bump; CURRENT_SAVE_VERSION and CURRENT_SNAPSHOT_VERSION unchanged; no serialized key added, removed or renamed; revision rules unchanged; optional-state authority (the optional_state marker) unchanged; every existing valid save still loads; no pruning of trade offers.

TESTS TO ADD/RUN: round-trip and crash-point tests for each guard; a compact-save read test; load tests for each P5 fixture (if approved); the existing persistence suites. Run: npm run clean, typecheck, build, test, benchmark:modern, check:architecture, check:docs, the block7 and turn-reliability browser checks (after the build, never concurrently).

NON-GOALS: no schema 9; no offer pruning or archive; no derived-field removal; no PER-6 / NAME-1 rename; no identity repair; no live calls.

ACCEPTANCE CRITERIA: all gates green; every new guard tested at its boundary; measured numbers in the report docs/evaluations/PERSISTENCE_DURABILITY.md; a statement that the schema numbers and keys are unchanged, with the diff of src/persistence/save-migrations.ts and snapshot-validation.ts shown empty for version lines.

COMMIT/PUSH POLICY: do not commit or push until the user explicitly authorizes it in the thread. When authorized: commit "Persistence durability: size code, compact JSON, store guards, diagnostics", fast-forward main, update the working branch.

STOP CONDITIONS: any version number or serialized key would change; a guard would refuse an existing valid save; a fixture is copied without provenance or without approval; measurements contradict the review's growth model by an order of magnitude (report before acting).
```

## Prompt 5: B5 Pipeline lanes declared and observed

```text
TASK: Block B5, "Pipeline lanes declared and observed", in bubbosvilup/Calderan_RPG. Follow docs/evaluations/NEXT_PIPELINE_AUTHORITY_REVIEW.md sections 8.2, 9 and 11 (block P-A only).

Re-verify these starting assumptions on current main before changing anything (verified statically on ed7e85f):
1. Commit preparation (src/turn/stages/commit-preparation.ts) adds commands outside authorizeWithEvidence: late naming set_profile, the Nicco create_fact plus set_knowledge lane, establish_character_contract, and the person propose_trade_offer. None of them appears in state_proposed, TurnResult.authorization or the trace.
2. TurnResult.authorized_commands and the trace's committed_command_kinds come from the batch before commit preparation (src/turn/coordinator/turn-coordinator.ts about :321, src/turn/stages/result.ts about :30, src/app/turn-trace.ts about :71).
3. commit-preparation.ts about :73-75 calls establishNames / establishedCanonicalDisclosure without the turn's shared facts; src/turn/authorization/character-contracts.ts (about :35) and household-evidence.ts (about :27, :87) also re-read dialogue outside the shared NarrationFacts source. The shared source reads the projected context with movers; these readers read the prepared context.
4. docs/architecture/TURN_COORDINATOR.md describes a narration_delta event and prose released before the commit, and a four-command Controller; docs/architecture/NARRATIVE_AUTHORITY.md:22 says every durable change goes through Controller proposal and authorization.
If any assumption is false, STOP and report.

SCOPE:
A. Declare every authority lane by name (preferred authorization, player runtime, trade, and the four commit-preparation producers) and record, per turn, which lane produced each committed command, in TurnResult.authorization and the turn trace.
B. Build the committed-command list from the final batch (after commit preparation and the TRD-2 drop).
C. AUD-2: first add a parity test that runs the shared-facts reader and each fallback reader over the benchmark corpus, the receipt corpus and the recorded fixtures and requires equal output. Only if parity holds, switch the readers to the shared facts. If parity does not hold, STOP the switch, keep the fallback, and report the differing cases.
D. Correct TURN_COORDINATOR.md and NARRATIVE_AUTHORITY.md to the code's actual order and lanes. Update register rows PIPE-6 and AUD-2.

INVARIANTS: exactly the same commands commit on every turn as before (the benchmark outcomes and the full suite are the proof); no delivered-text coverage enforcement; no Controller schema change; 0 runtime import cycles.

TESTS TO ADD/RUN: lane-record tests per producer; a committed-list test with a dropped goods offer and a commit-preparation command; the parity test. Run: npm run clean, typecheck, build, test, benchmark:modern, check:architecture, check:docs, all browser checks (after the build, never concurrently).

NON-GOALS: no PIPE-7 enforcement (it needs a per-action-class decision from the user); no move of the F evidence readers into NarrationFacts; no change to which commands commit; no live calls.

ACCEPTANCE CRITERIA: all gates green with identical benchmark outcomes; the trace lists every lane and the final committed kinds; parity proven or the switch skipped with the cases reported; report docs/evaluations/PIPELINE_LANES_OBSERVED.md.

COMMIT/PUSH POLICY: do not commit or push until the user explicitly authorizes it in the thread. When authorized: commit "Pipeline lanes declared and observed", fast-forward main, update the working branch.

STOP CONDITIONS: an assumption is false; any benchmark outcome changes; the parity test finds a difference (stop the switch only, report); a runtime import cycle appears; the change would alter which commands commit.
```
