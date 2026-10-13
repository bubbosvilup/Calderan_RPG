# Consolidation Block 11 - final semantic architecture (identity / speaker / recipient / references / residual reader sweep)

Status: implemented, NOT committed, NOT pushed. Baseline `7345549` (main, Block 10 pushed). Date 2026-10-13.

> **FACTS DESCRIBE. POLICIES DECIDE. CAMPAIGNSTATE OWNS TRUTH. AUDIT VERIFIES AGAINST THE SAME FACTS.**

Names and narration are never persistence authority. Fail-closed behavior was not weakened anywhere to make a test or a live run pass. KPG-1 is documented, not solved.

## 1. Baseline

`7345549`, clean tree, typecheck and build clean. `npm test`: **3598** tests (an earlier count of 3599 included a stale compiled scratch test in `.build/`; the real baseline is 3598), only the known flaky `generation lifecycle` family. `npm run benchmark:modern`: 36 scenarios, 34 PASS, 2 KNOWN PRODUCT GAPS (I4 = KPG-1, C8 = KPG-2), 0 FAIL.

Final: typecheck and build clean; `npm test` **3637/3637 pass** in the final full run (in an earlier full run the known flaky `generation lifecycle (player, avatar)` failed once and passed on its single rerun, as the standing rule says); `npm run benchmark:modern` **45 scenarios, 44 PASS, 1 KNOWN PRODUCT GAP (I4, KPG-1), 0 FAIL**. Delta +39 tests: 18 identity / speaker / recipient / reference fact tests, 12 architecture assertions, 9 benchmark scenarios (I5-I13).

## 2. Reader inventory (before -> after)

| Reader before Block 11 | What it read | Consumer | Now |
| --- | --- | --- | --- |
| `narrated-captives.ts` (543 lines): `narrationUnits`, its own quote / speech-tag / self-introduction grammar, captivity markers, `readScene` | speakers, names, captives, late namings | person offers, name establishment, partner guard, audit negotiation check | **deleted**; `narration-facts/dialogue-forms.ts` (speaker), `identity-forms.ts` (names, recipients, references), `person-facts.ts` (captivity, established facts), `scene-identity.ts` (scene reading) |
| `scene-participation.ts` (65 lines) | does a named person act, speak or merely get mentioned | NPC+ presence and audit `absent_participant` | **deleted**; `narration-facts/participation-forms.ts` |
| `prompt-builder.ts` private speaker grammar (`dialogueFocused`, ~75 lines) | `Name: "line"` for the recent-conversation projection | prompt, audit NPC claims, household evidence (via the projection) | **deleted**; `attributed-speech.ts` policy over the shared dialogue units |
| `commerce-forms.ts` `SAY` + its own `speakerOf` | who spoke a price | Actual Offer | speaker of the price = the shared dialogue unit's speaker (no verb list in commerce) |
| `partner-identity-guard.ts` own `I'm X` / `my name is X` grammar | the name the partner gave | `canonical_name_conflict` | `self_introduction` and `reference` facts of the same source |
| `canonical-name-disclosure.ts` own speech tags and introduction regex | did the partner give their canonical name | name knowledge | shared `speechTags`, `leadingDescriptor`, `identityForms` |
| `household-evidence.ts` (via the prompt projection) | a member's own JOIN / LEAVE words, relationship quotes | household and relationship authorization | `attributedSpeech(...)` |
| `narration-audit.ts` (imported the prompt projection) | NPC claims, Nicco agency | audit | `attributedSpeech(narration, context, { units: facts.dialogue })` on the turn's own facts |
| `character-contracts.ts` | quoted first-person lines of an NPC+ | performance contracts | shared `dialogueUnits` (legacy quotes-only reading by policy) |

Everything else that reads text is classified in section 10.

## 3. Identity fact model

`src/turn/narration-facts/types.ts`, produced by `identityFacts()` (`identity-forms.ts`) on the same frame and dialogue units as the movement and commerce facts:

