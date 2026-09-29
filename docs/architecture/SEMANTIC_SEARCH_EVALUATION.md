# Phase 1H.1: Voyage real semantic evaluation

Measured 2026-09-27 against the unchanged 44-case Phase 1G benchmark. The additional four semantic diagnostics are reported separately; no expectations or canon were changed.

## Metrics

| Mode | Top-1 | Recall@5 | MRR@5 | Multi-answer Recall@5 | Identity/alias |
| --- | --- | --- | --- | --- | --- |
| lexical | 30/34 (88.2%) | 87.2% | 0.927 | 53.8% | 8/8 |
| semantic | 30/34 (88.2%) | 95.7% | 0.926 | 92.3% | 8/8 |
| hybrid | 31/34 (91.2%) | 97.9% | 0.956 | 92.3% | 8/8 |

The lexical results reproduce Phase 1G: 30/34, 87.2%, 0.927, 53.8%. Top-1/MRR use the same 34 single-target cases; multi-answer recall uses the six multi-answer cases. Four original unlabeled diagnostics are excluded from metric denominators. This development benchmark is not held-out evidence.

## Real indexes and usage

Provider: `voyage:voyage-4:1024`, floating-point vectors, document/query input types. Dataset: `sha256:db7dbdb9b095977ced0514c1d25f232b3f732676f8b5a7ce482f0780d22de9bf`. Both audiences contain 46 entities and zero chunks. No vectors are persisted.

| Audience | Documents | Build requests | Build tokens | Build elapsed ms |
| --- | --- | --- | --- | --- |
| narrator | 46 | 3 | 9360 | 80886 |
| player | 46 | 3 | 9360 | 120366 |

Completed evaluation: **7 requests**, **140 input texts**, **18832 reported tokens**, 7 usage-bearing responses. The 48 unique queries were embedded in one query batch and reused across modes and the player verification. Build timings include deliberate pacing for the account's 3 RPM / 10K TPM limits. No index was rebuilt per query.

Before the completed run, four document-batch attempts returned HTTP 429 (32, 32, 46, 46 submitted texts), and two one-query probes succeeded (one reported token each). Afterward, `npm run inspect:embedding -- "church investigators"` succeeded with one request, one text and four reported tokens. These attempts are separate from the completed-run counters. Session total: 14 requests attempted, 299 texts submitted, 18,838 tokens reported by successful responses. Failed requests supplied no token usage.

Published Voyage-4 price checked on 2026-09-27: $0.06/million tokens. The completed run's nominal token cost is $0.001130, before free allowance. Actual account billing cannot be derived from API usage metadata. [Official pricing](https://docs.voyageai.com/docs/pricing).

## Required representative queries

IDs are ordered top-five results; an empty list means no candidate survived.

