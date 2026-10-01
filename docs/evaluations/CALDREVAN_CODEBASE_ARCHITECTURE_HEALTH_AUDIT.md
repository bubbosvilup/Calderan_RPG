# CaldrevanRPG codebase architecture and health audit

**Audit date:** 2026-10-01  
**Scope:** read-only inspection of the current working tree, plus the requested report and JSON appendix. No source, data, test, configuration, save, commit, or provider state was changed.

## Executive summary

CaldrevanRPG is a TypeScript, YAML-authored, deterministic campaign engine with an LLM-assisted narration layer. Immutable YAML canon is validated and loaded into `WorldStore`; mutable campaign consequences live in an in-memory, validated `CampaignState`; a turn coordinator is the single orchestration point that combines deterministic player intent, bounded context, selective retrieval, narrator prose, controller proposals, evidence authorization, audit/reconciliation, and one atomic commit. The narrator writes prose and the controller proposes a restricted command vocabulary; neither has direct state mutation authority. Campaign state is snapshot-persisted through manual saves guarded by a canonical dataset fingerprint.

The current system is strongest at authority separation, atomic state changes, deterministic regression coverage, canon validation, and the recently completed Calderan travel graph. It is deliberately narrower than a general RPG simulator: NPC+ does not exist, the economy is limited to tracked funds and person transactions, physical consequences are tightly constrained, and natural-language interpretation is conservative. The full deterministic suite is green at **947/947**; the curated historical replay suite is green at **25/25**. These are strong evidence for implemented behavior, but not proof of live-provider reliability or broad gameplay completeness.

**CODEBASE HEALTH: 84% (medium confidence).** This is a healthy foundation with meaningful heuristic and live-model risk.  
**PROJECT MATURITY / PLAYABLE COMPLETENESS: 43% (medium confidence).** The implemented core is coherent, but several intended RPG systems remain absent or foundation-only.

Three strongest areas: immutable canon/runtime separation; prepare/commit transactional authority; deterministic travel and continuity regressions. Three biggest risks: LLM/regex interpretation coverage, a central and increasingly dense `TurnCoordinator` pipeline, and incomplete feature systems. The next recommended design target is an NPC+ architecture audit, not implementation, because the promotion/household/location foundations now exist but their long-term behavior model does not.

## Evidence conventions

- **Measured**: command output or an asserted test result from this audit.
- **Observed from code**: direct implementation inspection.
- **Documented**: current architecture/evaluation documentation.
- **Judgement**: audit assessment; not a measured claim.

## 1. Repository inventory

| Area | Role | Important contents | Classification |
|---|---|---|---|
| `src/world` | YAML loading, validation, immutable canon store, legacy/runtime projection, travel | `loader.ts`, `validation.ts`, `world-store.ts`, `travel.ts`, `runtime-domain.ts` | Production runtime |
| `src/campaign` | Durable campaign domains and transactional preparation | `campaign-state.ts`, `types.ts`, `characters.ts`, `items.ts`, `social.ts`, `legal.ts`, `promotion.ts` | Production runtime |
| `src/turn` | Turn orchestration, prompts, intent, evidence, audits, ephemeral people | `turn-coordinator.ts`, `player-intent.ts`, `natural-actions.ts`, `prompt-builder.ts`, authorization/audit modules | Production runtime |
| `src/scene` | Scene RAM, validated scene deltas, NarrativeContext projection | scene/context builders and delta validation | Production runtime |
| `src/retrieval` | Exact, lexical, semantic and hybrid read-only retrieval | service, lexical index, semantic index, Voyage adapter, hybrid fusion | Production runtime / optional provider |
| `src/llm` | Provider interfaces and OpenRouter adapters | GLM narrator, DeepSeek controller, schemas/client/errors | Production integration |
| `src/persistence` | Manual save envelope, strict JSON, filesystem repository/session | save format, recovery repository, session dirty tracking | Production runtime |
| `src/dev`, `scripts` | CLI, inspectors, paid evaluation and report harnesses | `play.ts`, `inspect-city.ts`, eval scripts, escape scanner | Dev/evaluation tooling |
| `data` | Authoritative YAML canon | locations, characters, factions, items, concepts, events, world lore | Authoring input |
| `city_map` | Canonical visual spatial source for authoring | `city_map.png` | Authoring input; not runtime loaded |
| `tests` | Unit, integration, replay and regression suites | 51 `*.test.ts` files; fixtures and retrieval eval | Test/evaluation |
| `docs/architecture`, `docs/authoring`, `docs/schemas` | Current contracts and authoring rules | architecture, schema and map/travel docs | Documentation |
| `docs/evaluations` | Historical and reproducible evaluation reports | pass reports and audit reports | Evaluation record |

