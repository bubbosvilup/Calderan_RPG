# P3.3 / P10 / P11 / regeneration: live-evidence audit

Audit date: 2026-10-05. Production remains `z-ai/glm-5.2`, `z-ai/fp8`, fallbacks disabled, reasoning off, 512 output tokens. No model migration, pacing change, simulation subsystem or paid generation was performed.

| Area | Status |
| --- | --- |
| P11 temporal grounding | SOFT / MINOR; deterministic clock projection implemented; live verification pending |
| P3.3 opaque references | Explicit machine-only rendering contract implemented; live verification pending |
| P3.3 canonical disclosure | Narrow controlled disclosure and name-only establishment implemented; live verification pending |
| P10 | SOFT / OBSERVATION; agency clarified only; pacing unchanged; broader action-expansion policy undecided |
| Regeneration | Routing/parameter audit complete; safe failure classification exposed; historical model failure causes unresolved; compatibility changes STOPPED pending evidence |

## 1. Evidence

The user's real UI playtest supplied temporal drift from morning to evening, literal `NPC24` output, invented self-introduction names Henk/Varek, unsupported Nicco internal states, and failed Space Bunny Alpha / GLM 5.3 Flash comparisons. These are human observations, not synthetic quality scores.

Local code confirms:

- Runtime owns an absolute `world_minute`, with `WORLD_DAY_MINUTES = 1440`. The existing session view already derives zero-based day and minute of day. UI arrival is world minute 600. Canonical opening is minute 0; this patch does not reinterpret or advance either clock.
- The prompt previously supplied only `World minute: ...`, without a readable clock or explicit temporal consistency rule.
- Identity masking covers canonical names, aliases, embedded IDs, retrieval, ordinary state/history and reconciliation messages. Opaque refs also occur inside observable labels, character identity records, background records, knowledge subjects/holders, social/household references, fact IDs, retrieved strings, player-action projections, audit revision messages and compacted permission tables. The same final system contract now governs all those channels, including old frozen regeneration requests only when their original request already contains it.
- Existing `learnCanonicalName` uses an entity-backed canonical fact plus a Nicco `knows` edge. General `establishNames` promotes newly named incidental characters and names unnamed campaign characters; it did not itself establish a canonical NPC's name as player knowledge.
- Alternate generation uses a frozen prepared envelope and `MiniMaxNarratorProvider` with `provider: null`; it does not retain the production pin. The cache is session-local, without saved requests/errors. The client previously displayed one generic failure regardless of safe provider classification.
- Repository/log/cache-artifact searches found no retained UI failure status/body or generation receipt for either failing selection. The model-string match in an unrelated controller bakeoff preparation file is not a UI failure receipt.

Official research was completed before considering probes:

- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection): routing constraints are separate from model IDs; fallbacks are enabled by default; requiring support for every parameter is opt-in.
- Exact listings: [Space Bunny Alpha](https://openrouter.ai/stealth/space-bunny-alpha) and [GLM 5.3 Flash](https://openrouter.ai/z-ai/glm-5.3-flash). Both IDs match our allowlist.
- Public [Space Bunny endpoint catalog](https://openrouter.ai/api/v1/models/stealth/space-bunny-alpha/endpoints) returned an empty endpoints array. This is a current public-catalog observation, not proof of the user's historical error, account entitlement, or universal unavailability. The stealth provider is anonymous, so no identified upstream model issue tracker can be audited.
- Public [GLM endpoint catalog](https://openrouter.ai/api/v1/models/z-ai/glm-5.3-flash/endpoints), read without credentials, listed 33 endpoints; all advertised `reasoning` and `max_tokens`. It would be unjustified to label this model generally unavailable or assume our token-field spelling is unsupported.
- [Official Z.ai model card](https://huggingface.co/zai-org/GLM-5.3-Flash) documents thinking-budget controls and their upstream defaults. These do not prove how a particular OpenRouter provider handled our reasoning-off request.
- [Reasoning documentation](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) and [error documentation](https://openrouter.ai/docs/api_reference/errors-and-debugging) were checked. A generation can fail after HTTP 200; reasoning can consume a token budget without prose. Those are possibilities, not diagnoses of this playtest.

## 2. Root cause

### Temporal drift

Confirmed projection gap: a precise runtime clock existed, but the prompt exposed only absolute minutes. A narrator had to interpret time of day, with no explicit clock-based temporal consistency instruction. The observed prose drift is real; deterministic tests establish the corrected input, not guaranteed live adherence.

### Opaque reference rendering

Confirmed contract gap: correlation tokens were embedded in human-readable labels and many other strings, while the general ban on metadata did not explicitly say those tokens must never become prose. This pass takes the requested minimum contract solution. Moving every embedded reference into a new structural schema would affect masking, focus matching, knowledge/compaction and reconciliation beyond this minimal pass. Refs remain useful input correlation; no generated text is regex-replaced.

### Invented canonical self-introduction names

Confirmed information/access gap: ordinary identity masking removed the truthful canonical name even during a socially appropriate disclosure opportunity. A player-knowledge rule allowed in-world disclosure conceptually, but supplied no name to disclose. There was also no canonical name-only establishment on delivered self-introduction evidence.

### Nicco internal states

Confirmed wording gap: the existing agency contract explicitly covered thought/decision/speech but did not explicitly enumerate feelings/preferences, unsupported motivations or interpretations such as a place becoming home. The single existing rule is clarified, rather than adding a separate prose policy.

### Regeneration failures: separate audit records

| Field | Space Bunny Alpha | GLM 5.3 Flash |
| --- | --- | --- |
| Model selected/sent by audited code | `stealth/space-bunny-alpha` | `z-ai/glm-5.3-flash` |
| Provider restriction sent | None; `provider` field omitted | None; `provider` field omitted |
| Generation parameters | `max_tokens` retained from original, normally 512; `reasoning: { enabled: false }`; `stream: true`; `stream_options: { include_usage: true }` | Same |
| Content | Frozen original system/history/current-action messages | Same |
| Temperature / tools / structured output / quantization / route override | None | None |
| Timeout | Existing adapter default 60 seconds | Same |
| Historical outgoing receipt | Not retained; payload shape verified through local code and mocked actual transport | Same |
| Historical HTTP status / OpenRouter code / message | Unknown; not retained | Unknown; not retained |
| Failure stage | Unresolved | Unresolved |
| Current public endpoint evidence | Empty public catalog | 33 endpoints advertising reasoning/max_tokens |
| Exact historical root cause | NOT ESTABLISHED | NOT ESTABLISHED |

The code does not exhibit the hypothesized inherited GLM provider pin, `only`/`ignore`, quantization filter, structured-output configuration or wrong model override. All alternates share the same payload shape. Working alternates do not explain why these two failed: their provider behavior, availability, account policies and finish reasons may differ. No unsupported reasoning configuration or budget failure is asserted without the actual response.

The confirmed observability limitation is separate: the shared client cancels non-success bodies, maps status to safe coarse errors, and rejects length/empty responses; the comparison/UI previously discarded even those classifications. Exact historical errors cannot be recovered from them.

## 3. Changes made

- `src/turn/temporal-grounding.ts`: pure `world_minute -> { world_minute, day, actual_time: HH:MM }`, using the existing 1,440-minute day. No arbitrary daypart buckets, astronomical lighting assumptions, dates or seasons.
- `src/turn/prompt-builder.ts`: bounded clock inclusion, explicit opaque-ref non-rendering rule, clarified existing agency clause, and optional controlled-name disclosure data in the system envelope after ordinary identity masking. Fixed system-envelope data survives knowledge compaction and reconciliation; ordinary masked context remains unchanged.
- `src/turn/narrator-identity.ts`: a non-serialized lookup of public canonical names for controlled disclosure, without adding names to ordinary serialized identity fields. It requires authored narrator/player visibility.
- `src/turn/canonical-name-disclosure.ts`: capability only for a social introduction/name request and exactly one foreground present canonical partner; known names and confidential encounters are excluded. Supplies only that partner's canonical name, usable only in their own spoken introduction, never descriptive narration or attribution. No alias/private-history grant or mandatory introduction.
- `src/turn/stages/commit-preparation.ts`: name-only knowledge commands join the existing detached, validated atomic batch only for a delivered exact-name first-person introduction immediately following a uniquely matching observable-descriptor narration paragraph. No arbitrary mention, inferred speaker, failed draft, relocated turn or broad encounter-based discovery qualifies. No controller decides discovery; no new storage domain is introduced.
- `src/app/narrator-alternatives.ts` / `src/ui/client.js`: surface existing safe provider error code/class, without retaining raw bodies, exposing messages/secrets or changing routing/parameters/retries. Browser code accepts only known error-code labels. Frozen request reuse and comparison state isolation are unchanged.
- `tests/p33-p11-live-evidence.test.ts`: deterministic clock, prompt/compaction, disclosure, attribution ambiguity, privacy, reload, canonical continuation, agency and failed-turn coverage.
- Existing comparison tests assert sanitized failure classification. Existing prompt wording/token expectations and `tests/golden/turn-pipeline.json` were updated for the intended prompt changes. Golden audit verified differences only in narrator system/content and system-character-count diagnostics: controller payloads, stage order, engine state and other events remained identical.

The shared OpenRouter client, narrator adapter, provider configuration and production model/route are unchanged, including their existing source-hash checks. No per-model compatibility hacks or capability registry were introduced.

## 4. Tests

Validation commands: `npm run typecheck`, `npm test`, `npm run test:playthrough`, and focused identity/history/focus/time/regeneration/UI tests.

Final results: typecheck PASS; full suite **2109 total / 2105 PASS / 0 failures / 4 existing TODOs**; focused identity/history/focus/time/regeneration/UI suite **69/69 PASS**; explicit playthrough suite **25/25 PASS**. The four accepted historical TODOs remain untouched: phantom ring via “them”, first-name-only condition attribution, unnamed captive price/legal-state requirement, and fronted receipt-clause grammar.

## 5. What remains soft/open

- **P11 SOFT / MINOR:** deterministic input grounding is implemented; live narration compliance remains to be checked.
- **P3.3:** correlation tokens still exist in request strings. The explicit contract is the minimum fix, not an output-enforcement guarantee. Controlled disclosure is intentionally conservative; unsupported or ambiguous speech attribution grants no knowledge. Supported establishment currently requires separate RPG narration/speech paragraphs and an explicit matching descriptor. Other languages, ambiguous group introductions, secret identities and broader name-discovery grammar remain outside scope.
- **P10 SOFT / OBSERVATION:** panoramic rendering/local selectivity and comparative prose impressions remain observations. Pacing, event frequency, hooks/questions and end beats are unchanged. Physical-action elaboration is not prohibited or required; broader expansion policy remains undecided. Unsupported causes/internal states remain forbidden.
- **Regeneration STOPPED pending evidence:** neither failing model has a proven historical provider root cause. The empty Space Bunny public catalog and GLM thinking defaults are research findings, not justification for changing generation settings. Per the requested stop conditions, no blind probe, parameter experiment, provider pin or model migration was performed.
- Paid generation calls: **0**. Only public documentation/catalog reads and offline mocks were used. No credentials were inspected, printed, stored or committed.

## 6. Live verification still needed

1. After restarting into the new build, keep the UI clock at minute 600 through ordinary conversational turns. Check morning/time descriptions stay consistent with 10:00. Explicitly advance runtime to 1080 only through existing supported actions and check the new 18:00 grounding.
2. Address the short, compact man by visible description. Before introduction verify no Korvin, raw `korvin`, or `NPC24` in delivered prose. Introduce Nicco or ask his name; verify truthful Korvin speech with descriptor attribution, no invented Henk/Varek, and name-only knowledge on the subsequent turn/save reload. A declined or ambiguously attributed introduction must not discover a name. Verify aliases/private titles remain protected.
3. Try a supplied stretch and local dialogue. Check no invented Nicco thoughts, feelings, intentions, preferences or unsupported prior walk/stiffness; do not score pacing or impose new progression requirements.
4. Obtain the existing failed generation receipts from the user's OpenRouter activity/error evidence for each model before spending another call: exact status, error type/code, finish reason, selected provider, usage and sanitized message. Do not copy keys, headers, full prompts or raw provider dumps into this repository.
5. If receipts cannot resolve the question, first state one falsifiable hypothesis per model and only then consider one targeted call per failing model using a retained prepared request. The present task stops before that probe because no historical error or unresolved hypothesis has been established well enough to justify a compatibility change. Space Bunny catalog/account access and GLM generation/finish reason must be investigated independently.
6. Any explicit future comparison must retain the original response, frozen content, controller/state/history isolation and ordinary alternate routing. No broad matrix, soak or production migration.
