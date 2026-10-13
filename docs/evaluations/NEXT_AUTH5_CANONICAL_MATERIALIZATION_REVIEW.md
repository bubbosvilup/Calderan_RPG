# AUTH-5 and canonical materialization review

Status: analysis only, 2026-10-13. Read on main `7e5e4ea` plus the uncommitted documentation reconciliation. Nothing was implemented, built or executed for this review. Every behavior claim below comes from a static reading of the code at the cited `file:line`. Where an existing test pins a behavior, the test is cited, but it was not re-run here. Anything not pinned by code or a test is marked **inferred**.

Scope: AUTH-5 (`characterForUpdate` creates an implicit canonical-origin campaign record) and the findings tied to it: ID-8 = NPC-3 = F8 = decision D5, and AUD-1 (the person Actual Offer plan does not apply the reserved canonical-handle rule). Register rows: [Master debt register](../MASTER_DEBT_REGISTER.md) (AUTH-5 in section 3, ID-8 in section 6, NPC-3 in section 7, AUD-1 in the residual table, D5 in section 16).

Vocabulary, as in [Architecture](../ARCHITECTURE.md): PROVISIONAL -> PERSISTENT is **materialization**. Campaign NPC -> NPC+ is **promotion** (the Heartstone rite). `premium_*` is the legacy code name of NPC+. A **canonical-origin record** is an entry of `CampaignSnapshot.characters[]` whose `origin.kind` is `"canonical"`. It overlays campaign state on an authored character and does not copy lore.

Summary of the verdicts:

| Item | Verdict |
| --- | --- |
| AUTH-5: implicit canonical-origin record | **Confirmed.** One production path reaches it for a canonical NPC: a Controller `set_condition` with verified physical evidence. An existing test pins it (`tests/authority/live-npc-handover.regression.test.ts:281-292`). The same primitive also creates and maintains Nicco's own record, and a test relies on that. |
| That record makes the NPC look like a Campaign NPC | **Confirmed.** The UI tier flips from `world_canon` to `campaign_npc` (`src/app/character-capabilities.ts:39`). The rite eligibility check then treats the NPC like any campaign character (`src/campaign/heartstone-rite.ts:37-38`). |
| That record makes the NPC promotable to NPC+ | **Latent, not reachable in production today.** The rite also needs the NPC inside the Heartstone interior (`heartstone-rite.ts:45`). No production path can move a canonical non-NPC+ NPC there. The domain layer and a test fixture can (`tests/npc-plus/explicit-promotion.test.ts:38-46`, `:74-85`). |
| D5 | **Answered de facto, while still OPEN in the register.** [Heartstone](../HEARTSTONE.md) line 42 and test P2 say a canonical NPC with a campaign record qualifies for the rite. [Current state](../CURRENT_STATE.md) line 61 says a canon NPC has no campaign record and no NPC+ tooling. |
| AUD-1 | **Confirmed statically, not confirmed by execution.** `src/turn/commerce/person-offers.ts` never calls `claimsReservedHandle`. A concrete input class passes the earlier scene-reading filters and reaches materialization: a described captive or seller who introduces themself with a single-token canonical alias ("Elara", alias of Mistress Elara) or with a full canonical alias ("Doran Hale", which establishes "Doran"). The gap is narrower than the audit text says, because exact canonical names and mononyms are already filtered earlier. |

---

## 1. Observed current behavior

### 1.1 The primitive

`characterForUpdate(context, id)` (`src/campaign/preparation.ts:11-20`) resolves the id through `CampaignIdentityResolver.character` (`src/campaign/identity.ts:14-21`). The resolver returns the campaign record's origin when a record exists. Otherwise, for any authored world entity of type `character`, it returns `{ kind: "canonical", canonical_entity_id: id }`. If the draft has no record, `characterForUpdate` pushes `{ id, origin, profile: {}, current: {} }` into `draft.characters` (`preparation.ts:15-18`). It refuses only retired records (`:14`). There is no check on who the canonical id is (player or NPC) or on why the record is needed.

The record is created inside the private preparation draft. It reaches state only if the whole preparation succeeds and the receipt is committed (`src/campaign/campaign-state.ts:56-76`, `:139-149`).

### 1.2 Callers and whether production reaches them for a canonical NPC

| Caller | Location | Production producer of the command | Reaches a canonical NPC with no record? |
| --- | --- | --- | --- |
| `set_profile` | `src/campaign/characters.ts:46-49` | Late naming (`src/turn/identity/name-establishment.ts:56`) and the NPC+ appearance editor (`src/app/game-session.ts:646`) | **No.** Late naming reads `snapshot.characters` and needs an existing unnamed record (`name-establishment.ts:50-51`). A canonical NPC in the turn context always carries its authored name (`src/campaign/projections.ts:19`), so the scene reading never reports it as unnamed (`src/turn/narration-facts/scene-identity.ts:203-207`). The editor targets existing records only (`game-session.ts:637`). |
| `set_condition` | `characters.ts:50-56` | The Controller (`src/llm/controller-schema.ts:28`) | **Yes.** See 1.3. Pinned by `tests/authority/live-npc-handover.regression.test.ts:281-292`: Korvin is placed by `runtime_delta` with no record (`:32-35`), and after a verified punch the snapshot holds a `korvin` record with `conditions: ["minor_injury"]`. |
| `set_slot_knowledge` | `characters.ts:87-94` | **None.** It is a domain command only (`src/campaign/validation.ts:239`) and is not in the Controller vocabulary (`controller-schema.ts:17-44`). Only tests and dev fixtures use it. | Domain-reachable only. |
| equip into a slot (`place` next) | `src/campaign/items.ts:22-26` | Player `/equip ... for <target>` (`src/turn/player-intent.ts:84-87`) and Controller `place_item` | **No.** The authorizer refuses equipping onto anyone other than the current holder (`src/turn/authorization/command-authorizer.ts:115-116`). For a non-placement `place_item` it requires the item to be owned and held by Nicco (`:127`). So only Nicco can be equipped. |
| unequip from a slot (`place` previous) | `items.ts:18-21` | Any `place_item` or `transfer_item` that moves an equipped item | **No.** No production path leaves an item equipped by a canonical NPC: `create_item` cannot equip (`items.ts:40`), opening items are carried by Nicco (`src/campaign/opening-state.ts:33-34`), and the equip path above is Nicco-only. |
| `move_character` on a created character | `characters.ts:59` | Controller and derived movement | Not a creation path: a created origin implies an existing record. A canonical target goes to runtime locations (`:60-65`). |

