# Permanent Appearance editor: browser QA

This is a visual and UX check of the Household NPC+ appearance editor from `bde57fe` (`PERMANENT_APPEARANCE_V1.md`), dated 2026-10-07. It was run in a real browser against the real Play UI server and a real `GameSession`. No paid provider calls were made.

## 1. Browser and run method

- **Browser:** headless Microsoft Edge (`--headless=new`), driven over the Chrome DevTools Protocol. A small Node driver opens a raw WebSocket; no Playwright or Puppeteer.
- **Interactions:** run through the page's own controls: `.click()`, values set with real `input` events, Tab key presses through `Input.dispatchKeyEvent`, and the page's own `load()` refresh.
- **Captures:** made with `Page.captureScreenshot`.
- **Server:** the production `createPlaytestServer` and `GameSession.loadCampaign`, on `127.0.0.1:3111`. Static assets were served live from `src/ui`.
- **Turns:** turns would use a local mock narrator, and no turn was submitted.
- **What changed:** the QA launcher and driver were disposable scratch scripts and were not committed; repository code changed only in section 6.

## 2. Fixtures and state

The isolated save in a temp directory was built from real commands:

- the opening campaign, with Nicco moved to Heartstone LR;
- an acquired unnamed woman (`purchase_unnamed_subject`), with origin observations "tall and gaunt, with sunken cheeks" and "copper hair matted against her neck", and the condition "feverish";
- Tomas, a second member located elsewhere;
- both joined the opening Household, which made them NPC+;
- the woman was late-named "Mira" through the real reciprocal `establishNames` flow;
- one override, eyes "grey-green, heavy-lidded", was seeded through the real `updateNpcAppearance` API.

The server was restarted from a clean fixture for the final run, so every committed screenshot reflects the final code.

## 3. Viewports checked

1440×900, 1920×1080, 1024×768 and 390×844 (mobile emulation).

## 4. Screenshots produced (`docs/ui-screenshots/appearance-editor/`)

| File | State |
| --- | --- |
| `01-household-1440.png` | Household overview: Tomas (Elsewhere) and Mira (Here) |
| `02-editor-initial-1440.png` / `02b-…-lower-1440.png` | Editor on open; lower section with the sticky header |
| `03-editor-dirty-1440.png` | Several fields edited |
| `04-editor-invalid-1440.png` | Invalid height (180.5) |
| `05-editor-saved-1440.png` | After a committed save |
| `06-editor-stale-1440.png` | Stale-revision conflict |
| `07-editor-longname-1440.png` | Long-name probe (DOM-only text swap) |
| `08-editor-1920.png`, `08b-…-1920-lower.png` | 1920 top and scrolled |
| `08-editor-1024.png`, `08b-…-1024-lower.png` | 1024 top and scrolled |
| `08-editor-390.png`, `08b-…-390-lower.png` | 390 top and scrolled |
| `09-household-390.png` | Household at 390 |

## 5. Issues found (first run)

1. **No inline feedback for an invalid number.** With height 180.5, Save silently disabled, with no message and no field marking.
2. **The disabled portrait buttons looked active.** Regenerate and Reference had the normal button style.
3. **Save scrolled out of view.** At desktop sizes the editor scrolls internally (about 1300–1500 px of content in a 750–930 px area), so Save and Cancel scrolled away while the lower fields were being edited.
4. **Unbalanced grid.** Body has 4 fields in a 3-column grid, so Skin sat alone on a second row; Face & details had the same problem.
5. **Note clutter.** "Not established." under every empty field competed with the saved and inherited notes and made empty overrides look like missing appearance.
6. **Header buttons wrapped with long names** ("Back to / Household", "Save / changes").
7. **The inherited note ran its observations together** ("…sunken cheeks copper hair…").
8. **Textarea placeholders used the browser's default (pinkish) color** instead of the muted token.
9. **The stale error could be off-screen.** It sits at the top of the scrolled content, so a user lower down would not see it.
10. **Input focus ring.** Inputs used the browser's default 1 px focus ring instead of the app's cyan focus style.

