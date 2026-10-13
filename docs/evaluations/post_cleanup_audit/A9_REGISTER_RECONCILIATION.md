# A9: MASTER_DEBT_REGISTER reconciliation against main 7e5e4ea

Scope: `docs/MASTER_DEBT_REGISTER.md` (632 lines), read in full. Each item that is not FIXED, CLOSED or struck through was checked against the current tree, statically only (grep, sed, git grep, git log/diff). Nothing was built or run, and nothing in the repository was changed. I read the debt-closure sections of the Cleanup A to G reports (`docs/evaluations/REPOSITORY_CLEANUP_{A,B,B2,C,D,E,F,G}_*.md`). Line numbers refer to HEAD `7e5e4ea`.

Verdicts used: CONFIRMED OPEN, PARTIAL, CLOSED BY A-G, OBSOLETE, DUPLICATE, NEEDS HUMAN DECISION. "By design" or "accepted" items that the register still lists stay CONFIRMED OPEN, and the Note column says so.

## Verdict counts

| Verdict | Count |
| --- | --- |
| CONFIRMED OPEN | 130 (about 15 of them by design or accepted) |
| PARTIAL | 9 |
| NEEDS HUMAN DECISION | 7 (2 more decision questions are attached to CONFIRMED OPEN rows: AUTH-7, PRV-7) |
| CLOSED BY A-G (still listed as open somewhere in the register) | 6 |
| OBSOLETE | 3 |
| DUPLICATE | 15 (UI-21 in the UI table plus 14 alias IDs in the alias table) |

The six tables hold 156 rows; with the 14 alias IDs, that makes 170 verdicts. An alias ID is not counted again under another verdict.

---

## 1. Product correctness (authority, commerce, items, identity, NPC+, movement, deferred semantic)

