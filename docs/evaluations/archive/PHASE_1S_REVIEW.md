# Phase 1S review: natural player action resolution and scene-transition authority (2026-09-29)

**Reviewer:** Claude (implementation agent). Live classifications are agent-authored and **pending human review**.

**Unchanged:**
- Kimi (`moonshotai/kimi-k2.5`) and DeepSeek (`deepseek/deepseek-v4-flash-0731:nitro`);
- hybrid evidence authorization, CampaignState authority and commands, retrieval, canon-boundary rules, NarrativeKnowledgeAccess and persistence.

**Not added:** an LLM call. No travel connection to the slave market was added.

## A. Natural action resolver

`src/turn/natural-actions.ts` (`resolveNaturalActions`) is invoked by `playerIntent` when no command grammar matches. It turns player-authored action text into the **same intents** commands produce:
- runtime commands for player-controlled effects;
- controller candidates for outcome-dependent ones.

**Pipeline:** `*asterisk*` action segments → ordered clauses (split on commas, "and", "then", "when" and similar) → recognizers for movement, worn-item removal, offer/give, and intention (no effect).
- A clause is Nicco's action only when it has no other subject.
- Hedged, negated, modal, future or past-reference clauses resolve nothing: almost, pretends, reaches for, wants to, considers, will, would, could, never, yesterday.

**Scope:** slash commands and the "I go / I tell / I give" grammar are unchanged and still take precedence; they remain dev shortcuts. The narrator never gains authority: narrated actions without player intent still cannot mutate state (Phase 1O authorization unchanged).

## B. Player action vs dialogue

Only asterisk text is action. Unmarked or quoted text is Nicco's speech, and speech never changes state. Tested for:
- "I'm barefoot.";
- "I'm at the market";
- "I gave her my boots yesterday";
- "I already gave her the boots";
- "I want to go to the market";
- "Is the market nearby?"

**TEST 1B hard regression:** "*He wears his leather boots…* …right now i'm not [wearing boots]" leaves the boots worn. The explicit action "wears his leather boots" agrees with state, and the spoken contradiction is ignored.

## C. Movement resolution

- **Recognized form:** movement verb + (back) to / towards / into / inside / through + destination, with trailing context cut ("looking for…", "nearby…"). Examples: strolls to, walks to, goes back inside, heads to.
- **Destination resolution** (`resolveDestination`):
  1. Explicit or near canon names via the Phase 1R `entityMentions`: "the slave market", "the living floor" (ancestor-qualifier stripping gives `heartstone_lr`).
  2. Otherwise, a head noun unique among locations, aliases and feature names within the scene's city: "the pens" → `calderan_slave_market` (alias "Calderan slave pens", feature "slave pens").
- **Validation:**
  - An established connection from the current location resolves to a runtime move.
  - A container is entered through its unique connected descendant: "inside Heartstone" → `heartstone_lr`.
  - Already here gives no effect.
  - A known destination without a connection is **blocked**: no runtime move, and the narrator is told "he has not arrived and is still at … Do not describe him at …".
  - An unknown destination is unresolved.
- **Tested:** "Where is…", "I want to visit…", "Is it far?", "*wants to go…*" and "*thinks about walking…*" never move Nicco.
- **Limitation exposed as the brief required:** `heartstone_square → calderan_slave_market` has no connection, so the attempt is detected and reported as `blocked` (`no_travel_connection`), never teleported.

## D. Equipment removal

- **Recognized forms:** takes off / takes X off / pulls off / slips off / kicks off / removes / doffs, applied to an item Nicco is **actually wearing** (owner Nicco, equipped by Nicco, unique head-noun match).
- **Resolution:** `place_item` → carried by Nicco. This uses the existing item-placement model; `/equip` is not required.
- **"Takes out X":** conservative. It resolves as removal only when X is worn **and** a later clause in the same segment offers it away ("it", "them" or the same noun). A bare "*he takes out his boots*" stays unresolved (`take_out_without_offer`).
- **Not removal (tested):** "almost takes off", "reaches for" and "pretends to remove".
- **Narrator line:** "Nicco has taken off … (player action, already applied): he now carries it and no longer wears it."

## E. Compound actions

