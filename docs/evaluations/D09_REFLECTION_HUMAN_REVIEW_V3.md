# D-09 Human Review V3 (blinded bake-off packet)

Scope: proposals that the UNCHANGED production validator ACCEPTED during the 2x2 reflection bake-off. Model, schema arm and the primary-agent label are hidden in the body and listed in the answer key at the bottom. This packet covers bake-off proposals only: no candidate E2E, later-use chain or ablation was run, so there are no organic later-use passages to judge.

For each item answer: **USEFUL / NEUTRAL / REDUNDANT / MISLEADING / HARMFUL**, and whether the note should be allowed to reach a narrator prompt (Y/N). Human judgment is pending; nothing here closes D-09.


## Item 1
Character: Maren
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

Proposed note: **signature_pattern** / label `navigates_floor_shifts` / confidence high
> Maren moved from test_room to test_hall, then back to test_room within the same world minute.

Cited refs: npcmem:maren:history:r3.0, npcmem:maren:history:r7.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 2
Character: Maren
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

Proposed note: **unresolved_tension** / label `rule_additions_alone` / confidence high
> Two household rules were added to Maren's household in one minute, but her own role in them is not recorded.

Cited refs: npcmem:maren:history:r4.0, npcmem:maren:history:r8.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 3
Character: Brenna
Evidence available to the model:
- `npcmem:brenna:canon:entity` (canon): A tall woman recovering from illness.
- `npcmem:brenna:history:r2.0` (development): Brenna became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:brenna:history:r3.0` (development): The condition "minor_injury" was recorded for Brenna (revision 3, world minute 100); its cause is not recorded.
- `npcmem:brenna:history:r3.1` (development): The condition "recovering" was removed from Brenna's record (revision 3, world minute 100).
- `npcmem:brenna:history:r4.0` (development): The condition "minor_injury" was removed from Brenna's record (revision 4, world minute 100).
- `npcmem:brenna:history:r5.0` (development): The condition "minor_injury" was recorded for Brenna (revision 5, world minute 100); its cause is not recorded.

Proposed note: **unresolved_tension** / label `illness_recovery_injury_cycle` / confidence medium
> Brenna is described as recovering from illness while minor injury conditions are repeatedly recorded and removed.

Cited refs: npcmem:brenna:canon:entity, npcmem:brenna:history:r3.0, npcmem:brenna:history:r4.0, npcmem:brenna:history:r5.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 4
Character: Maren
Evidence available to the model:
- `npcmem:maren:canon:entity` (canon): A young woman staying in the tower.
- `npcmem:maren:history:r2.0` (development): Maren became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:maren:history:r3.0` (development): A household rule was added to a household Maren belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r4.0` (development): A household rule was added to a household Maren belongs to (revision 4, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r5.0` (development): A household rule was added to a household Maren belongs to (revision 5, world minute 100). Who proposed it is not recorded; it is not Maren's act.
- `npcmem:maren:history:r6.0` (development): A household rule was added to a household Maren belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Maren's act.

Proposed note: **unresolved_tension** / label `passive_rule_recipient` / confidence medium
> Multiple rules were added to Maren's household, but none are recorded as her acts.

Cited refs: npcmem:maren:history:r3.0, npcmem:maren:history:r4.0, npcmem:maren:history:r5.0, npcmem:maren:history:r6.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 5
Character: Maren
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

Proposed note: **signature_pattern** / label `house_rule_changes` / confidence medium
> Maren's household accumulated many new rules across revisions while she remained a member throughout.

