# Calderan canonical city map / spatial graph pass 2

2026-10-01. Implemented and verified offline. No commit, push or live provider call.
Existing uncommitted character-continuity/household work was preserved and extended.

## A. Final-map interpretation

Directly inspected `C:\Users\be_fr\CaldrevanRPG\city_map\city_map.png`, without OCR.
The PNG is now the authoritative visual spatial source, with the explicitly locked
text taking precedence over contradictory image labels. The outer wall is an
irregular rounded rectangle; Center is an inner oval/circular enclosure. Heartstone
is southwest; Main Market is inner-facing West; the river runs northwest–southeast.
See [current spatial canon](../authoring/CALDERAN_SPATIAL_CANON.md).

**Visible contradictions are recorded, not hidden:** the image includes outer
“WEST GATE” and “EAST GATE” labels and calls the river “THE CALDER”. Those labels
are superseded by the requested two-outer-gate canon and Grey Brook name. The
original PNG is preserved. Unlabelled road/wall intersections do not authorize
extra gates: cross-wall travel is funnelled through the two locked Center gates.

## B. Superseded old canon

| Earlier spatial assertion | Current canon |
|---|---|
| Four outer cardinal gates; other three gates besides Imperial | Exactly North Gate and Imperial Gate |
| Four Center gates and possible minor service access | Exactly West Gate and East Gate; no alternative pedestrian edges |
| Heartstone in northwestern West | Heartstone in southwestern peripheral West |
| Roughly oval city footprint | Irregular rounded-rectangular outer enclosure |
| River diagonal but route/crossings undefined | Northwest entry, Center crossing, southeast exit; four bridge nodes |
| Roads and routes not established | Authored red-road graph and important green/local access links |
| White Basin and western tavern positions undefined | Map-relative southwest/northwest/market placements in YAML |
| Walking estimates do not establish routes | Approximate calibration constraints; deterministic edge sums |
| Shops parented to square to mean “on the square” | Shops parented to West, connected to square; fountain remains contained |
| Back-Back Alleys parented to Back Alleys to mean “beyond” | West sibling, reached by explicit Back Alleys connection |
| Market-to-Heartstone carrying must block; harness relocates both | Real city route, no harness move, 21 minutes to LR |

Non-spatial lore, NPC identities, criminal transport, institutions, laws and
Heartstone interior topology are preserved. Earlier evaluation reports remain
historical records; current authoring/schema/architecture guidance has been updated.

## C. District geometry

West occupies the western/southwestern wedge below the northwest river reach.
North spans the northern band. East lies outside Center's east wall, northeast of
the lower river. South spans the area below Center and southwest of the lower
river. Center encloses both riverbanks. These are rough irregular extents, not
polygons, coordinates or artificial perfect quadrants. City, districts and tower
remain structural containers, separate from travel nodes.

## D. Outer gates

`north_gate` and existing `imperial_gate` are the only outer land gates. Imperial
is southern and principal, linked to `imperial_road`; North links to
`north_approach`. Exterior approaches are short stubs within the city geography
record's scope, explicitly outside its wall. Distant roads remain unauthored.

## E. Center gates

`center_west_gate` and `center_east_gate` are the only inner-wall entrances. West
connects the Main Market/Gatherer's corridor to Center West Road; East connects
Gilded Row to House of Making and the eastern network. No North/South Center gates
or direct cross-wall river/road shortcuts exist.

## F. Grey Brook

The existing `grey_brook` world-lore ID is retained; it is not duplicated as a
walkable river location. Its course and related bridge IDs are authored. Riverbank
warehouses, legitimate activity and criminal transport survive; no boat system or
covert transit route is invented.

## G. Roads and hierarchy

Red roads become generic western/northern/eastern/southern arterial nodes and the
Center civic connection. Important green corridors use explicit links through
Chevalier Fountain, Gatherer's Inn and eastern/civic hubs. Yellow streets become
short access links rather than individual nodes. Merchants' Mile and Gilded Row
retain their IDs. Clothier Street, Anvil Alley and Glasswork Row become three
Crucible spurs grounded in prior named-street lore. Their exact individual yellow
alignment is not labelled on the map and is not claimed. Imperial Road is the
short southern approach only. Functional bridge/road names introduce no decorative
historical-name lore.

## H. Added/updated location entities

