# Calderan city travel graph: audit

2026-10-01. **Audit only.** No canon YAML, connections, runtime code or tests were changed. Read-only inputs:
- the loaded world (`loadWorld("data")`);
- the location, world-lore and character YAML;
- `src/world/validation.ts`, `src/types/entities.ts`, `src/turn/natural-actions.ts`, `src/turn/player-intent.ts` and `src/world/runtime-domain.ts`;
- the historical playthrough CSV, as evaluation evidence only.

Non-mutating validation (`authored-data` and `geography` tests) passes 25/25, and `git status data/` is clean. Nothing is committed or pushed.

## A. Executive summary

- **What exists.** The world has **74 locations, 56 of them in Calderan**: the city, 5 districts and 50 places.
- **Almost nothing is connected.** Calderan has **10 directed edges**, forming 5 two-way pairs:
  - 8 are inside Heartstone (square ↔ living floor; living floor ↔ courtyard, cellar and first floor);
  - 2 join the Merchants' Mile and The Crucible.
- **49 of the 56 Calderan locations have no connections at all**, including the Slave Market, Main Market Square, every gate, every district and every institution. From Heartstone Square the player can only enter the tower.
- **Parent and connections mean different things, and the data follows that rule.** Parent is structural containment; connections are travel. In three places a parent stands in for "on" or "beyond" adjacency (§L).
- **Geography canon is thin but real.** It gives a city shape, a district ring, gates, walking times from Heartstone, a few "near" and "midway" relations, and a river crossing diagonally. That supports a coherent **West-district skeleton** and a district-level city ring. It does **not** fix street layout, the direction of the Slave Market from Heartstone, the positions of three of the four cardinal gates, or Grey Brook's course.
- **The schema can model roads.** A road can be an ordinary location; the Merchants' Mile already is one.
- **What edges and movement lack:**
  - edges have no duration, distance or kind, and unknown edge fields are rejected;
  - movement is single-hop only, with no pathfinding;
  - travel never advances time.

## B. Full location inventory (Calderan)

`out` and `in` are direct connections. Every location not listed with edges has `out = in = none`. Types are read from authored prose (container, square, street, building, shop, institution, landmark, interior).

