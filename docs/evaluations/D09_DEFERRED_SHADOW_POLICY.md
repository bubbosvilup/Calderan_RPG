# D-09 ? DEFERRED / SHADOW

Decision: 2026-10-05. This policy supersedes earlier queued soak/ablation proposals; historical reports remain unchanged.

| Gate | Status |
| --- | --- |
| Engineering | PASS |
| Semantic safety | PASS |
| Provider reliability | PASS |
| Production integration | PASS |
| Narrative utility | UNPROVEN |
| Default narrator exposure | OFF |
| Optional mode | SHADOW during real user playthroughs |

Production defaults to reflection generation OFF. To observe qualified reflections during a real playthrough, set `CALDREVAN_REFLECTION_MODE=shadow` before `npm run play -- --canon` (the developer CLI uses a synthetic fixture without `--canon`). Programmatic callers can pass `reflection_mode: "shadow"` to `createProductionDeps`; an explicit option overrides the environment. Only `off` and `shadow` are supported.

Both modes exclude reflection text and compact labels from normal turn context before NPC+ budget selection. Shadow uses the existing qualified post-turn provider, validation, pacing, persistence and diagnostics. It does not expose its notes to the narrator. Existing saved notes remain intact and recoverable through engine/debug inspection; authoritative state, stable contracts, developments and mannerisms retain their normal behavior. Low-level packing helpers retain historical diagnostic rendering, while production context explicitly disables it.

Reopen only when real gameplay naturally produces a reflection with a plausible unique-value later-use case. Do not manufacture authority specifically to test D-09. Shadow observation is optional; no automatic authority-generation soak, paid evaluation, or matched A/B is scheduled by this decision. A naturally occurring candidate can justify review, but does not establish narrative utility by itself.

The prior matched negative result and unsuccessful qualifying sequences remain evidence. See the [utility/packing review](D09_REFLECTION_UTILITY_AND_PACKING_REVIEW.md) and [debt register](../../DEBT_REGISTER.md).

Validation uses existing offline fixtures to check save preservation, exact debug recovery, reflection-free context packing and mode wiring. No new campaign authority was created for live D-09 evaluation and no paid provider calls were made.

Checks: `npm run typecheck` PASS; `npm test` 2011 passed, zero failures, four unchanged TODOs (2015 total); `npm run test:playthrough` 25/25 PASS. Local changes only; no push.