22 new locations: 3 gates, 4 bridges, 10 arterial/local connector/approach road
nodes, 2 exterior road stubs and 3 named specialist streets. More precisely, the
10-road group consists of the four West segments, two North segments, two East
segments, South Arterial and Center West Road; the two exterior stubs are Imperial
Road and North Approach. Existing Imperial Gate is updated, not duplicated.

Existing POIs receive weighted access and concise placement features. Heartstone's
four interior edges retain their original descriptions and adjacency; each takes
one minute, with doors or stairs identified. Heartstone's container explicitly
names LR as its entrance. City and district containers name existing travel hubs
as arrival points. No parent-derived movement exists.

## I. POI placement

The complete 78-record inventory is appended below, with containment, entrance,
placement and all access IDs. District placement is not inferred from filenames.
Main Market's four shops are reachable through square-access edges. Center civic
buildings, North institutions, East guilds/markets and South military/transport
POIs all connect to their own local hubs. West Guard Post and Second Chance Pawn
use compatible prior near-Main-Market lore because the PNG does not legibly label
them. No unmapped exact frontage is invented. Back Alleys -> Back-Back Alleys is
a real traversable chain from Slave Market.

## J. Edge schema

Required: `target`, `description`, positive safe-integer `minutes`. Optional `kind`:
`street`, `road`, `door`, `stairs`, `gate`, `bridge`, `square_access`.
The optional location `entrance` names one authored arrival location for a
container. Validation checks its target type. No traffic, lock, curfew, weather,
follower or permission fields were added.

## K. Travel-time calibration

Visible relative geometry determines corridors; existing 20/30/40-minute lore
calibrates them. Costs are whole minutes, not pixel-distance conversions. Nearby
POIs take a few minutes, major district crossings take tens of minutes. Benchmarks:

| Route | Minutes |
|---|---:|
| Heartstone Square -> Coined Lie | 1 |
| Heartstone Square -> Chevalier Fountain | 15 |
| Heartstone Square -> Slave Market | 20 |
| Heartstone Square -> Main Market Square | 30 |
| Heartstone Square -> Center West Gate | 40 |
| Heartstone Square -> Center West Road | 43 |
| Heartstone Square -> Civil Registry | 47 |
| Heartstone Square -> Open Hand Chapel | 17 |
| Heartstone Square -> Cathedral | 58 |
| Center West Gate -> Center East Gate | 22 |
| Center West Road -> Crucible | 40 |
| Center West Road -> Imperial Gate | 71 |
| North Gate -> Imperial Gate | 97 |
| Slave Market -> Heartstone LR | 21 |

The graph diameter is 106 minutes (East Arterial North to Back-Back Alleys).
The lore says about two hours, possibly less; 97–106 minutes for broad city
crossings is deliberately approximate rather than distorting roads to force 120.
“Heartstone” entry is one minute beyond the square used by the distance anchors.

## L. Multi-hop pathfinding

Pure weighted Dijkstra in `src/world/travel.ts`. Equal costs use the full ordered
node-ID sequence, lexicographically by code point, independent of authored edge
order. Tests verify a cheaper multi-hop path beats a direct edge and equal-cost
ties remain stable after reversing edge order. No model chooses a route. `/go`,
completed natural movement and explicit carry clauses share the resolver.

Exact names, aliases and IDs resolve before conservative contextual mentions.
Bare `go to the Slave Market`, `walk back to Heartstone`, `head to the Cathedral`
and the existing asterisk action forms work. Ambiguous references remain unresolved.

## M. World-time advancement

The route emits one runtime delta with final player location and the summed
minutes. Campaign preparation/finalization makes these atomic with other commands.
Day crossing uses existing time/mana invariants. Tests exercise a 20-minute trip
from minute 1430 to 1450 with exactly one daily recovery. Failed routes, failed
narration and failed carrying charge no time and leave locations unchanged.

## N. Center-wall enforcement

A graph boundary test examines every edge crossing the Center membership set:
its inside endpoint must be West Gate or East Gate. Parent and entrance metadata
do not add edges. The civic bridges stay within Center and cannot bypass its wall.

## O. Outer-wall enforcement

The only edges connecting exterior stubs to enclosed pedestrian locations pass
through North Gate or Imperial Gate. Tests enumerate this boundary and the exact
gate inventory. Neither misleading outer East/West label becomes a node or edge.

## P. Bridge handling

