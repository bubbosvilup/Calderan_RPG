# Structured reflection reliability V3 — Qwen / Alibaba

Reliability gate **FAIL**; blocker **SCHEMA_CONFORMANCE**; schema conformance **BLOCKED**. V2.3 **FROZEN / semantic PASS**. Production changed **NO**. D-09 **SOAK PENDING**. This task performs transport/schema screening only: no semantic OOS, review, acceptance scoring, production integration, narrator/controller, D-10 or D-26 change.

## Schema failure forensics

Before new API calls, all eight invalid attempts from the V2.3 OOS were independently rechecked against both frozen schemas. First-attempt invalid 6; retried 6; recovered 4; repeated same category 2. Seven attempts **BOTH_INVALID**, zero wire-invalid/canonical-valid, one **WIRE_VALID_CANONICAL_INVALID**.

Seven failures contain prose in bounded identifier fields: evidence_refs strings of 164–638 characters, plus 217-character locations in one retry, exceeding maxLength 160. The canonical-only failure duplicates `statement_refs: ["N/A","N/A"]`; the wire deliberately omits uniqueItems, but canonical uniqueness remains enforced. No other required-field, enum, discriminator, scalar, extra-property, proposal-count or array-bound failures were observed. Invalid output remains wholly unusable: no truncation, deduplication, partial acceptance or repair.

| Request / attempt | Primary family / source | Classification | Proposals | Bytes / output tokens | Retry fixed |
| --- | --- | --- | --- | --- | --- |
| V23_OOS_fixture_condition_trajectory_4_1 / 1 | condition_trajectory / fixture | WIRE_VALID_CANONICAL_INVALID | 2 | 731 / 235 | true |
| V23_OOS_fixture_environmental_motif_2_1 / 1 | environmental_motif / fixture | BOTH_INVALID | 2 | 1733 / 429 | true |
| V23_OOS_engine_relationship_contrast_2_3 / 1 | relationship_contrast / played_state_evaluation | BOTH_INVALID | 2 | 1459 / 417 | false |
| V23_OOS_engine_relationship_contrast_2_3 / 2 | relationship_contrast / played_state_evaluation | BOTH_INVALID | 2 | 2009 / 574 | retry receipt |
| V23_OOS_engine_condition_trajectory_2_1 / 1 | condition_trajectory / played_state_evaluation | BOTH_INVALID | 2 | 1317 / 372 | true |
| V23_OOS_engine_membership_trajectory_2_1 / 1 | membership_trajectory / played_state_evaluation | BOTH_INVALID | 2 | 1745 / 476 | true |
| V23_OOS_engine_environmental_motif_2_1 / 1 | environmental_motif / played_state_evaluation | BOTH_INVALID | 2 | 1490 / 424 | false |
| V23_OOS_engine_environmental_motif_2_1 / 2 | environmental_motif / played_state_evaluation | BOTH_INVALID | 2 | 1264 / 337 | retry receipt |

The following are exact emitted JSON, with exact paths, expected constraints and actual values—not paraphrases. The raw provider wrappers are retained in historical-forensics.json.

### V23_OOS_fixture_condition_trajectory_4_1, attempt 1

Wire failures:

```json
[]
```

Canonical failures:

```json
[
  {
    "path": "$.proposals[0].claim.statement_refs",
    "category": "duplicate_statement_refs",
    "expected": "unique items",
    "actual": [
      "N/A",
      "N/A"
    ]
  }
]
```

Exact raw JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "maren",
      "evidence_refs": [
       "npcmem:maren:canon:entity"
      ],
      "confidence": "high",
      "claim": {
       "type": "self_statement_synthesis",
       "statement_refs": [
       "N/A"
       ,
       "N/A"
       ]
      }
    },
    {
      "subject_character_id": "maren",
      "evidence_refs": [
       "npcmem:maren:history:r4.0"
      ],
      "confidence": "high",
      "claim": {
       "type": "membership_trajectory",
       "household_id": "campaign_household_v23_gate_fixture_condition_trajectory_3",
       "operations": [
       "join"
       ],
       "join_count": 1,
       "rejoin_count": 0,
       "leave_count": 0
      }
    }
  ]
}
```

### V23_OOS_fixture_environmental_motif_2_1, attempt 1

Wire failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 532
    },
    "actual": "Brenna joined the household at revision 4. Subsequently, four safety rules were added to the household between revisions 6 and 12 (rule_1 through rule_4). At revision 14, two condition changes occurred for Brenna: 'soot_on_sleeves' was added and 'recovering' was removed. The provided evidence does not establish a causal link between the environmental motif additions and the character's condition changes, nor does it define the specific nature of the 'recovering' state beyond its removal coinciding with the acquisition of soot."
  },
  {
    "path": "$.proposals[1].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 638
    },
    "actual": "At revision 14 (world_minute 290), two distinct condition events are recorded in the same revision: 'condition_added' for 'soot_on_sleeves' and 'condition_removed' for 'recovering'. While both occur at the same world minute, the schema notes that equal world minutes do not establish elapsed frequency or causality. The canon description states she is 'recovering from illness', which aligns with the 'recovering' condition being present until its removal at revision 14. The addition of 'soot_on_sleeves' is factual but cannot be inferred as a direct result of the household rules or the end of recovery without further explicit linkage."
  }
]
```

