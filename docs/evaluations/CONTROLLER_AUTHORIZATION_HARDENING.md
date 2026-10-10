# Consolidation Pass B — Controller + Authorization Diagnostics / Hardening

Base: `main` 3733ce5 (Pass A). Working tree only: **not committed, not pushed.** No new domain, no Property, no Weather, no save-schema change, no Transfer redesign, no authorization loosened to make a test pass.

## 1. EXECUTIVE VERDICT

**B — HARDENED WITH MINOR LIMITATIONS.**

* The question left open by the foundation certification ("E2E1 handover not committed: Controller or authorization?") is **answered, reproduced and fixed**. Live run 1 of this pass showed a *correct* Controller proposal (right item, recipient, `handoff`, and a verbatim quote of the receipt) rejected by the evidence verifier with `receipt_subject_not_recipient`. Root cause: the Narrator wraps action prose in `*italics*`; the pronoun-antecedent helper (`precedingNamedSubject`) read the first character of the previous sentence, saw `*`, found no name, and could not tell that "She reaches out and takes the sword" was Brenna. Fixed (one regex), verified offline on the exact captured live text, plus a negative test that another person's antecedent still rejects.
* Two more reproducible defects found offline and fixed: (a) a capitalised item name in the quote ("accepts the Sword") was treated as a possible third person (`other_character_in_quote`); (b) an exact repeat of a command (the same `transfer_item` twice) passed authorization twice and then **failed the whole turn** at `campaign.prepare`.
* Every failed or absent durable mutation now has a deterministic, offline diagnosis: stage, code, per-command reason, failed check, revision before/after (`src/turn/mutation-diagnostics.ts`, derived data only). Controller-omission vs. evidence-rejection vs. semantic error are distinguishable **without another paid run**.
* Why not A: the Controller is still proposal-first (an omitted proposal is never recovered), the receipt-verb vocabulary is a closed list ("grips the sword" fails), and a quote that starts with a bare pronoun after a *Nicco* sentence is (correctly) refused. These are reported, not loosened (section 18).
* Offline: `npm test` **2928/2928** (2882 baseline + 46 new), typecheck and build clean. Live: 3 end-to-end turns, 6 provider requests, 0 failures.

## 2. ACTUAL MUTATION PIPELINE

`TurnCoordinator.runTurn` → TurnInput → IntentResolution (`playerIntent`: `candidates` = durable intents, `runtime`) → Retrieval → Narration (buffered **draft**) → **Controller** (proposal only; sees `player_action`, `prior_state` incl. `explicit_intent`, `final_narration`) → **Authorization** (`authorizeTurn`: strict parse, dedupe, derived moves/departures, `authorizeWithEvidence`) → `campaign.prepare` (whole batch, one receipt) → Audit/Reconciliation → CommitPreparation (identity) → `checkpoint(); campaign.commit(receipt)` (single revision) → publication → TurnResult.

| Stage | Input | Output | Failure result | Surfaced today? | Distinguishable? | Deterministic? | Provider call? |
|---|---|---|---|---|---|---|---|
| Intent | player text, context | `candidates`, `runtime`, `physical_interactions`, `ambiguous_reference` | `invalid_input` / `invalid_runtime_intent` (turn fails) | yes (`turn_failed`) | yes | yes | no |
| Narration | prompt | draft text | `narrator_failed` | yes | yes | n/a | **1** (+1 only for a built-in revision) |
| Controller call | draft, state, intent | `{commands:[{command,evidence_quote}]}` | `controller_failed` + provider code | yes; raw text only in debug sink | parse vs. provider: yes (`structured_output_invalid` vs others) | n/a | **1** (+ built-in transport retry) |
| Parse | wire text | commands + quotes | `structured_output_invalid` (strict envelope) | yes + debug `controller_parse_failure` | yes | yes | no |
| Empty proposal | `{commands:[]}` | none | **nothing** (a success with no mutation) | only `controller_omission_candidate` debug record, and only when the grammar confirms | **was not** from TurnResult alone; **now yes** | yes | no |
| Authorization | proposal, evidence | per-command decision | rejected command is dropped; others proceed | yes: `TurnResult.authorization[]` (reason, grammar, evidence check) | reason is coarse (one reason, several causes) | yes | no |
| Prepare | authorized batch | receipt | `campaign_validation_failed` (**whole turn**) | yes, but one code for prepare/commit/identity | **now** by `failure_phase` | yes | no |
| Commit | receipt | revision+1 | `stale_turn` at `checkpoint` | yes | yes | yes | no |

