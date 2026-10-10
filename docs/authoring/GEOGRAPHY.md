# Phase 1E.1: Canonical continental map and major cities

The user's illustrated continental map is the current canonical cartographic
reference. Geography remains semantic/topological, not GIS. The Phase 1E.1 text
confirms nation placement, national borders, major cities, capitals, waters,
the mountain chain, broad coastline relationships, and regional climate tendencies.

The attachment available during implementation contained the written specification
only, not the illustrated map itself. All encoded relationships come from that
explicit text. No additional shape or coastline detail was inferred, and no image
inspection, OCR, parsing, or coordinate extraction was implemented. Runtime loading
requires only the canonical YAML and works without any map image.

The continent is conceptually Eurasia-scale, without authoritative dimensions,
distances, or travel times. The decorative scale bar is not a measurement source.
Future coordinates and travel graphs may be layered on without rewriting stable IDs.

## Geographic hierarchy

All entries here are proper location entities. The continent is named **Helion** (its ancient,
pre-Year-0 name, Eldaven, lives only in restricted canon); `Known Continent` is a descriptive
alias. The former name "Aureth" is retired: Aureth is now a person (the Sun Emperor). The
stable ID `continent` is a legacy identifier kept unchanged so saves and references stay valid. Existing `continental_structure`
remains the lore overview; `continent` provides the physical parent required by the
location schema, rather than replacing that permanent lore ID.

```text
continent (Helion; alias Known Continent)
├── west (West)
│   ├── calderan (Calderan, capital)
│   ├── ironbound (Ironbound)
│   ├── davenport (Davenport)
│   └── blackwater (Blackwater)
├── center (Center)
│   ├── zul_rath (Zul-Rath, capital)
│   ├── khar_dune (Khar-Dune)
│   └── sandspear (Sandspear)
├── east (East)
│   ├── vaelrost (Vaelrost, capital)
│   ├── frostspire (Frostspire)
│   └── skardgard (Skardgard)
├── south_continent (South Continent, fourth great division; descriptive name only)
└── dragons_teeth_mountains (The Dragon's Teeth Mountains)
```

The South Continent lies south of West, Center and East. It has no proper name, borders, cities,
capital, people or culture in canon; do not add them without a deliberate authoring pass.

Surrounding waters have `parent: null`: `mist_sea` (north), `sorrow_sea` (west),
`silent_ocean` (east), and `chained_bay` (southwest). They are not wholly contained
within the continental landmass or assigned national ownership. The mountain chain
spans the northern Center/East transition, so its single parent is the continent,
not either nation. No fabricated geographic umbrella entity is needed for the seas.

West borders Center, Center borders East, and West/East share no direct land border.
Borders are geographic facts, not permission to travel. Every new location has
`connections: []`. The six pre-existing directed Heartstone connections are unchanged.

## City identities

| City | Confirmed identity |
| --- | --- |
| Calderan | Inland capital and main political/campaign city of West; existing civic and five-district model; principal legal slave-market control with Davenport |
| Ironbound | Fortified frontier city on West's side, east of Calderan; fortress-gate, military filtering, customs, and coexistence of enforcement and corruption |
| Davenport | Principal economic/maritime port farther south near Chained Bay; stone docks, warehouses, and legal/institutional slave-trade logistics |
| Blackwater | Southwestern coastal/cliff criminal maritime enclave; fragmented criminal power outside effective normal direct West control |
| Zul-Rath | Capital in Center's northern/central interior; may pragmatically employ or tolerate corsairs; internal government remains undefined |
| Khar-Dune | Western/southwestern Center fortified caravan watering settlement; lime/mud-brick walls, underground slave/contraband markets, and possible provenance falsification |
| Sandspear | Far-southern Center desert/coastal corsair and mercenary-mariner stronghold around a solitary black-basalt tower; navigator groups and warlords |
| Vaelrost | East's capital deep in the cold eastern nation, farther east/northeast; no inferred magical architecture or internal political system |
| Frostspire | Western/northwestern East rocky-spur keep near mountains/frontier; iron/coal mining and military enforcement of armed neutrality |
| Skardgard | East's principal southeastern coastal city; fjord-like geography, ice, dark stone defenses, whaling, shipbuilding, fishing, and maritime trade |

