# Repository Cleanup D: src/turn domain decomposition

Status: Historical report, 2026-10-13. Program "Repository Cleanup C + D", part D. Baseline main `057ee3b` (Cleanup C).

Scope: relocation only. Every module was moved with `git mv`, and imports and literal paths were rewritten mechanically. No redesign and no logic change. Gameplay, save schema, NarrationFacts, authority rules, Keep track, Actual Offer and canonical-name reservation are untouched, and no live or image call was made.

The work ran as seven independent phases. Each passed its own full validation and has its own commit and push to main (fast-forward each time):

| Phase | Commit | Content |
| --- | --- | --- |
| D1 | `f49a5c9` | items, commerce |
| D2 | `c785b9a` | movement |
| D3 | `a0ee7a0` | context |
| D4 | `2a0e242` | authorization, audit |
| D5 | `bd4981c` | coordinator |
| D6 | `47e254b` | identity |
| D7 | the commit that adds this report | optional, `sentences.ts` removed, docs, this report |

## 1. Baseline after C

Main `057ee3b`: 3685 tests, 0 failed; benchmark 55/55, 0 known gaps. `npm run check:architecture`: 361 modules, 28 source back edges, 0 runtime back edges, runtime graph sha256 `f5929f18…`. `npm run check:docs`: 0 broken. See [Cleanup C](REPOSITORY_CLEANUP_C_REFLECTION_CONSOLIDATION.md).

## 2. Original src/turn graph

`src/turn` had 116 modules: **81 at the root**, plus `language/` (4), `narration-facts/` (20), `stages/` (7) and `structured/` (4, from Cleanup C).

The whole-repository graph covered `src/`, `tests/` and `scripts/` `.ts` files, parsed with the architecture checker's own TypeScript AST method, with emitted JS used for runtime edges. It had 634 modules, 3,360 runtime edges and 4,525 edges in total, type-only edges included.

Root hubs (turn importers / outside-`src/turn` importers):

| Module | turn importers | outside importers |
| --- | --- | --- |
| `context-builder` | 51 | 22 src, 103 tests |
| `scene-participants` | 22 | — |
| `recent-conversation` | 21 | 7 src |
| `turn-types` | 19 | 24 src |
| `turn-coordinator` | 0 | 26 src, 101 tests |

## 3. Target domain map

Placement rule: a module goes to the domain that owns its rule, and stays at the root only if it is genuinely cross-domain. The plan introduces no `misc/`, `utils/`, barrel or broad `index.ts`.

| Folder | Modules |
| --- | --- |
| `items/` | item-intent, item-ownership, item-projection, item-reference, item-resolution, reference-resolution |
| `commerce/` | commerce-evidence, economic-context, person-offers, person-transactions, trade-authorization, trade-notes, trade-price, transaction-acts |
| `movement/` | character-movement, follow-candidates, follow-invitation, movement-evidence, movement-scope, player-travel, travel-resolution |
| `context/` | context-builder, context-budget, context-compaction, lossless-context-compaction, lossless-knowledge, knowledge-grants, narrator-pack, prompt-builder, recent-scene-narration, retrieval-policy, scene-state-focus, scene-state-projection, scene-state-render, narrator-focus, narrative-authority, referenced-characters, npc-plus |
| `authorization/` | command-authorizer, evidence-authorization, evidence-check, household-evidence, turn-evidence, physical-interaction, player-authored-events, pending-proposals, character-contracts |
| `audit/` | narration-audit, grounding-audit, pending-audit |
| `coordinator/` | turn-coordinator, turn-diagnostics, narrator-ledger, mutation-diagnostics |
| `identity/` | canonical-interaction-targets, canonical-name-disclosure, canonical-name-reservation, foreground-binding, identity-request, keep-track, name-establishment, narrator-identity, partner-identity-guard, provisional-people, scene-participants, attributed-speech, background-grounding |
| `optional/` | mannerism-extraction, mannerism-portrayal-gate, reflection, reflection-diagnostics, reflection-pacing, structured-reflection-maintenance |
| unchanged | `stages/`, `structured/`, `language/`, `narration-facts/` |
| root (cross-domain) | `turn-types`, `recent-conversation`, `player-intent`, `natural-actions`, `rpg-dialogue`, `temporal-grounding`, `temporal-action` |
| removed | `sentences.ts` |

