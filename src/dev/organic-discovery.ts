import type { CampaignCommand, CampaignSnapshot, RelationshipDimension } from "../campaign/types.js";
import { RELATIONSHIP_LEVELS } from "../campaign/types.js";
import { activeNpcPlus } from "../campaign/premium-characters.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import { buildTurnContext } from "../turn/context-builder.js";
import { verifyRelationshipEvidence } from "../turn/household-evidence.js";
import { contractCommands } from "../turn/character-contracts.js";
import { dialogueFocused } from "../turn/prompt-builder.js";
import { blankQuotes, escapeRegExp as esc, quotedSpans, sentencesOf } from "../turn/language/text.js";
import type { AuthorizationDiagnostic, TurnResult } from "../turn/turn-types.js";
import { characterLocation } from "../turn/character-movement.js";
import { invitedFollowers } from "../turn/follow-invitation.js";

/**
 * NPC+ Pass 8 — organic development discovery. EVALUATION ONLY: never imported by gameplay, never called from runTurn, never mutates
 * a campaign. It reads a completed turn (the TurnResult already published) plus the base/final snapshots and locates where a
 * meaningful NPC+ interaction stops on its way to recorded history:
 *
 *   narrated interaction → verifier-usable evidence → controller proposal → authorization → commit → PremiumHistoryEntry
 *
 * The verifier probe runs the SAME deterministic verifiers gameplay uses (relationship quote verifier, completed-movement grammar,
 * contract patterns) over every delivered sentence, i.e. "had the controller proposed this, would it have verified?". Interaction
 * classes are a deliberately broad lexical net over NPC+-led acts and attributed speech: a class hit is a CANDIDATE, not evidence,
 * and its outcome is provisional until human review. `diagnostics` holds ids, class names, check names and counts only;
 * sentence text exists only in `review`, a separate evaluation artifact.
 */
