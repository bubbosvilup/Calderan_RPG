# D-09 qualifying reflection eligibility

Date: 2026-10-05, Europe/Rome. **OFFLINE ELIGIBILITY PASS FOR THE RELATIONSHIP FALLBACK ONLY. D-09 remains SOAK PENDING; REFLECTION_USEFULNESS_CONCERN remains. Paid calls: 0.**

The current parser can establish a valid two-statement synthesis, but its combined meaning is already present in ordinary compact NPC+ context. Do not use that self-statement case for another paid A/B. A separately prevalidated relationship trajectory offers a plausible later marginal-value opportunity without deleting raw authority, changing production or supplying Iris's reactions in player text. Realization and material benefit remain unproved.

The [previous matched pair](D09_FINAL_MATCHED_NARRATION_ABLATION.md) remains a VALID NEGATIVE RESULT: WITH lost to WITHOUT. The [unique-value follow-up](D09_UNIQUE_VALUE_MATCHED_ABLATION.md) remains INCONCLUSIVE BEFORE A/B, including its disclosed indexing/interruption deviation. Neither result is reinterpreted. This offline construction is not gameplay evidence, provider realization, production reflection persistence, later retrieval or narration benefit.

## CURRENT AUTHORITY PATH

The audit uses current production functions, not assumptions from earlier model outputs:

| Step | Exact source | Relevant behavior |
|---|---|---|
| Quote/speaker extraction | `src/turn/narrated-captives.ts:63`, `presentPeople:117`, `narrationUnits:139` | Straight or curly double quotes, 1-800 characters, no embedded newline. Named before/after speech clauses or established subject history attribute quotes. Sex-compatible pronouns follow subject history; a bare quote has no automatic Iris attribution. |
| Contract extraction | `src/turn/character-contracts.ts:21`, `contractCommands:30` | Only quoted first-person sentences from a present active NPC+; exact anchored patterns, no question/hedge/hypothetical sentence. No generic statement-recording command. |
| Finalization | `src/turn/stages/commit-preparation.ts:26`, `prepareCommit` | Extracts contracts from DELIVERED narration; joins validated commands in one prepared/committed turn receipt. Failed contract preparation is observable and drops contracts, never silently changes them. |
| Stable authority | `src/campaign/premium-characters.ts:42`, `contractSet`; `preparePremiumCommand:63` | Personality, voice, social style are set once. Moral boundaries accumulate distinct normalized strings, case-insensitive equality. No rewrite/deletion or semantic paraphrase comparison. |
| History creation | `src/campaign/premium-characters.ts:94`, `developments`; `syncPremiumCharacters:174` | Authoritative contract evidence records next committed revision. Diff appends `contract_established` in that same revision. Rejected extraction creates no statement event. |
| Source handles | `src/turn/npc-plus.ts:127`; `src/turn/structured/reflection-v2.ts:19` | `npcmem:<id>:contract:<index>` identifies exact quote evidence. Statement identity is `statement:<id>:<revision>:<field>`; event handle is `npcmem:<id>:history:r<revision>.<ordinal>`. |
| Exact provenance | `src/turn/structured/reflection-v22.ts:15`, `statementProvenance:17` | Subject/owner, field, revision, unique statement identity, and exact event identity must agree. Event and linked quote are one statement authority, never two. |
| Citation visibility | `src/turn/structured/reflection-v23-cvc.ts:18`, `reflectionCitationContext` | Typed exact provenance on a visible event can expose the quote selector even if the standalone quote row is omitted. Arbitrary strings or guessed handles do not expose selectors. |
| Production request | `src/turn/structured-reflection-maintenance.ts:37`, `captureProductionReflection` | Builds actual catalog and scoped request. Linked standalone quote rows are omitted; their selectors remain visible through typed event provenance. Visibility of selectors does not mean full quote rows are sent. |
| Wire / semantic validation | `src/turn/structured/reflection-wire-v2-cvc.ts:5`; `reflection-v23-cvc-e1.ts:34,64,72`; `parseProductionReflection:18` | Wire enums use finalized visible selectors. Self branch needs at least two selectors; semantic validation separately requires independent revisions/identities, safe exact quotes and bounded deterministic rendering. |

Negation is not uniformly rejected: categorical negatives such as `I don't like noise` and `I won't hurt children` are supported patterns. `I would never ...` / `I'd never ...` receive the specific leading exemption from the hypothetical gate; other hypotheticals remain rejected. Questions, `if`, uncertainty cues and unsupported extra clauses prevent the corresponding sentence from matching. See `src/turn/language/gates.ts:48,54`. Sentences inside a quote are checked independently; an accepted clause does not authorize neighboring unsupported prose.

