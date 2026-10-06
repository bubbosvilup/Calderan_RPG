# P12 Immediate Scene Continuity / Memory Audit

Date: 2026-10-06. Source baseline: `743cb88`. Status: **OPEN / AUDIT COMPLETE / DESIGN DECISION PENDING**. Production code changed: **NO**.

## 1. Executive summary

The first proven failure is **projection, not storage**. `RecentConversation` retains full delivered prose, but production `buildNarratorPrompt` defaults to `dialogue_focused`. For correctly formatted RPG output, `rpgDialogue` removes everything inside narration asterisks. The next request contains player input and NPC speech, with `narrator_description: "omitted; current structured state is authoritative"`. Narrator-established door, restraint, packet and room-position facts can therefore disappear after **one turn**, while the complete prior paragraph remains in memory.

A separate state divergence exists for ordinary canonical NPCs. In the controlled Korvin reproduction, `*Korvin's retreating back is halfway down the path, then he is gone.*` survived delivery, but his placement remained in the hall. A `leave_scene(korvin)` proposal was rejected because he was neither a created character nor an active household NPC+. The possessive departure wording also escaped the completed-departure audit. Next context said he was present and omitted the departure prose. This does not prove the unknown historical runtime had that exact placement; it proves a current reproducible failure class matching the supplied example.

Seven frozen production-model requests completed. Explicit diagnostic facts preserved closed door, tied wrists and seated hearth position. A deliberately conflicting full-prose request instead followed “Korvin is gone” despite current structured presence: **compliance with state precedence is not guaranteed**. Simply replaying all narration is therefore not a complete fix for runtime divergence.

Primary classification: **A + B + D**, with **C independently demonstrated in the conflict diagnostic**. Existing history is enough to test a small projection repair; a new scene-fact database is not yet justified.

Evidence limitation: the user supplied historical excerpts, not the complete delivery transcript, original prepared requests, runtime snapshots or commit receipts. Workspace search did not locate that exact sequence. A clarification was requested while independent work continued. Exact historical prices, gold, placements and per-turn commits remain **AMBIGUOUS**. Controlled traces are explicitly distinguished below from historical evidence. Old pre-P11 time contradictions are excluded from this diagnosis.

## 2. Existing continuity architecture

`WorldStore` validates and freezes authored canon. `CampaignState` owns the current immutable campaign snapshot and atomic typed commits. `RuntimeState` supplies initial canonical placements and a detached compatibility projection; it is not a free-form scene memory. `buildSceneRam` derives geography and canonical co-location. `buildNarrativeContext` projects location/canon, clock/resources and present authored actors. `buildTurnContext` merges campaign characters, items, social/legal/household state and knowledge. The narrator focus projection chooses attention, not physical placements.

`TurnCoordinator` holds session-local `RecentConversation` and `SceneParticipants` beside the campaign. Its pipeline resolves player intent, projects a proposed snapshot, retrieves permitted lore, prepares the narrator request, obtains narrator/controller drafts, derives bounded evidence, authorizes commands, prepares the whole batch, audits/reconciles narration, prepares identity/contracts, commits once, then publishes final history and participant metadata.

Sources: [campaign-state.ts](src/campaign/campaign-state.ts), [runtime-state.ts](src/world/runtime-state.ts), [scene-ram-builder.ts](src/scene/scene-ram-builder.ts), [narrative-context-builder.ts](src/scene/narrative-context-builder.ts), [context-builder.ts](src/turn/context-builder.ts), [turn-coordinator.ts](src/turn/turn-coordinator.ts).

No universal current-scene fact store, mutable location-feature state, pending delivery simulation or generic prose-to-state extractor exists. Authored `ItemEntity.state` is immutable canon, not a runtime door/prop state domain.

## 3. RecentConversation behavior

[recent-conversation.ts](src/turn/recent-conversation.ts) stores `{player, narration, status, location_id?, conversation_partner_id?}`. Both player input and **delivered audited narration** are retained as text without summarization. No per-sentence actor IDs, prop state or general diegetic facts are extracted into this record. Location and resolved canonical partner are session metadata. `forPrompt()` excludes failed entries and strips location metadata; the prompt projector consumes partner metadata for continuity/attribution but does not replay the record as authoritative state.

