# Frontend architecture (React client)

Status: ACTIVE (UI-1). Last reconciled: 2026-10-14. Source of truth: `src/ui-client/`, the `/app` serving in `src/ui/server.ts`, and the read models in `src/app/`. Companions: [UI](../UI.md) (implemented controls), [UI engine contract](../UI_ENGINE_CONTRACT.md) (the HTTP and session contract), [UI migration roadmap](../roadmap/UI_MIGRATION_ROADMAP.md), [legacy UI baseline](../evaluations/LEGACY_UI_DECOMPOSITION_BASELINE.md).

The React client in `src/ui-client/` is the permanent Caldrevan frontend. It replaces the legacy vanilla client (`src/ui/index.html`, `client.js`, `style.css`) screen by screen; both run side by side until the legacy UI is removed (UI-9).

## 1. Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| View | React 19 + TypeScript (strict, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) | same strictness as the engine |
| Build | Vite 8 (`@vitejs/plugin-react`) | dev server with proxy; production build to `dist/ui-client/` |
| Routing | React Router 8 (data router, `createBrowserRouter`) | basename `/app` |
| Server state | TanStack Query 5 | one `QueryClient` |
| Styling | CSS Modules + global design tokens (`styles/tokens.css`) | no Tailwind, no component suite |
| Component tests | Vitest + Testing Library + jsdom | `npm run ui:test` |
| Browser checks | Playwright, offline, real turn pipeline | `scripts/browser/react-play-browser-check.mjs` |

Deliberately absent: Redux, Zustand (no shared client state exists that the query cache and component state do not cover), Tailwind, component libraries, Three.js / React Three Fiber, Electron / Tauri. An architecture test fails if one of them appears in `package.json`.

## 2. Authority boundary

```text
CampaignState (engine, authoritative)
   -> GameSession / SessionHost / read models (SessionView, play, trade, confirmation, provisional, player views)
   -> HTTP API (src/ui/server.ts; every response carries the fresh state)
   -> TanStack Query cache (the ONLY browser copy of server data)
   -> React components (render, and initiate requests)
```

- **The engine decides; React renders.** Components read flags the engine derived: `character_capabilities.can_promote_to_npc_plus`, `provisional.people[].keepable`, `trade.offer.affordable`, `status`. They never evaluate household membership, location, legal status, prices or tiers themselves.
  - Bad: `if (card.household && card.where === "Heartstone") showPromote()`.
  - Good: `if (card.character_capabilities.can_promote_to_npc_plus) <PromoteControl />`.
- **Requests carry handles, not payloads.** Every state change sends an opaque ref or token plus `expected_revision` (the revision the page currently renders, read from the cache at click time). The engine reloads the real payload, revalidates and commits or refuses.
- **Names are masked server-side.** The client renders `name`, `label`, `counterparty` and `lines` exactly as given. It never sees, derives or displays hidden identity; opaque refs are used as React keys and request handles and are never rendered as text (they appear only in `data-*` attributes used by tests).
- **Local state is presentation only:** the open drawer, the selected tab, the composer draft, the pending exchange while a turn runs, dismissed notices, which receipts and confirmation outcomes this page has witnessed. Never funds, inventory, location, trade, household, identity, movement or NPC+ truth.

## 3. Directory structure

```text
src/ui-client/
  index.html, main.tsx           entry (StrictMode, global CSS)
  vite.config.ts                 Vite + Vitest config (dev proxy, /app base, build to dist/ui-client)
  tsconfig.json, tsconfig.node.json
  app/                           App, providers (QueryClient, announcer), router, RootLayout (skip link), RouteError
  api/                           the ONLY network layer
    client.ts                    fetch, JSON and NDJSON handling, ApiError mapping
    types.ts                     client DTOs (pure types; pinned to server read models by a server test)
    queryKeys.ts                 query and mutation keys
    session.ts, campaigns.ts, trade.ts, confirmations.ts, characters.ts   domain wrappers
  state/serverState.ts           useSessionQuery, applyServerState, useServerAction / useSessionAction, renderedRevision
  features/                      one folder per feature; each owns its components, hooks and CSS
    play/                        PlayRoute (URL vs. active campaign), PlayScreen (composition), useTurn
    transcript/                  Transcript, MessageItem (memoized), story-text parser, scroll follow
    composer/                    Composer
    trade/                       TradeRegion, ActualOfferCard
    confirmations/               ConfirmationCard (the one pattern), PendingConfirmations
    characters/                  CharacterSidebar, CharacterDrawer, PromoteControl
    player/, scene/, save/, campaigns/
  components/                    shared primitives with a current use: Button, Alert, Avatar, Badge, Drawer, ErrorState/EmptyState, Image, Spinner, Tabs
  layouts/                       PlayLayout (responsive 3/2/1 columns), CampaignLayout
  hooks/                         useDialogFocus, useMediaQuery, announcer
  lib/cx.ts                      class-name join
  styles/                        tokens.css, global.css
  assets/                        static files referenced by the build (favicon)
  test/                          Vitest setup, fixtures, render helpers
```