The QA driver also had its own flaw on the first run: its "stale" step targeted a nonexistent location ID, so no conflict happened. It was corrected, and the final run exercises a real conflict.

## 6. Fixes made (narrow: CSS, markup and a small amount of client code)

| # | Fix |
| --- | --- |
| 1 | Out-of-range or non-integer height/weight now sets `aria-invalid`, gives a pink border, and shows a text note under the field, e.g. "Enter a whole number from 30 to 300 cm." (text, not color alone). It clears when the value becomes valid. Save stays disabled. The client range matches the server limits. |
| 2 | Disabled portrait buttons are dashed, at half opacity, with a not-allowed cursor, plus a quiet "Portraits are not available yet." caption. |
| 3 | The editor header (name, Back, Cancel, Save) is sticky inside the editor scroller at widths ≥ 801 px. Below that the page scrolls normally and the header is not sticky, by choice. |
| 4 | Body uses a 4-column grid and Face & details a 2-column grid. Both fall back to 2 columns at ≤ 1100 px and 1 column at ≤ 480 px. |
| 5 | Unset fields show only a "Not set" placeholder, which is not a value and is never sent. A field with a stored value shows "Saved value. Empty it to clear." in cyan; the description adds "…to return to the inherited description." A field with inherited text shows "Inherited (not saved): …". |
| 6 | Header buttons use `nowrap`; the name wraps instead (`overflow-wrap:anywhere`). |
| 7 | Notes use `white-space:pre-line`. |
| 8 | Textarea placeholders use the muted color. |
| 9 | The inline editor error scrolls itself into view when shown. |
| 10 | Inputs and textareas get the app's 2 px cyan `focus-visible` outline. |

The intro copy was also shortened: "Permanent appearance only — not current wounds, illness, clothing or mood. Fields hold saved values; inherited text beneath a field is reference only and is never copied when you save."

## 7. Header and name verification

- The header says **Mira** at every step, including after save, reopen and the stale conflict; it never flashes "the woman".
- No raw refs, IDs, `name_source`, `self_disclosed` or "the woman" appear anywhere in the page text (checked with a regex over `document.body.innerText`).
- The identity line reads "Identity (read-only) Sex: female", the only established identity fact for this character.
- Long names wrap within the header without overflow.

## 8. Form grouping

Body (4), Hair (3), Face & details (2×2) and Description (full width) now read as intentional bands with their cyan legends. There is no horizontal overflow at any viewport; this was measured with `scrollWidth` and per-element bounds.

## 9. Inherited vs override UX

- Inputs hold only saved values; inherited prose is never prefilled.
- An empty override shows "Not set" while the inherited description note stays visible, so an empty field does not read as "no appearance".
- Emptying a saved field clears it, as its note explains.
- The resolved appearance below the form shows the combined result.

## 10. Dirty state (verified in browser)

| Action | Save |
| --- | --- |
| Open the editor | disabled |
| Change build | enabled |
| Enter whitespace only in an unset build field | disabled again |
| Re-enter the saved eyes value with extra spaces | disabled (normalized, so no false dirty state) |
| Invalid height | disabled, with an inline error |
| Valid height | enabled |

## 11. Validation state

See screenshot 04: a pink field border, plus a text message under the field.

## 12. Successful save

The real save committed revision 5 → 6. Afterwards:

- the fields refilled from committed state, Save was disabled, and there were no duplicate fields or scroll jump;
- the card's appearance read "Height: 178 cm · Build: athletic · Hair: shoulder-length, matted copper hair · Eyes: grey-green, heavy-lidded · Scars: … ; …" followed by the new description;
- Household membership and the NPC+ flag were unchanged;
- after Back and reopen, the values were still there.

## 13. Stale conflict

1. The editor was open at revision 6.
2. A real `/api/location` correction moved the campaign to revision 7 (HTTP 200).
3. Saving the edits returned the inline message: "The campaign changed since the editor opened. Your edits are kept; reopen the editor to load the current appearance."
4. Every input value was kept.
5. The server value was unchanged (skin is still `null`).