Why the root modules stay:

- `turn-types` is the turn's public vocabulary; context modules import it at runtime and 24 modules outside `src/turn` use it.
- `recent-conversation` is the exchange record that facts, identity, context and stages all read.
- `player-intent` and `natural-actions` resolve player actions across movement, items, physical acts and time.
- `rpg-dialogue` is the narration-span shape that facts and identity read.
- `temporal-grounding` holds the time-of-day labels shared by prompt, audit, scene state and the session view.
- `temporal-action` is the one time-domain rule, too small for its own folder.

D0 kept `turn-types` and `recent-conversation` at the root after the projection showed that moving them would make `context`, and `narration-facts` respectively, depend on another domain's folder.

**Mechanics** (scratch mover, not committed):

- `git mv` each module of the phase;
- rewrite every relative import specifier in `src/`, `tests/` and `scripts/`, including the `.mjs` scripts' `../.build/src/turn/...` imports and `import("...")` type queries. Each specifier is resolved from the importer's previous location, then recomputed from its new location;
- rewrite literal source paths (`src/turn/x.ts`, `.build/src/turn/x.js`, bare `turn/x.ts` in comments) in code and in current documentation, never under `docs/evaluations/`;
- preserve every file's line endings.

**Per-phase proof:**

- the edge set (runtime and type), mapped through the cumulative renames, must equal the D0 graph exactly;
- every changed line is an import or a path;
- the full validation chain passes.

**Manual cases found in D0:**

- a path regex and a template-built path list in `tests/npc-plus-pass-10-architecture.test.ts` (D2, D3, D7);
- `endsWith("turn/reflection.ts")` in `tests/pass10-deps.ts` (D7);
- bare `turn/x.ts` comments in `src/campaign/promotion.ts` (D1), `character-lifecycle.ts` (D6) and `premium-characters.ts` (D7);
- `turn/sentences.ts` in the debt register (D7).

**Projected folder dependencies** (runtime): every folder depends on `language/` and most on `narration-facts/`. `stages/` depends on most domains, as the pipeline should. Folder-level mutual references remain as they are today (for example `context` ↔ `identity` through `context-builder` → `narrator-identity` and `canonical-name-disclosure` → `narrator-focus`). They are not module cycles: the runtime graph has 0 back edges, and this cleanup does not redesign them.

## 4. D1 moves (`f49a5c9`)

- 6 modules → `items/`, 8 → `commerce/`.
- 50 files changed, 113 / 113 lines.
- Manual: a `join("src", "turn", "commerce-evidence.ts")` path in `tests/narration-facts-architecture.test.ts`. That `join()` form was then added to the mover.
- One sorted path list in `tests/block5b-auth2.test.ts`, re-ordered because `commerce/` sorts before `keep-track.ts`.
- One bare comment path in `src/campaign/promotion.ts`.
- A first mover draft normalized CRLF line endings in two files. The endings were restored, the mover fixed (`newline=''`) and a CR-count check added to every later phase.
- 3685/3685, 55/55.

## 5. D2 moves (`c785b9a`)

- 7 modules → `movement/`.
- 47 files, 103 / 103 lines.
- Manual: the path regex in `tests/npc-plus-pass-10-architecture.test.ts`.
- 3685/3685, 55/55.

## 6. D3 moves (`a0ee7a0`)

- 17 modules → `context/`.
- 242 files, 530 / 530 lines; `context-builder` alone had 103 test importers.
- Manual: the NPC+ path regex and the template path list (`src/turn/context/${file}.ts`) in the same architecture test.
- 3685/3685, 55/55.

## 7. D4 moves (`2a0e242`)

- 9 modules → `authorization/`, 3 → `audit/`.
- 69 files, 196 / 196 lines; the `join()` paths were rewritten by the mover.
- 3685/3685, 55/55.

## 8. D5 moves (`bd4981c`)

- 4 modules → `coordinator/`.
- 162 files, 250 / 249 lines; the extra line is the comment below.
- The only non-path test change in the program: `tests/rpg-format-contract.test.ts` pins source bytes of `src/app/provider-config.ts`. That file changed only by its `narrator-ledger` re-export path, and restoring that one line reproduces the previous digest `ff7233cf…` exactly. The pin was re-baselined with a comment, following the file's own "Re-baselined by" convention.
- 3685/3685, 55/55.

