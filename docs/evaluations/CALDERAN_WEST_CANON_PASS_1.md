# Calderan West Canon Pass 1

Content/authoring pass, 2026-09-29. Adds 18 independently retrievable locations, two world-geography/social-lore records and five restricted knowledge chunks. Refines six existing records. No characters, travel edges, exact prices/daily schedules, quests or runtime domains were added.

## A. West district refinements

West is large, dense and socially mixed: ordinary households, manual labor, workshops, warehouses, cheap businesses and respectable shops coexist with poverty, debt, crime and legal slavery-related commerce. It is not uniformly poor, criminal or dangerous. Existing Heartstone placement in north-western West is retained.

Calderan and its city-structure record now establish approximately 100,000 inhabitants, largest city in West, second most populous known globally, a roughly oval walled footprint, and four outer districts around Center. Approximate ordinary walking references: most of a cardinal-to-cardinal crossing takes about two hours, possibly less; Heartstone to Main Market Square about 30 minutes, Central District about 40, and Slave Market about 20. These are scale references, never route edges.

## B. Social/urban gradient

Inner-facing West generally has better upkeep, steadier households, more respectable businesses and more guards. Outer West generally has poorer upkeep, more visible poverty and crime, refugees and street children, and greater night danger. No official Inner/Middle/Outer subdistricts or fixed boundaries were created. No formal curfew; activity after approximately 23:00 can prompt questioning. Outer patrols are thinner and may use oil lamps or torches; no exact schedules.

## C. Grey Brook

`grey_brook` is world geography under `data/world/geography`, following the existing world-lore convention with explicit related entity references to Calderan and West. It spans the city diagonally, so it is not falsely structurally contained in West alone. Multiple unnamed small bridges, bankside warehouses, legitimate goods traffic and broad criminal exploitation are established. Exact crossings, routes and bases remain unknown.

## D. Heartstone surroundings

`heartstone_square` now has the supplied name, retaining its old names as aliases and its existing entrance connection to `heartstone_lr`. It is reasonably broad, peripheral, mostly low residential buildings, moderate daytime traffic, few shops and mediocre night safety. `the_coined_lie` faces or adjoins it. `the_white_basin` is a large practical laundry near Heartstone, without establishing a storefront on the square or a public bathhouse.

## E. Main Market Square

`main_market_square` anchors ordinary shopping in inner-facing West. It is very large, smaller than the Slave Market, with many unnamed stalls/services and ordinary-to-decent goods. Rare or prestigious goods generally require East, North or Center. `fountain_of_the_fallen` is an independent landmark location structurally inside the square: its stable name and use as a meeting destination justify independent retrieval. Its name's origin remains unknown.

## F. Commercial anchors

All four shops are structurally inside Main Market Square, under its editorial folder:

| ID | Authored scope |
| --- | --- |
| `the_daily_grind` | Ordinary food/provisions, bulk and large orders, delivery for sufficiently large purchases; low to lower-middle prices, ordinary/decent quality, no luxury specialty goods. |
| `blackiron_repairs_and_arms` | Common arms, ordinary armor, repairs and practical metalwork; no prestigious, noble-grade or rare enchanted specialty. |
| `mudlarks_herbs` | Common herbs/remedies, basic preparations and medicinal supplies; less extensive than North, no rare alchemical inventory. |
| `livias_needles` | Ordinary clothing, cloaks, linen/underwear, repairs, alterations and inexpensive custom work; no armor or elite fashion/luxury textiles by default. |

No owners or mapping files were created.

## G. Ordinary/social POIs

`chevalier_fountain` is approximately midway between Heartstone and the square. A wealthy knight commissioned it generations ago; a weathered mounted figure explains the common name. No heroic history was invented. Nearby `open_hand_chapel` offers modest, non-exclusive religious comfort and charity, especially for poor people and street children, with ties to North.

`second_chance_pawn` is near the square and offers practical used/pledged goods, small jewelry and occasional common weapons; it is not inherently criminal. `gatherers_inn` is a moderate-price, respectable-to-middling inn/tavern on the general way from Heartstone to the square, safer and more welcoming than the three disreputable taverns.

`saint_orra_house` shelters vulnerable children in outer West, broadly near but not adjoining the Slave Market, with limited resources and ties to religious charity in North. Some children refuse or leave institutional care. Reported disappearances have no established cause.

## H. Low-end taverns

`the_coined_lie`: wary, cheap, somewhat dirty, not automatically hostile; petty criminals, gamblers, debtors, informants and discreet travelers. Information can sometimes be bought.

`the_slaughtered_pig`: laborers, warehouse workers, petty criminals and rough clientele; fights are not unusual, questions unwelcome.

`the_dangling_rope`: anonymous travelers, fences/intermediaries and discreet meetings; low-level information for someone who knows how to ask/pay. No owners or exact positions for the latter two were supplied.

## I. West Guard Post