| ID | Area | Severity (register) | Register status | Verdict | Evidence (file:line or grep) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| AUTH-5 | authority | P2 | OPEN | CONFIRMED OPEN | `src/campaign/preparation.ts:11-19` pushes `{id, origin, profile:{}, current:{}}` when no record exists. Callers: `characters.ts:47` set_profile, `:51` set_condition, `:88` set_slot_knowledge, `items.ts:19,23` equipped place. Rite needs only a record: `heartstone-rite.ts:37-38` | Callers include `set_slot_knowledge` (`characters.ts:88`), which the register does not list. The implicit canonical record is still reachable, so it still couples to D5 |
| ID-8 (= NPC-3 = F8 = D5) | identity / NPC+ | P2 | OPEN (decision) | NEEDS HUMAN DECISION | D5 "OPEN" (register:607); no deliberate canonical-record producer (grep `origin.kind === "canonical"` producers: only AUTH-5 path) | Fixing AUTH-5 depends on D5 |
| NPC-1 | NPC+ | P2 | OPEN | NEEDS HUMAN DECISION | `heartstone-rite.ts:39` returns `already_npc_plus`; domain rejoin exists (`premium-characters.ts:13`, `:146` `rejoined_household`) | D4 has a direction but is "not yet confirmed" (register:606) |
| NPC-2 | NPC+ | P2 | OPEN (decision) | NEEDS HUMAN DECISION | `premium-characters.ts:35` `activeNpcPlus` is membership-gated | D4 |
| NPC-4 | NPC+ | P3 | OPEN | CONFIRMED OPEN | `turn/authorization/command-authorizer.ts:93` leave_household evidence path; only a keeper-household join is refused (`:98`) | |
| NPC-5 | NPC+ | P3 | OPEN (by design) | CONFIRMED OPEN | `heartstone-rite.ts:34-47`: no legal, consent or relationship check | Only a canon-doc note is needed |
| NPC-6 | NPC+ | P3 | OPEN | CONFIRMED OPEN | `app/game-session.ts:421` `catch { return reject("campaign_validation_failed", ...) }`, no sink | Stale path: register says `:356` |
| NPC-7 | NPC+ | P3 | OPEN | CONFIRMED OPEN | `premium-characters.ts:10-13` comment unchanged (`git diff c0608a6 HEAD` does not touch it) | |
| AUTH-2 residual | authority | P3 | OPEN (manual repair only) | CONFIRMED OPEN | `game-session.ts:514` `requestRepair` is the only repair path | By design |
| AUTH-1 residual | authority | deferred | OPEN (by design) | CONFIRMED OPEN | `turn/commerce/person-transactions.ts:23` FREE needs "you" | By design |
| AUTH-3 | authority | P3 | OPEN | CONFIRMED OPEN | `git grep -o '"nicco"' -- 'src/*.ts' ':!src/dev'`: 265 hits in 78 files; `campaign/item-transfer.ts:20`, `command-authorizer.ts:58-130` | Count is stale: the register says 240 in 77 and the number grew |
| AUTH-4 | authority | P3 | OPEN | CONFIRMED OPEN | `campaign/validation.ts:216-220` has a kind whitelist only (`PERSON_PLAN_KINDS`); `trade.ts:136-139` checks only the transfer entry | Latent. A kind whitelist exists; no closed id whitelist exists |
| AUTH-7 | authority | P3 | OPEN | CONFIRMED OPEN | `ui/server.ts:143-148` `/api/location` has no dev gate; client `client.js:1073` | Possibly a decision (dev flag vs confirm) |
| REV-1 residual | revision | P3 | OPEN | CONFIRMED OPEN | `turn/commerce/trade-notes.ts:36` `s.revision - o.settlement.revision <= 2 + ...` | |
| REV-4 | revision | P3 | OPEN | CONFIRMED OPEN | `app/item-sprite-jobs.ts:56-62` second `#commit` inside `catch`, no own try | |
| TRD-6 | commerce | P2 | OPEN | CONFIRMED OPEN | `turn/commerce/trade-authorization.ts:101` `wordsOf(name).some(...)`; `campaign/trade.ts:177` `resolveGoodsCategory(line.name)` ignores `line.category` | Stale lines: register `:81-85`, `trade.ts:36-49,168` |
| TRD-7 | commerce | P2 | PARTIAL | PARTIAL | one `AUCTION` regex `trade-price.ts:43` shared by `trade-authorization.ts:88` and `person-offers.ts:53`; venue-name test `trade-authorization.ts:62`; `bids?` still in `AUCTION` | No `auction_house` canon flag |
| TRD-8 | commerce | P3 | OPEN | CONFIRMED OPEN | `turn/narration-facts/commerce-vocabulary.ts:23` WITHDRAWAL still matches `refuses?`, `no longer` | Stale path: `trade-authorization.ts:26` |
| TRD-9 | commerce | P2 (deferred) | OPEN | CONFIRMED OPEN | `person-offers.ts:143` pronoun-based subject pick | Fail-closed otherwise |
| TRD-11 (DOC-12 related) | economy | P2 | OPEN (blocked on ECO-1) | NEEDS HUMAN DECISION | `campaign/types.ts:123-125` PersonTransaction only; goods trail is `TradeSettlement` `types.ts:145` | Blocked on D3 |
| TRD-13 | commerce | P3 | OPEN | CONFIRMED OPEN | `turn/player-intent.ts:12` `kind: "purchase" \| ...`; `turn/commerce/transaction-acts.ts:4` `ACCEPT`; no import-guard test (only `identity/scene-participants.ts` and `dev/historical/historical-replay.ts` import it) | |
| TRD-14 | commerce | P3 | OPEN | CONFIRMED OPEN | `grep expires` in `campaign/types.ts`, `trade.ts`: 0 | Waits on vendors |
| ECO-1 | economy | P2 | OPEN (decision) | NEEDS HUMAN DECISION | `types.ts:105` `FundsRecord { gold }`; `config/economy.yaml:20,25` silver anchors | D3 OPEN |
| ECO-2 | economy | P3 | OPEN | CONFIRMED OPEN | `validation.ts:226` `tradePrice = integer(1, 1_000_000)` vs `:130` gold `1e9`; no anchor band | |
| ECO-4 | economy | P3 | OPEN | CONFIRMED OPEN | `grep funds_ledger src`: 0 | |
| ITM-1 (= UI-21) | items | P3 | OPEN | CONFIRMED OPEN | `app/inventory-ui-view.ts:12-18` four fixed slots; `validation.ts:116` no headwear/footwear; `:76` slot is a free id | |
| ITM-3 | items | P2 | OPEN | CONFIRMED OPEN | `types.ts:83-89` item has `owner_id` + `position` only; custody exists only on the settlement (`:145`) | |
| ITM-4 | items | P2 | OPEN | CONFIRMED OPEN | no `quantity` or stable key on `CampaignItem` (`types.ts:83-89`) | |
| ITM-5 | items | P2 | OPEN | CONFIRMED OPEN | no `quantity`, `container_id` or weight on items (same) | |
| ITM-6 | items | P3 | OPEN | CONFIRMED OPEN | route list `ui/server.ts:113` has no equip route | |
| MOV-2 residual | movement | deferred | OPEN (by design) | CONFIRMED OPEN | free/unnamed/plural forms unresolved (D1) | By design |
| MOV-5 | movement | P3 | OPEN | CONFIRMED OPEN | `turn/movement/character-movement.ts:16` "There is no party, follower, companion or proximity model" | Since block 3 this comment is stale |
| MOV-6 | movement | P3 | OPEN | CONFIRMED OPEN | `movement/player-travel.ts:60` `multiple_travel_acts`; no consumer in view or client (`git grep`: 1 hit) | |
| ID-1 residual | identity | deferred | PARTIAL | CONFIRMED OPEN | `campaign/identity-fork-scanner.ts` is offline only; no turn-time look-alike check | By design for now |
| ID-3 (= I7) | identity | P3 | OPEN | CONFIRMED OPEN | "Slave" built at `app/session-view.ts:72`, `app/player-character-view.ts:152`, `app/trade-offer-view.ts:50`, `turn/identity/scene-participants.ts:61`; no `provisionalPersonLabel` | |
| ID-6 (= I8) | identity | P3 | OPEN | CONFIRMED OPEN | `knownCreatedName` only in `app/player-character-view.ts:58`; narrator side `turn/context/context-builder.ts:111,199` uses `profile.name` | |
| ID-7 (= I3) | identity | P3 | OPEN | CONFIRMED OPEN | `turn/identity/narrator-identity.ts:45` masks full names and aliases only | No fragment leak test found |
| F2 | identity | P3 | PARTIAL | PARTIAL | `turn/identity/name-establishment.ts:69` guard (`persistent_identity_elsewhere`) for named people only | |
| F4 (= I10) | identity | P3 | OPEN | CONFIRMED OPEN | `name-establishment.ts:24` late naming applies to "a present PERSISTENT character" only | Old path `narrated-captives.ts:401-405` was deleted |
| F5 (= I2) | identity | P3 | OPEN | CONFIRMED OPEN | `turn/identity/partner-identity-guard.ts` (regex bearer checks) | |
| F6 | identity | P3 | OPEN | CONFIRMED OPEN | `name-establishment.ts:71` `location_changed` skip; `coordinator/turn-coordinator.ts:316` | |
| F1 | identity | P1 (row) | no marker in §6.1 | OBSOLETE | closed with MOV-1/ID-1 (block 3, register:49,53); `follow-candidates.ts` exists | The row still reads as a live P1 |
| F3 / I11 | identity | P2 (row) | no marker in §6.1/§6.2 | OBSOLETE | `turn/identity/scene-participants.ts:128,138` `nextParticipantSeed` (ID-2 closed, block 12) | Row text is stale |
| I4 | identity | deferred | OPEN | CONFIRMED OPEN | `turn/identity/canonical-name-disclosure.ts` heuristic surface | |
| I5 | identity | deferred | OPEN (narrow by design) | CONFIRMED OPEN | `partner-identity-guard.ts` | By design |
| NAME_REQUEST mismatch | identity | P3 deferred | OPEN | CONFIRMED OPEN | `turn/identity/identity-request.ts:6` vs `:30` `asksName` | Stale line: register `:17-36` |
| addressed_verb residual | identity | P3 deferred | OPEN (deliberate) | CONFIRMED OPEN | `narration-facts/identity-forms.ts:179`; `git grep addressed_verb src/turn/commerce`: 0 | |
| KPG-2 residual | identity | deferred | OPEN (by design) | CONFIRMED OPEN | `narration-facts/dialogue-forms.ts` fails closed on two candidates | By design |
| H1 residuals (`them`, shared first name, fronted recipient) | audit | deferred | DEFERRED | CONFIRMED OPEN | `tests/authority/valid-narration-survives-audit.test.ts` pins the fail-closed behaviour | |
| CTX-2 residual | secrecy | P2 | PARTIAL | CONFIRMED OPEN | `grep -i "leak\|unlearned" src/turn/audit src/turn/stages/audit.ts`: 0; only `canonical_name_conflict` (`audit/narration-audit.ts:400`) | The draft-stream part is closed (block 4) |

