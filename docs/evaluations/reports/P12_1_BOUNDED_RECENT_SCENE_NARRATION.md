# P12.1 Bounded Recent-Scene Narration

Date: 2026-10-06. P12.1: **IMPLEMENTED / LIVE VERIFICATION PENDING**. P12 overall: **OPEN**. P12.2: **OPEN / NOT IMPLEMENTED**.

## 1. Scope

Repair prompt projection only. RecentConversation storage, CampaignState, save schema, runtime mutation policy, P11, identity knowledge, foreground/background selection, model/provider configuration and retrieval are unchanged. No persistent memory, scene-fact store, extraction, room coordinates, inventory creation, door-state system, event log or wait-until implementation.

## 2. Proven audit failure

[P12 audit](P12_IMMEDIATE_SCENE_CONTINUITY_AUDIT.md) and its committed evidence remain unchanged. Full finalized delivered narration was already retained; default dialogue_focused history removed starred descriptions through rpgDialogue. Immediate door, restraint, packet and hearth descriptions therefore disappeared before generation. Diagnostic full_prose established information availability, but also demonstrated the danger of treating historical prose as state.

## 3. Projection design

Keep existing dialogue-focused player/speech history. Add a distinct `[RECENT SCENE NARRATION]` block before the current player action, only when eligible narration exists. rpgNarration shares the existing RPG guard and asterisk-boundary matcher, returning original complete starred spans, without interpreting facts. Unmarked prose is not guessed into narration; malformed or metadata-bearing output supplies no spans.

The coordinator supplies finalized history with retained location metadata via recent_scene_source. Existing forPrompt() output remains unchanged and continues stripping location metadata. Both ordinary turn composition and between-turn contextRequest use this source. This is source plumbing, not a configurable replay policy. Diagnostic full_prose/state_last modes retain their existing projection without duplicate narration.

## 4. Window and budget

Two most recent finalized exchanges, limited to the contiguous current-location visit. Narration body budget: **2,000 UTF-16 characters**, including separators, measured after identity masking. Constants are fixed; no new settings. Prefer newest complete starred spans, omit spans that do not fit, then render retained spans chronologically. Never cut a paragraph, asterisk pair or surrogate sequence. Whole oversized paragraphs can be omitted even if storage retained them.

Only narrator spans consume this budget; player actions and NPC speech remain in the existing history projection. Each exchange may contain several complete starred paragraphs. The small fixed heading/rule frame adds 214 characters, so the entire new block is at most 2,214 characters. The existing overall request budget still applies; this is a character cap, not a guaranteed tokenizer count.

## 5. Scene-local filtering

Walk backward from the latest finalized exchange and stop on a different location or missing location metadata. Do not search all retained entries for matching room IDs. No current location means no block. A travel request's projected destination excludes previous-room narration. On return, an intervening path exchange prevents stale room narration from resurfacing; only finalized material from the new visit becomes eligible.

This is immediate visit continuity, not persistent room memory. It relies on existing after-exchange location metadata; it does not semantically split a travel narration across locations.

## 6. Identity masking

Each original starred span passes through the existing narratorIdentityGate.mask before budget selection. It is inserted after surrounding prompt portions receive that same mask, avoiding a second transformation or unbudgeted name expansion. Unknown Korvin becomes exactly the existing observable descriptor; canonical handles use existing opaque refs. Name knowledge, controlled self-disclosure, aliases and output rendering rules remain unchanged. No new speaker attribution or identity inference.

## 7. State precedence

The short block rule is:

> Immediate continuity only. CURRENT STRUCTURED STATE overrides recent scene narration on conflict; do not resurrect actors, items, conditions or positions contradicted by committed state.

Existing system/state precedence and current presence/equipment remain supplied. Historical prose gains no mutation rights and cannot create current presence or foreground membership. This is an explicit instruction, not a guarantee of model obedience.

## 8. Door result

Deterministic case B: `*The front door swings shut.*` survives in the next prepared request for `*walks toward the door*`. No typed door mutation. Live bounded result approached the heavy door without establishing open/closed state: **UNRESOLVED**, under the preregistered criterion. No unsupported opening was asserted. Do not claim live door continuity passed.

## 9. Restraint result

Deterministic case D preserves `*Maren's wrists remain tied.*` for the next look-at-hands request. Live bounded result explicitly described cord binding her wrists and bound hands: **PASS**. No restraint state, removal policy or accomplished-restraint permission was added.

## 10. Packet result

Deterministic case C preserves `*Korvin places a folded packet on the table.*` for the next pickup request. Campaign snapshot and inventory remain unchanged. The packet is continuity prose, not an automatically registered item. No paid packet call was needed to establish request inclusion.

## 11. Position result

Deterministic case E preserves `*Maren crosses the room and sits beside the hearth.*`. Live bounded result explicitly placed her sitting beside the stone hearth: **PASS**. No room coordinates or position mutation. Original baseline placed her at the table; its historical grading remains OTHER_POSITION_CONTRADICTION rather than retroactively redefining the preregistered entrance-only FAIL.

## 12. Player-authored comparison

Case F keeps `*closes the front door*` in player history exactly once. The new block includes only the narrator acknowledgment, not another copy of the player action. NPC speech appears only once in dialogue history; it is excluded from the new block. Original history storage is unchanged. Existing UI alternate-generation tests confirm failed turns and regenerated alternatives do not change authoritative history; only finalized delivered output reaches the new source.

