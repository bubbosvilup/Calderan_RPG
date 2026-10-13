# CANONICAL NPC CASTING / EPHEMERAL DUPLICATION — AUDIT + KISS FIX

**Status:** FIXED (engine-side casting only). No P-number. It belongs next to P3, but P3.3/P3.4/P3.5 semantics are unchanged.
**Date:** 2026-10-06 · **Paid calls:** 0

## 1. Problem statement

Canonical NPCs who plausibly occupy a scene role were duplicated by new ephemeral people with nearly the same observable description. P3 continuity then correctly preserved the wrong identity. The task was to find the **first** divergence and fix it there, without weakening P3, without fuzzy or semantic identity, and without narrator changes.

## 2. Playtest evidence

The UI playtest uses a disposable campaign and keeps no transcript or receipts, so the exact historical turns are unavailable. Both cases were therefore **reconstructed deterministically** from the described shapes:

- **Case A (Elara/Vaelra):** "a woman with a decorative fan" later named herself Vaelra. A subsequent Elara-looking woman was treated as Vaelra.
- **Case B (Korvin/Harren):** a short seller with damaged hands, a hooked nose and small perceptive eyes was not Korvin, and a clerk later called the stock "Harren's".

Reconstruction harness: [scripts/casting-trace.mjs](scripts/casting-trace.mjs). It uses the real `data/` world, real `TurnCoordinator`, scripted narration and no controller. Traces: [trace-before.json](docs/evaluations/canonical-casting/trace-before.json) and [trace-after.json](docs/evaluations/canonical-casting/trace-after.json), each covering 11 engagement phrasings across both cases.

## 3. Elara / Vaelra trace (before the fix)

| Stage | Finding |
|---|---|
| 1 Location | `calderan_slave_market`, Late Morning. |
| 2 Eligible | Mistress Elara is present through authored base location, in every variant. |
| 3 Narrator-visible | Yes. Unaddressed, she is in `[BACKGROUND PRESENT]` as NPC31. |
| 4 Descriptor supplied | `the unfamiliar woman: Long straight platinum-blonde hair, green-hazel eyes, elegant expensive clothing and a decorative fan`. The narrator's Elara-like woman **is this label rendered as prose**. |
| 5 Plan before narration | Depends on phrasing; see the table below. |
| 6–7 Mentions / extraction | `readScene` keys the narrated person as `other:woman`. Canonical Elara, with no player-known name, is never a narration subject. |
| 8–10 Canonical match | `canonicalInteractionTargets`: a legacy verb (approach/look at/speak to…) plus every phrase term contained in the appearance, unique. |
| 11–12 Ephemeral creation | `SceneParticipants.plan`: a participant verb (incl. walk/go up to) plus "the woman" creates `P1 Woman`. The duplicate guard re-checked only the matched span (`approaches the woman`). |
| 13 Continuity | The narrator received `P1 - Woman (current conversation partner). Temporary…`. A temporary partner has no canonical name, so the model invents one (Vaelra). P3.4/dialogue continuity then carries it. |
| 14 Disclosure | Only for the canonical target; it was never offered for the duplicate. |
| 15 Later turns | "I am looking for Mistress Elara" targets Elara by name, but the conversation history already binds the fan woman to "Vaelra". |

| Engaging phrase | Canonical target | Plan created | Narrator received |
|---|---|---|---|
| A1 `*approaches the woman with the fan*` | Elara | **P1 Woman** (focus) | Elara foreground **and** P1 Woman as conversation partner: the same person twice |
| A2 `*walks up to the woman with the fan*` | none (verb gate) | **P1 Woman** | Elara background, P1 Woman partner |
| A5 `*goes up to the woman with the decorative fan* Who are you?` | none | **P1 Woman** | no disclosure; P1 partner asked for a name |
| A3 `*walks over to the platinum-haired woman*` | none | none | nobody engaged |
| A4 `*approaches the platinum-blonde woman with the decorative fan*` | Elara | none | correct, with disclosure |

## 4. Korvin / Harren trace (before the fix)

Korvin is eligible and present, in the background as NPC24, label `the unfamiliar man: Short and compact, with a manual-labor appearance, large damaged hands, a hooked nose and small, mobile, perceptive eyes`. The narrated back-row seller is that label rendered as prose.

| Engaging phrase | Before |
|---|---|
| B2 `*walks up to the seller*` · B3 `*approaches the seller*` | No target: "seller" is a stop-term with no own descriptor, and the planner has no "seller" role, so nobody is created. Korvin stays background while the narrator keeps playing "the seller". |
| B4 `*walks over to the man with the hooked nose*` | No target (verb gate) |
| B1/B5 `*approaches the short (compact) seller/slaver with the hooked nose*` | Korvin (correct) |

So the Korvin-like seller is an unbound narrated person. Neither the "Harren" line nor its possessive form matches any engine naming pattern, so **no engine record of Harren exists**. The identity lives only in narration and dialogue history. That is the "local seller who later derives another identity".

## 5. First divergence

Both cases diverge at the **same stage**: player-input canonical reference resolution, before narration, inside `canonicalInteractionTargets` and `SceneParticipants.plan`. That is earlier than naming, promotion, disclosure or continuity. There are three concrete defects:

1. **Duplicate guard truncation (A1).** The guard checked `canonicalInteractionTargets(context, m[0])`, where `m[0]` is only "approaches the woman". It never saw "with the fan", so a temporary duplicate was created even though the turn had already targeted Elara.
2. **Narrow verb gate (A2/A3/A5/B4).** Descriptor resolution ran only for approach/look at/inspect/examine/address/speak to/talk to. The planner itself creates people with a wider verb set (walk up to, go up to, turn to, ask…), so the canonical check never ran exactly where a duplicate was created.
3. **No narrated-mention link (B2/B3, and A2).** A definite reference ("the seller", "the woman with the fan") points at the person the *previous narration* described. That description, often the narrator echoing the canonical label, was never used as evidence.

## 6. Existing canonical eligibility rules

Eligibility is the authoritative scene: `TurnContext.characters`, from runtime placement and authored base/work locations, through `buildTurnContext`. It was correct in every trace. No new location authority was added, and matching never searches the world beyond present actors.

## 7. Existing observable descriptor path

`registerNarratorIdentities` exposes `observable_label` (first appearance sentence) and `observable_appearance` (the full authored appearance) per canonical NPC. P6 renders unaddressed actors in `[BACKGROUND PRESENT]` with that label. These authored fields are the only identity evidence used: no NLP, embeddings or fuzzy search.

## 8. Existing ephemeral creation path

- **Player input** goes through `SceneParticipants.plan` (session-local temporary participants, never persisted).
- **Narration** goes through `readScene`/`establishNames`, which promote a narrated person only when a proper name is securely established, and never for a canon name.

Both paths were left intact. The fix only decides, at planning time, whether the engaged person is an eligible canonical actor.

## 9. Root cause

The **shared root cause**: canonical reference resolution, the boundary that should run *before* a new person is created, (a) used narrower verbs than the creator, (b) re-checked only a truncated phrase, and (c) ignored the narration the reference points to. When the narrator echoed a canonical actor's label as prose, any engagement outside the legacy verb set produced a duplicate or an unbound actor. The narrator then named that person freely, and P3 continuity preserved the result.

## 10. Chosen KISS rule

All changes are in [canonical-interaction-targets.ts](src/turn/canonical-interaction-targets.ts), plus two call sites.

**Strong unique match** (`strongCanonicalMatch`):
- The actor's authored appearance is split into **traits** at commas, "and", "with" and semicolons ("a hooked nose" = 1 trait; "small, mobile, perceptive eyes" = 3). A trait matches when one of its *distinctive* words appears in the mention. Body-part and apparel heads (hair, eyes, hands, nose, clothing…) never count alone.
- **Strong** means at least **3 traits** matched, **exactly one** eligible candidate reaching that, and **no other** candidate with even 2. Sex must be compatible (the head noun woman/man vs the authored pronoun), and role must be compatible (a role head such as seller/guard/clerk must fit the authored summary; unknown roles fail closed).

**Where it applies:**
1. **Engagement verbs:** the planner's own creation verbs (walk/go/head over or up to, turn to, ask, greet, hail, call to, wave at, point at, follow…) plus the legacy verbs. If the phrase itself strongly matches, that actor is the target.
2. **Narrated-mention link:** a *definite* reference ("the/that/this …noun") whose head noun appears in **exactly one** sentence of the latest finalized scene narration. Every distinctive word the player used must occur in that sentence. That sentence is then scored with the strong rule. "another/some/one" never link.
3. **Duplicate guard:** `plan()` now judges the full reference clause plus the narrated link before creating a temporary person.

**Unchanged:** the legacy explicit-descriptor rule (legacy verbs, every term contained, unique) is kept byte-for-byte, because P3.3/P6.1 regressions lock it (§12).

`plan()` received an optional `recent` parameter, passed by the coordinator, and `projectNarratorFocus` uses the same casting options. Nothing is persisted and there is no new state.

## 11. Why weaker alternatives were rejected

- **Token counting** ("2 words → canonical"): "hooked nose" would cast Korvin from one trait.
- **Retroactive rewrite** (Vaelra → Elara): rewrites established history; forbidden and unsafe.
- **Reserving canonical first names:** a name collision is not identity (see the Mira observation in §20).
- **Broad fuzzy matching or embeddings:** out of scope, and unnecessary when the authored appearance fields already exist.
- **Weakening P3.4 continuity:** continuity was correct. Casting was wrong.
- **Narrator prompt changes:** the defect was engine input, and the narrator's behavior was rational given a temporary partner.

## 12. Why P3 was not changed — and a conflict to decide

P3.3 (`canonical-name-disclosure.ts`), P3.4 continuity and P3.5 name commit are untouched. Once the correct actor is cast, P3.3 offers the canonical self-name (A3/A5 now get `Mistress Elara` disclosure), and P3.4/P3.5 continue that actor.