Bounds: **12 finalized exchanges**, **16,000 serialized characters**, and at most 24 total entries including failed ones. Oldest complete entries are evicted first. An individually oversized exchange is discarded entirely; its narration is not truncated. Failed records can consume serialized space and eventually affect eviction even though they never enter narrator history. A failed turn is recorded only when narration exists and no finalized record was published; only shown text is retained, never an undelivered draft. Drafts, failed revisions, controller output and audit diagnostics do not become recent facts.

RPG dialogue is separated **at projection**, not at storage. Balanced starred narration is removed; speech outside stars is replayed as up to 12 lines, at most 400 characters per line. Unbalanced/unsafe formatting can yield no dialogue. Legacy quoted prose uses bounded deterministic speaker attribution; unresolvable speech can be omitted. Player history survives this default filtering, subject to identity masking in the complete prompt.

Compaction does not rewrite the stored recent entries. History survives scene changes within the same coordinator/campaign: `forPrompt()` has no current-location filter. Scene-local deterministic resolvers may separately use retained `location_id`. A fresh loaded session does not persist recent history; campaign saves contain structured state, not these session buffers. Narrator alternatives use separately stored frozen requests and do not enter history, mutate the campaign or replace its delivered narration; alternate regeneration has no controller/commit path.

Recency probes at depths **1, 2, 3, 5 and 12** retained the entire initial narration, yet the default next request omitted it at every depth. Existing diagnostic `full_prose` mode retained it at those depths. At depth **13**, the first short exchange was evicted normally. Applying compaction to the default request did not restore the already omitted prose. See [deterministic-summary.json](docs/evaluations/p12-scene-continuity/deterministic-summary.json), containing exact entries and requests at each depth.

## 4. Scene RAM behavior

Scene RAM is a **derived co-location/geography snapshot**, not a narrative scratchpad. It contains `player_location`, `world_time`, current authored location entity, authored ancestry and present canonical NPC IDs. Created campaign people enter the wider TurnContext through campaign-character placements; they are not automatically canonical Scene RAM actors.

| Delivery concern | Representation / owner |
|---|---|
| Korvin location | Authoritative canonical placement in `runtime.npc_locations`; RAM derives presence from co-location or OFF_SCENE |
| Purchased created woman location | Authoritative `campaign.characters[].current.current_location`; wider TurnContext merges her if present, rather than bare canonical RAM |
| Household membership | Authoritative household domain; projected in TurnContext social data, not bare RAM |
| Legal ownership/status | Authoritative legal/transaction domains; projected in social data, not bare RAM |
| Papers | Documentation status can be structural legal provenance. A physical packet needs a registered item/position; a narrated packet alone is recent prose |
| Restraints | No dedicated mutable restraint relation. Host-supplied conditions or a registered equipped cord can carry explicit data, but ordinary restraint prose does not create them |
| Front door state | Authored door feature may exist; no mutable feature-open/closed field/command. Closure is player/recent prose only |
| Table/hearth/sofa position | No local position coordinates or seat relation. Coarse room location only; prose can describe movement within it |
| Conversation partner | Session participant plan/focus and recent partner metadata; not RAM |
| Recent arrival/departure | Typed placement when authorized; otherwise prose/evidence/diagnostics or temporary departed flag, not a general RAM event log |
| Foreground/background | Derived narrator attention in `narrator-focus.ts`; does not write presence or sub-location |

## 5. NarrativeContext projection and exact next requests

Each controlled case records before/after state, first delivered text, complete retained history, next prepared narrator request, second result, exact Scene RAM, wider context, participants and focus in [the evidence directory](docs/evaluations/p12-scene-continuity). `scene_ram_before_second` captures the raw canonical co-location projection; `context_before_second.primary` captures the projected primary scene. [fixture-world.json](docs/evaluations/p12-scene-continuity/fixture-world.json) preserves the complete noncanonical world definition.

For normal door/restraint/packet/position cases, the first starred paragraph survives the pipeline and is retained in full; the next semantic history contains, in substance:

