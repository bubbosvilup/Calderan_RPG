# P3.4 — Canonical participant continuity

Status: FIX IMPLEMENTED; live verification pending. P3.3: LIVE PASS per supplied playtest, unchanged. Paid provider/embedding calls: 0. Baseline audited: `ca79cf3`.

## 1. Live evidence

The supplied UI sequence successfully disclosed `Korvin.`, then later produced `Name's the unfamiliar man [NPC12].`, `Folks call me the unfamiliar man [NPC12].`, or invented `Garran` in alternatives. The historical UI campaign/request snapshot was not attached. Offline reproduction therefore verifies deterministic engine transitions and actual loaded ref mappings, rather than claiming to reconstruct each model's historical choice.

## 2. Exact identity timeline

Before editing, a real offline TurnCoordinator run used the loaded world, an opening campaign moved to Calderan Slave Market, an empty controller proposal and scripted delivered RPG narration. All three sellers were present: `bartolomhew`, `korvin`, `mistress_elara`. There were no campaign-created or premium characters.

| Stage/input | Canonical actor/ref | Name knowledge after commit | SceneParticipantPlan | Foreground/request |
| --- | --- | --- | --- | --- |
| Initial market | `korvin` / `NPC24` | null | Empty registry | Unknown canonical identities |
| `I approach the short compact man.` | Still `korvin` / `NPC24` | null | Creates `scene_npc_1`, ref `P1`, role `person`, display `Man`; focus `scene_npc_1`; addressed `[]` | Observable descriptor independently resolves canonical Korvin; request contains BOTH canonical Korvin and temporary Man as current partner |
| `name's Nicco, who am i speaking with?` | Still `korvin` / `NPC24` | **Korvin** | Turn 2 carries Man; focus null; no creation/address | Recent explicit descriptor still foregrounds Korvin; P3.3 supplies his own self-name; `*The short man replies.*` followed by `Korvin.` commits canonical fact/knows edge |
| `Are you the only one seller around here?` | Still `korvin` / `NPC24` | Korvin | Turn 3 expires `scene_npc_1`; focus null; addressed `[]` | Approach is still inside the two-turn focus window; normal foreground identity has `player_known_name: Korvin`, but also the contradictory old label `the unfamiliar man [NPC24]` |
| `mmh alright then *shacking his hand* u said you are named?` | Still `korvin` / `NPC24` | Korvin | Turn 4 empty participants/focus/address; no creation | Approach is outside the two-turn window. All sellers are background. Korvin still has known-name knowledge, but no current canonical partner is bound |

The trace recorded before/after identity, scene plans, registry entries, finalized history and the actual prepared narrator request. This was captured before edits in the ignored local artifact `.build/p34-before.jsonl`; a corresponding after trace is `.build/p34-after.jsonl`.

Reference/continuation audit: the approach descriptor was understood by narrator focus, not by temporary-person creation. The later inputs do not explicitly name another actor or establish another canonical reference. The old participant continuation only searched its temporary list and only retained focus when that temporary person was addressed; it could not keep canonical Korvin as a partner. RecentConversation stored player/narration/status/location only, with no actor binding. The name remained committed; no engine record actually changed Korvin into another entity.

After the fix, every plan in this four-turn sequence has `focus: korvin`, `addressed: [korvin]`, `created: null`, empty temporary entries and market-scoped canonical continuity. Finalized exchanges carry `conversation_partner_id: korvin`. On later requests Korvin is foreground with normal known-name identity; the other two sellers remain masked background actors.

## 3. What NPC12 actually was

The loaded identity registry maps **NPC12 to canonical `dren` (Dren)**. **Korvin is NPC24**. The reproduced temporary Man was **`scene_npc_1` / P1**, not NPC12. These conclusions come from registry entries, not number inference.

Korvin's authored private portrayal includes “He does not personally know Dren by default.” Before this fix its narrator projection contained `the unfamiliar man [NPC12]`. Thus that exact human-readable label was available in Korvin's request without Dren being the addressed actor or present seller. A model copying/confusing that label is consistent with the supplied output, but its historical reasoning cannot be established from the output alone.

## 4. First failing transition

The first deterministic identity break is the **approach plan**, before narration: `SceneParticipants.plan` recognizes the interaction-plus-role phrase and creates generic Man even though the same phrase uniquely resolves to present canonical Korvin in narrator focus. Two systems independently represent the same interaction.