Northwest Bridge and Southeast Bridge connect the outer road arcs over Grey Brook.
Center Bridge carries the internal civic artery. Citadel Bridge is the visible
local crossing connecting the civic bank with Citadel access. Tests require routes
between their bank-side hubs to traverse the expected bridge IDs. River wall
openings are not pedestrian entrances.

## Q. Historical route regressions

All nine requested routes run through `TurnCoordinator` with scripted offline
narrator/controller fixtures, not direct location mutations: Slave Market ->
Heartstone; Heartstone -> Slave Market/Main Market/Registry/Open Hand/Cathedral;
Center -> Crucible/Imperial Gate; North Gate -> Imperial Gate. Each checks route
existence, repeated-route equality, final destination, exact calibrated duration
and returned route diagnostics. Test campaign initialization establishes the
starting scene; all tested travel uses player input.

## R. Full Maren regression

`tests/location-continuity.test.ts` starts at the canonical opening square, walks
to Slave Market using `/go`, and runs the narrator-created slaver, name exchange
(Oswin), promotion, Maren naming/promotion, price negotiation and purchase. Nicco
then explicitly picks Maren up and carries her back to Heartstone through:

`calderan_slave_market -> west_outer_lane (8m) -> heartstone_square (12m)
-> heartstone_lr (1m)`.

Final assertions: Nicco and Maren at `heartstone_lr`; same Maren ID; holder Nicco;
no household membership; Oswin still at market; one seller and one Maren; seller
absent from the arrival scene. Total time advances 21 minutes. The old harness
teleport was removed. Save/load preserves all three locations and legal state.
Additional negative tests verify unreachable and failed carry turns move nobody.

## S. Tomas regression

The chestnut boy becomes Tomas after the name exchange, is healed, and receives
a goodbye. Nicco enters Heartstone alone, then travels to Slave Market and back
to Heartstone Square through the graph. Tomas stays at the square throughout,
appears again on return and remains there after save/load. Neither ownership nor
household membership creates co-movement; existing evidence movement tests remain.

## T. Graph metrics

| Metric | Result |
|---|---:|
| Calderan geography locations (including exterior approach stubs) | 78 |
| Locations added | 22 |
| Total world locations | 96 |
| Directed travel edges | 156 |
| Reciprocal edge pairs | 78 |
| Raw graph connected components | 8 |
| Largest / primary pedestrian component | 71 |
| Isolated structural containers | 7 |
| Isolated concrete POIs | 0 |
| Major unreachable POIs | 0 |

The seven edge-free records are `calderan`, its five districts and `heartstone`.
All have explicit entrances reachable from the 71-node pedestrian component.
Thus there is one connected pedestrian city graph; the eight raw components do
not mean eight disconnected playable areas. Metrics are reproducible using
`node .build/src/dev/inspect-city.js` after build.

## U. Save/load

The save format is unchanged. Travel time, final location, carried-character
location and legal status round-trip through the production serializer/decoder
and campaign restore. No image, coordinates or route cache is persisted.
The existing dataset fingerprint policy remains: saves from the old authored
dataset are not silently migrated across changed canon.

## V. Remaining limitations

This is a topological city model, not polygon navigation. Exact yellow-street
frontages for unlabelled shops, the three named Crucible spurs and minor crossings
remain abstract. Map-label discrepancies are documented and the image is unchanged.
Entry restrictions remain lore, not simulated permissions. No boat travel,
general followers, persistent between-turn carry state, new Heartstone upper
floors, distant road network or old-dataset save migration is introduced. The
regressions verify the real deterministic pipeline with fixture narration; they
do not claim a live model phrasing-quality evaluation.

## W. Tests

- `npm run typecheck`: passed.
- `npm test`: **947/947 passed**, zero failures/skips. Includes authored-data,
  geography, all historical canon/retrieval checks, playthrough, movement,
  transactions/household, campaign preparation, save/load, time/day invariants,
  route-finding, full Maren and Tomas regressions.
- Added `tests/city-travel.test.ts`: historical end-to-end routes, route ordering,
  invalid edge rejection, all-POI reachability, per-location context bounds,
  both wall boundaries, bridges, failed-travel rollback and save/time checks.
- Escape scanner `node .build/scan-escapes.cjs`: no new findings; the two existing
  scanner false positives are the regex-escaping expressions in
  `src/dev/lore-grounding.ts:41` and `src/turn/player-authored-events.ts:58`.
- No provider call was needed. Test output is reproducible with the above commands.

## Required explicit answers

