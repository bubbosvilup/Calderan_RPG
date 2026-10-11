# Canon overview

Status: Current. Last reconciled: 2026-10-11. Source of truth: the authored YAML under `data/` (this page summarizes; the data wins on any difference). Visibility is enforced by the engine: the narrator and the player see only what the entity's `knowledge.visibility` allows.

Sections 1 to 9 describe **public** canon, as the world itself would state it. Section 10 is **AUTHOR-ONLY**: it exists so maintainers do not contradict hidden truth; it must never be pasted into prompts, UI or player-facing text. Sealed operational details are deliberately not recorded here; read the restricted entities in `data/world/secrets/` directly when authoring.

## 1. World and geography

- The known continent is **Helion**, Eurasia-scale, with four great divisions: the nations **West**, **Center**, **East**, and the **South Continent** beneath Center and East (not bordering West). Capitals: Calderan (West), Zul-Rath (Center), Vaelrost (East). Seas: Mist Sea (north), Sorrow Sea (west), the Silent Ocean (east), Chained Bay (southwest). The Dragon's Teeth Mountains are a place name only.
- There is no "Merovar" in current canon (a naming note from Phase 1E, now historical in `docs/authoring/GEOGRAPHY.md`).
- Regional elements by tradition: West Earth, Center Fire, East Water, South Air. A tradition, not a statement about any people.
- Climate follows [Time and environment](../architecture/TIME_AND_ENVIRONMENT.md).

## 2. Calderan and Heartstone

Calderan is the West capital and the campaign's starting city (slave market, West District). Heartstone is a private tower with its own rules: see [Heartstone](../HEARTSTONE.md). The Heartstone floor plan (LR, CY, U1, F1) is authored in `data/locations/calderan/heartstone/`; the Property system that would manage it is not implemented.

## 3. History and calendar

The Sun Emperor **Aureth** revealed himself in **Year 0**, ruled all Helion as one empire, and disappeared in **Year 491**; the continent then fragmented into dukedoms and states. The current year is **1191**. Calendar: [Time and environment](../architecture/TIME_AND_ENVIRONMENT.md). The Five Suns (six in leap years) and the Great Illumination are Church-linked observances.

## 4. The Church of the Sun Emperor

Teaches that it began in Year 0 as a devoted, charitable body and that its watch against Shadow descends from the Founder. Public doctrine treats Aureth's Light as sacred, mortal Light as sacrilege and Shadow as heresy. How its structure changed after 491 is restricted from ordinary clergy and citizens.

## 5. Creation myth and the Four (public)

The Church teaches that the world arose from primordial powers, that Aureth brought Light, order and guidance, and that the Four elemental figures were ordered and blessed under his reign. Publicly this is mythology, not established fact; the nature, names and powers of the Four are not established. There are no objectively established dragons in canon.

## 6. Magic

Elemental magic follows the four regions' traditions. **Light and Shadow** are exceptionally rare magical classifications, not moral alignments; Light is rarer and fading, Shadow slightly more common and actively hunted by the Church. Publicly identifiable use draws major institutional attention.

## 7. Peoples

Humans, elves, dwarves, mixed ancestry and **Beastfolk**. Beastfolk are a broad umbrella of animal-associated lineages (non-exhaustive). In the human-dominated West they suffer prejudice and are overrepresented among the enslaved; this is social, not biological truth. In Center they are politically central and form most of the traditional upper class, and Center also runs a slave economy, so Beastfolk are neither synonymous with slavery nor with rule. As currently understood Beastfolk cannot use magic, and are widely said to resist hostile magic (mind-affecting and ordinary offensive spells take little hold); this is a common belief, not a guarantee against indirect harm, environmental hazards or beneficial magic. East and future continents are undefined.

## 8. Governance and slavery

West is governed by Dukes who rule in the Sun Emperor's name; Center is Beastfolk-led, prohibits magic and chooses its ruler by tournament; East governs itself. Slavery and its trade network are established in the West governance files.

## 9. Nicco

Nicco is an otherworlder. Canon does not make Nicco related to, chosen by, or any kind of heir of Aureth.

## 10. AUTHOR-ONLY (spoilers; never player-facing)

High level only:

- **Eldaven** is the ancient name of the continent; it appears only in restricted pre-Year-0 fragments and is never used by public channels.
- Aureth is the current incarnation of **Light**; he is publicly the Sun Emperor and is sealed since Year 491.
- **The First Voice** is the incarnation of **Shadow** and the hidden controller of the Church.
- **The Four** are elemental child incarnations (West Earth, Center Fire, East Water, South Air). No objective dragons exist.
- Further sealed material (sleepers, the origin of the Beastfolk, primordial cosmology) lives in `data/world/secrets/`.

The authority for these facts is the restricted data files; if they change, this section must be updated, and any contradiction with section 5's public claims is intentional.
