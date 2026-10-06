# P12.2 Canonical Departure Reconciliation

Date: 2026-10-06. P12.2: **IMPLEMENTED / LIVE VERIFICATION PENDING**. P12 overall: **OPEN**. P12.1 and P11 implementations unchanged.

## 1. Scope

Completed immediate departure, unknown destination, from the current player scene, of one uniquely identified present canonical NPC. Reuse leave_scene and existing OFF_SCENE runtime semantics. No new movement subsystem, save fields, scene facts, extraction model, pending events, schedules, time costs or wait-until. No change to general move_character narrative eligibility, ordinary canonical arrival eligibility, created-character movement or NPC+ movement rules.

## 2. Previous reproduced divergence

[Before-fix traces](docs/evaluations/p12-2-departure/before-fix.json), captured before editing at 0f273ed, reproduce three controlled canonical Korvin drafts:

- A nod to Nicco, walking through the doorway, and footsteps fading until he is gone.
- A retreating back halfway down the path, disappearing around a corner, and subsequent absence.
- A retreating back halfway down the path, then he is gone.

Each trace contains canonical ID, runtime placement, Scene RAM presence, draft, parsed departure evidence, controller proposal, authorization, authorized/prepared outcome, audit/reconciliation, delivered text, committed snapshot, finalized history and next request. All three had empty legacy departure evidence, rejected leave_scene(korvin), no accepted placement command, unchanged audit_room placement, unchanged delivered departure and false departure replay in P12.1 history.

The first loss is evidence extraction: the legacy parser fails these actor/possessive/RPG forms. Independently, ordinary canonical eligibility rejects the command. The same missing departure detection in the audit then allows unsupported prose to pass delivery. A prompting-only precedence rule cannot repair these three seams.

## 3. Current departure pipeline

Draft -> existing narration/evidence stages -> bounded canonical departure claims -> strict eligibility/destination/contradiction filters -> leave_scene proposal recall -> normal authorization -> campaign preparation -> audit of draft -> at most one revision -> existing deterministic redaction -> guarded commit/final delivery -> finalized history.

The helper separates claims from permission: the audit receives completed claims even when ambiguous or contradictory, whereas authorization receives only admitted departure evidence. A verified controller quote cannot bypass the ordinary canonical admission gates. Revisions are audited against already prepared placement and cannot invent a return for an accepted departure.

## 4. Existing eligibility policy

Created campaign characters already support narrative movement to known places and destination-less departure, with current_location removal. Active household NPC+ already support evidence-backed typed movement, unknown-destination OFF_SCENE and completed named arrivals under the existing entrance rules. Ordinary canonical NPCs historically remained canon-placed in narrative authorization; known movement and leave_scene were excluded. The campaign layer already allowed trusted typed move_character for canonical actors, and runtime already supported OFF_SCENE, but the leave_scene command handler limited canonical departure to active household NPC+.

That policy protected authored whereabouts from arbitrary narrator relocation. This pass preserves that intent with a narrower visible-departure exception rather than granting general relocation rights. Presence and attention stay separate: foreground status is not movement evidence.

## 5. Chosen minimal policy

Accept only a living canonical actor currently present in authoritative context and physically located with Nicco in projected runtime, with unambiguous completed narration and unknown destination. This conservative path also requires Nicco's origin and arrival to match, excludes dependent following and bare stairs, excludes existing grammar-resolved known movement/door destinations, blocks multiple candidate canonical actors and blocks actor-bound return/continued indoor presence/interruption.

Present ordinary canonical actors can use the existing leave_scene state command. No permission to teleport, move actors elsewhere, travel off screen, simulate groups or infer destinations. Already absent, elsewhere, dead, player-role and unknown references do not qualify. All usual revision/cancellation/preparation/commit safeguards remain in place.

## 6. Completed-departure evidence

canonicalDepartureClaims in the existing scene-departure module shares DEPART_ACT, language gates, sentence boundaries, identity bindings and the RPG narration parser. For RPG output it reads only complete starred narration, not plain spoken lines. Legacy unstarred narration retains the existing quoted-speech exclusion. Original source sentences are retained for audit and redaction.

Intention, modality, conditionals, instructions, negation and displaced historical references do not supply canonical permission. Completion is distinguished from looking toward an exit or starting toward it. Physical trace completion is detected before a following endpoint phrase such as 'until he is gone'; this avoids misreading that endpoint as a future wait condition.

## 7. Actor attribution

Actor-led canonical name/ID, existing opaque ref or unique observable identity label may bind a claim. Adjacent pronouns retain the prior single explicit subject, with established sex compatibility; compound subjects clear that binding. Generic man/woman descriptors consider all compatible present actors, including uncertain sex, and uncertainty or multiple candidates fails closed. Multiple named canonical candidates in a sentence are conservatively rejected even if one might be an object rather than the mover.

No canonical identity is learned or changed by departure evidence. Controller evidence cannot upgrade an ambiguous/unsupported ordinary canonical exit into permission.

## 8. Possessive wording

Support a bounded physical-subject family: retreating back, footsteps and figure, with disappearing/vanishing/fading completion cues. Direct 'is gone' remains available for an actor-bound physical trace. Abstract possession ('patience is gone') does not imply movement, including when the subject uses an opaque reference or masked identity label. The supplied possessive failure styles pass without an endless vocabulary expansion.

## 9. Canonical OFF_SCENE transition

[After-fix traces](docs/evaluations/p12-2-departure/after-fix.json) show each reproduced draft now authorizes exactly one leave_scene(korvin), preserves original delivered narration and commits:

```text
OFF_SCENE { last_known_location: audit_room, since_revision: 3 }
```