Blackwater's `parent: west` is geographic containment, not effective governance.
Calderan's pragmatic tolerance is neither blanket legal endorsement nor a treaty.
Blackwater and Sandspear rival one another over Chained Bay/Sorrow Sea trade,
smuggling, piracy/corsair activity, protection, cargo, captives, and spoils, sometimes
fighting bloody naval engagements. This is not formal West–Center naval war, and no
winner or required campaign encounter is established.

East's armed neutrality is enforced through Frostspire against incursions from
either side. It establishes neither pacifism nor friendship/alliance with West or
Center, and does not define all East foreign policy or internal governance.

## Calderan naming decision and continuity

No `Caldrevan`, `Calderan`, or `Merovar` settlement existed in loaded canon before
this change. `CaldrevanRPG` is the project title, not an existing city identity.
Create `calderan` once with canonical/display name `Calderan`. No existing location
ID was renamed, no references were broken, and no second capital or legacy alias
was invented. The unrelated project title and template provenance wording remain.

The permanent `main_city_structure` ID is retained; its name is now Calderan City
Structure and its existing five district themes are unchanged. Its `related_entities`
now resolves to `calderan`. City Guard territory and civic magistracy also resolve
the formerly unnamed main city. Guild branches, Church representation, Duke, and
council remain intact without inventing a constitutional arrangement between the
capital's civic authority and Crown. Districts remain compact lore in this step;
their parent identity is now available for later location authoring. No detailed
district geography is added.

Heartstone's null parent and its child hierarchy are unchanged. No district, West
Gate, or direct city containment was previously established for it. Geography work
does not silently supply that missing placement.

## Exact canonical file inventory

Nineteen new files under `data/locations/` (each basename is its permanent ID):

- `continent.yaml`, `west.yaml`, `center.yaml`, `east.yaml`
- `mist_sea.yaml`, `sorrow_sea.yaml`, `silent_ocean.yaml`, `chained_bay.yaml`
- `dragons_teeth_mountains.yaml`
- `calderan.yaml`, `ironbound.yaml`, `davenport.yaml`, `blackwater.yaml`
- `zul_rath.yaml`, `khar_dune.yaml`, `sandspear.yaml`
- `vaelrost.yaml`, `frostspire.yaml`, `skardgard.yaml`

Updated canonical files:

- `data/world/geography/continental_structure.yaml`: orientation, borders,
  capitals, waters, range, and East's now-supplied neutral posture.
- `data/world/geography/calderan_city_structure.yaml`: resolves the existing model
  to Calderan while preserving all district themes.
- `data/world/governance/west_slavery.yaml`: broad legal/frontier/illegal network,
  including plantations and colonies whose details remain undefined.
- `data/factions/city_guard.yaml`: identifies Calderan and records its territory ID.
- `data/concepts/city_magistracy.yaml`: identifies and relates to Calderan.

No new faction, character, item, event, or knowledge chunk was required. The loaded
dataset now has 46 entities: 24 locations, 15 lore records, six factions, one concept.

## Schema limits and disambiguation

The location schema has no dedicated capital, border, rivalry, or multi-parent
fields. Existing named features carry these facts; exact capital names and rival
names are feature descriptions. These are descriptive facts, not newly typed or
automatically resolved relationship edges. Dataset tests verify their named targets.
Existing lore `related_entities` supplies genuine exact-ID links where useful.
Neither tags nor navigable `connections` are used as substitute border metadata.
No schema change or lore-graph/search implementation was introduced.

West, Center, and East retain their canonical names. Their location IDs, continent
parents, nation-qualified `display_name`, and short `search_context` distinguish
them from Calderan's district labels. The two supplied titles and Ironbound's
suggested title are aliases, never additional city entities. Sandspear is the
canonical spelling; no Sandspire alias or entity is created.

## Illustration limits, contradictions, and scope

