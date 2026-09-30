# Calderan live NPC regression — Repair 1

2026-09-30. An engine correction pass derived from [CALDERAN_LIVE_NPC_REGRESSION_1.md](CALDERAN_LIVE_NPC_REGRESSION_1.md). The baseline report and all its artifacts are untouched. No YAML, lore or NPC personality was changed. Tests 3 and 4 were not rerun.

**Result.** The authority problems the baseline exposed are fixed structurally and covered by 31 new deterministic tests; all 830 offline tests pass. In the final live rerun of the exact Test 1/2 matrix:

- **Test 1:** 0 unqualified disclosures of private player facts or household ownership (baseline: 10 FAIL), and the protected encounter now projects.
- **Test 2:** 9 of 16 initial gifts commit (baseline: 0). All 9 returns resolve the exact item and giver; every NPC refused them, and Nicco correctly keeps the boots. Zero duplication or ghost equipment.
- **Not met:** "16/16 gifts" and "zero narration/state mismatch". Two turns still narrate a handover the engine did not commit.

Status: **READY WITH REMAINING ISSUES**.

## A. Baseline defects

From the baseline Tests 1–2, with the Test 3–4 extension:

1. **Inbound transfers impossible.** `authorizeCommands` accepted a transfer only when Nicco owned and held the item. All 16 NPC → Nicco gifts were rejected with `rejected_reference_invalid`, even where receipt evidence verified.
2. **Natural return language unparsed.** The embedded clause `after which he decides to give them back the boots` and pronoun references produced no candidate in any of 16 cases.
3. **Narration delivered before authorization.** Narration streamed before the controller ran, so text asserted handovers the authorizer then rejected (15 of 15 item sequences mismatched).
4. **Knowledge by instruction only.** Household ownership and arrival history lived in narrator prose with no access control. Ten NPCs invented registries, rumors, prior meetings or ownership. Korvin voiced the forbidden F1 fact ("mage", "flashing that light") despite `DO NOT USE F1`.
5. **Evidence false negatives.** A bare `back` disqualified receipts, and multi-character sentences were mishandled.
6. **Protected character not projected.** Dren, placed in runtime, was filtered out of the narrator scene, so no portrayal was ever tested.
7. **From Tests 3–4.** Habitual companions narrated as present (Blackthorn's bodyguards), co-present NPCs ignored, no physical-interaction domain, unrecorded injuries/restraint/detention, invented durable canon (dead owner, debts, amputation law, "the Watch", exact counts), and an imperturbability bias under violence.

## B. Transfer authority changes

[command-authorizer.ts](../../src/turn/command-authorizer.ts) accepts both directions under one contract:

| Direction | Required state | Destination |
|---|---|---|
| Nicco → NPC (unchanged) | Nicco owns and carries/wears the exact item; recipient present | recipient |
| NPC → Nicco (new) | A **present** character both **owns and holds** the exact item | Nicco, `carried` only (never straight into a slot) |

Everything else is unchanged:
- The command must equal a resolved player intent.
- Narration evidence must confirm it.
- A refusal vetoes it.
- The whole change is prepared against the base revision and committed atomically.

There is no remote transfer, no transfer from a mere carrier or owner, and no cloned or re-registered item.

An authorized inbound gift gets deterministic provenance (`acquisition: gift, from_character_id: <giver>, acquired_at: <minute>`), because the controller vocabulary has no acquisition field. That provenance is what later resolves "give them back" to the giver.

Offer versus gift:
- **An NPC offer** ("Korvin offers Nicco the boots") creates no candidate. The item stays the NPC's until Nicco himself accepts in a later action ("*he takes the boots*").
- **A player-directed completed gift** ("Korvin gives Nicco the boots") creates an NPC → Nicco candidate. The narration must establish the handover, and the NPC may still refuse in character.

Transferring an equipped item unequips it in the same preparation: the item becomes carried by the recipient and the slot is recorded empty.

## C. Natural-action changes

[natural-actions.ts](../../src/turn/natural-actions.ts):

- **Give-back and return forms:** `give them back`, `give the boots back`, `give them back the boots` (double object), `give back the boots to X`, `hand them back to her`, `offers them back`, `return the boots`, `tries to return them`.
- **Attempt frames** (`decides to`, `chooses to`, `tries to`, `attempts to`) are stripped *only before a transfer form*: the attempt is performed and its outcome still depends on the recipient. Hedges still resolve nothing: `thinks about`, `almost`, negation, modal/future, `would … if`, and quoted speech ("I'll give them back later").
- **Relative clauses:** `after which`, `after that`, `which`, `who`, `so` and `then` openings are stripped, which is what the exact live input needed.
- **Bounded pronoun resolution.**
  - A pronoun recipient is the item's acquisition source when that person is present, else the single present character.
  - A pronoun item is the segment's last item, else the single carried item from that recipient, else the single carried item.
  - Anything else is reported `ambiguous` and never guessed.
- **Scene direction.** Unmarked input counts as action text only when *all* of it is third-person narration: every sentence led by a present character's name or he/she, and no first/second-person words, asterisks or quotes. This lets the exact live input "Korvin gives Nicco a pair of leather boots." act; ordinary speech remains speech.
- **Nicco's acceptance** (`*he takes/accepts the boots (from X)*`) creates an inbound candidate only for an item a present character owns and holds.
- **Physical acts** (strike, shove, grab, release) on exactly one present persistent character are recorded as outcome-dependent interactions (see E).

## D. Narration/state coherence

**Chosen design: controller-mediated acceptance plus a bounded reconciliation step.** It is not a pre-narration decision call. Resolving NPC decisions before narration would need an extra model decision per turn and would duplicate the evidence authority. Instead the narrator's text became a draft. Full order in [TURN_COORDINATOR.md](../architecture/TURN_COORDINATOR.md#live-npc-regression-repair-1-authoritative-narration-order):

```text
draft (buffered) → controller → authorization → state_proposed → prepare
  → audit → [one revision with the authoritative outcome] → [deterministic redaction] → deliver → commit
```

- The draft is never shown. Delivered narration comes after authorization and preparation and before commit, as a single `narration_delta`. Abandoning the iterator still commits nothing.
- **Revision** re-sends the original prompt, the draft as an assistant turn, the resolved outcome (`COMMITTED:` / `NOT COMMITTED: … stays with …` / recorded conditions) and each flagged sentence with a correction.
- **Redaction** is used if the revision still fails the audit: flagged sentences are removed and the outcome is stated plainly ("The pair of leather boots stays with Nicco.").
- A turn that fails after drafting (for example a controller timeout) exposes **no** narration; `turn_failed.narration` is only what was delivered.
- `TurnResult.narration_reconciliation` records the draft, the issues, the revision and which text was delivered.
- Reconciliation never changes state. It only makes the text match state.

The invariant holds deterministically for everything the audit recognizes: rejected, unproposed and possible present-party transfers; refused committed transfers; uncommitted conditions; restraint, removal or detention narrated as accomplished. Recognition is bounded pattern matching, so live gaps remain (section L).

## E. Knowledge-authority, presence and consequence changes

**Source audit: narrator may know vs NPC may know**

| Source | Narrator | NPC |
|---|---|---|
| Player profile (origin, arrival, magic, ownership) | Yes (`NARRATOR-ONLY` block) | Never, except a CAN USE entry |
| Player observable appearance (authored traits) | Yes | Yes (perception) |
| Campaign facts F* | Yes | Only through explicit knowledge edges (`knows`/`believes`/`suspects`/`heard_rumor`) |
| Household roles H* (**new controlled fact**) | Yes | Only fellow current household members |
| Recent conversation | Continuity only | Only what was said in the scene |
| Retrieved lore R* | Yes | Canonical `known_by`, or public/local awareness |
| Narrator portrayal | Behavior only | Never a source of facts |
| Location ownership / history | Only from supplied canon | Only from supplied canon, never inferred |

**Prompt contract**
- The player profile is split into "Observable by anyone present" and a `NARRATOR-ONLY` block.
- Household ownership is now an access-controlled `H1` ref in `[CHARACTER KNOWLEDGE ACCESS]`.
- The access block states **UNKNOWN IS NOT A RUMOR**: sources (rumor, registry, "people say", past meetings, sightings) require a matching CAN USE basis; the allowed alternatives are "I don't know", a question, or a framed guess from present observation.
- New system blocks:
  - `[DURABLE CANON UNDER IMPROVISATION]`: no laws or penalties, historical owners, institutions or watches, events, property history or debts, exact recurring counts, established rumors, or records.
  - `[NPC KNOWLEDGE SOURCES]`.
  - `[PRESENCE AND CONSEQUENCES]`: association is not presence, the consequence classes, and stress-response guidance that respects involuntary reactions without forcing composure or panic.

**Structural NPC-claim grounding** ([narration-audit.ts](../../src/turn/narration-audit.ts)). Speaker attribution reuses the deterministic dialogue grammar. For each character's quote it flags:
- private F-facts a speaker cannot use, as statement, hint or guess (all content words, a distinctive word, a content bigram, or "your <word>");
- Nicco's household role stated as known;
- invented sources about Nicco or his household (with negation and conditional exemptions such as "I haven't heard that gossip" and "if you want gossip");
- arrival chronology, invented arrival records, or a shared past with Nicco;
- household-place history, unless retrieved canon was supplied.

Guess framing counts only when the marker precedes the claim, or the sentence is a question or ends with a guess tag. So "If I had to guess, that tower's yours" passes, while "a man who keeps his own tower and looks like he forgot to pack" does not.

Offline replay of the saved baseline narrations through the final audit:
- **Test 1:** flags exactly the 10 graded FAILs, and none of the 5 PASSes.
- **Test 3:** flags the 6 knowledge FAILs plus Niles's weak "new keeper" implication, and none of the 5 PASSes.

**Presence (items 19–20)**
- `[PRESENT AND ABLE TO REACT]` lists the real present set: persistent characters, confidential encounters and temporary participants. Nobody on it is required to act.
- Authored companions ("usually/often accompanied by, seen with, travels with…") that are absent from the scene are flagged when narrated.
- Named absent NPCs acting in narration are flagged.

**Physical interaction (items 21–22).** The design is in [PHYSICAL_INTERACTION.md](../architecture/PHYSICAL_INTERACTION.md).
- **Class B is implemented** with no new snapshot domain: the existing `set_condition` is now controller-proposable with a closed vocabulary (`minor_injury`, `dazed`, `knocked_down`, `winded`). It is authorized only with a same-turn physical interaction involving that character, additive tags, no status or presentation change, and a verified narration quote carrying the term.
- **Classes C and D** (restraint, removal, detention, bans) are specified but deliberately not built. The narrator may only threaten or attempt them, and accomplished forms are flagged.
- Tests 3 and 4 were not rerun, so this domain has deterministic coverage only.

## F. Evidence verifier changes

[evidence-authorization.ts](../../src/turn/evidence-authorization.ts), [turn-evidence.ts](../../src/turn/turn-evidence.ts). Nothing was broadly relaxed; each change has positive and negative pairs.

| Change | Now passes | Still fails |
|---|---|---|
| Bare `back` removed from the disqualifier; retreats, handing back, and "tells him to" kept | "He takes the boots back", "He accepts the returned boots" | "She tells him to take them back", "She steps back instead of accepting them", "hands the boots back" |
| Inbound branch: holder's handover to Nicco, or Nicco's receipt | "Korvin hands the boots to Nicco", "Nicco takes the boots from her", "presses the boots into Nicco's hands" | "holds out the boots", "thrusts the boots toward Nicco", "almost takes", "doesn't hand over" |
| Item-subject handovers | "The boots pass into Nicco's hands / from his grip to Nicco's" | — |
| Producing an item is not withholding | "withdrew a pair of boots from his satchel" | "withdraws his hand, keeping the boots" |
| Idiom stripped | "a smile that doesn't reach her eyes" | a real negated act |
| Clause-scoped negation (inbound only; refusal words still veto) | "She doesn't wait for thanks as Nicco takes the boots" | "She refuses to let go, as Nicco takes the boots" |
| Release-until idiom | "He does not release them until Nicco's hands close around the leather" | — |
| Gendered pronoun (authored `sex` only; giver excluded; Nicco and giver alone) | "Jessa extends the boots. He takes them." | "Hadrik holds out the boots. He takes them back." |
| Multi-word names tokenized | "Sister Mereth presses the boots into Nicco's hands" | Another person named in the quote |
| Nicco's own "hands them back" is never the recipient's refusal | give-back turns | — |

## G. Protected-character encounter handling

A narrator-only character that runtime places in the player's scene is projected **for that turn only**, marked `confidential_encounter`.
- The narrator receives their appearance and portrayal, plus a rule: do not reveal their identity, role or organization; name them only if the player already named them or they introduce themselves.
- Presence grants no fact access: every CAN USE for them is empty.
- Player retrieval still returns `not_visible` and no hidden canon.
- Absent protected characters are never projected.
- No protected character was made globally visible.

The existing test that asserted exclusion (`west-npc-canon.test.ts`) now asserts this contract instead.

Live: Dren was projected with portrayal in all 3 final-run turns. No protected characterization appears in any delivered text or public artifact. Every public Dren file is redacted to mechanics only, and I checked that all four rerun directories contain no protected terms.

## H. Deterministic regression cases

[live-regression-repair.test.ts](../../tests/live-regression-repair.test.ts): 31 new tests.

| Required | Covered by |
|---|---|
| A NPC offer not accepted → NPC keeps | `A:` (also: a controller proposal cannot commit it) |
| B NPC gives + receipt → exact NPC → Nicco transfer | `B:` (+ provenance, no clone; receipt by Nicco); `B guard:` remote/carrier-only rejected |
| C Nicco gives, NPC accepts | `C:` |
| D Nicco offers, NPC refuses | `D:` |
| E exact live give-back phrasing | `E:` (+ 7 other forms; accepted and refused returns) |
| F negated give-back | `F:` (6 negated/hedged/hypothetical/speech forms) |
| G ambiguous referents | `G:` (two items; two recipients; naming disambiguates) |
| H equipped item transfer | `H:` (slot emptied, no ghost equipment, one copy) |
| I rejected transfer never delivered as success | `I:` ×3 (revision; deterministic redaction; inbound offer; failed turn exposes no draft) |
| J forbidden player facts via registry/rumor/history | `J:` (Korvin's exact failure; end-to-end redaction) |
| K authorized rumor voiced as rumor | `K:` |
| L qualified visual inference, nothing persisted | `L:` |
| M protected encounter without leakage | `M:` |
| 19A/19B association vs presence | `19A:`, `19B:` |
| 20A/20B third-party eligibility | `20A:`, `20B:` |
| 21–22 physical consequences | two `physical act:` tests |
| 23–24 prompt contract | `23/24:` |
| Evidence pairs (item 11) | `evidence verifier:` + three rerun-derived evidence tests |
| Household authority | `household authority:` |

Contract updates to existing tests reflect intended behavior changes; no assertion was weakened:
- Event order: two tests.
- `H1` in access rows: four assertions in `scene-participants.test.ts`, including the narrator/player access row now listing H1.
- The Dren exclusion assertion replaced by the confidential-encounter assertion.

## I. Offline gates

| Gate | Result |
|---|---|
| `npm test` | 830/830 pass, 0 skipped (baseline 799 + 31 new) |
| `npm run test:playthrough` | 25/25 pass |
| `npm run typecheck` | pass |
| Canon | 0 files under `data/` modified during this pass |

All prior canon, retrieval, visibility, action and persistence tests remain passing.

The baseline evaluation verifiers (`verify-npc-regression.mjs`, `verify-npc-regression-34.mjs`) still pass every artifact and report assertion. Only their final check fails, by design: it asserts that the current `src/` + `data/` tree still has the pre-repair hash `7511dd74…`, and this pass changed `src/`. The new source hash is `058c744e…`. The baseline scripts were left untouched as part of the preserved baseline. [verify-npc-regression-repair.mjs](../../scripts/verify-npc-regression-repair.mjs) checks this report against the final-run artifacts, exact inputs, Dren redaction across all four reruns, and the source hash.

## J. Live before/after — Test 1

The same 16 NPCs, fresh campaigns, identical scaffold and exact input, through the production coordinator (`moonshotai/kimi-k2.5` narrator, `deepseek/deepseek-v4-flash-0731:nitro` controller, OpenRouter; lexical retrieval). Final run `2026-09-30T02:48:34Z`; the source/canon hash was identical before and after the run (`058c744e…`). "Delivered" is the reconciliation outcome.

| NPC | Before | After | Delivered | Final-run note |
|---|---|---|---|---|
| Pellan | FAIL | **PASS** | revision | The draft cited an invented source; delivered text: "I haven't the faintest… I do not guess at origins." |
| Korvin | FAIL | **PASS** | draft | Guesses only from speech and dress; "you'll have to say it plain." |
| Mistress Elara | FAIL | **PASS** | draft | Framed inference ("I think you are a man who has taken residence in a tower…"), undecided on origin |
| Bartolomhew | PASS | **WARN** | revision | "I've never seen its door open before today": history framed as personal experience |
| Dren | FAIL (coverage) | **PASS** | draft | Projected with portrayal; claims no knowledge; spoiler-safe |
| Blackthorn | FAIL | **WARN** | revision | Framed guess ("woke up somewhere strange… holding keys you didn't ask for") that suspiciously approximates private facts |
| Captain Doran Hale | FAIL | **PASS** | draft | "I don't know you… I'd be guessing." |
| Brother Aven | FAIL | **PASS** | revision | "I haven't met you before, and I haven't heard anyone speak of you." |
| Sister Mereth | FAIL | **PASS** | draft | "You're standing outside Heartstone, so you're either new to the tower or…" |
| Bram Kessel | FAIL | **PASS** | revision | Knowledge clean ("New to the city, I'd guess"); the narrator voiced Nicco's question as speech (agency slip) |
| Hadrik Voss | PASS | **PASS** | draft | Dry, observational |
| Mira Thorne | FAIL | **WARN** | draft | "New owner, I'd guess" is framed, but rests on an invented observation (Nicco "walking out of Heartstone's main door") |
| Livia Marr | PASS | **PASS** | draft | "You look new here, if I had to guess." |
| Jessa Rook | PASS | **PASS** | revision | Guesses from appearance only |
| Orla Fen | FAIL | **WARN** | redacted | Knowledge clean after redaction; still invents a place ("the Carvers' District") |
| Niles Vanner | PASS | **PASS** | draft | Knowledge clean; narration exposes reasoning ("has no basis to guess") |

Totals: **before 5 PASS / 0 WARN / 11 FAIL → after 12 PASS / 4 WARN / 0 FAIL.** Unqualified disclosures of private player facts, household ownership, invented registries/rumors or prior meetings in delivered text: **0** (baseline 10). The target is met.

Important context: the narrator still *drafted* such leaks in 7 of 16 identity turns (flags: invented source, household claim, unsourced history). The structural audit, not the stronger prompt, produced the clean delivered text. The four WARNs are beyond what the audit can detect. The remaining invented-scene and invented-place failures are canon fabrication, not player-fact leaks.

## K. Live before/after — Test 2

Exact inputs:
- Gift: `<Name> gives Nicco a pair of leather boots.`
- Return: `Thanks *he said to them, after which he decides to give them back the boots*\nYou'll need them more than me`

The scaffold registers one NPC-owned, NPC-carried item; the same item ID is used in each separate campaign.

| NPC | Initial gift | Return recognized | NPC response | Final owner | Narration/state |
|---|---|---|---|---|---|
| Pellan | **committed** (Nicco's receipt) | yes → Pellan, exact item | refused ("I meant them for you") | Nicco | agree |
| Korvin | not committed (narrator left the offer suspended; no proposal) | no item to return | — | Korvin | agree; narrator invented Nicco "refusing" (agency slip) |
| Mistress Elara | not committed (false retraction, see L) | no item | — | Elara | agree after revision |
| Bartolomhew | **committed** (handover) | yes | refused ("A gift given does not seek return") | Nicco | agree; gift text addresses Nicco by name and says "one hears things" (knowledge, see L) |
| Dren | **committed** | yes | refused | Nicco | agree |
| Blackthorn | not committed (offer suspended; no proposal) | no item | — | Blackthorn | agree |
| Captain Doran Hale | **committed** (revision for a household claim) | yes | refused ("Put them on") | Nicco | agree |
| Brother Aven | **committed** | yes | refused | Nicco | agree |
| Sister Mereth | not committed (false veto + unrecognized "transfer") | no item | — | Mereth | **mismatch: "The boots transfer to Nicco's hands"** |
| Bram Kessel | **committed** | yes | refused | Nicco | agree |
| Hadrik Voss | not committed (offer suspended; no proposal) | — (controller timeout: turn failed, nothing shown or committed) | — | Hadrik | agree |
| Mira Thorne | not committed ("footwear" not matched to the item) | no item | — | Mira | **mismatch: "pressing the footwear into his hands"**; return narrated as if Nicco held them |
| Livia Marr | not committed (offer suspended) | no item | — | Livia | premise mismatch: return narrates "She takes the boots back" |
| Jessa Rook | **committed** | yes | refused | Nicco | agree |
| Orla Fen | **committed** (narrative confirmation) | yes | refused | Nicco | agree |
| Niles Vanner | **committed** | yes | refused | Nicco | agree |

Final-run totals:

| | Baseline | Final |
|---|---|---|
| Initial gifts committed | 0/16 | **9/16** |
| Returns recognized with the correct item and NPC | 0/16 | 9/9 possible |
| Accepted returns committed | — | 0 (no NPC accepted) |
| Refused returns keeping Nicco's ownership | — | 9/9 |
| Duplicates / ghost equipment | 0 / 0 | 0 / 0 |
| Narration/state mismatch | 15 item sequences | 2 direct assertion turns + 2 premise turns |
| Failed turns | 0 | 1 (controller timeout) |

Every live run, reported in full (all use the same matrix; generalized fixes were made only *between* runs and each carries regression tests):

| Run | Gifts committed | Failed turns | What the run exposed |
|---|---|---|---|
| `02-25-53` | 0 | 1 timeout | The narrator obeyed player agency and never narrated Nicco taking the boots. Fix: a player-directed completed gift now states that Nicco's acceptance is player-authored. |
| `02-32-05` | 4 | 1 timeout | False vetoes ("withdrew a pair of boots", "doesn't quite reach her eyes"), gestures counted as handovers, item-subject handovers missed. |
| `02-38-44` | 9 | 3 timeouts | Multi-word names, the release-until idiom, clause-scoped negation, gendered pronouns, invented shared past. |
| `02-48-34` (final) | 9 | 1 timeout | Reported above; no changes after it. |

All four runs are under `docs/evaluations/live-npc-regression-repair-1-<stamp>/`. Cross-run mechanics are in [audit-all-runs.json](live-npc-regression-repair-1-2026-09-30T02-48-34-051Z/audit-all-runs.json).

## L. Remaining failures

1. **Two delivered mismatches** (the zero-mismatch target is not met).
   - Mereth: "The boots transfer to Nicco's hands." `transfer` is not an item-subject handover verb, and a *negated* withholding ("does not move to withdraw the offer") vetoed it.
   - Mira: "pressing the footwear into his hands." The hypernym "footwear" is not the item noun "boots", so neither authorization nor the audit recognized it.

   Recommended: add `transfer(s|red)` to item-subject handovers, make withholding negation-aware, and match item category nouns from bounded item metadata. These were found after the final run and are **not** fixed.
2. **False retraction.** After a confirmed receipt, *any* later negated sentence by the giver retracts an inbound gift (Elara: "She does not ask directly about his claim…"). The outbound grammar requires an action word or item reference; the inbound rule does not. Reconciliation then rewrote Elara as withholding, so an evidence false negative can change an NPC's decision. Recommended: require action words or an item reference for inbound retraction. Not fixed.
3. **Narrator leaves gifts suspended.** In 4 of 16 final-run cases (Korvin, Blackthorn, Hadrik, Livia) the narrator left the offer hanging despite the explicit instruction, and the controller correctly proposed nothing. The state is consistent, but the Test 2 prerequisite fails. The next turn's narration then assumes a possession that never happened (Livia; Mira after her mismatch). Recommended: a premise check on give-back turns (the item must be held by Nicco before an NPC is narrated taking it back), plus the audit covering transfers from a non-holder.
4. **Controller timeouts:** 1, 1, 3 and 1 across the four runs (20 s production timeout; upstream `Phala`). Failed turns now expose nothing and commit nothing, but they cost scenario coverage. This is a provider reliability issue, not an engine authority defect.
5. **Knowledge the audit cannot see.**
   - Name knowledge: Bartolomhew addresses Nicco by name in a gift turn, and no structured "knows Nicco's name" fact exists.
   - "one hears things" is not in the source lexicon.
   - Framed guesses that suspiciously match private facts (Blackthorn).
   - Invented observations used as the basis for a guess (Mira).
   - Invented places ("Carvers' District").

   Recommended: a name-introduction fact, and a canon check for capitalized place names absent from canon.
6. **Agency slips.** The narrator occasionally voices or decides Nicco's lines (Bram's question, Korvin's refusal). These were not audited in this pass.
7. **Coverage limits.** The audit is bounded pattern matching. The physical domain (class B) and presence checks have deterministic coverage only, because Tests 3/4 were not rerun, per instruction. Class-B conditions do not expire.

## M. Architectural impact

- **Turn lifecycle:** narration is no longer streamed; it is delivered after authorization and preparation, before commit. Streaming UX is traded for authority. Added latency: controller time for every turn, plus one extra narrator call on 11 of 47 successful final-run turns (10 delivered revisions, 1 redaction).
- **New modules:** [narration-audit.ts](../../src/turn/narration-audit.ts) and [physical-interaction.ts](../../src/turn/physical-interaction.ts).
- **Controller vocabulary:** gains `set_condition` (class B only). The policy now describes inbound transfers.
- **Turn context:** gains household `member_ids`, the player's observable traits, a canon-derived `pronoun` (authored sex only) and `confidential_encounter`.
- **Snapshot schema and persistence are unchanged:** schema version 1, and no new domain.
- **New artifacts:** architecture notes in [TURN_COORDINATOR.md](../architecture/TURN_COORDINATOR.md) and [PHYSICAL_INTERACTION.md](../architecture/PHYSICAL_INTERACTION.md). Evaluation scripts: [live-npc-regression-repair.mjs](../../scripts/live-npc-regression-repair.mjs) (a copy of the baseline harness with only output paths and reconciliation capture changed), [summarize-npc-regression-repair.mjs](../../scripts/summarize-npc-regression-repair.mjs), [audit-npc-regression-repair.mjs](../../scripts/audit-npc-regression-repair.mjs) and [replay-audit-baseline.mjs](../../scripts/replay-audit-baseline.mjs) (offline replay of saved narrations).

## N. Deliberately unchanged canon

- No YAML under `data/` was modified; the file-time check found 0 changed files.
- No personality, portrayal, appearance, relationship, rumor, public fact or history was added to any character, to make failed lines retroactively legal or for any other reason. Korvin, Elara, Bartolomhew, Blackthorn, Doran, Aven, Mereth, Pellan and the seven merchants are exactly as authored.
- Heartstone ownership was not made public.
- Blackthorn's authored "usually accompanied by two large bodyguards" was kept, and is handled as a tendency rather than presence.
- Invented claims in the baseline remain failures in the baseline report. The baseline report and artifacts were not edited.

READY WITH REMAINING ISSUES
