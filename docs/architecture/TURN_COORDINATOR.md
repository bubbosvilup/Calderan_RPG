# Phase 1L: Turn Coordinator & First Playable Loop

## Authority and lifecycle

`src/turn/turn-coordinator.ts` is the sole new layer spanning the turn. It accepts `{ campaign, player_input, signal? }`; a CampaignSession caller passes `session.campaign`. Models remain providers, without world, retrieval, save repository or mutable campaign access.

The normal event sequence is:

```text
turn_started (capture base revision and immutable snapshot)
  → bounded primary/campaign projection
  → selective retrieval and prompt composition
narration_delta (immediate, provider-neutral)
narration_completed
controller_started
  → finalized narration + bounded base-state evidence to DeepSeek
  → strict local proposal validation
  → conservative semantic authorization
state_proposed (frozen diagnostics)
  → CampaignState.prepare(expected_revision = captured base)
  → CampaignState.commit (synchronous, no intervening await or yield)
state_committed
turn_completed
```

Visible prose is provisional until completion. Incomplete narration never starts the controller. Controller failure never commits. Cancellation is checked before network phases and immediately before commit; network AbortSignal is forwarded and early iterator exit closes generation. Once state_committed is emitted, the transaction has finalized; cancellation cannot undo that committed result.

A shared WeakSet prevents overlapping coordinator turns on one CampaignState. Revision checks after asynchronous/yield boundaries reject external mutations as `stale_turn`; no rebase/replay occurs. All accepted controller commands and explicit runtime commands enter one batch. A late invalid slot/reference leaves the whole batch unchanged. No-op batches preserve revision; a changing batch increments once. Diagnostic objects are frozen copies so an event consumer cannot edit an authorized command before commit.

The final result contains narration, base/final revisions, controller proposals, authorized commands, rejection diagnostics, retrieval diagnostics, both providers' usage/latency, prompt-size diagnostics and total timings. Failures expose typed codes and safe provider error codes, never raw provider errors or keys.

## Modules

| Module | Responsibility |
| --- | --- |
| `turn-types.ts` | Request/result/event/error contracts |
| `context-builder.ts` | Bounded scene, physical/equipment and epistemic projection |
| `retrieval-policy.ts` | Explicit triggers; existing HybridSearch and RetrievalService |
| `prompt-builder.ts` | Stable policy and readable bounded evidence |
| `player-intent.ts` | Small explicit player command grammar; directed route policy |
| `command-authorizer.ts` | Match intent, references and affirmative narration evidence |
| `recent-conversation.ts` | Ephemeral bounded exchanges and failure status |
| `turn-coordinator.ts` | Revision capture, orchestration, authorization and atomic commit |

The Phase 1K models remain `minimax/minimax-m2-her` and `deepseek/deepseek-v4-flash-0731:nitro`, configurable through their existing settings/environment overrides. The play/evaluation narrator budget is 384 output tokens; provider defaults otherwise remain unchanged. No model comparison or default switch occurred.

## Context, knowledge and prompt bounds

The existing NarrativeContext builder remains primary. A detached RuntimeState compatibility projection receives the captured scene, mana and NPC locations; it never mutates CampaignState. Its incidental revision is replaced with the captured campaign revision. Raw SceneRam and the full CampaignSnapshot never enter a provider request.

Present public NPCs and present created characters receive canonical baseline content plus existing campaign profile/current overrides: appearance, hair, eyes, scars, conditions, presentation and explicit equipment. Only their currently carried/equipped registered items are included, rather than global possessions. The system prompt gives campaign overrides precedence over baseline descriptions. It never establishes missing anatomy.

Knowledge stays as individual edges with status and provenance. This initial player-facing slice takes the conservative approach of withholding narrator-only secrets entirely: a campaign fact's content is included only when Nicco has an established edge; canonical facts must also pass narrator/player visibility. NPC edges are retained separately for included facts. A player belief is not upgraded to truth. Canonical NPC awareness is projected independently; retrieved material carries present-NPC awareness alongside narrator/player access. Merely presenting a fact to the narrator does not grant it to every NPC. Hidden identities/facts are not returned in public retrieval diagnostics.

Production canon currently lacks authored player/NPC records. The canonical CLI mode therefore works for location/time/mana/lore while omitting unestablished character profiles. The populated synthetic fixture supports character/item/knowledge development without writing production canon.

