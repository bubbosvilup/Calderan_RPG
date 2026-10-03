# Household, slave trade and relationship runtime: pass 1

2026-10-01. This was runtime and system work only: no lore was authored and no canon YAML changed. The historical playthrough CSV was used only as a behavioural reference: none of its prose or plot was reproduced, and its outcomes are not hardcoded. Nothing is committed or pushed.

| Gate | Result |
|---|---|
| Typecheck | PASS |
| Deterministic tests | 907/907 (889 before; 18 new in `household-runtime.test.ts` and `household-turns.test.ts`) |
| Playthrough | 25/25 |
| Source hash (`src/`+`data/`) | 1316d51e… → e47ec2deb25a… (data unchanged) |

**Behaviour extracted from the playthrough:**

- **Brenna.** Money went 500 → 495 at the purchase. The status stayed at "Household: 0" for roughly 1,200 lines of care, feeding and conversation. It became 1 only after her own spoken oath, "I, Brenna, decide to stay and become a resident…", with no second transaction.
- **Maren.** The seller said "No papers, no listing". Money went 454 → 451, and the household stayed [Brenna] until Maren's own oath. There was again no second transaction.
- **Rules.** They arose from an explicit player declaration ("Rule number 1: …").
- **Relationship labels.** WARY and UNRAVELING were headlines written in prose, not state.

## A. Existing capabilities found

| Capability | Before this pass |
|---|---|
| Relationships | `RelationshipState` was directional with one numeric `trust` (−100..100); commands `seed_relationship` and `set_trust`. The controller was forbidden trust commands. Relationships never reached the narrator. |
| Money | None (mana only). |
| Legal and social status | None: no free or enslaved status, no holder, no papers. |
| Ownership | Items only (`owner_id` plus `position`). |
| Residence | Character location only: runtime `npc_locations` for canonical NPCs, `current.current_location` for created ones. |
| Household membership | First-class `HouseholdState` with members of status `guest`, `member` or `former_member`, plus a role. The opening creates Heartstone with Nicco as `member`/`owner`. The only commands were a generic `set_membership` and `create_household`. |
| Rules and promises | None. |
| Runtime-created facts | Campaign facts and knowledge edges. |

## B. Domain model chosen

Six separate dimensions. No transition of one ever rewrites another.

| Dimension | Representation |
|---|---|
| Money | New campaign domain `funds: {character_id, gold}[]`. A character without a record has no tracked purse. |
| Freedom / enslavement | New domain `legal_statuses` (see C). |
| Legal ownership | `legal_statuses.holder_id`: a single legal holder, only when enslaved. |
| Residence / current location | The existing location model, unchanged: staying somewhere is just being located there. |
| Household membership | The existing `HouseholdState`, with new explicit `join_household` / `leave_household` commands and `rules`. |
| Interpersonal relationships | The existing `RelationshipState`, extended with qualitative `dimensions`. |

- **Employment and duty.** No existing canon or state required it, so it is not modelled (see O).
- **Starting money.** The opening campaign seeds Nicco's purse with 500 gold (`OPENING_FUNDS`), the historical starting amount. It is runtime state, not canon.

## C. Person legal status and ownership

- **The record.** `PersonLegalState` holds `character_id`, `status` (`free` or `enslaved`), `holder_id` and `transfer {documentation, from_holder_id, transaction_id, note}`.
- **Not an item.** It is a dedicated domain, not inventory: people get no positions, slots or item IDs.
- **Missing records.** No record means the legal status is unestablished; it is never assumed free or enslaved.
- **Papers.** Three values:
  - `documented`: for example "Papers included. Clean transfer, debt-forfeiture chain, no liens";
  - `undocumented`: for example "No papers, no listing";
  - `unestablished`: nobody said either way.
- **Clean papers are never fabricated.** The provenance phrase ("Clean transfer, debt-forfeiture chain, no liens.") is kept as the note.
- **Snapshot validation.** One record per person; an enslaved person has exactly one other holder; a free person has none; transfer references must resolve.

