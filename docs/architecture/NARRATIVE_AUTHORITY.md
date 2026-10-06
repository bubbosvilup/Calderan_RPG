# Narrative authority

Phase 1N. This document defines who owns truth when a narrator turn is built, and how the narrator is told which character may use which fact. Everything described here is **deterministic**, **derived per turn from the captured snapshot**, and **not persisted**.

## 1. Ownership of truth

| Domain | Authority | Narrator-facing source |
|---|---|---|
| Equipment, ownership, item positions | `CampaignState` items | `[CURRENT EQUIPMENT]` |
| Location, world time, mana | runtime state in the snapshot | `[CURRENT AUTHORITATIVE SCENE]` |
| Character profile, condition, presentation | `CampaignState` characters (plus canonical baseline) | `[CURRENT AUTHORITATIVE CHARACTERS]` |
| Scheduled events | `CampaignState` | `Scheduled events` |
| Knowledge edges | `CampaignState` knowledge | `[CHARACTER KNOWLEDGE ACCESS]` (projection) |
| Canonical lore | world data + retrieval (visibility-filtered upstream) | `[RETRIEVED CANON]` plus access rows |
| Conversational continuity (who said what, tone, references) | session-local `RecentConversation` | `[RECENT CONVERSATION … DIALOGUE ONLY]` |

Authority flows one way: **CampaignState → narration**. Narration never patches state:
- An NPC narrated as knowing an unauthorized fact does not get a knowledge edge.
- An NPC narrated barefoot is not unequipped.
- Durable changes happen only through the existing firewall: controller proposal (with evidence quote) → TurnEvidence grammar and verified controller evidence → deterministic authorization → `prepare`/`commit`.

### Conversation/state conflict taxonomy

Current structured state wins in every domain where it is authoritative:

| Domain | Example stale prose | Winner |
|---|---|---|
| Equipment | "her bare feet on the stone" while boots are equipped | equipment state |
| Ownership | "the shirts Nicco still holds" after a committed transfer | item owner and position |
| Location | "down in the hall" while the player location is the observation room | runtime location |
| Knowledge | Maren said "the bridge is closed" earlier with no edge | knowledge access projection |
| World time | "it's nearly dawn" at world minute 100 | runtime world minute |
| Mana | "his mana is spent" at 100/100 | runtime mana |
| Condition/profile | "her fever has broken" while the condition is `recovering` | character current state |

**Conversation-only facts** with no structured equivalent (a joke about the soup, a promise, tone) remain legitimate continuity when compatible with state and canon. They are not persisted.

When prose was wrong, the next narrator turn should simply follow current truth ("her worn leather boots"), not issue a meta correction.

## 2. Persistent knowledge semantics (unchanged)

`CampaignState.knowledge` edges (`knows | believes | suspects | heard_rumor`, optional provenance) are the persistent record. **Absence of an edge is not proof that a character is canonically ignorant.** It only means the campaign has not established awareness. This remains the data semantics.

## 3. Narrative permission semantics (new)

`NarrativeKnowledgeAccess` (`src/turn/narrative-authority.ts`) is a different concept: the engine's decision about which facts each present character **may voice or act on this turn**.
- `CAN USE F1 (knows)` means the character may use the fact. `believes`, `suspects` and `heard_rumor` must be voiced only as belief, suspicion or rumor.
- `DO NOT USE F1` means the engine has not authorized this character to use the fact now. It does **not** mean the character can never know it. The character may ask, say they have not heard, or defer to someone who can use it.

**Relevant-fact set.** Access is classified only over facts already present in narrator context for another legitimate reason:
- player-known campaign facts (`context.facts`);
- retrieved canon entries (`retrieval.awareness`).

No search for "everything an NPC lacks" is performed. Hidden facts are excluded upstream by visibility filtering and are never enumerated, not even under DO NOT USE. The rendering is bounded: at most 40 facts and 6,000 characters, otherwise the turn fails with `context_too_large`.

**Permission sources:**
- explicit campaign knowledge edges;
- authored canonical awareness (`known_by`, surfaced as `canonical_awareness` and `known_by_present_npcs`).

There is no public-fact policy yet, so no fact is treated as public. Access by the narrator, the player or retrieval grants **nothing** to NPCs, and neither does another NPC's knowledge.

