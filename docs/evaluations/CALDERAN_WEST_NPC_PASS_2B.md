# Calderan West NPC Canon Pass 2B — Commercial & Everyday Anchors

2026-09-30. Contained authoring pass using the supplied seven character descriptions. Adds exactly seven characters and updates their seven existing businesses. No Pass 2A character was changed. No other district, new location, faction or gameplay domain was authored.

## A. Character files

All seven files live under `data/characters/calderan/west/merchants/`:

| Character | File | Existing business |
| --- | --- | --- |
| Bram Kessel | `bram_kessel.yaml` | `the_daily_grind` |
| Hadrik Voss | `hadrik_voss.yaml` | `blackiron_repairs_and_arms` |
| Mira Thorne | `mira_thorne.yaml` | `mudlarks_herbs` |
| Livia Marr | `livia_marr.yaml` | `livias_needles` |
| Jessa Rook | `jessa_rook.yaml` | `gatherers_inn` |
| Orla Fen | `orla_fen.yaml` | `the_white_basin` |
| Niles Vanner | `niles_vanner.yaml` | `second_chance_pawn` |

The world now has 92 entities, including 16 NPCs and the existing player. Its 50 locations and 15 knowledge chunks are unchanged in number. No named staff, relatives or additional owners were created.

## B. NPC-design principles applied

Each record preserves the supplied appearance, conversational behavior, practical purpose, pressure, contradiction, behavioral morality and occupational competence. Observable habits appear in compact public descriptions. Internal reasons remain narrator portrayal. Every private portrayal explicitly treats mannerisms as occasional anchors, not compulsory gestures or repeated catchphrases.

Businesses and ordinary pressures give these characters independent reasons to exist. No missing shipments, special bloodlines, concealed magic, mandatory encounters, criminal affiliations or manufactured quests were added. Relationship arrays remain empty: plausible professional familiarity is not promoted to confirmed friendship or a dense graph.

## C. Bram Kessel

Retains the broad build, unevenly greying moustache, stained apron, clean hands and charcoal behind his ear. Public behavior includes a booming voice that quiets over money, rapid quantity conversion and memory for regular purchases. Portrayal preserves dependable supply as his purpose, generous food versus strict accounting, supply anxiety and explicit limits against bad food, false weights and coercive deprivation. No actual supply emergency or exact prices were invented.

## D. Hadrik Voss

The only dwarf in the new cast; retains the short broad build, practical beard, stiff fingertips and forgotten inspection lenses. Short complete sentences and examining equipment before its owner distinguish his public behavior. Private portrayal preserves repair-focused pride, fear of equipment failure and preference for dependable ordinary gear over display. Professional limits prohibit defective work, concealed damage, quality fraud and sabotage. No magical-weapons expertise or adventuring history.

## E. Mira Thorne

Retains copper-brown unevenly cut hair, plant-stained fingers, practical pockets and lack of perfume. Her restrained questions and habit of smelling ingredients support a basic neighborhood practice. Private portrayal preserves skeptical curiosity, fear of being trusted beyond competence, pragmatic compassion and limits against false or unsafe remedies. Referral to North is public practice, not an invented medical specialty or magical ability.

## F. Livia Marr

Retains plain well-fitted clothes, casually pinned hair, working pins and measuring tape. Public behavior is fast, blunt and attentive to fit. Her affordable-quality purpose, anxiety about East's cheap mass goods, love of clothing versus skepticism about fashion, and concrete commercial boundaries remain portrayal. Clothing observations do not reveal hidden social facts automatically.

## G. Jessa Rook

Retains her solid build, grey-streaked hair, unexplained eyebrow scar, rolled sleeves and notebook. Her low voice, attention to arriving guests' hands and discreet handling of tabs are public observations. Her wish for a quiet profitable inn, dislike of strangers, internal hospitality rationale and fear of criminal reputation remain portrayal. Conduct boundaries cover violence, trafficking, robbery and intimidation without inventing any incident. No intelligence-broker role or home above the inn is established.