**Measured:** 929 files under `src`, `data`, `tests`, `scripts`, and `docs` at audit time; 51 test files; YAML and TypeScript are the only material runtime authoring/implementation formats. `.build` is generated and ignored. `package.json` uses Node 22+, TypeScript 5.9, and `yaml` as its sole runtime dependency.

## 2. System architecture and data flow

```text
YAML canon + city_map authoring source
  -> loader / strict validation
  -> immutable WorldStore (dataset SHA-256 identity)
  -> CampaignState snapshot (runtime history)
  -> TurnCoordinator (captured snapshot + revision)
       -> player intent / deterministic travel / transaction pre-resolution
       -> bounded TurnContext + ephemeral scene-participant plan
       -> conditional retrieval
       -> narrator prompt -> streamed narrator draft
       -> controller proposal + evidence quotes
       -> evidence derivation / authorization
       -> CampaignState.prepare
       -> narration grounding / consequence / departure / transaction audits
       -> optional reconciliation or deterministic redaction
       -> CampaignState.commit (one batch, one revision)
       -> session-local recent conversation update
  -> manual save repository / next turn
```

`WorldStore` is read-only canon. `CampaignState` is the sole mutable authority for a campaign; it accepts validated commands, prepares against an expected revision, and commits a receipt only if it belongs to the current base snapshot. Scene and prompt objects are detached projections. Retrieval is read-only. The CLI owns a `CampaignSession`, not state semantics.

## 3. Authority model and state domains

| Domain | Authoritative owner | Derived / ephemeral | LLM writable? | Persisted? |
|---|---|---|---|---|
| Canon facts, entities, map topology | YAML -> immutable `WorldStore` | retrieval indexes/context | No | Source files, not saves |
| Player location, world time, mana, canonical-NPC overrides | `CampaignState.runtime` | Scene RAM, NarrativeContext, route diagnostics | Player intent; controller never directly | Yes |
| Created campaign characters | `CampaignState.characters` | scene presence/context views | Controller proposal only after authorization; deterministic promotion | Yes |
| Canonical authored NPC baseline | `WorldStore` | runtime location override/presence | No baseline mutation | Canon source |
| Items/ownership/equipment | `CampaignState.items` | item/context projections | Restricted proposal/evidence or deterministic player action | Yes |
| Legal state, funds, ledger | `CampaignState.legal_statuses/funds/transactions` | transaction/household prompt views | Deterministic transaction resolver, then prepared command | Yes |
| Households/rules | `CampaignState.households` | active bounded social projection | Proposal with explicit voluntary/declared evidence | Yes |
| Relationships | `CampaignState.relationships` | bounded qualitative headlines | Restricted controller proposal, never Nicco feelings | Yes |
| Facts/knowledge | `CampaignState.facts/knowledge` | authority projection and retrieval awareness | Restricted `set_knowledge` with tell evidence | Yes |
| Physical conditions | created character `current.conditions` | narration/context | restricted `set_condition` | Yes |
| Travel route | computed from `WorldStore` weighted graph | `TurnResult.travel` | No | Final location/time only |
| Ephemeral narrator people | `SceneParticipantRegistry` and recent text | per-session participants | Narrator prose creates presentation only | No |
| Identity promotion record | `origin_snapshot` in CampaignState | prompt origin view | deterministic name/purchase logic | Yes |
| Retrieval result/index | retrieval service/index | per-call diagnostics | No | No |
| Recent conversation | `RecentConversation` per coordinator/campaign object | prompt-only retained exchanges | narrator delivered output feeds it | No |
| Save file | validated campaign snapshot + metadata | dirty state/session | No direct | Yes |

**Critical distinction:** unknown means unestablished, not secret. Secret/narrator-only visibility is an explicit canon policy; campaign facts and knowledge edges are distinct from canon access.

## 4. Actual turn lifecycle

1. `TurnCoordinator.runTurn` captures campaign snapshot and revision, acquires a `WeakSet` turn lock, and checks cancellation.
2. It builds a base `TurnContext`, plans ephemeral participants, and resolves command grammar/natural actions. Deterministic actions include movement, wait, mana, item placement/removal, portions of person transactions, and carry routing.
3. Carry and transaction commands are pre-prepared against the base revision; invalid deterministic candidates are dropped before narration and reflected as outcome notes.
4. It prepares the combined player runtime commands to create a detached projected snapshot/context. This exposes a valid destination or carried person to narration without mutating campaign state.
5. Conditional retrieval ranks a five-result pool, returns at most three candidate references and at most one fetched record, then records diagnostics.
6. The narrator receives bounded prompt data: system policy, player input, projected scene/social state, action notes, retained conversation, selected retrieval, and participants. Streaming is async; draft text is buffered and capped at 24,000 characters.
7. After completed narration, the controller receives player action, prior state and finalized narration in a strict JSON-schema request. Its proposal is parsed/normalized but is not authority.
8. Deterministic evidence derives player intents, confirmations/refusals and references. Authorization compares controller commands to evidence, ownership, presence, age/romance and other command rules.
9. Candidate authorized commands, deterministic identity establishment/promotion, narrated movements and departures are prepared together. This is the final validation boundary.
10. Narration audit checks grounding, absent people, uncommitted handovers/purchases, legal/household claims, unsupported conditions/restraint and departure consistency. A reconciliation narrator call may repair a draft; deterministic redaction is the fallback.
11. The coordinator synchronously commits the prepared receipt. A changed batch increments revision exactly once; no-op batches do not. Then it stores only delivered finalized narration in `RecentConversation`, updates ephemeral participant continuity, publishes diagnostics/result, and releases the lock.
12. Save is separate: the CLI/session marks dirty by revision and writes only when `/save` is requested.

