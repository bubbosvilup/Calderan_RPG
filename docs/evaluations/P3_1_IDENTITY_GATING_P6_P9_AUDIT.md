# P3.1 identity gating and P6/P9 scene progression audit

## 1. BASELINE

Baseline: `378b7a6`, following the persistent P1 format contract and P3 prompt rule. The reported live sequence alternated descriptive seller labels with undiscovered names; repeated auction waits reintroduced sellers without starting the auction. This task used deterministic local tests only, not a new live-provider evaluation.

## 2. P3.1 CURRENT IDENTITY PATH

WorldStore holds canonical characters. Scene RAM selects current-location members; NarrativeContext and TurnContext carry their canon, knowledge, social context and portrayal. `buildNarratorPrompt` serializes those records. Raw engine/controller data must retain canon for adjudication; narrator input now has a separate derived identity projection.

## 3. P3.1 LEAK PATHS

Before this change, an unknown primary name could enter through character headings, baseline `name`/`display_name`, full profile `name`/`aliases`, public summaries and content, private notes admitted by knowledge policy, relationship prose, appearance/portrayal references to other people, presence/legal/social context, NPC+ character labels, knowledge-holder labels, market/ancestry lore, retrieval, player input and retained conversation. Several sections exposed the same seller. Compaction reconstructed knowledge from raw source units; reconciliation could repeat a name from a raw draft or correction.

Canonical names were available independently of Nicco's name knowledge. Titles and aliases were also serialized. Stable internal IDs are intentionally retained, including name-derived IDs; they are references, not permission to use a proper name in prose.

## 4. P3.1 STRUCTURAL FIX

`src/turn/narrator-identity.ts` derives identity metadata from canon and Nicco's existing knowledge edges, outside serialized TurnContext via a WeakMap. Example unknown seller:

```json
{
  "internal_id": "bartolomhew",
  "player_known_name": null,
  "observable_label": "the unfamiliar man [NPC3]",
  "observable_appearance": "<full authored appearance retained>",
  "player_known_aliases": [],
  "player_known_affiliations": []
}
```

The stable label is derived from world order and sex; full appearance is a separate field. Prompt baseline/profile name fields use null or the learned name. Proper canonical name/display-name/alias strings are substituted across the assembled narrator input, including incidental prose and retained history. Knowledge access and compaction source units receive the same projection. Reconciliation input also receives it. Personality, appearance, location, scene membership, relationships and engine IDs remain available; only identifying strings within prose are substituted. Raw canon, controller evidence and generated output are not rewritten.

`src/campaign/identity-knowledge.ts` adds a name-only canonical reference fact convention and existing Nicco `knows` edge. It stores no duplicate name value and introduces no schema or second knowledge system. Name-only facts are excluded from generic full-entity fact expansion, avoiding biography disclosure. The P3 prompt rule and P1 system contract remain exactly once and unchanged.

## 5. P3.1 NAME DISCOVERY LIMITS

Discovery is **manual/authoritative**, not automatic dialogue extraction. `learnCanonicalName` supplies existing campaign commands for host-confirmed introduction, another speaker, overhearing, written evidence or starting knowledge, with optional existing provenance. Commands survive snapshot restore and are idempotent. Fixture residents now have explicit authored starting grants. An existing Nicco `knows` edge to a whole canonical character also authorizes the primary name; rumors, another NPC's knowledge, unrelated textual facts and arbitrary mentions do not.

No production parser safely distinguishes a real introduction from a hallucinated narrator mention, so no automatic promotion was added. No UI discovery command was added. Name knowledge does not grant aliases, titles or affiliations: explicit permission arrays stay empty. Canon affiliations and relationships remain internal context; primary/alias strings embedded there are masked. General affiliation disclosure is still governed by existing player-knowledge policy, not a new affiliation parser. Case-sensitive canon spellings are projected; stable IDs remain visible. This removes tested prompt leakage paths, but cannot guarantee that a model never infers or invents a name. No paid live output test was performed.

## 6. P3.1 TESTS

Nine tests in `tests/p31-identity-gating.test.ts` prove unknown seller identity nulls; retained appearance/personality and engine IDs; durable, idempotent grants without redundant strings; known-name availability; alias/title gating; no unlock from rumor/NPC-only knowledge/raw mentions; cross-section summaries/relations/private notes/retrieval masking; safe compaction reconstruction; known fixture continuity; unchanged P1/P3 rules; and gated reconciliation inputs.

Existing assertions now distinguish gated narrator labels from engine IDs and explicitly grant names in already-known scenarios. Golden traces were refreshed. After removing only the new explicit fixture identity grants, engine trace comparison is unchanged; seven scalar differences concern narrator envelopes/request metrics.

## 7. P6 ROSTER FIXATION AUDIT

