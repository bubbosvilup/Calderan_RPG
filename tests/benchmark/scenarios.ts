import type { CampaignCommand } from "../../src/campaign/types.js";
import type { Scenario } from "./scenario.js";
import * as F from "../fixtures/person-offer-playthrough.js";

/**
 * The modern regression benchmark: 20 small, independent scenarios over the CURRENT architecture (strict expected_revision, turn_key idempotency,
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
];
