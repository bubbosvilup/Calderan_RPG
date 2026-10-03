# Calderan West NPC Canon Pass 2A

2026-09-30. Canonical-character authoring on the existing data foundation and West Pass 1. The user confirmed that the character descriptions and correction notes in the Pass 2A instructions are the complete authoritative source; there is no separate design document. Unspecified details remain unestablished.

## A. Character files added

Exactly eight characters were added under `data/characters/calderan/west/`:

| Folder | Files |
| --- | --- |
| `slavers/` | `korvin.yaml`, `mistress_elara.yaml`, `bartolomhew.yaml` |
| `criminal/` | `dren.yaml`, `blackthorn.yaml` |
| `civic/` | `captain_doran_hale.yaml` |
| `charity/` | `brother_aven.yaml`, `sister_mereth.yaml` |

Pellan was neither recreated nor edited. There are nine canonical NPCs in total, plus the existing player character. No unrelated NPCs or new locations were created.

## B. Merovar → Calderan correction

All new authored references use Calderan. Tests reject Merovar or Dorian in the eight new character records. No older drafts or unrelated documents supplied character facts.

## C. Doran Hale role correction

The canonical name is Captain Doran Hale. His command is the West District City Guard, with `west_guard_post` as base and workplace. The character and post explicitly distinguish his role from citywide command. His civic loyalty to Calderan remains intact.

## D. Korvin

The supplied age, compact working appearance, damaged hands, perceptive eyes and practical clothing are retained. His portrayal emphasizes rough pragmatism, social perception, suspicious customer-reading and independence. Licensed generalist trade, commercial reliability, the public under-twelve limit and Back Alley commercial/storage association are established. Personal background and other restricted boundaries are isolated from public fields. No unspecified private judgment of another character was invented.

## E. Mistress Elara

The supplied appearance, elegant theatrical surface, observant personality and social ambition are preserved. Her licensed specialty and unnamed adult pleasure/escort business are established without inventing a building or proprietor beyond her supplied role. Her better material treatment of valuable slaves is not presented as benevolence. Network membership does not imply sexual work. Arrangements involving younger girls remain bounded possible scouting, sponsorship, training, investment or domestic/social placement, without explicit sexual content or invented particulars. Sensitive information gathering and private motivations are protected.

## F. Bartolomhew

Canonical spelling is `bartolomhew`, with alias The Redemptor. His workforce and Beastfolk trade, formal respectability, retained clerical cues and warm manner are established. Deterministic portrayal assertions require profound emotional indifference and explicitly reject gleeful sadism or excitement at suffering. No murders, serial-killer history or completed expulsion explanation were invented. Former religious background is not encoded as current Church membership; sensitive background and intermediary commerce are restricted.

## G. Dren — spoiler-safe implementation status

Dren's previously undefined private canonical baseline was authored and protected behind the intended visibility boundaries.

## H. Blackthorn

The supplied build, clothing, hair, eyes and two accompanying bodyguards are preserved; the bodyguards are not separate NPCs. Portrayal emphasizes impatience, organization, commercial skill and the supplied loyalty. She handles commercial/administrative work rather than serving primarily as an assassin. GW's management and criminal operations are classified separately from her public intermediary profile. Afternoon, evening/night and weekly early-morning activity remain habitual prose, not scheduled events or forced runtime presence. Unspecified age and residence remain null; detailed routes and depots were not invented.

## I. Captain Doran Hale

Supplied physical characteristics, veteran equipment and continued training are retained. Purpose is West-focused institutional improvement. Morality uses concrete behavior: law as responsibility, necessary pragmatic compromises, resistance to corruption and refusal to shelter obvious atrocity behind legality. Private strategic concerns and intelligence limits do not enter public retrieval.

## J. Brother Aven

Uses the existing `open_hand_chapel`, with no duplicate chapel. Retains the supplied worn appearance, patient practical compassion and dry humor. Roles include local ministry, confession, charity, nonmagical healing, funeral services and occasional mediation. Confidential religious knowledge is restricted, and no confession or missing expulsion detail was invented.

