# Calderan NPC authoring pass 3: civic, guild and district anchors

2026-09-30. Authored data only: no engine, prompt, retrieval-code, quest or runtime-goal change. Nothing is committed or pushed.

## Scope and gates

| | Before | After |
|---|---|---|
| Source hash (`src/`+`data/`) | 8f6c46bda2df… | 9fc5e519a053… |
| Entities / chunks / locations | 147 / 25 / 74 | 159 / 25 / 74 (no new places) |
| Typecheck | PASS | PASS |
| Deterministic tests | 884/884 | 889/889 (5 new in `calderan-npc-pass-3.test.ts`) |
| Playthrough | 25/25 | 25/25 |
| Authored-data audit | lexical top-1 32/34, turn 25/25 | unchanged (`calderan-data-npc-pass-three.json`) |

The same contract and density as Pass 2 apply:

- Observable voice and signature behaviour are in `content` and `appearance`.
- Worldview, blind spots and moral limits are in `traits`, `purpose` and `morality`.
- Knowledge limits and undefined background are in narrator-only `private_notes`.

Every scene with the new NPCs builds within limits; the Bastion, with Helbrecht and Severan, is the largest at 9.8k context characters. No narrator prompt contains secret text.

## NPCs added (12)

| ID | Name | Role | Base / work | Affiliations |
|---|---|---|---|---|
| `oren_quarn` | Chief Magistrate Oren Quarn | Chief Magistrate of Calderan | High Courts | `city_magistracy` (the concept that already exists; no faction invented) |
| `sister_veyra` | Sister Veyra | Senior medical sister and ward supervisor | Saint Caldus House | Church |
| `severan_krauss` | Inquisitor Severan (Krauss) | Senior field Inquisitor under Helbrecht | Bastion of Vigilance | Inquisition, Church |
| `garran_holt` | Commander Garran Holt | Commander of the City Guard | none: no citywide Guard HQ exists, and none was invented | City Guard |
| `tavian_merrow` | Tavian Merrow | Merchants Guild Council representative | House of Scales | Merchants Guild, Ducal Council |
| `brunna_keld` | Brunna Keld | Artisans Guild Council representative; dwarf master metalworker | House of Making | Artisans Guild, Ducal Council |
| `odelia_crane` | Magister Odelia Crane | Learned Arts Guild Council representative; scholar and alchemist | The Collegium | Learned Arts Guild, Ducal Council |
| `matthias_eld` | Registrar Matthias Eld | Senior Mage Registry registrar | The Collegium (the Registry stays a feature) | Learned Arts Guild |
| `halden_cross` | Sergeant Halden Cross | Guard sergeant, Imperial Gate inspections | Imperial Gate | City Guard |
| `marta_pell` | Marta Pell | Innkeeper of The Wayfarer's Rest | Wayfarer's Rest | — |
| `rufus_tern` | Rufus Tern | Stablemaster and transport contractor | The Long Yard (no stable entity) | — |
| `lysandra_vell` | Professor Lysandra Vell | Senior Spire Academy instructor | Spire Academy | — (the Academy is canonically a separate institution) |

- **IDs.** Personal-name IDs are used. `sister_veyra` follows the `sister_mereth` convention because no surname was supplied. Titles such as "Magistrate Quarn" and "Inquisitor Severan" are aliases, so the formerly reserved `magistrate_quarn` and `inquisitor_severan` IDs stay unused.
- **No home locations.** None was set, and no residence, Guard HQ, stable, classroom or Registry entity was created.

## Council representation

The Ducal Council keeps exactly nine standing seats, which the test derives from `ducal_council_of_calderan` affiliations: Uther, Cassian, Vaelen, Sybilla, Vorn, Corvinus, and now Tavian Merrow, Brunna Keld and Odelia Crane in the three guild seats.

- **Where the representatives are named:** the Council record and each guild's record now name the current representative.
- **Non-permanent attendees:** Quarn, Holt and Helbrecht have no Council affiliation; Quarn's and Holt's content state they can be summoned.
- **Titles:** no Guildmaster title exists anywhere in public canon. Tavian's private notes record that no guild office is established.

## Relationships (only the required edges)

- Severan → Helbrecht is `superior`, and Helbrecht → Severan is `subordinate`: professional respect, explicitly no friendship.
- Holt → Doran is `subordinate`, and Doran → Holt is `superior`. Doran is "somewhat more idealistic than Holt"; this is a minimal edit to Doran's record.
- Everyone else in this pass has no edges. Council membership creates no social ties, and Veyra and Mereth are explicitly unconnected.

## Knowledge boundaries

- **Light secret:** still known only to Cassian and Helbrecht; none of the 12 was added.
- **Null Dust:** Severan is added as an operational knower (`known_by: [helbrecht, severan_krauss]`).
- **Mutilating Ritual:** stays with Helbrecht only; Severan's private notes say he does not know its method.
- **Private-notes boundaries:** Quarn, Veyra, Holt, Odelia, Matthias and Lysandra each have one stating they lack the restricted secrets.
- **Checks:** no secret phrasing appears in their public text, and player search never surfaces the restricted records.

## Canon updated to match (minimal)

The previous "unnamed" statements are now superseded:

