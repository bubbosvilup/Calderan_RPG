# Next context boundary review (CTX)

Date: 2026-10-13. Base: main `7e5e4ea` plus the uncommitted docs-only audit reconciliation. Scope: every open CONTEXT row of the [Master debt register](../MASTER_DEBT_REGISTER.md) ("Current residual debt", CONTEXT row, and section 9), the related PIPE-4, PIPE-9, PIPE-10, PIPE-11, ID-6 / I8, ID-7 / I3 and PRV-2 rows, and the code behind them. The register has no PRV or RET rows about context privacy; PRV-1 and PRV-2 are cited only where the envelope size touches them.

Method: static reading of `src/` and `tests/` only. Nothing was built, run or sent to a provider. Every "reproducible example" below is a concrete input plus the code path it takes; each one is marked **static, not executed**. Numbers that depend on runtime sizes are marked *inferred*. Secret canon is referred to by key and file only.

Nothing here is implemented. Every fix is a recommendation for the user to approve or reject.

## 0. Summary

| # | Issue | Register rows | Verdict on current code | Proposed severity |
| --- | --- | --- | --- | --- |
| 1 | Internal IDs reach Narrator context | CTX-1, ID-7, CTX-7 (part) | CONFIRMED, and the register's unreproduced "prefix" risk is real on the current dataset: the NPC id `dren` is masked inside the word "children" | P2 (unchanged) |
| 2 | Output-side leak detection | CTX-2 residual | CONFIRMED open, and wider than the register says: the speech-scoped knowledge checks of the audit only read quoted speech, while the production format writes speech without quotation marks | P2, with the RPG-speech gap proposed as a new row (P2) |
| 3 | Controller envelope budgeting | CTX-3, PRV-2 (related) | CONFIRMED; two corrections: facts are capped at 32 (not "every fact"), and the envelope is JSON-encoded twice | P2 (unchanged) |
| 4 | Follow-up retrieval with an unnamed entity | CTX-4 | CONFIRMED | P2 (unchanged) |
| 5 | Retrieval headroom | PIPE-9, PIPE-4, PIPE-10 | CONFIRMED; the same gap also exists for the audit revision request | P2 (unchanged) |
| 6 | Knowledge visibility | ID-6, new | CONFIRMED; two new latent findings (the Narrator and the UI use different "name is known" rules for canonical NPCs; `P<n>` refs collide in one prompt block) | P3 |
| 7 | Secret visibility | CTX-2 (prompt side), new | CONFIRMED by design for the Narrator; narrator-only NPC prose also reaches the Controller provider; secret location names can reach the revision prompt | P2 for the Controller exposure (decision needed), P3 otherwise |
| 8 | NarrativeContext vs ControllerContext separation | CTX-5, CTX-7, CTX-3 | CONFIRMED: one `TurnContext` serves both; the Controller copy is a deny-list; the Narrator gate is a side-channel that fails open when lost | P2 as the shared seam of 1 and 3 |

Split recommendation (section 9): keep three work packages but reshape them to the code's real seams. **CTX-A Narrator privacy** in two steps (A1 input projection and ID masking, A2 deterministic output guard), **CTX-B Context budgets** (the Controller view and cap plus the Narrator's retrieval and revision headroom, because both are budget accounting in the same modules), **CTX-C Retrieval quality** (follow-up retrieval, degrade-not-fail, trigger index). CTX-5 and CTX-6 stay deferred architecture; CTX-7 moves into A1.

## 1. Internal IDs reaching Narrator context (CTX-1, ID-7, CTX-7 part)

### CURRENT BEHAVIOR

The Narrator prompt is built by `buildNarratorPrompt` (`src/turn/context/prompt-builder.ts:179-253`). A final string pass, `mask`, is applied to almost every message section (`:247`, `:251`) and to the knowledge block (`:240`). It is not applied to the system prompt (`:250`), which carries the controlled partner and self-disclosure blocks on purpose.

`mask` comes from the identity gate registered in `registerNarratorIdentities` (`src/turn/identity/narrator-identity.ts:27-60`):

- Every canonical character with role `npc`, present or not, gets an opaque ref `NPC<index>` by sorted id order (`:31-37`).
- Unknown names and display names, and every alias, are replaced by an observable label or the known name, with a boundary-aware, case-insensitive pattern (`:39-45`).
- Canonical NPC ids are replaced by their `NPC<n>` ref with a pattern that has **no boundary at all** (`:47-48`, `new RegExp(ids.map(escapeRegExp).join("|"), "g")`). The comment at `:46` says this is deliberate, to also mask ids embedded in chunk ids and handles (`<npc_id>_history` becomes `NPC<n>_history`).

What still reaches the Narrator unmasked (each is a machine identifier, not a name):

| Identifier | Where it is rendered |
| --- | --- |
| Created (campaign) character ids `campaign_character_r<rev>_<slug>` and `nicco` | `Character <label> (<id>): {...}` (`prompt-builder.ts:227`); NPC+ lines `NPC+ <name> (<id>)` (`npc-plus.ts:180`); fallback `c.profile.name ?? c.id` (`prompt-builder.ts:138`, `narrative-authority.ts:77,95`) |
| Campaign fact ids | knowledge block `F1 <fact id> "<text>"` (`narrative-authority.ts:118`); compact table `<source>:<id>` (`narrator-pack.ts:61`) |
| Canonical entity and chunk ids, provenance, tags | `retrieved canon "<id>"` (`narrative-authority.ts:64`); the whole retrieval JSON with `entity_id`, `chunk_id`, `provenance.dataset_id`, `tags` (`prompt-builder.ts:251`, `retrieval/projections.ts:20-45`); `canonical_awareness` id lists in each Character line (`prompt-builder.ts:230`) |
| Handles | `Recovered for <name> [npcmem:<character id>:<kind>:<id>]` (`npc-plus.ts:118,130,134,212`) |
| Location ids | `Explicit player request: go to <location id>` (`prompt-builder.ts:198`) |
| Household ids | `H<n> household ...` text uses `h.name ?? h.id` (`context-builder.ts:153`) |

The protection against the Narrator echoing any of these is one prompt rule, `NARRATOR_OPAQUE_REFS` (`prompt-builder.ts:23`). There is no output scan (issue 2).

