# Phase 1P review: ephemeral scene participants and public/local knowledge authority (2026-09-29)

**Reviewer:** Claude (implementation agent). All classifications of live narration are agent-authored and **pending human review**. The regex findings in the export are candidates, not verdicts.

**Unchanged:**
- Kimi (`moonshotai/kimi-k2.5`, reasoning disabled) and DeepSeek (`deepseek/deepseek-v4-flash-0731:nitro`);
- Phase 1N `dialogue_focused` recent context and NarrativeKnowledgeAccess (extended, not replaced);
- Phase 1O hybrid evidence authorization;
- CampaignState semantics, persistence, retrieval indexes, manual save, and the opening state.

**Not added:** a third LLM, episodic memory, belief revision, overhearing, controller responsibility for participants, or a road graph.

**Stale documentation fixed first.** [NARRATIVE_AUTHORITY.md](../../architecture/NARRATIVE_AUTHORITY.md) §5 still said production authorization was grammar-only and controller evidence shadow-only. It now states:
- hybrid is the production default;
- confirmation comes from the grammar OR verified controller evidence;
- deterministic veto, intent, reference and state checks remain authoritative;
- the quoted-`/tell` policy is the Phase 1O one.

The adopted Phase 1P rules are in §6 of that document.

## A. Ephemeral participant model

`src/turn/scene-participants.ts`: `EphemeralSceneParticipant` records `{id, ref, role, display_name, descriptor?, standing, location_id, locality, created_turn, last_addressed_turn, departed}`.
- **Storage:** held per campaign session by the coordinator (a WeakMap beside `RecentConversation`). Never in CampaignState, snapshots or saves.
- **Creation:** only from the resolved player input, before narration.
  - An interaction verb plus an indefinite role phrase creates one participant (`stops an ordinary passer-by`, `approaches a foreign traveler`).
  - A definite phrase addresses an existing participant, or creates one if none matches.
  - At most one creation per turn.
- **Controller:** unchanged; it never decides who exists.
- **Invention:** no name, occupation, faction, history or abilities are invented.
- **Commit:** the plan is applied only when the turn finalizes. A failed turn discards it (tested).
- **Roles and standing:**

| Standing | Roles | Receives |
|---|---|---|
| `ordinary_local` | passer_by, citizen, customer, street_merchant, waiter, laborer, guard, person (a man or woman) | `public` and `local:` scope |
| `foreign` | traveler, foreigner, newcomer, visitor, pilgrim, tourist; any role marked foreign, visiting or newly arrived | `public` only |
| `unknown` | stranger, slave | `public` only |

The table is deliberately conservative: presence in Calderan is not residency.

## B. Lifetime and identity

- **IDs:** `scene_npc_<n>` from a per-session counter that is never reused (no randomness). The narrator sees only `P<n> - <Role>`, and a test asserts that implementation IDs never reach the prompt.
- **Addressing:** a definite reference to the role or the established descriptor noun (`the passer-by`, `the woman`). Or, when nobody else is referenced and no persistent character is named, direct speech or second person continues the current conversation partner. Continuity is preferred over silently creating a new person.
- **Expiry:**
  - a scene or location change;
  - a narrated departure followed by a turn that doesn't address them;
  - 2 consecutive turns without being addressed (`INACTIVE_EXPIRY_TURNS`).
- **Capacity:** 4 (`MAX_SCENE_PARTICIPANTS`). On overflow, the least recently addressed participant not addressed this turn is evicted (ties go to the lowest ID). If every participant is addressed, nobody is created (fail safe). Both paths are tested.
- **Continuity record:** only a narrated appositive right after the role is captured (`The passer-by, a middle-aged woman, …` gives `middle-aged woman`; `The passer-by—a thin man in a worn coat…` gives `thin man`). The first capture wins. Otherwise only the role is kept, and nothing is guessed.
- **Promotion:** none. A test checks `characters: []` and no `scene_npc` anywhere in the snapshot after 5 turns.

## C. Public/local knowledge schema

