# NarrationFacts

Status: **NORMATIVE.** Last reconciled: 2026-10-13 (consolidation block 11, on top of main `7345549`). Source of truth: `src/turn/narration-facts/` and its tests (`tests/narration-facts-*.test.ts`).

> **FACTS DESCRIBE. POLICIES DECIDE. CAMPAIGNSTATE OWNS TRUTH. AUDIT VERIFIES AGAINST THE SAME FACTS.**

NarrationFacts is the one place where the engine reads what a narration *says*: who moves where, which prices are stated, who speaks a line, who gives a name, who a line is addressed to, who a sentence can mean. Nothing in it decides anything. Domain policies outside it decide what a fact is worth, `CampaignState` commits truth, and the narration audit checks the delivered text against the very same facts.

## 1. Pipeline

```text
Narrator candidate (draft, revision, delivered text)          State Controller proposal (separate structured input to
        │                                                     authorization; the fact layer reads only narration text)
        ▼                                                                │
NarrationFactSource  (ONE per turn, created by TurnCoordinator; memoized per text and per scene reading)
   ├─ of(text) ──► movement facts · commerce facts · dialogue units · identity facts
   ├─ input(text) ──► the player's own commerce figures (always player counters)
   ├─ quote(span, words) ──► commerce facts of a verbatim span of the candidate (authorization first checks that a quote
   │                         the Controller cites really is in the narration)
   └─ scene(recent, context, world) ──► scene reading: narrated people, captives, name introductions, late namings
        │                                                                │
        ▼                                                                ▼
Domain policies over the facts ─────────────► authorization (proposal + player input + facts) ──► CampaignState.prepare
   movement-evidence.ts · commerce-evidence.ts · attributed-speech.ts · name-establishment.ts
   person-offers.ts · partner-identity-guard.ts · canonical-name-disclosure.ts · trade-authorization.ts
        │
        ▼
Narration audit (narration-audit.ts) ── reads the SAME source: facts.of(narration), source.scene(...); revise once, then redact
        │
        ▼
Commit preparation on the delivered text (SAME source) ──► CampaignState.prepare ──► ONE atomic CampaignState.commit
```

`TurnCoordinator` creates the source once (`createFactSource(movementFactScope(...))`) and passes it to `authorizeTurn`, `createNarrationAuditor` and commit preparation. A revision is a different text and gets its own single extraction from the same source. Callers outside a turn (tests, dev tools) create their own source.

## 2. The fact contract

Every fact has: `kind`, `form` (which grammar matched), `span` (sentence, clause, offsets, text), `sentence`, `modality` (completed / future / conditional / negated / requested / habitual / …), `polarity`, `subject` (a `FactEntityRef`: surface, `entity_id` when resolved, `resolution` method, `candidates`), `confidence`, `ambiguity` (`none` / `unresolved` / `ambiguous`) and `provenance` (`movement` / `commerce` / `identity` extractor plus form). Identity facts also carry `source_text` and `voice` (narration or speech).

Facts never carry policy: there is no `authorized`, `accepted`, `should_persist`, `importance` or `create` field anywhere (`tests/narration-facts-identity.test.ts`). An ambiguous reference keeps every candidate and has no `entity_id`; nothing collapses two candidates into one.

Speaker keys are a character id, `"nicco"`, or a scene-local `other:<noun>` / `other:<Name>`. An `other:` key is never persistence authority.

## 3. Fact families

| Family | Kinds | Module |
| --- | --- | --- |
| Movement (block 9) | `entity_moved`, `entity_arrived`, `entity_present` (location claim), `entity_departed`, `entity_followed`, `entity_stayed`, `entity_moved_with_player` | `movement-forms.ts`, `departure-forms.ts`, `location-forms.ts`, `player-forms.ts` |
| Commerce (block 10) | `price_quote`, `unsupported_money`, `offer_withdrawn`, `payment_claim`, `transfer_claim`, `settlement_claim` | `commerce-forms.ts`, `commerce-vocabulary.ts` |
| Dialogue (block 11) | `DialogueUnit` per sentence / spoken line, with `speaker` and `attribution` | `dialogue-forms.ts`, `dialogue-vocabulary.ts` |
| Identity (block 11) | `speaker_attribution`, `self_introduction`, `name_disclosure`, `recipient_attribution`, `reference` | `identity-forms.ts` |
| Scene reading (block 11) | narrated people, captives, name introductions, late namings, established person facts | `scene-identity.ts`, `person-facts.ts` |
| Presence (NPC+ Pass 4, moved in block 11) | participation of a named person in a sentence (acting, speaking, present) versus a mere mention | `participation-forms.ts` |

## 4. Dialogue and speaker attribution

The Narrator writes the RPG format: `*…*` is narration and plain lines are speech. Legacy prose (quotes inside prose) is still read by the quote rules. `dialogueUnits()` returns one unit per narrated sentence (with its subject) and per spoken line (with its speaker and a `SpeakerAttribution`).

