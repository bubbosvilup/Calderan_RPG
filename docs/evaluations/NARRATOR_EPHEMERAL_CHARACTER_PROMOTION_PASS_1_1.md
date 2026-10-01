# Narrator-invented character promotion and purchase: pass 1.1

2026-10-01. This was runtime work only: no lore, no canon YAML, no new canon NPCs, no quests. It adds no NPC+ personality system and no async reflection, and it does not redesign relationships. Test prose is fixture text written for the tests; the historical CSV was used only as a local behavioural check (§H) and none of it is in the repository. Nothing is committed or pushed.

| Gate | Result |
|---|---|
| Typecheck | PASS |
| Deterministic tests | 915/915 (907 before; 8 new in `tests/narrated-promotion.test.ts`) |
| Playthrough | 25/25 |
| Authored-data validation (in the suite) | PASS |
| Coordinator purchase and save/load tests | PASS (Pass 1 household tests unchanged and passing) |
| Escape scan (`.build/scan-escapes.cjs`) | clean apart from the two known false positives |
| Source hash (`src/`+`data/`) | e47ec2de… → d4ef659c0c54… (data unchanged) |

**Answer to the brief's question:** yes. A historical live-style purchase can now begin from a narrator-invented captive with no pre-registered persistent character, **when the seller is an established persistent character** (canonical, like Korvin, or already created).

On the real historical Brenna narration (multi-paragraph, with unattributed seller quotes), the resolver promotes her and completes the sale: 5 gold, documented papers, age 32 as the seller stated, and the seller's background statements.

The historical Maren shape does **not** complete. Its seller, "the whittler", was himself narrator-invented. The resolver picks out "the girl" correctly, then blocks the purchase safely (see N).

## A. Existing ephemeral architecture (audit)

1. **How narrator-created people are represented.** They are not represented at all. A person the narrator invents exists only in delivered narration, held in `RecentConversation`: session-only, at most 12 exchanges, never saved. The separate `SceneParticipants` registry holds *player-introduced* temporary people only:
   - `scene_npc_<n>`, created from phrases like "stops a passer-by" or "approaches the slave";
   - a role label ("P1 Slave"), no name;
   - an optional appositive descriptor;
   - expiry after 2 unaddressed turns or a scene change;
   - never persisted; it gives a knowledge scope only.
2. **Fields.** Participants carry id, ref, role, display_name, descriptor, standing, location/locality and turn counters. Narrated people carry nothing.
3. **Becoming persistent.** No production path existed. `register_character` was used only by fixtures and tests; the controller cannot register characters.
4. **IDs.** Created records use `campaign_<kind>_<localKey>`, supplied by the caller and checked for collisions by `CampaignIdentityResolver.newId`. Participants use a session counter.
5. **Identity across turns.** Only while the prose stays in the 12-exchange window. Nothing survived a reload.
6. **Appearance, age, species, role.** `CampaignCharacter.profile` could hold them (name, age exact or approximate, sex, species, appearance), and `current` could hold location, status and conditions. Nothing ever filled them from narration.
7. **Where created-character state lives.** `CampaignSnapshot.characters`. A created character's location is `current.current_location`; context presence is derived from it.
8. **Transactions and ordering.** A Pass 1 purchase needed a registered subject with a legal record. The coordinator already resolved purchases before narration and prevalidated them with `campaign.prepare`. Runtime commands feed both the projected narrator context and the final atomic proposal, so no new commit path was needed.

## B. Promotion model

- **Minimum durable character.** A narrator-invented person becomes an ordinary created character: `origin: {kind: "created"}`.
  - `profile`: only established name, sex, age, species and appearance.
  - `current`: the promotion location, `status: active`, and established conditions.
  - An immutable `origin_snapshot`.
- **No personality.** Nothing is generated: no traits, history, family, fears, skills, household role or relationships.
- **Generic primitive.** `src/campaign/promotion.ts` provides `buildPromotedCharacter(PromotionInput)` and `promotedCharacterId`.
  - Triggers are typed `purchase | rescue | recruitment | recurring | household_invitation | quest`.
  - **Only purchase is production-wired**; the others are reserved in the type, with no automatic triggers.
- **Where captives come from.** `src/turn/narrated-captives.ts` derives captives from the current scene's delivered narration:
  - Scene scope is the trailing exchanges whose recorded `location_id` is the player's location. `RecentExchange.location_id` is new, session-only, and stripped by `forPrompt()`, so prompts are unchanged.
  - **Named captives:** the name must be introduced *as a name*: "named/called X", "name is X", "This is/That's X", "X, a young woman", "a girl named X", or a quote opening with the name ("X. Thirty-two. …") where the name recurs. Capitalized words are never names by default. Stopwords, numbers and canon place names are excluded.
  - **Unnamed captives:** "a/the … woman/girl/…" in a sentence with a captivity marker (cage, bars, chains, collar, pens, auction, enslaved, for sale, debt auction/forfeiture, write-off).
  - **Captive requirement:** a sentence about the person must carry a captivity marker.
  - **Present people are never candidates:** a present persistent character is never a candidate, and neither is the description narration attached to them (§F).
