# Calderan four-district and institutional authoring pass 1

2026-09-30. Authored data only: no engine, prompt, retrieval or gameplay change. West was not rewritten. Nothing is committed or pushed.

**Brief coverage.** The brief arrived cut off partway through §75b ("AUTHORING SCOPE — LOCATIONS … Recommended East: the_crucible, the_merchants_mile"). Everything through §75a was applied as written. Where the missing tail may have specified details, the defaults used are listed in "Assumptions" below. This report's filename was also chosen because the brief's report name was not received.

## Baseline and gates

| | Before | After |
|---|---|---|
| Source hash (`src/`+`data/`) | 67e7cfac5559… | 86fb5917f549… |
| Entities / chunks | 92 / 15 | 139 / 24 |
| Typecheck | PASS | PASS |
| Deterministic tests | 872/872 | 877/877 (5 new in `calderan-four-district-canon.test.ts`) |
| Playthrough | 25/25 | 25/25 |

Every summary, content field and feature is within the NarrativeContext character limits. All 23 new locations build a primary scene successfully (tested). `inspect:context` output is compact: The Crucible is 3.1k characters; the Ducal Citadel, with the Duke present, is 4.0k.

## What was authored

- **Districts rewritten:** East, North, South, Center.
  - East has two public chunks: `industry_and_labor` and `crime_and_security`.
  - North has one public chunk: `medical_regulation`.
- **Locations (23 anchors):**
  - East: The Crucible, The Merchants' Mile, The Smelter Pit, House of Scales, House of Making.
  - North: Cathedral of the Bladed Sun, Saint Caldus House, Pyres of the Fallen, The Collegium, Spire Academy, Bastion of Vigilance.
  - South: Imperial Gate, Stonewatch Garrison, Calderan South Prison (the South Gaol), The Long Yard, The Wayfarer's Rest.
  - Center: Ducal Citadel, Calderan Civil Registry, Ducal Archive, Office of Holdings and Title, High Courts of Calderan, Gilded Row, Fountain Court.
- **Features rather than entities:**
  - the Masterworks, the Gold Cloister and the Mage Registry;
  - the Crucible's specialist streets (Clothier Street, Anvil Alley, Glasswork Row);
  - Center's four inner-wall gates and Calderan's four cardinal gates;
  - the Imperial Road, as a feature of the Imperial Gate (see decisions below).
- **Factions revised:**
  - Church, renamed the Church of the Sun Emperor; the ID `church` is kept. Adds public `hierarchy` and `local_sites_and_charity` chunks.
  - Inquisition, with a public `jurisdiction` chunk.
  - Merchants, Artisans and Learned Arts Guilds; City Guard.
- **Factions new:** House Vael, Melakor, Dravendark and Morvath, each with the brief's directed relations in both directions.
- **Concepts new:** Ducal Council of Calderan (9 seats), Mage Registration, Null Dust, the Mutilating Ritual (fully restricted) and Calderan Entry Writs.
- **World lore:**
  - New: Doctrine of the Church of the Sun Emperor, with public `afterlife_and_funerary` and `slavery` chunks.
  - Revised: West Governance, Light and Shadow, Calderan City Structure and the `calderan` city record.
- **Characters new (14):**
  - The Sun Emperor.
  - Duke Uther Calderan, based at the Ducal Citadel.
  - House Vael: Vaelen Vael, Chancellor of the Ducal Seal; Seren Vael; Elspeth Vael.
  - House Melakor: Sybilla Melakor, matriarch; Azael Melakor; Gideon Melakor.
  - House Dravendark: Vorn Dravendark, patriarch; Boran Dravendark; Kaelen Dravendark.
  - House Morvath: Corvinus Morvath, patriarch; Iseult Morvath; Maelor Morvath.
  - Age, appearance, personality, species, purpose and morality are explicit null throughout.
  - Sex is set only where a title or kin term states it: Duke, patriarch, matriarch, brother, sister, daughter. For Azael, Gideon, Seren, Elspeth and Maelor it is null; no names were used to guess.
  - Nobles have no base location, so none appears in scenes by default.

