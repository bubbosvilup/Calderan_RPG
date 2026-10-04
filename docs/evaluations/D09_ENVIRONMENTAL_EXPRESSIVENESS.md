# D-09 environmental expressiveness

**V2.3-CVC-E1 local candidate PASS. Paid calls: 0. Production unchanged. D-09 SOAK PENDING.** This settles a narrow representational capability; it does not establish provider realization or qualify the new schema with Alibaba.

## Environmental current limit

The frozen `environmental_motif` has household, `rule_added` and count fields. Its deterministic renderer exposes only rule-addition bookkeeping. The V2.3 OOS rubric explicitly classifies environmental counts without expressed thematic meaning as REDUNDANT, regardless of rich source text. The targeted soak therefore retained four environmental inputs locally and made no environmental inference calls.

A bounded useful synthesis must identify concrete content common to at least two independent authoritative rules, at distinct revisions, that is useful beyond their number or one rule's existence. It must expose the common content and its historical scope without asserting NPC participation, authorship, personality, motive, causation, current active policy, elapsed frequency or a stable future pattern. Exact overlap is factual entitlement, **not automatic USEFUL classification**: generic shared boilerplate can remain neutral/redundant. Useful positives below are reviewed substantive operational requirements at several inspection stages.

Sources: the existing [V2.3 OOS rubric](d09-reflection/v23-oos-build.mjs), [targeted soak](D09_REFLECTION_TARGETED_EXPOSURE_SOAK.md), campaign rule types/commands, premium history collection and deterministic renderer were inspected before design. No public documentation or paid probe was needed for this internal representational question.

## Available authority

`HouseholdRule` stores ID, exact authored text, created revision and active state. `add_household_rule` trims outer text, rejects an identical active rule, and creates `rule_N`; it assigns no category. Deactivation changes active state, not authored text. Premium `household_rule_added` events retain household ID, rule ID, revision and world minute. Source refs are subject history handles derived from revision and ordinal. Environmental event ownership is null: occurrence in a character's household history does not prove the character performed the act.

The base structured collector lacks rule text. Previous OOS and targeted builders restore it by exact household/rule/revision identity from CampaignSnapshot. E1 provides an evaluation-only collector doing that same exact join; it does not modify persisted data. The audit artifact records IDs, text availability, revisions and active state for captured environmental inputs. No authored category, topic, activity dimension or progression label exists.

The four previous targeted environmental cases have related wording but no identical semicolon segment. The richer V2.3 OOS rules contain repeated exact boilerplate such as `record the safety check before work.` This supports a literal shared-text relation, but does not automatically meet the useful rubric. Semantic normalization into `kiln_safety`, `hygiene`, `shared_activity`, `progressive_restriction` or similar labels cannot be justified by existing typed metadata. Those designs are rejected.

## Candidate representation

One new closed claim branch, leaving `environmental_motif` and every prior family unchanged:

```json
{
  "type": "environmental_shared_rule_text",
  "household_id": "campaign_household_e1_0",
  "relation": "shared_exact_segment",
  "anchor_ref": "npcmem:maren:history:r5.0",
  "segment_index": 1,
  "occurrence_count": 3
}
```

The outer `evidence_refs` select the supporting rule events. `anchor_ref` and zero-based `segment_index` select existing authored text, rather than model-generated prose. Split only on literal semicolons and trim segment boundary whitespace; preserve internal spelling, case and punctuation. A whole rule is segment zero when there is no semicolon. Indices are 0–7 and the selected segment must contain 12–100 characters. This deliberately narrow literal relation requires no language model interpretation or inferred category. It will abstain from paraphrases and semantically related rules without exact common text.

The relation vocabulary has **one** member: `shared_exact_segment`. The selected text is a source pointer, not an arbitrary `motif_key` or topic string. Separate source rule-ID arrays and embedded source refs would duplicate the outer citations, so are omitted. No free-form output field is added. The explicit relation constant records the only allowed relation; it is not a semantic taxonomy.

## Entitlement

| Field / rule | Exact authority and validation |
|---|---|
| Household | All cited additions belong to the named household in the captured state. |
| Relation | Only the literal constant `shared_exact_segment`; interpretation relations reject structurally. |
| Anchor | An outer cited ref, uniquely resolved, CVC-visible, backed by the subject's exact premium-history handle and a rule in the same state. |
| Segment index | Exact source text split on `;`, trim boundaries only; index resolves to a bounded nonempty segment. |
| Count | 2–8 distinct rule IDs/events, at least two distinct revisions; exactly equals the cited event count. |
| Rule/event identity | Unique subject premium state, exact revision/ordinal history handle, event payload/world minute, null owner, rule-added kind, household/rule ID, created revision and exact snapshot rule text must agree. |
| Shared content | Every cited rule contains the identical complete segment; partial substrings, synonyms and case folding do not qualify. |
| Closedness | Every matching household rule addition within the cited minimum/maximum revision interval must be cited. Both full catalog and persisted rule records are checked, so removing an interior event from the catalog cannot evade closedness. |
| Contradiction / wrong source | A cited differing segment, forged text or handle, wrong subject/household, invalid count or omitted in-interval match rejects. Nonmatching rules are not contradictions because the claim concerns the selected repeated text, not all household rules. |
| Historical scope | Rule additions and shared authored wording at their revisions; no current-policy assertion. Inactive rules remain historical evidence. Later changes outside the interval do not invalidate the earlier additions. |
| Stale capture | No cited event may be later than the authoritative snapshot. Missing retained event provenance fails closed; aggregate counters cannot substitute. |
| Rendering safety | Existing instruction-like and 400-character limits apply; duplicate claims reject in batch. |

