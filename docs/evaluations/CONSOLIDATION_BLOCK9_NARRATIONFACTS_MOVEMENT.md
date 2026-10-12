# Consolidation Block 9: NarrationFacts, movement slice

Base: main `45eae19` (block 8). Status: implemented, not committed. Reopened once for the location-claim completion patch (section 11). Wave A9, first slice. Independent of Block 10 (no price, offer or identity facts).

## 1. Baseline grammar inventory (before)
Movement was recognised by several independent readers over the same prose: `character-movement.ts` (`narratedMovements`: carry, walk-with, follow, arrive, lead-in, dash, trace forms), `scene-departure.ts` (completed exits, stairs, broad exits, door-behind, claim and presence readings), a private copy in `narration-audit.ts` (follow/stay reading for the audit) and `scene-participants.ts` / `player-authored-events.ts` (ephemeral exits, `DEPART_ACT`). Authorization and audit each re-read the text with their own subject resolution, so they could disagree on the same sentence.

## 2. Fact schema (`src/turn/narration-facts/`)
Kinds: `entity_moved`, `entity_arrived`, `entity_departed`, `entity_followed`, `entity_stayed`, `entity_moved_with_player`, `entity_present`. Each fact has a span (sentence, clause, offsets, text), a subject (surface, entity id, resolution `name|pronoun|antecedent|descriptor|term|role|player|unresolved`, candidates), modality (`completed|future|conditional|negated|requested|habitual|oriented|retracted|quoted|unrealised`), polarity, confidence, ambiguity (`none|unresolved|ambiguous`) and provenance. Facts are descriptive: they never mutate state and never decide. Consumers act only on completed, non-quoted, unambiguous facts. A per-form gate that fires never yields `completed`. One memoized `NarrationFactSource` per turn is created in the coordinator and handed to both authorization and audit.

## 3. Shadow parity
The extractor was ported verbatim and run online in shadow against the legacy readers across the whole suite: about 116k calls, 0 differences. Only after that did the consumers switch. Deliberate improvements afterwards (each with a test):
- asterisk (RPG) markup no longer defeats implicit follow recognition (real legacy bug; scenario M4 FAILS on the baseline, passes now);
- one shared referent universe, so a bare pronoun that fits two people is ambiguous for authorization and for audit alike (M5);
- the audit now sees a person the engine escorted and then narrated as staying (`contradicts_committed_movement`, M6);
- ephemeral departures are gated like the others.

## 4. Authorization and audit migration
`stages/authorization.ts`, `evidence-authorization.ts`, `turn-evidence.ts` and `narration-audit.ts` take `facts`; policy (destinations, routes, entrants, follower set, descent, departure scope) lives in `movement-evidence.ts` adapters. The audit also receives the pre-turn snapshot to know what the engine moved.

## 5. Deleted legacy grammar
`src/turn/scene-departure.ts` removed; the movement regexes in `character-movement.ts` and the private follow/stay reader in `narration-audit.ts` removed (the file keeps only location helpers: `movableCharacters`, `characterLocation`, `npcPlusEntrants`, `doorDestinationFromPlaces`, `persistentCharactersAt`, `concreteDestination`, `resolvePlayerCarry`). Tests use wrappers in `tests/movement-readers.ts` over the fact path.

## 6. Ambiguity behavior
Unresolved or ambiguous subjects produce facts with `ambiguity != none`; nothing is committed from them and the audit does not guess. Vague plurals and unclear destinations likewise.

## 7. Offline results
Suite 3578/3578 (baseline 3545, +21: 18 in `tests/narration-facts-movement.test.ts`). `npm run benchmark:modern`: 23 scenarios at first closure, 22 PASS, 1 KNOWN PRODUCT GAP (I4 = KPG-1), 0 FAIL (new: M4, M5, M6). Typecheck and build clean.

## 8. Live results (`src/dev/consolidation-block9-live.ts`, evidence `docs/evaluations/consolidation_block9_live/`)
Seeded: a persistent, unnamed woman held by Nicco at the market (stands in for a purchased person). One attempt each, no reroll.
- **C, player explicit destination: PASS.** Nicco at Heartstone, `*he goes back to the slave market*`: narration depicts the market, one `runtime_delta`, player_location = slave market, no duplicate.
- **B, person stays: PASS.** "stay here and wait, then I go to Heartstone alone": she stays, nobody moved, narration and state agree (the narrator did not complete the walk either).
- **A, "Lira, come, let's go together to Heartstone." : consistent, escort not exercised.** Nicco moved to Heartstone (one commit), the narrator never depicted the woman, said "empty of anyone but him"; she stayed at the market. No contradiction, no duplicate. The follow-up "My name is Lira." was narrated into an empty room, so naming was NOT REACHED (the woman was elsewhere).
- **D, player-authored escort "she follows him ... through the door of Heartstone": FINDING (fail).** The narrator wrote "The door closes behind them ... Inside, Heartstone smells of old stone ..." and showed the woman standing in Heartstone. No movement was committed (Nicco and the woman both stayed at the market) and no audit issue was raised. The delivered narration therefore places both in Heartstone while the state says market. The narration never used a motion or arrival verb ("Inside, Heartstone ..."), so no movement fact exists; the extractor was ported verbatim and the baseline reader has the same blind spot (not re-run live on the baseline). This is a presence-by-location-claim gap, not a regression of this block. "My name is Lira." in D was then narrated normally, with no state change (not reached as an identity test).