- **Unnamed promotion.** An unnamed captive (the historical Maren was "the girl" when bought) can be promoted too, with **no name**. `profile.name` stays unset, and the narrator-facing context shows the promotion label ("the girl"). No name is fabricated.

## C. Origin snapshot

`CampaignCharacter.origin_snapshot?: CharacterOriginSnapshot`:

```
source "narrator_ephemeral", trigger, promoted_revision, promoted_world_minute, location_id,
label (established name, else "the girl"), ephemeral_ref ("scene_npc_1" or "narrated:brenna"),
established { name?, sex?, age?, species?, role?, appearance[]?, condition[]?, background[{text, source}]? },
evidence[] (verbatim source sentences, ≤12 × 240 chars)
```

- **Immutable:** it is written only by `register_character`. No command edits it, and `set_profile` does not touch it.
- **Preparation** rejects a snapshot if:
  - it is on a canonical character;
  - `promoted_revision` is not the revision it commits at;
  - the world minute is not now;
  - its location is not the character's location.
- **Snapshot restore** rejects one on a canonical character, or one that postdates the snapshot.
- **Missing facts are unknown, not hidden:** a missing field is not a secret.

## D. Seller-authority policy

- **Who can be a seller:** a present persistent character who is not Nicco and not enslaved.
- **Where authority must come from:** the seller's **own attributed statement** in the current scene's narration.
- **Attribution:** an explicit speech clause (`"…," Korvin says`), or the running sentence subject across paragraphs. For example, "Korvin's mouth twitches…", then an unattributed quote, then "He tucks the ledger…", then another quote: both quotes are Korvin's.
- **Accepted:**
  - an ownership claim: "she's mine", "I own her", "my stock", "I paid four for her", "picked her off a debt auction";
  - a sale offer: "she's yours", "yours for", "take her for", "five gold for her" or "for the girl";
  - a price the seller states in reply to a price request ("Name your price" or "How much for the girl?").
- **Rejected:** a seller merely present or describing someone ("She came in yesterday"), a player assuming ownership, and statements naming a *different* captive.
- **Outcomes:** exactly one seller must qualify. None gives `seller_authority_unestablished`; several give `seller_ambiguous`.
- **Initial legal state** (enslaved, holder = that seller) is created only inside the same prepared proposal. The recorded note is the seller's basis sentence; no deeper provenance is invented.

## E. Atomic purchase integration

The purchase order is unchanged from Pass 1, now with promotion:

1. The player input is resolved against the narrated scene.
2. The proposal is `register_character`, then `set_legal_status`, then `transfer_person` (sale, payment, papers, ledger).
3. `campaign.prepare` checks the whole candidate before narration.
4. The narrator gets the authoritative result.
5. The promotion commits in the same revision as the turn.

- **One boundary.** Promotion, legal setup, payment, ownership transfer and the ledger entry commit in **one revision**, because commands apply sequentially to one draft and any failure throws before commit.
- **Failures.** If prevalidation fails, every trade command is dropped, including the registration. The narrator is told nothing changed, so it is never told a purchase succeeded when promotion would fail.
- **Papers:** these come only from the seller's own words in the offer narration: documented, undocumented or unestablished. Clean papers are never assumed.
- **Price:** the player's stated amount, otherwise the seller's most recent single-person offer. Past costs ("paid four for") and group prices ("eleven for both", "ten for the lot") are skipped *per sentence*.
- **Subject resolution:** exactly one subject, found in this order:
  1. the player's own reference (name or "the girl");
  2. the person the latest price talk refers to;
  3. a single candidate;
  4. the single one mentioned in the latest narration.
- **Subject rules:**
  - Unnamed descriptions never compete with a persistent candidate, because they may be the same person.
  - Player and offer references that disagree give `subject_changed`: identity may not change between offer and acceptance.
  - Two or more matches give `ambiguous`, and no promotion.
- **No side effects:** no relationship edge, no household membership, and no manumission. "I bought you to save you" and "you're safe now" are not manumission. A person promoted this turn cannot be manumitted in the same turn, because manumission reads committed legal state.

## F. Identity preservation