## 2. Architecture (ARCH-2 residuals, pipeline, context, providers, images, naming)

| ID | Area | Severity (register) | Register status | Verdict | Evidence (file:line or grep) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| ARCH-2 residual (F readers) | pipeline | P2 | OPEN | CONFIRMED OPEN | `turn/authorization/evidence-authorization.ts:43,357-359` own verb regexes (11 alternation regexes); `turn-evidence.ts` (8) | |
| PIPE-6 | pipeline | P2 | OPEN | CONFIRMED OPEN | `turn/stages/commit-preparation.ts:1-8` (identity establishment after audit); `authorizeWithEvidence` is called only at `stages/authorization.ts:124` | Cleanup D left it unchanged (D report §16) |
| PIPE-7 | pipeline | P2 | OPEN | CONFIRMED OPEN | `turn/stages/audit.ts:110-112`: only committed arrivals get a templated sentence | |
| PIPE-4 | pipeline | P2 | OPEN | CONFIRMED OPEN | `app/game-session.ts:357-362` builds `contextRequest` + `measure` on every `getView()`; 58 `getView()` call sites in game-session.ts | The register says about 43 |
| PIPE-9 | context | P2 | OPEN | CONFIRMED OPEN | `turn/context/context-budget.ts`: no `retrieval` / reserve term (grep 0) | |
| PIPE-10 | pipeline | P2 | OPEN | CONFIRMED OPEN | `coordinator/turn-coordinator.ts:222-223` `stage = "retrieval_failed"` around `retrieveForTurn` | |
| PIPE-11 | context | P3 | OPEN | CONFIRMED OPEN | `turn/context/retrieval-policy.ts:41,61` `world.listEntities()` scan per turn | |
| PIPE-12 | pipeline | P3 | OPEN | CONFIRMED OPEN | `grep OperationLock src`: 0; `game-session.ts:1325` "cannot be cancelled mid-provider-call" | |
| NARR-1 residual | providers | P3 | OPEN (by design) | CONFIRMED OPEN | `provider-config.ts:6` 768; one recovery | |
| CTX-1 | context | P2 | OPEN | CONFIRMED OPEN | `turn/identity/narrator-identity.ts:48` id regex without boundary; `turn/context/prompt-builder.ts:138` `c.profile.name ?? c.id` | Stale line: register `prompt-builder.ts:302` |
| CTX-3 | context | P2 | OPEN | CONFIRMED OPEN | `turn/stages/controller.ts:39` `JSON.stringify({ ..., context, ...})`, no cap | |
| CTX-4 | context | P2 | OPEN | CONFIRMED OPEN | `retrieval-policy.ts:151` `retrieveForTurn(input, context, ...)`; `turn-coordinator.ts:223` passes `player_input` | |
| CTX-5 | context | P3 | OPEN | CONFIRMED OPEN | `grep TurnFrame src`: 0 | |
| CTX-6 | context | P3 | OPEN | CONFIRMED OPEN | `grep FocusPlan src`: 0 | |
| CTX-7 | context | P3 | OPEN | CONFIRMED OPEN | `narrator-identity.ts:25` `gates = new WeakMap`; `context-builder.ts:53-54` | |
| PRV-1 | providers | P2 | PARTIAL | PARTIAL | cap 768 `app/provider-config.ts:6`; `llm/openrouter/minimax-narrator.ts` has no `require_parameters` and no fallback (`:18-22`) | |
| PRV-2 | providers | P2 | OPEN | CONFIRMED OPEN | `llm/openrouter/state-controller.ts:35,73` non-strict normalization accepted | |
| PRV-3 | providers | P3 | OPEN | CONFIRMED OPEN | `llm/errors.ts:28` `retry_after_s` captured; `llm/retry.ts` never reads it (grep 0) | |
| PRV-4 | providers | P3 | OPEN | CONFIRMED OPEN | `app/production.ts:40`; `llm/openrouter/reflection-provider.ts:36` `configuration_error` | Stale line: `game-session.ts:826-828` |
| PRV-5 | providers | P3 | OPEN | CONFIRMED OPEN | `llm/openrouter/mannerism-extractor.ts:6` "single model, no fallback" | |
| PRV-6 | providers | P3 | PARTIAL | PARTIAL | `provider-config.ts:8` env override; `minimax-narrator.ts:20` unlisted models keep default routing | Documented in `production.ts:36` only |
| PRV-7 | providers | P3 | OPEN | CONFIRMED OPEN | still present: `llm/openrouter/image-client.ts` (used by `tests/images/openrouter-image-client.test.ts`, `scripts/historical/anime-portrait-benchmark.mjs`), `minimax-narrator.ts`, `openrouter/context-compressor.ts`, `retrieval/voyage-embedding-provider.ts` | The `deepseek-controller.ts` alias part is closed (Cleanup E). D8/D13 decided "remove image client" but it was not done |
| PRV-8 | docs/providers | P3 | OPEN | CONFIRMED OPEN | `grep -i "timeout\|APIKEY.env\|120 s" docs/CONFIGURATION.md`: 0 | |
| IMG-2 | images | P2 | OPEN | CONFIRMED OPEN | `llm/image-generator.ts:90` abort becomes `transient_provider_error`; `game-session.ts:1325`; no cancel route | Signal plumbing exists in `fal-image-client.ts:58,69`, but no batch signal is wired |
| IMG-3 | images | P3 | OPEN | CONFIRMED OPEN | `image-generator.ts:93` `finally { clearTimeout(timer) }` once headers resolve | |
| IMG-4 | images/UI | P3 | OPEN | CONFIRMED OPEN | `ui/client.js:298` stage computed from `Date.now() - startedAt` | |
| IMG-5 (= REPO-7) | images | P3 | OPEN | CONFIRMED OPEN | `ui/server.ts:56` `no-store`, `:104` `no-cache`; `data/canonNPCAvatar/*.png` 2.2-2.5 MB each (13.6 MB dir) | |
| IMG-6 | images | P3 | PARTIAL | PARTIAL | `app/item-sprite-jobs.ts`: no concurrency or session cap (grep `max\|limit`: 0) | QA off by default (block 6) |
| IMG-7 | images | P3 | OPEN | CONFIRMED OPEN | `grep image_calls src`: 0 | |
| IMG-8 | images | P3 | OPEN | CONFIRMED OPEN | `campaign/portrait-prompt.ts:105` `${v.height_cm} cm tall`, weight | |
| IMG-9 | images | P3 | OPEN | CONFIRMED OPEN | `game-session.ts:748` `calls >= 2 * PORTRAIT_BATCH_SIZE` shared counter | |
| IMG-10 | images | P3 | OPEN (D9) | NEEDS HUMAN DECISION | upload route `ui/server.ts:12-13`; `reference_used` `campaign/types.ts:316` | D9 OPEN |
| IMG-11 | images | P3 | OPEN | CONFIRMED OPEN | `app/image-stack.ts:4-18` LoRA and router pinned in source | |
| NAME-1 | naming | P3 | OPEN (D6, schema-bound) | CONFIRMED OPEN | `campaign/validation.ts:298` `premium_characters`; `git grep -il premium`: 390 tracked files (50 in src) | Decided and deferred (D6, next schema bump; re-audited in Cleanup G). The count is stale: the register says 241 / 379 |

