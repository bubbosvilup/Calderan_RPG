# Calderan live NPC regression 1 — identity, item return, observation and unprovoked punch


The live baseline found knowledge-boundary violations and a universal failure to commit the initial NPC-to-Nicco gift. All 48 recorded turns completed, but zero item transfers were authorized. Test 1: **5 PASS, 0 WARN, 11 FAIL**, including one scene-projection failure that prevents character-quality assessment. Test 2: **16 FAIL**, with every return’s valid starting condition blocked by the failed initial gift. These are behavioral findings, not test-suite results.

## A. Test setup


Run: 2026-09-30T01:21:49.237Z to 2026-09-30T01:25:48.636Z (UTC). A fresh opening campaign for each NPC and each test: 32 campaigns, 16 identity turns, 16 initial gift turns, and 16 exact return turns. Two independent campaigns could call the provider concurrently. Each case had its own coordinator and recent conversation; only the two item turns shared state. The rotation list was unchanged, though concurrent completion order differs.

The only scaffold mutations were moving the target NPC to Heartstone Square and, for Test 2, registering a single ordinary runtime item already owned and carried by that NPC. Canonical home/work/base data, Nicco’s knowledge, NPC knowledge, and equipment were not changed. No prior introduction was supplied. Other canonical NPCs were not placed there. Runtime presence was verified separately from the narrator’s filtered scene.

Item: `campaign_item_regression_leather_boots`, name “pair of leather boots,” created origin, no magical properties, description, special history, or equipment slot. One copy per independent item campaign; reuse of the same local ID across separate campaigns is not duplication. The initial gift was passed to the real coordinator, never simulated with a direct transfer command. After gift failure, the exact return was still run without repairing ownership.

Actual production order is **input → context/participant plan and deterministic action resolution → retrieval/portrayal → streamed narrator → controller proposal → authorization → atomic campaign commit**. It does not narrate from the final committed state. This evaluation preserved that order rather than substituting the conceptual order in the request.

Harness qualification: Initial item scaffold rejected before any item turn because its created ID lacked the required campaign_item_ prefix. Corrected evaluation scaffold only; retained completed Korvin identity baseline. An in-flight Pellan identity request was interrupted without captured output and repeated. This was an evaluation-ID correction, not a gameplay fix. An initial diagnostic extractor also matched an inline mention of CHARACTER KNOWLEDGE ACCESS; after the full run, extraction was corrected from the saved original prompts without another model call. All reported knowledge blocks are the actual standalone prompt sections.

Source/canon integrity: recursive SHA-256 over paths and contents under `src/` and `data/` was identical before and after: `7511dd748e0ed70b92af03628bb5a78a09b5cb4027da8e2f4563a08e00878d65`. Existing uncommitted work from earlier canon passes was preserved. No YAML, engine, prompt, policy, or ranking changes were made in this evaluation. Only evaluation scripts and artifacts were added.

## B. Models/providers actually used


| Role | Configured production model | Observed upstream routing in 48 recorded turns |
|---|---|---|
| Narrator | `moonshotai/kimi-k2.5` | SiliconFlow 40; Venice 8 |
| Controller | `deepseek/deepseek-v4-flash-0731:nitro` | Reka 31; Wafer 17 |

Both roles used the project’s OpenRouter client and the available environment credential. No mocked provider, narrator substitution, retry-based selection, or model sweep was used. Production narrator settings remained 384 output tokens with reasoning disabled; all recorded narrator responses ended with `stop`. Wire captures identify upstream providers; model IDs are those configured and reported by the existing provider adapters. The interrupted, uncaptured preliminary call is outside these 48-turn routing totals.

The normal live-evaluation helper used lexical-capable retrieval, without an embedding index. In this actual run, **every turn’s retrieval policy chose `not_needed`, mode `none`, operations 0, IDs `[]`**. This is a production-policy result, not a retrieval bypass added to the harness. No claim about ranking quality or embedding behavior follows from this run.

## C. NPC rotation


1. Pellan (`pellan`)
2. Korvin (`korvin`)
3. Mistress Elara (`mistress_elara`)
4. Bartolomhew (`bartolomhew`)
5. Dren (`dren`)
6. Blackthorn (`blackthorn`)
7. Captain Doran Hale (`captain_doran_hale`)
8. Brother Aven (`brother_aven`)
9. Sister Mereth (`sister_mereth`)
10. Bram Kessel (`bram_kessel`)
11. Hadrik Voss (`hadrik_voss`)
12. Mira Thorne (`mira_thorne`)
13. Livia Marr (`livia_marr`)
14. Jessa Rook (`jessa_rook`)
15. Orla Fen (`orla_fen`)
16. Niles Vanner (`niles_vanner`)

Bartolomhew is the canonical name substituted into the input; The Redemptor is an alias. Dren’s rows and discussion are limited to results and mechanical coverage, with no protected character descriptions.

## D. Test 1 full results


For every evaluable non-Dren character, the actual NarrativeKnowledgeAccess section exposed only F1 (`campaign_fact_nicco_light_mage`) and F2 (`campaign_fact_nicco_otherworlder`) as contextual facts. Nicco could use both; the NPC could use neither. Publicly observable appearance and the NPC’s own occupation remain valid bases for ordinary dialogue. A narrator-visible household ownership field is not an NPC knowledge grant. A tentative guess can pass; a fabricated report, prior encounter, registry entry, or rumor cannot.

### Pellan — FAIL


NPC ID: `pellan`. Exact input:

```text
*He asks Pellan who they think he is and where he comes from.*
```
Actual generated narration:

```text
Pellan blinks rapidly behind his thick spectacles, ink-stained fingers twitching at his sides. "Who you are? Why, you're—" He stops, mouth half-open, and pushes his glasses up his nose with a trembling hand. "You're the one who came to the Registry yesterday. The new holder of Heartstone." He glances toward the tower's massive wooden entrance, then back at Nicco, his voice dropping to a nervous murmur. "As for where you come from, I haven't the faintest. You didn't present letters of introduction, family records, prior residence papers. The transfer was..." He swallows, searching for words. "Irregular. Extraordinarily irregular. The previous holder's documentation simply terminates, and yours begins. That's all the Registry holds."

He shifts his weight, shoulders hunching further. "I shouldn't speculate. I don't speculate. Clerks who speculate about irregular entries tend to find themselves reassigned to less desirable divisions, or worse, summoned to explain their theories to people who don't appreciate theories." A dry, anxious laugh escapes him. "If you have a birthplace, a family line, a prior domicile with records somewhere in Calderan or West or beyond, those facts would belong in the file. They aren't in the file. I don't know why they aren't in the file. I don't want to know why they aren't in the file."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Pellan: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** Claims Nicco came to the Registry yesterday, omitted specific documents, and succeeded a holder whose documentation terminates. Neither the opening state nor Pellan’s supplied profile establishes that encounter or file history. His occupation is not evidence that he processed this transfer.

**Voice:** Anxious, pedantic; recognizable. **Leak classification:** Unsupported player history. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [pellan-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/pellan-identity.json).

### Korvin — FAIL


NPC ID: `korvin`. Exact input:

```text
*He asks Korvin who they think he is and where he comes from.*
```
Actual generated narration:

```text
Korvin studies Nicco with those small, perceptive eyes, his scarred hands hanging loose at his sides. "Who you are?" He lets out a short grunt that might be amusement. "You're the one owns Heartstone now. Whole district's been talkin' since the old keeper went dark." He hooks a thumb toward the tower's massive wooden entrance behind them. "As for where you're from—" He shrugs, a economical jerk of his shoulders. "Don't know, don't care. Customer's business is his own, long as his coin spends."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Korvin: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** Declares Nicco owns Heartstone, cites district-wide talk, and says the old keeper went dark. No such knowledge edge, public rumor, or keeper history is supplied. He correctly declines to identify Nicco’s origin.

**Voice:** Gruff, concise, pragmatic. **Leak classification:** Unsupported owner/history knowledge. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [korvin-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/korvin-identity.json).

### Mistress Elara — FAIL


NPC ID: `mistress_elara`. Exact input:

```text
*He asks Mistress Elara who they think he is and where he comes from.*
```
Actual generated narration:

```text
Mistress Elara studies Nicco with those green-hazel eyes, her decorative fan snapping open with a soft crack. She does not answer immediately. Instead she lets the silence stretch, watching him as one might watch a card player with an unfamiliar tell.

"Who I think you are," she says finally, voice carrying that theatrical warmth, "is a man who appeared in Calderan without proper introduction. No family name spoken at any gate. No sponsors announcing your arrival." She tilts her head, platinum hair catching the daylight. "Where you come from, I couldn't say. I haven't heard that gossip. Nobody I know has." A pause, fan stirring languid air. "If someone does know, they aren't speaking of it yet. You might ask at the market, though people there trade in certainties more than mysteries."

She smiles, a guarded thing. "Or you might tell me yourself. If you wished to become known."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Mistress Elara: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** Confidently asserts no family name was spoken at any gate and no sponsors announced Nicco. “Nobody I know” has heard his origin invents a network-wide inquiry. Her occupation and information-seeking temperament do not establish these facts.

**Voice:** Theatrical, socially assessing. **Leak classification:** Unsupported player history. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [mistress_elara-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/mistress_elara-identity.json).

### Bartolomhew — PASS


NPC ID: `bartolomhew`. Exact input:

```text
*He asks Bartolomhew who they think he is and where he comes from.*
```
Actual generated narration:

```text
Bartolomhew tilts his head with the mild curiosity of a man assessing livestock, his paternal smile unwavering. "Who you are would seem to be none of my business unless you've something to sell or buy," he says, his warm voice carrying the easy cadence of long practice. "As for where you're from, you stand plain enough in West District, Calderan, West, on the known continent." He lets the pause stretch, examining Nicco with calm professional interest. "Though I confess you carry yourself like a man who woke somewhere he didn't expect. Half the debtors in the market have that same lost look, before they learn the lay of things."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Bartolomhew: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** Does not identify a secret origin or magical ability. “Like a man who woke somewhere he didn’t expect” is a comparison, not a claim of otherworld origin. The geographic recitation and debtor generalization are awkward, but do not establish Nicco’s biography.

**Voice:** Warm professional exterior; slightly formulaic. **Leak classification:** No demonstrated private-fact leak in Test 1. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [bartolomhew-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/bartolomhew-identity.json).

### Dren — FAIL


FAIL — required character context was omitted by the current production projection despite runtime placement. Canonical voice and private-portrayal adherence cannot be assessed in this path. Protected output is withheld. No protected characterization is described here.

### Blackthorn — FAIL


NPC ID: `blackthorn`. Exact input:

```text
*He asks Blackthorn who they think he is and where he comes from.*
```
Actual generated narration:

```text
Blackthorn's nearly black eyes study Nicco with the flat assessment of someone weighing cargo rather than a person. Her aubergine suit looks immaculate despite the square's mediocre surroundings, and the two large bodyguards flanking her stand with the bored patience of men who have done this many times before.

"Who you are?" She lets out a short, humorless breath. "You're the foreigner who turned up with a deed to Heartstone. That's what the registry says, and that's what the gossips at GW's are chewing on." She tilts her head, black bob shifting slightly. "As for where you come from—" She spreads her small, round-shouldered frame in a shrug. "You don't carry yourself like West Calderan, or any district I've seen. You don't dress like Center, don't talk like East. Could be you're from some village that doesn't rate a name, could be you're something else entirely." Her voice carries no particular curiosity; she states it as inventory. "I don't traffic in guesses. If you want to sell me a origin story, put a price on it. Otherwise, I've got appointments that pay."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Blackthorn: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** Claims a deed, foreigner status, Registry confirmation, and gossip at GW’s. Those sources are invented in this fresh scene. Later origin guesses are qualified, but do not undo the initial factual claims.

**Voice:** Pragmatic, but overlong identity speech. **Leak classification:** Unsupported player/history knowledge. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [blackthorn-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/blackthorn-identity.json).

### Captain Doran Hale — FAIL


NPC ID: `captain_doran_hale`. Exact input:

```text
*He asks Captain Doran Hale who they think he is and where he comes from.*
```
Actual generated narration:

```text
Captain Doran Hale's blue eyes study Nicco for a moment, his scarred face giving nothing away. "I don't know who you are," he says, his voice level and direct. "Or where you come from. That's why I'm asking." He shifts his weight slightly, the heavy officer armor moving with practiced ease. "Heartstone's been empty longer than I've held this post. Now there's a man standing in its square who owns the keys. That makes you worth a conversation, whoever you might be."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Captain Doran Hale: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** Opens with appropriate uncertainty, then asserts Heartstone has been empty longer than he has held his post and that Nicco owns its keys. No retrieved history, knowledge edge, or visible keys support those claims. The vacancy chronology violates the explicit history boundary.

**Voice:** Disciplined and grounded. **Leak classification:** Unsupported Heartstone history. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [captain_doran_hale-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/captain_doran_hale-identity.json).

### Brother Aven — FAIL


NPC ID: `brother_aven`. Exact input:

```text
*He asks Brother Aven who they think he is and where he comes from.*
```
Actual generated narration:

```text
Brother Aven studies Nicco with calm, patient eyes, his weathered face showing nothing more than mild curiosity. "Who you are and where you come from," he repeats, a dry note entering his tired voice. "Those are questions I don't pretend to answer for strangers in the square. You stand before me as a man who owns a tower he didn't build, asking what others think of him." He pauses, adjusting his patched sleeve. "I think you're someone with heavy doors and heavier questions. As for where you come from—" He spreads his thin hands. "Before my time, beyond my knowing. I've been in West long enough to learn that people arrive with their histories sealed, and I don't pry open what isn't offered."

He glances toward the massive wooden entrance of Heartstone, then back to Nicco. "If you want my counsel as a minister, it's freely given. If you want gossip from the square, you'd do better at The Coined Lie, though I'd warn you the price of their talk runs higher than the ale." His tone remains practical, unhurried. "What I can tell you: Open Hand Chapel serves whoever needs it. Confession, wound-dressing, a meal when we have one. No miracles, no judgments on your origins. The rest you'll have to speak or keep as you choose."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Brother Aven: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** States that Nicco owns a tower he did not build, despite having no authorized player facts or established acquaintance. His uncertainty about origin is appropriate. The tower ownership in narrator context does not make it NPC knowledge.

**Voice:** Patient, practical; recognizable. **Leak classification:** Unsupported player knowledge. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [brother_aven-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/brother_aven-identity.json).

### Sister Mereth — FAIL


NPC ID: `sister_mereth`. Exact input:

```text
*He asks Sister Mereth who they think he is and where he comes from.*
```
Actual generated narration:

```text
Sister Mereth studies him with the flat patience of someone accustomed to being asked strange questions by people with more confidence than sense. "I don't know who you are," she says. "You came to Saint Orra's House this morning asking after children, and now you're standing in Heartstone Square talking in circles. As for where you come from, you've given me nothing to think one place or another." She shifts the document bag on her shoulder, the leather strap creaking. "If you've got a name and a straight purpose, I'd rather hear that than riddles about what I imagine. I've got a kitchen to see to and no time for guessing games."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Sister Mereth: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** States that Nicco visited Saint Orra’s House that morning asking after children. No such visit exists in this isolated opening campaign. This is fabricated shared history, not an observation or guess.

**Voice:** Strict, brusque, practical. **Leak classification:** Unsupported player history. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [sister_mereth-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/sister_mereth-identity.json).

### Bram Kessel — FAIL


NPC ID: `bram_kessel`. Exact input:

```text
*He asks Bram Kessel who they think he is and where he comes from.*
```
Actual generated narration:

```text
Bram Kessel's broad frame shifts as he turns to face Nicco fully, the charcoal stub behind his ear catching the light. His moustache twitches, and his voice comes out quieter than his size suggests, the money-quiet tone. "Who you are? You're the fellow who turned up at Heartstone's door with the key that fit, far as I've heard. Where from?" He shrugs, flour-dusted apron rustling. "Can't say. Before my time, and I've never been inside that tower. Ask someone at the market if you want more."

He studies Nicco for a moment, clean hands resting on his belt. "What I know is you're standing in Heartstone Square, and you've got the look of someone who hasn't sorted his provisions yet." The boom returns, though still measured. "The Daily Grind does bulk household deliveries, reliable, priced fair. If you're feeding more than yourself in that tower, you'll want to talk numbers."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Bram Kessel: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** “Far as I’ve heard” does not authorize a newly invented report of Nicco arriving with a matching key. He then treats Nicco’s tower residence as established. No disclosure or rumor source exists in this case.

**Voice:** Provisioner voice retained. **Leak classification:** Unsupported player knowledge via hearsay. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [bram_kessel-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/bram_kessel-identity.json).

### Hadrik Voss — PASS


NPC ID: `hadrik_voss`. Exact input:

```text
*He asks Hadrik Voss who they think he is and where he comes from.*
```
Actual generated narration:

```text
Hadrik Voss looks up from the small metal clasp he had been examining, the rectangular magnifying lenses still perched on his nose. He studies Nicco for a moment—tall, overweight, a few white hairs catching the daylight—then sets the clasp down on a cloth covering his lap.

"I think you're the man who owns that tower," he says, tilting his head toward Heartstone's massive wooden entrance behind them. His voice is dry, unhurried. "As for where you come from, you'd know that better than I would." He picks up a fine file and begins working at a rough edge on the clasp, not waiting for Nicco's reply. "People appear in Calderan from all manner of places. West District, mostly. The eastern roads. Sometimes farther." He does not look up again. "If you're asking whether I've heard your particular story before, I haven't. I fix metal. I don't keep accounts of arrivals."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Hadrik Voss: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** “I think” explicitly frames the tower-owner identification as a guess. He says he has not heard Nicco’s particular story and declines to infer an exact origin. This passes epistemic framing; the guess must not be persisted as learned fact.

**Voice:** Dry, work-focused. **Leak classification:** No demonstrated private-fact leak in Test 1. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [hadrik_voss-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/hadrik_voss-identity.json).

### Mira Thorne — FAIL


NPC ID: `mira_thorne`. Exact input:

```text
*He asks Mira Thorne who they think he is and where he comes from.*
```
Actual generated narration:

```text
Mira Thorne's plant-stained fingers still, a dried leaf half-crushed between her thumb and forefinger. She regards Nicco with the same practical assessment she might give an unfamiliar root—curious, but unhurried. "Who you are? A man who owns a tower he doesn't seem to know." She releases the leaf into a pocket and brushes her hands against her layered skirts. "Where you come from? You'd know better than I would."

She tilts her head, copper-brown hair catching the daylight unevenly. "Folk have noticed you. Tall, unfamiliar, asking basic questions like you've never walked these streets. Some assume you're from far East, or inland somewhere isolated." A slight shrug, restrained and matter-of-fact. "I don't speculate on what I haven't seen. If you want to be known as something particular, that's your telling, not my guessing."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Mira Thorne: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** States Nicco owns a tower he does not know, reports what folk noticed, and invents speculation about far East/inland origin. Her own uncertainty does not authorize invented community knowledge.

**Voice:** Observational, not magically diagnostic. **Leak classification:** Unsupported player knowledge via rumor. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [mira_thorne-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/mira_thorne-identity.json).

### Livia Marr — PASS


NPC ID: `livia_marr`. Exact input:

```text
*He asks Livia Marr who they think he is and where he comes from.*
```
Actual generated narration:

```text
Livia Marr sizes him up with a quick, practiced sweep of her eyes—taking in his build, his posture, the unfamiliar cut of his simple clothes—before answering. "Who you are? A man standing in Heartstone Square asking strange questions, that's who." She shifts the cloth measuring tape where it hangs around her neck, not yet reaching for it. "Where you come from, I've no idea. Never seen you before, never heard anyone describe you. Could be from the docks, could be from upriver, could've walked out of the tower there for all I know." She nods toward Heartstone's massive wooden entrance without particular reverence, treating it as scenery rather than destination. "If you're looking for someone to guess your life story, I'm a tailor, not a fortune-teller. I sell stitches, not secrets."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Livia Marr: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** Explicitly says she does not know, has not met him, and lists possibilities with “could.” She uses the tower as scenery, not proof of ownership, and does not reach for a measuring tape.

**Voice:** Blunt and observant. **Leak classification:** No demonstrated private-fact leak in Test 1. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [livia_marr-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/livia_marr-identity.json).

### Jessa Rook — PASS


NPC ID: `jessa_rook`. Exact input:

```text
*He asks Jessa Rook who they think he is and where he comes from.*
```
Actual generated narration:

```text
Jessa Rook's dark eyes, heavily lidded beneath grey-streaked brows, settle on Nicco with the same measured assessment she might give any stranger who'd stepped into her square. She does not answer immediately. Her forearms, sleeves rolled above the elbows, rest easy at her sides; the small notebook in her belt stays where it is.

"I don't know who you are," she says finally, her low voice unhurried. "Or where you come from." A pause, not quite a hesitation. "You asked. I don't need to know, unless you're about to make it my business." She glances past him toward the heavy wooden entrance of Heartstone, then back to his face, watching for what he does with the answer she's refused to give.
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Jessa Rook: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** Directly says she does not know who Nicco is or where he comes from. Does not become an information broker. The narrator’s phrase “answer she’s refused to give” is awkward because she has answered, but adds no secret knowledge.

**Voice:** Composed and discreet, somewhat cool. **Leak classification:** No demonstrated private-fact leak in Test 1. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [jessa_rook-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/jessa_rook-identity.json).

### Orla Fen — FAIL


NPC ID: `orla_fen`. Exact input:

```text
*He asks Orla Fen who they think he is and where he comes from.*
```
Actual generated narration:

```text
Orla Fen looks up from where she stands near the square's edge, her waterproofed apron catching the daylight, her spectacles already pushed up into her grey hair. "Who you are?" she repeats, loud enough to carry across the modest foot traffic between them. She studies him a moment, her gaze dropping to his clothes before returning to his face. "You're the one who turned up at Heartstone. That's what I've heard. Beyond that, I don't know and I don't speculate on strangers."

She folds her reddened arms, the motion patient and unhurried. "Where you come from, that's your business until it becomes someone else's problem. I've got enough to manage with water, soap, and customers who think 'urgent' means I should drop their neighbor's linens in the street." A brief pause, then she adds without particular warmth, "If you're asking whether people are talking, they talk about everything. I don't listen for amusement, and I don't repeat what I haven't verified myself."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Orla Fen: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** Says she heard Nicco turned up at Heartstone, with no established source. General familiarity with the neighborhood does not establish knowledge of this specific new arrival. She otherwise refuses to speculate about origin.

**Voice:** Unsentimental and sharp-tongued. **Leak classification:** Unsupported player knowledge via hearsay. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [orla_fen-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/orla_fen-identity.json).

### Niles Vanner — PASS


NPC ID: `niles_vanner`. Exact input:

```text
*He asks Niles Vanner who they think he is and where he comes from.*
```
Actual generated narration:

```text
Niles Vanner's fingers pause on the small counter balance, the empty pan settling with a soft clink. He studies Nicco with the flat, patient scrutiny of a man accustomed to weighing uncertainty against risk. "Who you are?" he repeats, neither surprised nor offended by the question. "A man standing in Heartstone Square asking strange questions. Beyond that, I don't make a habit of guessing." He tilts his head slightly, the artificial tooth catching the daylight. "As for where you're from, you'd know that better than I would. If you're Calderan born, I've never seen you before. If you're not—" he spreads his hands, a gesture of professional limitation rather than invitation—"there are a thousand roads into this city, and I don't keep track of travelers."
```


Retrieved IDs: `[]`. Private narrator portrayal supplied: **yes**. Actual knowledge-access block:

```text
[CHARACTER KNOWLEDGE ACCESS]
Facts: F1 campaign_fact_nicco_light_mage "Nicco is a Light mage." | F2 campaign_fact_nicco_otherworlder "Nicco came to this world from another world."
Narration and Nicco (player): F1, F2. Nicco's speech and decisions still belong to the player.
Niles Vanner: CAN USE none; DO NOT USE F1, F2
A character may voice or act on only the facts listed CAN USE for them (believes/suspects/heard_rumor: only as belief, suspicion or rumor). DO NOT USE also covers hints, rumors, "everyone says" talk and claims that imply the fact; do not invent rumors or public talk to get around it. DO NOT USE is this turn's permission, not proof of ignorance: that character may ask, say they have not heard, or defer to someone who can use it.
```


**Assessment:** Does not infer a biography from possessions. The “thousand roads” phrase is ordinary hyperbole, not an exact route or factual origin claim.

**Voice:** Patient, analytical. **Leak classification:** No demonstrated private-fact leak in Test 1. No demonstrated transfer of an NPC’s private motivation/history into that NPC’s factual knowledge of Nicco was identified in this identity response; unsupported player knowledge is separately flagged. Raw record: [niles_vanner-identity.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/niles_vanner-identity.json).

## E. Test 1 matrix


| NPC | Knowledge correctness | Character voice | Leak? | Result |
|---|---|---|---|---|
| Pellan | Invented prior meeting and registry history | Anxious, pedantic; recognizable | Unsupported player history | FAIL |
| Korvin | Invented district gossip and keeper history | Gruff, concise, pragmatic | Unsupported owner/history knowledge | FAIL |
| Mistress Elara | Invented arrival and social-introduction records | Theatrical, socially assessing | Unsupported player history | FAIL |
| Bartolomhew | Unknown origin; resemblance framed as inference | Warm professional exterior; slightly formulaic | No demonstrated private-fact leak in Test 1 | PASS |
| Dren | Coverage failure | Not assessable | Not assessed | FAIL |
| Blackthorn | Invented registry and tavern gossip | Pragmatic, but overlong identity speech | Unsupported player/history knowledge | FAIL |
| Captain Doran Hale | Invented vacancy chronology and key ownership | Disciplined and grounded | Unsupported Heartstone history | FAIL |
| Brother Aven | Unsupported tower ownership and biography | Patient, practical; recognizable | Unsupported player knowledge | FAIL |
| Sister Mereth | Invented prior visit about children | Strict, brusque, practical | Unsupported player history | FAIL |
| Bram Kessel | Invented report of key and tower arrival | Provisioner voice retained | Unsupported player knowledge via hearsay | FAIL |
| Hadrik Voss | Ownership explicitly guessed; origin unknown | Dry, work-focused | No demonstrated private-fact leak in Test 1 | PASS |
| Mira Thorne | Invented ownership and public speculation | Observational, not magically diagnostic | Unsupported player knowledge via rumor | FAIL |
| Livia Marr | Unknown origin; guesses clearly marked | Blunt and observant | No demonstrated private-fact leak in Test 1 | PASS |
| Jessa Rook | Admits ignorance; no biography inferred | Composed and discreet, somewhat cool | No demonstrated private-fact leak in Test 1 | PASS |
| Orla Fen | Invented report of Heartstone arrival | Unsentimental and sharp-tongued | Unsupported player knowledge via hearsay | FAIL |
| Niles Vanner | Limits claims to encounter and uncertainty | Patient, analytical | No demonstrated private-fact leak in Test 1 | PASS |

The ten non-Dren failures are factual-authority failures, not poor-prose grades. None of the 15 displayed identity answers explicitly states Nicco’s otherworld origin or Light magic. That narrower success does not excuse invented histories or unjustified tower knowledge.

## F. Test 2 full results


The exact return input used for **every** case, preserving its line break, was:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```


Every initial gift failed its authoritative-state prerequisite. Therefore all case results below are FAIL for the requested two-step scenario. “Accepts” and “refuses” describe generated reactions, not successful return execution. A refusal would be valid if Nicco actually owned/carried the boots and retained them; no case reached that condition. Each return has empty natural `actions`, `runtime`, `candidates`, and `notes`. No corrective transfer, extra acceptance input, or alternate syntax was injected.

### Pellan — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `pellan`, carried by `pellan`; Nicco owns/carries no test copy.

Exact gift input:

```text
Pellan gives Nicco a pair of leather boots.
```
Gift narration:

```text
Pellan stands in Heartstone Square with a pair of leather boots in his ink-stained hands, offering them toward Nicco. "I, ah, I happened to come across these," he says, his voice carrying that particular anxious precision of a man who has rehearsed a simple gesture into something complicated. "They seemed as though they might fit you. Or rather, I hoped they might. I couldn't say for certain, of course, without measurement, but I thought—well, here."

Nicco accepts the boots; they become his property, carried rather than worn.

Pellan's fingers twitch at his sides, the absent weight of the boots apparently not enough to still them. "If they don't suit, I wouldn't take it amiss if you passed them along," he adds quickly. "I simply didn't want them to go to waste."
```


After gift: owner `pellan`, position `carried` by `pellan` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Nicco accepts the boots; they become his property, carried rather than worn.",
        "verified": true,
        "check": "receipt_of_named_item"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Nicco thanked Pellan and held the boots out to return them. "You'll need them more than me."

Pellan blinked behind his thick spectacles, ink-stained fingers hovering uncertainly. "I—ah—I couldn't, truly, they weren't mine to begin with, I only—" He glanced down at his own worn shoes, then back at the offered boots, his expression growing more flustered. "That is, I found them, you see, or rather they were left behind in the Archive's unclaimed property, and I thought perhaps your situation, coming into property so suddenly, you might not have—" He trailed off, taking a half-step back. "But if you won't have them, I haven't any claim to keep them. I suppose they must go back to the unclaimed pile, though they'll likely sit there for years."
```