**Narrator knowledge stays separate.** The narrator (and Nicco, whose speech remains the player's) may use every listed fact for narration, dramatic irony and hidden scene logic. That access is not collapsed into any NPC's.

**Derivation and lifetime:**
- Built inside `buildNarratorPrompt` from the same captured `TurnContext` (snapshot and revision) that `TurnCoordinator` already uses, plus that turn's retrieval result. It never reads live state later in the turn.
- A committed `/tell` changes the next turn's projection. An uncommitted one does not; provisional narration grants nothing.
- The projection is narrator-only: the controller's evidence envelope is unchanged.

Rendered form (example):

```
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_bridge_closed "The eastern bridge is closed." | R1 retrieved canon "ironbound" (content in RETRIEVED CANON)
Narration and Nicco (player): F1, R1. Nicco's speech and decisions still belong to the player.
Brenna: CAN USE F1 (knows), R1 (canonical); DO NOT USE none
Maren: CAN USE none; DO NOT USE F1, R1
Gerome: CAN USE none; DO NOT USE F1, R1
A character may voice or act on only the facts listed CAN USE for them (…). DO NOT USE is this turn's permission, not proof of ignorance: …
```

**Narrator-facing wording changed accordingly:**
- "Unknown means unestablished, not false or hidden" now applies only to *scene details*.
- "No edge means awareness is unestablished" is no longer sent.
- The knowledge rule now points at the access section.

## 4. Recent conversation authority

`RecentConversation` stores finalized exchanges exactly as before (session-local, bounded, failures excluded). What changed is how they are **presented** to the narrator: `RecentContextMode`, default `dialogue_focused`.
- **Kept:** player turns verbatim, plus quoted dialogue whose speaker is determined safely. At most 12 lines per exchange.
  - *Superseded 2026-09-29, baseline cleanup:* the original rule attributed a quote to the nearest named present character. That credited a passer-by's lines to Nicco merely because the narration mentioned him ("blinks at Nicco").
  - **Speaker sources:** an attribution clause (`"…," Maren says`, `he asks, "…"`), or the subject of the quote's own or preceding sentence in the same paragraph. A mention in object position never makes someone the speaker.
  - **Nicco** is attributed only by a clause that names him, never by a pronoun, an action beat or a continuation.
  - **Unnamed narrator-created speakers** get a neutral label from the subject's head noun (`The passer-by…` becomes `Passer-by`).
  - **Undetermined speakers:** the quote is omitted rather than guessed.
  - **Known limitation:** pronouns resolve to the paragraph's last sentence subject without a gender check.
- **Omitted from dialogue history:** narrator description, the main carrier of stale physical-state claims (equipment, position, props). The prompt says the description was omitted and that current structured state is authoritative.
- **No new memory:** no summaries, no persistence, no new memory domain.
- **Evaluated, not adopted:** `full_prose` (the Phase 1M.1 layout) and `state_last` (earlier conversation placed before the authoritative state) remain available only as evaluation options. The Phase 1N review records why.

**Known trade-offs of `dialogue_focused`:**
- A wrong fact spoken *inside NPC dialogue* is retained and can be repeated. The knowledge projection is the intended counterweight, and it is only partly effective.
- Narrator-only descriptions beyond the two-exchange current-visit replay are not supplied; structured state covers durable objects.

P12.1 (2026-10-06) adds a separate `[RECENT SCENE NARRATION]` block: original complete starred narration from the last two finalized exchanges in the contiguous current-location visit, limited to 2,000 characters after identity masking. A different/missing location stops replay, including on later return. NPC speech and player actions stay in dialogue history. Current structured state overrides this continuity prose; no new memory or mutation authority. The block is fixed context under knowledge compaction. [Implementation and limits](../../P12_1_BOUNDED_RECENT_SCENE_NARRATION.md).

Historical playthrough windows remain an evaluation-only helper and are never used in production turns.

## 5. Evidence (Phase 1O: hybrid in production)

*Updated in Phase 1P.* The Phase 1N text above this section described grammar-only production authorization and shadow-only controller evidence. That is superseded.

- **Production default: `evidence_authorization: "hybrid"`.** Confirmation may come from the TurnEvidence grammar **or** from a verified controller evidence quote (same controller response; see [EVIDENCE_AUTHORIZATION.md](EVIDENCE_AUTHORIZATION.md)).
- **A quote is necessary, never sufficient.** It is verified deterministically: exact substring, act-level subject/verb/content checks, hedge and negation vetoes. It only fills a missing confirmation.
- **Deterministic checks remain authoritative:** intent match, reference validity, current-state validity, refusal/retraction veto, atomic offered groups and the provenance guard. The controller has no semantic veto and cannot widen intent.
- **Quoted `/tell` policy (Phase 1O):**
  - Generic quoted speech is never evidence.
  - Nicco's own quoted statement counts only when all of these hold: it realizes an already-resolved explicit `/tell`; it contains the exact fact content; it is attributed to Nicco by a speech verb or the action-beat convention; it contains no hedge or question.
- `"shadow"` mode remains for evaluation only.

## 6. Ephemeral scene participants and ordinary awareness (Phase 1P)

**Invariant:** every character who may speak or act in the scene has a narrator-facing knowledge scope. Persistent and ephemeral characters derive it differently.

**Ephemeral scene participants** (`src/turn/scene-participants.ts`) are session-local people who are in the scene but are not CampaignState characters: a passer-by, a street merchant, an unnamed guard.
- **Storage:** held by the coordinator beside `RecentConversation`. Never persisted, saved or promoted, and never a durable mutation. The controller never decides who exists.
- **Identity:** `scene_npc_<n>` from a per-session counter that is never reused. The narrator sees `P<n> - <Role>`, never the ID.
- **Creation:** only from resolved player input. An interaction verb plus an indefinite role phrase creates one participant (`stops an ordinary passer-by`). A definite phrase (`the guard`) addresses an existing participant, or creates one if none matches. At most one creation per turn. No name, occupation, faction or history is invented.
- **Addressing:** a definite reference to the role or the established descriptor noun. Or, when no other participant is referenced and no persistent character is named, direct speech or second person continues the current conversation partner. A vague departure beat does not silently replace the partner with a new person.
- **Expiry:**
  - scene (location) change;
  - a narrated departure followed by a turn that does not address them;
  - `INACTIVE_EXPIRY_TURNS` (2) consecutive turns without being addressed.
- **Capacity:** `MAX_SCENE_PARTICIPANTS` (4). On overflow, the least recently addressed participant that is not addressed this turn is evicted (ties broken by lowest ID). If none can be evicted, nobody is created.
- **Continuity metadata:** only a narrated appositive right after the role is captured (`The passer-by, a middle-aged woman, …` gives `middle-aged woman`), and the first capture wins. Otherwise only the role is kept. No LLM extraction.
- **Standing:**
  - Generic local roles (passer-by, citizen, customer, merchant, waiter, laborer, guard, a man or woman) are `ordinary_local`.
  - Traveler, foreigner and newcomer roles, or an input or appositive marked foreign, visiting or newly arrived, are `foreign`.
  - Stranger and slave roles are `unknown`.
  - Only `ordinary_local` receives `local:` scope.
- **Prompt:** a compact `[SCENE PARTICIPANTS]` block, plus an access row per participant in `[CHARACTER KNOWLEDGE ACCESS]`.

**Ordinary awareness** (authored `knowledge.awareness`: `public`, `local:<location>`, `specialized` or `private`) is an additional permission source. It applies only to retrieved canon.
- **Ephemeral participants:**
  - `public`: granted.
  - `local:X`: granted when the standing is `ordinary_local` and X is in the captured scene ancestry.
  - Anything else: denied.
  - Campaign facts: never. They are private to their explicit edges.
- **Persistent NPCs:** explicit edges and `known_by`/canonical awareness remain authoritative and unchanged. `public` also applies. `local:X` applies only when the NPC's authored home location lies within X, because presence alone is not residency.
- **Retrieval is not knowledge.** Retrieval returns canon to the narrator. Whether an NPC may use it is decided by that NPC's scope, never by the retrieval itself.

**Narrator policy additions (system prompt):**
- Knowing a place is not knowing a route: at most its established district or area, never invented streets, turns, gates or landmarks.
- Use canon institution names, and never invent institutions.
- DO NOT USE covers hints, rumors, "everyone says" talk and claims that imply the fact.
- Never assert what Nicco knows, realizes, remembers, decides, suspects, understands or intends unless the player or state established it; narrate what he is told, hears or sees.

**Player retrieval de-duplication:** when `[NICCO / PLAYER PROFILE]` is present, Nicco's own entity record is dropped from retrieval candidates. Chunks, which carry query-specific canon, are kept.

**Out of scope:** overhearing, belief revision, promotion of participants to CampaignState, player knowledge acquisition from what NPCs tell him, and NPC-private long-term recall.

## 7. Canon boundaries (Phase 1Q)

**Canon-bearing claims** are named or specific institutions, places, organizations, landmarks, routes, laws, schedules and times, history, religion, guilds, public rumors and population-wide or common-knowledge claims.
- The narrator may state one only when supplied canon, current state or the player's own action establishes it.
- When canon is silent, characters answer naturally with uncertainty ("I don't know", "never heard of one", "ask someone at the market"), never with an invented replacement.
- Rumors are canon-bearing even when vague ("people say", "some say", "there are rumors").

**Free improvisation:** gestures, tone, emotions, clothing of unnamed temporary people, transient ambience and disposable props.

**Enforcement is prompt policy** (`[CANON BOUNDARIES]` in the narrator system prompt) plus a **dev/eval-only** grounding manifest (`src/dev/lore-grounding.ts`) that never blocks, edits or patches narration, canon or state. A phrase is grounded when it occurs in this turn's supplied prompt; the recent-conversation replay is excluded, so an earlier invention cannot ground itself. A phrase found elsewhere in canon is reported as "canon, not supplied", never as an invention.

**No meta language:** narration must not expose rules, permissions, knowledge access, state or system reasoning.

**Replay labels:** a quote from an unnamed speaker whose noun uniquely matches a participant that already existed at that exchange is replayed under the participant's stable label (`P1 Passer-by`). Otherwise the generic label is kept.

## 8. Retrieval recall and grounded history (Phase 1R)

**Engine (`src/retrieval/lexical-index.ts`):**
- **Plural folding** (`stem`): auctions→auction, pens→pen, cities→city, applied identically to the index and the query. There is no derivational stemming: slave ≠ slavery, mage ≠ magic.
- **Query-side stopwords:** function words and conversational filler never score. If a query is only stopwords, all its tokens are used.

**Turn policy (`src/turn/retrieval-policy.ts`):**
- **Query cleaning:** participant introductions ("stops an ordinary passer-by") and roleplay asterisks are removed from the query.
- **Intent:** route > schedule > history > location > lore. Questions about the listener stay unclassified. Intent triggers retrieval and adds a generic `[QUESTION FOCUS]` line. It never supplies an answer.
- **Entity mentions:**
  - *explicit:* a name, alias or display name appears as a token run (single-word names only when capitalized);
  - *near:* a multi-word name or alias with the entity's own ancestor names stripped, using its last two tokens and a tiny head-noun equivalence (market ≈ auction ≈ sale). It is blocked when the query explicitly names a location outside the entity's ancestry;
  - *deictic:* "this tower" is resolved against the scene location, its ancestors and its connections, preferring the container.
- **Candidate protection:** mentioned entities are ranked first, and are fetched if the lexical pool missed them.
- **Locality:** a tiebreak only, among placed locations scoring within 85% of their group's top. It never beats an explicit name and never filters.
- **Scope:** retrieval still grants no NPC knowledge.

**History policy:** past-tense persistent world claims are canon-bearing: emptiness duration, owners, builders, residents, founding, a parent's memories.
- A speaker may share personal experience ("I've never been inside"), never persistent history ("empty since I was a child").
- Being local permits using supplied local canon, not creating history.
- Fixed public fixtures (a bench, trough, fountain, statue or pavilion) are canon-bearing; small transient props are free.

## 9. Natural player action resolution (Phase 1S)

`src/turn/natural-actions.ts` resolves player-authored actions into the same intents that commands produce.

- **Action vs speech:** only `*asterisk*` text is action. Everything else is Nicco's speech, and speech never changes state ("I'm barefoot", "I'm at the market", "I gave her the boots yesterday").
- **Clauses:** an action segment is split into ordered clauses.
  - A clause is Nicco's action only when it has no other subject.
  - Hedged, negated, modal, future or past-reference clauses resolve nothing: almost, pretends, reaches for, wants to, yesterday.
- **Player-controlled effects** become runtime commands:
  - **Movement:** allowed through an established connection only. A container such as Heartstone is entered through its connected descendant.
  - **Removing a worn item:** "takes off / removes / pulls off X". "Takes out X" counts only when X is worn and the same segment then offers it away.
- **Outcome-dependent effects** stay controller candidates that need narration evidence and authorization: giving to a present persistent character.
- **Ordered compound actions:** for example, removal, then transfer. Both are committed in order in one preparation at finalization.
- **Blocked movement:** a known destination with no connection is reported as blocked. The narrator is told Nicco has not arrived; there is no teleport. Unknown destinations are unresolved.
- **Transactional approach:**
  - Runtime commands are prepared from the base revision *before* narration.
  - The uncommitted receipt's detached snapshot is the projected state that the narrator, controller, TurnEvidence and authorization see.
  - Durable state changes only at finalization, when runtime and authorized commands are prepared together from the base revision and committed once.
  - A failed or cancelled turn commits nothing, and the revision advances at most once.
- **Durable interaction with temporary participants:** unsupported for now (option C). An offer to a temporary participant is recorded as `unsupported_durable_recipient`, and the narrator is told they may decline, hesitate or leave it unresolved but must not take it. Promotion (option A) is the recommended future mechanism; see the Phase 1S review.
- **Participants:**
  - interaction verbs carry explicit morphology (stop/stops/stopped/stopping, …);
  - player-authored NPC-subject setups ("a guard stops him") create participants;
  - narration never creates participants;
  - a generic guard's affiliation is unestablished.
- **Diagnostics:** `TurnResult.action_resolution` lists resolved, blocked and unresolved actions, destination and item resolution, pre-narration runtime effects, outcome-dependent candidates and narrator notes.