## H. Orla Fen

Retains reddened hands, strong forearms, short grey hair, waterproofed apron and misplaced spectacles. Her carried-over work volume, recognition of clothes and quiet response to severe stains provide observable behavior. Portrayal preserves fire/water concerns, dislike of gossip despite hearing it and discreet charity. Laundry evidence does not automatically establish a crime or grant secret knowledge.

## I. Niles Vanner

Retains the receding hair, reinforced waistcoat, conspicuous artificial tooth and balance-pan habit. Public negotiation distinguishes an offer from an object's value and treats sentimental histories courteously. His profit-versus-desperation contradiction, fear of serious stolen-property exposure and concrete limits on fencing, false appraisals and helping robbers remain portrayal. Uncertain ordinary provenance is not equated with criminality. No rare-artifact expertise.

## J. Location associations

Each character's `base_location` and `work_location` equal the business listed above. All seven `home_location` fields are null; no residence is inferred from occupation. Location records replace obsolete owner-unknown wording with the supplied proprietor while retaining inventory, quality, service, geography and travel limitations.

Existing initialization places owners at their authored bases, and runtime movement continues to override those defaults. The opening scene remains Heartstone Square with Nicco alone. No opening-state implementation or travel edge was changed. Tests verify presence at each shop, absence after runtime movement and unchanged canonical associations.

## K. Public/private portrayal separation

All seven records use `local:calderan` with player/narrator visibility. Public identity, appearance, ownership and observable behavior remain searchable. `purpose`, `morality`, `traits` and `private_notes` retain the existing portrayal-only contract; the latter stores pressures, contradictions, private feelings and bounded competence.

No new restricted chunks are needed for these compact character baselines. No CampaignState goals, trust values, facts, schedules or knowledge edges are generated from purpose. Ordinary local awareness permits public reputations without creating personal acquaintance. Restricted criminal knowledge receives no new `known_by` entries.

## L. Retrieval before/after

Snapshots: [before](calderan-west-npc-pass2b-before.json), [after](calderan-west-npc-pass2b-after.json). Existing Pass 1 and Pass 2A snapshots were retained. The new audit's before capture uses exclusive creation to prevent replacement. Reproduce after building with `node scripts/west-everyday-audit.mjs after`.

The audit covers the 23 requested queries, two generic shopping questions and one ownership question. Named people resolve first to characters; named businesses resolve first to locations. Ownership questions may retrieve the business first because its public content directly names the proprietor; owner characters are independently recoverable.

Location search contexts describe their actual services. Short forms Blackiron, Mudlark and White Basin are location aliases. The Daily Grind's context explicitly describes buying food, preventing an unrelated occurrence of “buy” on a slaver record from outranking the food business. No scoring weights or relevance labels changed.

One generalized retrieval-trigger gap was demonstrated by tests: “where can I buy food?” and “where can I repair armor?” did not invoke production retrieval at all, despite successful direct searches. A small location-intent pattern now recognizes destination questions for buying, purchasing, repair, selling, pawning, washing, staying and eating. It changes neither answer selection nor access rules. Tests preserve route-intent priority and exclude ordinary conversation. This is a grounding fix, not a gameplay-engine phase.