## 9. D6 moves (`47e254b`)

- 13 modules → `identity/`, last among the core domains as required.
- 88 files, 184 / 184 lines.
- Focused identity suites (22 files: Keep track, provisional people, canonical casting and names, partner identity, foreground binding, block 5B, promotions and others): **284/284**.
- Browser checks: **Keep track 15/15**, **Actual Offer 21/21**, **explicit promotion 13/13**.
- `npm test`: 3684/3685. The only failure was the known timing-flaky UI test `generation lifecycle (npc, avatar)`. It failed in the run and in its one allowed rerun, with the same symptom both times (the status still reads "Request sent").
- It was not modified and not rerun again as a suite. Diagnosis instead:
  - run alone, it fails 1 of 5 times on the D6 tree;
  - it fails 1 of 8 times on the D5 commit in a separate worktree;
  - so the flakiness predates D6 and is unrelated to the moves.
- Because the validation chain stops at the first failing step, the D6 runs ended at `npm test`. Benchmark, `check:architecture` and `check:docs` were therefore run afterwards on the exact D6 commit `47e254b`, in a separate worktree: **benchmark 55/55**, 0 runtime back edges, 0 broken links. The D6 commit message states those results; they were verified only after the push.
- The import graph was identical modulo renames.

## 10. D7 moves (the commit that adds this report)

- 6 modules → `optional/`.
- `src/turn/sentences.ts` removed (REPO-9 part). It was a two-line re-export of `language/text.ts` imported by one test that only asserted the re-export identity; that test now asserts the shell is gone.
- Manual: the reflection path regex in the NPC+ architecture test; the mover rewrote the bare `endsWith("turn/reflection.ts")` in `tests/pass10-deps.ts`.
- Current documentation updated:
  - the repository layout in `README.md` and `docs/ARCHITECTURE.md`;
  - REPO-9 in the debt register;
  - testing and current-state notes.
- Each step run and logged separately: 3685/3685, 55/55, `check:architecture` 360 modules (one fewer: the shell), 0 runtime back edges, `check:docs` 0 broken.

## 11. Compatibility shells

**None were added.** No move needed one, because every importer was rewritten in the same commit and the typecheck plus the graph comparison proved nothing was left behind. Removed: `src/turn/sentences.ts`. Still present, outside `src/turn` and out of scope: `deepseek-controller.ts` (REPO-9 remainder).

## 12. Before/after counts

| | Before (`057ee3b`) | After |
| --- | --- | --- |
| modules in `src/turn` | 116 | 115 (`sentences.ts` removed) |
| modules at the `src/turn` root | 81 | **7** |
| domain folders | 4 | 13 |
| repository modules (src + tests + scripts `.ts`) | 634 | 633 |
| runtime / all edges | 3,360 / 4,525 | 3,358 / 4,523 (the two `sentences.ts` edges) |
| `check:architecture` modules (src) | 361 | 360 |

Folder sizes after: `context` 17, `identity` 13, `authorization` 9, `commerce` 8, `movement` 7, `stages` 7, `items` 6, `optional` 6, `coordinator` 4, `language` 4, `structured` 4, `audit` 3, `narration-facts` 20, root 7.

## 13. Fan-in/fan-out changes

**Module level: no change.** After every phase, the runtime and type edge sets, mapped through the cumulative renames, were compared with the D0 graph. They were identical (0 extra, 0 missing), the D7 comparison excepting only the removed shell's edges. Every module keeps exactly its importers and imports.

Folder level after D7 (runtime edges between different folders; outside = import edges from `src/` outside `src/turn`, `tests/` and `scripts/`):

