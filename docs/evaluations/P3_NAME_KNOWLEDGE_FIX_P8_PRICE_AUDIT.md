# P3 ? NAME / PLAYER-KNOWLEDGE LEAK; P8 ? PRICE AUTHORITY / ECONOMY AUDIT

## 1. BASELINE

Baseline local commit: `57ea8c3`. User reports P1 formatting now holds across multiple live turns; P1 is provisionally closed. User reports canon-name drift for Bartolomhew, Korvin and Mistress Elara before introductions, and repeated vague prices. These are user observations, not new live measurements. No network/provider calls were made; paid calls: zero.

## 2. P3 EXISTING KNOWLEDGE MODEL

- `src/types/entities.ts` / `src/types/knowledge.ts`: narrator/player visibility, authored NPC-only `known_by`, and public/local awareness classify access, not encounters or introductions. `docs/authoring/AUTHORING_GUIDE.md` explicitly separates eligibility from having encountered an entity; `summary` serves as `public_summary`.
- `src/scene/narrative-context-builder.ts`: present narrator-visible NPCs carry canonical name/display name, appearance, content, traits and a `secret` marker. `src/world/character-contract.ts` marks purpose/morality/personality/affiliations/private notes as narrator portrayal only, not player/NPC knowledge. Scene presence never establishes a name.
- `src/campaign/projections.ts` merges canon identity into profiles. `src/turn/context-builder.ts` projects explicit Nicco knowledge facts and confidential encounters; `src/turn/narrative-authority.ts` separately controls NPC fact use and excludes NPC-private canon from player access. `known_by_character_ids` belongs to mannerism recognition, not general name discovery.
- Campaign knowledge edges have `knows`/`believes`/`suspects`/`heard_rumor` and witnessed/told/inferred/rumor provenance. Existing `create_fact` + `set_knowledge` can persist an established introduction without a second memory system.
- `src/turn/name-establishment.ts` promotes narrator-created named people and names existing unnamed campaign people; it explicitly excludes canonical names from fresh promotion. There is **no dedicated canonical-NPC name-known flag or automatic canonical introduction ledger**. Missing knowledge is not proof of permanent ignorance. No new epistemic database or disclosure-route parser was added.

## 3. P3 LIVE FAILURE MODE

All three sellers have player-visible canon and `known_by: []`; their names, aliases and descriptions enter profiles, scene/market content, presence labels and potentially retrieval. That permits portrayal but does not prove Nicco learned an identity. The previous system rule explicitly allowed a name when "narratively necessary" and mainly discussed incidental background people, leaving canonical names vulnerable to omniscient narration.

## 4. P3 FIX

Replace that one weak system paragraph in `src/turn/prompt-builder.ts` with `NARRATOR_PLAYER_KNOWLEDGE`, interpolated once in `NARRATOR_SYSTEM`:

```text
PLAYER KNOWLEDGE: Use canon internally, but names, aliases, titles, affiliations, hidden roles and personal history are not player-known merely because IDs, profiles, visibility or retrieval expose them. Reveal them only when Nicco has learned them through established player knowledge or an in-world disclosure. Until then describe observable traits or apparent role, never an unknown name with a disclaimer. Preserve identities already established in-world; introduce incidental names through in-world disclosure, not narrative necessity.
```

This is a prompt-contract fix, not output rewriting or deterministic leak detection. Canonical records, appearance and personality remain available internally; established player facts and in-world disclosures remain permitted evidence. Example before discovery: `*A white-blond man with a clerical tonsure turns toward Nicco.*`; after discovery: `*Bartolomhew turns toward Nicco.*`. These are policy examples, not sampled provider outputs.

Limitation: canonical introduction persistence is still provided only by existing explicit knowledge facts or retained dialogue. Dialogue-focused history omits narrator prose and extracts quoted dialogue; standalone unquoted disclosures are not reliably retained there. No history redesign, new route inference or automatic canonical-name establishment was introduced. Prompt compliance still requires a manual live playtest; this change does not guarantee that a model cannot disobey.

## 5. P3 TESTS

