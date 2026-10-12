# CaldrevanRPG

A deterministic engine for long-running, AI-narrated roleplay set on the continent Helion. The model writes the prose and proposes changes; the engine owns the truth: world canon, who is where, who owns what, what each character knows, and every change to any of it.

**Status:** the engine is complete for its current scope and a local web UI plays persistent campaigns with autosave. Property, equipment mechanics, quests, combat and the weather UI are not built yet. See [Current state](docs/CURRENT_STATE.md) for the authoritative status and [Roadmap](docs/ROADMAP.md) for what is next. The full documentation index is [docs/README.md](docs/README.md).

## How a turn works

1. **Context.** Canon, campaign state and recent turns are projected into a bounded, visibility-checked context. The narrator never sees the whole database or anything the player character could not know. A derived, never-saved **Scene State Projection** turns current runtime truth (location, time, who is present and in what state, who carries and who owns what, mana and gold, knowledge scopes, relevant household and schedule) into one id-free `[CURRENT SCENE]` block, selected by deterministic relevance.
2. **Narration.** The narrator streams prose.
3. **Control.** A second model proposes state changes (moves, items, household, relationships, knowledge). Proposals are only proposals.
4. **Authorization.** Each change needs evidence: the player's own words or completed events in the narration. Nothing moves, transfers or joins on a request, a plan or a hint.
5. **Audit.** Prose that contradicts state is revised once, then redacted, so what the player reads always matches what was committed.
6. **Commit.** One atomic, revision-guarded commit. Saves are persistent (manual plus autosave) and recoverable.

## Where things are

```text
data/         authored canon (YAML): world lore, locations, characters, factions, canon NPC avatars
src/world     canon loader, validation, WorldStore, calendar, climate, weather, environment
src/campaign  durable state: characters, items, households, knowledge, NPC+, player character, portraits, Heartstone
src/retrieval exact, lexical, semantic and hybrid search (audience-safe)
src/turn      turn coordinator and stages, evidence and authorization, scene state projection, audit
src/llm       OpenRouter providers; Hugging Face fal-ai image client
src/persistence save format, migrations, campaign repository, recovery
src/app       GameSession, SessionHost, read models, production wiring, autosave, sprite jobs
src/ui        local web UI server and vanilla client
src/economy   P8 Economic Baseline V1 reference prices (config/economy.yaml), selective narrator injection
src/types     shared type helpers
src/dev       developer CLI and evaluation tools (never imported by production)
tests/        offline unit, matrix, replay and UI tests
config/       economy.yaml (outside the hashed data/ dataset)
scripts/      dev, browser-check and live evaluation scripts (some spend credits)
docs/         documentation (start at docs/README.md)
```

## Run it

Node.js 22 or later.

```text
npm ci
npm run typecheck
npm test                  # compiles and runs everything offline; no live LLM or image calls
npm run inspect:scene     # offline [CURRENT SCENE] scenarios
npm run inspect:time      # offline calendar/weather matrix
npm run play:ui           # persistent campaigns at http://127.0.0.1:3000 (Ctrl+C saves and stops)
npm run play:ui -- --playtest   # disposable session, never saved
```

API keys are read from environment variables only; never write them to a file. Live turns need `OPENROUTER_API_KEY`; image generation needs `HF_TOKEN`. Everything else is optional: see [Configuration](docs/CONFIGURATION.md).

## Read next

- [Documentation index](docs/README.md), [Current state](docs/CURRENT_STATE.md), [Architecture](docs/ARCHITECTURE.md), [Roadmap](docs/ROADMAP.md)
- [UI engine contract](docs/UI_ENGINE_CONTRACT.md), [UI](docs/UI.md), [Testing](docs/TESTING.md)
- [Authoring guide](docs/authoring/AUTHORING_GUIDE.md) and [entity schema](docs/schemas/ENTITY_SCHEMA.md)

## Known limits

See [Roadmap: known limitations](docs/ROADMAP.md#known-limitations).