| ID | Display name | Parent | Type (from prose) | Aliases | Edges |
|---|---|---|---|---|---|
| `calderan` | Calderan | west (nation) | city container | — | none |
| `calderan_west` | Calderan West District | calderan | district container (16 children) | Calderan West District | none |
| `calderan_east` | Calderan East District | calderan | district container (6) | ″ | none |
| `calderan_north` | Calderan North District | calderan | district container (6) | ″ | none |
| `calderan_south` | Calderan South District | calderan | district container (5) | ″ | none |
| `calderan_center` | Calderan Center District | calderan | district container (7), walled | ″ | none |
| `heartstone` | Heartstone | calderan_west | building container (tower; 4 children) | — | none (entered via children) |
| `heartstone_square` | Heartstone Square | calderan_west | square (residential, minor) | square/public square outside Heartstone, Outside Heartstone | ↔ heartstone_lr |
| `heartstone_lr` | Heartstone LR | heartstone | interior | living room, ground floor, LR | ↔ square, cy, u1, f1 |
| `heartstone_cy` | Heartstone CY | heartstone | interior (courtyard) | secluded courtyard, CY | ↔ lr |
| `heartstone_u1` | Heartstone U1 | heartstone | interior (cellar) | underground level, cellar, basement, U1 | ↔ lr |
| `heartstone_f1` | Heartstone F1 | heartstone | interior (first upper floor) | observation/recovery floor, F1 | ↔ lr |
| `main_market_square` | Main Market Square | calderan_west | square **and** container (5 children) | market square | none |
| `the_daily_grind` | The Daily Grind | main_market_square | shop | — | none |
| `blackiron_repairs_and_arms` | Blackiron Repairs & Arms | main_market_square | shop | Blackiron | none |
| `mudlarks_herbs` | Mudlark's Herbs | main_market_square | shop | Mudlark | none |
| `livias_needles` | Livia's Needles | main_market_square | shop | — | none |
| `fountain_of_the_fallen` | Fountain of the Fallen | main_market_square | landmark (center of square) | — | none |
| `second_chance_pawn` | Second Chance Pawn | calderan_west | shop | — | none |
| `west_guard_post` | West Guard Post | calderan_west | institution | — | none |
| `chevalier_fountain` | Chevalier Fountain | calderan_west | landmark | — | none |
| `open_hand_chapel` | The Open Hand Chapel | calderan_west | institution (chapel) | Open Hand Chapel | none |
| `gatherers_inn` | Gatherer's Inn | calderan_west | building (inn/tavern) | — | none |
| `the_coined_lie` | The Coined Lie | calderan_west | building (tavern) | — | none |
| `the_slaughtered_pig` | The Slaughtered Pig | calderan_west | building (tavern) | — | none |
| `the_dangling_rope` | The Dangling Rope | calderan_west | building (tavern) | — | none |
| `gws` | GW's | calderan_west | building (clandestine gambling) | — | none |
| `the_white_basin` | The White Basin | calderan_west | shop (laundry) | White Basin | none |
| `saint_orra_house` | Saint Orra's House | calderan_west | institution (orphan shelter) | — | none |
| `calderan_slave_market` | Calderan Slave Market | calderan_west | square complex (market) | Slave Pens, West District/Calderan slave pens | none |
| `slave_market_back_alleys` | The Back Alleys | calderan_west | public area (container, 1 child) | Back Alleys, Slave-Market Back Alleys | none |
| `slave_market_back_back_alleys` | Back-Back Alleys | slave_market_back_alleys | public area (criminal layer) | the back-back | none |
| `the_crucible` | The Crucible | calderan_east | square (largest market in West) | — | ↔ the_merchants_mile |
| `the_merchants_mile` | The Merchants' Mile | calderan_east | street (commercial artery) | Merchants' Mile | ↔ the_crucible |
| `house_of_scales` | The House of Scales | calderan_east | institution (Merchants Guild headquarters) | House of Scales | none |
| `house_of_making` | The House of Making | calderan_east | institution (Artisans Guild headquarters) | House of Making | none |
| `the_bent_bough` | The Bent Bough | calderan_east | shop | Bent Bough | none |
| `the_smelter_pit` | The Smelter Pit | calderan_east | industrial sector (area) | — | none |
| `cathedral_of_the_bladed_sun` | The Cathedral of the Bladed Sun | calderan_north | institution / landmark | Cathedral of the Bladed Sun | none |
| `bastion_of_vigilance` | The Bastion of Vigilance | calderan_north | institution (Inquisition headquarters) | Bastion of Vigilance | none |
| `the_collegium` | The Collegium | calderan_north | institution (Learned Arts Guild, Mage Registry) | — | none |
| `spire_academy` | The Spire Academy | calderan_north | institution | Spire Academy | none |
| `saint_caldus_house` | Saint Caldus House | calderan_north | institution (main hospital) | — | none |
| `pyres_of_the_fallen` | The Pyres of the Fallen | calderan_north | institution (cremation) | Pyres of the Fallen | none |
| `imperial_gate` | The Imperial Gate | calderan_south | gate | Imperial Gate | none |
| `stonewatch_garrison` | Stonewatch Garrison | calderan_south | institution (military/Guard) | — | none |
| `calderan_south_prison` | Calderan South Prison | calderan_south | institution (prison) | The South Gaol, South Gaol | none |
| `the_long_yard` | The Long Yard | calderan_south | yard (caravans) | — | none |
| `wayfarers_rest` | The Wayfarer's Rest | calderan_south | building (inn) | Wayfarer's Rest | none |
| `ducal_citadel` | The Ducal Citadel | calderan_center | institution / landmark | Ducal Citadel | none |
| `calderan_civil_registry` | Calderan Civil Registry | calderan_center | institution | Civil Registry | none |
| `ducal_archive` | The Ducal Archive | calderan_center | institution | Ducal Archive | none |
| `high_courts_of_calderan` | The High Courts of Calderan | calderan_center | institution | High Courts | none |
| `office_of_holdings_and_title` | Office of Holdings and Title | calderan_center | institution | — | none |
| `fountain_court` | Fountain Court | calderan_center | square (small civic) | — | none |
| `gilded_row` | Gilded Row | calderan_center | street (prestige retail) | — | none |

**Non-Calderan (18).** `continent`, `west`, `east`, `center` (nations), `blackwater`, `davenport`, `ironbound`, `frostspire`, `skardgard`, `vaelrost`, `khar_dune`, `sandspear`, `zul_rath`, `dragons_teeth_mountains`, `chained_bay`, `mist_sea`, `sorrow_sea`, `silent_ocean`. None has connections.

