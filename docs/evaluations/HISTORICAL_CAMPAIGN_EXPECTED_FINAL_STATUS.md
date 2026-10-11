# Historical campaign: expected final status (oracle)

Status: **FROZEN** before the first replay of the Historical Campaign Replay certification loop. Oracle version: `oracle-v1`.
Sources: the 421 historical Nicco messages (turns 1 to 421, wall clock 2026-09-13T16:16Z to 2026-09-16T20:43Z) and the historical narrator outputs for the same turns (reference evidence only, never fed back as narration). Evidence ledger: [historical_replay/TRANSCRIPT_LEDGER.md](historical_replay/TRANSCRIPT_LEDGER.md).

This document states what the engine's campaign state should contain after turn 421 when the same player messages are played from a fresh current campaign. It compares **state, never prose**. It is not edited after the first replay starts except through the `ORACLE_CORRECTION_LOG` at the end, and only with direct transcript proof that is not motivated by engine results.

Classes: `MUST_MATCH` (objective, modelled, directly evidenced), `SHOULD_MATCH` (strongly implied, modelled), `NARRATIVE_ONLY` (prose-level, not state), `CURRENT_CANON_SUPERSEDED` (historical premise replaced by current canon), `NOT_YET_MODELLED` (no engine domain), `AMBIGUOUS` (evidence supports more than one value; any listed value passes).

## 0. Method and normalizations

- Historical narrator `[Status]` lines are evidence, not commands. Where they disagree with the player's own actions (for example coins merely placed on a table) the player's actions decide and the disagreement is listed under AMBIGUOUS.
- Current opening additions that never happened historically are **not divergences**: the two Heartstone documents (Deed of Ownership, Household Charter), the three charter rules, the canonical household `Heartstone`, Nicco as lawful owner and Keeper. The historical hearthstone was described as sentient and as having floors L1 to L4; current canon makes Heartstone non-sentient with LR/CY/U1/F1 to F6 (see sections R and S).
- Historical rites (Brenna turn 81, Maren turn 356) map to the current Heartstone rite semantics (voluntary declaration inside Heartstone, barefoot, bare-skin stone contact, equivalent oath, explicit Keeper acceptance/welcome) producing household membership and NPC+ promotion atomically. Historical wording differs from the canonical oath but is semantically equivalent ("decide to stay and become a resident/member", "swear to protect/be loyal to my family and the keeper"); Brenna's wording says "protect the hearthstone and Nicco" and is accepted as an equivalent core under the generic semantic matcher or recorded as a generic matcher gap, never as a script change.
- Identity: the engine owns objective identity. Historical characters that exist in current canon keep their canonical ids (Korvin, Dren, Elara). Characters that do not exist in canon (Brenna, Maren, Gerome, minor vendors) are campaign-created and must exist exactly once each.
- Sealed canon material is not part of this oracle and must not appear in any replay artefact.

## A. Nicco (player)

| ID | Fact | Class | Expected | Evidence (turns) | Engine representation |
|---|---|---|---|---|---|
| A-01 | Nicco is the player character, never NPC+ | MUST_MATCH | player tier; absent from `premium_characters` | all | `player_characters`, `premium_characters` |
| A-02 | Nicco funds | MUST_MATCH (range) | 411 gold primary; 408 accepted (see T-02) | 1, 7, 49, 209, 235, 247, 259, 351, 410 | `funds[nicco].gold` |
| A-03 | Nicco location at end | MUST_MATCH | inside Heartstone (descendant of the Heartstone location), moving upstairs from the ground floor common room toward his bedroom | 421 | `runtime.scene.player_location` is `heartstone_*` |
| A-04 | Nicco is the household owner/Keeper | MUST_MATCH | household `Heartstone` role owner | opening | `households[0].members[nicco].role=owner` |
| A-05 | Nicco carries the scalpel (small surgical blade, left pocket) | SHOULD_MATCH | tool item carried by Nicco | 1295, 1301 | item category tool, owner/carrier nicco |
| A-06 | Nicco has two soft prop daggers (rubber, squeaky) at some point; one given to Maren | SHOULD_MATCH | at least one prop dagger carried by Maren; at most one by Nicco | 1271, 2199-2235 | items category miscellaneous/weapon, soft |
| A-07 | Nicco still carries the Deed and Charter | MUST_MATCH | both `carried` by Nicco, owner Nicco | opening (not historical) | items |
| A-08 | Nicco health | NARRATIVE_ONLY | very low mana, recently near collapse then recovered with the purple bread; no persistent injury | 2403, 2427 | none |
| A-09 | Nicco's golden healing magic is a secret known to Brenna and Maren in practice | SHOULD_MATCH | Brenna and Maren know Nicco heals with golden magic (witnessed); not world-public | 22-30, 391-396 | knowledge/facts (best effort) |
| A-10 | Dark outfit worn when leaving for the market | NARRATIVE_ONLY | clothing worn | 270 | optional |

