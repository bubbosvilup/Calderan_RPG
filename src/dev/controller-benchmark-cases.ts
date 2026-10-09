import type { CampaignCommand } from "../campaign/types.js";
import type { RecentExchange } from "../turn/recent-conversation.js";
import { EVIDENCE_CORPUS, EVIDENCE_CORPUS_EXTRA, OFFER, TELL } from "./evidence-corpus.js";

/**
 * State Controller benchmark fixtures (development only). Frozen before any paid call; models are added on the command line, never
 * here. Every case names a deterministic fixture, the player input and the FINAL narration the controller sees. `expected` are the
 * controller-owned mutations a correct proposal must contain; `optional` are engine-owned commands a model may also propose without
 * penalty. The scoring truth is the authoritative state after the real engine path (gold = replay of `expected`), so equivalent
 * proposals that commit the same valid state score the same.
 *
 * Sources: Round 2 bakeoff cases (scripts/controller-bakeoff-round-2-cases.mjs), the Phase 1O evidence corpus (truth labels from that
 * corpus), and engine-grounded variants of existing regression tests (cited per case).
 */
export type BenchmarkGroup = "items" | "ownership" | "economy" | "relationships" | "knowledge" | "conditions" | "movement_time" | "household_legal" | "ambiguous_language" | "multi_mutation" | "no_op";
export type BenchmarkFixture =
  /** turnFixture + "Home" household (Nicco owner; Maren and Brenna members), as in Round 2. */
  | { readonly kind: "household"; readonly garments?: boolean; readonly maren_at_hall?: boolean; readonly brenna_knows?: boolean; readonly dell?: boolean; readonly dell_marsh?: boolean }
  /** Canonical world: Calderan slave market, Korvin known, created Brenna (29) enslaved and held by Korvin. */
  | { readonly kind: "market" }
  /** Canonical world at heartstone_square with the listed canonical NPCs present (physical-interaction regressions). */
  | { readonly kind: "canonical_scene"; readonly npcs: readonly string[] }
  /** Canonical world at Heartstone (heartstone_lr): created Brenna present, held by Nicco, not a household member. */
  | { readonly kind: "heartstone_brenna" };
export interface BenchmarkCase {
  readonly id: string; readonly group: BenchmarkGroup; readonly tags: readonly string[]; readonly source: string;
  readonly fixture: BenchmarkFixture; readonly recent?: readonly RecentExchange[];
  readonly input: string; readonly narration: string;
  readonly expected: readonly CampaignCommand[]; readonly optional: readonly CampaignCommand[];
  /** Evidence quotes used only for the gold replay (one per expected command). */
  readonly gold_quotes?: readonly string[];
  /** Ordinary adult/consensual prose used only as robustness input. */
  readonly adult_prose?: boolean;
}
export const BRENNA_MARKET = "campaign_character_brenna";
export const HOME = "campaign_household_home";
export const DELL = "campaign_character_eval_dell_harrow", DELL_MARSH = "campaign_character_eval_dell_marsh";
const tell: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
const rel = (from: string, to: string, dimension: "trust" | "wariness" | "affection" | "protectiveness" | "respect" | "fear" | "hostility" | "romance", direction: "raise" | "lower" = "raise"): CampaignCommand =>
  ({ kind: "adjust_relationship", from_character_id: from, to_character_id: to, dimension, direction });
const affection = rel("brenna", "nicco", "affection"), trust = rel("brenna", "nicco", "trust");
const transfer = (item_id: string, owner = "brenna"): CampaignCommand => ({ kind: "transfer_item", mode: "handoff", item_id,  position: { kind: "carried", character_id: owner } });
const garments = ["pink_cotton", "pink_fluffy", "pink_shorts"].map(id => transfer(id));
const HH: BenchmarkFixture = { kind: "household" }, GARMENTS: BenchmarkFixture = { kind: "household", garments: true };
const RETURN_MOVE: CampaignCommand = { kind: "move_character", character_id: "maren", location_id: "test_room" };
const MARKET_OFFER: RecentExchange = { player: "Name your price again, Korvin.", narration: 'Korvin studies the woman in the cage, then Nicco. "Five." He taps the ledger. "Papers included. Clean transfer, debt-forfeiture chain, no liens."', status: "finalized" };
const c = (id: string, group: BenchmarkGroup, fields: Partial<BenchmarkCase> & Pick<BenchmarkCase, "narration">): BenchmarkCase =>
  ({ id, group, tags: [], source: "authored engine-grounded variant", fixture: HH, input: "I wait and watch.", expected: [], optional: [], ...fields });