**Named but not location entities:**
- Heartstone floors **F2–F6** (named in the spiral-stair prose);
- the lower stairs beyond U1 ("unexplored");
- Grey Brook (world lore only) and its unnamed bridges;
- the Imperial Road;
- Clothier Street, Anvil Alley and Glasswork Row (named Crucible streets);
- the three non-Imperial cardinal gates;
- Center's four inner-wall gates.

## C. Graph metrics (Calderan, 56 locations)

| Metric | Value |
|---|---|
| Locations | 56 (city 1, districts 5, places 50) |
| With ≥ 1 outgoing connection | 7 (heartstone_square, heartstone_lr, heartstone_cy, heartstone_u1, heartstone_f1, the_merchants_mile, the_crucible) |
| With 0 outgoing | 49 |
| With 0 incoming | 49 (the same 49) |
| Directed edges | 10 |
| Bidirectional pairs | 5 (square↔LR, LR↔CY, LR↔U1, LR↔F1, Mile↔Crucible; every edge has its reverse) |
| One-way edges | 0 |
| Self-edges | 0 |
| Invalid or missing targets | 0 (world validation rejects them; duplicate targets per node are rejected too) |
| Connected components | 2 non-trivial, plus 49 singletons |

The other 18 (non-Calderan) locations have no edges, so these are also the whole world's figures.

## D. Existing connected components

1. **Heartstone (largest, 5 nodes):** `heartstone_square`, `heartstone_lr`, `heartstone_cy`, `heartstone_u1`, `heartstone_f1`, joined by 4 two-way pairs (8 directed edges).
2. **East artery (2 nodes):** `the_merchants_mile` ↔ `the_crucible` (2 directed edges).
3. **49 singletons:** every other Calderan location, including all 5 districts and the city container.

**Total:** 8 + 2 = 10 directed edges in 5 two-way pairs, matching §C.

## E. Heartstone graph

```
heartstone_square
  -> heartstone_lr      "Heartstone's massive main entrance door leads directly into LR."
heartstone_lr
  -> heartstone_square  "The massive main entrance door leads out to the public square directly outside Heartstone."
  -> heartstone_cy      "The normal courtyard door roughly opposite the main entrance provides direct access to CY."
  -> heartstone_u1      "The large visible hatch near the kitchen side and separate descending access lead to U1."
  -> heartstone_f1      "A normal perimeter doorway/opening leads into the continuous lateral spiral stair, which rises to F1."
heartstone_cy
  -> heartstone_lr      "The normal door provides direct access from the courtyard to LR."
heartstone_u1
  -> heartstone_lr      "Separate ascending access leads back to the large visible hatch in LR."
heartstone_f1
  -> heartstone_lr      "The continuous lateral spiral staircase descends to the perimeter stair access in LR."
```

- **Container entry.** `heartstone` is the container and has no edges of its own; "go to Heartstone" enters through its single connected child (`heartstone_lr`).
- **Not authored:**
  - **F2–F6** exist only in prose: "the spiral staircase rises … through F1, F2, F3, F4, F5, and F6", and F1 "continues upward toward F2". F1 has no upward edge.
  - **U1's lower stairs** are "unexplored", with their destination "unknown and undefined".
  - **CY to the outside:** the courtyard door is "the only currently established normal direct access between LR and CY". No courtyard-to-street access is authored.
- **Exterior.** `heartstone_square` has no edge other than into the tower.

## F. West District graph

**Connectivity.** All 16 West children except the Heartstone pair are isolated: no in or out edges.

**Authored spatial relations:**