| Kind | Forms | Meaning |
| --- | --- | --- |
| `speaker_attribution` | the attribution method, or `unattributed` | who speaks one spoken line |
| `self_introduction` | `my_name_is`, `call_me`, `i_am`, `name_is`, `bare_name`, `name_first` | a speaker gives their own name (`standalone`, `full_name`) |
| `name_disclosure` | `named_noun`, `appositive`, `presented`, `third_person`, `weak_opening` | a name given for someone else |
| `recipient_attribution` | `vocative`, `says_to`, `addressed_verb` | who a line is addressed to |
| `reference` | name, opening pronoun, descriptor; `introduces_new` | who a sentence can mean |

Every fact carries kind, form, span, sentence, modality, polarity, `subject` (surface, `entity_id` only when resolved, resolution, `candidates`), confidence, ambiguity (`none` / `unresolved` / `ambiguous`), provenance (`extractor: "identity"`), `source_text` and `voice`. **No fact has a persistence or policy field** (`should_persist`, `persist`, `importance`, `materialize`, `create`: pinned by a test). Two candidates are never collapsed into one.

`NarrationFactSource` gains `scene(recent, context, world, options)`: the scene reading (narrated people, captives, name introductions, late namings), memoized per (exchanges, present people, options), built from the same dialogue units and identity forms as `of()`. The player's name question is injected through the scope (`asks_name`); the fact layer reads no player intent.

## 4. Speaker attribution

One attribution per spoken line (`dialogue-forms.ts`), strongest first: `explicit_dialogue_tag` (including the **post-hoc** delivery tag on the next starred beat, `post_hoc: true`), `direct_name`, `adjacent_action_beat`, `continued_speaker`, `deterministic_context`, and the legacy-only `recent_subject` that no policy accepts.

New in Block 11: the post-hoc tag (`Hundred gold.` + `*He says it flat.*`); `continued_speaker` after a beat with no person subject; and the `on_stage` pronoun fallback: a beat opening an exchange on a pronoun, with no carried subject of that sex, resolves to the single present person of that sex the scene's earlier narration showed (scene reading only). Fail-closed rules: a plural beat is ambiguous between its subjects; a post-hoc tag naming a different person than the beat subject is ambiguous; Nicco is never a continued speaker and never reached through a pronoun or beat; a status line is formatting; a speaker does not refer to themself in the third person; a plain line reporting someone else's words stays one line of its own speaker.

Cases A-G (explicit tag, adjacent beat, continued speaker, direct name, several speakers, scene narration, nested quote) are tests in `tests/narration-facts-identity.test.ts`.

