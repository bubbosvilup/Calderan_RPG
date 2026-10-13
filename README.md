# CaldrevanRPG

## What It Is

Caldrevan is a deterministic engine for long-running, AI-narrated roleplay. The world is the continent Helion; a campaign starts in the West, at the Calderan slave market, where the player character Nicco, an otherworlder, holds the Heartstone Tower. One language model writes the prose of each turn and a second one proposes state changes. The engine decides what is true: authored canon, who is where, who owns what, what each character knows, money, legal status, household membership, and every change to any of it.

It runs locally: a small web UI (`npm run play:ui`) plays persistent campaigns with manual save and autosave.

## Core Design Rule

> **LLMs describe and propose; the engine owns truth.**

Nothing a model writes becomes campaign state until the engine has validated it, found evidence for it and committed it atomically. Where the engine cannot be sure, it fails closed: a missed change is preferred to a false one. Prose the player reads always matches what was committed.

## Runtime Architecture

The order below is the one `TurnCoordinator.runTurn` (`src/turn/coordinator/turn-coordinator.ts`) executes; the typed stages live in `src/turn/stages/`.

```text
Player input
  -> GameSession                     src/app/game-session.ts (one facade for any UI; SessionHost owns the campaign lifecycle)
  -> TurnCoordinator                 intent, Scene State Projection, retrieval, bounded context
  -> Narrator                        produces the CANDIDATE narration (a buffered draft, never shown before the commit)
  -> State Controller                reads the draft and bounded state; returns a separate structured PROPOSAL (commands only)
  -> NarrationFactSource             ONE per turn, reads only the Narrator candidate text (draft, revision, delivered), never the proposal
  -> authorization                   combines the Controller proposal, the player's input and the narration facts:
                                     schema validation, evidence authorization, domain policies over the facts
  -> CampaignState.prepare           the whole candidate batch against the base revision (validation only, never a mutation)
  -> narration audit                 reads the SAME NarrationFactSource; revise once, then redact
  -> commit preparation              the delivered text's facts from the SAME source (name establishment, person offers)
                                     join the batch; CampaignState.prepare again; expected_revision check
  -> ONE atomic CampaignState.commit owns truth
  -> derived read models (SessionView, play / player / inventory views) and the next turn's context
```

A turn is one transaction. The browser sees only neutral progress words (`thinking`, `narrating`, `resolving`) and then the audited, committed narration once. Every request carries a `turn_key` and `expected_revision`: the same key never runs twice and a stale revision is rejected before any provider call. A truncated Narrator answer is never used (one bounded regeneration, otherwise the turn fails without committing). After the commit the turn has succeeded; later publication problems are warnings.

The Narrator receives a compact, id-free, visibility-checked context, including the derived `[CURRENT SCENE]` block (location, date and time, weather, who is present, who carries and owns what, gold, relevant household). The Controller receives structured state with ids and no calendar or weather. Retrieval is informational only.

## NarrationFacts

`src/turn/narration-facts/` is the one place where the engine reads what a narration says. The turn coordinator creates a single `NarrationFactSource` per turn over the Narrator's candidate text and hands it to authorization, the audit and commit preparation. The Controller's proposal is not a fact input: authorization weighs it against these facts. The source yields:

- **movement facts:** who moved, arrived, departed, followed or stayed; location claims (which never move anyone);
- **commerce facts:** price quotes, withdrawals, and payment / transfer / settlement claims (narration can never settle a trade);
- **dialogue and speaker facts:** every spoken line with its speaker and attribution method (explicit tag, post-hoc delivery tag, direct name, adjacent action beat, continued speaker), or ambiguous;
- **identity facts:** self-introductions, names given for someone else, who a line is addressed to, and who a sentence can refer to (the same name is never a merge);
- **the scene reading:** narrated people, captives, name introductions and late namings across the current scene.

> **Facts describe. Policies decide. CampaignState owns truth. The audit verifies against the same facts.**

Facts carry no policy. Policies live outside the layer (`movement-evidence.ts`, `commerce-evidence.ts`, `attributed-speech.ts`, `person-offers.ts`, `name-establishment.ts`, `partner-identity-guard.ts`, `canonical-name-disclosure.ts`). Source-level tests pin the shape (`tests/architecture/narration-facts-consumers.architecture.test.ts`). Details: [NarrationFacts](docs/architecture/NARRATION_FACTS.md).

## Authority Model

