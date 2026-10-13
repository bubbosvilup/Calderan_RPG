# Morning brief after the repository cleanup

Date: 2026-10-13. Read time: a few minutes. Nothing below has been started; every next step waits for the user.

## State

| | |
| --- | --- |
| Final main | `ed7e85f` (audit). The planning commit that adds this brief sits on top of it and changes documentation only. |
| Repository health | **GREEN WITH KNOWN PRODUCT DEBT** ([audit](POST_CLEANUP_REPOSITORY_AUDIT.md)) |
| Cleanup F (test taxonomy) | `9d27f81`: 226 test files in 21 domain folders, none at the root, no milestone names, taxonomy guard; TEST-3 and REPO-10 closed |
| Cleanup G (lifecycle vocabulary) | `7e5e4ea`: `campaign/materialization.ts`, `buildMaterializedCharacter`; materialization and NPC+ promotion no longer share a name; vocabulary guard; no serialized name changed |
| Final audit | `ed7e85f`: 170 register verdicts reconciled, 5 new debt rows (AUD-1, AUD-2, VOC-1, REPO-14, ARCH-3), cleanup program A to G **closed** |
| Tests | 3701 / 3701 pass, 0 skipped |
| Benchmark | 55 / 55, 0 known product gaps |
| Architecture | 0 runtime import cycles (359 modules); 6 type-only cycles (ARCH-3, P3) |
| Docs | 0 broken links in current docs; save schema 8 / snapshot 7 unchanged |
| Browser checks | 8 / 8 exit 0 (two of them only print a report and cannot fail on a wrong result: see TEST-9 below) |

## Major debt still open

- **Correctness, no decision needed:** a person bought through an Actual Offer can keep a canonical alias as their name (AUD-1, static); internal ids are substituted inside ordinary words in Narrator text, for example "dren" inside "children" (CTX-1, confirmed on current data); after 500 transcript entries new turns stop appearing until a reload (new UI finding); a keyboard-only player cannot reach Promote (UI-1).
- **Authority and identity, decisions needed:** a punch on a canonical NPC silently gives them a campaign record and changes their tier (AUTH-5 / D5); an NPC+ who says they leave is turned off with no confirmation and cannot come back (NPC-4 with NPC-1 / D4).
- **Pipeline and context:** commit preparation adds commands outside the preferred authorization path and the trace does not show them (PIPE-6); reconciled turns can commit actions the delivered prose no longer shows (PIPE-7); several audit checks read only quoted speech, but the production format writes speech unquoted; the Controller copy of the context is a deny-list.
- **Persistence:** trade offers are never pruned and IDs are max plus one (TRD-12); oversize is reported as retryable (PER-1); side stores lack a write cap and are not in checkpoints.
- **Items and economy:** no quantities, stacks, containers or item kind key; goods trades leave no ledger and a SELL to a persistent buyer never debits the buyer (TRD-11 / D3).
- **Testing and CI:** no CI (CI-1); two browser checks cannot fail (TEST-9); suite timing never measured (TEST-8).

Full list: [product work plan](POST_CLEANUP_PRODUCT_WORK_PLAN.md) (147 entries). Graph: [dependency graph](POST_CLEANUP_DEBT_DEPENDENCY_GRAPH.md).

## Top 5 recommended next blocks

From the [Next implementation program](NEXT_IMPLEMENTATION_PROGRAM.md); ready-to-paste prompts are in [Next block prompts](NEXT_BLOCK_PROMPTS.md).

1. **B1 Reserved names and Narrator id masking**: AUD-1, CTX-1, a log-only diagnostic for leaked refs. Low risk, no decision.
2. **B2 Test trust and the fast CI gate**: timing, asserting browser checks, Playwright declared, small test fixes; then the CI workflow once the host is chosen.
3. **B3 UI trust and keyboard**: transcript cursor, keyboard path to Promote, focus, live regions, location copy.
4. **B4 Persistence durability, save-compatible**: size code, compact JSON, side-store guards, identity diagnostics, real older-save fixtures. No schema bump.
5. **B5 Pipeline lanes declared and observed**: PIPE-6 lane records, the true committed list, AUD-2 behind a parity test. No behavior change expected.

Then B6 (canonical NPC policy and NPC+ exits), B7 (item identity and equipment, opens schema 9), B8 (containers and Property). Weather UI is an independent track, best after B3.

## Decisions required from the user

| Decision | Needed for | Recommendation in the reviews |
| --- | --- | --- |
| D5: can a canonical NPC get a campaign record or NPC+? | B6, Property | Option A, "not now": canonical records stay overlays and the rite refuses canonical NPCs |
| D4: NPC+ who leaves the household | B6 | inactive plus rejoin plus badge; a narrated leave asks the player to confirm |
| Can an NPC+ ever be demoted or retired? | B6 | decide explicitly; today the code refuses and points to an operation that does not exist |
| ITM-2 meaning of `empty_slots`, container shape, non-character owners, structured property ownership | B7, B8 | decide before any item schema work |
| D6: premium-to-NPC+ key rename at the next schema bump | schema 9 (with B7) | do it in the same bump |
| D3: currency unit | economy stage | decide before ECO-1 / TRD-11 |
| C1 / C2: CI host, platforms, Node majors | B2 workflow file | GitHub Actions is assumed by the review, nothing requires it |
| C6: copy evidence saves into `tests/fixtures/` | B4 step P5 | yes, with provenance entries |
| Q1: inline confirm step for buying a person | UI | yes, inline |
| Q3: Weather UI placement | W | location card first, no forecast |
| Narrator-only canon reaching the Controller | CTX-B | open |
| PIPE-7 outcome per action class (drop the command or append a sentence) | PIPE-7 block | open |
| D9: reference-image upload route and field | image UX | the UI control is already gone; decide on the server route |

## What can run autonomously next (after the user says go)

B1, B2 part 1 (test trust), B3, B4 steps P0 to P4, B5, and Weather UI with the recommended defaults. Each has stop conditions in its prompt and needs no product decision.

## What must NOT start without approval

AUTH-5 / D5 work (B6), any NPC lifecycle rule change, any schema bump (schema 9, B7), item or economy work, Property and containers (B8), PIPE-7 enforcement, CTX-B's Controller view, the CI workflow file before C1, copying evidence saves into fixtures before C6, and any live provider or image generation run.