Attribution methods, strongest first:

| Method | Shape | Example |
| --- | --- | --- |
| `explicit_dialogue_tag` | a tag naming the speaker; also the **post-hoc** delivery tag of the next starred beat (`post_hoc: true`) | `"Two hundred," Brenna says.` · `Hundred gold.` + `*He says it flat.*` |
| `direct_name` | the line is labelled with a present person's name | `Korvin: Two hundred.` |
| `adjacent_action_beat` | a plain line right after a starred beat: the beat's subject | `*Korvin leans on the post.*` + `Two hundred.` |
| `continued_speaker` | after a beat with no person subject: the most recent acting subject the line does not exclude, when everyone staged after them is excluded (by a third-person pronoun of their sex, their name or their descriptor) | `*The wind picks up.*` + `Take it or leave it.` |
| `deterministic_context` | the recorded conversation partner bound to a descriptor speaker; a beat that opens an exchange on a pronoun continuing the single earlier subject of that sex, or (no such subject) the single present person of that sex the scene already showed | `*She looks up from the dirt.*` + `My name is Lira.` |
| `recent_subject` | legacy fallback only (the last subject of the paragraph); never accepted by a policy | |

Fail-closed rules: a plural beat (`Korvin and Brenna look at each other`) makes the line **ambiguous** between them; a post-hoc tag that names a different person than the line's beat subject makes it ambiguous; Nicco is never a continued speaker and a pronoun or a beat never resolves to him; a status line (`Household: 0`) is formatting, not speech; a speaker does not talk about themself in the third person (a line using "she" is not the female beat subject's); a plain line that reports somebody else's words (`I told her "go home"`) stays one line of its own speaker.

This closes **KPG-2** (found in block 10, closed in block 11): the real live shape `*Korvin's chin lifts toward the pen…*` / `*One of the figures in the pen is a woman…*` / `Hundred gold. She's plain labor…` / `*He says it the way he'd say the weight of a sack…*` attributes the price line to Korvin (post-hoc tag; without the tag, continued speaker), so the person Actual Offer appears. Benchmark C8 and I5 replay the real narrations; live block 11 A passed on the same shape.

## 5. Identity facts

- **`self_introduction`**: a spoken line in which somebody gives their own name. Forms: `my_name_is`, `call_me`, `i_am`, `name_is`, `bare_name` (the line is only a name), `name_first` (answering a name question, the line opens with the name: `Maren. If it doesn't matter.`). `standalone` marks a whole line or sentence. `full_name` keeps a longer capitalized name. The subject is the attributed speaker, or unresolved.
- **`name_disclosure`**: a name given for someone else: `named_noun` (`a woman named Maren`), `appositive` (`Maren, a woman`), `presented` (`That's Brenna`, `This is her. Lira.`), `third_person` (`Her name is Maren`), `weak_opening` (a line opening with a bare name).
- **`recipient_attribution`**: `vocative` inside the line (`Brenna, take this.`), `says_to` (`*Korvin says to Nicco:*`), `addressed_verb` (`tells her`, `turns to him`) in the adjacent narration. The recipient is resolved among present people (name, pronoun of a sex, descriptor); two candidates are ambiguous.
- **`reference`**: names, an opening third-person pronoun, descriptor phrases (`the woman`), and `introduces_new` for `another man` / `a second woman`. Two people with the same name make a name reference ambiguous: **the same name is never a merge.**

All of them share one grammar (`identityForms()` in `identity-forms.ts`, the vocabulary in `dialogue-vocabulary.ts`). No consumer keeps an `I'm X` / `my name is X` pattern of its own (architecture test 4).

## 6. The scene reading

`source.scene(recent, context, world, options)` reads the current scene's finalized exchanges plus the candidate text: narrated people (each with a scene-local `ref`, `narrated:<name|noun>`, keys, units and introductions), present captives, and **late namings** (a present persistent character without a name who introduces themself). It is memoized per exchanges, present people and options, so person offers, name establishment, the partner guard and the audit's negotiation check read one reading. The player's name question (`asksName`, `identity-request.ts`: a direct question, the reciprocal "I'm Nicco, and you?", or the narrated form "I ask the apple seller what her name is" whose possessive agrees with the asked person) is injected through the scope; the fact layer reads no player intent itself.

Name rules the reading keeps: a self-introduction counts only in an attributed line (or a legacy quote); an unattributed bare-name answer to a direct name question names the scene's single present unnamed persistent person; a present persistent person never gets a second, different name; a canonical person is never duplicated as a narrated stranger; a name another person presents is never the presenter's own.

## 7. Policies over the facts (who decides)