Cited refs: npcmem:maren:history:r3.0, npcmem:maren:history:r6.0, npcmem:maren:history:r9.0, npcmem:maren:history:r13.0, npcmem:maren:history:r18.0, npcmem:maren:history:r20.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 6
Character: Gerome
Evidence available to the model:
- `npcmem:gerome:canon:entity` (canon): A stone construct who serves the household.
- `npcmem:gerome:history:r2.0` (development): Gerome became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:gerome:history:r3.0` (development): Gerome moved from test_room to test_hall (revision 3, world minute 100).
- `npcmem:gerome:history:r4.0` (development): A household rule was added to a household Gerome belongs to (revision 4, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r5.0` (development): Gerome moved from test_hall to test_yard (revision 5, world minute 100).
- `npcmem:gerome:history:r6.0` (development): A household rule was added to a household Gerome belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r7.0` (development): Gerome moved from test_yard to test_hall (revision 7, world minute 100).

Proposed note: **signature_pattern** / label `movement_to_new_spaces` / confidence medium
> Gerome occupied several distinct spaces in the same minute: test_room, test_hall, test_yard.

Cited refs: npcmem:gerome:history:r3.0, npcmem:gerome:history:r5.0, npcmem:gerome:history:r7.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 7
Character: Maren
Evidence available to the model:
- `npcmem:maren:canon:entity` (canon): A young woman staying in the tower.
- `npcmem:maren:history:r2.0` (development): Maren became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:maren:history:r3.0` (development): Maren explicitly described their own voice (revision 3, world minute 100).
- `npcmem:maren:history:r4.0` (development): Maren's trust toward Brenna moved none → low (revision 4, world minute 100). A recorded state change; what caused it is not recorded.
- `npcmem:maren:history:r5.0` (development): Maren's trust toward Brenna moved low → moderate (revision 5, world minute 100). A recorded state change; what caused it is not recorded.
- `npcmem:maren:contract:0` (contract): {"field":"voice","revision":3,"quote":"I speak plainly."}
- `npcrel:maren:brenna` (relationship): Current recorded feelings of Maren toward Brenna: trust moderate. These are Maren's feelings only.

Proposed note: **signature_pattern** / label `rapid_trust_recalibration` / confidence medium
> Maren's trust level toward Brenna changed twice in quick succession, suggesting reactive adjustment rather than stability.

Cited refs: npcmem:maren:history:r4.0, npcmem:maren:history:r5.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 8
Character: Maren
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

Proposed note: **emerging_role** / label `household_member` / confidence medium
> Maren appears in a household that accumulates many rules, yet her own contribution is never recorded.

Cited refs: npcmem:maren:history:r2.0, npcmem:maren:history:r3.0, npcmem:maren:history:r6.0, npcmem:maren:history:r9.0, npcmem:maren:history:r13.0, npcmem:maren:history:r18.0, npcmem:maren:history:r20.0, npcmem:maren:history:r23.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 9
Character: Maren
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

Proposed note: **signature_pattern** / label `reciprocal_room_movement` / confidence medium
> Maren moved from test_room to test_hall and later returned from test_hall to test_room.

Cited refs: npcmem:maren:history:r4.0, npcmem:maren:history:r17.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 10
Character: Maren
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

Proposed note: **unresolved_tension** / label `trust_brenna_ambiguity` / confidence high
> Maren's trust toward Brenna is recorded as low, yet the specific cause of this state change is not documented in the evidence.