`west_guard_post` is the principal district post near Main Market Square. Some guards are harsh, violent or corrupt; this is not every guard. Ordinary patrols still suppress obvious petty crime/disorder. Severe corruption around deeper illicit trade is restricted criminal-network knowledge. No commander, percentages or patrol schedule was authored.

## J. Slave Market

`calderan_slave_market` remains the official name and ID, with The Slave Pens / Slave Pens aliases. Its large public square has practical earth/gravel/dirt surfaces, mud in poor weather and traffic-related dirt/blood. It is a major legal commercial center with very heavy daytime activity. Ordinary attendance is not clandestine.

No dominant captive origin or percentages are established. Multiple legal and illicitly laundered origins are possible; no inference that all refugees, Beastfolk or elves are enslaved is permitted.

## K. Public auction/documentation

Six features represent the public auction, holding pens, licensed private sellers, authorized clerks, patrols and loading/unloading. They have no independent identity or travel role requiring separate entities. General authorized auctions occur primarily by day; the complex operates around the clock with direct purchases outside auction hours and much lower night activity.

Authorized clerks handle auction ownership documentation at sale; licensed sellers handle or arrange their own authorized papers. No named operator, routine health certification requirement or systematic doctors/inspection was established. Pellan's speculative past duties were not canonized. Generalist, elite and labor-oriented seller businesses remain unnamed.

## L. Back Alleys

`slave_market_back_alleys`, locally The Back Alleys, remains structurally under West. Its earlier conflation with the deeper criminal layer is corrected: it is known but taboo, not inherently illegal. Sensitive sales, difficult debt cases, dangerous/difficult captives, unusual requested characteristics and moderately ill/injured but commercially viable captives are established. Guards rarely enter without reason. Off-record arrangements and false-document contacts are in a restricted chunk, without exact contacts.

## M. Back-Back Alleys

`slave_market_back_back_alleys` is structurally inside the Back Alleys. Its public envelope establishes only imperfect local awareness of a deeper criminal layer. Private chunks contain the labyrinthine degraded interior, controlled entrances/lookouts, undocumented and kidnapped captives, trafficked families/refugees, severely ill/injured captives, forged papers, corrupt brokers/guards and clandestine medical/alchemical activity. Children appear solely as nonsexual trafficking/exploitation victims. No graphic procedures.

## N. Criminal-network boundaries

Multiple organizations with separate leadership cooperate; no single gang controls everything. Some higher coordination appears to exist, but ultimate identity/location are unknown. River warehouses support illicit transport without named bases or exact routes.

`gws` has a public, taboo existence envelope and restricted password/introduction requirements and ecosystem association. No actual password, expanded GW name, manager or personal owner was invented.

The Undertaker's Door remains private slang prose within the deeper location, not an entity: a nonliteral handoff/contact does not fit physical location containment or travel semantics. Disposal is limited to payment to discreet/corrupt removal services when remains have no further illicit value. `quiet_yard` was deliberately omitted to avoid making one unestablished warehouse mandatory canon.

## O. Refugees/street children/adult prostitution

`calderan_west_daily_life` records the bounded social gradient, children's small jobs and survival groups without equating poverty with malice, displacement partly from current frontier skirmishes, and North's larger charity-related refugee concentration. Current CampaignState takes precedence over current-state assumptions.

Adult sex work has a less visible appointment/escort pattern in prosperous West and low-end establishments/street solicitation in outer West, sometimes with coercive economic conditions or criminal involvement. All referenced sex workers are adults; no named workers/venues or graphic details.

## P. Awareness classification

| Layer | Existing schema mapping | Effect |
| --- | --- | --- |
| Public/local new POIs and lore | `local:calderan`, narrator/player visible | Recoverable publicly; ordinary Calderan locals may use these facts. |
| Back Alleys, GW's, deeper-trade existence | Same local policy on minimal public envelopes; prose explicitly says taboo or imperfectly known | Known existence is not treated as secret. |
| Off-record contacts and GW's entry/association | `specialized`, narrator true/player false chunks | No ordinary local awareness or player retrieval. |
| Deeper interior/network/remains handoff | `private`, narrator true/player false chunks | Only privileged narrator inspection; no public or ordinary turn projection. |

No enum or permission model changed. The production turn path filters secret candidates before fetching; a matching private chunk does not authorize its contents for narration or NPC speech. Privileged narrator search can inspect those chunks and marks them secret. Existing Heartstone interior-record policy was retained; its publicly known identity/surroundings are described by local West and square records, without granting locals blanket knowledge of the tower interior.

## Q. Retrieval before/after

Reproducible offline audit: `npm run build --silent`, then `node scripts/west-canon-audit.mjs after`. The committed `before` snapshot was captured before authoring. Do not overwrite it to simulate a baseline. The script directly calls lexical evaluation and Phase 1R functions without constructing paid providers.

Full top-five narrator/player results and benchmark rows: [before](calderan-west-pass1-before.json), [after](calderan-west-pass1-after.json).