Every action has an impact class, and the class decides how it reaches state:

| Class | Examples | Path |
| --- | --- | --- |
| A, low impact, reversible | ordinary movement, scene focus | inferred from evidence, no confirmation |
| B, important but verifiable | name disclosure, NPC movement and follows, item pickup, escorting a held person | committed only on strong evidence; ambiguity is a safe rejection |
| C, irreversible or high impact | trade settlement, NPC+ promotion, manumission, identity repair, keeping a provisional person | explicit player action through a ref- and revision-guarded entry point |

Class C uses four explicit actions: **Accept** on the Actual Offer card, **Promote to NPC+** (the Heartstone rite), **Keep track** on a temporary person in the scene, and **Confirm** on a `PendingConfirmation` card (manumission, operator-requested retire / merge). The client sends only an opaque ref (a token for Keep track) and `expected_revision`; the server loads the authoritative payload. A pending action is never world state and the Narrator sees it as "not completed". Details: [Architecture](docs/ARCHITECTURE.md).

## Character Lifecycle

A character is **PROVISIONAL**, **PERSISTENT** or **RETIRED**. This is an identity lifecycle, separate from the NPC tiers (canon NPC, Campaign NPC, NPC+, player character).

- **Provisional:** a person the Narrator introduces or names. Scene-local and never saved as a character. A named one is read again from the restored recent exchanges after a reload; a temporary scene participant is not.
- **Persistent:** a record in the campaign snapshot, entered from Provisional only by an explicit act:

```text
PROVISIONAL --[ Keep track ]------------------------------> PERSISTENT (ordinary Campaign NPC)
PROVISIONAL --[ Accept a person Actual Offer ]------------> PERSISTENT (with the purchase, in the same revision)
```

  **Keep track** is the player's own action on one exactly identified temporary person in the scene sidebar: the browser sends an opaque token and `expected_revision`, the server recomputes the scene and commits one `register_character` (or answers `already`). It keeps the same person (established name, sex, age, appearance, the scene ref as provenance) and nothing else: no household, NPC+, legal status, ownership, relationship or inventory. It refuses the subject of an open offer, two temporary people sharing a name, and a name a persistent or canon character already has (names are never merged). Accept remains the domain-authorized path. Separately, the engine records campaign state for a canonical character a turn changes (an implicit canonical-origin record, AUTH-5 in the debt register); that is never a narrated stranger. Narration, a narrated name, a self-introduction, repeated appearances, the player's typed words, the Controller and the audit can never create a persistent character. A kept person can later become NPC+ through the Heartstone rite.
- **Retired:** kept, never deleted or reactivated; reached only through a human-reviewed, confirmed repair (`retire_character`, `merge_characters`).

A present unnamed persistent character who introduces themself is named in place (same id). A canonical person is never duplicated as a narrated stranger.

## Persistence

Campaigns live in `saves/campaigns/<campaign_id>/` (save file schema 8, persisted snapshot schema 8). A save is written with an atomic rename, carries up to 32 terminal turn receipts for idempotency, and is recoverable. Optional enrichment and media bookkeeping (Reflection notes, mannerism learning, item sprite status, the portrait Gallery) live in side stores `optional/learning.json` and `optional/media.json`; they never move the semantic revision. Derived data (calendar, weather, capabilities, equipment presentation, item icon metadata) is never saved. Details: [Persistence](docs/architecture/PERSISTENCE.md).

## Optional Services

Reflection, Mannerism learning, portrait generation, item sprite generation, sprite QA and semantic retrieval are optional services outside the correctness boundary (`src/app/optional-services.ts`). They run detached after the turn completes, never hold the turn lock, and never change a turn's outcome. **Disabling any of them leaves core behavior identical.** Defaults: Mannerism, portraits and sprites ON; Reflection, sprite QA and semantic retrieval OFF. Flags: `CALDREVAN_REFLECTION_MODE`, `CALDREVAN_MANNERISM_LEARNING`, `CALDREVAN_PORTRAIT_GENERATION`, `CALDREVAN_ITEM_SPRITES`, `CALDREVAN_SPRITE_QA`, `CALDREVAN_SEMANTIC_RETRIEVAL`. Details: [Optional services](docs/architecture/OPTIONAL_SERVICES.md).

## Trade

Trade uses **Actual Offer**: an offer is a pending proposal shown as a card; only the player's Accept settles it, atomically and at most once.

