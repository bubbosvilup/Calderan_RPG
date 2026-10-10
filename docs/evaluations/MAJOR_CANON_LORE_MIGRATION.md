# Major Canon Lore Migration: Cosmology / Helion / Aureth / Church / The First Voice

Base: main 3733ce5 plus the Pass B and Pass C work. Scope: authored canon only. No Calendar, Season, Weather, Property or gameplay system was added; no save schema changed.

## 1. Executive verdict
MIGRATED. The superseded cosmology (continent Aureth, golden-dragon Aureth, three dragon children, filial dormancy, anonymous Shadow adversary, red-dragon Beastfolk maker) no longer survives as objective canon. The new cosmology is authored in three separated layers (public, restricted, sealed). 2984 of 2984 tests pass, typecheck and build are clean. Four small engine-adjacent edits were needed: one generic canon loop in Background Grounding (the world now has four great divisions), plus test expectations and one regenerated golden (the continent now renders Helion).

## 2. Pre-migration canon audit
Searched all of `data/`, `src/`, `tests/`, `docs/` (current canon docs; historical evaluation reports left intact), goldens and dev fixtures, by literal and semantic variants. Old canon found:
- Continent named Aureth (`continent`, `continental_structure`, 12 public records with "Aureth" as a place name, search_context strings, golden prompt fixture ancestry).
- `aureth_creation_myth` (public): golden dragon Aureth, three draconic children (green West, red Center, undefined East).
- `aureth_true_identity` (tier 3): Aureth = golden dragon, supreme Light mage, creator, three children asleep after his disappearance.
- `shadow_adversary` (tier 3): anonymous Shadow being, mechanism of disappearance open.
- `world_tree_sleeper`, `oasis_sleeper` (tier 2): green and red dragon children asleep.
- `beastfolk_origin_truth` (tier 3): red dragon of Center created the Beastfolk.
- `sun_emperor.light_secret` (tier 1, holders Cassian, Helbrecht): the Sun Emperor is a real Light mage.
- Church public doctrine (`church_doctrine`, `church`), `world_tree`, `woodsingers`: references to the Aureth myth.
- No explicit years existed anywhere in canon. Existing four-element model: Fire, Water, Earth, Air as common magical elements (`elemental_magic`), not linked to any cosmology.

## 3. Old to new canon map
| Old | Status | New |
|---|---|---|
| Continent "Aureth" | superseded | Helion (modern), Eldaven (ancient, restricted); `continent` id kept |
| Aureth the golden dragon, creator | superseded | Aureth = current incarnation of Light = public Sun Emperor; dragon image only as folk iconography |
| Three dragon children | superseded | The Four: four primordial elemental powers, one per great division, predate Aureth |
| Children slept after father vanished | superseded | Dormancy from cosmic imbalance after Aureth was sealed in Year 491 (gradual, undated) |
| Anonymous Shadow adversary | superseded | The First Voice, current incarnation of Shadow |
| Disappearance mechanism open | resolved at tier 3 | Sealed (not killed) by the First Voice in Year 491; seal mechanism still open |
| Light-mage founder secret | reinterpreted | Narrower restricted account kept for Cassian and Helbrecht (see Appendix C) |
| Red dragon made Beastfolk | removed | Origin unresolved (section 24) |
| West/Center/East only | extended | plus South Continent |
| No chronology | added | Year 0, Year 491, Year 1191 |

