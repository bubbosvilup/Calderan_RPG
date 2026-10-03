# Phase 1Q review: canon boundaries and lore invention control (2026-09-29)

**Reviewer:** Claude (implementation agent). Classifications of live narration are agent-authored and **pending human review**. Detector output consists of review candidates, not verdicts.

**Unchanged:**
- Kimi (`moonshotai/kimi-k2.5`, reasoning off) and DeepSeek (`deepseek/deepseek-v4-flash-0731:nitro`);
- CampaignState, hybrid evidence authorization, NarrativeKnowledgeAccess, ephemeral participants (only replay labels touched), the retrieval pipeline, persistence and the opening state.

**Not added:** an LLM, memory, overhearing, belief revision, a travel graph, or a canon redesign.

## A. Canon-bearing claim definition

**Canon-bearing** (documented in [NARRATIVE_AUTHORITY.md](../../architecture/NARRATIVE_AUTHORITY.md) §7 and stated in the narrator system prompt):
- named or specific institutions, places, organizations and landmarks;
- routes, civic structures and laws;
- schedules and times;
- history and religion;
- guilds;
- public rumors;
- persistent world relationships;
- population-wide or common-knowledge claims.

**Free improvisation:** gestures, tone, emotions, clothing of unnamed temporary people, transient ambience and disposable props.

## B. Narrator policy

A new `[CANON BOUNDARIES]` section in `NARRATOR_SYSTEM` (`src/turn/prompt-builder.ts`):
- **When a claim is allowed:** only when supplied canon, current state or the player's own action establishes it.
- **When canon is silent:** characters answer naturally but stay vague or uncertain ("I don't know", "never heard of one", "ask someone at the market"), and never invent a replacement answer.
- **What is never invented:**
  - rumors or public talk, including vague rumors;
  - institutions, offices or buildings (canon names only);
  - operating hours, auction times, market days and other schedules;
  - routes: at most the established district, never streets, turns, gates or landmarks.
- **No meta:** a separate rule forbids exposing rules, permissions, knowledge access, state or system reasoning in prose.
- **Consolidation:** the Phase 1P route and institution sentence was folded into this section; its wording is preserved.

## C. Rumor handling

- **Policy:** covers "people say", "everyone knows", "there are rumors" and "some say", vague or not.
- **Live (10 probes):** 0 invented rumors. The 1P run had "some say it's haunted, some say cursed" on the same Heartstone question.
- **Detector:** flags every observed historical rumor, including the 1N leak "You're a light-mage, everyone knows that".

## D. Institution handling

- **Live:** 0 invented named institutions (no temple, Constabulary or workhouse). Canon institutions were used correctly: "The Church handles that sort of thing"; "The Duke's council keeps records". Generic referrals appeared ("a guild office", "law offices, brokers", "a factor"). They are not named institutions, but "law offices" is borderline.
- **Detector:** flags "Light temple", "old ward", "Constabulary", "Workhouses" and "Eastgate Barracks" (all tested).

## E. Schedule handling

- **Live:** both auction-time probes answered with uncertainty ("Don't know their schedule. Never been."; "Can't say I know the schedule."). The 1P run had invented "Auctions start around the third hour after midday".
- **Detector:** flags that historical sentence.

## F. Route handling

- **Live:** no invented streets, turns, gates or landmarks. One probe said "I couldn't tell you where… ask someone at the proper markets".
- **Wrong district:** the other probe said "It's in the South District somewhere". Canon says West District, but that turn did not retrieve the market record (see O). The detector flagged "South District" as ungrounded.

## G. Dev grounding detector

`src/dev/lore-grounding.ts` (`groundingManifest`) is review-only. Production never calls it, and it never mutates narration, canon or state. It is attached to every turn in `npm run eval:participants` exports.

**Manifest per turn:**
- canon entities used;
- retrieved canon used;
- state facts used;
- participant facts used;
- canon phrases used but not supplied (reported, not flagged);
- potential ungrounded claims.

**Flag categories:**
- `ungrounded_institution_or_place`: modifier + institution/place noun, or a known-invented bare noun;
- `unknown_proper_noun`: a mid-sentence capitalized phrase absent from supplied and authored text;
- `public_rumor`;
- `schedule`;
- `route`;
- `meta_language`.

