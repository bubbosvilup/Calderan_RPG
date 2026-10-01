# Narrator character persistence and anonymous sellers: pass 1.2

2026-10-01. This pass changed runtime rules only: no lore, no canon YAML, no NPC+, no async reflection, no rumor system. Test prose is fixture text written for the tests. The historical transcript was used only for local simulations (§F, §G); none of it is in the repository. Nothing is committed or pushed.

| Gate | Result |
|---|---|
| Typecheck | PASS |
| Deterministic tests | 926/926 (915 before; 11 new in `tests/narrator-persistence.test.ts`; the Pass 1.1 suite was updated to the new model) |
| Playthrough | 25/25 |
| Coordinator purchase and save/load tests | PASS (Household Pass 1, Promotion 1.1 and Persistence 1.2 suites) |
| Escape scan | clean apart from the two known false positives |
| Source hash (`src/`+`data/`) | d4ef659c… → 2bf45dc4… (data unchanged) |

**Answers to the brief's four questions:**
1. **Does learning a proper name promote an ephemeral narrator-created person?** Yes. When delivered narration securely establishes a proper name for a person present in the scene, that person becomes a campaign character at the end of that turn, atomically with it. A name alone is enough, and the engine never asks whether the person is important.
2. **Can the historical Maren purchase complete without promoting "the whittler"?** Yes. The whittler stays anonymous. The sale records him only as a transaction counterparty snapshot: label, location and the authority evidence ("Three gold. … No papers, no listing"). Maren becomes exactly one campaign character: by name if her name was established first, or as the unnamed "the girl" otherwise.
3. **Can an unnamed purchased captive later reveal a name without becoming a second character?** Yes. The girl's own "My name is Maren" sets `profile.name` on the same record. Her ID, immutable origin snapshot (which still records the name as unknown), legal state, household and relationships are unchanged.
4. **Does healing or witnessing alone leave the chestnut boy ephemeral?** Yes. Talking, a wound, secret healing, a witnessing passer-by, thanks and leaving create no campaign character, origin snapshot, relationship, condition record or household change.

## A. Previous promotion behaviour (audit)

- **Pass 1.1** promoted narrator-created people only as the subject of a purchase (trigger `purchase`), named or unnamed. A narrator-created seller blocked the sale (`seller_authority_unestablished`), and an unnamed promoted character could never acquire a name.
- **Existing support for this pass's four needs:**

  | Need | What existed |
  |---|---|
  | A. Promotion when a name is established | The 1.1 name patterns (named/called, "That's X", "X, a young woman", quote-opening names) and `buildPromotedCharacter`; no trigger outside purchases. |
  | B. Unnamed persistent characters | Existed (label, no fabricated name). |
  | C. Later naming | Only `set_profile` (replaces the profile; not used by play). |
  | D. Anonymous counterparties | None. `transfer_person` required a character `from_holder_id`, and `PersonLegalState` required a character holder, so an anonymous seller could not be represented without a fake character. |

- **Related facts.** `RecentConversation` has scene locations since 1.1. Save/load strictly parses `origin_snapshot`. Narrator context shows created characters only when they are present at the player's location.

## B. The three-level model

```
NARRATOR-CREATED PERSON ──(proper name securely established)──▶ CAMPAIGN CHARACTER ──(joins household)──▶ NPC+ (future)
                         └─(unnamed, but acquired by the player: the one exception)──┘
```

- **Deterministic and narrow.** There is no importance score, soft signal, turn threshold or controller judgement.
- **What does not promote:** dialogue (of any length), wounds, healing, sickness, gifts, money, witnessing, rumors or rumor mentions, emotional weight, repeated description, an occupation or a descriptive label.
- **Other triggers.** `CharacterOriginSnapshot.trigger` is `name_established | purchase_unnamed_subject`, plus `recruitment | custody | rescue`. Those last three are reserved for future explicit systems and are not wired.
- **NPC+ boundary.** A campaign character will become NPC+ only by joining the household. No NPC+ state exists yet.

## C. Name-driven promotion

`src/turn/name-establishment.ts` runs on the **delivered** (audited) narration at turn finalization.

**When it runs:**
- It runs after reconciliation and before commit, with no await between.
- Its commands join the already-validated turn proposal and commit in the same revision.
- If the combined proposal does not validate, the identity changes are dropped; the turn is never lost.
- It is exposed as `TurnResult.identity`.

**What counts as a name** (`src/turn/narrated-captives.ts`, conservative):
- **Pattern introductions:** "a girl named Maren", "a man called Oswin", "Lysa, a young woman", "That's / This is Brenna", "Her name is Maren".
- **Self-introductions attributed to the speaker:** "My name is Tomas", "I'm Tomas", "Name's Oswin", "Call me …", or a bare "Tomas." answering "What's your name?".
- **Weak introductions:** a quote opening with the name ("Brenna. Thirty-two. …"). These count only when narration also uses the name as an acting subject ("Brenna coughs…").
- **Never names:** capitalized words, places, titles, numbers, occupations, descriptors, guesses ("Maybe it's Garrick?"). A canon character's name never becomes a duplicate narrator-created person.

