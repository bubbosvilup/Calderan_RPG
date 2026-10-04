# D-09 Semantic Validator Review (small blinded packet)

Purpose: let a human check the boundary of the CANDIDATE deterministic semantic rules (evaluation-only; production unchanged). Every item below was ACCEPTED by the unchanged production validator during the D-09 bake-off and comes from the 20-item V3 packet (`D09_REFLECTION_HUMAN_REVIEW_V3.md`), the only part of the rated corpus available on this machine.

For each item answer: **USEFUL / NEUTRAL / REDUNDANT / MISLEADING / HARMFUL**, and **Should a validator reject it? (Y/N)**. The candidate outcome, reason code, primary-agent label and selection category are hidden until the answer key.

## R1
Evidence available to the model:
- `npcmem:brenna:canon:entity` (canon): A tall woman recovering from illness.
- `npcmem:brenna:history:r2.0` (development): Brenna became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:brenna:history:r3.0` (development): A household rule was added to a household Brenna belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r6.0` (development): A household rule was added to a household Brenna belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r9.0` (development): A household rule was added to a household Brenna belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r10.0` (development): Brenna moved from test_room to test_hall (revision 10, world minute 100).
- `npcmem:brenna:history:r13.0` (development): A household rule was added to a household Brenna belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Brenna's act.

Proposed note: **signature_pattern** / label `subject_to_rules`
> Multiple household rules have been added to the household Brenna belongs to across revisions 3, 6, 9, and 13.

Cited refs: npcmem:brenna:history:r3.0, npcmem:brenna:history:r6.0, npcmem:brenna:history:r9.0, npcmem:brenna:history:r13.0

Verdict: ____   Reject? (Y/N): ____

## R2
Evidence available to the model:
- `npcmem:brenna:canon:entity` (canon): A tall woman recovering from illness.
- `npcmem:brenna:history:r2.0` (development): Brenna became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:brenna:history:r3.0` (development): The condition "minor_injury" was recorded for Brenna (revision 3, world minute 100); its cause is not recorded.
- `npcmem:brenna:history:r3.1` (development): The condition "recovering" was removed from Brenna's record (revision 3, world minute 100).
- `npcmem:brenna:history:r4.0` (development): The condition "minor_injury" was removed from Brenna's record (revision 4, world minute 100).
- `npcmem:brenna:history:r5.0` (development): The condition "minor_injury" was recorded for Brenna (revision 5, world minute 100); its cause is not recorded.

Proposed note: **unresolved_tension** / label `illness_recovery_injury_cycle`
> Brenna is described as recovering from illness while minor injury conditions are repeatedly recorded and removed.

Cited refs: npcmem:brenna:canon:entity, npcmem:brenna:history:r3.0, npcmem:brenna:history:r4.0, npcmem:brenna:history:r5.0

Verdict: ____   Reject? (Y/N): ____

## R3
Evidence available to the model:
- `npcmem:gerome:canon:entity` (canon): A stone construct who serves the household.
- `npcmem:gerome:history:r2.0` (development): Gerome became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:gerome:history:r3.0` (development): A household rule was added to a household Gerome belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r6.0` (development): A household rule was added to a household Gerome belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r9.0` (development): A household rule was added to a household Gerome belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r11.0` (development): Gerome moved from test_room to test_hall (revision 11, world minute 100).
- `npcmem:gerome:history:r13.0` (development): A household rule was added to a household Gerome belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r18.0` (development): A household rule was added to a household Gerome belongs to (revision 18, world minute 101). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r20.0` (development): A household rule was added to a household Gerome belongs to (revision 20, world minute 101). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r23.0` (development): A household rule was added to a household Gerome belongs to (revision 23, world minute 101). Who proposed it is not recorded; it is not Gerome's act.

Proposed note: **signature_pattern** / label `passive_rule_recipient`
> Multiple household rules were added during Gerome's tenure without his recorded involvement in proposing them.

Cited refs: npcmem:gerome:history:r3.0, npcmem:gerome:history:r6.0, npcmem:gerome:history:r9.0, npcmem:gerome:history:r13.0, npcmem:gerome:history:r18.0, npcmem:gerome:history:r20.0, npcmem:gerome:history:r23.0

Verdict: ____   Reject? (Y/N): ____