Atomicity: all authorized commands are prepared as one batch; rejected commands are dropped individually (no turn failure); a batch that fails preparation fails the whole turn and commits nothing; identity additions are the only part re-prepared and dropped on their own.

## 3. FAILURE / REJECTION STAGES

Existing vocabulary → requested codes (`MutationFailureCode`):

| Requested | Derived from (existing data) |
|---|---|
| controller_no_command | empty `controller_proposal` with a non-empty intent (or a resolved physical act + condition terms in the draft); note says OMISSION when the grammar confirms, "consistent with narration" when refused |
| controller_parse_failure | `turn_failed controller_failed` + `structured_output_invalid` |
| controller_provider_failure (added) | `controller_failed` with any other provider code (timeout, network…) |
| controller_invalid_command | `rejected_reference_invalid`, `rejected_controller_mismatch`, `rejected_equipment_not_established`, `rejected_time_not_exact` |
| insufficient_confirmation | `rejected_insufficient_confirmation`, `rejected_fact_not_communicated`, partial/incomplete group |
| ambiguous_evidence (added) | insufficient + failed check `sentence_hedged_negated_or_hypothetical` / `transfer_not_completed` / `quoted_statement_hedged_or_question` |
| contradictory_evidence | `rejected_recipient_refused` |
| ambiguous_reference (added) | `rejected_ambiguous_reference` |
| unauthorized_mutation | `rejected_command_not_allowed` |
| already_established (added, benign) | `rejected_already_established` |
| stale_revision | `stale_turn` |
| prepare_failure / commit_failure / campaign_validation_failure | `campaign_validation_failed` split by `failure_phase` (`preparation`/`commit_preparation` · `commit` · other) |

No new failure type enters the pipeline; the classifier only reads `TurnResult`, `turn_failed`, the opt-in `TurnDiagnostics` record and debug records.

## 4. CONTROLLER PROMPT AUDIT

`CONTROLLER_POLICY` (hash-pinned in `controller-model-fallback.test.ts`; **not changed**). Per command family: transfer (reuse existing `item_id`, recipient carried, `mode`, "Bare give is handoff", gift needs permanence, refusals produce no transfer); placement (`place_item`/`create_item` rules); movement (`move_character`/`leave_scene` only when completed); conditions (closed list minor_injury/dazed/knocked_down/winded, "list existing plus new"); knowledge (explicit telling); scheduled events (absolute minute); funds (**none**: not in the Controller schema, purchases are resolved before narration); relationships (`adjust_relationship`, never Nicco); household (voluntary choice words / declared rules). Quote rule: shortest verbatim excerpt containing who acts, the verb and the object.

Trace for "*hands Brenna the sword*" (live 1, real values): item `campaign_item_00000001` (name "Sword"), current carrier Nicco, owner Nicco, recipient `brenna`, player intent mode `handoff` (`gift` only with explicit permanence wording and owner = Nicco), narrator **accepted** ("takes the sword by the grip… I'll hold onto it"), Controller proposed exactly the intent command with the quote *"She reaches out and takes the sword by the grip, testing its weight…"*. Expected quote shape: recipient (or a pronoun resolving to them) + a receipt verb + the item.

Observation (not changed): the policy tells the Controller to choose `lend`/`return`/`steal`/… while player-derived intents are always `handoff` or `gift`. Transfers do not require equality with the intent (section 6), so this is harmless today; it is a latent inconsistency worth one sentence in a future prompt revision ("copy `explicit_intent` when it already lists the transfer"). Not done: prompt is hash-frozen and cannot be live-validated within budget.

## 5. EVIDENCE MODEL