Existing source tests audited: `tests/npc-plus-pass-2.test.ts:114` (supported/unsupported forms and a complete committed turn), `:124` (evidence, history, set-once contradiction); `tests/reflection-v22.test.ts:6` (exact provenance, ambiguity and independent revisions); `tests/reflection-citation-visibility.test.ts:36` (visible event selectors/forged exposure); `tests/production-structured-reflection.test.ts:72` (hidden quote rows with visible selectors); `tests/reflection-v2.test.ts:69` (synthesis versus restatement). Some reflection tests seed arbitrary contract text with commands; those tests do NOT prove that arbitrary quoted utterances match `contractCommands`. The new fixtures prove actual extraction/finalization reachability.

## SUPPORTED STATEMENT FORMS

- Moral boundary: supported auxiliary plus categorical refusal, one allowed verb (`hurt`, `harm`, `kill`, `strike`, `beat`, `abuse`, `betray`, `steal from`, `lie to`, `abandon`, `sell`, `torture`) and the bounded ASCII object pattern. Situational pronoun objects such as `you` are excluded. Examples proved: `I won't hurt children.`, `I would never harm children.`, `I shall not torture prisoners.`
- Voice habit: `I [always] speak plainly/frankly/bluntly/softly/quietly/honestly/my mind`, or `I don't/do not mince words`.
- Social preference: `I don't/do not/never like/trust/care for` followed by the listed category (`crowds`, `strangers`, `nobles`, `soldiers`, `mages`, `noise`, `company`, `people`). Normalizes to `dislikes ...` or `distrusts ...`.
- Self-description: `I've/I have always been` followed by the restricted one/two-word pattern. It does not support general `I am ...` descriptions.

Definitely rejected in the tested framing: `I prefer quiet.`, `I want to rest.`, `I am stubborn.`, `I always tap my fingers.`, `I won't hurt you.`, conditional/hedged/question forms and third-person/unattributed/Nicco statements. Generic prefixes such as `I won't ...` or `I always ...` alone are **ambiguous/unsupported**: acceptance depends on the exact complete supported form and context. A typographic apostrophe in `won't` is not accepted by the current ASCII contraction pattern, though curly double-quote framing is supported. No grammar was expanded.

## OFFLINE FIXTURE MATRIX

**32 framing/candidate cases: 15 accepted, 17 rejected.** Thirteen lexical candidates were accepted across all four contract fields; two additional quote/attribution cases were accepted. All ran through `contractCommands` plus actual `prepareCommit` and `CampaignState.commit`, without any provider. Each case starts a fresh offline active/present Iris fixture, not a historical gameplay save.

| # | Category / utterance or narration | Result | Contract / normalized value |
|---|---|---|---|
| 1 | moral_boundary: `I won't hurt children.` | ACCEPT | moral_boundary: never hurt children |
| 2 | moral_boundary: `I will never betray friends.` | ACCEPT | moral_boundary: never betray friends |
| 3 | moral_boundary: `I would never harm children.` | ACCEPT | moral_boundary: never harm children |
| 4 | moral_boundary: `I'd never abandon children.` | ACCEPT | moral_boundary: never abandon children |
| 5 | moral_boundary: `I shall not torture prisoners.` | ACCEPT | moral_boundary: never torture prisoners |
| 6 | personal_habit: `I always speak plainly.` | ACCEPT | voice: speaks plainly |
| 7 | personal_habit: `I speak softly.` | ACCEPT | voice: speaks softly |
| 8 | personal_habit: `I don't mince words.` | ACCEPT | voice: speaks plainly |
| 9 | social_preference: `I don't like noise.` | ACCEPT | social_style: dislikes noise |
| 10 | social_preference: `I do not trust strangers.` | ACCEPT | social_style: distrusts strangers |
| 11 | social_preference: `I never care for crowds.` | ACCEPT | social_style: dislikes crowds |
| 12 | self_description: `I've always been stubborn.` | ACCEPT | personality: stubborn |
| 13 | self_description: `I have always been patient and careful.` | ACCEPT | personality: patient, careful |
| 14 | personal_habit: `I always tap my fingers.` | REJECT | -: - |
| 15 | intention: `I want to rest.` | REJECT | -: - |
| 16 | intention: `I will take a quiet break.` | REJECT | -: - |
| 17 | refusal: `I won't hurt you.` | REJECT | -: - |
| 18 | social_preference: `I prefer quiet.` | REJECT | -: - |
| 19 | self_description: `I am stubborn.` | REJECT | -: - |
| 20 | hedge: `Maybe I've always been stubborn.` | REJECT | -: - |
| 21 | conditional: `If they pressure me, I will never hurt children.` | REJECT | -: - |
| 22 | question: `Would I ever hurt children?` | REJECT | -: - |
| 23 | negation: `I don't always speak plainly.` | REJECT | -: - |
| 24 | unsupported_clause: `I don't like noise because it distracts me.` | REJECT | -: - |
| 25 | refusal: `I won't talk now.` | REJECT | -: - |
| 26 | situational: `I don't like this.` | REJECT | -: - |
| 27 | typographic_contraction: `I won’t hurt children.` | REJECT | -: - |
| 28 | unquoted: `Iris always speaks plainly.` | REJECT | -: - |
| 29 | unattributed: `"I always speak plainly."` | REJECT | -: - |
| 30 | wrong_speaker: `Nicco says, "I always speak plainly."` | REJECT | -: - |
| 31 | curly_quotes: `Iris says, “I always speak plainly.”` | ACCEPT | voice: speaks plainly |
| 32 | pronoun_attribution: `Iris looks at Nicco. "I always speak plainly," she says.` | ACCEPT | voice: speaks plainly |