const corpus = [...EVIDENCE_CORPUS, ...EVIDENCE_CORPUS_EXTRA];
/** An evidence-corpus case with its corpus truth label (positives carry the corpus quotes). */
function fromCorpus(id: string, group: BenchmarkGroup, tags: readonly string[], expected: readonly CampaignCommand[] = []): BenchmarkCase {
  const e = corpus.find(x => x.id === id);
  if (!e) throw new Error(`Unknown corpus case ${id}`);
  if ((e.truth === "positive") !== expected.length > 0) throw new Error(`Corpus truth mismatch ${id}`);
  const quotes = e.quotes ? expected.map((_, i) => e.quotes![Math.min(i, e.quotes!.length - 1)]!) : undefined;
  return { id: `corpus_${id}`, group, tags: [...tags, e.category], source: `src/dev/evidence-corpus.ts:${id}`, fixture: e.ground_garments ? GARMENTS : HH, input: e.input, narration: e.narration, expected, optional: [], ...(quotes ? { gold_quotes: quotes } : {}) };
}

/** Round 2 scored cases (r03 is excluded there as an unscored contract probe and is not repeated here). */
const ROUND_2: readonly BenchmarkCase[] = [
  c("r2_a01_quiet", "no_op", { input: "I read by the window.", narration: "The afternoon drifts by. Dust turns in the window light.", source: "Round 2 a01" }),
  c("r2_a02_emotional", "no_op", { narration: "Brenna looks worried.", source: "Round 2 a02 / corpus kn01", tags: ["emotion only"] }),
  { ...fromCorpus("tr14", "items", ["future vs completed"]), id: "r2_a03_future" },
  { ...fromCorpus("tr03", "items", ["negation"]), id: "r2_a04_refusal" },
  { ...fromCorpus("tr06", "items", ["incomplete action"]), id: "r2_a05_incomplete" },
  { ...fromCorpus("tr01", "items", ["hypothetical", "quotation"]), id: "r2_a06_hypothetical" },
  c("r2_a07_secret_unknown", "knowledge", { input: "Brenna, what is Maren hiding?", narration: 'Brenna says, "I do not know Maren\'s secret." Maren says nothing.', source: "Round 2 a07", tags: ["negation", "private fact"] }),
  c("r2_a08_flavor", "no_op", { narration: "Gerome stands motionless in the corner, a shape of fitted stone, and makes no sound. From below, faint noise from the main hall drifts up through the open stairwell.", source: "Round 2 a08", tags: ["location mentions"] }),
  { ...fromCorpus("kp01", "knowledge", ["direct"], [tell]), id: "r2_k01_direct" },
  c("r2_k02_repeated", "knowledge", { input: TELL, narration: "Nicco tells Brenna that the eastern bridge is closed. He repeats to Brenna that the eastern bridge is closed.", expected: [tell], gold_quotes: ["Nicco tells Brenna that the eastern bridge is closed."], source: "Round 2 k02", tags: ["repeated event"] }),
  { ...fromCorpus("kn04", "knowledge", ["incomplete action"]), id: "r2_k03_abandoned" },
  { ...fromCorpus("kp02", "knowledge", ["pronoun", "relative clause"], [tell]), id: "r2_k04_pronoun" },
  c("r2_k05_one_recipient", "knowledge", { input: TELL, narration: 'Gerome stands beside the window. Nicco turns to Brenna. "The eastern bridge is closed," he tells her. Maren listens from her chair.', expected: [tell], gold_quotes: ['"The eastern bridge is closed," he tells her.'], source: "Round 2 k05", tags: ["multi-person attribution", "pronoun"] }),
  { ...fromCorpus("kn20", "knowledge", ["wrong source"]), id: "r2_k06_wrong_source" },
  c("r2_r01_affection", "relationships", { narration: "Brenna embraces Nicco.", expected: [affection], source: "Round 2 r01" }),
  c("r2_r02_trust", "relationships", { narration: "Brenna confides in Nicco about her past.", expected: [trust], source: "Round 2 r02" }),
  c("r2_r04_politeness", "relationships", { input: "I smile at Brenna.", narration: "Brenna politely nods. She remains seated.", source: "Round 2 r04", tags: ["politeness is not a relationship"] }),
  c("r2_r05_intense_implication", "relationships", { input: "I promise Brenna that I will keep her safe.", narration: "Nicco promises Brenna that he will keep her safe. The words hang in the room. For a moment, everything seems different.", source: "Round 2 r05", tags: ["implication"] }),
  c("r2_m01_independent_return", "movement_time", { narration: "Maren walks back into the Observation room. Nicco remains by the window.", fixture: { kind: "household", maren_at_hall: true }, optional: [RETURN_MOVE], source: "Round 2 m01", tags: ["engine-owned movement"] }),
  c("r2_m02_refusal", "movement_time", { input: "Dell, leave the room right now.", narration: 'Dell shakes his head. "No. I am staying here." He stays in the Observation room.', fixture: { kind: "household", dell: true }, source: "Round 2 m02", tags: ["negation"] }),
  c("r2_m03_temporary_exit", "movement_time", { input: "*Nicco watches him.*", narration: "Dell drains the last of his ale, shrugs into his coat and walks out into the night.", fixture: { kind: "household", dell: true }, expected: [{ kind: "leave_scene", character_id: DELL }], source: "Round 2 m03" }),
  c("r2_m04_ambiguous_departure", "movement_time", { input: "Dell, leave the room right now.", narration: "Dell looks toward the door, then reaches for his coat as if he might leave.", fixture: { kind: "household", dell: true }, source: "Round 2 m04", tags: ["future vs completed"] }),
  c("r2_x01_valid_and_incomplete", "multi_mutation", { input: TELL, narration: "Nicco tells Brenna that the eastern bridge is closed. Maren looks toward the stairs, as if she might go downstairs later.", expected: [tell], gold_quotes: ["Nicco tells Brenna that the eastern bridge is closed."], source: "Round 2 x01" }),
  c("r2_x02_knowledge_affection", "multi_mutation", { input: TELL, narration: "Nicco tells Brenna that the eastern bridge is closed. Brenna embraces Nicco.", expected: [tell, affection], gold_quotes: ["Nicco tells Brenna that the eastern bridge is closed.", "Brenna embraces Nicco."], source: "Round 2 x02" }),
  c("r2_x03_knowledge_movement", "multi_mutation", { input: TELL, narration: "Maren walks back into the Observation room. Nicco tells Brenna that the eastern bridge is closed. Gerome remains by the window.", fixture: { kind: "household", maren_at_hall: true }, expected: [tell], optional: [RETURN_MOVE], gold_quotes: ["Nicco tells Brenna that the eastern bridge is closed."], source: "Round 2 x03" }),
  c("r2_x04_subset_items", "multi_mutation", { input: "I give boots to Brenna.", narration: "Maren studies the ring in Nicco's hand. Brenna takes the boots from Nicco. Gerome stands by the window. Nicco plans a trip to the docks tomorrow.", expected: [transfer("boots")], gold_quotes: ["Brenna takes the boots from Nicco."], source: "Round 2 x04", tags: ["irrelevant mentions"] }),
  c("r2_d01_already_known", "knowledge", { input: TELL, narration: "Nicco tells Brenna that the eastern bridge is closed. He repeats the same fact to her.", fixture: { kind: "household", brenna_knows: true }, source: "Round 2 d01", tags: ["already established"] }),
  c("r2_d02_repeated_item", "items", { input: "I give ring to Brenna.", narration: "Brenna takes the ring from Nicco. The ring is now in her hands; she has taken it.", expected: [transfer("ring")], gold_quotes: ["Brenna takes the ring from Nicco."], source: "Round 2 d02", tags: ["one event described twice"] }),
  c("r2_d03_repeated_embrace", "relationships", { narration: "Brenna embraces Nicco. It is a single embrace, her arms around him for a moment.", expected: [affection], gold_quotes: ["Brenna embraces Nicco."], source: "Round 2 d03", tags: ["one event described twice"] }),
];