`tests/p3-player-identity.test.ts` has six deterministic checks: all three unknown canon NPCs have no player-known identity facts despite internal profiles; appearance/personality remain; an authoritative told-name fact survives without history; an existing retained introduction remains usable; aliases/title/affiliation/history are controlled by the single rule and portrayal authority; known records are unmutated and the exact P1 rule remains once on initial/later requests. These test contract/evidence availability, not model obedience. Updated the old guardrail test in `tests/narrator-persistence.test.ts` to remove its obsolete narrative-necessity permission. Golden trace changes are only five system-prompt strings and five corresponding character counts.

## 6. P8 CURRENT ECONOMIC MODEL

Repository audit covered prices/pricing/cost/value, currencies/funds, auction/bids, sales/purchases/captives, transactions/legal state and reconciliation/redaction across `data`, `src`, `tests`, documentation and historical playthrough references. Historical examples/fixtures are not authored price tables.

| Question | Finding and authority |
|---|---|
| Currency/economic units | Tracked economy is integer **gold** (0..1,000,000,000), `FundsRecord` and `PersonTransaction.gold` in `src/campaign/types.ts` / `validation.ts`. The grounding detector recognizes copper/silver/crowns/marks and other denominations to reject inventions; that vocabulary is not a supported currency/exchange system. No conversion rates or denomination tables found. |
| Nicco funds | Authoritative starting purse **500 gold**, `src/campaign/opening-state.ts`; exposed as `context.social.nicco_gold` and narrator "Nicco's money". Runtime saves and transactions persist funds. |
| Generic goods/services | Qualitative only: Gatherer's Inn moderate; Daily Grind low/lower-middle; Blackiron practical/lower-middle. Merchant canon describes price expertise, not numerical catalogues. No numeric goods/service tariffs found in loaded YAML canon. |
| Captive price model | **Absent**: sellers have specializations, with no numeric asking prices or valuation tables. No authored ranges/formula by labor, training, health, species, rarity, age, seller or legality. Korvin's under-twelve restriction and seller niches are not valuation formulas. |
| Narrator price proposal | Gold asking prices can survive the audit when a captive negotiation is recognized; otherwise unsupported numeric prices are flagged. A seller claim is not payment, consent or a completed transaction. The system prompt is stricter than this exception. |
| Persistence/controller | No structured offered-price/agreed-price quote domain. Recognized latest narrator offer + explicit player acceptance/payment can derive a validated `transfer_person` proposal; an unambiguous player amount takes precedence. `src/campaign/legal.ts` atomically commits paid gold, holder, documentation and immutable transaction provenance, rejecting insufficient funds and replay. Controller uses existing schema/evidence; its inability to commit an invented quote is not the main cause. |
| Concrete pricing tests | `tests/household-turns.test.ts`: seller's latest "Five", acceptance ? five-gold sale, balance 500?495; explicit player amount; ambiguous/insufficient offers blocked. `tests/household-runtime.test.ts`: atomic sales, funds, replay and wrong-holder checks. These prove transaction resolution from supplied offers, not price discovery or balancing. |

## 7. P8 AUCTION / PRIVATE SALE PATH

`data/locations/calderan/west/calderan_slave_market.yaml` authors daytime formal auctions, direct private purchases, clerks/papers and seller specialties; the three named sellers do **not** operate the public auction. There is no auction lot/bid state: opening bid, increments, current bid, reserve and final auction result are **absent**. A validated person-sale ledger can record a paid final amount, but does not implement an auction.

Private seller price state is **partial**: no durable asking-price field; an ephemeral seller offer is read from latest finalized conversation by `src/turn/person-transactions.ts`. Payment becomes authoritative only after explicit acceptance, subject/seller authority resolution, legal/funds validation and one commit. Asking price, player offer and final paid price are therefore distinct stages, though asking/agreed quotes are not independently stored. Generic item/service purchases have no equivalent numerical catalogue/auction bridge found.

## 8. P8 PRICE TODO / REDACTION ANALYSIS

Exact TODO test: `tests/narration-survives-audit.test.ts`, **"KNOWN over-redaction: a seller's price for an unnamed narrated captive is flagged as an invented price"**; TODO annotation: **"trade_negotiation requires a recorded legal state"**. It first narrates a thin girl behind bars, then expects `The slaver shrugs. "Three gold for the girl. No papers."` to survive unchanged.