## D. Transactions

- **Commands.**
  - `transfer_person`, with kind `sale`, `gift` or `assignment`, from holder A to holder B, and payment optional depending on kind.
  - `manumit`, which moves a person from enslaved to free.
- **Replay protection.** Both write an immutable ledger entry in the `transactions` domain, whose `campaign_transaction_…` ID cannot be reused.
- **A sale validates, in one preparation:**
  - the transaction ID is new and the buyer, seller and subject exist;
  - the subject is enslaved and held by the seller;
  - the holders differ and nobody holds themselves;
  - the payment is from the new holder to the old one, the price is ≥ 0 and the payer's funds suffice.
  - The expected revision is checked by the existing proposal contract.
- **Atomicity.** Money, holder, papers and the ledger change together at the next revision, or nothing changes, because any failure throws before commit. A payee without a tracked purse receives the coin outside the tracked economy.
- **Where purchases come from (ordering).** Purchases and manumissions are resolved deterministically from the player's input by `person-transactions.ts`, *not* by the LLM controller:
  - A purchase completes an offer the seller already made in authoritative narration, so the player's explicit acceptance or payment is a player-controlled act, like movement through an established connection.
  - The resolver needs:
    - an unhedged acceptance or payment ("Done.", "\*pays him\*", "I'll take her for three gold");
    - exactly one present subject who is enslaved and held by a present seller (named, or the only candidate);
    - one price: the player's stated amount, otherwise the most recent amount in the seller's latest narration, including a bare "Five.".
  - The coordinator prevalidates it through a real `campaign.prepare` **before narration**. The narrator is told the authoritative outcome: the purchase completes with its papers, or it is blocked with the reason (insufficient funds, ambiguity, no price).
  - It commits atomically with the turn. A rejected transaction is dropped with a note.
  - Because the controller cannot propose purchases, a controller retry can never double-charge.
- **Manumission.** It needs explicitly legal wording ("I hereby free you", "you are now a free woman", "grants her her freedom"). "\*frees her from the chains\*" and "you're free to go" are not manumission. Manumission changes only legal status.

## E. Household membership

- **Commands.** `join_household` fails for an existing member. `leave_household` requires a current member and never applies to the keeper.
- **Separation.** Neither changes legal status, money, location or relationships. Membership is never inferred from ownership, location, relationships or authored text.
- **Keeper versus members.** Nicco is represented as the keeper (member with role `owner`). The player-facing household count and list exclude the keeper, matching the historical "Household: 0" and "Household: 1 — [Brenna]".
- **Voluntary.** Membership needs the chooser's own voiced choice (see I). Purchase, care, welcome, "you can stay here tonight" and "I bought you" never qualify, and tests pin this permanently.

## F. Household rules

- **Storage.** `HouseholdState.rules: {id, text, created_revision, active}[]`, with deterministic `rule_N` IDs.
- **Commands.** `add_household_rule`, which rejects an identical active rule, and `set_household_rule_active`.
- **Sources.** Rules are runtime facts that persist through save and load. They are created only from the player's explicit declaration: "House rule: …", "Rule number 2: …" or "New rule: …". "Don't steal my porridge" is not a rule. The historical three-rule declaration extracts three rules.

## G. Relationship model

- **Dimensions.** Eight qualitative ones on a 4-level scale (`none`, `low`, `moderate`, `high`): trust, wariness, affection, protectiveness, respect, fear, hostility and romance. There is no single score and no pseudo-precision.
- **Steps.** `adjust_relationship` moves exactly one step (raise or lower), is bounded (a step past a bound fails) and forbids self-edges.
- **Direction and scope.** Edges are directional, NPC ↔ NPC is supported, and edges are created lazily.
- **Minors.** Romance requires two established adults. `age.ts` is fail-safe: an exact or approximate profile age, a canonical age band, or a stated "N-year-old"; unknown is never adult. The gate applies on adjust, seed and snapshot restore. Protective, trust and family-like relationships with minors are fully supported.
- **Headlines.** WARY, GUARDED, TRUSTING, ATTACHED, HOSTILE, AFRAID and NEUTRAL are *derived* from the dimensions for display; they are not state. "UNRAVELING" is not an engine state.
- **Family roles.** No kinship roles (mother, sister and so on) are assigned mechanically.
- **Legacy trust.** The numeric `trust` is now optional legacy seed data. `set_trust` still works, and narration uses only the dimensions.

