# Foreground Canonical Identity Binding — P0 hotfix

Base: main 63af784 (Actual Offer + delete-campaign). Nothing committed or pushed. Tests: 3262/3262, `npm run typecheck` and `npm run build` clean. Raw live evidence: `docs/evaluations/foreground_identity_live/` (final runs in `korvin/`, `bartholomew/`; every earlier run kept as `*_runN_*`). Harness: `src/dev/identity-live-cert.ts`.

## 1. Verdict
**FIXED, both live certifications PASS on the final code.** It took seven Korvin runs and five Bartholomew runs before the final pair; each earlier failure exposed a real defect that was fixed and pinned by a deterministic test (T17–T23). Final live runs: Korvin 2 turns, Bartholomew 4 turns, no new character, no actor-count change, name learned by the player, no audit issue.

## 2. Korvin reproduction
Turn 1 "looks for private licensed sellers": the Narrator shows a compact man (hooked nose, damaged hands) and Elara. Turn 2 "perhaps interested in buying, what's your name?": the Narrator wrote *"People call me Varro"* (run 1), *"Marek."* (run 2). `campaign_character_r3_marek` was created next to the canonical Korvin and the sidebar showed "Unfamiliar person + Marek".

## 3. Bartholomew reproduction
The same mechanism with the tonsured man: an invented personal name (Mael in the original report) became a new campaign character instead of the canonical Bartolomhew.

## 4. Root-cause classification
Classes **B, D, E and G together** (A excluded). In plain terms:
- **B**: no foreground binding. Neither the player's words nor the Narrator's own foreground were turned into an engine-held partner. The one existing narrated-surfacing path bound a *wrong* person (Elara) when two sellers were shown, because only she matched strongly.
- **D**: the NarrativeContext carried masked background labels only. The Narrator was never told who the person it was portraying objectively is.
- **E**: the name-establishment path treated any self-introduction in the delivered text as a new person.
- **G**: no post-generation protection against a conflicting name.

## 5. Retrieval candidates
Retrieval and the background list stay *information*. The authored appearance of present canonical actors reaches the Narrator as labels; it never becomes an actor identity by itself. The engine selects (section 6) and only that selection is objective.

## 6. Binding
Two scoped paths, no global fuzzy casting:
1. **Explicit player selection** ("goes to the tall man with a blond white tonsure"): `APPROACH_MOTION` verbs now count as engagement in `canonical-interaction-targets.ts`, so `strongCanonicalMatch` (≥3 authored traits, exclusive) binds the canonical actor.
2. **Narrated surfacing** (`foreground-binding.ts`): `narratedForegroundCanonical` binds when the delivered narration foregrounds exactly one canonical actor. It now binds nobody if the narration shows several (`surfacedCanonicals`).
3. **Answering speaker among those just shown** (`narratedSpeakerPartner`): when several were shown and the player asked a name without choosing, the speaker is resolved only among the surfaced people, using the narration that opens the reply, sex/role compatibility and either an authored trait or a word shared with the sentence that introduced that person ("the man on the stool"). Ambiguity binds nobody.

## 7. Turn boundary
`TurnCoordinator.recordExchange` stores `conversation_partner_id` (explicit focus or narrated partner) and commits `SceneParticipants` focus. It survives approach, dialogue and negotiation; a location change drops it.

## 8. NarrativeContext
`interactionPartnerBlock` (prompt-builder.ts): with a bound partner, `[CURRENT INTERACTION PARTNER — OBJECTIVE IDENTITY]` with `{ref, objective_identity, player_knows_name:false, presented_to_player_as}`. With several shown and a name request, `[PEOPLE JUST SHOWN TO NICCO — OBJECTIVE IDENTITIES]` listing each. The Narrator may only speak a name that is the listed objective identity, in the character's own words; an entry without a name must decline.

## 9. Masking / UI
Unchanged: the player sees "Unfamiliar person" until the name is learned. The sidebar never gets a second row (T1, T17, T18).

## 10. Character creation guard
`name-establishment.ts` skips creation with reason `canonical_partner_conflict` when the name belongs to the answering canonical partner and differs from its canonical name. A non-canonical existing participant who gives a name stays the same participant (T10). A true second person still creates exactly +1 (T12).

## 11. Exact fix (files)
`foreground-binding.ts` (new), `partner-identity-guard.ts` (new), `canonical-interaction-targets.ts` (approach verbs; `surfacedCanonicalMatch`), `canonical-name-disclosure.ts` (partner binding, inferred speaker, sentence-level name, bound-partner generic references), `scene-participants.ts`, `turn-coordinator.ts` (`recordExchange`), `prompt-builder.ts`, `name-establishment.ts`, `narration-audit.ts` + `stages/audit.ts`, `stages/commit-preparation.ts`, `narrated-captives.ts` (`nameFilter`).

## 12. Pre-Narration fix
Binding (section 6) plus the objective-identity blocks (section 8).