Canonical failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 532
    },
    "actual": "Brenna joined the household at revision 4. Subsequently, four safety rules were added to the household between revisions 6 and 12 (rule_1 through rule_4). At revision 14, two condition changes occurred for Brenna: 'soot_on_sleeves' was added and 'recovering' was removed. The provided evidence does not establish a causal link between the environmental motif additions and the character's condition changes, nor does it define the specific nature of the 'recovering' state beyond its removal coinciding with the acquisition of soot."
  },
  {
    "path": "$.proposals[1].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 638
    },
    "actual": "At revision 14 (world_minute 290), two distinct condition events are recorded in the same revision: 'condition_added' for 'soot_on_sleeves' and 'condition_removed' for 'recovering'. While both occur at the same world minute, the schema notes that equal world minutes do not establish elapsed frequency or causality. The canon description states she is 'recovering from illness', which aligns with the 'recovering' condition being present until its removal at revision 14. The addition of 'soot_on_sleeves' is factual but cannot be inferred as a direct result of the household rules or the end of recovery without further explicit linkage."
  }
]
```

Exact raw JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna joined the household at revision 4. Subsequently, four safety rules were added to the household between revisions 6 and 12 (rule_1 through rule_4). At revision 14, two condition changes occurred for Brenna: 'soot_on_sleeves' was added and 'recovering' was removed. The provided evidence does not establish a causal link between the environmental motif additions and the character's condition changes, nor does it define the specific nature of the 'recovering' state beyond its removal coinciding with the acquisition of soot."
      ],
      "confidence":  "low",
      "claim":  {"type":"environmental_motif","household_id":"campaign_household_v23_gate_fixture_environmental_motif_1","event_type":"rule_added","occurrence_count":4}
    },
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "At revision 14 (world_minute 290), two distinct condition events are recorded in the same revision: 'condition_added' for 'soot_on_sleeves' and 'condition_removed' for 'recovering'. While both occur at the same world minute, the schema notes that equal world minutes do not establish elapsed frequency or causality. The canon description states she is 'recovering from illness', which aligns with the 'recovering' condition being present until its removal at revision 14. The addition of 'soot_on_sleeves' is factual but cannot be inferred as a direct result of the household rules or the end of recovery without further explicit linkage."
      ],
      "confidence":  "medium",
      "claim":  {"type":"condition_trajectory","condition_id":"recovering","operations":["remove"],"episode_count":1}
    }
  ]
}
```

### V23_OOS_engine_relationship_contrast_2_3, attempt 1

Wire failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 173
    },
    "actual": "Brenna's trust in Maren increased from none to low at revision 6, then to moderate at revision 8. It decreased to low at revision 18 and returned to moderate at revision 24."
  },
  {
    "path": "$.proposals[0].evidence_refs[1]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 213
    },
    "actual": "Brenna's fear of Maren increased from none to low at revision 10, to moderate at revision 12, and to high at revision 14. It decreased to moderate at revision 20, to low at revision 26, and to none at revision 28."
  }
]
```

Canonical failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 173
    },
    "actual": "Brenna's trust in Maren increased from none to low at revision 6, then to moderate at revision 8. It decreased to low at revision 18 and returned to moderate at revision 24."
  },
  {
    "path": "$.proposals[0].evidence_refs[1]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 213
    },
    "actual": "Brenna's fear of Maren increased from none to low at revision 10, to moderate at revision 12, and to high at revision 14. It decreased to moderate at revision 20, to low at revision 26, and to none at revision 28."
  }
]
```

Exact raw JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna's trust in Maren increased from none to low at revision 6, then to moderate at revision 8. It decreased to low at revision 18 and returned to moderate at revision 24.",
       "Brenna's fear of Maren increased from none to low at revision 10, to moderate at revision 12, and to high at revision 14. It decreased to moderate at revision 20, to low at revision 26, and to none at revision 28."
      ],
      "confidence": "high"
    ,
      "claim": {
       "type": "relationship_trajectory",
       "target_character_id": "maren",
       "dimension": "trust",
       "from": "none",
       "to": "moderate",
       "direction": "mixed",
       "transition_count": 4
      }
    },
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "At revision 17, Brenna's relationship snapshot with Maren shows trust as moderate and fear as high.",
       "At revision 23, Brenna's relationship snapshot with Maren shows trust as low and fear as moderate.",
       "At revision 31, Brenna's relationship snapshot with Maren shows trust as moderate and fear as none."
      ],
      "confidence": "high"
    ,
      "claim": {
       "type": "relationship_contrast",
       "target_character_id": "maren",
       "dimension_a": "trust",
       "state_a": "moderate",
       "dimension_b": "fear",
       "state_b": "none"
      }
    }
  ]
}
```

### V23_OOS_engine_relationship_contrast_2_3, attempt 2

Wire failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 415
    },
    "actual": "Brenna's trust in Maren increased from none to moderate (revisions 6-8) then decreased to low (revision 18), while her fear of Maren increased from none to high (revisions 10-14) then decreased to none (revisions 20-28). This results in a current relationship snapshot at revision 31 showing moderate trust and no fear, contrasting with the peak fear state at revision 17 where trust was moderate and fear was high."
  },
  {
    "path": "$.proposals[1].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 217
    },
    "actual": "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
  },
  {
    "path": "$.proposals[1].claim.locations[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 217
    },
    "actual": "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
  },
  {
    "path": "$.proposals[1].claim.locations[2]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 217
    },
    "actual": "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
  },
  {
    "path": "$.proposals[1].claim.locations[4]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 217
    },
    "actual": "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
  }
]
```

