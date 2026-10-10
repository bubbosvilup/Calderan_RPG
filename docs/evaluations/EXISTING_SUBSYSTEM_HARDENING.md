# Consolidation Pass C: Existing Subsystem Hardening

Base: main 3733ce5 plus the uncommitted Pass B work. Nothing committed or pushed. No save-schema change.

## 1. Pass B live closure
- Phase 0 (one turn): INCONCLUSIVE, not failed. The Narrator had Brenna hesitate, the Controller correctly proposed nothing, revision 2 to 2.
- Final smoke 1 (primed fixture, Brenna: "Give me the sword. I'll take it."): the Narrator narrated receipt ("Brenna takes the sword from Nicco's hands... wraps her fingers around the grip"). The Controller proposed transfer_item handoff to Brenna on the existing id. Authorization accepted (`authorized_narrative_confirmation`, grammar and evidence both true, check `receipt_of_named_item`). Revision 2 to 3, Sword carried by Brenna, owner Nicco.
- Honest limit: the Narrator used the name ("Brenna takes..."), so the Pass B pronoun-after-Markdown path was not exercised live; it is covered offline on the captured live text (Pass B tests). No regression seen.

## 2. Executive verdict
B, hardened with minor limitations. Both final live turns committed; 2962/2962 tests (+34 over Pass B), typecheck and build clean.

## 3. Transfer intent-binding design
If the input resolved to any transfer intent, a proposed transfer must match item, recipient and mode (else `rejected_controller_mismatch`, which no quote completes). Narration decides only completion, refusal or ambiguity. With no transfer intent (NPC steal, reclaim, return, handover) the evidence path is unchanged. Code: `src/turn/command-authorizer.ts` (`index < 0` block). Diagnostics report mode, recipient and item mismatches separately.

## 4. Transfer test results
`tests/transfer-intent-binding.test.ts`, 11 tests, the 10-case matrix (right recipient commits; wrong recipient, wrong item, handoff vs lend and gift vs handoff reject; gift moves ownership; refused; NPC-driven steal and reclaim keep evidence path; lend with a member present) plus the policy-sentence assertion. All pass. One documented behaviour: a grammar-confirmed command stands even when a sibling is rejected.

## 5. Controller policy change
Three sentences added to CONTROLLER_POLICY: (a) a resolved explicit transfer intent binds item, recipient and mode, narration only confirms or refuses; (b) player-authored new objects use create_item only when they become gameplay-relevant, never per embellishment; (c) a concise condition guide (winded, dazed, knocked_down, minor_injury; pain, flinch or attempted blow records nothing). Hash pin in `tests/controller-model-fallback.test.ts` deliberately updated to 1f55b50c3ff9...448d.

## 6. Receipt corpus
`src/dev/receipt-corpus.ts` (22 phrases) + `tests/receipt-corpus.test.ts` (4 tests). Accepted (A, 11): unequivocal take/accept/receive, plus the new "lifts/plucks the sword from Nicco's hand" and "closes her fingers around the offered hilt". Ambiguous (C, 4) and merely-touching or already-held (B, 3): rejected. Refusal or non-completion (D, 4): rejected. Generated adversarial negatives (hedge, negation, wrong subject) all rejected; Phase 1O corpus untouched.

## 7. Receipt verifier changes
Two Nicco-sourced constructions, active only while Nicco holds the item (`NICCO_SOURCED` in `src/turn/evidence-authorization.ts`). Nothing else loosened.

## 8. New item materialization audit
Pipeline player intent, Narrator, Controller, create_item, authorization, prepare, commit works offline end to end. Gates are deterministic: verbatim unhedged quote (max 240 chars) naming a distinctive word of the item; duplicate by normalized name blocked while visible; owner known character; positions carried or stored only. The player's intent layer carries no information about new objects, so the Controller alone decides materialization.

## 9. Rusty sword reproduction
Offline `tests/existing-subsystem-hardening.test.ts` D1-D10: scenery only creates nothing; find+pick up+claim creates one `campaign_item_00000001` carried and owned by Nicco; pick up without claim creates it unowned; hedged, unnamed or over-long quotes create nothing; follow-up "add to inventory" creates no duplicate (nothing proposed, or re-proposal rejected `rejected_already_established`); the same create_item twice in one proposal is deduplicated; an already-tracked sword is picked up with place_item.
Live (final smoke 2): Narrator described the sword; Controller proposed create_item "Rusty sword", owner nicco, carried by nicco; evidence "Nicco's fingers close around the pitted grip of the sword." verified (`materialized_object_named`); revision 1 to 2; carrier and owner Nicco.

