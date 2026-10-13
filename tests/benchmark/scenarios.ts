import type { CampaignCommand } from "../../src/campaign/types.js";
import type { Scenario } from "./scenario.js";
import * as F from "../fixtures/person-offer-playthrough.js";

/**
 * The modern regression benchmark: small, independent scenarios over the CURRENT architecture (strict expected_revision, turn_key idempotency,
 * PendingConfirmation, PROVISIONAL / PERSISTENT / RETIRED lifecycle, explicit-Accept Actual Offer authority, optional side stores). Each one builds its
 * own rig; read the `expect` blocks as the invariant being protected. A `known_gap` scenario states the DESIRED behavior and is reported as a
 * KNOWN PRODUCT GAP while the product does not deliver it. See docs/evaluations/CONSOLIDATION_BLOCK8_MODERN_BENCHMARK.md.
 */

// ------------------------------------------------------------------------------------------------ shared fixture pieces
const create = (id: string, name: string, sex: "female" | "male" = "female", location = "test_room"): CampaignCommand =>
  ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, sex, age: { kind: "exact", years: 24 } }, current: { current_location: location, status: "active" } } });
const hold = (id: string): CampaignCommand => ({ kind: "set_legal_status", character_id: id, status: "enslaved", holder_id: "nicco" });
const household = (...ids: string[]): CampaignCommand[] => [
  { kind: "create_household", id: "campaign_household_home", name: "Home" },
  { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
  ...ids.map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id })) ];
const MAREN = "campaign_character_maren", MAREN_TWO = "campaign_character_maren_two", LIRA = "campaign_character_lira";
const GO = "I go down to the main hall.";
const NEUTRAL = "*Nicco goes down the stairs to the main hall.*";
const korvin = { kind: "character", character_id: "korvin" } as const;
const line = (name: string) => ({ name, description: `A ${name.toLowerCase()} of fair make.`, visual_description: `a ${name.toLowerCase()}, plain and serviceable` });
const buyGoods = (price: number, ...names: string[]): CampaignCommand => ({ kind: "propose_trade_offer", direction: "buy", price_gold: price, counterparty: korvin, subject: { kind: "goods", lines: names.map(line) } });
const HALBERD = (price: string) => `Korvin lifts a halberd from the weapon rack and sets it on the counter. "${price} gold for the halberd."`;
const FREE_BRENNA = "I hereby free you, Brenna.";
const hollis = (n: 1 | 2) => n === 1
  ? { player: "I watch the crowd.", narration: "*A lean porter drops a crate beside Nicco and wipes his brow.*\n\n\"My name is Hollis,\" he says. \"Mind your feet.\"" }
  : { player: "so you are Hollis?", narration: "*The porter straightens up.*\n\n\"My name is Hollis, like I said.\"" };
const ask = (player: string, narration: string) => ({ do: "turn" as const, player, narration });
const PURCHASE: Scenario["steps"] = [
  { do: "turn", ...F.SELLERS_ROW }, { do: "turn", ...F.KORVIN_NAME_REVEAL }, { do: "turn", ...F.OFFER_300 }, { do: "turn", ...F.HAGGLE }, { do: "turn", ...F.LOWBALL },
];

// Block 10 (commerce facts): the real Korvin shapes with other prices. The pen / women text is the live OFFER_300 narration; only the closing price lines change.
const KORVIN_KNOWN: Scenario["steps"] = [{ do: "turn", ...F.SELLERS_ROW }, { do: "turn", ...F.KORVIN_NAME_REVEAL } ];
const withPrice = (tail: string): string => F.OFFER_300.narration.replace(/Three hundred for her\..*$/s, tail);
const quiet = "*Korvin says nothing. He watches the rain run off the canvas, arms folded, and lets the silence work for him.*";
const askFor = (tail: string) => ({ do: "turn" as const, player: F.OFFER_300.player, narration: withPrice(tail) });