| Place | Authored relation (quoted or paraphrased) | Precision |
|---|---|---|
| Heartstone | "lies in north-western, more peripheral West" (`calderan_west`, `heartstone`) | approximate |
| Heartstone Square | immediately outside Heartstone; "primarily residential"; quieter than Main Market Square | precise (adjacency) |
| The Coined Lie | "directly on or adjacent to Heartstone Square" / "faces or directly adjoins the square" | precise-ish |
| The White Basin | "near Heartstone", "without an established position directly on the square"; position relative to the square unestablished | approximate |
| Main Market Square | "in the more prosperous, inner-facing part [of West]", "toward Center", "approximately 30 minutes on foot from Heartstone"; "the walking estimate establishes no exact route" | approximate |
| Shops on Main Market Square | the Daily Grind, Blackiron, Mudlark's and Livia's are "on Main Market Square" (also its children) | precise (on the square) |
| Fountain of the Fallen | "central fountain of Main Market Square", "at the center" | precise |
| Second Chance Pawn | "near Main Market Square" | approximate |
| West Guard Post | "near Main Market Square" | approximate |
| Chevalier Fountain | "approximately midway between Heartstone and Main Market Square" | approximate |
| Open Hand Chapel | "near Chevalier Fountain" | approximate |
| Gatherer's Inn | "on the general way between Heartstone and Main Market Square" | approximate |
| Calderan Slave Market | "about 20 minutes' walk from Heartstone"; "another major economic center farther through West"; very large square, larger than Main Market Square | approximate (direction undefined) |
| The Back Alleys | "behind conventional slave-market activity" | approximate |
| Back-Back Alleys | "a deeper criminal layer beyond the Back Alleys"; warehouses near Grey Brook used for illicit transport | approximate |
| Saint Orra's House | "in outer West, broadly near but not directly adjacent to Calderan Slave Market" | approximate |
| The Slaughtered Pig, The Dangling Rope | "exact position within West [is] unestablished" | none |
| GW's | a known taboo gambling place in West; no position | none |
| Grey Brook | "cuts through a substantial part of West, with small bridges and warehouses along parts of its banks" | approximate |

**Walking times from Heartstone** (all approximate, "do not establish precise routes"): Slave Market 20 minutes, Main Market Square 30 minutes, Center District 40 minutes.

## G. East District graph

- **Only connection:** `the_merchants_mile ↔ the_crucible` ("runs directly into").
- **Hubs:** The Crucible (largest market in West, an enormous central square with adjacent named streets: Clothier Street, Anvil Alley, Glasswork Row) and the Merchants' Mile (primary commercial artery).
- **Isolated:** House of Scales and House of Making ("stand in East"), the Bent Bough ("its exact street … not established"), and the Smelter Pit ("slightly lower than the surrounding East District").
- **No gates or entry points are authored.**

## H. North District graph

- **No connections.** Places: Cathedral of the Bladed Sun ("dominates North visually"), Bastion of Vigilance, The Collegium, Spire Academy ("near … The Collegium"), Saint Caldus House, Pyres of the Fallen.
- **Physical character:** cloisters, gardens and parks ("more … public space than the other outer districts").
- **Hubs:** the Cathedral is the obvious visual and institutional anchor.
- **Placement:** only Spire Academy near the Collegium is authored.

## I. South District graph

- **No connections.** Places: **Imperial Gate** (southern cardinal gate, opens onto the Imperial Road; the main land entrance), Stonewatch Garrison, the South Gaol, the Long Yard (caravan staging), and the Wayfarer's Rest.
- **Placement:** the district is described as "around the Imperial Gate, Stonewatch Garrison, the South Gaol, the Long Yard and many inns". No internal placement is authored.
- **Hubs and entry:** the Imperial Gate is the city's only authored gate entity; the Long Yard is the transport hub.

## J. Center District graph

- **No connections.** Center is "roughly circular … behind its own inner wall around the Ducal Citadel", and four inner-wall gates are "broadly aligned with the major directions" (feature only, not entities).
- **Places:**
  - the **Ducal Citadel** at the core;
  - Civil Registry, Ducal Archive, High Courts, and Office of Holdings and Title, all "in the administrative core near the Ducal Citadel";
  - **Fountain Court** (small civic square);
  - **Gilded Row** (principal prestige retail street).
- **Hubs:** the Citadel, Fountain Court, and the four inner gates (not entities).

## K. Existing geographic canon

