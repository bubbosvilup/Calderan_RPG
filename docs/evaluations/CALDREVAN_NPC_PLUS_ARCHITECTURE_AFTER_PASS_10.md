# NPC+ architecture after Pass 10

A canonical engineering reference. It describes what the code does now, not how it got here. For history and evidence see the Pass 1–10 reports; for open risks see the [debt register](CALDREVAN_DEBT_REGISTER_AFTER_PASS_10.md).

## 1. One-screen pipeline

```
 PLAYER TEXT ──► intent ───────────────────────────────────────────────────────────────────────┐
   (turn/stages/intent.ts: movement, carry, transactions, rule declarations; invitation detection)│
        │                                                                                        │
        ▼                                                                                        │
 CampaignSnapshot (authority: characters, households, relationships, runtime locations, …)       │
        │ projected (Nicco already moved)                                                        │
        ▼                                                                                        ▼
 buildTurnContext ─► A authority (never packed) ─► NPC+ pack (B/C/D, ≤ 4,000 chars, ≤ headroom) ─► narrator prompt
        │                 ▲ recovery by handle (public sources only, ≤ 2 lines)                  + left-behind note
        ▼                                                                                        │
 NARRATOR (draft) ──────────────────────────────────────────────────────────────────────────────┘
        │ draft text
        ▼
 CONTROLLER (proposal only) ──┐
 narratedMovements(draft) ────┼─► derived move_character proposals (only for a destination the controller did not propose)
        ▼                     ▼
 command-authorizer: a move_character commits ONLY with same-turn narrated evidence for that exact destination
        │ authorized commands + player runtime effects
        ▼
 campaign.prepare  ─►  AUDIT of the draft (absent_participant, uncommitted_movement, conditions, …)
        │                      └─► one bounded revision (told what COMMITTED, incl. moves) ─► else redaction
        ▼
 campaign.commit (single, final) ─► syncPremiumCharacters: base→draft diff ─► PremiumHistoryEntry (e.g. `moved`)
        │                                       └─► >16 entries fold into the roll-up
        ▼
 (after the turn, outside it)  reflectAfterTurn: due? ─► evidence catalog (public) ─► 1 model call
        ─► deterministic validation ─► separate `record_reflection` revision (stale ⇒ dropped)
```

## 2. NPC lifecycle

- A character is **NPC+ iff** it is a current member (status `member`, not owner) of a household Nicco keeps. Membership is the only trigger. Ownership, affection, presence or conversation never create NPC+.
- Authored (canonical) NPCs can be NPC+. Once active, their location is **runtime-authoritative** (`runtime.npc_locations`) and moves only through the evidence rules below. Created characters keep their location on their own record.
- Join creates a `PremiumCharacterState` and a `joined_household` entry. Leave sets `active_household_member = false`, keeps the record and adds `left_household`. Rejoin adds `rejoined_household`. A legacy save migrates by deriving records for current members only (`migrated_member`).
- Join and leave in play are authorized through `household_choices` evidence (a present, unconditional choice voiced by the chooser).

## 3. `PremiumCharacterState` (premium domain, snapshot schema 2)

| Part | Meaning | Writer |
|---|---|---|
| `character_id` | identity link to a real character, never Nicco | `syncPremiumCharacters` |
| `metadata.active_household_member` | **derived marker** of membership; must equal it | `syncPremiumCharacters` |
| `stable.*_contract`, `moral_boundaries`, `baseline_social_style` | campaign contracts that override canon; set-once; **require `contract_evidence`** | `establish_character_contract` only |
| `stable.contract_evidence[]` | verbatim self-description with its revision | same command |
| `dynamic.recent_developments[]` | **history**: the committed transitions of this character, chronological, cap 16 | `syncPremiumCharacters` only |
| `dynamic.long_term` | roll-up counts of entries that left the window (never prose) | `foldDevelopment` |
| `dynamic.private_memory_refs` | **reserved, no writer** (debt) | none |
| `premium_reflections[].notes` | interpretation, **never authority** | `record_reflection` only |

