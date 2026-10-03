# D-10 NPC+ Mannerism System: Pass 1

**Status: IN PROGRESS.** Authoritative storage, four-slot cap, campaign-global uniqueness, initial seeded assignment and manual edit/delete contract are implemented. Emergent acquisition remains Pass 2. No live model calls were made.

## Definition and scope

A mannerism is one small, concrete, externally observable, repeatable detail: a glance, hand movement, facial gesture, posture, pause or speech cadence. It is an optional occasional characterization cue, never a personality contract or a decision rule. No morality, values, psychology, relationship style, loyalty, motivation, ideology, attraction, sexual preferences, consent or willingness is inferred. No quality, interest, personality or beauty scores exist.

Only NPC+ records own mannerisms. The existing household-membership trigger remains the sole automatic promotion mechanism. Ordinary campaign characters, guests and ephemeral participants receive none. Leaving a household preserves ownership; rejoining preserves the same slots. Existing NPC+ loaded from older saves remain at zero when they had no stored cues; load does not retroactively seed or consume a revision.

## Authority and uniqueness

[Types](../../src/campaign/types.ts) add optional `PremiumCharacterState.mannerisms`, with at most four records:

```ts
{
  id: string;
  canonical_key: string;
  text: string; // one line, at most 160 characters
  source: "seeded" | "emergent" | "user";
  created_revision: number;
  user_edited: boolean;
  requires_item_id?: string;
  requires_entity_id?: string;
}
```

The parent NPC+ record supplies `character_id`; it is not duplicated inside every cue. IDs derive from revision and the current campaign-wide entry count, so they stay bounded even for long character IDs. No hidden RNG state or counters are consumed during preparation.

[Domain implementation](../../src/campaign/mannerisms.ts) derives the authoritative canonical-key ownership lookup from every NPC+ record, including inactive records. This avoids a second mutable registry that could diverge. Snapshot validation rejects duplicate keys, duplicate IDs, duplicate exact text ignoring case, invalid revisions, overfull arrays and unedited seeds that differ from their curated definition. A seed's wording cannot be reintroduced under an unrelated key. Alternative wording using an owned key is rejected regardless of text.

Canonical keys enforce seeded concept identity, including differently worded versions of the same concept. Arbitrary free-text semantic equivalence is intentionally not solved in Pass 1. Future candidate producers must complete semantic duplicate review before supplying a `ValidatedMannerismCandidate`. Manual tooling must preserve the existing concept key for wording edits, or explicitly choose a replacement key when replacing the concept.

## Seed library and static review

[Curated source data](../../src/campaign/mannerism-seeds.ts) contains **80 authored seeds**, with ten in each category:

| Category | Seeds |
|---|---:|
| Gaze | 10 |
| Hands | 10 |
| Face | 10 |
| Head | 10 |
| Posture | 10 |
| Pause | 10 |
| Cadence | 10 |
| Small movements | 10 |

Accepted-library review: **zero unsafe seeds; zero duplicate canonical keys; zero object-dependent seeds**. Entries use neutral pronouns and neither gender nor personality archetypes determine selection. No seed introduces clothes, possessions, jewelry, gifts, weapons, books, tools, pets, relatives, jobs, scars, injuries or cultural facts.

Reproduce the compact development review with:

```powershell
npm run build --silent
node .build/src/dev/review-mannerism-seeds.js
```

The [review tool](../../src/dev/review-mannerism-seeds.ts) prints count/categories/rejected keys/duplicates, validates every definition and fails on rejected entries. Tests also feed it a deliberately unsafe ring/family seed and a duplicated key, proving both review failures are detected. Finite lexical guards reject obvious unsupported prerequisites and inference language; they are not presented as a general semantic classifier. Automatic fallback is restricted to the reviewed curated pool.

Selection uses a stable pseudo-random hash ordering over campaign ID, character ID and canonical key, then chooses the first unused available seed. Different campaign identities can create different casts; repeated preparation and equivalent membership-command orders yield identical state. Existing project domain identity is deterministic; no campaign RNG service exists to reuse. Promotion processing uses stable character-ID order, not sex or arrival-order archetypes.

## Promotion and prerequisites

[Premium lifecycle](../../src/campaign/premium-characters.ts) calls `assignInitialMannerism` only when creating a new NPC+ record, within normal detached campaign preparation. Promotion, ownership claim and initial assignment commit together through the existing receipt. Failure leaves authoritative state unchanged. Rejoins and later turns do not seed again or refill a deleted slot.

The assignment seam checks an available prevalidated candidate first when supplied by future tooling; current production supplies none and uses the safe seed fallback. It never replaces occupied slots. When no unused eligible seed remains, promotion succeeds with an empty array and persisted `metadata.initial_mannerism: "seed_pool_exhausted"`. A deterministic test claims all 80 concepts and verifies that the 81st NPC+ still promotes successfully. This outcome also covers a pool with no remaining seed compatible with the character.

Prerequisites are deterministic and checked on addition/edit and again on narrator activation:

