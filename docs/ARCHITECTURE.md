# Caldrevan architecture

Status: Current. Last reconciled: 2026-10-13 (consolidation block 11, on top of main 7345549). Source of truth: the current main working tree (code first, then tests, then authored data).

Caldrevan is a deterministic engine for long-running, AI-narrated roleplay. **The LLM interprets and proposes. The engine owns truth.** Nothing a model writes becomes campaign state until the engine has validated it, authorized it with evidence and committed it atomically.

## 1. Governing model

| Part | Role | What it may not do |
| --- | --- | --- |
| **Narrator** (LLM) | Writes the prose of a turn. | Mutate campaign truth. Prose is provisional until the audit passes. |
| **State Controller** (LLM) | Reads the finalized narration plus bounded state evidence and *proposes* structured changes. | Mutate state. A proposal is only a proposal and has no semantic veto over the engine. |
| **Engine** (`src/campaign`, `src/turn`) | Parses, validates, authorizes with evidence, prepares and commits. | n/a: it is the only writer. |
| **CampaignState** | Authoritative runtime truth of one campaign (revision-guarded, atomic). | Hold UI state, prose or derived data. |
| **Authored canon** (`data/`, `WorldStore`) | Immutable baseline world truth. | Change at runtime. |
| **Retrieval** | Informational support for the narrator (lexical by default, semantic optional). | Act as authority for any fact. |
| **Scene State Projection** (SSP) | Derived, deterministic, read-only, never persisted candidate "current truth" for narration. | Be saved, or be authority itself. |
| **Save** | The authoritative persistent form of one campaign. | Contain derived data (calendar, weather, capabilities, visuals metadata). |
| **UI** | Reads read models (`SessionView`, play/player/inventory views). | Become a second gameplay authority. |

## 2. Mutation path

```text
Player input
  ↓
GameSession                       src/app/game-session.ts  (one facade for any UI; SessionHost owns campaign lifecycle)
  ↓
TurnCoordinator                   src/turn/coordinator/turn-coordinator.ts  (orchestrates typed stages in src/turn/stages/)
  ↓ intent + projection → retrieval → context
Narrator (buffered draft, never shown) src/llm/openrouter/minimax-narrator.ts  (provider class name is historical)
  ↓
State Controller (proposal)       src/llm/openrouter/state-controller.ts
  ↓
Schema validation  →  Evidence authorization   (controller-schema, evidence-authorization, command-authorizer, item/household evidence)
  ↓
Narration audit (revise once, then redact)     what the player reads always matches what is committed
  ↓
expected_revision check → CampaignState.prepare (validation capability, never a mutation)
  ↓
ONE atomic CampaignState.commit               the only mutation of a turn
  ↓
Derived read models + SSP                     recomputed from state; nothing derived is stored
  ↓
UI + next turn context
```

### 2a. Turn reliability contract (block 4)

One player turn is one transactional operation:

- **Nothing unaudited reaches the browser.** The draft is buffered server-side. While the turn runs the client receives neutral `progress` events (`thinking`, `narrating`, `resolving`) and nothing else; the audited, committed narration arrives once, in the final result. No fake streaming.
- **After the single `CampaignState.commit` the turn succeeded.** The result is assembled before the commit; every later step (history, scene participants, diagnostics, state view, transcript, item visuals) is guarded and becomes a warning in the trace (`publication_warnings`), never a failed turn.
- **A turn executes at most once per `turn_key`.** `/api/turn` requires `turn_key` and `expected_revision`. Order: join an in-flight turn with the same key (runtime registry) → replay a terminal receipt → busy (`turn_in_progress`, never queued) → application command → stale revision (`stale_turn`, before any provider call). The same key with a different request is `turn_key_conflict`. Terminal results, successes and failures, are kept as bounded (32) idempotency receipts in the save file (schema stays 5; additive `turn_receipts`), written in the same atomic rename as the snapshot and without touching the semantic revision. Not remembered: `cancelled`, `stale_turn`, `turn_in_progress`, `invalid_input`, `session_closed`. A failed turn is retried with a NEW key.
- **Crash boundary.** Receipts are recorded synchronously before the session returns to idle, and saves need idle, so a durable snapshot at revision N always carries the receipt of the turn that produced it. A commit that was never saved is lost together with its receipt, so the retry after a restart is a legitimate first execution, not a duplicate.
- **A truncated Narrator answer is never used.** `finish_reason=length` is an incomplete narration: not delivered, not sent to the Controller, not audited, not committed. Exactly one regeneration (cap 1024, same base revision and context, a short recovery instruction, nothing stitched). Budget per turn: at most 2 logical Narrator generations (primary + recovery OR audit revision) and 3 physical provider attempts (infrastructure retries and regeneration share it); the Controller is called at most once and only after a complete narration. A failed recovery is the terminal `narrator_truncated`.

