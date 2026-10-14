# UI trust and keyboard (block B3)

Date: 2026-10-14. Base: main `26fc79f` plus the B1 and B2 working tree. Block B3 of the [Next implementation program](NEXT_IMPLEMENTATION_PROGRAM.md). No engine behavior changed: the engine commits exactly what it committed before, and offers, confirmations, Keep track and Promote keep their semantics. UI-31 stays open as decided. No live provider call was made.

## Starting assumptions (re-verified)

| # | Assumption | Result |
| --- | --- | --- |
| 1 | `getTranscript` returns the last 500 entries; the client renders `messages.slice(shown)` with `shown = messages.length`, so new turns stop appearing once the window is full | True |
| 2 | The drawer's Tab cycle is close, Appearance, Story only (Promote and its confirm unreachable) | True (Edit NPC+ and Generate too, as UI-1 said) |
| 3 | No focus restore after Accept, Confirm, Keep track or Promote; inventory buttons carry `role="listitem"` | True |
| 4 | The manual location correction message has a mis-encoded arrow and the raw location id | True (`â†’`, `(${target.id})`) |

## Changes

- **Transcript cursor.** `GameSession.getTranscript` adds each entry's stable index `i`; the HTTP payload adds `seq` to every message (no field removed; the disposable playtest mode numbers its messages by position). The client renders the messages whose `seq` is above the last one it rendered, and keeps the old count rule for a payload without positions. Tests: `tests/ui/transcript-cursor.test.ts` (a full 500 window that slides by two renders exactly two new entries, a repeated poll renders nothing, the old payload still works, and a loaded campaign with 600 saved entries sends positions 100 to 599 and shows the next turn after the full window).
- **Keyboard (UI-1).** The drawer's Tab and Shift-Tab cycle is computed at keydown from every enabled, rendered control of the drawer in document order, so Promote, its Cancel and Promote buttons, Edit NPC+ and Generate are reachable; Escape closes as before. Focus is restored after Promote (into the drawer; on a refusal to the confirm button), Accept, Confirm and Keep track (to the composer; on a refusal to the remaining action button), and after an inventory rebuild to the same item. Inventory cells are buttons inside a `role="listitem"` wrapper (`display: contents`, no layout change). Tests: `tests/ui/drawer-keyboard.test.ts`; browser check `scripts/browser/keyboard-promotion-browser-check.mjs` (keyboard only, 11 checks: Enter opens the drawer, Tab reaches Promote, focus stays in the drawer, Shift-Tab walks back, Enter opens the confirmation on Cancel, Tab to Promote, Enter promotes with one request and one revision, focus restored, Tab reaches Edit NPC+, Escape returns focus to the scene entry, no mouse button pressed). Against the pre-B3 client the same check fails (the confirmation is never reached) and exits non-zero.
- **Live regions (UI-15, N5).** One `#announcer` (`role="status"`, polite, visually hidden) announces each Actual Offer and each confirmation card once, when it first appears; the offer and confirmation regions, rebuilt on every poll, are `aria-live="off"`; the pending bubble is `aria-hidden` until its audited prose arrives, then joins the conversation log once.
- **Copy.** `/location`: the confirmation reads "Manual location correction: <current> → <display name>. Time unchanged." (no raw id, the arrow fixed); a stale revision says the campaign changed and nothing was moved; an unknown or ambiguous target lists the server's candidates (UI-5). Mis-encoded arrows, multiplication and less-or-equal signs in two source comments fixed. Disabled reasons (UI-23): Accept and the confirmation buttons disabled by a running turn show and reference "Available when the narrator finishes." Save failure (UI-24): announced once besides the visible "Save failed" status; the developer copy "Check that npm run play:ui is running" is now "Cannot reach the game server. Check that it is running, then reload."
- **Tests updated to the new contract** (not weakened): the confirmation region test now asserts `aria-live="off"` plus the one-time announcement and no re-announcement; the playtest transcript test includes `seq`; the inventory grid test reaches the button through its list item and asserts the listitem/button split.

## Validation (this working tree)

clean, typecheck, build: exit 0. `npm test`: 3721 tests, 3721 pass, 0 fail (+6). `npm run benchmark:modern`: 55/55, 0 known gaps. `check:architecture`: 360 modules, 0 runtime back edges. `check:docs`: 0 broken. `check:scripts`: 51 scripts, 0 errors. Browser checks, one at a time after the build: actual-offer 21/21, block5b, block6, block7, confirmation 9/9, explicit-promotion 13/13, keep-track 15/15, keyboard-promotion 11/11, turn-reliability 5/5, all exit 0.

## Noted, not changed

`scripts/browser/explicit-promotion-browser-check.mjs` shows a canonical NPC with a campaign record (Korvin) as eligible for NPC+ promotion. The user decision of 2026-10-14 (D5, rule 5B) says a canonical NPC may not become NPC+ for now; that rule belongs to B6 and is not changed here.