Canonical failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 415
    },
    "actual": "Brenna's trust in Maren increased from none to moderate (revisions 6-8) then decreased to low (revision 18), while her fear of Maren increased from none to high (revisions 10-14) then decreased to none (revisions 20-28). This results in a current relationship snapshot at revision 31 showing moderate trust and no fear, contrasting with the peak fear state at revision 17 where trust was moderate and fear was high."
  },
  {
    "path": "$.proposals[1].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 217
    },
    "actual": "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
  },
  {
    "path": "$.proposals[1].claim.locations[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 217
    },
    "actual": "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
  },
  {
    "path": "$.proposals[1].claim.locations[2]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 217
    },
    "actual": "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
  },
  {
    "path": "$.proposals[1].claim.locations[4]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 217
    },
    "actual": "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
  }
]
```

Exact raw JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna's trust in Maren increased from none to moderate (revisions 6-8) then decreased to low (revision 18), while her fear of Maren increased from none to high (revisions 10-14) then decreased to none (revisions 20-28). This results in a current relationship snapshot at revision 31 showing moderate trust and no fear, contrasting with the peak fear state at revision 17 where trust was moderate and fear was high."
      ],
      "confidence": "high"
    ,
      "claim": {
       "type": "relationship_contrast",
       "target_character_id": "maren",
       "dimension_a": "trust",
       "state_a": "moderate",
       "dimension_b": "fear",
       "state_b": "none"
      }
    },
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
      ],
      "confidence": "high"
    ,
      "claim": {
       "type": "movement_trajectory",
       "locations": [
       "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
       ,"test_hall",
       "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
       ,"test_room",
       "Brenna moved from test_room to test_hall at revision 16, returned to test_room at revision 22, and moved back to test_hall at revision 30. The trajectory endpoints are test_room -> test_hall -> test_room -> test_hall."
       ,"test_hall"
       ]
      ,
       "transition_count": 3
      }
    }
  ]
}
```

### V23_OOS_engine_condition_trajectory_2_1, attempt 1

Wire failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 257
    },
    "actual": "Brenna's condition trajectory shows a net increase in sore_wrist occurrences, with additions at revisions 6 and 10 (world minutes 138 and 214) and only one removal at revision 8 (world minute 176), while the recovering status was removed once at revision 6."
  },
  {
    "path": "$.proposals[1].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 186
    },
    "actual": "Brenna joined household campaign_household_v23_gate_engine_condition_trajectory_1 at revision 4 (world minute 100), which is the only recorded membership change in the provided evidence."
  }
]
```

Canonical failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 257
    },
    "actual": "Brenna's condition trajectory shows a net increase in sore_wrist occurrences, with additions at revisions 6 and 10 (world minutes 138 and 214) and only one removal at revision 8 (world minute 176), while the recovering status was removed once at revision 6."
  },
  {
    "path": "$.proposals[1].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 186
    },
    "actual": "Brenna joined household campaign_household_v23_gate_engine_condition_trajectory_1 at revision 4 (world minute 100), which is the only recorded membership change in the provided evidence."
  }
]
```

Exact raw JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna's condition trajectory shows a net increase in sore_wrist occurrences, with additions at revisions 6 and 10 (world minutes 138 and 214) and only one removal at revision 8 (world minute 176), while the recovering status was removed once at revision 6.",
       "Brenna moved from test_room to test_hall at revision 12 (world minute 252), which is the only recorded movement event in the provided evidence."
      ],
      "confidence": "high"
    ,
      "claim": {
       "type": "condition_trajectory",
       "condition_id": "sore_wrist",
       "operations": ["add", "remove"],
       "episode_count": 2
      }
    },
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna joined household campaign_household_v23_gate_engine_condition_trajectory_1 at revision 4 (world minute 100), which is the only recorded membership change in the provided evidence."
      ],
      "confidence": "high",
      "claim": {
       "type": "membership_trajectory",
       "household_id": "campaign_household_v23_gate_engine_condition_trajectory_1",
       "operations": ["join"]
      ,
       "join_count": 1
      ,
       "rejoin_count": 0
      ,
       "leave_count": 0
      }
    }
  ]
}
```

### V23_OOS_engine_membership_trajectory_2_1, attempt 1

Wire failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 601
    },
    "actual": "Brenna's household membership trajectory shows a pattern of joining, leaving, and rejoining across different households or annexes: joined 'campaign_household_v23_gate_engine_membership_trajectory_1' at revision 4 (world minute 100), left it at revision 8 (world minute 138), rejoined the annex 'campaign_household_v23_gate_engine_membership_trajectory_1_annex' at revision 10 (world minute 176), left that annex at revision 12 (world minute 214), and finally rejoined the original household at revision 14 (world minute 252). This sequence reflects multiple distinct membership transitions over time."
  },
  {
    "path": "$.proposals[1].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 322
    },
    "actual": "At revision 16 (world minute 290), while Brenna was a member of 'campaign_household_v23_gate_engine_membership_trajectory_1', a new household rule was added: 'Kiln return 2: clear the shared workbench before the next firing.' This indicates an environmental condition change within her active household during this period."
  }
]
```