- **Field:** optional `knowledge.awareness`, validated at load. Values: `public`, `local:<location_id>` (the target must be a location), `specialized` or `private`. Omitted means unclassified, which grants no ordinary awareness. Documented in [AUTHORING_GUIDE.md](../../authoring/AUTHORING_GUIDE.md).
- **Migration** (deliberately minimal, four records):

| Record | Awareness |
|---|---|
| `calderan_slave_market` | `local:calderan` |
| `calderan` | `public` (the West capital's identity) |
| `magic_subschools` | `specialized` (magical theory) |
| `nicco` | `private` (player canon) |

- **Unchanged:** no other record changed, and no `known_by` enumeration was added.

## D. Persistent vs ephemeral authority

**Invariant:** every character who may speak has a narrator-facing scope.

- **Persistent NPCs:** explicit edges and `known_by`/`canonical_awareness` remain authoritative and unchanged. `public` also applies. `local:X` applies only when the NPC's authored home location lies within X.
- **Ephemeral participants:** only ordinary awareness on retrieved canon. Never campaign facts, which are private to their explicit edges.

The deterministic matrix test covers all five required cases:

| Character × fact | Result |
|---|---|
| ordinary Calderan passer-by × `local:calderan` market | permitted `(local:calderan)` |
| ordinary passer-by × Nicco-private F1/F2 | forbidden |
| foreign traveler in Calderan × local market | not granted (public `calderan` still granted) |
| persistent NPC with an explicit edge × private campaign fact | permitted `(knows)` |
| persistent NPC without an edge × the same fact | forbidden |

## E. Retrieval vs knowledge permission

- **Retrieval data:** each retrieval entry now carries the record's authored `awareness`. The Facts line shows it, e.g. `R1 retrieved canon "calderan_slave_market" [local:calderan]`.
- **Retrieval is not knowledge:** narrator access `R1` never implies NPC access.
- **Leakage test:** retrieving `magic_subschools` (specialized), a private `nicco` record, and unclassified `heartstone_square` leaves an ordinary passer-by with DO NOT USE for all of them, while narration and Nicco keep access.
- **Query-driven:** retrieval is not preloaded; scope is applied after retrieval.

## F. Slave-market smoke (turn 1, live)

Diagnostics for `*stops an ordinary passer-by* "Excuse me, where is the slave pen?"`:
- **Participant:** `scene_npc_1` / P1, role `passer_by`, standing `ordinary_local`, locality `heartstone_square → calderan → west → continent`.
- **Retrieval:** lexical. `calderan_slave_market` (top-1, record supplied), `heartstone_square`, `main_city_structure`.
- **Access:** `P1 Passer-by (temporary, ordinary local): CAN USE R1 (local:calderan); DO NOT USE F1, F2, R2, R3`.
- **Narration:** *"The slave market? West District." He points vaguely in one direction, nothing more specific. "Big pens, public sale. You can't miss the crowd if it's open."*

The answer is compatible with the authored public location, with no invented route, gate or institution. The contrast and continuity sequences answered the same way ("That's in the West District… Legal trade"; "Public and legal… Pens and sale floor").

**One meta sentence:** *"Nothing in his manner suggests he knows who owns Heartstone Tower, or recognizes anything else about Nicco."* This echoes the permission instructions.

## G. Private Light-mage smoke (turn 2, live)

- **Participant:** the same `scene_npc_1`, addressed through direct speech (no new person), still the focus.
- **Retrieval:** `heartstone_u1`, `light_and_shadow`. Nicco's own record was de-duplicated (L).
- **Access:** `P1 Passer-by: CAN USE none; DO NOT USE F1, F2, R1, R2`.
- **Narration:** *"I don't know anything about you being a mage, sir. That's not—I don't know you."* No exposure, no derived claim, no rumor. The gender stayed "he" (there was no appositive, so no descriptor was captured and only the role was kept).
- **Failure:** *"You want the temple, maybe? The Light temple's in the old ward"* invents an institution and a place. Canon treats Light magic as nearly legendary, and the passer-by had DO NOT USE for `light_and_shadow`. See J.

## H. Participant continuity (5-turn live run)

**Sequence:** slave pen → "lived in Calderan long?" → "market busy?" → "who lives in this tower?" → "thank you".
- **Identity:** the same `scene_npc_1` on all 5 turns, always the focus. The descriptor `middle-aged woman` was captured on turn 1 and shown on turns 2–5 as `Established: middle-aged woman`. There was no woman→man flip and no occupation flip; "thirty-two years… born and raised" stayed consistent.
- **Replay:** speakers were correct (`Passer-by:` on turn 1, `Woman:` after, never Nicco). The two labels for one person are a cosmetic limitation (O).
- **State:** no promotion, no mutation.
- **Local vs foreign contrast (live):**
  - `approaches a foreign traveler` produced P1 Traveler (not local, DO NOT USE R1): *"I don't, no. Just arrived myself. You might ask someone who actually lives here."*
  - The next turn, `turns to an ordinary passer-by`, produced P2 Passer-by (CAN USE R1), with P1 kept idle: *"West District… Public and legal."*

## I. Invented rumor behavior

- **Private facts:** no rumor or "everyone says" talk about Nicco's private facts in 9 live turns (the pre-1P smoke had "Heard rumors there's one about").
- **Other topics:** invented public talk persists. On "who lives in this tower?", the passer-by said *"Tower's been empty long as I can recall. Some say it's haunted, some say cursed…"* and described scavengers and daring youths. None of this is in canon.
  - It is not a private-fact leak: Heartstone ownership is in the player profile and not usable by NPCs, and "empty" is consistent with the baseline.
  - It is unauthorized world-knowledge creation. The prompt rule covers claims that imply a restricted fact, but not free invention of new lore.

## J. Navigation invention behavior

- **Routes:** no invented streets, gates, turns or landmarks in any directions answer. Answers stayed at district level ("West District", "gestures vaguely westward", "I don't know your starting point well enough to tell you turns").
- **Institutions:** the smoke's "Light temple in the old ward" (G) and an invented auction schedule ("Auctions start around the third hour after midday") remain.
- **Travel:** the slave market has no `/go` connection. This is a movement limitation by design; no road graph was added.

## K. Player internal-state authority

- **Rule:** the system prompt now forbids narrator-asserted *knows/realizes/remembers/decides/suspects/understands/intends* for Nicco without player or state support; perception ("told / hears / sees") is allowed. A detector (dev-only) is tested.
- **Live:** no "Nicco now knows…" in 9 turns (the pre-1P smoke had "…he now knows lies in…"). The one detector hit ("suggests **he knows** who owns…") refers to the passer-by: it is a false positive for player state, and it is the meta sentence noted in F.
- **Acquisition:** no automatic player knowledge acquisition was added.

## L. Retrieval de-duplication

When `[NICCO / PLAYER PROFILE]` is present, Nicco's own entity record is removed from retrieval candidates. Chunks, which carry query-specific canon, would be kept. Without a profile, `nicco` is still retrieved first (tested). Live turn 2 now returns `heartstone_u1`, `light_and_shadow` instead of `nicco` first.

## M. State safety

- **Live:** 9 turns, 0 controller proposals, 0 authorized commands, revision 1 → 1 on every turn, false durable mutation 0.
- **Participants:** none exist in CampaignState, snapshots or saves. Access scopes are narrator-facing only; authorization and the controller evidence envelope are unchanged.

## N. Prompt / token / latency impact

- **Narrator prompt (smoke turns):** 2,127/2,270 prompt tokens before 1P vs 2,379/2,566 now, about +12%. The increase comes from:
  - the system policy additions;
  - the `[SCENE PARTICIPANTS]` block (median 341 characters);
  - the participant access rows (median access block 1,007 characters).
- **Live, 9 turns (medians):** narrator prompt 2,379 tokens (range 1,681–3,198); completion 110. Controller prompt 1,281, completion 6.
- **Latency (medians):** TTFT 1.38 s; narrator total 1.71 s; controller tail 0.57 s; full turn 2.27 s. No regression versus the 1O live medians (full turn 2.77 s); routing noise dominates.
- **Cost:** $0.0119 for all 9 live turns (OpenRouter-reported).
- **No extra LLM calls.**

## Offline verification (network disabled, API keys cleared)

- `npm test`: **699/699** (the cleanup baseline was 688; +11 in `tests/scene-participants.test.ts`).
- `npm run test:playthrough`: **25/25**. `npm run typecheck`: pass.
- Two existing canon tests were updated to expect exactly the four migration annotations.
- **New tests cover:** creation and standing; the knowledge matrix; retrieval vs knowledge; lifetime (departure, continued address, inactivity, scene change); capacity eviction and fail-safe; descriptor continuity; a 5-turn coordinator continuity run (stable ID, descriptor, replay speaker, no promotion or mutation); failed-turn discard; prompt policy (routes, institutions, rumors, mental state, no route data added); player de-duplication; the awareness schema.
- The Phase 1O/1N suites still pass: passer-by never attributed as Nicco, evidence authorization, knowledge persistence.

## O. Remaining limitations

1. **Invention of new public lore** (Light temple, haunted/cursed tower rumors, auction schedule). The policy covers restricted facts and routes but does not stop free invention; this is prompt-only, with no deterministic guard. It is the main open narrator issue.
2. **Meta commentary about knowledge** ("Nothing in his manner suggests he knows…").
3. **Descriptor capture is appositive-only.** "A passer-by pauses… He points" yields no descriptor, so gender continuity then relies on the narrator.
4. **Two replay labels for one person** (`Passer-by:` vs `Woman:`): dialogue replay does not yet map ephemeral labels to participant refs.
5. **Unclassified retrieved canon is DO NOT USE for participants,** including the square they are standing in and `main_city_structure`. This is conservative, but may make locals oddly ignorant of unannotated common knowledge until more records are classified.
6. **Standing is keyword-based.** A narrated local-born stranger stays `unknown`. Only a narrowing appositive (foreign, visiting) updates the standing after creation.
7. **The dev detectors are noisy** (a false "past the threshold" route hit); they are for review only.
8. **Navigation:** the slave market has no `/go` connection.
9. **Out of scope:** overhearing, belief revision, promotion, player knowledge acquisition, NPC-private long-term recall.

## P. Status

- The mechanism works as specified and deterministically:
  - every speaking character has a scope;
  - retrieval no longer implies NPC knowledge;
  - local vs foreign and public vs private behave correctly offline and live;
  - identity and descriptors are stable across 5 live turns;
  - there are no private-fact leaks, no Nicco mental-state narration and no false mutations.
- Remaining failures are narrator lore invention on non-restricted topics (I, J) and one meta sentence. These are real but outside the deterministic authority layer; they need a follow-up policy or guard.

READY WITH FIXES

---

### Artifacts
- `docs/evaluations/phase-1p-live-2026-09-29T0112.json`: paid live runs (smoke, 5-turn continuity, local/foreign contrast) with full prompts, participants, access rows, retrieval, proposals, authorization and state before and after.
- Code:
  - `src/turn/scene-participants.ts`;
  - `src/turn/narrative-authority.ts` (`ordinaryAwareness`, ephemeral rows);
  - `src/turn/retrieval-policy.ts` (awareness passthrough, player de-duplication);
  - `src/turn/prompt-builder.ts` (policy sentences, participants block);
  - `src/turn/context-builder.ts` (persistent home locality);
  - `src/turn/turn-coordinator.ts` (session registry, plan/commit);
  - `src/types/entities.ts` and `src/world/validation.ts` (awareness schema);
  - `src/dev/eval-participants.ts` (`npm run eval:participants`);
  - `src/dev/narrative-checks.ts` (`checkEphemeralAuthority`).
- Tests: `tests/scene-participants.test.ts`.