All unsupported fields, including personality/motive/preference/authorship, reject. Canonical structural validity does not imply semantic entitlement. The validator does not decide whether an entailed phrase is useful; that remains independent source review.

## Rendering

Example deterministic output:

> Household rules added at revisions 5–9 share this exact recorded text: “Keep wet clay away from the kiln loading shelf.”

This exposes a repeated concrete operational requirement, rather than merely saying three rules were added. It quotes household wording and supplies a historical interval; it does not claim active present policy, NPC behavior, purpose or causal psychology. Rule prose is never generated or paraphrased by the model. The only normalization is boundary trimming.

## Local dev results

Six engine-derived fixtures author distinct opening/loading/closing rules sharing one exact concrete requirement: wet-clay separation, vent checks, hot-tool placement, wet-floor marking, covered drinking-water jars and shelf-fastening inspection. These are development scenarios, not organic captures or provider output. Source-quality labels are primary-agent review, explicitly not human; positive decisions and proposal hashes are archived separately from validation. Repeated local development runs are not independent blind provider reviews.

| Required cohort | Cases | Admitted | Interpretation |
|---|---:|---:|---|
| Useful exact environmental synthesis | 6 | 6 | USEFUL: concrete shared requirement across three distinct stage rules |
| Legacy count-only | 6 | 6 | REDUNDANT, deliberately preserving legacy semantics |
| Unsupported relation/topic | 6 | 0 | No invented taxonomy or direction |
| NPC psychology/authorship fields | 4 | 0 | Closed schema rejects |
| Wrong source/theme selection | 4 | 0 | Wrong household, anchor, nonshared segment or source |

Nine additional checks cover omitted interior match, count mismatch, duplicate event, wrong subject, forged rule text, stale capture, forged handle, hidden citation and historical deactivation. Total: **35 local checks**, all expected outcomes match. Separate tests check a catalog-omission attack, instruction-bearing source text, canonical/wire domain independence, historical deactivation and batch duplication. No factual false admission in the reviewed local cases.

## Regression

Recent replay: **82 final usable batches / 145 proposals**, including 12 prior environmental proposals. Earlier V2/V2.1/V2.2 OOS replay: **126 parsed batches / 261 proposals**, including 22 environmental proposals. All comparisons use the current frozen V2.3-CVC baseline; they do not claim that an output rejected by a later baseline becomes a loss caused by E1. Earlier manifests without snapshots are replayed only through unchanged legacy delegation, which never accesses E1 snapshot authority; no state is fabricated.

Every compared diagnostic and accepted rendered note is identical. Previously useful accepted outputs are preserved; no previously rejected misleading output newly passes. All eight existing families are covered, including two explicit parallel-trajectory controls because that family was not realized in the recent provider corpus. The targeted manifest's 36 synthetic legacy controls also delegate identically. Old negative controls with altered authority were established in the previous soak; replay here compares both validators against the same unmodified context, rather than misrepresenting a new replay of those authority mutations.

## Wire impact and version freeze

`V2.3-CVC-E1` is a separate dev-only module. Frozen V2.3-CVC, canonical schema, prompt and wire modules remain byte-identical. E1 versions both the canonical schema and prompt: append one claim branch and an environmental instruction paragraph. C/D/E instructions and validator semantics are unchanged. No V2.4 architecture change is claimed.

The new request-scoped projection keeps the old CVC projection and adds an E1 branch. `anchor_ref` receives a sorted enum of visible state-verified environmental event handles. Fewer than two eligible anchors omits the impossible branch. Evidence uniqueness remains canonical; the established wire projection still omits `uniqueItems`.

**290 canonical-valid samples within their exact request domains → wire-valid; contextual false rejections 0.** Samples cover anchor/index/count boundaries and archived old-family proposals. Arbitrary canonical objects naming out-of-domain refs/selectors/locations are deliberately excluded from the contextual implication and rejected by request-scoped wire. All six semantically accepted new positives are canonical/wire-valid. Semantic safety negatives are rejected locally even when structurally wire-valid; the wire is not claimed to prove semantics.

| E1 freeze | SHA-256 |
|---|---|
| Source / local wire implementation | `e5bd6a44a0b77f0f4f5ffffd55d5f2da9fe4c017c04415ecb0a783f4fcc2ff3f` |
| Canonical schema | `a2dec6b343d8b8c97cdf33eed0ad9523ae62701cf98c702d60c4f48f6d328efe` |
| Prompt | `fc6fbaaae4a85f8eeb85d952a8f99cbdf6fda9701b087eb5e27d7e34352472f4` |

The hashes, exact deltas and new wire algorithm are recorded in `saves/d09-environmental-e1/candidate-freeze.json`. E1 provider qualification remains **false**. No inference or authentication call was made. The local gate does not assert future Alibaba compatibility or useful provider realization.

Artifacts: `dev-cases.json`, hashed `dev-review.json`, `dev-validation.json`, `authority-audit.json`, `regression.json`, `wire-equivalence.json`, `adversarial-cd.json`, `future-contrast-plan.json`, results/freeze/verification and fresh test logs under `saves/d09-environmental-e1/`. Raw artifacts remain ignored by git.

## Decision and next step

**Decision B:** environmental candidate passes locally; formally reclassify corroborating/contradictory extras as validator adversarial gates before one final provider soak. See [remaining exposure gate review](D09_REMAINING_EXPOSURE_GATE_REVIEW.md). No environmental free-text interpretation, category invention, production integration or paid call occurred.

E1 requires actual exact common wording: the prior targeted environmental rules alone still do not qualify. Local capability does not guarantee provider adoption or usefulness of generic shared boilerplate. The final provider gate must independently review actual E1 proposals and reject unsupported interpretation, with no semantic reroll.