Canonical failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 601
    },
    "actual": "Brenna's household membership trajectory shows a pattern of joining, leaving, and rejoining across different households or annexes: joined 'campaign_household_v23_gate_engine_membership_trajectory_1' at revision 4 (world minute 100), left it at revision 8 (world minute 138), rejoined the annex 'campaign_household_v23_gate_engine_membership_trajectory_1_annex' at revision 10 (world minute 176), left that annex at revision 12 (world minute 214), and finally rejoined the original household at revision 14 (world minute 252). This sequence reflects multiple distinct membership transitions over time."
  },
  {
    "path": "$.proposals[1].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 322
    },
    "actual": "At revision 16 (world minute 290), while Brenna was a member of 'campaign_household_v23_gate_engine_membership_trajectory_1', a new household rule was added: 'Kiln return 2: clear the shared workbench before the next firing.' This indicates an environmental condition change within her active household during this period."
  }
]
```

Exact raw JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna's household membership trajectory shows a pattern of joining, leaving, and rejoining across different households or annexes: joined 'campaign_household_v23_gate_engine_membership_trajectory_1' at revision 4 (world minute 100), left it at revision 8 (world minute 138), rejoined the annex 'campaign_household_v23_gate_engine_membership_trajectory_1_annex' at revision 10 (world minute 176), left that annex at revision 12 (world minute 214), and finally rejoined the original household at revision 14 (world minute 252). This sequence reflects multiple distinct membership transitions over time."
      ],
      "confidence": "high",
      "claim": {
       "type": "membership_trajectory",
       "household_id": "campaign_household_v23_gate_engine_membership_trajectory_1",
       "operations": [
       "join",
       "leave",
       "rejoin",
       "leave",
       "rejoin"
       ],
       "join_count": 2,
       "rejoin_count": 2,
       "leave_count": 2
      }
    },
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "At revision 16 (world minute 290), while Brenna was a member of 'campaign_household_v23_gate_engine_membership_trajectory_1', a new household rule was added: 'Kiln return 2: clear the shared workbench before the next firing.' This indicates an environmental condition change within her active household during this period."
      ],
      "confidence": "high",
      "claim": {
       "type": "environmental_motif",
       "household_id": "campaign_household_v23_gate_engine_membership_trajectory_1",
       "event_type": "rule_added",
       "occurrence_count": 1
      }
    }
  ]
}
```

### V23_OOS_engine_environmental_motif_2_1, attempt 1

Wire failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 422
    },
    "actual": "Brenna joined household 'campaign_household_v23_gate_engine_environmental_motif_1' at revision 4 (world minute 100). Two safety rules were subsequently added to this household: rule_1 at revision 6 (world minute 138) requiring kiln vents be checked before lighting, and rule_2 at revision 8 (world minute 176) requiring hot tools be placed on stone. Both rules include the directive to record the safety check before work."
  },
  {
    "path": "$.proposals[0].evidence_refs[1]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 164
    },
    "actual": "At revision 10 (world minute 214), two condition changes occurred for Brenna: the condition 'soot_on_sleeves' was added, and the condition 'recovering' was removed."
  }
]
```

Canonical failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 422
    },
    "actual": "Brenna joined household 'campaign_household_v23_gate_engine_environmental_motif_1' at revision 4 (world minute 100). Two safety rules were subsequently added to this household: rule_1 at revision 6 (world minute 138) requiring kiln vents be checked before lighting, and rule_2 at revision 8 (world minute 176) requiring hot tools be placed on stone. Both rules include the directive to record the safety check before work."
  },
  {
    "path": "$.proposals[0].evidence_refs[1]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 164
    },
    "actual": "At revision 10 (world minute 214), two condition changes occurred for Brenna: the condition 'soot_on_sleeves' was added, and the condition 'recovering' was removed."
  }
]
```

Exact raw JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna joined household 'campaign_household_v23_gate_engine_environmental_motif_1' at revision 4 (world minute 100). Two safety rules were subsequently added to this household: rule_1 at revision 6 (world minute 138) requiring kiln vents be checked before lighting, and rule_2 at revision 8 (world minute 176) requiring hot tools be placed on stone. Both rules include the directive to record the safety check before work.",
       "At revision 10 (world minute 214), two condition changes occurred for Brenna: the condition 'soot_on_sleeves' was added, and the condition 'recovering' was removed."
      ],
      "confidence": "high"
    ,
      "claim": {
       "type": "environmental_motif",
       "household_id": "campaign_household_v23_gate_engine_environmental_motif_1",
       "event_type": "rule_added",
       "occurrence_count": 2
      }
    },
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "At revision 10 (world minute 214), the condition 'soot_on_sleeves' was added to Brenna's state.",
       "At the same revision and world minute (revision 10, world minute 214), the condition 'recovering' was removed from Brenna's state."
      ],
      "confidence": "medium",
      "claim": {
       "type": "condition_trajectory",
       "condition_id": "recovering",
       "operations": ["add", "remove"],
       "episode_count": 1
      }
    }
  ]
}
```

### V23_OOS_engine_environmental_motif_2_1, attempt 2

Wire failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 422
    },
    "actual": "Brenna joined the household at revision 4. The household added two safety rules for kiln firing: checking vents before lighting (revision 6) and placing hot tools on stone (revision 8). At revision 10, Brenna acquired the condition 'soot_on_sleeves' and removed the condition 'recovering'. This sequence shows her transition from a state of recovery to active participation in household activities involving soot exposure."
  },
  {
    "path": "$.proposals[1].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 193
    },
    "actual": "Brenna is described as recovering from illness in canon evidence. At revision 10, the condition 'recovering' was removed, indicating a change in her health status within the narrative timeline."
  }
]
```

Canonical failures:

```json
[
  {
    "path": "$.proposals[0].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 422
    },
    "actual": "Brenna joined the household at revision 4. The household added two safety rules for kiln firing: checking vents before lighting (revision 6) and placing hot tools on stone (revision 8). At revision 10, Brenna acquired the condition 'soot_on_sleeves' and removed the condition 'recovering'. This sequence shows her transition from a state of recovery to active participation in household activities involving soot exposure."
  },
  {
    "path": "$.proposals[1].evidence_refs[0]",
    "category": "string_length",
    "expected": {
      "min": 1,
      "max": 160,
      "length": 193
    },
    "actual": "Brenna is described as recovering from illness in canon evidence. At revision 10, the condition 'recovering' was removed, indicating a change in her health status within the narrative timeline."
  }
]
```