**Speaker policy** (`attributed-speech.ts`, the consumers that need "a known person's own words": the prompt projection, the audit's NPC-claim and agency checks, household and relationship evidence): legacy prose only (RPG plain speech is returned unattributed as `rpg` lines), strict methods only, never an unknown `other:Name`, Nicco only through an explicit tag that names him. RPG attribution feeds commerce (where an Accept still decides) and the scene reading, never authority evidence.

## 5. KPG-2 closure

KPG-2 (Block 10): "unattributed plain speech not bound to the seller". The real Block 10 live B narration was `*Korvin's chin lifts…*` / `*One of the figures in the pen is a woman…*` / `Hundred gold. She's plain labor…` / `*He says it the way he'd say the weight of a sack…*`. The price line is now Korvin's (post-hoc tag; without the tag, continued speaker), so the person Actual Offer appears at 100 with no payment and nobody created.

- Benchmark C8 (the Block 10 `known_gap`) is now a normal PASS; I5 replays the same real turn end to end.
- Live A (section 14) produced the exact shape in production (`This one's a hundred gold.` + `*He says it flat…*`): card at 100, explicit_dialogue_tag.
- Investigating the live narrations also found a movement misread: "steps halfway into the pen … then steps back out" was read as an exit. A local back-and-forth (`LOCAL_ENTRY` + `BACK_OUT`, `movement-vocabulary.ts`, `departure-forms.ts`) is no longer a departure.

## 6. Self-introduction and names

One grammar (`identityForms()`); no consumer keeps an `I'm X` / `my name is X` pattern of its own (architecture assertion 4; `identity-request.ts` is the player-input reader and is excluded by design). Self-introduction and disclosure are different facts: `That's Brenna.` is Korvin's statement about someone else, never Korvin's name. An unattributed self-introduction stays a fact with no subject; who it names is the policy's decision. A bare answer (`Maren.`) is a self-introduction only when the player asked a name in this input.

Live B (section 14) exposed one gap here, in the player-input reader: "I ask the apple seller what her name is" was not recognised as a name question, so the bare `Maren.` was not a name. `asksName` now also accepts the narrated question when the asked person is a pronoun or a lowercase noun phrase and the possessive agrees ("I ask her name", "I ask him for his name", "I ask the apple seller what her name is"), and rejects a question about somebody else's name ("I ask Korvin what her name is", "I ask him what her name is", "I ask the man beside her what her name is"). Pinned by a unit test and benchmark I13, which replays the two real live B narrations: one provisional Maren, nobody created, revision unchanged. On HEAD, `asksName` rejects the same question.

Policies unchanged: a provisional (narrated) person gets at most a provisional name (I6); a present persistent unnamed person is named in place, same id (I7); two candidates of that sex name nobody (I9); a canonical person is never duplicated as a narrated stranger.

## 7. Recipient

`recipient_attribution` facts: `says_to` (`*Korvin says to Nicco:*`), `vocative` (`Brenna, take this.`), `addressed_verb` (`tells her`, `turns to him`), resolved among present people (name, pronoun of a sex, descriptor); two candidates are ambiguous.

Commerce policy (`commerce-evidence.ts` `addressedElsewhere`): a price whose line is `says_to` somebody other than Nicco, or whose own sentence carries a vocative to someone else, or whose recipient is ambiguous or unresolved, is not a seller quote to the player. `addressed_verb` is described but not used by commerce (a seller often instructs the captive in the same breath as quoting the buyer). Benchmark I10 (`says to Nicco:` -> offer 100) and I11 (`says to her:` with Brenna and Tessa -> no offer).

## 8. Reference consolidation

`reference` facts: a present person's name (two people with the same name -> ambiguous: **the same name is never a merge**), an opening third-person pronoun (one candidate of that sex resolves, two are ambiguous), a descriptor phrase resolved against scene descriptors, and `introduces_new` for `another man` / `a second woman`. The partner guard uses `introduces_new` instead of its own "second man" regex; canonical disclosure uses the shared `leadingDescriptor`.

## 9. Participation / presence

`participatesInScene` (acting, speaking or present versus a mere mention) moved from `scene-participation.ts` into `narration-facts/participation-forms.ts`. It feeds NPC+ presence and the audit's absent-participant check; benchmark I12: Brenna, who is at Heartstone, "steps up beside Nicco and laughs" at the market -> the audit flags it, she does not move, the revision does not move.

## 10. Residual reader sweep

Every remaining reader of player or narration text outside the fact layer, classified:

| Class | Readers | Why it stays |
| --- | --- | --- |
| A (moved into NarrationFacts) | speaker, self-introduction, disclosure, recipient, reference, participation, captivity, scene reading | done in this block |
| B (player input) | `identity-request.ts`, `player-intent.ts`, `player-authored-events.ts`, `natural-actions.ts`, `item-intent.ts`, `follow-invitation.ts`, `follow-candidates.ts`, `scene-participants.ts`, `narrator-focus.ts`, `person-transactions.ts`, `npc-plus.ts`, `canonical-interaction-targets.ts` | the player's own words are a different voice with different authority |
| C (non-semantic helper) | `language/text.ts`, `language/numbers.ts`, `trade-price.ts`, `rpg-dialogue.ts` | sentence splitting, quotes, numbers, RPG markup |
| D (domain content, after the facts said who) | household JOIN / LEAVE wording, `grounding-audit.ts`, `background-grounding.ts`, `item-ownership.ts`, `pending-audit.ts`, `mannerism-portrayal-gate.ts`, `mannerism-extraction.ts`, `foreground-binding.ts` (`narratedSpeakerPartner`: descriptor against authored traits), the content checks of `narration-audit.ts` (private facts, household claims, rumor sources, elapsed time, staff) | they judge WHAT a sentence claims in one domain |
| E (deleted) | `narrated-captives.ts`, `scene-participation.ts`, the prompt projection's speaker grammar, commerce `SAY` / `speakerOf` | duplicated grammar |
| F (deferred, justified) | `evidence-authorization.ts`, `turn-evidence.ts` | they verify the Controller's cited evidence quotes (knowledge communication "X tells Nicco that…", item transfers); migrating them is a separate project with its own regression surface and no failing case today |

`character-contracts.ts` reads the shared dialogue units under the legacy (quotes-only) policy.

## 11. Source-level audit (`tests/narration-facts-architecture.test.ts`)

1. One `createFactSource` in the coordinator, handed to authorization, the auditor and commit preparation; the source memoizes `of` and `scene`.
2. Movement consumers read `characterMovementsFromFacts(facts, …)`; `scene-departure.ts` stays deleted.
3. Commerce consumers (person offers, audit, commerce evidence) import the facts.
4. Identity consumers (name establishment, person offers, partner guard, canonical disclosure, provisional people) read the facts / scene reading; no runtime module outside `identity-request.ts` keeps a self-introduction grammar.
5. Speech-verb lists outside the fact layer exist only in five classified files (F, D, B+D); `dialogueUnits`, `speechTagAfter`, `speechTagBefore`, `POST_HOC_TAG` are defined only in the fact layer.
6. `recipient_attribution` is produced only in `identity-forms.ts` and consumed only by `commerce-evidence.ts`.
7. The audit reads the same source (`input.facts ?? createFactSource`, `source.of`, `source.scene`, partner guard with `facts: source`) and never imports the prompt projection.
8. Banned legacy names and files are gone (`narrated-captives`, `scene-participation`, `narrationUnits`, shadow helpers), in `src` and `tests`.
9. Commerce has no `SAY` and no speech-verb list; the price speaker comes from the shared dialogue unit and never from `recent_subject`.
10. Nothing in `narration-facts/` imports campaign, authorization, audit, coordinator, stages, persistence or session code.
11. No fact module imports a policy (commerce-evidence, attributed-speech, name-establishment, person-offers, partner guard, canonical disclosure, provisional people, household evidence, identity-request, prompt builder, trade policy); `trade-price.ts` is the one numeric helper.
12. Player-input readers stay separate (`identity-request.ts` imports no fact module; `extractInputCommerceFacts` is the fact layer's only input entry and labels every figure a player counter).

## 12. H1 and deferred items

The three surviving H1 items of the debt register (§1C.1) are not narration-attribution readers and were not migrated: the `them` phantom handover and the fronted-recipient receipt live in item-transfer evidence (F), first-name-only condition attribution is an audit content check (D). Their fixed forms and the remaining fail-closed forms are pinned in `tests/narration-survives-audit.test.ts` (named-item `them` is fine, a bare ambiguous `them` stays conservative; a unique established first name resolves, shared or unestablished names resolve to nobody; closed-set lead-ins and manner adverbs are stripped, hedges are not). They stay DEFERRED, fail-closed. The F readers (section 10) are the only deferred migration.

## 13. Benchmark

`npm run benchmark:modern`: 45 scenarios, 44 PASS, 1 KNOWN PRODUCT GAP (I4, KPG-1), 0 FAIL. Categories: movement 11/11, identity 6/7 + 1 gap, trade 3/3, person_trade 10/10, household 2/2, persistence 2/2, authority 3/3, fail_closed 7/7.

New: I5 (real KPG-2 turn -> offer 100), I6 (provisional seller "My name is Maren." -> provisional Maren, nobody created, revision unchanged), I7 (bought unnamed woman "My name is Lira." -> same record named), I8 (plural beat -> no offer), I9 (two held unnamed women + "She lifts her chin." -> nobody named), I10 (`says to Nicco:` -> offer 100), I11 (`says to her:` with two women -> no offer), I12 (absent Brenna narrated at the market -> flagged, not moved), I13 (real live B replay -> provisional Maren). C8 changed from `known_gap` to PASS. Run against HEAD during the block, I5, C8, I7 and I11 failed; for I13, HEAD's `asksName` rejects the live question.

## 14. Live (one attempt each, no rerolls)

`src/dev/consolidation-block11-live.ts`, production Narrator `z-ai/glm-5.2` and Controller; 19 provider calls (11 Narrator, 8 Controller), 99,995 tokens; the engine reports no cost. Evidence: `docs/evaluations/consolidation_block11_live/result_ABCD.json`.

| Run | Target | Verdict | What happened |
| --- | --- | --- | --- |
| A | KPG-2 shape: unattributed price line after a Korvin beat | **PASS** | `This one's a hundred gold.` then `*He says it flat…*`: explicit_dialogue_tag (post-hoc) -> Korvin; person card at 100; nothing paid, nobody created, no `seller_authority_unestablished` |
| B | provisional apple seller gives her name | **FAIL** | the player wrote "I ask the apple seller what her name is"; the Narrator answered `*She doesn't pause her sorting.*` / `Maren.`. The narrated question was not a name question, so the bare answer named nobody. Diagnosed deterministically by replaying the real narrations, fixed in `asksName` (section 6), pinned by I13. The live verdict stays FAIL: it was not rerun |
| C | the bought, seeded unnamed woman names herself | **NOT REACHED** | the Narrator never wrote the name ("The word comes out plain…" with no name); she correctly stayed unnamed. Turn 1 also logged an audit `uncommitted_departure` and a blocked person transaction (`seller_authority_unestablished`); turn 2 an audit `fabricated_prior_event` |
| D | ambiguous speaker of a price line between two sellers | **NOT REACHED** | the Narrator attributed both figures clearly (Korvin by explicit tag, the woman by adjacent beat); both were hedged ("give or take", "around") and not concrete quotes; the Controller's two goods offers for a person were rejected; no offer, no card |

## 15. KPG-1 (OPEN)

There is still no generic player-authorized action to keep an arbitrary provisional person (benchmark I4, `known_gap`). Only the person Actual Offer Accept materializes one. Future direction, recorded and not built: **a UI "Keep track" action -> materialize the SAME identity** (the same provisional scene ref, name and descriptor, through an explicit, ref- and revision-guarded action), never fuzzy matching, embeddings, or a name in narration. It needs a user decision; until then provisional people are forgotten on reload (PER-2) and cannot be promoted to NPC+.

## 16. Validation

| Check | Result |
| --- | --- |
| `npx tsc --noEmit -p .` | clean |
| `npm run build` | clean |
| `npm test` | 3637 / 3637 pass (final full run, after typecheck) |
| `npm run benchmark:modern` | 45 / 44 PASS / 1 KPG / 0 FAIL |
| Live A-D | A PASS, B FAIL (fixed offline, not rerun), C NOT REACHED, D NOT REACHED |
| Scratch worktree used for HEAD comparisons | removed (`git worktree list` shows only the main tree) |

Diff (tracked files): 51 files, +630 / -911. Runtime source: the deleted `narrated-captives.ts` (543) and `scene-participation.ts` (65) and the prompt speaker grammar moved into `narration-facts/` (`dialogue-forms.ts` 337, `dialogue-vocabulary.ts` 67, `identity-forms.ts` 210, `participation-forms.ts` 67, `person-facts.ts` 84, `scene-identity.ts` 271) and `attributed-speech.ts` (59). The block is a consolidation of readers, not a line-count reduction: the runtime source grew by roughly 600 lines, mostly the new fact model, its ambiguity handling and documentation comments.

## 17. Documentation refresh

New NORMATIVE [NarrationFacts](../architecture/NARRATION_FACTS.md). Updated: [Architecture](../ARCHITECTURE.md) (§2c gate line, §2d block 11, §3 person purchases, source map, links), [Current state](../CURRENT_STATE.md) (system row, KPG-1 in §8d, §11b stale ARCH-1 line, §12 tests, §13), [Testing](../TESTING.md) (commands, layers, results, block suites), [Roadmap](../ROADMAP.md), [Master Roadmap](../MASTER_ROADMAP.md) (A9 done, A10 / Block 12 not needed), [Master Debt Register](../MASTER_DEBT_REGISTER.md) (§1A.2, ARCH-2, H1 notes, file references), [Turn coordinator](../architecture/TURN_COORDINATOR.md) (deleted module references), [Actual Offer](../architecture/ACTUAL_OFFER.md) (speaker and recipient policy), [documentation index](../README.md). Re-checked with no content change needed: UI engine contract, Persistence, Optional services, Configuration (model defaults re-verified in code), Image system. Historical reports were not rewritten.

Consistency audit: every relative link in the README and the normative docs resolves; every path in the README project structure exists; every `npm run` command in the README exists in `package.json`; no current doc names `narrated-captives.ts` or `scene-participation.ts` except as deleted / formerly; test and benchmark counts agree across README, Current state, Testing and this report.

## 18. README

`README.md` was rewritten from scratch with the sections: What It Is, Core Design Rule ("LLMs describe and propose; the engine owns truth."), Runtime Architecture, NarrationFacts, Authority Model, Character Lifecycle, Persistence, Optional Services, Trade, Movement, Images, Project Structure (existing paths only), Development (real scripts only), Testing, Current Status, Known Product Gaps, Roadmap (pointing to the Master Roadmap), Documentation. No sealed canon. Its Runtime Architecture follows `TurnCoordinator.runTurn` exactly: Narrator candidate, then the Controller's separate structured proposal, then ONE NarrationFactSource over the Narrator candidate (never over the proposal), authorization combining proposal, player input and facts, `CampaignState.prepare`, the audit on the SAME source, commit preparation on the delivered text from the SAME source, and one atomic commit (corrected after review, together with the pipeline diagram of [NarrationFacts](../architecture/NARRATION_FACTS.md)).

## 19. Architecture diagram

```text
                       player input ──────────────► B readers (intent, follow invitation, identity-request, ...)
                                                          │
Narrator candidate ──► NarrationFactSource (ONE per turn, memoized per text and per scene reading)
                         ├─ movement facts        ──► movement-evidence ─────────┐
                         ├─ commerce facts        ──► commerce-evidence ─────────┤
                         ├─ dialogue units        ──► attributed-speech ─────────┤   domain policies
                         ├─ identity facts        ──► partner guard, disclosure ─┤   (decide)
                         └─ scene reading         ──► person-offers, names ──────┤
                                                                                 ▼
                                   Controller proposal ──► authorization + CampaignState.prepare
                                                                                 ▼
                                                     ONE atomic CampaignState.commit (owns truth)
                                                                                 ▲
                         narration audit ── reads the SAME source (of, scene) ───┘ verifies
```

## 20. Remaining debt

- KPG-1 (product decision) and PER-2 (provisional and scene participants lost on reload).
- F readers: `evidence-authorization.ts`, `turn-evidence.ts` keep their own verb lists for the Controller's evidence quotes.
- `NAME_REQUEST` (the canonical-disclosure capability gate) does not accept the narrated name question; only the scene reader's `asksName` does.
- `addressed_verb` recipients are described but unused by commerce; a pronoun with two candidates of that sex attributes nothing (fail closed, by design).
- The live harness records Controller calls without a model label (`wire_by_model` shows them as undefined); evidence only, no engine impact.
- Unchanged from earlier registers: PER-1 (16 MB save cap), ECO-1 / TRD-11, CTX-1 / CTX-2 residuals, PIPE-6 / PIPE-7 lanes, the three deferred H1 items.

## 21. Block 12 recommendation

Gate: Block 12 (a tiny, targeted Controller question for semantic ambiguity) is warranted only if (1) a frequent or important case cannot be resolved deterministically, (2) fail-closed materially damages gameplay, and (3) a tiny targeted question is possible.

Evidence: the KPG-2 shape that motivated the question resolves deterministically (C8, I5, live A). The one live failure (B) was a deterministic player-input gap, fixed without any model. C and D did not reach their targets because the Narrator did not produce the ambiguous shapes; when it was clear, the facts were clear. The remaining ambiguity (plural beats, two candidates of one sex) is rare in the recorded live narrations and failing closed there costs one missed card or name, which the player recovers by asking again; nothing irreversible depends on it. No measured ambiguity rate from real play justifies a new model call in the turn.

**BLOCK 12 NOT NEEDED.** Revisit only with a measured ambiguity rate from real play (today only the live harness records the attribution of each spoken line; the production trace does not).
