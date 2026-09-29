# Calderan authored-data foundation review ? 2026-09-29

## A. Previous layout problems

Flat location folders mixed nations, cities, tower floors and city-internal places. world/fundamentals mixed geography and governance. District details lived inside an overview rather than independently referenceable locations. Character shape lacked a scalable distinction between public identity and private portrayal. Existing stable-ID, visibility, dataset, retrieval and save guarantees were retained rather than rebuilding the engine.

## B. Loader / path / provenance audit

The audit was written to [AUTHORED_DATA_ARCHITECTURE](../architecture/AUTHORED_DATA_ARCHITECTURE.md) before data moves. Discovery was already recursive, sorted and symlink-rejecting. YAML keys/tags/aliases, IDs, duplicates, typed references and cycles were already validated. The blocking filename-equals-ID convention was removed before migration; semantic validation was not relaxed. WorldStore child/type views now use its stable-ID-sorted entity list rather than insertion/source order.

| Concern | Does path affect it? |
| --- | --- |
| Entity/chunk identity | No: explicit stable IDs |
| Engine provenance and error ordering | Yes: source_path and first-error order |
| Model-visible provenance | No filesystem path exposed |
| Dataset hash | No: canonical validated document content, sorted IDs/keys |
| Semantic document reference/text | No path contribution |
| Lexical score/tiebreak | No path contribution |
| Save compatibility | Dataset ID, not path; pure moves preserve it |
| Folder names | Editorial only; no role/awareness/location/membership inference |

Before content changes, a **move-only checkpoint** proved identical IDs, hash, semantic text, all lexical query ranks/scores, and all Phase 1R rows. The old basename/content assumptions in tests were replaced with ID/content/reference assertions and recursive file inspection. Search targets and expected rankings were not rewritten to make the migration pass.

## C. Adopted folders

Characters are split into player and calderan/civic (Pellan); the future Church/nobility/guard/slave_trade/merchant folders contain no fabricated records. Locations are organized into world, west, and calderan with districts, heartstone and West subareas. Other district editorial folders remain empty. Existing factions/concepts/magic/races remain in their domains; items/events and other world categories remain ready for future supplied canon.

The four fundamentals records moved into world/geography and world/governance. `main_city_structure` now lives in `world/geography/calderan_city_structure.yaml`; its ID is unchanged. Its explicit legacy world_lore category remains fundamentals for schema compatibility; paths never infer metadata.

## D. Stable IDs

All **49** old entity IDs survive. Exactly seven IDs were added: calderan_west/east/north/south/center, slave_market_back_alleys and pellan. No chunk IDs changed (corpus still has zero chunks). Renamed `.yaml` and `.yml` files work; duplicate IDs in different nested directories still fail. Arbitrary relocation tests verify full semantic text, score-ranked retrieval and snapshot restore equivalence.

## E. Dataset / save implications

Before and move-only:
`sha256:a88db00974726a63a4e4834ebd26d8a0e1eb195ca203e756df97fd59cffaf23b`

After content:
`sha256:1e32c4a1a1a3631744b9b10f437f5c0e0c44bca671aa4164ad30a10df4fce471`

The change is intentional content identity, not a filesystem artifact. Before: **49 entities** (26 locations, 1 character, 6 factions, 1 concept, 15 world_lore). After: **56** (32 locations, 2 characters, the other counts unchanged). Events/items remain zero. Production semantic caches must be rebuilt; character public-profile text advances the builder version to `authorized-canon-text-v2`. No embeddings were purchased or fabricated.

Old content-bound saves remain incompatible with the newly authored dataset until an explicit future save/content migration; no bypass, silent rebase or existing-save modification was performed. Pure moves alone remain compatible and have a restore regression test.

## F. District entities

Five real location entities are parented to calderan, with no connections. West carries poorer/crowded labor, business and legal-slavery tendencies without declaring all inhabitants poor/criminal. East carries commerce/craft/manufacturing and ordinary mixed residences. North carries religion/healing, competent and ineffective treatment, charity, Mage Registry and Inquisition presence. South carries garrison/security/transit, services and newcomers. Center carries wealth/administration, the Duke/Magistracy, guild/institutional activity and the older inner wall, without exclusive noble zoning.

Calderan is explicitly the largest city/political capital of West and a very large dense walled metropolis. Districts are broad regions; substantial crossings are meaningful travel. Exact roads, gates, times and routes remain unestablished.

## G. Hierarchy and market fringe

```text
continent / west / calderan
  calderan_west
    heartstone
      heartstone_u1 / heartstone_lr / heartstone_f1 / heartstone_cy
    heartstone_square
    calderan_slave_market
    slave_market_back_alleys
  calderan_east
  calderan_north
  calderan_south
  calderan_center
```