## H. NarrativeContext integration

- **The social projection.** `TurnContext.social` contains:
  - Nicco's gold;
  - the legal status, holder and papers of people *in the scene*;
  - households Nicco keeps or belongs to: keeper, members (with away markers), active rules, and present people who are **not** members.
- **Relationship budget.** Edges appear only when both ends are in the scene, Nicco included. They are sorted, capped at 12, and shown with headline and dimensions; remote edges never appear. Members are capped at 15 and rules at 12. Selection is tested.
- **Prompt block.** The narrator receives an authoritative block: "[LEGAL, HOUSEHOLD AND RELATIONSHIP STATE — AUTHORITATIVE]". It states that ownership is not consent, that membership is only what is listed, and that money changes only through committed transactions.

## I. Controller evidence

- **Controller vocabulary.** It gains `join_household`, `leave_household`, `add_household_rule` and `adjust_relationship`, each with one policy line. It does not gain purchases or manumission (see D).
- **What each needs:**
  - **Joins and leaves:** the grammar path (`household_choices`) requires the chooser's own *attributed* dialogue expressing the choice, not hedged, conditional or temporary. Evidence mode verifies the quote against that choice.
  - **Rules:** the proposed text must match a declaration extracted from the player's input, and Nicco must be the keeper.
  - **Relationships:** evidence path only. The quote must be verbatim, match the dimension and direction family (for example shielding for protectiveness, or a voiced "I trust you"), sit in an unhedged sentence, and have the **feeling character** as actor or speaker, referencing the target.
- **Structurally excluded:** Nicco-led sentences, and any change *from* Nicco. The latter is `rejected_command_not_allowed`, because Nicco's feelings belong to the player. So buying, gifting, healing, presence and "we are family" cannot create trust or affection.
- **Audit:**
  - `uncommitted_household`: narration presents a non-member as household or family.
  - `asserts_uncommitted_purchase`: payment or a change of hands is narrated in a trade scene with no committed transaction.
  - The invented-price guard is relaxed only in an active trade negotiation, because asking prices emerge through narration.

## J. Save and load

All new state is part of the version-1 campaign snapshot and survives manual save and load: funds, legal statuses with transfer papers, transactions, household rules and relationship dimensions. Tests cover both a save, serialize and decode round trip and `CampaignState.restore`.

- **Old saves** follow the existing policy: they are dataset-bound and already invalidated by canon changes. The new domains are required fields, and no migration was fabricated.

## K. Historical Brenna regression

A domain regression and an end-to-end coordinator scenario both pass:
- Money starts at 500 and the household is empty, with Korvin holding Brenna.
- The sale commits at 5: money is 495, Nicco is holder and the papers are documented.
- The household stays empty through the move to Heartstone, care and time passing.
- Brenna's own join makes the household [Brenna]. Status output is derived from runtime: "Money: 495 gold … Brenna — enslaved; holder=Nicco; documented transfer … Heartstone Household: 1 — Brenna".

## L. Historical Maren regression

- It starts at 454 with the household [Brenna].
- An unpapered sale at 3 brings money to 451, with holder Nicco and papers `undocumented`; the household stays [Brenna].
- Placement at Heartstone and an explicitly evidenced Brenna → Maren protectiveness step follow; Maren is still not a member.
- Maren's own join makes the household [Brenna, Maren], with money still 451 and no new transaction.
- The resolver eval uses the real negotiation shape ("Ten gold was for three … Three gold. … No papers, no listing"). It reads price 3 and papers undocumented, and does not treat "take the key to free her" as manumission.