- Clauses resolve in order within a segment, with pronoun carry-over ("takes out his boots and gift **it**…").
- "*he takes off his boots and gives them to Brenna*" resolves to runtime `place_item` (carried by Nicco) followed by candidate `transfer_item` → Brenna.
- In the coordinator test, narrated acceptance authorizes the transfer. The final commit is `[removal, transfer]` in one preparation, and the boots end up carried by Brenna. Nothing is flattened into contradictory simultaneous state.

## F. Pre/post-narration state handling (adopted transactional approach)

- **Before narration:** runtime commands are prepared from the base revision (the existing runtime-intent validation). The **uncommitted receipt's detached snapshot** is the projected state.
- **What sees the projection:** the narrator context (equipment and scene), the controller evidence, TurnEvidence and authorization all use it. After "takes out his boots", the narrator therefore sees the boots `carried`, not worn.
- **Finalization:** runtime and authorized outcome commands are prepared together from the base revision and committed once. The revision advances at most once.
- **Failures:** a failed or cancelled turn commits nothing (tested: narrator failure after a prepared removal leaves the snapshot identical).
- **Player-controlled vs outcome-dependent:** player-controlled effects (removal, connected movement) commit on finalization without controller involvement, like `/go`. Outcome-dependent effects (acceptance) still require narration evidence and authorization.
- **Participants follow the scene:** if a resolved move changes location, the participant plan is recomputed for the new scene.

## G. Ephemeral participant grammar

- **Interaction verbs** now carry explicit morphology (base, -s, -ed/irregular past and -ing forms, with particles): stop/stops/stopped/stopping; approach…approaching; address…addressing; turn(ing) (back) to; speak(ing)/spoke to; greet, hail, ask, talk to, call (out) to, wave at/to, tap, nudge, flag down, walk/go up to, point at, look at, face, follow, catch.
- **Arbitrary verbs never create participants** (tested: "kicks a passer-by", "admires a guard").
- `*stopping a passerby*` creates exactly one participant (tested, and live).

## H. NPC-subject participant creation

- **Player-authored setups** such as "*a guard stops him*", "*a merchant calls out to him*" or "*a passer-by bumps into him*" create a participant (tested).
- **Narration never creates participants** (tested: committing narration "A guard stops him…" creates nobody).
- **Retrieval:** NPC-subject phrases are also stripped from retrieval queries.
- **Guard affiliation:** a generic guard is rendered "Affiliation unestablished (a generic guard, not by default a member of any canonical body)". There is no silent City Guard upgrade.

## I. Durable interaction with ephemeral NPCs (design decision)

| | A. Promote to a minimal persistent character on a durable relation | B. External ownership sink with provenance | C. Refuse durable transfers until promotion exists |
|---|---|---|---|
| Save/load | Natural: a `campaign_character_*` record with the captured descriptor | Needs a new sink domain in the snapshot | Nothing new |
| Later retrieval of the item | Possible: the item has a real owner and location | Item is effectively gone; recovery would need special rules | Item never leaves |
| Meeting the same person again | Possible: the promoted character can reappear | Impossible to link the sink to a person | Not applicable |
| Inventory truth | Exact | Exact for Nicco, opaque beyond | Exact |
| Unbounded character growth | Bounded by player-authored durable acts only (no promotion from chatter) | None | None |
| Item provenance | Full (`transfer_item` provenance to a real character) | Partial (who, when; no identity) | Not applicable |

**Recommendation: A**, promotion on the first *authorized* durable relation (accepted item, told fact). It is gated by the same evidence authorization. It is bounded because only player-initiated, accepted interactions promote. The identity comes from the participant's captured role and descriptor. B turns items into dead ends and cannot support "meeting them again". C is only a stopgap.

**Implemented now: C**, because promotion needs a new command, identity rules and descriptor persistence, which is too large for this phase.
- An offer to a temporary participant is recorded as `unsupported_durable_recipient` and no transfer candidate is created, so state cannot change.
- The narrator is told: "A temporary person cannot keep items: they may decline, hesitate or leave the offer unresolved, but must not take or keep … it stays Nicco's."
- This is the §17 invariant: fiction must not complete what state cannot represent.

## J. Test 1 (live rerun, exact inputs)

Export: `.build/smoke/phase1s-smoke-2026-09-29T0206.json`, with full prompts, state, items, participants, action resolution, retrieval, access, proposals and authorization.