## 4. Continent migration
`continent` keeps its stable id and now reads **Helion** (alias "Known Continent"). All 12 public records that used "Aureth" as a place now say Helion (Blackwater, Davenport, Zul-Rath, Calderan, Woodsong Forest, West/Center/East search contexts, Dragon's Teeth, West trade network, humans, elves). Eldaven appears only in `forgotten_era_fragments` (tier 1, no holder) and sealed records.

## 5. Geography
Helion: West, Center, East, South Continent (new `south_continent`, parent `continent`, descriptive name only). Capitals, cities, borders, trade of the first three untouched. Background Grounding and the canon tests now treat the four divisions generically.

## 6. New primordial cosmology
Sealed `primordial_cosmology`: six forces (four elemental, Light, Shadow), formation and sustenance of the world; Light and Shadow complementary, mutually necessary. The four elements are NOT named.

## 7. Light / Shadow reincarnation model
Both incarnate cyclically; present incarnations Aureth (Light) and the First Voice (Shadow). Interval, memory, trigger, form, death, overlap, predecessors: all unknown and recorded as unknown.

## 8. Aureth new identity
Sealed `aureth_true_identity` (id kept): current incarnation of Light, publicly the Sun Emperor, extremely long-lived by nature, existed before Year 0, did not create the world, the Four or dragons.

## 9. The First Voice
Sealed `the_first_voice` (replaces `shadow_adversary`): current incarnation of Shadow, central hidden antagonist, sealed Aureth, hidden authority of the Church. No name, body, disguise, location or mechanism invented. The "not the cause of every evil" principle of the old record was kept.

## 10. Year 0
Aureth publicly revealed himself; modern reckoning begins; not his birth. Public record `modern_reckoning`.

## 11. Year 491
Deep: the First Voice sealed Aureth (Shadow cannot erase Light). Public: the Sun Emperor disappeared; not declared dead.

## 12. Year 1191
Current year, 700 years after the disappearance; the seven-hundredth anniversary is recognised by the Church and carries religious and political weight. No festival, month or day invented.

## 13. Forgotten Era
Public `forgotten_era`: pre-Year-0 history, scarce, restricted, Church-controlled. Restricted `forgotten_era_restricted_access` (policy) and `forgotten_era_fragments` (Eldaven; the Four predate doctrine; contradictory disappearance accounts). Deep reason in `church_hidden_control`.

## 14. The Four
Public `the_four`: four sacred elemental figures tied to West, Center, East, South Continent; guardians, servants or primordial beasts depending on tradition; often drawn as dragons (iconography). Deep: four primordial elemental powers, not required to be dragons, not Aureth's children, names, forms and elements undefined.

## 15. Elemental dormancy
Gradual weakening after the Light suppression in 491, eventual dormancy; no dates. Two places known (deep): the World Tree (West) and the Central Oasis (Center). East and South unknown.

## 16. Old dragon lore migration
All "dragon child" language removed from objective canon. Dragons survive only as folk iconography in `aureth_creation_myth`, `the_four` (public) and as explicit negations in sealed records.

## 17. Church public doctrine
Sincere worship of Aureth, the Sun Emperor, and of Light; Year 0 revelation; disappearance in 491 (not death); 700th anniversary; the Four ordered and blessed under his reign (never "created"); Shadow as danger; pre-Year-0 age spiritually dangerous and restricted. Public myth never states Light and Shadow are mutually necessary.

## 18. Church secret structure
Sealed `church_hidden_control`: sincere institution, structurally controlled by the First Voice, whose hidden purpose serves Shadow; the Church does not knowingly worship Shadow; ordinary public succession; layered knowledge. Origin of the control (founded, captured, redirected, infiltrated) left open.

## 19. Church NPC knowledge matrix
See Appendix C.

## 20. Each named Church NPC changed
Cassian Valerius (new tier 2 grant and two restricted grants; private_notes clarified), Helbrecht (two restricted grants; notes), Severan Krauss (one restricted grant; notes), Sister Veyra and Brother Aven (no new knowledge; notes state public doctrine only).

## 21. Secrecy tier changes
| Record | Tier | Holders |
|---|---|---|
| modern_reckoning, forgotten_era, the_four, south_continent | 0 public | all |
| forgotten_era_restricted_access | 1 | cassian_valerius, helbrecht, severan_krauss |
| church_curated_history | 1 | cassian_valerius, helbrecht |
| forgotten_era_fragments | 1 (specialized) | none |
| sun_emperor.light_secret (rewritten) | 1 | cassian_valerius, helbrecht (unchanged) |
| first_voice_hidden_authority | 2 holder_only | cassian_valerius |
| world_tree_sleeper, oasis_sleeper | 2 holder_only | none |
| aureth_true_identity, the_first_voice, primordial_cosmology, church_hidden_control | 3 author_only | none |
Removed: `shadow_adversary` (replaced), `beastfolk_origin_truth`.

## 22. Retrieval / narrator leak audit
Tests (`tests/canon-lore-migration.test.ts`, `tests/mythology-secrecy.test.ts`): sealed records are never fetchable or searchable by either audience; queries for the First Voice, Aureth, Eldaven, Year 491, the Four and Church control return no deep text; full narrator and controller payloads for First Voice, Aureth and Forgotten Era questions contain no deep truth with or without the sole holder (Cassian) present; with Cassian present only the partial grant appears, never Shadow, sealing or Church control; Background Grounding, character and faction rendering and relationship summaries are free of the title. The title "First Voice" occurs in no public or restricted record.

## 23. World Tree / Oasis / East sleeper decisions
See Appendix E.

## 24. Beastfolk origin decision
Old: the red dragon of Center, kinder than her elder brother, created the Beastfolk (tier 3, lost knowledge). After removing the dragon-family cosmology nothing independent supports a specific creator: the family contrast and the "red dragon" identity are gone, and the only surviving link (Center's primordial power, dormant at the Oasis) would be an invented replacement. Decision: the objective origin is **unresolved**; the sealed record was removed rather than rewritten. Public Beastfolk canon was already silent (no creator, only "cannot use magic"). No NPC held the fact, so no NPC knowledge was downgraded. Flagged for future authoring.

## 25. South Continent authoring
One public location, descriptive name, no aliases, no children, no connections, no capital, people, culture, element or entity name. States it is the fourth great division, south of the other three, with borders and character unestablished. Deep: it corresponds to the fourth primordial power (in `primordial_cosmology`).

## 26. Culture changes
`aureth_creation_myth` rewritten as the public Church-compatible creation myth with folk-iconography note; new `the_four`; `woodsingers` and `world_tree` re-point to "older creation traditions of the Four".

## 27. Geography changes
Section 4 and 5; `continental_structure` now describes four divisions and refuses to describe the South; `docs/authoring/GEOGRAPHY.md` updated.

## 28. YAML files created
`locations/world/south_continent.yaml`; `world/history/{modern_reckoning,forgotten_era,forgotten_era_fragments}.yaml`; `world/cultures/the_four.yaml`; `world/religion/{forgotten_era_restricted_access,church_curated_history}.yaml`; `world/secrets/{the_first_voice,primordial_cosmology,church_hidden_control,first_voice_hidden_authority}.yaml`.

## 29. YAML files modified
`locations/world/{continent,west,center,east,zul_rath,dragons_teeth_mountains,calderan_northern_forest}.yaml`, `locations/west/{blackwater,davenport}.yaml`, `locations/calderan/calderan.yaml`, `world/geography/continental_structure.yaml`, `world/governance/west_trade_network.yaml`, `world/races/{humans,elves}.yaml`, `world/cultures/{aureth_creation_myth,woodsingers,world_tree}.yaml`, `world/religion/church_doctrine.yaml`, `world/secrets/{aureth_true_identity,world_tree_sleeper,oasis_sleeper}.yaml`, `factions/church.yaml`, `characters/sovereign/sun_emperor.yaml`, `characters/calderan/church/{cassian_valerius,helbrecht,severan_krauss,sister_veyra}.yaml`, `characters/calderan/west/charity/brother_aven.yaml`. Deleted: `secrets/shadow_adversary.yaml`, `secrets/beastfolk_origin_truth.yaml`.

## 30. Docs modified
`docs/authoring/GEOGRAPHY.md`, `docs/architecture/AUTHORED_DATA_ARCHITECTURE.md` (tier examples), `docs/architecture/NARRATIVE_AUTHORITY.md`, `docs/architecture/EVIDENCE_AUTHORIZATION.md` (earlier pass). Historical evaluation reports intentionally untouched.

## 31. Tests added / updated
Added `tests/canon-lore-migration.test.ts` (22 tests: Helion, Eldaven scope, Aureth identity, public non-leak, First Voice inaccessibility and four narrator-path audits, doctrine, ordinary vs senior NPC knowledge, the Four, South Continent minimalism, removed dragon model, sleeper hooks, retrieval leaks, validation, ancestry, timeline, save round trip). Updated `mythology-secrecy`, `aureth-canon`, `world-canon`, `geography`, `retrieval`, `lexical-search`, `semantic-search`, `retrieval-benchmark-h3`, `calderan-npc-pass-3`, `west-everyday-canon` (counts and ids) and regenerated `tests/golden/turn-pipeline.json` (only the continent name/summary and two length counters changed).

## 32. Validation results
WorldStore loads (203 entities, 70 geography-tagged locations); referential integrity and sealed-reference rules hold.

## 33. Typecheck / build / full tests
`npm run typecheck` clean, `npm run build` clean, `npm test`: 2984 tests, 2984 pass, 0 fail.

## 34. Save / schema impact
None. Stable ids preserved (`continent`, `aureth_*` legacy ids). Fresh-campaign save/load round trip is tested. Existing saves load: no entity referenced by campaign state was removed or renamed (`shadow_adversary` and `beastfolk_origin_truth` were sealed and unreferenced).

## 35. Remaining old-lore string hits
Appendix A.

## 36. Intentionally open canon questions
Appendix F.

## 37. Final current-canon summary
See section "Clean-room summary" below and the canon summary at the end.

## 38. Recommended next authoring step
Calendar System design (months, weekdays, intercalary days, the 700th anniversary date), then the four elements and the South Continent.

---

# Appendices

## Appendix A: Stale canon references
| Path | Reference | Status |
|---|---|---|
| `data/world/cultures/aureth_creation_myth.yaml` | "golden dragon", Aureth, Four as dragons | valid public myth (folk iconography); also id retained |
| `data/world/cultures/the_four.yaml` | dragons in folk art | valid public myth |
| `data/world/religion/church_doctrine.yaml` | older traditions draw Aureth and the Four as dragons | valid public myth |
| `data/world/secrets/*` | negations ("not a golden dragon", "not his children") | valid current canon (sealed) |
| `data/world/governance/aureth_trade.yaml` | id only | harmless legacy internal id |
| `data/characters/calderan/church/cassian_valerius.yaml` | "Aureth" as the Sun Emperor's name | migrated |
| `data/locations/**`, `world/races/**`, `world/governance/west_trade_network.yaml` (12 files) | "Aureth" as continent | stale and fixed (Helion) |
| `world/cultures/woodsingers.yaml`, `world_tree.yaml` | Aureth creation myth | stale and fixed |
| `tests/aureth-canon.test.ts` | file name, test of the retired continent name | migrated (asserts Helion); file name harmless legacy |
| `tests/golden/turn-pipeline.json` | "← Aureth" ancestry | stale and fixed (regenerated) |
| `docs/architecture/PHASE_1E_2_AUDIT.md` | "continent → three nations" | valid historical report (phase audit of the three-nation map) |
| `docs/architecture/PHASE_1E.md`, `docs/evaluations/**`, `docs/evaluations/*.json` | Aureth continent, dragon wording | valid historical report |
| `src/campaign/opening-state.ts`, `src/dev/eval-participants.ts`, tests mentioning "Light mage" | Nicco is a Light mage | unrelated player fact; intentionally unresolved (see Appendix F) |
| `src/turn/background-grounding.ts` | hard-coded west/center/east | stale and fixed (four great divisions) |
| `data/world/magic/light_and_shadow.yaml` | Light and Shadow as magic classifications, "not good and evil" | valid public (compatible with the migration; the public view stays a magic-school view) |
| `data/world/magic/elemental_magic.yaml` | Fire, Water, Earth, Air | intentionally unresolved (not linked to the four forces) |
| `data/world/religion/sun_emperor_shadow_warnings.yaml` | warnings read as specific and urgent | valid restricted (consistent with the new truth) |

## Appendix B: Canon source-of-truth matrix
| Truth | Public | Restricted | Deep | Authority (entity) | Tier | Holders | Notes |
|---|---|---|---|---|---|---|---|
| Helion / Eldaven | Continent is Helion since Year 0 | Ancient name Eldaven in surviving fragments | Eldaven pre-Year-0 name | `continent`; `forgotten_era_fragments`; `primordial_cosmology` | 0 / 1 / 3 | none for fragments | `continent` id legacy |
| Aureth identity | Aureth = the Sun Emperor, divine bearer of Light | Light is real wielded power, immortality from Light | Current incarnation of Light | `sun_emperor`, `sun_emperor.light_secret`, `aureth_true_identity` | 0 / 1 / 3 | Cassian, Helbrecht (restricted) | restricted account is deliberately narrower than deep |
| Light | Divine, orderly, protective | none | Foundational force, needs Shadow | `church_doctrine`, `primordial_cosmology` | 0 / 3 | none | |
| Shadow | Corruptive, forbidden | Oldest warnings read as specific | Foundational force, needs Light | `church_doctrine`, `sun_emperor_shadow_warnings`, `primordial_cosmology` | 0 / 1 / 3 | none | public never says Shadow is necessary |
| Reincarnation | none | none | Both incarnate cyclically (mechanics unknown) | `primordial_cosmology` | 3 | none | |
| The First Voice | none | none | Current Shadow incarnation, sealed Aureth, directs Church | `the_first_voice`; `first_voice_hidden_authority` | 3 / 2 | Cassian (existence only) | title in no public record |
| Year 0 | Aureth revealed himself | none | Not his birth; he existed earlier | `modern_reckoning`; `aureth_true_identity` | 0 / 3 | all | |
| Year 491 | The Sun Emperor disappeared | Records contradict each other | Sealed by the First Voice | `modern_reckoning`; `forgotten_era_fragments`; `aureth_true_identity` | 0 / 1 / 3 | none for fragments | not declared dead |
| Year 1191 | Present year, 700th anniversary | none | none | `modern_reckoning` | 0 | all | no calendar |
| Forgotten Era | Pre-Year-0, restricted | Restriction is Church order; doctrine curated | Suppressed to hide the cosmology | `forgotten_era`; `forgotten_era_restricted_access`; `church_curated_history`; `church_hidden_control` | 0 / 1 / 3 | Cassian, Helbrecht, Severan (access); Cassian, Helbrecht (curation) | |
| The Four | Four sacred elemental figures per division | Predate doctrine (fragments) | Four primordial powers, not Aureth's | `the_four`; `forgotten_era_fragments`; `primordial_cosmology` | 0 / 1 / 3 | none | nature, names, elements undefined |
| Dormancy | none | none | Gradual, from imbalance after 491 | `primordial_cosmology`; two sleeper records | 3 / 2 | none | |
| Church public doctrine | Sincere worship of Aureth and Light | none | none | `church`, `church_doctrine` | 0 | all | |
| Church hidden control | none | Doctrine is curated | First Voice directs it; most members sincere | `church_curated_history`; `first_voice_hidden_authority`; `church_hidden_control` | 1 / 2 / 3 | Cassian, Helbrecht / Cassian | |
| South Continent | Fourth great division, south | none | Fourth primordial power's division | `south_continent`; `primordial_cosmology` | 0 / 3 | all | nothing else authored |

## Appendix C: Church NPC knowledge matrix
Tier-1 restricted records appear in an NPC's scene only through their `known_by` grant. High rank alone grants nothing.
| NPC | Public belief | Privately knows | Suspects | Falsely/incompletely believes | Definitely does NOT know | Why / change |
|---|---|---|---|---|---|---|
| Cassian Valerius (High Archon) | Aureth is the divine Sun Emperor; Light sacred; Shadow heresy | Restricted Light account; official history is curated; pre-Year-0 records are barred; an ancient hidden authority called the First Voice guides the highest counsel; the disappearance was no ordinary death | the disappearance had a hidden cause | that the First Voice serves the faith; that the Light account is the whole nature of the Sun Emperor | what the First Voice is; Light/Shadow incarnation; the sealing; the six forces; Eldaven | supreme seat justifies the inner circle; the First Voice grant is the single tier 2 holder, existence only; he keeps the old holder status for the narrower Light account |
| Helbrecht (High Inquisitor) | Same; Shadow users are heretics | Restricted Light account; official history curated; enforces the pre-Year-0 ban | none established | that the ban protects souls | the First Voice; the sealing; the cosmology | Inquisition leadership enforces suppression; no hidden-authority grant (he is operational, not theological) |
| Severan Krauss (Inquisitor) | Same | Pre-Year-0 records are restricted | none | that the restriction protects souls | curation of history; the Light account; the First Voice; the cosmology | field inquisitor who sincerely enforces; the narrowest grant |
| Sister Veyra (medical sister) | Public doctrine | nothing restricted | none | none | everything restricted or deep | ordinary clergy |
| Brother Aven (Zealot Priest) | Public doctrine, sincere | only his own Bartolomhew knowledge | none | none | everything restricted or deep | ordinary clergy |
No old holder was upgraded: the `light_secret` holders keep only the narrower account, and `shadow_adversary` had none.

## Appendix D: Legacy internal IDs retained
| Id | Where | Class |
|---|---|---|
| `continent` | location, parent of all geography | safe legacy id (name changed; renaming would touch every ancestry and save reference) |
| `aureth_creation_myth` | public myth entity | safe legacy id (name now "The Creation Myth of Helion"); safe to migrate later |
| `aureth_trade` | public trade record | safe legacy id; safe to migrate later (no code or save reference) |
| `aureth_true_identity` | sealed truth | semantically correct (Aureth is a person); keep |
| `tests/aureth-canon.test.ts` | file name | harmless |
| `data/world/cultures/aureth_creation_myth.yaml`, `data/world/governance/aureth_trade.yaml` | file names | harmless |

## Appendix E: Old sleeper migration
| Hook | Old | New | Preserved | Removed | Unknown |
|---|---|---|---|---|---|
| World Tree | Eldest male green dragon child of Aureth asleep in or at the World Tree, which protects him | One of the Four (the power associated with West) lies dormant in, beneath or enclosed by the World Tree, which protects and conceals it | location, protective role of the tree, sleeping presence, holder-only secrecy | dragon, colour, sex, birth order, "child of Aureth" | form, name, duration, waking, intent |
| Oasis | Female red dragon child asleep beneath the Central Oasis, causing the red reflections | One of the Four (the power associated with Center) lies dormant beneath the deepest part of the oasis; its dormant presence causes the red reflections | location, red reflections, holder-only secrecy | dragon, colour of the being, sex, "twin of the East child" | form, name, duration, waking, intent |
| East | Twin brother, colour, kind and place unestablished | unchanged: no sleeper authored | nothing to lose | twin relationship | everything |
| South | n/a | no sleeper authored | | | everything |
No record says "child of Aureth" or equivalent (test 13 and 12).

## Appendix F: Open questions / do not invent
Four elemental forces and their mapping to West/Center/East/South; forms, names and species of the Four; East and South dormancy places; exact dormancy dates; reincarnation mechanics and past incarnations; Aureth's pre-Year-0 biography; the First Voice's name, body, disguise, location and method of long life; how the Church came under the First Voice; exact Church leadership mechanism; the seal's mechanism, place, whether Aureth is conscious; South Continent name, culture, politics, cities; Beastfolk origin; calendar months, weekdays, intercalary days and the anniversary date; relation of Fire/Water/Earth/Air magic to the four forces.

---

# Clean-room summary (reconstructed only from the migrated data)
1. **Cosmology.** Six primordial forces (four elemental, Light, Shadow) form and sustain the world; Light and Shadow are complementary and each needs the other; both incarnate cyclically.
2. **Aureth.** Current incarnation of Light, publicly the Sun Emperor; existed before Year 0, revealed himself in Year 0, was sealed (not killed) in 491; not a dragon, not a creator.
3. **First Voice.** Current incarnation of Shadow, hidden supreme authority of the Church, sealed Aureth; only holder of the whole truth; no public trace of the title.
4. **Church.** Sincere faith in Aureth and Light; ordinary leadership and succession; hidden structural control; knowledge is layered and rare.
5. **Helion / Eldaven.** Modern name since Year 0; ancient name known only through restricted fragments.
6. **The Four.** Four primordial elemental powers older than Aureth, one per great division, not his children, nature undefined; publicly sacred figures often drawn as dragons.
7. **South Continent.** Fourth great division, south of the other three; nothing else.
8. **Forgotten Era.** Pre-Year-0 history, deliberately suppressed; fragments are partial.
9. **Timeline.** Pre-0 Eldaven; 0 revelation; 491 sealing/disappearance; 491 onward weakening and dormancy, Church growth; 1191 now, 700 years on.
10. **Who knows what.** Public: Helion, Aureth = Sun Emperor, 0/491/1191, Four as sacred figures, restricted Forgotten Era. Cassian, Helbrecht: curated history, Light account (Cassian also the hidden authority's existence). Severan: restricted records only. All else nobody except the First Voice.

Comparison with the specification: no material difference. One interpretive point is flagged: the spec lists "Aureth = Sun Emperor" at Tier 0, so the name Aureth is public and the old secret "Sun Emperor is Aureth" disappeared as a secret.

---

# Missing lore and plot holes to cover next
1. **Four elements and the four divisions.** Not chosen. Decide whether Fire, Water, Earth, Air are the four forces, and which division is which; the South Continent depends on it.
2. **The Four themselves.** Names, forms, powers, dormancy state of East and South, relation to the dragon iconography, what waking them means.
3. **Nicco, "a Light mage".** The player is a Light mage in a world where Light users are hunted and Light is incarnate in Aureth. Open: is Nicco's Light connected to Aureth, to cyclic incarnation, or independent? Also why an otherworlder has it.
4. **Sealing.** Mechanism, place, artifact, whether it can break, whether Aureth is conscious; why the 700th anniversary matters to anyone in-world; whether seal strength relates to anniversaries.
5. **The First Voice.** Name, disguise, location, how it communicates with Cassian, how it survived 700 years of Church history unseen, whether other incarnations or agents exist.
6. **Church origin.** How the institution arose after Year 0 and how the First Voice came to control it; whether the Church existed before 491; how Cassian was chosen and who preceded him.
7. **Why Aureth left warnings against Shadow before 491** and why the First Voice let them be preserved.
8. **Reincarnation rules.** Interval, memory, triggers, overlap, predecessors; how Aureth and the First Voice know each other's nature; if Light dies naturally what follows.
9. **Light and Shadow users.** Mortal Light and Shadow magic versus incarnations; why Light users are hunted if Light is sacred; how Shadow users relate to the First Voice.
10. **The Sun Emperor as sovereign of West.** Rule over West versus a continent-wide faith; other divisions' attitude to the Church (Center forbids magic, East's religion undefined, South unknown).
11. **Imbalance consequences.** Observable effects of weakened Light and dormant Four (climate, magic, monsters, barren land); relation to the red oasis water and the World Tree.
12. **Forgotten Era.** What happened before Year 0, how Aureth lived and acted then, what "Eldaven" was as a polity or place, what survived the Reckoning, which fragments exist and who holds them.
13. **Beastfolk origin and magic ban.** Why Beastfolk cannot use magic; who made them; link, if any, to Center's dormant power.
14. **The 700th anniversary.** Date, rites, political use, and whether any faction expects Aureth's return.
15. **Calendar.** Months, weekdays, intercalary days, anniversary day; how Year 0 reckoning is notated in the world.
16. **Elven and dwarven myths.** What the Woodsingers' richer creation corpus says now that the dragon family is gone; dwarven Dragon's Teeth naming (the name still establishes nothing).
17. **Other Church NPCs.** Archivists, Auditors and Vicars do not exist as named people; who holds `forgotten_era_fragments`; who among the Inquisition's Archivists knows what.
18. **Public vs private inconsistency to watch:** `light_and_shadow` publicly says Light and Shadow are "not moral alignments" while doctrine calls Shadow absolute heresy; this tension is intentional but should be addressed when public lore on Shadow users is expanded.
