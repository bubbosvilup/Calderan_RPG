# CaldrevanRPG

A deterministic engine for long-running, AI-narrated roleplay. The model writes the prose; the engine owns the truth: world canon, who is where, who owns what, what each character knows, and every change to any of it.

**Status:** the engine is frozen and ready for UI work, with documented non-blocking debt, and the movement/follow subsystem is frozen too. The next phase is the UI, built on one seam, `src/app` (`GameSession`). Verified: 2,849 tests (0 fail, 0 skipped, 0 todo) after the Scene State Projection work, a 25-turn offline playthrough, and earlier live runs against the real providers (the final movement closure is verified offline; its live probe is prepared).

## How a turn works

1. **Context.** Canon, campaign state and recent turns are projected into a bounded, visibility-checked context. The narrator never sees the whole database or anything the player character could not know. A derived, never-saved **Scene State Projection** turns current runtime truth (location, time, who is present and in what state, who carries and who owns what, mana and gold, knowledge scopes, relevant household and schedule) into one id-free `[CURRENT SCENE]` block, selected by deterministic relevance.
2. **Narration.** The narrator streams prose.
3. **Control.** A second model proposes state changes (moves, items, household, relationships, knowledge). Proposals are only proposals.
4. **Authorization.** Each change needs evidence: the player's own words or completed events in the narration. Nothing moves, transfers or joins on a request, a plan or a hint.
5. **Audit.** Prose that contradicts state is revised once, then redacted, so what the player reads always matches what was committed.
6. **Commit.** One atomic, revision-guarded commit. Saves are manual and recoverable.

## Where things are

```text
data/        authored canon (YAML): world lore, locations, characters, factions, items
src/world    canon loader, validation, runtime scene state
src/campaign durable state: characters, items, households, knowledge, trust, NPC+ development
src/retrieval exact, lexical, semantic and hybrid search (audience-safe)
src/turn     turn coordinator and its stages, language gates, movement and follow grammar, audit
src/llm      OpenRouter narrator and controller providers
src/persistence manual save/load with recovery
src/app      application facade for a UI: GameSession, SessionView, errors, turn trace
src/dev      developer CLI and evaluation tools (never imported by production)
tests/       unit, matrix, replay and playthrough tests
docs/        architecture, authoring guide, UI contract, evaluation reports
```

## Run it

Node.js 22 or later.

```text
npm ci
npm run typecheck
npm test                  # compiles and runs everything offline
npm run test:playthrough  # the 25-turn offline playthrough
npm run inspect:scene     # prints the offline [CURRENT SCENE] scenarios (synthetic data, no network)
npm run play              # developer CLI (needs OPENROUTER_API_KEY; Voyage is optional)
npm run play:ui           # immersive disposable playtest at http://127.0.0.1:3000 (Ctrl+C to stop)
```

API keys are read from environment variables only. Never write them to a file.

The UI starts a disposable Slave Pens campaign with an authored opening. Set `OPENROUTER_API_KEY` in the launching shell for live turns; optional `OPENROUTER_NARRATOR_MODEL`, `OPENROUTER_CONTROLLER_MODEL`, and `MANNERISM_EXTRACTOR_MODEL` use the existing production defaults. No key is needed to read the opening. Reload retains the current process's transcript; restarting discards the campaign. UI V1 adds a household panel, P11 daypart/location header, safe RPG typography and live provisional narrator streaming; audit replaces each draft with the finalized story. See [UI V1 report](UI_V1_IMMERSIVE_PLAYTEST_INTERFACE.md) and the [V0 playtest report](docs/evaluations/UI_V0_PLAYTEST_SHELL.md).

## Read next

- [UI engine contract](docs/UI_ENGINE_CONTRACT.md) and [engine freeze rules](docs/ENGINE_FREEZE_PRE_UI.md): start here for the UI.
- [Engine capabilities before UI](docs/ENGINE_CAPABILITIES_PRE_UI.md)
- [Scene State Projection](docs/architecture/SCENE_STATE_PROJECTION_V1.md) and its [foundation certification](docs/evaluations/SCENE_STATE_PROJECTION_FOUNDATION_CERTIFICATION.md): the narrator-facing integration layer new domains plug into (see its integration contract).
- [Turn coordinator](docs/architecture/TURN_COORDINATOR.md), [LLM providers](docs/architecture/LLM_PROVIDER.md), [campaign state](docs/architecture/CAMPAIGN_STATE.md), [persistence](docs/architecture/PERSISTENCE.md)
- [Authoring guide](docs/authoring/AUTHORING_GUIDE.md) and [entity schema](docs/schemas/ENTITY_SCHEMA.md)
- [Debt register](docs/evaluations/CALDREVAN_DEBT_REGISTER_AFTER_PASS_10.md) the [movement and follow debt closure](docs/evaluations/CALDREVAN_MOVEMENT_FOLLOW_DEBT_CLOSURE.md) and the latest [final movement debt closure](docs/evaluations/CALDREVAN_FINAL_MOVEMENT_DEBT_CLOSURE.md)

## Known limits

- Every persistent character has one authoritative location, independent of Nicco: a known place, or off-scene after a narrated departure with no destination. The scene is only who shares Nicco's place. A UI must read this from state, never from narration.
- Pronoun and ornate follow phrasings that the grammar does not recognise fail closed: the follow is not recorded and the audit may remove it.
- Retrieval is lexical by default; semantic search needs a Voyage key.
- The `[CURRENT SCENE]` block shows only facts Nicco knows and is relevance-filtered: omission never means a detail is false. Character Knowledge Access remains the hard permission gate. Some earlier prompt blocks still repeat a few descriptive lines (see the certification, section 18).