**Async boundaries:** retrieval, narrator streaming, controller request and optional reconciliation. **Stale protection:** each prepare requires captured revision; checks after async boundaries reject stale work. **Atomicity:** no authoritative mutation occurs until the final campaign commit. **Failure:** input/context/retrieval/provider/controller/audit failure yields a typed failed turn; partial drafts and uncommitted projections do not become campaign truth. Cancellation is checked before network phases and immediately before commit; committed state is not rolled back.

## 5. LLM responsibilities and boundaries

| Component | Current default | Receives | May do | Cannot do |
|---|---|---|---|---|
| Narrator | `z-ai/glm-5.2`, 512 output-token budget, OpenRouter streaming | bounded prompt/context, player input, retrieved canon, action notes | Produce draft prose | mutate state, invent player actions, decide a route, create authoritative facts, commit purchases/relationships/conditions |
| Controller | `deepseek/deepseek-v4-flash-0731:nitro`, max 512 | JSON envelope of player action, prior state, final narration | Propose schema-valid commands and exact evidence quotes | bypass evidence/authorization, invent IDs/facts, move Nicco, establish feelings for Nicco, imply membership/following, directly commit |
| Embeddings | optional Voyage provider when configured | authorized semantic document text | rank semantic candidates | mutate state/canon or replace lexical exact behavior |

Narrator output is audited/reconciled before delivery and cannot itself commit state. Controller JSON may be normalized structurally, but the same strict parser and deterministic authorization apply. The controller policy forbids unsupported constraint consequences and requires a short exact quote per proposed command. **Observed limitation:** this is a safety firewall, not a guarantee prose will be high-quality or every valid phrase will be recognized.

## 6. World and canon data model

Each YAML document has `schema_version: 1`, one entity and zero or more knowledge chunks. Entity IDs are permanent lowercase snake_case. Supported types are location, character, event, faction, item, concept and world_lore. Common records contain summaries/content/tags/search context and explicit knowledge policy. Validation rejects duplicate IDs/keys, unknown fields, unsupported YAML features, invalid references and malformed edges; `WorldStore` deep-freezes detached validated records and computes a canonical dataset hash.

`parent` means containment only. Location `connections` are directed travel edges requiring target, description and positive whole-minute cost, optionally `kind`; authors supply reciprocal travel deliberately. A location `entrance` is an explicit arrival node for a structural container; it is not a parent-derived edge. Chunks are retrievable passages with their own access policy. Canonical character profile fields are baseline authoring; mutable current state is not written to YAML.

The map is authoring-only. `city_map/city_map.png` is the authoritative visual source for Calderan subject to explicitly documented locked-label overrides. Runtime consumes YAML graph data, never the PNG.

## 7. Calderan spatial and travel system

**Measured:** 78 Calderan geography locations, 22 new road/street/gate/bridge/approach nodes, 156 directed edges, 8 raw components, largest 71-node pedestrian component, zero unreachable destinations and zero isolated concrete POIs. The seven isolated records are intentional structural containers (`calderan`, five districts, `heartstone`) with explicit entrances. Graph diameter is 106 minutes from `east_arterial_north` to `slave_market_back_back_alleys`.

The city has exactly two outer gates, North and southern Imperial, and exactly two Center wall gates, West and East. Grey Brook enters northwest, crosses Center, and exits southeast; four bridge nodes represent major crossings. Red roads are explicit arterial nodes; meaningful secondary links and POI access links model green/yellow connectivity without street explosion. Center/outer wall tests enumerate boundary edges, preventing graph bypasses.

`findRoute` uses positive-cost Dijkstra. It chooses the least total minutes; equal costs sort by full node-ID sequence in code-point order. `/go`, bare `go to`, `head to`, supported natural movement and explicit carrying share resolution. A successful route emits one runtime delta containing final location and total minutes. Carrying adds the carried created character to the same transaction and charges time once. No follower system exists: household/ownership/presence never moves someone automatically. Main benchmarks: Heartstone Square -> Slave Market 20m; Main Market 30m; West Gate 40m; Slave Market -> Heartstone LR 21m.