| Command | Required evidence source | Required semantic condition | Current failure code | Example accepted | Example rejected |
|---|---|---|---|---|---|
| transfer_item (to NPC) | grammar confirmation **or** verified quote | recipient (or resolved pronoun) is subject of a receipt verb (takes/accepts/receives/collects/picks up/snatches/steals/reclaims, "reaches out and takes"), item referenced, no refusal/hedge, valid mode+presence | `rejected_insufficient_confirmation` (+ check) | "Brenna takes the sword" | "Brenna grips the sword" (`no_receipt_act_in_quote`) |
| transfer_item (to Nicco) | same | holder hands/gives to Nicco, or Nicco takes; nobody else named | same | "Brenna hands the sword to Nicco" | "Maren watches Brenna hand…" (`other_character_in_quote`) |
| place_item (stored/pickup) | verified quote only | quote names the item | `rejected_insufficient_confirmation` | "Nicco sets the boots down" | "Nicco sets them down" (`placed_item_not_named`) |
| place_item (equip) | grammar only | exact `X equips <item> in <slot>` after `/equip` | `rejected_insufficient_confirmation` | `Nicco equips boots in feet.` | any paraphrase |
| set_condition | verified quote only | same-turn physical interaction, closed vocabulary, additive, existing conditions kept, quote sentence names the target and a term of each new tag | `rejected_reference_invalid` (shape) / `rejected_insufficient_confirmation` (quote) | "Brenna's lip splits and she tastes blood." | "Her lip splits" (`condition_subject_not_character`) |
| set_knowledge | grammar or quote | Nicco communicates the exact fact to the recipient, intent present | `rejected_fact_not_communicated` | "Nicco tells Brenna that the eastern bridge is closed." | "Nicco will tell Brenna…" |
| schedule_event | grammar only | exact agreement sentence with the minute | `rejected_time_not_exact` / `rejected_insufficient_confirmation` | "Everyone agrees to Bridge meeting at world minute 160." | wrong minute |
| move_character / leave_scene | derived grammar (+quote for leave_scene) | completed movement/departure to a known place | `rejected_reference_invalid` / `rejected_insufficient_confirmation` | "Brenna walks out of the room." (grammar-derived `leave_scene`) | canon-placed NPC `move_character` |
| adjust_relationship | verified quote | the character's own act/words, never Nicco | `rejected_command_not_allowed` / `rejected_insufficient_confirmation` | "I swear to protect the hearthstone and Nicco" | Nicco as source |
| join/leave_household, add_household_rule | chooser's voiced words / declared rule | voluntary, by the chooser | `rejected_insufficient_confirmation` | "I, Brenna, decide to stay…" | "Brenna nods once" |
| funds | none | not a Controller command | schema → `controller_parse_failure` | — | `set_funds` |

## 6. TRANSFER FINDINGS

* **F-T1 (fixed, live root cause).** Leading `*`/`_` hid the antecedent of a pronoun quote. Reproduced with the exact live text (`receipt_subject_not_recipient`), fixed in `precedingNamedSubject`, committed offline with and without markers, and an other-person antecedent still rejects.
* **F-T2 (fixed).** A capitalised item name inside the quote was a "stranger". The object's own name words are now exempt, never a word that is a present character's name (tested: "Maren Blade" still rejects).
* **F-T3 (characterization).** The player's intent is not binding for transfers: an intent mismatch yields `rejected_insufficient_confirmation`, which a verified quote completes. So a quoted receipt by Maren commits to Maren even if the player said Brenna, and a `lend`/`return` Controller mode commits when `validTransferMode` allows it. Ownership safety is unaffected (only `gift` changes ownership; it needs permanence). The architecture doc claimed "exact player-intent match" for all kinds; addendum added (EVIDENCE_AUTHORIZATION.md §7). Not tightened: doing so would change Transfer semantics and existing behaviour.
* **F-T4 (limitation).** Receipt vocabulary is a closed list. "grips", "closes her fingers around", "lifts" do not verify (`no_receipt_act_in_quote`). Adding verbs without live data would be guessing; reported for roadmap step 3.
* **F-T5 (limitation).** A quote starting with a bare pronoun whose nearest antecedent is Nicco is refused (conservative).
* Modes preserved and tested: handoff keeps owner; gift needs permanence and moves owner; return needs recipient = owner; lend needs giver = owner; a carrier cannot lend someone else's item; a refusal beats any mode.

## 7. CONDITION FINDINGS (E2E2 classes)

| Class | Reproduced offline | Live |
|---|---|---|
| A correct behaviour (no supported condition narrated) | strike with no term → `nothing_intended`, note "no supported condition" | — |
| B Controller omission | strike + "lip splits… blood" + no `set_condition` → `controller_no_command (condition)` | — |
| C evidence rejection | hedged → `ambiguous_evidence`; term missing; dropped existing condition (`recovering`) → shape rejection; pronoun-only quote | **live 3: Controller proposed `minor_injury` for a winding blow; narration had no injury term → `condition_term_missing`** |
| D unsupported semantics | out-of-vocabulary tag; unstarred ("I punch Brenna"), possessive ("grabs Brenna's arm") or pronoun ("slaps her" with several NPCs) phrasing → no physical interaction resolved | — |