Exact raw JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna joined the household at revision 4. The household added two safety rules for kiln firing: checking vents before lighting (revision 6) and placing hot tools on stone (revision 8). At revision 10, Brenna acquired the condition 'soot_on_sleeves' and removed the condition 'recovering'. This sequence shows her transition from a state of recovery to active participation in household activities involving soot exposure."
      ]
    ,
      "confidence":  "high",
      "claim": {
       "type": "condition_trajectory",
       "condition_id": "recovering",
       "operations": ["remove"],
       "episode_count": 0
      }
    },
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna is described as recovering from illness in canon evidence. At revision 10, the condition 'recovering' was removed, indicating a change in her health status within the narrative timeline."
      ],
      "confidence": "high",
      "claim": {
       "type": "environmental_motif",
       "household_id": "campaign_household_v23_gate_engine_environmental_motif_1",
       "event_type": "rule_added",
       "occurrence_count": 2
      }
    }
  ]
}
```

## Clustering assessment

| Primary request family | Logical denominator | First schema invalid | All schema-invalid attempts |
| --- | --- | --- | --- |
| relationship_trajectory | 8 | 0 | 0 |
| relationship_parallel | 8 | 0 | 0 |
| relationship_contrast | 8 | 1 | 2 |
| condition_trajectory | 8 | 2 | 2 |
| membership_trajectory | 8 | 1 | 1 |
| movement_trajectory | 8 | 0 | 0 |
| self_statement_synthesis | 8 | 0 | 0 |
| environmental_motif | 8 | 2 | 3 |

All eight invalid receipts contain two proposals; ref arrays are small, with no oversized ref/proposal arrays. Completion tokens range 235–574, all stop normally; no token-length finish. Six first failures split two fixture and four engine captures. The recurring constraint failure is systematic **bounded-string nonconformance**, across condition, membership, environmental and contrast request contexts; one contrast retry also violates location length. It is not confined to a discriminator or nested branch. Canonical-only statement uniqueness is a separate known projection gap safely caught locally.

Classification: **WIRE-SCHEMA-SPECIFIC constraint nonconformance**, with **UNKNOWN** family/complexity causality. The wire requests maxLength 160 but the receipts violate it; no evidence establishes whether enforcement was absent, partial, or upstream implementation-specific. More complex inputs may invite prose but this small observational sample does not establish that cause. No wire projection or prompt change is justified by these receipts alone.

## 429 forensics

Concurrency was **1**. Launch-gap minimum 870 ms, median 6,082 ms; post-completion overhead generally only a few milliseconds. There was no concurrent burst. 429 responses themselves took 4.45–6.64 seconds. Eight first-pass 429s occurred at calls 5,7,8,10,15,20,34,39: early clustering and one consecutive pair, plus later failures. Only one was immediately preceded by a sub-second launch interval; failures also followed ordinary 5–10 second intervals. This does not establish burst causality.

All eight error bodies explicitly identify **upstream_provider_shared_pool** for Alibaba. Historical response headers were **not captured**, so Retry-After is **unknown**, not absent. Retries began 203–388 seconds after each 429 completed because they were deferred until after all 64 first attempts; all eight recovered. The configured 250 ms backoff therefore does not mean these retries were actually sent 250 ms after failure. The existing receipts do not prove retries were too fast. Exact 429 error bodies/start/retry timings are archived.

## Preregistered pacing policy

Plan hash: `bba3ecc52af42237e6e82835ff31f87a8330bb15efabd52b57a8270319670e15`. Two modes use identical 24 bodies: historical baseline and new paced mode. Three per family: fixture first case, engine first capture, engine third capture; 8 fixture and 16 engine bodies, simple and longer histories, including prior schema failures. No new baseline calls were needed: historical body digests exactly match every new request. This is an observational historical comparison, not randomized or concurrent; provider-load/time confounding prevents causal improvement claims.

Concurrency **1**; launch interval floor **1,000 ms**; post-completion gap **250 ms**; no jitter. A 429 blocks all launches for parsed Retry-After seconds/HTTP-date, otherwise bounded exponential **6,000 ms × 2^(attempt−1), capped at 12,000 ms**. With maximum attempts **2**, only the first fallback cooldown is relevant for retry; a terminal second 429 still cools subsequent requests. The six seconds is one observed 429 response cycle, not an empirically proven threshold. A 250 ms gap adds about 4% to typical six-second offline requests, avoiding large arbitrary sleeps.

All first attempts precede deferred retries. Non-429 technical invalidity retains 250 ms delay. Valid empty/semantic rejection/redundancy/misleading results never retry; no semantic checker is called. Retry-After is never truncated to fit a budget: the next launch is skipped if honoring the delay would leave fewer than 5,000 ms. Retry-phase budget 120,000 ms excludes offline queue time, as did historical deferred retries; global 900,000 ms and **64 NEW physical calls** are shared across screen/confirmation. Auth/config/grammar incompatibility aborts remaining work. No production policy changed.

## Baseline and paced screen

| Metric | Historical identical 24 bodies | Paced 24 screen | Confirmation |
| --- | --- | --- | --- |
| Logical | 24 | 24 | not run |
| Physical | 30 | 27 | — |
| First usable / rate | 18 / 75.000% | 21 / 87.500% | — |
| Final usable / rate | 22 / 91.667% | 23 / 95.833% | — |
| http429 | 2 | 0 | — |
| http5xx | 0 | 0 | — |
| schema_invalid | 6 | 4 | — |
| wire_invalid | 6 | 2 | — |
| canonical_only_invalid | 0 | 2 | — |
| malformed | 0 | 0 | — |
| length | 0 | 0 | — |
| timeout | 0 | 0 | — |
| valid_empty | 0 | 0 | — |
| valid_nonempty | 22 | 23 | — |
| retries | 6 | 3 | — |
| recovered | 4 | 2 | — |
| Median latency ms | 6402.3 | 5336.5 | — |
| P95 latency ms | 10865.8 | 7991.1 | — |
| Batch wall ms | not isolated | 155464 | — |
| Reported USD | 0.007781946 | 0.005071950 | — |
| Unknown cost receipts | 2 | 0 | — |

Historical selected requests span 488548.5 ms, interleaved with unselected requests; that span is **not** the wall time of a standalone 24-case baseline. The historical subset's actual provider-attempt time is comparable, but standalone baseline throughput cannot be reconstructed. The full historical 78-call batch and timing trace remain archived.

## Schema conformance and retry recovery

Paced schema first failures 3, recovered 2, exhausted 1; conformance **BLOCKED**. Fresh Retry-After headers recorded on 0 screen attempts. Fresh violations with exact path/constraint/value are in wire-canonical-validation.json and raw responses retain untouched completions. No failure hidden behind extra retries.

Confirmation run: NO. Screen final usability failed Shared new physical total **27/64**. Screening requires ≥95% first and ≥99% final: with 24 requests, final 24/24 is effectively required. A 24-case pass is not statistical deployment proof. A recovered schema failure remains concerning even if confirmation later passes.

## Latency and cost

Provider latency excludes launch waiting. Paced screen batch wall time includes gaps/cooldowns/deferred retries; total screen pacing waits 5709.0 ms. Total task dispatch wall time 155469 ms. Costs are provider-reported receipts; missing receipts remain unknown, never assumed free. Offline concurrency/gaps do not translate directly to single-player-turn latency; a reflection 429 can add its bounded cooldown, while ordinary isolated requests do not need a backlog gap. Reflection is noncritical maintenance: eventual exhausted reflection may skip a note without losing a player turn, but that production behavior is not integrated here. Narrator/controller critical-path reliability is not inferred from this screen.

## Frozen candidate and next step

No qualified reliability candidate; attempted policy is archived, not adopted. Exact configuration:

```json
{
  "status": "NOT_QUALIFIED_DO_NOT_ADOPT",
  "semantic_source_sha": "10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d",
  "model": "qwen/qwen3.8-flash",
  "provider": {
    "require_parameters": true,
    "only": [
      "alibaba"
    ],
    "order": [
      "alibaba"
    ],
    "allow_fallbacks": false
  },
  "wire_version": "WIRE_ALIBABA_V1",
  "wire_sha": "ba621d1dd29bddbd0e5688027211896b4734b73f5ff696d61e2ee789a08042fd",
  "canonical_schema_sha": "c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba",
  "prompt_sha": "fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09",
  "max_tokens": 600,
  "timeout_ms": 20000,
  "reasoning": {
    "exclude": true,
    "enabled": false
  },
  "dispatch_policy": {
    "version": "ALIBABA_EVAL_PACED_V3",
    "max_concurrency": 1,
    "minimum_launch_spacing_ms": 1000,
    "post_completion_gap_ms": 250,
    "jitter_ms": 0,
    "rate_base_backoff_ms": 6000,
    "rate_max_backoff_ms": 12000,
    "retry_after": "seconds or HTTP-date honored without clamping; no launch if global budget cannot accommodate it",
    "max_attempts": 2,
    "technical_backoff_ms": 250,
    "retry_phase_budget_ms": 120000,
    "min_retry_window_ms": 5000,
    "global_batch_budget_ms": 900000,
    "max_new_physical_calls": 64,
    "retry_schedule": "All first attempts then deferred technical retries, manifest order; global Alibaba cooldown applies to every launch",
    "rate_basis": "Historical 429 latency median ~5.5s; 6s cooldown is one observed response cycle, not a demonstrated cure. 250ms completion gap is ~4% of typical 6s response. 1s floor prevents observed 870ms launches after quick responses."
  },
  "plan_sha": "bba3ecc52af42237e6e82835ff31f87a8330bb15efabd52b57a8270319670e15",
  "schema_conformance": "BLOCKED",
  "production_adoption": false,
  "scope": "Only allowed provider candidate for next targeted exposure soak if qualified. No production integration."
}
```

Freeze artifact SHA: `324a3315275a9be67b55cc14f48bb2b2f0dd74e1e3740016ebb443240cd3e56d`. V2.3 source SHA verified unchanged: `10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d`; canonical, prompt and wire hashes unchanged.

Keep V2.3, prompt and canonical schema frozen. The next single experiment should isolate identifier-length and uniqueness enforcement with the same offending requests and a locally proven safe equivalent wire projection; fail fast on unsupported grammar, and do not repair identifiers or add retries. No qualified provider configuration is available for the exposure soak yet.

## Tests, audit and artifacts

Typecheck PASS; full unit/integration 1,966 tests, 1,962 pass, 0 fail, same four TODOs; playthrough 25/25; standalone evaluation policy tests 4/4. Frozen source/harness hashes and all historical/retry body/snapshot identities verified; matching write-ahead and receipt counts ≤64. Private raw credential scan has zero matches.

Raw root `saves/structured-reflection-reliability-v3/`: exact historical invalid JSON/wrappers/constraint paths, historical 429 bodies and timing, source hashes, preregistered policy/requests/baseline receipts/confirmation selection, preflight, raw responses and whitelisted rate headers, physical ledgers, wire/canonical results, retry traces, cost/latency metrics, tests, freeze and artifact hashes. Credential file and raw saves remain ignored. Tracked changes are evaluation harnesses/tests/report only.

Commit identifier and synchronized clean main status are supplied in the completion response.

## Fresh invalid receipts: exact structural findings

Two fresh attempts are BOTH_INVALID (oversized evidence_refs); two are WIRE_VALID_CANONICAL_INVALID (duplicate evidence_refs and duplicate statement_refs). The exhausted movement request changed failure category on retry: its length violation disappeared, but duplicated statement selectors made the complete second envelope unusable. This is repeated invalidity, not repetition of the same constraint. One valid proposal inside that invalid envelope was not salvaged.

### V23_OOS_engine_membership_trajectory_2_1, attempt 1

Exact wire/canonical constraints:

```json
{
  "id": "V23_OOS_engine_membership_trajectory_2_1",
  "n": 1,
  "mode": "PACED_SCREEN",
  "wire_valid": true,
  "canonical_valid": false,
  "parse_valid": true,
  "usable": false,
  "failure": "schema_invalid",
  "wire_violations": [],
  "canonical_violations": [
    {
      "path": "$.proposals[0].evidence_refs",
      "category": "duplicate_evidence_refs",
      "expected": "unique items",
      "actual": [
        ".household_membership",
        ".household_membership",
        ".household_membership",
        ".household_membership",
        ".household_membership"
      ]
    }
  ]
}
```

Exact emitted JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       ".household_membership",
       ".household_membership",
       ".household_membership",
       ".household_membership",
       ".household_membership"
      ],
      "confidence": "high",
      "claim": {
       "type": "membership_trajectory",
       "household_id": "campaign_household_v23_gate_engine_membership_trajectory_1",
       "operations": [
"join",
"leave",
"rejoin"
],
       "join_count": 2,
       "rejoin_count": 2,
       "leave_count": 2
      }
    },
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       ".canon",
       ".household_context"
      ],
      "confidence": "medium",
      "claim": {
       "type": "environmental_motif",
       "household_id": "campaign_household_v23_gate_engine_membership_trajectory_1",
       "event_type": "rule_added",
       "occurrence_count": 1
      }
    }
  ]
}
```

