# Heartstone: current implemented state

Status: Current. Last reconciled: 2026-10-11. Source of truth: `src/campaign/heartstone-charter.ts`, `heartstone-recognition.ts`, `opening-state.ts`, `src/turn/household-evidence.ts`, `command-authorizer.ts`, `data/locations/calderan/heartstone/`, `data/world/cultures/heartstone_*.yaml`. Build report (historical): [HEARTSTONE_HOUSEHOLD_RITE](evaluations/HEARTSTONE_HOUSEHOLD_RITE.md).

## Scope

Implemented: lawful ownership, the opening deed, the household charter, the three household rules, the household rite, membership, NPC+ promotion linkage and derived recognition warmth. **Not implemented:** the full Property system (see [Roadmap](ROADMAP.md)).

## Ownership

Heartstone is an old, tall stone residential tower in the south-western part of Calderan's West District; it predates Nicco. Nicco begins as its **lawful owner and holder (Keeper)**, recognized by the ordinary civil and property registry. Why he received it is unknown, and the provenance of the documents is unknown. Ownership grants no nobility, sovereignty or legal immunity, and the title stands unless challenged through ordinary law.

## Opening items

A fresh campaign gives Nicco two ordinary `CampaignItem`s (category `document`, owner Nicco, position `carried` by Nicco), using the normal item model. They are not hidden quest flags.

- `Deed of Ownership — Heartstone Tower`: a genuine legal deed naming Nicco owner of the tower, its residence and the enclosed courtyard. **Physical possession of the paper is not legal ownership**: carrying, dropping, storing or handing it over changes who holds the paper, not who owns the property.
- `Heartstone Household Charter`: contains exactly the three canonical household rules and the instructions for the rite.

Only a short description is in the per-turn item list; the full wording is canon, retrieved when the document is inspected.

## Household rules

1. No lies or secrets within the family.
2. Protect the family.
3. Barefoot inside. Shoes outside.

They are seeded as household rules at opening. They are household rules, **not magical compulsions**: they do not force truth, force protection, punish violations, remove membership, remove NPC+ status or override agency.

## The household rite

Canonical core oath (display text; the candidate's own name replaces `[name]`):

> I, [name], choose to stay and become a member of the Heartstone.
> I swear to be loyal to and protect my family,
> and to stand faithfully beside the Keeper.

Runtime evidence matching is **semantic, not byte-for-byte** (`detectHouseholdRite`): equivalent voluntary wording passes when the essential elements are present. A successful rite requires:

- the correct candidate, physically inside Heartstone and **barefoot**;
- direct **bare-skin contact** with Heartstone stone;
- a **voluntary** declaration containing all required semantic elements;
- **explicit Keeper acceptance** (a spoken acceptance may follow its attribution in the next sentence).

It does **not** work through coercion, unconscious recitation, words spoken for the candidate, ambiguous silence, mere affection, being called family, merely entering Heartstone or merely removing shoes. The Narrator establishes events, the Controller proposes `join_household`, and authorization (`riteMissing`) verifies both the receipt and the state (inside Heartstone, no worn footwear, active candidate). A rejected rite uses `rejected_reference_invalid`, so no verified quote can complete it; diagnostics include `rite_incomplete` and `rite_not_voluntary`. The evidence layer is deliberately conservative (it prefers false negatives); for example "will" in the quoted sentence is treated as a hedge ("I will stay" fails, "I have decided to stay" passes).

## Rite = household membership + NPC+ promotion

A successful rite is an authoritative campaign event that establishes, **atomically in one revision**, (A) active household membership and (B) NPC+ promotion (the `premium_characters[]` record, created by `syncPremiumCharacters` inside preparation). There is no partial state. Promotion stays conceptually distinct from membership and is **persistent**: leaving the household changes membership and `activeNpcPlus` but neither deletes the premium record nor demotes. No automatic demotion system exists. See [Character tiers](CURRENT_STATE.md#5-character-tiers).

## Recognition warmth

For Nicco as Keeper and for active recognized household members, direct bare-skin contact with Heartstone's interior stone feels **gently, pleasantly warm** (supernatural; never hot or painful). For unrecognized people the stone feels like ordinary stone at its actual environmental temperature (depending on weather, season, time and room); it is not canonically cold or hostile. Correct semantics: recognized → supernatural gentle warmth; unrecognized → ordinary physical temperature. It is **not** "members hot, outsiders cold".

It is derived from authoritative membership/Keeper state (`recognizedByHeartstone`, `insideHeartstoneInterior`, `stoneFeel`); no `warm_floor` boolean or any other state is persisted. The narrator receives one compact line, only inside Heartstone, naming no one. The effect is not healing, not a stat buff, not evidence of sentience, and does not force barefoot behavior (shoes and boots block it and are not punished).

## Non-sentience

The Heartstone is **not** sentient. It does not create love, loyalty or romance, enforce obedience, override consent, judge moral worth, choose favorites or create relationships. Household recognition is a deterministic property-bound enchantment.

## Physical canon (authored)

- **LR** (ground level, indoor): rounded open-plan residential floor with a fireplace, seating, a large table, an open kitchen, the entrance, shoe storage/bench, the courtyard door, the hatch to U1, the spiral stairs upward and three arched windows.
- **CY** (outdoor): enclosed courtyard with a training area, medicinal beds, tool shed, work table, bench, wood store, clothes line and rain barrel.
- **U1** (indoor): one large stone storage space, larger than LR with a lower ceiling; shelves with food and supplies, barrels and crates, a central grate, pillars and niches; a separate old door and stairs lead further down, unexplored. Reached by the LR hatch, not by the spiral stair.
- **F1** (indoor): the first upper floor, a sparse open-plan private observation and recovery space with a normal maximum of two patient beds (bedside stool, table and wardrobe each; empty medical cabinets). F2 to F6 exist as known floors; F6 is the highest known.
- The residence rises from LR through F1 to F6 on one lateral spiral staircase; the square outside is outdoor.

Exposure per place: LR, U1, F1 indoor; CY and the square outdoor ([Time and environment](architecture/TIME_AND_ENVIRONMENT.md)).

## Future / partial

Generic property entity, containers and property storage, room ownership and use systems, upgrades and persistent household property resources are future work.
