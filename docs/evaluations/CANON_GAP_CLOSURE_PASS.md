# Canon Gap Closure Pass

Baseline: `main` @ `7820d5a`. Not committed, not pushed. No Calendar, Season, Weather, Property or combat runtime; no save-schema change; no live provider or image calls.

## 1. Executive verdict

**GAPS_CLOSED_WITH_OPEN_QUESTIONS_PRESERVED.** All fourteen requested gaps are closed with the decisions supplied; the four intentionally open topics (reincarnation mechanics, detailed Forgotten Era, full Calendar, new Church NPCs) are untouched. Typecheck, build and the full suite are green (3004/3004).

Spoiler discipline: First Voice operational concealment, the Cassian communication mechanism and the hidden-agent structure were authored under tier-3 sealed canon (plus Cassian's own belief in a holder-only record), validated and tested. They are **intentionally omitted from this report**; no secret name or detail appears in it.

## 2. Baseline

- Canon at `7820d5a` (Helion / Eldaven, Aureth = Light incarnation, First Voice = Shadow incarnation, elements unnamed, Four as "primordial powers", dragons as folk iconography, Beastfolk origin unresolved, "sovereign of West" wording).
- 2984 tests green before the pass; 3004 after (20 new, existing assertions updated).
- A pre-edit audit table (topic / current / decision / conflict / files / secrecy) was built from the migration report, all cosmology, secret, Church, geography, magic, race and NPC records, and every dragon and Light/Shadow reference. Nothing was edited blind.

## 3. Gaps closed

| # | Gap | Result |
|---|---|---|
| 1 | Four elements and regional mapping | Closed (§4, §5) |
| 2 | Nature of the Four | Closed (§6) |
| 3 | Nicco's Light | Closed: unexplained, no Aureth link (§9) |
| 4 | Aureth's sealing location | Closed: pocket dimension (§10) |
| 5 | Operational concealment of the First Voice | Closed, sealed, withheld (§11) |
| 6 | Church origin and corruption | Closed (§12–§14) |
| 7 | Aureth's warnings | Closed (§16, §17) |
| 9 | Mortal Light/Shadow users | Closed (§18–§21) |
| 10 | Political sovereignty | Closed (§15) |
| 11 | Consequences of imbalance | Closed (§22, §23) |
| 13 | Beastfolk origin | Closed (§24, §25) |
| 14 | Seven-hundredth anniversary | Closed (§26, §27) |
| 16 | Woodsingers / Dragon's Teeth without dragons | Closed (§28, §29) |
| 18 | Public Light/Shadow doctrinal tension | Closed (§19, §20) |

Left open on purpose: 8 reincarnation mechanics, 12 detailed Forgotten Era, 15 full Calendar, 17 Church NPC expansion.

## 4. The four elements

Earth, Fire, Water, Air: the same four categories as mortal elemental magic. `elemental_magic` now says so, notes that the regional pairing is lore and not a rule of who may learn what, and that elemental mages are fading (no date, no rate).

## 5. Regional mapping

West = Earth, Center = Fire, East = Water, South Continent = Air. Objective deep canon in the sealed cosmology; also public as old tradition in `the_four`, `continent`, `continental_structure` and `elemental_magic`, with an explicit statement that it is cosmological and not a trait of any people. A test asserts that no contradicting pairing exists anywhere.

## 6. The Four as child incarnations

Sealed (`primordial_cosmology`): the Four are the current embodied child incarnations of Earth, Fire, Water and Air, conceptually parallel to Light in Aureth and Shadow in the First Voice. Whether their incarnation works the same way is explicitly **not inferred**. No names, genders, personalities, ages, species, origin stories, detailed powers or combat abilities. Alive but dormant, not dead; no waking method. Cause of dormancy kept as gradual consequence of the post-491 imbalance, with no dates. The public `the_four` record no longer calls them guardians-as-dragons; it presents only tradition.

## 7. Dragon canon removal

- Dragons do not exist as creatures in current canon.
- Removed: "Four often drawn as dragons" and "Aureth drawn as a golden dragon" from `the_four`, `aureth_creation_myth` and `church_doctrine` (two places each where applicable), plus the dragon search tokens.
- Sealed records now state only the negation (not a dragon, never dragons, not created by a dragon).

Classification of every remaining hit in `data/` and `src/`:

| Class | Hits | Action |
|---|---|---|
| A historical | `docs/evaluations/MAJOR_CANON_LORE_MIGRATION.md`, older evaluation JSON | Left as is |
| B myth / name | "Dragon's Teeth" place name in 10 location and lore records; the folklore line in `dragons_teeth_mountains` | Intentionally preserved |
| C current objective canon asserting a dragon | none found | n/a (previous C hits removed) |
| D engine / test string | `src/turn/background-grounding.ts` comment/token; `tests/lexical-search.test.ts` tokenizer and "dragon ruler" retrieval-eval case | Unchanged, still valid |

A test fails if any unsealed text mentions a dragon outside "Dragon's Teeth" or the folklore line.

## 8. Dormant locations

- Earth child: within, beneath or enclosed by the World Tree (the tree is the objective identity of the sleeper). Tier 2, no holders.
- Fire child: beneath the deepest part of the Central Oasis; the red reflections stay associated, the being is not red. Tier 2, no holders.
- Water child: dormant somewhere in the East; Air child: somewhere in the South Continent. Neither placed. No new sleeper records.

## 9. Nicco's Light magic

Nicco is an otherworlder with extremely rare Light magic of unknown cause. Nothing links him to Aureth: not a reincarnation, heir, fragment or chosen. The sealed canon says so explicitly and the public/restricted layers no longer imply otherwise. The engine fact `campaign_fact_nicco_light_mage` is unchanged; the LLM is given no resolution.

## 10. Aureth's prison

A pocket dimension outside ordinary geography. Appearance, physical rules, time flow, dimensions, access ritual, entrance, key, consciousness and communication are all explicitly undefined. Only the First Voice definitively knows how it is reached; that method is not authored. Sealed tier 3 only; the phrase never appears in unsealed canon (tested).

## 11. First Voice operational authoring

**Details withheld by user request.** Authored under tier-3 sealed canon, validated by WorldStore, covered by retrieval-secrecy and leak tests. Not reproduced here.

## 12. Church origin

The Church began in Year 0 after Aureth's revelation, as a genuinely benevolent and devoted body supporting his continent-wide rule and organizing worship, charity, order and administration. Not founded by Shadow, not originally corrupt, no original Inquisition. Public record `church_origins` states the benign origin and a public falsehood-compatible claim of unbroken continuity; sealed `church_hidden_control` states the true history.

## 13. Post-491 Church transformation

Sealed: the First Voice gradually manipulated influential people and structures after 491. Direction and mechanism are canon (centralization, censorship, restricted pre-Year-0 records, hardened doctrine, wider persecution of magic, growing political influence); individual centuries are not written. Restricted record `church_post_491_history` (tier 1; holders Cassian and Helbrecht) gives the highest Church leaders the institutional facts only, without cause.

## 14. Inquisition origin

Created after 491; it did not exist under Aureth. Sealed truth plus the tier-1 record above. Helbrecht knows his institution's charters post-date the disappearance; the public Inquisition record still gives no founding date.

## 15. Aureth's political rule

Aureth was sovereign of all Helion in a continent-wide empire with local authorities allowed. After 491 central authority vanished and the empire fragmented (dukes, nobles, regional rulers, competing states, wars). New public record `helion_empire`. "Sovereign of West" wording removed from `sun_emperor`, `west_governance`, `church_doctrine`, `church`, `calderan`; West's Dukes still govern in his name, which stays valid; Center and East independence is preserved.

## 16. Aureth's Shadow warnings

Before 491 Aureth sensed hostility, jealousy, predatory intent and imbalance in the Shadow incarnation and encoded warnings in liturgy, prayer and symbolic language. He did not write that the First Voice is Shadow or that it would seal him. `sun_emperor_shadow_warnings` (tier 1, no holders) now says the warnings survive chiefly in the Canticle, in language readable as general piety. The First Voice leaves the Canticle because it is ambiguous, reinforces anti-Shadow doctrine and is too well known to remove without raising suspicion (sealed).

## 17. Warning prayer / canticle (public text)

*The Canticle of the Watchful Sun* (public record `sun_emperor_prayer`):

> Keep me in the Light, and the Light in my keeping.
> Let no voice sweeter than the dawn lead me from the dawn.
> Where pride wears the colors of humility, let me look twice.
> Where the dark is kind to me, let me ask what it costs.
> What is hidden from the Sun is not hidden from the Sun's watch;
> let the faithful keep the vigil until the morning returns.

Public reading: devotional warning against darkness, pride, false voices and separation from the Light. The deeper reading is sealed. Tests assert the text contains no First Voice, incarnation, sealing, Shadow, High Archon or Inquisition vocabulary.

## 18. Mortal Light/Shadow distinction

Sealed and tested: a Light mage is not the Light incarnation, a Shadow mage is not the Shadow incarnation; a mortal may have affinity with, or access to, a fraction or expression of a force (the same for elements). Light is rarer than Shadow; Light mages appear about once a century as a cultural scale, not a spawn rule; Shadow manifestations are somewhat more common since the sealing. No percentages.

## 19. Light-mage doctrine

Public (`church_doctrine.light_and_shadow`, `light_and_shadow`): the Sun Emperor's Light is sacred and uniquely legitimate; "The Sun's Light is given to the world through the Sun Emperor; no mortal may claim the Sun for themselves." An independent mortal Light is an illicit fragment or stolen echo, a false claim to a divine prerogative, a potential false prophet or blasphemer, spiritually dangerous. The Church does not see the contradiction (sacred in Aureth, forbidden in mortals); this is an intentional feature. Restricted (`sun_emperor.light_secret`): the inner Church and Inquisition treat mortal Light users as the highest-priority threat; confirmed discovery means capture, investigation, condemnation and execution, with survival extremely unlikely, but no universal procedure and no automatic Inquisition summons.

## 20. Shadow-mage doctrine

Public persecution is real: hunted, imprisoned, interrogated, tortured, publicly condemned as heretics. Scholars and mages may treat Light and Shadow as categories, not virtue and vice; objectively they are cosmic forces, not moral alignments.

## 21. Hidden persecution truth

Authored in sealed tier-3 canon: the real reason mortal Light mages are the true high-priority threat, and the fact that promising Shadow users are sometimes diverted to a small hidden force (not an army) while most suffer ordinary persecution. Any secret name for that force is sealed and **not given here**. No operational First Voice detail appears in this report.

## 22. Post-491 magic decline

Public `modern_world_decline` and `elemental_magic`: magic is slowly fading, elemental mages weaker and rarer, the rarest gifts fading fastest, old feats harder. No end date, no numeric decay. The sealed cosmology records the cause (the imbalance after the sealing).

## 23. Environmental and political imbalance

Public `modern_world_decline`: a dimmer, harsher feel, thinner soil, failed harvests, periodic famine, disease pressure, resource competition, political tension, more conflict. Tendency over centuries and in many regions; healthy and beautiful places remain. Useful for later Season/Weather design; nothing implemented.

## 24. Beastfolk origin

Sealed `beastfolk_origin`: created by the Fire elemental incarnation or power. Not by a dragon, Aureth, Light or Shadow; no ritual or date. Cannot channel magic because they were made through Fire rather than the Light/Shadow-linked structure of magical mortal life. The old "unresolved" note exists only in the historical migration report.

## 25. Beastfolk magic properties

Public: cannot use magic (unchanged), plus a common belief of resistance to hostile magic with an explicit caveat. Sealed: immune to ordinary offensive magic and to Shadow-based mental confusion or corruption; **not** immune to every supernatural phenomenon, indirect physical consequences, environmental hazards or beneficial magic. The cosmological reason and the exact Shadow relationship stay deep. No Center law changed.

## 26. Seven-hundredth anniversary

Public `centennial_observances`: every hundredth anniversary of the disappearance is observed continent-wide (public prayer, illumination with artificial and sacred light, expanded Church ceremonies, rulers participating, celebration with solemnity); 1191 is exceptionally significant. A widespread religious and folk belief holds that after seven centuries a fragment or echo of Aureth's soul or Light may return; the Church tolerates and in places encourages it. It is stated as belief and rumor, not fact; Nicco is not tied to it (tested).

## 27. Leap-year constraint

`modern_reckoning`: ordinary year 360 regular days plus 5 intercalary = 365; leap year 360 plus 6 = 366, every four years; 1191 is a leap year, so the future calendar's anchor must make it so (not a plain `year % 4`). Month, weekday and intercalary names and the exact anniversary day are explicitly undecided.

## 28. Woodsingers

Public and restricted records now say the Woodsingers protect the tree itself and not any creature, with fragmentary traditions and no automatic knowledge of what it holds (no dragon word in either record).

## 29. Dragon's Teeth

Name preserved. Public folklore line: the jagged peaks are the teeth of some vast beast of long-vanished stories; no known dragons, remains or records of one.

## 30. Church NPC knowledge changes

| NPC | Before | After |
|---|---|---|
| Cassian Valerius | curated history, banned texts, light secret, partial hidden-authority fact | plus `church_post_491_history`; no new rank-based truth; he does not know what the First Voice is, the six-force cosmology or the reincarnation truth |
| Helbrecht | curated history, banned texts, light secret | plus `church_post_491_history` (his own Inquisition's charters); no hidden-authority knowledge |
| Severan Krauss | banned texts only | unchanged; his notes now state he holds public doctrine on history |
| Sister Veyra | public doctrine only | unchanged |
| Brother Aven | public doctrine only | unchanged |

Cassian's own belief about the First Voice and the communication mechanism were authored in holder-only and tier-3 YAML, tested, and are **intentionally omitted from this report**. The narrator-visible grant summary for Cassian is unchanged. No new Church NPCs were created.

## 31. Retrieval and secrecy audit

- All new sealed records are tier 3 (`author_only`, empty `known_by`); no retrieval path for either audience on 19 topical queries.
- An eight-word-shingle test shows no passage of the new sealed records appears in any unsealed entity or chunk.
- Public gap records are findable by their natural queries.
- Grants audit: only Cassian and Helbrecht gain the new restricted record; nothing new reaches anyone else.
- Existing prompt-payload, NarrativeContext, Background Grounding and golden-pipeline tests pass; the golden fixture changed only in a world-content hash.

## 32. Stale canon sweep

| Item | Classification |
|---|---|
| "Four often drawn as dragons" / golden-dragon Aureth (public) | STALE BUG, fixed |
| "one of the Four" primordial sleepers, elements unnamed (sealed, public wording) | STALE BUG, fixed |
| "sovereign of West" in 5 records | STALE BUG, fixed |
| Church origin "not established" (sealed) | STALE BUG, fixed |
| Mortal Light "not accepted as a school / extinct" in `light_and_shadow` | VALID PUBLIC FALSEHOOD (scholarly view), kept alongside the doctrine |
| Public "Church recognizes year significance" wording | VALID CURRENT CANON |
| Legacy ids `continent`, `aureth_creation_myth`, `aureth_trade`, `aureth_true_identity` | LEGACY ID |
| `MAJOR_CANON_LORE_MIGRATION.md` (Beastfolk unresolved, dragons iconography, elements unnamed) | VALID HISTORICAL DOC |
| Older evaluation JSON mentioning dragons | VALID HISTORICAL DOC |
| `west_governance` "West is still governed in his name" | VALID CURRENT CANON |
| `uther_calderan` "governs in the Sun Emperor's name" | VALID CURRENT CANON |
| Tests asserting old wording | updated |

Sovereignty, magic-persecution, elemental-consistency and post-sealing audits found no remaining contradiction.

## 33. YAML created

Public: `data/world/history/helion_empire.yaml`, `data/world/history/modern_world_decline.yaml`, `data/world/religion/sun_emperor_prayer.yaml`, `data/world/religion/centennial_observances.yaml`, `data/world/religion/church_origins.yaml`.
Restricted (tier 1): `data/world/religion/church_post_491_history.yaml`.
Sealed (tier 3): `data/world/secrets/first_voice_operations.yaml`, `data/world/secrets/hidden_persecution_truth.yaml`, `data/world/secrets/beastfolk_origin.yaml`.

## 34. YAML modified

`the_four`, `aureth_creation_myth`, `church_doctrine` (+ new chunk `church_doctrine.light_and_shadow`), `church`, `sun_emperor` (+ `light_secret` chunk), `west_governance`, `calderan`, `continent`, `continental_structure`, `elemental_magic`, `light_and_shadow`, `beastfolk`, `dragons_teeth_mountains`, `woodsingers`, `world_tree`, `modern_reckoning`, `nicco`, `sun_emperor_shadow_warnings`, sealed `primordial_cosmology`, `aureth_true_identity`, `the_first_voice`, `church_hidden_control`, `first_voice_hidden_authority`, `world_tree_sleeper`, `oasis_sleeper`, and NPC notes for `cassian_valerius`, `helbrecht`, `severan_krauss`.

## 35. Docs modified

`docs/architecture/AUTHORED_DATA_ARCHITECTURE.md` (tier-3 examples) and this report. Historical evaluation reports were left untouched by design.

## 36. Tests added / updated

- New `tests/canon-gap-closure.test.ts`: 20 tests (G1–G20) covering elements and mapping, the Four, dormant locations, Nicco, prison, Church origin and hardening, sovereignty, the prayer, mortal vs incarnation, public doctrine, hidden persecution truth, decline, Beastfolk, calendar, centennial, Woodsingers/Dragon's Teeth, dragon sweep, NPC grants, sealed-layer leak shingles, retrieval secrecy.
- Updated: `canon-lore-migration`, `mythology-secrecy`, `world-canon`, `calderan-four-district-canon`, count tests in `retrieval`, `lexical-search`, `semantic-search`, `retrieval-benchmark-h3`, and the golden fixture hash.

## 37. Typecheck

`npm run typecheck`: clean.

## 38. Build

`npm run build`: clean.

## 39. Full test suite

`npm test`: **3004 tests, 3004 pass, 0 fail.**

## 40. Save / schema impact

None. No save-format, schema or campaign-state change; the opening-state fact is unchanged and save/load tests pass.

## 41. Remaining open questions

Reincarnation mechanics; detailed Forgotten Era; Calendar month, weekday and intercalary names and week structure; any Church NPC expansion; the exact East and South sleeper locations; names, personalities and powers of the Four; the exact way to reach Aureth; the cause of Nicco's Light.

## 42. Final current-canon summary

The world rests on six forces: Earth, Fire, Water, Air (West, Center, East, South) plus Light and Shadow. Aureth is Light's current incarnation and the First Voice Shadow's; the Four are the dormant child incarnations of the elements. No dragons exist. Aureth ruled all Helion from Year 0 until he was sealed in a pocket dimension in 491; the empire fragmented and the world has slowly dimmed since. The Church began benevolent in Year 0 and hardened after 491, creating the Inquisition. Publicly, Aureth's Light is sacred and any mortal Light is sacrilege while Shadow is heresy; in truth mortal Light mages are the greatest danger to the hidden power. Beastfolk were made by Fire and resist hostile magic. 1191 is a leap year and the seven-hundredth anniversary, a centennial of great observance. Nicco is a Light mage of unknown cause, linked to no one.

## 43. Recommended next step

Calendar System **design** (not implementation): fix the leap anchor so 1191 is a leap year, name months, weekdays and intercalary days, and place the centennial anniversary day; then Weather System V1 as already on the roadmap.