- Goods BUY and SELL are proposed by the Controller; person BUY is read deterministically from the narration through NarrationFacts (the speaker of a price line must be an established seller; a price addressed to somebody other than Nicco is not an offer).
- One active offer at a time; a new seller quote supersedes the old one; counteroffers happen in chat.
- Settlement is whole-number gold only. SELL transfers the same item. No vendor stock, wallets, Auction House or person SELL.
- A narrated payment or "the deal is done" never settles anything; the audit withdraws such claims.

Details: [Actual Offer](docs/architecture/ACTUAL_OFFER.md).

## Movement

Nicco travels between authored locations; minutes elapse on the campaign clock. Another character moves only through evidence: a completed narrated movement of that same person, or the deterministic escort of a held person the player names and leads ("Alright Maren, let's go home"), committed in the same batch as Nicco's travel. Who may follow is derived per turn (active NPC+, held persons, household members, people invited by name) and never persisted. A location claim in the prose ("she is at the tower") never moves anyone; the audit flags narration that shows a person somewhere state does not.

## Images

Portraits and item sprites are generated through the Hugging Face router on `fal-ai` (`Qwen/Qwen-Image` with the Raena anime LoRA), billed to `HF_TOKEN`. Avatar (992 x 992) and Full Body (800 x 1200) roles, batches of three, a Gallery, an appearance fingerprint that marks older images stale, adult-only generation. Six canonical NPCs have authored avatars in `data/canonNPCAvatar/`. Images never become narrative truth and never reach the Narrator or the Controller. Details: [Image system](docs/IMAGE_SYSTEM.md).

## Project Structure

```text
data/             authored canon (YAML): world, locations, characters, factions, concepts; canonNPCAvatar/
config/           economy.yaml (narrator price anchors, outside the hashed data set)
src/world/        canon loader and validation, WorldStore, calendar, climate, weather, environment, travel
src/campaign/     CampaignState and its domains: characters, items, households, knowledge, relationships, funds,
                  trade, NPC+, player character, portraits, Heartstone
src/turn/         the turn pipeline, one folder per domain (Repository Cleanup D); the root keeps only cross-domain
                  modules (turn-types, recent-conversation, player-intent, natural-actions, rpg-dialogue, temporal-*)
  coordinator/    TurnCoordinator, turn diagnostics, narrator ledger      stages/   intent .. result pipeline stages
  context/        TurnContext, prompt builder, compaction, Scene State Projection, retrieval policy, NPC+ context
  identity/       canonical casting, name establishment and reservation, provisional people, Keep track, speakers
  authorization/  evidence and command authorization, turn/household evidence, pending proposals, contracts
  audit/          narration, grounding and pending-confirmation audits
  movement/ items/ commerce/   movement and follow; item intent and references; Actual Offer, trade and prices
  optional/       Reflection and Mannerism (optional services)      structured/   the Reflection schema/validation/wire
  language/       text, number and gate primitives
  narration-facts/  the one narration reader (movement, commerce, dialogue, identity facts; scene reading)
src/scene/        scene RAM and narrative-context builders
src/retrieval/    exact, lexical, semantic and hybrid search (audience-safe)
src/llm/          OpenRouter Narrator / Controller / extractor / reflection providers; Hugging Face image client
src/persistence/  save format, migrations, campaign repository, recovery
src/app/          GameSession, SessionHost, SessionView and read models, optional services, production wiring
src/economy/      reference prices and selective narrator injection
src/ui/           local web UI server (server.ts, play.ts) and vanilla client
src/types/        shared types
src/dev/          developer tools by purpose: support/, inspect/, benchmark/, maintenance/, live/ (spends credits),
                  historical/ (reproduction only); never imported by production code
tests/            offline tests in domain folders (tests/<domain>/<behavior>.test.ts); support/, fixtures/, frozen/;
                  tests/benchmark/ holds the modern regression benchmark
scripts/          clean and check commands; browser/ (offline browser checks), evaluation/, historical/
docs/             documentation (start at docs/README.md)
saves/            campaign saves (local)
```

## Development

Node.js 22 or later.