## 3. Persistence

| ID | Area | Severity (register) | Register status | Verdict | Evidence (file:line or grep) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| PER-1 | persistence | P2 | OPEN | CONFIRMED OPEN | `persistence/strict-json.ts:2,6` 16 MB; `save-format.ts:227-229` pretty JSON, throws `invalid_save`; `app/game-session.ts:159` `FATAL_SAVE` has `invalid_save` | |
| TRD-12 | persistence | P2 | OPEN | CONFIRMED OPEN | `campaign/validation.ts:290` `list(tradeOfferRecord, 5000)`; no pruning assignment of `trade_offers` in src (grep 0) | Stale line: register `:287` |
| PER-2B | persistence | P3 | OPEN (accepted) | CONFIRMED OPEN | unkept participants are session-local (`scene-participants.ts`) | Accepted |
| PER-3 | persistence | P3 | OPEN | CONFIRMED OPEN | `validation.ts:74` `empty_slots`, `:203` `active_household_member`, `:288` `price_indices` | |
| PER-4 | persistence | P2 | OPEN | CONFIRMED OPEN | `persistence/save-format.ts:10` imports `migrateSnapshot4to5/5to6/6to7` beside the `SAVE_MIGRATIONS` table (`save-migrations.ts:8`); hard-coded steps `:148-149` | Stale line: register `:102-106` |
| PER-5 | persistence | P2 (P3 per table) | PARTIAL | PARTIAL | additive optional fields, e.g. `trigger: "player_kept"` (`types.ts:49`) without a bump | |
| PER-6 | persistence | P3 | OPEN (G re-audit) | CONFIRMED OPEN | `snapshot-validation.ts:198` `private_memory_refs`; `validation.ts:97-104` `active_version_id` decode | Schema-bound (D6) |
| PER-7 | persistence | P3 | OPEN | CONFIRMED OPEN | `persistence/campaign-repository.ts:65,91` soft-delete root; no purge or restore | |
| PER-8 | persistence | P3 | OPEN (accepted) | CONFIRMED OPEN | `game-session.ts:135,1229` transcript appended separately | Accepted |
| PER-9 | persistence | P3 | OPEN | CONFIRMED OPEN | `campaign-repository.ts:94` `lock_stale_ms ?? 90_000`; `grep save_generation`: 0 | |
| F7 (= I12) | persistence/identity | P2 | OPEN | CONFIRMED OPEN | `turn/commerce/person-offers.ts:338-339` reuse only when `ephemeral_ref === ref` | Stale line: register `:349-355` |
| I1 / ID-4 | persistence/identity | P2 | OPEN | CONFIRMED OPEN | `campaign/snapshot-validation.ts`: no `ephemeral_ref` uniqueness (grep 0); `turn/identity/keep-track.ts:52` checks its own token | |
| I6 / ID-9 | persistence | P3 | OPEN | CONFIRMED OPEN | `scene-participants.ts:141` `#focus` in memory; `persistence/save-format.ts:32` persists `conversation_partner_id` | |
| ITM-2 | persistence | P3 | OPEN | CONFIRMED OPEN | `campaign/items.ts:18-25`, `characters.ts:88-92`, `validation.ts:74` persisted `empty_slots` | |
| AUTH-6 | persistence | P3 | OPEN | CONFIRMED OPEN | `persistence/canon-compatibility.ts:98-103` `snapshot.revision += 1`; load report has `revision_advanced` (since `f335d71`, before the audit), no ledger entry | |
| AUTH-8 | persistence | P3 | OPEN | CONFIRMED OPEN | `snapshot-validation.ts:141` checks legal transfer → transaction only; offer checks `:150-161` do not tie an accepted person offer to a transaction | |
| IMG-12 | persistence | P3 | OPEN | CONFIRMED OPEN | `campaign/portraits.ts:19` `MAX_PORTRAIT_VERSIONS = 64`, no global quota | |
| REV-2 residual | persistence | P3 | OPEN (by design) | CONFIRMED OPEN | receipts bounded at 32 | By design |