## 10. create_item changes
Same-name, same-position duplicate create_item commands within one proposal are collapsed (`src/turn/stages/authorization.ts`). Policy sentence (b). No engine rule for owner or position changed.

## 11. Duplicate-prevention results
Within a proposal: deduplicated (D6). Against state: blocked while an item of the same normalized name is visible (D5, D7, D8). Limitation: two genuinely distinct same-named swords cannot both be visible; a distinguishing name ("Notched rusty sword") works.

## 12. Condition tagging audit
Closed set minor_injury, dazed, knocked_down, winded. Live Pass B E2E2: Narrator wrote "air leaving her in a rush", the Controller chose minor_injury, and the old winded vocabulary did not recognise the phrase. The same CONDITION_TERMS also drive narration-audit `uncommitted_condition` redaction, so any broadening is shared.

## 13. Condition changes
Only `winded` broadened (breath or wind knocked out, air or breath rushing or leaving her/him/them with a rush, struggling or fighting for breath or air, cannot breathe). Adversarial negatives pass (holds her breath, air leaves the room, takes a breath, stops to catch her breath, wind through the hall, cold air). The other three tags unchanged. A wrong tag (minor_injury on a winding blow) is still rejected. No HP, combat or medicine.

## 14. Conflicting command diagnostics
`conflictingCommands()` and `MutationDiagnostic.conflicts` in `src/turn/mutation-diagnostics.ts` (handoff and lend of one item, two recipients, two positions, transfer plus place), derived only; a failed turn can pass `proposal` to get it too. Finding: two transfers of one item to two recipients, both with verified receipts, are BOTH authorized and applied in proposal order (later wins). Nothing blocks it; it is now observable. Not changed (atomicity preserved, no per-command partial prepare).

## 15. Existing subsystem audit
Covered by the full suite (items, inventory, transfer, knowledge, household, relationships, scheduled events, NPC+, identity and secrecy, scene projection, save/load, TurnCoordinator): no failing test, no new nondeterminism found. Findings: (1) conflicting authorized transfers resolve by order (section 14); (2) a `null` owner_id in create_item fails the whole turn at the strict envelope (policy says omit it); (3) create_item owner can come from the player's wording, not only from narration (live 2: owner nicco accepted on a narration that does not state the claim). Tuning ideas, not done: require owner statement in the quote; reject the later of two conflicting commands.

## 16. Next-turn scene continuity
Tests J: after a handoff the next [CURRENT SCENE] shows Brenna with the Sword, owner Nicco; after create_item it shows Nicco with the Rusty sword and is identical after save/load; after a winded commit it shows Maren winded. No transcript dependency.

## 17. Live results
See `live-run.json`. Smoke 1: committed (handoff, grammar+evidence). Smoke 2: committed (create_item). Phase 0: inconclusive.

## 18. Provider call counts
Phase 0: 2 requests. Final smoke: 4 requests (2 Narrator glm-5.2, 2 Controller gpt-6-luna, no fallback, no images, no retries). Total live 6, within the limit.

## 19. Full test results
2962 tests, 2962 pass, 0 fail.

## 20. Typecheck / build
`npm run typecheck` and `npm run build` clean.

## 21. Schema / save impact
None. No save-schema change, no new persisted field.

## 22. Files modified
src/turn/command-authorizer.ts, src/turn/evidence-authorization.ts, src/turn/stages/authorization.ts, src/turn/physical-interaction.ts, src/llm/openrouter/state-controller.ts, src/turn/mutation-diagnostics.ts (new, Pass B, extended); src/dev/receipt-corpus.ts, src/dev/existing-subsystem-live.ts (new); tests: controller-model-fallback (pin), controller-authorization-hardening (adapted), transfer-intent-binding, receipt-corpus, existing-subsystem-hardening (new); docs/architecture/EVIDENCE_AUTHORIZATION.md, this report.

## 23. Known limitations
Same-name distinct items; conflicting authorized commands apply in order; create_item owner can follow the player's wording; the pronoun-after-Markdown path not observed live; only one sample per live scenario (Narrator variance).

## 24. Final verdict
B: hardened with minor limitations.

## 25. Recommendation
Yes, proceed to Weather System V1. None of the limitations blocks it; the two tuning ideas in section 15 can wait for the foundation re-certification.
