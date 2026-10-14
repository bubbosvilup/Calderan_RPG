# UI migration roadmap

Status: ACTIVE. Last reconciled: 2026-10-14 (UI-1). Architecture: [Frontend architecture](../architecture/FRONTEND_ARCHITECTURE.md). Starting point and parity matrix: [Legacy UI decomposition baseline](../evaluations/LEGACY_UI_DECOMPOSITION_BASELINE.md).

The React client (`src/ui-client/`, served at `/app/`) replaces the legacy vanilla UI (`src/ui/`, served at `/`) in phases. Every phase keeps the engine authoritative: no phase changes engine rules, the save schema or providers unless that phase says so explicitly and gets its own approval. A phase is done when its screens reach parity with the legacy UI, its component tests and a browser check pass, and the docs say so.

| Phase | Scope | Engine or API work | Exit criteria |
| --- | --- | --- | --- |
| **UI-1** (done) | Foundation: Vite, router, TanStack Query, API layer, tokens, image primitive, responsive play shell. Play screen core: campaign select / load / create, transcript, composer (turns, `/location`), pending and busy states, player and scene summary, gold, scene participants, temporary people (Keep track), household list, character drawer, NPC+ promotion, Actual Offer, pending confirmations, save indicator, error surface, stale recovery | `/app` static serving only | `react-play-browser-check` 30/30; component, contract and boundary tests pass |
| **UI-2** | Inventory screen (grid, filters, search, item detail, equipment figure, sprite polling) as a route or drawer; player character page (appearance editor); image gallery and lightbox (view, set Avatar / Full Body, delete) on the shared `Image` primitive; a `Modal` primitive sharing `useDialogFocus` | none (existing endpoints) | inventory and player parity rows in the baseline matrix closed; gallery keyboard check |
| **UI-3** | Household screen (filters, large cards); NPC+ management: appearance editor and the portrait generation lifecycle (progress, placeholders, timeout copy, generation blocked reasons) | none | household and NPC+ editor parity; generation flow checked with a fake generator |
| **UI-4** | Campaign management (delete with confirm, close, recovery slots, save banners: too large, size warning, autosave paused); settings; optional-service diagnostics panel; narrator alternatives (developer aid) | none | all remaining legacy rows except world and debug closed |
| **UI-5** | Property and containers, when the engine exposes them | engine read models first (separate approval) | follows the engine feature |
| **UI-6** | Journal, world and knowledge views | read models for player-known world knowledge (separate approval) | follows the engine feature |
| **UI-7** | Visual polish: thematic skins via tokens, illustrated backgrounds (`--play-backdrop-image`), motion, image-heavy presentation, gallery virtualization if galleries grow past a few hundred items | image sizes / `srcset` on the server if needed | performance budget for large galleries |
| **UI-8** | 3D integration seam: an isolated, lazily loaded `features/scene3d/` hosted by a drawer or workspace; Three.js / React Three Fiber added here, not before | none for the seam | the 3D module loads only when opened; no effect on the play bundle |
| **UI-9** | Legacy UI removal: make `/` the React app, port the remaining browser checks to role-based selectors, delete `src/ui/index.html`, `client.js`, `style.css` and the legacy-only tests | serving change | every legacy browser check has a React equivalent; parity matrix fully closed |

## Notes

- **Order can flex** between UI-2, UI-3 and UI-4; UI-9 comes last.
- **Cross-cutting, every phase:** keyboard paths and focus management, `role=status` / `role=alert` copy, no engine rules in components, no new raw colors, CSP-compatible assets (no `data:` images), the DTO contract test updated with each new DTO.
- **UI-1 baseline closure (test-only):** five source audits failed on Windows on main `ebe7d2a` because they matched POSIX path substrings against `path.join` output (`\` on Windows); they now normalize through `tests/support/source-paths.ts`. The legacy turn-reliability browser check rejected the legacy client's intended submit-time status "Generating…"; it now uses the closed vocabulary in `tests/support/legacy-turn-status.ts`, pinned to `src/ui/client.js` by `tests/ui/legacy-turn-status.test.ts`. The legacy UI itself is unchanged.