- **One ID per person.** The ID is revision-scoped: `campaign_character_r<promoted revision>_<slug>`.
- **Duplicate names.** A different narrated "Brenna" with a persistent Brenna elsewhere gets a distinct ID and is never merged by name. A **present** persistent Brenna is never re-promoted.
- **No second person from the same description.** After promotion, the name and any description narration attached to it ("a thin girl named Maren") are the persistent person, not a new candidate. A promoted unnamed "the girl" suppresses further "girl" candidates the same way.
- **This fixed a double-promotion bug.** Before the fix, a retry after Maren's purchase re-found "the girl" as a new captive.
- **Scene participant link.** If the player had introduced the person as a temporary participant ("approaches the slave"), that participant's ID is recorded as `ephemeral_ref`. It is removed from the scene plan that same turn, so "P1 Slave" and Brenna never co-exist in the prompt. The next scene-participant commit drops it permanently.
- **Narrator context from the purchase turn onward:**
  - `Character Brenna (campaign_character_r…_brenna)`, with profile, conditions, and an `established_at_promotion` block: label, role, and background with source ("stated by the seller").
  - The legal block: "legally enslaved; legal holder Nicco; transfer papers documented".
  - "Present but NOT household members: … Brenna".

## G. Save and load

- **Format.** `origin_snapshot` is part of the version-1 character record, parsed strictly.
- **What survives.** A save → serialize → decode → restore round trip preserves the full character record (ID, profile, location, origin snapshot) and all legal state.
- **No transcript dependency.** A fresh coordinator session with empty history, which is the same as after a reload, still gives the narrator her established identity (§H).
- **Old saves.** Existing saves remain valid, because the field is optional.

## H. Brenna live-shape regression

**Resolver.** The market starts with **no Brenna registered**. Two narrations follow:
- the intro, where the seller names her with "Brenna. Thirty-two. Came to me through a debt auction…", and she coughs behind the bars, feverish;
- the offer: "Five. She's a burden I paid four for." … "Papers included. Clean transfer, debt-forfeiture chain, no liens. … she's yours."