## M. End-to-end playthrough result

The coordinator scenario runs through the real turn pipeline with a scripted narrator and controller (no LLM):

- **Market:** inspect Brenna, then the seller's offer.
- **"Done. \*pays him\*":** the engine resolves and prevalidates the sale. The narrator is told "Purchase completes now … 5 gold" and the state becomes 495, holder Nicco, household empty.
- **Heartstone:** a draft calling Brenna "now part of the household" is flagged `uncommitted_household`, and the revision is delivered. The prompt lists her as present but not a member, and still shows 495.
- **Brenna's oath:** the controller proposes the join and a protectiveness step, and both are authorized from her own words. She becomes a member with protectiveness `low`; trust is unchanged.
- **Next turn:** the narrator sees her as a member.

A second scenario checks an unaffordable purchase:

- The purchase is blocked before narration, with the note "has only 2: the purchase cannot complete".
- A narrated payment is reconciled by the audit.
- Money, holder and the ledger are unchanged.

Across both scenarios, no state needed correcting by hand.

## N. Tests

- **`household-runtime.test.ts` (10 tests):**
  - transactions A–H: success, insufficient funds, wrong seller, stale revision, replay, re-purchase, manumission, and a gift from A to B;
  - household A–G;
  - relationships A, B and F–I: minors, unknown age, save and load;
  - both historical regressions;
  - context budget.
- **`household-turns.test.ts` (8 tests):**
  - purchase positives and negatives, the §43 paraphrases, unpapered and ambiguous offers, and unaffordable purchases;
  - manumission evals;
  - household-join positives and negatives: welcome, care, bought, safe, tonight, maybe;
  - rule extraction and authorization (§39 H);
  - strong versus weak relationship evidence (§40 C–E), including Nicco agency;
  - both end-to-end scenarios.
- **A fix to earlier work.** An escape-damage sweep found and fixed a bug from Runtime Continuity Repair 1: the `leave_scene` evidence check compared text with `/s+/` instead of `/\s+/`. A scanner for this failure class (`.build/scan-escapes.cjs`) was added to the workflow.

## O. Remaining limitations and next pass

**Not implemented in this pass:**
1. **Purchasing narrator-invented captives.** A purchase requires the subject to be a persistent campaign character with an established legal record. The historical Brenna was invented by the narrator in the market, so a live run like the CSV cannot yet buy her. The scenario registers her first. **Next pass:** a deterministic promotion of an ephemeral scene participant, triggered by an evidenced purchase, into a created character with a legal record, including a policy for the seller's authority. This is the main gap for real play.
2. **Ordinary purchases do not debit money.** The historical 495 → 494 for clothes is not reproduced. No general commerce was requested, and none was added.
3. **Nicco's own feelings (Nicco → X) are not engine-tracked.** The engine supports them, but the controller is barred for player agency. NPC → Nicco and NPC ↔ NPC are fully supported.
4. **Employment and duty are not modelled.**
5. **Multi-subject purchases** are structurally possible (repeat the command) but not resolved from one sentence. One exact subject per turn is enforced, and ambiguity resolves nothing.
6. **A seller reneging.** A seller who changes the price in the same narration as the player's acceptance is not detected; the prior offer stands.
7. **Gerome.** He is a construct activated in play and not represented in canon or runtime. Household membership accepts any character ID, so Gerome can become a member once registered as a created character. Nothing was forced.
8. **Live validation.** No live LLM run was performed; the controller's recall for the new proposals is untested live.

Items 1 and 8 mean this pass delivers the complete runtime model, but not yet the historical live flow end to end.

HOUSEHOLD / SLAVE TRADE / RELATIONSHIP RUNTIME PASS 1 PARTIAL