## 9. Remaining non-movement and movement-adjacent debt
- ~~Location-claim facts (from live D)~~ **CLOSED by the completion patch, section 11.**
- Player-input readers (`resolvePlayerCarry`, player-go, `resolvePlayerTravel`) remain a separate player-intent domain.
- Participation (`absent_participant`) is not yet fact-based.
- Three departure subject-resolution strategies remain inside the extractor (scene vs claim reading, antecedent chains).
- Redaction can leave an unbalanced `*` (pre-existing).
- Rare noun-exit difference: stairs true, broad false.

## 10. Block 10 handoff
Reuse `createFactSource`, `frameOf`, `modalityOf`, `Referent` and the span/modality/ambiguity contract. Add price/offer fact kinds with extractor `"commerce"`, keep policy in adapters, and migrate `trade-price.ts` consumers (authorization and audit) to the same source. Net: `npm run benchmark:modern`.

## 11. Location-claim completion patch
**Original D failure.** The player authored an escort to Heartstone that the travel domain does not resolve. The Narrator wrote "The door closes behind them. Inside, Heartstone smells of old stone ..." with the woman standing there, no motion verb. No fact existed, nothing moved (Nicco and the woman stayed at the market), the audit raised nothing: narration and state diverged silently.

**Fact representation.** `entity_present` with `form: "location_claim"` (descriptive; one extractor, `narration-facts/location-forms.ts`), carrying `location_phrase`, `location_id` (the ONE known concrete location, or absent), subject, modality, polarity, confidence, ambiguity, provenance and span. Forms: adverbial lead ("Inside Heartstone, Nicco ...", "Back at the <place>, Korvin is waiting"), bare "Inside, <place> ..." (viewpoint = the player), predicate ("Tessa stands just inside the entrance", "is/stands/waits/remains ... in/inside/at <place>"), and a place used as the subject of an interior description ("Heartstone's stone walls hold ...", "Heartstone smells of ..."; found by the second live attempt). A relative wording ("just inside the entrance") takes the place the SAME narration establishes, only when exactly one. Future, conditional, negated, requested wording keeps that modality; quoted testimony is blanked by the frame and yields no fact; a pronoun two people fit, an unknown place or an unresolved subject yields no id (nothing is guessed).
**Place resolution.** Injected by the scope (`movementFactScope`): the player-travel complete-label rule (`playerDestination`) or an exact unique label of a location visible to player and narrator. No mention mining, no head-word guessing (a first draft that used `resolveDestination` mapped "entrance hall smells of dust" to a square; replaced and tested).

**Authorization policy.** A claim is evidence, never authority. It cannot move the player (travel authority stays the player-intent domain: `*he goes back to the slave market*` commits from the player's words; the matching claim only has to agree). It supports movement only for someone the existing follow policy already makes eligible (`followers`) whom the prose places at the player's arrival (`characterMovementsFromFacts`). Escort of held people, household and free-person policy are unchanged.
**Audit rule.** After commit, every completed, unambiguous claim is compared with the post-turn state (`movementIssues`): a claim consistent with where the entity ends, or (for exits narrated from the start) with where it began, passes; containers and sub-locations are consistent; anything else is an `uncommitted_movement` issue (revision, then redaction). Same facts as authorization; no private parser.

**Scenarios.** M7 player location claim completes authored travel (1 commit, no issue); M8 escorted held Tessa with claims and no verb (same Tessa moves, no duplicate, no issue); M9 unsupported claim for Nicco audited and withdrawn, nothing moves; M10 two women, "Inside the Main hall, she waits": nobody guessed, nobody blamed; M11 replay of the REAL failing live narration (unnamed held woman, market world): nobody moves, audit flags it, the false sentence is not delivered. Plus 7 unit/source tests (extraction, modality, ambiguity, pipeline, ONE extractor owner, audit and authorization read the same adapter). Benchmark observables `audit_kinds` and `delivered_contains` added.

**Live D rerun (one attempt, no reroll, `result_D.json`; the pre-patch run is `result_D_before_patch.json`).** The patched build was run once on the same shape. RESULT: **FAIL**. The Narrator wrote the interior as "Heartstone's stone walls hold ... The entrance hall smells of dust ... the tower's interior stretches upward", Nicco and the woman both still at the market, no audit issue: no extracted fact (the place was a possessive subject, not an "Inside" form). I then added the place-as-subject form and the strict place resolver and replayed that exact narration offline (M11): the claim is extracted (`Heartstone's stone walls ...`, player, heartstone, completed), the audit flags it, nothing moves, the sentence is not delivered. I did NOT repeat the live run (one-attempt rule). Residual honest limit: sentences that imply the place without ever naming it ("The entrance hall smells of dust", "the tower's interior") produce no claim; the audit removes the sentence that names Heartstone, and with a real revision the Narrator is told Nicco is at the market.

**Final counts.** `npm test`: 3578 tests (3566 before the patch; +12), 3577 on the first run and the single failure was the known flaky `generation lifecycle (player, avatar)`, which passes on rerun (3x). `npm run benchmark:modern`: 28 scenarios, 27 PASS, 1 KNOWN PRODUCT GAP (I4), 0 FAIL. Typecheck and build clean. M1-M6, Block 3 movement, Block 4 reliability, Block 5 lifecycle regressions unchanged and green.