Current relationship levels, locations, conditions, legal status and household role live in **their own domains**. Premium state holds only the history of their changes, never a second copy of the value.

## 4. Developments, retention, roll-ups

Every commit runs `syncPremiumCharacters(draft, base)`. It diffs base against draft for each NPC+ and appends, in fixed category order, entries of kind:

`relationship_changed` · `condition_added` / `condition_removed` · `legal_status_changed` · `person_transaction` · `household_rule_added` · `moved` · `contract_established` · `joined_household` / `left_household` / `rejoined_household` / `migrated_member`.

A duplicate command in a batch therefore yields one entry (the diff sees one change). Retention is 16; older entries fold into `long_term` in the same revision (relationship rows capped at 24, condition rows at 12, evicted rows counted in `other_*`). Nothing is dropped silently.

## 5. Recovery (tier D)

Deep sources are **derived, never stored**, and each has a stable handle:

`npcmem:<id>:canon:entity` · `…:canon:<chunk>` · `…:history:r<revision>.<n>` · `…:rollup:long_term` · `…:contract:<i>` · `…:reflection:<note id>` · `…:knowledge:<fact id>`.

`recoverNpcContext(world, snapshot, handle)` returns the exact source (a history entry as its structured JSON; a roll-up typed `consolidated_history`). A rotated-out history handle does not resolve. **Public** sources of selected characters that share a distinctive word with the player's input are recovered before narration (≤ 2 lines, ≤ 600 characters each). A recovered line whose source H3 retrieval already fetched becomes a pointer to `[RETRIEVED CANON]` (identity, not text similarity). Private sources (narrator-only canon the character does not know, facts only they know) are recoverable by the engine and **never rendered** in NPC+ lines.

## 6. Reflection (post-turn, non-authoritative)

- **Due:** ≥ 3 developments since the last reflection (the lifecycle `joined_household` counts), or a roll-up change, or a new contract. Never conversation alone.
- **Evidence catalog:** public sources only, each with a handle, an event count, an episode id and a `movement_only` flag.
- **One** model call per due NPC+ (default 1 per turn). Output is strictly parsed; anything off-schema fails the whole reflection closed.
- **Deterministic validation** of every proposal: shape and bounds; every ref exists in the catalog; minimum evidence per kind; recurrence needs ≥ 2 distinct episodes; a tension needs a contrast; the forbidden content (romance, diagnosis, hidden motive, backstory, absolutes); **unsupported claims** (causes, wants, enjoyment, learned beliefs, rule authorship, any inner state of Nicco, stance words when all evidence is movement); **instruction-shaped or meta text**; people limited to the character, Nicco and those the evidence involves.
- **Merge:** a proposal updates the note of the same kind and label (or normalized text); notes lose refs that no longer resolve and vanish with none; per-kind caps stance 4 / signature 4 / motif 4 / role 3 / tension 3.
- **Commit:** one separate `record_reflection` revision against the revision the evidence came from. A newer turn makes it **stale and dropped**. Provider failure, malformed output or total rejection never touches gameplay.
- A reflection never writes relationships, contracts, legal status, membership, conditions, location, inventory, knowledge or canon.

## 7. Context tiers and budgets

| Tier | Content | Rule |
|---|---|---|
| **A** authority | identity, location, legal status, membership, rules, conditions, knowledge permissions, relationships | **never packed or dropped**; only the 32,000-character serialized cap can reject a turn (`context_too_large`, fail closed) |
| **B** | present **and addressed** active NPC+: personality, voice, morality, social style, role, relationship, recent, history, top 2 reflections | pinned when it fits |
| **C** | every other active NPC+: the compact "caveman" line (`core= voice= social= role= N{…} recent= hist= refl= away deep=[…]`) | by score, ties by snapshot order |
| **D** | handles only | recovered on demand |

One **global** NPC+ budget: the smaller of 4,000 characters and the headroom authority leaves minus a reserve. NPC+ therefore degrades toward D and never causes `context_too_large` by itself. Selection is deterministic: score, then snapshot order, then output in snapshot order.

**Known ceiling:** the authority tier grows with present people × the shown facts each knows (≈ 125 characters per permission edge). Seven present NPC+ who all know all 32 shown facts overflow. See the debt register.