## 4. UI

| ID | Area | Severity (register) | Register status | Verdict | Evidence (file:line or grep) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| UI-1 | UI | P2 | OPEN | CONFIRMED OPEN | `ui/client.js:685-687` trap cycles close plus two tabs only | Stale line: register `:707-713` |
| UI-2 | UI | P2 | OPEN | CONFIRMED OPEN | `client.js:837` plain "Accept offer"; `style.css:605-606` only cursor rules; no `.trade-buy`/`.trade-sell` CSS | |
| UI-3 | UI | P3 | OPEN | CONFIRMED OPEN | `ui/index.html:83` `&uarr;` glyph button | A promote confirm group now exists |
| UI-4 | UI | P2 | OPEN | CONFIRMED OPEN | `client.js:1036` 1 s poll, `:1182` 4 s save poll; `grep document.hidden`: 0 | |
| UI-5 | UI | P2 | OPEN | CONFIRMED OPEN | `game-session.ts:379` `reject("stale_turn")` maps to `app-errors.ts:28` "The turn was discarded."; client never reads `candidates` | Stale line: register `:314` |
| UI-6 / REV-3 | UI/revision | P3 | PARTIAL | PARTIAL | `client.js:221` `editorRevision = currentRevision` at open; `game-session.ts:799` bootstrap-avatar commit; `game-session.ts:982` turn guard checks status, not `#portraitBusy` | |
| UI-7 | UI | P3 | OPEN | CONFIRMED OPEN | no "+N more" cap (grep 0) | Static |
| UI-8 | UI | P3 | OPEN | CONFIRMED OPEN | `style.css:198` `.scene-participant`; no `overflow-wrap:anywhere` (grep 0) | Static |
| UI-9 | UI | P3 | OPEN | CONFIRMED OPEN | `client.js:756` prints `scene.location_id` | |
| UI-10 | UI | P3 | OPEN | CONFIRMED OPEN | `client.js:757` `String(data.play.gold)` | |
| UI-11 | UI | P3 | OPEN | CONFIRMED OPEN | `index.html:9` nav | Not re-verified in depth |
| UI-12 | UI | P3 | OPEN | CONFIRMED OPEN | `style.css:95` `.top-bar nav button:last-child`, `:113` bare `article{` | |
| UI-13 | UI | P3 | OPEN | CONFIRMED OPEN | `var(--panel`/`var(--danger` used 4 times; never defined in `style.css` | |
| UI-14 | UI | P3 | OPEN | CONFIRMED OPEN | not re-verified | Static |
| UI-15 | UI | P3 | PARTIAL | CONFIRMED OPEN | `index.html:25` `#conversation role="log" aria-live`; pending bubble created there `client.js:1089` | The residual as restated is fully open |
| UI-16 | UI | P3 | OPEN | CONFIRMED OPEN | `client.js:987` "Regenerate with…", `:1007` shows `failure_code` | |
| UI-17 | UI | P2 | OPEN | CONFIRMED OPEN | `app/session-view.ts:89` "Unfamiliar household member"; `client.js:795` string compare; `player-character-view.ts:230` "Met this campaign · name unknown" | |
| UI-18 | UI | P3 | OPEN | CONFIRMED OPEN | `client.js:207` `toUpperCase()` for the player only | |
| UI-19 | UI | P3 | OPEN | CONFIRMED OPEN | `client.js:628` "Edit NPC+" opens the editor | |
| UI-20 | UI | P3 | OPEN | CONFIRMED OPEN | `client.js:96` `renderInventory` full rebuild | |
| UI-21 (= ITM-1) | UI | P3 | OPEN | DUPLICATE | `client.js:72` "Empty" slot | See ITM-1 |
| UI-22 | UI | P2 | OPEN | CONFIRMED OPEN | `client.js:808-820` client-side `tradeReceipts` array, last 3 | |
| UI-23 | UI | P3 | OPEN | CONFIRMED OPEN | `grep aria-describedby src/ui`: 0; `style.css:598` `.trade-label` `.7rem` / `opacity:.7` | |
| UI-24 | UI | P3 | OPEN | CONFIRMED OPEN | `client.js:1058` "Check that npm run play:ui is running" | |
| UI-25 | UI | P3 | OPEN | CONFIRMED OPEN | not re-verified | Static |
| UI-26 | UI | P3 | OPEN | CONFIRMED OPEN | `client.js:48` `household-nav` focus on play | |
| UI-27 | UI | P3 | OPEN | CONFIRMED OPEN | `index.html:30` "/ for commands" | |
| UI-28 | UI | P2 | OPEN | CONFIRMED OPEN | `style.css:425` `.story{height:75dvh`, `:569` `inset:58px` | Static |
| UI-29 | UI | P3 | OPEN | CONFIRMED OPEN | `client.js:163` `NUMBER_RANGES`, `:1197` `dayLabel` (the server `date_text` is used at `:753` only) | Narrower than the register says |
| UI-31 | UI | P3 | OPEN (user decision) | CONFIRMED OPEN | `client.js:298-307` stage from `Date.now()`, 1000 ms tick | Deferred to UI polish |
| MOV-6 | UI | P3 | OPEN | CONFIRMED OPEN | see section 1 | Listed in the UI row of the residual table |
| I14 / ID-5 | UI/identity | P3 | OPEN | CONFIRMED OPEN | `app/session-view.ts:97` `present ... name(id)`, `:105` `name: name(m.character_id)` beside `display_name` | Stale lines: register `:96,104` |
| Playwright not a devDependency (UI-30 / REPO-6 residual) | tooling | P3 | OPEN | CONFIRMED OPEN | `package.json` devDependencies are `typescript` and `@types/node` only | Orphan residual: both parent IDs are closed |