/** Sample of the Phase 1O evidence corpus (cases already in Round 2 are not repeated). */
const CORPUS: readonly BenchmarkCase[] = [
  ...[["kn02", "reaction"], ["kn08", "question"], ["kn09", "reported speech"], ["kn10", "reverse direction"], ["kn11", "wrong recipient"], ["kn12", "already knew"], ["kn18", "wrong source"], ["kn22", "told but not heard"], ["kn23", "wrong addressee"], ["kn25", "question"]]
    .map(([id, tag]) => fromCorpus(id!, "knowledge", [tag!])),
  ...["kp03", "kp05", "kp06", "kp08", "kp09"].map(id => fromCorpus(id, "knowledge", ["positive"], [tell])),
  ...[["tr02", "quoted past event"], ["tr04", "accept then return"], ["tr05", "refusal"], ["tr09", "wrong recipient"], ["tr13", "reaches only"], ["tr15", "retraction"], ["tr16", "passive"], ["tr17", "dialogue instruction"], ["tr19", "receipt only in dialogue"]]
    .map(([id, tag]) => fromCorpus(id!, "items", [tag!])),
  fromCorpus("tr12", "ambiguous_language", ["pronoun resolves to another NPC"]),
  ...["tp01", "tp03", "tp05"].map(id => fromCorpus(id, "multi_mutation", ["three items"], garments)),
  fromCorpus("tp04", "ambiguous_language", ["ambiguous them"], garments),
  fromCorpus("tp07", "items", ["act next to dialogue"], [transfer("boots")]),
];