```json
[{"player":"Hello.","npc_dialogue":[],"narrator_description":"omitted; current structured state is authoritative"}]
```

Current-state blocks list room-level actors and social state, but no closed door, tied wrists, packet-on-table or hearth seat. Retrieved lore is empty in these non-lore probes; static location content names a door/table/bench/hearth without mutable status. Time is day 0 / Late Morning under unchanged P11. No secret actor/reference or time-model change is introduced.

Focus foregrounds addressed people and actors in resolved commands/player events; previous canonical partner can persist briefly when attention does not shift. Canonical background entries preserve identity and `present: true`, while withholding full portrayal/current detail; names in lore are masked to background labels. Created persistent people remain in the broader character projection. Background focus does not remove a person from runtime and does not recover omitted scene prose. A generic background observable label is not an authoritative current entrance/hearth position.

The G reproduction's next request lacks its “gone” narration but still contains Korvin as present, at least in the compact background roster. F differs: its prior player `*closes the front door*` remains in history even though the narrator acknowledgment is omitted. See [G_korvin_departure.json](docs/evaluations/p12-scene-continuity/G_korvin_departure.json) and [F_player_door.json](docs/evaluations/p12-scene-continuity/F_player_door.json).

## 6. Narrator-to-state authority boundary

Narration never directly writes campaign state. The controller proposes a closed typed vocabulary; authorization requires eligible references plus bounded player/draft evidence. Some deterministic narrator-evidence proposals supplement controller omissions for eligible movements. The whole batch is validated/prepared before one commit; narration is audited against it, with one bounded revision and deterministic redaction if necessary. Commit preparation adds narrowly scoped delivered identity disclosures/promotions and NPC+ contracts, not arbitrary scene facts.

| Described change | Current support |
|---|---|
| “Korvin leaves” | Runtime supports canonical LOCATED/OFF_SCENE, but gameplay movement/departure authorization permits authored NPCs only when active household NPC+. Ordinary canonical Korvin is ineligible. Explicit recognized uncommitted departures should be withdrawn; some wording escapes the bounded audit |
| Created woman “steps inside” to a distinct known node | Can authorize `move_character` on eligible completed movement evidence; controller/derived proposal, exact destination and grammar validation required |
| Woman crosses within the same room | No room-internal position change; stays room-located and relies on scene prose |
| “He closes the door” | No feature-state command. Player-authored closure also has no structural door mutation |
| “Restraints come off” | No general restraint lifecycle. Explicit equipment placement/removal may affect a registered item; ordinary cord prose does not. Gameplay `set_condition` is additive, closed physical vocabulary, tied to same-turn interaction/evidence; it is not a bound/unbound switch |
| “Hands over papers” | Existing registered items can be transferred by resolved player intent plus evidence. Mere narration cannot create a packet, grant ownership, place it on a named table or repeat legal delivery |
| Purchase/payment | Deterministic player transaction resolver can prevalidate and commit promotion/legal transfer/funds atomically; narrator-only sale prose cannot substitute |
| Household joining | Separate authorized membership change; purchase/staying in a room does not automatically join a household |

Sources: [authorization.ts](src/turn/stages/authorization.ts), [command-authorizer.ts](src/turn/command-authorizer.ts), [evidence-authorization.ts](src/turn/evidence-authorization.ts), [person-transactions.ts](src/turn/person-transactions.ts), [commit-preparation.ts](src/turn/stages/commit-preparation.ts), [audit.ts](src/turn/stages/audit.ts).

## 7. Exact delivery-sequence reconstruction: evidence boundary

The supplied excerpts establish the following **narrative claims**, but not complete turns or engine receipts. Their exact order, surrounding speech/player input, historical bounds and original code version cannot be reconstructed honestly from excerpts alone.