| Question | Finding |
| --- | --- |
| All scene characters included every turn? | All eligible narrator-visible canonical members are included; irrelevant present sellers remain. Limits fail rather than silently rank/drop members. |
| Canonical relevance ranking? | None in Scene RAM/NarrativeContext selection. |
| Engaged/nearby/present/background distinction? | Scene RAM uses coarse current-location membership, without those tiers. |
| Seller prominence? | Local unknown-name market prompt: system 8,318 characters, user message 19,234; seller baseline JSON sizes 2,752 / 1,857 / 2,285 characters, total 6,894. |
| Multiple sections? | Baselines, profiles, presence/social labels, portrayal and market lore repeat sellers; NPC+/knowledge can add more. Projected label occurrences were 15 / 12 / 11; these count metadata repetitions, not independent facts. |
| Retrieval reinforcement? | Possible when retrieval is requested; exact reported wait has `retrievalRequired=false`, so retrieval is unnecessary for this exposure. |
| Prompt requires all salient actors rendered? | No. Reaction policy explicitly says present actors may react and none must. |
| Authoring salience? | Three specialist sellers have detailed market-linked content and the same coarse market location. Canon explicitly says they do not operate the public auction. |
| Recent focus weighting? | Temporary participants have focus/last-addressed/expiry; NPC+ has relevance weighting. Neither ranks canonical roster membership. |
| May omit irrelevant visible NPCs? | Yes, current rules allow omission. |

Source paths: `src/scene/scene-ram-builder.ts`, `src/turn/context-builder.ts`, `src/turn/prompt-builder.ts`, narrative context, NPC+ and scene-participant builders. Moving attention to the public auction inside `slave_market` does not create a separate canonical subscene. Four deterministic tests in `tests/p6-p9-scene-audit.test.ts` cover exposure and progression findings.

## 8. P6 ROOT CAUSE

**A/B/C/F confirmed structurally**: all present canonical NPCs exposed, no canonical ranking, repeated context paths, detailed authoring. **E conditional**, not needed for the observed wait input. **D unsupported**: prompt allows omission. **G contributing mechanism**: dialogue-focused history discards descriptive preparation/reintroduction beats, weakening memory that exposition already occurred. These are exposure mechanisms; deterministic tests do not prove which caused a particular live model response.

## 9. P6 RECOMMENDED NEXT STEP

No tiny fix applied. Separately design a narrator foreground/focus projection and deduplicate descriptive payload while preserving the full authoritative roster, stable references and reaction capability. Test attention changes within a coarse location and continuity across turns before implementing. Do not evict actors from engine truth merely to reduce prose repetition.

## 10. P9 WAIT/PROGRESSION AUDIT

| Question | Finding |
| --- | --- |
| Wait representation? | Event-directed `*waiting for the AH to start*`, `*waits for the auction to start*` and `*I wait.*` fall through to generic natural intent with no runtime delta/candidates. |
| Explicit wait/no-op type? | No wait-until action type. Numeric wait parsing exists. |
| Controller treatment? | These event-directed waits authorize no state change; narration can respond. Controller cannot invent a time/event mutation. |
| Time without movement? | Yes: `I wait 10 minutes.` advances 600 to 610 without movement. |
| Elapsed-time delta? | `SceneDelta.time_advance_minutes` and runtime `advance_time` exist; numeric waits accept bounded durations. |
| Coordinator exposes time? | Runtime intent is projected before context construction; narrator sees updated minute 610. |
| Explicit mundane-event permission on wait? | No specific wait/progression contract. Ordinary nondurable happenings are possible. |
| Unrepresented events forbidden? | Durable state inventions are constrained; no blanket narration audit prohibition on mundane scene prose. |
| Is auction begins unsupported? | `auditNarration("*The auction begins.*")` returns no violation. Exact timing, lots and durable results still need authority. A blanket prohibition is not demonstrated. |
| Existing event logic? | Agenda supports schedule/reschedule and scheduled/triggered/completed/cancelled statuses, but no automatic due-event dispatcher. Advancing past due minute leaves an event scheduled with negative remaining minutes; controller authorization does not supply an arbitrary event-status transition. |
| Auction state backing? | Opening snapshot has no scheduled auction, first-lot/bidding lifecycle or auction event model. Canon has general daytime auction prose only. |

Sources include player-intent/natural-actions, TurnCoordinator intent projection, campaign agenda/commands and controller authorization. Prompt says narrative progression alone never advances time or campaign state. Dialogue-focused history also omits prior descriptive preparation beats. None of these source behaviors were changed.

## 11. P9 ROOT CAUSE

**A/B/D/F for the reported event-directed waits**: effective state no-op, no elapsed time, no auction lifecycle, and no recognized wait-until intent. Numeric waits are an existing exception to A/B/F. **G**: prior description is omitted from dialogue-focused history. **E plausible framing**, without causal live proof. **C ambiguous**, not a demonstrated blanket ban: simple auction-start prose passes audit, while invented durable event state remains constrained.

## 12. P9 RECOMMENDED NEXT STEP

No tiny fix applied. A separate bounded change should define wait-until/relative-duration intent against an authored scene-local event, specify the target and elapsed-time authority, project time, and explicitly transition the event once. Author the auction lifecycle needed for starting/first lot/bidding. This requires semantics and state backing, not simply connecting an existing automatic scheduler. No general simulator added here.

## 13. VALIDATION

- `npm run typecheck`: passed.
- `npm test`: 2,053 total; 2,049 passed, zero failures, four existing TODOs, zero skipped.
- `npm run test:playthrough`: 25 passed, zero failures.
- Focused final run: nine P3.1 plus four P6/P9 deterministic tests passed (13/13).
- Golden pipeline tests: six passed; normalized engine trace unchanged.
- P1/P3 prompt rules unchanged. Provider/model/sampling/max-token behavior, P8 pricing/quote/bid authority, UI layout, D-register and P6/P9 runtime semantics untouched.
- Network/provider calls: zero. Local commit only; no push.