> **Conflict surfaced:** the brief's Regression C wants "short seller", "blonde woman" and "woman with fan" never to cast. The **pre-existing** legacy rule already casts on a single unique term with legacy verbs: P3.3 test *"I speak to the short man"* → Korvin, and P6.1 *"looks toward the white-blond seller"* → Bartolomhew. Tightening it would break locked P3.3/P6.1 regressions, which this pass may not do. So:
> - **every new path** honors Regression C (3 traits or more);
> - the legacy explicit-targeting rule is preserved as-is.
>
> Whether to tighten the legacy rule is a product decision: it means changing those P3.3/P6.1 expectations.

## 13. Weak-match regressions

**Weak matches never cast** (Regression C, in [canonical-casting.test.ts](tests/canonical-casting.test.ts)). Each of these narrated people, engaged via new-path verbs, still yields a temporary participant:
- a blonde woman with a fan;
- a woman with a fan;
- a short man;
- a man with scarred hands;
- a woman with green eyes and expensive clothes.

`strongCanonicalMatch` returns nothing for 8 weak phrases, including "the man with a hooked nose" and "the blonde woman with a fan". Trait counting is per trait: "a hooked nose" = 1, "large damaged hands" = 1.

## 14. Strong-match regressions

- **Elara (A):** four phrasings now cast Elara, with no temporary duplicate and no `[SCENE PARTICIPANTS]` block. Asking her name offers `Mistress Elara` self-disclosure; the name stays masked elsewhere. At the inn, where she isn't eligible, the same description stays a temporary person.
- **Korvin (B):** "walks up to / approaches the seller (and asks…)" casts Korvin; so does the direct strong description "the short, compact man with large damaged hands and a hooked nose". At the inn, Korvin is not cast and Jessa Rook (1 trait) is not addressed.
- **Evidence-based, not hardcoded (E):** a narrated tall man with blond-white hair, clerical tonsure and paternal smile casts **Bartolomhew**. The same Elara traits on "a man" fail (sex), and Korvin's traits on "a guard" fail (role).
- **Explicit names (F):** "Korvin, …", "walks up to Mistress Elara" and "approaches korvin" resolve as before.

## 15. Ambiguous-match behavior

- **Two candidates (D).** A description evidencing two present canonical actors (Korvin's build and hands plus Bartolomhew's tonsure and smile) casts **neither**.
- **Two narrated people.** Two narrated women in the same narration leave "the woman" unresolved. No arbitrary pick, only existing behavior.

## 16. Ephemeral continuity behavior

**Regression G.** An established temporary woman (red scarf) keeps the definite noun "woman", even after a later narration strongly describes Elara. Head nouns owned by a carried participant, or by a promoted person's `established_origin`, are never re-cast. Narrator-created names remain valid for genuinely new people.

## 17. P6 interaction

Casting one actor foregrounds only that actor. The other present canonical actors stay in `[BACKGROUND PRESENT]`, and mere presence never foregrounds. The P6 single-partner "you" rule is untouched; it explains Jessa's foreground at the inn independently of casting.

## 18. Tests

| Suite | Result |
|---|---|
| Typecheck | pass |
| `npm test` | **2,366 tests, 2,363 pass, 0 fail, 3 TODO** (13 new; the 3 historical TODOs preserved) |
| `npm run test:playthrough` | 25/25 |
| Focused: casting, P3.1/P3.3/P3.4/P3.5, P6.1, NPC+ P6, participants, narrated/promotion, naming, identity, recent, NarrativeContext, P12.1, P12.2, golden, UI/session (21 files) | **353/353** |
| Build | pass |

Golden pipeline traces and all prior fixtures are unchanged.

## 19. Paid calls / cost

**0 calls, $0.00.** The one remaining unknown is whether GLM stops inventing names once the canonical actor is cast. That reduces to the already-validated P3.3 shape: a foreground canonical actor plus controlled self-disclosure. The defect was proven, and is fixed, entirely in deterministic engine input.

## 20. Remaining limitations

- **One-trait descriptions.** References that carry only one trait, plus a noun the previous narration didn't use (B4 "the man with the hooked nose" after narration said *seller*), stay unresolved. That is conservative by design.
- **Narrator-initiated introductions.** A narrator that introduces a canonical-looking person who speaks first, with no player engagement, can still get a narrated name. There is no engagement boundary at which to cast. This is rarer, and P3's canon-name guard still blocks canon names.
- **Contradictions are not detected.** A "tall man with damaged hands, a hooked nose and small eyes" can still cast Korvin on 3 traits. Sex and role are the only incompatibility checks.
- **Mira collision (observation only).** A new captive named "Mira" while canonical Mira Thorne exists is a first-name coincidence, not identity evidence. Not changed.
- **Existing duplicates are not repaired.** Duplicates created in past sessions are not rewritten (deliberately).

## 21. Separate follow-up bugs (explicitly NOT fixed here)

1. **Plural/natural player travel to Heartstone.** "they both walk to the heartstone" was narrated as travel while the UI/runtime stayed at the Slave Market.
2. **Unaffordable purchase.** Nicco, with 500G, narratively completed a 1050G slave purchase. The authoritative purse/`transfer_person` rejects such a sale, so this is likely an `asserts_uncommitted_purchase` audit gap or a narration/state divergence. It needs its own trace.