- `requires_item_id`: the item must be registered, owned by the character and actually carried/equipped by them; canonical items must be narrator/player visible. Obvious object words must match the authoritative item name. Ownership alone or an item stored elsewhere is insufficient. An available ring cannot license a nonexistent doll.
- `requires_entity_id`: a visible canonical location must be the character's current location; a visible canonical character must share their established location. Other entity kinds fail closed; items use the possession prerequisite.
- Explicit silent/cannot-speak canon rejects speech-dependent cues; dead characters cannot activate cues.

Losing a prerequisite suppresses the cue in context while preserving its historical ownership and slot. The engine does not fabricate a replacement item, delete history, release ownership silently or rewrite the text. These limited checks are designed for supported prerequisites; broader arbitrary factual claims require future evidence validation, not guesses from prose.

## Narrator packing and controller isolation

[NPC+ packing](../../src/turn/npc-plus.ts) adds `Mannerisms:` with up to four short entries to selected present active NPC+ fragments, in both the detailed and compact tiers. Cues remain inside the existing global NPC+ budget and degrade with that optional portrayal context. Absent/inactive/unselected characters contribute no mannerism text. No global ownership keys or registry are serialized into narrator context.

When cues are packed, the NPC+ section adds one concise instruction: use them occasionally and naturally, never every scene or as caricature; they do not define personality, motivation, consent or internal state; never invent facts, objects or prerequisites to perform them. Prompts without mannerism cues retain the prior instruction text. Existing golden pipeline traces pass unchanged.

The controller stage already removes the entire `npc_plus` block. Controller schema, production prompt, authorization semantics and turn coordinator are unchanged. Mannerism mutation is not a `CampaignCommand` and is not available through controller or reflection schemas. Existing reflection can replace only its own notes; it cannot overwrite mannerisms.

## Future UI contract and persistence

[CampaignState](../../src/campaign/campaign-state.ts) exposes:

```ts
addMannerism({ expected_revision, character_id, definition });
editMannerism({ expected_revision, character_id, id, definition });
deleteMannerism({ expected_revision, character_id, id });
prepareMannerism({ kind, expected_revision, character_id, ... });
```

`definition` supplies text, canonical key and optional prerequisites. Manual methods strictly parse unknown data without invoking getters, then prepare and commit through owned receipts. The normal expected-revision, stale-receipt and consumed-receipt guarantees apply. Callers must be explicit user tooling; these APIs are not wired to models or background systems. No UI was built.

Add creates source `user`. Edit preserves ID, original source and creation revision, stores the exact valid edited text and sets `user_edited: true`. Keeping the key retains ownership; explicitly replacing it releases the old key and claims the new one atomically, provided no other character owns it. Delete releases the key and slot. A fifth addition is rejected; there is no automatic replacement or acquisition of slots two through four.

The existing strict optional-field extension convention is used, as with previous NPC+ contract/roll-up additions: snapshot version 3 and save envelope version 4 remain valid. New fields are optional; their absence means zero cues, with no defaults or historical replay on restore. Normal serialization persists all mannerism fields and the initial-assignment outcome. Round-trip tests include edited and user-created records, exact ownership preservation, unavailable prerequisites and legacy field absence. Older engine builds that do not recognize these new fields cannot read newly populated records; use this branch's engine for those saves.

## Validation and Pass 2 hooks

**19 focused D-10 tests** cover initial atomic assignment, ordinary-character exclusion, four-slot cap, ownership/aliases, distinct seeds, inactive ownership, curated safety, missing/available/mismatched item and entity prerequisites, save/load, delete at full capacity, edits and key replacement, exhausted-pool promotion, candidate-first/fallback seam, repeatable selection, relevant-only narrator packing, controller/reflection isolation, contradictory silent canon, manual getter rejection, stale/consumed receipts and failed promotion rollback. Existing NPC+ lifecycle, headroom, persistence, architecture, reflection and golden tests remain green.

- `npm run typecheck`: PASS.
- `npm test`: 1,869 tests; **1,865 passes, zero failures, same four accepted TODOs**.
- `npm run test:playthrough`: **25/25 PASS**.
- Seed review: 80 accepted; zero unsafe or duplicate entries.
- Paid/model calls: **0**.

Pass 2 can use `MannerismObservation` and `ValidatedMannerismCandidate`, the global ownership lookup, prerequisite checks and the candidate-first initial-assignment seam. Observation recording, evidence accumulation, reflection extraction, semantic matching, candidate detection and automatic additional-slot promotion are not implemented. No speculative evidence thresholds are stored. Later slots should become progressively more selective, with all promotion paths retaining the four-slot/uniqueness/no-overwrite rules.

Production controller remains `qwen/qwen3.8-flash`; narrator remains `z-ai/glm-5.2`. D-04 and D-05 remain CLOSED. D-09 remains separate. D-10 remains **IN PROGRESS**, with emergent acquisition pending. Dedicated branch: `feat/d10-mannerism-pass1`; do not merge automatically.