export const SCENARIOS: readonly Scenario[] = [
  // ============================================================================================ MOVEMENT
  { id: "M1", category: "movement", mode: "deterministic", purpose: "The player moves alone: an unrelated free NPC does not follow and the move is one atomic revision.",
    initial: { world: "fixture", commands: [create("campaign_character_t", "Tessa")] },
    steps: [{ do: "turn", player: GO, narration: NEUTRAL }],
    expect: { at: { nicco: "test_hall", campaign_character_t: "test_room" }, revision_delta: 1, created: ["Tessa"], transactions: 0 } },
  { id: "M2", category: "movement", mode: "deterministic", purpose: "Eligible companions follow: a held person the player names and leads, and a household member narrated following, move WITH the player in one atomic revision, no duplicates.",
    initial: { world: "fixture", commands: [create("campaign_character_t", "Tessa"), hold("campaign_character_t"), create("campaign_character_d", "Dara"), ...household("campaign_character_d")] },
    steps: [{ do: "turn", player: `Tessa, come with me. ${GO}`, narration: "Nicco goes down the stairs to the main hall. Dara follows him." }],
    expect: { at: { nicco: "test_hall", campaign_character_t: "test_hall", campaign_character_d: "test_hall" }, revision_delta: 1, created: ["Dara", "Tessa"], held_by_player: 1 } },
  { id: "M3", category: "movement", mode: "deterministic", purpose: "A free, uninvited NPC the Narrator merely says follows has NO follow authority: she stays and the unrecorded follow is not delivered.",
    initial: { world: "fixture", commands: [create("campaign_character_t", "Tessa")] },
    steps: [{ do: "turn", player: GO, narration: "Nicco goes down the stairs. Tessa follows him." }],
    expect: { at: { nicco: "test_hall", campaign_character_t: "test_room" }, created: ["Tessa"] } },

  { id: "M4", category: "movement", mode: "deterministic", purpose: "Block 9: the Narrator's asterisk (RPG) format is markup, not words: a household member narrated following in *…* paragraphs moves WITH the player, one atomic revision, no duplicate.",
    initial: { world: "fixture", commands: [create("campaign_character_d", "Dara"), ...household("campaign_character_d")] },
    steps: [{ do: "turn", player: GO, narration: "*Nicco goes down the stairs to the main hall.*\n\n*Dara follows him down.*" }],
    expect: { at: { nicco: "test_hall", campaign_character_d: "test_hall" }, revision_delta: 1, created: ["Dara"] } },
  { id: "M5", category: "movement", mode: "deterministic", purpose: "Block 9: ambiguity fails closed. Two held women and a bare \"She follows him\": the pronoun names nobody, so nobody moves.",
    initial: { world: "fixture", commands: [create("campaign_character_t", "Tessa"), create("campaign_character_d", "Dara"), hold("campaign_character_t"), hold("campaign_character_d")] },
    steps: [{ do: "turn", player: GO, narration: "*Nicco goes down the stairs to the main hall. She follows him down the stairs.*" }],
    expect: { at: { nicco: "test_hall", campaign_character_t: "test_room", campaign_character_d: "test_room" }, created: ["Dara", "Tessa"] } },
  { id: "M6", category: "movement", mode: "deterministic", purpose: "Block 9: the escort the engine recorded is not contradicted by the prose: the led held person moves once; narration that leaves her behind is withdrawn by the audit.",
    initial: { world: "fixture", commands: [create("campaign_character_t", "Tessa"), hold("campaign_character_t")] },
    steps: [{ do: "turn", player: `Tessa, come with me. ${GO}`, narration: "*Nicco goes down the stairs to the main hall.*\n\n*Tessa stays behind in the room.*" }],
    expect: { at: { nicco: "test_hall", campaign_character_t: "test_hall" }, revision_delta: 1, created: ["Tessa"], held_by_player: 1 } },

  { id: "M7", category: "movement", mode: "deterministic", purpose: "Block 9 patch: the player's authored travel plus a narrated LOCATION CLAIM (\"Back in the Observation room, ...\", no arrival verb) agree: player = the room, one movement commit, nothing flagged.",
    initial: { world: "fixture", commands: [{ kind: "runtime_delta", delta: { player_location: "test_hall" } }] },
    steps: [{ do: "turn", player: "*he goes back to the Observation room*", narration: "*Back in the Observation room, the narrow bed and the arched window wait exactly as he left them.*" }],
    expect: { at: { nicco: "test_room" }, revision_delta: 1, audit_kinds: [] } },
  { id: "M8", category: "movement", mode: "deterministic", purpose: "Block 9 patch: an escort the player authored (held Tessa, named and led) plus location claims without any follow/enter/walk verb: Nicco and the SAME Tessa end in the hall, one atomic movement, no duplicate, no audit issue.",
    initial: { world: "fixture", commands: [create("campaign_character_t", "Tessa"), hold("campaign_character_t")] },
    steps: [{ do: "turn", player: `Tessa, come with me. ${GO}`, narration: "*The door closes behind them. Inside, the Main hall smells of old stone and woodsmoke.*\n\n*Tessa stands just inside the entrance.*" }],
    expect: { at: { nicco: "test_hall", campaign_character_t: "test_hall" }, revision_delta: 1, created: ["Tessa"], held_by_player: 1, audit_kinds: [] } },
  { id: "M9", category: "movement", mode: "deterministic", purpose: "Block 9 patch: a location claim is evidence, never authority. Nicco stays in the room (no travel authored); prose that puts him in the hall moves nobody, is caught by the audit and is not delivered unchanged.",
    initial: { world: "fixture" },
    steps: [{ do: "turn", player: "I look around the room.", narration: "*Inside the Main hall, Nicco warms his hands at the hearth.*" }],
    expect: { at: { nicco: "test_room" }, revision_delta: 0, audit_kinds: ["uncommitted_movement"], delivered_contains: { "Inside the Main hall, Nicco warms": false } } },
  { id: "M10", category: "movement", mode: "deterministic", purpose: "Block 9 patch: location-claim ambiguity fails closed. Two women, \"Inside the Main hall, she waits.\": the pronoun names nobody, so nobody is moved and nobody is blamed.",
    initial: { world: "fixture", commands: [create("campaign_character_t", "Tessa"), create("campaign_character_d", "Dara")] },
    steps: [{ do: "turn", player: "I look around the room.", narration: "*Inside the Main hall, she waits.*" }],
    expect: { at: { nicco: "test_room", campaign_character_t: "test_room", campaign_character_d: "test_room" }, revision_delta: 0, audit_kinds: [] } },

  { id: "M11", category: "movement", mode: "deterministic", purpose: "Block 9 patch, replay of the REAL failing live narration (D): the player authors an escort to Heartstone that the travel domain does not resolve; the Narrator then writes Heartstone's interior with no motion verb. Nobody moves, the audit flags the false location, the claim is not delivered.",
    initial: { world: "market", commands: [{ kind: "register_character", character: { id: "campaign_character_woman_one", origin: { kind: "created" }, profile: { sex: "female", age: { kind: "exact", years: 24 } }, current: { current_location: "calderan_slave_market", status: "active" } } }, hold("campaign_character_woman_one")] },
    steps: [{ do: "turn", player: "*Nicco takes the woman by the wrist, and she follows him out of the market, through the West District and in through the door of Heartstone.*",
      narration: "*The door closes behind them, and the market noise cuts to a murmur. Heartstone's stone walls hold a different kind of quiet \u2014 cooler, older, still. The entrance hall smells of dust and undisturbed air.*\n\n*The woman stands where Nicco's grip released her. Her hands settle at her sides.*" }],
    expect: { at: { nicco: "calderan_slave_market", campaign_character_woman_one: "calderan_slave_market" }, created: ["(unnamed)"], audit_kinds: ["uncommitted_movement"], delivered_contains: { "Heartstone's stone walls": false } } },

  // ============================================================================================ IDENTITY
  { id: "I1", category: "identity", mode: "deterministic", purpose: "An incidental named stranger stays PROVISIONAL: a name alone is not persistence authority (no CampaignCharacter, no revision).",
    initial: { world: "market" },
    steps: [{ do: "turn", ...hollis(1) }],
    expect: { provisional_names: ["Hollis"], created: [], identity_commands: 0, revision_delta: 0, npc_plus: [], transactions: 0 } },
  { id: "I2", category: "identity", mode: "deterministic", purpose: "Repeated interaction with the same provisional stranger reuses ONE provisional identity (same ref), never duplicates, and still persists nothing.",
    initial: { world: "market" },
    steps: [{ do: "turn", ...hollis(1) }, { do: "turn", ...hollis(2), expect: { provisional_refs: ["narrated:hollis"] } }],
    expect: { provisional_refs: ["narrated:hollis"], created: [], revision_delta: 0 } },
  { id: "I3", category: "identity", mode: "deterministic", purpose: "Narration naming a person who objectively IS an existing durable identity (campaign Brenna, canonical Korvin) reuses it: no provisional duplicate, no second record.",
    initial: { world: "market", commands: [{ kind: "register_character", character: { id: "campaign_character_brenna", origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 29 } }, current: { current_location: "calderan_slave_market", status: "active" } } }] },
    steps: [ask("I look at the cages.", "*Brenna coughs behind the bars, feverish. Korvin leans on the cage and glances at Nicco.*\n\n\"Brenna,\" Korvin says. \"Quiet now.\""), ask("hello Brenna", "*Brenna lifts her head.*\n\n\"My name is Brenna,\" she rasps.")],
    expect: { created: ["Brenna"], provisional_names: [], identity_commands: 0, revision_delta: 0 } },
  { id: "I4", category: "identity", mode: "deterministic", purpose: "KNOWN PRODUCT GAP: after several friendly turns, the player has NO generic deterministic action to keep an arbitrary provisional person (Hollis) as a persistent character; words alone must not, and nothing else does.",
    known_gap: "No player-facing action promotes an arbitrary ProvisionalPerson to a CampaignCharacter outside domain-authorized acts (person Actual Offer Accept). Narration, names and player words are not persistence authority (AUTH-2).",
    initial: { world: "market" },
    steps: [{ do: "turn", ...hollis(1) }, { do: "turn", ...hollis(2) }, ask("Hollis, I would like to keep you around. Remember you as one of mine.", "*Hollis tips his cap.*\n\n\"My name is Hollis. Always at your service, friend.\"")],
    expect: { created: ["Hollis"] } },

  // ============================================================================================ TRADE (goods)
  { id: "T1", category: "trade", mode: "deterministic", purpose: "A direct goods offer from the seller becomes an Actual Offer; nothing is paid or transferred until the player's explicit Accept, which then settles atomically.",
    initial: { world: "market" },
    steps: [{ do: "turn", ...F.SELLERS_ROW },
      { do: "turn", player: "How much for the halberd?", narration: HALBERD("Fifteen"), controller: [buyGoods(15, "Halberd")], evidence: ["Fifteen gold for the halberd."],
        expect: { offers_active: ["buy:goods:15"], card: { kind: "goods", price_gold: 15 }, gold: 500, inventory: [], transactions: 0, revision_delta: 1 } },
      { do: "accept", expect: { gold: 485, inventory: ["Halberd"], offers_active: [], revision_delta: 2 } }],
    expect: { offers_by_status: { accepted: 1 }, card: null } },
  { id: "T2", category: "trade", mode: "deterministic", purpose: "The seller reprices: the latest concrete seller offer supersedes the earlier one; the stale price is not actionable and Accept settles at the new price only.",
    initial: { world: "market" },
    steps: [{ do: "turn", ...F.SELLERS_ROW },
      { do: "turn", player: "How much for the halberd?", narration: HALBERD("Fifteen"), controller: [buyGoods(15, "Halberd")], evidence: ["Fifteen gold for the halberd."], expect: { offers_active: ["buy:goods:15"] } },
      { do: "turn", player: "Too much.", narration: "Korvin grimaces and turns the blade in the light. \"Twelve gold for the halberd, and not a coin less.\"", controller: [buyGoods(12, "Halberd")], evidence: ["Twelve gold for the halberd, and not a coin less."],
        expect: { offers_active: ["buy:goods:12"], offers_by_status: { superseded: 1, active: 1 }, card: { kind: "goods", price_gold: 12 }, gold: 500 } },
      { do: "accept", expect: { gold: 488, inventory: ["Halberd"] } }],
    expect: { offers_by_status: { superseded: 1, accepted: 1 } } },
  { id: "T3", category: "trade", mode: "deterministic", purpose: "The Narrator claims payment and transfer with NO accepted Actual Offer (and the Controller even tries to set funds): nothing authoritative is paid or transferred.",
    initial: { world: "market" },
    steps: [{ do: "turn", ...F.SELLERS_ROW },
      { do: "turn", player: "I pay Korvin fifteen gold and take the halberd.", narration: "Korvin pockets the coins and passes the halberd across the counter.",
        controller: [{ kind: "create_item", name: "Halberd", description: "A halberd.", visual_description: "a halberd", category: "weapon", position: { kind: "carried", character_id: "nicco" } }], evidence: ["Korvin pockets the coins and passes the halberd across the counter."] }],
    expect: { gold: 500, inventory: [], transactions: 0, offers_active: [], held_by_player: 0 } },

  // ============================================================================================ PERSON TRADE
  { id: "P1", category: "person_trade", mode: "deterministic", purpose: "A provisional person is bought: nothing happens before Accept; Accept debits the price and materializes the SAME subject as exactly ONE persistent character, atomically, in one revision.",
    initial: { world: "market" },
    steps: [...PURCHASE,
      { do: "check", label: "before Accept", expect: { offers_active: ["buy:person:260"], gold: 500, created: [], transactions: 0, held_by_player: 0, revision_delta: 2 } },
      { do: "accept", label: "accept 260", expect: { gold: 240, created: ["(unnamed)"], created_are_offer_subjects: true, transactions: 1, held_by_player: 1, offers_active: [], revision_delta: 3 } }],
    expect: { offers_by_status: { superseded: 1, accepted: 1 }, offer_subjects: 1 } },
  { id: "P2", category: "person_trade", mode: "deterministic", purpose: "After the purchase the person reveals a name: it binds to the SAME persistent character (no second person, no new transaction).",
    initial: { world: "market" },
    steps: [...PURCHASE, { do: "accept" }, { do: "turn", ...F.ASK_NAME_1 }, { do: "turn", ...F.ASK_NAME_2 }],
    expect: { created: ["Maren"], created_are_offer_subjects: true, transactions: 1, held_by_player: 1, provisional_names: [] } },

  // ============================================================================================ HOUSEHOLD / NPC+
  { id: "H1", category: "household", mode: "deterministic", purpose: "The explicit Heartstone rite promotes an eligible persistent campaign NPC to NPC+ with her identity retained (same record, no duplicate).",
    initial: { world: "market", commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_lr" } },
      { kind: "register_character", character: { id: "campaign_character_brenna", origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 26 } }, current: { current_location: "heartstone_lr", status: "active" } } }] },
    steps: [{ do: "promote_npc_plus", character_id: "Brenna" }],
    expect: { npc_plus: ["campaign_character_brenna"], household: ["campaign_character_brenna"], created: ["Brenna"], revision_delta: 1 } },
  { id: "H2", category: "household", mode: "deterministic", purpose: "A provisional person cannot silently become NPC+ or a household member: neither narration nor the rite UI materializes them.",
    initial: { world: "market", commands: [{ kind: "runtime_delta", delta: { player_location: "heartstone_lr" } }] },
    steps: [{ do: "turn", player: "I wait in the hall.", narration: "*A thin woman sweeps the steps.*\n\n\"My name is Lysa,\" she says." },
      { do: "turn", player: "Lysa, join my household and become an NPC+.", narration: "*The woman straightens up.*\n\n\"My name is Lysa, like I said.\"" },
      { do: "promote_npc_plus", character_id: "Lysa", fails: true }],
    expect: { npc_plus: [], household: [], created: [], provisional_names: ["Lysa"], revision_delta: 0 } },

  // ============================================================================================ PERSISTENCE
  { id: "S1", category: "persistence", mode: "deterministic", purpose: "Save/reload keeps the PendingConfirmation card, the turn receipt (same turn_key replays with zero provider calls) and the optional side stores, with no optional revision churn.",
    initial: { world: "mannerism", commands: [hold("brenna")] },
    steps: [{ do: "turn", player: FREE_BRENNA, narration: "Brenna goes very still and searches Nicco's face.", key: "bench_s1_0001", expect: { confirmations: ["Free Brenna?"], revision_delta: 0 } },
      { do: "optional_write", what: "reflection", expect: { revision_delta: 0, reflection_notes: 1, save_state: "unsaved" } },
      { do: "save_reload", expect: { confirmations: ["Free Brenna?"], reflection_notes: 1, revision_delta: 0, legal: { brenna: "enslaved:nicco" }, disk: { learning_store: true, note_in_store: true, note_in_snapshot: false } } },
      { do: "replay_turn", key: "bench_s1_0001", player: FREE_BRENNA, expect: { calls: { narrator: 1, controller: 1 }, revision_delta: 0 } }],
    expect: { confirmations: ["Free Brenna?"], save_state: "saved" } },
  { id: "S2", category: "persistence", mode: "deterministic", purpose: "Reflection, Mannerism and media (portrait) writes change the SIDE stores only: the semantic revision never moves, the semantic save does not carry them.",
    initial: { world: "mannerism" },
    steps: [{ do: "optional_write", what: "reflection", expect: { revision_delta: 0, reflection_notes: 1 } },
      { do: "optional_write", what: "mannerism", expect: { revision_delta: 0 } },
      { do: "optional_write", what: "portrait", expect: { revision_delta: 0, portrait_versions: 1, save_state: "unsaved" } },
      { do: "save", expect: { save_state: "saved", revision_delta: 0 } }],
    expect: { revision_delta: 0, disk: { learning_store: true, media_store: true, note_in_store: true, note_in_snapshot: false } } },

  // ============================================================================================ AUTHORITY
  { id: "A1", category: "authority", mode: "deterministic", purpose: "Manumission is a PROPOSAL: 'I hereby free you' creates a PendingConfirmation and mutates NO legal state until the player's explicit Confirm, which commits once.",
    initial: { world: "fixture", commands: [hold("brenna")] },
    steps: [{ do: "turn", player: FREE_BRENNA, narration: "Brenna goes very still and searches Nicco's face.", expect: { confirmations: ["Free Brenna?"], legal: { brenna: "enslaved:nicco" }, transactions: 0, revision_delta: 0 } },
      { do: "confirm", expect: { legal: { brenna: "free" }, transactions: 1, revision_delta: 1, confirmations: [] } }],
    expect: { held_by_player: 0, calls: { narrator: 1, controller: 1 } } },
  { id: "A2", category: "authority", mode: "deterministic", purpose: "Human repair: a merge and a retire each create a PendingConfirmation, mutate nothing before Confirm, and commit exactly once after.",
    initial: { world: "fixture", commands: [create(MAREN, "Maren"), create(MAREN_TWO, "Maren"), create(LIRA, "Lira")] },
    steps: [{ do: "repair", operation: "merge", character_id: MAREN_TWO, target_id: MAREN, expect: { retired: [], revision_delta: 0, confirmations: ["Merge Maren into Maren?"] } },
      { do: "confirm", expect: { retired: [`${MAREN_TWO}→${MAREN}`], revision_delta: 1 } },
      { do: "repair", operation: "retire", character_id: LIRA, expect: { retired: [`${MAREN_TWO}→${MAREN}`], revision_delta: 1 } },
      { do: "confirm", expect: { retired: [`${LIRA}→retired`, `${MAREN_TWO}→${MAREN}`], revision_delta: 2 } }],
    expect: { created: ["Lira", "Maren", "Maren"] } },

  // ============================================================================================ AMBIGUITY / FAIL-CLOSED
  { id: "F1", category: "fail_closed", mode: "deterministic", purpose: "Two plausible held people and an ambiguous pronoun ('free her'): no guessed irreversible action, no card for a guessed person, nothing freed.",
    initial: { world: "fixture", commands: [create("campaign_character_t", "Tessa"), create("campaign_character_d", "Dara"), hold("campaign_character_t"), hold("campaign_character_d")] },
    steps: [{ do: "turn", player: "I hereby free her.", narration: "*Both women stare at Nicco, unsure which of them he means.*" }],
    expect: { held_by_player: 2, confirmations: [], transactions: 0, revision_delta: 0 } },
  { id: "F2", category: "fail_closed", mode: "deterministic", purpose: "A malformed/incomplete commercial signal (no number, a zero-price offer, a goods offer with no lines) fabricates NO offer, NO card and NO settlement.",
    initial: { world: "market" },
    steps: [{ do: "turn", ...F.SELLERS_ROW },
      { do: "turn", player: "Price?", label: "a question, not an offer", narration: "Korvin lifts a halberd. \"Would fifteen gold for the halberd suit you?\"", controller: [buyGoods(15, "Halberd")], evidence: ["Would fifteen gold for the halberd suit you?"],
        expect: { offers_active: [], card: null, revision_delta: 0 } },
      { do: "turn", player: "Price?", label: "a fraction of gold", narration: "Korvin lifts a halberd. \"Fifteen and a half gold for the halberd.\"", controller: [buyGoods(15, "Halberd")], evidence: ["Fifteen and a half gold for the halberd."],
        expect: { offers_active: [], card: null, revision_delta: 0 } },
      { do: "turn", player: "Price?", label: "a malformed proposal (zero price) fails the turn closed", narration: "Korvin shrugs. \"Name a number.\"", controller: [buyGoods(0, "Halberd")], fails: true,
        expect: { offers_active: [], revision_delta: 0 } }],
    expect: { offers_active: [], card: null, gold: 500, inventory: [], transactions: 0, revision_delta: 0 } },
  // ============================================================================================ COMMERCE FACTS (Block 10)
  { id: "C1", category: "person_trade", mode: "deterministic", purpose: "A direct seller quote about a person becomes ONE Actual Offer at that price; the quote alone pays nothing and creates nobody.",
    initial: { world: "market" },
    steps: [...KORVIN_KNOWN, { ...askFor("A hundred for her. She's not trouble. That's the price."), expect: { offers_active: ["buy:person:100"], card: { kind: "person", price_gold: 100 }, gold: 500, created: [], transactions: 0 } }],
    expect: { offers_by_status: { active: 1 }, offer_subjects: 1 } },
  { id: "C2", category: "person_trade", mode: "deterministic", purpose: "100 (seller) -> 90 (player counter) -> 95 (seller counter): only the latest seller quote, 95, is active; the player's 90 never became an offer; 100 is superseded; the subject is the same person.",
    initial: { world: "market" },
    steps: [...KORVIN_KNOWN, askFor("A hundred for her. That's the price."),
      { do: "turn", player: "I'll give you ninety.", narration: quiet, expect: { offers_active: ["buy:person:100"], offers_by_status: { active: 1 } } },
      { do: "turn", player: "Ninety, and she walks with me today.", narration: "*Korvin rubs his jaw and lets out a long breath through his nose.*\n\nNinety-five for her. Final.", expect: { offers_active: ["buy:person:95"], card: { kind: "person", price_gold: 95 } } }],
    expect: { offers_active: ["buy:person:95"], offers_by_status: { superseded: 1, active: 1 }, offer_subjects: 1, gold: 500, created: [], transactions: 0 } },
  { id: "C3", category: "person_trade", mode: "deterministic", purpose: "400 -> 250 -> 275: the same chain at other numbers; only 275 stays active and 400 is superseded.",
    initial: { world: "market" },
    steps: [...KORVIN_KNOWN, askFor("Four hundred for her. That's the price."),
      { do: "turn", player: "I'll go two-fifty.", narration: quiet },
      { do: "turn", player: "Two-fifty, my last word.", narration: "*Korvin scratches the grime on his forearm and exhales.*\n\nTwo-seventy-five for her.", expect: { offers_active: ["buy:person:275"] } }],
    expect: { offers_active: ["buy:person:275"], offers_by_status: { superseded: 1, active: 1 }, offer_subjects: 1, gold: 500 } },
  { id: "C4", category: "authority", mode: "deterministic", purpose: "The real premature-settlement narration (coins taken, bill of sale, 'She's yours') while an offer stands: no gold moves, no legal transfer, nobody is materialized, the claims are flagged and withdrawn.",
    initial: { world: "market" },
    steps: [...KORVIN_KNOWN, askFor("A hundred for her. That's the price."),
      { do: "turn", player: "Fine, a hundred.", narration: "*Korvin takes the coins, counts them into his palm and folds a sheet of paper across the table.*\n\nThat's your bill of sale. Keep it. She's yours.", expect: { offers_active: ["buy:person:100"], gold: 500, created: [], transactions: 0, held_by_player: 0, audit_kinds: ["asserts_uncommitted_purchase", "asserts_uncommitted_transfer"], delivered_contains: { "She's yours": false } } }],
    expect: { offers_active: ["buy:person:100"], gold: 500, created: [], transactions: 0, held_by_player: 0 } },
  { id: "C5", category: "person_trade", mode: "deterministic", purpose: "A player numeric counteroffer alone (the seller quotes nothing) is negotiation evidence only: it creates no offer and replaces nothing.",
    initial: { world: "market" },
    steps: [...KORVIN_KNOWN, askFor("A hundred for her. That's the price."),
      { do: "turn", player: "I'll give you ninety.", narration: quiet }],
    expect: { offers_active: ["buy:person:100"], offers_by_status: { active: 1 }, gold: 500, created: [] } },
  { id: "C6", category: "fail_closed", mode: "deterministic", purpose: "An ambiguous subject + price (two women, two different prices in one statement; an age and a tenure beside the ask) fabricates NO offer.",
    initial: { world: "market" },
    steps: [...KORVIN_KNOWN, askFor("The young one is two hundred, the broad one a hundred. Take your pick."),
      { do: "turn", player: "How much for the strong one?", narration: "*Korvin glances at the pen.*\n\nShe's twenty, worked five years, asking nothing but a roof. Hmm.", expect: { offers_active: [] } }],
    expect: { offers_active: [], card: null, gold: 500, created: [], transactions: 0 } },

  { id: "C7", category: "person_trade", mode: "deterministic", purpose: "Identity continuity through the whole chain: 100 -> counter -> 95 -> explicit Accept -> the later name binds to the SAME persistent character (one character, one transaction, no second offer subject).",
    initial: { world: "market" },
    steps: [...KORVIN_KNOWN, askFor("A hundred for her. That's the price."),
      { do: "turn", player: "I'll give you ninety.", narration: quiet },
      { do: "turn", player: "Ninety, and she walks with me today.", narration: "*Korvin rubs his jaw and lets out a long breath through his nose.*\n\nNinety-five for her. Final.", expect: { offers_active: ["buy:person:95"] } },
      { do: "accept", expect: { gold: 405, created: ["(unnamed)"], created_are_offer_subjects: true, transactions: 1, held_by_player: 1, offers_active: [] } },
      { do: "turn", ...F.ASK_NAME_1 }, { do: "turn", ...F.ASK_NAME_2 }],
    expect: { created: ["Maren"], created_are_offer_subjects: true, offer_subjects: 1, transactions: 1, held_by_player: 1, provisional_names: [], gold: 405 } },
  { id: "C8", category: "person_trade", mode: "deterministic", purpose: "KPG-2 CLOSED in Block 11 (replay of the REAL live narration of Block 10 live B): the seller's quote arrives as an UNATTRIBUTED plain paragraph after a starred Korvin beat ('This one's a hundred gold.'), and the next beat says how he delivered it ('He says it flat'). The shared speaker facts attribute the line to Korvin, so the person Actual Offer appears; nothing is paid.",
    initial: { world: "market" },
    steps: [...KORVIN_KNOWN, { do: "turn", player: "I tell Korvin I want to see exactly one woman from his stock, only one, and ask his price. Korvin looks over one woman in the pens and says plainly: \"This one is 100 gold.\"", narration: "*Korvin turns toward the pens and walks along the row without hurrying, his boot heels firm on the packed earth. He stops at one where a woman sits on the ground with her back to the slats, draws a key, and unlatches the gate just enough to step halfway in. He looks her over the way he'd look over a draft animal \u2014 hands, teeth, build \u2014 then steps back out and latches it again. He doesn't make anything of it.*\n\nThis one's a hundred gold.\n\n*He says it flat, the way he might quote a price on grain. His thumb hooks back into his belt. The woman in the pen hasn't moved; she sits with her knees drawn up, watching the ground between her feet. Korvin's attention is already back on Nicco, those small eyes reading him with the same quick, practiced sweep he'd given at first approach \u2014 sizing up what kind of buyer he's dealing with, what he might want beyond the question he asked.*\n\nShe's young, healthy, no skills worth bragging about. Field hands and scullery work, that's her. Hundred gold's fair for what she is.\n\n*He waits. No pressure in it, no warmth either \u2014 just a man who's stated his price and wants to know if the customer bites or haggles.*",
      expect: { offers_active: ["buy:person:100"], card: { kind: "person", price_gold: 100 }, gold: 500, created: [], transactions: 0 } }],
    expect: { offers_active: ["buy:person:100"], offer_subjects: 1 } },
  // ============================================================================================ IDENTITY / SPEAKER / RECIPIENT / PRESENCE FACTS (Block 11)
  { id: "I5", category: "person_trade", mode: "deterministic", purpose: "Block 11 KPG-2 closure on the REAL live B turn of Block 10 (offer turn): a starred Korvin action beat, an unattributed plain price line, then 'He says it the way...'. The shared speaker attribution binds the line to Korvin (post-hoc delivery tag / continued speaker), so the person Actual Offer appears at 100; no payment, nobody created.",
    initial: { world: "market" },
    steps: [...KORVIN_KNOWN, { do: "turn", player: "I tell Korvin I want to see exactly one woman from his stock, only one, and ask his price. Korvin looks over one woman in the pens and says plainly: \"This one is 100 gold.\"",
      narration: "*Korvin's chin lifts toward the pen behind him \u2014 not a gesture for show, just a practical tilt, the way a man indicates livestock at a fair. His eyes stay on Nicco, reading him while Nicco looks.*\n\n*One of the figures in the pen is a woman, young, sitting with her back to the low railing and her knees drawn up. Thin, hollow-cheeked, dirt on her forearms. She doesn't look up.*\n\nHundred gold. She's plain labor, no trade to her, but she's healthy enough. Won't cost you in feed or medicine.\n\n*He says it the way he'd say the weight of a sack \u2014 flat, without apology or enthusiasm. His thumb stays hooked in his belt. After a beat his gaze narrows, not hostile, just measuring.*\n\nThat's fair for what she is. You want her or not?",
      expect: { offers_active: ["buy:person:100"], card: { kind: "person", price_gold: 100 }, gold: 500, created: [], transactions: 0 } }],
    expect: { offers_active: ["buy:person:100"], offer_subjects: 1, gold: 500, transactions: 0 } },
  { id: "I6", category: "identity", mode: "deterministic", purpose: "Block 11: a provisional (narrated, unnamed) woman answers the name question with 'My name is Maren.': the self-introduction fact names the SAME provisional person (one ref), nothing is materialized, the revision does not move.",
    initial: { world: "market" },
    steps: [ask("I look around the square.", "*A young woman in a grey shawl sells apples from a basket near the fountain, calling out prices to nobody in particular.*"),
      ask("I walk to the apple seller. What's your name?", "*The woman with the apples looks up and shifts the basket on her hip.*\n\nMy name is Maren. Apples are two coppers.")],
    expect: { provisional_names: ["Maren"], created: [], identity_commands: 0, revision_delta: 0, npc_plus: [], transactions: 0 } },
  { id: "I7", category: "identity", mode: "deterministic", purpose: "Block 11: the person the player just bought (persistent, unnamed) says 'My name is Lira.': the name binds to the SAME persistent character (same id), no duplicate, no provisional twin, no new transaction.",
    initial: { world: "market" },
    steps: [...PURCHASE, { do: "accept" }, ask("I crouch in front of her. What's your name?", "*She looks up from the dirt, her hands folded in her lap.*\n\nMy name is Lira.")],
    expect: { created: ["Lira"], created_are_offer_subjects: true, transactions: 1, held_by_player: 1, provisional_names: [] } },
  { id: "I8", category: "fail_closed", mode: "deterministic", purpose: "Block 11: an ambiguous speaker (a plural beat 'Korvin and Brenna look at each other' before a plain price line) binds the line to nobody, so no seller quote exists: no offer, no card, nothing paid.",
    initial: { world: "market", commands: [{ kind: "register_character", character: { id: "campaign_character_brenna", origin: { kind: "created" }, profile: { name: "Brenna", sex: "female", age: { kind: "exact", years: 29 } }, current: { current_location: "calderan_slave_market", status: "active" } } }] },
    steps: [...KORVIN_KNOWN, ask(F.OFFER_300.player, withPrice("*Korvin and Brenna look at each other for a long moment.*\n\nA hundred for her."))],
    expect: { offers_active: [], card: null, gold: 500, transactions: 0 } },
  { id: "I9", category: "fail_closed", mode: "deterministic", purpose: "Block 11: an ambiguous pronoun. Two held unnamed women are present and the beat says only 'She lifts her chin.' before 'My name is Lira.': the name binds to neither record, nobody is renamed or created, the revision does not move.",
    initial: { world: "market", commands: [
      { kind: "register_character", character: { id: "campaign_character_woman_a", origin: { kind: "created" }, profile: { sex: "female", age: { kind: "exact", years: 22 } }, current: { current_location: "calderan_slave_market", status: "active" } } }, hold("campaign_character_woman_a"),
      { kind: "register_character", character: { id: "campaign_character_woman_b", origin: { kind: "created" }, profile: { sex: "female", age: { kind: "exact", years: 31 } }, current: { current_location: "calderan_slave_market", status: "active" } } }, hold("campaign_character_woman_b")] },
    steps: [ask("What's your name?", "*She lifts her chin.*\n\nMy name is Lira.")],
    expect: { created: ["(unnamed)", "(unnamed)"], identity_commands: 0, revision_delta: 0, held_by_player: 2 } },
  { id: "I10", category: "person_trade", mode: "deterministic", purpose: "Block 11: a recipient that resolves. 'He folds his arms and says to Nicco:' before the price line: the recipient fact is the player, so the seller quote stays an offer to him and the person Actual Offer appears.",
    initial: { world: "market" },
    steps: [...KORVIN_KNOWN, ask(F.OFFER_300.player, F.OFFER_300.narration.replace(/\*He folds his arms[^*]*\*\n\nThree hundred for her\..*$/s, "*He folds his arms and says to Nicco:*\n\nA hundred for her. That's the price."))],
    expect: { offers_active: ["buy:person:100"], card: { kind: "person", price_gold: 100 }, gold: 500, created: [], transactions: 0 } },
  { id: "I11", category: "fail_closed", mode: "deterministic", purpose: "Block 11: an ambiguous recipient. With two women present, 'He folds his arms and says to her:' before the price line addresses somebody who is not provably Nicco: the quote is not an offer to the player, so no offer and no card.",
    initial: { world: "market", commands: [
      { kind: "register_character", character: { id: "campaign_character_brenna", origin: { kind: "created" }, profile: { name: "Brenna", sex: "female", age: { kind: "exact", years: 29 } }, current: { current_location: "calderan_slave_market", status: "active" } } },
      { kind: "register_character", character: { id: "campaign_character_tessa", origin: { kind: "created" }, profile: { name: "Tessa", sex: "female", age: { kind: "exact", years: 27 } }, current: { current_location: "calderan_slave_market", status: "active" } } }] },
    steps: [...KORVIN_KNOWN, ask(F.OFFER_300.player, F.OFFER_300.narration.replace(/\*He folds his arms[^*]*\*\n\nThree hundred for her\..*$/s, "*He folds his arms and says to her:*\n\nA hundred for her. That's the price."))],
    expect: { offers_active: [], card: null, gold: 500, transactions: 0 } },
  { id: "I12", category: "fail_closed", mode: "deterministic", purpose: "Block 11: presence. Brenna is at Heartstone while Nicco is at the market; a narration that has her step up and speak without any transition is an absent participant: the audit flags it, she does not move, the revision does not move.",
    initial: { world: "market", commands: [{ kind: "register_character", character: { id: "campaign_character_brenna", origin: { kind: "created" }, profile: { name: "Brenna", sex: "female", age: { kind: "exact", years: 29 } }, current: { current_location: "heartstone_lr", status: "active" } } }] },
    steps: [ask("I look over the pens.", "*Brenna steps up beside Nicco and laughs.*\n\nYou always pick the loud ones.")],
    expect: { at: { campaign_character_brenna: "heartstone_lr" }, revision_delta: 0 } },
  { id: "I13", category: "identity", mode: "deterministic", purpose: "Block 11 live B replay (the REAL live narrations): the player asks the apple seller's name in narrated form ('I ask the apple seller what her name is') and she answers with a bare 'Maren.' after a starred beat. The indirect name question is a name question (identity-request.ts asksName), so the bare answer names the SAME provisional seller: one provisional Maren, nobody created, the revision does not move.",
    initial: { world: "market" },
    steps: [ask("I walk over to a young woman selling apples from a basket near the edge of the square.", "*A young woman sits on a low stool near the edge of the square, a broad basket of apples balanced on her lap. She's been watching the traffic pass with the bored patience of someone who has been here since early morning. A rough cloth is spread across her knees where she's been polishing the fruit.*\n\n*As Nicco approaches, she straightens slightly and lifts one apple halfway in offering \u2014 a reflex more than a pitch.*\n\n*The apples are small, a little uneven, but clean. Behind her, a handler leads a line of captives toward the holding pens, and the auctioneer's voice cuts across the square with another price. She doesn't look back at it.*\n\nFresh this morning. Two silver for five, or one silver for two.\n\n*She sets the apple back in the basket and wipes her palm on her skirt. Her eyes move across Nicco briefly \u2014 taking in his size, his clothing, the way he carries himself \u2014 before settling back on the fruit. Her fingers sort through the basket, pushing aside the ones with soft spots.*"),
      ask("I ask the apple seller what her name is. She answers: \"My name is Maren.\"", "*She doesn't pause her sorting. A soft one goes left, a firm one right.*\n\nMaren.\n\n*The word comes out plainly, without ceremony or hesitation \u2014 the way someone gives a name that doesn't matter much to give. Her thumb tests the skin of the next apple, pressing gently near the stem.*\n\nYou want the two or the five? I'm not selling onesies.\n\n*Somewhere behind her a clerk calls a number across the auction ground, and a ripple of voices follows. She tips her head a fraction toward the sound without turning around, the way someone does when they've heard the same noise a thousand times and it's become part of the weather.*")],
    expect: { provisional_names: ["Maren"], created: [], identity_commands: 0, revision_delta: 0, npc_plus: [], transactions: 0 } },
];