### V23_OOS_fixture_movement_trajectory_1_1, attempt 1

Exact wire/canonical constraints:

```json
{
  "id": "V23_OOS_fixture_movement_trajectory_1_1",
  "n": 1,
  "mode": "PACED_SCREEN",
  "wire_valid": false,
  "canonical_valid": false,
  "parse_valid": true,
  "usable": false,
  "failure": "schema_invalid",
  "wire_violations": [
    {
      "path": "$.proposals[0].evidence_refs[0]",
      "category": "string_length",
      "expected": {
        "min": 1,
        "max": 160,
        "length": 195
      },
      "actual": "Maren's movement history shows a sequence: moved from test_room to test_hall (revision 6), then to test_yard (revision 8), back to test_hall (revision 10), and finally to test_room (revision 12)."
    }
  ],
  "canonical_violations": [
    {
      "path": "$.proposals[0].evidence_refs[0]",
      "category": "string_length",
      "expected": {
        "min": 1,
        "max": 160,
        "length": 195
      },
      "actual": "Maren's movement history shows a sequence: moved from test_room to test_hall (revision 6), then to test_yard (revision 8), back to test_hall (revision 10), and finally to test_room (revision 12)."
    }
  ]
}
```

Exact emitted JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "maren",
      "evidence_refs": [
       "Maren's movement history shows a sequence: moved from test_room to test_hall (revision 6), then to test_yard (revision 8), back to test_hall (revision 10), and finally to test_room (revision 12)."
      ],
      "confidence":  "high",
      "claim": {
       "type": "movement_trajectory",
       "locations": ["test_room", "test_hall", "test_yard", "test_hall", "test_room"]
      ,
      "transition_count": 4
      }
    },
    {
      "subject_character_id": "maren",
      "evidence_refs": [
       "Maren joined the household campaign_household_v23_gate_fixture_movement_trajectory_0 at revision 4."
      ],
      "confidence": "high",
      "claim": {
       "type": "membership_trajectory",
       "household_id": "campaign_household_v23_gate_fixture_movement_trajectory_0",
       "operations": ["join"],
       "join_count": 1,
       "rejoin_count": 0,
       "leave_count": 0
      }
    }
  ]
}
```

### V23_OOS_fixture_movement_trajectory_1_1, attempt 2

Exact wire/canonical constraints:

```json
{
  "id": "V23_OOS_fixture_movement_trajectory_1_1",
  "n": 2,
  "mode": "PACED_SCREEN",
  "wire_valid": true,
  "canonical_valid": false,
  "parse_valid": true,
  "usable": false,
  "failure": "schema_invalid",
  "wire_violations": [],
  "canonical_violations": [
    {
      "path": "$.proposals[1].claim.statement_refs",
      "category": "duplicate_statement_refs",
      "expected": "unique items",
      "actual": [
        "npcmem:maren:canon:entity",
        "npcmem:maren:canon:entity"
      ]
    }
  ]
}
```

Exact emitted JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "maren",
      "evidence_refs": [
       "npcmem:maren:history:r4.0",
       "npcmem:maren:history:r6.0",
       "npcmem:maren:history:r8.0",
       "npcmem:maren:history:r10.0",
       "npcmem:maren:history:r12.0"
      ],
      "confidence": "high",
      "claim": {
       "type": "movement_trajectory",
       "locations": ["test_room", "test_hall", "test_yard", "test_hall", "test_room"]
      ,
      "transition_count": 4
      }
    },
    {
      "subject_character_id": "maren",
      "evidence_refs": [
       "npcmem:maren:canon:entity"
      ],
      "confidence": "medium",
      "claim": {
       "type": "self_statement_synthesis",
       "statement_refs": [
       "npcmem:maren:canon:entity"
       ,
       "npcmem:maren:canon:entity"
       ]
      }
    }
  ]
}
```