## 8. Character, identity and continuity systems

| Layer | Identity/location/persistence | Context behavior | Current boundary |
|---|---|---|---|
| Canonical authored NPC | permanent YAML ID; authored baseline location, runtime override if moved | physically present canonical NPC projection | baseline portrayal, no campaign-owned NPC+ state |
| Ephemeral narrator person | session participant label/reference; no durable ID | bounded to four recent scene participants | disappears after session/reload unless promoted |
| Campaign Character | generated durable ID; `origin`, profile, current location/status/conditions, immutable origin snapshot | present only at current scene | durable but not NPC+ |
| NPC+ / premium character | none | none | explicitly future |

Promotion is conservative. A securely established proper name promotes a narrator-created person. An unnamed purchased subject is the one transaction exception. Dialogue, healing, wounds, witnessing, gifts, emotional weight and rumors do not promote. `origin_snapshot` records trigger, revision/time/location, label, established facts and bounded source evidence; later profile changes cannot rewrite that immutable promotion basis. Late naming updates a pre-existing created person only when deterministic resolver evidence succeeds. Same-name people remain separate IDs; ambiguity does not merge them. Session labels are not globally reliable identity keys, which remains a known limitation.

Created characters use `current_location`; canonical NPC current location is runtime override state. `move_character` and `leave_scene` require established movement/departure. Explicit carry shares Nicco's resolved route; narrated following requires completed, resolvable movement evidence. Maren demonstrates purchase at the market, a 21-minute carried route to `heartstone_lr`, preserved holder/ID and seller left behind. Tomas demonstrates name promotion and no automatic co-movement: he stays at Heartstone Square while Nicco travels and surfaces on return. Both survive save/load.

## 9. Household, relationship, legal and economy systems

Households have a keeper/name, membership records (`guest`, `member`, `former_member`), and active/inactive player-declared rules. Joining/leaving needs the character's clear voluntary statement; `join_household` is not inferred from purchase, care, living there, invitation or location. Membership is independent of legal ownership and does not grant NPC+ state, following, romance or control.

Relationships are directed/sparse. Dimensions are trust, wariness, affection, protectiveness, respect, fear, hostility and romance, each none/low/moderate/high. `adjust_relationship` is one step, based on a character's clear evidenced behavior or words; it cannot establish Nicco's feelings. Romance requires two established adults. Prompt context uses bounded derived headlines/dimensions. Limitations: no decay, multi-turn social simulation, NPC autonomy, reputation, broad consent model, or relationship progression engine.

`PersonLegalState` is free/enslaved with one holder where enslaved and optional documentation/provenance. `transfer_person` and `manumit` create immutable ledger entries with transaction IDs preventing replay. Sales validate subject, holder/counterparty authority, available funds, payment and papers in one campaign prepare; anonymous seller provenance is a snapshot, not a character. Named sellers can be campaign characters. Brenna is the older purchase model; Maren exercises narrator-created promotion plus purchase. Purchase does not create household membership. Player funds are tracked in gold; a named tracked payee receives payment, while anonymous counterparty payment leaves tracked economy. Ordinary item commerce/pricing, wages, debts, markets and broader economy are not modeled.

## 10. Knowledge, retrieval and prompt context

Campaign facts have true/false/unknown content; knowledge edges are knows/believes/suspects/heard_rumor with provenance. Authoritative campaign knowledge persists until a future mechanic changes it. Canon access uses entity/chunk narrator/player visibility, `known_by`, and awareness (`public`, local, specialized, private). The builder does not infer knowledge from presence. `/tell` needs deterministic reference resolution plus supported narration evidence. A documented gap remains: restricted `known_by` grants are not yet generally surfaced as usable narrator knowledge when retrieval excludes secret passages.

Retrieval is read-only: exact identity resolution, filters, weighted lexical search, optional semantic cosine search and RRF hybrid fusion. Lexical is the offline default. Voyage embeddings are optional when `VOYAGE_API_KEY` or a trusted configured provider exists; semantic behavior has mechanics tests but less live quality evidence. Turn policy runs no retrieval when unnecessary; otherwise ranks pool 5, returns at most 3 references, fetches at most one record, caps retrieval payload at 10,000 serialized characters and records mode/IDs/query/latency. Search visibility filtering occurs before public result/ranking exposure. Retrieval output is evidence for narration, not truth or state.

Prompt/context contains a visibility-filtered primary scene, relevant persistent characters/items/facts/knowledge/events, bounded social state, player profile, retained finalized conversation, participants, retrieved canon and authoritative notes. It intentionally excludes raw `WorldStore`, raw `SceneRam`, full snapshot, all remote canon, raw indexes, controller debug and secrets unavailable to the relevant surface. Caps include 24 present people, 48 items, 32 facts, 96 knowledge edges, 16 events, 32,000 serialized turn context; NarrativeContext itself has 16,000 text characters; max four ephemeral participants; 12 finalized recent exchanges/16,000 serialized characters. Overages fail rather than silently truncate primary state.