The same primitive creates **Nicco's** canonical-origin record the first time Nicco equips or unequips something or receives a condition. `tests/authority/live-npc-handover.regression.test.ts:140` asserts `characters.find(c => c.id === "nicco").current.empty_slots` equals `["feet"]`. So the player record is load-bearing. Nicco is excluded from promotion (`heartstone-rite.ts:36`) and from NPC+ (`src/campaign/snapshot-validation.ts:171`).

An explicit canonical registration also exists. `register_character` accepts `origin.kind === "canonical"` when the id equals the canonical id and the record has no location (`characters.ts:15-17`, `identity.ts:38-43`). No production code emits it. Only tests and dev fixtures do (for example `tests/npc-plus/explicit-promotion.test.ts:43`, `src/dev/support/turn-fixture.ts:50`).

### 1.3 Exact call path: Controller `set_condition` on a present canonical NPC

1. `TurnCoordinator.runTurn` asks the Controller for a proposal after one complete narration (`src/turn/coordinator/turn-coordinator.ts:257`). The vocabulary allows `set_condition` with a conditions array (`controller-schema.ts:28`).
2. Authorization (`turn-coordinator.ts:268`, `src/turn/stages/authorization.ts`). The command authorizer accepts the shape only when the target is present, physically involved this turn, the change is additive, and every added tag is one of `minor_injury`, `dazed`, `knocked_down`, `winded` (`command-authorizer.ts:53-61`, `src/turn/authorization/physical-interaction.ts:8-10`). It then returns `rejected_insufficient_confirmation`, which only verified Controller evidence can lift in hybrid mode (`src/turn/authorization/evidence-authorization.ts:213-223`, `:425`).
3. `assembleTurnCommands` puts the authorized command into the batch (`turn-coordinator.ts:275`).
4. Final preparation: `campaign.prepare({ expected_revision: base_revision, commands })` (`turn-coordinator.ts:279`) -> `prepareCampaignChange` (`campaign-state.ts:56`) -> dispatcher (`:63-66`) -> `prepareCharacterCommand` (`characters.ts:50-51`) -> `characterForUpdate` pushes the canonical-origin record (`preparation.ts:15-18`).
5. `syncPremiumCharacters` runs on the draft (`campaign-state.ts:74`). For a non-member it does nothing.
6. `finishPreparation`: `characters` belongs to the authoritative partition (`src/campaign/optional-state.ts:59-63`), so the revision moves by one (`campaign-state.ts:84-86`). The snapshot is validated, and a canonical-origin record without a location is valid (`snapshot-validation.ts:44-47`).
7. `prepareCommit` re-prepares the batch with identity and offer additions (`turn-coordinator.ts:312`, `src/turn/stages/commit-preparation.ts:70-99`). The record is part of every re-preparation.
8. `campaign.commit(plan.receipt)` (`turn-coordinator.ts:328`). The record is now durable.

Once created, the record cannot be removed. No command deletes a character, and the repair path refuses to retire a canonical identity (`src/campaign/character-repair.ts:29`).

### 1.4 What the record changes after commit

| Consumer | Behavior | Evidence |
| --- | --- | --- |
| Character view | The overlay is merged over canon. With an empty profile the name and lore are unchanged. Conditions now show. | `projections.ts:12-22` |
| UI tier | `has_campaign_record: !!record` -> tier `campaign_npc` instead of `world_canon` | `src/app/player-character-view.ts:169-171`, `:233-234`; `src/app/character-capabilities.ts:5-8`, `:39` |
| Promotion capability | Computed for every record that is not NPC+ (`record && !npcPlus`). The card now carries a promotion state, usually the refusal "The character must be inside Heartstone to complete the rite." | `player-character-view.ts:234`, `character-capabilities.ts:45-46`, `heartstone-rite.ts:23-31` |
| Rite eligibility | Passes the record gate. Still needs: not NPC+, Heartstone household with Nicco as Keeper, active, inside the Heartstone interior | `heartstone-rite.ts:35-47` |
| Rite completion | `completeHeartstoneRite` looks the target up in `snapshot.characters`, so only a record can be promoted. It then commits one `join_household`, and NPC+ derives from it. | `game-session.ts:404-423`, `heartstone-rite.ts:50-53`, `src/campaign/premium-characters.ts:182-197` |
| NPC+ developments | Condition developments of an NPC+ are read from the campaign record (`characters.find(...).current.conditions`). An authored NPC+ without a record cannot record conditions. | `premium-characters.ts:113-116` |
| Canon removal on load | An NPC known only through `runtime.npc_locations` can be dropped with a warning if canon removes it. Once it also has a record, removal blocks the load with `reference_invalid`. | `src/persistence/canon-compatibility.ts:87-92` |
| Keep track, name establishment | Not affected. A canonical NPC present in the scene is a known person, never a provisional one (`scene-identity.ts:208`; `src/turn/identity/keep-track.ts:81`). The implicit record has no `profile.name`, so it does not join the "same name already persistent" set (`keep-track.ts:97`). | |