## Conflicts with existing canon, resolved

1. **`west_governance`:** "Royal Family", "the Crown", and King/Queen/Princes as ordinary royal concepts contradicted the Sun Emperor.
   - Now: the Sun Emperor is sovereign, and "the Crown" means his sovereign authority.
   - No royal family, succession law or heir is established.
   - Calderan's council is the fixed nine-seat form; other cities' councils remain undefined.
2. **`open_hand_chapel`:** "without requiring devotion to one specific deity" and "Church doctrine is not established here" contradicted the single-Church, no-pantheon canon. It is now a parish chapel of the Church that "welcomes people without demanding proof of devotion".
3. **`calderan_center`:** "local guild-branch headquarters" contradicted the HQ placements. It now says representative and liaison offices near the Citadel, with headquarters in East and North.
4. **`calderan_south`:** it listed warehouses as prominent. Now South is transport and logistics, not major warehousing, which remains West's.
5. **`calderan`:** "the relationship between the capital's civic administration and the Crown is not elaborated". Replaced with the Sun Emperor, Duke Uther, the Council, the High Archon and entry by writ.
6. **Inquisition:** "legal powers remain undefined". Replaced by the brief's jurisdiction; trial procedure and timelines stay undefined. The earlier public interest in Light/Shadow users is preserved.
7. **`light_and_shadow`:** the public doctrine and learned-circle framing were added, and Shadow is now absolute heresy. Its "not moral alignments" canon is kept.

## NPC alignment