```text
npm ci
npm run clean                     # delete .build/ (cross-platform)
npm run typecheck                 # tsc --noEmit
npm run build                     # clean, then compile to .build/ (always from empty)
npm test                          # build, then every offline test (no live LLM or image call)
npm run benchmark:modern          # modern regression benchmark (offline, scripted providers)
npm run check:architecture        # read-only module cycle check over src/
npm run check:docs                # read-only link check of the current documentation
npm run play:ui                   # persistent campaigns at http://127.0.0.1:3000 (Ctrl+C saves and stops)
npm run play:ui -- --playtest     # disposable session, never saved
npm run inspect:scene             # offline [CURRENT SCENE] scenarios
npm run inspect:time              # offline calendar / weather matrix
npm run inspect:context           # offline context inspection
npm run inspect:search            # offline retrieval inspection
npm run inspect:save              # inspect a save file
```

Live play and the live tools (`play`, `play:ui`, `inspect:narrator`, `inspect:controller`, `bench:llm`, `inspect:turn`, `benchmark:controller`, and the harnesses in `src/dev/live/`) need `OPENROUTER_API_KEY`; image generation needs `HF_TOKEN`. Keys are read from the environment only; never write them to a file. Models and every other variable: [Configuration](docs/CONFIGURATION.md).

## Testing

`npm test` compiles the project and runs the whole offline suite with faked or injected providers: unit and domain tests, matrix and replay tests, persistence and migration, UI read models, canon validation, determinism guards, and source-level architecture assertions. `npm run benchmark:modern` runs small independent end-to-end scenarios (a real `GameSession`, `TurnCoordinator` and file repository with scripted models) over movement, identity, Keep track, trade, person trade, household, persistence, authority and fail-closed behavior; a scenario marked as a known product gap fails the day it unexpectedly passes. Live certification harnesses live in `src/dev/` and spend credits; they are never run by `npm test`. `.build/` is disposable compiled output: every build, test run and benchmark starts by deleting it, so a compiled test whose source was removed can never run; local private output goes to the gitignored `artifacts/local/`, and committed evidence lives under `docs/evaluations/`. Details: [Testing](docs/TESTING.md).

## Current Status

The engine is complete for its current scope and the architecture consolidation is finished (consolidation blocks 1 to 12): turn reliability, player-authorized actions, the character lifecycle with Keep track, the core / optional split, the regression benchmark and NarrationFacts. Latest offline run: 3679 tests, 0 failed; benchmark 55 scenarios, 55 pass, no known product gap. Property, equipment mechanics, quests, combat and the Weather UI are not built. Authoritative status: [Current state](docs/CURRENT_STATE.md).

## Known Product Gaps

The benchmark currently records no known product gap. Known limitations:

- Temporary scene participants (an unnamed "guard" the player addressed) are forgotten on reload unless kept; named provisional people are re-read from the restored recent exchanges (PER-2B).
- Settlement is gold only; the narrator's price anchors may mention silver (ECO-1). No goods ledger (TRD-11).
- No Property system or containers, no equipment slots or equip / unequip, no encumbrance, no Weather UI, no avatar upload.
- Speaker attribution fails closed: a line after a plural beat, or a pronoun with two candidates of that sex, belongs to nobody.

Full list: [Roadmap: known limitations](docs/ROADMAP.md#known-limitations) and the [Master Technical Debt Register](docs/MASTER_DEBT_REGISTER.md).

## Roadmap

The long view and its order live in the [Master Roadmap](docs/MASTER_ROADMAP.md); day-to-day status is in [Roadmap and known limitations](docs/ROADMAP.md). Next: Weather UI, then the Property / Heartstone property work.

## Documentation

- [Documentation index](docs/README.md): current architecture, status and guides, separated from historical evidence
- [Current state](docs/CURRENT_STATE.md) · [Architecture](docs/ARCHITECTURE.md) · [NarrationFacts](docs/architecture/NARRATION_FACTS.md) · [Actual Offer](docs/architecture/ACTUAL_OFFER.md) · [Persistence](docs/architecture/PERSISTENCE.md) · [Optional services](docs/architecture/OPTIONAL_SERVICES.md)
- [UI](docs/UI.md) · [UI engine contract](docs/UI_ENGINE_CONTRACT.md) · [Image system](docs/IMAGE_SYSTEM.md) · [Heartstone](docs/HEARTSTONE.md) · [Configuration](docs/CONFIGURATION.md) · [Testing](docs/TESTING.md)
- [Authoring guide](docs/authoring/AUTHORING_GUIDE.md) · [Entity schema](docs/schemas/ENTITY_SCHEMA.md)
- Historical evidence (block and milestone reports, audits, live runs; never updated to match the present): [docs/evaluations/](docs/evaluations/README.md)