## K. Sister Mereth

Administrator and principal public representative of `saint_orra_house`. Retains the supplied appearance, practical equipment, strict organization and pragmatic care. Accurate recordkeeping is established in restricted prose, but no individual records, names, counts or causal explanation were invented. The ambiguous institutional relationship with Elara does not resolve the disappearances. Upper-crime knowledge remains limited.

## L. Carrion Dogs

Added `data/factions/calderan/west/carrion_dogs.yaml` using the existing faction contract. Its public envelope describes a West criminal organization known mainly in lower/criminal circles, one among several. Membership and organizational material remain outside public fetch/search text; independently retrievable sensitive material uses a restricted chunk. No full-network ownership, new faction domain or ultimate coordinator was created.

## M. Location associations

| Character | Base / work association |
| --- | --- |
| Korvin | `calderan_slave_market` / same; Back Alley association in prose |
| Mistress Elara | `calderan_slave_market` / same; additional establishment unnamed |
| Bartolomhew | `calderan_slave_market` / same; other trade associations appropriately classified |
| Blackthorn | Base unestablished / `gws`; habits do not initialize a current position |
| Captain Doran Hale | `west_guard_post` / same |
| Brother Aven | `open_hand_chapel` / same |
| Sister Mereth | `saint_orra_house` / same |

All eight home-location fields remain null. Public location records now identify their supplied operators and representatives where appropriate. The market still separates licensed sellers from the general public auction. Its introduction was compacted to 1,678 characters, retaining the supplied facts and existing features, so scene projection meets the existing 2,000-character location-content limit. No limit was raised. No travel edges were added.

## N. Public/private knowledge separation

Public records use the established local or specialized awareness vocabulary. Personality, purpose, morality, private notes and affiliations retain the existing narrator-portrayal contract rather than becoming public lore or campaign goals. Ten additional restricted chunks store independently classified personal, institutional and operational facts. In total the world now has 85 entities and 15 chunks; public search has 84 documents and privileged narrator indexing has 100.

Narrator portrayal for present permitted characters is explicitly marked `narrator_portrayal_only_not_character_knowledge`. Ordinary turn retrieval filters secret candidates; privileged inspection does not grant Nicco or other NPCs those facts. Existing NPC-only `known_by` rules and runtime precedence remain authoritative. Restricted character presence is tested mechanically without exposing its private values.

## O. Relationship representation

Only relationships supported by the supplied sections are represented. Where the instructions establish a contact but not its personal terms, the edge records that limit instead of inventing friendship, rivalry or a transaction. Relationships with institutions and former affiliations remain appropriately classified prose because character edges target characters only.

One minimal schema/retrieval extension was necessary: character relationship edges may now carry an optional existing-style `knowledge` policy. Without it, private edge prose would enter public lexical and semantic documents. Omitted policy inherits the owner; restricted edges are excluded from the public owner's search document even during privileged narrator indexing, preventing private evidence from being returned under an unflagged public character. Independently searchable restricted facts use chunks. Validation checks policy shape, awareness references and NPC-only knowledge references. Existing edge-target and duplicate checks remain intact. No trust values, knowledge grants, goals or gameplay systems were added.

## P. Retrieval before/after

Snapshots: [before](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/calderan-west-npc-pass2a-before.json), [after](../calderan-west-npc-pass2a-after.json). Both contain IDs and metrics only, not character prose. The new audit includes all 20 requested NPC queries and all 22 West Pass 1 queries. Existing Pass 1 snapshots were not overwritten; the new before capture uses exclusive file creation to prevent accidental replacement.

Reproduce after validation with `node scripts/west-npc-audit.mjs after`. This calls lexical evaluation and Phase 1R directly without constructing paid providers.

| Benchmark | Before | After |
| --- | --- | --- |
| Lexical top-1 | 31/34 | 31/34 |
| Lexical recall@5 | 89.36% | 89.36% |
| Lexical MRR@5 | 0.9461 | 0.9461 |
| Multi-answer recall@5 | 61.54% | 61.54% |
| Phase 1R policy top-1 | 25/25 | 25/25 |
| Phase 1R policy recall@3 and @5 | 100% | 100% |
| West Pass 1 top-result preservation | Reference | 22/22 for each audience |