`fixture-matrix.json` records normalized fields, acceptance, exact statement refs, complete source event/provenance, before/after revisions and bounded reason for every row. Rejection reasons are derived from inspected predicates; extraction itself returns an empty command list, not a detailed diagnostic. In these isolated command-only proof cases accepted contracts advance r2 to r3; rejected extraction does not advance the state. Live turn housekeeping/maintenance may advance other revisions independently.

Duplicate/near-duplicate checks also pass: `I will never hurt children` followed by `I won't hurt children` is skipped because the normalized boundary is identical; `hurt` versus `harm` is NOT semantically deduplicated. Such paraphrases must not be chosen as supposedly independent meaningful content. A later voice contradiction is skipped, preserving the original quote/value. Two different contracts in one revision do not satisfy self synthesis.

## SELECTED TWO-STATEMENT CASE

A: **I don't like noise.** -> `social_style`, `dislikes noise`, origin r3, selector `npcmem:campaign_character_iris:contract:0`, event `npcmem:campaign_character_iris:history:r3.0`.

B: **I always speak softly.** -> `voice`, `speaks softly`, origin r4, selector `npcmem:campaign_character_iris:contract:1`, event `npcmem:campaign_character_iris:history:r4.0`.

Distinct content: aversion to noisy surroundings versus the speaker's own usual manner of speaking; coherent common issue: managing a difficult conversation without loud pressure. These are not duplicates or synonym substitutions. Both quotes arise from recognized emitted forms through normal deterministic finalization. Revisions are offline proof stamps; automatic live maintenance would shift numbers but preserve separate authorities.

## SYNTHESIS ELIGIBILITY

**PASS for self_statement_synthesis.** Exact proposal cites both statement events and selects both linked quote handles; canonical E1 schema, production parsing/CVC and frozen V2.3-CVC-E1 semantics accept. Rendering:

> Iris explicitly stated: "I don't like noise."; "I always speak softly.".

Two authorities, two identities, two revisions; no quote/event double-counting. Event-as-statement selector, duplicated selector and same-revision examples reject. A compatible joining-event context citation is accepted: **0 observed contextual false rejections in that explicit test**, not a claim about all possible extra citations.

No reflection provider was instantiated, no reflection memory edited, and no stored reflection note created. Only the authoritative statement state is locally constructed using production commands/helpers; the accepted proposal is a local validator input. It proves reachability conditional on emitted narration, not provider realization or D-09 persistence/benefit.

## REQUEST/WIRE ELIGIBILITY

**PASS.** `captureProductionReflection` exposes both exact selectors via matching typed event provenance. Its standalone quote rows are omitted as in production; both handles nonetheless appear in `citation.statement_refs` and scoped wire enums. No guessed hidden handle is required. Canonical proposal passes actual request-scoped wire and production parser unchanged. Full catalog, request, visibility resolutions and wire are retained in `request-wire-eligibility.json`.

## REFLECTION-DUE PLAN

Self route: **0 additional developments after the second contract**. `reflectionDue` (`src/turn/reflection.ts:37`) has independent alternatives: at least three developments newer than last reflection, a newer rollup revision, OR any new contract evidence revision. The first contract itself is due and may yield a normal valid-empty attempt. The second later contract remains new after that maintenance source and is due again. No third event, rollup change, cursor adjustment or manual trigger is needed.

