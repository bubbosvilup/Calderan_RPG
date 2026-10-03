# Calderan live NPC regression — Repair 1.1

2026-09-30. Scoped follow-up to [Repair 1](CALDERAN_LIVE_NPC_REGRESSION_REPAIR_1.md), section L. It fixes three defects only: item handover evidence, the return premise, and player agency. No canon, portrayal or physical-interaction change was made; `data/` is unmodified.

## Changes

**1. Item handover evidence** ([turn-evidence.ts](../../../src/turn/turn-evidence.ts), [evidence-authorization.ts](../../../src/turn/evidence-authorization.ts), new [item-reference.ts](../../../src/turn/item-reference.ts))
- Item-subject handovers now include `transfer(s)`/`transferred`, with optional passive forms (`are transferred to Nicco's hands`).
- Inbound withholding is negation-aware: "does not move to withdraw the offer" is no longer a veto, while "withdraws the offer" still is. The giver taking the item back is now withholding.
- A later sentence can retract an established inbound handover only if it names the item or has a transfer verb whose object is the item, Nicco, or them/it.
- Item category words are derived only from the item's own name and description, and count only when unique among items in the scene. "The footwear" refers to the only pair of boots; with two pieces of footwear it refers to neither.
- `-ing` give forms are recognized ("simply pressing the footwear into his hands").
- All previous negative evidence cases still fail.

**2. Return premise** ([natural-actions.ts](../../../src/turn/natural-actions.ts), [narration-audit.ts](../../../src/turn/narration-audit.ts))
- When a give-back cannot resolve because Nicco holds no matching item, and one present person does hold it, the narrator gets a note naming the real holder. The note forbids narrating Nicco holding, offering or returning the item, the item staying in his hands, or the holder taking it back.
- A new `false_premise` audit flags those claims for any item Nicco held neither before nor after the turn. Negated sentences are exempt, and the flag triggers the existing revision and redaction path.

**3. Player agency** ([narration-audit.ts](../../../src/turn/narration-audit.ts))
- A new `player_agency` audit flags quoted Nicco lines the player did not supply. A rendering of an explicitly authored question or speech act with the same content is allowed.
- It also flags Nicco-led sentences in which he accepts, refuses, keeps, thanks, leaves, stays or decides something the input did not author.
- Authored gifts and returns, and deterministic consequences of authored actions, remain allowed.

## Tests and gates

[live-regression-repair-1-1.test.ts](../../../tests/live-regression-repair-1-1.test.ts): 8 new tests using the exact failing Repair 1 sentences (Mereth, Mira, Elara, Livia), with positive and negative pairs for each defect.

| Gate | Result |
|---|---|
| `npm test` | 838/838 (830 + 8) |
| `npm run test:playthrough` | 25/25 |
| `npm run typecheck` | pass |

## Small live verification

One attempt per NPC, using the unchanged boots scenario through the production coordinator (`2026-09-30T03:12:31Z`, source unchanged during the run). Artifacts are in [live-npc-regression-repair-1-1-2026-09-30T03-12-31-308Z](live-npc-regression-repair-1-1-2026-09-30T03-12-31-308Z/manifest.json); the harness is [live-npc-regression-repair-1-1.mjs](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/scripts/live-npc-regression-repair-1-1.mjs).

| NPC | Gift committed | Return premise correct | Agency slip | Narration/state | Result |
|---|---|---|---|---|---|
| Mistress Elara | No: controller `structured_output_invalid`; the turn failed, nothing was shown or committed | Yes | Minor (invented "his turning") | Agree | FAIL (prerequisite) |
| Sister Mereth | No: false retraction, a regression introduced by 1.1 (see below) | Partial: narration correct, her dialogue presumes the gift | No | Narration agrees; her dialogue contradicts it | FAIL |
| Mira Thorne | No: controller `structured_output_invalid` | Yes | No | Agree | FAIL (prerequisite) |
| Livia Marr | No: controller `structured_output_invalid` | Yes | Yes (not caught) | Agree | FAIL |

**What held.** In all four return turns the new premise note fired. No narration put the boots in Nicco's hands or had the NPC take them back. The state stayed with each NPC, and nothing was duplicated.

**Failed cases.** Relevant delivered text follows; full transcripts are in the artifacts.

- **Elara, Mira, Livia gifts.** The controller returned output that failed strict parsing (upstream `Phala`, 56–69 completion tokens, `finish_reason: stop`). This is not a timeout, and 1.1 changed neither the controller schema nor its input. The harness does not capture raw controller bodies, so the cause is unattributed. The failure mode was safe, but the fixed handover evidence could not be exercised live for these three.
- **Mereth gift.** The draft completed the handover ("passing them over to Nicco. He takes them"). It was vetoed by `"…," she says, her grey eyes appraising him with the same frank assessment she might give any of her charges.` 1.1's new pronoun rule made "she" the giver, and a loose action-word test read "might give" as a retraction. The revision then delivered Mereth withholding: *"She does not release them … She tucks the boots back into her bag."* State and narration agree, but an evidence false positive changed the NPC's decision.
  - **Fixed after the live run, deterministically only:** the transfer verb must now take the item, Nicco or them/it as its object. The exact sentence is a regression test. It was not revalidated live, per this task.
- **Mereth return.** The narration is correct ("The leather boots remain in her hands, unaccepted"), but her line *"I don't give gifts twice … Keep them, sell them … They aren't coming back to me"* presumes the gift. The premise audit checks narration outside dialogue only.
- **Livia return.** *"Nicco spoke to empty air, gesturing vaguely toward where he thought someone stood."* The narrator invents a gesture and attributes a belief to Nicco. The bounded agency audit covers dialogue and accept/refuse/keep/thank/leave/stay/decide, not gestures or thoughts, so it missed this.

## Remaining

- Handover-evidence fixes are unconfirmed live: three of four gift turns never reached authorization.
- Unexplained controller `structured_output_invalid` failures. Capturing raw controller output on parse failure would be needed to diagnose them.
- NPC dialogue that presumes a failed gift is not premise-checked.
- Agency slips through invented gestures or attributed thoughts are outside the bounded audit.
- The Mereth retraction fix is deterministic only.

REPAIR 1.1 ISSUES REMAIN
