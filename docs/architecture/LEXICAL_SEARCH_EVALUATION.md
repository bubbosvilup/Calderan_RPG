# Phase 1G retrieval evaluation

Dataset: `sha256:db7dbdb9b095977ced0514c1d25f232b3f732676f8b5a7ce482f0780d22de9bf`

44 cases. Top-1: 30/34. Micro recall@5: 87.2%. MRR@5: 0.927. Multi-answer recall@5: 53.8%.

Top-1/MRR use only single-target cases; recall counts labeled relevant IDs, not every potentially relevant result. Diagnostic cases are excluded from these denominators. This is a development suite, not held-out generalization evidence.

| Query | Top five IDs | Expected | Status | Notes |
| --- | --- | --- | --- | --- |
| capital of West | calderan, center, zul_rath, east, west | top-1: calderan | pass |  |
| capital of Center | zul_rath, center, calderan, vaelrost, east | top-1: zul_rath | pass |  |
| capital of East | vaelrost, east, center, calderan, main_city_structure | top-1: vaelrost | pass |  |
| eastern coastal city | skardgard, sandspear, city_guard, city_magistracy, main_city_structure | top-1: skardgard | pass |  |
| mountains between Center and East | dragons_teeth_mountains, center, frostspire, continent, continental_structure | top-1: dragons_teeth_mountains | pass |  |
| border fortress | ironbound, center, east, west, continent | top-1: ironbound | pass |  |
| iron coal mining | frostspire, ironbound | top-1: frostspire | pass |  |
| pirate city | blackwater, city_guard, city_magistracy, main_city_structure, ironbound | blackwater, sandspear | fail | authoring vocabulary gap: Pirate/pirates/piracy and corsair/corsairs are separate exact tokens. |
| corsair stronghold | sandspear, blackwater, west_slavery | top-1: sandspear | pass |  |
| major western port | davenport, khar_dune, frostspire, west, continental_structure | top-1: davenport | pass |  |
| mages guild | learned_arts_guild, magic_overview, artisans_guild, merchants_guild, calderan | top-1: learned_arts_guild | pass |  |
| church investigators | church, inquisition, calderan, city_guard, light_and_shadow | top-1: inquisition | fail | authoring vocabulary gap: Investigators may not occur literally; Church and Inquisition are separate named institutions. |
| merchant political institution | davenport, church, west_slavery, artisans_guild, merchants_guild | top-1: merchants_guild | fail | authoring vocabulary gap: Merchant/merchants and political wording may not share exact surface forms. |
| legendary rare magic | magic_overview, light_and_shadow, learned_arts_guild, inquisition, elemental_magic | top-1: light_and_shadow | fail | inherently ambiguous: Magic overview also explicitly discusses rare practitioners and legendary magic (including negation). |
| who has mana | mana, west_governance, main_city_structure, artisans_guild, khar_dune | top-1: mana | pass |  |
| fire water earth air | elemental_magic, magic_subschools, khar_dune | top-1: elemental_magic | pass |  |
| magic specializations | elemental_magic, magic_overview, magic_subschools, learned_arts_guild, mana | top-1: magic_subschools | fail | semantic gap: Specializations is absent; relevant canon uses specialized subschools/styles/branches. Magic is a generic shared term. |
| beastfolk slavery west | west_slavery, beastfolk, west, main_city_structure, races_overview | beastfolk, west_slavery | acceptable |  |
| elves uncommon | elves, magic_overview, races_overview, mixed_ancestry | top-1: elves | pass |  |
| dwarves craftsmanship | dwarves, elves, races_overview | top-1: dwarves | pass |  |
| legal slave port | davenport, calderan, west_slavery, ironbound, west | top-1: davenport | pass |  |
| slave market border | west, west_slavery, calderan, davenport, khar_dune | khar_dune, ironbound | fail | authoring vocabulary gap: Khar-Dune uses markets (plural); Ironbound lacks market. Broad West/slavery records cover more literal tokens; Ironbound falls outside five. |
| illegal slaves pirates | blackwater, khar_dune, west_slavery | top-1: blackwater | pass |  |
| slave trade West | blackwater, davenport, khar_dune, main_city_structure, sandspear | west_slavery, davenport, calderan | fail | authoring vocabulary gap: West Slavery and Calderan describe legal market/control without the literal token trade; illicit-trade records cover all three tokens. |
| food storage cellar | heartstone_u1, heartstone_lr, heartstone_cy, heartstone_f1, davenport | top-1: heartstone_u1 | pass |  |
| medical recovery room | heartstone_f1, heartstone_lr, mana | top-1: heartstone_f1 | pass |  |
| courtyard medicine plants | heartstone_cy, heartstone_lr, heartstone, heartstone_f1, main_city_structure | top-1: heartstone_cy | pass |  |
| living room hearth sofa | heartstone_lr, mana, heartstone, main_city_structure | top-1: heartstone_lr | pass |  |
| Blackwater | blackwater, calderan, chained_bay, sandspear, sorrow_sea | top-1: blackwater | pass |  |
| The Unchained Haven | blackwater, davenport, dragons_teeth_mountains, ironbound, silent_ocean | top-1: blackwater | pass |  |
| Davenport | davenport, calderan, chained_bay, west, west_slavery | top-1: davenport | pass |  |
| The Port of Chains | davenport, ironbound, silent_ocean, vaelrost, zul_rath | top-1: davenport | pass |  |
| Ironbound | ironbound, davenport, west, west_slavery | top-1: ironbound | pass |  |
| The Fortress on the Edge | ironbound, blackwater, center, east, west | top-1: ironbound | pass |  |
| Sandspear | sandspear, blackwater, center, chained_bay, sorrow_sea | top-1: sandspear | pass |  |
| Frostspire | frostspire, dragons_teeth_mountains, continental_structure, east, vaelrost | top-1: frostspire | pass |  |
| city on the border with Center | ironbound, center, east, west, sandspear | top-1: ironbound | pass |  |
| where do pirates operate? | learned_arts_guild, inquisition, main_city_structure, center, races_overview | blackwater, sandspear | fail | authoring vocabulary gap: Natural question words and exact pirates versus corsairs forms do not encode the intended concept. |
| Blackwater rivalry | blackwater, sandspear, city_magistracy, calderan, chained_bay | blackwater, sandspear | acceptable |  |
| border (West child locations) | ironbound | top-1: ironbound | pass |  |
| dragon ruler | center, dragons_teeth_mountains, frostspire, east, vaelrost | diagnostic | diagnostic | Token overlap with Dragon's Teeth is not evidence of a dragon ruler; inspect partial coverage, never infer a ruler. |
| mages guild headquarters | learned_arts_guild, main_city_structure, magic_overview, artisans_guild, merchants_guild | diagnostic | diagnostic | Only real canonical IDs may appear. Learned Arts may match the explicit denial of a separate Mages Guild; headquarters is not established. |
| Blackwater black water | blackwater, sandspear, elemental_magic, khar_dune, magic_subschools | diagnostic | diagnostic | Blackwater and literal water tokens may retrieve different records; no combined fact about black-colored water is created. |
| quasarxylophone | none | diagnostic | diagnostic | No lexical overlap must return zero results. |