**Turn 1:** `*He wears his leather boots and takes a couple of steps in the square, stopping a passerby* Do you like my sandals?`
> The passerby pauses, glancing down at Nicco's feet with a slight furrow of confusion. "Sandals?" They look again at the worn leather boots, then back up to Nicco's face with the polite hesitance of someone uncertain whether they're missing a joke. "You're wearing boots, friend. Good practical ones, by the look of them." Their tone stays mild, perhaps a touch wary—strangers who initiate conversation with obvious fabrications sometimes want something.
>
> A few other figures move through the open square behind them, ordinary city folk giving the Heartstone entrance its usual berth, though none approach close enough to overhear.

- **Participant:** P1 Passer-by created (`scene_npc_1`, ordinary local); it did not exist in the Phase 1R run.
- **Actions:** none, since "wears his boots" agrees with state.
- **Boots vs sandals:** the boots were respected and "sandals" was corrected.
- **State:** proposals none; revision 2 → 2.
- **Replay:** `P1 Passer-by:` ×2.

**Turn 2:** `*he takes out his boots and gift it to the passerby* Take them, you need them more than me`
> Nicco pulls off his boots—one, then the other—and holds them out toward the passer-by, leather soles still warm from his own weight. The man glances down at the offered pair, then back at Nicco's now-bare feet against the packed earth of the square. He shakes his head slowly, not reaching to take them. "That's generous, friend, but I couldn't. You need something on your feet same as anyone." He gives a small, uncertain smile and takes half a step back, hands staying at his sides. "Besides, I've got my own boots at home. Worn, but holding together."
>
> The boots remain in Nicco's hands, unclaimed.

- **Action resolution:** `equipment_removal: resolved` (take_out_then_offer) → runtime `place_item` carried by Nicco. Then `offer: unsupported_durable_recipient` (P1).
- **Narrator context:** showed the boots `carried`, plus both action lines.
- **Same partner:** P1 was addressed ("the passerby") and remained the focus.
- **Controller:** proposed nothing.
- **State:** the only authorized command is the player-controlled removal. Revision 2 → 3; the boots are owned by Nicco and **carried**.
- **Story vs state: agree.** Bare feet, boots in hand, and a declined gift. In Phase 1R the story was barefoot while state said worn.
- **Nothing invented:** no invented item; no player action beyond the input ("pulls off his boots… holds them out" realizes the supplied action).
- **Replay label drift:** turn 2 is replayed as `Man:`, not `P1 Passer-by`. The narration calls him "the man", and no descriptor was captured (see O).

## K. Test 1B (live rerun)

`*He wears his leather boots and takes a couple of steps in the square, stopping a passerby* It's so painful to walk barefoot, do you think i should wear boots, because right now i'm not`
> Nicco stood in leather boots on the cobblestones outside Heartstone's heavy wooden entrance. The man he'd stopped—unremarkable, dressed in rough-spun cloth, his face weathered from ordinary labor—glanced down at Nicco's feet with visible confusion.
>
> "You *are* wearing boots," he said, stepping back half a pace. His eyes flicked to the tower behind Nicco, then away, as if uncertain whether this was some test or jest. "Good leather ones, by the look. If they pinch, that's a cobbler's matter, not—" He gestured vaguely at the square, where other pedestrians flowed around them without slowing. "Not mine."