Contractual order (from the coordinator): input → intent/projection → retrieval → narration (draft) → controller (proposal) → authorization → final preparation → audit/reconciliation → commit preparation → checkpoint → one commit → publication. Stages never mutate `CampaignState`; `campaign.prepare` is only a validation capability. A stale revision after any await rejects the turn (`stale_turn`); there is no rebase or replay. Controller failure never commits.

Evidence rule: a change needs the player's own words or a completed event in the narration. Requests, plans, hints, hedges and refusals authorize nothing. Where the evidence layer cannot be sure it fails closed (a false negative is preferred to a false commit).

## 2b. Player-authorized state transitions

The governing model above is unchanged. Some **high-impact** transitions add one step between proposal and commit:

fiction / LLM interpretation → structured pending action → **player confirmation** → engine validation → atomic commit

Low-impact state (most ordinary facts, movement, item handoffs) is still inferred and proposed automatically. Explicit confirmation is preferred only where the change is high-impact, irreversible or expensive, semantically ambiguous, and easy to understand in a compact UI surface. It is **not** "everything gets a button". The UI exposes the action and is never independent truth: the client sends only a ref and `expected_revision`, and `GameSession` resolves the authoritative payload. Three cases today:

| Transition | Fiction | Confirmation | Authority |
| --- | --- | --- | --- |
| Heartstone rite / NPC+ promotion | the player roleplays the ceremony; prose is never read as completion | the ↑ "Promote to NPC+" action | `GameSession.completeHeartstoneRite` → eligibility → join Heartstone household → sync NPC+ promotion → one revision; Controller `join_household` into Nicco's Heartstone is rejected ([Heartstone](HEARTSTONE.md)) |
| Trade | goods offers are structured by the Controller, person offers are read from narration | Accept on the Actual Offer card | `GameSession.acceptTradeOffer` → `accept_trade_offer` → atomic settlement ([Actual Offer](architecture/ACTUAL_OFFER.md)) |
| Keep track (block 12) | the Narrator introduced a provisional person; nothing the prose or the player types persists them | **Keep track** on the temporary person in the scene sidebar | `GameSession.keepTrack` → recompute the scene's provisional people → resolve the opaque token → fail-closed checks → one `register_character` (ordinary Campaign NPC) → one revision (see "Keep track" in section 2c) |

A `TradeOffer` is a pending proposal; a transaction is committed state; acceptance is the boundary. Settlement stays domain-specific (goods are items, people go through the legal-transfer system). The trade card is also a human-verification surface and uses player-visible identity only (hidden names, ids and avatars never reach it). This is a documented pattern, not a code superclass.

## 2c. Authority classes and the optional-service invariant

**Authority classes.** Every action is classified by impact, and the class decides how it reaches state:

- **Class A, low impact and reversible** (ordinary movement, scene focus, non-destructive interaction state): inferred, no confirmation.
- **Class B, important but engine-verifiable** (name disclosure, NPC movement and follows, directly evidenced item pickup, the held-person escort): no confirmation when the evidence is strong; **safe rejection on ambiguity**.
- **Class C, irreversible or high impact** (trade settlement, NPC+ promotion, manumission, large property transfer, any destructive action): explicit player confirmation through a ref-and-revision-guarded action (section 2b).