`RecentConversation` stores player input plus delivered finalized narration, drops oversize exchanges, evicts oldest complete entries, does not persist, and starts empty after load/new campaign. Failed/partial narration is never replayed as fact; state-failed completed narration is retained as session diagnostic status but omitted from prompt replay. Its finalized location metadata supports promotion resolution but is not rendered into prompt history.

## 11. Persistence, physical state and time

Manual save only. `CampaignSession` derives dirty state from current revision versus last saved revision. The filesystem repository writes current and previous recovery files; save envelope is strict JSON, schema v1, max 16 MiB, timestamp-validated and dataset-hash-validated. A save persists the full `CampaignSnapshot`: runtime, created characters, items, households, facts, knowledge, relationships, goals, events, funds, legal statuses and transactions. It does not persist prompt context, indexes, embeddings, retrieval cache, prepared receipts, recent conversation, ephemeral participants or route cache. Old dataset saves require explicit future migration; no silent rebase exists.

Physical actions are player-authored candidate interactions. Persistent effects are intentionally narrow: controller may establish only minor injury, dazed, knocked_down or winded when narration says so. Restraint, detention, arrest, bans, death, incapacity and larger injury consequences are rejected/redacted absent future state support. This is safety-first but leaves extensive physical state prose-only.

Time is authoritative numeric world minutes. `/wait` and supported natural exact waiting advance it; travel adds route minutes atomically with location. Day rollover computes existing daily mana recovery (25), bounded by max. Failed route/provider/controller/commit leaves time/location unchanged. No calendar, weather, schedule execution loop, passage-of-time simulation, hunger, sleep or broader daily-state system is present.

## 12. Command surface

| Surface | Commands / purpose | Authority and persistence |
|---|---|---|
| Deterministic player runtime | `runtime_delta` for `/go`, natural movement, carry, `/wait`, `/mana`; `place_item`; limited deterministic transaction commands | validated before narration, prepared/committed atomically, persisted |
| Controller-proposed general commands | register/set profile/condition/slot, item registration/place/transfer, facts/knowledge, relationship/trust, goals/events, household and runtime delta | strict schema -> evidence authorization -> prepare -> commit; persisted |
| Controller-proposed household/legal/social extensions | funds, legal status, person transfer/manumit, membership/rules, qualitative relationship adjustment, character movement/departure | additionally checks authority, evidence, age, ownership/funds/presence; persisted |
| Post-narration deterministic logic | name establishment, promotion, carry propagation, narrated movement/departure interpretation, transaction-specific promotion | shares final preparation; persisted where it creates/updates campaign state |

All commands are in `CampaignCommand`; raw snapshot writes are not a public command. Known limits: the vocabulary is deliberately closed, item creation/commerce language is partial, goals/events have no world execution engine, profile updates are restricted, and controller command availability is narrower than type vocabulary in practice.

## 13. Defensive layers and player agency

Defenses occur after narrator/controller output but before commit: player-intent grammar; transaction/carry prevalidation; scene/presence checks; `deriveTurnEvidence`; deterministic authorization; campaign validation; grounding/narration audit; household/legal/condition/departure checks; optional reconciliation; deterministic redaction fallback; revision lock/checks. Narrator drafts cannot cause durable state merely by asserting it. Controller proposal is explicitly distinct from authorization. Uncommitted handovers/purchases and absent characters are audited against prose. Reconciliation produces a corrected delivered narration; if that fails, redaction protects state truth.

Nicco's agency is protected by limiting deterministic player effects to player input, prohibiting narrator-invented deliberate actions, preventing controller relationship state *from* Nicco, excluding quotations as evidence unless explicitly supported, and treating movement/transactions as player-owned actions. Remaining weakness: natural-language classifiers and quote attribution are regex/heuristic systems; false negatives are safe but can make valid player intents feel unresponsive, and false positives need regression vigilance.

## 14. Test and evaluation architecture

**Measured:** `npm run typecheck` passed. `npm test` passed 947/947, with 0 skipped/cancelled/failed. `npm run test:playthrough` passed 25/25 curated cases. The deterministic suite includes schema/loader tests, canonical world and geography checks, CampaignState domain tests, scene/context tests, retrieval/semantic tests, coordinator integration, authorization/audit regressions, household/legal/transaction tests, save/load/recovery tests, narrator persistence/promotion/location continuity, and city route/graph tests.

