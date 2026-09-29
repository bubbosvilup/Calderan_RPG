# Evidence-backed authorization and epistemic continuity

Phase 1O. It answers two questions:
- **Did X become true?** Acquisition: evidence-backed authorization.
- **Does X stay true?** Persistence: CampaignState plus the per-turn knowledge projection.

## 1. Pipeline (unchanged shape, one controller call)

```
Player input → resolved player intent (deterministic)
→ Narrator (Kimi) → finalized narration
→ DeepSeek controller: { commands: [{ command, evidence_quote }] }   ← same single call
→ TurnEvidence grammar (deterministic)
→ hybrid authorization (deterministic) → CampaignState.prepare → commit (one revision)
```

No extra LLM call and no third model; the evidence quote is returned in the same controller response.

## 2. Controller evidence schema (production)

```ts
// src/llm/controller-schema.ts
CONTROLLER_EVIDENCE_SCHEMA = { commands: [ { command: <unchanged command vocabulary>, evidence_quote: string } ] }  // strict, maxItems 8
interface ProposedCommandWithEvidence { command: CampaignCommand; evidence_quote: string }
// ControllerResult.evidence?: readonly string[]   // evidence[i] belongs to commands[i]
```

Instruction added to `CONTROLLER_POLICY` (no examples, no reasoning requested):

> For every proposed state command, provide the shortest exact verbatim excerpt from the finalized narration that by itself establishes that state change: it must contain who acts, the verb (the telling or taking) and what is told or taken. When one sentence establishes several changes, use that whole sentence for each of them. Do not cite reactions, implications or hypothetical statements.

A legacy reply (commands without evidence) still parses but carries no evidence, so it can only use the grammar path.

## 3. Deterministic verification (`src/turn/evidence-authorization.ts`, `verifyEvidence`)

**A quote is necessary for the evidence path and never sufficient.** It is checked as follows.

**Common checks:**
- It must be an exact substring of the finalized narration. Only whitespace runs are collapsed: paragraph breaks versus spaces, demonstrated necessary in the Phase 1O run. There is no fuzzy or semantic matching.
- It must be 8–240 characters.
- **Hedges disqualify.** The *containing sentence(s)* of the narration, with dialogue blanked, must contain no hedge, negation, modal/future, hypothetical, interruption or retraction marker: `not, never, no, maybe, might, could, would, can, will, if, unless, whether, almost, nearly, considers, imagines, pretends, refuses, declines, back, stops, hesitates, wants to, about to, starts to, tries to, opens his mouth, n't, 'll, ?`. A clipped quote therefore cannot escape "If she takes…", "almost takes" or "starts to tell… but stops".
- **Other people disqualify.** Neither the quote nor the gap between subject and verb may contain another person's name, present or not ("Brenna watches Maren take…", "Nicco listens as Maren tells…").
- **Pronouns must resolve to the right character.** A pronoun subject must resolve to the required character through the named subject of the nearest sentence before the pronoun's own sentence.

**`set_knowledge` (explicit /tell only):**
- The quote contains **the fact content**: all content words of the statement.
- The quote contains **a communication act** outside dialogue (tells, says, informs, explains, states, speaks, …), or a colon realization ("speaks the fact plainly: …"), or "Brenna hears Nicco say …".
- **Nicco is the subject** of that act, or "he" resolving to Nicco. "Brenna tells Nicco" does not qualify.
- **Quoted `/tell` policy.** Generic quoted speech is never evidence. *Nicco's* quoted statement is accepted only when all of these hold:
  - it contains the exact fact content;
  - it contains no hedge or question;
  - it is attributed to Nicco by a speech verb;
  - it realizes an already-resolved explicit `/tell` intent.

  A narrator-invented Nicco quote without a `/tell` intent can never mutate state; there is no intent to match.
- **Reactions never qualify.** "Brenna takes in the information", "Her eyes widen", "noting the information" and similar fail on content or act.

**`transfer_item`:**
- The quote contains a **receipt act** read with dialogue blanked: takes, took, accepts, receives, gathers, collects, picks up, snatches. The purposive "extends her hands to take" and "reaches out (and|to) take" also count.
- The act's **subject is the recipient**, by name or a pronoun that resolves to her.
- Each item is referenced **by a token unique to it among the offered items**, or the quote contains a **group phrase** covering the whole offer (them, all three, the clothes, the stack…). A stated count must equal the offer size.
- **Sequential lists** ("She took the cotton shirt, then the fluffy one, and finally the shorts"):
  - One quote may support several items.
  - A verb-less continuation such as `then the fluffy one` counts only if it starts with a coordinator and follows the recipient's receipt act in the same sentence, with only item-list words in between.
  - A bare object fragment such as `the fluffy shirt` never counts.
- Receipt spoken only in dialogue is not evidence.