| Consumer | Reads | Decides |
| --- | --- | --- |
| `movement-evidence.ts` | movement facts | who moved, followed or stayed; escort; location claims never move anyone |
| `commerce-evidence.ts` | commerce facts + recipient facts | the actionable seller quote (latest, unambiguous, completed, current); **a price explicitly addressed to somebody other than Nicco, or to an ambiguous "her", is not an offer to the player** (`says_to` for the whole line, `vocative` in the price's own sentence); settlement claims are only claims |
| `attributed-speech.ts` | dialogue units | the speaker policy of the recent-conversation projection, the audit's NPC-claim and player-agency checks and the household / relationship evidence: legacy prose only, strict methods only, never an unknown `other:Name`, Nicco only by an explicit tag that names him. RPG plain speech is never a named speaker's words there |
| `person-offers.ts` | commerce facts, scene reading | the person Actual Offer (subject, seller authority, price) |
| `name-establishment.ts` | scene reading | provisional people (scene-local, never saved) and late naming of a present unnamed persistent character (same id) |
| `partner-identity-guard.ts` | scene reading, `self_introduction` and `reference` facts | a bound canonical partner who introduces themself under another name is a conflict (`canonical_name_conflict`) |
| `canonical-name-disclosure.ts` | shared speech tags, descriptors, identity forms | whether the canonical partner gave their own canonical name |
| `narration-audit.ts` | the same source (`of`, `scene`) | contradictions with committed state, absent participants, unrecorded settlements |

Names and narration are never persistence authority: a narrated name creates at most a PROVISIONAL person (see [Architecture](../ARCHITECTURE.md) and KPG-1 in the [debt register](../MASTER_DEBT_REGISTER.md)).

## 8. Readers that stay outside the fact layer

Every remaining narration or input reader is classified (block 11 sweep; architecture test 5 pins the speech-verb lists):

| Reader | Class | Why it stays |
| --- | --- | --- |
| `identity-request.ts`, `player-intent.ts`, `player-authored-events.ts`, `natural-actions.ts`, `item-intent.ts`, `follow-invitation.ts`, `follow-candidates.ts`, `scene-participants.ts`, `narrator-focus.ts`, `person-transactions.ts`, `npc-plus.ts` | B (player input) | they read the player's own words, which are a different voice with different authority |
| `language/text.ts`, `language/numbers.ts`, `trade-price.ts`, `rpg-dialogue.ts` | C (non-semantic helper) | sentence splitting, quotes, numbers, the RPG markup split |
| `household-evidence.ts` (JOIN / LEAVE wording), `grounding-audit.ts`, `background-grounding.ts`, `item-ownership.ts`, `pending-audit.ts`, `mannerism-portrayal-gate.ts`, `mannerism-extraction.ts`, `foreground-binding.ts` (descriptor against authored traits), the content checks of `narration-audit.ts` (private facts, household claims, rumor sources, elapsed time, staff) | D (domain-specific) | they judge WHAT a sentence claims in one domain, after the facts said who and where |
| `evidence-authorization.ts`, `turn-evidence.ts` | F (deferred) | they verify the Controller's cited evidence quotes (knowledge communication, item transfers); a migration is a separate project (see the block 11 report §12) |
| `narrated-captives.ts`, `scene-participation.ts`, the prompt projection's private speaker grammar, commerce's `SAY` / `speakerOf` | E (deleted) | duplicated grammar, replaced by this layer |

## 9. Invariants and tests

- `tests/narration-facts-architecture.test.ts`: the twelve source-level assertions (one source per turn; movement, commerce and identity consumers read the facts; speaker and recipient attribution only in the fact layer; the audit reads the same source; banned legacy names; no seller-attribution parser in commerce; narration-facts imports no campaign, authorization, audit or persistence code; facts import no policy; player-input readers stay separate).
- `tests/narration-facts-identity.test.ts`: speaker cases A–G, the post-hoc tag, self-introduction versus disclosure, recipient and reference resolution, same-name non-merge, and the speaker and recipient policies.
- `tests/narration-facts-movement.test.ts`, `tests/narration-facts-commerce.test.ts`: blocks 9 and 10.
- Benchmark (`npm run benchmark:modern`): M4–M11 (movement), C1–C8 (commerce), I5–I13 (identity, speaker, recipient, presence; I13 replays the real live B narrations of block 11).

## 10. Known limits

- KPG-1 stays open: there is no player action to keep an arbitrary provisional person; a provisional person is lost on reload (PER-2) and cannot be promoted to NPC+.
- A pronoun that opens an exchange with two candidate people of that sex attributes nothing (fail closed); the line is then nobody's.
- `addressed_verb` recipients ("tells her") are described but not used by the commerce policy: a seller often instructs the captive in the same breath as quoting the buyer.
- The F readers above still carry their own verb lists.
- `NAME_REQUEST` (the canonical-disclosure capability gate) does not accept the narrated form "I ask him what his name is"; only the scene reader's `asksName` does.