The square is outside the tower and remains its sibling under West. Eight existing directed tower/entrance connections are unchanged. No other places received guessed district placement. The fringe is expressly unofficial/criminal and distinct from the legal market. It permits supplied exploitation/trafficking themes, including children only as nonsexual victims; no named operators, sexual minor content or plot hooks were authored.

## H. Character canon contract

Complete new-character form uses stable identity/aliases, summary/tags/search_context, species, sex, age_band, appearance, engine role plus public occupation, traits, purpose, morality, base/work/home associations, affiliations, relationships, explicit knowledge policy and optional private_notes. Summary is the public_summary concept and traits is personality, avoiding duplicate fields. Existing location-only records (including Nicco) remain a deliberate compatibility form; combining legacy location and base_location fails.

New fields have explicit count/character/type/reference bounds. All template files remain valid as their own isolated example dataset. Unknown scalar values are explicit null; no filler lore is required.

## I. Purpose versus goals

Purpose is stable baseline motivation across fresh campaigns. It neither creates nor updates a CampaignState goal. Morality is concrete ethical boundaries and tradeoffs, not an alignment label. Pellan's accurate records and avoidance of dangerous entanglements are portrayal, not a generated quest/objective. Runtime goals and authored purpose remain independent.

## J. Location semantics

A non-null base supplies the fresh runtime default; runtime position wins thereafter. Work/home are associations only and never spawn presence. A null base supports an unestablished runtime position until explicit placement; restore enforces canonical IDs and unique entries, retaining required entries for established-default NPCs. Null home/work never means homeless/unemployed/absent.

Pellan starts at the coarse calderan_center default; the opening remains outside Heartstone with only Nicco locally present. The existing NPC-location snapshot domain now has Pellan, rather than a new persistence system. Base locality feeds only the existing explicit public/local awareness policy; association queries themselves grant no knowledge.

## K. Indexing versus visibility

Search text uses explicit public fields, including the new observable identity/appearance/occupation profile. Purpose, morality, private_notes, traits and affiliations are excluded from both audience search texts and public entity fetch, even on a successful name match. Purpose/morality/private notes appear only in a marked narrator portrayal block for present narrator-visible NPCs. They never enter the knowledge-access projection or automatically grant Nicco/other NPCs knowledge.

Full WorldStore/indexSource and semantic filter metadata are privileged engine objects; only document.text is embedded. Tests inspect actual captured embedding batches, not merely result summaries. Authors must still keep public summary/content/search_context/relation prose free of secrets. Independent restricted facts belong in explicitly classified chunks. Deterministic boundaries are verified; no claim of perfect narrator secrecy obedience is made from offline tests.

## L. Derived location indexes

WorldStore builds immutable, stable-ID-ordered association buckets at load time: charactersBasedAt, charactersWorkingAt, charactersLivingAt. They derive solely from each character YAML. No npc_locations.yaml, duplicated mapping canon or new persistent state was created. Runtime movement does not change these canonical indexes.

## M. Pellan pilot

Exactly one canonical NPC was added: [Pellan](../../data/characters/calderan/civic/pellan.yaml). Human male, approximately middle-aged, thin/slightly hunched, messy-haired, thick round spectacles, ink-stained fingers and shabby modest clothing. Traits include anxious/pedantic/conscientious/verbose/easily overwhelmed and fainting under severe shocks. Purpose and morality follow the supplied description.

Base is Center. `work_location: null` is deliberate: the exact Civil Registry and Archive has no location entity, while occupation/public prose still states his employment and district. Home is null; affiliations and relationships are unestablished empty lists. No spouse/family/residence/secret/political allegiance/hidden history was added. No new registry building was required.

## N. Retrieval before / after

| Metric | Before | Move-only | Final content |
| --- | ---: | ---: | ---: |
| Lexical cases | 44 | 44 | 44 |
| Lexical top-1 | 31/34 | 31/34 | 31/34 |
| Labeled recall@5 | 89.36% | 89.36% | 89.36% |
| MRR@5 | 0.950980 | 0.950980 | 0.946078 |
| Multi-answer recall@5 | 61.54% | 61.54% | 61.54% |
| Phase 1R policy top-1 | 25/25 | 25/25 | 25/25 |
| Phase 1R policy recall@3 / @5 | 100% / 100% | 100% / 100% | 100% / 100% |
| Engine-only ablation top-1 | 19/25 | 19/25 | 19/25 |
| Engine-only recall@3 / @5 | 92% / 100% | 92% / 100% | 92% / 96% |

The small MRR decline is explained by the new North District competing on ?church investigators?: the pre-existing lexical inference gap remains, with Inquisition rank 2 ? 3. The engine-only ablation also loses one expected result from a raw question's top five as new districts compete; the unchanged production turn policy rescues the intended targets. These changes are disclosed, not reclassified as perfect retrieval. No unrelated identity-query target regression was observed.