export const OUTCOMES = ["NO_STATE_EXPECTED", "VALID_EVIDENCE_NOT_DETECTED", "EVIDENCE_DETECTED_NO_PROPOSAL", "PROPOSED_BUT_REJECTED", "COMMITTED_EXISTING_DOMAIN", "MISSING_DOMAIN_REPRESENTATION"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type InteractionClass = "help_given" | "help_accepted" | "protect" | "defend_member" | "refusal" | "disagreement" | "apology" | "gratitude" | "practical_care"
  | "following" | "staying" | "food_sharing" | "chore" | "responsibility" | "boundary" | "trust_statement" | "distrust_statement" | "affection_act" | "hostility_act" | "vulnerability"
  | "fulfilled_care";
type Domain = "relationship" | "movement" | "none";
type Step = { readonly dimension: RelationshipDimension; readonly direction: "raise" | "lower" };
/**
 * Which existing authoritative domain could represent each class, and which relationship steps the verifier vocabulary maps it to.
 * `strong`: a hit with no evidence is flagged for review as a possible VALID_EVIDENCE_NOT_DETECTED. Weak classes (politeness,
 * ordinary help, disagreement) are NO_STATE_EXPECTED unless the verifier itself found evidence — politeness never mutates state.
 */
const CLASSES: Readonly<Record<InteractionClass, { readonly domain: Domain; readonly steps?: readonly Step[]; readonly strong?: boolean; readonly speech?: RegExp; readonly act?: RegExp }>> = {
  // Narration alternates present and past tense: verbs are stems with suffixes (\w*) plus explicit irregular pasts.
  protect: { domain: "relationship", steps: [{ dimension: "protectiveness", direction: "raise" }], strong: true,
    act: /\b(?:protect\w*|shield\w*|(?:step\w*|stood|stand\w*|put\w*|plac\w*) (?:herself |himself |itself )?(?:in front of|between)|(?:stand\w*|stood) guard)\b/i, speech: /\b(?:I'll (?:protect|keep you safe|look after you)|no one (?:will )?(?:hurt|touch)s? you)\b/i },
  defend_member: { domain: "relationship", steps: [{ dimension: "protectiveness", direction: "raise" }], strong: true,
    speech: /\b(?:leave (?:her|him) (?:alone|be)|(?:she|he) (?:didn't|did not) mean|don't (?:blame|be hard on) (?:her|him)|(?:she|he)'s right)\b/i, act: /\bdefend\w*\b/i },
  trust_statement: { domain: "relationship", steps: [{ dimension: "trust", direction: "raise" }], strong: true, speech: /\b(?:I trust (?:you|him|her)|I believe you|I can (?:rely|count) on you|I do trust)\b/i },
  distrust_statement: { domain: "relationship", steps: [{ dimension: "trust", direction: "lower" }, { dimension: "wariness", direction: "raise" }], strong: true,
    speech: /\b(?:I (?:don't|do not|can'?t|cannot) (?:fully |quite |yet )?trust|you lied|I don't believe you)\b/i, act: /\b(?:eye\w* (?:him|her|nicco) warily|(?:keep\w*|kept) (?:her|his|its) distance|flinch\w*|recoil\w*)\b/i },
  vulnerability: { domain: "relationship", steps: [{ dimension: "trust", direction: "raise" }], strong: true,
    act: /\b(?:confid\w*|open\w* up|(?:tell\w*|told) (?:him|nicco) about (?:her|his) (?:past|family|fear)|(?:let|lets|letting) (?:her|his) guard down)\b/i, speech: /\b(?:I've never told anyone|I was (?:afraid|scared)|I'm (?:afraid|scared)(?! (?:I|that|of the))|the truth is)\b/i },
  affection_act: { domain: "relationship", steps: [{ dimension: "affection", direction: "raise" }], strong: true,
    act: /\b(?:hug\w*|embrac\w*|lean\w* (?:into|against) (?:him|her|nicco)|rest\w* (?:her|his) head|squeez\w* (?:his|her) hand|(?:take\w*|took) (?:his|her) hand)\b/i, speech: /\b(?:I care about you|I love you|I'm fond of you)\b/i },
  hostility_act: { domain: "relationship", steps: [{ dimension: "hostility", direction: "raise" }], strong: true, act: /\b(?:shov\w*|strik\w*|struck|slap\w*|spit\w* at|spat at|glar\w* (?:at )?(?:him|her|nicco))\b/i, speech: /\bI hate you\b/i },
  apology: { domain: "relationship", steps: [{ dimension: "hostility", direction: "lower" }], speech: /\b(?:I'm sorry|I am sorry|sorry,|forgive me|I apologi[sz]e)\b/i, act: /\bapologi\w*/i },
  help_accepted: { domain: "relationship", steps: [{ dimension: "trust", direction: "raise" }], act: /\b(?:accept\w* (?:his|the|nicco's) (?:help|hand|offer|arm)|(?:let|lets|letting) (?:him|nicco) (?:help|take|carry|hold)|(?:take\w*|took) (?:his|nicco's) arm)\b/i },
  gratitude: { domain: "none", speech: /\b(?:thank\w*|grateful)\b/i, act: /\b(?:thank\w*|grateful|gratitude)\b/i },
  help_given: { domain: "none", act: /\b(?:help\w*|assist\w*|lend\w* a hand|lent a hand|(?:hold\w*|held) (?:the|it) (?:steady|open)|hand\w* (?:him|nicco) (?:a|the))\b/i, speech: /\b(?:let me help|I'll help|I can help)\b/i },
  refusal: { domain: "none", speech: /(?:^|["“]\s*)No[,.!]|\b(?:I'd rather not|I won't|I don't want to|not now)\b/i, act: /\b(?:(?:shak\w*|shook) (?:her|his) head|declin\w*|refus\w*)\b/i },
  disagreement: { domain: "none", speech: /\b(?:I disagree|I don't (?:think|agree)|that's not (?:right|fair|true)|but I (?:think|prefer|like))\b/i, act: /\b(?:disagree\w*|object\w*)\b/i },
  following: { domain: "movement", strong: true, act: /\b(?:follow\w*|(?:come\w*|came|coming) (?:along|with|after)|join\w* (?:him|nicco|them)|f[ae]ll\w* into step|trail\w* (?:after|behind)|walk\w* (?:down|up|beside)|descend\w*|climb\w* (?:the stairs|up|down)|(?:went|go\w*|head\w*) (?:down|up)(?:stairs)?)\b/i },
  staying: { domain: "none", act: /\b(?:stay\w*|remain\w*|(?:keep\w*|kept) (?:her|his|its) (?:seat|place)|(?:does|did)(?: not|n't) (?:follow|rise|move))\b/i, speech: /\b(?:I'll stay|I'd rather stay|I'll remain)\b/i },
  food_sharing: { domain: "none", act: /\b(?:offer\w*|pass\w*|serv\w*|bring\w*|brought|set\w*|pour\w*|slid\w*|tear\w*|tore|shar\w*|cut\w*|ladl\w*|carr\w*)\b[^.!?]{0,40}\b(?:bread|porridge|bowl|plate|cup|mug|tea|kettle|water|soup|cheese|apple|food|meal|loaf|slice|broth|stew)\b/i },
  chore: { domain: "none", act: /\b(?:tid(?:y|ies|ied|ying)|sweep\w*|swept|wip\w*|fold\w*|stack\w*|clear\w*|scrub\w*|wash\w*|arrang\w*|straighten\w*|dust\w*|sort\w*|gather\w* (?:the|up)|position\w*|drag\w*)\b/i },
  practical_care: { domain: "none", act: /\b(?:tuck\w*|drap\w*|blanket|check\w* on|adjust\w* (?:the|a|his|her)|stok\w*|tend\w*|(?:feed\w*|fed|bank\w*) the (?:fire|coals)|pok\w* (?:at )?the (?:fire|embers|coals))\b/i },
  responsibility: { domain: "none", speech: /\b(?:I'll (?:do|take care of|handle|see to|look after|keep an eye on|watch)|leave (?:it|that) (?:to|with) me|(?:it's|that's) my (?:job|task|duty))\b/i },
  // NPC+ Pass 9: observed only (NOT relationship evidence) — care kept over time ("keeps watch over", "stays awake for", "guards overnight").
  fulfilled_care: { domain: "none", act: /\b(?:(?:keep\w*|kept) watch|stay\w* awake|still awake|(?:stand\w*|stood) guard|guard\w* (?:her|him|them|the door)|watch\w* over|(?:sit\w*|sat) up with)\b/i,
    speech: /\b(?:I'll (?:wake you|keep watch|sit with|watch over)|I sleep light)\b/i },
  boundary: { domain: "none", speech: /\b(?:I(?:'d)? prefer|I need (?:some )?(?:space|quiet)|leave me|on my own|by myself|please don't)\b/i },
};
export interface InteractionObservation {
  readonly npc_id: string; readonly class: InteractionClass; readonly source: "act" | "speech"; readonly domain: Domain;
  readonly outcome: Outcome; readonly review_required: boolean;
  /** Where the pipeline stopped: the last stage this interaction reached. */
  readonly stopped_at: "narration" | "evidence" | "proposal" | "authorization" | "commit";
  readonly verifier_checks: readonly string[];
}
export interface RelationshipProbe { readonly from: string; readonly to: string; readonly dimension: RelationshipDimension; readonly direction: "raise" | "lower"; readonly check: string; readonly in_bounds: boolean }
export interface OrganicTurnDiagnostics {
  readonly interactions: readonly InteractionObservation[];
  readonly counts: {
    readonly interaction_candidates: number; readonly relationship_evidence: number; readonly relationship_evidence_out_of_bounds: number; readonly relationship_near_misses: number;
    readonly movement_evidence: number; readonly contract_evidence: number; readonly household_choice_evidence: number; readonly evidence_detections: number;
    readonly follow_invitations: number; readonly proposals: number; readonly npc_proposals: number; readonly authorized: number; readonly rejected: number;
    readonly committed_npc_commands: number; readonly premium_developments: number; readonly condition_issues: number;
    /** NPC+ Pass 9 following: production invitation detector on turns where Nicco moved; committed NPC+ moves; absent_participant issues. */
    readonly outbound_invitations: number; readonly invited_followed: number; readonly npc_moves: number; readonly unrequested_moves: number; readonly absent_participant_issues: number;
  };
  readonly invited_ids: readonly string[]; readonly moved_ids: readonly string[];
  readonly relationship_probes: readonly RelationshipProbe[];
  readonly proposal_kinds: readonly string[]; readonly rejection_reasons: readonly string[]; readonly committed_kinds: readonly string[];
  readonly development_kinds: readonly string[]; readonly motif_tags: readonly { readonly npc_id: string; readonly tag: string }[];
  readonly condition_issues: readonly { readonly npc: string; readonly tag: string }[];
}
export interface OrganicTurnReview {
  readonly narration: string;
  readonly interactions: readonly { readonly npc_id: string; readonly class: InteractionClass; readonly outcome: Outcome; readonly sentence: string }[];
  readonly relationship_probes: readonly (RelationshipProbe & { readonly sentence: string })[];
  readonly condition_issues: readonly { readonly npc: string; readonly tag: string; readonly sentence: string }[];
  readonly contract_near_misses: readonly { readonly npc_id: string; readonly sentence: string }[];
}
/** The parts of a published TurnResult the observer reads. */
export type ObservedTurn = Pick<TurnResult, "narration" | "controller_proposal" | "authorized_commands"> & {
  readonly authorization: readonly Pick<AuthorizationDiagnostic, "command" | "authorized" | "reason">[];
  readonly turn_evidence: Pick<TurnResult["turn_evidence"], "character_movements" | "household_choices">;
  readonly narration_reconciliation?: { readonly issues: readonly { readonly kind: string; readonly character?: string; readonly sentence: string; readonly correction: string }[] };
};

const FOLLOW_INVITE = /\b(?:come (?:back )?(?:up |down )?(?:with|along)|join (?:me|us)|welcome to (?:come|join)|would you (?:like to )?(?:come|walk)|can come with me|take my arm)\b/i;
const CONTRACT_NEAR = /\b(?:I(?:'ve| have) always|I always|I never|I would never|I wouldn't|I'd never|I don't (?:like|trust|care for)|I'm not one to|I've never been)\b/i;
const MOTIFS: readonly { readonly tag: string; readonly act: RegExp }[] = [
  { tag: "brings_food", act: CLASSES.food_sharing.act! },
  { tag: "tends_hearth", act: /\b(?:stok\w*|tend\w*|feed\w*|fed|bank\w*|pok\w*(?: at)?|add\w* (?:a )?(?:log|wood)|kneel\w*|knelt)\b[^.!?]{0,30}\b(?:fire|hearth|embers|coals|flames?)\b/i },
  { tag: "checks_door_window", act: /\b(?:check\w*|glanc\w* (?:at|toward)|clos\w*|latch\w*|look\w* (?:at|toward|out))\b[^.!?]{0,25}\b(?:door|window|latch|shutters?|stairs)\b/i },
  { tag: "tidies", act: CLASSES.chore.act! },
  { tag: "comfort_object", act: /\b(?:clutch\w*|fiddl\w* with|turn\w* (?:over|around)|rub\w*|wrap\w* (?:her|his) (?:hands|fingers) around|cradl\w*|trac\w*)\b[^.!?]{0,25}\b(?:cup|mug|blanket|shawl|ring|sleeve|scars?|wrist|hem|bowl)\b/i },
  { tag: "sits_by_window", act: /\b(?:sit\w*|sat|stand\w*|stood|linger\w*|settl\w*)\b[^.!?]{0,30}\b(?:window|sill)\b/i },
];
const LEVEL = (s: DeepReadonly<CampaignSnapshot>, from: string, to: string, d: RelationshipDimension) =>
  RELATIONSHIP_LEVELS.indexOf(s.relationships.find(e => e.from_character_id === from && e.to_character_id === to)?.dimensions?.[d] ?? "none");
const historyCount = (s: DeepReadonly<CampaignSnapshot>, id: string) => { const p = s.premium_characters.find(x => x.character_id === id); return p ? p.dynamic.recent_developments.length + (p.dynamic.long_term?.entries ?? 0) : 0; };
const UNINFORMATIVE = new Set(["quote_does_not_evidence_this_change", "quote_not_verbatim", "no_quote"]);
const npcOf = (c: CampaignCommand): string | undefined => c.kind === "adjust_relationship" ? c.from_character_id : c.kind === "move_character" || c.kind === "join_household" || c.kind === "leave_household" || c.kind === "establish_character_contract" || c.kind === "set_condition" || c.kind === "leave_scene" ? c.character_id : undefined;

export function observeOrganicTurn(i: { readonly world: WorldStore; readonly before: DeepReadonly<CampaignSnapshot>; readonly after: DeepReadonly<CampaignSnapshot>;
  readonly player_input: string; readonly turn: ObservedTurn }): { readonly diagnostics: OrganicTurnDiagnostics; readonly review: OrganicTurnReview } {
  const { world, before, after, turn } = i, narration = turn.narration;
  const active = [...activeNpcPlus(before)];
  const context = buildTurnContext(world, after);
  const present = new Set(context.characters.map(c => c.id));
  const nameOf = (id: string) => context.characters.find(c => c.id === id)?.profile.name ?? after.characters.find(c => c.id === id)?.profile.name ?? world.getEntity(id)?.name ?? id;
  const npcNames = new Map(active.map(id => [id, nameOf(id)]));
  const byName = (name: string) => [...npcNames].find(([, n]) => n.toLowerCase() === name.toLowerCase())?.[0];

  // Attribution: a sentence led by an NPC+'s name (or by a pronoun right after a sentence led by exactly one NPC+) is that NPC+'s act;
  // speech comes from the existing dialogue attribution. Dialogue is blanked from acts so speech never counts twice.
  const acts: { npc: string; sentence: string }[] = [];
  let previous: string | undefined;
  for (const sentence of sentencesOf(narration)) {
    const plain = blankQuotes(sentence).replace(/^[\s"“”*_(]+/, "");
    const lead = [...npcNames].find(([, n]) => new RegExp(`^${esc(n)}(?:'s)?\\b`, "i").test(plain))?.[0];
    const actor = lead ?? (/^(?:she|he|it)\b/i.test(plain) ? previous : undefined);
    previous = lead ?? (/^nicco\b/i.test(plain) ? undefined : previous);
    if (actor && /[a-z]{3}/i.test(plain)) acts.push({ npc: actor, sentence });
  }
  const speech: { npc: string; sentence: string }[] = [];
  for (const line of dialogueFocused([{ player: "", narration, status: "finalized" }], context)[0]?.npc_dialogue ?? []) {
    const m = line.match(/^(.+?): "(.*)"$/s), npc = m ? byName(m[1]!) : undefined;
    if (npc) for (const part of m![2]!.split(/(?<=[.!?])\s+/)) speech.push({ npc, sentence: part });
  }

  // Verifier probe: every present active NPC+ → every present target, every vocabulary step, every sentence and quoted span.
  const quotes = [...new Set([...sentencesOf(narration).map(s => s.replace(/\s+/g, " ").trim()), ...quotedSpans(narration).map(([s, e]) => narration.slice(s, e).replace(/\s+/g, " ").trim())])].filter(q => q.length >= 8);
  const probes: (RelationshipProbe & { sentence: string })[] = [];
  const STEPS: readonly Step[] = (["trust", "wariness", "affection", "protectiveness", "respect", "fear", "hostility", "romance"] as const).flatMap(dimension => (["raise", "lower"] as const).map(direction => ({ dimension, direction })));
  for (const from of active.filter(id => present.has(id))) for (const to of [...present].filter(id => id !== from)) for (const step of STEPS) {
    const seen = new Set<string>();
    for (const quote of quotes) {
      const ev = verifyRelationshipEvidence({ kind: "adjust_relationship", from_character_id: from, to_character_id: to, ...step }, quote, narration, context);
      if (UNINFORMATIVE.has(ev.check) || seen.has(ev.check)) continue;
      seen.add(ev.check);
      const level = LEVEL(before, from, to, step.dimension), in_bounds = step.direction === "raise" ? level < RELATIONSHIP_LEVELS.length - 1 : level > 0;
      probes.push({ from, to, ...step, check: ev.check, in_bounds, sentence: quote });
    }
  }
  const verified = probes.filter(p => p.check.startsWith("relationship_"));
  const movements = (turn.turn_evidence.character_movements ?? []).filter(m => active.includes(m.character_id));
  const contracts = contractCommands(narration, context, before);
  const choices = (turn.turn_evidence.household_choices ?? []).filter(c => active.includes(c.character_id));

  // Pipeline facts for each NPC+.
  const proposedFor = (npc: string, kind: CampaignCommand["kind"]) => turn.controller_proposal.filter(c => c.kind === kind && npcOf(c) === npc);
  const rejectedFor = (npc: string, kind: CampaignCommand["kind"]) => turn.authorization.filter(d => !d.authorized && d.command.kind === kind && npcOf(d.command) === npc);
  const committedFor = (npc: string, kind: CampaignCommand["kind"]) => turn.authorized_commands.filter(c => c.kind === kind && npcOf(c) === npc);
  const interactions: InteractionObservation[] = [], reviewInteractions: OrganicTurnReview["interactions"][number][] = [];
  const seen = new Set<string>();
  for (const [source, items] of [["act", acts], ["speech", speech]] as const) for (const { npc, sentence } of items) for (const [cls, spec] of Object.entries(CLASSES) as [InteractionClass, (typeof CLASSES)[InteractionClass]][]) {
    const pattern = source === "act" ? spec.act : spec.speech;
    if (!pattern?.test(source === "act" ? blankQuotes(sentence) : sentence) || seen.has(`${npc}:${cls}`)) continue;
    seen.add(`${npc}:${cls}`);
    const kind = spec.domain === "relationship" ? "adjust_relationship" as const : spec.domain === "movement" ? "move_character" as const : undefined;
    const matches = (c: CampaignCommand) => c.kind !== "adjust_relationship" || !spec.steps || spec.steps.some(s => s.dimension === c.dimension && s.direction === c.direction);
    const evidence = spec.domain === "relationship" ? verified.filter(p => p.from === npc && p.in_bounds && spec.steps!.some(s => s.dimension === p.dimension && s.direction === p.direction))
      : spec.domain === "movement" ? movements.filter(m => m.character_id === npc) : [];
    // Weak classes may still be backed by verifier evidence on ANY step for that NPC+ in this turn (e.g. gratitude worded as trust).
    const anyEvidence = verified.some(p => p.from === npc && p.in_bounds);
    const committed = kind ? committedFor(npc, kind).filter(matches) : [];
    const rejected = kind ? rejectedFor(npc, kind).filter(d => matches(d.command)) : [];
    const proposed = kind ? proposedFor(npc, kind).filter(matches) : [];
    const outcome: Outcome = committed.length ? "COMMITTED_EXISTING_DOMAIN" : rejected.length ? "PROPOSED_BUT_REJECTED"
      : evidence.length ? "EVIDENCE_DETECTED_NO_PROPOSAL" : spec.strong ? "VALID_EVIDENCE_NOT_DETECTED" : "NO_STATE_EXPECTED";
    const stopped_at = committed.length ? "commit" : rejected.length ? "authorization" : proposed.length ? "proposal" : evidence.length ? "evidence" : "narration";
    const checks = [...new Set([...probes.filter(p => p.from === npc && spec.steps?.some(s => s.dimension === p.dimension && s.direction === p.direction)).map(p => p.check), ...rejected.map(r => r.reason)])];
    interactions.push({ npc_id: npc, class: cls, source, domain: spec.domain, outcome, review_required: outcome === "VALID_EVIDENCE_NOT_DETECTED" || (!spec.strong && anyEvidence), stopped_at, verifier_checks: checks });
    reviewInteractions.push({ npc_id: npc, class: cls, outcome, sentence });
  }
  const motif_tags = acts.flatMap(({ npc, sentence }) => MOTIFS.filter(m => m.act.test(blankQuotes(sentence))).map(m => ({ npc_id: npc, tag: m.tag })))
    .filter((m, k, all) => all.findIndex(x => x.npc_id === m.npc_id && x.tag === m.tag) === k);
  const conditionIssues = (turn.narration_reconciliation?.issues ?? []).filter(x => x.kind === "uncommitted_condition").map(x => ({
    npc: x.character ?? "?", tag: (x.correction.match(/No lasting ([a-z ]+?) was recorded/) ?? x.correction.match(/suffers no ([a-z ]+?):/))?.[1]?.replace(/ /g, "_") ?? "unknown", sentence: x.sentence }));
  const npcCommands = turn.authorized_commands.filter(c => { const id = npcOf(c); return !!id && active.includes(id); });
  const developments = active.flatMap(id => after.premium_characters.find(p => p.character_id === id)?.dynamic.recent_developments.filter(e => e.revision > before.revision).map(e => e.kind) ?? []);
  const nearMisses = probes.filter(p => !p.check.startsWith("relationship_"));
  // Pass 9: who was invited (the production detector, on the active NPC+ Nicco left behind), and which NPC+ moves committed.
  const origin = before.runtime.scene.player_location, arrival = after.runtime.scene.player_location;
  const leftBehind = origin === arrival ? [] : active.filter(id => characterLocation(before, world, id) === origin).map(id => ({ id, names: [nameOf(id)] }));
  const others = buildTurnContext(world, before).characters.filter(c => c.id !== "nicco" && !leftBehind.some(m => m.id === c.id)).map(c => c.profile.name ?? c.id);
  const invited = invitedFollowers(i.player_input, leftBehind, others);
  const npcMoves = turn.authorized_commands.flatMap(c => c.kind === "move_character" && active.includes(c.character_id) ? [c.character_id] : []);
  const diagnostics: OrganicTurnDiagnostics = {
    interactions, invited_ids: invited, moved_ids: npcMoves,
    counts: { interaction_candidates: interactions.length, relationship_evidence: verified.filter(p => p.in_bounds).length, relationship_evidence_out_of_bounds: verified.filter(p => !p.in_bounds).length,
      relationship_near_misses: nearMisses.length, movement_evidence: movements.length, contract_evidence: contracts.length, household_choice_evidence: choices.length,
      evidence_detections: verified.filter(p => p.in_bounds).length + movements.length + contracts.length + choices.length,
      follow_invitations: FOLLOW_INVITE.test(i.player_input) ? 1 : 0, proposals: turn.controller_proposal.length,
      npc_proposals: turn.controller_proposal.filter(c => { const id = npcOf(c); return !!id && active.includes(id); }).length,
      authorized: turn.authorization.filter(d => d.authorized).length, rejected: turn.authorization.filter(d => !d.authorized).length,
      committed_npc_commands: npcCommands.length, premium_developments: active.reduce((n, id) => n + historyCount(after, id) - historyCount(before, id), 0), condition_issues: conditionIssues.length,
      outbound_invitations: invited.length, invited_followed: invited.filter(id => npcMoves.includes(id)).length, npc_moves: npcMoves.length,
      unrequested_moves: npcMoves.filter(id => !invited.includes(id)).length,
      absent_participant_issues: (turn.narration_reconciliation?.issues ?? []).filter(x => x.kind === "absent_participant").length },
    relationship_probes: probes.map(({ sentence: _s, ...p }) => p), proposal_kinds: turn.controller_proposal.map(c => c.kind),
    rejection_reasons: turn.authorization.filter(d => !d.authorized).map(d => `${d.command.kind}:${d.reason}`), committed_kinds: turn.authorized_commands.map(c => c.kind),
    development_kinds: developments, motif_tags, condition_issues: conditionIssues.map(({ sentence: _s, ...c }) => c),
  };
  return { diagnostics, review: { narration, interactions: reviewInteractions, relationship_probes: probes, condition_issues: conditionIssues,
    contract_near_misses: speech.filter(s => CONTRACT_NEAR.test(s.sentence)).map(s => ({ npc_id: s.npc, sentence: s.sentence })) } };
}

/**
 * Recurrence observation (evaluation only; nothing persists). Counts DISTINCT turns per NPC+ and behavior tag within a session, and
 * the classes that recur with no representing domain. A motif needs at least two distinct turns.
 */
export class MotifTracker {
  readonly #tags = new Map<string, Set<number>>();
  readonly #classes = new Map<string, Set<number>>();
  record(turn: number, d: Pick<OrganicTurnDiagnostics, "motif_tags" | "interactions">): void {
    for (const m of d.motif_tags) { const k = `${m.npc_id}:${m.tag}`; this.#tags.set(k, (this.#tags.get(k) ?? new Set()).add(turn)); }
    for (const x of d.interactions) if (x.domain === "none") { const k = `${x.npc_id}:${x.class}`; this.#classes.set(k, (this.#classes.get(k) ?? new Set()).add(turn)); }
  }
  motifs(min = 2): readonly { readonly npc_id: string; readonly tag: string; readonly turns: readonly number[] }[] {
    return [...this.#tags].filter(([, t]) => t.size >= min).map(([k, t]) => ({ npc_id: k.split(":")[0]!, tag: k.split(":")[1]!, turns: [...t].sort((a, b) => a - b) }));
  }
  /** No-domain classes recurring in >= min distinct turns: candidates for MISSING_DOMAIN_REPRESENTATION, pending human review. */
  unrepresented(min = 3): readonly { readonly npc_id: string; readonly class: string; readonly turns: number }[] {
    return [...this.#classes].filter(([, t]) => t.size >= min).map(([k, t]) => ({ npc_id: k.split(":")[0]!, class: k.split(":")[1]!, turns: t.size }));
  }
}

/** Pipeline/outcome aggregation shared by the live harness and the offline replay (counts only; no text). */
export class DiscoveryAggregate {
  readonly counts: Record<string, number> = {}; readonly outcomes: Record<string, number> = Object.fromEntries(OUTCOMES.map(o => [o, 0]));
  readonly by_class: Record<string, Record<string, number>> = {}; readonly stopped_at: Record<string, number> = {}; readonly verifier_checks: Record<string, number> = {};
  readonly proposal_kinds: Record<string, number> = {}; readonly rejection_reasons: Record<string, number> = {}; readonly development_kinds: Record<string, number> = {};
  readonly condition_issue_tags: Record<string, number> = {}; readonly relationship_probe_checks: Record<string, number> = {};
  add(d: OrganicTurnDiagnostics): void {
    const bump = (r: Record<string, number>, k: string, n = 1) => { r[k] = (r[k] ?? 0) + n; };
    for (const [k, v] of Object.entries(d.counts)) bump(this.counts, k, v);
    for (const x of d.interactions) { bump(this.outcomes, x.outcome); bump(this.by_class[x.class] ??= {}, x.outcome); bump(this.stopped_at, x.stopped_at); for (const c of x.verifier_checks) bump(this.verifier_checks, c); }
    for (const k of d.proposal_kinds) bump(this.proposal_kinds, k);
    for (const k of d.rejection_reasons) bump(this.rejection_reasons, k);
    for (const k of d.development_kinds) bump(this.development_kinds, k);
    for (const c of d.condition_issues) bump(this.condition_issue_tags, c.tag);
    for (const p of d.relationship_probes) bump(this.relationship_probe_checks, `${p.dimension}_${p.direction}:${p.check}${p.in_bounds ? "" : ":out_of_bounds"}`);
  }
}
