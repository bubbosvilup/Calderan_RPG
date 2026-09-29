# CaldrevanRPG

**Phase 1L: Turn Coordinator & First Playable Loop — ready with fixes**

CaldrevanRPG is a planned AI-driven persistent RPG engine for long-running roleplay.
The foundation loads and validates world YAML, exposes immutable canonical records,
maintains separate in-memory locations/time/player mana, applies validated atomic scene deltas,
and derives Scene RAM plus bounded, visibility-checked NarrativeContext. Runtime
revisions optionally guard scene proposals against stale context. The Phase 0 canon
architecture remains its basis. Read-only retrieval now supports exact resolution,
structured filters, bounded fetches, and audience-safe weighted lexical search.
Voyage semantic indexing and hybrid fusion have been evaluated. The campaign-state
model now adds character continuity, possessions, households, knowledge, directed
trust, goals and scheduled events through validated atomic in-memory commands.
Manual filesystem save/load now preserves validated campaign snapshots directly,
with current/previous recovery and session dirty tracking. There is no autosave.
OpenRouter now provides streamed MiniMax narration and strictly validated DeepSeek
controller proposals. A revision-safe coordinator now authorizes proposals and commits
atomic in-memory turns; `npm run play` provides a developer CLI with explicit saves.
Narrator adherence and natural-language authorization coverage remain documented limitations.
Lexical remains the offline default developer search mode.

The model must never receive the entire world database every turn. Coordinated turns
combine core instructions, player persona, visibility-checked NarrativeContext,
bounded recent conversation/continuity, and optional retrieved secondary knowledge.
Raw Scene RAM is internal and must not be sent to the narrator.

## Layout

```text
docs/
  architecture/       Naming, scene RAM, retrieval, Phase 1 decisions
  schemas/            Entity and knowledge chunk contracts
  authoring/          Authoritative writing guide and seven templates (not runtime data)
data/
  world/              world_lore: fundamentals, history, cultures, races, magic, religion
  locations/          Location entities
  characters/         Character entities
  factions/           Faction entities
  items/              Item entities
  concepts/           Concept entities
  events/             Discrete historical event entities
src/
  types/              TypeScript contracts and deep read-only types
  dev/                Read-only context and search inspection commands
  core/               Reserved: orchestration and context policy
  world/              YAML loader, validation, canonical store, runtime state
  campaign/           Typed durable domains, validated preparation/commit, state views
  persistence/        Manual JSON repository, direct restore validation, save sessions
  scene/              Scene RAM, delta validation, and narrative context projection
  retrieval/          Exact resolution, policy, lexical/semantic indexes, hybrid fusion
  llm/                Reserved: provider and tool calling integration
tests/                Validation, hierarchy, movement, time, and isolation tests
```

Reserved directories contain no implementation and may be omitted by Git until used.
`data/world/history/` is for historical narrative lore; `data/events/` holds individual
events with structured time, location, and participant fields.

Entities have globally unique, permanent lowercase snake_case IDs. Names and state
may change without changing identity. Location ancestry follows explicit `parent`
references, never string parsing.

Entities hold identity, structured metadata, and a short introduction. Knowledge
chunks hold independently retrievable passages. Scene RAM records the current
scene, separately from durable world records and conversation. This separation
supports metadata filtering, selective retrieval, and future persistent updates.
Authored files remain immutable during gameplay, with Git as the initial canon
history system. Runtime consequences are stored separately. The authoritative scene
holds player location and numeric world time; NPC presence is derived from locations.

World files use UTF-8 YAML for readable multiline prose and comments. Each file holds
one `entity` and its `chunks`, with a `schema_version`. YAML is an authoring format,
not a database choice. Heartstone root, LR, CY, U1, and F1 now contain supplied,
explicitly classified physical canon. F2–F6 remain unauthored. The original
non-canonical `l1` placeholders were retired; details are recorded in the authoring guide.

## Read next