Limits: player input 4,000 characters; projected state 32,000 serialized characters, 24 relevant characters, 48 items, 32 facts, 96 knowledge edges, 16 scheduled events; recent conversation 12 completed turns / 16,000 serialized characters (Runtime Continuity Repair 1; previously 4 / 8,000); secondary retrieval evidence 10,000 characters; generated narration 24,000 characters. Existing provider and NarrativeContext bounds also apply. Oversized primary/retrieved content fails rather than silently disappearing. Oversized individual recent exchanges are explicitly omitted from the ephemeral buffer; older exchanges are evicted by its configured bounds. Canonical awareness IDs are capped at 24 per character.

Only completed narration can enter the buffer. Successfully finalized exchanges are replayable; a completed narration whose state processing fails is recorded as `state_failed` and omitted from future prompts. Partial streams are not stored. Buffers are per CampaignState object, remain in memory and start empty after a load/new campaign.

Coordinator system instructions preserve Nicco's deliberate actions, decisions, thoughts and dialogue for the user. World/NPC reactions belong to the narrator. User input, lore, state strings and past exchanges are explicitly untrusted evidence. Unknown canon is not an invitation to invent secret lore. The prompt requests ordinary concise RP prose rather than metadata or screenplay labels. These instructions are behavioral requests, not guarantees; measured violations are documented below.

## Retrieval policy

Ordinary local conversation performs zero retrieval operations. Explicit lore/history/world-knowledge questions and references to visible remote named entities trigger one narrator-audience HybridSearch query (at most three candidates), followed by at most one exact get. The existing stack uses hybrid when supplied a compatible semantic index and falls back to lexical otherwise. No autonomous tool loop or second search implementation exists.

Narrator-only secret results are removed before prompt construction. A required retrieval exception or oversized/exact-fetch failure fails the turn before narration. An authorized search with no result yields an explicit unknown outcome, not a fabricated answer or a distinction revealing hidden canon. There is no nonessential-enrichment branch in this version: every triggered search is treated as required evidence.

Default CLI startup has no semantic index and therefore uses lexical. `--semantic` explicitly builds an existing production-provider index once at startup (paid embeddings); a configured embedding key alone is not an already-built index. The coordinator accepts an existing HybridSearch instance with compatible indexes. No online embeddings were needed for the recorded evaluations.

Measured historical sample: 10/12 turns made no retrieval call; records 47 and 173 each made one search plus one get. The explicit Ironbound smoke query likewise used two operations and lexical fallback. Narration's failure to use those retrieved facts is a model-quality finding, not a retrieval exception. Retrieval timings in the recorded samples were approximately 0.02–2.64 ms, with no hard SLA claim.

## Restricted authorization

The controller still exposes only `place_item`, `transfer_item`, `schedule_event`, `set_knowledge`. Its result is independently reparsed locally even for injected mock providers. Trust, profile changes and other command kinds fail the restricted schema. Existing Phase 1I validation remains the final authority over identities, slots, dates, references and batch invariants.

The authorizer deliberately accepts a narrow subset of language, rather than claiming to understand arbitrary narrative semantics. It requires a command to match explicit deterministic intent, references to relevant known state, and a complete affirmative unquoted confirmation sentence. Negation, uncertainty, refusal or contradictory wording rejects the proposed change. Diagnostics distinguish insufficient evidence, invalid references and forbidden commands. Rejections normally yield a successful no-op turn.

Examples:

- `I give boots to Brenna.` plus `Brenna accepts boots from Nicco.` can authorize carried ownership transfer, if Nicco owns and physically holds the item.
- Looking at boots, considering acceptance, a quoted confirmation, or asking for a trade does not establish handover.
- Receipt does not authorize equipped status. Equipping requires a separate explicit item/target/slot/mode intent and positive equipment sentence. Ownership remains separate from placement.
- `/tell campaign_fact_bridge_closed to brenna` requires Nicco's established `knows` edge and an explicit telling confirmation; contemplating disclosure, narrator exposition or inferred NPC reactions are insufficient.
- `/schedule campaign_event_meeting "Bridge meeting" at 160 with nicco,brenna` requires a future absolute minute, relevant participants and affirmative agreement. No conversion of “maybe tomorrow” or the isolated historical “eight days” is invented.