| Benchmark | Before | After |
| --- | --- | --- |
| Lexical single-target top-1 | 31/34 | 31/34 |
| Lexical recall@5 | 89.36% | 89.36% |
| Lexical MRR@5 | 0.9461 | 0.9461 |
| Multi-answer recall@5 | 61.54% | 61.54% |
| Phase 1R policy top-1 | 25/25 | 25/25 |
| Phase 1R recall@3 / @5 | 100% / 100% | 100% / 100% |

| Query | Before narrator top-1 | After narrator top-1 |
| --- | --- | --- |
| Calderan | calderan | calderan |
| West District | calderan_west | calderan_west |
| Heartstone | heartstone | heartstone |
| Heartstone Square | heartstone_square | heartstone_square |
| market square | heartstone_square | main_market_square |
| slave market | calderan_slave_market | calderan_slave_market |
| slave pens | calderan_slave_market | calderan_slave_market |
| slave auction | davenport | calderan_slave_market |
| Back Alleys | slave_market_back_alleys | slave_market_back_alleys |
| legal slavery West | west_slavery | west_slavery |
| illegal slave trafficking | slave_market_back_alleys | west_slavery |
| Grey Brook | none | grey_brook |
| Inquisition | inquisition | inquisition |
| Light magic | light_and_shadow | light_and_shadow |
| Blackwater | blackwater | blackwater |
| Davenport | davenport | davenport |
| Back-Back Alleys | slave_market_back_alleys | slave_market_back_back_alleys |
| shops near Heartstone | heartstone | heartstone_square |
| market square ordinary shopping | heartstone_square | main_market_square |
| illegal trafficking | slave_market_back_alleys | west_slavery |
| public auction | heartstone_square | calderan_slave_market |
| licensed sellers | slave_market_back_alleys | calderan_slave_market |

The official market stays primary for market/pens/auction queries. Ordinary shopping resolves to Main Market Square. Shops near Heartstone retrieves the local residential square first and Main Market Square second, preserving the distinction between nearby surroundings and the commercial destination. Illegal-trafficking queries retrieve general slavery/criminal context; the official market's text explicitly states public legality.

The newly added turn test exposed a repeated-word name collision: “Tell me about Back-Back Alleys” previously selected Back Alleys. The only production-code change prefers the longer matching explicit name before lexical/locality ties, retaining both candidates and all visibility checks. No gameplay-engine phase was opened. New tests assert the requested target rather than accepting the mistaken rank.

Synthetic uniform-vector hybrid testing also exposed lexical noise from district “borders.” Authored prose uses “boundaries” and “frontier skirmishes,” preserving meaning while avoiding irrelevant border-fortress competition. No rank weights, relevance labels, benchmark targets, thresholds, fusion rules or provider fixtures were altered. Existing benchmark gaps remain visible, not relabeled as successes.

## R. Validation/test results

- `npm test`: 755/755 pass; no skipped tests.
- `npm run test:playthrough`: 25/25 pass.
- `npm run typecheck`: pass.
- Lexical and Phase 1R offline benchmark results above; no paid LLM/embedding calls.
- New tests cover references, containment/ancestry, aliases, market distinctions, no added travel edges, unresolved child disappearances, no NPC additions, privileged fetch flags, public lexical/semantic-document exclusion and ordinary-turn secret exclusion.
- Existing recursive duplicate-ID rejection, path-independent dataset/ranking/semantic identity, runtime precedence and validation tests all pass against the expanded corpus.
- Fixed corpus assertions now expect 76 entities, five restricted chunks, 81 narrator index documents and 76 player documents, with exact synthetic batch sizes retained. Old display-name and alias-tier expectations reflect supplied canon changes; substantive ranking and validation assertions remain intact.

## S. Deliberately unresolved canon

No exact streets, bridges, routes, precise schedules, prices/taxes, detailed slave law or manumission rules; no plot hooks or outcomes. No fountain war/hero/religious/magical origins, knight dynasty, full Church doctrine or news-sheet/newspaper system. News criers leave a public-notice/news-sheet economy as an authoring follow-up. No dominant captive origin, exact criminal hierarchy/base, ultimate coordinator, covert contacts or actual entry password. Shelter disappearances have no selected explanation. Unknowns are not hidden established facts.

## T. NPCs reserved for next pass

Pellan remains the only authored canonical NPC. No character file was changed or created. Reserved: Elspeth Vael, Seren Vael, Magistrate Quarn, Korvin, Mistress Elara, Captain Doran Hale, Dren, Brother Aven, West shopkeepers, a third licensed slaver and criminal-network leaders. Dren's later role is one gang leader, not supreme leader; his future group may use the Grey Brook area, but no base or ownership is established now. No named guards, children, sex workers, undertakers or additional bosses were invented. The NPC pass has not begun.

WEST CANON FOUNDATION READY