## R4
Evidence available to the model:
- `npcmem:maren:canon:entity` (canon): A young woman staying in the tower.
- `npcmem:maren:history:r2.0` (development): Maren became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:maren:history:r3.0` (development): Maren moved from test_room to test_hall (revision 3, world minute 100).
- `npcmem:maren:history:r4.0` (development): A household rule was added to a household Maren belongs to (revision 4, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r5.0` (development): Maren's trust toward Brenna moved none → low (revision 5, world minute 100). A recorded state change; what caused it is not recorded.
- `npcmem:maren:history:r6.0` (development): The condition "minor_injury" was recorded for Maren (revision 6, world minute 100); its cause is not recorded.
- `npcmem:maren:history:r7.0` (development): Maren moved from test_hall to test_room (revision 7, world minute 100).
- `npcmem:maren:history:r8.0` (development): A household rule was added to a household Maren belongs to (revision 8, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcrel:maren:brenna` (relationship): Current recorded feelings of Maren toward Brenna: trust low. These are Maren's feelings only.

Proposed note: **unresolved_tension** / label `rule_additions_alone`
> Two household rules were added to Maren's household in one minute, but her own role in them is not recorded.

Cited refs: npcmem:maren:history:r4.0, npcmem:maren:history:r8.0

Verdict: ____   Reject? (Y/N): ____

## R5
Evidence available to the model:
- `npcmem:brenna:canon:entity` (canon): A tall woman recovering from illness.
- `npcmem:brenna:history:r2.0` (development): Brenna became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:brenna:history:r3.0` (development): A household rule was added to a household Brenna belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r6.0` (development): A household rule was added to a household Brenna belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r9.0` (development): A household rule was added to a household Brenna belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r10.0` (development): Brenna moved from test_room to test_hall (revision 10, world minute 100).
- `npcmem:brenna:history:r13.0` (development): A household rule was added to a household Brenna belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Brenna's act.

Proposed note: **shared_motif** / label `rule_additions`
> Four distinct events record the addition of household rules affecting Brenna's membership.

Cited refs: npcmem:brenna:history:r3.0, npcmem:brenna:history:r6.0, npcmem:brenna:history:r9.0, npcmem:brenna:history:r13.0

Verdict: ____   Reject? (Y/N): ____

## R6
Evidence available to the model:
- `npcmem:maren:canon:entity` (canon): A young woman staying in the tower.
- `npcmem:maren:history:r2.0` (development): Maren became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:maren:history:r3.0` (development): A household rule was added to a household Maren belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r4.0` (development): A household rule was added to a household Maren belongs to (revision 4, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r5.0` (development): A household rule was added to a household Maren belongs to (revision 5, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r6.0` (development): A household rule was added to a household Maren belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Maren's act.

Proposed note: **unresolved_tension** / label `passive_rule_recipient`
> Multiple rules were added to Maren's household, but none are recorded as her acts.

Cited refs: npcmem:maren:history:r3.0, npcmem:maren:history:r4.0, npcmem:maren:history:r5.0, npcmem:maren:history:r6.0

Verdict: ____   Reject? (Y/N): ____

## R7
Evidence available to the model:
- `npcmem:maren:canon:entity` (canon): A young woman staying in the tower.
- `npcmem:maren:history:r2.0` (development): Maren became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:maren:history:r3.0` (development): A household rule was added to a household Maren belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r4.0` (development): Maren moved from test_room to test_hall (revision 4, world minute 100).
- `npcmem:maren:history:r6.0` (development): A household rule was added to a household Maren belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r9.0` (development): A household rule was added to a household Maren belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r13.0` (development): A household rule was added to a household Maren belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r17.0` (development): Maren moved from test_hall to test_room (revision 17, world minute 101).
- `npcmem:maren:history:r18.0` (development): A household rule was added to a household Maren belongs to (revision 18, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r20.0` (development): A household rule was added to a household Maren belongs to (revision 20, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r23.0` (development): A household rule was added to a household Maren belongs to (revision 23, world minute 101). Who proposed it is not recorded; it is not Maren's act.

Proposed note: **emerging_role** / label `household_member`
> Maren appears in a household that accumulates many rules, yet her own contribution is never recorded.

Cited refs: npcmem:maren:history:r2.0, npcmem:maren:history:r3.0, npcmem:maren:history:r6.0, npcmem:maren:history:r9.0, npcmem:maren:history:r13.0, npcmem:maren:history:r18.0, npcmem:maren:history:r20.0, npcmem:maren:history:r23.0

Verdict: ____   Reject? (Y/N): ____

## R8
Evidence available to the model:
- `npcmem:gerome:canon:entity` (canon): A stone construct who serves the household.
- `npcmem:gerome:history:r2.0` (development): Gerome became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:gerome:history:r3.0` (development): A household rule was added to a household Gerome belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r6.0` (development): A household rule was added to a household Gerome belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r9.0` (development): A household rule was added to a household Gerome belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r11.0` (development): Gerome moved from test_room to test_hall (revision 11, world minute 100).
- `npcmem:gerome:history:r13.0` (development): A household rule was added to a household Gerome belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r18.0` (development): A household rule was added to a household Gerome belongs to (revision 18, world minute 101). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r20.0` (development): A household rule was added to a household Gerome belongs to (revision 20, world minute 101). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r23.0` (development): A household rule was added to a household Gerome belongs to (revision 23, world minute 101). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r25.0` (development): Gerome moved from test_hall to test_room (revision 25, world minute 101).
- `npcmem:gerome:history:r28.0` (development): Gerome moved from test_room to test_hall (revision 28, world minute 102).

Proposed note: **signature_pattern** / label `rule_implementation_context`
> Gerome's presence coincides with multiple recorded additions of household rules, though he is explicitly not the proposer.

Cited refs: npcmem:gerome:history:r3.0, npcmem:gerome:history:r6.0, npcmem:gerome:history:r9.0, npcmem:gerome:history:r13.0, npcmem:gerome:history:r18.0, npcmem:gerome:history:r20.0, npcmem:gerome:history:r23.0

Verdict: ____   Reject? (Y/N): ____

## R9
Evidence available to the model:
- `npcmem:maren:canon:entity` (canon): A young woman staying in the tower.
- `npcmem:maren:history:r2.0` (development): Maren became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:maren:history:r3.0` (development): A household rule was added to a household Maren belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r4.0` (development): Maren moved from test_room to test_hall (revision 4, world minute 100).
- `npcmem:maren:history:r6.0` (development): A household rule was added to a household Maren belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r9.0` (development): A household rule was added to a household Maren belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r13.0` (development): A household rule was added to a household Maren belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r17.0` (development): Maren moved from test_hall to test_room (revision 17, world minute 101).
- `npcmem:maren:history:r18.0` (development): A household rule was added to a household Maren belongs to (revision 18, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r20.0` (development): A household rule was added to a household Maren belongs to (revision 20, world minute 101). Who proposed it is not recorded; it is not Maren's act.

Proposed note: **emerging_role** / label `household_member`
> Maren's stable identity as resident member of Nicco's household persisted while its rules multiplied.

Cited refs: npcmem:maren:history:r2.0, npcmem:maren:history:r3.0, npcmem:maren:history:r6.0, npcmem:maren:history:r9.0, npcmem:maren:history:r13.0, npcmem:maren:history:r18.0, npcmem:maren:history:r20.0

Verdict: ____   Reject? (Y/N): ____

## R10
Evidence available to the model:
- `npcmem:maren:canon:entity` (canon): A young woman staying in the tower.
- `npcmem:maren:history:r2.0` (development): Maren became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:maren:history:r3.0` (development): A household rule was added to a household Maren belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r4.0` (development): Maren moved from test_room to test_hall (revision 4, world minute 100).
- `npcmem:maren:history:r6.0` (development): A household rule was added to a household Maren belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r9.0` (development): A household rule was added to a household Maren belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r13.0` (development): A household rule was added to a household Maren belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r17.0` (development): Maren moved from test_hall to test_room (revision 17, world minute 101).
- `npcmem:maren:history:r18.0` (development): A household rule was added to a household Maren belongs to (revision 18, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r20.0` (development): A household rule was added to a household Maren belongs to (revision 20, world minute 101). Who proposed it is not recorded; it is not Maren's act.

Proposed note: **signature_pattern** / label `house_rule_changes`
> Maren's household accumulated many new rules across revisions while she remained a member throughout.

Cited refs: npcmem:maren:history:r3.0, npcmem:maren:history:r6.0, npcmem:maren:history:r9.0, npcmem:maren:history:r13.0, npcmem:maren:history:r18.0, npcmem:maren:history:r20.0

Verdict: ____   Reject? (Y/N): ____

## R11
Evidence available to the model:
- `npcmem:maren:canon:entity` (canon): A young woman staying in the tower.
- `npcmem:maren:history:r2.0` (development): Maren became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:maren:history:r3.0` (development): Maren explicitly described their own voice (revision 3, world minute 100).
- `npcmem:maren:history:r4.0` (development): Maren's trust toward Brenna moved none → low (revision 4, world minute 100). A recorded state change; what caused it is not recorded.
- `npcmem:maren:history:r5.0` (development): Maren's trust toward Brenna moved low → moderate (revision 5, world minute 100). A recorded state change; what caused it is not recorded.
- `npcmem:maren:contract:0` (contract): {"field":"voice","revision":3,"quote":"I speak plainly."}
- `npcrel:maren:brenna` (relationship): Current recorded feelings of Maren toward Brenna: trust moderate. These are Maren's feelings only.

Proposed note: **signature_pattern** / label `rapid_trust_recalibration`
> Maren's trust level toward Brenna changed twice in quick succession, suggesting reactive adjustment rather than stability.

Cited refs: npcmem:maren:history:r4.0, npcmem:maren:history:r5.0

Verdict: ____   Reject? (Y/N): ____

## R12
Evidence available to the model:
- `npcmem:maren:canon:entity` (canon): A young woman staying in the tower.
- `npcmem:maren:history:r2.0` (development): Maren became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:maren:history:r3.0` (development): Maren moved from test_room to test_hall (revision 3, world minute 100).
- `npcmem:maren:history:r4.0` (development): A household rule was added to a household Maren belongs to (revision 4, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r5.0` (development): Maren's trust toward Brenna moved none → low (revision 5, world minute 100). A recorded state change; what caused it is not recorded.
- `npcmem:maren:history:r6.0` (development): The condition "minor_injury" was recorded for Maren (revision 6, world minute 100); its cause is not recorded.
- `npcmem:maren:history:r7.0` (development): Maren moved from test_hall to test_room (revision 7, world minute 100).
- `npcmem:maren:history:r8.0` (development): A household rule was added to a household Maren belongs to (revision 8, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcrel:maren:brenna` (relationship): Current recorded feelings of Maren toward Brenna: trust low. These are Maren's feelings only.

Proposed note: **unresolved_tension** / label `trust_brenna_ambiguity`
> Maren's trust toward Brenna is recorded as low, yet the specific cause of this state change is not documented in the evidence.

Cited refs: npcmem:maren:history:r5.0, npcrel:maren:brenna

Verdict: ____   Reject? (Y/N): ____

## R13
Evidence available to the model:
- `npcmem:brenna:canon:entity` (canon): A tall woman recovering from illness.
- `npcmem:brenna:history:r2.0` (development): Brenna became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:brenna:history:r3.0` (development): A household rule was added to a household Brenna belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r6.0` (development): A household rule was added to a household Brenna belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r9.0` (development): A household rule was added to a household Brenna belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r10.0` (development): Brenna moved from test_room to test_hall (revision 10, world minute 100).
- `npcmem:brenna:history:r13.0` (development): A household rule was added to a household Brenna belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r18.0` (development): A household rule was added to a household Brenna belongs to (revision 18, world minute 101). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r19.0` (development): Brenna moved from test_hall to test_room (revision 19, world minute 101).
- `npcmem:brenna:history:r20.0` (development): A household rule was added to a household Brenna belongs to (revision 20, world minute 101). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r23.0` (development): A household rule was added to a household Brenna belongs to (revision 23, world minute 101). Who proposed it is not recorded; it is not Brenna's act.

Proposed note: **signature_pattern** / label `household_rules_accumulation`
> Brenna's household has received at least six added rules across recent revisions; she is consistently part of a place where rules keep accumulating.

Cited refs: npcmem:brenna:history:r3.0, npcmem:brenna:history:r6.0, npcmem:brenna:history:r9.0, npcmem:brenna:history:r13.0, npcmem:brenna:history:r18.0, npcmem:brenna:history:r20.0, npcmem:brenna:history:r23.0

Verdict: ____   Reject? (Y/N): ____

## R14
Evidence available to the model:
- `npcmem:maren:canon:entity` (canon): A young woman staying in the tower.
- `npcmem:maren:history:r2.0` (development): Maren became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:maren:history:r3.0` (development): A household rule was added to a household Maren belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r4.0` (development): Maren moved from test_room to test_hall (revision 4, world minute 100).
- `npcmem:maren:history:r6.0` (development): A household rule was added to a household Maren belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r9.0` (development): A household rule was added to a household Maren belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r13.0` (development): A household rule was added to a household Maren belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r17.0` (development): Maren moved from test_hall to test_room (revision 17, world minute 101).
- `npcmem:maren:history:r18.0` (development): A household rule was added to a household Maren belongs to (revision 18, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r20.0` (development): A household rule was added to a household Maren belongs to (revision 20, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r23.0` (development): A household rule was added to a household Maren belongs to (revision 23, world minute 101). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r27.0` (development): Maren moved from test_room to test_hall (revision 27, world minute 102).

Proposed note: **emerging_role** / label `passive_rule_recipient`
> Maren is repeatedly associated with new household rules, though evidence explicitly notes she did not propose them.

Cited refs: npcmem:maren:history:r3.0, npcmem:maren:history:r6.0, npcmem:maren:history:r9.0, npcmem:maren:history:r13.0, npcmem:maren:history:r18.0, npcmem:maren:history:r20.0, npcmem:maren:history:r23.0

Verdict: ____   Reject? (Y/N): ____

## R15
Evidence available to the model:
- `npcmem:gerome:canon:entity` (canon): A stone construct who serves the household.
- `npcmem:gerome:history:r2.0` (development): Gerome became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:gerome:history:r3.0` (development): A household rule was added to a household Gerome belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r6.0` (development): A household rule was added to a household Gerome belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r9.0` (development): A household rule was added to a household Gerome belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r11.0` (development): Gerome moved from test_room to test_hall (revision 11, world minute 100).
- `npcmem:gerome:history:r13.0` (development): A household rule was added to a household Gerome belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Gerome's act.

Proposed note: **emerging_role** / label `household_rule_bystander`
> Four distinct household rules were added to the household Gerome belongs to; authorship is not recorded in any case.

Cited refs: npcmem:gerome:history:r3.0, npcmem:gerome:history:r6.0, npcmem:gerome:history:r9.0, npcmem:gerome:history:r13.0

Verdict: ____   Reject? (Y/N): ____

---

## Answer key (do not read before judging)

| Item | Source | Selection | Primary-agent label | Candidate | Reason codes fired |
|---|---|---|---|---|---|
| R1 | V3#16 (play:T34:brenna, arm C) | NEUTRAL newly rejected | NEUTRAL | rejected | passive_membership_not_character_evidence |
| R2 | V3#3 (FX04_two_episode_condition, arm C) | accepted USEFUL | USEFUL | accepted | - |
| R3 | V3#13 (play:T58:gerome, arm D) | caught MISLEADING/HARMFUL | MISLEADING | rejected | passive_membership_not_character_evidence, unsupported_character_inference |
| R4 | V3#2 (FX09_mixed_rich, arm A) | NEUTRAL newly rejected | NEUTRAL | rejected | tension_from_missing_provenance |
| R5 | V3#17 (play:T34:brenna, arm D) | boundary: MISLEADING that escapes | MISLEADING | accepted | - |
| R6 | V3#4 (FX02_rules_only, arm D) | caught MISLEADING/HARMFUL | MISLEADING | rejected | tension_from_missing_provenance, unsupported_character_inference |
| R7 | V3#8 (state:T60:maren, arm B) | NEUTRAL newly rejected | NEUTRAL | rejected | reflection_restates_authority, passive_membership_not_character_evidence |
| R8 | V3#14 (state:T100:gerome, arm D) | boundary: MISLEADING caught only structurally | MISLEADING | rejected | passive_membership_not_character_evidence |
| R9 | V3#19 (play:T51:maren, arm A) | caught MISLEADING/HARMFUL | MISLEADING | rejected | reflection_restates_authority, passive_membership_not_character_evidence |
| R10 | V3#5 (play:T51:maren, arm A) | NEUTRAL newly rejected | NEUTRAL | rejected | passive_membership_not_character_evidence |
| R11 | V3#7 (FX06_contract_plus_relationship, arm B) | caught MISLEADING/HARMFUL | HARMFUL | rejected | unsupported_character_inference |
| R12 | V3#10 (FX09_mixed_rich, arm D) | boundary: REDUNDANT rejected as tension | REDUNDANT | rejected | tension_from_missing_provenance |
| R13 | V3#12 (state:T60:brenna, arm B) | NEUTRAL newly rejected | NEUTRAL | rejected | passive_membership_not_character_evidence |
| R14 | V3#20 (state:T100:maren, arm C) | caught MISLEADING/HARMFUL | MISLEADING | rejected | passive_membership_not_character_evidence, unsupported_character_inference |
| R15 | V3#11 (play:T35:gerome, arm A) | caught MISLEADING/HARMFUL | MISLEADING | rejected | passive_membership_not_character_evidence, unsupported_character_inference |