All ten public NPC/organization identity and role queries in the new deterministic tests select their required target in lexical and production turn retrieval. The supplied role alias “West guard captain” prevents its turn query from resolving merely to the nation West. Private-name access is tested under its audience policy. Public shops-near-Heartstone recovery and ordinary versus slave-market distinctions remain intact.

| Query | Before player top-1 | After player top-1 |
| --- | --- | --- |
| Korvin | none | korvin |
| Mistress Elara | none | mistress_elara |
| Bartolomhew | none | bartolomhew |
| The Redemptor | none | bartolomhew |
| Blackthorn | none | blackthorn |
| Captain Doran Hale | blackwater | captain_doran_hale |
| Brother Aven | none | brother_aven |
| Sister Mereth | none | sister_mereth |
| Carrion Dogs | none | carrion_dogs |
| Slave Market slavers | calderan_slave_market | bartolomhew |
| West guard captain | blackwater | captain_doran_hale |
| Saint Orra's House | saint_orra_house | saint_orra_house |
| Open Hand Chapel | open_hand_chapel | open_hand_chapel |
| Back-Back Alleys | slave_market_back_back_alleys | slave_market_back_back_alleys |
| GW's | gws | gws |
| Grey Brook | grey_brook | grey_brook |
| Inquisition | inquisition | inquisition |
| Calderan | calderan | calderan |
| West District | calderan_west | calderan_west |

Existing benchmark gaps remain reported. No relevance labels, thresholds, ranking weights, fusion rules or embedding fixtures were changed.

## Q. Leak tests

New deterministic tests verify:

- Public fetch and embedding text exclude private motivations, personal background, investigative limits, institutional records and restricted operations.
- Every new restricted chunk denies player fetch and is excluded from public index documents and ordinary narrator turns.
- Secret relationship sentinel text cannot influence public-owner lexical or semantic retrieval, even for narrator search.
- Invalid relationship knowledge policies and player `known_by` entries are rejected.
- Permitted present-character portrayal receives the authored private fields while NarrativeKnowledgeAccess and CampaignState do not gain player facts, trust or goals.
- Private-character projection tests compare access and presence mechanically without printing private expected values.
- Known-by edges remain selective; unknown records and incomplete intelligence do not become globally available lore.

## R. Validation/test results

- `npm test`: 779/779 pass, no skips, including 24 new tests.
- `npm run test:playthrough`: 25/25 pass.
- `npm run typecheck`: pass.
- Lexical, Phase 1R and West Pass 1 targeted audits: completed offline, results above.
- API-key/token and configured adapter environment variables were cleared in gate processes. No paid LLM or embedding provider was used.
- Existing duplicate-safe nested loading, immutable ID identity, visibility, runtime movement and validation checks remain passing. Corpus counts, exact NPC/faction lists, initial base defaults and synthetic batch sizes were updated to the new authored dataset without loosening ranking requirements.

## S. Deliberately unresolved canon

The clerical expulsion reason, shelter disappearances, exact institutional record entries, unspecified personal relationship terms, private source/client secrets, exact routes/depots and ultimate criminal coordinator remain unestablished. No public residence, extra shopkeeper, actual password, named guard/bodyguard, child or sex-worker NPC, new chapel, pleasure-house name, prices, mandatory plot or runtime schedule was invented. Limited knowledge is not a hidden completed explanation.

## T. Reserved NPCs / next authoring work

Still reserved: Elspeth Vael, Seren Vael, Magistrate Quarn, Sister Veyra, Inquisitor Kaelen, Lord Malakor Vane, West shopkeepers, Gatherer's Inn keeper, further gang leaders, guards, child NPCs, sex workers and the ultimate criminal coordinator. Neither shopkeeper authoring nor other districts were begun.

WEST NPC ANCHORS READY