The authorizer's sentence templates and certainty checks are conservative heuristics, not a semantic proof. Many valid phrasings, indirect references and implied acquisitions are rejected. The historical multi-garment handover is a measured false-negative case. Quoted speech is excluded as event proof. No broad regex event extraction, third model, hidden reasoning or model-driven authorization loop was introduced.

## Explicit runtime commands and travel

`/go <ID or exact name/alias>` and the narrow `I go [downstairs/upstairs] to <destination>.` grammar resolve only visible canonical locations and require an outgoing **direct canonical connection**. Hierarchy and shared ancestry do not imply travel. Arbitrary teleportation is rejected before model calls. No dynamic location creation or route planning exists.

`/wait N` or `I wait N minutes.` supports an explicit 1–1,440 minute advance. The retained historical `*he spent N hour(s)/minute(s) ...*` form supports explicit durations, including corpus record 39. Approximate time, casual prose and unspecified overnight waiting do not advance state.

`/mana N` is an explicit developer adjustment, validated through the existing runtime path. It is not a spell parser or a new recovery mechanic. Existing mana/day-boundary invariants remain authoritative. Runtime commands derive exclusively from the player request; narrator text cannot add movement, time or mana effects. They commit only after successful narrator/controller processing. A poor but technically completed narration can still accompany an explicitly requested runtime change; this limitation is visible in the smoke report.

Multiple explicit intent lines (up to four) can form one batch; at most one runtime intent is accepted to avoid inventing multi-hop projection semantics. All preparation and commit are atomic. `/equip <item> for <character> <slot> <mode>` supports a specified recipient's equipment confirmation separately from transfer.

## First playable CLI and saves

```text
npm run play
npm run play -- --help
npm run play -- --canon
npm run play -- --semantic
node .build/src/dev/play.js --debug
```

Default startup uses a populated synthetic development campaign. `--canon` starts an empty campaign at `heartstone_lr`; it does not insert historical characters. `/new <campaign_id>` creates a fresh empty campaign in the selected world. `/load <campaign_id>` uses the existing manual repository. `/status` reports revision, scene and dirty status. `/save` alone writes a save. `/quit` exits with unsaved-state information. Ctrl-C cancels an active generation. The CLI is terminal tooling, not graphical UI.

Use `/give <item> to <character>`, `/equip <item> <slot> <worn|held>`, `/tell <fact> to <character>` and `/schedule` as above for supported explicit actions; ordinary player prose is also accepted but conservatively authorized. Debug mode displays proposals/rejections, retrieval IDs, revisions, latency, prompt sizes and usage after finalization. Direct Node invocation avoids shell/npm flag-forwarding ambiguity.

TurnCoordinator never imports or calls CampaignSaveRepository. CampaignSession dirty tracking follows the in-memory revision. The actual CLI smoke changed world minute **100 → 101**, revision **1 → 2**, printed “Finalized” and `unsaved: true`, and exited without saving. See [CLI transcript](../evaluations/phase-1l-cli.txt).

## Historical corpus, provenance and evaluation

Source: the user-provided `thread_2026-09-16_caldrevan-dark-fantasy-isekai_nicco-wzlau.csv`, 843 message records / 421 player-assistant pairs. It is an **evaluation corpus, not canonical prose or authoritative state history**. The original file is untouched and its full contents are never sent to a model.

`src/dev/playthrough-csv.ts` parses quoted commas/newlines and escaped quotes. `extract:playthrough` selects an explicitly authored manifest into `tests/playthrough/curated.json`, retaining source filename/SHA-256, original player and assistant text, category, desired durable commands, interpretation and notes. Record numbers are one-based logical CSV records including the header, not physical lines inside multiline fields.

There are **24 curated pairs** covering dialogue, physical continuity, equipment/ownership, time/ambiguous time, knowledge/secrets, player agency, movement, household behavior, item continuity, multi-NPC scenes and a scheduled deadline. Labels were authored by Codex after reading the pairs, with unresolved references/slots/dates explicitly identified. They are marked `agent_authored_pending_human_review`; no human review is claimed. Unsupported household/profile/relationship domains deliberately remain no-ops.

```text
npm run extract:playthrough -- "C:\path\to\historical.csv"
npm run test:playthrough
npm run eval:playthrough
npm run eval:playthrough -- --count 20
npm run inspect:turn
```