Unit tests isolate validation, route finding, state domain preparation, text classifiers and retrieval components. Integration tests run `TurnCoordinator` with scripted narrator/controller fixtures and inspect committed snapshots/prompt projections. Historical replay parses selected CSV records into offline replay assertions; it checks supported mechanics, not historical canon or generic human dialogue quality. Online evaluation scripts call OpenRouter/Voyage when credentials are intentionally configured; they are paid evaluation tools and are not part of the green deterministic count. Fixture narration is not live-model validation.

The historical corpus has 25 curated replay records selected from a broader CSV source, covering dialogue, continuity, equipment, agency, time, knowledge, household, movement, ownership, scheduled events and multi-NPC cases. It validates deterministic handling/reconciliation against those selected examples only. It does not measure long-form play quality, unseen phrasing distribution, provider uptime/cost, safety under arbitrary prompts or canon completeness.

## 15. Coupling and fragility audit

| Hotspot | Severity | Failure mode / safety | Existing mitigation |
|---|---|---|---|
| `TurnCoordinator` central orchestration | High | ordering regressions across intent, projection, narration, controller, audits and commit; generally fail closed | transaction receipts, typed failures, extensive integration tests |
| Natural action, name/pronoun and departure regexes | High | false negatives or wrong attribution; occasionally unsafe if a classifier overmatches | bounded grammar, evidence requirements, ambiguity rejection, regression tests |
| Narration audit/reconciliation | High | prompt/prose may contradict state or over-redact | layered deterministic audits, reconciliation then redaction |
| Controller model formatting/evidence | Medium-high | invalid JSON/weak quote causes failed turn or dropped change | strict schema, structural normalization, evidence authorizer, fixture/online evaluations |
| Retrieval ranking and visibility | Medium | relevant canon missed or secret context unavailable | audience-specific indexes, exact mention priority, diagnostics; known `known_by` gap |
| Prompt/context caps | Medium | valid scene becomes `context_too_large` rather than degrading | hard limits and failures, compact projection; no summarization strategy |
| CampaignState command growth | Medium | type/validator/domain handlers drift | one union, prepare path, snapshot validation and domain tests |
| Canon/map synchronization | Medium | YAML graph diverges from human map interpretation | map canon docs, graph metrics/tests; image itself is manually interpreted |
| Save dataset compatibility | Medium | canon changes make old save unloadable | SHA-256 gate and recovery files; no migration yet |
| Physical/social/economy scope gaps | Medium | prose pressure exceeds modelled state | constrained controller policy/audits; intentional feature limitation |

No dependency-cycle evidence was observed from TypeScript compilation. Persistence is comparatively isolated behind repository interfaces. WorldStore is a strong boundary. The main maintainability concern is concentration of complex policy in `turn/*` and long regex-heavy modules rather than low-level mutable-state design.

## 16. Health dimensions and weighted score

Scores combine measured tests/implementation facts with audit judgement. Weights favor correctness/security foundations over incomplete optional gameplay.

| Dimension | Score | Weight | Contribution | Basis |
|---|---:|---:|---:|---|
| A Architectural clarity | 86 | 9 | 7.74 | clear canon/runtime/context boundaries; coordinator is dense |
| B State authority/correctness | 91 | 10 | 9.10 | one campaign owner, strict validation/freeze |
| C Atomicity/transactional safety | 91 | 9 | 8.19 | prepare/receipt/one revision, rollback tests |
| D Test coverage | 88 | 10 | 8.80 | 947 deterministic passing; live coverage limited |
| E Determinism | 90 | 8 | 7.20 | weighted routes, ordering, no LLM route/state authority |
| F Persistence robustness | 82 | 6 | 4.92 | strict saves/recovery/hash; no migrations/autosave |
| G Narrator safety/grounding | 81 | 7 | 5.67 | audits/reconciliation; prose remains heuristic |
| H Controller authorization safety | 88 | 7 | 6.16 | schema/evidence/prepare barriers |
| I Character continuity | 83 | 5 | 4.15 | promotion/location/serialisation covered; no NPC+ |
| J World/canon consistency | 86 | 5 | 4.30 | strict data validation/map graph tests; manual authoring sync |
| K Travel/spatial consistency | 91 | 5 | 4.55 | graph metrics/boundary/time tests |
| L Retrieval architecture | 76 | 4 | 3.04 | layered/filtering strong; semantic/live and known-by gaps |
| M Maintainability | 74 | 4 | 2.96 | strict TS/tests; complex coordinator/regex policy |
| N Extensibility | 78 | 3 | 2.34 | typed domains/hooks; command/prompt complexity grows |
| O Runtime performance/latency | 72 | 2 | 1.44 | bounded context and sequential safeguards; two model calls/reconciliation can be slow |
| P Observability/diagnostics | 82 | 2 | 1.64 | route/evidence/retrieval/debug records; no production telemetry dashboard |
| Q Live-model robustness | 61 | 2 | 1.22 | some paid checks; no broad statistical/live soak evidence |
| R Gameplay completeness | 48 | 2 | 0.96 | solid core but many RPG systems absent |
| **Weighted total** |  | **100** | **84.38** | rounded to **84%** |