**Who is promoted.** A person first named in this exchange who is **present**: they act or speak in the scene, self-introduce, or are introduced in narration's own voice. Someone only talked about ("an old woman named Maren runs it", "word is a smuggler named Dace…") stays unpromoted, and so does anyone whose name is contested (two speakers claiming it).

**Promoted profile.** Only established facts: name, then sex from an attached noun or their own pronoun sentences, an explicit or banded age, species, appearance and condition from sentences *about them*, background with who said it (`by: "Korvin"`), and the descriptor noun. A name alone is enough. Nothing is fabricated.

## D. Unnamed acquisition exception

- **Purchase of an unnamed narrated captive** promotes them under `purchase_unnamed_subject`, with `profile.name` unset and the label "the girl", in the same atomic proposal as the purchase.
- **Named captives** are normally already persistent by then, promoted when their name was established. A persistent captive with no legal record (origin role "held captive (narrated)") is bought without re-registration.
- **Only a live trade counts.** The resolver now considers a narrated subject only during a live person trade. That means price talk in the latest exchange (narration or the player's request), or a stated amount in the current input, and the person referenced or mentioned there. "U got a deal, merchant" about a halberd, "I'll pay a visit" and "he pays the price instantly" (a mana cost) never reach back to an earlier captive. All three came from the historical transcript.

## E. Anonymous seller provenance

**Sellers** are one of three kinds:
- a present persistent character;
- a named narrator-created person, promoted by the ordinary name rule inside the purchase proposal;
- an **anonymous** speaker such as "the whittler", which is never promoted.

**Authority** must come from that seller's own attributed statement: an ownership claim, an explicit offer, or a price given in reply to a price request. Bystanders never qualify, and two offering sellers block the purchase (`seller_ambiguous`).

**Attribution fix.** Pronouns now resolve by established sex. In the historical scene, "He swallows" no longer resolves to Brenna, who spoke last, so the whittler's "Three gold" is his.

**Representation** (the smallest change that avoids a fake character):
- `transfer_person` takes exactly one of `from_holder_id` or `from_counterparty: CounterpartySnapshot {label, description?, location_id, authority_evidence[]}`.
- The anonymous path is a **sale only**, of a subject with **no legal record**.
- It writes the post-sale legal state directly (enslaved, holder = buyer), because the pre-sale holder is never a character.
- Payment leaves the tracked economy (no payee).
- The ledger keeps the snapshot. Legal state and transactions validate "exactly one seller side" on prepare and on restore.
- The ledger answers buyer, seller label, authority evidence, place, price, papers, revision and minute. The debug ledger shows `sale the girl the whittler (anonymous seller at calderan_slave_market; authority: "…")`. The seller never appears among characters.

## F. Historical Maren regression

- **Fixture:** Brenna is persistent, held by Nicco and in the household; money is 454.
- **Scene:** narration shows "the whittler" and a thin girl behind the bars. The player asks "How much for the girl?", and the whittler answers "Three gold. No papers, no listing." The player then writes "\*pays him and takes the key to free her\*".
- **Result:** one proposal (`register_character` for the unnamed girl, then an anonymous `transfer_person`).
  - Exactly one new character; no whittler character.
  - Enslaved, holder Nicco, papers undocumented; ledger `from_counterparty` "the whittler" at the market with the authority quote.
  - Money 454 → 451, household still [Brenna], no relationships, no manumission.
  - Save/load preserves both the provenance and her.
- **Named first:** "a thin girl named Maren" promotes her on the first turn; the purchase then buys that same character from the anonymous whittler, with no duplicate.
- **Local simulation over the whole transcript** (421 exchanges, resolver plus name establishment turn by turn):
  - Korvin sells Brenna for 5 (documented), and the whittler sells "the girl" for 3 (undocumented), leaving 492.
  - The girl's later "My name is Maren" names the **same** record.
  - Only three name promotions happen in the whole transcript: Brenna, Gerome (the named construct) and a separate apothecary named Maren who acts in her own scene.
  - The early simulation surfaced three problems, all fixed and covered by tests:
    - A one-word fragment ("Soft.") was treated as a name.
    - Facts were taken from sentences that merely mention someone ("Brenna's grey eyes find Maren").
    - Unrelated deals triggered notes about narrated captives.
  - The two manumissions it records come from the player's own "you are free now" wording (Pass 1 behaviour, unchanged).

## G. Brenna regression

- **Resolver path:** unchanged results: 500 → 495, enslaved, holder Nicco, documented, household empty, no duplicate.
- **Coordinator path:** Brenna is promoted by name on the intro turn (`name_established`), with the "P1 Slave" participant linked and retired. Afterwards "the slave" no longer spawns a new temporary participant, because the promoted person covers that description.
- **Purchase:** it sets her legal state under Korvin and transfers it in one revision.
- **Context:** her background appears as "(stated by Korvin)".
- **Replay** creates nothing twice. The Household Pass 1 end-to-end flow is unchanged.

## H. Chestnut-boy negative test

- **Scenario, run through the real coordinator:**
  1. A boy sells chestnuts and has a burn on his hand.
  2. The player talks to him; he gives no name.
  3. The player secretly heals the burn, and a passer-by notices.
  4. The boy thanks Nicco, who leaves.
- **Result:** on every turn `identity` shows nothing promoted and nothing named. There are no created characters, no origin snapshots, and relationships, households, legal state and transactions are unchanged.
- **Future rumors.** A rumor system can remember the *event* without either person becoming a character; none is implemented.

## I. Chestnut-boy naming contrast

- **Same scene.** The player asks "What's your name?" and the boy answers: "Tomas," the boy says.
- **Result:** exactly one campaign character, Tomas.
  - Profile: male (from "boy"), descriptor boy, no age, species, background or role, trigger `name_established`.
  - He is linked to the scene participant P1 the player addressed, which is retired.
- **Unchanged:** the passer-by stays ephemeral. There is no household membership, no relationship and no field beyond the ordinary character record.
- **Next turn:** the prompt shows "Character Tomas" exactly once and no "P1 Boy".

## J. Late naming

- **Trigger:** a present persistent character **without a name** introduces themselves, and the attribution resolves to them. "The girl lifts her head. 'My name is Maren.'" qualifies.
- **Effect:** `set_profile` sets only the name on the same record.
- **Unchanged:** ID, origin snapshot (`established.name` stays unset, label "the girl"), legal state, household, relationships and transactions.
- **Precedence:** late naming is checked before name collisions, so another Maren elsewhere, or even here, does not stop it.
- **Distinct people:** a different person self-introducing as Maren while another Maren exists gets a distinct ID.
- **Other fields:** only the name is updated; the brief deferred other profile updates.

## K. Save and load

Save/load round trips cover four cases:
- a name-promoted character (the Brenna coordinator flow);
- the unnamed acquired girl;
- her later name;
- the anonymous seller provenance: the ledger `from_counterparty` and the holder-less transfer record.

Nothing depends on `RecentConversation` after a reload: a fresh session shows the promoted person with their established facts.

## L. Narrator naming guardrail

`NARRATOR_SYSTEM` gains one line: incidental background people are referred to descriptively. A proper name is given only when:
- the player asks or learns it;
- the person introduces themselves;
- another character identifies them;
- the name is narratively necessary.

The line says a named person becomes a lasting character, and that established names of recurring people stay in use.

## M. Remaining limitations

1. **Location stays where it was set.** A promoted person stays at their promotion location until something moves them, so they reappear as present when the player returns there, and a purchased person does not follow Nicco automatically. This is the existing created-character location model, unchanged here.
2. **Heuristic attribution.** Speakers and subjects are attributed heuristically: running subject, sex-aware pronouns, speech clauses. Failures are safe (nothing promoted or sold), but a legitimate name or sale can be missed until narration is clearer.
3. **Name-only updates.** Late naming covers only self-introductions by a present unnamed character. Another person identifying them ("Her name is Maren", said about the present unnamed girl) does not rename them, and no other profile facts are updated after promotion.
4. **Scattered descriptions stay separate.** Facts narrated before someone is named, under a description ("a woman sits against the bars…"), stay with that description. Profiles can therefore be sparse (Brenna has age, sex, captivity and background, but no appearance).
5. **Recent-window only.** Detection is limited to the current scene's recent-conversation window.
6. **No live run.** No live LLM run was made (none was required). Real narrator naming behaviour under the new guardrail is untested.

## N. Tests

`tests/narrator-persistence.test.ts` (11 tests):
- **Chestnut boy:** the negative scenario and the naming contrast (coordinator).
- **Name conservatism:** absent and rumored names, places, titles, capitals, guesses, canon names, contested names, a distinct same-name person.
- **Historical Maren:** anonymous whittler with an unnamed girl (provenance, save/load, debug), late naming (coordinator), and Maren named first (coordinator).
- **Sellers:** a named seller promoted by the name rule; anonymous-authority negatives (a bystander, two offering sellers).
- **Anonymous-sale domain rules:** sale only, no legal record, no payee, atomic, and snapshot validation of exactly one seller side.
- **Transcript regressions:** "Soft.", fact donation, "a deal about goods" and "pay a visit".
- **Narrator guardrail.**

`tests/narrated-promotion.test.ts` (Pass 1.1) was updated to the new model:
- `name_established` and the `descriptor` field;
- a weak name colliding with an existing character is ignored;
- Brenna is promoted by name before purchase;
- "Done." with no price talk is not a trade.

NARRATOR CHARACTER PERSISTENCE PASS 1.2 COMPLETE