Offline replay uses exact historical narration and mock proposals, exercises the real coordinator and asserts the known conservative gap for record 115 without changing its desired labels. The dedicated harness has **25 passing tests** (parser plus 24 pairs).

Online evaluation defaults to **12 curated pairs**, with explicit expansion capped at the 24 curated cases. It prints paid-online status, model IDs, date/time, per-case command precision/recall counts, final states and telemetry, and writes human-inspectable JSON. Each case starts from an isolated synthetic state; original player text is unchanged and historical assistant text is not sent. This is recontextualized evaluation, not historical state reconstruction. Qualitative fields remain pending in raw machine reports; the separately authored [review](../evaluations/PHASE_1L_REVIEW.md) assesses them without pretending an objective prose grader exists.

## Verification and measured results

Offline final checks with OPENROUTER_API_KEY absent: **480/480 tests pass**, zero skipped, `npm run typecheck` passes, and the separate playthrough harness passes 25/25. Tests cover orchestration order, no-op revision, stale mutations at controller and publication boundaries, frozen diagnostics, atomic multi-command failure/success, cancellation, early iterator exit, both provider failure paths, manual dirty status, directed travel, trust rejection, invalid references, bounded retrieval, hidden-fact filtering, physical/equipment continuity, recent-memory limits and actual production-canon projection.

Paid online evaluations ran 2026-09-28 on Node 22.23.2 / Windows using the unchanged MiniMax and DeepSeek Nitro defaults. The original smoke, final smoke and historical reports are retained. No automatic retries or state rebases occurred. Additional actual CLI execution is recorded separately. These are small observed samples, not stable provider performance estimates.

| Final sample | Cases | Finalized | TP / FP / FN commands | Precision | Recall |
| --- | ---: | ---: | --- | ---: | ---: |
| Historical selected pairs | 12 | 12 | 1 / 0 / 3 | 100% | 25% |
| Synthetic smoke | 5 | 5 | 1 / 0 / 2 | 100% | 33.3% |

All 24 historical provider requests and all 10 final-smoke provider requests completed successfully with locally valid controller proposals. Historical positives: exact one-hour advance committed; three pink garment transfers were rejected. Synthetic handover was not narratively accepted (correct rejection despite the desired scenario label); knowledge acquisition was implied but did not meet the strict confirmation rule. No false-positive durable mutation was observed, but positive sample sizes are too small for a safety guarantee.

| Median | Historical sample | Final smoke |
| --- | ---: | ---: |
| Narrator TTFT | 643.24 ms | 832.16 ms |
| Narrator total | 1,249.92 ms | 1,142.54 ms |
| Controller tail | 855.19 ms | 806.31 ms |
| Full coordinator turn | 2,100.85 ms | 2,040.65 ms |

Provider timings reuse Phase 1K metadata; retrieval, tail and total durations use the same monotonic clock convention. They exclude process/build startup and include normal local orchestration. A slow consumer of the async iterable can add backpressure time. Prompt component character counts are recorded in each final result. No tokenizer or runtime price table was added.

Historical sample usage: **45,720 prompt + 860 completion = 46,580 tokens**. Final smoke: **18,722 + 326 = 19,048 tokens**. Preserved initial smoke: **19,295 + 824 = 20,119 tokens**. Total across those three recorded evaluation batches: **83,737 prompt + 2,010 completion = 85,747 tokens**. The additional two-request CLI smoke did not print debug usage, so its tokens are not included in that total. No pricing estimate is claimed.

The qualitative review found zero clear deliberate player takeovers in the 12 final historical cases and one ambiguous case requiring human assessment. It also found major continuity issues: invented setting/equipment, a speaking silent construct, already-equipped boots being put on again, unclear speakers and poor use of retrieved lore. An initial smoke had a clear player voice takeover and metadata/JSON output. The readable-prompt revision reduced metadata echo in the observed final samples but did not solve those wider problems. See the full [qualitative review](../evaluations/PHASE_1L_REVIEW.md), [historical results](../evaluations/phase-1l-playthrough.json) and [final smoke results](../evaluations/phase-1l-smoke.json).

## Deferred scope and status

No graphical UI, autosave, trust progression, automatic profile establishment, durable conversation/history/memory domain, database, dynamic locations, autonomous tool agent, persistence redesign or selected-model switch was introduced. Existing campaign/runtime/retrieval/provider invariants remain intact. Only explicit manual CLI save/load accesses persistence. The next phase has not begun.

