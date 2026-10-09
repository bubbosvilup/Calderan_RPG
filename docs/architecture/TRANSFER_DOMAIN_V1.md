# Transfer Domain V1

Possession != ownership. This extends the existing campaign item domain and its `transfer_item` command. Inventory remains derived, and schema 6 remains unchanged.

## 1. Pre-pass transfer audit

The old command accepted `item_id`, `owner_id`, `position` and optional acquisition provenance. It set owner and position together, but had no semantic mode, engine presence/source checks or same-holder rejection. The Controller treated completed giving as a change of ownership. The authorizer primarily allowed Nicco-owned outbound gifts and owner-held inbound gifts to Nicco. `place_item` changed only position. No transfer intent was persisted; the existing optional acquisition field was the only related provenance.

## 2. Final transfer command design

```ts
{ kind: "transfer_item", item_id, mode, position: { kind: "carried", character_id: recipient } }
```

The source comes from the existing item's carried/equipped position. The command cannot inject `owner_id` or a redundant source ID. Both identities must exist and be physically present. The engine independently checks the mode and destination; Controller schema permits carried destinations only. Existing optional acquisition provenance remains supported for gifts, with its existing validation/replacement behavior; other modes preserve provenance and cannot supply it. No new historical state is added.

## 3. Transfer modes

`gift`, `handoff`, `lend`, `return`, `steal`, `reclaim`, `take` are transient command semantics. They are not persisted on the item.

## 4. Ownership semantics table

| Mode | Physical holder after commit | Ownership effect | Authority |
|---|---|---|---|
| gift | Present recipient, carried | Recipient becomes owner | Source must be owner |
| handoff | Present recipient, carried | Unchanged | Physical source holds item |
| lend | Present borrower, carried | Unchanged | Source must be owner |
| return | Present recipient, carried | Unchanged | Recipient must be owner |
| steal | Present taker, carried | Unchanged | Completed theft, physical source holds item |
| reclaim | Present taker, carried | Unchanged | Taker must be owner |
| take | Present taker, carried | Unchanged | Completed taking, physical source holds item |

Unknown ownership remains omitted; explicitly unowned remains `null`. Neither becomes an invented owner through a possession change. Modes requiring an established owner fail for either state.

## 5. Gift rule

Permanent giving must be explicit and receipt completed. Generic "give" is not a gift. A carrier cannot give permanent title to somebody else's item. A completed physical receipt in that situation can use handoff/take while preserving the original owner.

## 6. Handoff rule

Temporary reading/holding and ordinary completed giving move the same instance without changing owner. Possession alone is not authority to change title.

## 7. Loan rule

The source must own the item. The borrower carries it and the lender stays owner. A non-owner's completed physical handover uses handoff; no loan record or due date exists.

## 8. Return rule

The recipient must be the existing owner; no persisted loan record is required. A return to another recipient is outside V1 return semantics.

## 9. Steal rule

Only a completed theft changes possession. Owner stays unchanged. No crime, detection, reputation or legal consequence system is introduced.

## 10. Reclaim / take rules

Reclaim requires the taker to be owner. Generic take preserves ownership and does not assert title. Both require an existing item physically held by a different present character.

## 11. Equipped item transfer

An equipped source becomes carried by the recipient. The old character's slot becomes empty in the same draft. No recipient equipment slot is retained or inferred.

## 12. Stored item boundary

Stored pickup/drop uses `place_item`; a stored source cannot use `transfer_item`. Controller authorization blocks direct character-to-character `place_item` movement, including attempts to bypass transfer via equipping. The trusted engine placement primitive remains available to fixture/admin code; gameplay passes through authorization. Equipping after a transfer is a separate action on the now-held item, not automatic transfer behavior.

## 13. Newly materialized transfer items

Transfer works on existing IDs only. The existing `create_item` materialization path captures current truth directly for an untracked received object: gift owner=recipient; loan/theft owner=source; position=current recipient. Both description fields remain required. Future transfers reuse that engine-allocated ID. No create-plus-transfer hybrid is added.

## 14. Controller context / policy changes