## 5. Testing and CI

| ID | Area | Severity (register) | Register status | Verdict | Evidence (file:line or grep) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| CI-1 | CI | P2 | OPEN | CONFIRMED OPEN | no `.github/`, no ESLint or Prettier config; `package.json` has `check:architecture` and `check:docs` but nothing runs them automatically | The "build never cleans `.build`" half (register §2 row 29) is CLOSED by A (`package.json` `build: node scripts/clean.mjs && tsc`) |
| TEST-2 | tests | P3 | OPEN (F re-check) | CONFIRMED OPEN | e.g. `tests/images/canon-avatars.test.ts`, `tests/providers/narrator-alternatives.test.ts` exist and pin source | The count of 17 was not independently re-derived |
| TEST-4 | tests | P3 | PARTIAL | PARTIAL | `tests/images/openrouter-image-client.test.ts`, `tests/retrieval/voyage-embedding-provider.test.ts`, `tests/tooling/{compaction,narrator,controller}-bakeoff*.test.ts` | Waits on PRV-7 |
| TEST-5 | tests | P3 | OPEN (F re-check) | CONFIRMED OPEN | real sleeps found at `tests/persistence/save-format-and-assets.test.ts:187` (80 ms) and `tests/session/application-smoke.integration.test.ts:166,238` (20 ms). No sleep found in the two cited files: `play-client.test.ts` uses `manualClock` (`:930-942`) and `setImmediate` ticks (`:84`); `provider-retry.test.ts` uses `fakeRetry` | The cited pointers look wrong (see the contradictions list) |
| TEST-6 | tests | P2 | PARTIAL | PARTIAL | `tests/fixtures/` holds no real older-schema save fixtures; a double-accept regression exists (`tests/commerce/person-offer-playthrough.regression.test.ts`) | |
| TEST-7 | tests | P3 | OPEN | CONFIRMED OPEN | no recorded-LLM replay layer; `createProductionDeps` used only with fake fetch | |
| TEST-8 | tests | P3 | OPEN (not verifiable) | CONFIRMED OPEN | still unmeasured; the premise "no deps in the sandbox" is obsolete (`node_modules/` exists) | Re-scope: measure |
| TEST-3 | tests | (P3) | CLOSED at row 550, but listed open in the residual table (register:105) | CLOSED BY A-G | Cleanup F §14; `tests/architecture/test-taxonomy.architecture.test.ts` | Register inconsistency |

## 6. Low-priority repository, archive and docs

| ID | Area | Severity (register) | Register status | Verdict | Evidence (file:line or grep) | Note |
| --- | --- | --- | --- | --- | --- | --- |
| REPO-2 residual | repo | P3 | PARTLY CLOSED | CONFIRMED OPEN | `longplaytrough_transcript.txt` and `playtrough_example/` still at the repository root | |
| REPO-7 (= IMG-5) | repo | P3 | OPEN | CONFIRMED OPEN | `data/canonNPCAvatar` 13.6 MB; `city_map/city_map.png` | Path: the register says `city_map.png` |
| REPO-8 | repo | P3 | OPEN | CONFIRMED OPEN | 13 of 14 named symbols have exactly one occurrence (the definition) in src/tests/scripts; `PLAYER_ADULT_ONLY` is gone; no `noUnusedLocals` in `tsconfig.json` | |
| REPO-13 | archive | P3 | OPEN (user decision) | CONFIRMED OPEN | `git ls-files docs/evaluations`: 1,050 files, 50 MB, 105 `.mjs` | Accepted as is |
| REPO-10 | repo | (P3) | CLOSED at row 517, but listed open (and "partly") in the residual table (register:105) | CLOSED BY A-G | Cleanup F §14; `tests/support/receipt-corpus.ts` | Register inconsistency |
| DOC-16 | docs | (P3) | CLOSED at row 593, but listed in the residual table (register:105) | CLOSED BY A-G | Cleanup B §12 | Register inconsistency |
| REPO-5 tail: `reflection-wire-v2.ts` "delete candidate" (register:512) | repo | P3 | stated as open | CLOSED BY A-G | file absent (`ls tests/frozen/reflection/`); Cleanup E (register:551) | Register inconsistency |
| REPO-1 (1B row 18) | repo | (P2) | listed in the current top-20 | CLOSED BY A-G | Cleanup A; `tests/tooling/build-discipline.test.ts` | Register inconsistency |
| §13.2 "`.build` is never cleaned" | tooling | n/a | stated as current | CLOSED BY A-G | `package.json` `build` runs `scripts/clean.mjs` first (CI-2) | Register inconsistency |
| DOC-12 | docs | P3 | OPEN (1A.3 says partial) | CONFIRMED OPEN | `docs/architecture/ACTUAL_OFFER.md:31` "record the transaction", `:49` "transaction", vs `:80` "no separate `transactions` row" | |
| DOC-13 | docs | P3 | OPEN (needs decision) | NEEDS HUMAN DECISION | `docs/world/CANON_OVERVIEW.md:46` author-only section inside a normative doc | |
| DOC-15 residual | docs | P3 | PARTLY CLOSED | CONFIRMED OPEN | `scripts/check-doc-links.mjs`: links only, no staleness logic (grep `stale\|count`: 0) | |
| PIPE-5 | pipeline | P2 | tracked as ARCH-2 | OBSOLETE | narration side consolidated (blocks 9-11) | Superseded by the ARCH-2 residual rows |