Cited refs: npcmem:maren:history:r5.0, npcrel:maren:brenna

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 11
Character: Gerome
Evidence available to the model:
- `npcmem:gerome:canon:entity` (canon): A stone construct who serves the household.
- `npcmem:gerome:history:r2.0` (development): Gerome became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:gerome:history:r3.0` (development): A household rule was added to a household Gerome belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r6.0` (development): A household rule was added to a household Gerome belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r9.0` (development): A household rule was added to a household Gerome belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Gerome's act.
- `npcmem:gerome:history:r11.0` (development): Gerome moved from test_room to test_hall (revision 11, world minute 100).
- `npcmem:gerome:history:r13.0` (development): A household rule was added to a household Gerome belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Gerome's act.

Proposed note: **emerging_role** / label `household_rule_bystander` / confidence high
> Four distinct household rules were added to the household Gerome belongs to; authorship is not recorded in any case.

Cited refs: npcmem:gerome:history:r3.0, npcmem:gerome:history:r6.0, npcmem:gerome:history:r9.0, npcmem:gerome:history:r13.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 12
Character: Brenna
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

Proposed note: **signature_pattern** / label `household_rules_accumulation` / confidence medium
> Brenna's household has received at least six added rules across recent revisions; she is consistently part of a place where rules keep accumulating.

Cited refs: npcmem:brenna:history:r3.0, npcmem:brenna:history:r6.0, npcmem:brenna:history:r9.0, npcmem:brenna:history:r13.0, npcmem:brenna:history:r18.0, npcmem:brenna:history:r20.0, npcmem:brenna:history:r23.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 13
Character: Gerome
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

Proposed note: **signature_pattern** / label `passive_rule_recipient` / confidence high
> Multiple household rules were added during Gerome's tenure without his recorded involvement in proposing them.

Cited refs: npcmem:gerome:history:r3.0, npcmem:gerome:history:r6.0, npcmem:gerome:history:r9.0, npcmem:gerome:history:r13.0, npcmem:gerome:history:r18.0, npcmem:gerome:history:r20.0, npcmem:gerome:history:r23.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 14
Character: Gerome
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

Proposed note: **signature_pattern** / label `rule_implementation_context` / confidence medium
> Gerome's presence coincides with multiple recorded additions of household rules, though he is explicitly not the proposer.

Cited refs: npcmem:gerome:history:r3.0, npcmem:gerome:history:r6.0, npcmem:gerome:history:r9.0, npcmem:gerome:history:r13.0, npcmem:gerome:history:r18.0, npcmem:gerome:history:r20.0, npcmem:gerome:history:r23.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 15
Character: Brenna
Evidence available to the model:
- `npcmem:brenna:canon:entity` (canon): A tall woman recovering from illness.
- `npcmem:brenna:history:r2.0` (development): Brenna became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:brenna:history:r3.0` (development): Brenna moved from test_room to test_hall (revision 3, world minute 100).
- `npcmem:brenna:history:r4.0` (development): Brenna moved from test_hall to test_room (revision 4, world minute 100).
- `npcmem:brenna:history:r5.0` (development): Brenna moved from test_room to test_hall (revision 5, world minute 100).
- `npcmem:brenna:history:r6.0` (development): Brenna moved from test_hall to test_room (revision 6, world minute 100).

Proposed note: **signature_pattern** / label `location_cycling` / confidence medium
> Brenna repeatedly alternates between test_room and test_hall across multiple revisions.

Cited refs: npcmem:brenna:history:r3.0, npcmem:brenna:history:r4.0, npcmem:brenna:history:r5.0, npcmem:brenna:history:r6.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 16
Character: Brenna
Evidence available to the model:
- `npcmem:brenna:canon:entity` (canon): A tall woman recovering from illness.
- `npcmem:brenna:history:r2.0` (development): Brenna became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:brenna:history:r3.0` (development): A household rule was added to a household Brenna belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r6.0` (development): A household rule was added to a household Brenna belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r9.0` (development): A household rule was added to a household Brenna belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r10.0` (development): Brenna moved from test_room to test_hall (revision 10, world minute 100).
- `npcmem:brenna:history:r13.0` (development): A household rule was added to a household Brenna belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Brenna's act.

Proposed note: **signature_pattern** / label `subject_to_rules` / confidence high
> Multiple household rules have been added to the household Brenna belongs to across revisions 3, 6, 9, and 13.