| # | Statement | Source | Constrains | Precision |
|---|---|---|---|---|
| 1 | Very large, dense walled metropolis; "roughly oval walled city has four outer districts surrounding Center" | `main_city_structure` (world lore), `calderan` | ring topology: West, East, North and South surround Center | approximate |
| 2 | "Center is enclosed by an older inner wall"; roughly circular; four inner-wall gates broadly aligned with major directions | `calderan`, `calderan_center` | Center access goes through 4 inner gates (plus minor service access) | approximate |
| 3 | Four cardinal main gates in the outer walls; the Imperial Gate (south) is largest; the other three handle local or specialized traffic | `calderan` (feature "four cardinal gates"), `imperial_gate` | 4 outer gates, one per cardinal direction; only the Imperial Gate is named | precise count, positions cardinal |
| 4 | Imperial Gate in South opens onto the Imperial Road; the road's wider course and network are not established | `imperial_gate`, `calderan_south` | South Gate = city land entrance | precise |
| 5 | Crossing most of the city cardinal-to-cardinal on foot takes about two hours, possibly less | `calderan`, `main_city_structure` | city scale (~2 h diameter) | approximate |
| 6 | From Heartstone: ~30 min to Main Market Square, ~40 min to Center District, ~20 min to the Slave Market; no precise routes | `main_city_structure`, `calderan`, `main_market_square`, `calderan_slave_market` | relative distances | approximate |
| 7 | Heartstone lies in north-western, more peripheral West | `calderan_west`, `heartstone` | Heartstone's position in West | approximate |
| 8 | Main Market Square: inner-facing West, toward Center | `calderan_west`, `main_market_square` | MMS lies between outer West and Center | approximate |
| 9 | Slave Market: "farther through West" | `calderan_west` | direction ambiguous (farther from Center? from Heartstone?) | vague |
| 10 | Chevalier Fountain about midway Heartstone–MMS; Gatherer's Inn on the general way Heartstone–MMS; Open Hand Chapel near Chevalier Fountain | respective records | a Heartstone–MMS corridor with waypoints | approximate |
| 11 | Pawn and Guard Post near MMS; the four businesses and the fountain on or at MMS | respective records | MMS cluster | approximate / precise |
| 12 | Coined Lie on or adjacent to Heartstone Square; White Basin near Heartstone | respective records | Heartstone cluster | approximate |
| 13 | Saint Orra in outer West, near but not adjacent to the Slave Market; Back Alleys behind the market; Back-Back beyond the Back Alleys | respective records | Slave Market cluster; the market is in outer West by implication | approximate |
| 14 | Grey Brook: a principal river crossing Calderan **diagonally**, through a substantial part of West; small bridges; warehouses on banks | `grey_brook`, `calderan_west` | a river, bridges and warehouses in West; diagonal axis unspecified | vague |
| 15 | Toward Center streets improve; toward outer West maintenance declines | `calderan_west` | a gradient (social, not geometric) | approximate |
| 16 | The Merchants' Mile feeds directly into The Crucible; specialized streets adjoin it | `the_merchants_mile`, `the_crucible`, `calderan_east` | an East artery | precise |
| 17 | Smelter Pit slightly lower-lying in East; Cathedral dominates North visually; Spire Academy near the Collegium; Center institutions near the Citadel | respective records | local clusters | approximate |
| 18 | "Crossing substantial parts of a district is meaningful travel; no exact roads or navigation routes are established" | every district record | **explicitly leaves roads undefined** | n/a |

**Not canon:** "Heartstone near West Gate". No West Gate entity or statement exists. The historical narration placed one between the tannery lots and Heartstone (§S), but that is evaluation evidence, not canon.

## L. Structure-versus-travel findings

The rule (parent = containment; connections = travel; "hierarchy alone does not imply access") is **respected in code**, and in data with these observations:

1. **Parent standing in for adjacency.**
   - `main_market_square` is the parent of four shops and the fountain. The prose says the shops are **on** the square (fronting it), not inside it, so the parent here encodes "on the square", not containment.
   - `slave_market_back_back_alleys` has parent `slave_market_back_alleys` with prose "beyond the Back Alleys": a travel or adjacency relation expressed as containment.
   - `slave_market_back_alleys` is a child of `calderan_west`, not of the Slave Market, although it is "behind" it.
2. **Nested but unreachable.** Every child of every district, the 5 Main Market Square children, and the Back-Back Alleys can only be reached by an edge that doesn't exist. No interior or building outside Heartstone has any access edge.
3. **Interior without usable external access.** Heartstone CY has no access except to LR. F1 has no upward edge, though F2–F6 are described. U1's lower stairs lead nowhere authored.
4. **Districts with places but no network.** West (16 children), Center (7), North (6), East (6, one pair) and South (5) have no internal network, and no district connects to any other.
5. **Squares that are also containers.** `main_market_square` is both a travel destination and a container. With current movement code, "go to the market square" works only if it is directly connected; containers are entered through exactly one connected child.