Decorative city icons do not establish building counts or architecture. Exact
forests, individual peaks, decorative ships, monsters, banners, heraldry, tiny
islands, rivers, roads, compass placement, and scale-bar precision were not imported.
Only architecture explicitly confirmed in the text is authored, such as Sandspear's
tower, Ironbound's fortifications, and Frostspire's keep.

No contradiction with an established positive fact was found. Phase 1E deliberately
left East's capital, military, and foreign stance undefined; this explicit follow-up
supplies them and updates the former blanket omissions. Center/East governments
remain undefined. The previous ban on inventing criminal factions is preserved:
the newly supplied criminal actor categories are prose/features, not named factions.

No coordinates, roads, border polygons, routes, travel times, population/military
counts, sea magic, dragons, exact passes, new rulers, criminal gangs, detailed
plantations/colonies, additional cities, or simulation was invented. No mana/runtime
implementation changed. No next phase or further settlement authoring began.


## Calderan district foundation (2026-09-29)

Calderan is West's largest city and political capital, a very large dense walled metropolis. Five broad urban regions are now locations under calderan: calderan_west, calderan_east, calderan_north, calderan_south, calderan_center. Their themes are predominant tendencies, never exclusive zoning. Crossing substantial parts is meaningful travel. Center has an older inner wall. The later canonical spatial pass authors its two gates and weighted road graph.

Containment: continent ? west ? calderan ? calderan_west ? heartstone ? existing U1/LR/F1/CY. heartstone_square remains outside the tower, sibling under calderan_west. calderan_slave_market and slave_market_back_alleys are separate siblings in West; the latter is the unofficial/criminal fringe, not the official legal market. Existing tower/main-entrance connection edges are unchanged. No unrelated place received a guessed district. No new routes, measurements, operators or hooks were added.

The old main_city_structure ID survives in world/geography/calderan_city_structure.yaml as an overview. District details live in their locations. Continental structure also lives under geography; governance/slavery lore under governance. The legacy world_lore category `fundamentals` is retained as explicit schema metadata for compatibility; folder geography/governance supplies no semantics.

NPC locations remain in the one character record, never a duplicated geography index. Pellan is based in Center; his exact workplace and home are unestablished IDs. Parent is containment; connections alone describe travel. Editorial directories and filenames have no navigation meaning.

## Four-District + Institutional Authoring Pass 1 (2026-09-30)

East, North, South and Center now carry detailed district canon and 23 anchor locations, all children of their district (parent is containment only):

- **East:** `the_crucible`, `the_merchants_mile`, `the_smelter_pit`, `house_of_scales`, `house_of_making`.
- **North:** `cathedral_of_the_bladed_sun`, `saint_caldus_house`, `pyres_of_the_fallen`, `the_collegium`, `spire_academy`, `bastion_of_vigilance`.
- **South:** `imperial_gate`, `stonewatch_garrison`, `calderan_south_prison`, `the_long_yard`, `wayfarers_rest`.
- **Center:** `ducal_citadel`, `calderan_civil_registry`, `ducal_archive`, `office_of_holdings_and_title`, `high_courts_of_calderan`, `gilded_row`, `fountain_court`.

The only new travel edges are The Merchants' Mile ↔ The Crucible, because the brief states that the street feeds directly into the market. Proximity statements ("near the Citadel", "near The Collegium") are prose, not connections.

The Masterworks (House of Making), Gold Cloister (Saint Caldus House) and Mage Registry (The Collegium) remain features. The later spatial pass promotes the Crucible's three named specialist streets and Imperial Road to travel locations. Exactly two outer gates (North and Imperial) and two Center gates (West and East) supersede the former four-gate assumptions.

## Canonical city map and spatial graph (2026-10-01)

[Calderan spatial canon](CALDERAN_SPATIAL_CANON.md) supersedes the earlier city-specific
route/position omissions in this historical authoring record. Its authoritative image is
`C:\Users\be_fr\CaldrevanRPG\city_map\city_map.png`. This does not change continental-map
illustration limits. Runtime uses authored YAML, never image parsing. See the linked
canon for map-label exceptions, POI placement, road/bridge hierarchy and walking calibration.
