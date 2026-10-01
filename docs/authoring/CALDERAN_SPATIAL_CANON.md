# Calderan canonical spatial reference

Effective 2026-10-01. Authoritative visual source:
`C:\Users\be_fr\CaldrevanRPG\city_map\city_map.png` (`city_map/city_map.png`).
The image is an authoring source, not a runtime dependency. YAML locations, explicit
entrances and weighted connections are the executable spatial canon.

## Explicit label exceptions

The supplied locked text overrides three contradictory labels in the image:
the outer-wall “WEST GATE” and “EAST GATE” are **not entrances**; the river labelled
“THE CALDER” is **Grey Brook**. No image editing is implied. There are exactly two
outer gates, North Gate and the principal southern Imperial Gate, and exactly two
Center gates, West Gate and East Gate. Apparent unlabelled road/wall intersections
do not create additional entrances. Center-bound roads terminate at the two locked
gate nodes. There is no river navigation or implied pedestrian entrance at a river
opening through either wall.

## Geometry and placement

The outer wall describes a broad irregular rounded rectangle, with a relatively
straight north side, a long eastern side and a rounded southwest corner. Center's
smaller oval/circular wall lies around the civic core, slightly southeast of the
city's midpoint. District extents are irregular regions, not geometric quadrants:

| District | Map interpretation |
|---|---|
| West | Southwest residential Heartstone cluster; Slave Market farther north toward the western wall; Main Market farther east against Center; rougher alleys along the western wall. |
| North | Broad northern band; Cathedral west of Bastion; Collegium south of the northern red road; Spire east of Collegium; Saint Caldus farther east; Pyres northeast of Bastion. |
| East | House of Scales north of House of Making outside Center; Merchants' Mile runs eastward; Bent Bough north of Crucible; Smelter Pit southeast, above Grey Brook. |
| South | Broad band below Center; Wayfarer's Rest and Long Yard west of the Imperial approach; South Gaol and Stonewatch east of it; Gaol north of Garrison. |
| Center | Citadel in the northern portion on the northeast riverbank; Registry and Archive opposite on the southwest bank; Courts and Holdings near West Gate; Fountain Court south; Gilded Row east on the northeast bank. |

Grey Brook enters northwest, runs diagonally southeast between West and North,
crosses Center and exits southeast between East and South. Warehouses and criminal
transport lore survive. `grey_brook` remains a world-lore entity, avoiding a second
river identity. Four bridge locations supply encounter and traversal anchors:
`northwest_bridge`, `center_bridge`, `citadel_bridge`, `southeast_bridge`.
The first, second and fourth carry the important red crossings; Citadel Bridge is
the visible local crossing between the administrative bank and Citadel. Connections
approaching/leaving these bridge nodes are explicitly marked `bridge`.

## Roads, access and containment

Red means major road, green secondary road, yellow local street. Generic named red
segments form the western, northern, eastern and southern arcs. Green corridors are
represented by links through Chevalier Fountain, Gatherer's Inn, the civic approaches
and House of Making. Yellow streets become short local POI-access edges, not hundreds
of locations. The northern gate approach is a local connection to the northern arc.

The Merchants' Mile and Gilded Row retain their existing IDs and role as street
locations. Clothier Street, Anvil Alley and Glasswork Row become local Crucible
spurs: their existence is prior canon, but exact individual yellow-street alignment
is not labelled in the PNG. Imperial Road is only the short exterior southern
approach; its wider network remains unauthored. `north_approach` is the corresponding
short northern exterior stub. These two approaches belong to the city geography
container but are explicitly outside the wall. No distant city is implicitly linked.

Heartstone Square connects to the western road network. LR/CY/U1/F1 adjacency and
interior lore are preserved. The Coined Lie is on the square; White Basin lies
southwest; Chevalier Fountain and Open Hand Chapel lie northeast. Slave Market is
north, with the Back Alleys and Back-Back Alleys forming explicit successive links
toward the outer wall. Main Market is northeast through the Chevalier/Gatherer's
corridor. Saint Orra, the Dangling Rope and GW's occupy the northwestern cluster;
the Slaughtered Pig lies east of Slave Market and northwest of Main Market.

Second Chance Pawn and West Guard Post are not legibly labelled on the image:
their near-Main-Market placement comes from compatible prior canon. The four named
Main Market shops retain their IDs and face the square; their parent is West
District, with explicit square-access edges. Fountain of the Fallen remains
contained by the square. Back-Back Alleys is a West sibling beyond the Back Alleys,
not contained inside them. District/city/tower records remain structural containers.

`parent` never implies travel. The optional `entrance` field names an explicit
arrival point for requests addressed to a container: Heartstone -> LR, Center ->
Center West Road, city -> Imperial Gate, and each outer district -> its main hub.
It does not add an edge or bypass a wall. All concrete POIs have authored access.
YAML placement features and connections are the per-POI inventory; use
`npm run build --silent` followed by `node .build/src/dev/inspect-city.js` to inspect
the complete inventory, routes and metrics.

## Travel calibration

Costs are positive whole minutes for ordinary walking, calibrated from visible
relative path lengths and existing lore, not pixel conversion. Local doors and
square accesses cost 1–3 minutes; road segments are longer. No traffic, weather,
curfew, locks or permission simulation is added. Existing entry-control lore remains
descriptive. There are no coordinate, collision or raster navigation systems.

| Route | Minutes |
|---|---:|
| Heartstone Square -> Coined Lie | 1 |
| Heartstone Square -> Chevalier Fountain | 15 |
| Heartstone Square -> Slave Market | 20 |
| Heartstone Square -> Main Market | 30 |
| Heartstone Square -> West Gate | 40 |
| Heartstone Square -> Center West Road | 43 |
| Heartstone Square -> Civil Registry | 47 |
| Center West Gate -> Center East Gate | 22 |
| Center West Road -> Imperial Gate | 71 |
| North Gate -> Imperial Gate | 97 |
| Slave Market -> Heartstone LR | 21 |

The longest shortest route in the authored pedestrian graph is 106 minutes.
This is compatible with “about two hours, possibly somewhat less” across most of
Calderan; it is not forced to exactly 120 minutes. Heartstone building entry adds
one minute to square-based lore estimates. Calibration points are approximate;
the authored runtime costs and their sums are deterministic.

## Superseded assumptions

Four outer gates, four Center gates and speculative minor Center service entrances
are superseded. Heartstone is southwest, not northwest. The footprint is irregular
and rounded rectangular rather than a geometrically oval/quadrant scheme. Old
blanket claims that roads, river course, tavern positions and travel routes are
undefined are superseded where the map supplies them. Historical evaluation reports
describe their original datasets and are not current spatial authority. The visual
scale bar does not override calibrated walking lore. Unmapped interiors, Heartstone
F2–F6, distant roads, covert entrances and boat travel remain unauthored.