**CODEBASE HEALTH: 84% — healthy but with meaningful known risks or incomplete subsystems.** Confidence is **medium**: deterministic evidence is extensive, but score components for maintainability, live-model robustness and completeness necessarily include judgement and there is no full production telemetry/soak dataset.

## 17. Project maturity and system matrix

**PROJECT MATURITY / PLAYABLE COMPLETENESS: 43% (medium confidence).** This measures implemented RPG scope, not code quality. It is reduced by absent NPC+, reputation/rumor/economy/employment systems, limited conditions/item commerce, no UI, deferred Heartstone floors and limited live-model validation.

| System | Status | Confidence | Notes |
|---|---|---|---|
| YAML canon/validation/WorldStore | COMPLETE | High | strict immutable authored data boundary |
| Campaign state/revision/atomic commit | COMPLETE | High | tested prepare/commit snapshot model |
| CLI/manual save/load | FUNCTIONAL | High | no UI/autosave/migration |
| Narrator/controller loop | FUNCTIONAL | Medium | live output remains probabilistic |
| Evidence/authorization/audit | FUNCTIONAL | Medium-high | narrow grammar and heuristics |
| Calderan weighted travel | COMPLETE | High | current mapped scope, not city simulation |
| Character promotion/location continuity | FUNCTIONAL | High | narrow triggers, no NPC+ |
| Households/relationship/legal trade | FUNCTIONAL | Medium-high | no autonomous social simulation |
| Funds/person trade | PARTIAL | High | no ordinary market economy |
| Items/equipment | PARTIAL | Medium-high | limited natural language/commerce |
| Knowledge/secrets | FUNCTIONAL | Medium | no forgetting/overhearing, known-by gap |
| Lexical retrieval | FUNCTIONAL | High | bounded read-only pipeline |
| Semantic/hybrid retrieval | PARTIAL | Medium | optional provider; limited quality validation |
| Physical conditions | FOUNDATION ONLY | High | narrow condition set only |
| Goals/schedules/world consequences | FOUNDATION ONLY | High | records exist; no richer execution loop |
| NPC+ / premium household people | NOT IMPLEMENTED | High | documented next boundary |
| Reputation, rumors, duties, employment | NOT IMPLEMENTED | High | deferred |
| UI/visual map interaction | NOT IMPLEMENTED | High | developer CLI only |

## 18. Critical invariants

1. Canon is not runtime history; YAML remains immutable during play.
2. `parent` is containment, not travel; `entrance` is explicit metadata, not an implicit edge.
3. Map PNG is authoring evidence, not runtime dependency.
4. Narrator prose cannot directly mutate CampaignState.
5. Controller proposal is not authorization; evidence and validation are required.
6. A campaign change is prepared against one revision and committed as one batch; changed batches increment once.
7. Failed/stale/cancelled turns do not commit projected state.
8. Unknown is not hidden; explicit visibility governs secret handling.
9. No automatic persistence from narrative importance; promotion has narrow triggers.
10. No ownership/household/presence-derived following; character movement needs explicit carry or completed movement evidence.
11. Purchase, legal ownership and household membership are independent.
12. Retrieval/ranking is read-only and does not authorize facts or state.
13. Manual save is the only normal persistence action; current dataset hash must match on restore.
14. Conditions requiring next-turn constraints must be represented or narration must not establish them.

## 19. Runtime versus authoring boundary

| Boundary | Contents |
|---|---|
| Authoring-time | YAML entities/chunks, map PNG, schema/authoring docs, canonical placement and travel topology |
| Runtime | WorldStore load, CampaignState, context, retrieval, providers, coordinator, command preparation, manual save |
| Evaluation-only | fixtures, historical replay extraction, paid model/evidence/narrator evaluations, reports |
| Dev/debug | CLI, context/search/city/save inspectors, debug `TurnResult`, scan scripts |

## 20. Deferred work and next-phase readiness

Documented deferred work groups: **character/NPC+** (premium household behavior, profile evolution, durable autonomous social layer); **social simulation** (rumors, reputation, consent/deeper relationship progression); **world consequences** (goals/events execution, broader conditions, dynamic consequences); **economy** (ordinary purchases, wages, pricing/debts/commerce); **movement** (distant routes, boats, richer map authoring, future Heartstone floors); **retrieval** (known-by propagation, semantic quality/production evidence, BM25/tool-loop decisions); **narrator/controller** (broader language coverage, live robustness); **UI/dev** (player-facing UI/telemetry); **persistence** (version migration); **canon** (unwritten interiors, regional topology).