Actual path: `createNarrationAuditor` (`src/turn/stages/audit.ts`) ? `auditNarration` (`src/turn/narration-audit.ts`) ? `groundingIssues` (`src/turn/grounding-audit.ts`) ? `invented_price` ? one revision ? redaction if revision still fails. Unsupported number+currency phrases receive "Say it qualitatively ... never name a number of coins." Support comes from serialized state/retrieval or current player text, not arbitrary previous asking-price prose alone.

The TODO helper `deliveredAs` creates a **new coordinator for each call**, losing the prior girl/cage history. Current `auditNarration` already recognizes (1) enslaved subjects with present non-Nicco holders, (2) promoted narrated captives without legal records, and (3) unregistered narrated captives recovered by `readScene`. Thus its annotation describes an older/narrower guard than today's code. Relationship to current UI: **PARTIALLY RELATED**. The UI retains one coordinator/history, so recognized captives need no legal record for the gold exception; an unrecognized subject, omitted/evicted history or prose-only auction can still hit the same price guard. The four TODOs remain unchanged.

`tests/p8-price-authority-audit.test.ts` proves: the historical price phrase is flagged without history and accepted with the prior captive history; ordinary unsupported exact prices are forbidden while recognized trade gold passes; unsupported auction opening price is flagged but supplied authority passes.

Additional compatibility finding (**G**): `narrated-captives.ts` attributes dialogue through quotation marks; `person-transactions.ts` requires seller-attributed offer units for narrated subjects. A fourth audit check contrasts attributed quoted `Three gold for the girl` with standalone unquoted RPG dialogue, which lacks a speaker. The older legally-recorded-subject resolver can also read explicit number+gold without quote attribution, so this is not a universal price ban. Bare unquoted "Five." is less supported than the quoted form. P1/history/transaction parsers were not changed or reopened.

## 9. P8 ROOT CAUSE

Primary **A + E + F**: numerical pricing data is absent, the prompt explicitly commands qualitative prices unless already supplied, and auctions have no numerical bid state. Conditional **D**: unrecognized trades trigger `invented_price`, revision and possible redaction. Additional **G**: quote-dependent speaker/offer parsing can lose standalone RPG dialogue attribution. **B** is not supported: no authored numeric price table exists to expose. **C** is not the primary blocker: validated completed transaction prices already persist; quote-state persistence is missing but distinct from inability to record payment.

Likely explanation for the user's vague prices: the model obeys the exact system sentence `Prices: never state an exact price or number of coins unless canon, state or the player's own words supply it; describe cost qualitatively (cheap, modest, fair, more than usual).` Its recognized-trade audit exception is not communicated in that sentence. This is a code-based inference, not proof about any unseen live response. No actual draft was examined to establish whether a particular response was revised/redacted.

## 10. P8 RECOMMENDED NEXT STEP

Design a separate, bounded seller-quote authority contract: explicitly distinguish a provisional seller asking price from a player offer, agreement, and validated payment. Decide whether asking prices may be narrator-generated or require authored values, then align prompt/audit policy for the existing recognized captive-trade exception. Test role/subject attribution with current unquoted RPG dialogue before relying on it for purchases. Design any persistent quotes or auction model separately; no automatic economy, price tables, formula or auction implementation belongs in this audit. No tiny data-wiring bug was found. **Pricing code changed: NO.**

Manual P3 check: approach each seller without naming them; ask descriptive questions for several turns; verify no name/alias/title/hidden history disclaimer leak, then obtain an in-world introduction and verify normal name use. For a persistence check use an existing authoritative name knowledge fact; automatic canonical introduction storage is not promised.

## 11. VALIDATION

`npm run typecheck`: PASS. `npm test`: 2,036 passed, zero failures, four existing TODOs preserved. `npm run test:playthrough`: 25/25 passed. Focused P3/P8/P1/UI suite: 16/16 passed (P3: 6/6; P8: 4/4). Golden fixture checks passed; only system rule/length changes verified. Node test-process permissions were approved to run these offline suites. P1's exact format rule/opening and provider/model/route/sampling configuration are unchanged. No debt register or D-number changes. Changed files: `src/turn/prompt-builder.ts`, `tests/p3-player-identity.test.ts`, `tests/p8-price-authority-audit.test.ts`, `tests/narrator-persistence.test.ts`, `tests/golden/turn-pipeline.json`, and this report. Local commit only; no push.