| Supplied beat | What storage/projection would do under audited current code | Historical fact actually verified |
|---|---|---|
| Tall purchased woman at threshold, wrists tied, papers in belt; Korvin retreating/gone | Delivered full text would be retained if within bounds; starred details removed from default next history; typed state only if separate supported commit exists | User-reported narration; original history/request/commit unavailable |
| Later “since restraints came off” | Earlier bound detail is not necessarily in next prompt; no bound lifecycle implies no mechanical comparison | User-reported contradiction; exact next request unavailable |
| Korvin returns/knocks to deliver papers | Earlier departure/packet placement may be absent; canonical presence may conflict if departure uncommitted | User-reported contradiction; original canonical placement unavailable |
| Door shut, later still open | Door has no mutable feature state; narrator-authored closure normally disappears from projected history | User-reported contradiction |
| Threshold -> inside -> hearth/table -> entrance reset | Coarse location may persist but no local position relation; starred positions normally disappear | User-reported contradiction; original woman identity/location/membership unavailable |

“After every historical turn” therefore cannot be given as exact recorded data. Exact **controlled** histories after every first/second turn are provided in A–H JSON traces; recency-depth artifacts provide 1/2/3/5/12/13-turn windows. These are reproductions of failure classes, not a fabricated replay of the original delivery. The next implementation decision can use the proven projection defect now; historical transaction diagnosis needs the original trace/save.

## 8. Purchase/delivery committed-state table

| Concern | Original supplied delivery | Current engine capability / controlled evidence |
|---|---|---|
| Negotiated price | AMBIGUOUS: no exact price/receipt supplied | Offer can remain PROSE ONLY; exact agreed amount may feed player transaction resolution |
| Payment/player gold | AMBIGUOUS | COMMITTED in controlled sale: 500 -> 300 gold; 200-gold ledger entry |
| Purchase/woman acquisition | Narrative purchase reported; actual commit AMBIGUOUS | COMMITTED controlled `transfer_person`, subject `campaign_character_maren` |
| Legal ownership/status | AMBIGUOUS historically | COMMITTED controlled holder Korvin -> Nicco, still enslaved |
| Delivery promise | PROSE claim if stated; no delivery-job lifecycle | NOT REPRESENTED as a pending delivery/arrival condition; quoted promise can survive dialogue history |
| Transport/arrival at Heartstone | Narratively reported; original typed movements AMBIGUOUS | Requires distinct player/NPC location commits; purchase itself neither transports seller/subject nor schedules arrival |
| Household membership | AMBIGUOUS | Separate domain; controlled purchase leaves seeded guest status unchanged |
| Woman location | Original ID/node AMBIGUOUS | Controlled sale leaves `audit_room` unchanged |
| Korvin location | Original runtime AMBIGUOUS | G reproduction remains `audit_room` despite delivered departure |
| Papers as legal documentation | Historical prose reported; typed documentation AMBIGUOUS | Controlled sale commits `documentation: "documented"` and transfer provenance |
| Physical papers/packet | Narrative belt/bench claims; registered item historically AMBIGUOUS | No item created by controlled sale; no packet pose/container inferred from documented status |

[purchase-capability.json](docs/evaluations/p12-scene-continuity/purchase-capability.json) captures the synthetic offer, request, commands and complete before/after snapshot. Its sale is a capability check, **not** proof of the historical sale. No price/economy behavior was changed. All A–H scenes use explicitly seeded legal/funds/household state rather than pretending those seeds were organically purchased.

## 9. Door case

B delivered `*The front door swings shut.*` and retained it. Next request removed it; authored feature “Front door” had no open/closed state. F player closure retained `*closes the front door*` in history, so existing prompt memory supports player-authored closure better than a narrator-only event. Neither creates a door state command. This is **A + D**, not evidence that a scheduler or persistent door engine is required.

## 10. Restraint case

D delivered and retained `*Maren's wrists remain tied.*`, but next request omitted it and character state had no binding relation. Generic `conditions` and equipment can represent explicit host/item data, but gameplay physical-condition authorization does not automatically create or remove restraints. The supplied historical phrase “since restraints came off” cannot be mechanically checked against a bound lifecycle that was never committed. Classification: **A + D**; historical structural binding remains unverified.

## 11. Papers case

C delivered and retained `*Korvin places a folded packet on the table.*`, then omitted it. The next `*picks up the packet*` is player input, but no registered item exists for deterministic inventory resolution. A transient packet may be described in prose; documented legal transfer is not a packet in a belt, on a table or on a bench. Classification: **A + D**, with possible **B** only if the missing original trace proves a registered item had a contradictory position. No object physics or generic item creation is proposed.

