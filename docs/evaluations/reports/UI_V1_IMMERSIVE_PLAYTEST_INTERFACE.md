# UI V1 — IMMERSIVE PLAYTEST INTERFACE

Date: 2026-10-06. Implementation and offline validation complete. Browser visual verification is **not completed**: the supplied browser runtime reported no available browsers, and its discovery list was empty. No screenshots or paid-provider results are claimed.

P11: **UNCHANGED**. P12.1: **UNCHANGED**. P12.2: **UNCHANGED**. This work does not close or change their existing debt statuses.

## 1. Previous UI structure

V0 used static HTML, CSS and browser JavaScript, served by a loopback Node HTTP adapter over `GameSession`. A narrow single column displayed complete messages as plain text. POST `/api/turn` returned JSON after the application outcome. The authored Slave Pens opening, disposable campaign, input guards and alternate-model controls already existed.

Providers already emitted `text_delta` events. `createDraftGenerator` in the narration stage accumulated and validated them, including the existing 24,000-character ceiling and completion consistency check. The coordinator performed controller proposal, authorization, preparation, audit/revision/reconciliation and commit before final turn publication. Its audited `narration_delta` was a whole delivered response, not a provider token. The application already accepted an observer and cancellation signal; it lacked a separate draft-preview event.

## 2. New layout

The frontend remains plain HTML/CSS/JavaScript, with no dependencies or framework change. A compact brand/location/daypart header sits above a dominant reading area and a 250px Household sidebar. The composer stays at the bottom. The reading area scrolls independently.

The palette uses warm dark neutral surfaces and restrained borders. Narrator messages use readable serif text; player messages use an inset blue-grey surface and system type. At widths of 800px and below, the sidebar stacks beneath the conversation and has bounded scrolling. The narrow layout is implemented but has not been visually checked in a browser.

## 3. Household panel data source

`GameSession.getView()` remains the application seam. `deriveSessionView` already selected current household memberships and projected present/away status. A new read-only `members[].display_name` masks unknown canonical names against Nicco's committed identity-name facts/knowledge. Missing labels do not fall back to opaque IDs. The existing membership, ownership and name-learning rules are unchanged.

The HTTP adapter sends only `{members: [{name, presence, location?}]}` for each projected household. It sends no household IDs/titles, raw member IDs/names, roles, legal state, private notes, equipment, relationship internals or knowledge edges. Location is included only when the existing projection identifies the member as present. Away members have no location. The sidebar displays known/safe names and compact presence text.

The always-visible empty state reads **“No household members yet.”** Only finalized application responses or session reloads update cards. Draft prose cannot add members, move cards or teach names. Controlled fixtures cover empty, one-member, multiple-member, unknown-name, known-name, absent-location and join/leave states using committed authoritative commands.

## 4. Time-of-day data source

`scene.time.time_of_day` comes directly from the existing centralized P11 `temporalGrounding(world_minute)`. Numeric clock fields remain available in the application view; the thin UI payload includes only the daypart and existing location name. The browser implements no bucket mapping and shows no primary HH:MM clock.

Tests confirm minute 600 is **Late Morning** and a committed `/wait 120` reaches minute 720 and **Early Afternoon**. No time advancement, intent grammar, P11 projection or clock policy changed.

## 5. RPG text renderer

`renderRpg` reparses one message buffer into DOM spans. Single unescaped stars toggle narration and disappear visually. Narration is italic; dialogue remains normal. An unfinished opening star stays in narration style until later chunks arrive. `white-space: pre-wrap` preserves paragraphs and line breaks.

Escaped literal stars are shown literally; paired double stars remain literal because this is the project's single-star RPG contract, not a Markdown engine. Empty/malformed input is tolerated. The same renderer handles final narrator text, provisional drafts, player actions and alternatives.

All source bytes enter the DOM through `textContent`; there is no model-supplied HTML, `innerHTML`, HTML parser or unsafe Markdown rendering. Tests include script/image-event-handler strings as inert text.

## 6. Color and accessibility choices