1. **Yes.** `city_map/city_map.png` is the authoritative spatial reference, subject
   to the explicitly locked text overriding its three contradictory labels.
2. **Yes.** Exactly North Gate and Imperial Gate are outer gates.
3. **Yes.** Exactly West Gate and East Gate pierce Center for pedestrian travel.
4. **Yes.** Nicco walks Slave Market -> Heartstone through normal player travel,
   without a harness move or manual location mutation.
5. **Yes.** The trip to LR advances authoritative time by 21 minutes.
6. **Yes.** Explicit carrying brings Maren along the full route to LR.
7. **Yes.** Oswin remains at Slave Market.
8. **Yes.** Ordinary command and natural movement support weighted multi-hop routes.
9. **Yes.** All major mapped POIs are reachable; containers resolve explicit entrances.
10. **Yes.** Runtime reads structured world data and never loads the PNG.

## Complete location inventory

Generated from the validated authored world by `inspect-city`; minutes are outgoing
edge costs. For structural records, arrival names the explicit entrance. Interior
Heartstone placement remains the existing floor canon.

| ID | Container | Arrival / access (minutes) | Placement |
|---|---|---|---|
| `anvil_alley` | `calderan_east` | `the_crucible` 2m | Local craft street opening off the Crucible; its precise yellow-street alignment is not individually labelled on the map. |
| `bastion_of_vigilance` | `calderan_north` | `north_arterial_east` 4m | South of North Gate, north of the red road. |
| `blackiron_repairs_and_arms` | `calderan_west` | `main_market_square` 1m | A practical weapons, armor, repair and metalwork business on Main Market Square. |
| `calderan` | `west` | Entrance: `imperial_gate` | Calderan is the inland capital and largest city of West, the realm's political, economic and institutional center and the main campaign city, governed by the Duke of Calderan in the Sun Emperor's name. |
| `calderan_center` | `calderan` | Entrance: `center_west_road` | Center District is Calderan's political, administrative, noble, financial and prestige district, a roughly circular area behind its own inner wall around the Ducal Citadel, and the best-maintained part of the city. |
| `calderan_civil_registry` | `calderan_center` | `center_west_road` 4m | Western Center on the southwest riverbank, northwest of the Archive. |
| `calderan_east` | `calderan` | Entrance: `the_merchants_mile` | East District is Calderan's manufacturing, industrial-artisan and large-scale commercial heart, a dense low-rise district of workshops, smithies, foundries and craft halls under persistent furnace smoke, and home to The Crucible, the largest market in West. |
| `calderan_north` | `calderan` | Entrance: `north_arterial_west` | North District is Calderan's religious, medical, scholarly and regulated-magic district and its second-wealthiest after Center, built of pale worked stone and white granite around the Cathedral of the Bladed Sun, cloisters, gardens and major Church and Learned Arts institutions. |
| `calderan_slave_market` | `calderan_west` | `west_outer_lane` 8m; `slave_market_back_alleys` 3m | North of Heartstone and Chevalier Fountain, west of the western red arc; Back Alleys lie toward the outer western wall. |
| `calderan_south` | `calderan` | Entrance: `south_arterial` | South District is Calderan's main traveler entrance and its military, security, land-transport and hospitality district, practical and sturdy, around the Imperial Gate, Stonewatch Garrison, the South Gaol, the Long Yard and many inns. |
| `calderan_south_prison` | `calderan_south` | `south_arterial` 4m | North of Stonewatch Garrison and east of Wayfarers Rest. |
| `calderan_west` | `calderan` | Entrance: `west_arterial_south` | West District is a large, dense and socially mixed region of Calderan, with ordinary families, manual labor, workshops, warehouses, cheap businesses and respectable shops alongside poverty, debt, crime and legal slavery-related commerce. |
| `cathedral_of_the_bladed_sun` | `calderan_north` | `north_arterial_west` 4m | North of the northern red road, west of the Bastion. |
| `center_bridge` | `calderan_center` | `center_west_road` 7m; `gilded_row` 5m | Red civic road crosses Grey Brook between the administrative southwest bank and Gilded Row on the northeast bank. |
| `center_east_gate` | `calderan_center` | `gilded_row` 7m; `house_of_making` 4m | The east-facing East Gate in Centers inner wall, west of House of Making. |
| `center_west_gate` | `calderan_center` | `main_market_square` 10m; `gatherers_inn` 17m; `center_west_road` 3m | The southwest-facing West Gate in Centers inner wall, east of Main Market Square and Gatherers Inn. |
| `center_west_road` | `calderan_center` | `center_west_gate` 3m; `center_bridge` 7m; `citadel_bridge` 8m; `calderan_civil_registry` 4m; `ducal_archive` 4m; `high_courts_of_calderan` 2m; `office_of_holdings_and_title` 2m; `fountain_court` 5m | Red civic road inside West Gate, south of the Registry and Courts and north of Holdings; on Grey Brooks southwest bank. |
| `chevalier_fountain` | `calderan_west` | `west_arterial_south` 7m; `gatherers_inn` 8m; `open_hand_chapel` 2m | A recognizable public monument-fountain approximately midway between Heartstone and Main Market Square. |
| `citadel_bridge` | `calderan_center` | `center_west_road` 8m; `ducal_citadel` 4m | Local bridge between the Registry/Archive bank and the Ducal Citadel on Grey Brooks northeast bank. It does not cross the inner wall. |
| `clothier_street` | `calderan_east` | `the_crucible` 2m | Local trade street opening off the Crucible; its precise yellow-street alignment is not individually labelled on the map. |
| `ducal_archive` | `calderan_center` | `center_west_road` 4m | Southwest bank of Grey Brook, east of Registry and north of Fountain Court. |
| `ducal_citadel` | `calderan_center` | `citadel_bridge` 4m; `gilded_row` 7m | Northern part of Center on the northeast riverbank. |
| `east_arterial_north` | `calderan_east` | `north_arterial_east` 22m; `the_merchants_mile` 18m; `house_of_scales` 8m | Red eastern arc northeast of Center, connecting northern roads to the Merchants Mile corridor. |
| `east_arterial_south` | `calderan_east` | `the_merchants_mile` 10m; `southeast_bridge` 8m; `the_crucible` 4m; `the_smelter_pit` 4m | Red eastern arc east of the Crucible, west of the Smelter Pit and south of the Merchants Mile junction. |
| `fountain_court` | `calderan_center` | `center_west_road` 5m | Southern Center, southwest of the river and south of Gilded Row. |
| `fountain_of_the_fallen` | `main_market_square` | `main_market_square` 1m | The central fountain of Main Market Square is a common public meeting landmark. |
| `gatherers_inn` | `calderan_west` | `chevalier_fountain` 8m; `main_market_square` 7m; `center_west_gate` 17m | A respectable-to-middling inn and tavern on the general way between Heartstone and Main Market Square. |
| `gilded_row` | `calderan_center` | `center_bridge` 5m; `center_east_gate` 7m; `ducal_citadel` 7m | Eastern Center on the northeast riverbank. |
| `glasswork_row` | `calderan_east` | `the_crucible` 2m | Local craft street opening off the Crucible; its precise yellow-street alignment is not individually labelled on the map. |
| `gws` | `calderan_west` | `the_dangling_rope` 5m | Near the northwest river entry, north of the Dangling Rope. |
| `heartstone` | `calderan_west` | Entrance: `heartstone_lr` | Heartstone is an old, tall private residential tower of predominantly stone construction. It is vertically organized, structurally solid, and associated with a secluded walled courtyard. |
| `heartstone_cy` | `heartstone` | `heartstone_lr` 1m | Heartstone CY is the tower's secluded outdoor courtyard, enclosed by stone walls and connected directly to LR. It provides space for training, medicinal planting beds, and practical outdoor work. |
| `heartstone_f1` | `heartstone` | `heartstone_lr` 1m | Heartstone F1 is the first upper floor, a sparse open-plan private observation and recovery space with a normal maximum capacity of two patient beds. |
| `heartstone_lr` | `heartstone` | `heartstone_square` 1m; `heartstone_cy` 1m; `heartstone_u1` 1m; `heartstone_f1` 1m | Heartstone LR is the tower's ground-level living floor: one large, rounded, roughly circular open-plan domestic space. Its kitchen and hearth seating area share the same floor without separate internal rooms. |
| `heartstone_square` | `calderan_west` | `heartstone_lr` 1m; `west_arterial_south` 8m; `west_outer_lane` 12m; `the_coined_lie` 1m; `the_white_basin` 3m | Southwest corner of West, east of Heartstone Tower; Coined Lie to the east and White Basin to the southwest. |
| `heartstone_u1` | `heartstone` | `heartstone_lr` 1m | Heartstone U1 is one large stone underground space, broader than LR and the tower floors above. It is partly used for ordinary household storage; much remains comparatively unused and its full extent is not completely understood. |
| `high_courts_of_calderan` | `calderan_center` | `center_west_road` 2m | The High Courts of Calderan are the city's high courts, in the administrative core of the Center District near the Ducal Citadel. |
| `house_of_making` | `calderan_east` | `center_east_gate` 4m; `the_merchants_mile` 12m; `house_of_scales` 7m | The House of Making is the headquarters of the Artisans Guild in Calderan's East District, housing guild administration, certification and the elite shared workshops called the Masterworks. |
| `house_of_scales` | `calderan_east` | `house_of_making` 7m; `east_arterial_north` 8m | The House of Scales is the headquarters of the Merchants Guild in Calderan's East District and the city's main institutional center for organized commerce. |
| `imperial_gate` | `calderan_south` | `south_arterial` 14m; `imperial_road` 3m | The Imperial Gate is Calderan's main southern gate and its largest, best-defended and most heavily inspected land entrance, opening onto the Imperial Road. |
| `imperial_road` | `calderan` | `imperial_gate` 3m | Exterior road immediately south of Imperial Gate; the principal land approach. Its wider course remains unauthored. |
| `livias_needles` | `calderan_west` | `main_market_square` 1m | An ordinary clothing and alterations business on Main Market Square. |
| `main_market_square` | `calderan_west` | `gatherers_inn` 7m; `west_arterial_market` 8m; `center_west_gate` 10m; `the_daily_grind` 1m; `blackiron_repairs_and_arms` 1m; `mudlarks_herbs` 1m; `livias_needles` 1m; `fountain_of_the_fallen` 1m; `west_guard_post` 3m; `second_chance_pawn` 3m | Inner-facing West, east of the western red arc and immediately west of Centers wall. |
| `mudlarks_herbs` | `calderan_west` | `main_market_square` 1m | A common herbal supplies and remedies business on Main Market Square. |
| `north_approach` | `calderan` | `north_gate` 3m | Short exterior approach beyond North Gate. Wider northern routes are not yet authored. |
| `north_arterial_east` | `calderan_north` | `north_arterial_west` 22m; `east_arterial_north` 22m; `bastion_of_vigilance` 4m; `pyres_of_the_fallen` 5m; `spire_academy` 5m; `saint_caldus_house` 6m | Red artery south of the Bastion and Pyres, curving southeast past Saint Caldus House. |
| `north_arterial_west` | `calderan_north` | `northwest_bridge` 9m; `north_arterial_east` 22m; `north_gate` 15m; `cathedral_of_the_bladed_sun` 4m; `the_collegium` 5m | Red artery south of the Cathedral and north of the Collegium, on the northeast bank of Grey Brook. |
| `north_gate` | `calderan_north` | `north_arterial_west` 15m; `north_approach` 3m | The only northern outer-wall land gate, north of the Bastion and Collegium. |
| `northwest_bridge` | `calderan_north` | `west_arterial_north` 9m; `north_arterial_west` 9m | Red road bridge over Grey Brook northwest of Center, linking the western arc with the northern artery. |
| `office_of_holdings_and_title` | `calderan_center` | `center_west_road` 2m | The Office of Holdings and Title is Calderan's office for property holdings and titles, in the administrative core of the Center District. |
| `open_hand_chapel` | `calderan_west` | `chevalier_fountain` 2m | A small, modest charitable parish chapel of the Church of the Sun Emperor near Chevalier Fountain. |
| `pyres_of_the_fallen` | `calderan_north` | `north_arterial_east` 5m | Northeast of Bastion, north of the northern red road. |
| `saint_caldus_house` | `calderan_north` | `north_arterial_east` 6m | East of Spire Academy, north of Centers eastern approach. |
| `saint_orra_house` | `calderan_west` | `the_dangling_rope` 7m; `west_arterial_north` 6m | North of the Slave Market, south of Grey Brook. |
| `second_chance_pawn` | `calderan_west` | `main_market_square` 3m | An ordinary pawnshop near Main Market Square. |
| `slave_market_back_alleys` | `calderan_west` | `calderan_slave_market` 3m; `slave_market_back_back_alleys` 4m | The Back Alleys are a known but taboo trading area behind conventional slave-market activity, not inherently illegal and distinct from the deeper criminal layer. |
| `slave_market_back_back_alleys` | `calderan_west` | `slave_market_back_alleys` 4m | A deeper criminal layer beyond the Back Alleys; many locals know imperfectly that something deeply wrong happens there. |
| `south_arterial` | `calderan_south` | `southeast_bridge` 22m; `west_arterial_south` 22m; `imperial_gate` 14m; `wayfarers_rest` 3m; `the_long_yard` 5m; `calderan_south_prison` 4m; `stonewatch_garrison` 7m | Red southern arc north of the Wayfarers Rest and South Gaol; the Imperial Gate approach joins here. |
| `southeast_bridge` | `calderan_south` | `east_arterial_south` 8m; `south_arterial` 22m | Red southern road bridge across Grey Brook southeast of Center, between the eastern arc and the southern artery. |
| `spire_academy` | `calderan_north` | `north_arterial_east` 5m | East of Collegium and west of Saint Caldus House. |
| `stonewatch_garrison` | `calderan_south` | `south_arterial` 7m | East of Imperial Gate and south of South Gaol. |
| `the_bent_bough` | `calderan_east` | `the_crucible` 3m | North of the Crucible and south of House of Making. |
| `the_coined_lie` | `calderan_west` | `heartstone_square` 1m | The Coined Lie is a low-end, disreputable tavern directly on or adjacent to Heartstone Square. |
| `the_collegium` | `calderan_north` | `north_arterial_west` 5m | South of the northern red road and west of Spire Academy. |
| `the_crucible` | `calderan_east` | `the_merchants_mile` 5m; `east_arterial_south` 4m; `the_bent_bough` 3m; `clothier_street` 2m; `anvil_alley` 2m; `glasswork_row` 2m | The Crucible is the largest market in the entire nation of West: one enormous central market square in Calderan's East District with adjacent specialized commercial streets. |
| `the_daily_grind` | `calderan_west` | `main_market_square` 1m | A general food and household provisions business on Main Market Square. |
| `the_dangling_rope` | `calderan_west` | `west_outer_lane` 16m; `gws` 5m; `saint_orra_house` 7m | Northwest West, near the southwest riverbank. |
| `the_long_yard` | `calderan_south` | `south_arterial` 5m | West of Imperial Gate and south of Wayfarers Rest. |
| `the_merchants_mile` | `calderan_east` | `east_arterial_north` 18m; `east_arterial_south` 10m; `house_of_making` 12m; `the_crucible` 5m | The Merchants' Mile is East District's primary commercial artery, a long busy street of shops, trade offices and craft storefronts that feeds directly into The Crucible. |
| `the_slaughtered_pig` | `calderan_west` | `west_arterial_north` 3m | East of Slave Market and northwest of Main Market Square. |
| `the_smelter_pit` | `calderan_east` | `east_arterial_south` 4m | Southeastern East, northeast of Grey Brook and east of the Crucible. |
| `the_white_basin` | `calderan_west` | `heartstone_square` 3m | Southwest of Heartstone Square beside the outer wall. |
| `wayfarers_rest` | `calderan_south` | `south_arterial` 3m | The Wayfarer's Rest is a large, mid-range, heavily trafficked inn in Calderan's South District. |
| `west_arterial_market` | `calderan_west` | `west_arterial_south` 14m; `west_arterial_north` 14m; `main_market_square` 8m | Red western arc east of the Slave Market and west of Main Market Square; north of the Chevalier junction. |
| `west_arterial_north` | `calderan_west` | `west_arterial_market` 14m; `northwest_bridge` 9m; `saint_orra_house` 6m; `the_slaughtered_pig` 3m | Red western arc east of Saint Orra and the Slaughtered Pig, approaching the northwest river bridge. |
| `west_arterial_south` | `calderan_west` | `heartstone_square` 8m; `west_arterial_market` 14m; `south_arterial` 22m; `chevalier_fountain` 7m | Red road junction northeast of Heartstone and south of Chevalier Fountain. The diagonal southwest approach joins the western arc here. |
| `west_guard_post` | `calderan_west` | `main_market_square` 3m | The principal West District City Guard post, near Main Market Square. |
| `west_outer_lane` | `calderan_west` | `heartstone_square` 12m; `calderan_slave_market` 8m; `the_dangling_rope` 16m | Red outer western corridor beside the Back Alleys; ends at the south bank of Grey Brook near the Dangling Rope. No outer West gate exists. |