### 1.5 Promotion path (NPC+) for a canonical NPC

Domain level: `join_household` accepts any resolvable character id, including a canonical id with no record (`src/campaign/social.ts:57-64`). `syncPremiumCharacters` then creates the NPC+ record for any current member of a household Nicco keeps, whatever the origin (`premium-characters.ts:10-13`, `:186-192`). So at domain level a canonical NPC can become NPC+ **with or without** a campaign record.

Production gates:

- The Controller cannot do it. A `join_household` into the household Nicco keeps is `rejected_command_not_allowed` (`command-authorizer.ts:96-98`).
- The only production promotion is the player's rite confirmation, which needs a campaign record (`game-session.ts:413-414`, `heartstone-rite.ts:37-38`) **and** the character inside the Heartstone interior (`heartstone-rite.ts:45`, `src/campaign/heartstone-recognition.ts:74-79`).
- A canonical non-NPC+ NPC cannot be brought inside Heartstone by any production path. The Controller's `move_character` is refused for canonical NPCs that are not active NPC+ (`command-authorizer.ts:66-68`). The narrated-movement and follow sets contain created characters and active NPC+ only (`src/turn/movement/character-movement.ts:38-48`, `:63-70`; `src/turn/movement/follow-candidates.ts:24-44`). No authored character starts inside Heartstone: only `data/characters/player/nicco.yaml:36` mentions it, with `heartstone_square`, which is outside. The developer teleport `/api/location` moves Nicco only (`src/ui/server.ts:143-147`).

So AUTH-5 creates the record that the rite treats as eligibility. The location gate is what keeps a canonical NPC from promotion today. That gate is incidental, and Property/Heartstone work (canonical visitors, invitations, workers) would remove it. The post-cleanup audit says the rite is "then reachable" ([A9](post_cleanup_audit/A9_REGISTER_RECONCILIATION.md), "Claims contradicted by code" item 1). That holds at domain level only. In production it is latent.

Authored-NPC+ branches already exist for the case where a canonical NPC is NPC+: movement (`command-authorizer.ts:66-71`), departure to OFF_SCENE (`:76-85`) and entrants (`character-movement.ts:63-70`). The register calls them test-only (NPC-3). That matches the static reading above.

### 1.6 Interaction with canonical identity binding (identity hotfix `d4e9e22`, offer fix `c0608a6`)

- Foreground canonical binding (`src/turn/identity/foreground-binding.ts:7-23`) is session-local continuity. It never writes the campaign. It binds a narrated description ("the short man") to a present canonical id, and it creates no record.
- Its effect on AUTH-5 is indirect (**inferred**). Binding makes the canonical id the conversation partner the Controller sees, so physical acts on "the man" resolve to the canonical id. A verified `set_condition` then creates the implicit record (1.3).
- The partner-conflict guard (`src/turn/identity/partner-identity-guard.ts:14-28`) stops name establishment from creating a person when the bound canonical partner introduces themself under another name (`name-establishment.ts:61-62`). The person-offer reader does not receive this guard (`commit-preparation.ts:92`). It relies on the scene reading's speaker binding instead (`scene-identity.ts:113-121`, `:141`, `:209`). The current exchange that `prepareCommit` appends carries no `conversation_partner_id` (`commit-preparation.ts:91`), so binding there depends on an earlier exchange having recorded the partner (**inferred**, see R20 in section 8).
- Canonical name disclosure (`commit-preparation.ts:75-76`) writes only knowledge facts (`learnCanonicalName`) and never a record. Test 3 of `tests/identity/canonical-name-reservation.regression.test.ts:93-101` pins this.
- `c0608a6` made the person offer bind the same subject across supersession and materialize on Accept (`person-offers.ts:334-341`). It did not add reservation (1.8).

### 1.7 Interaction with Keep track and name establishment

- **Keep track** (`GameSession.keepTrack`, `game-session.ts:599-620`; `keep-track.ts:71-128`) always produces an origin `created` record through `materializeProvisional` (`src/turn/identity/provisional-people.ts:73-78`, `src/campaign/materialization.ts:35-47`). Canonical NPCs are never listed (`keep-track.ts:81`). A reserved canonical name or alias is refused (`:98-110`). Keep track reads identity facts from **every** recent narration of the scene (`:99-100`). It never produces a canonical-origin record.
- **Name establishment** (`name-establishment.ts:36-78`) applies the reservation to late naming (`:54`) and to the provisional reading (`:64`). It reads identity facts from the **latest** narration only (`:44-46`). It cannot target a canonical record (1.2).
- Neither path interacts with AUTH-5 except through the shared rule that a canonical NPC is never provisional.

### 1.8 Interaction with Actual Offer person materialization (AUD-1)