The subsequent foreground loss is a second manifestation: no canonical partner is retained, so focus eventually depends on an approach string that expires from a two-turn window.

## 5. Root cause

Temporary participant planning previously had no shared canonical descriptor resolution. Its focus/continuation was restricted to temporary records. Narrator focus separately understood explicit canonical descriptors but only recovered recent player attention for two turns. Neither mechanism retained a resolved canonical conversational actor through ordinary dialogue.

The identity projection compounded this by always generating `the unfamiliar <person> [NPCn]`, including for already-known NPCs, and by concatenating a machine correlation ref into the human label used to mask proper names.

Architecture decision: canonical world NPCs remain canonical entities, with runtime location overlays and existing canonical knowledge. `name-establishment.ts` explicitly excludes canon names from narrator-created-person promotion. Named genuinely created people can become campaign characters under existing rules; NPC+ is separate. Speaking or revealing a canonical name does not require promotion. No promotion policy changed.

## 6. Fix

- Extract existing explicit canonical name/ref/observable descriptor matching into `canonical-interaction-targets.ts`, shared by focus and participant planning. Descriptor matching still requires exactly one present canonical match; broad generic human labels are never unique references.
- Resolve canonical targets before generic role creation. Suppress creation for the same uniquely resolved interaction phrase. Explicit `another`, `some`, or `one` remains eligible for distinct temporary creation.
- Let the existing participant focus/address fields contain canonical actor IDs. Keep their scene location as session metadata; successful commit alone updates continuity.
- Continue second-person/direct-speech interaction with that bound present canonical actor. A different explicit person, attention shift, missing actor or changed scene prevents automatic continuation. Multiple canonical targets establish no singleton partner.
- Record the resolved canonical conversation partner in finalized RecentConversation metadata. Focus can use that engine ID instead of reparsing only old player text. A real temporary partner blocks stale canonical recent-focus fallback.
- Remove refs from observable labels. Supply a bounded authored observable appearance where available, and do not describe a known actor as unfamiliar. The separate `ref` and `player_known_name` fields retain their roles.

Production models/routes, regeneration model list, pacing, physical-action expansion, auction/pricing/P8/P9 logic, clock/P11 and P3.3 disclosure detection/recognition/commit code are unchanged. No output replacement was added.

## 7. Canonical-vs-temporary precedence

An explicit unique canonical binding wins over generic noun continuation. A genuine new temporary participant wins its own subsequent conversation; it is not merged with the prior canonical partner. Ambiguous descriptors never choose either canonical actor. Two explicitly referenced canonical actors have no arbitrarily chosen focus.

An older temporary participant does not become canon merely because its role overlaps. Explicitly addressing canonical Korvin switches focus to Korvin, while the unrelated/unproven temporary entry expires under the existing inactivity rule. There is no broad entity-merging operation.

## 8. Knowledge continuity

The only source of player-known canonical names remains existing `learnCanonicalName` facts/edges. The exact-flow test asserts Nicco's `knows` edge for Korvin after delivered self-disclosure, followed by ordinary known-name request projection, with no further controlled disclosure capability. Ordinary dialogue creates no campaign character, NPC+ membership or alternate name record and does not advance the campaign revision in the fixture.

Korvin's unknown aliases/private information do not become player knowledge merely because his name is known.

## 9. RecentConversation behavior

`conversation_partner_id` is optional bounded engine metadata associated with a finalized exchange. It records the resolved partner, not a claim that every line or every speaker in a multi-person narration belongs to that actor. Failed turns do not publish a canonical partner. The stored metadata contains an ID, not another name string.

The existing dialogue projection still preserves RPG plain speech verbatim: `Korvin.` remains `Korvin.`. No textual speaker-name requirement or new RPG output format was introduced. Engine partner metadata is used for focus and is not serialized as a raw ID into the narrator's dialogue-history block. Existing history size and eviction bounds remain.

## 10. Save/reload behavior

The new regression serializes a campaign snapshot, restores via existing `CampaignState.restore`, and uses a fresh coordinator with **zero retained conversation history**. Addressing the short compact man resolves canonical Korvin, exposes the learned name normally, creates no temporary actor and requires no second introduction. Continued second-person conversation then retains that binding.

