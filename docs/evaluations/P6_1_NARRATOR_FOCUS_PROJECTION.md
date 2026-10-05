# P6.1 narrator foreground/background projection

## 1. BASELINE

Baseline commit: `3056beb` (P3.1 identity gating). The existing P6 audit demonstrated that three private sellers were present in the same coarse market location and repeated across rich character records, presence, social labels and market lore. This task implements narrator attention; it does not repeat that audit or claim live model verification.

**Engine scene truth is unchanged.** Scene RAM, raw TurnContext, controller evidence, world canon, character locations and campaign schema are unchanged. No persistent focus flags, sublocations or roster eviction were added. Production changes are confined to `src/turn/narrator-focus.ts` and narrator prompt assembly.

## 2. EXISTING FOCUS SIGNALS REUSED

- Current input, existing resolved-reference IDs and intent command recipients/counterparties.
- Existing physical interaction actor/target IDs and non-negated player-authored event evidence.
- Projected character movement IDs and carried-item holders participating in a transfer.
- Existing scene participant addressed/focus IDs, where they refer to an eligible canonical actor; temporary participant state and expiry behavior are untouched.
- Existing NPC+ addressed Tier B selection; canonical importance, mere membership and NPC+ Tier C presence do not grant foreground status.
- Recent finalized player turns, bounded by the existing `INACTIVE_EXPIRY_TURNS` constant (two). Narrator roster exposition never counts as a focus signal.
- The existing unique-partner convention for second-person speech; sole-partner greetings and explicit pronoun interactions also select that partner.

The minimal additional matching is input-only: stable IDs, primary names/aliases and gated NPC references, plus uniquely matching observable appearance terms in explicit look/inspect/address/approach clauses. An ambiguous reference such as “the man” selects nobody. A direct question about private sellers/slavers can select the relevant present group. This does not establish name knowledge or authorize a state change.

## 3. FOREGROUND / BACKGROUND CLASSIFICATION

Classification is deterministic and binary, preserving authoritative character order. Current targets take precedence. When no current target or attention shift exists, the most recent explicit player target within two finalized turns supplies continuity. Looking/moving/joining/waiting elsewhere clears earlier focus, including within the same coarse location; that shift also blocks resurrection by a later generic follow-up.

Foreground canonical actors retain rich portrayal. Every other eligible present canonical NPC receives compact background presence. Player and campaign-created character handling remains intact. There is no arbitrary foreground count cap or relevance inferred from canonical importance. No auctioneer, clerk or lot is invented when no such actor/state is represented.

## 4. NARRATOR PROJECTION

Foreground records retain gated identity, full observable appearance, personality/portrayal, current state and profile overrides. The duplicate baseline appearance is omitted because the identity already carries that exact appearance; dynamic structured profile appearance is retained.

Background entries appear inside `[PRESENT AND ABLE TO REACT]`, under `[BACKGROUND PRESENT]`, with `internal_id`, permitted primary name or null, one stable observable label, up to 160 characters from authored observable appearance, and `present:true`. Confidential encounters retain a nondisclosure marker. Full profiles, personality, private notes and biographies are omitted from these entries.

**Background actors can still become relevant and react.** The existing “any may react; none must” policy is retained, and the compact roster expressly permits causally relevant reactions. Addressing, inspecting, a valid actor/target signal or existing NPC+ addressed selection restores rich material on the relevant turn. There is no prohibition on mentioning background actors and no post-generation removal of NPC mentions.

## 5. DEDUPLICATION

| Path | Background treatment |
| --- | --- |
| Baseline/profile/portrayal | Rich character line omitted; compact roster entry emitted once. |
| Presence roster | Compact entry replaces the separate named roster line. |
| Social, legal, relationships, households | Authority retained, using stable IDs instead of repeated descriptive labels. |
| Character knowledge permissions | All character permission rows retained with background IDs; no knowledge grants widened. |
| Private canon | Background-only private records withheld from narrator input; shared foreground records remain. Raw context/controller knowledge is unchanged. |
| NPC+ | Background-owned fragments/recovered lines withheld; foreground material retained with incidental background references replaced by IDs. Empty sections omitted. |
| Location/ancestry/features | Seller-specific sentences omitted from narrator lore when the sellers are unrelated background; other local canon remains. Numeric coin/price sentences are retained. |
| Retrieved material | Background-owned entity records withheld from the narrator copy, and incidental background biography sentences filtered. Stable identifier fields remain. Retrieval services, results used by engine/controller and search architecture are unchanged. |
| Compaction | Registered source units come from the focused, identity-gated narrator projection, so reconstruction cannot restore withheld background biographies. |

Foreground strings use internal references for incidental background actors rather than repeating their observable labels. Necessary campaign facts, legal ownership, transfer documentation, money, household membership/rules, relationships, equipment and character-use restrictions remain supplied. Historical dialogue and player action evidence are continuity, not duplicated static profiles; they are not censored.