## Duplicate alias rows (DUPLICATE verdict; the canonical row carries the evidence)

| Alias | Canonical | Note |
| --- | --- | --- |
| NPC-3, F8, D5 | ID-8 | |
| I1 | ID-4 | |
| I7 | ID-3 | |
| I14 | ID-5 | |
| I8 | ID-6 | |
| I3 | ID-7 | |
| I10 | F4 | |
| I2 | F5 | |
| I12 | F7 | |
| I6 | ID-9 | |
| UI-21 | ITM-1 | |
| REV-3 | UI-6 | |
| REPO-7 | IMG-5 | |


Not duplicates, though the register's duplicates line (:94) groups them:

- **IMG-10 / PRV-7 / REPO-9.** "PRV-7 = REPO-9 = IMG-10" no longer holds. REPO-9 is CLOSED (Cleanup E). PRV-7 is open. IMG-10 is a separate D9 decision.
- **DOC-12 / TRD-11.** Related only. DOC-12 is a doc self-contradiction that can be fixed now; TRD-11 is the missing ledger, blocked on D3.
- **NAME-1 / PER-6.** They overlap, and both stay with the next schema bump.

---

## Claims contradicted by code

1. **AUTH-5 caller list is incomplete.** The register names `set_condition`, `set_profile` and `place_item(equipped)`. `set_slot_knowledge` (`campaign/characters.ts:88`) also calls `characterForUpdate`, so a slot-knowledge command on a canonical NPC also creates a canonical-origin record. The rite is then reachable, because `heartstone-rite.ts:37-38` needs only a record.
2. **TEST-5 pointers.** The register and Cleanup F say wall-clock waits remain in `tests/ui/play-client.test.ts` and `tests/providers/provider-retry.test.ts`. Grep finds no sleep in either file: play-client uses `manualClock` and `setImmediate`, and provider-retry uses `fakeRetry`. Real sleeps are in `tests/persistence/save-format-and-assets.test.ts:187` and `tests/session/application-smoke.integration.test.ts:166,238`. This is a static grep, so a hidden real-time path in the cited files is still possible, but none was found.
3. **AUTH-3 count.** The register says 240 literals in 77 files. Current: 265 in 78 non-dev src files. The number grew; it did not shrink.
4. **NAME-1 count.** Row 367 says 241 files mention "premium" and 1A.3 says 379. Current: 390 tracked files (50 in src).
5. **PIPE-4 count.** "about 43 call sites" vs 58 `getView()` calls in `app/game-session.ts` alone.
6. **Hotspot size.** §9 says `game-session.ts` is 998 lines; it is 1,345. `narration-audit.ts` is 717 (the register says 666).
7. **AUTH-4 wording.** "accepts any ... command shapes" is half true: the plan kinds are whitelisted (`validation.ts:216-220`, `PERSON_PLAN_KINDS`). Only the id or content whitelist is missing.
8. **REPO-5 row (register:512).** It calls `tests/frozen/reflection/reflection-wire-v2.ts` a delete candidate. The file no longer exists; Cleanup E removed it.
9. **§13.2 bullet.** It says "`.build`, which is never cleaned". `npm run build` cleans first (CI-2 closed, Cleanup A).
10. **MOV-5 / §5 text.** "There is no party, follower, companion model" is still in code (`character-movement.ts:16`). It contradicts `follow-candidates.ts` (block 3), so the code comment is stale, as the register says. Recorded here because §5 "Current architecture" still presents this as current.

## Register-internal inconsistencies

1. **Residual table, Technical debt P3 (register:105)** lists TEST-3, REPO-10 ("partly ... belongs to Cleanup F") and DOC-16 as open. Rows 550, 517 and 593 and the "Closed recently" line (register:100) mark all three CLOSED.
2. **The same cell lists DOC-15 twice** ("DOC-15 residual" and "DOC-15").
3. **1B top-20, row 18** still ranks REPO-1 (closed in Cleanup A) as P2 current debt.
4. **Detail rows without a closure marker while 1A says FIXED:** REV-2 (register:226), PIPE-1 (:394), PIPE-2 (:228), TRD-2 (:244), IMG-1 (:447), ID-1 (:342), §6.1 F1 (:310) and F3 (:312), and §6.2 I11 gap "Counter restarts on load (F3)" (:333). The MOV-4 row (:287) still states a residual that 1A (:51) and 1A.3 (:81) call CLOSED.
5. **Severity drift.** These rows still show audit-time P2 while the severity table (:113) lowered them to P3: REV-3 (:227), PER-3, PER-5, PER-6, PER-7, UI-3, UI-6, IMG-3 to IMG-7, PRV-3, CTX-5, ITM-1, ITM-2, TRD-8, AUTH-4. The register says the table wins; the rows were never edited.
6. **DOC-12** is "Partial" in 1A.3 (:92) and "Open" at its row (:589).
7. **Duplicates line (:94).** "PRV-7 = REPO-9 = IMG-10" does not hold now that REPO-9 is closed. "TRD-11 = DOC-12" merges a fixable doc self-contradiction with a blocked schema item. "REPO-10 = TEST-3" and "UI-30 overlaps REPO-6" are pairs of closed items.
8. **Playwright residual has no owner.** UI-30 (:495) says the residual belongs to REPO-6, and REPO-6 (:513) says it belongs to UI-30. Both are closed, so the open residual has no ID of its own.
9. **Cleanup E said REPO-10 was "PARTLY CLOSED"**; Cleanup F then closed it. The residual-table text still carries E's wording.
10. **D10 (:612)** says REPO-13 is "for a later archive cleanup". The REPO-13 row (:520) records a user decision to keep it open as is, with no safe reduction. B2's handoff also said "Moved to Cleanup C", which did not happen. The intent is consistent, but the wording diverges.
11. **Cleanup residuals missing from the register (no ID anywhere):**
    - `scripts/evaluation/casting-trace.mjs:76` prints the removed `identity?.promoted` field (Cleanup G §12).
    - `established_at_promotion` (prompt vocabulary, `turn/context/prompt-builder.ts` area; Cleanup G).
    - behavior names for `scripts/minor-debt-cycle-check.mjs` and `scripts/browser/block5b|6|7-browser-check.mjs` (Cleanup E §17).
    - the historical-modules-under-test allowlist `TEST_HISTORICAL_ALLOWED`: 14 entries now, Cleanup E said 17 (`tests/architecture/dev-tooling-boundaries.architecture.test.ts:61`).
    - stale `scripts/historical/audit-player-travel-authority.mjs` (Cleanup B2 §10).
    - the Cleanup D structural residuals: folder mutual dependencies, large modules, fold `structured/` into `optional/`.