Session-local partner/temporary registries are not saved by the existing architecture. A bare “you” after a fresh reload in a multi-person scene cannot uniquely identify a partner without re-addressing evidence; this fix does not introduce a save-schema or persistent conversational-focus policy. Actor identity and name knowledge themselves survive independently of history.

Leaving and returning are tested through existing runtime location mutations and finalized turns at both locations, followed by explicitly addressing Korvin again. His canonical knowledge survives and no duplicate is created. No movement feature was built for the test.

## 11. Multi-NPC safety

The exact sequence uses all three canonical sellers. Korvin alone becomes known. Requests on later turns have foreground `player_known_name: Korvin`; Elara/Bartolomhew remain masked. Explicitly addressing the unique platinum-blonde woman switches the partner to Elara without teaching either other seller's name.

A separate world fixture gives Bartolomhew the same observable short/compact appearance as Korvin. The shared descriptor then matches neither as a unique target; no canonical merge/name grant occurs. A genuine `another man` still creates a temporary participant and continues as that participant.

## 12. Opaque-ref impact

**PARTIALLY ADDRESSED overall.** The local concatenation defect is fixed: identity `observable_label` no longer contains `[NPC12]`, `[NPC24]` or any machine ref. Proper-name masking consequently no longer manufactures the reported bracketed human-readable label. Known Korvin also loses the misleading unfamiliar label.

Opaque refs still exist as dedicated correlation fields, headers and existing authority references. This task does not structurally remove every ref from every request or guarantee every model will obey the machine-reference contract. No claim is made that all narrator-ref leaks are closed. No broader ref architecture rewrite or output sanitizer was performed.

## 13. Tests

- `npm run typecheck`: PASS.
- `npm test`: 2,129 passed / 2,133 total; 0 failures; the same 4 historical TODOs.
- `npm run test:playthrough`: 25/25 passed.
- Focused participant/P3.3/P3.1/P3.2/P1.2/history/identity stress/location/save suite: 156/156 passed.
- New P3.4 regressions: 10/10 passed.
- `git diff --check`: PASS.
- Paid provider/embedding calls: 0.

The pinned pipeline fixture was deliberately updated only for observable-label representation, canonical focus/address/location metadata and finalized partner metadata. A recursive before/after comparison confirmed controller payloads, state mutations, event/stage order and commit behavior remained unchanged. The compaction fixture's exact estimated-token baseline changed from 3290 to 3305 because of the identity-label representation. Existing compaction/permission tests remain active.

One intermediate full-suite attempt collided with a parallel script rebuilding `.build`, causing an incomplete-module import; the final full-suite run was performed serially. No test weakening or historical TODO change was made.

## 14. Remaining limitations

Live production/alternate model verification remains pending. Historical UI runtime data was not retained in the request, so Dren-label copying is an evidence-supported explanation, not a recorded model decision. Ref compliance beyond the fixed human-label concatenation remains open.

The descriptor grammar remains intentionally bounded; broad or overlapping descriptions fail to select canon. Re-addressing may be required after scene changes, explicit attention changes or fresh session reloads. A temporary participant created by an older running build has no trustworthy canonical binding to auto-merge; restart the UI and re-address the canonical actor when checking this fix.

## 15. Live verification checklist

1. Restart with this build and a fresh scene interaction. Have Korvin and the other sellers present; approach the short compact man.
2. Ask `name's Nicco, who am i speaking with?`; confirm truthful Korvin self-disclosure and committed knowledge.
3. Ask `Are you the only one seller around here?`, then `mmh alright then *shacking his hand* u said you are named?`.
4. Inspect the new turn's plan/request: canonical Korvin focus/address, no temporary Man creation, known name Korvin in normal identity, no bracketed refs in observable labels and no second disclosure capability.
5. Compare production/alternate narration for the newly prepared turn. Frozen regenerations of a pre-fix turn still use that original request and do not validate new participant planning.
6. Save/reload, explicitly re-address Korvin by name or unique observable description, and continue. Repeat after leaving and returning.
7. Address a genuinely new unnamed person; confirm legitimate temporary creation still works and neither unknown seller's name is learned.

P3.3: LIVE PASS / unchanged. P3.4: FIX IMPLEMENTED / live verification pending. P10: SOFT / unchanged. P11: PAUSED / unchanged.