Path: delivered narration -> `prepareCommit` (`commit-preparation.ts:88-98`) -> `resolvePersonOffers` (`person-offers.ts:44-105`) -> `offerNarrated` (`:279-360`). There, two `materializeProvisional` calls build `register_character` payloads:

- the subject captive: `person-offers.ts:331-341`, trigger `name_established` when named (`:333`);
- a named narrated seller: `:347-351`.

The payloads are stored inside a `propose_trade_offer` plan (`:356-358`). The domain persists the plan as part of the offer (`src/campaign/trade.ts:145-147`). On the player's Accept (`game-session.ts:560-575`, `trade.ts:213-219`), each stored `register_character` is dispatched to `characters.ts:15-31`, which checks no names.

**AUD-1 verdict: confirmed statically.**

1. `claimsReservedHandle` is applied only in `name-establishment.ts:47` and `keep-track.ts:110`. It is defined in `src/turn/identity/canonical-name-reservation.ts:16-18`. `person-offers.ts` neither imports nor applies it, and no other check on that path compares the established name with canonical handles.
2. The upstream scene reading filters only part of the space. Its canon nonduplication uses each canonical character's `name` only, not `display_name` or `aliases` (`scene-identity.ts:129`, `:215-221`). It skips a name that is an exact canonical name, or a token of a canonical name whose full name appears in the scene. Otherwise it skips a token only when the introduction is not bound to one described speaker. So:
   - **Filtered already:** exact canonical names and mononyms ("Pellan", "Korvin"). Test 1 and the "before materialization" test of `canonical-name-reservation.regression.test.ts:74-131` cover the related paths.
   - **Passes to the offer:** a described captive or seller ("the woman", "the man") who introduces themself with a single-token **alias** that is not a canonical full name. In the current data that is "Elara", an alias of `mistress_elara`, whose name is "Mistress Elara" (`data/characters/calderan/west/slavers/mistress_elara.yaml:5-9`). She is a licensed slaver at Calderan Slave Market, which is exactly where person offers happen.
   - **Passes to the offer:** a full-name claim of an alias, for example "My name is Doran Hale". This establishes the token "Doran". The canonical full name "Captain Doran Hale" does not appear, so the reading keeps "Doran" (`data/characters/calderan/west/civic/captain_doran_hale.yaml:5-10`). The REPO-12 policy (test 2, `canonical-name-reservation.regression.test.ts:83-91`) says such a person must not get even the token.
   - Display names are multi-word and cannot be established as a single-token name. They matter only through such full-name claims, so the audit's "alias or display name" wording overstates the gap.
3. With the name established, `offerNarrated` materializes it into the plan: `establishedFacts` copies `person.name` into `established.name` (`src/turn/narration-facts/person-facts.ts:82`), and `buildMaterializedCharacter` copies it into `profile.name` (`materialization.ts:38`). On Accept a created character carrying the reserved handle is registered.
4. Severity note: the plan, including the name, is visible in the offer card before Accept (`src/app/trade-offer-view.ts:86-87`). It is persisted in the snapshot from the revision the offer is proposed in.

Not confirmed by execution. No test covers reservation on the offer path. A characterization test (R13, R14) should come first, as the register recommends.

### 1.9 Save/load consequences (current)

- Implicit canonical-origin records are ordinary snapshot data. They are saved and validated on restore (`snapshot-validation.ts:44-47`). No migration exists or is needed today.
- The record turns a reconcilable canon removal (the NPC dropped from runtime locations with a warning) into a blocking `reference_invalid` load failure (`canon-compatibility.ts:87-92`).
- A persisted active person offer carries its materialization payload, name included (`trade.ts:145-147`). A later fix to the offer reader does not change already saved offers. Accept dispatches the stored payload (`trade.ts:213-219`). It revalidates availability (`trade.ts:62-90`), not names.
- Nicco's record is saved like any other and is relied on (1.2).

### 1.10 Revision consequences (current)

- Creating the record is an authoritative change. It moves the semantic revision by one inside the same preparation as the command that caused it (`campaign-state.ts:81-86`, `optional-state.ts:59-63`). It is atomic: a failed preparation drops it with the rest of the batch.
- A semantically empty update still creates a record and bumps the revision, for example `set_slot_knowledge` with `state: "unknown"` on a canonical id with no record (`characters.ts:87-93`). This is domain-only today (no production producer).
- The record is re-created identically in each re-preparation of `prepareCommit` (`commit-preparation.ts:64`, `:78`, `:84`, `:96`). Only one commit happens (`turn-coordinator.ts:328`), so there is no double effect.
- An offer plan's `promoted_revision` is restamped to the Accept revision (`trade.ts:218`). That is unrelated to AUTH-5 but relevant to R19.

### 1.11 Documentation drift found

| Document | Statement | Code reality |
| --- | --- | --- |
| [Architecture](../ARCHITECTURE.md) line 94 | "canonical NPC records are materialized lazily by the engine when a Class B/C change needs them" | True, but undecided as policy (D5). In production only `set_condition` and Nicco's slots reach it. |
| [Architecture](../ARCHITECTURE.md) line 97 | "The producers of `register_character` are exactly three: the engine's own preparation for canonical records, ..." | `characterForUpdate` pushes into the draft directly and never emits `register_character`. An explicit canonical `register_character` is accepted by the domain (`characters.ts:15-17`) and used only by tests and fixtures. |
| [Heartstone](../HEARTSTONE.md) line 42 | "a canonical NPC with a campaign record qualifies, one without does not" | Matches the code. It amounts to a de facto answer to D5, which section 16 of the register lists as OPEN. |
| [Current state](../CURRENT_STATE.md) line 61 | World / canon NPC: "no campaign record ... no NPC+ tooling" | One verified punch gives a canon NPC a record and the `campaign_npc` tier. |
| Register ID-8 | "(static reading, not reproduced)" | The record creation is pinned by `live-npc-handover.regression.test.ts:281-292`. Only the promotion step is unreproduced, and it is unreachable in production (1.5). |
| Register AUD-1 | path `src/commerce/person-offers.ts` | The file is `src/turn/commerce/person-offers.ts`. Subject at `:331-341`, named seller at `:347-351`. |