| NPC | Inspected | Changed? | Reason | Files affected |
|---|---|---|---|---|
| Brother Aven | yes | yes | Rank is Zealot Priest; sincere believer; moral tension over duty to the weak. Personality unchanged. | brother_aven.yaml |
| Open Hand Chapel (his workplace) | yes | yes | Pantheon conflict (see 2 above) | open_hand_chapel.yaml |
| Sister Mereth | yes | no | Not forced into a faction; "Sister" and ties to North charity stay as authored | — |
| Bartolomhew | yes | yes | Morality now grounds his detachment partly in absorbed doctrine (ordained hierarchy, reduced standing, person as function). He stays warm and paternal toward free people and is no fanatic. | bartolomhew.yaml |
| Mira Thorne | yes | yes | Public: licensed, with a Learned Arts and Church-compatible supply. Private notes: the larger share of her interesting stock comes through smuggled channels (possibly West smugglers or traffickers; no named supplier). Qualitative, no percentages. She stays chunk-free, as the everyday-NPC contract requires. | mira_thorne.yaml |
| Captain Doran Hale | yes | no | The Guard–Inquisition accord and tension are recorded on `city_guard`, so Doran is not made politically informed | — |
| Pellan | yes | yes | `work_location` is now `calderan_civil_registry`; wording unchanged otherwise | pellan.yaml; authoring guide |
| Seren Vael, Elspeth Vael | yes | created | Previously only reserved names with no record. Now minimal House Vael members with no invented relation. | nobility/*.yaml |
| Mistress Elara, Korvin, Dren, Blackthorn | yes | no | No conflict; no secret knowledge granted | — |
| Hadrik Voss, Livia Marr, Jessa Rook, Bram Kessel, Niles Vanner, Orla Fen | yes | no | Consistent: Livia's fear of cheap East goods fits East textiles; Hadrik the dwarf smith fits East's dwarven crafts | — |
| Nicco | yes | no | A Light mage who does not know the secret; nothing grants it | — |

## Secrets and visibility

- **Light secret.** It lives in a single restricted chunk, `sun_emperor.light_secret` (narrator only, awareness private, `known_by: []`): the Sun Emperor is a real Light mage whose immortality derives from Light magic, and independent Light users are captured, silenced, tortured, mutilated or killed.
- **Mutilating Ritual.** The whole record is restricted, because the brief allows only the public knowledge that "the Inquisition can break a mage". That phrase lives in the public Inquisition record.
- **Tests check that:**
  - no player-visible entity, chunk, alias or feature contains the secret's phrasing;
  - player-audience search for "Light mage", "Sun Emperor immortality Light magic" and "Inquisition break a mage" never returns the restricted records.

## Test changes (exact inventories; no assertion weakened)

- **Inventory updates** for the new records in `authored-data`, `authoring`, `geography`, `west-canon`, `west-everyday-canon`, `west-npc-canon`, `world-canon`, `retrieval`, `lexical-search`, `semantic-search` and `opening-state`:
  - character lists, faction lists and pagination;
  - entity, chunk and document counts;
  - the Crucible ↔ Mile edges;
  - Calderan's `four cardinal gates` feature;
  - the Duke's opening placement.
  - Earlier-pass lists stay exact through an explicit `FOUR_DISTRICT_NPCS` constant.
- **`west-npc-canon`:** the reserved-name guard no longer lists Seren and Elspeth Vael, and still protects Magistrate Quarn, Sister Veyra, Inquisitor Kaelen and Lord Malakor Vane.
- **`world-canon`:** new policies are asserted exactly. The restricted `mutilating_ritual` is a named exception with its exact restricted policy.
- **`authored-data`:** Pellan's `work_location` is now asserted as the Registry.
- **Two assertions rescoped, with reasons:**
  - `scene-participants` de-dup test. It asserted `ids[0] === "nicco"` in a no-profile case that never occurs in production. It now asserts the property it is named for: without the profile Nicco appears, and the remaining results equal the with-profile results.
  - `semantic-search` concept queries. The fixture gives every document the same vector, so fused ranking depended on file order. These queries now assert lexical top-1, and identity-name hybrid checks are unchanged.

## Retrieval findings (engine unchanged)

1. **Restricted chunks take retrieval slots.** Turn retrieval takes a 5-slot pool, then discards secret passages. The two original Light-secret chunks took two slots for "Light mage" queries and pushed the public `light_and_shadow` record out.
   - Mitigation in data: one consolidated secret chunk, plus a `search_context` cue on `light_and_shadow`.
   - Recommended engine follow-up: exclude secret passages before the pool is cut.
2. **Phrasing gaps closed.** Search cues were added for "biggest market", "who rules" and "cremated": alternate wording only, no new lore.
3. **Retrieval trigger.** "Where do the dead get cremated?" is judged as not needing retrieval. With "in Calderan" or the name, the Pyres are found. This is not a data issue.

## Assumptions (for the missing end of the brief)

- **Scope:** only the anchor locations the brief named; no shops, streets, noble residences, other gates or road network.
- **NPC records:** minimal records for the named Duke, Sun Emperor and house members. No High Archon, High Inquisitor, Guard commander or former-slave artisan (the latter reserved per §3).
- **Name overlap:** "Kaelen" is both Kaelen Dravendark and the reserved Inquisitor Kaelen. The two are unrelated, but the overlap should be decided before the Inquisitor is authored.

CALDERAN FOUR-DISTRICT + INSTITUTIONAL AUTHORING PASS 1 COMPLETE

## Completion audit (against the missing end of the brief)

2026-09-30. Audit only: no re-authoring and no engine change. Sections above are unchanged history; this section records the results and supersedes the "Name overlap" assumption.

**Changes made:**
- One retrieval cue ("where goods are manufactured") added to `calderan_east.search_context`.
- The `west-npc-canon` reserved-name guard now reserves `inquisitor_severan` instead of `inquisitor_kaelen`.
- Source hash is now 4a597f731761…. The authored-data snapshot is `calderan-data-four-district-audit.json`.

| Check | Result |
|---|---|
| 1. Location set | PASS. Exactly 23 anchors, each a direct child of its district (East 5, North 6, South 5, Center 7). No shops, streets, noble residences, extra gates or road entities. The 18 non-city locations and `west`'s children are unchanged. |
| 2. NPC scope | PASS. Uther: title, authority and seat only. Vaelen, Sybilla, Corvinus and Vorn: supplied role only. Azael, Gideon, Iseult, Maelor, Boran, Kaelen, Seren and Elspeth are skeletal. No record has appearance, age, species, traits, purpose, morality or private notes. The only relationships are the two supplied sibling pairs (Vorn/Boran, Corvinus/Iseult). Sex is set only from title or kin terms. |
| 3. Undefined canon | PASS. Each item is stated as undefined in canon: the Sun Emperor's residence (`west_governance`); his appearance and history (`sun_emperor`); the immortality mechanism (restricted chunk); army hierarchy (Stonewatch); road network (Imperial Gate); banking law and rates (House Morvath); slavery law (`west_slavery`, doctrine); the souls of the enslaved (doctrine chunk); succession (`west_governance`, Dravendark); saints (church chunk, Saint Caldus); Null Dust duration and radius; the ritual's method. Currency, prices and Church history are simply absent; nothing numeric or historical was invented. |
| 4. Public distinctions | 16/19 exact top-1 on both the turn and player paths. See below. |
| 5. Restricted access | PASS. 0 leaks across 8 probes ("Is the Sun Emperor a Light mage?", immortality, Light-user suppression, "break a mage", "Mutilating Ritual", …) on player search and turn retrieval. Direct player fetches of `sun_emperor.light_secret` and `mutilating_ritual` return `not_visible`. |
| 6. Legacy royal terms | PASS; no correction needed. No King, Queen, Prince or Royal Family remains in data, prompts or authoring docs. The remaining "heir" uses refer to noble houses (Maelor, as supplied) or criminal succession (Blackthorn). "The Crown" appears only as the Sun Emperor's sovereign authority, which `west_governance` defines explicitly. |
| 7. Retrieval issue | Preserved, not fixed. See future engine tasks. |
| 8. Naming | Kaelen Dravendark is kept. "Inquisitor Kaelen" is retired as a future name. **Inquisitor Severan** is reserved, not created; a test asserts `inquisitor_severan` does not exist. The historical Pass 2A report is untouched. |
| 9. Gates | Typecheck PASS; 877/877 tests; 25/25 playthrough. Authored-data audit: 139 entities, 24 chunks. Lexical top-1 is 31/34, unchanged from the last snapshot, and turn benchmark top-1 is 25/25. |

**Public-distinction details (item 4):**
- Clean top-1 on both paths:
  - Crucible vs Main Market Square;
  - Merchants vs Artisans Guild;
  - Church vs Learned Arts Guild;
  - Cathedral vs Bastion vs Collegium;
  - City Guard vs Inquisition (the Inquisition query returns the Inquisition or its own jurisdiction chunk);
  - the Duke's temporal authority;
  - all four noble houses;
  - river warehousing, which resolves to Grey Brook.
- Remaining turn-path misses, both from one engine behaviour: an explicit place name in the query takes the top slot.
  - "East goods manufactured" puts the nation `east` first, then `calderan_east`. The player path is now correct after the cue.
  - "High Archon **of the West**" puts the nation `west` first, then the Ducal Council and `church.hierarchy`. The player path is correct.
  - Aliasing the office onto the Church would misrepresent the record, so no data change was made.
- Lexical suite: "mages guild" now ranks `mage_registration` first and `learned_arts_guild` second, while "legendary rare magic" newly passes. A wording cue did not change the ranking and was reverted rather than padded.

**Future engine tasks (recorded, not done):**
1. Remove player-hidden and secret passages *before* the 5-slot pool is cut. Today restricted hits still take top-k slots and are only filtered afterwards; this was mitigated for the Light secret by consolidating it into one chunk.
2. Office titles containing a place name ("High Archon of the West") should not give the explicit-name tier to the nation.
3. The "is retrieval needed" trigger skips some lore questions that have no named anchor ("Where do the dead get cremated?").

CALDERAN FOUR-DISTRICT AUTHORING PASS 1 AUDIT COMPLETE