Then the player says "Done. \*pays him\*". After commit:
- one promoted character with origin `narrator_ephemeral`/`purchase` and label Brenna;
- sex female (her own pronoun sentences), exact age 32 (the seller's naming quote), conditions feverish and coughing;
- background "…debt auction in Ashford…", with source seller;
- enslaved, holder Nicco, documented, provenance note kept;
- money 500 → 495, household empty, no relationship edges, one transaction, one revision.

**End to end.** The coordinator runs a scripted narrator and controller:
1. "\*approaches the slave in the last cage\*" creates P1 Slave.
2. The negotiation follows.
3. "Done. \*pays him\*": the narrator is told "Purchase completes now … Nicco pays Korvin 5 gold and becomes Brenna's legal holder". The same prompt already lists `Character Brenna (campaign_character_r…_brenna)` and no longer lists P1 Slave; `ephemeral_ref` is "scene_npc_1".
4. A retry of "Done. \*pays him\*" changes nothing: one promoted character, 495, one transaction.
5. A fresh session with no transcript shows Brenna exactly once, with her seller-stated background, sex and age, the legal block, and non-membership. The debug status shows her origin; the player status does not.
6. Save/load preserves her.

**Historical check (local only; the CSV is not committed and none of its prose is in tests).** The resolver ran on the eight exchanges before the historical "mmh alright \*pays up\*…".
- **Captives found:** Brenna, plus unnamed "the boy", "the slave" and "the woman".
- **Resolution:** it resolved Brenna, because she is the only one mentioned in the latest narration.
- **Seller:** Korvin, with basis "…You walk her out that gate, she's yours…".
- **Terms:** price 5, papers documented.
- **Established facts:** age 32, female, coughing, and two seller-stated background sentences.

## I. Maren live-shape regression

- **Setup:** Brenna is already persistent, held by Nicco and a household member; money is 454.
- **Seller:** a fixture seller registered as a created character ("Oswin"). Korvin is present but made no offer, so he has no authority.
- **Scene:** narration introduces "a thin girl named Maren" behind the bars, feverish. In reply to "How much for her?", Oswin says "Three gold … No papers, no listing."
- **Player:** "\*pays him and takes the key to free her\*".
- **Result:**
  - Maren is promoted once: female (from "girl"), **no age** ("girl" is not an age), appearance thin, feverish.
  - Enslaved, holder Nicco, papers `undocumented`; money 454 → 451.
  - The household stays [Brenna]; no relationship edges; no manumission ("free her" is unchaining).
  - A repeated acceptance produces nothing: no second promotion, no second transaction.
- **Historical check (local only).** On the real Maren narration, the resolver picks "the girl" out of two captives mentioned in the latest narration, via "Name your price for the girl". It then blocks `seller_authority_unestablished`, because the historical seller is a narrator-invented person, not a persistent character.

## J. Failure atomicity

Every case leaves **no promoted character, no payment and no legal record**:

| Case | Result |
|---|---|
| A. Insufficient funds (2 gold) | `insufficient_funds`, narrator note "has only 2"; end to end, nothing registered |
| B. Two named captives, a group price, "Done." | `ambiguous`; "I'll take Tamsin" resolves |
| B′. Offer names Brenna, player names Tamsin | `subject_changed` |
| C. Seller only describes her ("She came in yesterday"), player names a price | `seller_authority_unestablished` |
| D. Stale revision | the whole proposal throws `stale`; nothing promoted; money 500 |
| D′. Forged holder (legal setup under Nicco, sale from Korvin) | preparation throws; nothing promoted |
| E. Replay of the same proposal | throws; one character, one payment, one transaction |
| F. Authority but no price | `no_offer` |

## K. Non-invention safeguards

- **"A young woman named Lysa, thin and bruised."** This yields exactly: name Lysa, female, age "young adult" (approximate), appearance thin, condition bruised. There is no exact age, no background, no species and no traits, and no separate "the woman" candidate.
- **A bare name.** "That's Ilsa. … Ilsa, maybe eighteen, maybe less …" gives name only: no sex, no age (the hedged statement is ignored), no species, no background.
- **Capitalized words.** "Something" and "Papers" are not people.
- **General rules:**
  - Sex comes only from an attached noun or the person's own pronoun sentences, never from a name.
  - "Girl" or "boy" establishes no age.
  - Child or adolescent wording is recorded as a minor, so the romance gate stays closed.
  - Background is only ever kept with its source (seller, self or narration) and never as objective history. Hedged narration is excluded.

## L. Future NPC+ hooks

- **Query.** `narratorEphemeralCharacters(snapshot)` answers "Which persistent characters originated as narrator-created ephemerals?"
- **What a future system can read.** The immutable `origin_snapshot` supplies the facts NPC+ initialization must not contradict.
- **Not added:** personality generation, attachment styles, disclosure gating, development summaries, household-role emergence, async reflection, background LLM jobs, personality mutation, and a premium dialogue assembler.

## M. Tests

`tests/narrated-promotion.test.ts` (8 tests):

1. **Brenna live shape:** one proposal and one revision; the full post-state (§H); no manumission from "you're safe".
2. **Maren live shape:** §I, including the no-re-promotion retry.
3. **Failure atomicity:** cases A–F plus B′ and D′.
4. **Unnamed captive:** promoted as "the girl" with no name; narrator label; unpapered; never re-promoted.
5. **Duplicate names:** a distinct ID for a different Brenna; no merge by name; a present Brenna is never a candidate.
6. **Non-invention:** Lysa, a hedged age, a bare name, capitalized words.
7. **End to end, Brenna:** participant link and retirement; context from the purchase turn onward; retry; fresh-session continuity; debug and player status; save/load.
8. **End to end, unaffordable:** blocked before narration, nothing registered.

The Household Pass 1 suites (18 tests) and the full suite pass unchanged.

## N. Remaining limitations

1. **Narrator-invented sellers are not promoted.** A purchase needs a persistent seller. The historical Maren shape (the whittler) is blocked safely with `seller_authority_unestablished`. Next step: promote the seller under the same primitive, with an explicit policy for a seller's own authority, such as "Drel said dump them".
2. **Attribution is heuristic.** Unattributed quotes take the running sentence subject. A pronoun speech clause after a different subject ("Tamsin sits… 'Five gold for her,' he says") can be misattributed. The failure is safe (blocked, nobody promoted), but it can refuse a legitimate purchase until the seller is named.
3. **Scattered descriptions stay separate.** Facts narrated before a person is named ("a woman sits against the bars, dark hair…" before "Brenna") belong to the unnamed description and are not merged into the named person. This is conservative by design, so promoted profiles can be sparse.
4. **Unnamed promoted people keep their label.** A later self-introduction ("My name is Maren") does not yet set the name; there is no deterministic naming step and no controller `set_profile`.
5. **One subject per turn.** Group purchases ("both", "the lot") are not resolved into multiple promotions.
6. **Candidate scope is the recent window.** Captives come from the recent-conversation window (≤12 exchanges, 16k characters) in the current scene. A person introduced earlier and evicted from the window cannot be promoted.
7. **No live LLM run.** None was required, and none was made.
8. **Only purchase triggers promotion.** Rescue, recruitment, recurring conversation, invitation and quest triggers exist only in the type.

NARRATOR-EPHEMERAL CHARACTER PROMOTION PASS 1.1 COMPLETE