## B. Brenna

| ID | Fact | Class | Expected | Evidence | Engine representation |
|---|---|---|---|---|---|
| B-01 | Exactly one campaign character named Brenna, never duplicated | MUST_MATCH | origin created; sex female; human | 4-7 | `characters[]` unique by name |
| B-02 | Bought from Korvin for 5 gold at the slave market | MUST_MATCH | person sale Korvin to Nicco, payment 5 gold | 6-7 | `transactions` sale, 1 entry with 5 gold; Korvin payee |
| B-03 | Legal status at end | SHOULD_MATCH (AMBIGUOUS fallback) | free (Nicco offered freedom and "a free woman doesn't owe anything", turn 80, 1217, 1445); fallback: enslaved with holder nicco if no manumission was recorded | 80, 1217, 1445 | `legal_statuses` |
| B-04 | Household member and NPC+ promoted | MUST_MATCH | active member of `Heartstone`; premium record exists; `activeNpcPlus` | 81-82 | `households`, `premium_characters` |
| B-05 | Appearance: northern woman, very tall (about 190 cm), very muscular, dark hair, blue-grey eyes (historical prose varies), age 32 | SHOULD_MATCH | height/muscular build recorded in profile appearance if stated; age 32 | 4-7 | profile |
| B-06 | Location at end | MUST_MATCH | Heartstone interior, on the stairs/going upstairs with Nicco | 420-421 | `current_location` under Heartstone |
| B-07 | Health | SHOULD_MATCH | recovered (no fever/infection condition active); fever cleared by magic and herbs | 22-71 | `current.conditions` empty of fever |
| B-08 | Carries or holds the halberd | SHOULD_MATCH | halberd item, carried by Brenna | 1223-1259, 258-261 | item weapon |
| B-09 | Wears sandals bought from Dasha (size 47), pink shirt, canvas cloak | SHOULD_MATCH | sandals item owned by Brenna (or Nicco, carried by Brenna); pink shirt on Brenna | 1193 | items |
| B-10 | Romantic relationship with Nicco (adult, consensual) | NARRATIVE_ONLY | high trust, affection | 330-343, 2000+ | relationship summary only |
| B-11 | Barefoot inside the tower (3rd rule) | NARRATIVE_ONLY | rule observed, one slip noted | 352 | rule text only |

## C. Maren