## 12. Actor-departure case

A's created Dell departure was proposed as `leave_scene`, authorized and committed: his campaign room placement was removed. Next context did not list him present even though recent departure narration was omitted. This demonstrates that supported state transitions can preserve coarse continuity without replaying prose.

G's ordinary canonical Korvin `leave_scene` proposal was rejected; the supplied-style possessive departure sentence survived delivered narration. `scene-departure.ts` uses bounded subject/exit grammar, while the authorizer enforces created/active-NPC+ eligibility. In G, next state still placed Korvin in `audit_room`; no history fact told the narrator he had gone. This is **B before A**. Direct canonical exit wording in H was caught and replaced during reconciliation; the player's earlier `*Korvin leaves.*` still remained in subsequent history, creating another possible player-history/state conflict. No canonical travel policy or grammar was changed.

## 13. Position case

E's `*Maren crosses the room and sits beside the hearth.*` survived delivery and storage. `current_location: audit_room` correctly stayed unchanged; no hearth-seat state existed. Default history then omitted the local position. No authoritative “entrance position” is required to explain a reset: the model has been asked to continue without the just-established pose. Stale `current.presentation` or promotion descriptions could create additional conflicts if present in the original snapshot, but that has **not** been verified. Classification: **A + D**, with possible historical B requiring evidence.

## 14. Player-authored versus narrator-authored comparison

Player input is retained in default projected history; narrator descriptions are not. Thus player door closure remains available one turn later while narrator-only closure disappears. Player-authored event detection also provides bounded same-turn evidence/agency exceptions, but it is not a general state mutation API. Writing `*Korvin leaves.*` does not automatically bypass movement eligibility; H retained that player text while canonical placement stayed in the room and direct exit narration was withdrawn.

Player-resolved travel, carrying, explicit transactions and registered item actions can create validated commands. Other arbitrary player scene acts may remain prose only. Narrator-authorized movements/conditions require specific evidence and eligible entities. This distinction explains asymmetric continuity without granting either prose stream unrestricted state authority.

## 15. Custom deterministic mini-scenes

All fixtures are noncanonical `audit_room` / `audit_path` data; no authored world files change. Exact first/second requests and receipts are in case JSON files.

| Case | First delivered fact | Structural result | Default next history |
|---|---|---|---|
| A departure | Dell walks out | Created location removed via authorized leave | Narration omitted; absence supported by context |
| B door | Door shuts | No door state | Closed fact omitted |
| C object | Korvin places packet on table | No registered packet | Placement omitted |
| D restraint | Wrists remain tied | No binding state | Tied fact omitted |
| E position | Woman sits beside hearth | Coarse room location unchanged | Local pose omitted |
| F player change | Player closes door; narrator acknowledges | No door state | Player closure retained, narrator acknowledgment omitted |
| G Korvin wording | Retreating back/gone | Ineligible leave rejected; placement unchanged | Departure omitted; Korvin present |
| H player Korvin | Direct exit draft reconciled to quiet hall | Canonical placement unchanged | Player-authored departure retained |

Bounds/failed-history tests and depth probes are captured separately. No state subsystem or production instrumentation was added. Existing relevant tests passed **171/171**, zero failures/skips/TODOs: coordinator/recent history, RPG format, focus, canonical participant continuity, temporary participants, final movement closure, household transactions/runtime, compaction/lossless compaction and UI alternatives. Historical TODO source files were not edited; the preceding foundation baseline's full-suite four TODOs remain untouched. Production code did not change, so no new full-suite/typecheck/playthrough claim is made for this audit.

## 16. Live API mini-scenes

Model: **z-ai/glm-5.2**, explicitly pinned **z-ai/fp8**, fallback disabled, reasoning disabled, output cap 512, no automatic retries. Only narrator generation ran; no controller, Voyage, embeddings, state commits or alternate regeneration. Each frozen probe contains the precise system/message payload plus a predeclared unknown, competing hypotheses, decision and PASS/FAIL/UNRESOLVED criterion. Conditions differ only by a diagnostic recent-scene fact, not production rules.