## 13. Scene-change behavior

Direct boundary tests and actual coordinator travel/return tests pass. audit_room narration is absent at audit_path and does not revive when returning. A new room arrival can be included without the stale prior-visit door description. Missing location metadata fails closed for this block while leaving dialogue history behavior intact.

## 14. Compaction behavior

No compactor changes. The new block is outside the registered knowledge replacement boundaries, in fixed_context. Tests verify exact block preservation in the existing extractive renderer and all three lossless layouts: expanded, grouped and dictionary. Generic knowledge compaction cannot rewrite or drop it. Hard request-budget rejection remains available when fixed context itself does not fit; no alternate compaction system or hidden history trimming was added.

## 15. Conflict behavior

The deterministic conflict request contains Korvin's historical departure, current structured presence and the explicit precedence rule. Runtime stays unchanged. Frozen GLM bounded conflict completion confidently said Korvin had already crossed the threshold and shut the door: **FAIL**. This reproduces a compliance limitation despite the instruction. Do not interpret this as committed departure, add invented reconciliation, change canonical movement eligibility, or broaden P12.1 into P12.2.

## 16. Live A/B

[Frozen requests](docs/evaluations/p12-1-scene-narration/frozen-requests.json), [raw receipts](docs/evaluations/p12-1-scene-narration/live-ledger.json), [grades](docs/evaluations/p12-1-scene-narration/live-grades.json).

Model z-ai/glm-5.2, route z-ai/fp8, fallbacks disabled, max output 512, one attempt per request, no automatic retry. Reused the three already completed P12 normal baseline calls rather than paying to repeat unchanged requests. For B/D/E, assertions verify identical system and user prompt bytes except the new continuity block. Final production request hashes match the paid frozen requests. Serialized AbortSignal was excluded from the portable transport envelope; prompt bytes were unchanged.

| Case | Reused baseline A | New bounded B |
|---|---|---|
| Door | UNRESOLVED | UNRESOLVED |
| Restraint | UNRESOLVED | PASS |
| Hearth | Other-position contradiction | PASS |
| Structured-state conflict | Historical full-prose diagnostic followed departure | FAIL; bounded departure still wins |

The conflict comparison uses different historical modes and is not a matched A/B. Four new calls completed; reported new cost **$0.01141032**. Reused baseline costs belong to the prior audit and are not charged again. These single completions demonstrate utility and a remaining limitation, not reliability across random samples. Stop here: additional calls cannot repair the deterministic projection seam or the reproduced precedence issue.

Automatic review initially rejected the outbound calls because it did not establish attachment authorization. After reading the user's exact authorization/model/route lines and inspecting synthetic payloads for credentials, re-review approved the same requested action. The rejection incurred no API call or cost.

## 17. Token and prompt impact

Frozen B/D add 243 characters / 61 estimated tokens each; E adds 266 / 67. The estimator is the repository's UTF-8 bytes/4 heuristic, not a model tokenizer. Full 2,000-character ASCII body plus frame is roughly 554 tokens; Unicode can cost more. No system-prompt increase. Empty/ineligible history adds zero characters. The ordinary 12-turn dialogue buffer remains unchanged; full retained prose is not replayed.

## 18. Remaining P12.2 divergence

**OPEN / NOT IMPLEMENTED.** Ordinary canonical Korvin departure may be narrated while leave_scene is rejected and runtime still places him in the room; audit misses can include possessive departure wording. No departure grammar, audit, leave_scene eligibility or canonical movement policy changed. The live conflict makes current-state compliance risk explicit instead of concealing it with a historical departure treated as truth.

## 19. Is new scene-fact state necessary now?

**NO, based on current evidence.** Existing retained narration already provides the missing immediate facts; bounded projection restores their availability and improved restraint/hearth outcomes without new state. Door remains unresolved, and conflict is a model compliance/P12.2 issue rather than proof that a second memory store is needed. Longer-lived facts beyond two turns, semantic updates and stale-fact resolution remain outside this pass. Reassess only with evidence that this bounded replay is insufficient.

## 20. Future wait-until

**STILL BLOCKED ON EVENT CONTINUITY / P12.2.** Event-directed wait-until needs reliable immediate continuity, pending/completed event representation and canonical actor/runtime reconciliation. P12.1 alone is insufficient. P11 temporal implementation is unchanged.

## 21. Validation and live verification checklist

Typecheck PASS. Full unit suite: **2,270 tests, 2,266 PASS, 0 failures, 4 historical TODOs**. Playthrough: **25/25 PASS**. Focused history/RPG/identity/P3.3/P3.4/P3.5/compaction/focus/UI/P12.1 suite: **230/230 PASS**, including 19 new P12.1 tests. Golden tests passed unchanged; no fixture regeneration. Historical provider source-hash checks pass.

Before any broader live closure:

- Verify immediate door closure/opening, packet handling, restraint and seating in ordinary play without player reminders.
- Check two-turn expiry, travel/return, budget omissions and compaction during representative scenes.
- Confirm unknown/known identities and foreground/background behavior remain correct.
- Measure state/prose conflict behavior without disguising canonical movement mismatches.
- Address P12.2 separately; do not close P12 overall from these controlled samples.

P12.1 remains **IMPLEMENTED / LIVE VERIFICATION PENDING** as requested. No push; local commit only.