No destination is invented. Next Scene RAM and NarrativeContext omit Korvin from presence. Identity, knowledge, relationships, other state and time remain unchanged. Tests check final-revision metadata and lossless snapshot restore. Departure is placement change, not deletion or conversion to a created/temporary character.

## 10. Unsupported-departure reconciliation

The audit adds bounded canonical claims to existing uncommitted_departure checks. Rejected/ambiguous/contradictory claims request one revision; a still-invalid revision uses existing sentence-level redaction/withdrawal. It catches direct exit and actor-bound indirect continuations, avoiding a leftover 'footsteps fade until he is gone' after the first sentence is removed.

Already absent canonical actors are checked using the same helper with explicit audit-only actor metadata, so another current departure cannot be delivered or reset since_revision. Historical absence references remain distinct. The existing generic redaction fallback is reused; no new name/verb-deleting postprocessor or alternative destination fabrication.

## 11. Player-authored comparison

Player input alone ('Korvin leaves') does not produce a canonical placement command. A controller leave_scene proposal without qualifying narrator evidence is rejected. Created-character player-authored exemptions remain unchanged. If independently qualifying narrator departure is delivered in response to player prose, it goes through the same narrow canonical evidence/authorization path; the player's words themselves are not authority to relocate an arbitrary NPC.

## 12. Created and NPC+ regressions

Created-character default departure evidence and current_location removal are unchanged. Active NPC+ movement/door/stairs/OFF_SCENE/arrival paths retain their existing rules. New direct created-character regression and existing movement/follow/NPC+ closure suites pass. Two historical tests were updated because the explicitly requested policy now permits present canonical OFF_SCENE preparation/departure. One historical test's placement helper also incorrectly fell back to authored default location for OFF_SCENE; it now uses the existing authoritative characterLocation accessor.

## 13. Reentry

Existing typed canonical move_character can restore OFF_SCENE to LOCATED(audit_room); the new test verifies runtime placement and scene presence. Existing active NPC+ completed-arrival/reentry tests pass. Ordinary canonical narrator-derived arrival remains ineligible as before: this pass does not create automatic ordinary canonical reentry rights. Any future expansion belongs to a separate policy decision.

## 14. P12.1 interaction

No P12.1 production source changes. After accepted departure, finalized original departure can appear in the two-turn current-visit block while current structured presence omits Korvin. The prompt's closed-world presence rules provide authoritative absence; no new OFF_SCENE prompt section is added. After rejected/reconciled departure, only corrected delivered text enters finalized history, so false departure claims do not appear in the next bounded block. The unchanged 19-test P12.1 suite passes.

## 15. Conflict handling

Departure plus same-turn return, continued indoor position, speech from inside or interruption fails closed; no multi-step movement simulation. The draft is reconciled against unchanged placement. If another audit issue causes a revision after accepted departure, actor-bound current indoor presence is audited against accepted absence. Explicit/opaque/observable identity terms share this contradiction binding.

The reproduced contradiction is prevented before final delivery rather than relying on the model choosing state over prose. This guarantee covers the bounded recognized departure forms, not all possible English descriptions.

## 16. Tests

Typecheck PASS. Full suite: **2,306 tests, 2,302 PASS, 0 failures, 4 historical TODOs**. Playthrough: **25/25 PASS**. Focused: **348 tests, 344 PASS, 0 failures, 4 historical TODOs**, covering scene departure, canonical/NPC+ movement, OFF_SCENE, arrivals/reentry, authorization, reconciliation, RecentConversation/P12.1, focus/presence and P3.4 continuity. New P12.2 matrix: **36 tests**. Golden tests passed without fixture regeneration.

Covered direct/possessive examples, intended/future/conditional/instruction/abstract language, ambiguous actor, absent/double departure, other-location departure, created characters, existing NPC+ movement, typed canonical reentry, known-destination exclusion, player-prose-only rejection, same-turn contradiction, quote-bypass rejection, indirect-continuation withdrawal, identity terms, time/knowledge preservation and save/restore.

## 17. Live verification

**0 new API calls; $0 new cost.** The required contradiction is a deterministic evidence/authorization/state/audit defect. Scripted full-pipeline before/after traces and rejection tests establish the fix without probabilistic model behavior. No controller, narrator, embedding or alternate-model paid calls. Ordinary-play verification remains pending; this does not erase the historical P12/P12.1 live evidence or claim broad model compliance closure.

## 18. Remaining limitations

- Evidence remains bounded grammar, not universal semantic extraction; unsupported wording outside coverage may need a separately reproduced repair.
- Known-destination ordinary canonical narrative movement, automatic ordinary canonical arrivals, groups and multi-step movement remain outside scope.
- The ordinary canonical exception requires Nicco to stay; travel-turn departures remain conservative reconciliation cases.
- Conservative ambiguity/contradiction checks can withdraw otherwise plausible prose. No synonym hunting or generalized coreference was added.
- Existing generic redaction and historical TODO limitations remain; no unrelated formatting or audit redesign.
- Existing callers of trusted campaign commands remain responsible for normal authorization; campaign preparation validates representation/presence/revision, not natural-language evidence.

## 19. P12 overall status

P12.2: **IMPLEMENTED / LIVE VERIFICATION PENDING**. P12.1: unchanged, still **IMPLEMENTED / LIVE VERIFICATION PENDING**. P12 overall: **OPEN** until ordinary-play verification and remaining event-continuity concerns are reviewed. P11 unchanged. This narrow implementation supersedes the prior 'P12.2 not implemented' status without rewriting historical reports/evidence.

## 20. Future wait-until impact

Removes the reproduced immediate canonical departure/state mismatch for covered forms. It does not represent future promises, pending arrivals, completion events or schedules. Event-directed wait-until remains blocked pending live continuity verification and an explicit pending/completed-event design decision. No wait-until or event engine added.
