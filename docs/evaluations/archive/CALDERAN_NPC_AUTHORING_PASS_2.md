# Calderan NPC authoring pass 2: power figures and East anchors

2026-09-30. Authored data only: no engine, prompt, retrieval-code, quest or runtime-goal change. Nothing is committed or pushed.

## Scope and gates

| | Before | After |
|---|---|---|
| Source hash (`src/`+`data/`) | 4a597f731761… | 8f6c46bda2df… |
| Entities / chunks | 139 / 24 | 147 / 25 |
| Typecheck | PASS | PASS |
| Deterministic tests | 877/877 | 884/884 (7 new in `calderan-npc-pass-2.test.ts`) |
| Playthrough | 25/25 | 25/25 |
| Authored-data audit | lexical top-1 31/34, turn 25/25 | lexical top-1 32/34, turn 25/25 (`calderan-data-npc-pass-two.json`) |

All records use the existing complete character contract, with every field within its limit.

- **Where the new characteristics went:**
  - Observable voice, mannerisms and public role are in `content` and `appearance`.
  - Personality and signature behaviours are in `traits`.
  - Motivation and moral limits are in `purpose` and `morality`, which are narrator-only.
  - Vices, fears, background and knowledge limits are in `private_notes`, which are narrator-only and never searchable.
- **No goals or quests:** no purpose is written as a runtime goal and nothing creates a quest.
- **Scene sizes:** every scene holding the new NPCs builds within limits. The Citadel (Duke and Vaelen) is a 9.3k-character context; the East District level (Gaston and Dunrig) is 10.9k, against a 32k limit.

## NPCs created and expanded

| NPC | Status | Role | Base / work / home |
|---|---|---|---|
| Cassian Valerius | new | High Archon of the West | Cathedral / Cathedral / Cathedral (his apartments, as text only) |
| Helbrecht | new (no surname) | High Inquisitor of the West | Bastion / Bastion / — |
| Uther Calderan | expanded | Duke of Calderan | Citadel ×3 (unchanged) |
| Vaelen Vael | expanded | Patriarch, Chancellor of the Ducal Seal | Citadel / Citadel / — |
| Elspeth Vael, Seren Vael | expanded | Senior Vael operator; junior officer beneath her | — |
| Sybilla, Azael, Gideon Melakor | expanded | Matriarch; social intermediary; information and contract strategist | — |
| Vorn, Boran, Kaelen Dravendark | expanded | Patriarch; younger brother; eldest daughter | — |
| Corvinus, Iseult, Maelor Morvath | expanded | Patriarch; banking and credit specialist; recognized heir | — |
| Gaston | new | Master clockmaker and precision mechanist (rat Beastfolk, free) | East District / — / — |
| Dunrig Iron Hands | new | Elder and head of the Iron Hands workshop network | East District / — / — |
| Arwen Woodsigner | new | Wood Elf bowyer, woodworker, hunter | The Bent Bough ×2 / — |

- **District-level bases:** Gaston and Dunrig follow the Pellan precedent; their workshops stay as text, with no invented location records.
- **The Bent Bough:** a new location under `calderan_east`, because it is named and West shops are already entities at this granularity.
- **Not created:** Vael residence, other noble seats, Gaston's workshop, named mage clients, Gaston's former owner.

## Relationships (all supplied; reciprocal where the supplied fact is mutual)

- **Vael:** Vaelen ↔ Elspeth as spouses. Vaelen → Seren and Elspeth → Seren as child, with Seren → each as parent; the edge descriptions carry the warmth and hierarchy you supplied.
- **Friendships:** Uther ↔ Vaelen and Vaelen ↔ Corvinus.
- **Dravendark:** Vorn ↔ Boran as siblings (retained); Vorn → Kaelen as child and Kaelen → Vorn as parent. Kaelen is now "eldest daughter of Vorn", which the brief supplied.
- **Morvath:** Corvinus ↔ Iseult as siblings (retained). Maelor has no family edge, because his relation to Corvinus was not supplied.
- **Duke, Church and Inquisition:**
  - Uther → Sun Emperor: sovereign, loyal.
  - Uther ↔ Cassian: institutional counterparts, neither subordinate in the other's domain.
  - Cassian ↔ Helbrecht: professional, explicitly with no friendship or hostility.
- **Explicitly absent:** Uther has no spouse, children or family (stated in his content). Sybilla, Azael, Gideon, Maelor, Gaston, Dunrig and Arwen have no edges.

## Private knowledge

- **Light secret:** `sun_emperor.light_secret` now has `known_by: [cassian_valerius, helbrecht]`.
- **Mutilating Ritual and Null Dust:** both have `known_by: [helbrecht]`.
- **Private-notes cues:** Cassian's and Helbrecht's private notes say they are in the inner circle, without restating the secret.
- **Excluded:** Uther, all nobles, Gaston and Dunrig are in no `known_by` list. Uther's knowledge of the secret stays undefined.
- **Arwen's belief:** the Beastfolk-origin tradition is a restricted chunk, `woodsigner.beastfolk_origin_tradition` (narrator only, `known_by: [arwen_woodsigner]`), framed as inherited clan belief. The public Beastfolk lore is unchanged.
- **Gaston:** he knows mages professionally but has "no secret magical lore".
- **Checks:**
  - no secret phrasing appears in any player-visible text;
  - player search never returns the restricted passages;
  - no narrator prompt for the Citadel, Cathedral, Bastion, Bent Bough or East District contains the secret.