| Folder | Modules | Depends on (folders) | Used by (folders) | Outside import edges |
| --- | --- | --- | --- | --- |
| `language` | 4 | 0 | 11 | 12 |
| `items` | 6 | 1 | 5 | 6 |
| `structured` | 4 | 2 | 1 | 8 |
| `commerce` | 8 | 3 | 5 | 10 |
| `narration-facts` | 20 | 4 | 7 | 15 |
| `movement` | 7 | 4 | 5 | 35 |
| `optional` | 6 | 4 | 2 | 47 |
| `identity` | 13 | 5 | 9 | 61 |
| root | 7 | 5 | 9 | 138 |
| `authorization` | 9 | 6 | 4 | 44 |
| `context` | 17 | 6 | 6 | 318 |
| `audit` | 3 | 8 | 1 | 16 |
| `coordinator` | 4 | 8 | 1 | 165 |
| `stages` | 7 | 11 | 1 | 16 |

The shape is the expected one. `language` is a pure leaf and `items` almost one. `stages`, `coordinator` and `audit` sit on top with one consumer each. `context` (TurnContext) and `coordinator` (TurnCoordinator) carry most outside imports, mostly tests.

## 14. Runtime-cycle result

**0 runtime back edges after every phase** (`npm run check:architecture`, exit 0). Source (type-only) back edges stayed at 28 throughout. Runtime graph sha256 by phase:

| Phase | sha256 |
| --- | --- |
| D1 | `4b1de3fe…` |
| D2 | `e66bf073…` |
| D3 | `c2d00097…` |
| D4 | `3da5803d…` |
| D5 | `f9d35106…` |
| D6 | `e38f8903…` |
| D7 | `da03584d…` |

The sha changes with paths by construction; the rename-mapped edge comparison in section 13 is the proof that the graph did not change.

## 15. Test/benchmark result

Every phase ran the full chain from an empty `.build`: `npm run clean`, `typecheck`, `build`, `test`, `benchmark:modern`, `check:architecture`, `check:docs`.

- **Tests:** 3685/3685 in D1-D5 (D1 after the two path expectations in section 4) and 3685/3685 in D7. D6 was 3684/3685 with only the known flaky UI test (section 9).
- **Benchmark:** 55/55 PASS, 0 known product gaps, 0 FAIL in every phase.
- **Docs:** `check:docs` 0 broken in every phase.
- **D6 extras:** focused identity suites and browser checks (section 9).

## 16. Remaining src/turn debt (not addressed: relocation only)

- **Large modules:**
  - `audit/narration-audit.ts` 717 lines, with 27 turn imports, the widest fan-out of any module;
  - `authorization/evidence-authorization.ts` 458;
  - `commerce/person-offers.ts` 360;
  - `coordinator/turn-coordinator.ts` 344.
- **Folder-level mutual dependencies** (module graph acyclic at runtime; these are folder pairs that each import the other):
  - `context` ↔ `identity` (`context-builder` → `narrator-identity`; `canonical-name-disclosure` → `narrator-focus`);
  - `commerce` ↔ `identity` (`person-offers` → provisional people; `scene-participants` → `transaction-acts`);
  - `narration-facts` → `commerce` / `identity` (`commerce-forms` → `trade-price`; `departure-forms` → `narrator-identity`), while those domains read facts;
  - `coordinator` ↔ `stages`;
  - `optional` ↔ `structured` (the Reflection schema modules import `optional/reflection`);
  - root ↔ `context` / `identity` / `movement` (through `player-intent`, `natural-actions` and `turn-types`).
- **Type-only back edges:** 28 source back edges remain.
- **PIPE-6, PIPE-7 and CTX debt** unchanged, as instructed.
- `buildPromotedCharacter` not renamed, as instructed.

## 17. Cleanup E handoff

Candidates, none started:

- **Structure:**
  - fold `structured/` into `optional/structured/` (it is only Reflection);
  - move `transaction-acts` and `trade-price`'s pure number grammar toward `language/` so `narration-facts` stops importing `commerce`;
  - split `narration-audit` by audit family;
  - decide whether `turn-types` should split into a coordinator-owned event vocabulary and shared value types.
- **Repository cleanup still open:**
  - `deepseek-controller.ts` (REPO-9 remainder);
  - the Reflection oracle delete candidate `tests/frozen/reflection/reflection-wire-v2.ts`;
  - REPO-13 archive weight;
  - lifecycle vocabulary normalization and test taxonomy (out of scope here).
- **Tooling:** keep the rename-mapped graph comparison as a standing check for future moves. The mover and comparison scripts used here were scratch tools and are not committed.
