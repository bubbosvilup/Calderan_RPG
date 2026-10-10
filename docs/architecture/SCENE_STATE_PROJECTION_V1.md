# Scene State Projection V1

## Purpose

Four layers, kept apart:

| Layer | Question it answers |
| --- | --- |
| Engine (Campaign / Runtime / World) | What is true |
| **Scene State Projection** | **Which scene truth is available to the Narrator this turn** |
| Narrator Focus | What matters now |
| Narrator | How it is described |

The Narrator receives ONE derived block, `[CURRENT SCENE]`, in place of the former scattered social, item and time fragments. It is
neutral fact presentation, never prose. It exists so the Narrator stops losing state it has no way to know: a background NPC's
condition, who owns and who carries an item, items stored in the room, the wall-clock time, mana and money.

## Derived-only rule

The projection is rebuilt on every Narrator prompt from `TurnContext` (+ a WeakMap side channel, below). It is **never persisted**,
**never mutates** the campaign, the runtime or the world, has no revision of its own, and is not part of a save. Rebuilding it from a
restored save yields the identical block (tested). The Controller's context and prompt are byte-identical to before (golden pipeline
test).

## Pipeline (three stages, three modules)

1. `src/turn/scene-state-projection.ts` — **derive** `SceneStateProjection` from `TurnContext`. `registerSceneExtras` (called by
   `buildTurnContext`) stores what the context does not carry — names of absent item owners / event participants and validated
   recent NPC+ developments — in a WeakMap beside the context, exactly like the narrator identity gate, so the Controller envelope is
   unchanged.
2. `src/turn/scene-state-focus.ts` — **focus**: ranks and caps entries using signals already computed (Narrator Focus
   foreground/background, player intent item/fact/event ids, input and recent text). It adds no authority.
3. `src/turn/scene-state-render.ts` — **render** to text with a size budget (`max_chars` 6000). Whole entries are dropped, lowest
   priority first; `required` entries never are.

## Source-of-truth map

| Section | Source |
| --- | --- |
| Location / About / Features | Authored location (lore filtered for background actors) |
| Time (`HH:MM — period`) | Runtime world clock |
| Present | Scene presence; the identity gate masks unlearned names ("the unfamiliar person") and confidential encounters stay unnamed |
| Character state | Campaign conditions / presentation / status |
| Items | Campaign item domain: `carried` / `worn` / `held` / `stored here`; owner is a separate field |
| Player | Runtime mana; campaign gold (`N Gold`, or "not tracked") |
| Knowledge | Campaign knowledge edges over **campaign facts** (`knows`, `believes`, `suspects`, `heard_rumor`) |
| Social | Households, legal status, relationships (qualitative dimensions) |
| Scheduled | Campaign scheduled events near in time or involving present people |
| Recent recorded developments | Validated NPC+ developments within 1440 minutes, re-checked against current state |

## Rules the block never breaks

- Ownership and possession are two facts. "Brenna carries Sword; owner: Nicco." is never joined into "borrowed", "stolen", "lent" or
  "gifted"; owner ≠ carrier does not imply a loan or a theft.
- A missing knowledge edge is "no recorded knowledge entry", never "does not know". Only differentiated scopes are listed.
- Absence from the block alone does not establish that something is false, absent or unknown: it may be established by other supplied authoritative context, omitted for relevance or omitted for budget (V1.1 wording of the guidance line; the older "unestablished, not false" claim was too strong).
- Stored items are "stored here"; no furniture, shelf or table is implied.
- No technical id (`campaign_item_…`, character/fact/event/household ids), no asset filename, no revision, no `visual_description`.
- World lore is not scene truth; restricted / holder-only / author-only canon never enters (canonical facts are not expanded).
- Retrieval, Background Grounding and the transcript stay in their own prompt sections and are not merged into scene truth.

## Focus relation

The block is selected by Narrator Focus, not by itself: people in focus get their state and carried items first; background people keep
a short list (state is always kept — the former background state-loss bug); worn/held items, referenced items and items in the player's intent are required, while ordinary carried inventory is high-priority but droppable (cap 8 per foreground holder, 4 per background holder, the rest reported as "not listed"); stored items are capped at 6 and a referenced item always
survives; item descriptions appear only for items the turn is about; knowledge shows only differentiated scopes of referenced facts
or facts held by focused people; legal status is required.

### Household relevance (V1.1)

Households are not dumped every turn. A household is shown (and then required) only when: a member other than the player is present; a present owned/held person is not a member (the narrator must not call them one); the household or one of its members is named in the input; or the input is a membership / household / rule question. Rules are shown only when a rule is relevant (household-topic question, or token overlap with the input or with a referenced item). Away members and rules never appear on unrelated turns merely because Nicco belongs to the household. The household domain itself is unchanged.

### Item labels (V1.1)

The narrator-facing item label comes from existing authoritative data, in the order the app session view already uses: `item.name`, then the canonical entity's `display_name`, then its `name`. A candidate that is empty, equal to an id, or a snake_case handle (`pink_cotton`) is skipped; nothing is prettified or invented. If no display-safe label exists (e.g. the canonical entity's `display_name` is also the handle) the source name is kept and this is a documented data gap to fix in authoring. Stable ids stay internal for the Controller.

### Scene extras side channel

`registerSceneExtras` attaches derived metadata (absent people's names, validated developments, narrator fact truth, item labels) to the `TurnContext` object in a WeakMap. It is runtime-attached, scoped to that object's identity, never serialized, and **cloning or re-creating a `TurnContext` does not reproduce the attachment** (the projection then falls back to the context's own data). It exists to keep the Controller context byte-identical. A future separate NarratorContext may replace this pattern; V1.x deliberately does not refactor it.

## Prompt integration

`buildNarratorPrompt` places `[CURRENT SCENE]` first in the `state` section, followed by the temporal-grounding rule, player profile
and the existing character JSON. The old `socialBlock`, `temporalGrounding` and `narratorItemView` blocks are removed from the prompt.
`[CHARACTER KNOWLEDGE ACCESS]` and its compaction are untouched.

## Deliberately omitted (documented gaps)

- A. Weather / environmental toggles (light, temperature, doors) — not engine truth, not invented.
- B. Item mutable state (damaged, loaded, lit) — the item domain has none.
- C. A general event ledger — only validated NPC+ developments and scheduled events appear.
- D. Goals / intentions of NPCs.
- E. Dead/absent character presentation differences between authored and created characters are left as-is.
- F. Reflection (D-09) remains deferred.

## Tools and tests

- `tests/scene-state-projection.test.ts` — 32 tests (25 in V1 plus item labels, four household-relevance cases, carried-item requiredness and guidance wording in V1.1) (basic scene, state incl. background NPC, ownership vs possession, equipment,
  stored items, resources, knowledge scopes, secrecy, id leakage, focus, large scene, renderer budget, derived-only, save round trip,
  identity masking, scheduled events, developments, prompt regression, Controller unaffected, golden ideal scene
  `tests/golden/scene-state-ideal.txt`).
- Fixtures: `src/dev/scene-state-fixtures.ts` (synthetic, public).
- `npm run inspect:scene` prints the offline scenarios A–F; `src/dev/scene-state-live-smoke.ts` is the optional live narrator smoke.
