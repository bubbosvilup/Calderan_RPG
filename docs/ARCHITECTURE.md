# Caldrevan architecture

Status: Current. Last reconciled: 2026-10-12 (main c0608a6). Source of truth: the current main working tree (code first, then tests, then authored data).

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
TurnCoordinator                   src/turn/turn-coordinator.ts  (orchestrates typed stages in src/turn/stages/)
  ↓ intent + projection → retrieval → context
Narrator (draft prose, streamed)  src/llm/openrouter/minimax-narrator.ts  (provider class name is historical)
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

Contractual order (from the coordinator): input → intent/projection → retrieval → narration (draft) → controller (proposal) → authorization → final preparation → audit/reconciliation → commit preparation → checkpoint → one commit → publication. Stages never mutate `CampaignState`; `campaign.prepare` is only a validation capability. A stale revision after any await rejects the turn (`stale_turn`); there is no rebase or replay. Controller failure never commits.

Evidence rule: a change needs the player's own words or a completed event in the narration. Requests, plans, hints, hedges and refusals authorize nothing. Where the evidence layer cannot be sure it fails closed (a false negative is preferred to a false commit).

## 2b. Player-authorized state transitions

The governing model above is unchanged. Some **high-impact** transitions add one step between proposal and commit:

fiction / LLM interpretation → structured pending action → **player confirmation** → engine validation → atomic commit

Low-impact state (most ordinary facts, movement, item handoffs) is still inferred and proposed automatically. Explicit confirmation is preferred only where the change is high-impact, irreversible or expensive, semantically ambiguous, and easy to understand in a compact UI surface. It is **not** "everything gets a button". The UI exposes the action and is never independent truth: the client sends only a ref and `expected_revision`, and `GameSession` resolves the authoritative payload. Two cases today:

| Transition | Fiction | Confirmation | Authority |
| --- | --- | --- | --- |
| Heartstone rite / NPC+ promotion | the player roleplays the ceremony; prose is never read as completion | the ↑ "Promote to NPC+" action | `GameSession.completeHeartstoneRite` → eligibility → join Heartstone household → sync NPC+ promotion → one revision; Controller `join_household` into Nicco's Heartstone is rejected ([Heartstone](HEARTSTONE.md)) |
| Trade | goods offers are structured by the Controller, person offers are read from narration | Accept on the Actual Offer card | `GameSession.acceptTradeOffer` → `accept_trade_offer` → atomic settlement ([Actual Offer](architecture/ACTUAL_OFFER.md)) |

A `TradeOffer` is a pending proposal; a transaction is committed state; acceptance is the boundary. Settlement stays domain-specific (goods are items, people go through the legal-transfer system). The trade card is also a human-verification surface and uses player-visible identity only (hidden names, ids and avatars never reach it). This is a documented pattern, not a code superclass.

## 3. What each model sees

Three separate channels are built from authoritative state. Nothing sends the whole campaign or the whole transcript every turn.

- **Narrator-facing context** (`src/turn/prompt-builder.ts`, `narrator-pack.ts`, `context-builder.ts`): compact, human-readable, narration-safe, free of technical ids, visibility-checked (the narrator never receives what the player character could not know). It carries a stable policy, the player's compact visible-appearance line, the `[CURRENT SCENE]` block, a bounded recent-scene narration window, and any retrieved background grounding.
- **Scene State Projection** (`src/turn/scene-state-projection.ts`, `scene-state-focus.ts`, `scene-state-render.ts`): location, date/time/season/observance, outside weather, who is present and in what state, who carries and who owns what, mana and gold, knowledge scopes, relevant household and schedule. Derived, deterministic, read-only, not persisted, selected by relevance. It states only what Nicco knows; omission never means a detail is false. See [Scene State Projection V1](architecture/SCENE_STATE_PROJECTION_V1.md).
- **Controller-facing context**: structured and actionable. It does carry ids and the mutation-relevant state it needs (items, positions, household, knowledge scopes). It receives **no** calendar or weather and no UI state.
- **Retrieval / background grounding** (`src/retrieval`, `background-grounding.ts`): a separate supplementary channel of canon chunks selected by explicit policy. Informational only.

**Identity requests and person trades (replay fidelity pass 2; settlement since superseded by [Actual Offer](architecture/ACTUAL_OFFER.md): a person sale is a pending offer settled only by the player's Accept, not by prose).** Objective identity is the engine's; the label the player knows is a separate fact. A name request ("who am I talking with?", `src/turn/identity-request.ts`) resolves an unfamiliar actor to the canonical person only through name-request-scoped exclusive matching (`EXCLUSIVE_TRAITS` in `canonical-interaction-targets.ts`: exactly one eligible canonical actor fits and every other matches no trait); generic weak casting is unchanged. Person purchases read the recent narration through `narrated-captives.ts` (plain RPG speech counts as speech; a name presented as "This is X." / "That's X." / "X, the man says" binds to the one woman or man described; a pronoun in speech follows the last person mentioned) and the persisted conversation partner (`#focus`, kept across deal turns, bound to descriptor speakers). All of it only reads authoritative narration; commits still go through `transfer_person` and the usual authorization.

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
src/llm            OpenRouter narrator/controller/extractor/reflection/compressor providers; Hugging Face fal-ai image client
src/persistence    save format, migrations, campaign repository, recovery
src/app            GameSession, SessionHost, SessionView, read models (play, player, inventory, item visuals, canon avatars,
                   character capabilities), production wiring, autosave, item sprite jobs
src/ui             local playtest server (server.ts) and the vanilla client (index.html, client.js, style.css)
src/dev            developer CLIs and evaluation tools (never imported by production)
tests/             offline unit, domain, matrix, replay, UI and save/load tests
```

## 6. Related documents

[Current state](CURRENT_STATE.md) · [Configuration](CONFIGURATION.md) · [Image system](IMAGE_SYSTEM.md) · [Heartstone](HEARTSTONE.md) · [Actual Offer](architecture/ACTUAL_OFFER.md) · [UI](UI.md) · [Testing](TESTING.md) · [Roadmap](ROADMAP.md) · [Documentation index](README.md)