The existing bounded scene projection already exposes relevant items on present people and items at the current location, with stable IDs, owner and carried/equipped position. Present character IDs remain available; absent known identities can establish ownership but not physical receipt. No campaign-wide item dump was added. Policy now states the seven modes, explicit permanent gifting, source/recipient authority, refusal/failure, stored placement and direct materialization rules. Provider/models remain Luna primary and Haiku 5.5 fallback. Narrator focus includes the physical recipient and source; narrator-facing text remains human-readable.

## 15. Authorization / evidence rules

Shared transition helpers validate owner/holder/presence in both engine and authorizer. Evidence must be a verbatim completed act, identify the relevant item/people and survive refusal/negation/hypothetical checks. A semantic mode change cannot bypass refusal of the same item/recipient handover. NPC-to-NPC completed receipt uses the same domain. Unknown/absent destinations and duplicate materialization are rejected. Existing grammar/group safeguards remain.

The bounded live run exposed an inbound return vocabulary omission: the correct quote "Brenna returns Nicco's sword to Nicco." was rejected. The verifier now recognizes giver-led return/lend acts using its existing destination and clause gates. A possessive such as "Nicco's sword" is not read as a direct recipient. Exact live quote/proposal regression passes; negated, attempted, future and toward-only returns fail. Controller policy was not tuned after the live result.

## 16. Atomicity / revision behavior

Gift position and owner change within one prepared draft/commit. A valid standalone transfer consumes one revision. Invalid, same-holder, absent-source/target, stale and late-invalid batches do not partially mutate. Existing expected-revision behavior remains. Invariant and coordinator tests cover rollback and single-commit behavior.

## 17. Player / NPC / NPC+ consistency

Player, authored NPC, campaign-created NPC and NPC+ use the same helper/table. Tests cover player exchanges with all three classes and an evidence-authorized NPC-to-NPC handover. No class-specific implementation was added.

## 18. Inventory / predicate results

The same item leaves the source's derived inventory and appears in the recipient's inventory. `hasItem`, `carriesItem`, `ownsItem`, `equipsItem` and `itemAt` are checked for every mode. A stolen item is possessed by Nicco while owned by Brenna. Inventory UI stays read-only and refreshes from existing session state.

## 19. Save / load impact

Schema stays 6. Roundtrips preserve ID, owner, position, descriptions and sprite for every mode, including representative gifts, loans and thefts. No command mode, consent, transaction, loan or previous-owner field is persisted.

## 20. Sprite / visual identity impact

Transfer preserves description, visual description, sprite status/QA metadata, asset reference and creation revision. Ready items do not queue another sprite job; GameSession schedules automatic art only for newly created identities. The live runner instantiates no image pipeline and made zero image calls. No duplicate was created in any case.

## 21. Live Luna results

See [recorded proposals, evidence, context, authorization and grades](../evaluations/TRANSFER_DOMAIN_LIVE_SMOKE.json). Eight independent public synthetic fixtures exercised the real Controller, strict parser, TurnCoordinator, authorization and engine; narration was scripted. No real save, production canon or private facts were sent. An initial runner using the larger shared fixture was rejected by automatic review before execution; the public-only fixture was then approved.

| Case | Luna mode | Final owner | Final carrier | ID reuse | Authorization / engine | Original live grade |
|---|---|---|---|---|---|---|
| Gift | gift | Brenna | Brenna | PASS | PASS / committed | PASS |
| Temporary handoff | handoff | Nicco | Brenna | PASS | PASS / committed | PASS |
| Loan | lend | Nicco | Brenna | PASS | PASS / committed | PASS |
| Return | return | Nicco | Brenna (unchanged) | PASS | FAIL / no commit | FAIL |
| Successful theft | steal | Brenna | Nicco | PASS | PASS / committed | PASS |
| Reclaim | reclaim | Brenna | Brenna | PASS | PASS / committed | PASS |
| Refused gift | none | Nicco | Nicco | No command; unchanged | PASS / correct no-op | PASS |
| Stolen-item attempted regift | handoff | Brenna | Maren | PASS | PASS / committed | PASS |