- **Engine limitation (recorded):** turn retrieval drops secret passages, so the canonical `known_by` grant does not yet reach the narrator as a usable fact. The narrator knows only from the private-notes cue that Cassian and Helbrecht hold it. Letting known holders use restricted facts is future engine work, alongside the pool-slot task from the previous audit.

## East clans

- **Iron Hands** (faction, member Dunrig):
  - an early dwarven group invited by a Duke with financial and commercial incentives;
  - multiple East workshops under one name and standards, described without corporate vocabulary;
  - high-grade, high-strength, low-weight alloy tradition, explicitly not magic, with the exact process closely guarded;
  - no date and no inviting Duke.
- **Woodsigner** (faction, member Arwen):
  - a small, egalitarian Calderan branch of a larger Wood Elf clan whose history is not authored;
  - ducal invitation, with no date or Duke;
  - bows and fine woodcraft.

## Character differentiation (voice smoke check)

Each triad member has a distinct signature behaviour in traits and content:

| Triad | Signatures |
|---|---|
| Vael | Vaelen: procedure, over-explaining. Elspeth: reads who wants what from whom. Seren: records before judging, writes more under stress |
| Melakor | Sybilla: senses political shifts first. Azael: never asks at a first meeting. Gideon: long silence, then an early detail |
| Dravendark | Vorn: briefing speech, no softeners. Boran: convivial off duty, surnames. Kaelen: "And after?" |
| Morvath | Corvinus: reframes as systems. Iseult: "How much?" Maelor: "Can we make it?" |
| East | Gaston: refined, careful, free. Dunrig: slow deep voice, long memory. Arwen: calm, awkward with children |
| Power | Cassian: quiet, ceremonial, moral facts. Helbrecht: silent stare, concise orders. Uther: right / convenient / looks right |

- **No characterization collisions found.** The only shared ground is supplied by the brief:
  - Cassian and Helbrecht both "can authorize terrible acts without enjoying them", but framed as institutional theology versus operational doctrine, with opposite voices.
  - Vorn and Kaelen are both disciplined, but Kaelen asks about consequences.
  - Azael and Gideon are both patient, but one is social and the other silent.
- **Missing distinction:** Elspeth and Seren have no stated voice. Seren's comes from her note-taking behaviour, and Elspeth is carried by her perceptiveness rather than a speech pattern.

## Tests

- **Coverage of `calderan-npc-pass-2.test.ts`:**
  - IDs and affiliations; supplied locations, and no invented residences or workshops;
  - every family and friend edge, including the reciprocal ones, and no family edges for the Duke or the unsupplied members;
  - the Elspeth/Seren hair and eye resemblance;
  - Melakor spelling, with no "Valis Vael";
  - Kaelen separate from the unauthored `inquisitor_severan`, and not formally heir;
  - Gaston surname-less, free, not a mage, and not a Mage Registration knower;
  - Arwen's tradition restricted and absent from public text and player search;
  - no numeric elf age;
  - the `known_by` sets exactly as authored, with no noble or Duke among any knowers;
  - no secret leakage in public text or player search;
  - no clan dates, recipe or chief structure.
- **Updated tests:**
  - Exact inventories in `authored-data`, `authoring`, `geography`, `west-canon`, `west-everyday-canon`, `west-npc-canon`, `world-canon`, `retrieval`, `lexical-search`, `semantic-search` and `opening-state`. These cover five new NPCs, two factions, one location, the counts, faction pagination and six new opening placements from authored bases.
  - `world-canon` now asserts Helbrecht's exact `known_by` on Null Dust and the Mutilating Ritual.
  - `calderan-four-district-canon`: the East anchor set explicitly adds The Bent Bough, and the secret policies include their authored knowers. The Pass 1 "skeletal nobles" block is superseded by this pass's guards.
  - `semantic-search`: the pinned lexical top-1 count rose from 31 to 32, because "mages guild" returns to the Learned Arts Guild first.

## Intentionally undefined

- **People:** the Duke's family; Uther's knowledge of the Light secret; Elspeth's formal title; Azael's and Gideon's family relations; Maelor's relation to Corvinus; any succession law, with Kaelen not named heir.
- **Arwen and Gaston:** Arwen's exact age, since elf lifespan is undefined in canon; the site and name of Gaston's workshop; his former owner; named mage clients.
- **Clans:** the Iron Hands alloy process; the dates and inviting Dukes for both clans; the wider Wood Elf clan.
- **Beastfolk origin:** stays unresolved as world truth.

## Contradictions and resolutions

1. **Skeletal records.** The earlier skeletal records said age, appearance and personality were "not established" for the house members. They are now filled in from supplied canon; the records were minimally rewritten with IDs unchanged.
2. **"Ducal government".** It has no canon entity, so Uther's only affiliation remains the Ducal Council. No government faction was invented.
3. **Corvinus as an "older" friend of Vaelen.** This was read as "long-standing". The supplied ages (63–67 versus 62–66) are consistent with either reading.
4. **Retrieval fix, as a side effect.** "Who is the High Archon of the West?" now returns Cassian first, through his own title alias. This resolves the Pass 1 audit's office-title finding without aliasing the Church.

CALDERAN NPC AUTHORING PASS 2 COMPLETE