## 13. Post-Narration fix
**Policy: reject, never rewrite.** `partnerNameConflict` finds a personal name the partner gives (explicit "I'm / my name is / Name's X", a bare leading name answering a name question) that is not its canonical name. Effects: no character, alias or knowledge; audit issue `canonical_name_conflict` requests one bounded revision; the redaction removes the sentence if the revision still conflicts. Attribution wins: a different explicit speaker ("the thin man beside him says:", "another man") is not misbound (T11).

## 14. Actor-count invariant
Every canonical-partner test asserts `plan.participants.length` and the count of created characters unchanged (T1, T5, T8–T9, T17–T23).

## 15. Player knowledge
Only `campaign_fact_identity_name_<id>` changes, through `learnCanonicalName`. Objective identity is untouched. Parser change: the name may be one whole sentence of a longer line when the player asked a name ("Korvin. What are you after?"), judged by the narration *before* the name line. **This reverses one earlier fail-closed case**: `"Korvin. Looking for something particular?"` in `p35-name-knowledge-commit.test.ts` now learns the name; `I'm Korvin, also called Hargan.` still fails closed.

## 16. Avatar
Canonical avatar stays on the one canonical actor after the reveal (T6).

## 17. Why Pass 2 missed it
Its fixtures had the player describe the person in the same turn as the name request, so canonical casting ran inside that turn. Production never did that: the Narrator chose sellers on a turn that named nobody and the next turn carried no referent. The historical replays also reused player-authored selections.

## 18. Deterministic tests
`tests/foreground-canonical-binding.test.ts`, 22 tests: T1/T2/T5/T14/T15 Korvin surfaced → same actor; T3/T4 invented name rejected (four phrasings); T6 avatar; T7/T8 descriptor selection; T9 Mael; T10 promoted temporary participant; T11 explicit other speaker; T12 true second person; T13 context continuity; T17–T23 the seven live-found defects. Adjusted: `p35` (section 15). Full suite 3262/3262; the known flaky `generation lifecycle` image test failed once in two runs and passes in isolation, untouched as ordered.

## 19. Korvin live result — PASS
Final run: turn 2 "Korvin." from the compact man; `campaign_fact_identity_name_korvin` learned; created characters 0; present 3; audit clean; 2 narrator + 2 controller calls.

## 20. Korvin turn-2 pre-Narration audit
The request carried `[PEOPLE JUST SHOWN TO NICCO — OBJECTIVE IDENTITIES]`: NPC24 objective_identity "Korvin", NPC31 "Mistress Elara", NPC3 "Bartolomhew", `player_knows_names:false`, each `presented_to_player_as` the masked label. Full request: `korvin/turns.json` → `turns[1].final_narrator_request`.

## 21. Bartholomew live result — PASS
Final run: turn 3 binds the canonical tonsured man; turn 4 "Bartolomhew. A pleasure." learned (`campaign_fact_identity_name_bartolomhew`); created 0; present 3; audit clean; 4 + 4 calls.

## 22. Bartholomew turn-4 pre-Narration audit
`[CURRENT INTERACTION PARTNER — OBJECTIVE IDENTITY]` `{"ref":"NPC3","objective_identity":"Bartolomhew","player_knows_name":false,"presented_to_player_as":"the unfamiliar man: Approximately 183–185 cm tall, blond hair…"}` plus the "never invent, substitute or imply a different name" rule. Data quirk: the canonical id is `bartolomhew` and the name "Bartolomhew" (typo for Bartholomew); the Narrator reproduces the canonical spelling.

## 23. Provider calls
Final pair: Korvin 2 narrator + 2 controller; Bartholomew 4 + 4. All twelve live runs including the failed ones: 43 narrator and 40 controller calls (a few revision calls). Models: narrator `z-ai/glm-5.2`, controller `openai/gpt-6-luna`. No controller fallback observed, no transient retries. One run was lost to a missing `OPENROUTER_API_KEY` placeholder (a configuration error, zero calls; the proxy injects real auth).

## 24. Cost
About 219k narrator prompt + 9.5k completion tokens and 270k controller prompt tokens in total. Estimated well under 1 USD; prices were not verified against OpenRouter.

## 25. Actual Offer compatibility
Name disclosure updates the player-facing presentation only; the subject ref and ownership are unchanged, so an offer on the same canonical subject stays valid. No Actual Offer code was touched and its suite passes.

## 26. Remaining risks
- Resolution of "who answers" among several shown people is heuristic (traits, shared words). It fails closed, which can leave a correctly revealed name unlearned until the next turn.
- The conflict guard recognises explicit introductions and a leading bare name only; an invented name used in running speech without a name question is not caught.
- A bystander described *before* the name line can still block learning.
- Only these two scenarios were run live, as ordered; no historical replay.
- The P3.5 behaviour change (section 15) should be reviewed by the owner.
- The Narrator's prose varies run to run; the live PASS is one sample, backed by the deterministic tests.