The gate is stored in a `WeakMap` keyed by the context object (`narrator-identity.ts:25`, accessor `:61`). Every consumer falls back to "no masking" when the lookup misses: `identityGate?.mask(text) ?? text` (`prompt-builder.ts:180`).

ID-7 (fragments): masking replaces full names, display names and listed aliases only. A heuristic count over `data/` (static script, keys only) found 40 canonical NPCs with multi-word names, of which 17 have their first or last name used on its own somewhere in authored data outside the full name and not listed as an alias. Those standalone uses are not masked. *Inferred* (the script does not know which texts reach a given prompt).

### RISK

- **Corruption of ordinary words.** Any canonical NPC id that is a substring of an ordinary lowercase word rewrites that word in every masked section: current scene prose, retrieved canon, recent narration, the player's own action text and, in a revision, the Narrator's own draft. The Narrator then sees, and may repeat, a token such as `chilNPC12`.
- **Echoed machine ids.** Created-character ids, fact ids, handles and location ids are rendered as plain text next to prose. Only the prompt rule keeps them out of the delivered narration.
- **Fail-open masking.** If a code path passes a cloned or rebuilt context, `narratorIdentityGate` returns `undefined` and every unknown canonical name and id goes through unmasked, with no error (`prompt-builder.ts:180`).
- **Token cost.** Provenance, tags and id lists are paid in every request and carry no narrative value.

### REPRODUCIBLE EXAMPLE (static, not executed)

1. On the current dataset the canonical NPC ids sorted by `compareIds` (`world/provenance.ts:32`, `world-store.ts:35`) put `dren` (`data/characters/calderan/west/criminal/dren.yaml`) at position 12, so its ref is `NPC12`. It is the shortest NPC id (4 letters).
2. The lowercase string `dren` occurs 34 times inside other words across `data/` (static count; for example in "children"). The location `saint_orra_house` (`data/locations/calderan/west/civic/saint_orra_house.yaml:15`, `content` field) contains "children" three times.
3. Put Nicco at `saint_orra_house`. `buildSceneStateProjection` renders the location `about` from `place.content` (`scene-state-projection.ts:222`). `knowledgePrefix = mask(...)` (`prompt-builder.ts:247`) applies the id pattern (`narrator-identity.ts:50`) and every "children" in that prose becomes `chilNPC12`.
4. The same happens to a player action such as "I ask the sister how many children live here." (`[PLAYER ACTION]` is masked at `prompt-builder.ts:251`), and to the draft when an audit revision is requested (`stages/audit.ts:103` masks every message, including the assistant draft).
5. Nothing scans the delivered text for `NPC\d+`. The only id scrubber in the code, `\b(?:campaign_[a-z0-9_]+|NPC\d+)\b` in the UI character projection (`app/player-character-view.ts:166`), is not applied to narration, and its leading `\b` would not match `chilNPC12` anyway.

Second example (created id): a materialized person "the girl" gets `campaign_character_r<rev>_girl` (`campaign/materialization.ts:33`) and appears as `Character the girl (campaign_character_r12_girl): {...}` in the Narrator prompt (`prompt-builder.ts:227`), unmasked because only canonical NPC ids are in the id map.

### AFFECTED MODULES

`src/turn/identity/narrator-identity.ts`, `src/turn/context/prompt-builder.ts`, `src/turn/context/narrative-authority.ts`, `src/turn/context/narrator-pack.ts`, `src/turn/context/npc-plus.ts`, `src/turn/context/narrator-focus.ts` (`references` deliberately substitutes background names with internal ids, `:68-71`), `src/turn/context/retrieval-policy.ts` (payload shape), `src/turn/stages/audit.ts` (revision masking).

### RECOMMENDED FIX

1. Make the id pattern boundary-aware in the same way as the name pattern, treating `_` as part of an id token so that embedded handles (`dren_history`, `npcmem:dren:`) are still replaced but ordinary words are not: `(?<![\p{L}\p{N}])id(?=$|[^\p{L}\p{N}])` with `_` and `:` handled as separators. Small change, highest value.
2. Give every identifier the Narrator sees a session-scoped opaque ref, not only canonical NPCs: created characters, Nicco's own record, facts (the `F<n>` ref already exists; drop the raw id beside it), households, retrieval records (keep a short ref, drop `provenance`, `tags` and raw ids from the rendered retrieval JSON), handles (`[npcmem:...]` becomes a ref), and location ids in action lines (use the display name, the Scene State Projection already does).
3. Make the gate an explicit field of a Narrator view object instead of a `WeakMap` side channel, and make the prompt builder fail closed (throw `context_invalid`) when the gate is missing. This is CTX-7.
4. Extend masking to name fragments that are unambiguous within the cast (ID-7), or, more simply, list authored short forms as aliases in data. The second needs an authoring pass and is a product choice.

### TESTS REQUIRED

- Unit, `narrator-identity`: a canonical id that is a substring of an ordinary word ("children" with id `dren`) leaves the word unchanged; `dren`, `dren_history` and `npcmem:dren:canon:x` are still replaced.
- Prompt contract: for a fixture with one created character, one fact, one household, one retrieved chunk and one NPC+ handle, the rendered Narrator request (all messages) contains no `campaign_`, `scene_npc_`, `npcmem:`, raw fact id, raw chunk id or dataset id. Extend `tests/context/scene-projection-silence.test.ts` (its contract test at `:283` already checks "no ids" for the cleanup path).
- Fail closed: building a Narrator prompt from a context without a registered gate throws, instead of rendering unmasked text.
- Fragment leak (ID-7): a retrieval chunk that mentions an unknown NPC by first name only is masked, or the test documents that it is not.
- Revision path: the masked revision request does not contain corrupted ordinary words.

## 2. Output-side leak detection (CTX-2 residual)

### CURRENT BEHAVIOR

Since block 4 the browser receives only status words and the audited narration once (PIPE-1 closed). What the final text may contain is decided by `auditNarration` (`src/turn/audit/narration-audit.ts`), then one bounded revision and, if that fails, deterministic redaction (`stages/audit.ts:94-114`).

The audit has knowledge checks but no identity-leak check:

- No check for an unlearned canonical name, alias or title in the final text. The only name check, `canonical_name_conflict` (`narration-audit.ts:396-403`, `partner-identity-guard.ts`), catches the opposite case (an invented name for a bound partner).
- No check for machine identifiers (`NPC\d+`, `campaign_*`, `scene_npc_*`, `npcmem:`, `F<n>` / `R<n>` / `H<n>` / `P<n>` refs, raw canonical ids).
- **New finding.** The speech-scoped knowledge checks iterate over quoted spans only: `for (const quote of quotesIn(sentence))` (`narration-audit.ts:232`), where `quotesIn` matches straight or curly double quotes (`:172`). These checks are `private_player_fact` (2a), NPC-voiced `restricted_canon` (2a'), `household_claim` (2b), `invented_source` (2c) and the speech form of `unsourced_history` (2d). The production Narrator format tells the model to write spoken dialogue "as plain text outside the asterisks, without quotation marks" (`NARRATOR_RPG_FORMAT`, `prompt-builder.ts:22`). `attributedSpeech` returns RPG speech as unattributed raw lines and no named lines (`identity/attributed-speech.ts:12-13,47`), which `docs/architecture/NARRATION_FACTS.md` states as policy ("RPG plain speech is never a named speaker's words there"). So for a well-formed RPG narration, the speech-scoped checks have nothing to iterate over.
- The narration-voice check for NPC-private canon, `outside(sentence)` (`:270-271`), removes quoted spans only. In RPG format it therefore also scans spoken lines, including lines spoken by a legitimate holder.
- The player-agency check that reads Nicco's quoted lines (`:603`) has the same quote-only scope.

All existing tests of these checks use quoted dialogue (`tests/authority/paragraph-speaker-attribution.test.ts`, `tests/authority/live-npc-handover.regression.test.ts:197-202`, `tests/authority/restricted-canon-knowledge-access.test.ts:136-140`). No test found feeds an RPG-format narration to these checks.

### RISK

- An unlearned canonical name, a confidential person's role, or a machine ref in the delivered text reaches the player; the only protection is the prompt.
- *Inferred, not confirmed by execution:* in production format an NPC can voice Nicco's private facts (for example his otherworldly origin, a campaign fact in `campaign/opening-state.ts:16-17`) or his household ownership without any audit issue. This is the protection the audit was built for (Repair 1) and it is silently inactive for the format the Narrator is told to use.
- The reverse: a holder who legitimately voices their own private canon in RPG format is flagged by the narration-voice check and triggers a revision or redaction (false positive).
- A leaked name is not learned as state (commit preparation learns canonical names only from an attributed truthful self-introduction), so the campaign stays correct while the player has already read the name.

### REPRODUCIBLE EXAMPLE (static, not executed)

Fixture: the one in `tests/authority/live-npc-handover.regression.test.ts`, where Nicco's "came from another world" fact is player-known and the speaker may not use it. Today the quoted form is flagged (`:202`). Feed the RPG form instead:

```
*Korvin looks Nicco over.*
You came from another world, didn't you.
```

Path: `auditNarration` → `sentencesOf(narration)` (`:179`) → for each sentence `quotesIn(sentence)` returns `[]` → the 2a loop never runs → no `private_player_fact`. Expected today: no issue. Expected after the fix: `private_player_fact`.

Identity leak: with `korvin` present and his identity-name fact not known, a delivered sentence `*Korvin nods slowly.*` is not flagged by any audit kind (no kind matches an unlearned name; `AuditIssueKind` list at `narration-audit.ts:40-42`).

Holder false positive: in `restricted-canon-knowledge-access.test.ts:136` the holder's quoted line passes. The same line written as RPG speech after `*Vessa leans close.*` is scanned by `outside(sentence)` and *inferred* to be flagged `restricted_canon`.

### AFFECTED MODULES

`src/turn/audit/narration-audit.ts`, `src/turn/stages/audit.ts`, `src/turn/identity/attributed-speech.ts`, `src/turn/narration-facts/dialogue-forms.ts` (the RPG speaker reading already exists for commerce, KPG-2), `src/turn/identity/narrator-identity.ts` (source of the unlearned-name list), `src/turn/coordinator/turn-coordinator.ts` (delivery).

### RECOMMENDED FIX

1. A deterministic output guard over the final candidate text (draft, revision, and the redacted text before delivery), feeding the existing revision-then-redaction lane:
   - id shapes, matched also when embedded in a word: `NPC\d+`, `campaign_[a-z]+_`, `scene_npc_\d+`, `npcmem:`, bracketed or standalone `[FRHP]\d+` refs from this turn's knowledge block, and the raw canonical ids of this turn's context;
   - unlearned canonical names, display names and aliases, taken from the gate's existing substitution map (`narrator-identity.ts:39-44`), allowed only inside the speech of the person who holds this turn's controlled self-disclosure capability;
   - on a hit: one revision with a specific correction; if it still leaks, redact the sentence. Never commit names from a flagged sentence.
2. Give the speech-scoped checks a speech reader that works for RPG format. Either reuse the NarrationFacts dialogue units with the KPG-2 speaker reading, or, more conservatively, treat every unattributed RPG speech line as "an unattributed speaker" (the existing fallback label at `:239`) with no CAN USE, which flags any private fact in RPG speech. The conservative form fails closed and needs no new grammar.
3. For the narration-voice private-canon check, exclude RPG speech lines whose speaker is resolved to a holder, and keep the check on starred narration.
4. Keep the guard English-free where possible (id shapes and exact names need no language rules).

### TESTS REQUIRED

- RPG-format twins of every speech-scoped audit test: `private_player_fact`, NPC-voiced `restricted_canon`, `household_claim`, `invented_source`, `unsourced_history` (speech) and the player-agency check. Each must flag in RPG format as it does in quoted format.
- Holder speech in RPG format is not flagged by the narration-voice check.
- Output guard: a draft containing an unlearned canonical name in starred narration triggers a revision; a revision that still contains it is redacted; the delivered text never contains it. Same for `NPC12`, `chilNPC12`, `campaign_character_r1_x`, `npcmem:`.
- Controlled self-disclosure still passes: the addressed NPC speaking their own canonical name in RPG speech on a name-request turn is not flagged (`tests/identity/controlled-name-disclosure.test.ts`, `self-name-disclosure.test.ts`).
- A commit-level test: a flagged and redacted name is not learned as knowledge.

## 3. Controller envelope budgeting (CTX-3)

### CURRENT BEHAVIOR

`requestControllerProposal` (`src/turn/stages/controller.ts:28-49`) sends the whole `TurnContext` minus three fields: `npc_private_canon`, `npc_plus` and `player_profile.visible` (`:37-38`). It adds `explicit_intent`, `movable_characters`, the standing trade offer and `referenced_known_characters` (`:40-44`), and serializes it with `JSON.stringify` into `prior_state`.

The adapter puts that string inside a second `JSON.stringify({ player_action, prior_state, final_narration })` (`src/llm/openrouter/state-controller.ts:54-56`), so the envelope is JSON-encoded twice: every double quote and backslash of the context is sent escaped.

There is no token budget. The only bounds are the context builder's transport check, `JSON.stringify(result).length > 100_000` characters including NPC+ (`context-builder.ts:176-178`, `types/resource-limits.ts:2`), and the provider's output cap (512 tokens, `state-controller.ts:48`) and 20-second timeout (`:59`). `TurnResult.context_characters.controller_evidence` measures the size after the fact only (`stages/result.ts:35`). Retries resend the identical request (`controller.ts:46-47`; PRV-2: the primary and fallback share the 20-second window).

Content of the envelope that the Controller does not need for state proposals:

- `primary.scene.present_characters[*]`: full authored `content` (up to 2,000 characters each), `portrayal` (up to 6,000), `traits`, `appearance` (`scene/narrative-context-builder.ts:83-91`), and the same for the current location's `content` and `features`.
- Duplicated appearance: `characters[*].profile.appearance` and `permanent_appearance` both present when campaign appearance values exist (`context-builder.ts:118-120`). The Narrator path removes the duplicate (`prompt-builder.ts:224-229`); the Controller path does not.
- `canonical_awareness`, `established_origin`, `projection` diagnostics, `price_indices`.

Corrections to the register row: facts are not "every fact"; `context.facts` is capped at 32 by relevance since H3 (`context-builder.ts:43,133`), with every knowledge edge of a present person for those facts (`:137`). Social selection is capped too (`SOCIAL_LIMITS`, `:190`), except the never-drop parts.

### RISK

- Latency and timeouts: the Controller works inside a 20-second window shared with its fallback (PRV-2); a crowded scene with long portrayal text costs time on every attempt. A Controller failure fails the turn (`stage = "controller_failed"`, `turn-coordinator.ts:256`).
- Cost: the envelope is paid twice on a retry and once more on a fallback.
- No early warning: the Narrator side has a measured budget and a pre-turn gate (`game-session.ts:986-989`); the Controller side has none, so growth is invisible until the provider rejects or times out.
- Privacy surface: see issue 7 (narrator-only NPC prose reaches the Controller provider).

### REPRODUCIBLE EXAMPLE (static, not executed)

A scene with N present canonical NPCs, each with authored content and portrayal near their limits. The Narrator prompt is checked against `request_tokens: 16_000` (`context-budget.ts:7`) and fails closed with `context_too_large` if over. The Controller envelope for the same turn is built from the same context (`controller.ts:37`) with no token check. Its only bound is the 100,000-character transport check (`context-builder.ts:178`), about 25,000 tokens by the repository's own bytes/4 estimate (`context-budget.ts:15`), before the second JSON encoding. *Inferred:* the Controller can receive an envelope well above the Narrator's whole operational budget without any diagnostic.

### AFFECTED MODULES

`src/turn/stages/controller.ts`, `src/llm/openrouter/state-controller.ts`, `src/turn/context/context-builder.ts`, `src/scene/narrative-context-builder.ts` (shape of `primary`), `src/turn/stages/result.ts` (diagnostics), `src/turn/context/context-budget.ts` (estimator, if shared).

### RECOMMENDED FIX

1. A dedicated `ControllerView` built by an **allow-list** projection from the turn context: ids, names, locations, items with positions and owners, legal status, household membership and rules, relationship ids, facts and edges, scheduled events, standing offer, movable characters. No authored `content`, `portrayal`, `traits`, location prose or features; one appearance field at most (or none: the Controller does not need appearance to propose commands; confirm against the controller policy text `state-controller.ts:8-30` before removing).
2. Send `prior_state` as a JSON object inside the user message, not as a pre-serialized string (single encoding).
3. A token cap measured with the same estimator as the Narrator (the register suggests 6-8k tokens), with deterministic degradation by tier (non-present household members, NPC-NPC relationships, low-ranked facts) and a fail-closed `context_too_large` only when the never-drop part alone exceeds it. Record the measured size in diagnostics.
4. Calibrate the bytes/4 estimator against the provider-reported `usage.prompt_tokens` the observer already records (`turn-coordinator.ts:259`).

### TESTS REQUIRED

- Architecture test: the keys of the Controller envelope equal an allow-list; adding a field to `TurnContext` does not change the Controller envelope.
- No `content`, `portrayal`, `features` or duplicated appearance in `prior_state` for a fixture with a present authored NPC and a campaign appearance.
- The user message is single-encoded (parsing it once yields an object `prior_state`).
- Cap: a crowded fixture degrades by the documented tiers and never drops never-drop state; an impossible fixture fails with `context_too_large` before any provider call.
- Controller benchmark (`tests/tooling/controller-benchmark.test.ts`) and the golden pipeline (`tests/golden/turn-pipeline.json`) still pass with the reduced view; the golden file will need a reviewed update.

## 4. Follow-up retrieval when the entity is unnamed (CTX-4)

### CURRENT BEHAVIOR

Retrieval is called with the player's input only: `retrieveForTurn(player_input, context, ...)` (`turn-coordinator.ts:223`). It runs only when `retrievalRequired` matches (`retrieval-policy.ts:38-43`): an English topic word (`WORLD_TOPIC`, `:13`), a world question (`WORLD_QUESTION`, `:15`), a query intent (`INTENTS`, `:24-32`), or a player-visible entity name, alias or id found as a substring of the input (`:41-42`). The search query is the input itself (`:114-115`); entity mentions come from the input (`:120`); the only anaphora handled is a deictic "this/that/the" plus one of nine place nouns resolved against the scene (`:51`, `:79-85`). Pronouns ("it", "her", "they") and "there" are explicitly excluded from the question triggers (`NOT_LISTENER`, `:23`).

Nothing carries the previous turn's retrieval topic: `RecentExchange` stores player text, narration, location and `conversation_partner_id` only (`recent-conversation.ts:5-7`). The dialogue-focused recent block omits prior narration prose (`prompt-builder.ts:105`), and the bounded current-visit narration block carries some of it (`recent-scene-narration.ts`), but not the canon record.

People already have a recent-focus fallback (`narrator-focus.ts:50-54`); places and lore do not. Fact selection uses recent text (`context-builder.ts:128-134`), retrieval does not.

### RISK

A natural follow-up gets no canon. The Narrator is then told to stay vague when canon is silent (`NARRATOR_SYSTEM`, canon boundaries), so the answer degrades to "I don't know" for something the previous turn established, or the model improvises against the rules. The turn-level benchmark (`tests/retrieval/retrieval-gates.test.ts:29`) pins "ordinary actions and conversation never retrieve", which also pins this behavior.

### REPRODUCIBLE EXAMPLE (static, not executed)

The location `spire_academy` (`data/locations/calderan/north/spire_academy.yaml`, player-visible).

1. "Tell me about the Spire Academy." `WORLD_TOPIC` matches "tell me about"; `entityMentions` finds the name (explicit tier 2); the record is fetched.
2. "Who runs it?" `WORLD_QUESTION` needs `(what|who) (is|are|was|were)`: no. `history` needs `who (owned|built|lived|founded|ran|used to)`: "runs" does not match "ran". `lore` needs `who (is|are) the`: no. No entity name in the input. Result: `outcome: "not_needed"` (`retrieval-policy.ts:153`), `[RETRIEVED CANON]` is empty.
3. "How old is it?" `history` matches "how old is", so retrieval runs, but the query "How old is it?" names no entity and is not deictic; lexical search on "old" returns whatever scores, or nothing.
4. "When was it built?" `schedule` needs `when (do|does|is|are|will|did)`: "was" is missing; `history` needs "was built" adjacent: "was it built" fails. No retrieval.

### AFFECTED MODULES

`src/turn/context/retrieval-policy.ts`, `src/turn/coordinator/turn-coordinator.ts` (call site), `src/turn/recent-conversation.ts` (session-only carry), `src/retrieval/hybrid-search.ts` (unchanged API).

### RECOMMENDED FIX

1. Record, per finalized exchange and in session memory only (like `conversation_partner_id`), the ids that the turn's retrieval returned or that its input mentioned.
2. On a turn whose input names no entity, if the input is a question or contains an anaphor ("it", "there", "they", "that place"), and the previous one or two exchanges at the same location carried a retrieval topic, run retrieval with that entity as an explicit mention (the existing `mention_lookup_pool` path, `retrieval-policy.ts:121-127`). Deterministic, no model call.
3. Widen the triggers minimally for the confirmed misses ("who runs", "when was"), or replace the trigger list with "question mark plus carried topic" for follow-ups. Keep the benchmark's "ordinary actions never retrieve" rule for non-questions.
4. Locale independence (English-only regex) stays a separate, low-priority item; the game text is English.

### TESTS REQUIRED

- Two-turn retrieval tests with the four inputs above: the second turn retrieves `spire_academy`.
- Negative: a follow-up after a location change does not carry the old topic; an ordinary action ("I sit down.") never retrieves.
- The retrieval benchmark keeps 25/25 top-1 (`retrieval-gates.test.ts:41`) and zero secret leakage (`:24`, `:45`).
- Carried topics are not saved (persistence snapshot unchanged).

## 5. Retrieval headroom (PIPE-9, with PIPE-4, PIPE-10 and the revision request)

### CURRENT BEHAVIOR

- Budget policy: 16,000 request tokens minus 768 output, 256 overhead, 512 safety and the system prompt (`context-budget.ts:7,21-29`). With the system prompt at about 3.3k tokens (register section 9), about 11,000 tokens remain for messages (*inferred*).
- The view budget, which drives the UI indicator, the pre-turn gate and auto-compaction, is measured on `contextRequest`, which builds the prompt with `retrieval = undefined` and an empty player action (`turn-coordinator.ts:96-100`; measured at `game-session.ts:357-362`). The pre-turn gate refuses a turn only when that view is at or above 0.9 (`game-session.ts:986-989`); post-turn auto-compaction uses the same view (`:1105`).
- The real turn adds retrieval (payload up to 10,000 characters, `retrieval-policy.ts:105`) and the player's input, then checks the hard limit once (`turn-coordinator.ts:227`, `context-budget.ts:36-40`).
- The audit revision request is the original request plus the draft, the authoritative outcome and the problems (`narration-audit.ts:442-447`), checked again at `turn-coordinator.ts:301`. No reserve exists for it.
- The truncation recovery request asks for 1,024 output tokens (`narrator-ledger.ts:18`) while the policy reserves 768 (`provider-config.ts:6`); it is not re-measured (`stages/narration.ts:86-88`).
- Retrieval failure is fatal: a non-found fetch, a payload over 10,000 characters or any exception becomes `retrieval_failed` and fails the turn (`retrieval-policy.ts:159,172,176`; `turn-coordinator.ts:222`). PIPE-10.
- `getView()` rebuilds the full prompt on each call (58 calls in `game-session.ts`). PIPE-4.

### RISK

The indicator can read "fine" while the next retrieval turn breaches the hard limit and fails with `context_too_large` (never retried, `app-errors.ts:45`). A turn whose draft has already been produced can still fail at the revision step for size, which the player sees as a failed turn after the full Narrator and Controller latency. Optional evidence (retrieval) can fail the whole turn.

### REPRODUCIBLE EXAMPLE (static, not executed; sizes inferred)

A long scene where the view measures 0.85 of the usable budget (about 9,350 of 11,000 tokens): below the 0.9 gate, so the turn is accepted and auto-compaction does not run. The player asks a lore question that fetches a long record (payload near 10,000 characters, about 2,500 to 2,900 tokens once escaped inside the message JSON). The real request is about 1.08 of the usable budget and `prepareNarratorRequest` throws `context_too_large` (`context-budget.ts:39`). The same view at 0.75 passes the first check, but if the draft then has audit issues, the revision request (about 0.75 + 0.25 + 0.08 for draft and outcome) fails at `turn-coordinator.ts:301`.

### AFFECTED MODULES

`src/turn/context/context-budget.ts`, `src/app/game-session.ts` (`getView`, pre-turn gate), `src/turn/coordinator/turn-coordinator.ts` (`contextRequest`, revision, recovery), `src/turn/context/retrieval-policy.ts` (failure mode), `src/turn/stages/narration.ts`.

### RECOMMENDED FIX

1. Add explicit reserves to the policy: retrieval (about 3k tokens, as the register proposes), revision (draft cap plus a bounded outcome block, about 1.2k), and recovery output (1,024, not 768). The view budget and the gate measure "view + reserves".
2. Cache the view budget by revision and last input (PIPE-4); do not rebuild the prompt per `getView()`.
3. Degrade, do not fail, on retrieval: on a fetch or size failure, deliver the turn with `[RETRIEVED CANON]` empty and a diagnostic (PIPE-10). Keep the secret filter fail-closed.
4. Longer term, the tiered context-budget strategy already written in register section 9.

### TESTS REQUIRED

- A fixture whose view is under the gate but whose retrieval turn would exceed: the gate (with the reserve) asks for compaction instead of accepting a turn that will fail.
- A fixture with audit issues near the limit: the revision either fits or the draft is redacted deterministically; the turn does not fail with `context_too_large` after narration.
- Retrieval failure injected (`tests/turn/turn-failure-codes.test.ts:91` today expects `retrieval_failed`): after the fix, the turn completes with empty canon and a diagnostic; the existing test changes by design and needs the user's approval.
- `getView()` called twice for the same revision builds the prompt once.

## 6. Knowledge visibility

### CURRENT BEHAVIOR

- Player knowledge reaching the Narrator: campaign facts Nicco knows (any truth value, tagged), and canonical facts only when the record is visible to both player and narrator (`context-builder.ts:90-96`). Identity-name facts are excluded from the fact list (`:91`) and drive masking instead.
- NPC permissions: explicit knowledge edges, authored public grants (`canonical_awareness`), ordinary awareness scopes and restricted grants for present holders (`narrative-authority.ts:61-110`, `knowledge-grants.ts:32-53`). The Narrator sees a CAN USE / DO NOT USE table per present character.
- ID-6 (open): the Narrator names created characters by `profile.name` (`context-builder.ts:108-111`, `:199`), the UI by `knownCreatedName` (`app/player-character-view.ts:58-62`), which prefers the established name when the current name has no provenance.
- **New finding, latent.** For canonical NPCs the two sides also use different "name is known" rules. The Narrator gate treats any whole-entity canonical fact about the NPC that Nicco knows as name knowledge (`narrator-identity.ts:33`: `content.kind === "canonical" && entity_id === npc.id && chunk_id === undefined`). The UI requires the identity-name fact specifically (`isIdentityNameFact`, `player-character-view.ts:136`, `campaign/identity-knowledge.ts:7-9`), and treats other whole-entity facts as story facts (`player-character-view.ts:210`). Today the only production producer of whole-entity canonical facts is `learnCanonicalName` (`identity-knowledge.ts:17`); the Controller schema has no `create_fact` (`llm/controller-schema.ts:20-46`). Reachable through a save file or a future feature.
- **New finding.** Two ref families share the letter P in the same block: NPC-private canon refs `P<i>` (`narrative-authority.ts:78`) and scene participant refs `P<n>` (`scene-participants.ts:176`), and an ephemeral participant's knowledge line is named `${p.ref} ${p.display_name}` (`narrative-authority.ts:104`). A prompt can contain "P1 (holder only): ..." for a private canon record and "P1 Fishwife (temporary ...): CAN USE ...; DO NOT USE ..., P1" for a participant.
- Retrieval records are labelled `narrator_access: true, player_access: true` unconditionally (`retrieval-policy.ts:164`). This is correct only because `keep` drops candidates with `secret` (`:116`), where `secret` means "not player-visible" (`retrieval/projections.ts:27`, `retrieval-service.ts:49`).

### RISK

- The Narrator can treat a name as player-known while the UI still shows "Unfamiliar person" (latent), the same class of drift as ID-6.
- The P collision can make the Narrator misread who may voice a private canon record or which fact a temporary person must not use; an error here is a knowledge leak in speech, which issue 2 shows is not audited in RPG format.
- The hard-coded `player_access` couples correctness to one filter line; a later change that admits narrator-only records to retrieval (for example for a confidential encounter) would silently mark them player-known (`narrative-authority.ts:108`).

### REPRODUCIBLE EXAMPLE (static, not executed)

P collision: a scene with a present holder of one restricted grant (for example `korvin`, whose private background is used in `restricted-canon-knowledge-access.test.ts:182`) and one temporary participant introduced this session (`scene_npc_1`, ref `P1`). `projectKnowledgeAccess` emits fact `P1` for the private record and character line "P1 <label> (temporary ...)" whose DO NOT USE list includes `P1`. Both are rendered by `renderKnowledgeAccess` in one `[CHARACTER KNOWLEDGE ACCESS]` block (`narrative-authority.ts:115-121`).

Name rule: a snapshot with fact `{ id: "campaign_fact_x", content: { kind: "canonical", entity_id: "korvin" } }` known by Nicco. `registerNarratorIdentities` sets `player_known_name` to his name (`narrator-identity.ts:33,37`) and stops masking it; `playerCharacterProjection` still labels him "Unfamiliar person" (`player-character-view.ts:136,142-143`).

### AFFECTED MODULES

`src/turn/identity/narrator-identity.ts`, `src/app/player-character-view.ts`, `src/campaign/identity-knowledge.ts`, `src/turn/context/context-builder.ts`, `src/turn/context/narrative-authority.ts`, `src/turn/identity/scene-participants.ts`, `src/turn/context/retrieval-policy.ts`.

### RECOMMENDED FIX

1. One shared "name known to the player" function in `src/campaign/` for canonical and created characters, used by the Narrator gate, the UI projection and the session view (`app/session-view.ts:85`). This also closes ID-6 (the register already proposes moving `knownCreatedName` to `campaign/`).
2. Distinct ref prefixes per family in the Narrator prompt (for example `T<n>` for temporary participants), or one shared counter for all refs of a request.
3. Derive `player_access` from the record's policy instead of a constant, and keep the `secret` filter.

### TESTS REQUIRED

- Narrator gate and UI agree for: identity-name fact known, unknown, and a whole-entity non-identity fact known.
- A prompt with a restricted grant and a temporary participant has no duplicated ref.
- A retrieval record that is narrator-visible but not player-visible, if ever admitted, is not listed under "Narration and Nicco (player)".

## 7. Secret visibility

### CURRENT BEHAVIOR

- Secret places: a player-invisible current location is rendered as `null` and secret ancestors are dropped (`context-builder.ts:80-81`); the Scene State Projection shows no name for it (`scene-state-projection.ts:24-25`).
- Confidential encounter: a narrator-only NPC physically present is projected, marked `confidential_encounter` (`context-builder.ts:76-82`), and gets a prompt rule (`prompt-builder.ts:138`). Its full authored `content`, `portrayal` and `traits` are in the Character JSON (`narrative-context-builder.ts:85-91`; `prompt-builder.ts:228` keeps `baseline` minus appearance). On the current dataset exactly one canonical NPC is narrator-only (`dren`, static count over `data/characters`), and it is listed in its own `known_by`.
- Restricted canon: present holders' narrator-only grants, including sealed `holder_only` canon, reach the Narrator as label and summary in the NPC-private section (`knowledge-grants.ts:16-21,35-48`; `narrative-authority.ts:72-78,120-121`). The output check is `disclosesPrivate`: the label as a word, or a content bigram with a distinctive word (`narration-audit.ts:166-171`).
- Retrieval filters every non-player-visible candidate before the Narrator (`retrieval-policy.ts:116,160`).
- The Controller receives the same `primary.scene.present_characters` including the confidential NPC's narrator-only prose and unmasked canonical names (`controller.ts:37`). The comments at `context-builder.ts:55,124` describe controller exclusion for two fields only.
- **New finding, P3.** Revision outcome lines and movement corrections name locations by `display_name` without a visibility check (`stages/audit.ts:78`, `narration-audit.ts:468`, used in `outcomeLines` at `:424`). A committed move to a narrator-only location puts its name into the revision request.

### RISK

- Prompt-side secrecy is a rule, not a boundary: the Narrator holds the confidential NPC's role and affiliations in plain text, and the output guard for them is the label/bigram heuristic, which in RPG format also misfires on holder speech (issue 2).
- The Controller is a different provider with a different retention profile. Sending narrator-only canon there is a product and privacy decision that the code makes implicitly; nothing in the Controller policy needs authored prose to propose commands.
- A secret location's name can reach the Narrator through the revision lines and then the delivered text.

### REPRODUCIBLE EXAMPLE (static, not executed)

Nicco at the location where `dren` is placed by runtime. `buildNarrativeContext` includes `dren` because narrator visibility is true (`narrative-context-builder.ts:79`), with `content` and `portrayal`. `buildTurnContext` marks him `confidential_encounter` (`context-builder.ts:82`). `requestControllerProposal` serializes `context` with that entry intact (`controller.ts:37-40`); the Controller user message contains his authored prose and canonical name.

### AFFECTED MODULES

`src/turn/context/context-builder.ts`, `src/scene/narrative-context-builder.ts`, `src/turn/stages/controller.ts`, `src/turn/context/knowledge-grants.ts`, `src/turn/audit/narration-audit.ts`, `src/turn/stages/audit.ts`.

### RECOMMENDED FIX

1. With CTX-3's allow-list `ControllerView`, the confidential NPC appears to the Controller as an id, a neutral label and its state only. Decision needed from the user: should the Controller see any narrator-only canon at all? The recommendation is no.
2. For the Narrator, keep the confidential encounter by design but pass the confidential NPC's prose through the same output guard (issue 2), with the NPC's role and affiliation words added to the guard's list, not only its name.
3. Use the visibility-aware label (`null` or "an unestablished place") for secret locations in outcome lines and movement corrections, as the Scene State Projection already does.

### TESTS REQUIRED

- Controller envelope for a confidential encounter contains no authored prose and no canonical name of the confidential NPC.
- A move to a narrator-only location produces no location name in the revision request.
- Narration naming the confidential NPC, or stating its role, in starred narration is flagged; the controlled paths (none exist for confidential NPCs: `canonical-name-disclosure.ts:69`, `narrator-identity.ts:55`) stay closed.

## 8. NarrativeContext vs ControllerContext separation (CTX-5, CTX-7, the seam of CTX-1 and CTX-3)

### CURRENT BEHAVIOR

- One object, `TurnContext` (`context-builder.ts:70-187`), is built 4-5 times per turn from three states (`stages/intent.ts:57,128`; `stages/commit-preparation.ts:58,71,90`), plus once per `getView()` and for `trackablePeople` (`turn-coordinator.ts:87,98`). CTX-5.
- `NarrativeContext` (`src/scene/narrative-context-builder.ts`) is not narrator-only, despite its name: it is the `primary` scene projection of `TurnContext`, read by the Narrator, the Controller, authorization and the audit.
- Narrator-only data lives in four `WeakMap` side channels keyed by object identity: the identity gate (`narrator-identity.ts:25`), serialized sizes and fact truth (`context-builder.ts:53-54`), scene extras (`scene-state-projection.ts`, `registerSceneExtras` at `:138-154`), and the narrator pack (`narrator-pack.ts:26`). A shallow clone loses them: `narrator-focus.ts:73` builds `view = { ...context, ... }`, for which `narratorIdentityGate(view)` is `undefined`. Today `view` is only used where the gate is not looked up (`prompt-builder.ts:235-238`), so nothing breaks yet. CTX-7.
- The Controller copy is a deny-list of three fields (`controller.ts:37-38`).
- NPC+ headroom is computed from the size of the whole authority object (`context-builder.ts:172`), so narrator portrayal text and controller-only fields compete for the same budget.

### RISK

New fields added for the Narrator flow to the Controller by default; new code that clones a context unmasks the Narrator silently; the two providers' budgets cannot be set independently. These are the structural causes of issues 1, 3 and 7.

### REPRODUCIBLE EXAMPLE (static, not executed)

Change `buildNarratorPrompt` to call `interactionPartnerBlock(focus.view, ...)` instead of `interactionPartnerBlock(context, ...)` (`prompt-builder.ts:249`). Both type-check as `TurnContext`. With `focus.view`, `narratorIdentityGate` returns `undefined`, the partner block is skipped, and any other helper written the same way would render unmasked names, because `mask` falls back to the identity function (`prompt-builder.ts:180`). No test fails closed on this.

### AFFECTED MODULES

`src/turn/context/context-builder.ts`, `src/scene/narrative-context-builder.ts`, `src/turn/identity/narrator-identity.ts`, `src/turn/context/scene-state-projection.ts`, `src/turn/context/narrator-focus.ts`, `src/turn/context/prompt-builder.ts`, `src/turn/stages/controller.ts`.

### RECOMMENDED FIX

Keep `TurnContext` as the authority projection used by authorization, preparation and the audit. Derive two explicit views from it:

- `NarratorView`: the context plus the identity gate, fact truth and scene extras as fields; the only input type `buildNarratorPrompt` accepts; constructing it without a gate is impossible.
- `ControllerView`: the allow-list projection of issue 3.

Both are plain derivations; no new state, no persistence change. `TurnFrame` (CTX-5, one build per state per turn) and `FocusPlan` (CTX-6) can come later on top of these types and are not needed for privacy or budget work.

### TESTS REQUIRED

- Type-level: `buildNarratorPrompt` does not accept a bare `TurnContext` (compile-time check in an architecture test).
- Runtime: a cloned context cannot produce a Narrator prompt.
- The Controller allow-list test from issue 3.
- Existing architecture guards under `tests/architecture/` stay green.

## 9. Split recommendation

### What the code supports

The proposed three-way split is close to the code's seams, with three adjustments.

1. **Narrator privacy has two halves in different modules.** The input projection (what the Narrator sees) lives in `narrator-identity.ts`, `prompt-builder.ts` and `narrative-authority.ts`. The output guard (what the player may read) lives in the audit lane (`narration-audit.ts`, `stages/audit.ts`) and depends on the NarrationFacts speech reading. They have different tests and different failure modes, and the output half is the one that holds when the model ignores the prompt.
2. **"Controller budget" is really "context budgets".** Retrieval headroom (PIPE-9), the revision and recovery reserves and the cached view budget (PIPE-4) are Narrator budget accounting in `context-budget.ts`, `game-session.ts` and `turn-coordinator.ts`, the same modules and estimator a Controller cap needs. Retrieval quality is a different question (what is retrieved), with different tests (the retrieval benchmark).
3. **One shared seam.** `NarratorView` (needed by A1) and `ControllerView` (needed by B) are the two halves of the same separation (issue 8). Whichever package goes first should introduce both types, with no behavior change in that commit.

### Recommended packages

| Package | Contents | Register rows | Main modules | Size | Depends on |
| --- | --- | --- | --- | --- | --- |
| **CTX-A1 Narrator input projection** | boundary-aware id masking; opaque refs for every identifier; retrieval JSON without provenance and raw ids; distinct ref prefixes; gate as an explicit `NarratorView` field, fail closed; one shared "name known" rule | CTX-1, CTX-7, ID-6, ID-7, new P-ref collision, new name-rule divergence | `turn/identity/narrator-identity.ts`, `turn/context/prompt-builder.ts`, `narrative-authority.ts`, `narrator-pack.ts`, `npc-plus.ts`, `scene-participants.ts`, `campaign/` (shared rule), `app/player-character-view.ts` | S-M | none |
| **CTX-A2 Output guard** | deterministic final-text check for id shapes (also embedded) and unlearned names / aliases / confidential role words; RPG-speech coverage for the speech-scoped knowledge checks; holder-speech false positive | CTX-2 residual, new RPG-speech audit gap | `turn/audit/narration-audit.ts`, `turn/stages/audit.ts`, `turn/identity/attributed-speech.ts`, `turn/narration-facts/dialogue-forms.ts` | M | the name list from the existing gate; nothing from A1 is required |
| **CTX-B Context budgets** | allow-list `ControllerView`, single encoding, token cap and tiers; Narrator reserves for retrieval, revision and recovery; cached view budget; estimator calibration | CTX-3, PIPE-9, PIPE-4, part of the secret-visibility finding (Controller exposure), PRV-2 (related) | `turn/stages/controller.ts`, `llm/openrouter/state-controller.ts`, `turn/context/context-budget.ts`, `turn/context/context-builder.ts`, `app/game-session.ts`, `turn/coordinator/turn-coordinator.ts` | M | the view-type seam (shared with A1) |
| **CTX-C Retrieval quality** | follow-up topic carry; minimal trigger widening; degrade-not-fail; precomputed name index; `player_access` from policy; word-boundary id/name trigger | CTX-4, PIPE-10, PIPE-11, new trigger substring match (`retrieval-policy.ts:42`) | `turn/context/retrieval-policy.ts`, `turn/recent-conversation.ts`, `turn/coordinator/turn-coordinator.ts` | M | none; PIPE-10 interacts with B's reserve but can ship alone |
| Deferred | `TurnFrame` (single builds), `FocusPlan` | CTX-5, CTX-6 | context and coordinator | M each | A1 and B types |

### Suggested order (for the user's decision)

1. **CTX-A2 with the boundary fix from A1 as its first commit.** The boundary fix is a few lines and removes a real corruption on the current dataset; the output guard is the only protection that does not depend on the model, and it closes the RPG-speech gap in the audit, which affects the P1-origin CTX-2 item. These two together are the safety block.
2. **CTX-A1 (rest)** with the `NarratorView` / `ControllerView` type seam.
3. **CTX-B**, which then only fills in the Controller view and the reserves.
4. **CTX-C**, independent; it can run in parallel with B because it touches `retrieval-policy.ts` and the coordinator call site only.

No open user decision (register section 16: D3, D4, D5, D6, D9, avatar upload) blocks any package. Two new decisions are needed:

- whether the Controller provider may receive narrator-only canon (issue 7; the recommendation is no);
- the failure mode of the output guard on a second hit: redact the sentence (consistent with the current pipeline, recommended) or fail the turn.

### Proposed register changes (for approval, not applied)

| Change | Reason |
| --- | --- |
| CTX-1: replace "not reproduced" with the `dren` / "children" example; current locations `narrator-identity.ts:47-50`, `prompt-builder.ts:138,227` | reproduced statically |
| CTX-2 residual: add the RPG-speech gap, or open a new row for it (proposed P2) | the speech-scoped knowledge checks do not run on the production format (static) |
| CTX-3: "every fact" becomes "up to 32 selected facts and their edges"; add the double JSON encoding | `context-builder.ts:43`, `state-controller.ts:54-56` |
| PIPE-9: add the revision and recovery reserves | `turn-coordinator.ts:301`, `narrator-ledger.ts:18` |
| New P3 rows: canonical "name known" rule divergence; `P<n>` ref collision; secret location names in revision lines; retrieval `player_access` constant; trigger substring match | sections 6, 7, 4 |
