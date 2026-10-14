# Reserved names in person offers and Narrator id masking (block B1)

Date: 2026-10-14. Base: main `26fc79f`. Block B1 of the [Next implementation program](NEXT_IMPLEMENTATION_PROGRAM.md), with the user decision of 2026-10-14 for AUD-1 (register section 16, D21): **keep the person offer, mask/drop the canonical name, never block the transaction.** That decision replaces the fail-closed refusal the B1 prompt proposed. No live provider call and no image generation call was made. No save schema change.

## Starting assumptions (re-verified on `26fc79f`)

| # | Assumption | Result |
| --- | --- | --- |
| 1 | The person offer plan materializes the subject and a named seller with `materializeProvisional` and never calls `claimsReservedHandle` (only name establishment and Keep track do) | True |
| 2 | The scene reading's canon guard compares canonical names only, so a whole name that keeps a canonical token passes | True: "My name is Doran Hale" makes the person "Doran" |
| 3 | The id pattern in `narrator-identity.ts` has no boundary | True |
| 4 | No check scans delivered prose for internal ref shapes | True |

## AUD-1: before and after

Characterization (real `data/` world, scripted narration, no providers): a woman chained in the last cage of the Calderan slave market introduces herself, Korvin prices her, the player accepts.

| Claim | Before (`26fc79f`) | After (B1) |
| --- | --- | --- |
| "My name is Doran Hale" (canonical alias of Captain Doran Hale) | Offer subject `campaign_character_r3_doran`, name "Doran" | Offer stands; record `campaign_character_r3_woman`, unnamed, label "the woman", evidence `"My name is [name withheld],"`; diagnostic `name_withheld: canonical_name_reserved` |
| "My name is Elara" / "Mistress Elara" | Unnamed (the reading already refused the name) but the evidence quoted the alias | Unnamed; the claim masked in the evidence |
| "My name is Captain Doran Hale" | Unnamed, alias in the evidence | Unnamed; the claim masked |
| "My name is Korvin" (the seller present) | Unnamed, the claim in the evidence | Unnamed; only the claim is masked; "Korvin leads Nicco…" and the role "offered for sale by Korvin" keep the real seller's name |
| A seller says "Name's Doran Hale" and sells a girl | The seller became a campaign character named "Doran" | The seller sells as an anonymous counterparty "the man"; no recorded string names him |
| "My name is Brenna" (control) | Named Brenna | Unchanged: named Brenna, no `name_withheld` |

Run of the new tests against the pre-fix code (a worktree of `26fc79f` with the new test files): 1 of 11 passed (the Brenna control); every AUD-1 row and all three masking tests failed. After the fix all pass.

### How

- `src/turn/identity/canonical-name-reservation.ts`: `reservedClaims(world, identity, person)` returns what is withheld for one narrated person: the reserved handles claimed FOR them (their own self-introductions and name disclosures, matched by speaker keys or name), the claim spans, and their established name when it is withheld with its whole names. `maskWithheld` masks inside the spans and the withheld names as exact-case whole words; `maskDeep` applies it to a command payload. The header now names the three lanes.
- `src/turn/commerce/person-offers.ts`: the identity facts of every narration of the scene feed `withheld` (the same reading Keep track uses). The subject is materialized from a nameless copy under the narration's description; a named seller with a withheld name becomes an anonymous counterparty; every plan command, the counterparty, the authority evidence and the offer evidence go through `maskDeep`. Nothing changes when nothing is withheld (same object returned).

### Known limits (recorded, not fixed)

- Offers stored before B1 are not re-checked (legacy limitation; saved plans settle as stored).
- `origin_snapshot.ephemeral_ref` keeps the scene-local lowercase token (`narrated:doran`): it is internal provenance that counteroffer continuity, the trade guard and the identity-fork scanner compare, never a display name.
- The identity extractor reads "Doran HALE" (all-caps surname) as the token "Doran" with no whole name, and "Doran" alone is not reserved. Changing that is a NarrationFacts change, out of scope.
- The Narrator may keep using the claimed name in later prose; the record does not carry it.

## CTX-1 substring part: before and after

| Input | Before | After |
| --- | --- | --- |
| "I ask the sister how many children live here." | "children" became `chilNPC12` (the id `dren`) | Unchanged |
| `dren` | `NPC12` | `NPC12` |
| `fact_dren_debt` | `fact_NPC12_debt` | `fact_NPC12_debt` (underscore and hyphen still delimit an id) |

Fix: the id pattern gets the name pattern's `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` lookarounds with the `u` flag. Tests (`tests/context/narrator-id-mask-boundary.regression.test.ts`): the unit cases, a scan of every word in `data/**/*.yaml` that contains a canonical NPC id as a strict substring (none may gain an `NPC<n>`), and the Narrator prompt at Saint Orra House (location prose and player action keep "children", no ref spliced into a word). The rest of CTX-1 (other ids reaching the Narrator, protection by prompt rule) stays open.

**The frozen golden trace pinned the defect.** `tests/golden/turn-pipeline.json` (scenario `success_carry_travel`) recorded the Narrator prompt with "street chilNPC12" in the Calderan West social-life canon. The fix turns it back into "street children"; the golden file was regenerated deliberately (`H2_UPDATE_GOLDEN=1`) and that one string is its whole diff.

## Leaked-ref diagnostic (log only)

`src/turn/audit/leaked-refs.ts` scans the DELIVERED prose for `NPC<n>`, `P<n>`, `F<n>`, `R<n>`, `narrated:`/`other:` scene keys, snake_case ids and the exact lowercase id of a known character. The coordinator records hits in the turn diagnostics as `audit.leaked_refs` (at most 12, shapes only). Nothing is redacted, revised or failed. Tests: `tests/authority/leaked-refs-diagnostic.test.ts` (unit shapes, clean prose stays clean, and a turn whose prose carries `NPC4` completes with the prose unchanged and the shape recorded).

## Invariants checked

NarrationFacts output unchanged (no extractor touched); Keep track, late naming and the identity-fork scanner unchanged; no save schema change; authority semantics unchanged (the offer is never blocked). Validation results are in the block summary of the B1 to B5 run.