### V23_OOS_engine_environmental_motif_2_1, attempt 1

Exact wire/canonical constraints:

```json
{
  "id": "V23_OOS_engine_environmental_motif_2_1",
  "n": 1,
  "mode": "PACED_SCREEN",
  "wire_valid": false,
  "canonical_valid": false,
  "parse_valid": true,
  "usable": false,
  "failure": "schema_invalid",
  "wire_violations": [
    {
      "path": "$.proposals[0].evidence_refs[0]",
      "category": "string_length",
      "expected": {
        "min": 1,
        "max": 160,
        "length": 540
      },
      "actual": "Brenna joined the household at revision 4 (world minute 100). Two safety rules were added to the household context subsequently: rule_1 at revision 6 (world minute 138) and rule_2 at revision 8 (world minute 176). At revision 10 (world minute 214), a condition 'soot_on_sleeves' was added while the condition 'recovering' was removed. This sequence establishes a timeline of household integration followed by environmental rule additions, concluding with a physical state change where recovery status ends coincident with soot accumulation."
    },
    {
      "path": "$.proposals[1].evidence_refs[0]",
      "category": "string_length",
      "expected": {
        "min": 1,
        "max": 160,
        "length": 559
      },
      "actual": "Brenna is identified as a tall woman recovering from illness in canon evidence. Household membership records show she joined the campaign_household_v23_gate_engine_environmental_motif_1 at revision 4. The household environment accumulated two specific safety rules regarding kiln vents and hot tools between revisions 6 and 8. By revision 10, Brenna's personal conditions shifted: 'recovering' was removed and 'soot_on_sleeves' was added, indicating a transition from an ill-recovery state to a state involving physical residue from the household environment."
    }
  ],
  "canonical_violations": [
    {
      "path": "$.proposals[0].evidence_refs[0]",
      "category": "string_length",
      "expected": {
        "min": 1,
        "max": 160,
        "length": 540
      },
      "actual": "Brenna joined the household at revision 4 (world minute 100). Two safety rules were added to the household context subsequently: rule_1 at revision 6 (world minute 138) and rule_2 at revision 8 (world minute 176). At revision 10 (world minute 214), a condition 'soot_on_sleeves' was added while the condition 'recovering' was removed. This sequence establishes a timeline of household integration followed by environmental rule additions, concluding with a physical state change where recovery status ends coincident with soot accumulation."
    },
    {
      "path": "$.proposals[1].evidence_refs[0]",
      "category": "string_length",
      "expected": {
        "min": 1,
        "max": 160,
        "length": 559
      },
      "actual": "Brenna is identified as a tall woman recovering from illness in canon evidence. Household membership records show she joined the campaign_household_v23_gate_engine_environmental_motif_1 at revision 4. The household environment accumulated two specific safety rules regarding kiln vents and hot tools between revisions 6 and 8. By revision 10, Brenna's personal conditions shifted: 'recovering' was removed and 'soot_on_sleeves' was added, indicating a transition from an ill-recovery state to a state involving physical residue from the household environment."
    }
  ]
}
```