## M. Road and street schema capabilities

| Question | Answer (from `src/types/entities.ts` and `src/world/validation.ts`) |
|---|---|
| Can a road be an ordinary location? | **Yes.** `the_merchants_mile` and `gilded_row` already are. |
| Can a road connect many locations? | **Yes.** `connections` is an array of targets (no duplicate target per node). |
| Are connections directed only? | **Yes.** "Directed traversable edges"; two-way travel needs two edges. |
| Travel duration on an edge? | **No.** Edges are `{target, description}` only, and validation rejects unknown edge keys (`edges(…, kind=false)`). |
| Distance on an edge? | **No.** |
| Edge metadata? | Only `description` (free text). There is no kind (door, street, gate, bridge), and no conditions (locked, curfew, writ). |
| Street names as aliases? | **Yes.** `aliases` is free text, resolved by name/alias mention and head nouns. |
| Can a road contain sub-locations? | **Yes, structurally** (`parent`), but children are not reachable without edges. |
| Building → street → square/gate chains? | **Yes.** Any location can connect to any location; there is no type restriction on edges between locations. |

**Smallest missing capabilities** (not implemented):
1. Optional edge metadata: at least `minutes` (travel time) and optionally `kind` (door, street, gate, bridge).
2. A resolver able to travel more than one edge per action.

The graph shape itself needs no new schema.

## N. Travel-time support

- **Connections have no duration.**
- **Player movement never advances world time.** Natural movement and `/go` emit only `runtime_delta {player_location}`; `time_advance_minutes` comes only from `/wait N` or the "\*he spent N hours …\*" form.
- **Walking times exist only in lore prose** (§K, rows 5–6).
- **`/go` changes only location.**
- **There are no multi-edge routes**, and movement requires direct adjacency, apart from the container rule (§O).
- **`prepareRuntimeDelta` does not itself check connections.** Any valid location is accepted at the runtime layer, and adjacency is enforced only in the intent layers (`/go`, natural movement). That is why harness steps can place the player anywhere.

## O. Current movement resolver behaviour

- **`/go X`** (and "I go to / downstairs to / upstairs to X", `player-intent.ts`): `X` must be a **direct connection** of the current location; otherwise the turn fails with `invalid_runtime_intent`. It is single-hop.
- **Natural movement** ("walks to …", `natural-actions.ts`):
  - `resolveDestination` matches a location by name or alias mention, or by a unique head noun within the current city ("the square" → `heartstone_square`; "Heartstone Square" from inside the tower is ambiguous with `heartstone` and resolves to nothing).
  - `reachable` then requires either a direct connection, or a **container** destination with exactly one connected child (`heartstone` → `heartstone_lr` from the square).
  - Otherwise movement is **blocked**: the narrator is told Nicco set out but has not arrived, and nothing moves.
- **No shortest-path or pathfinding logic exists anywhere.**
- **Districts and containers:** reachable only through the one-connected-child rule. With no district edges, "go to Center" is blocked.
- **Entrances** are ordinary edges with descriptive text; there is no door or lock state.
- **Pass 1.3 carrying** reuses `reachable` (no route, no carry).

## P. Map-readiness classification (no coordinates)

