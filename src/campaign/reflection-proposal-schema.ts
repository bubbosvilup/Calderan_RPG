// Exact qualified E1 canonical storage schema; isolated from runtime reflection dependencies.
type Schema = {type?:string;properties?:Record<string,Schema>;required?:string[];additionalProperties?:boolean;items?:Schema;enum?:readonly unknown[];const?:unknown;anyOf?:Schema[];minItems?:number;maxItems?:number;minLength?:number;maxLength?:number;minimum?:number;maximum?:number;uniqueItems?:boolean};
export const STORED_REFLECTION_SCHEMA:Schema = {
  "type": "object",
  "properties": {
    "proposals": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "subject_character_id": {
            "type": "string",
            "minLength": 1,
            "maxLength": 160
          },
          "evidence_refs": {
            "type": "array",
            "items": {
              "type": "string",
              "minLength": 1,
              "maxLength": 160
            },
            "minItems": 1,
            "maxItems": 8,
            "uniqueItems": true
          },
          "confidence": {
            "type": "string",
            "enum": [
              "low",
              "medium",
              "high"
            ]
          },
          "claim": {
            "anyOf": [
              {
                "type": "object",
                "properties": {
                  "type": {
                    "const": "relationship_trajectory"
                  },
                  "target_character_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 160
                  },
                  "dimension": {
                    "type": "string",
                    "enum": [
                      "trust",
                      "wariness",
                      "affection",
                      "respect",
                      "protectiveness",
                      "fear",
                      "hostility"
                    ]
                  },
                  "from": {
                    "type": "string",
                    "enum": [
                      "none",
                      "low",
                      "moderate",
                      "high"
                    ]
                  },
                  "to": {
                    "type": "string",
                    "enum": [
                      "none",
                      "low",
                      "moderate",
                      "high"
                    ]
                  },
                  "direction": {
                    "type": "string",
                    "enum": [
                      "increase",
                      "decrease",
                      "mixed"
                    ]
                  },
                  "transition_count": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100
                  }
                },
                "required": [
                  "type",
                  "target_character_id",
                  "dimension",
                  "from",
                  "to",
                  "direction",
                  "transition_count"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "const": "relationship_contrast"
                  },
                  "target_character_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 160
                  },
                  "dimension_a": {
                    "type": "string",
                    "enum": [
                      "trust",
                      "wariness",
                      "affection",
                      "respect",
                      "protectiveness",
                      "fear",
                      "hostility"
                    ]
                  },
                  "state_a": {
                    "type": "string",
                    "enum": [
                      "none",
                      "low",
                      "moderate",
                      "high"
                    ]
                  },
                  "dimension_b": {
                    "type": "string",
                    "enum": [
                      "trust",
                      "wariness",
                      "affection",
                      "respect",
                      "protectiveness",
                      "fear",
                      "hostility"
                    ]
                  },
                  "state_b": {
                    "type": "string",
                    "enum": [
                      "none",
                      "low",
                      "moderate",
                      "high"
                    ]
                  }
                },
                "required": [
                  "type",
                  "target_character_id",
                  "dimension_a",
                  "state_a",
                  "dimension_b",
                  "state_b"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "const": "relationship_parallel"
                  },
                  "target_character_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 160
                  },
                  "dimension_a": {
                    "type": "string",
                    "enum": [
                      "trust",
                      "wariness",
                      "affection",
                      "respect",
                      "protectiveness",
                      "fear",
                      "hostility"
                    ]
                  },
                  "dimension_b": {
                    "type": "string",
                    "enum": [
                      "trust",
                      "wariness",
                      "affection",
                      "respect",
                      "protectiveness",
                      "fear",
                      "hostility"
                    ]
                  },
                  "from": {
                    "type": "string",
                    "enum": [
                      "none",
                      "low",
                      "moderate",
                      "high"
                    ]
                  },
                  "to": {
                    "type": "string",
                    "enum": [
                      "none",
                      "low",
                      "moderate",
                      "high"
                    ]
                  },
                  "transition_count": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100
                  }
                },
                "required": [
                  "type",
                  "target_character_id",
                  "dimension_a",
                  "dimension_b",
                  "from",
                  "to",
                  "transition_count"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "const": "condition_trajectory"
                  },
                  "condition_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 160
                  },
                  "operations": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": [
                        "add",
                        "remove"
                      ]
                    },
                    "minItems": 1,
                    "maxItems": 8
                  },
                  "episode_count": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100
                  }
                },
                "required": [
                  "type",
                  "condition_id",
                  "operations",
                  "episode_count"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "const": "membership_trajectory"
                  },
                  "household_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 160
                  },
                  "operations": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": [
                        "join",
                        "leave",
                        "rejoin",
                        "migrate"
                      ]
                    },
                    "minItems": 1,
                    "maxItems": 8
                  },
                  "join_count": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100
                  },
                  "rejoin_count": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100
                  },
                  "leave_count": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100
                  }
                },
                "required": [
                  "type",
                  "household_id",
                  "operations",
                  "join_count",
                  "rejoin_count",
                  "leave_count"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "const": "movement_trajectory"
                  },
                  "locations": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 160
                    },
                    "minItems": 2,
                    "maxItems": 9
                  },
                  "transition_count": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100
                  }
                },
                "required": [
                  "type",
                  "locations",
                  "transition_count"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "const": "self_statement_synthesis"
                  },
                  "statement_refs": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "minLength": 1,
                      "maxLength": 160
                    },
                    "minItems": 2,
                    "maxItems": 8,
                    "uniqueItems": true
                  }
                },
                "required": [
                  "type",
                  "statement_refs"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "properties": {
                  "type": {
                    "const": "environmental_motif"
                  },
                  "household_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 160
                  },
                  "event_type": {
                    "const": "rule_added"
                  },
                  "occurrence_count": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 100
                  }
                },
                "required": [
                  "type",
                  "household_id",
                  "event_type",
                  "occurrence_count"
                ],
                "additionalProperties": false
              },
              {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "type",
                  "household_id",
                  "relation",
                  "anchor_ref",
                  "segment_index",
                  "occurrence_count"
                ],
                "properties": {
                  "type": {
                    "const": "environmental_shared_rule_text"
                  },
                  "household_id": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 160
                  },
                  "relation": {
                    "const": "shared_exact_segment"
                  },
                  "anchor_ref": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 160
                  },
                  "segment_index": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 7
                  },
                  "occurrence_count": {
                    "type": "integer",
                    "minimum": 2,
                    "maximum": 8
                  }
                }
              }
            ]
          }
        },
        "required": [
          "subject_character_id",
          "evidence_refs",
          "confidence",
          "claim"
        ],
        "additionalProperties": false
      },
      "minItems": 0,
      "maxItems": 3
    }
  },
  "required": [
    "proposals"
  ],
  "additionalProperties": false
};
export function schemaMatches(s: Schema, value: unknown): boolean {
    if (s.anyOf)
        return s.anyOf.some(x => schemaMatches(x, value));
    if (s.const !== undefined && value !== s.const)
        return false;
    if (s.enum && !s.enum.includes(value))
        return false;
    if (s.type === "string")
        return typeof value === "string" && value.length >= (s.minLength ?? 0) && value.length <= (s.maxLength ?? Infinity);
    if (s.type === "integer")
        return Number.isSafeInteger(value) && Number(value) >= (s.minimum ?? -Infinity) && Number(value) <= (s.maximum ?? Infinity);
    if (s.type === "array")
        return Array.isArray(value) && value.length >= (s.minItems ?? 0) && value.length <= (s.maxItems ?? Infinity) && (!s.uniqueItems || new Set(value.map(v => JSON.stringify(v))).size === value.length) && value.every(v => !s.items || schemaMatches(s.items, v));
    if (s.type === "object") {
        if (!value || typeof value !== "object" || Array.isArray(value))
            return false;
        const r = value as Record<string,unknown>;
        return (s.required ?? []).every(k => Object.hasOwn(r, k)) && (s.additionalProperties !== false || Object.keys(r).every(k => Object.hasOwn(s.properties ?? {}, k))) && Object.entries(s.properties ?? {}).every(([k, v]) => !Object.hasOwn(r, k) || schemaMatches(v, r[k]));
    }
    return true;
}
