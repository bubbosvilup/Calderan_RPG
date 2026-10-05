# P1.2 RPG history, P3.2 opaque references, P6.2 background discipline, P10 observation

## 1. LIVE BASELINE

Baseline: `a2f3ca4`. User-reported live evidence: a purchased woman said “Yes. I can wait.” but subsequent narration claimed she had not spoken since the auction block; narration disclosed Korvin despite unknown-name gating; the three private sellers continued receiving repeated prose after context compaction. These are supplied observations, not new provider runs. P6.1 deterministic context reduction is preserved; P8 and P9 remain separate open tasks.

## 2. P1.2 HISTORY FAILURE

`RecentConversation` stores delivered finalized player/narrator exchanges, bounded to 12 turns and 16,000 serialized characters; failed/partial exchanges are excluded from `forPrompt`. Those scope/retention rules are unchanged. `buildNarratorPrompt` defaults to `dialogue_focused`, calling `dialogueFocused` in `src/turn/prompt-builder.ts`.

The old projector finds quotation-delimited spans and attributes them through surrounding subjects/speech clauses, with conservative pronoun and paragraph continuation rules. It preserves player input verbatim and intentionally omits narrator descriptions. Plain, unquoted RPG speech had no quote span and therefore disappeared. Parsing was lexical/regex-based, without balanced narration-block handling. Compaction receives the already-built narrator request; history lies in its fixed context rather than knowledge units, so it inherits the same extraction problem.

## 3. P1.2 FIX

`src/turn/rpg-dialogue.ts` scans balanced single-asterisk narration blocks and keeps only intervening spoken lines, in order. Blank lines separate content; quotes are unnecessary. Entirely plain conversational output is supported. Surrounding narration is omitted, and no speaker is guessed from an action beat. The existing `npc_dialogue` array carries unattributed plain speech when attribution is unavailable.

Unbalanced blocks fail closed. Code fences, bold markup, headings, bracketed/JSON/HTML/system metadata and structured text are rejected rather than replayed as dialogue. The existing per-exchange 12-dialogue limit and 400-character speech-span bound are retained. Older attributed quoted prose delegates to the existing quote/speaker projector, including emphasis inside legacy quotations. Standalone quoted speech can be retained without attributing it to a previous turn's speaker. Recognizable unmarked legacy action beats continue to be omitted. No full transcript/history mode, storage schema, knowledge grant or NPC speech authority was added.

The RPG output contract remains unchanged: narration inside single asterisks, spoken dialogue plain and unquoted.

## 4. P3.2 RAW-ID LEAK

P3.1 hid proper-name fields but intentionally left raw canonical IDs. Those IDs appeared in character headings, identity `internal_id`, baseline/profile origins, compact presence, social/legal references, knowledge character scopes, households, relationships, NPC+ recovery handles, retrieval copies and correction/draft text. Compaction could independently serialize raw fact IDs and character scope IDs. Thus a null name field still coexisted with a name-derived string such as `korvin`.

The reported live leak is consistent with that availability; this task does not claim to prove which exact field caused the model's response.

## 5. P3.2 OPAQUE REFERENCE FIX

The existing engine-side identity gate now also derives a `ref` (`NPC1`, `NPC2`, etc.) from canonical world order. The mapping remains in WeakMap-backed metadata, outside raw TurnContext and all narrator serialization. References are distinct, deterministic across sections and stable across turns for the same loaded world. Example: the current dataset maps Korvin to `NPC24`; the mapping itself is never supplied to the narrator.

Foreground identity serialization omits `internal_id` and includes `ref`. Background compact entries similarly serialize `ref` instead of their engine ID. The final narrator-input projection replaces canonical NPC IDs, including IDs embedded in fact IDs, item IDs, private-canon/chunk references and NPC+ handles. Name/alias projection also handles capitalization variants and identifier separators. Known primary names remain available through the existing allowed name fields/prose, while their structured references stay opaque; learning a name still does not grant aliases or titles.

Knowledge fact IDs, permission character IDs, holder labels and text are projected before pack registration. Consequently compaction sources and reconstructed requests contain opaque references, not an inverse mapping. Reconciliation already uses the same gate and now masks IDs in raw drafts/corrections too. Presence, legal/social/household/relationship fields and retrieval strings receive the same final input projection.

**Raw engine IDs remain unchanged** in canon, Scene RAM, TurnContext, controller envelopes, campaign state, commands/deltas, transactions, ownership, movement and knowledge edges. There is no generated-output rewrite or automatic name discovery. P3.1 name grants and knowledge semantics remain unchanged.

## 6. P6.2 BACKGROUND LIVE FAILURE

P6.1 reduced the auction-wait prompt and emitted each compact seller label once, but user-reported GLM narration continued scanning the sellers. Compact presence was apparently still treated as a reason to render them. Context size alone did not establish the intended narrative weighting.

## 7. P6.2 CONTINUITY-ONLY RULE

Exactly one rule appears adjacent to `[BACKGROUND PRESENT]` when background actors exist:

> BACKGROUND PRESENCE: Background actors are continuity context only. Do not mention, describe, or update them merely because they are present. Bring a background actor into narration only when the player's current attention, a causal event, or that actor's relevant action makes them matter.