- **Source followed:** state and the explicit action. The spoken claim is corrected in-world.
- **No invented reconciliation:** no removal, sandals or bare feet.
- **Resolution:** no actions resolved; P1 created.
- **State:** unchanged (revision 2 → 2; boots worn).
- **Replay omission:** the next-turn replay is empty. The quote opens a new paragraph with "he", and pronouns do not resolve across paragraphs, so it was safely omitted rather than misattributed (see O).
- **Minor:** ground surface is "cobblestones" here and "packed earth" in Test 1 (separate campaigns; the square's surface is unestablished).

## L. Test 2 (live rerun)

`*He strolls to the pens looking for a slave to purchase, when a guard stops him nearby the pens* Problems?`
> A guard steps into Nicco's path near Heartstone's heavy wooden entrance, one hand resting on his belt. "Hold there. The tower's been vacant near as long as I've worked this beat. You looking to go inside, or you just lost?"

- **State location:** `heartstone_square` before and after. The narration keeps Nicco at Heartstone's entrance, not at the pens. **Converged.** In Phase 1R the narration placed him at the pens.
- **Movement:** `movement: blocked` (destination `calderan_slave_market`, reason `no_travel_connection`), with no runtime move. The narrator note says he has not arrived.
- **Retrieval:**
  - Cleaned query: "He strolls to the pens looking for a slave to purchase, when nearby the pens Problems?" (the NPC-subject phrase is stripped).
  - Top-1 is `calderan_slave_market`, followed by `sandspear` and `main_city_structure`.
- **Guard:** P1 Guard was created from the player-authored subject setup (ordinary local; affiliation unestablished). Access row: `CAN USE R1 (local:calderan), R3 (local:calderan); DO NOT USE F1, F2, R2`.
- **Guard behavior:** no City Guard upgrade. No invented procedures, chits, clerks or fees. No route or travel details.
- **Invented canon:** yes, **one history claim:** "The tower's been vacant near as long as I've worked this beat". This is canon-bearing history (Phase 1R policy), and the review-only detector missed this phrasing.
- **Purchase:** `intention: no_state_effect` ("looking for a slave to purchase"); no proposal, and revision 1 → 1.
- **Replay:** `P1 Guard:`.

## M. State/story convergence

**Invariants §21 and §22 held in all 4 live turns:**
- no narration location ≠ runtime location from a player movement attempt (Test 2 blocked, and the narration stayed at the square);
- no "item removed" narration while state says equipped (Test 1 turn 2: state carried, narration barefoot with boots in hand);
- no "item removed" narration when no removal was authored (Test 1B).

Offline tests cover:
- resolved movement, where the narrator already sees the destination scene and the location commits;
- blocked movement;
- removal;
- compound removal plus gift;
- atomic failure.

## N. State safety

**Live:** 4 turns and 1 durable mutation: the explicit player removal in Test 1 turn 2, committed at finalization as a player-controlled runtime effect. Zero controller proposals; false durable mutation 0.

**Mutation sources:**
- **Player-controlled** (runtime, from explicit player action): connected movement, removal of worn items.
- **Controller-authorized** (outcome): unchanged Phase 1O authorization.
- **Speech, hedged actions and narrator-invented actions:** never.

## O. Remaining limitations

1. **The action grammar is narrow by design:** asterisk-only, a fixed verb set and single-item head-noun matching. Unmarked third-person prose ("He walks to the market.") is treated as speech. Wear/put-on, drop, pick up and multi-item removal are not recognized.
2. **Durable transfers to temporary participants are unsupported (option C).** Promotion (option A) is the recommended next mechanism.
3. **Slave-market travel is still unresolved** (no connection). Attempts are detected and blocked; a coarse city-travel model is a follow-up decision.
4. **Invented history persists occasionally** (the guard's "vacant… as long as I've worked this beat"). The detector's history patterns miss this phrasing.
5. **Replay and label gaps:**
   - labels still drift when the narrator switches nouns ("passerby" → "the man") and no descriptor was captured;
   - pronoun-led quotes at a paragraph start are omitted (safe, but lost).
6. **The movement note** is a narrator instruction; Kimi complied 1/1 live. There is no deterministic check that narration avoids the destination.
7. **Small live sample** (4 turns); the offline tests are the main evidence.

## P. Status

**Deterministic behavior (offline):** the resolver distinguishes player actions from speech and hedges; it resolves the exact smoke inputs correctly; it applies player-controlled effects transactionally before narration and commits them only at finalization; it blocks unconnected movement instead of teleporting; and it keeps offers to temporary people non-durable.

**Live:** all three reruns converged state and story, with 0 false mutations. The remaining issues (occasional invented history, replay-label drift) are outside action resolution.

NATURAL ACTION RESOLUTION HARDENED

---

### Artifacts
- `.build/smoke/phase1s-smoke-2026-09-29T0206.json`: live reruns (dev build folder; raw data including prompts and state).
- Code:
  - `src/turn/natural-actions.ts`;
  - `src/turn/player-intent.ts` (natural fallback, participants);
  - `src/turn/turn-coordinator.ts` (detached projection, participant re-plan on a move, `action_resolution`);
  - `src/turn/scene-participants.ts` (verb morphology, NPC-subject setups, guard affiliation note);
  - `src/turn/prompt-builder.ts` (removal line, resolver notes);
  - `src/turn/turn-types.ts`.
- Docs: [NARRATIVE_AUTHORITY.md](../../architecture/NARRATIVE_AUTHORITY.md) §9.
- Tests: `tests/natural-actions.test.ts` (9). Offline: `npm test` **723/723**, `npm run test:playthrough` **25/25**, `npm run typecheck` pass (network disabled, API keys cleared).