| Query | Lexical | Semantic | Hybrid |
| --- | --- | --- | --- |
| magic specializations | elemental_magic, magic_overview, magic_subschools, learned_arts_guild, mana | magic_subschools | magic_subschools, elemental_magic, magic_overview, learned_arts_guild, mana |
| church investigators | church, inquisition, calderan, city_guard, light_and_shadow | inquisition, church | church, inquisition, calderan, city_guard, light_and_shadow |
| places where pirates operate | inquisition, learned_arts_guild, main_city_structure | blackwater, sandspear, chained_bay, khar_dune, skardgard | blackwater, inquisition, learned_arts_guild, sandspear, chained_bay |
| religious secret police | church, main_city_structure | inquisition, church | church, inquisition, main_city_structure |
| special branches of elemental magic | elemental_magic, magic_overview, magic_subschools, learned_arts_guild, calderan | magic_subschools, elemental_magic, magic_overview, light_and_shadow, mana | elemental_magic, magic_subschools, magic_overview, learned_arts_guild, light_and_shadow |
| institution responsible for investigating dangerous rare magic | inquisition, magic_overview, light_and_shadow, learned_arts_guild, mana | inquisition, learned_arts_guild, magic_overview, light_and_shadow, magic_subschools | inquisition, magic_overview, learned_arts_guild, light_and_shadow, magic_subschools |
| Blackwater | blackwater, calderan, chained_bay, sandspear, sorrow_sea | blackwater, sorrow_sea | blackwater, sorrow_sea, calderan, chained_bay, sandspear |
| The Unchained Haven | blackwater, davenport, dragons_teeth_mountains, ironbound, silent_ocean | blackwater | blackwater, davenport, dragons_teeth_mountains, ironbound, silent_ocean |
| The Port of Chains | davenport, ironbound, silent_ocean, vaelrost, zul_rath | davenport, chained_bay | davenport, chained_bay, ironbound, silent_ocean, vaelrost |
| The Fortress on the Edge | ironbound, blackwater, center, east, west | ironbound, frostspire, skardgard | ironbound, frostspire, skardgard, blackwater, center |
| border fortress | ironbound, center, east, west, continent | ironbound, frostspire, khar_dune, skardgard | ironbound, khar_dune, center, frostspire, east |
| iron coal mining | frostspire, ironbound | frostspire | frostspire, ironbound |
| food storage cellar | heartstone_u1, heartstone_lr, heartstone_cy, heartstone_f1, davenport | heartstone_u1 | heartstone_u1, heartstone_lr, heartstone_cy, heartstone_f1, davenport |

## Quality decision and failure classification

**HYBRID RETRIEVAL VALIDATED** for this corpus and benchmark. Prefer hybrid when
a real audience index is available. Keep lexical available without credentials;
the developer inspector's explicit offline default is unchanged. This is a
retrieval-quality decision, not narrator integration or evidence of generalization
to unseen worlds. RRF **k=60** and minimum similarity **0.35** are retained.

Hybrid fixes two single-target failures and introduces one: Top-1 rises from
30/34 to 31/34. Recall rises from 41/47 to 46/47 labeled answers, and multi-answer
recall rises from 7/13 to 12/13. All seven specifically requested lexical-strength
queries retain the correct first result in all modes; identity/alias accuracy is
8/8. The one new hybrid regression is a descriptive geographic query, where the
correct answer remains second. This tradeoff is acceptable for candidate retrieval,
but consumers must not treat the leading candidate as an established fact.

| Representative issue | Classification | Evidence |
| --- | --- | --- |
| magic specializations | fixed by hybrid | Magical Subschools moves from lexical #3 to semantic/hybrid #1. |
| merchant political institution | fixed by hybrid | Merchants Guild moves from lexical #5 to semantic/hybrid #1. |
| pirate city; where do pirates operate?; places where pirates operate | fixed by hybrid | Both Blackwater and Sandspear enter the top five; semantic ranks the two useful locations first for the natural question. |
| church investigators; religious secret police | fixed by semantic | Inquisition becomes semantic #1; hybrid still places Church #1 and Inquisition #2. Hybrid Top-1 remains unresolved. |
| special branches of elemental magic | fixed by semantic | Magical Subschools is semantic #1, hybrid #2, lexical #3. Hybrid Top-1 remains unresolved. |
| institution responsible for investigating dangerous rare magic | already discoverable | Inquisition is #1 in all modes. |
| legendary rare magic | still unresolved | Magic Overview remains ahead of Light and Shadow in all modes; the wording is canonically ambiguous. |
| slave trade West | still unresolved | Hybrid recovers West Slavery, but Calderan remains outside five; one labeled answer is still missed. |
| capital of West | lexical still better than semantic | Semantic prefers West; hybrid preserves Calderan #1. |
| legal slave port | lexical still better than semantic | Semantic returns no candidate at 0.35; lexical/hybrid keep Davenport #1. |
| city on the border with Center | lexical still better | Semantic/hybrid rank Center before Ironbound, regressing lexical Top-1. Ironbound remains #2. |