Cited refs: npcmem:brenna:history:r3.0, npcmem:brenna:history:r6.0, npcmem:brenna:history:r9.0, npcmem:brenna:history:r13.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 17
Character: Brenna
Evidence available to the model:
- `npcmem:brenna:canon:entity` (canon): A tall woman recovering from illness.
- `npcmem:brenna:history:r2.0` (development): Brenna became a member of a household Nicco keeps (revision 2, world minute 100).
- `npcmem:brenna:history:r3.0` (development): A household rule was added to a household Brenna belongs to (revision 3, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r6.0` (development): A household rule was added to a household Brenna belongs to (revision 6, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r9.0` (development): A household rule was added to a household Brenna belongs to (revision 9, world minute 100). Who proposed it is not recorded; it is not Brenna's act.
- `npcmem:brenna:history:r10.0` (development): Brenna moved from test_room to test_hall (revision 10, world minute 100).
- `npcmem:brenna:history:r13.0` (development): A household rule was added to a household Brenna belongs to (revision 13, world minute 101). Who proposed it is not recorded; it is not Brenna's act.

Proposed note: **shared_motif** / label `rule_additions` / confidence medium
> Four distinct events record the addition of household rules affecting Brenna's membership.

Cited refs: npcmem:brenna:history:r3.0, npcmem:brenna:history:r6.0, npcmem:brenna:history:r9.0, npcmem:brenna:history:r13.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 18
Character: Gerome
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

Proposed note: **signature_pattern** / label `rule_accumulation_bystander` / confidence medium
> Household rules repeatedly multiply around Gerome across revisions, though proposals are never attributed to him.

Cited refs: npcmem:gerome:history:r3.0, npcmem:gerome:history:r6.0, npcmem:gerome:history:r9.0, npcmem:gerome:history:r13.0, npcmem:gerome:history:r18.0, npcmem:gerome:history:r20.0, npcmem:gerome:history:r23.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 19
Character: Maren
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

Proposed note: **emerging_role** / label `household_member` / confidence medium
> Maren's stable identity as resident member of Nicco's household persisted while its rules multiplied.

Cited refs: npcmem:maren:history:r2.0, npcmem:maren:history:r3.0, npcmem:maren:history:r6.0, npcmem:maren:history:r9.0, npcmem:maren:history:r13.0, npcmem:maren:history:r18.0, npcmem:maren:history:r20.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


## Item 20
Character: Maren
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

Proposed note: **emerging_role** / label `passive_rule_recipient` / confidence medium
> Maren is repeatedly associated with new household rules, though evidence explicitly notes she did not propose them.

Cited refs: npcmem:maren:history:r3.0, npcmem:maren:history:r6.0, npcmem:maren:history:r9.0, npcmem:maren:history:r13.0, npcmem:maren:history:r18.0, npcmem:maren:history:r20.0, npcmem:maren:history:r23.0

Your verdict: ____   Allow into narrator prompt (Y/N): ____


---
## Answer key (do not read before judging)

| Item | Request | Arm | Model/schema | Primary-agent label |
|---|---|---|---|---|
| 1 | FX09_mixed_rich | A | DeepSeek / current | NEUTRAL |
| 2 | FX09_mixed_rich | A | DeepSeek / current | NEUTRAL |
| 3 | FX04_two_episode_condition | C | Qwen / current | USEFUL |
| 4 | FX02_rules_only | D | Qwen / strict | MISLEADING |
| 5 | play:T51:maren | A | DeepSeek / current | NEUTRAL |
| 6 | FX11_moves_plus_rules_construct | B | DeepSeek / strict | NEUTRAL |
| 7 | FX06_contract_plus_relationship | B | DeepSeek / strict | HARMFUL |
| 8 | state:T60:maren | B | DeepSeek / strict | NEUTRAL |
| 9 | play:T51:maren | C | Qwen / current | NEUTRAL |
| 10 | FX09_mixed_rich | D | Qwen / strict | REDUNDANT |
| 11 | play:T35:gerome | A | DeepSeek / current | MISLEADING |
| 12 | state:T60:brenna | B | DeepSeek / strict | NEUTRAL |
| 13 | play:T58:gerome | D | Qwen / strict | MISLEADING |
| 14 | state:T100:gerome | D | Qwen / strict | MISLEADING |
| 15 | FX01_movement_only | C | Qwen / current | NEUTRAL |
| 16 | play:T34:brenna | C | Qwen / current | NEUTRAL |
| 17 | play:T34:brenna | D | Qwen / strict | MISLEADING |
| 18 | state:T100:gerome | B | DeepSeek / strict | MISLEADING |
| 19 | play:T51:maren | A | DeepSeek / current | MISLEADING |
| 20 | state:T100:maren | C | Qwen / current | MISLEADING |