Observation outside AUTH-5 (not in the register): no production path removes a condition. The Controller's `set_condition` must be additive (`command-authorizer.ts:59`), and no other producer exists. So a canonical NPC's implicit record keeps its condition indefinitely. This applies to created characters too. It is listed here only so the user can decide whether to register it.

---

## 2. Authority problem, if confirmed

**Confirmed, as a category-authority problem rather than a data-integrity problem.** A canonical-origin record is a legitimate campaign overlay by design: `projections.ts:11-22` and `tests/world/campaign-state.test.ts:55-66` show canon resolving without copying lore. The problem is that two unrelated meanings share one signal:

1. **"This canonical character has campaign state"** (an overlay of conditions or slots). It is created as a side effect of a physical condition.
2. **"This is a campaign character"**: the `campaign_npc` tier (`character-capabilities.ts:39`), the rite gate (`heartstone-rite.ts:37-38`), and the rite target lookup (`game-session.ts:413`).

So eligibility for an irreversible milestone (NPC+ promotion is permanent, `premium-characters.ts:39-46`) depends on whether a Class B physical-condition change ever happened to that NPC. No actor chose that, and no policy says it. Narration plus Controller evidence, which can never promote by rule (`command-authorizer.ts:96-98`), can change a canonical NPC's promotion eligibility and tier. That is an authority leak of exactly the kind the rule forbids, even though the location gate blocks the final step today.

**AUD-1 is a separate, confirmed policy-coverage gap.** The REPO-12 decision ([Naming](../architecture/NAMING.md) lines 22-29) says a non-canonical person, provisional or persistent, never acquires an exact canonical name or alias. The person Actual Offer plan is a third materialization lane that does not apply the rule. It does not touch canonical-origin records. It creates a **created** record that carries a canonical handle, which is the opposite direction: a fork of a canonical identity's name, not an overlay on it.

---

## 3. Possible invariant

Proposed for approval, worded as a testable rule:

> **I-CANON-1 (category).** The origin of a campaign record decides its category, and the record's existence does not. A canonical-origin record is a state overlay on an authored character. It never by itself makes that character a Campaign NPC (tier) or rite-eligible. Promotion eligibility of a canonical character is decided by an explicit policy (D5), never by whether an overlay happens to exist.
>
> **I-CANON-2 (creation).** A canonical-origin overlay is created only by a domain change that must store campaign state for that canonical character: a condition, a slot or an overlay field. It is never created by a semantically empty change. The player character's overlay is part of this rule.
>
> **I-NAME-1 (all lanes).** Every materialization lane (Keep track, the person Actual Offer plan for subject and seller, and late naming) applies the same reserved canonical-handle rule over the scene's identity facts before a created record carrying a name is planned.

I-CANON-1 is what D5 has to settle. I-CANON-2 matches today's behavior except for the domain-only no-op case (1.10). I-NAME-1 completes a decision already taken (REPO-12).

---

## 4. Viable policy options

Four options for AUTH-5 and D5. AUD-1 is independent of the choice and is treated in 4.5.

### Option A: overlay only, canonical NPCs are not promotable for now (D5 = "no, not now")

- Keep `characterForUpdate` as the overlay creator, unchanged for conditions and Nicco's slots.
- Category follows origin. The `campaign_npc` tier and the promotion capability come from a **created** record. A canonical character with an overlay stays `world_canon`.
- `heartstoneRiteEligibility` refuses a canonical origin (`not_campaign_npc`) whether or not a record exists.
- Existing canonical NPC+ records in saves, if any, are untouched: `isNpcPlus` is the premium record (`premium-characters.ts:44-46`). The authored-NPC+ branches stay as dormant support.
- Optional refinement for I-CANON-2: a semantically empty update creates no record. This is domain-only today.

### Option B: no implicit canonical records at all, Nicco excepted

- `characterForUpdate` refuses a canonical non-player id without a record. The authorizer must refuse such a `set_condition` first (`rejected_reference_invalid`). Otherwise the whole turn's preparation fails with `campaign_validation_failed`.
- Canonical NPCs then keep no campaign conditions. A punched Korvin is no longer "minor_injury" in state.
- A canonical record exists only through an explicit, deliberate `register_character` (none in production today).
- D5 is answered "no" more strongly. The authored-NPC+ branches lose their condition history (`premium-characters.ts:113-116`).

### Option C: deliberate canonical promotion (D5 = "yes, by an explicit act")

- A canonical NPC may become NPC+, but only through the rite as an explicit player act. Eligibility is decoupled from record existence (origin canonical, active, inside Heartstone, Keeper present). The rite creates the overlay record if it is missing, in the same revision as `join_household`.
- This needs new product design: how a canonical NPC legitimately enters Heartstone (an invitation or visit movement authority for canonical NPCs, which does not exist today), how canon roles coexist with household membership (a canonical slaver living at Heartstone diverges from authored canon), and how canon removal treats a promoted canonical NPC (it blocks the load today).
- It naturally fits the Property/Heartstone product block ([Master roadmap](../MASTER_ROADMAP.md) lines 73 and 140 list "canonical-NPC policy" as a Property prerequisite).