## 6. P3.1 INTERACTION

The existing identity gate is applied after focus selection and to rich foreground strings, knowledge access and final narrator input. Unknown background actors have null name fields and compact observable labels. Unknown foreground actors receive full appearance/personality without a canonical primary name or undisclosed alias. An authoritative name grant still makes the learned primary name available in foreground. Focus matching a name or alias does not grant knowledge.

P3.1 helpers and persistent knowledge representation are unchanged. Earlier rich-portrayal tests now explicitly focus their subjects; new tests separately cover unknown background actors. P1 format and player-knowledge system rules remain unchanged and occur exactly once.

## 7. PROMPT SIZE BEFORE / AFTER

Local scenario: production world data, opening campaign moved to `calderan_slave_market`, world minute 600; input `*waiting for the AH to start*`; no retrieval or recent conversation. Before was measured on baseline `3056beb`, after using the same deterministic construction.

| Measurement | Before | After |
| --- | ---: | ---: |
| Total narrator user-message characters | 19,234 | 10,031 |
| Three seller character-entry payload characters | 8,822 | 723 |
| Bartolomhew projected label occurrences | 15 | 1 |
| Korvin projected label occurrences | 12 | 1 |
| Mistress Elara projected label occurrences | 11 | 1 |

Seller payload is the sum of the three serialized rich character lines before versus the three compact roster lines after, including two separating newlines. It is not an estimate of every incidental seller-related sentence. Label counts cover the entire user message and count repeated metadata as well as prose. System prompt is unchanged. No arbitrary percentage target was used.

## 8. TESTS

Sixteen deterministic P6.1 tests cover all sellers remaining engine-present; auction/look/wait background classification; one compact label each; unique observable and direct address promotion; ambiguous references; bounded recent focus and expiry; attention shifts without movement; no focus from repeated narrator exposition; intent/physical/event/movement targets; known and unknown identity behavior; retrieval and compaction bypasses; legal/permission retention; targeted seller-group questions; NPC+ background suppression and existing addressed-tier reuse; unchanged P1/P3 rules and P9 no-op waits.

Relevant existing assertions now distinguish compact presence from rich foreground, use explicit subjects in portrayal tests and stable IDs in background permission/provenance references. Compaction tests explicitly focus the private-knowledge holder so they still exercise all seven epistemic/private units rather than an unrelated background record. Four existing TODOs remain unchanged.

Validation:

- `npm run typecheck`: passed.
- `npm test`: 2,069 total, 2,065 passed, zero failures, four TODOs, zero skipped.
- `npm run test:playthrough`: 25 passed, zero failures.
- Focused P6.1/P3.1/P6-P9 run: 29 passed (16 + 9 + 4).
- Golden pipeline: six passed. Comparison with baseline changes only seven narrator message-content paths; engine state, controller envelopes, commands, audit outcomes and all other trace fields remain identical.
- Provider/model/sampling configuration, P1 system contract, pricing/transactions/quote/bid authority and wait/event runtime sources unchanged. No provider/network calls. Local commit only, no push.

## 9. LIMITATIONS

This reduces narrator context weighting; it does not guarantee a particular model response. Observable matching is deliberately conservative and lexical, without full synonym or natural-language interpretation. Background portrayal is sparse until an available signal promotes it. An autonomous actor's future reaction cannot be predicted before generation; compact presence still permits that actor to react, and later valid targets restore rich context. Temporary participants keep their separate existing lifecycle; no new campaign attention system was added.

The narrator copy omits entire background-specific lore sentences, including mixed seller catalogues; it is not a general semantic summarizer. Explicit seller questions recover rich relevant context through foreground selection. Other canon, pricing authority and raw retrieval/controller evidence remain authoritative. Name inference/hallucination remains a live-verification concern already documented for P3.1.

**P9 remains open:** event-directed waits still supply no time delta; no wait-until, auction lifecycle, scheduler or automatic advancement was added. **P8 remains open:** pricing, seller quote authority, bids and transactions were not repaired here.

## 10. MANUAL LIVE TEST PLAN

Use GLM manually after this offline task; no live calls were made here.

1. Start an undiscovered-name market encounter. Move toward the public auction, look around, join the bidding area, then wait. Check that unrelated private sellers are not repeatedly reintroduced and names stay gated.
2. Look toward the white-blond seller. Check that rich observable portrayal becomes available without revealing Bartolomhew or The Redemptor.
3. Continue a short interaction, then walk back to the auction within the same canonical market location. Check that seller descriptions become background again, including on a subsequent generic follow-up.
4. Establish a name through an authoritative grant and address that seller. Check normal learned-name use without alias disclosure.
5. Trigger a salient event involving a seller and observe background reaction capability without invented companions or changes to canonical presence.
6. Retest repeated auction waits and price negotiation separately. Do not interpret reduced exposition as a P9 or P8 fix.