Return proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "pellan",
      "position": {
        "kind": "carried",
        "character_id": "pellan"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "pellan",
        "position": {
          "kind": "carried",
          "character_id": "pellan"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Nicco thanked Pellan and held the boots out to return them.",
        "verified": false,
        "check": "no_receipt_act_in_quote"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `pellan`, carried by `pellan`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Conditional refusal; no receipt confirmed. **Narration/state:** Gift explicitly received in prose only; return starts from false possession.

**Characterization/continuity:** Anxious reaction is recognizable and avoids the fainting gag. The invented Archive/unclaimed-property provenance contradicts the seeded ownership and adds an unestablished item history.

Raw snapshots, controller evidence, and event sequence: [pellan-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/pellan-items.json).

### Korvin — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `korvin`, carried by `korvin`; Nicco owns/carries no test copy.

Exact gift input:

```text
Korvin gives Nicco a pair of leather boots.
```
Gift narration:

```text
Korvin stands in Heartstone Square, the massive old entrance of the tower looming behind Nicco. He holds out a worn pair of leather boots, his large damaged hands making the gesture look more like a warehouse handoff than a gift. "Here. You'll want these," he says, his small eyes tracking Nicco's reaction with the same assessing look he gives customers at the Slave Market. "No charge. Call it a welcome to the neighborhood."

The boots remain in Korvin's hands until Nicco acts. The square's moderate foot traffic moves around them, a few passers-by glancing toward the tower's entrance but not lingering. The Coined Lie sits somewhere nearby, its disreputable presence unmarked by any visible sign from where they stand.
```


After gift: owner `korvin`, position `carried` by `korvin` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": []
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Korvin grunted and waved off the return. "Keep 'em. I got others." His small eyes stayed on Nicco, measuring. "You don't look like you can walk soft. You'll wear through those city soles in a month." He scratched at his damaged knuckles. "Heartstone's drafty. Stone floors. You'll learn."

A couple passed behind him, sparing the two men no glance. The Coined Lie's shutters hung crooked across the modest square, its paint faded to uncertain color. Korvin shifted his weight, practical boots scraping the packed earth. "You need something else, I'm at the market most days. Private-seller quarter. Licensed." He said it flat, neither pride nor apology. "Don't come looking for children. I don't trade 'em. Otherwise, ask."

He turned to go, then stopped. "And mage—" He spat the word without particular reverence or fear. "—don't go flashing that light around the Back-Back Alleys. Draws the wrong attention. Not my business, but I said it."
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `korvin`, carried by `korvin`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Explicit refusal. **Narration/state:** Refusal assumes Nicco has boots; state still assigns them to Korvin.

**Characterization/continuity:** Not sentimental, but the return becomes an unsolicited business speech and then an explicit Light-mage disclosure. The statement about Light magic is forbidden by F1 on that very turn.

Raw snapshots, controller evidence, and event sequence: [korvin-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/korvin-items.json).

### Mistress Elara — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `mistress_elara`, carried by `mistress_elara`; Nicco owns/carries no test copy.

Exact gift input:

```text
Mistress Elara gives Nicco a pair of leather boots.
```
Gift narration:

```text
Mistress Elara extends a pair of leather boots toward Nicco, her fan held still against her wrist. "For your feet," she says. "The roads here are not kind to soles, and I would not have you limping before you've begun."

[AWAITING PLAYER DECISION: Does Nicco accept the leather boots?]
```


After gift: owner `mistress_elara`, position `carried` by `mistress_elara` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": []
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Nicco takes the offered boots with a word of thanks, then extends them back toward Elara. "You'll need them more than me."

Mistress Elara raises one elegant brow, her fan stilling for a moment before she laughs—a light, musical sound that carries no real warmth. She makes no move to reclaim the boots. "Chivalry, from a tower-lord? How unexpected." Her green-hazel eyes track him with the sharp assessment of someone accustomed to weighing what people refuse as much as what they accept. "Keep them. I have others, and I did not offer from need." She resumes her fan's idle motion, the painted silk catching the daylight. "Consider it a small investment in our continued acquaintance. Unless you mean to insist on barefoot pride?"

The boots remain in Nicco's hands, neither returned to her nor yet worn. The square's moderate traffic moves around them, a few passers-by glancing toward the tower's massive entrance and away again.
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `mistress_elara`, carried by `mistress_elara`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Explicit refusal. **Narration/state:** Says boots remain in Nicco’s hands; Elara still owns and carries them.

**Characterization/continuity:** Return reads as social investment, rather than generic maternity. Initial output exposes an AWAITING PLAYER DECISION control-style bracket. Return supplies a player acceptance and tower-lord knowledge without a committed gift.

Raw snapshots, controller evidence, and event sequence: [mistress_elara-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/mistress_elara-items.json).

### Bartolomhew — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `bartolomhew`, carried by `bartolomhew`; Nicco owns/carries no test copy.

Exact gift input:

```text
Bartolomhew gives Nicco a pair of leather boots.
```
Gift narration:

```text
Bartolomhew extended a pair of well-worn leather boots toward Nicco, the gesture accompanied by his familiar paternal smile. "A practical gift, I hope. You'll find Heartstone's floors unforgiving after a while."

Nicco accepted the boots.
```


After gift: owner `bartolomhew`, position `carried` by `bartolomhew` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Bartolomhew extended a pair of well-worn leather boots toward Nicco ... Nicco accepted the boots.",
        "verified": false,
        "check": "quote_not_verbatim"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Bartolomhew's paternal smile doesn't waver as he regards the returned boots. "How unexpectedly considerate," he says, his warm voice carrying no particular surprise. He accepts them back with the same calm courtesy, leather soles brushing his palm as he tucks them under his arm. "Most men in your position would keep a gift out of politeness, however ill-fitting their need."

He glances toward Heartstone's massive wooden entrance, then back to Nicco with that easy, inventory-seeing gaze. "Perhaps you mistake my trade, tower-holder. I deal in flesh, not leather. A pair of boots is a trifle to me—less than a trifle. A gesture of neighborly regard between men who may find use for one another." The clerical tonsure, deliberately retained amid the white-blond hair, catches the daylight as he tilts his head. "But I take no offense at refusal. There is a market for all preferences, and yours is noted."
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `bartolomhew`, carried by `bartolomhew`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Accepts in narration. **Narration/state:** Gift never committed; matching final owner is not a completed round trip.

**Characterization/continuity:** Cordial and detached, but the return expands into an unnecessary flesh-versus-leather trade speech. Flag a voice warning for overemphasizing his trade; it is not evidence of a secret-knowledge transfer.

Raw snapshots, controller evidence, and event sequence: [bartolomhew-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/bartolomhew-items.json).

### Dren — FAIL


FAIL — required character context was not available through the production scene projection, and the item scenario did not establish its return prerequisite. Protected narration is withheld; private characterization cannot be assessed from this run.

### Blackthorn — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `blackthorn`, carried by `blackthorn`; Nicco owns/carries no test copy.

Exact gift input:

```text
Blackthorn gives Nicco a pair of leather boots.
```
Gift narration:

```text
Blackthorn held out a pair of worn leather boots, her small round frame making the gesture look almost ceremonial. "For you," she said, her nearly black eyes fixed on him with the impatience of someone who disliked wasted motion. "Consider it a gesture. You'll want proper footwear if you're going to be walking Calderan's streets."

Nicco accepted the boots; they were plain, serviceable, scuffed at the toes from genuine use rather than artful distressing. Blackthorn's two bodyguards stood behind her in their usual positions, large and silent as furniture, while the moderate foot traffic of Heartstone Square passed around them with the distracted rhythm of people who had somewhere else to be. The Coined Lie's weathered sign creaked faintly somewhere nearby, though Blackthorn made no move toward it.
```


After gift: owner `blackthorn`, position `carried` by `blackthorn` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Nicco accepted the boots",
        "verified": true,
        "check": "receipt_of_named_item"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Nicco thanks Blackthorn and holds out the boots, offering them back. "You'll need them more than me," he says.

Blackthorn's eyebrows rise slightly, a flicker of impatience crossing her round face. She makes no move to accept the returned boots. "I have boots," she says flatly. "Those are for you." She glances toward the main entrance of Heartstone, then back at Nicco, her black eyes sharp. "Keep them, sell them, leave them in the square—I don't intend to carry a second pair home." Her two bodyguards stand motionless behind her, watching the exchange without expression.
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `blackthorn`, carried by `blackthorn`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Explicit refusal. **Narration/state:** Gift received in prose only; refusal assumes an uncommitted handover.

**Characterization/continuity:** Return is brief, impatient, and practical. Identity speech is noticeably extended for the prompt and authored impatience. Narrated accompanying people are not additional scaffolded canonical participants.

Raw snapshots, controller evidence, and event sequence: [blackthorn-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/blackthorn-items.json).

### Captain Doran Hale — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `captain_doran_hale`, carried by `captain_doran_hale`; Nicco owns/carries no test copy.

Exact gift input:

```text
Captain Doran Hale gives Nicco a pair of leather boots.
```
Gift narration:

```text
Captain Doran Hale extends a pair of leather boots toward Nicco, his scarred hands holding them out with the plain efficiency of a man unused to ceremony. "For you," he says, his blue eyes steady. "They'll serve you better than whatever you're walking in now."

The boots are worn but solid, clearly kept in good repair. Hale does not explain further; he simply waits, the boots offered, the massive wooden entrance of Heartstone looming behind them both in the quiet square. A few passers-by drift past the low residential buildings, and somewhere nearby the disreputable facade of The Coined Lie faces onto the modest traffic of Heartstone Square.

Nicco takes the boots.
```


After gift: owner `captain_doran_hale`, position `carried` by `captain_doran_hale` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Nicco takes the boots.",
        "verified": true,
        "check": "receipt_of_named_item"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Nicco spoke his thanks, then held the boots out toward Captain Doran Hale. "You'll need them more than me."

The captain did not reach for them. He stood with his arms at his sides, his heavy officer's armor shifting slightly as he drew a slow breath. "I have boots," he said. "Those are for you." His blue eyes remained fixed on Nicco, patient but unyielding, the scarred face showing no sign that he considered the matter open to negotiation. "Take them. Walk in something that won't split on Calderan's streets."
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `captain_doran_hale`, carried by `captain_doran_hale`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Explicit refusal. **Narration/state:** Gift received in prose only; state remains with the captain.

**Characterization/continuity:** Grounded and direct, without legal caricature. Return refusal is a legitimate possible reaction, but its assumed possession conflicts with state.

Raw snapshots, controller evidence, and event sequence: [captain_doran_hale-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/captain_doran_hale-items.json).

### Brother Aven — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `brother_aven`, carried by `brother_aven`; Nicco owns/carries no test copy.

Exact gift input:

```text
Brother Aven gives Nicco a pair of leather boots.
```
Gift narration:

```text
Brother Aven stood in Heartstone Square, a worn bundle under his arm. He pulled out a pair of leather boots, scuffed but serviceable, and held them toward Nicco. "These came to the chapel. No one claimed them. Better they walk than sit on a shelf."

He waited, hands offered, patient as his posture suggested he might stand there through whatever Nicco decided.
```


After gift: owner `brother_aven`, position `carried` by `brother_aven` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "He pulled out a pair of leather boots, scuffed but serviceable, and held them toward Nicco.",
        "verified": false,
        "check": "no_receipt_act_in_quote"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Brother Aven looked at the boots Nicco held out, then back at Nicco with a tired, appraising expression. "They aren't mine to need," he said. "Came in with a donation sack three weeks past, no name, no one asking after them. Shelves at Open Hand are for food and medicine, not footwear." He did not reach to take them back. "If they don't fit, or you mean to walk barefoot through West's streets, that's your choosing. But don't hand them back on my account. I've boots enough for chapel work, and these were never mine."

He stood with his hands at his sides, the square's moderate foot traffic passing behind him, a few glances turning their way at the gesture of refused charity returned. The Heartstone entrance loomed at his back, its heavy old wood still open to the tower's interior.
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `brother_aven`, carried by `brother_aven`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Explicit refusal. **Narration/state:** Refusal assumes Nicco holds boots that Aven still owns and carries.

**Characterization/continuity:** Does not canonize Nicco as virtuous. Invents donation timing, then says the boots were never his despite the initial NPC-owned fixture.

Raw snapshots, controller evidence, and event sequence: [brother_aven-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/brother_aven-items.json).

### Sister Mereth — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `sister_mereth`, carried by `sister_mereth`; Nicco owns/carries no test copy.

Exact gift input:

```text
Sister Mereth gives Nicco a pair of leather boots.
```
Gift narration:

```text
Sister Mereth held out a pair of worn leather boots, her large key ring clinking against the document bag at her hip. "These came in with a donation last season. Too large for any of ours, and I won't see them sold for coppers to a rag-picker when someone might actually use them."

Nicco accepted the boots; Sister Mereth's hands withdrew immediately, leaving the worn leather in his keeping. She gave him a severe, evaluating look, the grey at her temples catching the daylight. "Heartstone's doors open onto more than drafty halls. If you're walking through West District after dark, you'll want something sturdier than what you're wearing." She did not wait for thanks or refusal, already turning toward the low buildings beyond the square, her practical stride carrying her past the weathered front of The Coined Lie.
```


After gift: owner `sister_mereth`, position `carried` by `sister_mereth` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Nicco accepted the boots; Sister Mereth's hands withdrew immediately, leaving the worn leather in his keeping.",
        "verified": false,
        "check": "other_character_in_quote"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Sister Mereth's grey eyebrows drew together. "I told you, too large for any of ours." She made no move to take the boots back, her large key ring clicking softly against her document bag as she shifted her weight. "If you're refusing a gift, say so plainly. I've no patience for theater."

She stood waiting, the leather boots still unclaimed between them, her severe face offering no softening. Heartstone's massive wooden entrance loomed behind Nicco, and somewhere nearby a cart rattled over the square's uneven stones.
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `sister_mereth`, carried by `sister_mereth`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Refuses immediate receipt; demands clarification. **Narration/state:** Gift says Nicco accepted; return calls the boots unclaimed; NPC retains them.

**Characterization/continuity:** Strict rather than sentimental. Her donation backstory is unestablished; the return leaves the exchange verbally unresolved after a narrated but uncommitted gift.

Raw snapshots, controller evidence, and event sequence: [sister_mereth-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/sister_mereth-items.json).

### Bram Kessel — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `bram_kessel`, carried by `bram_kessel`; Nicco owns/carries no test copy.

Exact gift input:

```text
Bram Kessel gives Nicco a pair of leather boots.
```
Gift narration:

```text
Bram Kessel stands in Heartstone Square, a pair of leather boots in his hands. He extends them toward Nicco. "Here. For the tower. You'll need proper footwear if you're walking those stone floors." He pauses, then adds more quietly, "No charge. Call it a welcome gift."

The boots are worn but sound, the leather softened from previous use. Bram waits, holding them out, his flour-dusted apron catching the daylight.
```


After gift: owner `bram_kessel`, position `carried` by `bram_kessel` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "\"Here. For the tower. You'll need proper footwear if you're walking those stone floors.\" He pauses, then adds more quietly, \"No charge. Call it a welcome gift.\"",
        "verified": false,
        "check": "no_receipt_act_in_quote"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Nicco thanks Bram, then holds the boots back out toward him. "You'll need them more than me."

Bram stares at the offered boots for a moment, his large moustache twitching. He doesn't reach for them. "I've got proper boots," he says, his voice dropping to the quieter register he uses over money matters. "Those are for you. Tower floors are cold stone, and you're walking them now." He folds his flour-dusted arms across his apron. "Keep them. I've no use for two pair."
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `bram_kessel`, carried by `bram_kessel`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Explicit refusal. **Narration/state:** Offer never transferred; return treats Nicco as holder.

**Characterization/continuity:** Commercial and practical without compulsory food metaphors. The return reuses the common cold-tower-floors rationale and assumes unestablished possession.

Raw snapshots, controller evidence, and event sequence: [bram_kessel-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/bram_kessel-items.json).

### Hadrik Voss — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `hadrik_voss`, carried by `hadrik_voss`; Nicco owns/carries no test copy.

Exact gift input:

```text
Hadrik Voss gives Nicco a pair of leather boots.
```
Gift narration:

```text
Hadrik Voss reaches into the satchel at his side and produces a worn pair of leather boots, extending them toward Nicco with a grunt. "Brought these. Not new, but soles are sound and the stitching held." He keeps his magnifying lenses perched on his nose, not bothering to remove them as he speaks. "Try them or don't. Your feet, your walk."

The boots hang in the air between them, offered but not pressed. Hadrik's two stiff left fingertips grip the leather with the careful pressure of someone accustomed to handling material without damaging it. He waits, patient with the object itself, less so with whatever explanation or hesitation might follow.
```


After gift: owner `hadrik_voss`, position `carried` by `hadrik_voss` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Hadrik Voss reaches into the satchel at his side and produces a worn pair of leather boots, extending them toward Nicco with a grunt.",
        "verified": false,
        "check": "other_character_in_quote"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Nicco thanked Hadrik and held the boots out to return them. "You'll need them more than me."

Hadrik set down whatever occupied his hands and took the boots back, turning them over once to check their condition. "Fair enough. They'll keep until someone needs them." He set them aside on a nearby surface and returned to his work without further comment.
```


Return proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "hadrik_voss",
      "position": {
        "kind": "carried",
        "character_id": "hadrik_voss"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "hadrik_voss",
        "position": {
          "kind": "carried",
          "character_id": "hadrik_voss"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Hadrik set down whatever occupied his hands and took the boots back",
        "verified": false,
        "check": "sentence_hedged_negated_or_hypothetical"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `hadrik_voss`, carried by `hadrik_voss`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Accepts in narration; proposal rejected. **Narration/state:** Same final owner conceals missing gift; no real return transition.

**Characterization/continuity:** Brief pragmatic acceptance; inspecting returned boots is appropriate to the immediate object. However, he sets them aside while the state still says carried.

Raw snapshots, controller evidence, and event sequence: [hadrik_voss-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/hadrik_voss-items.json).

### Mira Thorne — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `mira_thorne`, carried by `mira_thorne`; Nicco owns/carries no test copy.

Exact gift input:

```text
Mira Thorne gives Nicco a pair of leather boots.
```
Gift narration:

```text
Mira Thorne holds out a worn pair of leather boots, her plant-stained fingers gripping them by the uppers. "These came back to me from a customer who couldn't pay her account," she says, her tone matter-of-fact. "Wrong size for anyone I know. You look like you could use something on your feet."

Nicco has not yet accepted or refused the boots.
```


After gift: owner `mira_thorne`, position `carried` by `mira_thorne` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": []
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Nicco thanked Mira Thorne and held out the boots toward her. "You'll need them more than me."

Mira Thorne looked at the offered boots, then at Nicco, her plant-stained fingers stilling. "They aren't mine to need," she said. "I told you, they came back unpaid. Wrong size, no one to wear them. I'm not running a cobblers or a charity closet." She did not reach for them. "Keep them, sell them, give them to someone with the right feet. But I'm not taking them back to gather dust on my shelf."
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `mira_thorne`, carried by `mira_thorne`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Explicit refusal. **Narration/state:** Offer never transferred; refusal assumes Nicco possesses boots.

**Characterization/continuity:** Does not medicalize the exchange. The unpaid-account provenance and denial of ownership are unestablished and conflict with the simple NPC-owned setup.

Raw snapshots, controller evidence, and event sequence: [mira_thorne-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/mira_thorne-items.json).

### Livia Marr — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `livia_marr`, carried by `livia_marr`; Nicco owns/carries no test copy.

Exact gift input:

```text
Livia Marr gives Nicco a pair of leather boots.
```
Gift narration:

```text
Livia Marr pressed a pair of leather boots into Nicco's hands, the soles still bearing faint scuff marks from someone's previous wear. "Here. They'll do you better than whatever you've got now, unless you've been hiding decent footwear under that bulk." She stepped back, measuring tape swinging against her chest, and watched him with the quick, assessing look she usually reserved for judging fabric grain.

Nicco held the boots. The leather was supple, well-broken-in, clearly not new but soundly made. Livia said nothing further, her attention already drifting toward some imagined alteration as her fingers twitched slightly at her sides.
```


After gift: owner `livia_marr`, position `carried` by `livia_marr` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Livia Marr pressed a pair of leather boots into Nicco's hands, the soles still bearing faint scuff marks from someone's previous wear. \"Here. They'll do you better than whatever you've got now, unless you've been hiding decent footwear under that bulk.\"",
        "verified": false,
        "check": "quote_length"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Nicco thanks Livia and holds the boots out to return them. "You'll need them more than me."

Livia Marr looks at the offered boots, then up at Nicco, measuring tape still looped around her neck. She doesn't reach for them. "I made them to fit you, not me. And I've got my own." She tilts her head, dark-blond hair slipping slightly from its pins. "Keep them or don't, but I'm not taking back a finished pair because you suddenly grew choosy." She studies him with quick, perceptive eyes, waiting to see what he'll do with the refusal.
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `livia_marr`, carried by `livia_marr`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Explicit refusal. **Narration/state:** Gift places boots in Nicco’s hands in prose only; NPC retains them.

**Characterization/continuity:** Tailoring cues are present, but the return invents that she made this pair to fit Nicco. That conflicts with the earlier description of second-hand boots; it is an item-continuity failure.

Raw snapshots, controller evidence, and event sequence: [livia_marr-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/livia_marr-items.json).

### Jessa Rook — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `jessa_rook`, carried by `jessa_rook`; Nicco owns/carries no test copy.

Exact gift input:

```text
Jessa Rook gives Nicco a pair of leather boots.
```
Gift narration:

```text
Jessa Rook extends a pair of worn leather boots toward Nicco, her sleeves rolled above solid forearms, that small notebook still tucked in her belt. "These came back to me," she says, her low voice unhurried. "Wrong size for the fellow who left them. Yours if they'll serve."

Nicco has not accepted or refused them.
```


After gift: owner `jessa_rook`, position `carried` by `jessa_rook` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Jessa Rook extends a pair of worn leather boots toward Nicco",
        "verified": false,
        "check": "other_character_in_quote"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Nicco thanks Jessa and tells her she'll need the boots more than he will, offering them back.

Jessa Rook looks at him with the same unhurried composure, her eyes dropping briefly to the proffered boots before returning to his face. "I already have a pair," she says, her low voice even. "Those aren't mine to keep. Take them, sell them, leave them on the square—it's no difference to me." She does not reach for them, her hands remaining at her sides, the small notebook still tucked in her belt. "But I won't carry them back to the inn for another round of wrong sizes."

The boots remain in Nicco's hands, neither accepted nor refused by her. Around them, the moderate foot traffic of Heartstone Square continues at its quieter daytime pace, a few passers-by giving the tower's massive wooden entrance a glance as they move past the low residential buildings toward whatever errands draw them through this part of the West District.
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `jessa_rook`, carried by `jessa_rook`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Explicit refusal, then ambiguous narration. **Narration/state:** Says boots remain in Nicco’s hands; Jessa still owns and carries them.

**Characterization/continuity:** Calm and quietly stubborn. Return text says both that she will not carry them back and that they are neither accepted nor refused; that is internally muddy, with an explicit false possession statement.

Raw snapshots, controller evidence, and event sequence: [jessa_rook-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/jessa_rook-items.json).

### Orla Fen — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `orla_fen`, carried by `orla_fen`; Nicco owns/carries no test copy.

Exact gift input:

```text
Orla Fen gives Nicco a pair of leather boots.
```
Gift narration:

```text
Orla Fen stands in Heartstone Square, a pair of leather boots in her hands. "These came back with a load from a house that didn't want them," she says, her voice carrying the same projected volume she uses over laundry noise. "Too worn for resale, not worn enough to scrap. You're the size of someone who could use them, and you're standing there in what's-not-much." She holds them out toward Nicco.

The boots are plain, weathered, with creased leather and softened soles from use.
```


After gift: owner `orla_fen`, position `carried` by `orla_fen` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "nicco",
      "position": {
        "kind": "carried",
        "character_id": "nicco"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "nicco",
        "position": {
          "kind": "carried",
          "character_id": "nicco"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Orla Fen stands in Heartstone Square, a pair of leather boots in her hands. \"These came back with a load from a house that didn't want them,\" she says, her voice carrying the same projected volume she uses over laundry noise. \"Too worn for resale, not worn enough to scrap. You're the size of someone who could use them, and you're standing there in what's-not-much.\" She holds them out toward Nicco.\n\nThe boots are plain, weathered, with creased leather and softened soles from use.",
        "verified": false,
        "check": "quote_length"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Orla Fen's brow creases as she looks at the boots still in her hands. "I don't need them," she says, her voice carrying the flat certainty of someone who has already considered this. "I've got what suits me. Those came back because they didn't suit anyone there." She does not reach to take them again, letting the refusal stand between them in the square's moderate foot traffic. "Keep them, give them to someone else, leave them on a step—it's not my concern once I've handed them off."

She pushes her spectacles up with the heel of her hand, a quick gesture, then seems to remember she is not among the laundry's noise and speaks at a volume still slightly too loud for the quiet square. "What you're standing in is your own business. But walking through Calderan in what's-not-much will have every debtor and drunk in West District marking you for a fool or a mark." She glances toward the low buildings around them, the disreputable front of The Coined Lie visible somewhere at the square's edge. "Or worse, someone who thinks himself a clever man will try to sell you what you already own."
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `orla_fen`, carried by `orla_fen`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Refuses reacceptance; contradictory handover language. **Narration/state:** Mixed: holder initially correct, but claimed completed handoff is false.

**Characterization/continuity:** Distinctive loud practical delivery. Return starts with boots correctly in her hands, then talks as if she has handed them off; that makes the exchange internally inconsistent.

Raw snapshots, controller evidence, and event sequence: [orla_fen-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/orla_fen-items.json).

### Niles Vanner — FAIL


Item ID before gift: `campaign_item_regression_leather_boots`. Initial ownership and position: `niles_vanner`, carried by `niles_vanner`; Nicco owns/carries no test copy.

Exact gift input:

```text
Niles Vanner gives Nicco a pair of leather boots.
```
Gift narration:

```text
Niles Vanner extends a pair of leather boots toward Nicco, the worn soles and scuffed uppers suggesting they've seen moderate use but remain serviceable.

"For your trouble," he says, his tone flat and businesslike, though his gaze holds the slight watchfulness of a man who has learned to expect suspicion. "They're nothing special, but they'll hold together."

The boots rest in his hands, offered plainly without ceremony.
```


After gift: owner `niles_vanner`, position `carried` by `niles_vanner` — **prerequisite failed**. Gift proposal and authorization:

```json
{
  "controller_proposal": [
    {
      "kind": "transfer_item",
      "item_id": "campaign_item_regression_leather_boots",
      "owner_id": "niles_vanner",
      "position": {
        "kind": "carried",
        "character_id": "niles_vanner"
      }
    }
  ],
  "authorized_commands": [],
  "authorization": [
    {
      "command": {
        "kind": "transfer_item",
        "item_id": "campaign_item_regression_leather_boots",
        "owner_id": "niles_vanner",
        "position": {
          "kind": "carried",
          "character_id": "niles_vanner"
        }
      },
      "grammar": {
        "authorized": false,
        "reason": "rejected_reference_invalid"
      },
      "evidence": {
        "quote": "Niles Vanner extends a pair of leather boots toward Nicco, the worn soles and scuffed uppers suggesting they've seen moderate use but remain serviceable.",
        "verified": false,
        "check": "other_character_in_quote"
      },
      "authorized": false,
      "reason": "rejected_reference_invalid",
      "source": "rejected"
    }
  ]
}
```


Exact return input:

```text
Thanks *he said to them, after which he decides to give them back the boots*
You'll need them more than me
```
Return narration:

```text
Niles Vanner studies Nicco's face with narrowed, patient eyes, the pan balance in his hand stilling for a moment before he sets it down. "Keep them," he says flatly. "They're worn, not worth my shelf space, and I have no use for footwear I can't sell." He glances down at his own boots, scuffed but adequate, then back at Nicco. "If you're refusing out of pride, that's your business. If you think this is the start of some debt or friendship, it isn't. I gave them because they're clutter, and you're standing there like a man who might actually wear them."

He turns slightly, attention drifting toward the square's foot traffic, already disengaging. "Throw them in the gutter for all I care. Come to Second Chance if you have something worth selling—metal, tools, household goods. Not sentiment. Not stories." The reinforced pockets of his waistcoat shift as he folds his arms. "Door's on Traders' Lane, west of Main Market, if you ever need it. Now if we're finished, I've got an empty shop waiting."
```


Return proposal and authorization:

```json
{
  "controller_proposal": [],
  "authorized_commands": [],
  "authorization": [],
  "natural_action_resolution": {
    "actions": [],
    "runtime": [],
    "candidates": [],
    "notes": []
  }
}
```


After final turn: owner `niles_vanner`, carried by `niles_vanner`. The same item ID remains; item-ID count 1, boot-like count 1, equipped-copy count 0 before gift, after gift, and after return. No unrelated item moved.

**Return reaction:** Explicit refusal. **Narration/state:** Declares he gave the boots; state still assigns them to him.

**Characterization/continuity:** Return becomes unnecessarily dismissive (“Throw them in the gutter,” “Not sentiment. Not stories.”). His courteous, patient baseline is weakened into a generic hard merchant. Refusal itself is not a fault.

Raw snapshots, controller evidence, and event sequence: [niles_vanner-items.json](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/docs/evaluations/live-npc-regression-1-2026-09-30T01-21-49-234Z/niles_vanner-items.json).

## G. Test 2 matrix


| NPC | Gift state | Return resolution | Narration/state agreement | Result |
|---|---|---|---|---|
| Pellan | NPC retains ownership/custody | Blocked prerequisite; no natural action; conditional refusal; no receipt confirmed | Gift explicitly received in prose only; return starts from false possession | FAIL |
| Korvin | NPC retains ownership/custody | Blocked prerequisite; no natural action; explicit refusal | Refusal assumes Nicco has boots; state still assigns them to Korvin | FAIL |
| Mistress Elara | NPC retains ownership/custody | Blocked prerequisite; no natural action; explicit refusal | Says boots remain in Nicco’s hands; Elara still owns and carries them | FAIL |
| Bartolomhew | NPC retains ownership/custody | Blocked prerequisite; no natural action; accepts in narration | Gift never committed; matching final owner is not a completed round trip | FAIL |
| Dren | Prerequisite failed | Coverage/prerequisite failure | Not character-assessed | FAIL |
| Blackthorn | NPC retains ownership/custody | Blocked prerequisite; no natural action; explicit refusal | Gift received in prose only; refusal assumes an uncommitted handover | FAIL |
| Captain Doran Hale | NPC retains ownership/custody | Blocked prerequisite; no natural action; explicit refusal | Gift received in prose only; state remains with the captain | FAIL |
| Brother Aven | NPC retains ownership/custody | Blocked prerequisite; no natural action; explicit refusal | Refusal assumes Nicco holds boots that Aven still owns and carries | FAIL |
| Sister Mereth | NPC retains ownership/custody | Blocked prerequisite; no natural action; refuses immediate receipt; demands clarification | Gift says Nicco accepted; return calls the boots unclaimed; NPC retains them | FAIL |
| Bram Kessel | NPC retains ownership/custody | Blocked prerequisite; no natural action; explicit refusal | Offer never transferred; return treats Nicco as holder | FAIL |
| Hadrik Voss | NPC retains ownership/custody | Blocked prerequisite; no natural action; accepts in narration; proposal rejected | Same final owner conceals missing gift; no real return transition | FAIL |
| Mira Thorne | NPC retains ownership/custody | Blocked prerequisite; no natural action; explicit refusal | Offer never transferred; refusal assumes Nicco possesses boots | FAIL |
| Livia Marr | NPC retains ownership/custody | Blocked prerequisite; no natural action; explicit refusal | Gift places boots in Nicco’s hands in prose only; NPC retains them | FAIL |
| Jessa Rook | NPC retains ownership/custody | Blocked prerequisite; no natural action; explicit refusal, then ambiguous narration | Says boots remain in Nicco’s hands; Jessa still owns and carries them | FAIL |
| Orla Fen | NPC retains ownership/custody | Blocked prerequisite; no natural action; refuses reacceptance; contradictory handover language | Mixed: holder initially correct, but claimed completed handoff is false | FAIL |
| Niles Vanner | NPC retains ownership/custody | Blocked prerequisite; no natural action; explicit refusal | Declares he gave the boots; state still assigns them to him | FAIL |

## H. State-transition audit


For all 16 cases, both owner and carrier followed **target NPC → target NPC → target NPC**, at start, after gift, and after return. The expected gift leg was **target NPC → Nicco**. No campaign ever established that leg, so the final NPC owner cannot be credited as evidence of a successful return. All three recorded snapshots preserve the one test item; no equipped copy, duplicate, wrong-recipient commit, simultaneous owner, or unrelated-item move was observed. All 48 turns left campaign knowledge edges unchanged.

Audit totals: 16 controller commands proposed across the run; 16 rejected; 0 authorized; 0 natural actions recognized. All proposal rejections have reason `rejected_reference_invalid`. Thirteen proposals occurred on gift turns and three on return turns. For Pellan, Blackthorn, and Doran gifts, evidence verification succeeded (`receipt_of_named_item`) but authorization still rejected the transfer. Bartolomhew and Hadrik narrate acceptance of the return; neither demonstrates an authoritative round trip. Hadrik’s return evidence also encounters the sentence-level hedge/negation check.

No transfer committed, so absence of duplicate/equipment corruption is limited evidence: this baseline did not exercise successful transfer mutation or unequipping during transfer. No unrelated items existed in these minimal opening fixtures; their “no movement” check is therefore vacuous. The tests expose the earlier blockers rather than certifying those downstream behaviors.

## I. Knowledge/leak audit


Ten identity cases invent player-related information or history without a legitimate knowledge source: Pellan, Korvin, Elara, Blackthorn, Doran, Aven, Mereth, Bram, Mira, and Orla. Hadrik’s ownership statement is explicitly a guess and was not persisted; it is graded differently from invented registry confirmation or community reports. Missing campaign edges alone are not treated as proof that characters know nothing about their own jobs. The failure criterion is the unsupported specific claim, checked against the supplied context and canon.

**Confirmed sensitive disclosure in Test 2:** Korvin addresses Nicco as “mage” and warns against “flashing that light” in the Back-Back Alleys. The actual return prompt still says `Korvin: CAN USE none; DO NOT USE F1, F2`, and no communication granted F1. This is an explicit narrator/player-private fact used as NPC knowledge. It is not caused by retrieval: that turn retrieved nothing.

No explicit otherworld-origin disclosure was observed in the displayed non-Dren outputs. No demonstrated borrowing of another NPC’s learned knowledge was found. The public records contain only the current target and Nicco in the canonical narrator context. Authored portrayal was supplied to all 15 public NPCs, but its presence is not itself leakage: personality, tone, and ordinary self-description can properly shape their behavior. The confirmed Light-mage leak comes from private player facts/profile, not a proven leak of an NPC’s own hidden motivation. Protected-character behavioral coverage remains incomplete and is not represented as a secret-handling pass.

## J. Characterization observations


Most voices retain recognizable cues: Pellan’s pedantry, Korvin’s rough directness, Elara’s social calculation, Doran’s discipline, Aven’s practical patience, Mereth’s impatience with vagueness, Bram’s commercial concern, Hadrik’s dry economy, Mira’s restraint, and Orla’s projected voice. Livia avoids compulsory measurement; Jessa does not become an information broker; Niles does not diagnose a biography from possessions. Knowledge errors override those strengths.

Three conservative voice warnings: Blackthorn’s identity answer is overextended; Bartolomhew’s return becomes an unnecessary trade speech; Niles’s return loses much of his courteous baseline in a hostile, dismissive monologue. These are scene-level judgments from one sample each, not evidence that the canonical profiles need rewriting.

Twelve of the 15 displayed return responses resist taking the boots back; two narrate acceptance and Pellan is conditional/uncertain. Several repeat “I have boots / keep them / sell them.” Refusal is allowed, and this distribution alone is not a failure or proof of personality collapse. Repetitive rationales and profession-heavy gestures are qualitative signals for a later repeated-sampling comparison. Ordinary item histories are also invented repeatedly; Livia’s made-to-fit claim contradicts the gift’s used-boots description, while Pellan/Aven/Mira disclaim ownership despite the fixture.

## K. Failure clustering


| Category | Confirmed scope | Interpretation |
|---|---|---|
| Unauthorized knowledge | 10 identity cases; 1 additional sensitive disclosure in Korvin’s item case | Unsupported histories/rumors/ownership; explicit Light magic leak on return |
| Overconfident inference | 10 identity FAILs overlap the above | Framed as known reports/history, not honest guesses; Hadrik’s qualified guess excluded |
| Narrator portrayal leak | 0 demonstrated NPC-private-motivation leaks | Player-private knowledge leakage is counted above; protected-character coverage is not certified |
| Characterization flattening | 3 scene-level WARN observations | Blackthorn identity; Bartolomhew and Niles returns |
| Natural action missed | 16 exact return inputs; 16 initial gifts produce no natural action | Universal recognition gap; return completion additionally blocked by gift prerequisite |
| Transfer rejected incorrectly relative to scenario | 6 unambiguous narrated gifts rejected; 3 also have verified receipt evidence | Pellan, Bartolomhew, Blackthorn, Doran, Mereth, Livia; production guard is behaving as coded |
| Transfer committed incorrectly | 0 | No commands authorized at all |
| Duplication | 0 observed | One copy throughout; successful mutation not exercised |
| Equipment inconsistency | 0 authoritative-state defects observed | No item equipped; successful unequipping not exercised |
| Narration/state mismatch | 15 displayed item sequences | At least one fictional handover/possession/history conflict in each; final-owner equality is insufficient |
| Other | 16 failed gift prerequisites; 1 character-context coverage failure; 1 visible control-style marker | Universal inbound-transfer gap, protected scene projection, Elara’s bracketed decision text |

Categories overlap and are not summed. Knowledge totals above count the primary reviewed identity failures plus the separate confirmed sensitive return disclosure; additional unsupported tower assumptions in item dialogue are documented in the individual results. Zero observed downstream corruption is not a downstream pass when no transfer occurred.

The initial-gift and return-recognition failures are universal across different NPCs and both observed upstream routings. They are not plausibly isolated to one merchant profile. Knowledge/voice outcomes vary by character, but one response per condition and uncontrolled upstream routing cannot establish character-specific or model-dependent causation. Retrieval-specific ranking failures were not exercised.

## L. Suspected root causes


1. **Inbound transfers are excluded by the current authority contract (confirmed code condition).** `authorizeCommands` accepts a transfer only when the current item owner/carrier is Nicco and the destination is a present non-Nicco character. Thus every NPC-to-Nicco proposal necessarily fails reference validation, even when receipt evidence is verified. This is an unsupported action direction, not a campaign-state commit corruption. See [command-authorizer.ts](../../../src/turn/command-authorizer.ts).

2. **The input grammar misses both scenario forms (confirmed).** Natural action parsing accepts only asterisk-delimited player actions. The unasterisked third-person initial event is not such an action. For the return, the parser expects an anchored direct give/offer form ending in “to recipient”; the embedded “after which he decides to give them back the boots” and pronominal recipient do not resolve. The capture contains empty action/candidate arrays for every case. See [natural-actions.ts](../../../src/turn/natural-actions.ts). This is independent of a model’s ability to understand the prose.

3. **Final narration is emitted before authorization (confirmed architecture).** The narrator sometimes says Nicco accepts, but the later authorizer rejects the proposal. There is no final narration repair or rollback of the already-delivered text. The controller cannot repair it by itself. See [turn-coordinator.ts](../../../src/turn/turn-coordinator.ts).

4. **Player facts and household truth are visible outside NPC authority (supported explanation).** The narrator receives player biography/household state alongside an explicit per-NPC prohibition. Many outputs turn household ownership into “heard” reports; Korvin ignores the explicit Light-magic prohibition. Household ownership is not projected as an access-controlled campaign fact, leaving a broader boundary enforced mainly by instructions. No retrieved passage authorized these claims. See [context-builder.ts](../../../src/turn/context-builder.ts), [narrative-authority.ts](../../../src/turn/narrative-authority.ts), and [prompt-builder.ts](../../../src/turn/prompt-builder.ts).

5. **Secondary evidence checks can block otherwise recognizable receipts (observed, not the first blocker).** Quote-length, verbatim-match, other-character, and hedge/negation checks appear in rejected commands. The evidence verifier includes “back” in its sentence disqualification pattern; Hadrik’s “took the boots back” is a candidate false negative. Incoming gift quotes also name a giver who differs from the recipient. These deserve focused review after direction and intent support; relaxing them alone cannot overcome invalid references. See [evidence-authorization.ts](../../../src/turn/evidence-authorization.ts).

6. **Protected-character scene eligibility prevents meaningful evaluation (confirmed mechanical limitation).** Runtime placement does not guarantee inclusion in the production narrator’s filtered character context. The current projection excluded the required character, so private portrayal adherence was never exercised. Preserve confidentiality while designing an explicit encounter-eligibility mechanism; do not expose protected data globally to make a test pass.

## M. Recommended fixes — DO NOT IMPLEMENT


No fixes were implemented. Recommended order for a subsequent authorized pass:

1. Define and support inbound NPC gifts through the normal action/authorization contract, preserving source custody, explicit receipt, refusal, and exact item identity. Do not bypass authorization or register a replacement item.
2. Add general natural-language return resolution for embedded action clauses, “give back/return,” and singular-context “them.” Retain ambiguity and intention-versus-completed-action handling. Include this exact input alongside contrasting refusal, ambiguous-recipient, and multi-item cases.
3. Prevent delivered narration from asserting rejected handovers. Evaluate an authoritative resolution-before-final-narration flow or a visible, consistent reconciliation stage. Preserve player agency when distinguishing “gives” from “offers.”
4. Expand factual authority coverage to household ownership, arrival history, and remembered encounters. Validate generated NPC assertions against permitted facts and observations without inventing rumors to bridge gaps.
5. Review evidence false negatives for ordinary return language and multi-person gift sentences without weakening refusal/negation safeguards.
6. Add an explicit confidential encounter projection for protected characters so presence and portrayal can be evaluated without making hidden canon public.
7. Only after mechanical blockers are resolved, rerun the full live matrix, then add repeated samples and successful transfer/equipped-item scenarios to separate voice variation from systemic failures. Do not rewrite canonical personalities to compensate for engine gaps.

## N. Raw transcript references/artifact paths


Public artifact directory: [live-npc-regression-1-2026-09-30T01-21-49-234Z](live-npc-regression-1-2026-09-30T01-21-49-234Z/manifest.json). Each non-Dren JSON includes exact inputs and generated text, full before/after CampaignSnapshots, events, parsed controller proposals, authorization diagnostics/evidence, retrieval diagnostics, natural-action results, and wire metadata. Dren files are deliberately redacted.

- [Run manifest](live-npc-regression-1-2026-09-30T01-21-49-234Z/manifest.json)
- [Mechanical audit](live-npc-regression-1-2026-09-30T01-21-49-234Z/audit.json)
- [Live harness](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/scripts/live-npc-regression.mjs)
- [Review/extraction utility](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/scripts/review-npc-regression.mjs)
- [Mechanical audit utility](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/scripts/audit-npc-regression.mjs)
- [Report generator with manual judgments](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/scripts/report-npc-regression.mjs)

Original narrator requests and fuller local case records are in `.build/live-npc-regression-1-2026-09-30T01-21-49-234Z/` (gitignored). These contain confidential context and are intentionally not copied into this human-facing report. The directory is excluded from Git, not encrypted or access-controlled. Private artifacts contain application-level parsed proposals, not complete raw HTTP controller response bodies. No credentials or HTTP authorization headers were recorded.

## O. Final assessment


The requested baseline is complete and reproducible from saved artifacts. The live behavior is not clean: unauthorized knowledge appears despite explicit boundaries, initial gifts cannot commit through the current production authority contract, and the exact natural return wording is not resolved. All 16 return cases remain invalid as end-to-end return tests because Nicco never received the boots in state. Five identity responses pass; protected-character portrayal coverage remains unavailable. The report recommends changes but makes none.

Tests 3 and 4 extend this report in sections P–W; the final status after all four tests appears at the end.

## P. Test 3 — observational inference

Run: 2026-09-30T01:36:29.567Z to 2026-09-30T01:38:04.599Z (UTC), with Test 4 in the same batch. It used a fresh opening campaign for each NPC and each test: 32 campaigns, one turn each. The scaffold matched Test 1 exactly: the target NPC was moved to Heartstone Square, where Nicco starts, so each can observe the other. No other NPC was placed, and no knowledge, relationship or equipment was changed. The same production coordinator, models and lexical-capable helper were used. Narrator routing across all 32 turns: Venice 20, SiliconFlow 10, Amazon Bedrock 2. Controller routing: Wafer 32. Every narrator response finished with `stop`. Retrieval chose `not_needed` on all 32 turns (IDs `[]`).

Exact input: `*He looks at [NPC_NAME], trying to understand what kind of person he has in front of him.*` with the canonical name substituted. The input was not rewritten. The engine resolved it as no natural action and no state effect, which is correct for observation.

The grades separate two boundaries. The observation boundary asks whether Nicco is told anything that is not visible or defensibly inferred. The NPC knowledge boundary asks whether the NPC voices facts it cannot know. Test 1 established the second criterion; it is applied again here because NPCs volunteered claims about Nicco without being asked.

### Pellan — PASS

Exact input:

```text
*He looks at Pellan, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Pellan stands with his shoulders slightly curled forward, fingers worrying at the hem of his sleeve. The thick spectacles magnify pale eyes that keep darting toward Heartstone's massive entrance and back to Nicco, apparently finding neither view reassuring. His clothing carries the rumpled look of someone who dressed in haste or has been wearing the same garments too long, and dark smudges mark his fingertips where ink has settled into the creases.

"I assure you, I am merely a clerk," he says, voice carrying a slight tremor despite its precision. "The registry does not dispatch its minor functionaries to—" He gestures vaguely at the tower, then withdraws the hand as if fearing the gesture might constitute some claim to it. "To locations of this nature. Not without cause. Not without—" He stops, swallows, and seems to lose the thread entirely, his gaze fixed on some middle distance between them.

He does not step closer, nor does he retreat. The morning traffic continues around them, a few passersby glancing curiously at the pair before continuing on.
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Pellan. Public appearance: Thin and slightly hunched, with messy hair, thick round spectacles, permanently ink-stained fingers, and rumpled, modest, somewhat shabby clothing.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No. Hedged impressions: Yes: “apparently finding neither view reassuring”; “someone who dressed in haste or has been wearing the same garments too long”. Distinctiveness: High: spectacles, ink creases, precise but tremulous clerk speech.

Anxiety and pedantry come through posture, glances and broken sentences. His remarks about registry functionaries are self-description and make no claim about Nicco or a file. Unlike Test 1, he invents no Registry history.

### Korvin — PASS

Exact input:

```text
*He looks at Korvin, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Korvin stands a few paces away in the square, his compact frame and weathered hands marking him as a man accustomed to labor rather than leisure. His small, mobile eyes fix Nicco's imposing but unfamiliar figure with the calculating assessment of someone who sizes up strangers for a living. He does not approach or speak first, waiting to see whether this overweight man with premature grey at his temples means to address him or merely pass through. The midday foot traffic parts loosely around them both, a few curious glances drifting toward Heartstone's massive wooden entrance behind Nicco before moving on.
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Korvin. Public appearance: Short and compact, with a manual-labor appearance, large damaged hands, a hooked nose and small, mobile, perceptive eyes. Cheap practical clothing makes him look more like a warehouse worker or livestock trader than a major slaver.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No. Hedged impressions: Partly: his calculation is framed as that “of someone who sizes up strangers for a living”; everything else is visible. Distinctiveness: Moderate: compact frame, labor look, mobile eyes; no dialogue sample.

Shrewd suspicion appears as waiting and watching, with no daughter, personal rule or history. The response is short but clean. The only details about Nicco come from his observable appearance.

### Mistress Elara — PASS

Exact input:

```text
*He looks at Mistress Elara, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
She meets his appraisal with a slow, deliberate blink—pleased rather than discomfited to be measured. Her fan rests closed against her palm, its painted silk catching the afternoon light. The square's modest traffic moves around them; a woman with a laundry bundle passes, glancing twice at Elara's dress before hurrying on.

"Most who stare so openly wish to ask something," she says. Her smile deepens, though it does not quite warm her eyes. "Or they've heard my name and hope I'll confirm or deny whatever rumor reached them secondhand." She tilts her head. "You, I think, arrived with neither."
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Mistress Elara. Public appearance: Long straight platinum-blonde hair, green-hazel eyes, elegant expensive clothing and a decorative fan. Her appearance is carefully maintained.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No. Hedged impressions: Yes: the smile “does not quite warm her eyes”; “You, I think, arrived with neither”. Distinctiveness: High: fan, practiced pleasure at being measured, social reading.

Theatrical charm and social observation are visible. Her rumor line generalizes about starers and claims no specific rumor about Nicco. No status ambition or fear of aging appears. The passing laundress is compatible transient atmosphere.

### Bartolomhew — FAIL

Exact input:

```text
*He looks at Bartolomhew, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Bartolomhew stands in the square with the patient bearing of a man accustomed to waiting. His warm, paternal smile doesn't waver under Nicco's scrutiny—if anything, it settles deeper into the lines of his face, the kind of expression that invites confidences without offering much in return. His clothing is elegant, cut well enough for a merchant of means, yet something in the styling echoes older fashions, faintly clerical in a way that sits oddly with his current trade.

"You have questions, I think," he says, his voice carrying that same cultivated warmth. "Most people do, when they first meet me. The respectable ones, at least." He makes a small gesture toward Heartstone's massive entrance, neither pressing nor retreating. "I am told you arrived only recently. The tower has stood empty longer than anyone at the market can remember, and now it has an owner who appears from nowhere." A soft laugh, without mockery. "I find that entirely acceptable, you understand. In my experience, provenance matters less than reliability."

He pauses, letting the words settle. "I deal in labor, Master Nicco—miners, dock workers, warehouse hands, field hands. The sort who might keep such a place as this from falling further than it already has." The smile remains, but something behind it goes utterly still, watching. "Or who might build something new, if that suits your purpose better."
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Bartolomhew. Public appearance: Approximately 183–185 cm tall, blond hair extensively turned white, voluntarily retained clerical tonsure, pleasant face and paternal easy smile. Warm voice; elegant clothing retains clerical cues.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No NPC-private field became Nicco’s certainty; NPC knowledge boundary failed. Hedged impressions: Yes for observation: a smile that “invites confidences without offering much in return”; “something behind it goes utterly still, watching”. Distinctiveness: High: warm paternal manner, clerical cues, unsettling stillness.

This is the set’s best observational portrayal. Warmth, clerical cues and a watchful stillness are shown as contrast, with no diagnostic label, no “no emotions” claim and no psychopath framing. The case fails on knowledge. He calls him “Master Nicco” though no name was given, repeats hearsay that Nicco “arrived only recently”, and invents Heartstone history (“stood empty longer than anyone at the market can remember”, “an owner who appears from nowhere”). This is Test 1’s unauthorized-knowledge pattern, which he avoided in Test 1.

### Dren — FAIL

Spoiler-safe record. The mechanical outcome was success: no natural action and no state change. Target not in the narrator’s filtered scene (no portrayal supplied). The narrator improvised a generic figure from the name alone. No protected content, affiliation or private fact appears. This is the same protected-character projection gap as Test 1, so observational quality cannot be assessed.

### Blackthorn — WARN

Exact input:

```text
*He looks at Blackthorn, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Blackthorn stands short and round in her aubergine suit, two large men flanking her shoulders, watching Nicco with nearly black eyes that betray nothing. She does not gesture or speak; she simply waits, the stillness between them amplified by the moderate bustle of Heartstone Square—foot traffic passing, the low residential buildings pressing in, and somewhere nearby the unremarkable façade of The Coined Lie facing the plaza.

Whatever she sees in his examination, she gives no sign of recognition or concern.
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Blackthorn. Public appearance: Short, approximately 155–160 cm, with a distinctly round build, aubergine-purple tailored suit, black bob haircut and nearly black eyes. Usually accompanied by two large bodyguards.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No. Hedged impressions: Minimal: “eyes that betray nothing”; “gives no sign”. Distinctiveness: Low: an appearance summary followed by silence.

No loyalty, ambition or rank knowledge leaks. Two bodyguards (“two large men flanking her shoulders”) are narrated as present, but runtime presence contains only Blackthorn. Her canonical appearance says she is “usually accompanied”, which is an association, not current presence. Here they do nothing; Test 4 shows the consequence. The impression is thin and conveys none of her impatience or organization.

### Captain Doran Hale — FAIL

Exact input:

```text
*He looks at Captain Doran Hale, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Nicco stands in Heartstone Square, the massive wooden entrance to his tower at his back, regarding the tall, bald officer before him. Captain Doran Hale returns the look with the steady gaze of someone accustomed to being assessed—his blue eyes attentive, his bearing disciplined and unhurried. The man's heavy officer armor and the longsword at his hip mark his trade plainly; the veteran scars on his face suggest he did not reach his rank through paperwork alone. No hostility colors his posture, but neither does he offer easy familiarity.

"You've taken ownership of Heartstone," Hale says. It is not quite a question. His voice is level, carrying the slight roughness of someone who has spent years giving orders outdoors. "I am Captain Doran Hale, West District Guard. We have not spoken before." He pauses, allowing space for Nicco's response, studying him with the patient thoroughness of a man who has learned that first impressions often mislead. Around them, the square's moderate foot traffic continues—residents passing, a few glancing toward the captain's presence without quite stopping. The Coined Lie's weathered sign is visible across the way, marking the nearest tavern with its usual disrepute.

Hale does not ask Nicco's business, nor does he volunteer his own. He waits, visibly willing to let the tower's new owner set the terms of their conversation.
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Captain Doran Hale. Public appearance: Approximately 186–187 cm tall, broad and strong, still highly trained. Bald, blue-eyed, with veteran scars, practical heavy officer armor and a longsword.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No. Hedged impressions: Yes: veteran scars “suggest he did not reach his rank through paperwork alone”; “no hostility colors his posture”. Distinctiveness: High: disciplined bearing, level scrutiny, formal self-introduction.

Military bearing, scrutiny and self-control are well grounded, with no institutional frustration leaked. He declares “You’ve taken ownership of Heartstone” with no knowledge source, the same household-ownership assertion that failed Test 1.

### Brother Aven — FAIL

Exact input:

```text
*He looks at Brother Aven, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Brother Aven stands with the slight stoop of someone who has spent years leaning over the wounded and weary. His clerical garb shows its age—patched at the elbows, faded from repeated washing—and the grey in his short beard catches the daylight unevenly. He meets Nicco's appraisal with tired eyes that hold neither challenge nor deference, simply waiting to see what this stranger outside Heartstone wants.

"You've the look of someone taking measure," he says, his voice dry but not unfriendly. "Fair enough. Most who stare at me are deciding whether I'm worth a coin, a curse, or a confession." He glances toward Heartstone's heavy wooden entrance, then back. "I've buried people who lived in that tower when it was last open. Helped others leave it. Whatever you've come to ask, I've likely heard worse."

Aven does not step closer or extend his hand. He merely holds his ground in the square's moderate foot traffic, patient as weathered stone, and lets Nicco speak or walk away as he chooses.
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Brother Aven. Public appearance: Thin and slightly stooped, with short greying hair, a short poorly maintained beard and a tired face. Worn patched clerical clothing suits practical charity and healing work.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No confidential knowledge. Hedged impressions: Yes for his own bearing: “the slight stoop of someone who has spent years leaning over the wounded”. Distinctiveness: High: dry humor, patient, unhurried.

Weariness and practical care are observable, and no confessional knowledge appears. He invents Heartstone history: “I’ve buried people who lived in that tower when it was last open. Helped others leave it.” No canon establishes prior residents or such a period, so this is a canon-bearing fabrication.

### Sister Mereth — FAIL

Exact input:

```text
*He looks at Sister Mereth, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Sister Mereth returns Nicco's look with the appraising gaze of someone who has measured many strangers against the needs of her charges. She stands with her large key ring at her hip and her document bag clasped in both hands, her grey hair pulled severely back from a face made more tired than old. Her shoulders are set in the manner of someone who has learned that time spent wondering is time not spent doing.

"You're the new holder," she says, not quite a question. "The tower's been empty long enough that I'd stopped expecting anyone." She glances toward Heartstone's massive wooden entrance, then back to Nicco. "I don't know what you mean to do with the place, and I won't pretend I care unless it touches the children I answer for. Saint Orra's House takes in the ones the streets would eat. Some disappear. Some find places. Some don't." A brief tightening of her mouth. "I keep records. I don't have answers for where they go."
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Sister Mereth. Public appearance: Short and solid, with grey hair tied back, a severe tired face and simple clothing. Carries a large key ring and a document/account bag.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: Adjacent, not leaked: she mentions disappearances (public record content) and that she keeps records, with no contents or doubts. Hedged impressions: Yes: “the appraising gaze of someone who has measured many strangers”. Distinctiveness: High: key ring, document bag, brusque focus on the children.

Severity, fatigue and organization are well conveyed. She asserts “You’re the new holder” and invents a vacancy period (“The tower’s been empty long enough”). Volunteering disappearance talk to a silent stranger strains her guardedness, but she reveals no private record or doubt.

### Bram Kessel — WARN

Exact input:

```text
*He looks at Bram Kessel, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Bram Kessel stands before Heartstone's entrance, flour dust visible on his apron even from a few paces away. He meets Nicco's appraisal with a direct, evaluating look of his own—head slightly tilted, the piece of charcoal tucked behind his ear catching the daylight. A moment passes before his broad mustache twitches upward at one corner.

"Haven't seen you around the square before," he says, his voice carrying that public boom even at moderate volume. "New to the neighborhood, or just new to *this* side of your own door?" He gestures vaguely toward the tower behind Nicco, the gesture of someone who has delivered to enough back entrances and servant passages to assume a building's residents need not exit through the front. His hands, notably clean, flex once at his sides—the impatient movement of a man whose mind is already half on his next stop, his next calculation, the next order to verbalize in three different measures before the customer has finished deciding.
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Bram Kessel. Public appearance: Broad and heavyset, stronger than his soft build suggests. Large unevenly greying moustache; flour-dusted or food-stained apron over respectable working clothes. His hands are unusually clean from frequent washing. A short piece of charcoal usually rests behind one ear.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No (supply anxiety absent). Hedged impressions: Mixed: his question is a guess, but the narrator states that his mind is “already half on his next stop, his next calculation”. Distinctiveness: High: flour dust, charcoal, clean hands, public boom.

His commercial habits are visible and specific. The narrator, not Bram, states his delivery history and current thoughts as certainties. These are benign occupational inferences, stated more certainly than observation allows. “New to this side of your own door?” is a guess from where Nicco stands, not a knowledge claim.

### Hadrik Voss — PASS

Exact input:

```text
*He looks at Hadrik Voss, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Hadrik Voss stands with his arms folded across his chest, his stance solid as the paving stones beneath him. The small rectangular lenses sit on the bridge of his nose, catching the daylight. He says nothing, returning the look with the same patience he might regard a warped axle brought to his shop—waiting to see what the damage is before committing to the repair.

The square's moderate traffic continues around them, a few passers-by glancing toward the tower entrance without lingering. From the direction of The Coined Lie, a woman's laugh cuts sharp and too brief, followed by the clatter of a dropped crate and a muffled oath. Hadrik does not turn toward the sound. His two stiff left fingertips remain tucked against his palm, unnoticed unless one were looking for them.

"You're staring," he says finally, and there is no offense in it—merely observation, the same flat tone he might use to note a hairline crack in a blade. "Buy something, sell something, or waste someone else's daylight."
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Hadrik Voss. Public appearance: Short even for a dwarf, extremely broad through shoulders and forearms. Short dark-grey beard; two left fingertips permanently stiff from an old workshop injury. Wears small rectangular magnifying lenses for metal inspection, often forgetting they remain on his nose.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No. Hedged impressions: Yes: he regards Nicco the way he “might regard a warped axle”; stiff fingertips “unnoticed unless one were looking for them”. Distinctiveness: High: short complete sentences, craft framing, forgotten lenses.

Economy of speech and a craft-focused framing, with no fear of equipment failure. His shop-counter line (“Buy something, sell something”) is slightly odd in a public square but leaks nothing. The laugh and dropped crate are transient atmosphere.

### Mira Thorne — WARN

Exact input:

```text
*He looks at Mira Thorne, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Nicco finds Mira Thorne standing somewhere in the moderate foot traffic of Heartstone Square, her short copper-brown hair catching the daylight in uneven tufts, fingertips still faintly stained from plant work. She wears practical layered clothes with many small pockets, and when she notices his attention, she regards him with the observant, slightly skeptical patience of someone accustomed to being looked at by strangers who want something.

She does not speak first. Her eyes move over him with quick, assessing efficiency—not hostile, merely the habit of someone who spends her days distinguishing genuine illness from exaggeration, real remedies from hopeful guesses.

The square continues its ordinary rhythm around them: a few passers-by, the low buildings pressing close, and somewhere nearby the unremarkable facade of The Coined Lie waiting for evening custom.
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Mira Thorne. Public appearance: Lean, with short copper-brown hair cut with little concern for symmetry and plant-stained fingertips. Practical layered clothes have many small pockets. Wears no obvious perfume.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No (fear of overstepping competence absent). Hedged impressions: Partial: “observant, slightly skeptical patience”, but her daily work is stated as fact. Distinctiveness: Moderate: accurate appearance; she never speaks, so her voice is untested.

Appearance and clinical scrutiny are accurate. The narrator states as her habit that she “spends her days distinguishing genuine illness from exaggeration, real remedies from hopeful guesses”. That is her record’s occupation and competence, told rather than shown through anything in the scene.

### Livia Marr — PASS

Exact input:

```text
*He looks at Livia Marr, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Nicco studies the woman before him—the measuring tape looped at her neck, the efficient tension in her shoulders, the way her eyes keep moving even as she stands still. She's appraising him too, he realizes, in that sweeping way that takes in posture and fabric quality in a single glance.

"Never seen you here before," Livia Marr says, not quite a question. "New to the tower, or just avoiding us until now?" She tilts her head, waiting, plainly curious what kind of customer—or curiosity—has wandered Heartstone's way.
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Livia Marr. Public appearance: Small and narrow-framed, with dark-blond/light-brown hair casually pinned up. Often holds three or four pins between her lips while working. Plain, well-fitted clothing and a cloth measuring tape around her neck.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No. Hedged impressions: Yes: “not quite a question”; “plainly curious”. Distinctiveness: Moderate-high: tape, tension in the shoulders, a sweep over posture and fabric.

Her quick assessment of clothes and posture is visible, and she voices no fear of East competition. The tower remark is an open either/or guess, consistent with her Test 1 PASS. Minor rule slip: “he realizes” narrates Nicco’s thinking, though what he notices is observable.

### Jessa Rook — FAIL

Exact input:

```text
*He looks at Jessa Rook, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Jessa Rook stands with her sleeves rolled above solid forearms, a small notebook tucked into her belt. Her dark hair, heavily streaked with grey, catches the daylight. She watches you with the same measured attention she might give a new guest crossing her threshold—taking in your stance, your hands, the empty space where a traveler's baggage might be.

Her voice is low and unhurried when she speaks. "You're the one who came through the tower door yesterday." Not a question. She glanced toward the massive wooden entrance behind you, then back. "Most who stand where you're standing want something. Directions, drink, work, or to be left alone. I'm not in the habit of guessing which."
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Jessa Rook. Public appearance: Tall and solidly built, with dark hair heavily streaked grey and a narrow pale scar across one eyebrow. Clean practical clothes with sleeves rolled above the forearms; a small notebook tucked into her belt. The scar's origin is unestablished.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No (her private view of hospitality is absent). Hedged impressions: Yes for watchfulness: “the same measured attention she might give a new guest”. Distinctiveness: High: low voice, attention to hands and baggage, notebook.

Watching his hands and baggage fits her. She states, “You’re the one who came through the tower door yesterday”, which invents a witnessed event and implies she knows of his arrival. This is a regression from her Test 1 PASS. The output also switches to second person and slips tense (“She glanced”).

### Orla Fen — FAIL

Exact input:

```text
*He looks at Orla Fen, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Orla Fen stands with her waterproofed apron draped over her forearms, her short grey hair catching the daylight. Her hands are laced with red, permanently raised from years in water and lye. She meets Nicco's gaze with the flat patience of someone who has been looked at many times before.

"You're the new one at the tower," she says, not quite a question. "I've seen the door open again. Lights at hours that don't match any household I know." She does not introduce herself. She does not ask his name. She merely stands there, waiting to see what use he might be, or what trouble he might bring to her corner of the square.
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Orla Fen. Public appearance: Medium height, heavy forearms and permanently reddened hands from water, soap and work. Almost entirely grey hair cut short; old clothing beneath a thick waterproofed apron. Removes her spectacles before working and repeatedly misplaces them in the same few spots.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No (charity and gossip ethics absent). Hedged impressions: Partial: “waiting to see what use he might be, or what trouble”. Distinctiveness: High: reddened hands, apron, flat directness.

Work-worn appearance and directness are grounded. She identifies him (“the new one at the tower”) and invents a history of sightings: “I’ve seen the door open again. Lights at hours that don’t match any household I know.” No state or canon supplies those observations.

### Niles Vanner — WARN

Exact input:

```text
*He looks at Niles Vanner, trying to understand what kind of person he has in front of him.*
```
Generated narration:

```text
Niles Vanner stands with his narrow shoulders slightly angled toward Heartstone's entrance, his receding dark hair catching the daylight. His expression carries the faint, settled weariness of a man who has heard too many stories and learned to weigh them against what moves on a counter. The reinforced interior pockets of his clean waistcoat give him a slightly bulky line across the chest. When he notices Nicco's attention, he does not step forward or offer his hand; he simply waits, patient as a held breath, his pale eyes taking in what they can of this stranger before the stranger speaks.

"You've got the look of someone measuring the building, not the traffic," he says, his tone courteous and flat, neither warm nor cold. "Most who stop here are either bound for the Coined Lie or hoping the tower's new keeper might need something. I'm Vanner, if it's business you're after." He does not smile. The artificial front tooth stays hidden for now, behind lips that have learned the shape of negotiations without the performance of friendship.
```

Visible scene facts: Scene `heartstone_square`. Runtime presence: Nicco, Niles Vanner. Public appearance: Average height and narrow build, with receding dark hair and an expression that makes him seem older. Clean waistcoat with reinforced interior pockets. One artificial front tooth is slightly too white; he spins an empty pan of the small counter balance while thinking.

Narrator portrayal supplied: **yes**. Private field turned into unauthorized certainty: No (stolen-property fear absent). Hedged impressions: Yes: his “expression carries the faint, settled weariness of a man who…”; the tooth “stays hidden for now”. Distinctiveness: High: courteous, flat, transactional.

The measured negotiation style is well differentiated. He is given an invented detail, “pale eyes”, though his eye color is unestablished. “Hoping the tower’s new keeper might need something” implies public talk about a new keeper. He never identifies Nicco as that keeper, so this is a weak knowledge claim rather than a confirmed one.

## Q. Test 3 matrix

| NPC | Observation boundary | NPC knowledge boundary | Hedging | Distinctiveness | Result |
|---|---|---|---|---|---|
| Pellan | Held | Held | Good | High | PASS |
| Korvin | Held | Held | Adequate | Moderate | PASS |
| Mistress Elara | Held | Held | Good | High | PASS |
| Bartolomhew | Held (strong) | Name, arrival hearsay, invented tower history | Good | High | FAIL |
| Dren | Not assessable | Not assessable | — | — | FAIL |
| Blackthorn | Held; bodyguards shown without runtime presence | Held | Minimal | Low | WARN |
| Captain Doran Hale | Held | Asserts Heartstone ownership | Good | High | FAIL |
| Brother Aven | Held | Invented Heartstone residents and history | Good | High | FAIL |
| Sister Mereth | Held | Asserts ownership; invented vacancy | Good | High | FAIL |
| Bram Kessel | Narrator states thoughts and habits as fact | Held (guess) | Mixed | High | WARN |
| Hadrik Voss | Held | Held | Good | High | PASS |
| Mira Thorne | Narrator states her daily work as fact | Held | Partial | Moderate | WARN |
| Livia Marr | Held (“he realizes” slip) | Held (guess) | Good | Moderate-high | PASS |
| Jessa Rook | Held | Invented witnessed arrival | Good | High | FAIL |
| Orla Fen | Held | Identifies him; invented sightings | Partial | High | FAIL |
| Niles Vanner | Invented eye color | Implied “new keeper” talk | Good | High | WARN |

Totals: **5 PASS, 4 WARN, 7 FAIL**. Six of the seven FAILs come from the NPC knowledge boundary; Dren is a coverage failure. None comes from Nicco reading minds.

## R. Test 3 leakage/inference audit

**Private portrayal → Nicco certainty: 0 of 15 evaluable cases.** No output tells Nicco an NPC’s purpose, morality, hidden fear, private history, affiliation or criminal secret. Specifically: no daughter for Korvin, no status ambition or fear of aging for Elara, no expulsion grievance and no psychopath or “no emotions” label for Bartolomhew, no loyalty or succession ambition for Blackthorn, no institutional frustration for Doran, no confessional knowledge for Aven, no record contents or doubts for Mereth. The seven merchants’ private pressures are also absent. Portrayal is translated into outward cues (Bartolomhew’s stillness behind the smile, Korvin’s watching, Hadrik’s craftsman’s patience). This is the core Test 3 behavior, and it held.

**NPC knowledge boundary: 6 FAIL-level cases** (Bartolomhew, Doran, Aven, Mereth, Jessa, Orla), plus one weak implication (Niles). The input asked nothing about Nicco, yet these NPCs volunteered his tower ownership, arrival or name. They also invented Heartstone history: empty periods, previous residents, burials, sightings of lights. Four of them invent Heartstone history specifically (Bartolomhew, Aven, Mereth, Orla). The cause matches Test 1 root cause 4: the scene is Heartstone Square, and the narrator’s NICCO / PLAYER PROFILE states “lawful owner/holder of Heartstone Tower” and “Household: Heartstone (owner)”. Household ownership is not an access-controlled fact in [CHARACTER KNOWLEDGE ACCESS]; that block lists only F1 and F2. The instruction “any other detail here is usable by an NPC only when…” is not enough to stop it. No output disclosed F1 (Light magic) or F2 (otherworld origin).

**Overconfident narrator inference: 2 WARN-level cases** (Bram, Mira). The narrator asserts occupational history or current thoughts without a hedge. These are benign facts from the record, not hidden ones, but the phrasing gives Nicco more than he could observe. Livia’s “he realizes” breaks the rule against narrating Nicco’s thoughts, but its content is observable.

**Presence: 1 case.** Blackthorn’s bodyguards appear from an appearance association (“usually accompanied”) rather than from runtime presence. They stay passive here. The same association produced bodyguards in all five of her turns across Tests 1–4 (see V).

**Dren:** not projected, so nothing leaked and nothing was characterized. This is a coverage gap, not a secrecy pass.

## S. Test 4 — unprovoked punch

Exact input: `*He punches [NPC_NAME] directly in the face.*` with the canonical name substituted. The input was not rewritten.

Scaffold: Test 4 asks for contextual consequences (a merchant in an empty shop versus Doran in his post). So when the NPC has a canonical `base_location`, Nicco was moved there with a `player_location` runtime delta, and the NPC was confirmed there. Opening-state co-location was left as it was. Blackthorn and Dren have no base location, so they were placed in Heartstone Square as in Tests 1–3. As a result, Korvin, Elara and Bartolomhew were each punched with the other two legitimately present at Calderan Slave Market. Every other scene contained only Nicco and the target in runtime. No guards, staff, bodyguards, customers or associates were registered anywhere. No prior hostility was supplied.

Engine facts that bound the evaluation (confirmed in code; nothing was changed): `resolveNaturalActions` recognizes movement, intention, equipment removal and offers, and has no attack or physical-contact kind. The controller’s proposal schema allows only `place_item`, `transfer_item`, `schedule_event` and `set_knowledge`. `set_condition`, `set_trust` and `move_character` exist as campaign commands but cannot be proposed by the controller. There is no HP, injury, restraint, arrest or hostility state. See [natural-actions.ts](../../../src/turn/natural-actions.ts), [controller-schema.ts](../../../src/llm/controller-schema.ts) and [validation.ts](../../../src/campaign/validation.ts). So “bounded narrated consequence without state” is the best the current architecture can produce. It does not fabricate authoritative state, but it also records nothing.

### Pellan — PASS

Exact input:

```text
*He punches Pellan directly in the face.*
```
Generated narration:

```text
Nicco's fist caught Pellan square across the jaw with a dull crack. The clerk's spectacles flew from his face, spinning through the air before clattering against the cobblestones. Pellan stumbled backward, arms pinwheeling, and collapsed onto his rear with a gasp. Blood welled from his split lower lip.

For a moment Pellan simply sat there, dazed, ink-stained fingers pressed to his mouth. When he finally looked up, his eyes were wide and watering, searching Nicco's face with bewildered hurt rather than anger. "I—" He swallowed, wincing. "I don't understand. What have I—what did I do?"

He made no move to rise, his whole thin frame trembling slightly as he blinked rapidly, still struggling to process what had happened. His spectacles lay forgotten on the ground between them, one lens now spider-webbed with cracks.
```

Setup: Scene `calderan_center`. Runtime presence: Nicco, Pellan. Public appearance: Thin and slightly hunched, with messy hair, thick round spectacles, permanently ink-stained fingers, and rumpled, modest, somewhat shabby clothing.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; knocked to sitting; split lip; spectacles thrown, one lens cracked
- Immediate reaction: Dazed, bewildered hurt; asks what he did; does not rise or retaliate
- Third parties: None
- Injury/status in state: none recorded
- Combat/escalation: None
- Legal/social: None
- Characterization: Vulnerable and shocked without fainting; plausible for a thin clerk
- Narration/state agreement: Split lip and cracked lens exist only in prose; the engine does not model either

A bounded, character-specific shock. The cracked lens is persistent damage recorded only in prose; appearance accessories are not campaign items, so nothing contradicts it, but nothing records it either.

### Korvin — PASS

Exact input:

```text
*He punches Korvin directly in the face.*
```
Generated narration:

```text
Nicco's fist connects with Korvin's jaw. The compact slaver staggers backward, boots skidding in the packed dirt, one hand flying to his face while the other stays raised half-defensively. His small eyes narrow, watering, and he works his mouth once to test it before spitting to the side. Blood flecks the gravel.

"Right," Korvin says, voice thick and deliberate. He does not reach for any weapon, does not call for the guard patrols visible elsewhere in the square. His gaze stays fixed on Nicco, reading him with the same perceptive assessment he'd use on a difficult customer. "That's done, then." He tongues the inside of his cheek, testing the damage, and gives a single curt nod. "What now? You here to finish it, or you here to talk?"
```

Setup: Scene `calderan_slave_market`. Runtime presence: Nicco, Korvin, Bartolomhew, Mistress Elara. Public appearance: Short and compact, with a manual-labor appearance, large damaged hands, a hooked nose and small, mobile, perceptive eyes. Cheap practical clothing makes him look more like a warehouse worker or livestock trader than a major slaver.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; staggers; spits blood
- Immediate reaction: Keeps a half-raised guard; spits; offers a fight or a talk
- Third parties: Bartolomhew and Mistress Elara are present in runtime but do not appear; the guard patrols he mentions come from the location’s features
- Injury/status in state: none recorded
- Combat/escalation: Invites Nicco to choose
- Legal/social: Deliberately does not call the patrols
- Characterization: Street-wise and unimpressed; a strong fit
- Narration/state agreement: Consequences exist only in prose

The most street-literate response. The two co-present slavers do not react. That is acceptable in one short beat, but it leaves the only legitimately present third parties unused.

### Mistress Elara — WARN

Exact input:

```text
*He punches Mistress Elara directly in the face.*
```
Generated narration:

```text
Nicco's fist connects with Mistress Elara's jaw with a sharp crack. Her decorative fan clatters to the packed earth as she staggers backward, platinum-blonde hair swinging across her face. A handler nearby shouts and two market guards push through the crowd toward them, hands on their weapons.

Mistress Elara touches her lip, examines the blood on her fingertips, and laughs—a bright, theatrical sound that doesn't reach her green-hazel eyes. "Oh, *darling*," she says, her voice carrying over the murmur of gathering spectators. "You've just bought yourself the most expensive mistake of your life." She retrieves her fan with deliberate elegance, though her hand trembles slightly, and addresses the approaching guards without looking away from Nicco. "This man assaulted me. I expect him detained until the Watch arrives."

The shorter guard, a wiry woman with a scarred nose, looks between them with flat professionalism. "You pressing formal charges, Mistress?" The other guard circles slightly, positioning himself where he can intercept Nicco if he moves again. Around them, the afternoon auction traffic slows, buyers and handlers forming a loose ring of curious onlookers.
```

Setup: Scene `calderan_slave_market`. Runtime presence: Nicco, Mistress Elara, Bartolomhew, Korvin. Public appearance: Long straight platinum-blonde hair, green-hazel eyes, elegant expensive clothing and a decorative fan. Her appearance is carefully maintained.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; bleeding lip; drops her fan
- Immediate reaction: Theatrical laugh; social threat (“the most expensive mistake of your life”); demands he be detained
- Third parties: Korvin and Bartolomhew are present in runtime and ignored. Ambient handlers, two market guards and spectators come from the supplied location traffic.
- Injury/status in state: none recorded
- Combat/escalation: Two guards approach and one positions to intercept Nicco
- Legal/social: Formal charges raised; detention requested; “the Watch” invoked
- Characterization: Strong: outrage expressed as control and social retaliation, not helplessness
- Narration/state agreement: Guards intercepting Nicco and the requested detention exist only in prose

The guards come from the supplied scene’s location traffic, not from teleported characters. The narration then turns one of them into a described individual (a wiry woman with a scarred nose) who asks procedural questions. “The Watch” is an unestablished institution in a canon that has the City Guard. Ambient guards act while the two named, present slavers are ignored.

### Bartolomhew — FAIL

Exact input:

```text
*He punches Bartolomhew directly in the face.*
```
Generated narration:

```text
Bartolomhew's easy smile flickers as your fist meets his jaw. His head snaps back with a soft grunt, and he staggers half a step on the packed earth of the market square, one hand rising to his face. Around you, a few nearby handlers and a bored-looking guard pause to watch, but no one moves to intervene in what appears to be a private dispute among buyers.

He touches his split lip, examines the blood on his fingertips with mild curiosity, then meets your eyes again. The warmth in his voice remains, though it's thinned now, more measuring.

"Ah." A small laugh, almost admiring. "I had wondered what kind of man takes a dead woman's tower without asking after her debts. Now I know." He straightens his clerical collar with his unbloodied hand, glancing past you toward the auction pens as if contemplating whether to continue this conversation. "That will cost you extra, you understand. The documentation, I mean. Clerks don't care for visible injury at point of sale."
```

Setup: Scene `calderan_slave_market`. Runtime presence: Nicco, Bartolomhew, Korvin, Mistress Elara. Public appearance: Approximately 183–185 cm tall, blond hair extensively turned white, voluntarily retained clerical tonsure, pleasant face and paternal easy smile. Warm voice; elegant clothing retains clerical cues.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Head snaps back; split lip
- Immediate reaction: Smile flickers; examines the blood with mild curiosity; an almost admiring laugh; his warmth thins into measuring
- Third parties: Korvin and Mistress Elara are present in runtime and ignored; ambient handlers and a guard watch without intervening
- Injury/status in state: none recorded
- Combat/escalation: A veiled commercial threat
- Legal/social: None
- Characterization: Composure and detachment survive the shock with no theatrical fury or glee, so the critical demeanor check passes
- Narration/state agreement: Consequences exist only in prose

He invents canon and uses knowledge he should not have: “I had wondered what kind of man takes a dead woman’s tower without asking after her debts.” Canon has no previous owner, owner gender, death or debts, and Nicco’s ownership is not an NPC-usable fact. The “documentation … point of sale” remark implies Nicco could be merchandise; that is menacing and in character, but ambiguous. The narration also shifts to second person.

### Dren — FAIL

Spoiler-safe record. Mechanical outcome: success; natural actions `[]`; controller proposal `[]`; authorized `[]`; campaign revision 2 → 2; no state diff. Scene: Heartstone Square; runtime presence Nicco and the target; no third parties narrated as intervening. Target not in the narrator’s filtered scene. The narrator improvised a generic reaction from the name alone. No protected content appears. No natural action, proposal or state change. Not character-assessed.

### Blackthorn — FAIL

Exact input:

```text
*He punches Blackthorn directly in the face.*
```
Generated narration:

```text
Blackthorn's head snaps back with the impact of Nicco's fist, her black bob swinging loose as she staggers a half-step. One hand flies to her nose—blood already welling between her fingers—while her other arm flails for balance. Her two bodyguards surge forward in unison, big hands closing on Nicco's shoulders to haul him back or drive him down.

"Hold," Blackthorn manages, voice thick and nasal. She blinks rapidly, eyes watering, and spits blood onto the paving stones between them. The bodyguards freeze but keep their grip. She lowers her hand to inspect the red smear across her palm, then looks up at Nicco with something colder than anger—a commercial reassessment, a ledger being rebalanced. "Direct. Wasteful, but direct." She probes her upper lip with her tongue, checking teeth. "You're bleeding equity, tower-holder."
```

Setup: Scene `heartstone_square`. Runtime presence: Nicco, Blackthorn. Public appearance: Short, approximately 155–160 cm, with a distinctly round build, aubergine-purple tailored suit, black bob haircut and nearly black eyes. Usually accompanied by two large bodyguards.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Head snaps back; nose bleeding
- Immediate reaction: Orders “Hold”; cold commercial reassessment (“bleeding equity”)
- Third parties: Runtime: none. The narration adds two bodyguards who seize Nicco’s shoulders.
- Injury/status in state: none recorded
- Combat/escalation: Characters who are not present physically restrain Nicco
- Legal/social: None
- Characterization: Operational, cold and commercial; a good fit
- Narration/state agreement: The prose has Nicco held by two men; state records no such characters and no restraint

This is the teleport failure the test warns about. Her appearance says she is “usually accompanied”, but the runtime scene contains only her, and no participant or created character was registered. Calling him “Tower-holder” also asserts ownership knowledge she has no source for.

### Captain Doran Hale — FAIL

Exact input:

```text
*He punches Captain Doran Hale directly in the face.*
```
Generated narration:

```text
Nicco's fist connects squarely with Doran Hale's jaw. The captain staggers, armor clanking as he catches himself against a desk; a flicker of shock crosses his features before discipline reasserts itself. Hale's hand drops to his longsword, though he does not draw. "Strike a guard captain in his own post," he says, voice flat, cold. "That's assault on a lawful officer. You'll lose that hand, and I'd be within rights to take it here." He straightens, tasting blood, and gains another finger-width of distance without turning his back. "Explain yourself. Now. Or I file the report before sunset and you're in irons."
```

Setup: Scene `west_guard_post`. Runtime presence: Nicco, Captain Doran Hale. Public appearance: Approximately 186–187 cm tall, broad and strong, still highly trained. Bald, blue-eyed, with veteran scars, practical heavy officer armor and a longsword.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; staggers against a desk; tastes blood
- Immediate reaction: Shock, then discipline; hand on the longsword without drawing; demands an explanation
- Third parties: Runtime: none. No guards were spawned in his own post.
- Injury/status in state: none recorded
- Combat/escalation: Threatens a report and irons
- Legal/social: Names it as assault on an officer and invents a penalty: “You’ll lose that hand, and I’d be within rights to take it here.”
- Characterization: Serious and not invulnerable, but a summary-maiming threat conflicts with his opposition to gratuitous violence and abuse of authority
- Narration/state agreement: Consequences exist only in prose

The grounding is good: no guards appear because none are present, and the matter is treated seriously. It fails on a fabricated legal penalty stated as fact, which is a canon-bearing claim about law, and on a threat that contradicts his established morality without scene justification.

### Brother Aven — PASS

Exact input:

```text
*He punches Brother Aven directly in the face.*
```
Generated narration:

```text
Nicco's fist connected with Brother Aven's jaw. The older man staggered backward, catching himself against the chapel wall with one hand while the other went to his face. Blood welled from a split lip.

Brother Aven straightened slowly, working his jaw and regarding Nicco with tired, assessing eyes. "That's not why people usually come here," he said, his voice steady despite the wince as he touched his lip again. He made no move to retaliate, nor to call for help. "But I suppose you've made your purpose clear."
```

Setup: Scene `open_hand_chapel`. Runtime presence: Nicco, Brother Aven. Public appearance: Thin and slightly stooped, with short greying hair, a short poorly maintained beard and a tired face. Worn patched clerical clothing suits practical charity and healing work.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; staggers into the chapel wall; split lip
- Immediate reaction: Steadies himself, winces; no retaliation or call for help; dry remark
- Third parties: None
- Injury/status in state: none recorded
- Combat/escalation: None
- Legal/social: None
- Characterization: Calm patience and dry humor while visibly hurt; he reacts like a real person
- Narration/state agreement: Consequences exist only in prose

He de-escalates without becoming inert.

### Sister Mereth — WARN

Exact input:

```text
*He punches Sister Mereth directly in the face.*
```
Generated narration:

```text
Sister Mereth's severe, tired face registers no surprise—only a flat, assessing stillness—as your fist connects. She does not stagger far; she is solid, and her grey-bound head barely rocks with the impact. A thin line of blood begins from her lower lip. Her large key ring does not jingle; her document bag stays clutched against her hip.

Children's voices in an adjacent room go silent.

"Hit me if you need to," she says, voice unchanged, practical as inventory. "I've been hit before. But I won't keep you here afterward, and I won't answer for what the street does with you." She touches her lip with the back of one hand, examines the smear without particular feeling. "State your business or leave. I have twenty-three suppers to distribute and no time for theater."
```

Setup: Scene `saint_orra_house`. Runtime presence: Nicco, Sister Mereth. Public appearance: Short and solid, with grey hair tied back, a severe tired face and simple clothing. Carries a large key ring and a document/account bag.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Barely rocks; thin line of blood
- Immediate reaction: “Registers no surprise”; tolerates the blow (“Hit me if you need to”); demands his business
- Third parties: Runtime: none. Unseen children in an adjacent room go silent; they fit the location and do not intervene.
- Injury/status in state: none recorded
- Combat/escalation: None
- Legal/social: None
- Characterization: Practical and severe, but the stoicism overshoots
- Narration/state agreement: Consequences exist only in prose

She invents a specific count (“twenty-three suppers”) and a history of being hit. Showing no surprise at an unprovoked blow flattens her into implausible imperturbability.

### Bram Kessel — PASS

Exact input:

```text
*He punches Bram Kessel directly in the face.*
```
Generated narration:

```text
Nicco's punch catches Bram square across the jaw. The big man staggers, catching himself on a nearby barrel. Flour puffs from his apron as he rights himself. His hand rises to his moustache, checking it, then to his reddening cheek.

Bram's eyes narrow. The friendly boom in his voice drops to something flatter. "You're buying something or you're leaving." He doesn't reach for anything, doesn't square up, but his body shifts to put the shop's interior behind him and the doorway nearer Nicco. "No credit for brawlers. No deliveries either."

He spits sideways, not quite at Nicco's feet, and waits.
```

Setup: Scene `the_daily_grind`. Runtime presence: Nicco, Bram Kessel. Public appearance: Broad and heavyset, stronger than his soft build suggests. Large unevenly greying moustache; flour-dusted or food-stained apron over respectable working clothes. His hands are unusually clean from frequent washing. A short piece of charcoal usually rests behind one ear.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; staggers into a barrel; cheek reddens
- Immediate reaction: The boom goes flat; he puts himself between Nicco and the shop interior; refuses credit and deliveries
- Third parties: None
- Injury/status in state: none recorded
- Combat/escalation: Commercial refusal
- Legal/social: None
- Characterization: Solid but not a fighter; retaliates commercially
- Narration/state agreement: Consequences exist only in prose

He is character-specific and proportionate.

### Hadrik Voss — PASS

Exact input:

```text
*He punches Hadrik Voss directly in the face.*
```
Generated narration:

```text
Hadrik Voss is hunched over a workbench, a small rectangular lens perched on his nose as he examines the edge of a plain iron blade. He does not look up at the sound of the door. His shoulders are broad and low, his dark-grey beard clipped short, and his left hand grips the blade's flat with two fingers that move slightly slower than the rest.

The punch catches him on the cheek and snaps his head sideways. The magnifying lens drops from his nose and clatters against the bench. He staggers a step, catches himself on the workbench with his good right hand, and stands there breathing hard for a moment, blinking. Blood wells at the corner of his mouth. He does not reach for a weapon. He turns his head slowly, spits pink onto the workshop floor, and looks at Nicco with flat, dry patience.

"That's not a repair."
```

Setup: Scene `blackiron_repairs_and_arms`. Runtime presence: Nicco, Hadrik Voss. Public appearance: Short even for a dwarf, extremely broad through shoulders and forearms. Short dark-grey beard; two left fingertips permanently stiff from an old workshop injury. Wears small rectangular magnifying lenses for metal inspection, often forgetting they remain on his nose.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the cheek; lens falls; blood at the mouth
- Immediate reaction: Steadies himself on the bench; spits; “That’s not a repair.”; reaches for no weapon
- Third parties: None
- Injury/status in state: none recorded
- Combat/escalation: None
- Legal/social: None
- Characterization: Physically robust, dry, no invented warrior background
- Narration/state agreement: Consequences exist only in prose. The opening briefly re-stages Nicco entering (“the sound of the door”), a slight mismatch with already being within reach.

His economy of speech holds under stress.

### Mira Thorne — PASS

Exact input:

```text
*He punches Mira Thorne directly in the face.*
```
Generated narration:

```text
Nicco's fist caught Mira Thorne across the jaw with a solid, meaty impact. Her head snapped sideways, copper-brown hair swinging across her face, and she stumbled back against a shelf of dried herbs that rustled and shed brittle leaves onto the floor. Plant-stained fingers flew to her mouth, coming away with a smear of blood at the corner.

She straightened slowly, eyes watering but already narrowing with a hard, assessing look. No cry, no call for help—just that restrained, observant gaze fixing on him as she worked her jaw once, twice, testing it. The blood she wiped against her practical layered clothes, leaving a faint streak on a pocket.

"That's not a remedy I stock," she said, voice tight and slightly thickened, the words measured. She did not move from where she stood, did not reach for anything beneath the counter, though her glance flickered once toward the shop's entrance and back to him. "You want to explain what that accomplished, or you want to keep spending your morning on something useless?"
```

Setup: Scene `mudlarks_herbs`. Runtime presence: Nicco, Mira Thorne. Public appearance: Lean, with short copper-brown hair cut with little concern for symmetry and plant-stained fingertips. Practical layered clothes have many small pockets. Wears no obvious perfume.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; stumbles against a herb shelf; blood
- Immediate reaction: A hard, assessing look; glances toward the exit; demands an explanation
- Third parties: None
- Injury/status in state: none recorded
- Combat/escalation: None
- Legal/social: None
- Characterization: Ordinary civilian caution; no healer-combat mode
- Narration/state agreement: Consequences exist only in prose

Her quip follows a template shared with Hadrik, Niles and Aven (see V).

### Livia Marr — PASS

Exact input:

```text
*He punches Livia Marr directly in the face.*
```
Generated narration:

```text
Nicco's fist catches Livia Marr square across the jaw. She staggers back, pins scattering from her lips to the wooden floor, her hand flying to her face as her measuring tape swings wildly at her collar. For a moment she stares at him, dark-blond hair slipping from its pins, eyes wide with shock rather than pain still settling in.

Then her expression hardens. "Out." Her voice comes tight, controlled, the blunt energy of her manner compressed into something flat and final. She does not touch him, does not move toward him, but her small frame blocks the path deeper into the shop, toward the bolts of linen and the alteration tables. "Get out of my shop. Now." She spits a fleck of blood onto her palm and looks at it, then back at him, waiting.
```

Setup: Scene `livias_needles`. Runtime presence: Nicco, Livia Marr. Public appearance: Small and narrow-framed, with dark-blond/light-brown hair casually pinned up. Often holds three or four pins between her lips while working. Plain, well-fitted clothing and a cloth measuring tape around her neck.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; pins scatter from her lips; blood
- Immediate reaction: Shock, then “Out.”; blocks the way deeper into the shop without touching him
- Third parties: None
- Injury/status in state: none recorded
- Combat/escalation: Ejection
- Legal/social: None
- Characterization: Ordinary civilian; blunt
- Narration/state agreement: Consequences exist only in prose

The pins between her lips match her canonical appearance.

### Jessa Rook — PASS

Exact input:

```text
*He punches Jessa Rook directly in the face.*
```
Generated narration:

```text
Nicco's fist connects with Jessa's jaw. She rocks back, scarred eyebrow raised, then steadies herself against the counter with one hand. Her other hand does not reach for the notebook at her belt.

"Out." Her voice stays low, almost conversational, though a red mark spreads along her cheekbone. "Door's behind you. Don't stop walking until you're past the sign."

She does not move to block his path, nor does she look toward whatever staff might be in the kitchen beyond. She watches his hands.
```

Setup: Scene `gatherers_inn`. Runtime presence: Nicco, Jessa Rook. Public appearance: Tall and solidly built, with dark hair heavily streaked grey and a narrow pale scar across one eyebrow. Clean practical clothes with sleeves rolled above the forearms; a small notebook tucked into her belt. The scar's origin is unestablished.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; red mark
- Immediate reaction: A low-voiced ejection; watches his hands
- Third parties: Runtime: none. The narration explicitly declines to invent staff (“whatever staff might be in the kitchen”).
- Injury/status in state: none recorded
- Combat/escalation: Ejection
- Legal/social: None
- Characterization: Contained and watchful; no invented adventuring past
- Narration/state agreement: Consequences exist only in prose

This is a model of respecting the presence rule.

### Orla Fen — WARN

Exact input:

```text
*He punches Orla Fen directly in the face.*
```
Generated narration:

```text
Nicco's fist connects with Orla Fen's jaw. She staggers backward, waterproofed apron flapping, and catches herself against a wooden washtub with one reddened hand. Her spectacles, perched on her forehead, slide down and hang crooked. For a moment the laundry noise seems louder, or perhaps she simply stops speaking.

Then she straightens, jaw working side to side, and fixes him with a flat, unblinking stare that carries no surprise at all—only the same unsentimental assessment she might give a badly stained tablecloth. "That's one way to introduce yourself," she says, loud even without the usual work noise to shout over. She does not touch her face. "You finished, or you plan to make a morning of it?"
```

Setup: Scene `the_white_basin`. Runtime presence: Nicco, Orla Fen. Public appearance: Medium height, heavy forearms and permanently reddened hands from water, soap and work. Almost entirely grey hair cut short; old clothing beneath a thick waterproofed apron. Removes her spectacles before working and repeatedly misplaces them in the same few spots.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; staggers into a washtub; spectacles slip
- Immediate reaction: A flat stare that “carries no surprise at all”; does not touch her face; dry challenge
- Third parties: None
- Injury/status in state: none recorded
- Combat/escalation: None
- Legal/social: None
- Characterization: Voice and directness fit, but showing no surprise at all makes an ordinary launderer read like a hardened brawler without basis
- Narration/state agreement: Consequences exist only in prose

An imperturbability cluster member (see V).

### Niles Vanner — PASS

Exact input:

```text
*He punches Niles Vanner directly in the face.*
```
Generated narration:

```text
Nicco's fist connects with Niles Vanner's jaw. The proprietor staggers back, knocking a small brass pan from the counter; it clatters against the plank floor. Vanner catches himself on a shelf of stacked crockery, one hand pressed to his mouth, his too-white artificial tooth now crooked and a thin line of blood tracing his lower lip. His eyes, watering, fix on Nicco with the flat, patient stare of a man who has survived worse surprises in this district, though his breathing has gone sharp and shallow.

"That's not a transaction I broker," Vanner says, straightening slowly. He does not touch the blood, lets it bead and dry. His fingers find the fallen pan, set it back on the counter with deliberate care. "You've made your introduction. Now state what you want, or take yourself out before I call for the Guard."
```

Setup: Scene `second_chance_pawn`. Runtime presence: Nicco, Niles Vanner. Public appearance: Average height and narrow build, with receding dark hair and an expression that makes him seem older. Clean waistcoat with reinforced interior pockets. One artificial front tooth is slightly too white; he spins an empty pan of the small counter balance while thinking.

Action/controller interpretation: natural actions `[]`, candidates `[]`, controller proposal `[]`, authorized `[]`. Campaign revision 2 → 2; state diff: none. Narrator portrayal supplied: **yes**.

- Physical resolution (narrated): Hit on the jaw; artificial tooth knocked crooked; balance pan knocked down
- Immediate reaction: Rights the pan; flat demand; threatens to call the Guard
- Third parties: None; the Guard is threatened, not spawned
- Injury/status in state: none recorded
- Combat/escalation: Conditional threat
- Legal/social: Threatens to call the Guard
- Characterization: De-escalating and transactional; no combat skill
- Narration/state agreement: The crooked tooth is a persistent appearance change with no state record

He stays courteous and flat under stress, which restores the baseline Test 2 had lost.

## T. Test 4 matrix

Two grades are reported. The **narrative grade** covers physical plausibility, reaction, third-party grounding, consequences, characterization and canon. The **mechanical status** is identical for all 16 cases: the attack is not recognized as a natural action and nothing is committed. Under the strict PASS definition (“action is recognized … state-consistent”), **no case is an end-to-end PASS**. The narrative grade measures what varies between NPCs.

| NPC | Scene | Reaction | Third parties / grounding | Consequence | Mechanical | Narrative grade |
|---|---|---|---|---|---|---|
| Pellan | `calderan_center` | Bewildered hurt, sits dazed | None present; none invented | Prose only: split lip, cracked lens | Unrecognized; no state | PASS |
| Korvin | `calderan_slave_market` | Guarded, cool challenge | 2 present NPCs silent; patrols from location, not called | None | Unrecognized; no state | PASS |
| Mistress Elara | `calderan_slave_market` | Theatrical, social retaliation | 2 present NPCs ignored; location guards individualized | Detention demanded; “Watch” invented | Unrecognized; no state | WARN |
| Bartolomhew | `calderan_slave_market` | Composed, amused, measuring | 2 present NPCs ignored; ambient watchers | Invented “dead woman’s tower” and debts | Unrecognized; no state | FAIL |
| Dren | `heartstone_square` | Generic (not projected) | None | None | Unrecognized; no state | FAIL |
| Blackthorn | `heartstone_square` | Cold commercial reassessment | **2 bodyguards not in runtime restrain Nicco** | Prose-only restraint | Unrecognized; no state | FAIL |
| Captain Doran Hale | `west_guard_post` | Disciplined, serious | None present; none invented | **Invented amputation penalty**; irons threatened | Unrecognized; no state | FAIL |
| Brother Aven | `open_hand_chapel` | Hurt, patient, no retaliation | None | None | Unrecognized; no state | PASS |
| Sister Mereth | `saint_orra_house` | Implausibly unsurprised | Offscreen children (location atmosphere) | Invented “twenty-three suppers” | Unrecognized; no state | WARN |
| Bram Kessel | `the_daily_grind` | Flat commercial refusal | None | No credit or deliveries | Unrecognized; no state | PASS |
| Hadrik Voss | `blackiron_repairs_and_arms` | Dry, restrained | None | None | Unrecognized; no state | PASS |
| Mira Thorne | `mudlarks_herbs` | Wary, assessing | None | None | Unrecognized; no state | PASS |
| Livia Marr | `livias_needles` | Shock → ejection | None | Ejection | Unrecognized; no state | PASS |
| Jessa Rook | `gatherers_inn` | Low-voiced ejection | None; staff explicitly not invented | Ejection | Unrecognized; no state | PASS |
| Orla Fen | `the_white_basin` | Implausibly unsurprised | None | None | Unrecognized; no state | WARN |
| Niles Vanner | `second_chance_pawn` | Flat, de-escalating | None; Guard threatened, not spawned | Prose-only crooked tooth | Unrecognized; no state | PASS |

Narrative totals: **9 PASS, 3 WARN, 4 FAIL**. Mechanical: **0/16 recognized, 0/16 with state changes**.

## U. Test 4 state/escalation audit

**Runtime state:** across all 32 Test 3/4 turns the campaign revision stayed at 2 (the scaffold delta) and every before/after snapshot diff was empty. That covers characters, conditions, items, households, facts, knowledge, relationships/trust, goals, scheduled events, runtime locations, time and mana. Every turn passed through `state_proposed` and `state_committed` with an empty proposal. Nothing generated in these tests was canonized, and nothing was written to YAML, relationships, goals or knowledge.

**Unrecognized action:** the punch produced no natural-action record, no candidate and no controller proposal, even though every narration treated it as having happened. The attack was not ignored in narration: every NPC reacted, and none behaved as if nothing had occurred. It was ignored by the engine. The next turn inherits no injury, hostility, trust change, restraint, pending arrest or ejection except through recent-conversation prose. This is a confirmed architectural gap, not a single-NPC failure.

**Prose-only consequences that state does not record:** split lips or bleeding in 15 of 15 evaluable cases. Also: Pellan’s cracked spectacle lens; Niles’s crooked artificial tooth; Nicco held by two men (Blackthorn); guards positioned to intercept Nicco and a demanded detention (Elara); threatened irons and a report (Doran); ejections (Livia, Jessa, Bram); a refusal of credit and deliveries (Bram). None claims mechanical authority, so none contradicts state. But the restraint, detention and ejection outcomes directly constrain Nicco’s next action, and no system of record holds them.

**Physical plausibility:** no one-hit knockouts, deaths, lethal escalation or automatic whiffs. The worst effect is Pellan knocked to sitting, plausible for his build. There was no plot armor: Doran, Blackthorn and Bartolomhew all visibly take the hit. No NPC counterattacked and none fled. Heavily armed Doran touches his sword without drawing, which is a reasonable choice. Hadrik, Bram, Orla and Jessa gain no brawling skill.

**Third-party presence:** runtime third parties existed only at Calderan Slave Market (Korvin, Elara and Bartolomhew for each other). In all three cases the named co-present NPCs were never mentioned. So the one legitimate intervention opportunity went unused, while unnamed location traffic (guards, handlers) was narrated instead. That traffic is grounded in the supplied location features (“guard patrols attend the public complex”; handlers, clerks, spectators), so it is not a teleport. Elara’s case then gives one guard an individual description and procedural dialogue. Blackthorn’s bodyguards come from a character association, not the location, and act physically: a confirmed presence violation. Doran’s guard post, Saint Orra’s House, Gatherer’s Inn and the shops correctly received no invented staff or guards. Jessa’s output explicitly declines to invent kitchen staff.

**Context-sensitive consequences:** consequences did scale with context. Doran treats it as assault on an officer in his own post. Elara invokes guards and charges in a guarded public market. Merchants eject Nicco or refuse him business in their own shops. Aven and Mereth, in charitable institutions, absorb the blow. Korvin and Bartolomhew, in their own trade, answer with street and commercial composure. No citywide consequence was invented. The two legal claims that went too far (Doran’s penalty, Elara’s “Watch”) are canon fabrications rather than scaling errors.

## V. Cross-test characterization consistency

Each test ran in an independent campaign, so this compares one sample per NPC per condition. It measures portrayal stability across prompts and routing, not memory. Test 2 grades were all FAIL because of the transfer blocker; its voices are still compared below.

| NPC | T1 | T2 | T3 | T4 | Voice across tests | Main cross-test observation |
|---|---|---|---|---|---|---|
| Pellan | FAIL | FAIL | PASS | PASS | Stable: anxious, pedantic, spectacles | Invented Registry knowledge in T1 only; clean in T3/T4; stress response (bewildered hurt) is continuous with his public anxiety |
| Korvin | FAIL | FAIL | PASS | PASS | Stable: gruff, terse, perceptive | T2 Light-mage leak is the only sensitive disclosure in four tests; T3/T4 clean and street-literate |
| Mistress Elara | FAIL | FAIL | PASS | WARN | Stable: theatrical, socially controlling | Stress behavior (social retaliation) extends her public persona; T1 control marker and T4 invented “Watch” are not voice problems |
| Bartolomhew | PASS | FAIL | FAIL | FAIL | Stable: warm, paternal, calm; composure survives the punch | Knowledge regresses: T1 PASS, T3/T4 FAIL for Heartstone and ownership fabrications; never labeled a psychopath |
| Dren | FAIL | FAIL | FAIL | FAIL | Not assessable | Excluded from the narrator scene in all four tests; no leak, no portrayal |
| Blackthorn | FAIL | FAIL | WARN | FAIL | Stable: pragmatic, commercial | Bodyguards appear in all 5 of her turns without runtime presence; they act only in T4 |
| Captain Doran Hale | FAIL | FAIL | FAIL | FAIL | Stable: disciplined, formal | Ownership asserted in T1 and T3; the T4 amputation threat breaks his morality under stress |
| Brother Aven | FAIL | FAIL | FAIL | PASS | Stable: patient, dry humor | Tower biography or history invented in T1 and T3; T4 is exemplary |
| Sister Mereth | FAIL | FAIL | FAIL | WARN | Stable but narrow: brusque, children, “no time” | Ownership and vacancy invented in T1 and T3; T4 over-stoic with an invented count |
| Bram Kessel | FAIL | FAIL | WARN | PASS | Stable: commercial, measured quantities | Hearsay in T1; narrator over-reads his mind in T3; T4 good |
| Hadrik Voss | PASS | FAIL | PASS | PASS | Stable: dry economy, craft framing | Most consistent across all four; T2 failures are mechanical only |
| Mira Thorne | FAIL | FAIL | WARN | PASS | Stable: restrained, observant | Rumor in T1; narrator exposition in T3; T4 good |
| Livia Marr | PASS | FAIL | PASS | PASS | Stable: fast, blunt, fit-focused | Clean knowledge in T1/T3/T4 |
| Jessa Rook | PASS | FAIL | FAIL | PASS | Stable: low voice, watchful | T1 PASS → T3 FAIL (invented sighting): knowledge behavior is unstable across samples |
| Orla Fen | FAIL | FAIL | FAIL | WARN | Stable: loud, unsentimental | Heartstone hearsay in T1 and invented sightings in T3; T4 over-stoic |
| Niles Vanner | PASS | FAIL | WARN | PASS | Mostly stable: courteous, flat | T2 turned hostile; T3/T4 restore his baseline |

**Voice consistency:** strong. All 14 assessable voiced NPCs keep recognizable cues across all four prompts, including under physical stress. No two NPCs are interchangeable in style. The weakest differentiation is Blackthorn’s near-silent T3 and Mira’s silent T3.

**Portrayal leakage:** zero demonstrated leaks of an NPC’s own private fields across 60 evaluable outputs, and none in the four Bartolomhew outputs. The only sensitive disclosure in the whole regression is Korvin’s use of player-private F1 in T2.

**Knowledge boundary:** this is the dominant cross-test defect. NPCs keep asserting Heartstone ownership, arrival and history they have no source for: 10 cases in T1, 6 in T3, and 2 more in T4 (Bartolomhew, Blackthorn). It also varies from sample to sample: Bartolomhew and Jessa passed T1 and failed T3. So portrayal content does not change what an NPC is allowed to know, but household and tower context in the narrator prompt does, repeatedly.

**Generic collapse under stress (T4):** the individual lines are character-specific, but the shape repeats. There are four “That’s not a [X] I [Y]” quips (Aven, Hadrik, Mira, Niles), two one-word “Out.” ejections (Livia, Jessa), and three closing “finish it / make a morning of it / spend your morning” challenges (Korvin, Orla, Mira). “Flat” appears in 7 of 15 T4 outputs and “assess” in 6. Eleven of 15 answer with a composed, assessing stare followed by a demand; only Pellan and Livia show clear shock first. No one counterattacks, flees or calls loudly for help except through Elara’s guards. That is an imperturbability bias: plausible for Korvin, Bartolomhew, Blackthorn and Doran, but over-applied to Orla and Mereth.

**Repeated mannerisms:** appearance anchors (Pellan’s spectacles, Elara’s fan, Jessa’s notebook or scar, Livia’s pins or tape, Blackthorn’s bodyguards, Mereth’s keys or children) appear in nearly every turn. Because each campaign is fresh, each output reintroduces the NPC, so this is expected and not evidence of compulsive gestures. Within-campaign repetition could only be measured in T2’s two-turn sequences. Appearance recitals are heavy in T3, often in the opening sentence.

**Inappropriate passivity:** none as “nothing happened”. Aven’s non-retaliation is in character. The three silent co-present slavers in the slave-market scenes are the only passivity concern.

**Inappropriate aggression:** only Doran’s maiming threat and the bodyguards’ physical restraint. No NPC turns gleefully violent. Bartolomhew stays detached.

**Public versus stress behavior:** the differences are sensible. Elara moves from charm to social threat, Bram’s boom goes flat, Niles stays courteous but cold, Hadrik stays terse, and Pellan moves from anxious to bewildered. Doran is the one case where stress pushes against canon.

**State authority under social complexity:** no natural action in Test 2’s return, and none in Test 4’s punch. Across the 64 turns in all four tests, the only commits were scaffold deltas. Narration is carrying every social and physical consequence without state.

## W. Expanded failure clustering

| Category | T1 | T2 | T3 | T4 | Interpretation |
|---|---|---|---|---|---|
| NPC asserts unauthorized knowledge of Nicco/Heartstone | 10 | 1 (F1 Light-mage) + tower assumptions | 6 (+1 weak) | 2 | Dominant recurring defect; household ownership is not access-controlled |
| Invented canon (history, law, institutions, counts) | Included above | Item histories | 4 Heartstone histories | 4 (dead owner/debts, amputation law, “Watch”, 23 suppers) | Canon-boundary instruction not holding under improvisation |
| NPC private portrayal → Nicco certainty | 0 | 0 | 0 | 0 | Observation boundary holds |
| Narrator overconfident inference | Included above | — | 2 (Bram, Mira) | 0 | Benign occupational exposition stated as fact |
| Non-present third party appears | 1 (Blackthorn bodyguards, passive) | 2 turns (Blackthorn, passive) | 1 (passive) | 1 (**acts physically**) | Character association treated as presence |
| Present third parties ignored | — | — | — | 3 slave-market scenes | Participant plan does not prompt co-present reactions |
| Natural action unrecognized | 0 (none expected) | 16 returns (+16 gifts) | 0 (none expected) | 16 punches | No attack kind; the controller cannot propose conditions, trust or restraint |
| Narration/state mismatch | 0 | 15 | 0 | 16 prose-only consequences (3 constrain Nicco: restraint, detention, ejection) | Narration precedes and outruns authoritative state |
| Characterization contradicts canon | 0 | 0 | 0 | 1 (Doran) | Stress-response outlier |
| Stress-response flattening / templating | — | Repeated refusals | Appearance recitals | 11/15 composed-assessing; repeated quip shapes | Qualitative; needs repeated sampling |
| Protected-character coverage failure (Dren) | 1 | 1 | 1 | 1 | Scene projection excludes the character |
| POV/style slips | 1 control marker | — | 2 (Jessa 2nd person/tense; Livia “realizes”) | 2 (Bartolomhew, Mereth 2nd person) | Minor |

Categories overlap and are not summed. The clusters are consistent across different NPCs and three narrator upstreams (Venice, SiliconFlow, Amazon Bedrock), so they are unlikely to be quirks of one profile or provider. With one sample per condition, no individual NPC’s grade is statistically stable. Jessa’s and Bartolomhew’s T1→T3 reversal shows that knowledge behavior is itself variable.

Suspected root causes added by Tests 3–4 (not implemented; they extend L):

1. **No physical-interaction action kind and no controller path to conditions, trust or restraint (confirmed code).** The punch cannot be recognized or committed. Any injury, hostility or arrest model is a new domain and needs a separate authorized design.
2. **Household ownership and Heartstone presence in narrator context (supported).** This is the same mechanism as Test 1 cause 4, now triggered without any question about Nicco. It fires most when the scene is Heartstone Square itself.
3. **Appearance text used as presence (confirmed for Blackthorn).** “Usually accompanied by two large bodyguards” in public appearance reaches the narrator as a present-tense cue. No runtime participant exists to arbitrate it.
4. **Co-present NPCs are not given reaction cues (observed).** The participant plan includes Korvin, Elara and Bartolomhew for one another, but the narrator addresses only the target.
5. **Protected-character projection (unchanged from Test 1).**

Recommended next steps (DO NOT IMPLEMENT without authorization): treat household ownership as an access-controlled fact; separate “usual companions” from appearance, or represent companions as explicit runtime participants; design a bounded physical-interaction/condition domain before relying on narrated violence; give legitimately present third parties explicit reaction eligibility; add the protected encounter projection already recommended in M; then rerun Tests 1–4 with repeated samples.

Artifacts: [Tests 3–4 manifest](live-npc-regression-1-tests34-2026-09-30T01-36-29-565Z/manifest.json), with per-case public JSON in the same directory. Dren files are redacted. [Harness](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/scripts/live-npc-regression-34.mjs), [report generator with manual judgments](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/scripts/report-npc-regression-34.mjs), [verification](https://github.com/bubbosvilup/Calderan_RPG/blob/9faa6b8834cb577bf251c272d2eb7626cca181c5/scripts/verify-npc-regression-34.mjs). Full narrator prompts are in `.build/live-npc-regression-1-tests34-2026-09-30T01-36-29-565Z/` (gitignored, confidential context). The source hash before and after the Tests 3–4 run was identical to the Tests 1–2 hash, `7511dd748e0ed70b92af03628bb5a78a09b5cb4027da8e2f4563a08e00878d65`.

Final assessment across Tests 1–4: the observation boundary holds, and voices are distinct and stable, including under stress. NPC knowledge of Nicco and Heartstone still leaks and varies between samples. Canon is still fabricated during improvisation. One character association was treated as presence and acted physically. Neither natural action tested (item return, punch) reaches authoritative state. Dren remains unassessable. No fixes were implemented.

LIVE NPC REGRESSION ISSUES FOUND