**Grounding rules:**
- A phrase is grounded when it occurs in this turn's supplied prompt.
- The recent-conversation replay is excluded, so an earlier invention echoed back cannot ground itself. This was found and fixed during the phase and is tested.

**Corpus tests** (`tests/lore-grounding.test.ts`):
- **Flagged, with the correct category, verbatim:** Light temple / old ward; haunted/cursed rumors; the auction schedule; Constabulary / workhouses; "three streets that way"; "the main way toward the western gate"; Eastgate Barracks; "Heard rumors there's one about"; three meta sentences.
- **Silent on:** a passer-by shrugging; a worn coat and nervous glance; vague crowd noise; "I don't know… ask at the market"; the grounded "That's in the West District"; Heartstone's doors; weather ambience; a participant appositive.

## H. Meta-language behavior

- **Live (10 probes):** none of the banned forms: no "nothing suggests he knows", "not established", "the state says" or "no transaction". The 1P smoke had "Nothing in his manner suggests he knows…".
- **Mild echoes of prompt wording remain:**
  - "Nicco steps before an ordinary Calderan local", which echoes the participant block's "ordinary local";
  - "She does not ask his business, nor offer her name."

## I. Passer-by replay labels

- **Fix:** replay labels now map through the stable participant ref. A quote from an unnamed speaker whose noun ("passer-by", or the descriptor noun "woman") uniquely matches a participant that already existed at that exchange is replayed as `P1 Passer-by`. The same person is never `Passer-by:` then `Woman:`.
- **Fallbacks:** ambiguous nouns, or participants created later, keep the generic label, so a new participant never relabels older lines (tested).
- **Scope:** descriptor capture is unchanged (§14: no parser expansion).

## J. Live lore tests (Kimi, 10 turns: 5 probes × 2, fresh campaign each)

Export: `docs/evaluations/phase-1q-live-2026-09-29T0129.json`.

| Probe | Canon-bounded? | Notes |
|---|---|---|
| Light magic ×2 | yes | "Don't know much about magic myself… The Church handles that sort of thing" (Church is canon); "Heard the term… Rare stuff" (matches canon; `light_and_shadow` is unclassified, so this is a mild permission overreach) |
| Who lives in Heartstone ×2 | **partly** | Both answered "no one" (consistent with the empty tower), but invented history: "Empty since I was a boy… Belongs to the city, or it did, or no one's sure who holds the deed"; "empty long as I've lived in Calderan, and my mother too". No rumors. |
| Auction times ×2 | schedule yes; **content no** | No schedule was invented. Both sent Nicco to Davenport ("That's not handled here"), contradicting canon (Calderan has its own legal market). The turn retrieved `davenport`, not the Calderan market. |
| Exact route ×2 | route yes; **one wrong district** | No streets or gates. One said "South District somewhere" (wrong; retrieval miss). One gave natural uncertainty. |
| Ordinary chat ×2 | yes, natural | Weather talk. One added permanent-looking square fixtures ("a stone drinking trough", "a bench"), a minor overreach against the no-new-architecture rule. |

**Overall:**
- Kimi stayed natural and chose uncertainty over invention for schedules, routes and institutions.
- Remaining errors come from **retrieval misses** (the market record not retrieved for "slave auctions" or "exact route to the slave market") and **invented history** when canon is silent.

## K. False positives of the detector

- **Curated corpus:** 0 false positives on 8 valid improvisations; 12/12 observed inventions flagged.
- **Historical live narrations** (15, from Phases 1N–1P):
  - Every manually identified invention of a flaggable kind was flagged.
  - One borderline false positive: "Everyone knows it" about the market's location, which canon does say is publicly known.
  - Two "I'd"/"I've" false positives were fixed during the phase.
- **Phase 1Q live (10):**
  - 1 true positive: "South District".
  - 2 false positives: "city streets" (generic prose), and "old tower" (canon says "old stone tower").
  - False negatives: invented tower history, "law offices", the Davenport-only contradiction (semantic), and square fixtures. Historical false negatives: "lower city", "Magistrate's holding cells".
- **Conclusion:** good precision on the targeted patterns; recall is limited to lexical forms. History and semantic contradictions need canon-aware checks that are out of scope. It is not suitable for blocking production narration.

