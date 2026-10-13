# P3.3 canonical name disclosure: final naming fix

2026-10-06. **FIX IMPLEMENTED; live verification pending.** Naming only. No paid provider calls. Production remains `z-ai/glm-5.2` with the existing pinned route and generation settings. P3.3 opaque refs unchanged; P10 SOFT / OBSERVATION unchanged; P11 SOFT / PAUSED unchanged. P8, P9, regeneration, pacing, physical-action expansion policy, time, auction and pricing are unchanged.

## 1. Live failure evidence

The user reported that `name's Nicco, who am i speaking with ?` caused unknown canonical sellers to introduce themselves with Cael, Marek, Sergen Voss or Varen, following earlier Henk/Varek failures. These are human playtest observations. This pass reproduces the exact player text with unknown Korvin as conversational target and Bartolomhew/Elara also present; it does not claim a paid model replay or possession of the original historical session snapshot.

## 2. Exact root cause

**The first failing step is the social/name-request detector, before candidate selection.** Its old regular expression recognized `my name's`, `I'm Nicco`, `your name`, and a few other phrases, but neither `name's Nicco` nor `who am i speaking with`. The detector returned immediately regardless of whether target resolution could safely identify Korvin. All compared models consequently received no truthful canonical self-name for this opportunity.

Two separate post-generation gaps also existed: the knowledge detector required a first-person introduction, rejecting a bare `Korvin.` answer; and its attribution verb list did not recognize `gives`, so `The short man gives Nicco a measuring look` was treated as an unresolved descriptor containing Nicco rather than the NPC subject.

## 3. Why previous controlled disclosure did not fire

Before edits, an offline trace of the existing build reproduced the market context with recent player address `I speak to the short compact man.`:

| Trace step | Before fix |
| --- | --- |
| Present canonical NPCs | Bartolomhew, Korvin, Mistress Elara |
| Current projected foreground | Korvin only |
| Interaction/target evidence | Unique recent observable-descriptor address to Korvin |
| Detector on exact live input | **FALSE: first failure** |
| Disclosure candidate selection | Not reached |
| Exactly one selected candidate | None selected, despite usable target evidence |
| Capability emitted | No |
| Canonical self-name attached | No |
| Narrator-facing insertion | No optional system disclosure block |
| Masking/compaction | Not responsible for this failure: there was no capability to remove |
| Prepared request name availability | No Korvin disclosure data; system and ordinary messages lacked Korvin |
| Restricted-use instruction | General identity rules remained, but the conditional self-disclosure instruction was absent |

The fully prepared pipeline is tested after the fix at the actual narrator-provider boundary. Knowledge-block reconstruction and reconciliation masking also retain the conditional system data. The old detector's immediate rejection is independent of unretained historical target details; the reproduced foreground is not claimed as a log of that historical session.

The old global `partners.length === 1` requirement was a secondary fragility. Foreground can include several inspected/active actors while an existing addressed/reference signal identifies one speaker. Targeting now selects from specific evidence rather than rejecting every broad foreground.

## 4. Target resolution logic

`canonical-name-disclosure.ts` reuses `SceneParticipantPlan`, resolved intent references, `projectNarratorFocus`, the current roster and bounded finalized `RecentConversation`. There is no new general targeting subsystem or name store.

Resolution order:

1. Explicit addressed IDs. Multiple addressed candidates fail closed; a distinct temporary speaker blocks canonical substitution.
2. Resolved current interaction/reference IDs. Conflicting candidates fail closed.
3. Current input's unique canonical/observable-descriptor target through existing focus projection.
4. Existing participant focus, then a unique current canonical foreground partner.
5. A unique explicit recent partner in the same location, within the existing two-turn inactivity bound. A multi-actor foreground does not override more specific partner evidence. Ambiguous recent targets do not yield a selected name.
6. Unique present canonical NPC only when no foreground or competing temporary/campaign speaker makes that fallback unsafe.

Existing participant planning can create a generic temporary `Man` from the same descriptor that also uniquely resolves to Korvin. Its automatic `you` continuation previously hid the stronger canonical partner evidence. A narrow exception applies only to one descriptor-less generic person created on the immediately preceding turn, where that same preceding player input uniquely resolves to the corroborated canonical foreground partner. Explicit generic-person readdressing, a distinct new temporary person, multiple candidates, or a nonmatching preceding turn blocks the exception. Participant creation/continuity itself is unchanged.

The social detector now recognizes the exact live phrase, `Who am I speaking with?`, speaking/talking-to variants, `Who are you?`, existing explicit name requests and the supported Nicco introductions, including straight/curly apostrophes. A safe current partner is still mandatory.

## 5. Final narrator-facing disclosure shape

Ordinary masked context retains `player_known_name: null` before discovery. A separate conditional system block contains only the selected speaker's correlation ref and allowed public self-name:

```json
{
  "ref": "NPC24",
  "canonical_name_available_for_disclosure": true,
  "player_knows_name": false,
  "canonical_name_for_own_spoken_introduction_only": "Korvin"
}
```

`NPC24` remains machine-only correlation, never output permission. No raw canonical ID is serialized in this capability. The instruction permits the supplied name only in that NPC's own truthful spoken self-introduction. It forbids use in descriptive narration, attribution, metadata, exposition, labels, thoughts, summaries and descriptions. It explicitly forbids an alternative personal name, surname, alias, title or nickname; the NPC may instead decline naturally. No introduction is forced.