Relationship fallback: joining plus two respect changes reaches the existing three-development threshold. If first maintenance completes after the two changes, **three genuine newer changes** make reflection due again. The plan's three later wariness changes provide that count; the offline catalog verifies it. No trigger policy is modified or lifecycle entry injected after setup.

## LATER-USE PLAN

**Self route: DO NOT RUN A/B.** The normal later prompt contains both `voice: speaks softly` and `social style: dislikes noise` in the same compact Tier B source. It already expresses the two underlying meanings; exact attribution/quote wording alone is not material marginal value. The complete production-built normal prompt is retained. This self case is **MARGINAL_VALUE_NOT_TESTABLE** despite successful authority/semantic/wire eligibility.

**Selected route: prevalidated relationship_trajectory fallback.** Two current-schema controller proposals for respect increases pass actual `parseControllerEvidenceProposal`, `deriveTurnEvidence`, `authorizeWithEvidence` in the current production default hybrid mode (`turn-coordinator.ts:143`), deterministic final preparation and commit. Fixture emissions are explicitly Iris's own attributed respect/admiration dialogue, not Nicco's opinions or unsupported trust changes. Later wariness emissions use supported own-actor `stiffens` / `relaxes near` forms. The controller still must emit matching proposals in a future real run; these offline proposals are not gameplay evidence.

The frozen validator and request-scoped wire accept the resulting respect trajectory:

> Iris's recorded respect toward Nicco: none → moderate across 2 increases.

After three newer wariness changes, the normal compact source has **current respect moderate** and those newer changes, but **no compact respect trajectory**. Actual `buildTurnContext`/`buildNarratorPrompt` output confirms this; no raw statement, history or recent conversation was removed. Full raw five-turn conversation was supplied to the production prompt builder, which uses its normal dialogue-focused rendering. The historical growth from none to moderate over two increases could add continuity when asking for counsel; current moderate respect alone flattens that development. This is plausible potential, not demonstrated material benefit. A current relationship contrast alone remains redundant and is not selected.

The original two-event respect history is compactly present immediately after turn 2; that earlier opportunity is deliberately NOT an eligible A/B case. Three real later relationship events are the minimum here to displace both early respect tokens under unchanged rank/three-entry Tier B packing. No count-only lifecycle/environmental notes are used.

Predeclared ordinary player prompts, all in Heartstone F1 with no movement:

1. Iris, before we decide anything, I make room for your opinion and agree to hear a disagreement. How do you regard that way of handling a decision?
2. Iris, I take your concern seriously and work through the practical details carefully. How does my handling of it affect what you think of my judgement?
3. I raise my voice while describing my side of the disagreement, then leave Iris room to reply.
4. I lower my voice and apologize for making the conversation uncomfortable. Iris, you may answer at your own pace.
5. I press my point once more and ask Iris for a direct answer, then listen.

Then ONE later-use prompt:

> Iris, I would like your counsel before deciding how to handle a difficult disagreement. How should we approach it together?

Target **6 finalized turns, at most 8 total submitted attempts**. Failed/interrupted submissions count against the cap. Player wording does not supply Iris's exact answers or reactions and contains no contract/reflection/ref/evaluation vocabulary. Topic-only contingencies are limited to the remaining cap; if required authority does not emerge, stop without forcing states or tuning. Provider realization is not guaranteed.



The two predeclared topic-only contingencies, used only if a required development is missing and the total submitted-attempt cap still permits the later turn, are:

- Iris, what do you think of the way I have listened and worked through your concern?
- Iris, I stop arguing my side and give you room to say how you feel about this exchange.

After EVERY awaited turn, inspect authoritative history and exact statement provenance using `scripts/d09-eligibility-checkpoint.mjs`. Record the first contract; after a second distinct relevant contract at a later revision, STOP self-statement development and validate it separately. One/none by the bound stops that route; no manual reflection/ablation. For the fallback, stop developing respect once the two target increases exist. The subsequent three interactions are a later-use/packing-isolation phase, not extra attempts to increase respect. Observe normal automatic reflection maintenance; never suppress or force it. The bound and original authority checks still apply.

## MARGINAL-VALUE CRITERION

Future A/B may run only if **all** are verified in the exact actual normal request: useful accepted/persisted target; full rendered note packed; relevant later interaction; no other compact source (including unrelated memories, retrieval and conversation summaries) gives substantially the same combined meaning. Raw individual statements/events may remain and must not be removed. If any prerequisite fails, stop as **MARGINAL_VALUE_NOT_TESTABLE** (or missing authority/retrieval blocker as applicable), not a predictable redundant A/B.