The restricted developer loop and state safety foundation work, including a real end-to-end commit. General natural-language authorization coverage and narrator adherence still require fixes; human corpus-label review remains outstanding. Readiness is qualified rather than an assertion that unrestricted play is satisfactory.

READY WITH FIXES


## Phase 1L.1 additive hardening

The authoritative path and model pair remain unchanged. After completed narration and local controller parsing, `deriveTurnEvidence` creates a deeply frozen, same-turn object containing resolved player candidates/references, runtime intents, narrator confirmations and refusals. `authorizeCommands` matches proposals against this evidence and current ownership/reference rules; it no longer searches raw narration. Evidence is returned in turn diagnostics, never added to CampaignState or saved. Existing expected-revision prepare/atomic commit, cancellation, partial-stream and conversation-buffer semantics remain intact.

Reference resolution is a bounded grammar, not general NLP. Exact item/character IDs and names work; named clothing groups require current Nicco ownership and exact cardinality. Recipient pronouns require one present NPC. Collective references (`them`, `all three`, `the garments`, `those clothes`, `the shirts and shorts`) require one already-resolved offered set. Narrator pronouns use only this turn's unambiguous actor; other actors/items can invalidate the reference. Two ordinal shirts are authorized together only after both distinct ordinals are received. A first shirt alone cannot identify which item transferred. Hypothetical, quoted/code, refusal and contradictory evidence stays conservative. No cross-turn coreference is implemented.

Acceptance authorizes carried ownership only. Equipping needs separately resolved intent and exact supported placement evidence; record 117's layered slots remain unresolved. Explicit telling/explaining/hearing/is-told/reacts-after-hearing of a resolved fact can establish knowledge; emotion cannot. Current intent provenance is `told`: witness/inference prose is deferred, never mislabeled. Exact event identity, absolute minute and participants remain mandatory; natural agreement phrases only confirm that already-resolved event. Runtime commands still use explicit validated player intent without narrator repetition.

The narrator prompt now separates role, hard rules, authoritative scene/characters/equipment, hard character constraints, retrieved canon, unestablished details, subordinate conversation, player action and narration task. Current structured state overrides old prose and conflicting retrieved descriptions. Silent-character traits are separately surfaced. Unknown means unestablished, never a factual negative or implied secret. Compatible transient atmosphere is allowed; persistent possessions, architecture, profiles and equipment require existing evidence. Narration alone never progresses authoritative time/state. Retrieved canon answers explicit lore queries but remains untrusted data rather than instructions.

Evaluation now has two modes:

- `npm run eval:playthrough`: original 12 state-fixture cases; `-- --count 24` expands the curated set. Historical assistant replies remain reference-only.
- `npm run eval:playthrough -- --narrative`: seven historical cases plus Ironbound, with three preceding source exchanges (bounded to 2?4 and 16,000 characters). `withHistoricalContext` decorates only the evaluation narrator request with the explicit non-authoritative historical warning. The controller sees only the current generated turn and current structured evidence. Normal recent history never receives the injected window.
- `npm run inspect:turn`: fresh synthetic smoke. All report filenames include Phase 1L.1 and a unique timestamp, written exclusively; the legacy entry point delegates to this additive evaluator.
- `npm run review:playthrough`: read-only full source/label/provenance/suitability review. Labels remain agent-authored pending human ratification.
- `node .build/src/dev/replay-hardening.js <recorded-report>`: offline final-grammar replay of completed recorded responses/proposals plus explicit/emotional knowledge controls. These results must never be presented as fresh provider runs or included in latency statistics.

Only record 115's evaluation fixture explicitly grounds the formerly ambiguous recipient (Brenna alone) and descriptive garment names. Player text and expected labels are unchanged. This fixture correction is disclosed in every report; it is not a canon change or evidence of unqualified apples-to-apples recall improvement.

Development qualitative checks are narrow triage for established silence, equipped boots, closed-fixture omissions, speaker labels, explicit player actions and retrieved-lore denial. They neither authorize commands nor rewrite/block production narration, and their absence is not proof of adherence. Human/agent inspection remains necessary. No automatic correction, retry or third-model grading was implemented. Multiple development evaluation batches are preserved separately, not hidden retries.