Rules: no barrel files; a component moves to `components/` only when a second feature needs it; features import `components/`, `hooks/`, `state/` and `api/`, never another feature's internals except a deliberately shared piece (the play screen composes features; `characters/PromoteControl` reuses `confirmations/ConfirmationCard`). The client imports nothing outside `src/ui-client/`, and no server module imports the client (architecture test).

## 4. Server state

- **One session query.** `["session"]` holds the `/api/session` payload. The server has exactly one active session, and that payload is already the complete player-facing projection, so it is not split into per-panel queries. The route compares the payload's campaign id with the URL. Other keys exist only for separate resources: `["campaigns"]` (campaign list) and `["save-status"]` (the cheap 4-second autosave indicator poll).
- **Mutations end on server truth.** `applyServerState` cancels in-flight session reads (awaited, so a reverting read cannot land after newer data), then writes the state the response carried, or refetches when the response carried none (a network failure, or a committed turn whose state view degraded). Refusals carry the fresh state too and are applied the same way. This is the "invalidate after success" rule, without a second request.
- **Polling** happens only while the server reports a busy session that this page is not itself waiting on (1 s), plus the save indicator (4 s). Returning to the tab refetches the session.
- **One request at a time.** Mutation keys `["turn"]` and `["action", name]` let the page lock every state-changing control while any request runs, mirroring the server's single-flight rule; the disabled controls say why ("Available when the narrator finishes.").
- **Query retries** happen only for network failures (a refusal is an answer). Mutations never auto-retry; the turn path retries a dropped connection itself with the same `turn_key` (REV-2: the server answers from the first result).

## 5. API layer