The pirate diagnostic now succeeds without changing canon or document derivation.
Blackwater scores 0.580 and Sandspear 0.560. The remaining semantic top five
include Chained Bay (a useful operating area), Khar-Dune and Skardgard (broader
geographic associations, not proof of pirate activity). Hybrid still admits
Inquisition and Learned Arts Guild from noisy lexical overlap. Thus discovery is
fixed, but ranking purity is imperfect; no model or document rewrite is justified
by this example.

Both magic questions rank Magical Subschools first semantically. The inspected
short document already says specialized subschools, styles and branches and gives
canonical examples; no vocabulary additions are warranted. For the longer query,
hybrid keeps Elemental Magic first through two-channel agreement.

For Church/Inquisition diagnostics, these are the relevant semantic cosine
scores (scores below 0.35 are excluded, not secretly recovered):

| Query | Inquisition | Church | Learned Arts Guild | Light and Shadow | Magic Overview |
| --- | ---: | ---: | ---: | ---: | ---: |
| church investigators | 0.478 (#1) | 0.445 (#2) | 0.182 | 0.234 | 0.094 |
| religious secret police | 0.467 (#1) | 0.398 (#2) | 0.197 | 0.237 | 0.147 |
| institution responsible for investigating dangerous rare magic | 0.528 (#1) | 0.325 | 0.485 (#2) | 0.434 (#4) | 0.446 (#3) |

Inquisition is strongly discoverable in all three semantic queries. Swapped
lexical/semantic ranks for Church and Inquisition produce equal RRF support in
the first query; stable ID ordering favors Church. This does not justify changing
k or tuning the benchmark. No RRF parameters were changed.

## Full unchanged benchmark

| Query | Lexical | Semantic | Hybrid |
| --- | --- | --- | --- |
| capital of West | calderan, center, zul_rath, east, west | west, calderan, davenport, main_city_structure, center | calderan, west, center, zul_rath, davenport |
| capital of Center | zul_rath, center, calderan, vaelrost, east | zul_rath, center, calderan, main_city_structure, vaelrost | zul_rath, center, calderan, vaelrost, main_city_structure |
| capital of East | vaelrost, east, center, calderan, main_city_structure | vaelrost, east, skardgard, continental_structure, calderan | vaelrost, east, calderan, center, main_city_structure |
| eastern coastal city | skardgard, sandspear, city_guard, city_magistracy, main_city_structure | skardgard, vaelrost, east, silent_ocean, chained_bay | skardgard, vaelrost, east, sandspear, silent_ocean |
| mountains between Center and East | dragons_teeth_mountains, center, frostspire, continent, continental_structure | dragons_teeth_mountains, continental_structure, continent, center, frostspire | dragons_teeth_mountains, center, continental_structure, continent, frostspire |
| border fortress | ironbound, center, east, west, continent | ironbound, frostspire, khar_dune, skardgard | ironbound, khar_dune, center, frostspire, east |
| iron coal mining | frostspire, ironbound | frostspire | frostspire, ironbound |
| pirate city | blackwater, city_guard, city_magistracy, main_city_structure, ironbound | sandspear, blackwater, skardgard, davenport | blackwater, skardgard, davenport, sandspear, city_guard |
| corsair stronghold | sandspear, blackwater, west_slavery | sandspear, skardgard | sandspear, blackwater, skardgard, west_slavery |
| major western port | davenport, khar_dune, frostspire, west, continental_structure | davenport, chained_bay, ironbound, skardgard, west | davenport, west, chained_bay, ironbound, sorrow_sea |
| mages guild | learned_arts_guild, magic_overview, artisans_guild, merchants_guild, calderan | learned_arts_guild, magic_overview, magic_subschools, city_magistracy, merchants_guild | learned_arts_guild, magic_overview, merchants_guild, city_magistracy, artisans_guild |
| church investigators | church, inquisition, calderan, city_guard, light_and_shadow | inquisition, church | church, inquisition, calderan, city_guard, light_and_shadow |
| merchant political institution | davenport, church, west_slavery, artisans_guild, merchants_guild | merchants_guild, west_governance, city_magistracy, church, artisans_guild | merchants_guild, church, artisans_guild, west_governance, davenport |
| legendary rare magic | magic_overview, light_and_shadow, learned_arts_guild, inquisition, elemental_magic | magic_overview, light_and_shadow, magic_subschools, mana, elemental_magic | magic_overview, light_and_shadow, magic_subschools, elemental_magic, mana |
| who has mana | mana, west_governance, main_city_structure, artisans_guild, khar_dune | mana | mana, west_governance, main_city_structure, artisans_guild, khar_dune |
| fire water earth air | elemental_magic, magic_subschools, khar_dune | elemental_magic, magic_subschools | elemental_magic, magic_subschools, khar_dune |
| magic specializations | elemental_magic, magic_overview, magic_subschools, learned_arts_guild, mana | magic_subschools | magic_subschools, elemental_magic, magic_overview, learned_arts_guild, mana |
| beastfolk slavery west | west_slavery, beastfolk, west, main_city_structure, races_overview | west_slavery, beastfolk, davenport, khar_dune, west | west_slavery, beastfolk, west, davenport, blackwater |
| elves uncommon | elves, magic_overview, races_overview, mixed_ancestry | elves, mixed_ancestry | elves, mixed_ancestry, magic_overview, races_overview |
| dwarves craftsmanship | dwarves, elves, races_overview | dwarves, artisans_guild | dwarves, artisans_guild, elves, races_overview |
| legal slave port | davenport, calderan, west_slavery, ironbound, west | none | davenport, calderan, west_slavery, ironbound, west |
| slave market border | west, west_slavery, calderan, davenport, khar_dune | khar_dune, west_slavery, davenport, ironbound | west_slavery, khar_dune, davenport, ironbound, west |
| illegal slaves pirates | blackwater, khar_dune, west_slavery | blackwater, west_slavery | blackwater, west_slavery, khar_dune |
| slave trade West | blackwater, davenport, khar_dune, main_city_structure, sandspear | west_slavery, davenport, khar_dune, west, blackwater | davenport, blackwater, khar_dune, west_slavery, west |
| food storage cellar | heartstone_u1, heartstone_lr, heartstone_cy, heartstone_f1, davenport | heartstone_u1 | heartstone_u1, heartstone_lr, heartstone_cy, heartstone_f1, davenport |
| medical recovery room | heartstone_f1, heartstone_lr, mana | heartstone_f1 | heartstone_f1, heartstone_lr, mana |
| courtyard medicine plants | heartstone_cy, heartstone_lr, heartstone, heartstone_f1, main_city_structure | heartstone_cy | heartstone_cy, heartstone_lr, heartstone, heartstone_f1, main_city_structure |
| living room hearth sofa | heartstone_lr, mana, heartstone, main_city_structure | heartstone_lr | heartstone_lr, mana, heartstone, main_city_structure |
| Blackwater | blackwater, calderan, chained_bay, sandspear, sorrow_sea | blackwater, sorrow_sea | blackwater, sorrow_sea, calderan, chained_bay, sandspear |
| The Unchained Haven | blackwater, davenport, dragons_teeth_mountains, ironbound, silent_ocean | blackwater | blackwater, davenport, dragons_teeth_mountains, ironbound, silent_ocean |
| Davenport | davenport, calderan, chained_bay, west, west_slavery | davenport | davenport, calderan, chained_bay, west, west_slavery |
| The Port of Chains | davenport, ironbound, silent_ocean, vaelrost, zul_rath | davenport, chained_bay | davenport, chained_bay, ironbound, silent_ocean, vaelrost |
| Ironbound | ironbound, davenport, west, west_slavery | ironbound | ironbound, davenport, west, west_slavery |
| The Fortress on the Edge | ironbound, blackwater, center, east, west | ironbound, frostspire, skardgard | ironbound, frostspire, skardgard, blackwater, center |
| Sandspear | sandspear, blackwater, center, chained_bay, sorrow_sea | sandspear | sandspear, blackwater, center, chained_bay, sorrow_sea |
| Frostspire | frostspire, dragons_teeth_mountains, continental_structure, east, vaelrost | frostspire, vaelrost, dragons_teeth_mountains, east, magic_subschools | frostspire, dragons_teeth_mountains, vaelrost, east, continental_structure |
| city on the border with Center | ironbound, center, east, west, sandspear | center, ironbound, zul_rath, west, main_city_structure | center, ironbound, west, east, khar_dune |
| where do pirates operate? | learned_arts_guild, inquisition, main_city_structure, center, races_overview | blackwater, sandspear | blackwater, learned_arts_guild, inquisition, sandspear, main_city_structure |
| Blackwater rivalry | blackwater, sandspear, city_magistracy, calderan, chained_bay | blackwater, sandspear | blackwater, sandspear, city_magistracy, calderan, chained_bay |
| border (filtered) | ironbound | ironbound | ironbound |
| dragon ruler | center, dragons_teeth_mountains, frostspire, east, vaelrost | none | center, dragons_teeth_mountains, frostspire, east, vaelrost |
| mages guild headquarters | learned_arts_guild, main_city_structure, magic_overview, artisans_guild, merchants_guild | learned_arts_guild, city_magistracy, merchants_guild, magic_overview, west_governance | learned_arts_guild, magic_overview, merchants_guild, city_magistracy, west_governance |
| Blackwater black water | blackwater, sandspear, elemental_magic, khar_dune, magic_subschools | blackwater, sorrow_sea | blackwater, sorrow_sea, sandspear, elemental_magic, khar_dune |
| quasarxylophone | none | none | none |

## Threshold observations

Threshold remains **0.35**, RRF remains **k=60**. Candidate counts below are unfiltered narrator-corpus cosine diagnostics; metric searches continue to honor case filters.

| Query | Candidates = 0.35 | Relevant labeled scores |
| --- | --- | --- |
| capital of West | 9 | calderan: 0.541 |
| capital of Center | 7 | zul_rath: 0.524 |
| capital of East | 10 | vaelrost: 0.559 |
| eastern coastal city | 8 | skardgard: 0.559 |
| mountains between Center and East | 6 | dragons_teeth_mountains: 0.542 |
| border fortress | 4 | ironbound: 0.579 |
| iron coal mining | 1 | frostspire: 0.412 |
| pirate city | 4 | blackwater: 0.459, sandspear: 0.498 |
| corsair stronghold | 2 | sandspear: 0.441 |
| major western port | 7 | davenport: 0.542 |
| mages guild | 5 | learned_arts_guild: 0.514 |
| church investigators | 2 | inquisition: 0.478 |
| merchant political institution | 7 | merchants_guild: 0.574 |
| legendary rare magic | 5 | light_and_shadow: 0.418 |
| who has mana | 1 | mana: 0.515 |
| fire water earth air | 2 | elemental_magic: 0.571 |
| magic specializations | 1 | magic_subschools: 0.367 |
| beastfolk slavery west | 8 | beastfolk: 0.554, west_slavery: 0.589 |
| elves uncommon | 2 | elves: 0.577 |
| dwarves craftsmanship | 2 | dwarves: 0.609 |
| legal slave port | 0 | davenport: 0.333 |
| slave market border | 4 | khar_dune: 0.514, ironbound: 0.419 |
| illegal slaves pirates | 2 | blackwater: 0.431 |
| slave trade West | 6 | west_slavery: 0.546, davenport: 0.519, calderan: 0.378 |
| food storage cellar | 1 | heartstone_u1: 0.497 |
| medical recovery room | 1 | heartstone_f1: 0.545 |
| courtyard medicine plants | 1 | heartstone_cy: 0.543 |
| living room hearth sofa | 1 | heartstone_lr: 0.586 |
| Blackwater | 2 | blackwater: 0.491 |
| The Unchained Haven | 1 | blackwater: 0.363 |
| Davenport | 1 | davenport: 0.430 |
| The Port of Chains | 2 | davenport: 0.426 |
| Ironbound | 1 | ironbound: 0.505 |
| The Fortress on the Edge | 3 | ironbound: 0.508 |
| Sandspear | 1 | sandspear: 0.416 |
| Frostspire | 5 | frostspire: 0.538 |
| city on the border with Center | 11 | ironbound: 0.452 |
| where do pirates operate? | 2 | blackwater: 0.491, sandspear: 0.471 |
| Blackwater rivalry | 2 | blackwater: 0.470, sandspear: 0.358 |
| border | 1 | ironbound: 0.368 |
| dragon ruler | 0 | unlabeled diagnostic |
| mages guild headquarters | 5 | unlabeled diagnostic |
| Blackwater black water | 2 | unlabeled diagnostic |
| quasarxylophone | 0 | unlabeled diagnostic |
| places where pirates operate | 7 | unlabeled diagnostic |
| religious secret police | 2 | unlabeled diagnostic |
| special branches of elemental magic | 7 | unlabeled diagnostic |
| institution responsible for investigating dangerous rare magic | 5 | unlabeled diagnostic |

Across 48 unique queries: 0�11 candidates, median 2, mean 3.5.

The 0.35 threshold is a useful starting gate, not a relevance guarantee. Across
the 47 labeled query-answer pairs, the only target below it is Davenport for
`legal slave port` (0.333). Hybrid recovers that answer lexically. Conversely,
the pirate query admits Khar-Dune (0.416) and Skardgard (0.407), neither establishing
piracy merely from this match. Nonsense `quasarxylophone` returns zero candidates.
Retain 0.35 for now; a lower threshold would need a separate held-out precision/
recall study rather than tuning to the Davenport example. The counts above are
before the five-result projection; long-tail candidates can exceed the threshold.

## Inspected derived documents

The player and narrator samples are identical because all current entities authorize both audiences. Text is derived from canonical names, aliases, type, visible parent, summary/content and features. No new synonyms or hidden fields were added. Relationship/feature prose retains canonical qualifications. Hidden entity/parent/owner behavior is separately covered by offline visibility tests, including the actual mocked Voyage HTTP body.

### blackwater

```text
Name: Blackwater
Aliases: The Unchained Haven
Type: location
Parent: West
Summary: Blackwater, The Unchained Haven, is a criminal maritime enclave on West's southwestern coast, outside effective normal direct West control.
Its dark coastal/cliff environment supports a persistent maritime criminal culture. Conventional state governance is weak or absent, but power exists in fragmented, unstable competition among smuggling interests, pirate captains, and criminal cartels. Black-market commerce includes fencing stolen goods, illegal slave traffic, transfer or sale of unregistered or stolen captives, and people kidnapped from neighboring nations. Geographic containment in West does not imply effective direct political control. Calderan dislikes and distrusts Blackwater but pragmatically tolerates some of its existence for dirty economic value, absorption of crime, indirect maritime defense/interdiction, and keeping worse external threats at distance. Tolerance is not lawful endorsement or a formal treaty. Blackwater's persistent maritime/commercial rivalry with Sandspear involves Sorrow Sea and Chained Bay routes, smuggling, piracy/corsair activity, protection rackets, captured cargo, slave traffic, and wartime spoils. Their ships sometimes fight bloody naval engagements; this is not formal West–Center naval war, and no winner is predetermined.
Feature: de facto autonomy. Outside effective normal direct West control, despite geographic containment within West.
Feature: fragmented criminal governance. Competing smuggling interests, pirate captains, and criminal cartels exercise unstable power; no formal council is established.
Feature: illegal maritime trade. Black-market trade, stolen goods, kidnapping, and illegal/unregistered slave traffic.
Feature: maritime rival. Sandspear
```

### frostspire

```text
Name: Frostspire
Type: location
Parent: East
Summary: Frostspire is an iron-and-coal mining center and military frontier garrison in western/northwestern East near the Dragon's Teeth Mountains.
Near the Center–East frontier zone, Frostspire stands on a rocky spur, dominated by a tall fortified keep surrounded by snowy peaks. Its dual role combines major mining with military frontier duty. Patrols actively prevent West–Center violence from spreading into East, helping enforce strong regional armed neutrality. Frontier forces may repel incursions or armed groups regardless of which side they originate from. This establishes neither an alliance nor friendship with West or Center, and does not define East's entire foreign policy.
Feature: rocky spur and fortified keep. A tall fortified keep dominates the settlement on a rocky spur amid snowy peaks.
Feature: iron and coal mining. Major mining activity extracts iron and coal.
Feature: military frontier garrison. Patrols prevent West–Center violence from entering East.
Feature: armed neutrality. Frostspire enforces East's neutral stance toward the West–Center conflict, repelling incursions from either side when necessary.
```

### inquisition

```text
Name: Inquisition
Type: faction
Parent: Church
Summary: The Inquisition is a powerful, feared national organ of the Church.
The Inquisition is institutionally intimidating and can operate through local presence when necessary. It may take interest in exceptional magic, Light/Shadow users, matters considered dangerous or religiously significant, and other issues later defined by doctrine. Its authority, secrecy, reputation, and power make it feared. Legal powers remain undefined; it is not established as omnipotent, unopposed, or purely evil. Interest and intervention depend on circumstances, not an automatic response to every rare spell.
```

### magic_subschools

```text
Name: Magical Subschools
Type: world_lore
Summary: Primary magical traditions can contain specialized subschools, styles, and branches.
Water-associated Ice or Tidal styles, Air-associated Wind, and Fire-associated Ash or Cinder are illustrative possibilities, not an exhaustive canonical taxonomy. New subschools may emerge during play. A mage need not belong to exactly one subschool.
```

### sandspear

```text
Name: Sandspear
Type: location
Parent: Center
Summary: Sandspear is a southern Center desert/coastal stronghold centered on a massive solitary black-basalt tower, with corsair and mercenary-mariner activity.
The defining tower rises from the desert near the coast in far southern Center. Sandspear is violent and lightly regulated, dominated by navigator guilds/groups and warlords without a fixed detailed government. Its economy spans piracy, corsair warfare, mercenary service, and maritime disruption. Zul-Rath may employ or tolerate its forces to harass shipping and disrupt West trade without formal national war; not every corsair is a direct government soldier. Sandspear persistently rivals Blackwater over Chained Bay, Sorrow Sea, and nearby trading lanes. Competition includes smuggling, piracy/corsair action, extortion/protection, captured cargo, slave trafficking, and wartime spoils, sometimes producing bloody naval engagements. This rivalry does not establish formal West–Center naval war or a predetermined winner.
Feature: solitary black-basalt tower. A massive solitary black-basalt tower rises from the desert and defines the settlement.
Feature: corsair and mercenary-mariner stronghold. Violent, lightly regulated maritime activity spans piracy, corsair warfare, mercenary service, and shipping disruption.
Feature: navigator groups and warlords. Dominant social actors without a fully defined or rigid city government.
Feature: maritime rival. Blackwater
```

## Verification and boundaries

Offline: `npm test` passed **283/283** with `VOYAGE_API_KEY` removed from the test process. `npm run typecheck` passed. All adapter tests use fake credentials and injected fetch; tests make no Voyage calls.

Online: two independent query smoke probes succeeded; `npm run eval:retrieval -- --paced-voyage` built both real indexes and completed all three modes. The player hybrid verification returned church, inquisition, calderan, city_guard, light_and_shadow. No fallback was counted as a measured semantic result.

The adapter validates count, unique response indices, dimensions, finite nonzero vectors, and uses existing normalization. It sorts response rows by index, sets truncation false, bounds transport time, honors cancellation, and sanitizes HTTP/network errors. It does not retry automatically. Credentials are private; raw response errors and authorization headers are not logged by runtime code. No dependencies were added. No canon, narrator/OpenRouter, runtime, persistence, or vector database work was performed.