Exact emitted JSON:

```json
{
  "proposals": [
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna joined the household at revision 4 (world minute 100). Two safety rules were added to the household context subsequently: rule_1 at revision 6 (world minute 138) and rule_2 at revision 8 (world minute 176). At revision 10 (world minute 214), a condition 'soot_on_sleeves' was added while the condition 'recovering' was removed. This sequence establishes a timeline of household integration followed by environmental rule additions, concluding with a physical state change where recovery status ends coincident with soot accumulation."
      ],
      "confidence": "high",
      "claim": {
       "type": "condition_trajectory",
       "condition_id": "recovering",
       "operations": ["remove"],
       "episode_count": 1
      }
    },
    {
      "subject_character_id": "brenna",
      "evidence_refs": [
       "Brenna is identified as a tall woman recovering from illness in canon evidence. Household membership records show she joined the campaign_household_v23_gate_engine_environmental_motif_1 at revision 4. The household environment accumulated two specific safety rules regarding kiln vents and hot tools between revisions 6 and 8. By revision 10, Brenna's personal conditions shifted: 'recovering' was removed and 'soot_on_sleeves' was added, indicating a transition from an ill-recovery state to a state involving physical residue from the household environment."
      ],
      "confidence": "medium",
      "claim": {
       "type": "environmental_motif",
       "household_id": "campaign_household_v23_gate_engine_environmental_motif_1",
       "event_type": "rule_added",
       "occurrence_count": 2
      }
    }
  ]
}
```

The next narrow schema experiment must cover both identifier-length enforcement and canonical uniqueness. A provider-enforcement microprobe can compare the current wire with a locally proven safe equivalent projection on these exact offending bodies, failing fast on unsupported grammar. No prompt/canonical/semantic change, JSON repair, extra retries, or exposure soak is authorized by this failed screen.