Initial approval review rejected live execution for missing recognized payload/destination authorization. Re-review accepted after checking the user's attached explicit authorization and verifying only synthetic scene data plus existing prompt rules were exported. Six initial local attempts then failed before HTTP because my captured AbortSignal serialized as `{}`. An offline fake transport proved **zero fetches** for that failure. The corrected harness omitted only that nonserializable control field; all prompt/message bytes stayed identical. Original attempts are preserved. The conflict probe completed once and was not repeated.

Accounting: **7 completed external requests**, **6 local pre-HTTP capture failures**, **13 adapter invocations total**. Reported provider cost: **$0.01784892**. All seven completed on GLM-5.2 with returned provider `Z.AI`. No further calls were justified once projection, diagnostic reinforcement and priority conflict were established.

| Scene/condition | Result against predeclared criterion |
|---|---|
| Door normal | UNRESOLVED: door edges/hardware described; no explicit open/closed statement, not counted as a pass |
| Door + explicit fact | PASS: “The heavy front door stands shut” |
| Restraint normal | UNRESOLVED: hands at sides, no cord mentioned; not counted as explicit removal because none was stated |
| Restraint + explicit fact | PASS: wrists explicitly bound with cord/visible knots |
| Position normal | OTHER POSITION CONTRADICTION: stands near table without causal movement, rather than prior seated hearth pose. The predeclared specific failure example was entrance reset, so this is reported separately |
| Position + explicit fact | PASS: seated beside stone hearth |
| Conflict, full recent prose says left; current state says present | PROSE WINS: output says Korvin already gone. Intended current-state priority was not followed |

No ambiguous omission is relabeled a success; no observed table reset is relabeled the predeclared exact entrance reset. The outputs are raw diagnostic generations, not controller-audited delivered turns. Incidental new details and agency errors are not scored as P12 target failures.

Evidence: [frozen-requests.json](docs/evaluations/p12-scene-continuity/frozen-requests.json), [conflict-request.json](docs/evaluations/p12-scene-continuity/conflict-request.json), [live-initial-attempts.json](docs/evaluations/p12-scene-continuity/live-initial-attempts.json), [live-ledger.json](docs/evaluations/p12-scene-continuity/live-ledger.json), [live-grades.json](docs/evaluations/p12-scene-continuity/live-grades.json). Ledger preserves request hashes, exact prompts, outputs, routing and cost metadata; credentials are absent.

## 17. Cross-model findings

No alternate models were tested. Production-only frozen pairs answered the immediate distinction between absent context and explicit facts; more models would not change the proven code-level omission or movement eligibility. One sample per condition establishes examples, **not** reliability rates, ranking or a claim that explicit facts always guarantee compliance. The deliberately contradictory request establishes a compliance counterexample, not prevalence during ordinary gameplay.

## 18. First failure points

1. **For narrator-only local facts:** `buildNarratorPrompt` chooses `dialogue_focused`; `dialogueFocused` calls `rpgDialogue`, drops starred content and publishes the omission marker. This happens on the very next request before eviction, compaction or model generation.
2. **For G canonical departure:** unsupported canonical movement authorization leaves placement unchanged, and bounded narration audit misses the supplied-style possessive exit. Divergence already exists in delivered turn 1; the next request then compounds it by omitting the departure.
3. **For model priority:** the diagnostic full-prose request supplies both facts; generation chooses past prose over current presence despite the state-precedence instruction.
4. **At later depth/reload:** budget/turn eviction and session-history reset can additionally remove prose. They are real limits, but not the demonstrated one-turn root cause.

## 19. Root-cause classification

| Class | Evidence / confidence |
|---|---|
| A memory/projection | **PROVEN projection omission**, not proven broken storage. Exact next requests omit delivered non-dialogue facts at depths 1–12 |
| B runtime divergence | **PROVEN controlled G case**; eligibility and grammar/audit boundary. Original delivery placements remain unknown |
| C model compliance | **PROVEN conflict counterexample** when both signals are present. Diagnostic facts preserved three local facts in single samples; missing-input baselines are not evidence of ignored facts |
| D missing ephemeral representation | **PROVEN typed-domain limits** for mutable doors, transient packet placement, restraint lifecycle and room-internal seating. This does not prove new persistent state is necessary |

