# Physical interaction — minimal authority design (Live NPC Regression Repair 1)

Status: design accepted; **class B only implemented** in Repair 1. C and D are specified here but deliberately not built.

## Problem

Live Test 4 (unprovoked punch) showed that the engine had no physical-interaction domain. The punch produced no natural action, the controller could not propose any physical consequence, and narration asserted split lips, knockdowns, restraint by guards, ejection and detention that CampaignState never recorded. Any consequence that constrains the next turn needs an authoritative representation, or it must not be narrated as established.

This is not a combat system. There are no HP, armor, dice, initiative, turn order or grids, and none are planned here.

## Consequence classes

| Class | Examples | Persistence | Repair 1 |
|---|---|---|---|
| A. Cosmetic/immediate | flinch, recoil, gasp, momentary pain, a dropped fan | none (prose only) | Allowed freely in prose |
| B. Short-lived physical condition | minor injury (split lip, bloody nose), dazed, knocked down, winded | character condition tags | **Implemented** through existing `set_condition` |
| C. Positional/state constraint | restrained, pinned, held, thrown out, dragged away | scene constraint | **Not represented** → may be threatened or attempted, never narrated as accomplished |
| D. Social/legal state | ordered detained, arrested, barred from a shop, scene-local hostility | scene/social constraint | **Not represented** → may be threatened, ordered or demanded in dialogue, never narrated as accomplished |

## Implemented (class B)

No new snapshot domain and no schema version change. The design reuses `CharacterCurrentState.conditions` and the existing campaign command:

```text
set_condition { character_id, conditions: string[], presentation?, status? }
```

It adds only authorization rules and a controller-schema entry:

- **Natural action** (`natural-actions.ts`, kind `physical`): Nicco's asterisked strike/punch/kick/slap/headbutt, shove/push, grab/seize/restrain, and release/let go of a *present* character. The player-authored act is an attempt; its effect is `outcome_dependent`. A target that does not resolve to exactly one present character produces no interaction.
- **Turn evidence** records `physical_interactions: [{ actor: "nicco", target, interaction }]` for the turn.
- **Controller vocabulary** now includes `set_condition { character_id, conditions }` (no `presentation`, no `status`).
- **Authorization** accepts `set_condition` only when:
  - the character is present;
  - this turn has a physical interaction involving that character, or the character is Nicco and a physical interaction with a present character happened;
  - existing conditions are preserved (no removal) and at least one tag is added;
  - every added tag is in the closed vocabulary `minor_injury`, `dazed`, `knocked_down`, `winded`;
  - `status` and `presentation` are absent (no death, incapacitation or disguise from a punch);
  - a controller evidence quote verifies: an unhedged narration sentence about that character contains a term for every added tag.
  The grammar path never confirms conditions, so `shadow` evidence mode never commits them.
- **Narration audit** (`narration-audit.ts`) flags class-B terms narrated about a present character without a committed condition, and class-C/D accomplishment phrases outside dialogue. Flags trigger the reconciliation revision (see `TURN_COORDINATOR.md`).

## Proposed, not implemented (classes C and D)

A future `scene_constraints` domain:

```text
SceneConstraint {
  id: string;
  kind: "restrained" | "ejected" | "barred" | "detention_order" | "hostile";
  subject_id: string;          // who is constrained
  by_id: string;               // present character imposing it
  location_id?: string;        // barred/ejected scope
  since_minute: number;
  status: "active" | "lifted";
}
commands: impose_constraint { constraint } | lift_constraint { id }
```

The authorization rules would mirror class B: the imposing character must be present, the player's act must be recorded in same-turn evidence, and there must be a verified narration quote. `ejected` would also require a real travel connection. It was not built because Repair 1 must not run Tests 3/4, and C/D need their own live evaluation. Until it exists, the narrator contract states that C/D outcomes can be threatened, ordered or attempted but not narrated as accomplished.

## Known limits

- Condition tags do not expire automatically. A later authorized `set_condition` could remove them, but no recovery grammar exists yet.
- Detection of narrated class-B/C/D claims is bounded pattern matching, not semantic understanding. It is a safety net behind the prompt contract.