## 8. Movement and following

There is **no party, follower or companion model**. Nicco moving moves nobody. A character moves only on **completed, narrated, same-turn** evidence.

1. **Invitation** (`follow-invitation.ts`): an explicit come-along phrase in the player's sentence, not vetoed by the shared gate `invitation_not_offered` (negation including typed `dont`, conditional, imagined, remembered, other-day, threat, coercion). Reaches the named active NPC+ that Nicco is leaving behind; a group word reaches all of them; an unnamed phrase reaches the sole eligible one. An invitation changes **only the narrator note**.
2. **Left-behind note** (`leftBehindNotes`): non-invited people get the conservative "stays there… only if they themselves clearly follow him". An invited active NPC+ gets a neutral choice that states the **pre-turn fact** (they were with Nicco when he spoke; `away` only means not yet in the destination) and that a follower arrives after Nicco.
3. **Recognition** (`narratedMovements`): explicit destination patterns ("follows him into the hall"), or the **implicit-destination grammar** for an active NPC+ when Nicco moved and they are not already at the arrival: subject-led or step-led clauses with optional lead-in ("A moment later," / "Behind him,"), follow-manner words only after the verb, dash and ellipsis ending the manner like a comma without hiding a destination, and the whole clause clear of the shared gate `follow_not_done` (modal, negation, refusal, almost, other-day, habitual, gaze, question). The destination is **always Nicco's same-turn arrival**, never inferred from geography. Pronouns resolve only to a unique compatible person.
4. **Proposal:** the controller's `move_character`, or a derived one for a recognised move the controller did not propose **to that destination**.
5. **Authorization** (`command-authorizer.ts`, unchanged): a `move_character` is authorized only when same-turn evidence names that mover **and that destination**. A `leave_scene` for an NPC+ is rejected; authored non-NPC+ never gain mobility.
6. **Commit, history:** one commit → one `moved` development. The audit's movement backstop uses the same grammar, so an authorized follow is never erased, and an unsupported one is flagged.

## 9. Save, load, migration

- Premium state is part of the snapshot (schema 2) inside save version 3. Migration 2→3 derives records for current members; nothing else changes, nothing is weakened.
- `validateCampaignSnapshot` is strict and fails closed with `invalid_save` or `reference_invalid`. Among its rules: the active marker equals membership; revisions never in the future; history chronological and ≤ 16; roll-up consistency; every ref (character, household, transaction, location, fact) resolves; **a contract exists only with evidence**; reflection only for NPC+, bounded per kind, evidence refs only of that character.
- A failed turn leaves the snapshot byte-identical. A save is manual only.

## 10. Authority boundaries (summary)

| Concern | Authority | NPC+ may |
|---|---|---|
| Who is NPC+ | household membership | never decide it |
| Location | runtime / character record | change only by evidenced narrated movement |
| Relationships, conditions, legal status, rules | their domains | read them; record history of change |
| Contracts | explicit self-description + quote | never rewrite |
| Interpretation | `premium_reflections` | cite evidence; never override state |
| Narrator and controller | evidence and proposals | never authority; authorization is final |

## 11. Rules for extending safely

1. New NPC+ behaviour enters through a **stage module** or an existing seam (audit, authorization, the premium sync), never `runTurn` (guarded at ≤ 164 lines).
2. Any new write path needs: an authorization rule with same-turn evidence, a deterministic validator, restore-time validation, an audit consistency check, and tests with a negative family.
3. Do not add a second copy of a value another domain owns; add a history entry or a derived rendering instead.
4. Language gates are shared (`turn/language`); a change to a gate updates the locked matrix in `tests/language-gates.test.ts` in the same change.
5. Run `npm run typecheck && npm test && npm run test:playthrough`; the H2 golden must stay byte-identical unless a prompt change is deliberate and reviewed.
6. Offline tools: `node .build/tests/pass10-{grammar-report,headroom,perf,deps,replay-live,ablation}.js`; optional paid probe: `node .build/src/dev/probe-follow-choice.js` (dry by default).