CSS custom properties centralize surface, panel, border, accent, secondary text, narration, dialogue and player colors. Desktop narrator text is 19px with 1.8 line height; narrow text is 17px. Player text is 15px with 1.7 line height. Compact message labels are 12px. Focus outlines, labelled input/selects, log/status/alert roles and a draft `aria-busy` marker remain available.

Calculated contrast against actual CSS surfaces:

| Text | Contrast |
|---|---:|
| Narration | 9.03:1 |
| Dialogue | 14.01:1 |
| Secondary text, story surface | 7.76:1 |
| Secondary text, panel | 8.02:1 |
| Accent, panel | 9.32:1 |
| Player dialogue | 10.91:1 |
| Player actions | 8.41:1 |

These calculations establish text contrast, not a full accessibility audit or browser/screen-reader verification.

## 7. Streaming architecture

The narration stage adds an optional visual observer beside its existing validated provider stream. `start` resets each provider attempt; `delta` forwards its text after the existing checkpoint/size check. The coordinator labels the phase `draft` or `revision` and guards observer exceptions. The provider transport is unchanged.

`GameSession` exposes `narrator_preview` events with `provisional: true`. The thin adapter forwards only preview action/phase/text as NDJSON `draft` records. The browser requests POST `/api/turn` with `Accept: application/x-ndjson`, reads the Fetch response stream and decodes fragmented UTF-8/JSON lines. Existing JSON clients retain the old endpoint behavior.

Submission immediately creates the player message and one draft narrator bubble. Every chunk reparses only that bubble's accumulated text. Earlier messages and sidebar state are not rerendered per token. Provider output is shown live rather than through a post-completion typing animation.

## 8. Provisional versus authoritative boundary

The preview callback is outside the coordinator's authoritative event iterator. It does not supply controller evidence or write campaign state, recent conversation, name knowledge, turn traces or the server's finalized transcript. Existing audit, reconciliation, stale checks, authorization and atomic commit ordering remain intact; the coordinator still satisfies its 164-line orchestration guard.

The HTTP adapter publishes a final `result` only after `submitPlayerInput` returns. On success it records the player message and `outcome.narration`, sends the current minimal projection, and the client replaces the same narrator bubble with that final text. An observer that throws cannot fail generation or bypass audit.

The engine's P11, P12.1 and P12.2 behavior files, recent history projection, identity-knowledge implementation and debt register were checked against baseline `b4cd42f` and remain unchanged. Coordinator edits only connect the optional visual observer; existing iterator delivery and commit statements are untouched.

## 9. Audit revision and failure behavior

A real-coordinator HTTP test streams **“Korvin leaves, then he stands beside Nicco.”** before provider completion. During the paused stream the campaign snapshot is unchanged, recent finalized history is empty and the server transcript still contains only the opening. Existing departure audit rejects the contradiction and requests revision; the preview resets and streams **“Korvin remains beside Nicco.”** The final response/history contain only that revision, Korvin remains present, and name knowledge is unchanged.

Frontend tests separately verify same-bubble replacement when final text differs from both drafts. Provider retries send a fresh reset and store only successful final text. Failure, cancellation and interrupted transport remove optimistic player/draft bubbles, preserve the input and recover the finalized session transcript. A network interruption is reported as uncertain until reload because a turn may already have committed before the disconnect. Disconnect before commit propagates cancellation and commits nothing; there is no rollback of a previously completed turn.

## 10. Scroll behavior

Before changing message DOM, the client checks whether the reader is within 100px of the bottom. It follows only in that case. Scrolling upward during generation prevents subsequent chunks from moving the viewport. A small “Jump to latest” button appears when away from the bottom and explicitly resumes following. Controlled DOM tests exercise both chunk updates while scrolled away and jumping back.

## 11. Regeneration behavior

The existing `Regenerate with…` select, model list, comparison request and original prepared-request architecture remain intact. Controls attach only to finalized eligible narrator messages. Alternatives appear inside a bordered secondary area with **“Alternative · [model]”** and **“Comparison only · Does not change the story.”** They use the safe RPG renderer.