Back and reopen load the current revision, after which editing works normally.

## 14. Periodic refresh

The Play UI does not poll while idle; the client polls only while a turn runs. State refreshes come through `render()` after turns and responses. The check used that real path:

1. Make a dirty edit (skin "pale, sun-starved").
2. Change the campaign from outside, through the location correction.
3. Run the page's own `load()`.

Result: the edit survived, Save stayed enabled, and **focus stayed in the skin field**. The form was not rebuilt.

## 15. Portrait disabled-state review

- Regenerate and Reference read as unavailable, and the caption says portraits are not available yet.
- The image-prompt box is read-only and says so.
- There is no fake portrait, only the initial "M" with "No portrait yet". Nothing looks broken or error-like.

## 16. Desktop result (1440 and 1920)

Balanced grids; the sticky header keeps Save and Cancel visible while scrolling; no overflow. At 1920 the editor's width cap keeps line lengths comfortable.

## 17. Narrow result (1024)

Groups fall to 2 columns; the portrait column narrows to 230 px. The sticky header works, and there is no overflow.

## 18. Mobile-like result (390)

The page stacks the header buttons, then the portrait, then the fields in one column. Textareas stay usable and notes wrap, with no horizontal overflow.

The header is not sticky here: the page itself scrolls, and Save is reached by scrolling up. This is acceptable for a desktop-first application and is listed as a remaining issue.

## 19. Accessibility basics

- Labels wrap their inputs.
- Errors are text plus color, with `aria-invalid`; the editor error uses `role="alert"`.
- Disabled controls are visibly distinct.
- Focus is visible (2 px cyan).
- Tab order from Back is Cancel, then height, weight, build, skin, hair color; the disabled Save is skipped.
- All actions are real `<button>` elements.

## 20. Tests

- **`ui-v1` updated** for the new note wording ("Saved value…", "Inherited (not saved): …", no note on unset fields), plus inline-invalid assertions (`aria-invalid`, the range message, and clearing it).
- **Focused:** ui-v1, ui-playtest, permanent-appearance, current-character-name projection, player-character-view and Household suites: **95 passed, 0 failed.**
- **Full suite:** 2542 tests, 2539 passed, **0 failed**, 3 TODO (pre-existing known-limitation tests).
- Typecheck: PASS. Build: PASS.

## 21. Paid calls

0.

## 22. Changed files

- `src/ui/style.css`: grid columns, notes, invalid/saved styles, disabled portrait buttons, sticky header (≥ 801 px), nowrap buttons, placeholders, focus ring
- `src/ui/index.html`: grid classes, "Not set" placeholders, portrait caption, shorter intro
- `src/ui/client.js`: note wording helper, inline number validation, error scroll-into-view
- `tests/ui-v1.test.ts`: note wording and inline-invalid assertions
- `docs/ui-screenshots/appearance-editor/*.png` (15 screenshots, about 0.9 MB)
- `PERMANENT_APPEARANCE_EDITOR_BROWSER_QA.md`

Not changed: resolver semantics, persistence, `updateNpcAppearance`, eligibility, Household, name/identity, temporal code, narrator and save schema.

## 23. Remaining UI issues (not fixed; out of scope or minor)

- **The Household card's location reads "Heartstone Heartstone LR".** It comes from the location display name and is pre-existing, not part of the editor.
- **At ≤ 800 px the editor header is not sticky.** The page scrolls, and Save is at the top.
- **Paragraph gaps in "Resolved permanent appearance" are generous**, because the prose blocks are separated by blank lines.
- **A stale save can be re-sent after a conflict and fails the same way**, until Back and reopen. The message tells the user to reopen; there is no automatic reload, so in-progress edits are never discarded.
- **The disabled Save button's text contrast is low.** This is intentional for a disabled state.

## 24. Readiness for Portrait Prompt Builder V1

**Ready.** The editor reliably authors the structured values that `ResolvedPermanentAppearance` exposes, the resolved preview shows the same contract a prompt builder would consume, and the portrait area is a clean placeholder that can be activated without layout changes.