**Class C versus PendingConfirmation.** Class C is the *authority category* (irreversible or high impact acts need the player's explicit decision). `PendingConfirmation` is one *mechanism* some Class C acts use: when the player's free text is only a semantic interpretation of an act (today: manumission), the turn records a server-owned pending record instead of committing, and the player confirms or cancels it on a card. Actual Offer Accept and NPC+ Promote already carry explicit authority (their own ref-and-revision-guarded actions) and are **not** migrated onto it.

Three states are kept apart everywhere (state, prompt, UI, audit): *current world state* (CampaignState, authoritative), *proposed action awaiting confirmation* (interaction metadata, never world state, rendered to the Narrator as "NOT completed"), and *completed action* (a committed transaction). Creating, cancelling or invalidating a pending record never changes the semantic revision; Confirm commits through `prepare/commit` like any other change and revalidates at that moment (subject still enslaved, held by the actor, present). The Narrator-draft audit rejects prose that claims a pending act as done (`uncommitted_pending_confirmation`).

**Character lifecycle (block 5B, AUTH-2 CLOSED; Keep track block 12).** A character is PROVISIONAL, PERSISTENT or RETIRED. This is an *identity lifecycle*, **not an NPC tier** (tiers are Canon / Campaign NPC / NPC+, see [Heartstone](HEARTSTONE.md)).

| State | Where it lives | How it is entered | How it ends |
| --- | --- | --- | --- |
| PROVISIONAL | scene-local only (derived from the narrated scene and the ephemeral participants); never in the snapshot, never saved | the Narrator introduces or names a person | forgotten when the scene window moves on; after a reload a NAMED provisional person is re-read from the restored recent exchanges, a temporary scene participant is not (PER-2B); becomes PERSISTENT only through an explicit act: the player's **Keep track**, or a domain act that already carries explicit authority (Accept) |
| PERSISTENT | `CampaignSnapshot.characters[]` | **Keep track** (`GameSession.keepTrack`) or the person Actual Offer **Accept** materializes the *same* provisional person (`materializeProvisional` builds the minimum durable record); canonical NPC records are materialized lazily by the engine when a Class B/C change needs them; legacy characters stay valid | `retire_character` / `merge_characters` |
| RETIRED | the same record, `retirement` set, `current.status = inactive`, no location | a human-invoked, confirmed repair | terminal (a retired identity is kept, never deleted, never reactivated) |

Rule: **narration, a name established by narration, a self-introduction, repeated appearances, the player's typed words, the Controller and the Narrator audit can never create a persistent character.** The producers of `register_character` are exactly three: the engine's own preparation for canonical records, the person Actual Offer plan (settled by the player's Accept), and Keep track. `establishNames` only *names an existing record late* (`set_profile`) or reports a `ProvisionalPerson`.

**Keep track (block 12, KPG-1 closed).** The sidebar lists the scene's provisional people (`GameSession.getProvisionalPeopleView`, derived from the scene reading plus this session's scene participants, `src/turn/keep-track.ts`): present named narrated people, an unnamed narrated captive only when exactly one scene participant is that person, and the remaining present participants; same labels are distinguished ("Guard (1)", "Guard (2)"). Each carries an opaque, campaign-bound token (a hash of the campaign id, the scene ref and the location). The browser sends only that token and `expected_revision` (`POST /api/people/keep`); the server recomputes the list and decides. Order of checks: already persistent for this token (kept, or bought) → `already`, no revision; stale revision → refused; token not in the current scene → refused (expired, other campaign, forged); fail-closed blocks: the subject of the open person offer (Accept already keeps them), two temporary people with the same name, a persistent character with the same name anywhere, a reserved canonical name or alias (the same rule as name establishment, [Naming](architecture/NAMING.md)). Success commits ONE `register_character` built by `materializeProvisional` with `identity_only`: an ordinary Campaign NPC (origin `created`, `origin_snapshot.trigger = player_kept`, `ephemeral_ref` = the scene ref) at the current location with the identity facts narration established (name and its source, sex, age, species, appearance, descriptor). Condition and background claims are dropped; no household, NPC+, legal status, ownership, relationship or inventory is touched; a captive keeps the neutral provenance role "narrated captive; legal status unestablished", so a later person offer binds to the SAME id and its Accept only pays and transfers. The kept scene participant leaves the temporary registry. NPC+ promotion later uses the unchanged Heartstone rite. **Authority decision:** a direct explicit action, not a `PendingConfirmation`: the button is itself the player's explicit act on one exactly identified person (opaque token, revision-guarded, idempotent), the effect is persistence bookkeeping only (no gold, ownership, legal, household or relationship change) and it is repairable through the existing confirmed retire / merge path; `PendingConfirmation` stays the mechanism for acts the engine only *interprets* from free text.

**Repair pipeline (Class C, human-reviewed).** `scan -> report -> human review -> explicit retire/merge invocation -> PendingConfirmation -> Confirm -> atomic commit`. The scanner (`src/campaign/identity-fork-scanner.ts`) is read-only and diagnostic; its confidence is never an input of repair. `GameSession.requestRepair` (`POST /api/repair/request`, explicit ids, operator only) runs the deterministic preflight, creates a `PendingConfirmation` of kind `retire_character` or `merge_character` (provenance `operator`) only when there is no hard conflict, and the ordinary Confirm commits the single `retire_character`/`merge_characters` command (zero provider calls). Merge names an explicit SOURCE (the duplicate, retired with `merged_into`) and TARGET (kept); any conflicting authoritative truth refuses the whole merge. The Controller cannot emit either command (schema and authorizer).

**Architecture Consolidation Gate: COMPLETE (block 7).** New gameplay/domain systems are no longer blocked by it. Consolidation blocks 8-12 are done (benchmark, NarrationFacts movement / commerce / identity, Keep track and the residual debt reconciliation); no LLM verifier was added.

**Optional services.** Reflection, Mannerism learning, portrait generation, item sprite generation, sprite QA and semantic retrieval are *optional services* outside the correctness boundary (block 6). Invariant: **disabling any optional service must not break core correctness**; a disabled service means "feature absent", never "engine degraded". They are resolved once at the composition boundary (`src/app/optional-services.ts`), launched only after the core turn is complete (`turn_completed` + idle), never awaited, never owning the turn lock, and their legacy CampaignState writes apply only at idle. **ARCH-1 is closed (block 7): their durable state lives in the learning / media side stores, bound to the campaign, authoritative only through an explicit marker in the save, and never part of the semantic revision; context compaction is CORE (derived, awaited after commit, not optional).** Normative detail, the OFF table and the gate: [Optional services](architecture/OPTIONAL_SERVICES.md).

## 2d. NarrationFacts (movement block 9, commerce block 10, identity / speaker / recipient / references block 11)

Narration is read ONCE per turn by `src/turn/narration-facts/` into **descriptive facts** (span, sentence, modality, polarity, confidence, ambiguity, provenance, referents); the same memoized `NarrationFactSource` is handed to authorization, the narration audit and commit preparation. Facts never carry policy (no `authorized` / `accepted` / `should_*` field) and the package imports no campaign, authorization or audit code. Policy adapters live outside it: `movement-evidence.ts` and `commerce-evidence.ts`.

Commerce facts (block 10): `price_quote` (`seller_ask` / `seller_counter` / `player_counter` / `ambiguous_quote`; `current` / `past_cost` / `group_or_each`; voice narration / speech / player input), `unsupported_money` (non-gold currency, fractions), `offer_withdrawn`, `payment_claim`, `transfer_claim` (goods hand-over, "she's yours", bill of sale), `settlement_claim` ("the sale is done"). Invariants: a player counteroffer is never a seller offer; the latest concrete seller quote supersedes (the trade state machine records the supersession, one global active offer); several different prices in one statement are ambiguous and fail closed; **narration can never settle a trade** (payment / transfer / settlement are CLAIMS the audit compares with the authoritative state and withdraws); explicit UI Accept remains the only settlement authority. `trade-price.ts` is the one low-level numeric helper (`readPrices`); the Actual Offer reader (`person-offers.ts`), goods authorization (`trade-authorization.ts`) and the commerce audit (`narration-audit.ts`) read the shared facts. See [Block 10](evaluations/CONSOLIDATION_BLOCK10_NARRATIONFACTS_COMMERCE.md).

Identity, speaker, recipient and reference facts (block 11): every spoken line gets one shared speaker attribution (`explicit_dialogue_tag` including the post-hoc delivery tag, `direct_name`, `adjacent_action_beat`, `continued_speaker`, `deterministic_context`; a plural beat or two candidates is ambiguous, never one of them), and identity facts describe `self_introduction`, `name_disclosure`, `recipient_attribution` and `reference` (the same name is never a merge). The scene reading (`source.scene(...)`: narrated people, captives, name introductions, late namings) is memoized on the same source, so person offers, name establishment, the partner guard and the audit read one reading. Commerce has no speaker parser of its own: the speaker of a price is the shared dialogue unit's, and a price explicitly addressed to somebody other than Nicco is not an offer to the player. This closed KPG-2. The duplicate readers `narrated-captives.ts` and `scene-participation.ts` were deleted. **FACTS DESCRIBE. POLICIES DECIDE. CAMPAIGNSTATE OWNS TRUTH. AUDIT VERIFIES AGAINST THE SAME FACTS.** Normative detail: [NarrationFacts](architecture/NARRATION_FACTS.md); report: [Block 11](evaluations/CONSOLIDATION_BLOCK11_FINAL_SEMANTIC_ARCHITECTURE.md).

## 3. What each model sees

Three separate channels are built from authoritative state. Nothing sends the whole campaign or the whole transcript every turn.

- **Narrator-facing context** (`src/turn/context/prompt-builder.ts`, `narrator-pack.ts`, `context-builder.ts`): compact, human-readable, narration-safe, free of technical ids, visibility-checked (the narrator never receives what the player character could not know). It carries a stable policy, the player's compact visible-appearance line, the `[CURRENT SCENE]` block, a bounded recent-scene narration window, and any retrieved background grounding.
- **Scene State Projection** (`src/turn/context/scene-state-projection.ts`, `scene-state-focus.ts`, `scene-state-render.ts`): location, date/time/season/observance, outside weather, who is present and in what state, who carries and who owns what, mana and gold, knowledge scopes, relevant household and schedule. Derived, deterministic, read-only, not persisted, selected by relevance. It states only what Nicco knows; omission never means a detail is false. See [Scene State Projection V1](architecture/SCENE_STATE_PROJECTION_V1.md).
- **Controller-facing context**: structured and actionable. It does carry ids and the mutation-relevant state it needs (items, positions, household, knowledge scopes). It receives **no** calendar or weather and no UI state.
- **Retrieval / background grounding** (`src/retrieval`, `background-grounding.ts`): a separate supplementary channel of canon chunks selected by explicit policy. Informational only.

**Identity requests and person trades (replay fidelity pass 2; settlement since superseded by [Actual Offer](architecture/ACTUAL_OFFER.md): a person sale is a pending offer settled only by the player's Accept, not by prose).** Objective identity is the engine's; the label the player knows is a separate fact. A name request ("who am I talking with?", `src/turn/identity-request.ts`) resolves an unfamiliar actor to the canonical person only through name-request-scoped exclusive matching (`EXCLUSIVE_TRAITS` in `canonical-interaction-targets.ts`: exactly one eligible canonical actor fits and every other matches no trait); generic weak casting is unchanged. Person purchases read the recent narration through the NarrationFacts scene reading (`source.scene(...)`, `narration-facts/scene-identity.ts`: plain RPG speech counts as speech; a name presented as "This is X." / "That's X." / "X, the man says" binds to the one woman or man described; a pronoun binds only when exactly one present person fits) and the persisted conversation partner (`#focus`, kept across deal turns, bound to descriptor speakers). All of it only reads authoritative narration; commits still go through `transfer_person` and the usual authorization.

**Foreground canonical identity binding (`d4e9e22`).** The engine, not the model, holds who the player is talking to. The partner is bound from an explicit player selection (`APPROACH_MOTION` engagement plus exclusive trait match, `canonical-interaction-targets.ts`) or from the delivered narration (`foreground-binding.ts`: `narratedForegroundCanonical` when exactly one canonical actor is shown, `narratedSpeakerPartner` among several). `TurnCoordinator.recordExchange` stores `conversation_partner_id`; the Narrator receives `[CURRENT INTERACTION PARTNER - OBJECTIVE IDENTITY]` or `[PEOPLE JUST SHOWN TO NICCO - OBJECTIVE IDENTITIES]` (`prompt-builder.ts`) and may speak only a listed name. If the model gives a bound canonical partner another name, `partner-identity-guard.ts` rejects it: no character, alias or participant is created, the audit issue `canonical_name_conflict` requests one bounded revision, and `name-establishment.ts` skips with `canonical_partner_conflict`. The player keeps seeing "Unfamiliar person" until a legitimate reveal. Report: [evaluations/FOREGROUND_CANONICAL_IDENTITY_BINDING_P0.md](evaluations/FOREGROUND_CANONICAL_IDENTITY_BINDING_P0.md).

**Player-authorized state changes (Heartstone rite).** Not every authority is an LLM proposal checked by evidence. The Heartstone household rite is player-authored fiction: the Narrator may roleplay it, but only the player's explicit UI confirmation (`completeHeartstoneRite`, validated against `heartstoneRiteEligibility` and the revision the card was rendered at) commits it, as one `join_household` whose NPC+ promotion derives inside the same preparation (one revision or nothing). Authorization rejects any Controller-proposed join into the household Nicco keeps, and nothing infers a rite from prose. See [Heartstone](HEARTSTONE.md).

## 4. Authority table (who owns each truth)

| Domain | Authoritative source | Persisted | Derived | Narrator-visible | Controller-visible | UI-only |
| --- | --- | --- | --- | --- | --- | --- |
| Canon lore | `data/` YAML via `WorldStore` | in the repo, not in saves (saves record a dataset id and canon references) | no | yes, through retrieval and visibility rules; restricted tiers withheld | selected grounding only | no |
| Campaign runtime state | `CampaignState` | yes (snapshot) | no | through SSP and context | bounded evidence | no |
| Items (identity, owner, category, description) | `CampaignState.items` | yes | no | SSP item labels (no ids) | yes, with ids | no |
| Item ownership | `owner_id` on the item | yes | no | SSP ("who owns what") | yes | no |
| Item physical position | one `position` per item: `unknown`, `carried`, `equipped`, `stored(location_id)` | yes | no | SSP | yes | no |
| Inventory | derived from item positions (`src/campaign/inventory.ts`); no second array | no | yes | via SSP | via item state | no |
| Household membership | `CampaignState.households` | yes | no | SSP when relevant | yes | no |
| NPC+ promotion | the `premium_characters[]` record (`isNpcPlus`); created only by the player's explicit Heartstone rite confirmation (`GameSession.completeHeartstoneRite`), never from narration | yes | no | indirectly (richer portrayal) | yes (NPC+ gating) | no |
| `activeNpcPlus` (behavior gate) | derived from promotion + lifecycle/household conditions | no | yes | n/a | n/a | no |
| Player appearance | `player_characters[0]` profile | yes | no | one compact visible-appearance line | no | no |
| Portrait assets (avatar/full body/gallery) | `portraits[]` records + the asset store | metadata yes (bytes in the store) | no | **never** | **never** | selected role display |
| Canonical authored avatars | `data/canonNPCAvatar/` + registry (`src/app/canon-avatars.ts`) | no | no | never | never | display only |
| Calendar, season, observances | derived from `world_minute` (`src/world/calendar.ts`) | only `world_minute` | yes | yes (SSP line) | **no** | read model |
| Weather | derived from campaign id, climate profile, block (`src/world/weather.ts`) | no | yes | yes (SSP line) | **no** | read model |
| Environment exposure | authored per location (`environment_exposure`) | no (canon) | no | wording of the weather line | no | no |
| Heartstone recognition warmth | derived from membership/Keeper state (`heartstone-recognition.ts`) | no | yes | one compact line inside Heartstone | no | no |
| UI character capabilities | derived per projection (`character-capabilities.ts`) | no | yes | no | no | yes |
| Inventory selection, filters, search | browser state | no | n/a | no | no | yes |
| Equipment presentation (4 slots) | projection of item **category** (`inventory-ui-view.ts`) | no | yes | no | no | yes |
| Item icon/detail artwork | `item-visuals.ts` resolver (sprite > template > category glyph > placeholder) | sprite metadata only (non-authoritative) | yes | no | no | yes |
| Money | `snapshot.funds` (whole-number gold) | yes | no | SSP (gold) | yes | shown in Inventory header |
| Trade offers | `snapshot.trade_offers` (optional field; at most one active) | yes | no | authoritative note (pending/completed) | no (proposes create/update/withdraw only) | masked card (`trade-offer-view.ts`) |
| Relationships, knowledge, facts | `CampaignState` | yes | no | scoped | scoped | no |
| Retrieval index | derived from canon | no | yes | chunks only | grounding only | no |

## 5. Source map

```text
data/              authored canon (YAML): world lore, locations, characters, factions, concepts, canon NPC avatars
src/world          canon loader, validation, WorldStore, calendar, climate, weather, environment, travel, runtime scene state
src/campaign       CampaignState and domains: characters, items, inventory, households, knowledge, relationships, funds,
                   NPC+ (premium), player character, portraits, Heartstone charter and recognition, opening state
src/retrieval      exact, lexical, semantic and hybrid search (audience-safe)
src/turn           coordinator and stages, intent grammar, evidence and authorization, item/household evidence,
                   SSP, prompt builder, audit, movement/follow, reflection (shadow only), compaction
src/turn/narration-facts  the one narration reader: movement, commerce, dialogue/speaker, identity, recipient and reference facts,
                   the scene reading; descriptive only, imports no campaign / authorization / audit code
src/llm            OpenRouter narrator/controller/extractor/reflection/compressor providers; Hugging Face fal-ai image client
src/persistence    save format, migrations, campaign repository, recovery
src/app            GameSession, SessionHost, SessionView, read models (play, player, inventory, item visuals, canon avatars,
                   character capabilities), production wiring, autosave, item sprite jobs
src/ui             local playtest server (server.ts) and the vanilla client (index.html, client.js, style.css)
src/dev            developer CLIs and evaluation tools (never imported by production)
tests/             offline unit, domain, matrix, replay, UI and save/load tests
```

## 6. Related documents

[Current state](CURRENT_STATE.md) · [Configuration](CONFIGURATION.md) · [Image system](IMAGE_SYSTEM.md) · [Heartstone](HEARTSTONE.md) · [Actual Offer](architecture/ACTUAL_OFFER.md) · [NarrationFacts](architecture/NARRATION_FACTS.md) · [UI](UI.md) · [Testing](TESTING.md) · [Roadmap](ROADMAP.md) · [Documentation index](README.md)