Existing HTTP tests verify regeneration changes no campaign view, controller calls, traces, canonical message or retained history, and future prompts contain canonical dialogue rather than alternate text. UI tests cover same-model replacement, stacking, safe failure feedback and HTML-like alternative text. Alternative streaming was not added.

## 12. Tests

| Command/check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | 2,330 total; 2,326 PASS; 0 failures; 4 historical TODOs |
| `npm run test:playthrough` | 25/25 PASS |
| Focused UI/session/P11/P12/architecture run | 184/184 PASS |
| `npm run build --silent` | PASS |
| `git diff --check` | PASS |

The focused run includes `ui-v1`, `ui-playtest`, `narrator-alternatives`, `application-closure`, `p11-time-foundation`, `p121-recent-scene-narration`, `p122-canonical-departure` and `npc-plus-pass-10-architecture`. There are 24 new UI V1 tests. Existing frontend mocks were updated for the new DOM controls, span renderer and provisional application events. The project has no separate frontend build, lint or test toolchain; TypeScript build plus static assets remains its build path.

Paid API calls: **0**. Cost: **$0**. Tests use offline/mock providers.

## 13. Manual verification

The Browser skill was used to attempt local visual verification. Runtime setup succeeded, but target selection returned **“No browser is available”**; the documented recovery discovery returned `[]`. Consequently desktop/narrow screenshot review and interactive browser play were **not run**. No substitute screenshot or mock DOM result is presented as visual verification.

Offline checks do verify live HTTP chunks before finalization, audit revision, provider failure, disconnect cancellation, frontend one-bubble updates, safe text rendering, panel transitions, regeneration and manual-scroll logic. Static layout/CSS review verifies the intended desktop and narrow rules, but actual overflow, font rendering and screen-reader behavior remain unverified.

To complete the visual check in a connected browser, run `npm run play:ui` and open `http://127.0.0.1:3000`. The opening needs no provider call. Check desktop and a narrow viewport, then use controlled mock providers for streaming/revision/failure checks to avoid paid calls. The automated scenarios are in `tests/ui-v1.test.ts`.

## 14. Remaining UI limitations

- Visual browser verification and screenshots are pending because no browser was connected.
- The campaign/transcript remain disposable, process-local and unsaved, as in V0.
- A provisional draft can change substantially during audit; its explicit draft label is retained until success.
- Unknown household members share a generic safe label; the UI does not invent names or identifiers.
- Absent member whereabouts, detailed social/legal state and debug information are deliberately excluded from this compact panel.
- There is no explicit cancel button; disconnect/shutdown uses existing cancellation. A disconnect after commit requires transcript review on reconnect.
- Alternatives are generated as complete comparisons, without progressive streaming.
- Desktop-first narrow styling is implemented, with no claim of comprehensive mobile or assistive-technology validation.

## 15. Screens and files changed

No screenshots were captured. Machine-readable evidence: `docs/evaluations/ui-v1/verification.json` (test results, contrast values, authority cases, unchanged behavior files and browser limitation).

Changed files:

- `src/ui/index.html`, `style.css`, `client.js`: layout, panels, safe text rendering, provisional streaming, scroll and comparison presentation.
- `src/ui/server.ts`: minimal safe panel payload and optional NDJSON turn transport, retaining JSON compatibility.
- `src/app/session-view.ts`: read-only safe household display labels and centralized P11 daypart.
- `src/app/game-session.ts`: separate provisional narrator-preview event.
- `src/turn/turn-types.ts`, `turn-coordinator.ts`, `stages/narration.ts`: optional guarded visual observer; no authority-policy changes.
- `tests/ui-v1.test.ts`: 24 new offline tests; `ui-playtest`, `narrator-alternatives`, `application-closure` mocks/expectations updated.
- `docs/UI_ENGINE_CONTRACT.md`, `README.md`, this report and the verification artifact: updated UI contract and evidence.

Local commit only; no push. No authored data, saves, dependencies, debt statuses or P11/P12 behavior rules changed.
