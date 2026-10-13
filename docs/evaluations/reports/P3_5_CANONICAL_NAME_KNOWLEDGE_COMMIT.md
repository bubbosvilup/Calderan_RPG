# P3.5 — Canonical name knowledge commit

Status: FIX IMPLEMENTED; live verification pending. Baseline: `cb92f8b`. P3.3 controlled disclosure: LIVE PASS per supplied evidence. P3.4 participant continuity: confirmed correct in the deterministic trace and consistent with the supplied live sequence; unchanged. Paid calls: 0.

## 1. Live evidence

The supplied production response introduces the bound short compact seller with a standalone `Korvin.` speech segment between long RPG narration blocks. It then continues with two other spoken segments. Later production/alternate responses invent Hargan, Pell, Harl or Korra Vell.

The exact supplied introduction is preserved verbatim in `tests/fixtures/p35-live-introduction.ts`. The historical UI request/state snapshot was not attached; this report distinguishes offline engine evidence from live model behavior. No production or alternate provider was called.

## 2. Exact parser/commit trace

Before source edits, the loaded world/opening campaign was placed in Calderan Slave Market with Korvin, Bartolomhew and Elara present. Existing SceneParticipants committed an approach to the short compact man. RecentConversation retained the canonical partner ID and scene. The exact production text was then passed into the real `prepareCommit` path as delivered narration, with an empty already-prepared state batch.

| Check | Before fix | After fix |
| --- | --- | --- |
| Controlled opportunity active | Yes; canonical Korvin, NPC24, public self-name Korvin | Yes, same |
| Canonical partner | `focus: korvin`, `addressed: [korvin]`, market-scoped | Same |
| Temporary participants/creation | Empty / null | Same |
| RPG speech parsing | Three separate segments, first `Korvin.` | Same existing parser |
| Bare-name segment matches | Yes | Yes |
| Canonical evidence accepted | No | `korvin` |
| `learnCanonicalName` commands prepared | None | `create_fact` + `set_knowledge` |
| Name commands committed | None | Yes, through existing campaign receipt |
| Nicco's canonical name knowledge | Missing | `knows` |
| Next identity | `player_known_name: null`, actor still Korvin | `player_known_name: Korvin`, actor still Korvin |
| Repeat input's disclosure block | Missing because phrase was unrecognized | No block needed after knowledge commit |

The existing RPG parser returns exactly:

1. `Korvin.`
2. `Good hour for it. Auction floor's been busy since first light, so the pens are full.`
3. `What are you after? Labor, household, something specific? Makes a difference where I'd point you.`

Local diagnostic artifacts are ignored `.build/p35-before.json` and `.build/p35-after.json`. The committed regression tests assert the actual canonical fact ID and knowledge provenance, including that preparation alone does not mutate live state.

## 3. First failing condition

The prior name detector did **not** require the entire response or dialogue projection to equal the name. It already matched the standalone `Korvin.` paragraph.

It then required immediately preceding textual descriptor attribution. Its verb-splitting grammar did not recognize `shifts` in the first sentence, and reached `studies` in the second sentence instead. The extracted supposed subject was:

`The short, compact man shifts his weight, his large damaged hands hanging loose at his sides. He`

Passing that entire action/partial paragraph to `I address <subject>` resolved **zero** actors. The first rejecting acceptance condition was `attribution.foreground.size === 1`; the actual size was 0. This is the reproducible root cause: fragile attribution extraction and failure to use the already-bound canonical partner. More later dialogue was not the cause.

## 4. Whether P3.4 remained correct

P3.4 remained correct throughout the trace. The approach and subsequent question resolve canonical `korvin`, with no generic Man creation. After the failed old name detector, later continuation still has `focus: korvin`. The missing value was name knowledge, not actor identity.

Participant creation/continuation, narrator focus, RecentConversation storage, narrator identity/ref architecture and promotion policy were not edited in this task.