Names are available only under the existing authored narrator/player visibility checks and outside confidential encounters. Aliases, private titles, affiliations and hidden history receive no new permission. The capability is system data attached after ordinary message masking, so knowledge compaction/reconstruction and reconciliation retain it without weakening ordinary masking.

## 6. Knowledge establishment behavior

The existing commit-preparation step still owns the detached validated batch. It now receives the same resolved intent signals as prompt construction, rather than recomputing disclosure with empty intent metadata.

Supported RPG evidence includes:

```text
*The short man gives Nicco a measuring look.*

I'm Korvin.
```

and, after an explicit name request:

```text
*The short man gives Nicco a flat look.*

Korvin.
```

Blank lines and single-newline RPG separation both work. No quotation marks are required. The adjacent narration subject must resolve uniquely to the same selected canonical NPC through existing observable-descriptor matching. Bare replies must equal the canonical name, rather than merely mention it. First-person introductions preserve the existing exact canonical-name requirement.

Successful delivered evidence uses `learnCanonicalName`, the existing entity-backed identity fact and Nicco `knows` edge, with told/source/time provenance. Commands are prepared and committed atomically with the normal turn. Subsequent ordinary naming and save/reload use that same knowledge. No duplicate NPC, alternative memory mechanism or alias grant is created. Failed drafts, relocated turns, refusals, invented names and ambiguous/unattributed speech do not establish the canonical name. Output is never rewritten or filtered to substitute names.

## 7. Multi-NPC safety

Tests keep Korvin, Elara and Bartolomhew present while addressing only Korvin. They cover explicit addressed IDs, resolved references, current observable descriptors and recent partner evidence, including a broad foreground. Only Korvin's self-name enters disclosure data; ordinary descriptions remain masked and other names/aliases remain absent.

## 8. Ambiguous-case fail-closed behavior

Two addressed sellers answering `Who are you?` yield no capability. The resolver never chooses the first actor from an ambiguous set or leaks all candidates. Distinct temporary speakers block stale canonical fallback. Known identities do not need a disclosure capability; private/confidential identities cannot obtain one. Refusals, third-party name mentions, wrong-speaker narration, generic ambiguous `the man`, and machine-ref attribution grant nothing.

## 9. Tests

- `npm run typecheck`: PASS.
- `npm test`: **2123 total, 2119 PASS, 0 failures, 4 existing TODOs**.
- `npm run test:playthrough`: **25/25 PASS**.
- Focused `p33-naming-final`, `p33-p11-live-evidence`, `p31-identity-gating`, and `p132-history-refs-background`: **55/55 PASS**.

New deterministic coverage includes the exact live player text reaching the actual final provider request, masked ordinary identity, only one disclosed name, explicit flags separating availability/knowledge, no raw IDs, unchanged opaque-ref prohibition, multi-NPC target precedence, ambiguity, distinct temporary speakers, optional reciprocated introduction, unique-present fallback, known identity, visibility/confidentiality, both required RPG reply forms, single-newline format, atomic name knowledge, canonical continuation, idempotence, save/reload, refusal/invented-name rejection, compaction and reconciliation.

Existing golden traces remain unchanged; no golden fixture or historical TODO was edited. The four TODOs remain the phantom ring via “them”, first-name-only condition attribution, unnamed captive price/legal-state requirement and fronted receipt-clause grammar. **Paid calls: 0.**

Changed files: `src/turn/canonical-name-disclosure.ts`, `src/turn/prompt-builder.ts`, `src/turn/stages/commit-preparation.ts`, `src/turn/turn-coordinator.ts`, `tests/p33-naming-final.test.ts`, and this report.

## 10. Remaining limitations

Live model adherence is not asserted by offline tests. Name knowledge intentionally remains conservative: a bare name without attributable narration, a descriptor matching several people, an unsupported attribution/action grammar, stale conversational evidence or an unclear temporary/canonical overlap grants nothing. The existing inactivity bound is unchanged. Name-only self-disclosure is not a license for private identity disclosure or general proper-noun discovery.

The original historical foreground/turn trace was not retained, but the exact detector failure was reproduced before edits and prevented activation independently of targeting. No generation filter was added to hide a model ignoring the now-present capability.

## 11. Live verification checklist

1. Restart the UI into the new build and send a **new** turn. Regenerating a pre-fix turn correctly reuses its old frozen request and does not test the new capability.
2. Address the short/compact man in the licensed seller area while the other sellers remain present. Send `name's Nicco, who am i speaking with ?`.
3. Verify a truthful Korvin reply or a natural refusal, never Cael/Marek/Voss/Varen/Henk/Varek. Check descriptive narration before discovery still uses visible traits and never emits machine refs.
4. After a clearly attributed successful introduction, continue conversation and verify ordinary known-name usage. Save/reload and confirm name-only knowledge persists without revealing other sellers' names or aliases/private titles.
5. Explicitly address two plausible sellers and verify no canonical disclosure until targeting is made unambiguous. Test a distinct temporary speaker to confirm no nearby seller is substituted.

P3.3 canonical naming: FIX IMPLEMENTED / live verification pending. P3.3 opaque refs: UNCHANGED. P10: SOFT / OBSERVATION. P11: SOFT / PAUSED.