All cases independently used `campaign_item_00000001`. Mode, ID, carrier, owner, authorization and engine are graded separately in JSON. Return failed in **authorization**, not semantic model choice, schema or engine execution. Its owner and identity remained correct and no revision was consumed. The subsequent deterministic fix does not change this original live grade.

Totals: **8 requests, 8 Luna responses, 7/8 live PASS, 0 retries, 0 fallback, 0 parse failures, 1 rejected authorization, 0 image calls, 0 duplicates**. All existing item descriptions and visual identities stayed unchanged. No live retry was performed after the return fix.

## 22. Files created for this milestone

- `src/campaign/item-transfer.ts`
- `tests/transfer-domain.test.ts`
- `scripts/transfer-domain-live-smoke.mjs`
- `docs/architecture/TRANSFER_DOMAIN_V1.md`
- `docs/evaluations/TRANSFER_DOMAIN_LIVE_SMOKE.json`

## 23. Files modified for this milestone

Runtime/types/schema/policy: `src/campaign/{types,validation,items}.ts`, `src/llm/controller-schema.ts`, `src/llm/openrouter/state-controller.ts`, `src/turn/{command-authorizer,evidence-authorization,natural-actions,player-intent,reference-resolution,turn-evidence,prompt-builder,narration-audit,narrator-focus}.ts`, `src/turn/stages/authorization.ts`.

Evaluation command fixtures/metrics: `src/dev/{controller-bakeoff-metrics,controller-benchmark-cases,eval-hardening,llm-scenarios,playthrough-manifest}.ts`.

Test fixture/schema/ownership migrations: `tests/{campaign-state,controller-benchmark,controller-model-fallback,controller-reliability,d10-mannerisms,evidence-authorization,evidence-quote,item-visual,language-call-paths,live-regression-repair,live-regression-repair-1-1,live-regression-repair-1-2,narration-survives-audit,narrator-alternatives,narrator-bakeoff,natural-actions,provider-reliability-contract,provider-retry-h5,sprite-quality,turn-coordinator,turn-evidence-1m1,turn-failures,turn-hardening,turn-pipeline-golden,turn-pipeline-invariants,turn-stages}.test.ts`, `tests/turn-fixtures.ts`, `tests/golden/turn-pipeline.json`, `tests/playthrough/curated.json`.

`docs/architecture/ITEM_DOMAIN.md` links the transfer rules and moves economy/ledger work into future scope. Prior inventory UI and sprite work was already uncommitted in the workspace; those existing changes are not newly claimed as Transfer Domain implementation. No commit was made.

## 24. Focused test results

**37/37 transfer tests; 378/378 focused regressions**, including item domain, permanent inventory, schema/policy, evidence authorization, campaign state, persistence/save-load, inventory UI, visual/sprite regressions, coordinator failure/atomicity and provider reliability. The exact live return failure is included deterministically. Logs: `docs/evaluations/TRANSFER_FOCUSED_FINAL.log` (local ignored validation artifact).

## 25. Typecheck / build

`npm run typecheck --silent` and `npm run build --silent`: PASS. Live runner syntax check: PASS. Diff whitespace check: PASS.

## 26. Full suite result

**2791/2791 PASS**, zero failures, cancellations or skips. Final full-suite result is recorded in `docs/evaluations/TRANSFER_FULL_FINAL.log` and the JSON validation summary. This run includes the post-live return evidence correction.

## 27. Remaining gaps before economy / transaction records

The return evidence repair is deterministic-validated but has not been rerun live because the eight-call budget is exhausted. The bounded original live validation therefore remains 7/8, not complete 8/8 certification. Semantic mode labels other than permanent gift depend on Controller interpretation of the narration; the engine validates current-state consequences and authority. Return/reclaim require an established owner; no historical claim inference exists. Institutional ownership, buying/selling, currency, consent persistence, crime, transfer history, loan records and UI transfer controls remain future milestones. The V1 implementation and deterministic validation are complete; no migration, additional provider test or paid retry was performed.