| Query | Before player top-1 | After player top-1 |
| --- | --- | --- |
| Bram Kessel | none | bram_kessel |
| The Daily Grind | the_daily_grind | the_daily_grind |
| Hadrik Voss | none | hadrik_voss |
| Blackiron | blackiron_repairs_and_arms | blackiron_repairs_and_arms |
| Mira Thorne | none | mira_thorne |
| Mudlark | mudlarks_herbs | mudlarks_herbs |
| Livia Marr | livias_needles | livia_marr |
| Livia's Needles | livias_needles | livias_needles |
| Jessa Rook | none | jessa_rook |
| Gatherer's Inn | gatherers_inn | gatherers_inn |
| Orla Fen | none | orla_fen |
| White Basin | the_white_basin | the_white_basin |
| Niles Vanner | none | niles_vanner |
| Second Chance Pawn | second_chance_pawn | second_chance_pawn |
| food delivery West | the_daily_grind | the_daily_grind |
| ordinary armor West | captain_doran_hale | blackiron_repairs_and_arms |
| herbalist West | mudlarks_herbs | mudlarks_herbs |
| clothes West | calderan_west | livias_needles |
| inn near Heartstone | gatherers_inn | gatherers_inn |
| laundry near Heartstone | the_white_basin | the_white_basin |
| pawn shop West | main_market_square | second_chance_pawn |
| shops near Heartstone | heartstone_square | heartstone_square |
| Main Market Square | main_market_square | main_market_square |
| where can I buy food? | korvin | the_daily_grind |
| where can I repair armor? | blackiron_repairs_and_arms | blackiron_repairs_and_arms |
| Who owns The Daily Grind? | the_daily_grind | the_daily_grind |

## M. Leak tests

Twenty new deterministic tests cover identity, associations, business versus owner retrieval, functional shopping, query triggering, public/private separation, presence and prior-pass regressions. Specifically:

- Public fetch and both audiences' searchable text exclude the seven private purpose/morality/pressure blocks.
- A fixture embedding provider's actual submitted text also excludes them; it makes no paid calls.
- Searches about supplied private pressures do not place those pressures in ordinary turn output.
- Present NPCs receive private portrayal in the marked narrator block, without player facts or goals.
- Ordinary local knowledge remains distinct from restricted information.
- Opening presence, runtime movement precedence, null homes and absence of invented associations are asserted.

## N. Existing West regressions

All 22 Pass 1 and 20 Pass 2A primary query results are preserved for each audience, including market distinctions, fountains/river context, West civic and criminal anchors, and restricted-name visibility. Shops near Heartstone still retrieves Main Market Square among the useful results. No Pass 2A character file was edited.

| Benchmark | Before | After |
| --- | --- | --- |
| Lexical top-1 | 31/34 | 31/34 |
| Lexical recall@5 | 89.36% | 89.36% |
| Lexical MRR@5 | 0.9461 | 0.9461 |
| Multi-answer recall@5 | 61.54% | 61.54% |
| Phase 1R policy top-1 | 25/25 | 25/25 |
| Phase 1R policy recall@3 and @5 | 100% | 100% |

Pre-existing benchmark gaps remain visible rather than relabeled. Corpus count assertions now expect 92 entities, 15 chunks, 107 narrator documents and 91 player documents. Exact NPC lists and initial base defaults were expanded; validation and ranking assertions were not weakened.

## O. Validation

- `npm test`: 799/799 passed, no skips.
- `npm run test:playthrough`: 25/25 passed.
- `npm run typecheck`: passed.
- Lexical benchmark, Phase 1R benchmark, Pass 1 audit, Pass 2A audit and Pass 2B audit completed offline.
- API-key/token and configured adapter variables were cleared in validation processes. No paid LLM or embedding calls were used.
- Existing nested duplicate rejection, stable identity, immutable canon, runtime precedence and restricted-projection tests remain passing.

## P. Deliberately unestablished details

Homes, family links, named staff, guild membership, exact prices, fixed schedules, individual customer histories and exact supply routes remain unestablished. Jessa's scar has no invented origin. No actual shortage, fire, poisoning, robbery, stolen-property case or other plot was created from a fear. These are potential ordinary pressures, not scheduled incidents or quests. Shared location and public reputation do not establish personal relationships.

## Q. Remaining West work

Other West operators and any deeper commercial, civic or social detail require a separate supplied authoring pass. No further gang leaders, tavern keepers, relatives, employees or other-district cast were started. Existing deliberately unresolved canon remains unresolved.

WEST EVERYDAY CAST READY