## L. State safety

- **Live:** 10 probes, 0 controller proposals, 0 authorized commands, revision 1 → 1 on every turn, false durable mutation 0.
- **Detector:** review-only; it cannot patch canon or state.

## M. Prompt / token impact

- **System prompt:** +919 characters (about +230 tokens) net: the canon section is 1,164 characters, minus the 245-character sentence it absorbed. Total system length is 3,161 characters.
- **Live medians (10 turns):** narrator prompt 2,653 tokens (range 1,718–3,307); completion 155.
- **Comparable first turns:** 1P was 2,369–2,379 with market retrieval; 1Q is 2,472–3,307, and depends on which records were retrieved.
- **Latency (medians):** TTFT 1.63 s; narrator total 2.69 s; full turn 3.43 s. Completions are slightly longer; provider routing noise applies.
- **Cost:** $0.0142 for the 10 live turns.
- **No extra calls.**

## N. Offline verification (network disabled, API keys cleared)

- `npm test`: **705/705** (the 1P baseline was 699).
- New tests: `tests/lore-grounding.test.ts` (6): invention corpus, improvisation corpus, manifest, policy text, replay labels, replay self-grounding. One 1P assertion was updated to the stable `P1 Passer-by:` label.
- `npm run test:playthrough`: **25/25**. `npm run typecheck`: pass.

## O. Remaining limitations

1. **Retrieval recall for slave-market variants.** "When do the slave auctions happen?" retrieved `davenport`, `heartstone_lr` and `frostspire`. "What's the exact route to the slave market from here?" retrieved `calderan`, `heartstone_u1` and `west_slavery`. Neither returned `calderan_slave_market`, so the narrator produced a wrong district and a Davenport-only answer. The retrieval pipeline was out of scope this phase.
2. **Invented history when canon is silent** ("empty since I was a boy", "belongs to the city… deed"). The policy names history as canon-bearing; Kimi still fills it in. The detector cannot see it.
3. **Minor new permanent fixtures** in ambience (a trough and bench in the square).
4. **Unclassified frequently retrieved public records** remain blocked for ephemeral participants. Retrieval counts across the Phase 1P and 1Q live runs:

| Record | Times retrieved |
|---|---:|
| `heartstone_lr` | 7 |
| `heartstone_u1` | 5 |
| `heartstone_square` | 4 |
| `davenport` | 4 |
| `light_and_shadow` | 3 |
| `west_slavery` | 3 |
| `main_city_structure` | 3 |
| `inquisition` | 2 |
| `frostspire` | 2 |
| `learned_arts_guild` | 1 |

Only `calderan` (`public`, retrieved 3 times) and `calderan_slave_market` (`local:calderan`, retrieved 4 times) are classified. Participants nonetheless voiced unclassified public knowledge ("the Church", "Light is rare", Davenport): the narrator does not strictly obey DO NOT USE for common-sense public canon.

5. **Detector limits** are described in K.
6. **Travel:** the slave market still has no `/go` connection.
7. **Out of scope:** overhearing, belief revision, long-term memory, player knowledge acquisition.

## P. Status

- **Improved and verified live:** rumors, invented named institutions, schedules, routes and meta phrasing, the main targets, did not recur in 10 probes. The narrator answered with natural uncertainty, the replay labels are stable, and there were no durable mutations.
- **Not yet controlled:**
  - wrong or contradictory canon claims caused by retrieval misses on slave-market phrasings;
  - invented history on silent topics.
- The detector is useful for review but has lexical-only recall.

READY WITH FIXES

---

### Artifacts
- `docs/evaluations/phase-1q-live-2026-09-29T0129.json`: 10 live lore probes with full prompts, participants, access rows, retrieval, grounding manifests, proposals, authorization and state.
- Code:
  - `src/turn/prompt-builder.ts` (`[CANON BOUNDARIES]`, stable replay labels);
  - `src/turn/scene-participants.ts` (`participantForNoun`);
  - `src/dev/lore-grounding.ts`;
  - `src/dev/eval-participants.ts` (`--set lore`, grounding per turn).
- Tests: `tests/lore-grounding.test.ts`.
