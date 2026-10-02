# Engine capabilities before UI

READY = usable through `GameSession` and verified by a test. PARTIAL = works with stated limits. NOT IMPLEMENTED = do not build UI promises on it. "Application API" is the `GameSession` entry point (or `view.*` field) that exposes it. No live provider was called in this pass; narrator and controller quality was measured in earlier live passes (see the hardening and NPC+ reports).

| Feature | Status | Application API | Authoritative domain | Persisted | UI ready | Known limitation |
|---|---|---|---|---|---|---|
| New campaign | READY | `GameSession.createCampaign` | `CampaignState` (opening: Heartstone Square, 500 gold, empty household) | after `save()` | yes | One canonical opening only; id must be a valid save id |
| Load campaign | READY | `GameSession.loadCampaign`, `listSaves` | `CampaignState` | yes | yes | Mismatch/corruption is an error, never a silent fix; `previous` slot is explicit |
| Narration | READY | `submitPlayerInput`, `turn_completed.narration` | narrator draft, audited then delivered | delivered text is not saved; state is | yes | No token streaming (audited text arrives as one chunk); 4000-char input cap |
| Movement | READY | `/go`, natural movement; `view.scene.location/exits` | runtime scene | yes | yes | Only along authored connections; failed turn moves nothing |
| NPC movement / follow | READY | via turns; `trace.movement.characters_moved` | runtime NPC locations + NPC+ history | yes | yes | Ornate follow phrasings can be missed (fails closed, D-12); frozen |
| World time | READY | `view.scene.time`, `/wait 1..1440` | runtime scene clock | yes | yes | Primitive minutes/day only; no calendar or dates |
| Mana | PARTIAL | `view.player.mana` | runtime mana (daily recovery 25) | yes | yes | Only changed by the developer `/mana`; no spell system |
| Save / load | READY | `save`, `loadCampaign`, `hasUnsavedChanges` | save repository (2 slots, atomic replace) | yes | yes | Manual only; save refused while a turn runs |
| Shutdown | READY | `shutdown` | session | n/a | yes | Reflection cannot be cancelled (waits up to its timeout) |
| Household | READY | `view.household` | households, membership, rules | yes | yes | Absent members' locations are hidden by design |
| NPC+ | READY (frozen) | `view.household[].members` (safe fields only) | `premium_characters` (history, contracts) | yes | yes | History, contracts and notes are not exposed to the player view |
| Relationships | READY | `relationship_to_player` headline | `relationships` (qualitative dimensions) | yes | yes | Headline toward Nicco only; no relationship screen data beyond it |
| Conditions | READY | `members[].conditions`, `presentation` | character current state | yes | yes | Free-text labels |
| Gold | PARTIAL | `view.player.gold` (`null` = untracked) | `funds` | yes | yes | Moves only through person transactions (sale/gift/assignment); no prices, shops or item purchases |
| Transactions | PARTIAL | `trace.committed_command_kinds`; `members[].legal` | `transactions`, `legal_statuses` | yes | yes | Person transactions only; no transaction history list in the view |
| Inventory | PARTIAL | `view.player.inventory` | `items` (owner, position) | yes | yes | Carried and stored items only: no quantity, weight, capacity, stacking |
| Equipment | PARTIAL | `view.player.equipment`, `members[].equipment` | `items` (position `equipped`, free-form slot, worn/held) | yes | yes | Slots are free text; no stats, durability or slot catalogue; empty slots are unknown unless stated |
| Knowledge | READY | not exposed (internal) | `facts`, `knowledge` | yes | n/a | Never shown to the player view by design |
| Retrieval | READY | `trace.retrieval_ids`, `retrieval_mode` | authored canon index (lexical; semantic opt-in) | no (index rebuilt) | yes | Semantic path needs an injected embedding provider and was not live-tested (D-22) |
| Reflection | READY (non-authoritative) | `trace.reflection`, `post_turn_completed` | `premium_reflections` | yes | yes | Usefulness unmeasured on organic play (D-09); failures never affect gameplay |
| Debug diagnostics | READY | `listTurns`, `getTurn`, `exportTurnDebug` | per-turn trace (not campaign state) | no (session ring, 200) | yes | Not persisted across restarts; cost estimate unavailable |
| Provider configuration | READY | `createProductionDeps`, `readProviderStatus` | environment variables | no (never saved) | yes | Env only; no settings UI |
| Combat | NOT IMPLEMENTED | — | — | — | no | No combat domain exists |
| Crafting | NOT IMPLEMENTED | — | — | — | no | |
| Quests | NOT IMPLEMENTED | — | `goals` exist only as a command-level domain, no quest UI data | — | no | |
| Shops / item prices | NOT IMPLEMENTED | — | — | — | no | |
| NPC autonomy / goals | NOT IMPLEMENTED | — | — | — | no | Deliberately out of scope (frozen) |
| Party system | NOT IMPLEMENTED | — | — | — | no | |
| Autosave | NOT IMPLEMENTED | — | — | — | no | Current policy: manual save |
| Multiplayer / cloud saves | NOT IMPLEMENTED | — | — | — | no | |