12. **1A.3 "Partial" list (:92)** includes UI-15, but the UI-15 residual as restated (pending bubble in the live region) is fully open.

## STALE PATH references (not counted as verdict changes)

| Register cite | Current location |
| --- | --- |
| `narrated-captives.ts:330,401-405,406,409-420` (§6.1 F1, F4; §6.2 I2, I10) | deleted. The reading is in `turn/narration-facts/scene-identity.ts`; the policy is in `turn/identity/name-establishment.ts:22-71` |
| `scene-departure.ts` (§5, :276) | deleted. Departures are in `turn/narration-facts/departure-forms.ts` |
| `src/campaign/followers.ts` (§5 strategy, :292) | never created. Implemented as `src/turn/movement/follow-candidates.ts` |
| `tests/frozen/reflection/reflection-wire-v2.ts` (:512) | deleted (Cleanup E) |
| `src/campaign/promotion.ts` / `buildPromotedCharacter` | `src/campaign/materialization.ts` / `buildMaterializedCharacter` (the register body uses the new name; the old one appears only in reports) |
| `client.js:707-713` (UI-1) | `src/ui/client.js:685-687` |
| `client.js:289-312` (TEST-1/UI-31) | `src/ui/client.js:298-307` |
| `client.js:734` (PIPE-1, closed) | n/a |
| `game-session.ts:356` (NPC-6) | `src/app/game-session.ts:421` |
| `game-session.ts:733-736` (REV-3) | `src/app/game-session.ts:982` (turn guard), `:799` (bootstrap avatar) |
| `game-session.ts:314` (UI-5) | `src/app/game-session.ts:379` |
| `game-session.ts:826-828` (PRV-4) | `src/app/production.ts:40`, `src/llm/openrouter/reflection-provider.ts:36` |
| `trade-authorization.ts:26` (TRD-8) | `src/turn/narration-facts/commerce-vocabulary.ts:23` |
| `trade-authorization.ts:81-85`, `trade.ts:36-49,168` (TRD-6) | `trade-authorization.ts:101-104`, `src/campaign/trade.ts:47,177` |
| `trade.ts:126-131`, `validation.ts:215-222` (AUTH-4) | `trade.ts:136-139`, `validation.ts:216-220` |
| `validation.ts:287` (TRD-12) | `src/campaign/validation.ts:290` |
| `person-offers.ts:349-355` (F7/I12) | `src/turn/commerce/person-offers.ts:333-341` |
| `prompt-builder.ts:302` (CTX-1) | `src/turn/context/prompt-builder.ts:138` |
| `session-view.ts:96,104` (I14/ID-5) | `src/app/session-view.ts:97,105` |
| `save-format.ts:102-106` (PER-4) | `src/persistence/save-format.ts:10,148-149` |
| `heartstone-rite.ts:174-186` (§7) | `src/campaign/heartstone-rite.ts:34-47` |
| `identity-request.ts:17-36` (NAME_REQUEST row) | `src/turn/identity/identity-request.ts:30` (`asksName`) |
| `tests/ui/play-client.test.ts:957` (TEST-1) | the lifecycle test is around `:930-991` (`manualClock`) |
| `city_map.png` (REPO-7) | `city_map/city_map.png` |
| `eval-hardening.js` (CI-3) | source `src/dev/live/eval-hardening.ts` |
| Bare basenames throughout (`trade.ts`, `narration-audit.ts`, `command-authorizer.ts`, `stages/*.ts` ...) | resolve uniquely under `src/turn/<domain>/` or `src/campaign/`; `validation.ts` is ambiguous (`src/campaign`, `src/retrieval`, `src/world`) |

## Items needing a human decision

| ID | Decision question (one line) |
| --- | --- |
| ID-8 / NPC-3 / F8 / D5 (+ AUTH-5) | Can a canonical NPC become a campaign record or NPC+? If not, should `characterForUpdate` refuse canonical ids, or should canonical records be created only by a deliberate command? |
| NPC-1 / NPC-2 (D4) | Should "inactive NPC+ plus rejoin plus badge" be confirmed as the rule for a promoted NPC+ who leaves the household, so the rejoin UI path can be built? |
| ECO-1 (D3) | Should funds move to integer silver internally (display G/S, schema bump) or should anchors become gold-only? |
| TRD-11 | Once D3 is decided: a generic economy ledger type with a goods `transactions` entry, or keep `settlement` as the only trail and fix ACTUAL_OFFER.md (DOC-12)? |
| IMG-10 (D9) | Should the reference-image upload UI and field be removed until img2img exists, or should img2img be built? |
| DOC-13 | Should the author-only section of `docs/world/CANON_OVERVIEW.md` (§10) move out of the indexed normative doc? |
| AUTH-7 (optional) | Should `/api/location` be gated behind a dev flag or behind a confirmation in the player UI? |
| PRV-7 / TEST-4 (D8/D13 execution) | D8/D13 already say "remove the image client, park Voyage and the semantic index". Should that be executed now, which would also unblock TEST-4? |