`api/client.ts` is the only module that calls `fetch` (architecture test). It sends same-origin requests to relative `/api/...` paths with `Content-Type: application/json` exactly (the server's requirement), parses JSON, reads NDJSON turn streams (progress lines, then one `result` line), and maps every failure to an `ApiError` with a `kind`: `network`, `validation`, `stale`, `busy`, `unavailable`, `save`, `not_found`, `forbidden`, `unknown`. The message shown is the server's player-safe `AppError.message` or the adapter's short fixed sentence, else our own copy; exception text and stacks are never shown. Domain wrappers (`session.ts`, `trade.ts`, ...) build request bodies and extract the state; components use hooks and wrappers only.

**Types.** `api/types.ts` declares client DTOs instead of importing server modules (those import Node and engine code, and carry fields the client must not use). Each DTO lists only what the client reads. `tests/ui/react-client-contract.test.ts` (run by `npm test`) type-checks that every server read model is still assignable to its DTO and checks the HTTP payload's shape at run time, so a server-side rename fails the build.

## 6. Routing

Served under `/app/` (Vite `base`, router `basename`): `/` campaign selection (the disposable playtest server forwards to `/play`), `/play` the playtest session, `/play/:campaignId` a persistent campaign. A URL naming a campaign that is not the open one shows an explicit "Open this campaign" action; navigation never loads a campaign implicitly. The play route is lazily loaded (its own chunk). Later screens get a route only when they exist and are page-like (character sheet, property, world, journal, settings); features that are panels or drawers get none (section 11).

## 7. Styling

Design tokens in `styles/tokens.css`: palette steps, then semantic tokens components use (`--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, state colors, `--spacing-*`, `--radius-*`, `--shadow-*`, `--font-*`, layout widths, image ratios, z-indexes, motion with a reduced-motion override). Raw colors appear only in `tokens.css` (architecture test). A later skin re-points semantic tokens under a `[data-theme]` selector. Global CSS is limited to the reset, typography, root sizing, the focus ring and `.sr-only`; everything else is a CSS Module (`localsConvention: camelCaseOnly`, so `.too-large` is `styles.tooLarge`).

## 8. Images

- `components/Image/Image.tsx` is the one image primitive: ratio from tokens (`avatar` 1:1, `portrait` 3:4, `fullBody` 1:2, `scene` 16:9) reserves the box before the file arrives; `loading="lazy"` and `decoding="async"` unless `priority`; a shimmer placeholder while loading; a caller-supplied fallback for a missing URL or a failed file; `object-fit` cover (top-anchored for figures) or contain. `Avatar` builds on it with an initial (or `?` when the name is unknown) as fallback.
- URLs always come from the read model (opaque token routes such as `/api/portrait/asset/<token>`); the client never builds an image path.
- The Vite build never inlines assets as `data:` URIs (`assetsInlineLimit: 0`): the server's CSP (`default-src 'self'`) would block them.
- Background art: `PlayLayout` has a decorative backdrop layer driven by `--play-backdrop-image` (none today).
- Not built yet, and the seam for them: galleries (a grid of `Image`; virtualize when galleries exceed a few hundred items), responsive `srcset` once the server serves sizes.

## 9. Future 3D seam

No 3D code or dependency exists. A future `features/scene3d/` module stays isolated: lazily imported by the feature that hosts it (a drawer, panel or workspace), receiving read-model data as props, never owned by `App.tsx` or the router root, and never a source of game truth. Its dependencies (Three.js / React Three Fiber) arrive with it and are removed from the architecture test's banned list in the same change.

## 10. Migration and coexistence

- The legacy UI stays at `/` (`src/ui/index.html`, `client.js`, `style.css`), unchanged; its browser checks and tests are unchanged.
- The React UI is served by the same play server at `/app/` from `dist/ui-client/` (`npm run ui:build`). The switch is the route: no environment flag, no hidden selection. Without a build, `/app` answers 404 with the build instruction and the legacy UI keeps working.
- Development: `npm run play:ui` (the backend, port 3000), then `npm run ui:dev` (Vite on `http://127.0.0.1:5173/app/`, proxying `/api` to the backend; `CALDREVAN_API_ORIGIN` overrides the target). The proxy rewrites the `Origin` header only for the Vite page's own origin so the server's same-origin POST check passes; any other origin is forwarded unchanged and refused.
- Secrets: the bundle has no API base or keys (all calls are relative); `envPrefix` is `CALDREVAN_PUBLIC_`, so no other environment variable can reach client code.

## 11. Module presentation

A feature chooses how it opens; the frame provides the containers: **route** (page-like, linkable: future character sheet, property), **drawer** (contextual details over the play screen: character details now; inventory, gallery later), **side panel** (always-on context: overview, people), **modal** (short blocking decisions; not used yet, it will share `useDialogFocus`), **full-screen workspace** (future map, 3D viewer). Not everything is a modal and not everything is a route.

## 12. Accessibility baseline

Real buttons and links only (no clickable `div`s; the drawer backdrop is a `tabindex=-1` button). Landmarks: `banner`, `main`, two `complementary` panels, a skip link to `#main-content`. The transcript is a `log` (committed messages only); one polite announcer reports a new offer or confirmation once; status lines are `role=status`; errors are `role=alert`. Dialogs (`useDialogFocus`) make the app root `inert`, move focus in, wrap Tab, close on Escape and return focus to the opener (or the composer when the opener is gone). Tabs follow the WAI-ARIA pattern (roving tabindex, Arrow/Home/End). Disabled controls carry their reason through `aria-describedby`. Focus returns to the composer after a turn and after an inline action removed the clicked control. Reduced motion is honored.

## 13. Testing strategy

- **Engine and read models:** `npm test` (authoritative for game logic), including the React-specific server tests: `tests/ui/react-client-serving.test.ts` (`/app` serving, SPA fallback, traversal, missing build), `tests/ui/react-client-contract.test.ts` (DTO contract) and `tests/architecture/react-client-boundaries.architecture.test.ts` (imports, `fetch` ownership, no HTML injection, no import cycles, tokens-only colors, no browser storage, stack).
- **Components:** `npm run ui:test` (Vitest, jsdom): rendering from DTOs, masking, buttons and their disabled reasons, stale and error states, keyboard interactions (composer, confirmation, drawer, tabs), the turn stream and same-key retry.
- **Browser:** `scripts/browser/react-play-browser-check.mjs` drives the built app in Chromium against the real turn pipeline with scripted providers (boot, transcript, turn, pending state, single submission, offers, settlement and gold, person masking and materialization, stale revision recovery, drawer keyboard, confirmation by keyboard, responsive widths, no console errors or unhandled rejections).

## 14. Anti-patterns

- Game rules in components (eligibility, prices, tiers, locations, time arithmetic). Ask the engine for a flag instead.
- Mirroring server data into `useState`/context, or into `localStorage`.
- Raw `fetch` in a component; building request payloads from displayed text; sending names or ids.
- Rendering model text as HTML (`dangerouslySetInnerHTML`, `innerHTML`); the story markup parser returns text segments.
- One giant component or one global store for everything; generic abstractions without a current user; barrel files.
- Hardcoded colors, fonts or shadows in component CSS.
- Eager full-size images; image paths assembled in the client; `data:` images under the CSP.
- Speculative routes or empty placeholder screens.