The older overlapping task-end background guidance was removed, avoiding duplication. The rule applies to background actors; rich foreground payload remains available. Compact entries retain `present:true`, confidentiality markers and opaque references. The existing permission for anyone present to react remains unchanged. No actor is evicted, moved or made inert, and no background mentions are deleted after generation. `src/turn/narrator-focus.ts` and its classification/expiry signals are unchanged.

## 8. P10 SOFT OPEN

**P10 — Narrator perspective / immersion balance**

**STATUS: SOFT OPEN / OBSERVATION — collecting evidence.** Production fix: none. No D-number assigned. No existing dedicated playtest issue register was found; this report records the issue without modifying the technical debt register or creating a general tracking subsystem.

Hypothesis: rich world/location/spatial/character knowledge improves accuracy and should be preserved. Selection may nevertheless surface too much accurate but locally irrelevant material from a panoramic or detached perspective. Future work should examine what the narrator shows and from which perspective, while retaining canonical knowledge.

Track wide establishing shots, repeated actor scans, non-salient global detail, weak prioritization of Nicco's immediate perception, missing sensory micro-events, detached scene-state narration, internal interpretations/feelings assigned to Nicco, and completeness-driven exposition.

User-supplied example: “Home, or what Nicco has begun to think of as home.” This is an apparent player-internal/agency symptom, already in tension with the existing agency contract. It is recorded as evidence; no production perspective rule or line-specific repair was added.

## 9. P10 DATA COLLECTION RUBRIC

| Category | Classification |
| --- | --- |
| A | Useful grounding |
| B | Unnecessary panoramic exposition |
| C | Non-salient but accurate detail |
| D | Good immersive micro-detail |
| E | Player-internal/agency leak |
| F | Perspective-distance problem |
| G | Other, with explanation |

Collect examples across crowded public scenes, one-on-one conversations, Heartstone domestic scenes, movement/travel, exploration and tense/action scenes before designing a fix. For each, retain player input, exact delivered excerpt, relevant immediate scene/focus context, canon support, categories (multiple allowed), why the detail helped/hurt immersion and whether the player established any internal interpretation. Record useful grounding and good micro-detail alongside failures; do not optimize by removing world knowledge.

## 10. TESTS

New deterministic suite: `tests/p132-history-refs-background.test.ts`:

- P1.2: nine tests covering mixed markup, narration-only, plain-only, multiline speech, legacy quotes, unmatched blocks, multiple speech blocks, metadata rejection and actual dialogue-focused prompt retention/legacy attribution.
- P3.2: four tests covering full prompt/source scans for primary names and raw IDs, distinct/correlated refs, appearance retention, unchanged engine identity, learned-name availability with alias gating, embedded retrieval handles, compaction reconstruction and reconciliation inputs.
- P6.2: two tests covering retained roster/presence/reactions, exactly one continuity rule, opaque background entries, foreground appearance, unchanged scene truth and P1 format.

Existing assertions now expect opaque narrator references while continuing to check raw engine IDs separately. The historical orphan-quote test verifies retained speech without inheriting the preceding exchange's speaker. The golden trace comparison changes only seven narrator message-content paths; raw engine/controller state, commands, outcomes and all other trace fields are identical.

Validation:

- `npm run typecheck`: passed.
- `npm test`: 2,084 total; 2,080 passed, zero failures, four existing TODOs, zero skipped.
- `npm run test:playthrough`: 25 passed, zero failures.
- Focused new suite: 15 passed (P1.2 nine, P3.2 four, P6.2 two).
- Golden pipeline: six passed.
- P1 system format, P3.1 knowledge architecture, P6.1 focus classification, provider/model/sampling settings, pricing authority and wait/event runtime semantics preserved. Provider/network calls: zero. Local commit only, no push.

## 11. LIMITATIONS

Input-level scans prove opaque references in the tested narrator/compaction/reconciliation paths, not that a model can never infer or hallucinate a name. No live provider verification was performed. IDs embedded in narrator-facing handles are transformed, while their authoritative engine counterparts remain raw; those narrator handles are context references, not engine command identifiers.

Plain RPG dialogue is retained without inventing speaker attribution. Malformed/structured output is rejected conservatively, and legacy unmarked speech/action ambiguity cannot be fully resolved without new metadata. Existing quoted-history attribution remains the compatibility path. No output censorship, broader transcript retention, automatic identity discovery or agency/perspective subsystem was introduced.

P8 remains **OPEN / UNCHANGED**, including user-supplied price and seller-quote concerns. P9 remains **OPEN / UNCHANGED**, including auction/lot continuity and event-directed wait semantics. P10 remains observation-only.

## 12. NEXT PLAYTEST PLAN

Perform manual GLM testing after this local implementation:

1. **A — History:** an NPC speaks plain unquoted dialogue; across the next one to three turns check that the speech is remembered without inventing attribution or denying it occurred.
2. **B — Hidden name:** interact near undiscovered Korvin. Inspect full requests and delivered outputs for the name, raw ID and name-bearing handles. Narrator input should expose only the opaque reference and observable traits.
3. **C — Background:** move attention to the public auction. Private sellers remain engine-present but should normally disappear from prose unless causally relevant.
4. **D — Focus:** inspect one seller using observable traits. Check rich foreground appearance with the name still unknown.
5. **E — Move away:** return attention to the auction, including a generic follow-up; check that the seller is no longer refreshed in narration while background presence remains.
6. **F — P10:** collect panoramic/detached and immersive/player-centered examples using A–G categories. Do not design or judge a perspective fix yet.