NPC+ audit readiness is **good, with conditions**. Ready foundations: stable created IDs, immutable promotion snapshots, explicit locations, household/legal/relationship/funds domains, save/load, bounded context, no-follow invariant, and continuity tests. Main interference risks: ambiguity/late-name limitations, session-only ephemeral participants, dense coordinator policy, no long-term consequence scheduler, and unclear NPC+ ownership of conditions/goals/knowledge. An architecture audit can safely begin now; implementation should wait until authority boundaries, migration impact and narrator/context budgets are explicitly designed.

## 21. Top risks and strengths

### Top 10 current risks

| Rank | Risk | Severity / likelihood / impact | Existing mitigation | Recommended future action |
|---:|---|---|---|---|
| 1 | Regex/heuristic language interpretation | High / medium / high | ambiguity rejection, evidence/audits/tests | corpus-led grammar and property tests before widening |
| 2 | Live narrator/controller variance | High / medium / high | schema, quotes, audit/reconciliation | repeatable live soak/eval matrix and failure telemetry |
| 3 | Coordinator complexity | High / medium / high | typed stages, integration tests | stage contracts and focused decomposition audit |
| 4 | Prompt cap failure under scale | Medium / medium / medium | hard fail/no silent truncation | explicit summarization/relevance architecture |
| 5 | Save incompatibility after canon evolution | Medium / high / medium | dataset hash/recovery | versioned migration design |
| 6 | `known_by` restricted knowledge gap | Medium / medium / medium | prevents leak | define safe narrator knowledge projection |
| 7 | NPC+ feature pressure | Medium / high / medium | promotion snapshots/household boundaries | audit authority/memory/agency first |
| 8 | Map/YAML divergence | Medium / low / medium | docs/graph tests/inspector | repeatable authoring review/checklist |
| 9 | Economy/physical prose exceeds state model | Medium / medium / medium | audit blocks escalated claims | staged domain expansion decisions |
| 10 | No UI/autosave/telemetry | Low-medium / high / medium | CLI/manual saves/debug | product-layer and operations design |

### Top 10 strengths

1. Immutable canon plus distinct runtime snapshot prevents gameplay writes from corrupting world data.
2. Prepare/commit receipts, revision checks and full-batch validation give a credible transactional core.
3. Narrator, controller, evidence and authorization are explicitly separated rather than trusting one model output.
4. Strict YAML/schema/reference validation protects authoring integrity and deterministic loads.
5. Deterministic 947-test suite covers failures as well as success paths.
6. Current travel graph uses weighted deterministic paths, wall constraints, bridges and atomic time.
7. Character promotion is conservative and preserves immutable provenance instead of importance scoring.
8. Household, legal and relationship state deliberately remain separate, avoiding common conflation bugs.
9. Context/retrieval are bounded and visibility-aware; raw world data is not blindly passed to models.
10. Manual save format has strict JSON, dataset compatibility and recovery semantics.

## 22. Reproducible current metrics

| Metric | Value | Evidence |
|---|---:|---|
| Typecheck | pass | `npm run typecheck` |
| Deterministic tests | 947/947 pass; 0 skipped | `npm test` |
| Curated replay | 25/25 pass | `npm run test:playthrough` |
| Test files | 51 | filesystem count |
| Total world locations | 96 | current city pass report/tests |
| Calderan locations | 78 | `inspect-city` |
| Directed city edges | 156 | `inspect-city` |
| Pedestrian component | 71 | `inspect-city` |
| Isolated concrete POIs | 0 | `inspect-city` |
| Raw components | 8 | seven intentional containers plus pedestrian graph |
| Revision semantics | one increment per changed atomic batch | code/tests |
| Context caps | 24 people, 48 items, 32 facts, 96 knowledge, 16 events, 32k serialized | `context-builder.ts` |
| Recent memory | 12 finalized turns / 16k serialized chars | `recent-conversation.ts` |
| Retrieval pool/results | 5 / 3 | `retrieval-policy.ts` |
| Narrator/controller | GLM 5.2 / DeepSeek V4 Flash Nitro | provider defaults |
| Narrator output budget | 512 tokens | `turn-services.ts` |
| Save bound | 16 MiB | strict save JSON |

## Appendix: source references

Primary current references: `src/campaign/campaign-state.ts`, `src/campaign/types.ts`, `src/turn/turn-coordinator.ts`, `src/turn/context-builder.ts`, `src/turn/evidence-authorization.ts`, `src/turn/narration-audit.ts`, `src/world/validation.ts`, `src/world/travel.ts`, `src/persistence/save-format.ts`, `src/retrieval/*`, [Campaign State](../architecture/CAMPAIGN_STATE.md), [City Travel](../architecture/CITY_TRAVEL.md), [Turn Coordinator](../architecture/TURN_COORDINATOR.md), [Persistence](../architecture/PERSISTENCE.md), and the recent spatial/continuity/household evaluation reports.

CALDREVAN CODEBASE ARCHITECTURE HEALTH AUDIT COMPLETE