See [Phase 1L.1 review](../evaluations/PHASE_1L1_REVIEW.md) for evidence, failures and the qualified readiness decision. The next major phase has not begun.

## Live NPC Regression Repair 1: authoritative narration order

This section supersedes the streaming note in "Authority and lifecycle". Narrator output is now a **draft**. It is buffered and never delivered until the turn is resolved:

```text
input → natural actions / participant plan → projected context → retrieval → narrator DRAFT (buffered)
      → controller proposal on the draft → authorization → state_proposed (frozen diagnostics)
      → prepare(runtime + authorized commands)
      → narration audit(draft, authorization, prepared state, knowledge access)
          ├─ no issue: deliver the draft
          ├─ issues: ONE revision call (original prompt + draft + authoritative outcome + specific problems) → re-audit
          └─ still failing: deterministic redaction of flagged sentences + plain outcome statement
      → narration_delta (single, final text) → narration_completed → commit → state_committed → turn_completed
```

Event order: `turn_started, controller_started, state_proposed, narration_delta, narration_completed, state_committed, turn_completed`.

Invariant: delivered narration never asserts a durable change that authorization rejected or the controller did not propose. Acceptance resolution is controller-mediated: the controller proposes from the draft, authorization decides, and a bounded reconciliation step forces the delivered text to match. Narration is released after preparation and before commit, so abandoning the iterator still commits nothing. A turn that fails after the draft exposes no narration (`turn_failed.narration` is only what was delivered). `TurnResult.narration_reconciliation` records the draft, the issues, any revision and which text was delivered. The reconciliation step never changes state.

Audit checks (`src/turn/narration-audit.ts`), all bounded and structured:

- **Transfers.** Any intent, rejected proposal, or possible handover between present people that the narration verifiably completes but that did not commit. It also flags a committed transfer the narration refuses.
- **Knowledge.** NPC dialogue that states or hints at a private player fact the speaker cannot use, states Nicco's household role as known, cites an invented source (rumor, registry, "people say"), or states arrival chronology or a shared past with Nicco. Explicitly framed guesses (the marker preceding the claim, a question, or a trailing "I'd guess") pass. Household-place history (previous owners, emptiness, debts) is flagged unless retrieved canon was supplied.
- **Presence.** Companions from authored habits ("usually accompanied by …") and named absent NPCs acting in narration.
- **Consequences.** Class-B physical conditions narrated without a committed condition, and class-C/D constraints (restraint, removal, detention, bans) narrated as accomplished on Nicco. See [PHYSICAL_INTERACTION.md](PHYSICAL_INTERACTION.md).

The audit is a safety net behind the prompt contract, not semantic policing. Known gaps are listed in [the Repair 1 report](../evaluations/CALDERAN_LIVE_NPC_REGRESSION_REPAIR_1.md).

## Runtime Continuity Repair 1

See [the repair report](../evaluations/RUNTIME_CONTINUITY_REPAIR_1.md).

- **Recent conversation.** 12 completed exchanges under a 16,000-character serialized budget. Oldest complete exchanges are evicted first, and exchanges are never cut or reordered. Only player input and delivered narration are stored: a failed turn stores only what was shown and never displaces a completed exchange.
- **Temporary participant departure.** `leave_scene { character_id }` is a controller command. It applies only to a present **created** character and follows the usual path: proposal, narration evidence (`src/turn/scene-departure.ts`), authorization, then prepare. Committing it clears the character's location: the record stays, and re-entry needs `move_character`. The audit flags an exit narrated without a committed `leave_scene` (`uncommitted_departure`), and flags a created character acting in the scene after it has left (`absent_participant`).
- **Player-authored events.** `src/turn/player-authored-events.ts` covers grab, shove, strike, injury, spill and departure acts stated in the current input's action text. They take precedence in the audit: a restated authored grab or shove is never an uncommitted constraint, and an authored injury term is never an uncommitted condition. They never authorize escalation: a broken bone, unconsciousness, death, severing or pinning is still flagged. Objects falling or spilling are not a person's condition.
- **Grounding guards.** `src/turn/grounding-audit.ts` flags three things: exact prices not supplied by canon, state, retrieval or the player (`invented_price`); earlier payments, agreements or conversations with no support in the delivered history (`fabricated_prior_event`); and strong legal or procedural assertions (`invented_procedure`). Staff acting in the scene who are not in scene state are flagged through the existing presence check (`absent_participant`).