Live 3 is the safe outcome: the narration says air left Maren and she "stays doubled slightly" (no `winded` term: the vocabulary needs "doubled over", "winded", "gasping for air"), the Controller chose the wrong tag, authorization refused. Also observed offline: when a condition is narrated but not committed the audit **redacts** the injury sentence from the delivered text, so state and text stay consistent. First-person unstarred phrasing is by design speech, not action.

## 8. OTHER COMMAND FINDINGS

Offline matrices (46 tests) for place_item (put down/equip), set_knowledge (told / hypothetical / already known), schedule_event (exact / wrong minute / no agreement), move_character+leave_scene (canon NPC `move_character` rejected; grammar-derived `leave_scene` accepted), relationship+household (voiced oath commits both; unvoiced → insufficient; unknown household → invalid; Nicco as source → `unauthorized_mutation`), funds (no Controller path). Observed: an invalid `/schedule` id (no `campaign_event_` prefix) fails the whole turn at prepare (`prepare_failure`), a user-input error class.

## 9. ATOMICITY FINDINGS

* valid + invalid → only the valid command commits, one revision (tested).
* multiple valid → one revision; offered groups all-or-nothing; sequential valid chains (Brenna then Maren) commit in order.
* **exact duplicate → was a whole-turn failure; fixed** (D-14 generalised to exact repeats of `transfer_item`, `place_item`, `set_knowledge`, `set_condition`, `schedule_event`, `leave_scene`, join/leave household, `add_household_rule`; first occurrence and its quote win; `adjust_relationship` and `create_item` deliberately not merged).
* **distinct but conflicting commands** (handoff + lend of the same item to the same person) still pass authorization individually and fail preparation: whole turn fails, nothing partially applied (tested as `prepare_failure`). Reported as a limitation: authorization validates against the pre-turn state, preparation applies sequentially.
* stale revision during the Controller call → `stale_turn`, no partial state.

## 10. DIAGNOSTIC MODEL

`src/turn/mutation-diagnostics.ts` — `diagnoseMutation({result?, failed?, diagnostics?, debug?}) → MutationDiagnostic {stage, verdict, code, intended, proposed, accepted[], rejected[], revision_before/after, notes, failure}`. Per command: authorized, reason, derived code, human detail (mode mismatch, recipient/item differs, failed check, tag vocabulary…), source, evidence {quote, verified, check}. Pure and deterministic; reuses `TurnResult`, `TurnEvent`, `TurnDiagnostics`, `TurnDebugRecord`; no parallel pipeline; nothing persisted or given to the Narrator/Controller/player. Dev harness `src/dev/controller-authorization-diagnostics.ts` (`node .build/src/dev/controller-authorization-diagnostics.js [A|B|B2|C|D|E|F|G]`) prints INPUT / NARRATION / CONTROLLER PROPOSAL / PARSED COMMANDS / AUTHORIZATION / PREPARE / COMMIT / REVISION DELTA / DIAGNOSIS, runs the real coordinator with the **real OpenRouter controller provider over a stubbed wire** (strict envelope, normalization, `structured_output_invalid` behave as in production), offline, no key.

## 11. OFFLINE MATRIX RESULTS

E2E1 reproduction (`controller-authorization-hardening.test.ts`):

| Case | Diagnosis |
|---|---|
| A Controller proposes nothing | `controller_no_command`, "CONTROLLER OMISSION" when the grammar confirms; consistent-with-refusal note otherwise; no commit |
| B correct transfer, no quote | commits via grammar when a receipt verb is narrated |
| B2 correct transfer, receipt without a listed verb | `insufficient_confirmation`, check `no_receipt_act_in_quote`, no commit |
| C correct + valid quote | committed, +1 revision, owner unchanged |
| D hedged ("maybe she will take it") | `ambiguous_evidence` |
| E recipient refuses | `contradictory_evidence` (`rejected_recipient_refused`) |
| F narration accepts part of an offered set | nothing partial; `rejected_evidence_partial_group` |
| G return-mode on a Nicco-carried item the recipient owns | committed (evidence path, F-T3) |

Plus: parse failure ×4 inputs, provider failure, legacy envelope, stale revision, prepare failure, mapping totality, determinism, shadow mode, Narration/Controller agreement (refusal vs transfer → reject; empty proposal after "takes it" → omission note; different item/recipient → reject), all of section 5.