**A. Strongly placeable** (relative position authored):
- **Heartstone cluster:** Heartstone, Heartstone Square, The Coined Lie (on the square), Heartstone interiors (their internal layout is authored).
- **City frame:** Center (roughly circular, walled, at the city's middle), with the Ducal Citadel at its core; the four outer districts as a ring around Center; the Imperial Gate on the southern edge (in South).
- **Main Market Square cluster:** the four shops on it and the Fountain of the Fallen at its center.
- **The Heartstone–MMS corridor:** Chevalier Fountain (midway), Gatherer's Inn (on the way), Main Market Square (~30 minutes, toward Center).
- **East artery:** the Merchants' Mile → The Crucible, plus the named adjoining streets.

**B. Loosely placeable** (district or rough relation known):
- **West:** Calderan Slave Market (~20 minutes from Heartstone, outer West implied by Saint Orra; direction undefined); Saint Orra's House; the Back Alleys and Back-Back Alleys (behind and beyond the market); Second Chance Pawn and West Guard Post (near MMS); Open Hand Chapel (near Chevalier Fountain); The White Basin (near Heartstone).
- **Center:** Civil Registry, Ducal Archive, High Courts, Office of Holdings and Title (near the Citadel); Fountain Court; Gilded Row.
- **North:** Spire Academy (near the Collegium); the Collegium; the Cathedral.
- **East:** the Smelter Pit (lower-lying), the House of Scales, the House of Making.
- **South:** Stonewatch Garrison, the South Gaol, the Long Yard, the Wayfarer's Rest.
- **Grey Brook:** in West, crossing the city diagonally.

**C. Not yet placeable** (no spatial canon beyond the district):
- The Slaughtered Pig, The Dangling Rope, GW's (explicitly unestablished within West);
- The Bent Bough (street not established);
- Bastion of Vigilance, Saint Caldus House, Pyres of the Fallen (North only);
- the three non-Imperial outer gates (existence only);
- Grey Brook's actual diagonal and its bridges;
- the Slave Market's **direction** from Heartstone.

## Q. Hub candidates

These are architectural observations, not canon changes.

| Candidate | Why it is a natural graph node |
|---|---|
| `heartstone_square` | The player's front door; already the only exterior node of the Heartstone component. |
| `main_market_square` | Authored anchor of ordinary West commerce; four shops and a landmark on it, with pawn and guard post near it. A hub-and-spoke center for West. |
| `chevalier_fountain` | Authored midpoint landmark between Heartstone and MMS; a natural waypoint that carries Gatherer's Inn and Open Hand Chapel. |
| `calderan_slave_market` | A very large square and major economic center, with the Back Alleys, Saint Orra and private sellers around it; a player-critical destination. |
| `imperial_gate` | The only authored gate; the city's land entrance and Imperial Road terminus; the South district anchor. |
| The other three cardinal gates (not entities) | Authored to exist, one per direction; natural district-edge nodes (a West Gate would fit outer West, but its position is not authored). |
| Center's four inner-wall gates (feature, not entities) | The authored mechanism for Center access; the natural boundary nodes between Center and each outer district. |
| `fountain_court` / `ducal_citadel` | The civic square and political core of Center. |
| `the_crucible` + `the_merchants_mile` | Already connected; the East commercial spine. |
| `cathedral_of_the_bladed_sun` | Visually dominates North and is its institutional anchor. |
| `the_long_yard` | South's transport and logistics hub. |
| Grey Brook bridges (not entities) | Authored to exist in West; natural crossing nodes if the river becomes a travel barrier. |

## R. Critical disconnected locations

| Location | Problem | Canon says | Undefined |
|---|---|---|---|
| Heartstone Square (exit to the city) | The only exit is into the tower; the player can never leave the Heartstone cluster on foot. | Residential square in NW West, The Coined Lie on it. | Every street out of the square. |
| Calderan Slave Market | Isolated; player-critical (purchases). Pass 1.3 had to use a harness step for the walk home. | ~20 min from Heartstone; outer West; Back Alleys behind; Saint Orra near. | Direction, route, intermediate places. |
| Main Market Square | Isolated; its 5 child businesses are unreachable. | ~30 min from Heartstone, toward Center; Chevalier Fountain midway. | The route and street. |
| West Guard Post, Second Chance Pawn | Isolated. | Near MMS. | Which side or street. |
| Imperial Gate and outer gates | Isolated; no city entry or exit; three gates are not entities. | Four cardinal gates; the Imperial Gate is in South. | The other gates' names and entities; district-to-gate routes. |
| Center (Citadel, courts, registry) | Isolated; legal and administrative play is unreachable. | Inner wall, four inner gates, ~40 min from Heartstone. | Inner-gate entities and approach streets. |
| The Crucible / Merchants' Mile | Connected to each other only; the East spine is unreachable from West. | Largest market in West. | The West–East route. |
| North institutions (Collegium/Mage Registry, Saint Caldus, Cathedral) | Isolated; relevant to Nicco (mage registry, healing). | In North. | Everything positional beyond Spire ↔ Collegium. |
| Heartstone F2–F6, U1 depths | No nodes. | Floors named; stair to F6; U1 stairs unexplored. | Their entities. |

## S. Historical gameplay route gaps (evaluation evidence, not canon)

From the historical playthrough CSV (keyword survey of player and narration lines):

| Route used in play | Current canon support |
|---|---|
| Slave Market → Heartstone (walked twice: after Brenna, and carrying Maren; narration placed a "West Gate" en route) | **None:** no edges; only "~20 minutes" in lore; no West Gate in canon. |
| Heartstone Square ↔ Heartstone interior | **Supported** (square ↔ LR). |
| Heartstone interior floors ("L2 observation room", "L3 master bedroom") | **Partial:** only F1 is an entity; F2+ are prose only. |
| Heartstone → "the temple" (≈ 46 mentions; "the temple up on Ivory Steps") | **None:** no "temple"/"Ivory Steps" entity; North's Cathedral and Saint Caldus exist but are unconnected and not identified with it. |
| To the apothecary ("two streets east, left at the chandler's"; ≈ 13 mentions) | **None:** narrator-invented directions and shop. |
| Private slave lots near the tanneries (Maren's whittler) | **None:** no tannery entity. |
| Docks, river barges, warehouses (≈ 17 mentions) | **Partial:** Grey Brook warehouses are canon (no entity); "docks" are not canon (Calderan is inland). |
| To the smith (halberd) | **Partial:** Blackiron Repairs & Arms exists on MMS, but it is not identified with the historical smith and is unreachable. |
| To Dren's operation (Grey Brook warehouse) | **Partial:** the warehouse base is canon prose; no entity or route. |

## T. Future design options (not chosen)

| | **A. Hub-and-spoke** | **B. Street network** | **C. Hybrid** |
|---|---|---|---|
| Shape | Each district gets 2–4 hub nodes (squares, gates, landmarks); buildings hang off the nearest hub; hubs link to neighbouring hubs and to Center's inner gates. | Named streets as explicit locations; buildings connect to streets; streets to squares, gates and bridges. | Major arteries, squares, gates and bridges explicit; minor buildings attach directly to the nearest hub or artery. |
| Nodes and edges (estimate) | +10–15 nodes (gates, inner gates, a few waypoints); ~120–160 directed edges | +60–120 street nodes; 400+ edges | +25–40 nodes; ~200–260 edges |
| Realism | Low to medium (teleport-like hops between hubs) | High | Medium to high |
| Fit with current movement code | Good: single-hop to a hub or child; still needs multi-hop for hub-to-hub journeys | Poor without pathfinding: dozens of hops per trip | Needs multi-hop for cross-district trips; local moves stay single-hop |
| Map usefulness | Schematic map only | A full drawable city map | A readable district map with main streets |
| Pathfinding usefulness | Simple (small graph) | Essential; good with edge minutes | Good; edge minutes on arteries give believable travel times |
| Canon invention needed | Least: mostly gates and waypoints already implied | Most: almost all street names and layouts are undefined (§K row 18) | Moderate: arteries and bridges need naming |

**Under every option, the existing walking times** (20, 30 and 40 minutes from Heartstone; ~2 hours across the city) would become edge-time constraints if edge metadata is added.

## U. Questions for human decision

1. **Explicit streets.** Should streets be explicit locations (the Merchants' Mile and Gilded Row set a precedent), or only arteries, with buildings attached to hubs?
2. **Attachment.** Should every shop connect to a street, or directly to its square or hub (as the Main Market Square shops sit "on" the square)?
3. **Parent as adjacency.** Should "on the square" stay encoded as parent (MMS children), or should shops become siblings in the district, connected to the square?
4. **Multi-hop travel.** Should `/go` and natural movement eventually travel multi-hop routes automatically (pathfinding), and if so, which time model: one turn per trip, or time advanced per edge?
5. **Travel time on edges.** Should travel time live on edges (`minutes`), and should movement advance world time?
6. **Edge kind and conditions.** Is a door/street/gate/bridge kind needed, plus conditions (curfew, writ, locked)?
7. **Gates.** Should the three unnamed cardinal gates and Center's four inner gates become location entities, and which names and positions (canon decisions)?
8. **Slave Market direction.** Which direction is the Slave Market from Heartstone ("farther through West" is ambiguous), and is there a gate between them as the historical play assumed?
9. **Grey Brook.** Which diagonal does it follow, which districts besides West does it cross, and how many bridge nodes should it have?
10. **Detail.** How detailed should the network be (A, B or C), and do we want a drawable city map generated from the same graph?
11. **Heartstone interior.** Should F2–F6 (and U1's lower stairs) become entities now, given historical play used upper floors?

CALDERAN CITY TRAVEL GRAPH AUDIT COMPLETE
