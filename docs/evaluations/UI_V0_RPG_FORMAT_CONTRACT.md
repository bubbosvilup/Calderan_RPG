# UI V0 persistent RPG format contract

The user reported that the one-shot seed worked for the opening and first live narrator response, but GLM 5.2 reverted to unmarked prose and quoted dialogue by its second response. No paid provider calls were made for this change.

The shared `src/turn/prompt-builder.ts` exports `NARRATOR_RPG_FORMAT`, included exactly once in `NARRATOR_SYSTEM` immediately after the role/style instruction. Every narrator request built from that contract receives it, including later turns and reconciliation requests.

Exact compact rule:

```text
RPG FORMAT: Write all non-spoken narration, actions, gestures, physical descriptions, environmental descriptions and events inside *single asterisks*. Write spoken dialogue as plain text outside the asterisks, without quotation marks. Keep narration natural and descriptive.
```

The UI hook is simplified to opening-only: it no longer adds a format instruction or the old full dialogue example. Minimal existing SessionHooks/production/coordinator plumbing stays to prepend the deterministic opening as an assistant example on the first request. The opening text is unchanged, remains RPG-formatted, and startup remains provider-free.

Model `z-ai/glm-5.2`, OpenRouter route `z-ai/fp8` (fallback disabled), sampling, 512-token output budget, response-length guidance, history projection and all other narrator/engine behavior are unchanged. No output post-processing was added. Provider/config/adapter files have byte-identical SHA-256 checks; focused delivery checks preserve mock model output exactly.

Changed files: `src/turn/prompt-builder.ts`, `src/app/ui-playtest.ts`, `tests/ui-playtest.test.ts`, `tests/rpg-format-contract.test.ts`, `tests/golden/turn-pipeline.json`, and this note. Golden trace differences were verified recursively: only five system-prompt strings and their five character counts changed.

Validation: `npm run typecheck` passed; `npm test` passed (2,026 pass, zero failures); four existing TODOs preserved; `npm run test:playthrough` passed (25/25); focused UI/shared prompt/provider tests passed (46/46); golden fixture checks passed (6/6).

Manual test: run `npm run play:ui`, open `http://127.0.0.1:3000`, start with `*I look around the pens.*`, then continue at least ten narrator turns with actions and dialogue. Verify narration stays inside single asterisks and speech stays plain/unquoted.