The five historical contradictions need not share one cause. Historical player input might have retained some facts even when narrator descriptions were omitted; without the actual requests, attributing every historical miss to A or C would be speculation.

## 20. KISS recommendation

Start with the **existing RecentConversation and prompt seam**. Evaluate a small bounded current-scene replay of delivered non-dialogue prose, explicitly subordinate to current typed state, while retaining existing dialogue/knowledge permissions. Existing `full_prose` mode is a diagnostic baseline showing the information already exists; do not blindly switch all history to full prose given the conflict result. A bounded projection experiment needs no new mutable memory, extractor, save schema or vector index.

Treat canonical departure divergence as a separate typed-state/eligibility decision: either the narrowly authorized transition must commit, or unsupported completed departure must be reliably withheld. Merely making the narrator remember “gone” while state still says present preserves a contradiction. Do not silently expand narrator movement authority or add endless synonyms in this audit.

The diagnostic explicit-fact pairs show that concise scene facts can help, but do not establish how to extract/update them safely. A new `recent_scene_facts` mechanism is therefore **MAYBE later**, not required by current evidence. Test the smaller projection repair first; revisit typed ephemeral facts only if that fails under consistent runtime state.

## 21. What NOT to build

No universal scene database, generic semantic memory, event-sourcing overhaul, arbitrary LLM-to-state extraction, prose parser expansion, mutable door engine, object physics, scheduler, NPC routine, pending-event engine, event-directed wait-until or vector retrieval of every previous turn. Do not modify P11, names/opaque refs, model settings, retrieval, reflection, pricing or economy to mask this issue.

## 22. Dependency for future wait-until

`wait until Korvin arrives`, `wait until someone knocks` and `wait until the next lot is presented` require a reliable distinction between a promise, pending event, completed arrival, current presence and prior narrated completion. Today a spoken delivery promise can survive as dialogue without any pending job; completed scene events can disappear from projection or conflict with placements. Repeated prose delivery must not be treated as a new engine event automatically.

Event continuity must be understood and scoped before event-directed waiting. Daypart-target waiting remains a separate future feature; nothing in P12 changes P11 or implements either wait-until category.

## 23. Recommended next implementation pass

**P12.1 proposal, pending user decision:** repair bounded current-scene non-dialogue history projection within the existing architecture; verify door, restraints, physical papers and local pose across consecutive turns, depth/budget pressure, scene changes and compaction. Preserve the typed-state precedence and player/name/knowledge trust boundaries. Keep canonical departure authorization/audit divergence a separately explicit subproblem with tests for accepted, rejected and grammar-missed exits. No production fix is committed by this audit.

Before diagnosing the historical sale or deciding whether a canonical delivery transition should be allowed, obtain its original transcript/request trace and save/commit receipts. Do not treat a synthetic 200-gold sale as that evidence.

## 24. Live verification checklist

- Capture exact prepared requests and delivered/audited output, rather than grading raw narrator drafts as gameplay.
- Check all supplied facts in the next request before attributing a miss to the model.
- Verify no history prose contradicts current committed placements, equipment, legal state or ownership.
- Test narrator-only versus player-authored door/restraint/local-position facts separately.
- Test recognized and possessive canonical departures, created exits, NPC+ transitions and explicit returns.
- Confirm documented legal transfer does not imply a physical packet item or duplicate delivery.
- Check depths 1/2/3/5, size eviction, scene transitions, compaction, reload and alternative regeneration.
- Predeclare criteria covering any pose reset, not only entrance resets; retain UNRESOLVED outcomes.
- Track requests/cost and stop when additional samples no longer change the implementation decision.

P12 remains **OPEN / AUDIT COMPLETE / DESIGN DECISION PENDING**. P11 remains implemented/live-verification pending. No production code, tests, prompts or trust policy were changed; only audit evidence/report and current status documentation are committed.