- `city_guard`: "the overall commander … undefined" now reads as the current Commander, Garran Holt.
- `city_magistracy`: "No specific officials" now names Oren Quarn as the senior civic judicial figure.
- `high_courts_of_calderan`: now names Quarn as working there; jurisdiction, procedure, other judges and the national judicial hierarchy stay undefined.
- `ducal_council_of_calderan`: names the High Archon and the three guild representatives.
- The three guild records each name their representative.
- `mage_registration` names Matthias as senior registrar and adds that Registry staffing is not established.
- `imperial_gate` names Halden among its inspecting sergeants.
- Faction member lists now include the new members.

## District coverage

| District | New NPCs |
|---|---|
| Center | Quarn (High Courts). Holt has no base. |
| North | Veyra, Severan, Odelia, Matthias, Lysandra |
| South | Halden, Marta, Rufus |
| East | Tavian, Brunna (guild headquarters) |

## Character differentiation

Each pair from §21 was compared on shared descriptors and signature behaviour:

- **Quarn / Vaelen:** law versus procedure. Quarn asks "Under which authority?" and defends consistency; Vaelen loves ordered documents. Distinct.
- **Helbrecht / Severan:** they share the most vocabulary (severe, doctrine, can authorize brutality), as the brief requires, but have opposite methods. Helbrecht is field instinct and a silent stare; Severan is records and contradictions and grows calmer as he gets surer. Distinct in voice and method.
- **Holt / Doran:** a real contrast. Holt tolerates low-level compromise for stability; Doran is intolerant of corruption.
- **Tavian / Corvinus:** prices and confidence versus systems and sustainability. Distinct.
- **Brunna / Dunrig:** guild politics and "Who actually has to make it?" versus clan memory. Distinct.
- **Odelia / Cassian:** evidence and expertise versus doctrine stated as fact. Distinct.
- **Veyra / Aven / Mereth:** they share practical compassion. Veyra is triage medicine and keeps working while speaking; Aven is pastoral charity; Mereth is institutional child care. Distinct.
- **Matthias / Pellan:** **the closest pair**, both nervous and procedural clerks, as the brief anticipated. They are separated by stakes and reaction: Matthias fears the Inquisition and double-checks when magic is involved; Pellan faints at shocks. They are distinct in portrayal, but a narrator could blur them if both are written only as "anxious clerks".
- **Halden / Holt:** a paperwork-fit question versus a jurisdiction question. Distinct.
- **Marta / Jessa:** they share a hard boundary against violence toward staff or guests (supplied for both), but Marta is loud and warm and remembers drinks and debts, while Jessa is low-voiced and notices hands first. Minor overlap, no collision.
- **Rufus / South:** animals and transport. Distinct.
- **Lysandra / Odelia:** teaching by harder questions versus demanding observations. Distinct.

## Tests

`calderan-npc-pass-3.test.ts` covers:

- all IDs, exact affiliations and supplied workplaces, with no homes;
- no new locations of any kind, and the Magistracy remains a concept with no faction;
- the Council at exactly nine derived seats, with the named representatives in the guild seats, Quarn, Holt and Helbrecht unseated, and no Guildmaster titles;
- Severan and Helbrecht, and Holt and Doran, reciprocal edges, with no other edges;
- Severan distinct from Kaelen; Brunna not an Iron Hands member;
- Veyra at Saint Caldus House and not linked to Mereth;
- no new Light-secret knowers; Severan on Null Dust only; no leaks;
- signature lines, and undefined family, background, staffing and curriculum.

Updated tests:

- Exact inventories in `authored-data`, `authoring`, `geography`, `west-canon`, `west-everyday-canon`, `west-npc-canon`, `world-canon`, `retrieval`, `lexical-search`, `semantic-search` and `opening-state` (11 new placements).
- `west-npc-canon`: the reserved-name guard now covers the unused title IDs, the retired "Inquisitor Kaelen" and Lord Malakor Vane.
- `calderan-npc-pass-2`: the "no Severan anywhere" check becomes "Severan is distinct from Kaelen", and Null Dust's knower list includes Severan.

## Intentionally undefined

- **People:** the families of Quarn, Veyra and Holt; Severan's family and life before the Inquisition; Holt's headquarters.
- **Institutions:** guild election, appointment and term rules; Council voting; the national judicial hierarchy; the Courts' jurisdiction and procedure; Mage Registry staffing; Academy curriculum beyond its broad fields.
- **Named others:** caravans, mercenary companies and clients of South businesses; whether Matthias or Lysandra is a mage (unstated, not denied).

## Contradictions, resolutions and findings

1. **Stale "undefined" lines.** The Guard's commander, the Magistracy's officials and the High Courts' judges were stated as undefined; each was updated minimally to name the new figure.
2. **Guard HQ.** None exists and Stonewatch only hosts "Guard facilities", so Holt has no base rather than an invented HQ.
3. **Retrieval side effects, fixed in data:**
   - Lysandra's and Matthias's "not known to be a mage" and a phrase of Halden's ("compare the answer") made them outrank `light_and_shadow` for the Light-mage query. Removing and rewording those phrases, none of them supplied wording, restored the expected result.
   - "Who represents the Merchants Guild?", "Who runs the Mage Registry?" and "Who inspects papers at the Imperial Gate?" rank the institution first. Those institution records now name their person, so the fully fetched first record answers the question.
4. **Engine limitations, recorded.** The same as earlier passes: restricted passages take retrieval pool slots, and `known_by` on restricted records does not yet reach the narrator as usable knowledge. No engine change was made.

CALDERAN NPC AUTHORING PASS 3 COMPLETE