| ID | Fact | Class | Expected | Evidence | Engine representation |
|---|---|---|---|---|---|
| C-01 | Exactly one campaign character named Maren, never duplicated; named by Nicco (name is player-given) | MUST_MATCH | origin created; female; human; age 15 (stated 15 to 16) | 262-263, 1811 | `characters[]` |
| C-02 | Acquired from an anonymous private seller (the whittler) for 3 gold | MUST_MATCH | transaction sale from counterparty, payment 3 gold from nicco | 258-259 | `transactions` sale |
| C-03 | Legal status | SHOULD_MATCH (AMBIGUOUS) | free after the "choice" speech (turn 352, "you are a free person") | 352 | `legal_statuses` free; fallback enslaved/nicco |
| C-04 | Household member and NPC+ | MUST_MATCH | active member; premium record; second rite | 356-357 | household/premium |
| C-05 | Red curly hair, grey-green eyes, tall (about Nicco's height), thin, calloused, scars, dock-runner background; chest scar removed by Nicco's magic at turns 391-396 | SHOULD_MATCH | appearance recorded (red hair, grey-green eyes); chest scar absent | 391-396 | profile; no scar condition |
| C-06 | Possesses forty gold given by Nicco in two 20-gold throws | SHOULD_MATCH | Maren funds 40 (or two pouches as items) | 410 | `funds[maren]=40` or items; NOT_YET_MODELLED fallback accepted if the engine has no NPC-to-NPC gold handoff |
| C-07 | Holds one prop (rubber) dagger | SHOULD_MATCH | item carried by Maren | 2205 | item |
| C-08 | Health | SHOULD_MATCH | recovered from fever/malnutrition; no active fever; no scar | 344-350, 394 | conditions |
| C-09 | Location at end | MUST_MATCH | Heartstone courtyard (training near the old mannequin) | 420 | `current_location` Heartstone CY (or interior Heartstone if not movable) |
| C-10 | Maren is a minor (15) and is never sexualized | MUST_MATCH (safety) | no sexual condition/relationship recorded for Maren; image generation adult-only gating not triggered | all | none |
| C-11 | Dren sold her half dead; she hates him; joins the raid | SHOULD_MATCH | relationship/goal toward Dren negative/hostile, plan to raid | 356 | goal/knowledge |

## D. Gerome (stone construct)

| ID | Fact | Class | Expected | Evidence | Engine representation |
|---|---|---|---|---|---|
| D-01 | Gerome exists exactly once as a campaign entity (not duplicated), at Heartstone | MUST_MATCH | character (construct) located in Heartstone interior | 11-16, 18, 23 | `characters[]` unique |
| D-02 | Activated by the ring and Nicco's golden mana; acknowledges Nicco as holder | MUST_MATCH | active (not dormant) | 12-16 | status/condition active |
| D-03 | Role: servant (cooks, cleans, brings water, guards the tower); named "Gerome" by Nicco | SHOULD_MATCH | role servant | 18-24, 270 | profile/role |
| D-04 | Not a household member (no rite performed; historical status lines never list him) | SHOULD_MATCH | not a member, not NPC+ | 82, status lines | household |
| D-05 | Does not speak freely (limited stone speech, "you don't talk, you serve me") | SHOULD_MATCH | non-verbal or minimal speech | 15-16 | profile |
| D-06 | Capabilities beyond servant tasks | NOT_YET_MODELLED | unexplored | | |
| D-07 | Iron ring on Nicco's finger | SHOULD_MATCH | ring item carried/worn by Nicco | 12, 72 | item |

## E. Household

| ID | Fact | Class | Expected | Evidence | Engine representation |
|---|---|---|---|---|---|
| E-01 | Household `Heartstone` has exactly the three charter rules, no extra rules | MUST_MATCH | 3 active rules, canonical text | 84, 355 | `households[0].rules` (jokes about extra rules are not mutations) |
| E-02 | Members: Nicco (owner), Brenna, Maren; active count 3 | MUST_MATCH | exactly these three | 81-82, 356-357 | `members` status member |
| E-03 | Gerome not counted | SHOULD_MATCH | see D-04 | | |
| E-04 | No other member (Korvin, Dasha, Dren never join) | MUST_MATCH | none | | |
| E-05 | NPC+ promoted exactly: Brenna, Maren | MUST_MATCH | `premium_characters` ids = {Brenna, Maren} | | |

## F. Other characters

| ID | Fact | Class | Expected | Evidence | Engine representation |
|---|---|---|---|---|---|
| F-01 | Korvin: canonical character `korvin`, at the slave market; not duplicated; no campaign duplicate named Korvin (or "Dorric", or any alias) | MUST_MATCH | single canonical entity | 1-7, 247-252 | canon id korvin; no created duplicate |
| F-02 | Dren (canon id `dren`): referenced; never met in person | MUST_MATCH | no created duplicate; knowledge that he runs the River Nine Docks warehouse (blue tarp roof) | 247-258, 356 | no duplicate |
| F-03 | Elara: refers to the canonical Mistress Elara; historical "healer who rebuilds thin stock" is superseded by canon | CURRENT_CANON_SUPERSEDED | no created second Elara | 250-252 | no duplicate |
| F-04 | Dasha (bazaar stall woman) and Matto (bread/food seller) | SHOULD_MATCH | if introduced as persistent characters they exist once; else narrative-only | 50-63 | created or none |
| F-05 | Unnamed merchants: smith, whittler, temple surgeon (woman, grey eyes), acolyte | NARRATIVE_ONLY | no requirement to persist | 209, 235, 257 | optional |
| F-06 | Fox beastfolk girl sold to Elara | NOT_YET_MODELLED | narrative thread | 250-252 | none |
| F-07 | No character appears twice under two names; no created character carries a canonical NPC's identity | MUST_MATCH | zero duplicates across canon and created | all | `characters[]` vs canon |

## G. Items, inventory and ownership

Owner and carrier are separate facts. Classification below uses `owner` (who owns) and `position` (who carries).

| ID | Item | Class | Expected |
|---|---|---|---|
| G-01 | Deed of Ownership and Household Charter | MUST_MATCH | carried by Nicco |
| G-02 | Halberd (15 gold) | SHOULD_MATCH | exists once; owner Nicco or Brenna; carried by Brenna |
| G-03 | Oil (free) and whetstone (1 silver) | NARRATIVE_ONLY | optional consumable/tool |
| G-04 | Sandals bought from Dasha for Brenna | SHOULD_MATCH | exists once; worn/carried by Brenna |
| G-05 | Pink shirts (2), shorts, canvas sack, herbs, linen, kitchenware, rope, broom, boots, soap, girl's clothes from the bazaar bundle (1 gold) | SHOULD_MATCH | at least the two pink shirts and the clothes exist as clothing; worn by Brenna/Maren (Maren wears a pink shirt at the end) |
| G-06 | Scalpel | SHOULD_MATCH | tool carried by Nicco |
| G-07 | Prop (rubber) daggers, at least 2 | SHOULD_MATCH | one with Maren, the other(s) with Nicco |
| G-08 | Herb sack and prepared herbs (temple purchase, 20 gold) | SHOULD_MATCH | material/consumable items in Nicco's or Brenna's keeping |
| G-09 | Iron ring | SHOULD_MATCH | item carried by Nicco |
| G-10 | "Purple bread" emergency mana item | NARRATIVE_ONLY | consumed; must not remain as an item (if created, absent at end) |
| G-11 | Food stocks (4 sacks bought from Matto's for 2 gold) delivered to Heartstone | NOT_YET_MODELLED | pantry stock not modelled |
| G-12 | Nicco's two coin pouches ("pouch in L1") | NARRATIVE_ONLY | funds record covers it |
| G-13 | No item duplicated by name+owner+position; no item held by two people | MUST_MATCH | global invariant |

## H. Money

| ID | Fact | Class | Expected | Evidence |
|---|---|---|---|---|
| H-01 | Starting purse | MUST_MATCH | 500 gold | status turn 1 |
| H-02 | Brenna purchase | MUST_MATCH | -5 gold, paid to Korvin | 7 |
| H-03 | Bazaar bundle | SHOULD_MATCH | -1 gold | 49 |
| H-04 | Halberd | SHOULD_MATCH | -15 gold (whetstone one silver ignored) | 209 |
| H-05 | Temple herbs/lessons | SHOULD_MATCH | -20 gold | 235 |
| H-06 | Information from Korvin | SHOULD_MATCH | -5 gold | 247 |
| H-07 | Maren purchase | MUST_MATCH | -3 gold | 259 |
| H-08 | Gift to Maren | SHOULD_MATCH | -40 gold from Nicco | 410 |
| H-09 | Food merchant | NOT_YET_MODELLED | "throws 2 gold" at turn 318; delivery of four sacks; the status line does not change (inside the bazaar bundle?) so treat as AMBIGUOUS +-2 gold | 318 |
| H-10 | Nicco's final funds | MUST_MATCH (range) | 411; accepted band 405 to 411 (T-02) | |
| H-11 | No negative funds; no gold created from nothing | MUST_MATCH | invariant | |

## I. Heartstone and property

| ID | Fact | Class | Expected |
|---|---|---|---|
| I-01 | Nicco owns and holds Heartstone (opening) | MUST_MATCH | unchanged |
| I-02 | Heartstone is not sentient; historical claims of sentience are Nicco's beliefs | CURRENT_CANON_SUPERSEDED | no sentience state; narration may report the stone as warm for recognized people |
| I-03 | Warm stone for members, cold for others (Brenna's bare foot warm at turn 81, Maren's "still cold" before the rite) | SHOULD_MATCH | derived recognition warmth; no persisted flag |
| I-04 | Rooms: Brenna and Nicco share the master bedroom (historical L3), Maren sleeps in the observation room (F1) | NARRATIVE_ONLY | location only; floors map to F-levels |
| I-05 | Studio on a higher floor holds Nicco's desk (purple bread) | NOT_YET_MODELLED | none |
| I-06 | Secluded courtyard with an old mannequin | SHOULD_MATCH | courtyard (CY) exists in canon with training area |
| I-07 | Property/rooms assignment system | NOT_YET_MODELLED | roadmap item 7 |

## J. Locations

Start `calderan_slave_market` (West district). Visits in order: slave market, Heartstone Tower (ground floor, observation room, service alcove), West bazaar stall (Dasha), Matto's food stall, smithy, temple, Korvin's podium again, tannery lane and private lot, back to Heartstone. Final: Heartstone interior (A-03). The replay's recorded `player_location` at the checkpoints turns 8, 261 and 421 must be inside Heartstone. Historical street names beyond canon ("West Gate", "Cracked Flagon", "Merovar", "Ashford") are NARRATIVE_ONLY.

## K. Health

K-01 Brenna recovered (B-07), K-02 Maren recovered (C-08), K-03 Nicco depleted mana only (A-08), K-04 Maren's scar removed (C-05), K-05 Brenna's wrists show iron grooves from shackles (NARRATIVE_ONLY). Medicine, fever, infection, cancer on the dying woman are NOT_YET_MODELLED beyond free-text conditions. The dying woman and the man in the private lot died or were left; they are NARRATIVE_ONLY and must not become campaign characters in the household.

## L. Magic

Nicco's golden magic: heals, activates Gerome, removes scars. Mana is a fraction tracked in prose only. NOT_YET_MODELLED. No mana stat should be invented. NARRATIVE_ONLY for fractions (one third, one fifth, one tenth).

## M. Knowledge and identity

| ID | Fact | Class | Expected |
|---|---|---|---|
| M-01 | Nicco does not know Korvin's name until the sign is read; the canonical man at the market is introduced under his real name when he introduces himself or his sign is read | MUST_MATCH | identity fact `korvin` canonical; never an invented alias; the player-facing label may remain an unfamiliar-person label until the name is established |
| M-02 | Brenna's name and background (Ashford hauler, 32, pit fighter) learned from Korvin and from her | SHOULD_MATCH | name known to Nicco |
| M-03 | Maren's name is given by Nicco (she was unnamed at purchase) | SHOULD_MATCH | name established by the player; single campaign record |
| M-04 | Nicco's big secrets (other-world origin, golden magic) stay Nicco's; Brenna knows the magic works, not its origin | SHOULD_MATCH | no leak of Nicco's origin to Korvin |
| M-05 | Rule 1 "no secrets" does not force disclosure | MUST_MATCH | no compulsion |
| M-06 | Sealed canon secrets are never revealed to the player or in narration | MUST_MATCH | spoiler safety |
| M-07 | Canon identity masking: unfamiliar canonical NPCs keep a neutral label to the player until introduced; a truthful self-introduction in the fiction establishes the canonical name on the same id | MUST_MATCH | no duplicate NPC; no alias invented |

## N. Relationships (narrative)

Nicco and Brenna: committed romantic partners (NARRATIVE_ONLY; relationship summary may show high trust). Nicco and Maren: protective guardian/found-family (NARRATIVE_ONLY). Brenna and Maren: older/younger sister dynamic. Gerome obeys Nicco. Trust values, if modelled, should trend positive; no negative trust toward Nicco from household members (SHOULD_MATCH). Maren is never romantic or sexual.

## O. Promises

Nicco promised: no debt for the healing; to save the girls; to raid Dren's River Nine operation in 8 days; to buy Maren underwear and real daggers in the afternoon; "no more Brennas". NOT_YET_MODELLED as commitments except as goals/facts (SHOULD_MATCH if the engine records a goal; otherwise NARRATIVE_ONLY).

## P. Active plans

1. Raid Dren's River Nine Docks warehouse in about 8 days (from turn 247 and 356). 2. Buy Maren underwear/bra and real daggers that afternoon. 3. Maren trains in the courtyard. 4. Learn more about Maren's scar (possible cursed dagger). 5. Visit the temple surgeon in a week. All NOT_YET_MODELLED except as free-text goals.

## Q. Final scene and time

Final scene: Heartstone ground floor; Maren leaves for the courtyard to train and explore; Nicco and Brenna climb the stairs. In-world time: three days after arrival, day time (Maren: "Two days"; arrival day 0 market late morning). Expected world time: MUST_MATCH weak: strictly later than the opening minute (600) and between day 3 and day 5 (world_minute 600+3*1440 to 600+5*1440); exact time AMBIGUOUS (the narrator keeps HH:MM clock by decision of 2026-10-10).

## R. Current-canon reinterpretations

1. Heartstone sentient (historical) becomes non-sentient. 2. L1..L4 floors become LR/U1/F1..F6; "observation room on L2" is F1. 3. Household rites map to the canonical rite (see section 0). 4. Elara healer becomes Mistress Elara (slaver/escort owner). 5. Korvin is the canonical short compact late-fifties slaver, not an old stooped man; narration may differ (NARRATIVE_ONLY). 6. Dren is the canonical criminal, referred to as "Drel" once by historical Korvin (same person). 7. Brenna's and Maren's legal status follow the person-transaction model (sale then freedom offer).

## S. Facts not modelled

Mana, fever physiology, pharmacology lessons (willow/salicin, prostaglandins), food stock, sizes (boot 47), bells and clock, hair braiding, hugs, fox girl, Dren raid logistics, the dying woman's cancer, bed arrangement.

## T. Ambiguities and tolerance bands

- T-01 Brenna/Maren legal status: free (preferred) or enslaved-by-Nicco if the engine never recorded manumission; either is PASS, `free` is the preferred value.
- T-02 Nicco's funds: the arithmetic of player actions gives 411. The historical narrator status says 408 because it counted the 3 coins Nicco merely set on the table for Maren (turn 351) as spent. Accepted band: 405 to 411. Values outside the band are MISMATCH (the engine created or destroyed money).
- T-03 Maren's 40 gold: either `funds[maren]=40` or two items, or NOT_MODELLED.
- T-04 Gerome household membership: member only if a valid rite happened (none did); not-member is expected.
- T-05 Mid-campaign money checkpoints (derived from the status lines, tolerance +-3): turn 7 495; turn 49 494; turn 209 479; turn 235 459; turn 247 454; turn 259 451.
- T-06 Household member count checkpoints: 1 member besides Nicco after turn 81 (Brenna), 2 after turn 356.

## Checkpoints for the comparator (MUST_MATCH count: 32)

A-01, A-02, A-03, A-04, A-07, B-01, B-02, B-04, B-06, C-01, C-02, C-04, C-09, C-10, D-01, D-02, E-01, E-02, E-04, E-05, F-01, F-02, F-07, G-13, H-01, H-10, H-11, M-01, M-06, M-07, I-01, M-05.

## ORACLE_CORRECTION_LOG

(none)