## 4. Hybrid policy (`authorizeWithEvidence`)

For each proposed command:

```
AUTHORIZED if   TurnEvidence grammar confirms
          OR    (hybrid) verified evidence confirms AND the grammar's only objection was a missing confirmation
AND in either case the unchanged authorizer passes: exact player-intent match, valid references,
    current state validity, no deterministic refusal/retraction for that intent.
```

- **Refusal and retraction win.** "Takes them… then hands them back" stays rejected even with a perfect quote, because TurnEvidence refusals are re-applied.
- **The existing safe path is never failed by evidence.** Grammar yes plus invalid evidence stays authorized, with source `grammar`.
- **DeepSeek has no semantic veto.** It cannot override intent, ownership, knowledge, revision, item identity or explicit refusal. Evidence only adds recall.
- **Atomic offered group.** For a multi-item offer to one recipient, evidence may not produce a partial commit. If the evidence path authorized part of the offer but not all of it, the evidence-sourced part is withdrawn (`rejected_evidence_partial_group`); grammar-sourced decisions stand. Everything authorized in a turn commits in one `prepare`/`commit`, so the revision increments once.
- **Provenance guard.** Re-telling a fact the recipient already `knows` is rejected as `rejected_already_established`, so the original status and provenance are never overwritten. Upgrading a rumor or belief through an explicit tell remains possible.
- **Mode.** `evidence_authorization: "hybrid"` is the production default since Phase 1O (after the gates below). `"shadow"` exists only for evaluation: it records evidence checks but authorizes exactly as the grammar.

**Diagnostics.** Each `AuthorizationDiagnostic` (frozen) carries:
- `source`: `grammar`, `evidence`, `both` or `rejected`;
- `grammar: {authorized, reason}`;
- `evidence: {quote, verified, check}`;
- the final `reason`, including `authorized_controller_evidence`.

**Enablement gates** (both met before the default switch):
1. **Offline maximally adversarial controller.** For 44 negative cases (final corpus: 44 negative, 17 positive), every contiguous word window of the narration is tried as the quote for every intended command, individually and shared: 0 commits.
2. **Real DeepSeek.** 0 false positives in all eight evaluation runs. The final run had 110 items and 52 non-events.

**Quoted `/tell` action-beat convention** (added after it recurred in live Kimi output): `Nicco leans toward Brenna. "The eastern bridge is closed."`. It is accepted only when all of these hold:
- the quoted statement is a sentence of its own with no attribution text;
- the immediately preceding sentence starts with Nicco, names the recipient, names no one else and is not hedged;
- all the other quoted-`/tell` conditions hold.

**Incomplete group proposal.** If the narration establishes a whole multi-item offer but the controller proposes only part of it, the group is withheld (`rejected_incomplete_group_proposal`) rather than committed partially. A narrated partial acceptance still commits the named items.

## 5. Epistemic invariant

> Once CampaignState establishes that character X knows fact F, that knowledge remains established until an explicit future mechanic changes it. There is no forgetting mechanic.

Audit (Phase 1O):
- The only code that mutates knowledge is the explicit `set_knowledge` command (`src/campaign/social.ts`), which replaces the edge for that exact (character, fact) pair.
- Nothing expires, drops, overwrites or regenerates edges because they were not recently referenced.
- `RecentConversation` never touches knowledge.
- Persistence round-trips knowledge unchanged.

**Absence from a prompt is not forgetting.** "Not projected this turn" (relevance) is distinct from "no longer knows", which does not exist. Status (`knows`, `believes`, `suspects`, `heard_rumor`) and provenance are preserved indefinitely; a rumor never silently becomes `knows`.

**Projection each turn.** `NarrativeKnowledgeAccess` is re-derived from the captured snapshot every turn and never cached from an earlier prompt. After 20 turns, with the telling long gone from recent conversation, the prompt still shows `Brenna: CAN USE F1 (knows)` and `Maren: DO NOT USE F1` (tested).

**Bounded relevance** (`selectRelevantFacts`):
- Up to 12 player-known facts are all projected.
- Beyond that, only these are projected: the player's intent (e.g. `/tell`), explicit lexical references in the input (a recall query such as "do you remember the eastern bridge?"), and references in recent conversation. At most 16.
- Every fact an NPC knows is never preloaded.
- Authorization and the controller still use the full player-known fact list.
- Facts known only to NPCs (not to Nicco) are not surfaced; this is the existing visibility policy and a future decision.

## 6. What does not mutate state

- **Narrated overhearing.** "Maren hears Brenna say X" is not player-authorized telling, so no Maren edge is created. There are no automatic overhearing semantics; this is a future decision.
- **Prose that an NPC knows something.** No edge is created to make narration true (no auto-repair).
- **Conflicting later information.** "The bridge reopened" is a separate belief-revision problem; nothing is "forgotten".