Any future matched requests must differ only by the targeted reflection entry, preserve all raw authority and ordinary history, use identical generation settings, blind assignment until review freeze, and ground any WITH advantage in actual authoritative events. Style, quote repetition, prose length, lucky staging or generic friendliness cannot close D-09. No closure gate is lowered.

## INSTRUMENTATION FIX

`scripts/d09-evidence-artifacts.mjs` is an evaluation-only artifact store integrated into both unique-value initial/resume runners. It scans captured numeric filenames on open (including unfinished reservations), advances from the captured maximum instead of completed-turn counter 19, and reserves request files with exclusive `wx` BEFORE dispatch. Concurrent/resumed writers skip collisions instead of overwriting. Receipt files also use exclusive writes and must match request ID, turn and role. Audits identify missing/orphan/duplicate/malformed artifacts; pending calls receive immutable interrupted markers with UNKNOWN billing until a receipt exists. Late receipts remain associated with the original request.

The resume cost accumulator now derives from immutable receipt files, rather than a hardcoded incomplete subtotal or a potentially unflushed mutable ledger. A failure after a receipt is captured cannot append a second outcome for the same physical request. Earlier execution artifacts/receipts are unchanged; this fix does not reconstruct overwritten historical bodies or invalidate the prior results.

A separate exclusive submission reservation counts failed/interrupted attempts before `submitPlayerInput`, with a hard cap (8 for the future plan). The future runner must use it and stop at awaited turn boundaries; no external process kill merely to adapt a plan. The existing historical runners retain their past gameplay plans and run-start guards; they are not the new live plan and were not executed here.

Focused harness regression tests: **7/7**: captured request 20 resumes at 21 with byte-preserved original; concurrent unique reservations; receipt identity/exclusivity; crash reservation plus late receipt; malformed reservation/orphan audit; interrupted eighth submission prevents a ninth dispatch; immutable cost receipts survive a lost mutable ledger flush. Temporary cleanup checks resolved paths remain under the intended temp directory. `scripts/d09-qualifying-reflection-eligibility.mjs` also asserts read-only first/second statement checkpoints and separate revision requirements.

## DECISION

| Gate | Result |
|---|---|
| A: at least two distinct current-parser statement forms reachable | PASS: 13 lexical forms across four fields |
| B: two-statement state passes frozen synthesis semantics | PASS |
| C: production request/wire exposes/selects both | PASS |
| D: later plausible unique marginal-value case | Self: FAIL due compact equivalence; separately prevalidated relationship fallback: PASS |
| E: evaluation resume/index fix | PASS, 7 focused regressions |

**ELIGIBILITY GATE: PASS FOR THE RELATIONSHIP FALLBACK ONLY.** Preferred self case has authority/semantic eligibility but fails marginal eligibility; do not run it. No offline state/output counts as D-09 closure evidence. D-09 remains **SOAK PENDING**, with previous REFLECTION_USEFULNESS_CONCERN unchanged.

If subsequently requested, next step is ONE final bounded live sequence using the exact relationship fallback plan and checkpoints, with actual eligibility/marginal-value verification before A/B. **This task authorizes and performs no live run.** If actual provider outputs fail to realize the prevalidated forms/developments or packing is redundant, stop within the cap; no automatic rerun/tuning.

Fresh validation: `npm run typecheck` PASS; `npm test` **2,008 passed, 0 failures, same 4 existing TODOs** (2,012 total); `npm run test:playthrough` **25/25**; focused harness **7/7**; offline proof assertions PASS. Existing TODOs: group-pronoun phantom transfer; first-name condition attribution; unnamed captive price over-redaction; fronted-adverbial receipt false negative. No new production TODO or unrelated debt change.

**Paid/live narrator/controller/extractor/reflection/reviewer calls: 0 each.** The proof process blocks `fetch` and asserts zero attempts; it imports no production dependency factory or provider implementation. Production `src/`/`data/` SHA-256 values are verified unchanged. No credentials or hidden reasoning stored.

Report/artifacts: `saves/d09-qualifying-reflection-eligibility/`, including source freeze, complete fixture matrix, exact authority/provenance, negative/duplicate checks, semantic request/wire proof, due plan, normal prompt/compact equivalence, controller-authorized fallback proof, bounded conditional plan, checkpoints, hashes, tests and decision freeze. All commits remain local on main; **DO NOT PUSH**.