## 5. Multi-segment dialogue handling

Post-generation evidence now uses existing `rpgDialogue` segments. It checks each spoken segment independently for an exact canonical self-name or a supported exact first-person form, so unrelated later speech cannot invalidate valid evidence. Balanced single-asterisk narration remains separate from speech; malformed blocks grant nothing.

Bare names accept the canonical string with existing case-insensitive matching, optional terminal period/exclamation and optional outer quotation marks. Questions such as `Korvin?` are rejected. First-person forms remain bounded (`I'm`, `I’m`, `I am`, `My name is`, `My name's`, `Call me`); the name must terminate the segment with approved punctuation, preventing a surname/alias tail from matching as an exact self-name.

Variant A (`*He nods.*`, `Korvin.`, another speech segment) and B (first-person introduction with later narration/speech) commit knowledge. Variant C, `Korvin. Looking for something particular?` in one spoken segment, deliberately fails closed: no new sentence-prefix identification grammar was added. D, `Korvin works the far pen.`, and E, `Korvin?`, grant nothing.

## 6. Attribution logic

The existing controlled capability still selects exactly one public, present, unknown canonical actor. Its target resolution and visibility/confidentiality gates remain unchanged.

Preferred evidence is the existing scene plan's single canonical focus/address, scoped to the current location. The retained finalized `conversation_partner_id` may also support attribution when no current focus/address supersedes it and its recorded scene matches. No new speaker/name map, store or persistence field was introduced.

Engine attribution is allowed only when narration provides no competing speaker evidence. The bounded guard reuses canonical descriptor/reference matching, existing speaker noun grammar and scene participation checks. Other canonical/campaign actors, explicit unknown people, multiple subjects, incompatible/plural pronouns, another named speaker, player speech or opaque-ref attribution reject an unassigned self-name. Speaker events preceded by simple prose such as `Nearby, ... replies` are covered.

The conservative adjacent-descriptor fallback remains available independently of engine metadata. It now extracts only the leading observable person phrase, rather than the action paragraph. That adjacent block must itself have no competing speaker evidence. Thus a securely attributed introduction can still be accepted in a response where another speaker appears elsewhere; a pronoun-only or otherwise unassigned introduction in competing-speaker output fails closed.

## 7. Repeat-name grammar audit

| Input | Before | After |
| --- | --- | --- |
| `mmh alright then *shacking his hand* u said you are named?` | Not recognized | Recognized |
| `u said you are named?` | Not recognized | Recognized |
| `what did you say your name was?` | Recognized via `your name` | Same |
| `you said your name was?` | Recognized | Same |
| `what was your name again?` | Recognized | Same |
| `remind me your name?` | Recognized | Same |
| `your name again?` | Recognized | Same |

The only input-grammar addition is bounded `(u|you) said you are named`. It does not recognize unrelated `you said the pen is full?` or bypass ambiguous-target rules. With name knowledge committed, all repeat questions use ordinary known-name projection; no second controlled block or introduction is needed. A reciprocal bare self-name after the existing `I'm Nicco.` opportunity is accepted only with safe engine attribution; arbitrary conversation remains ineligible.

## 8. Knowledge commit

The unchanged commit-preparation stage receives `korvin` from the evidence detector and calls existing `learnCanonicalName` with told/source/time provenance. It prepares:

```json
[
  {
    "kind": "create_fact",
    "fact": {
      "id": "campaign_fact_identity_name_korvin",
      "content": { "kind": "canonical", "entity_id": "korvin" }
    }
  },
  {
    "kind": "set_knowledge",
    "knowledge": {
      "character_id": "nicco",
      "fact_id": "campaign_fact_identity_name_korvin",
      "status": "knows",
      "provenance": {
        "acquisition_kind": "told",
        "source_character_id": "korvin",
        "learned_at": 0
      }
    }
  }
]
```