### Option D: status quo, documented

- Keep "a canonical NPC with a campaign record qualifies" ([Heartstone](../HEARTSTONE.md) line 42). Document that a verified physical condition makes a canon NPC a Campaign NPC. Correct [Current state](../CURRENT_STATE.md) line 61.
- D5 becomes "yes, whenever the NPC has any campaign state", which in practice means "yes after being punched".

### 4.5 AUD-1 sub-choice (independent of A to D)

The rule itself is already decided (REPO-12). Only the user-visible outcome when the offer subject or seller claims a reserved handle is open:

| Sub-option | Subject captive claims a reserved handle | Named seller claims a reserved handle |
| --- | --- | --- |
| **AUD-1a: fail closed** | No offer. Diagnostic `blocked`, reason `canonical_name_reserved`, the same shape as the other offer refusals (`person-offers.ts:282-284`). | No offer, same reason. |
| AUD-1b: drop the name | Offer made. The captive is materialized unnamed (`purchase_unnamed_subject`, label from the noun, "the woman"). | Seller treated as anonymous: a counterparty snapshot, never a character (`person-offers.ts:344-345`). |

---

## 5. Trade-offs

| | A: overlay only, not promotable | B: no implicit canonical records | C: deliberate canonical promotion | D: status quo, documented |
| --- | --- | --- | --- | --- |
| Closes the authority leak (section 2) | Yes | Yes | Yes, by making it explicit | No; documents it |
| Answers D5 | "Not now"; reversible later toward C | "No" | "Yes, explicitly" | "Yes, implicitly" |
| Keeps canonical NPC condition continuity (Korvin's injury) | Yes | **No** (changes `live-npc-handover.regression.test.ts:281-292`) | Yes | Yes |
| Keeps Nicco's slot record | Yes | Yes, with a player exception | Yes | Yes |
| Tests that must change | P2 Korvin half (`explicit-promotion.test.ts:74-85`) | The punch test, P2, campaign-state overlay tests if they go through the commands | P2 semantics change; new rite and movement tests | None |
| Docs to change | HEARTSTONE line 42, ARCHITECTURE lines 94 and 97, register rows | Same plus the condition docs | Same plus new product docs | CURRENT_STATE line 61, register rows |
| Save compatibility | Full: no schema change, nothing deleted | Full if snapshot validation is not tightened (old canonical records must still load) | Full; new records only | Full |
| Canon-removal risk (`canon-compatibility.ts:87-92`) | Unchanged (overlays still block removal) | Reduced for new campaigns | Increased (promoted canon NPCs) | Unchanged |
| Size | S | S to M | M to L (product design and movement authority) | XS |
| Blocks Property | No; the policy is explicit | No | It is the Property-era design | Leaves D5 to be decided by accident during Property work |
| Risk | Low; a capability and eligibility change in two functions | Medium; a turn-failure risk if the authorizer and domain disagree | Highest; canon divergence and a new movement authority | Lowest effort, keeps the leak |

AUD-1a vs AUD-1b: 1a is the smallest change and mirrors Keep track (`keep-track.ts:110`, message "That name belongs to a known figure of the world. Nothing was created."). It costs the player that purchase in that exchange. 1b keeps the trade but needs a label and ref change for the subject (the ref `narrated:elara` is name-based, `scene-identity.ts:236`). It also needs a new anonymous-seller conversion, and so has more surface and more chances to break the supersession identity (F7).

---

## 6. Recommended option

**Option A now, with AUD-1a.** Both for the user's approval.

Reasons:

- It removes the only authority problem actually confirmed: category and eligibility following an incidental overlay. It keeps every behavior that works and is tested: canonical NPC conditions, Nicco's slots, the overlay projection.
- It gives D5 an explicit, reversible answer ("canonical NPCs are not promoted for now"). That is what the roadmap needs before Property. It does not foreclose Option C: if Property/Heartstone later designs canonical visitors or residents, C can be added on top, because A changes no data and no schema.
- It is small and local. Two derivation sites change (rite eligibility, tier and promotion capability), plus one test expectation and three documentation lines.
- AUD-1a completes REPO-12 with the same fail-closed outcome as Keep track, applied over the scene's identity facts, so the "self-introduced in an earlier exchange" case is covered too (R15).

Not recommended: B, because it loses canonical condition continuity that a regression test protects for a real live finding. D, because it leaves D5 to be answered by accident. C is the right shape for a later product decision, not for a policy fix.

---

## 7. Whether a user decision is required

| Question | Decision needed? | Why |
| --- | --- | --- |
| D5: may a canonical NPC become NPC+ (and Campaign NPC tier) | **Yes, product decision.** This is register section 16, D5. | It chooses between A/B (no), C (yes, explicitly) and D (yes, implicitly). The code cannot settle it. |
| If A: should an existing canonical NPC+ in an old save stay NPC+ | Yes, but a one-line confirmation. Recommended answer: yes, no demotion. | Promotion is permanent by design (`premium-characters.ts:39-46`). No production path could have created such a record, so in practice this only affects test or hand-made saves. |
| If A: suppress record creation for semantically empty updates | No (engineering detail, domain-only today). | It is listed only for completeness and needs approval like any change. |
| AUD-1: apply the reserved-handle rule to the offer plan | **No new product decision.** REPO-12 already decided the rule for "a non-canonical person, provisional or persistent". Only approval to implement is needed. | This is policy completion. |
| AUD-1a vs AUD-1b | Yes, a small UX choice. Recommended: 1a. | It decides whether such a captive can still be bought in that exchange. |
| Should saved active offers created before the fix be re-checked on Accept | Yes, a small choice. Recommended: no re-check, record as a known legacy limitation. | The re-check would add an invalid reason to `tradeOfferInvalidReason` (`trade.ts:62-90`). Such offers only exist if the scenario already happened, and they are inspectable in the card. |

---

## 8. Exact regression matrix needed

Rows marked **existing** are pinned today and must keep or change their expectation as stated. Rows marked **new** are tests to add. "Expected (A, AUD-1a)" is the behavior under the recommendation. "Expected now" is the current behavior.

### 8.1 AUTH-5 and D5

| # | Scenario and setup | Expected now | Expected (A) | Test location |
| --- | --- | --- | --- | --- |
| R1 | Punch Korvin (no record), verified "split lip" quote, Controller `set_condition [minor_injury]` | Authorized; `korvin` canonical-origin record with that condition; revision +1 | Unchanged | **existing** `tests/authority/live-npc-handover.regression.test.ts:281-292` |
| R2 | After R1: Korvin's card in the play UI | tier `campaign_npc`, a promotion reason shown | tier `world_canon`, `can_promote_to_npc_plus` false, `promotion_unavailable_reason` null | **new**, `tests/npc-plus/explicit-promotion.test.ts` |
| R3 | Fixture: canonical Korvin with an explicit record, moved inside `heartstone_lr` (`explicit-promotion.test.ts:38-46`) | Eligible; rite succeeds | `heartstoneRiteEligibility` returns `not_campaign_npc`; `completeHeartstoneRite` refused; revision, members and premium unchanged | **existing** P2, `explicit-promotion.test.ts:74-85`: the Korvin half flips |
| R4 | Canonical NPC without a record (Mira Thorne) | `world_canon`, refused | Unchanged | **existing** P2 first half |
| R5 | A created Campaign NPC inside Heartstone | Promotable; one `join_household`; NPC+ in the same revision | Unchanged | **existing** P1, `explicit-promotion.test.ts:67-73` |
| R6 | Nicco equips and unequips; `empty_slots` on Nicco's record | `["feet"]` | Unchanged | **existing** `live-npc-handover.regression.test.ts:140` |
| R7 | Nicco is never promotable | Refused | Unchanged | **existing** P3, `explicit-promotion.test.ts:86-94` |
| R8 | Save and load round trip of a campaign with an implicit canonical record | Loads; record intact | Loads; record intact; tier `world_canon` after load | **new**, `tests/persistence/` |
| R9 | Hand-made save with a canonical NPC+ premium record and membership | Loads; NPC+ | Loads; stays NPC+ (no demotion); no rite offered for any other canonical NPC | **new** |
| R10 | Canon removal of an NPC that has an overlay record | `reference_invalid` | Unchanged (documented) | **new** or extend `tests/persistence/` canon-compatibility tests |
| R11 | `set_condition` on a canonical NPC inside a batch whose preparation fails | No record, no revision | Unchanged | **new**, `tests/world/campaign-state.test.ts` |
| R12 | (Optional refinement) `set_slot_knowledge unknown` on a canonical id with no record | Record created, revision +1 | No record, no revision | **new**, only if the refinement is approved |
| R13a | Controller `join_household` of a canonical NPC into the Keeper's household | `rejected_command_not_allowed` | Unchanged | **existing** authorizer tests (`command-authorizer.ts:96-98`) |

### 8.2 Identity lanes and AUD-1

| # | Scenario and setup | Expected now | Expected (AUD-1a) | Test location |
| --- | --- | --- | --- | --- |
| R13 | Market scene, Korvin present and known. A caged "woman" says "My name is Elara," and Korvin prices her ("Five for her.") | **Characterization first:** offer plan `register_character` with `profile.name: "Elara"` (AUD-1 reproduced) | No offer; diagnostic `blocked`, `canonical_name_reserved`; no character carries "Elara"; `mistress_elara` gets no record | **new**, `tests/identity/canonical-name-reservation.regression.test.ts` (reuses its fixture) |
| R14 | Same, with "My name is Doran Hale" | Plan materializes "Doran" (**inferred**) | Blocked; no "Doran" and no "Doran Hale" | **new**, same file |
| R15 | Self-introduction in exchange N, price in exchange N+1 | Plan carries the name (**inferred**) | Blocked (scene-wide identity facts, as in Keep track) | **new** |
| R16 | A named narrated seller (described man) introduces himself with a reserved alias and sells an unnamed captive | Seller materialized with the handle on Accept (**inferred**) | Blocked | **new** |
| R17 | A captive claims a canonical mononym ("My name is Pellan") | No named person (filtered by the scene reading) | Unchanged | **new** pin, same file |
| R18 | A captive claims a free name ("Sela") and the seller prices her | Offer and Accept materialize "Sela" | Unchanged | **existing** person-offer end-to-end tests (`tests/commerce/`) plus a control row in the new file |
| R19 | A saved active offer from before the fix whose plan carries a reserved name is accepted | Materializes the name | Per decision in section 7. Recommended: unchanged, documented | **new**, only if the re-check is approved |
| R20 | The bound canonical partner (Korvin, focused this turn) answers "I'm Marden" and prices a captive | Seller binding depends on an earlier recorded partner (**inferred** gap) | No created "Marden" seller in the plan | **new** verification row; it may expose a second gap next to AUD-1 |
| R21 | Counteroffer for the same narrated captive | Same planned id across supersession | Unchanged | **existing** `tests/commerce/person-offer-playthrough.regression.test.ts` (the `c0608a6` end-to-end test) |
| R22 | Keep track: canonical NPCs never listed; a participant carrying a canonical alias is blocked | As stated | Unchanged | **existing** `canonical-name-reservation.regression.test.ts:123-131`, `tests/identity/keep-track.test.ts` |
| R23 | Late naming: tests 1 to 6 of the reservation suite | As stated | Unchanged | **existing** `canonical-name-reservation.regression.test.ts:66-121` |

---

## 9. Proposed implementation boundary

Everything below needs the user's approval first. Nothing here is a plan to start without it.

**Option A (D5 "not now").**

| Area | Files | Change |
| --- | --- | --- |
| Rite eligibility | `src/campaign/heartstone-rite.ts:35-38` | A record whose origin is not `created` returns `not_campaign_npc`, like a canonical NPC without a record. |
| Tier and promotion capability | `src/app/player-character-view.ts:233-234`; doc comment in `src/app/character-capabilities.ts:5-8` | `has_campaign_record` and `promotion` derive from a created record. A canonical overlay stays `world_canon`. |
| Rite target lookup | `src/app/game-session.ts:413` | No change needed; eligibility refuses. |
| Tests | `tests/npc-plus/explicit-promotion.test.ts:74-85` and new R2, R8, R9 | The P2 Korvin half flips. |
| Docs | `docs/HEARTSTONE.md:42`, `docs/ARCHITECTURE.md:94` and `:97`, `docs/CURRENT_STATE.md:61` (wording only), register rows AUTH-5, ID-8, NPC-3, F8, D5 | Record the decision and the corrected producer statement. |
| Not touched | `src/campaign/preparation.ts`, `premium-characters.ts`, `social.ts`, `snapshot-validation.ts`, save format, `command-authorizer.ts`, movement | No schema change and no migration. |

Optional refinement (I-CANON-2 no-op case), only if approved separately: `characters.ts:87-94` returns without creating a record when the result is empty and no record existed.

**AUD-1a.**

| Area | Files | Change |
| --- | --- | --- |
| Offer reader | `src/turn/commerce/person-offers.ts`, `offerNarrated` before `:331` (subject) and before `:349` (named seller) | Build the identity facts of every scene narration, the same way Keep track does (`keep-track.ts:99-100`), and call `claimsReservedHandle(world, identity, name)`. On a hit, use `block("blocked", "canonical_name_reserved")`. `resolvePersonOffers` already receives `options.world`, so it needs to pass it into the purchase scope. |
| Rule module | `src/turn/identity/canonical-name-reservation.ts` | Header comment: three lanes instead of two. No logic change. |
| Tests | `tests/identity/canonical-name-reservation.regression.test.ts` | R13 to R18; R20 as a verification row. |
| Docs | `docs/architecture/NAMING.md:22-29`, `docs/architecture/ACTUAL_OFFER.md` (refusal reasons), register AUD-1 (path correction and closure) | |
| Not touched | `src/turn/narration-facts/scene-identity.ts` (the canon nonduplication rules), `materialization.ts`, `trade.ts`, domain `register_character` | |

An alternative that was considered and is not recommended: a domain-level backstop in `register_character` (`characters.ts:15-31`) that refuses a created record whose `profile.name` is an exact reserved handle. It would cover all lanes, including Accept of old saved offers. It cannot see full-name claims ("Doran"), and a refusal at Accept would surface as a failed settlement rather than a clean "no offer". Extending the scene reading's canon list to aliases (`scene-identity.ts:129`) would fix all three lanes at the source, but it changes NarrationFacts for every consumer. That falls under the D17 sequencing, not under this fix.

Suggested order, if approved: R13 characterization test (confirms AUD-1 by execution), then AUD-1a, then Option A with R2, R3, R8 and R9. The two pieces are independent and can land separately.

---

## 10. Explicit non-goals

- No change to `characterForUpdate` semantics for conditions or for Nicco under the recommended option. No change to the overlay projection.
- No new promotion path for canonical NPCs, no movement or invitation authority for canonical NPCs into Heartstone, and no design of canonical visitors or residents (that is Option C, a Property-era product decision).
- No demotion or rewrite of any existing NPC+ record, and no deletion or retirement of existing canonical-origin records.
- No save schema bump, no migration, and no tightening of `validateCampaignSnapshot` that could make existing saves fail to load.
- No change to the NarrationFacts scene reading or its canon nonduplication rules, and no change to foreground canonical binding or the partner-conflict guard (R20 is a verification row, not a fix).
- No change to Keep track, late naming, the identity-fork scanner or the retire and merge repair path.
- No condition-lifecycle work (removing or healing conditions). It is noted in 1.11 only.
- No NAME-1 / `premium_*` rename (D6), no D4 work (NPC+ outside the household), and no economy, ledger or Property work.
- No repository cleanup program. The repository residuals REPO-7, REPO-8, REPO-13 and REPO-14 stay low-priority and unrelated.
- No live provider runs. All verification proposed here is offline and deterministic.
