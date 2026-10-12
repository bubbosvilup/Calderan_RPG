# Consolidation block 5A: PendingConfirmation foundation + AUTH-1

Date: 2026-10-12. Base: main `eb05734`, branch `claude/project-thread-gfj7p8`. **Nothing is committed or pushed** (working tree only).

**Verdict: AUTH-1 CLOSED.** No semantic path can commit a manumission any more. The player's words create a pending card; only the player's Confirm changes the legal state. AUTH-2 stays OPEN (block 5B).

Terminology: **Class C** is the authority category (irreversible or high-impact acts need the player's explicit decision). **PendingConfirmation** is one mechanism some Class C acts use. Actual Offer Accept and NPC+ Promote already have explicit authority and were NOT migrated.

## 1. Baseline

| | |
| --- | --- |
| HEAD | `eb05734` (clean tree at start) |
| Tests | 3377 / 3377 |
| Typecheck, build | clean |
| Entry-point map | `"manumit"` was built only from the FREE regex in `person-transactions.ts`; `set_legal_status` and `transfer_person` only in `person-offers.ts` (Actual Offer, settled on explicit Accept). The Controller schema has no manumit, set_legal_status, transfer_person or accept_trade_offer kind. |

## 2. Data and persistence plumbing

- Save file schema **6**; snapshot schema stays 6. Optional top-level `interaction_metadata` = `{authority:"interaction_metadata", pending_confirmations:[...]}`, written in the SAME atomic rename as the snapshot (`src/persistence/pending-confirmations.ts`, plumbed through save-format, repository, campaign-session).
- Record: `ref` (24 hex), `kind`, `subject_id`, `actor_id`, flat bounded `payload`, `provenance {source, turn_key?, turn_id?}`, `created_revision`, `status` (`pending|confirmed|cancelled|invalidated`), `terminal_reason`, `resolved_revision`.
- Active records are never pruned (parse ceiling 256, creation ceiling 64); the newest 32 terminal records are kept.
- Creating, cancelling or invalidating a record does NOT change the semantic revision (it is not CampaignState). Confirm commits through `prepare/commit` and bumps the revision exactly once.
- Migration 5 → 6 changes only the version; a v5 file already carrying `interaction_metadata` is rejected. Load is tolerant: malformed, duplicate, unknown-kind or impossible records are dropped and never make a save unloadable.
- Dirty/autosave/quit-save treat unsaved pending changes as dirty (`PendingConfirmationLog.unsaved`, `saved(token)`).
- Dependency direction preserved: shared neutral types in `src/types/pending-confirmation.ts` (turn does not import persistence, persistence does not import turn).
- Tests: `block5a-pending-foundation.test.ts` (18).

## 3. Generic confirm/cancel lifecycle

`GameSession.confirmPending({ref, expected_revision})` / `cancelPending(...)`, kind-registry driven (`src/app/confirmation-kinds.ts`). Idle-only, idempotent per ref (a second confirm/cancel of the same ref returns the stored terminal outcome with `replayed`), stale revision and busy refused without effect, unknown ref refused, terminal state written once. Confirm revalidates at that moment; a failed revalidation invalidates the record with a stable reason (`subject_no_longer_enslaved`, ...) and commits nothing. Verified with a test-only kind (`test_condition`) so the foundation is proven independent of manumission. Confirm and Cancel call no provider.

## 4. Generic UI

`state.confirmations` (cards + notices, no ids or payload), routes `POST /api/confirmation/confirm|cancel` (body: `ref` + `expected_revision` only; 200 ok, 409 stale or busy, 422 refused). Card rendered with `textContent` only, `role=group`, `aria-live`, buttons labelled "Confirm: …"/"Cancel: …". The label uses the masked person label (same helper as trade offers), so a rename re-renders the same card under the new name. Tests: `block5a-ui.test.ts` (6).

## 5. Pre-Narrator AUTH-1 projection

Creation point: the intent stage (`stages/intent.ts`), after domain prerequisites (subject enslaved, held by the actor, present) and a dry `prepare` of a probe `manumit`. The turn result carries `confirmation_proposals`; the session records them after the commit (also on the PIPE-2 warning path). The NarratorContext gets a typed section "Proposed player actions awaiting the player's explicit confirmation in the interface (NOT completed)". The real legal line stays "legally enslaved; legal holder Nicco." (no fake status). Duplicate pending for the same subject/payload is deduplicated; an equivalent active record is reused.

## 6. Uncommitted-pending audit

New issue kind `uncommitted_pending_confirmation` (`src/turn/pending-audit.ts`): completed-freedom claims about a pending subject (including the subject's own quoted self-claims and a pronoun link when the subject is the sole pending one) are rejected and revised once; past-tense "unchained", "no longer in chains" and future/conditional wording ("means to free her") are not flagged.

## 7. AUTH-1 migration

`resolveManumission` now returns `{proposals, notes, diagnostics}` (status `proposed`), no commands, and no "is now legally free" note. Before/after: before, `I hereby free you, Maren.` → `manumit` command in the turn batch, free after the turn; after → card, legal state `enslaved` until Confirm. Tests `block5a-auth1.test.ts` A1–A24 (recognised phrasings, negation/quote/hedge, wrong holder, absent subject, duplicate, rename, save/reload, stale/replayed, Narrator context, audit, Controller cannot emit manumit).

## 8. Turn-key idempotency interaction

The original `turn_key` replay returns the stored result with zero provider calls, creates no second card and no second manumission, also after Confirm. A new turn with equivalent words while a card is open does not create a duplicate. Receipts and pending records ride in the same atomic save.

## 9. Authority invariant audit

Searched all producers of `manumit`, `set_legal_status`, `transfer_person`: only (a) the confirm command built in `pending-proposals.ts` and (b) Actual Offer plans settled on explicit Accept. Narrator output, Controller proposals, regex recognition, audit repair and revision cannot emit them. `runTurn` guard unchanged.

## 10. End-to-end validation

- Full suite: **3425 / 3425** at the last full run before docs (3377 → 3425, +48). The final `npm test` after docs and the live harness: 3424 / 3425, the single failure being the known flaky `generation lifecycle (npc, avatar)` ("Generating…" vs "Request sent"), unrelated and left untouched by standing order.
- Actual Offer and NPC+ promotion regression suites pass unchanged (no migration of those paths).
- Real browser (`scripts/confirmation-browser-check.mjs`, Playwright, mock providers): words → card (world unchanged, no revision change, no manumission) → Cancel (card gone, still enslaved, zero calls) → again → rename while open (same ref, title "Free Maren Vale?") → Confirm (legal free, one manumission, zero provider calls, notice) → reload (no card, still free) → replay of the original turn request (replayed, zero calls, no new card). Request bodies contain only `ref` + `expected_revision`.

## 11. Live certification

`src/dev/consolidation-block5a-live.ts`, production models (Narrator, Controller), one scenario, no reroll, run on the exact final production code (only docs and this harness changed afterwards). Evidence: `docs/evaluations/consolidation_block5a_live/run.json`.

| Check | Result |
| --- | --- |
| Turn "I hereby free you, Maren. You are no longer mine." succeeded | yes |
| Card created, legal state still enslaved, zero manumissions | yes |
| Delivered prose has no completed-freedom claim | yes (the narration says the words carry no legal weight yet) |
| Confirm: provider calls | 0 |
| After Confirm: free, holder cleared, exactly 1 manumission, card gone | yes |
| Replay of original turn_key: replayed, 0 provider calls, no new card, still 1 manumission | yes |
| Provider calls / tokens / cost | 2 (1 Narrator + 1 Controller) / 11 998 tokens / cost not reported by the provider (0) |

## 12. Final debt status

- **AUTH-1: CLOSED.** Condition "no semantic path can directly commit" is met (section 9).
- **AUTH-2: OPEN** (permanent narration-created characters). Handed to block 5B.
- Unchanged: ARCH-1/2, PER-1, PER-2/ID-2, CTX-2 residual, TRD-11.

## 13. Remaining risks and block 5B handoff

- The FREE grammar was deliberately NOT broadened: bare "I free Maren." (no "you") is not recognised and produces no card; "I hereby free you, Maren.", "you are free", "grants her her freedom" are. A grammar decision for the user.
- A pending card is lost from the player's view only by Confirm, Cancel or invalidation; stale cards (subject sold or moved) invalidate on the next reconcile with a notice.
- Block 5B scope: character lifecycle + AUTH-2 + suspicious identity-fork scanner, reusing `PendingConfirmation` (provisional characters, retire/merge), not started here.
- Flaky test `generation lifecycle (player|npc, fullbody|avatar)` remains.