- [Turn coordinator, playable CLI, historical corpus and measured limitations](docs/architecture/TURN_COORDINATOR.md)
- [LLM providers, online commands, security boundaries and measured latency](docs/architecture/LLM_PROVIDER.md)
- [Manual persistence, restore and recovery guarantees](docs/architecture/PERSISTENCE.md)
- [Campaign state model and mutation boundaries](docs/architecture/CAMPAIGN_STATE.md)
- [Naming conventions](docs/architecture/NAMING.md)
- [Authoritative authoring guide and templates](docs/authoring/AUTHORING_GUIDE.md)
- [Entity schema](docs/schemas/ENTITY_SCHEMA.md)
- [Knowledge chunks](docs/schemas/KNOWLEDGE_CHUNKS.md)
- [Scene RAM](docs/architecture/SCENE_RAM.md)
- [Retrieval](docs/architecture/RETRIEVAL.md)
- [Phase 1F retrieval APIs and completion report](docs/architecture/RETRIEVAL_FOUNDATION.md)
- [Phase 1G lexical search and evaluation decisions](docs/architecture/LEXICAL_SEARCH.md)
- [Reproducible retrieval quality report](docs/architecture/LEXICAL_SEARCH_EVALUATION.md)
- [Phase 1H semantic/hybrid APIs, provider setup, and readiness](docs/architecture/SEMANTIC_SEARCH.md)
- [Accepted Phase 1 decisions](docs/architecture/PHASE_1_DECISIONS.md)
- [Runtime foundation and API](docs/architecture/RUNTIME_FOUNDATION.md)
- [Scene Delta Engine](docs/architecture/SCENE_DELTA_ENGINE.md)
- [Narrative Context](docs/architecture/NARRATIVE_CONTEXT.md)
- [Phase 1E canon inventory and mana rules](docs/architecture/PHASE_1E.md)
- [Phase 1E.1 geography, city hierarchy, and map authoring](docs/authoring/GEOGRAPHY.md)
- [Phase 1E.2 audit, findings, and roadmap](docs/architecture/PHASE_1E_2_AUDIT.md)

Use Node.js 22 or later. From the project root:

```text
npm ci
npm test
npm run typecheck
npm run inspect:context -- heartstone_lr
npm run inspect:search -- "border fortress"
npm run inspect:search -- --debug "iron coal mining"
npm run inspect:search -- --mode hybrid "church investigators"
npm run eval:retrieval
```

`npm test` compiles and runs all automated tests, including loading the existing
Heartstone YAML. `npm run build` emits JavaScript to ignored `.build/`. The sole
runtime dependency is `yaml`; TypeScript and Node types support development.
The inspector loads only `data/`, uses a temporary runtime at minute 0/revision 0,
and pretty-prints the production NarrativeContext. It writes no canon/saves and
never bypasses visibility. Use `npm run --silent inspect:context -- heartstone_lr`
for JSON without npm's lifecycle banner. The legacy narrator interface and test mock
remain compatible; Phase 1K adds separate generation providers and Phase 1L adds the restricted turn coordinator. Phase 1E adds 22 compact
lore/institution records and player mana, including deterministic day-boundary recovery.
Phase 1E.1 adds 19 geographic locations, including Calderan as West's capital and
the main-city parent. Its five districts remain lore in this step. Geography is
semantic, without image dependencies or travel routes. Phase 1F adds deterministic
retrieval infrastructure without changing canon. Phase 1G adds a rebuildable,
audience-specific lexical index and a 44-case evaluation suite. Known vocabulary
and conceptual limitations are recorded in the quality report. Phase 1H adds
provider-independent semantic infrastructure and RRF fusion, with offline synthetic
mechanics tests. No production embedding adapter is bundled/configured; semantic
quality metrics are pending. `eval:retrieval` reports lexical metrics and explicit
semantic/hybrid availability. Heartstone F2 and graphical UI remain deferred. The playable
CLI, offline historical replay and paid evaluation are described in TURN_COORDINATOR.md.