The time above is the offline fixture's existing clock. No time/pacing behavior was changed. The whole candidate receipt is validated and committed by existing code. There is no direct mutation from the parser, draft grant, promotion, duplicate name store or controller-authored identity authority.

Tests assert detached preparation, committed fact/edge/provenance, and no name grant when an otherwise valid generated introduction is followed by controller failure. A real coordinator test also verifies pronoun-attributed multi-segment introduction through successful finalization. The exact live response regression exercises post-audit/delivered commit preparation directly; it does not change unrelated audits of the response's time/auction prose.

## 9. Next-turn projection

After the exact delivered introduction, an ordinary seller question is followed by the exact handshake/repeat-name input. The plan still addresses canonical Korvin, creates no temporary person, and exposes `player_known_name: Korvin` in the final prepared narrator request.

This is tested both with retained history and with an empty history argument. Canonical knowledge supplies the name; history text is not a name cache. Elara/Bartolomhew remain unknown and their names/aliases remain masked. The known-name path emits no controlled disclosure block.

## 10. Save/reload

After the realistic introduction, the test serializes the campaign snapshot and restores through existing `CampaignState.restore`. With no conversation history, re-addressing the same present actor by his unique observable description resolves Korvin, exposes his learned name and creates no duplicate. Existing save/name facts/edges are sufficient; no persistence code or schema changed.

As documented in P3.4, a fresh multi-person session still requires partner-identifying evidence rather than guessing a bare “you”. Name knowledge itself persists independently of that session focus.

## 11. Tests

- `npm run typecheck`: PASS.
- `npm test`: 2,175 passed / 2,179 total; failures 0; same 4 historical TODOs.
- `npm run test:playthrough`: 25/25 passed.
- Focused P3.5/P3.4/P3.3/P3.1/P3.2/P1.2 and save suite: 159/159 passed.
- New P3.5 tests: 46/46 passed.
- `git diff --check`: PASS.
- Paid calls: 0. Providers in integration tests are offline mocks.

No existing test/golden fixture or historical TODO was altered. Only the name-disclosure evidence module, new regression test, verbatim fixture and this report changed. Production models/routes, regeneration, pacing, P8/P9, opaque refs, P10 and P11 remain unchanged. Existing disclosure prompt wording was not edited.

## 12. Remaining limitations

Live verification of newly prepared production/alternate responses is pending. The deterministic trace reproduces missing knowledge; it does not establish why each historical model chose a particular replacement name.

Attribution is intentionally bounded and conservative. Unrecognized or competing subjects may prevent a grant. Same-segment bare-name-plus-extra-speech variant C remains unsupported. This is a targeted evidence fix, not a general dialogue/speaker parser or permission to learn names from narration, proper-noun references, quoted third-party names or inventions.

No claim is made about resolving unrelated auction/time prose, all model inventions or remaining opaque-ref leaks. P3.4's actor continuity implementation is unchanged.

## 13. Live verification checklist

1. Restart with this build, approach the canonical short compact seller with other sellers present, then ask `name's Nicco, who am i speaking with?`.
2. Permit a natural multi-segment response containing his valid own `Korvin.` or first-person introduction.
3. Inspect the committed canonical name fact/knows edge for Nicco and source Korvin. Confirm the new request carries `player_known_name: Korvin`.
4. Ask `Are you the only one seller around here?`, then the exact handshake/repeat-name question. Confirm Korvin remains bound/known, with no temporary duplicate or second disclosure capability.
5. Compare production/alternates on the newly prepared turn; pre-fix frozen regeneration requests do not test this fix.
6. Save/reload, explicitly re-address Korvin, and confirm no second introduction is needed. Ensure the other two sellers remain unknown.

P3.3: LIVE PASS; controlled disclosure contract unchanged, with the documented tiny repeat-request grammar extension. P3.4: unchanged and deterministically confirmed correct. P3.5: FIX IMPLEMENTED; live verification pending. P10: SOFT / unchanged. P11: PAUSED / unchanged.