const PUNCH = "*He punches Korvin directly in the face.*";
const KORVIN: BenchmarkFixture = { kind: "canonical_scene", npcs: ["korvin"] };
/** Engine-grounded additions for the remaining categories. */
const ADDED: readonly BenchmarkCase[] = [
  // Items / ownership / possession.
  c("n_item_fronted", "ambiguous_language", { input: "I give boots to Brenna.", narration: "Without a word, Brenna takes the boots from Nicco and sets them beside her chair.", expected: [transfer("boots")], gold_quotes: ["Brenna takes the boots from Nicco"], tags: ["fronted adverbial"], source: "tests/turn-fixtures.ts boots transfer, fronted variant" }),
  c("n_item_take_from_npc", "ownership", { input: "*accepts Brenna's worn boots*", narration: "Brenna unlaces her worn boots, pulls them off and hands them to Nicco. He takes them.", expected: [transfer("brenna_boots", "nicco")], gold_quotes: ["Brenna unlaces her worn boots, pulls them off and hands them to Nicco. He takes them."], tags: ["item to Nicco"], source: "CONTROLLER_POLICY hand-to-Nicco rule" }),
  c("n_item_offer_not_accepted", "ownership", { narration: '"Take my boots if you need them," Brenna says, holding her worn boots out toward Nicco. He does not reach for them.', tags: ["offer not accepted"], source: "CONTROLLER_POLICY offer rule" }),
  c("n_item_lend", "ownership", { input: "I lend Brenna the ring for the evening. It stays mine.", narration: "Brenna takes the ring from Nicco, promising to give it back in the morning.", tags: ["lend vs ownership"], source: "authored: lending has no controller vocabulary; ownership must not move" }),
  c("n_item_them_both", "ambiguous_language", { input: "I give boots and ring to Brenna.", narration: "Brenna looks at the boots and the ring, then at Nicco. She takes them both.", tags: ["ambiguous them", "two items", "engine rejects ambiguous plural reference"], source: "corpus tp04 family" }),
  c("n_item_wrong_recipient", "ambiguous_language", { input: "I give ring to Brenna.", narration: "Maren crosses the room. She takes the ring from Nicco's hand before Brenna can reach for it.", tags: ["wrong recipient", "pronoun"], source: "corpus tr09/tr12 family" }),
  c("n_item_theft_unauthorized", "ownership", { input: "I doze off in the chair.", narration: "While Nicco dozes, Brenna slips the ring out of his pocket and tucks it into her sleeve.", tags: ["narrated change without authorization"], source: "CONTROLLER_POLICY player-authorization rule" }),
  c("n_item_contradictory", "items", { input: "I give boots to Brenna.", narration: "Brenna takes the boots from Nicco. A moment later the boots are still in Nicco's hands; she never took them.", tags: ["contradictory narration"], source: "authored" }),
  c("n_item_equip_player", "items", { input: "I put on the ring.", narration: "Nicco slides the ring onto his finger and flexes his hand.", tags: ["equip", "engine-owned natural action"], source: "tests/natural-actions.test.ts family" }),
  c("n_item_unequip_npc", "items", { input: "Brenna, take off your boots and rest.", narration: "Brenna pulls off her worn boots and holds them in her lap.", tags: ["unequip"], source: "authored: an NPC's own unequip is not in the controller vocabulary unless equipping an owned item" }),
  // Economy / legal (engine-owned deterministic actions; correct controller output is empty).
  c("n_money_pay", "economy", { input: "*hands Korvin two gold coins for his trouble*", narration: "Korvin weighs the coins in his palm and pockets them.", fixture: { kind: "market" }, tags: ["money transfer"], source: "tests/household-turns.test.ts market fixture" }),
  c("n_purchase_accept", "economy", { input: "Done. Five.", narration: "Korvin pockets the coins and hands over the key and the papers. Brenna watches the exchange with flat, wary eyes.", fixture: { kind: "market" }, recent: [MARKET_OFFER], tags: ["purchase", "engine-owned"], source: "tests/household-turns.test.ts end-to-end step 2" }),
  c("n_purchase_question", "economy", { input: "How much for her?", narration: '"Five gold," Korvin says. "Papers included."', fixture: { kind: "market" }, recent: [MARKET_OFFER], tags: ["question is not a purchase"], source: "tests/household-turns.test.ts purchase evals" }),
  c("n_sale_others", "economy", { input: "I look around the market.", narration: "A buyer near the pens counts out coins to a clerk and leads away a captive on a rope. The clerk stamps a sheet.", fixture: { kind: "market" }, tags: ["rich prose", "third-party sale"], source: "authored" }),
  c("n_legal_free_without_holding", "household_legal", { input: "*tries to unlock Brenna's collar* You're free.", narration: "Nicco works at the collar's catch, but it holds fast; Korvin's lock does not open for him. Brenna watches, silent.", fixture: { kind: "market" }, tags: ["legal status", "failed act"], source: "authored: manumission is a deterministic player action" }),
  // Household.
  c("n_household_join", "household_legal", { input: "*explains the Heartstone and waits*", narration: 'Brenna rests her palm on the warm stone. "I, Brenna, decide to stay and become a resident. I swear to protect the hearthstone and Nicco, the keeper."', fixture: { kind: "heartstone_brenna" },
    expected: [{ kind: "join_household", household_id: "campaign_household_heartstone", character_id: BRENNA_MARKET }, rel(BRENNA_MARKET, "nicco", "protectiveness")],
    gold_quotes: ["I, Brenna, decide to stay and become a resident.", "I swear to protect the hearthstone and Nicco, the keeper."], tags: ["voluntary join"], source: "tests/household-turns.test.ts end-to-end step 4" }),
  c("n_household_maybe", "household_legal", { input: "You can stay here if you want.", narration: 'Brenna frowns. "Maybe I\'ll stay for now."', fixture: { kind: "heartstone_brenna" }, tags: ["hedged choice"], source: "tests/household-turns.test.ts household choice negatives" }),
  c("n_household_rule", "household_legal", { input: "House rule: nobody lies to family.", narration: "Brenna listens and nods slowly.", expected: [{ kind: "add_household_rule", household_id: HOME, text: "nobody lies to family" }], gold_quotes: ["Brenna listens and nods slowly."], tags: ["rule declaration"], source: "tests/household-turns.test.ts rule evals" }),
  c("n_household_not_rule", "household_legal", { input: "Don't steal my porridge.", narration: "Brenna snorts and pushes the bowl back toward him.", tags: ["ordinary request is not a rule"], source: "tests/household-turns.test.ts rule evals" }),
  c("n_household_leave", "household_legal", { narration: 'Maren stands and faces Nicco. "I am leaving this household. I choose my own road from today."', expected: [{ kind: "leave_household", household_id: HOME, character_id: "maren" }], gold_quotes: ["I am leaving this household."], tags: ["voluntary leave"], source: "CONTROLLER_POLICY leave_household rule" }),
  // Relationships.
  c("n_rel_shield", "relationships", { narration: "A sudden crash below makes Maren jump. Brenna steps between Maren and the door, shielding her.", expected: [rel("brenna", "maren", "protectiveness")], gold_quotes: ["Brenna steps between Maren and the door, shielding her."], tags: ["multi-person attribution"], source: "tests/household-turns.test.ts relationship evals" }),
  c("n_rel_flinch", "relationships", { narration: "Nicco reaches toward her shoulder to brush away the dust. Brenna flinches away from Nicco.", expected: [rel("brenna", "nicco", "wariness")], gold_quotes: ["Brenna flinches away from Nicco."], tags: ["fronted clause"], source: "CONTROLLER_POLICY wariness example" }),
  c("n_rel_gift_not_affection", "relationships", { input: "I give ring to Brenna.", narration: "Brenna takes the ring from Nicco and turns it over in her fingers.", expected: [transfer("ring")], gold_quotes: ["Brenna takes the ring from Nicco"], tags: ["gift is not affection"], source: "tests/household-turns.test.ts relationship evals" }),
  c("n_rel_nicco_feelings", "relationships", { input: "*hugs her warmly*", narration: "Nicco hugs Brenna warmly. She stays still in his arms.", tags: ["Nicco's feelings belong to the player"], source: "tests/household-turns.test.ts agency eval" }),
  // Conditions.
  c("n_cond_punch", "conditions", { input: PUNCH, narration: "Nicco's fist catches Korvin across the jaw. Korvin staggers, blood welling from a split lip.", fixture: KORVIN, expected: [{ kind: "set_condition", character_id: "korvin", conditions: ["minor_injury"] }], gold_quotes: ["Korvin staggers, blood welling from a split lip."], source: "tests/live-regression-repair.test.ts physical act" }),
  c("n_cond_no_injury", "conditions", { input: PUNCH, narration: "Nicco's fist glances off Korvin's shoulder. Korvin laughs and shoves him back.", fixture: KORVIN, tags: ["no injury"], source: "tests/live-regression-repair.test.ts physical act negatives" }),
  c("n_cond_knockdown", "conditions", { input: "*shoves Korvin hard*", narration: "Nicco shoves Korvin hard. Korvin stumbles over a crate and is knocked down onto the gravel, winded.", fixture: KORVIN, expected: [{ kind: "set_condition", character_id: "korvin", conditions: ["knocked_down", "winded"] }], gold_quotes: ["Korvin stumbles over a crate and is knocked down onto the gravel, winded."], source: "CONTROLLER_POLICY condition vocabulary" }),
  c("n_cond_restraint", "conditions", { input: "*grabs Korvin and pins his arms*", narration: "Nicco grabs Korvin and pins his arms behind his back. Korvin struggles but cannot break free.", fixture: KORVIN, tags: ["restraint is never recorded"], source: "tests/live-regression-repair.test.ts constraint rejection" }),
  // Movement / time.
  c("n_move_member", "movement_time", { narration: "Maren gets up and walks downstairs into the main hall.", expected: [{ kind: "move_character", character_id: "maren", location_id: "test_hall" }], gold_quotes: ["Maren gets up and walks downstairs into the main hall."], source: "CONTROLLER_POLICY household-member movement" }),
  c("n_move_begun", "movement_time", { narration: "Maren gets up and starts toward the stairs, then hesitates at the top step.", tags: ["movement only begun"], source: "CONTROLLER_POLICY movement negatives" }),
  c("n_move_unknown_destination", "movement_time", { narration: "Maren pulls on her cloak, walks out and disappears into the city.", expected: [{ kind: "leave_scene", character_id: "maren" }], gold_quotes: ["Maren pulls on her cloak, walks out and disappears into the city."], source: "CONTROLLER_POLICY member leaves without destination" }),
  c("n_move_player", "movement_time", { input: "I go downstairs to the main hall.", narration: "Nicco takes the stairs down into the main hall. The hearth is cold and the long table is bare.", tags: ["player travel is engine-owned"], source: "player-travel regression family" }),
  c("n_wait_time", "movement_time", { input: "I wait for an hour.", narration: "An hour passes. The light through the window shifts slowly across the floorboards.", tags: ["time advance is engine-owned"], source: "temporal action regression family" }),
  c("n_first_name", "ambiguous_language", { input: "*watches them*", narration: "Dell Harrow drains his ale and walks out into the night. Dell Marsh stays at the table.", fixture: { kind: "household", dell: true, dell_marsh: true }, expected: [{ kind: "leave_scene", character_id: DELL }], gold_quotes: ["Dell Harrow drains his ale and walks out into the night."], tags: ["first-name ambiguity"], source: "Round 2 m03 variant with a second Dell" }),
  // Scheduled events.
  c("n_schedule", "movement_time", { input: '/schedule campaign_event_hall_meeting "Meeting in the main hall" at 400 with brenna,nicco', narration: "Brenna nods. Brenna agrees to meet at world minute 400.", expected: [{ kind: "schedule_event", id: "campaign_event_hall_meeting", title: "Meeting in the main hall", scheduled_world_minute: 400, participants: ["brenna", "nicco"] }], gold_quotes: ["Brenna agrees to meet at world minute 400."], tags: ["scheduled event", "slash command"], source: "src/turn/player-intent.ts /schedule grammar" }),
  c("n_schedule_vague", "movement_time", { input: "Brenna, let's meet tomorrow sometime.", narration: '"Tomorrow, then," Brenna says.', tags: ["no absolute minute"], source: "CONTROLLER_POLICY no date guessing" }),
  // Multi-mutation.
  c("n_multi_three", "multi_mutation", { input: "I give boots to Brenna.", narration: "Brenna takes the boots from Nicco, then confides in Nicco about her past and embraces him.", expected: [transfer("boots"), trust, affection], gold_quotes: ["Brenna takes the boots from Nicco", "confides in Nicco about her past", "embraces him"], source: "authored multi-event" }),
  c("n_multi_cond_hostility", "multi_mutation", { input: PUNCH, narration: "Nicco's fist catches Korvin across the jaw. Korvin staggers, blood welling from a split lip. Korvin attacks Nicco.", fixture: KORVIN,
    expected: [{ kind: "set_condition", character_id: "korvin", conditions: ["minor_injury"] }, rel("korvin", "nicco", "hostility")], gold_quotes: ["Korvin staggers, blood welling from a split lip.", "Korvin attacks Nicco."], source: "physical act + attack relationship" }),
  // No mutation despite rich prose.
  c("n_rich_prose", "no_op", { input: "I look out of the window.", narration: "Rain beads on the arched window. Below, the courtyard is slick and empty; somewhere a door bangs in the wind. Brenna sits by the table turning the boots' laces between her fingers, and Maren reads by the hearth glow from downstairs. Gerome stands in his corner, a shape of fitted stone. The ring on the table catches the grey light.", tags: ["rich prose", "item mentions"], source: "authored" }),
  // Ordinary adult/consensual prose (robustness input only).
  c("n_adult_embrace", "relationships", { input: "*kisses Brenna, slow and gentle*", narration: "Brenna answers the kiss, slow and unhurried, then draws Nicco into an embrace, her body warm against his.", expected: [affection], gold_quotes: ["draws Nicco into an embrace"], adult_prose: true, tags: ["adult prose"], source: "authored robustness input" }),
  c("n_adult_noop", "no_op", { input: "*lies beside her*", narration: "Afterwards they lie tangled together in the narrow bed, skin to skin, saying nothing. Rain ticks against the arched window.", adult_prose: true, tags: ["adult prose"], source: "authored robustness input" }),
  c("n_adult_item", "items", { input: "I give ring to Brenna.", narration: "Still flushed from the night before, Brenna takes the ring from Nicco and closes her hand around it, smiling.", expected: [transfer("ring")], gold_quotes: ["Brenna takes the ring from Nicco"], adult_prose: true, tags: ["adult prose"], source: "authored robustness input" }),
];
export const BENCHMARK_CASES: readonly BenchmarkCase[] = Object.freeze([...ROUND_2, ...CORPUS, ...ADDED]);
export { OFFER as GARMENT_OFFER };