## 12. LIVE RESULTS

Narrator `z-ai/glm-5.2`, Controller `openai/gpt-6-luna` (answered itself, no fallback), fallback `anthropic/claude-haiku-5.5` (requested, unused). Script `src/dev/controller-authorization-live.ts` (needs `--live`).

| Live | Input | Outcome |
|---|---|---|
| 1 | `*hands Brenna the sword*` | Narration: Brenna takes the sword. Controller: correct `transfer_item handoff`, quote "She reaches out and takes the sword by the grip, …". **Rejected `receipt_subject_not_recipient`** (F-T1). Rev 2→2. **Fixed afterwards, verified offline on the captured text.** |
| 2 | primed refusal ("No. Never again."), then `*hands Brenna the sword*` | Narrator refused ("I said no… I won't touch it"). Controller proposed nothing. Correct. Rev 2→2. |
| 3 | `*punches Maren hard in the stomach*` | Narration: winded, doubled. Controller: `minor_injury` (wrong tag) + a `wariness` step. Both rejected (`condition_term_missing`; hedge in the quote). Rev 1→1. Safe. |

Fix 1 itself was **not** re-run live (the three-turn budget was spent); it is verified deterministically against the exact live narration and quote.

## 13. PROVIDER CALL COUNTS

6 HTTP requests (3 narrator, 3 controller), all 200, 0 retries, 0 revision narrations, 0 turn failures, 0 image calls, 0 fallbacks used. Offline: 0 requests.

## 14. PRODUCTION CHANGES

1. `evidence-authorization.ts` `precedingNamedSubject`: strips leading `*`/`_`/quotes before reading the sentence subject (F-T1).
2. `evidence-authorization.ts` `strangerIn` + `objectWords`: the transferred item's own name words are not strangers (F-T2); never a present character's name.
3. `stages/authorization.ts`: exact-repeat dedupe for idempotent kinds (section 9).
4. New, additive, derived-only: `src/turn/mutation-diagnostics.ts`, `src/dev/controller-authorization-diagnostics.ts`, `src/dev/controller-authorization-live.ts`.
5. Docs: EVIDENCE_AUTHORIZATION.md §7 addendum; this report.

Not changed: authorization decisions for every other input, Controller policy/schema (hash-pinned), Transfer semantics, save schema, Narrator.

## 15. TEST RESULTS

`npm test`: **2928 tests, 2928 pass, 0 fail** (baseline 2882; +46 in `tests/controller-authorization-hardening.test.ts`). The Phase 1O adversarial evidence corpus (every window of every negative narration, colluding quotes) passes unchanged.

## 16. TYPECHECK / BUILD

`npm run typecheck` clean; `npm run build` clean.

## 17. SCHEMA / SAVE IMPACT

None. No snapshot field, command, version or migration. The diagnostic is computed on demand and never persisted.

## 18. KNOWN LIMITATIONS

1. Proposal-first: if the Controller omits a command the grammar confirms, nothing commits (now diagnosable as `controller_no_command` + "OMISSION"). Live 2 shows the Controller omits correctly on refusals; no live omission of an accepted act was observed in 3 turns.
2. Receipt vocabulary is closed (F-T4); controller quotes with other verbs are refused.
3. Pronoun-only quotes whose antecedent is Nicco are refused (F-T5); quotes with other capitalised names (e.g. a place name) are refused.
4. Controller tag choice for conditions is not validated against the narration beyond the term check (live 3: wrong tag, safely rejected).
5. Conflicting distinct commands fail preparation atomically, losing the turn's mutations (the narration is still shown).
6. Transfers are not bound to the player's intent (F-T3), documented; error reasons are coarse (the diagnostic refines them, the enum is unchanged).
7. Fix 1 not live-re-verified.

## 19. RECOMMENDATION

Proceed to roadmap step 3 with these concrete items: (1) a live confirmation turn for the handover now that the root cause is fixed (≤1 turn); (2) review the receipt verb list with real narrator text collected by the new diagnostics (not by guessing); (3) decide whether transfer authorization should require equality with the resolved intent when one exists (behavioural change, needs your call); (4) one sentence in the Controller policy about copying `explicit_intent` (prompt revision, needs a live smoke); (5) consider per-command preparation fallback for conflicting batches only if it recurs in play.