The initial added district corpus displaced the city overview from the districts question, temporarily giving policy recall 98%. A natural descriptive alias (`Districts of Calderan`) restored overview retrieval without changing labels, ranking thresholds or the policy. Unnecessary cross-nation names were removed from district search_context to avoid spurious matching. Headquarters detail was preserved in Center instead of being lost when shortening the overview. Intermediate after/refined artifacts remain available.

Seven probes retain exact full ranked-score records: Calderan, West District, Heartstone, slave market, Light magic, Inquisition, Ironbound. West District now correctly resolves first to the new district; official market remains first for slave market; Heartstone, Light magic, Inquisition and Ironbound retain their intended top result.

Phase 1H entry point ran before and after with keys/adapters cleared. **Real semantic/hybrid quality is unavailable offline**, not reported as passing or as lexical fallback success. Mechanical semantic/hybrid integration, public embedding-text isolation, version binding and stable references pass using explicit synthetic providers. No paid LLM or embedding run was needed or performed.

Artifacts: [before](calderan-data-before.json), [move-only](calderan-data-moved-only.json), [initial content](calderan-data-after.json), [refined](calderan-data-refined.json), [final](calderan-data-final.json), [Phase 1H before](calderan-data-phase1h-before.json), [Phase 1H final](calderan-data-phase1h-final.json), [lexical final](calderan-data-lexical-final.md).

## O. Validation and offline gates

- `npm test`: **740/740 pass**.
- `npm run test:playthrough`: **25/25 pass**.
- `npm run typecheck`: pass.
- Lexical 44-case suite and Phase 1R 25-case benchmark rerun, unchanged expected targets.
- Phase 1H harness run with real provider unavailable; synthetic mechanics tests pass.

Keys were cleared and a process-local Node preload disabled fetch and socket connections. No network requests were used. New tests cover relocated datasets/save restore/semantic text/ranks, recursive YAML and nested duplicate IDs, affiliation/location target types, awareness/cycles, bounds, private-text and public-result isolation, narrator-only knowledge separation, immutable association indexes, runtime override, null defaults and the constrained pilot/topology. Pinned counts/paths/ancestry were updated only for the explicitly requested new canon; no query relevance labels or rank expectations were weakened.

## P. Remaining work and stop point

The remaining Calderan cast, exact Registry building, NPC residences/affiliations, district roads and routes are deliberately unestablished. Empty editorial folders do not imply content. Production vector-quality evaluation/rebuild and any old-save content migration require separate work; the existing baseline lexical gaps and measured related-tail competition are visible above. No gameplay subsystem, new cast batch or next phase was started.


## Detailed ranking investigation

All changed ordered ID lists are preserved with full score contributions for the seven requested probes in [ranking review](calderan-data-ranking-review.json). Pure-move scores and ranks were byte-equivalent under the same benchmark data. Content additions change inverse document frequency even when ranks stay fixed. No expected query targets were changed.

| Lexical query | Explanation |
| --- | --- |
| mages guild | Corpus document-frequency changes reorder lower-ranked guilds/Nicco; original target remains first. |
| church investigators | New North District explicitly mentions Church and Inquisition; the pre-existing investigator lexical gap matches church rather than investigator, so North competes at rank 2 and Inquisition moves 2 to 3. This accounts for the MRR decrease; not a path effect. |
| merchant political institution | Detailed institutional prose moved out of the overview into Center; West governance and the city move up in the tail. Merchants Guild stays first. |
| who has mana | Generic has matches the new East/South prose; mana remains first. Existing stopword behavior is unchanged. |
| beastfolk slavery west | New fringe is a legitimately matching slavery/West location and replaces the overview in the tail; both labeled answers remain. |
| legal slave port | New fringe contains legal slave-market context, though it is explicitly unofficial. Davenport stays first. This is a broad lexical tail match, not a claim that the fringe is legal. |
| slave market border | New fringe and corpus frequency shifts reorder broad slave-market matches; the existing top-1 miss remains. No border/route canon changed. |
| illegal slaves pirates | New criminal fringe matches illegal/slave vocabulary in the tail; Blackwater stays first; no pirate operators were added. |
| slave trade West | West district now owns the detailed district subject; adding it and reducing overview detail changes lower ranks. Existing expected-top1 miss remains. |
| courtyard medicine plants | North now owns healing/medicine detail formerly in overview. Courtyard remains first; related tail changes are expected. |
| where do pirates operate? | The generic operate token matches legitimate businesses in West. Blackwater stays first; pre-existing diagnostic relevance mismatch persists; no pirate district was invented. |
| mages guild headquarters | Headquarters detail intentionally moved from main_city_structure to calderan_center; the new location replaces the overview in this diagnostic query. |

Phase 1R changed tails group as follows: all ten slave-market variants gain fringe/West results; Calderan questions gain district locations; Inquisition gains North; the Ironbound caravan query reorders a slave-market tail. The policy still places every expected primary target first and all labeled relevant records in the top three. Engine-only ablation remains separately recorded, not counted as policy success.


DATA FOUNDATION READY
