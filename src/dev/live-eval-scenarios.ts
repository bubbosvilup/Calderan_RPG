import { CampaignState } from "../campaign/campaign-state.js";
import { createOpeningCampaign } from "../campaign/opening-state.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { WorldStore } from "../world/world-store.js";
import { loadWorld } from "../world/loader.js";
import { turnFixture } from "./turn-fixture.js";

/**
 * Hardening H5 — live evaluation scenario matrix (A–T from the pass brief plus agency, secrecy and continuity extensions). Evaluation
 * scaffolding only: fixtures are the deterministic H1–H4 skeletons (the synthetic turn fixture and the real Calderan market). Nothing
 * here is canon and nothing is written under data/. Expectations are deliberately minimal: `allowed_commit_kinds` is the superset of
 * state changes a faithful turn may commit; anything outside it is flagged for review, never silently accepted.
 */
export const FIXTURE_SECRET = "HIDDEN_SECRET_SENTINEL";
export interface LiveScenario {
  readonly id: string; readonly label: string; readonly turns: readonly string[]; readonly critical: boolean;
  readonly family: "fixture" | "market" | "opening" | "household" | "canon_household" | "reflection_household";
  readonly options?: { readonly ironboundKnownBy?: readonly string[]; readonly groundGarments?: boolean; readonly at_market?: boolean };
  /** Authorized command kinds that a faithful run may commit; others are flagged `unexpected_commit`. */
  readonly allowed_commit_kinds: readonly string[];
  /** Eval-only context-size inflation (Q). */
  readonly inflate_facts?: number;
  readonly human_review?: readonly string[];
  /** NPC+ Pass 6: eval-only authoritative history seeded before play (household families only). */
  readonly seed?: readonly CampaignCommand[];
}
const NONE: readonly string[] = ["runtime_delta"];
const MARKET_FIRST = "*checks the cages* Korvin, what about the woman in the cage?";
export const LIVE_SCENARIOS: readonly LiveScenario[] = [
  { id: "A_conversation", label: "simple conversation", family: "fixture", turns: ["Hello, Brenna. How are you feeling today?"], critical: false, allowed_commit_kinds: NONE },
  { id: "B_movement", label: "simple movement", family: "fixture", turns: ["I leave the room and go downstairs to the main hall."], critical: true, allowed_commit_kinds: ["runtime_delta"] },
  { id: "C_follower", label: "movement + follower", family: "fixture", turns: ["Come with me, Brenna. Let's go down to the main hall together."], critical: true, allowed_commit_kinds: ["runtime_delta", "move_character"] },
  { id: "D_carrying", label: "carrying", family: "fixture", turns: ["Maren has twisted her ankle. I lift her carefully and carry her down to the main hall."], critical: true, allowed_commit_kinds: ["runtime_delta", "move_character", "set_condition"] },
  { id: "E_handover", label: "item handover", family: "fixture", turns: ["I give boots to Brenna."], critical: true, allowed_commit_kinds: ["runtime_delta", "transfer_item", "place_item"] },
  { id: "F_negotiation", label: "purchase negotiation", family: "market", turns: [MARKET_FIRST, "Name your price, Korvin."], critical: true, allowed_commit_kinds: NONE },
  { id: "G_purchase", label: "purchase completion", family: "market", turns: [MARKET_FIRST, "Name your price, Korvin.", "Done. *pays him and takes the key*"], critical: true,
    allowed_commit_kinds: ["runtime_delta", "transfer_person", "adjust_funds", "set_funds", "record_transaction", "set_legal_status"] },
  { id: "H_late_naming", label: "naming / late naming", family: "market", turns: [MARKET_FIRST, "Name your price, Korvin.", "Done. *pays him and takes the key*", "I crouch beside her. \"What should I call you?\""], critical: true,
    allowed_commit_kinds: ["runtime_delta", "transfer_person", "adjust_funds", "set_funds", "record_transaction", "set_legal_status", "set_character_name", "rename_character", "promote_character"], human_review: ["identity continuity"] },
  { id: "I_household", label: "household declaration", family: "opening", turns: ["House rule: no weapons are allowed inside Heartstone Tower."], critical: false, allowed_commit_kinds: ["runtime_delta", "add_household_rule"] },
  { id: "J_relationship", label: "relationship-affecting interaction", family: "fixture", turns: ["I gently tend Brenna's sore arm. She lets me, and thanks me quietly."], critical: false, allowed_commit_kinds: ["runtime_delta", "adjust_relationship", "set_condition"] },
  { id: "K_lore", label: "lore question triggering retrieval", family: "fixture", turns: ["What do I know about Ironbound?"], critical: false, allowed_commit_kinds: NONE },
  { id: "L_restricted", label: "restricted known_by disclosure", family: "fixture", options: { ironboundKnownBy: ["brenna"] }, critical: true,
    turns: ["Brenna, what do you know about the Ironbound guild?", "Gerome, what do you know about the Ironbound guild?", "Brenna, what secret is Maren keeping from me?"], allowed_commit_kinds: ["runtime_delta", "set_knowledge"],
    human_review: ["paraphrased leakage of HIDDEN_SECRET_SENTINEL / Ironbound to a non-holder"] },
  { id: "M_ambiguous", label: "ambiguous / no-state dialogue", family: "fixture", turns: ["I look around the room and say nothing in particular."], critical: false, allowed_commit_kinds: NONE },
  { id: "N_refusal", label: "refusal / hesitation / failed action", family: "fixture", turns: ["I hold the ring out toward Brenna and wait to see what she does."], critical: true, allowed_commit_kinds: ["runtime_delta", "transfer_item"], human_review: ["Nicco agency"] },
  { id: "O_departure", label: "scene departure", family: "fixture", turns: ["Gerome, you may go now. Leave the room."], critical: true, allowed_commit_kinds: ["runtime_delta", "move_character", "leave_scene"] },
  { id: "P_player_physical", label: "player-authored physical interaction", family: "fixture", turns: ["I playfully shove Maren's shoulder and she stumbles a step."], critical: false, allowed_commit_kinds: ["runtime_delta", "set_condition"] },
  { id: "Q_context_heavy", label: "context-heavy scene", family: "fixture", inflate_facts: 60, turns: ["What is everyone in the room doing right now?"], critical: false, allowed_commit_kinds: NONE },
  { id: "R_retrieval_heavy", label: "retrieval-heavy lore turn", family: "fixture", turns: ["Tell me everything you can about Ironbound and the eastern bridge."], critical: false, allowed_commit_kinds: NONE },
  { id: "S_reconciliation", label: "reconciliation-provoking", family: "fixture", turns: ["I give the boots to Brenna and the ring to Gerome at the same moment."], critical: true, allowed_commit_kinds: ["runtime_delta", "transfer_item", "place_item"] },
  { id: "T_noop", label: "no-op conversational turn", family: "fixture", turns: ["*stays quiet for a moment, thinking*"], critical: false, allowed_commit_kinds: NONE },
  // Extensions: player agency (§24), secrecy (§23) and character continuity (§25).
  { id: "U_agency_offer", label: "agency: Nicco is offered something", family: "fixture", turns: ["I wait to see what Brenna does next."], critical: true, allowed_commit_kinds: NONE, human_review: ["Nicco agency"] },
  { id: "V_agency_threat", label: "agency: Nicco is threatened", family: "fixture", turns: ["I stay still and watch Gerome."], critical: true, allowed_commit_kinds: ["runtime_delta", "set_condition"], human_review: ["Nicco agency"] },
  { id: "W_agency_follow", label: "agency: NPC asks Nicco to follow", family: "fixture", turns: ["I listen to what Maren says."], critical: true, allowed_commit_kinds: ["runtime_delta"], human_review: ["Nicco agency"] },
  { id: "X_secret_holder", label: "secrecy: holder asked about own private canon", family: "fixture", turns: ["Maren, is there something you have been keeping to yourself?"], critical: true, allowed_commit_kinds: ["runtime_delta", "set_knowledge"], human_review: ["holder reveal appropriateness"] },
  { id: "Y_left_behind", label: "continuity: character left behind, return", family: "fixture", turns: ["I go down to the main hall alone.", "I go back up to the room. Who is here?"], critical: true, allowed_commit_kinds: ["runtime_delta", "move_character"], human_review: ["character resurrection / wrong location"] },
  // NPC+ Pass 2 household matrix: the fixture with a household Nicco keeps; Brenna, Maren and Gerome are active NPC+.
  { id: "HH_A_one", label: "NPC+: conversation with one member", family: "household", turns: ["Brenna, how are you settling in here?"], critical: false, allowed_commit_kinds: NONE },
  { id: "HH_B_group", label: "NPC+: conversation with three members", family: "household", turns: ["Everyone, gather round. How is the household holding up?"], critical: false, allowed_commit_kinds: NONE },
  { id: "HH_C_relationship", label: "NPC+: relationship-affecting interaction", family: "household", turns: ["I thank Maren warmly for looking after Brenna while she was ill."], critical: true, allowed_commit_kinds: ["runtime_delta", "adjust_relationship"], human_review: ["relationship change evidence"] },
  { id: "HH_D_follow", label: "NPC+: movement and following", family: "household", turns: ["I go down to the main hall. Brenna, come with me."], critical: true, allowed_commit_kinds: ["runtime_delta", "move_character"], human_review: ["follow evidence / state agreement"] },
  { id: "HH_E_rule", label: "NPC+: explicit household rule", family: "household", turns: ["House rule: everyone eats together at sundown."], critical: false, allowed_commit_kinds: ["runtime_delta", "add_household_rule"] },
  { id: "HH_F_self", label: "NPC+: explicit self-description", family: "household", turns: ["Brenna, tell me plainly: what is something you would never do?"], critical: true, allowed_commit_kinds: ["runtime_delta", "establish_character_contract"], human_review: ["contract only from explicit self-description"] },
  { id: "HH_G_private", label: "NPC+: private-memory relevance", family: "household", turns: ["Maren, is there something you have been keeping to yourself?"], critical: true, allowed_commit_kinds: ["runtime_delta", "set_knowledge", "establish_character_contract"], human_review: ["secret sentinel / holder reveal"] },
  { id: "HH_H_unrelated", label: "NPC+: unrelated deep-memory case", family: "household", turns: ["What is the weather like outside today?"], critical: false, allowed_commit_kinds: NONE },
  // NPC+ Pass 3 real-canon household: Korvin (authored, public entity canon + a private chunk) is an active NPC+ of Heartstone.
  { id: "CH_public", label: "NPC+ canon: public recovery (Korvin away)", family: "canon_household", turns: ["What do I know about Korvin's trade at the market?"], critical: true, allowed_commit_kinds: NONE, human_review: ["recovered public canon used correctly"] },
  { id: "CH_private", label: "NPC+ canon: private canon (Korvin present)", family: "canon_household", options: { at_market: true }, turns: ["Korvin, have you ever lost someone close to you?"], critical: true, allowed_commit_kinds: ["runtime_delta", "establish_character_contract"], human_review: ["private canon only in Korvin's own voice"] },
  { id: "CH_unrelated", label: "NPC+ canon: unrelated question", family: "canon_household", turns: ["What is the weather like today?"], critical: false, allowed_commit_kinds: NONE },
  // NPC+ Pass 6 reflection matrix: household with Brenna and Maren as NPC+, seeded with committed developments so reflection is due.
  { id: "RF_care", label: "reflection: repeated care/help", family: "reflection_household", turns: ["Brenna, how is your arm today?"], critical: true, allowed_commit_kinds: NONE,
    seed: [rel("brenna", "trust"), rel("brenna", "trust"), rel("brenna", "affection"), cond("brenna", ["recovering", "injured"]), cond("brenna", ["recovering"]), rule("We share tea together at sundown.")] },
  { id: "RF_disagree", label: "reflection: disagreement", family: "reflection_household", turns: ["Brenna, are you still angry about this morning?"], critical: true, allowed_commit_kinds: NONE,
    seed: [rel("brenna", "trust"), rel("brenna", "hostility"), rel("brenna", "wariness"), rel("brenna", "respect")] },
  { id: "RF_protect", label: "reflection: protection", family: "reflection_household", turns: ["Maren, thank you for watching over Brenna."], critical: true, allowed_commit_kinds: NONE,
    seed: [rel("maren", "protectiveness", "brenna"), rel("maren", "protectiveness", "brenna"), rel("maren", "trust"), rel("maren", "respect")] },
  { id: "RF_ritual", label: "reflection: recurring ritual", family: "reflection_household", turns: ["Is the tea ready yet?"], critical: true, allowed_commit_kinds: NONE,
    seed: [rule("We share tea together at sundown."), rule("The lamps are lit together at dusk."), rel("brenna", "affection"), rel("maren", "affection")] },
  { id: "RF_contra", label: "reflection: contradictory pattern", family: "reflection_household", turns: ["Brenna, can I help you with that?"], critical: true, allowed_commit_kinds: NONE,
    seed: [rel("brenna", "trust"), rel("brenna", "wariness"), rel("brenna", "trust"), rel("brenna", "wariness")] },
  { id: "RF_unrelated", label: "reflection: unrelated conversation", family: "reflection_household", turns: ["What is the weather like outside today?"], critical: false, allowed_commit_kinds: NONE,
    seed: [rel("brenna", "trust"), rel("maren", "trust"), rel("brenna", "respect")] },
  { id: "Z_two_names", label: "continuity: similarly named people, pronouns", family: "fixture", turns: ["I ask Maren to tell Brenna to come closer, then I ask her what she thinks of him."], critical: false, allowed_commit_kinds: ["runtime_delta", "move_character"], human_review: ["identity merge"] },
];
function rel(from: string, dimension: "trust" | "wariness" | "affection" | "protectiveness" | "respect" | "hostility", to = "nicco"): CampaignCommand { return { kind: "adjust_relationship", from_character_id: from, to_character_id: to, dimension, direction: "raise" }; }
function cond(id: string, conditions: string[]): CampaignCommand { return { kind: "set_condition", character_id: id, conditions }; }
function rule(text: string): CampaignCommand { return { kind: "add_household_rule", household_id: "campaign_household_eval", text }; }
export interface BuiltScenario { readonly world: WorldStore; readonly campaign: CampaignState }
let realWorld: Promise<WorldStore> | undefined;
export async function buildScenario(s: LiveScenario, run: number): Promise<BuiltScenario> {
  if (s.family === "canon_household") {
    realWorld ??= loadWorld("data");
    const world = await realWorld, campaign = createOpeningCampaign(world, `h5_${s.id.toLowerCase()}_${run}`);
    campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "join_household", household_id: "campaign_household_heartstone", character_id: "korvin" }] });
    if (s.options?.at_market) campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }] });
    return { world, campaign };
  }
  if (s.family === "household" || s.family === "reflection_household") {
    const { world, campaign } = turnFixture(false, s.options?.ironboundKnownBy ? { ironboundKnownBy: s.options.ironboundKnownBy } : {});
    campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "create_household", id: "campaign_household_eval", name: "Tower" },
      { kind: "set_membership", household_id: "campaign_household_eval", membership: { character_id: "nicco", status: "member", role: "owner" } }] });
    campaign.apply({ expected_revision: campaign.revision, commands: (s.family === "reflection_household" ? ["brenna", "maren"] : ["brenna", "maren", "gerome"]).map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_eval", character_id })) });
    // Seeded history is spread over time (half a day apart), so reflection does not read eval seeding as "all at once".
    for (const c of s.seed ?? []) campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 720 } }, c] });
    return { world, campaign };
  }
  if (s.family === "fixture") {
    const { world, campaign } = turnFixture(s.options?.groundGarments ?? false, s.options?.ironboundKnownBy ? { ironboundKnownBy: s.options.ironboundKnownBy } : {});
    if (s.inflate_facts) {
      const commands: CampaignCommand[] = [];
      for (let i = 0; i < s.inflate_facts; i++) commands.push({ kind: "create_fact", fact: { id: `campaign_fact_h5_${i}`, content: { kind: "campaign", statement: `Evaluation filler fact number ${i} about the hall's furnishings.`, truth: "true" } } },
        { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: `campaign_fact_h5_${i}`, status: "knows" } });
      campaign.apply({ expected_revision: campaign.revision, commands });
    }
    return { world, campaign };
  }
  realWorld ??= loadWorld("data");
  const world = await realWorld, campaign = createOpeningCampaign(world, `h5_${s.id.toLowerCase()}_${run}`);
  if (s.family === "market") campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } },
    { kind: "register_character", character: { id: "campaign_character_brenna", origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 29 } }, current: { current_location: "calderan_slave_market", status: "active" } } },
    { kind: "set_legal_status", character_id: "campaign_character_brenna", status: "enslaved", holder_id: "korvin" }] });
  return { world, campaign };
}
