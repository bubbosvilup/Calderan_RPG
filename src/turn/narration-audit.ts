import { isDeepStrictEqual } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import type { TurnEvidence } from "./turn-evidence.js";
import type { AuthorizationDiagnostic } from "./turn-types.js";
import type { NarrativeKnowledgeAccess } from "./narrative-authority.js";
import type { SceneParticipantPlan } from "./scene-participants.js";
import { dialogueFocused } from "./prompt-builder.js";
import { CONDITION_TERMS, PHYSICAL_CONDITIONS } from "./physical-interaction.js";
import { verifyEvidence } from "./evidence-authorization.js";
import { itemTerms } from "./item-reference.js";
import type { GenerationRequest } from "../llm/types.js";
import { GATES } from "./language/gates.js";
import { QUOTED_SPAN_SOURCE, escapeRegExp as esc, exactNamePattern, sentencesOf } from "./language/text.js";
import type { RecentExchange } from "./recent-conversation.js";
import { authoredOn, playerAuthoredEvents, SEVERE_TERMS, type PlayerAuthoredEvent, type SevereOutcome } from "./player-authored-events.js";
import { narratedDepartures } from "./scene-departure.js";
import { participatesInScene } from "./scene-participation.js";
import { groundingIssues } from "./grounding-audit.js";
import { readScene } from "./narrated-captives.js";
import { resolveDestination } from "./natural-actions.js";
import { characterLocation, narratedMovements, persistentCharactersAt } from "./character-movement.js";
import { activeNpcPlus } from "../campaign/premium-characters.js";

/**
 * Live NPC Regression Repair 1: deterministic narration audit. Bounded checks over the draft narration against the resolved
 * turn (authorization + prepared state + knowledge access). It never searches for arbitrary meaning: each check targets a
 * structured fact the engine holds. An issue does not change state; it triggers the coordinator's bounded revision, then a
 * deterministic fallback. See docs/architecture/TURN_COORDINATOR.md (Repair 1).
 */
export type AuditIssueKind = "restricted_canon" | "false_premise" | "player_agency" | "asserts_uncommitted_transfer" | "contradicts_committed_transfer" | "private_player_fact" | "household_claim" | "invented_source" | "unsourced_history" | "absent_participant" | "uncommitted_condition" | "uncommitted_constraint"
  | "uncommitted_departure" | "invented_price" | "fabricated_prior_event" | "invented_procedure" | "uncommitted_household" | "asserts_uncommitted_purchase" | "uncommitted_movement";
/** H5.1: `location` is the authoritative place of the character an uncommitted_movement issue is about (display name). */
export interface AuditIssue { readonly kind: AuditIssueKind; readonly sentence: string; readonly character?: string; readonly item_id?: string; readonly location?: string; readonly correction: string }
export interface NarrationAuditInput {
  /** Pass 1.2: the turn's base revision (the projected context's revision is already past it when runtime commands exist). */
  readonly base_revision?: number;
  readonly narration: string; readonly context: TurnContext; readonly world: WorldStore; readonly access: NarrativeKnowledgeAccess;
  readonly evidence: TurnEvidence; readonly diagnostics: readonly AuthorizationDiagnostic[]; readonly committed: readonly CampaignCommand[];
  readonly prepared: DeepReadonly<CampaignSnapshot>; readonly scene?: SceneParticipantPlan;
  /** Repair 1.1: the player's own text. Enables the player-agency check (omitted by callers that only audit knowledge). */
  readonly player_input?: string;
  /** Runtime Continuity Repair 1: delivered recent conversation, the only support for claims about earlier exchanges. */
  readonly recent?: readonly RecentExchange[];
  /** Runtime Continuity Repair 1: serialized authoritative context (state + retrieved canon) that may supply prices or procedures. */
  readonly authoritative_text?: string;
  /** H5.1: where Nicco was before this turn (defaults to the prepared location: no movement this turn). */
  readonly origin?: string;
}

const STOP = new Set(["nicco", "is", "a", "an", "the", "to", "this", "that", "from", "of", "and", "in", "on", "was", "he", "his", "came", "come"]);
/** Common words that alone never signal a private fact ("light" in "in this light"). */
const COMMON = new Set(["light", "world", "another", "other", "new", "place", "man", "person", "people", "good", "time", "day", "house", "home"]);
const GUESS = /\b(?:i (?:think|guess|suppose|reckon|bet|imagine|figure|wager)|if i (?:had|have) to guess|my guess|must be|probably|perhaps|maybe|seems?|seem to|looks? like|look to be|by the look|i'd say|could be|might be)\b|\?/i;
const SOURCE = /\b(?:people (?:say|talk|are (?:saying|talking)|assume|think|reckon|wonder)|(?:some|folk|folks|they) (?:say|assume|think|reckon|figure|have noticed|noticed|talk|are saying)|(?:i(?:'ve| have)? |we(?:'ve| have)? |you(?:'ve| have)? )?heard (?:that|about|of|tell|talk|word|people|it said|some|you(?:'re| are| were| have|'ve| came| arrived| own| hold| took| bought| moved))|(?:as far as|far as|from what|that's what|that is what|what|so) (?:i|we)(?:'ve| have)? heard|i hear (?:you|that|tell)|i'm told|i am told|i was told|word (?:is|has it|around|on the street|travels)|everyone (?:knows|says|is (?:saying|talking))|they(?:'re)? say(?:ing)?|rumou?r\w*|talk (?:is|around|of the)|the registry|registr(?:y|ar)|records? (?:show|say)|documentation|(?:it's|it is) said|gossip\w*|reports? say|whole (?:district|city|market|street)(?:'s| is| has)? (?:been )?(?:talk\w*|abuzz))\b/i;
const ABOUT_NICCO = /\b(?:you|your|yours|yourself|nicco)\b/i;
const CHRONOLOGY = /\b(?:you|nicco)\b[^.!?"]{0,60}\b(?:arrived|came|got here|showed up|moved in|turned up|appeared|walked in)\b[^.!?"]{0,60}\b(?:yesterday|today|this morning|last night|recently|days? ago|a day ago|the other day)\b|\b(?:we(?:'ve| have)? met|i saw you|i've seen you|you came to (?:the|my|our))\b/i;
const SHARED_PAST = /\b(?:yesterday|last (?:night|week|time)|the other day|earlier today|this morning|days? ago|a while back)\b/i;
/** Invented records or witnesses of Nicco's arrival (gates, sponsors, papers, announcements). */
const ARRIVAL_RECORD = /\b(?:(?:spoken|recorded|registered|announced|entered|noted) at (?:any|the|a) gate|announc\w* your arrival|(?:no|without) (?:proper )?(?:introduction|sponsors?|papers|letters|records?|family name)\b[^.!?]{0,60}\b(?:arriv\w*|gate|spoken|announc\w*|registered))/i;
const OWNERSHIP = /\b(?:claims?|claimed|keeps? (?:his|your|its) own|owner|owns|own|holder|holds|master|lord|keeper|landlord|proprietor|inherit\w*|bought|taken ownership|took (?:it|the tower|over)|belongs? to you|yours)\b/i;
const OWNER_ROLE = /\byou(?:'re| are|'ve| have)?\s+(?:(?:the|its|this|that)\s+)?(?:new\s+)?(?:owner|holder|master|lord|keeper|landlord|proprietor)\b|\b(?:the |its |a )new (?:owner|holder|keeper|master|lord|one at the)\b/i;
const HISTORY = /\b(?:stood empty|been empty|was empty|empty for|abandoned|previous (?:owner|keeper|holder|occupant|resident)s?|old (?:owner|keeper|holder)|last (?:owner|keeper|holder|occupant)|former (?:owner|keeper|holder|occupant|resident)s?|lived in (?:it|that|the)|used to live|dead (?:woman|man|owner)|her debts|his debts|its debts|heirs?)\b/i;
const CONSTRAINT_VERB = "(?:seiz\\w*|grab\\w*|grips?|gripp\\w*|pins?|pinn\\w*|restrain\\w*|holds?|holding|held|haul\\w*|drag\\w*|wrestl\\w*|clos\\w* on|clamp\\w* on|hustl\\w*|shov\\w*|throws?|threw|escort\\w*|arrest\\w*|detain\\w*|manacl\\w*|shackl\\w*|bar\\w*|bann\\w*)";
/** Class C/D accomplished on Nicco: the constraint verb takes Nicco as its object, or Nicco is its passive subject. */
const CONSTRAINT = new RegExp(`\\b${CONSTRAINT_VERB}\\b(?:\\s+[\\w']+){0,2}?\\s+nicco\\b|\\bnicco(?:'s)?\\s+(?:is|was|gets|got|being|has been)\\s+(?:\\w+\\s+)?(?:seized|grabbed|held|pinned|restrained|hauled|dragged|thrown|arrested|detained|shackled|manacled|barred|banned|escorted|clapped in irons)\\b|\\bthrown out\\b|\\bin irons\\b`, "i");
const NEGATED = GATES.audit_negated;
/** Runtime Continuity Repair 1: an absent person may be remembered, not placed back in the scene. */
const ABSENCE = /\b(?:had|gone|left|leaving|empty|vacated|absence|absent|earlier|departed|departure|after)\b/i;
/** Functional staff with an individual role (serving, guarding the door, being spoken to). Anonymous patrons are not staff. */
const STAFF = /\b((?:one of (?:the |her |his |[a-z]+'s )|the |a |an |her |his |its |[a-z]+'s |the inn's )(?:[\w-]+ )?(?:serving[- ](?:woman|man|girl|boy|lad|lass|maid|staff|wench)s?|servers?|waiters?|waitress(?:es)?|barmaids?|barm[ae]n|barkeeps?|bartenders?|pot-?boys?|cooks?|kitchen (?:boy|girl|hand|staff)s?|scullions?|stable ?boys?|bouncers?|doorm[ae]n|chambermaids?|maids?|staff|employees?|hired (?:man|hand|help)|serving staff))\b/i;
/** Objects falling or spilling ("the cup falls", "the latch fell back", "knocks over the mug") are not a person's condition. */
const OBJECTS = "cup|mug|drink|glass|tankard|bowl|jug|bottle|plate|ale|stool|chair|coins?|latch|door|notebook|cloth|rag|dice|spoon|tray|bench|candle|lamp|hat|coat|bag|pack";
// NPC+ Pass 8: ambient scenery (light, shadow, dust…) "falling" across something is never a person's condition, even inside a sentence
// a person leads ("He sets it down, so the light falls across the surface").
const AMBIENT = "light|sunlight|moonlight|lamplight|firelight|candlelight|shadow|shade|glow|dust|ash|rain|snow|silence|quiet|hush|darkness|dusk|gloom";
const OBJECT_MOTION = new RegExp(`\\b(?:${OBJECTS}|${AMBIENT})s?\\b[^.!?,;]{0,40}?\\b(?:falls?|fell|falling|topples?|toppled|tumbl\\w*|clatter\\w*|rolls?|rolled|spill\\w*|spilt|drip\\w*|pour\\w*|splash\\w*|slosh\\w*|drops?|dropped)\\b(?:[^.!?;]{0,60}?\\bto the (?:floor|ground))?|\\bknock\\w*\\s+(?:over\\s+)?(?:the |a |his |her |their |[a-z]+'s )?(?:[\\w']+ )?(?:${OBJECTS})s?\\b(?:\\s+over)?`, "gi");
/** Remove restatements of a player-authored grab or shove on Nicco before the constraint check; escalations remain. */
function withoutAuthoredContact(plain: string, authored: readonly PlayerAuthoredEvent[]): string {
  let text = plain;
  if (authoredOn(authored, "nicco", ["grab"]).length) text = text.replace(/\b(?:grab\w*|grips?|gripp\w*|seiz\w*|holds?|holding|held|clos\w* on|clamp\w* on|clutch\w*)\b/gi, "~");
  if (authoredOn(authored, "nicco", ["shove"]).length) text = text.replace(/\b(?:shov\w*|push\w*)\b/gi, "~");
  return text;
}

/** A cited source, ignoring denials and conditionals ("I haven't heard that gossip", "if you want gossip", "whether people are talking"). */
function citesSource(quote: string): boolean {
  for (const m of quote.matchAll(new RegExp(SOURCE.source, "gi"))) {
    const before = quote.slice(Math.max(0, m.index - 28), m.index);
    if (!GATES.audit_source_denial.test(before)) return true;
  }
  return false;
}
export { sentencesOf };
/**
 * Hardening H3: does text disclose an NPC-private canon record? Strict on purpose: the record's own name (entity label before ":"),
 * or a content bigram from its text whose words include one distinctive word (5+ letters, not common). One shared word is not enough.
 */
function disclosesPrivate(text: string, fact: { readonly id: string; readonly text: string }): boolean {
  const [label = "", ...body] = fact.text.split(": ");
  if (!fact.id.includes(".") && label.length >= 4 && new RegExp(`\\b${esc(label)}\\b`, "i").test(text)) return true;
  const words = contentWords(body.join(": "));
  return words.slice(1).some((w, k) => { const a = words[k]!; return [a, w].some(x => x.length >= 5 && !COMMON.has(x)) && new RegExp(`\\b${esc(a)}\\s+${esc(w)}\\b`, "i").test(text); });
}
const quotesIn = (s: string) => [...s.matchAll(/"([^"\n]*)"|“([^”\n]*)”/g)].map(m => m[1] ?? m[2]!);
const outside = (s: string) => s.replace(new RegExp(QUOTED_SPAN_SOURCE, "g"), " ");
const contentWords = (s: string) => s.toLowerCase().replace(/[^a-z\s']/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

export function auditNarration(input: NarrationAuditInput): readonly AuditIssue[] {
  const { narration, context, world, access, evidence, diagnostics, committed, prepared, scene } = input;
  const issues: AuditIssue[] = [];
  const sentences = sentencesOf(narration);
  const sentenceWith = (fragment: string) => sentences.find(s => s.includes(fragment)) ?? fragment;
  const name = (id: string) => context.characters.find(c => c.id === id)?.profile.name ?? id;
  const itemName = (id: string) => context.items.find(i => i.id === id)?.name ?? id;
  const holder = (id: string) => { const i = prepared.items.find(x => x.id === id); return i && (i.position.kind === "carried" || i.position.kind === "equipped") ? i.position.character_id : undefined; };
  const isCommitted = (c: CampaignCommand) => committed.some(x => isDeepStrictEqual(x.kind === "transfer_item" ? { ...x, acquisition: undefined } : x, c.kind === "transfer_item" ? { ...c, acquisition: undefined } : c) || x.kind === "transfer_item" && c.kind === "transfer_item" && x.item_id === c.item_id && x.owner_id === c.owner_id);

  // 1. Durable transfers: narration must not confirm a transfer that did not commit, nor refuse one that did.
  // Beyond intents and proposals, every possible handover between present people is checked (an NPC offer, or a gift narrated
  // with no intent at all): the narration may not complete one that did not commit.
  const present = context.characters.filter(c => c.id !== "nicco").map(c => c.id);
  const possible: CampaignCommand[] = context.items.flatMap(it => {
    const h = it.position.kind === "carried" || it.position.kind === "equipped" ? it.position.character_id : undefined;
    if (h === "nicco") return present.map(to => ({ kind: "transfer_item" as const, item_id: it.id, owner_id: to, position: { kind: "carried" as const, character_id: to } }));
    return h && it.owner_id === h ? [{ kind: "transfer_item" as const, item_id: it.id, owner_id: "nicco", position: { kind: "carried" as const, character_id: "nicco" } }] : [];
  });
  const transfers = [...evidence.player_intents.map((c, i) => ({ c, i })), ...diagnostics.filter(d => !d.authorized).map(d => ({ c: d.command, i: -1, d })), ...possible.map(c => ({ c, i: -2 }))].filter(x => x.c.kind === "transfer_item");
  const seen = new Set<string>();
  for (const { c, i, d } of transfers as { c: Extract<CampaignCommand, { kind: "transfer_item" }>; i: number; d?: AuthorizationDiagnostic }[]) {
    const key = `${c.item_id}>${c.owner_id}`; if (seen.has(key)) continue; seen.add(key);
    const confirmation = i >= 0 ? evidence.narrator_confirmations.find(x => x.command_indexes.includes(i)) : undefined;
    // Any narration span that the evidence verifier would accept as a handover/receipt counts as an assertion.
    const spans = sentences.flatMap(s => s.length <= 240 ? [s] : s.split(/(?<=[,;:])\s+/));
    const intents = i === -2 ? [c] : evidence.player_intents;
    const verified = isCommitted(c) ? undefined : spans.find(s => verifyEvidence(c, s, narration, context, intents).verified);
    const assertedBy = confirmation?.source_sentence ?? verified ?? (d?.evidence?.verified && narration.includes(d.evidence.quote ?? "\u0000") ? d.evidence.quote ?? undefined : undefined);
    const now = holder(c.item_id);
    if (!isCommitted(c) && assertedBy) issues.push({ kind: "asserts_uncommitted_transfer", item_id: c.item_id, sentence: sentenceWith(assertedBy), correction: `${itemName(c.item_id)} did NOT change hands: it stays with ${now ? name(now) : "its holder"}. ${c.owner_id === "nicco" ? "Nicco does not receive it" : `${name(c.owner_id!)} does not take or keep it`}; narrate the moment without the handover completing.` });
    if (isCommitted(c) && i >= 0) {
      const refusal = evidence.narrator_refusals.find(r => r.command_indexes.includes(i));
      if (refusal) issues.push({ kind: "contradicts_committed_transfer", sentence: sentenceWith(refusal.source_sentence), correction: `${itemName(c.item_id)} DID change hands: ${name(c.owner_id!)} now carries it. Do not narrate it being refused, kept back or returned.` });
    }
  }

  // 2. NPC factual claims about Nicco. Quotes are attributed with the same deterministic speaker grammar used for recent
  // conversation; quotes that cannot be attributed are treated as a character's (Nicco's lines come only from the player).
  const attributed = dialogueFocused([{ player: "", narration, status: "finalized" }], context, scene)[0]?.npc_dialogue ?? [];
  const speakerOf = new Map<string, string>();
  for (const line of attributed) { const m = line.match(/^(.+?): "(.*)"$/s); if (m) speakerOf.set(m[2]!, m[1]!); }
  const people = new Map(access.characters.map(c => [c.name, c]));
  const householdFacts = access.facts.filter(f => f.source === "player_household");
  const household = (context.player_profile?.households ?? []);
  // The household's name plus the dwelling noun its canonical location's own summary uses ("residential tower" → tower).
  const householdTerms = household.flatMap(h => {
    const loc = world.listEntities().filter(e => e.type === "location" && [e.name, ...e.aliases].some(n => n.toLowerCase() === h.name.toLowerCase()));
    return [h.name, ...loc.flatMap(l => [...l.summary.matchAll(/\b(tower|house|manor|estate|residence|keep|hall|mansion|cottage|farmhouse|townhouse)\b/gi)].map(m => m[1]!))];
  }).map(t => t.toLowerCase());
  const householdRef = new RegExp(`\\b(?:${[...new Set(householdTerms)].map(esc).join("|") || "(?!)"})\\b`, "i");
  const retrievedCanon = access.facts.some(f => f.source === "retrieved_canon");
  const privateCanon = access.facts.filter(f => f.source === "npc_private_canon");
  for (const sentence of sentences) {
    for (const quote of quotesIn(sentence)) {
      const label = speakerOf.get(quote) ?? speakerOf.get(quote.replace(/[,.]$/, "")) ?? [...speakerOf.entries()].find(([q]) => q.startsWith(quote.slice(0, 24)))?.[1];
      if (label === "Nicco") continue;
      const who = label ? people.get(label) : undefined;
      const can = new Set(who?.can_use.map(u => u.ref) ?? []);
      // H3: an NPC's own private canon (canonical_private) is not a source about Nicco or anyone else.
      const rumorBasis = who?.can_use.some(u => u.basis !== "canonical_private" && /rumor|believes|suspects|public|local|canonical/.test(u.basis)) ?? false;
      const speaker = label ?? "an unattributed speaker";
      const q = quote.toLowerCase();
      // 2a. Private player facts: all content words, a distinctive word, a content bigram or "your <word>" signals the fact.
      for (const f of access.facts.filter(x => x.source === "campaign_fact" && !can.has(x.ref))) {
        const words = contentWords(f.text), has = (w: string) => new RegExp(`\\b${esc(w)}s?\\b`, "i").test(q);
        const bigram = words.slice(1).some((w, k) => new RegExp(`\\b${esc(words[k]!)}\\s+${esc(w)}\\b`, "i").test(q));
        const signal = words.length > 0 && (words.every(has) || words.some(w => w.length >= 4 && !COMMON.has(w) && has(w)) || bigram || words.some(w => new RegExp(`\\byour\\s+${esc(w)}\\b`, "i").test(q)));
        if (signal) issues.push({ kind: "private_player_fact", character: speaker, sentence, correction: `${speaker} cannot know or hint that "${f.text}" Remove any statement, guess, rumor or hint of it; they may only react to what they see.` });
      }
      // 2a'. Hardening H3: NPC-private canon voiced by a speaker who is not authored to know it.
      for (const f of privateCanon.filter(x => !can.has(x.ref))) if (disclosesPrivate(q, f)) issues.push({ kind: "restricted_canon", character: speaker, sentence,
        correction: `${speaker} does not know this; only ${(f.holders ?? []).join(", ")} may voice it. Remove it, any hint of it and any rumor about it from ${speaker}'s words.` });
      // 2b. Household ownership: only members may use it; a framed guess from present observation is allowed.
      // Guess framing is judged per sentence inside the quote ("Who you are? A man who owns a tower." is not a guess).
      const parts = q.split(/(?<=[.!?])\s+/);
      // A claim counts as a guess only when the guess marker precedes it, or the sentence ends as a question or with a guess tag.
      const guessed = (p: string, claim: RegExp) => { const at = p.search(claim); const g = p.search(GUESS); return /\?\s*$|,\s*i(?:'d| would)? (?:say|guess|bet|think|reckon|imagine)\W*$/i.test(p) || g >= 0 && at >= 0 && g < at; };
      const stated = (claim: RegExp) => parts.some(p => claim.test(p) && !guessed(p, claim));
      for (const h of householdFacts.filter(x => !can.has(x.ref))) {
        const claim = stated(OWNER_ROLE) || parts.some(p => householdRef.test(p) && OWNERSHIP.test(p) && !guessed(p, OWNERSHIP));
        if (claim) issues.push({ kind: "household_claim", character: speaker, sentence, correction: `${speaker} does not know that ${h.text.replace(/\.$/, "")}. They may ask, say they don't know, or make an explicitly framed guess from where he stands now — never state it as known.` });
      }
      // 2c. Invented source about Nicco (rumor, registry, "people say") without a CAN USE basis. UNKNOWN is not a rumor.
      if (citesSource(q) && (ABOUT_NICCO.test(q) || householdRef.test(q)) && !rumorBasis) issues.push({ kind: "invented_source", character: speaker, sentence, correction: `${speaker} has no rumor, report, record or hearsay about Nicco or his household. Unknown is not rumor: they may say they don't know or ask.` });
      // 2d. Arrival chronology or remembered encounters with Nicco, stated as known.
      // Invented shared past with Nicco ("fit your measure from yesterday", "on my stoop yesterday, remember you"): a time marker and
      // a second-person reference in the same spoken sentence, not framed as a guess.
      const sharedPast = parts.some(p => SHARED_PAST.test(p) && /\b(?:you|your|yours)\b/i.test(p.replace(/thank[- ]you/gi, " ")) && !guessed(p, SHARED_PAST));
      if (stated(CHRONOLOGY) || stated(ARRIVAL_RECORD) || sharedPast) issues.push({ kind: "unsourced_history", character: speaker, sentence, correction: `${speaker} has no knowledge of when Nicco arrived or of any earlier meeting. Remove the claim; they may ask or guess from what they see now.` });
    }
    // 2f. Hardening H3: the narration voice never states NPC-private canon (disclosure happens only through a holder's own words).
    const narrated = outside(sentence);
    for (const f of privateCanon) if (disclosesPrivate(narrated, f)) issues.push({ kind: "restricted_canon", sentence,
      correction: `The narration may not state this: it is private knowledge of ${(f.holders ?? []).join(", ")}. Remove it from the narration; only that character may reveal it, in their own words.` });
    // 2e. History of Nicco's household place (empty for years, previous owners, debts), in dialogue or narration, unsupported by retrieved canon.
    if (!retrievedCanon && householdRef.test(sentence) && HISTORY.test(sentence)) issues.push({ kind: "unsourced_history", sentence, correction: `The history of ${household[0]?.name ?? "that place"} (previous owners, residents, how long it stood empty, debts) is not established. Remove it; nobody states it.` });
  }

  // 3. Presence: authored companions ("usually accompanied by two large bodyguards") and absent named characters must not appear.
  const presentLabels = [...context.characters.map(c => (c.profile.name ?? c.id).toLowerCase()), ...(scene?.participants ?? []).flatMap(p => [p.display_name.toLowerCase(), p.role.toLowerCase()])];
  for (const baseline of context.primary.scene.present_characters) {
    const text = `${"appearance" in baseline ? baseline.appearance ?? "" : ""} ${baseline.content}`;
    for (const m of text.matchAll(/\b(?:usually|often|commonly|normally|typically|always|frequently)\s+(?:accompanied by|seen with|travels? with|escorted by|flanked by|followed by|guarded by)\s+([^.;,]+)/gi)) {
      const noun = m[1]!.trim().split(/\s+/).at(-1)!.toLowerCase().replace(/s$/, "");
      if (!noun || presentLabels.some(l => l.includes(noun))) continue;
      const hit = sentences.find(s => new RegExp(`\\b${esc(noun)}s?\\b`, "i").test(outside(s)));
      if (hit) issues.push({ kind: "absent_participant", character: baseline.display_name, sentence: hit, correction: `${baseline.display_name}'s ${m[1]!.trim()} are NOT present in this scene (a habit, not presence). Remove them entirely; nobody else acts, restrains or intervenes except the people listed as present.` });
    }
  }
  const presentIds = new Set(context.characters.map(c => c.id));
  for (const e of world.getEntitiesByType("character")) {
    // NPC+ Pass 1: an authored NPC+ whose narrated movement into this scene was authorized this turn is present in prepared state.
    if (e.role !== "npc" || presentIds.has(e.id) || e.name.length < 4 || prepared.runtime.npc_locations.some(n => n.character_id === e.id && n.current_location === prepared.runtime.scene.player_location)) continue;
    // NPC+ Pass 4: only PARTICIPATION by the absent character (acting, speaking, present), never a mere reference to them.
    const hit = sentences.find(s => participatesInScene(s, [e.name]));
    if (hit) issues.push({ kind: "absent_participant", character: e.name, sentence: hit, correction: `${e.name} is not present in this scene. Remove them; only the people listed as present may act or speak.` });
  }
  // Runtime Continuity Repair 1: a created (temporary) character absent at turn start (it left, or was never here) may be
  // remembered ("the stool Dell had left") but never acts in the scene again until state brings it back.
  for (const c of prepared.characters) {
    // Location Continuity Pass 1.3: someone whose move here commits this turn (carried or followed in) is not absent.
    if (c.origin.kind !== "created" || presentIds.has(c.id) || !c.profile.name || c.current.current_location === prepared.runtime.scene.player_location) continue;
    // NPC+ Pass 4: participation (acting, speaking, present), not a mention; remembering their exit stays allowed.
    const names = [c.profile.name, ...c.profile.name.split(/\s+/).filter(t => t.length >= 4)];
    const hit = sentences.find(s => participatesInScene(s, names) && !ABSENCE.test(outside(s)));
    if (hit) issues.push({ kind: "absent_participant", character: c.profile.name, sentence: hit, correction: `${c.profile.name} is no longer in this scene (they left earlier). Remove them as a present person: they do not sit, act, speak or react here. At most, others may refer to their earlier departure.` });
  }
  // Runtime Continuity Repair 1: unscaffolded staff acting in the scene (existing presence discipline, same issue kind).
  const staffAllowed = (noun: string) => (input.player_input ?? "").toLowerCase().includes(noun.split(/\s+/).at(-1)!.replace(/s$/, ""))
    || (scene?.participants ?? []).some(p => p.role === "waiter" || p.role === "laborer")
    || (context.primary.scene.player_location?.content ?? "").toLowerCase().includes(noun.split(/\s+/).at(-1)!.replace(/s$/, ""));
  for (const sentence of sentences) {
    const plain = outside(sentence), m = STAFF.exec(plain);
    if (!m || /\b(?:no|not|never|without|nobody|none)\b|n't\b/i.test(plain) || staffAllowed(m[1]!.toLowerCase())) continue;
    issues.push({ kind: "absent_participant", character: m[1]!, sentence, correction: `No ${m[1]!.replace(/^(?:one of )?(?:the|a|an|her|his|its|[a-z]+'s) /i, "")} is present: the only people here are those listed as present (plus unnamed patrons as background). Do not add staff who act, serve or are spoken to; give that action to a present character or drop it.` });
  }

  // 4. Consequences: class-B conditions narrated without a committed condition; class-C/D constraints narrated as accomplished.
  // Runtime Continuity Repair 1 precedence: (1) an explicit player-authored current-turn fact, (2) committed state, (3) authorized
  // change, (4) momentary texture; otherwise unsupported. A player-authored grab/shove/spill/injury is restated, never rewritten;
  // it does not authorize an escalated consequence (a broken bone, unconsciousness, pinning, arrest).
  const authored = input.player_input === undefined ? [] : playerAuthoredEvents(input.player_input, context);
  let last: string | undefined;
  for (const sentence of sentences) {
    const plain = outside(sentence);
    const physical = plain.replace(OBJECT_MOTION, " "); // objects falling or spilling are never a person's condition
    const named = context.characters.filter(c => new RegExp(`\\b${esc(c.profile.name ?? c.id)}(?:'s)?\\b`, "i").test(plain));
    const subject = named.length === 1 ? named[0]!.id : named.length === 0 && /^\s*(?:he|she|his|her)\b/i.test(plain) ? last : undefined;
    if (named.length === 1) last = named[0]!.id; else if (named.length > 1) last = undefined;
    if (subject && !NEGATED.test(plain)) {
      const conditions = prepared.characters.find(c => c.id === subject)?.current.conditions ?? [];
      const byPlayer = authoredOn(authored, subject, ["injury", "strike", "shove", "grab"]);
      for (const tag of PHYSICAL_CONDITIONS) if (CONDITION_TERMS[tag].test(physical) && !conditions.includes(tag) && !byPlayer.some(e => e.condition === tag))
        issues.push({ kind: "uncommitted_condition", character: name(subject), sentence, correction: `No lasting ${tag.replace("_", " ")} was recorded for ${name(subject)}. Describe only momentary effects (a flinch, recoil, pain, surprise) without injury, bleeding, falling or dazing.` });
      const severe = (Object.keys(SEVERE_TERMS) as SevereOutcome[]).find(k => SEVERE_TERMS[k].test(physical) && !byPlayer.some(e => e.severe === k));
      if (severe) issues.push({ kind: "uncommitted_condition", character: name(subject), sentence, correction: `${name(subject)} suffers no ${severe.replace("_", " ")}: nothing like it was authored or recorded. Keep only what the player's action states and momentary effects (pain, a stagger, shock).` });
    }
    if (/\bnicco(?:'s)?\b/i.test(plain) && !/^\s*nicco\b/i.test(plain) && !NEGATED.test(plain) && CONSTRAINT.test(withoutAuthoredContact(plain, authored)))
      issues.push({ kind: "uncommitted_constraint", sentence, correction: "Nicco is not restrained, held, removed, detained or banned: none of that is recorded. Characters may threaten, order or demand it in words, or start toward it, but do not narrate it as accomplished." });
  }
  // Runtime Continuity Repair 1: a temporary character narrated as gone must have a committed leave_scene (or the player wrote it).
  // H5.1: authored NPCs too — they can never leave_scene, so narrating one gone is always an unrecorded departure.
  const left = new Set(committed.flatMap(c => c.kind === "leave_scene" ? [c.character_id] : []));
  for (const d of narratedDepartures(narration, context, "persistent")) {
    if (left.has(d.character_id) || authored.some(e => !e.negated && e.action_class === "departure" && e.actor_id === d.character_id)) continue;
    issues.push({ kind: "uncommitted_departure", character: name(d.character_id), sentence: d.source_sentence, correction: `${name(d.character_id)} has NOT left: they are still here in the scene. They may head for the door, be told to leave or threaten to, but do not narrate them gone.` });
  }
  // Pass 1.2: narrator-created captives of the scene (no legal record yet, ephemeral or promoted by name) are also an active trade.
  const negotiation = context.social.legal.some(l => l.status === "enslaved" && !!l.holder_id && l.holder_id !== "nicco" && presentIds.has(l.holder_id))
    || context.characters.some(c => /\bcaptive\b/.test(c.established_origin?.role ?? "") && !context.social.legal.some(l => l.character_id === c.id))
    || readScene([...(input.recent ?? []), { player: input.player_input ?? "", narration, status: "finalized" }], context, input.world).captives.some(c => !c.character_id);
  issues.push(...groundingIssues({ sentences, player_input: input.player_input ?? "", recent: input.recent ?? [], authoritative_text: input.authoritative_text ?? "", trade_negotiation: negotiation }));
  issues.push(...householdIssues(input, sentences, negotiation));
  issues.push(...movementIssues(input, sentences));
  issues.push(...premiseIssues(input, sentences), ...(input.player_input === undefined ? [] : agencyIssues(input, sentences)));
  const unique = new Map<string, AuditIssue>();
  for (const issue of issues) unique.set(`${issue.kind}|${issue.character ?? ""}|${issue.sentence}`, issue);
  return [...unique.values()];
}

/** Authoritative outcome lines for the revision request and the fallback (plain statements of resolved state). */
export function outcomeLines(context: TurnContext, evidence: TurnEvidence, diagnostics: readonly AuthorizationDiagnostic[], committed: readonly CampaignCommand[], prepared: DeepReadonly<CampaignSnapshot>, issues: readonly AuditIssue[] = [], player_input?: string): { readonly revision: readonly string[]; readonly prose: readonly string[] } {
  const name = (id: string) => id === "nicco" ? "Nicco" : context.characters.find(c => c.id === id)?.profile.name ?? id;
  const itemName = (id: string) => context.items.find(i => i.id === id)?.name ?? prepared.items.find(i => i.id === id)?.name ?? id;
  const holder = (id: string) => { const i = prepared.items.find(x => x.id === id); return i && (i.position.kind === "carried" || i.position.kind === "equipped") ? i.position.character_id : undefined; };
  const revision: string[] = [], prose: string[] = [], seen = new Set<string>();
  // Runtime Continuity Repair 1: explicit player-authored events are authoritative input; the revision keeps them as written.
  const authored = player_input === undefined ? [] : playerAuthoredEvents(player_input, context).filter(e => !e.negated);
  for (const quote of new Set(authored.map(e => e.evidence_quote))) revision.push(`PLAYER-AUTHORED (happened exactly as written; keep it, neither soften nor escalate it): "${quote}"`);
  for (const c of committed) {
    if (c.kind === "transfer_item") { seen.add(c.item_id); revision.push(`COMMITTED: ${name(c.owner_id!)} now owns and carries ${itemName(c.item_id)}.`); }
    if (c.kind === "set_condition") revision.push(`RECORDED: ${name(c.character_id)} has ${c.conditions.join(", ").replace(/_/g, " ")}.`);
    if (c.kind === "leave_scene") revision.push(`COMMITTED: ${name(c.character_id)} has left the scene and is no longer present.`);
  }
  for (const i of issues) if (i.kind === "uncommitted_departure" && i.character) revision.push(`NOT COMMITTED: ${i.character} has not left; they are still present in the scene.`);
  // H5.1: authoritative whereabouts for every actor the draft moved without a recorded movement.
  for (const line of new Set(issues.flatMap(i => i.kind === "uncommitted_movement" ? [`NOT COMMITTED: ${i.character ?? "Nicco"} did not move this turn and is at ${i.location}.`] : []))) revision.push(line);
  const asserted = issues.flatMap(i => i.item_id ? [{ kind: "transfer_item" as const, item_id: i.item_id }] : []);
  for (const c of [...evidence.player_intents, ...diagnostics.filter(d => !d.authorized).map(d => d.command), ...asserted]) {
    if (c.kind !== "transfer_item" || seen.has(c.item_id)) continue;
    seen.add(c.item_id);
    const h = holder(c.item_id);
    revision.push(`NOT COMMITTED: ${itemName(c.item_id)} did not change hands; it stays with ${h ? name(h) : "its current holder"}.`);
    if (h) prose.push(`The ${itemName(c.item_id).replace(/^(?:a|an|the) /i, "")} stays with ${name(h)}.`);
  }
  if (!committed.some(c => c.kind === "set_condition")) revision.push(`RECORDED CONDITIONS: none. No lasting injury, bleeding, knockdown or dazing happened this turn${authored.length ? " beyond what the player-authored action above states" : ""}.`);
  revision.push(`NOT RECORDABLE: restraint, removal from a place, detention, arrest and bans did not happen${authored.length ? " (beyond the player-authored action above)" : ""}; they may only be threatened or demanded.`);
  return { revision, prose };
}
/** Bounded revision request: the original prompt, the draft, then the authoritative outcome and the specific problems. */
export function revisionRequest(original: Pick<GenerationRequest, "system_prompt" | "messages">, draft: string, outcome: readonly string[], issues: readonly AuditIssue[]): Pick<GenerationRequest, "system_prompt" | "messages"> {
  const problems = issues.map(i => `- ${i.correction} (Draft sentence: ${JSON.stringify(i.sentence.slice(0, 300))})`).join("\n");
  return { system_prompt: original.system_prompt, messages: [...original.messages, { role: "assistant", content: draft }, { role: "user", content:
    `[REVISION REQUIRED - AUTHORITATIVE OUTCOME]\nThe turn has been resolved. This outcome is final; the narration must match it:\n${outcome.map(l => `- ${l}`).join("\n")}\n\n[PROBLEMS IN THE DRAFT]\n${problems}\n\n[TASK]\nRewrite the complete narration for the same player action (one to three short paragraphs) so it matches the authoritative outcome and fixes every problem. Keep everything else that was fine: voices, tone, observable detail. Do not mention rules, state, records or corrections.` }] };
}
/** Last-resort deterministic reconciliation: drop flagged sentences and state the authoritative outcome for uncommitted transfers. */
export function redactNarration(narration: string, issues: readonly AuditIssue[], outcome: readonly string[]): string {
  const flagged = new Set(issues.map(i => i.sentence));
  const paragraphs = narration.split(/\n{2,}/).map(p => sentencesOf(p).filter(s => !flagged.has(s)).join(" ")).filter(p => p.trim());
  const stated = issues.some(i => i.kind === "asserts_uncommitted_transfer" || i.kind === "contradicts_committed_transfer" || i.kind === "false_premise") ? outcome : [];
  return [...paragraphs, ...(stated.length ? [stated.join(" ")] : [])].join("\n\n").trim() || outcome.join(" ") || "The moment passes.";
}

/**
 * H5.1 movement backstop. Narration may not move a persistent actor that prepared state leaves elsewhere: Nicco narrated completing
 * movement to (reaching, entering) a known location he is not at, or leaving the location he is still at; a persistent character
 * (created or authored, in the scene Nicco is in or left) narrated completing movement to a concrete known location they are not at.
 * Conservative: explicit "Nicco" (a bare "he" is never resolved), explicit travel phrases, destinations that resolve to one known
 * location, quoted speech ignored, hedged/modal/planned/looking clauses ignored (GATES.movement_not_done). It only flags: the movement
 * command is never created here; state stays authoritative.
 */
const NICCO_GO = /\bNicco\s+(?:\w+ly\s+)?(?:descends|descended|climbs|climbed|goes|went|walks|walked|heads|headed|steps|stepped|returns|returned|hurries|hurried|makes his way|made his way|comes|came|moves|moved|crosses|crossed|wanders|wandered|strides|strode)\b[^.;]*?\b(?:to|into|onto)\s+([^.;,]+)/i;
const NICCO_ARRIVE = /\bNicco\s+(?:\w+ly\s+)?(?:reaches|reached|enters|entered|arrives (?:at|in)|arrived (?:at|in))\s+([^.;,]+)/i;
const NICCO_LEAVE = /\bNicco\s+(?:\w+ly\s+)?(?:leaves|left|exits|exited)\s+([^.;,]+)/i;
const PLACE_END = /\s+(?:with|while|as|and|where|before|after|still|alone|together|behind|below|above|without)\b.*$/i;
function movementIssues(input: NarrationAuditInput, sentences: readonly string[]): AuditIssue[] {
  const { context, world, prepared } = input;
  const here = prepared.runtime.scene.player_location, origin = input.origin ?? here;
  const display = (id: string | undefined) => id ? world.getEntity(id)?.display_name ?? id : "an unestablished place";
  const within = (place: string, at: string | undefined) => !!at && (place === at || world.getAncestors(at).some(a => a.id === place));
  const issues: AuditIssue[] = [];
  for (const sentence of sentences) {
    for (const clause of outside(sentence).split(/;|,\s*(?:but|while|though|although)\s+|\s+but\s+/)) {
      for (const [re, leaving] of [[NICCO_GO, false], [NICCO_ARRIVE, false], [NICCO_LEAVE, true]] as const) {
        const m = clause.match(re);
        if (!m || GATES.movement_not_done.test(clause.slice(0, m.index! + m[0].length))) continue;
        const place = resolveDestination(m[1]!.replace(PLACE_END, "").trim(), context, world);
        if (!place) continue;
        const contradicts = leaving ? place === here && origin === here : !within(place, here);
        if (contradicts && !issues.some(i => i.sentence === sentence && !i.character))
          issues.push({ kind: "uncommitted_movement", sentence, location: display(here), correction: leaving
            ? `Nicco has NOT left ${display(here)}: no movement was recorded this turn. Keep him there; do not narrate him leaving or arriving anywhere else.`
            : `Nicco did NOT go to ${display(place)}: no such movement was recorded this turn. He is at ${display(here)}; describe him there.` });
      }
    }
  }
  const movers = persistentCharactersAt(prepared, world, [...new Set([origin, here])]);
  // NPC+ Pass 9: an implicit-destination follow by an active NPC+ is held to the same standard — unrecorded, it is flagged.
  for (const m of narratedMovements(input.narration, movers, { origin, arrival: here }, context, world, activeNpcPlus(prepared))) {
    const now = characterLocation(prepared, world, m.character_id);
    if (now === m.location_id) continue;
    const who = movers.find(x => x.id === m.character_id)!.names[0]!;
    issues.push({ kind: "uncommitted_movement", character: who, sentence: m.source_sentence, location: display(now),
      correction: `${who} did NOT go to ${display(m.location_id)}: that movement was not recorded. ${who} is still at ${display(now)}; Nicco's movement never brings anyone along. Do not narrate ${who} following, being brought or arriving there.` });
  }
  return issues;
}

const holderOf = (i: { readonly position: { readonly kind: string; readonly character_id?: string } }) => i.position.kind === "carried" || i.position.kind === "equipped" ? i.position.character_id : undefined;
/**
 * Repair 1.1 return premise. For an item Nicco held neither before nor after this turn, the narration may not have Nicco holding,
 * offering or returning it, keep it "in his hands", or have its holder take it "back". Negated sentences are ignored. Pronouns
 * count only in a turn where the player attempted a give-back and exactly one such item exists.
 */
function premiseIssues(input: NarrationAuditInput, sentences: readonly string[]): AuditIssue[] {
  const { context, prepared, evidence } = input;
  const issues: AuditIssue[] = [];
  const name = (id: string) => context.characters.find(c => c.id === id)?.profile.name ?? id;
  const notNiccos = context.items.filter(i => { const pre = holderOf(i), post = prepared.items.find(x => x.id === i.id); return pre && pre !== "nicco" && (!post || holderOf(post) !== "nicco"); });
  const niccoHolds = context.items.filter(i => holderOf(i) === "nicco");
  const giveBack = /\b(?:back|return\w*)\b/i.test(input.player_input ?? "") && !evidence.player_intents.some(c => c.kind === "transfer_item" && c.owner_id !== "nicco");
  for (const it of notNiccos) {
    const terms = itemTerms(it, context.items);
    if (niccoHolds.some(n => new RegExp(`\\b(?:${terms})\\b`, "i").test(`${n.name ?? n.id}`))) continue; // Nicco has his own such item
    const ref = giveBack && notNiccos.length === 1 ? `(?:the\\s+)?(?:${terms}|them|it)` : `(?:the\\s+)?(?:[\\w']+\\s+){0,3}?(?:${terms})`;
    const holder = holderOf(it)!, holderNames = [name(holder), ...name(holder).split(/\s+/).filter(t => t.length > 2)].map(esc).join("|");
    const niccoHas = new RegExp(`\\bnicco\\b[^.!?]{0,60}?\\b(?:holds?(?: out)?|held(?: out)?|holding|extends?|extended|extending|offers?|offered|offering|hands?|handed|handing|gives?|gave|giving|returns?|returned|returning|passes?|passed|pushes?|pushed|lifts?|lifted|carries|carried|clutch\\w*|grips?)\\b[^.!?]{0,40}?\\b${ref}\\b`, "i");
    const inHands = new RegExp(`\\b${ref}\\b[^.!?]{0,40}?\\b(?:in|from)\\s+(?:nicco's|his)\\s+(?:hands?|grasp|grip|arms)\\b|\\b${ref}\\b[^.!?]{0,30}?\\b(?:remains?|stays?)\\b[^.!?]{0,20}?\\b(?:nicco's|with nicco|his to)\\b`, "i");
    const takesBack = new RegExp(`\\b(?:${holderNames}|she|he)\\b[^.!?]{0,40}?\\b(?:takes?|took|accepts?|accepted|receives?|received|reclaims?|reclaimed|gathers?)\\b[^.!?]{0,30}?\\b${ref}\\b[^.!?]{0,20}?\\bback\\b`, "i");
    for (const sentence of sentences) {
      const plain = outside(sentence);
      if (/\b(?:not|never|no longer|cannot|nothing)\b|n't\b/i.test(plain)) continue; // "without comment" is not a negation of the act
      if (niccoHas.test(plain) || inHands.test(plain) || takesBack.test(plain))
        issues.push({ kind: "false_premise", item_id: it.id, sentence, correction: `Nicco does not have ${it.name ?? it.id}: ${name(holder)} still has it (the earlier handover never happened). Do not narrate Nicco holding, offering or returning it, or ${name(holder)} taking it back; ${name(holder)} may react to Nicco's words.` });
    }
    // Repair 1.2: in a give-back turn, dialogue may not presuppose the gift either ("Keep them… They aren't coming back to me").
    // Denials ("I never gave them to you", "You can't return what I still have") and hypotheticals are allowed.
    if (giveBack) for (const sentence of sentences) for (const quote of quotesIn(sentence)) {
      const part = quote.split(/(?<=[.!?])\s+/).find(p => !HYPOTHETICAL.test(p) && !DENIAL.test(p) && new RegExp(PRESUPPOSE.source.replace("TERMS", terms), "i").test(p));
      if (part) { issues.push({ kind: "false_premise", item_id: it.id, sentence, correction: `${name(holder)} still has ${it.name ?? it.id}; the gift never happened. ${name(holder)} must not speak as if they already gave it away, as if Nicco has it or is returning it, or as if refusing to take it back (${JSON.stringify(part.slice(0, 80))}). They may point out they still have it or were only offering it.` }); break; }
    }
  }
  return issues;
}
const HYPOTHETICAL = GATES.audit_hypothetical;
const DENIAL = /\bnever (?:actually |really )?(?:gave|given|handed)\b|\bcan(?:'t|not) (?:return|give back) what\b|\bstill (?:have|has|hold|holds|got)\b|\bnot handing\b|\b(?:was|were|am) (?:only |just )?offering\b|\bnot (?:yet )?(?:given|yours)\b/i;
/** Dialogue that presupposes a completed gift: already given, Nicco holding it, returning it, or refusing it back. TERMS = item words. */
const PRESUPPOSE = /\b(?:i|we)(?:'ve| have)? (?:already )?(?:gave|given|handed (?:them|it|those|you))\b|\bgive gifts twice\b|\bkeep (?:them|it|those)\b|\bsell (?:them|it|those)\b|\b(?:they're|they are|it's|it is|those are) yours\b|\byou (?:have|hold|own|got) (?:them|it|those)\b|\byour (?:TERMS)\b|\b(?:not|n't|never) (?:be )?coming back\b|\b(?:won't|will not|don't|do not|not going to|can't|cannot) take (?:them|it|those) back\b|\bdon't want (?:them|it) back\b/;
/**
 * Repair 1.1 player agency. Nicco's words and decisions come only from the player. Bounded check: quoted lines attributed to Nicco
 * that the player did not supply (a rendering of an explicitly authored question/speech act with the same content is allowed),
 * and Nicco-led sentences in which he accepts, refuses, keeps, thanks, leaves, stays or decides something the input did not author.
 * Deterministic consequences of authored actions (an authored gift being taken, an authored return being offered) stay allowed.
 */
function agencyIssues(input: NarrationAuditInput, sentences: readonly string[]): AuditIssue[] {
  const { context, evidence, narration, scene } = input;
  const said = (input.player_input ?? "").toLowerCase();
  const words = (s: string) => s.toLowerCase().replace(/[^a-z'\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !["the", "and", "you", "who", "what", "where", "they", "him", "his", "her", "she", "that", "this", "does", "did"].includes(w));
  const norm = (s: string) => words(s).join(" ");
  const issues: AuditIssue[] = [];
  // 1. Unsupplied Nicco dialogue.
  const speechAct = /\*[^*]*\b(?:asks?|asked|says?|said|tells?|told|replies|replied|answers?|answered|thanks?|thanked|calls?|shouts?|whispers?)\b[^*]*\*/i.test(input.player_input ?? "");
  for (const line of dialogueFocused([{ player: "", narration, status: "finalized" }], context, scene)[0]?.npc_dialogue ?? []) {
    const m = line.match(/^Nicco: "(.*)"$/s); if (!m) continue;
    const quote = m[1]!, q = norm(quote);
    if (!q || norm(said).includes(q)) continue;
    const content = words(quote), overlap = content.filter(w => said.includes(w.replace(/'s$/, ""))).length / Math.max(1, content.length);
    if (speechAct && overlap >= 0.5) continue;
    issues.push({ kind: "player_agency", sentence: sentences.find(s => s.includes(quote.slice(0, 40))) ?? quote, correction: `Nicco says only what the player wrote. Remove the invented line "${quote.slice(0, 80)}"; describe the NPC's side instead.` });
  }
  // 2. Unauthored decisions or acts in Nicco-led sentences.
  const terms = context.items.map(i => itemTerms(i, context.items)).join("|") || "(?!)";
  const object = `(?:\\s+[\\w']+){0,3}?\\s+(?:the\\s+)?(?:${terms}|them|it|gift|offer)\\b`;
  const inbound = evidence.player_intents.some(c => c.kind === "transfer_item" && c.owner_id === "nicco");
  const families: readonly (readonly [string, RegExp, boolean])[] = [
    ["accept the gift", new RegExp(`\\b(?:accepts?|accepted|takes?|took|receives?|received|pockets?|pocketed)${object}`, "i"), inbound || /\b(?:accept\w*|takes?|took|receiv\w*|pocket\w*)\b/.test(said)],
    ["refuse or decline", /\b(?:refus\w*|declin\w*|reject\w*)\b|\b(?:pushes|pushed|hands|handed|gives|gave)\b(?:\s+[\w']+){0,3}?\s+back\b/i, /\b(?:refus\w*|declin\w*|reject\w*|back|return\w*|no thanks|keep them|keep it|more than me)\b/.test(said)],
    ["keep it", new RegExp(`\\b(?:keeps?|kept)${object}|\\bdecides? to keep\\b|\\b(?:puts?|pulls?|slips?)\\s+(?:them|it|the\\s+[\\w' ]{1,20}?)\\s+on\\b`, "i"), /\b(?:keep\w*|kept|put (?:them|it) on|wear\w*)\b/.test(said)],
    ["thank", /\bthanks?\b|\bthanked\b/i, /\bthank/.test(said)],
    ["leave", /\b(?:leaves|left|walks? (?:away|off)|departs?|heads? (?:off|out|away|home|inside)|turns? to (?:leave|go)|goes (?:inside|home|away))\b/i, /\b(?:leav\w*|left|walk\w*|go(?:es)?|went|head\w*|depart\w*)\b/.test(said)],
    ["stay", /\b(?:stays?|stayed|remains? (?:where|behind)|decides? to (?:stay|wait))\b/i, /\b(?:stay\w*|remain\w*|wait\w*)\b/.test(said)],
    ["decide", /\b(?:decides?|decided|chooses?|chose|resolves?|resolved|agrees?|agreed)\b/i, /\b(?:decid\w*|choos\w*|chose|resolv\w*|agree\w*)\b/.test(said)],
  ];
  for (const sentence of sentences) {
    const plain = outside(sentence).trim().replace(/^(?:then|finally|at last|after a moment),?\s+/i, "");
    if (!/^nicco(?:'s)?\b/i.test(plain)) continue;
    const clause = plain.split(/[;:]|,\s*(?:while|as|but)\s/)[0]!;
    for (const [family, verb, authored] of families) {
      if (!verb.test(clause) || authored) continue;
      // "decides to <authored act>" is the authored act itself.
      if (family === "decide" && families.some(([f, v, a]) => f !== "decide" && a && v.test(clause))) continue;
      issues.push({ kind: "player_agency", sentence, correction: `Nicco's choices belong to the player, who did not have him ${family}. Remove that; show only the NPC's side and leave Nicco's response open.` });
      break;
    }
    // Repair 1.2: narrator-authored gestures, deliberate movements and internal states (thoughts, beliefs, feelings, intentions,
    // subjective conclusions). The subject's own clause only; passive/involuntary consequences ("is shoved", "his head snaps back")
    // are not matched. A gesture is authored when the player's text uses the same verb, or it realizes an authored give/return.
    if (issues.some(i => i.sentence === sentence)) continue;
    const own = plain.split(/[;:]|,\s*(?:while|as|but|and|when)\s|\s(?:as|while|when|because)\s|\s{3,}|,\s*(?=(?!Nicco\b)[A-Z])/)[0]!.replace(/\b(?:is|was|gets|got|being|been)\s+(?:\w+ly\s+)?\w+/gi, " ");
    const stem = (w: string) => w.toLowerCase().replace(/^(?:holds?|held) out$/, "hold").replace(/(?:ing|ed|es|s)$/, "").slice(0, 5);
    const transferGesture = /\b(?:extend\w*|holds? out|held out|holding out|reach\w*|hand\w*|offer\w*)\b/i;
    const authoredTransfer = /\b(?:giv\w*|gave|hand\w*|offer\w*|return\w*|back)\b/.test(said);
    const gesture = [...own.matchAll(GESTURE)].map(m => m[0]).find(w => !said.includes(stem(w)) && !(authoredTransfer && transferGesture.test(w)));
    const internal = [...own.matchAll(INTERNAL)].map(m => m[0]).find(w => !said.includes(stem(w)));
    const passive = /^nicco(?:'s\s+\w+)?\s+(?:is|was|gets|got|being|has been)\b/i.test(plain); // involuntary: "is shoved back a step"
    if (!passive && (gesture || internal))
      issues.push({ kind: "player_agency", sentence, correction: `The player did not author Nicco ${internal ? `having that inner state ("${internal}")` : `making that gesture or movement ("${gesture}")`}. Nicco's gestures, thoughts, beliefs, feelings and intentions belong to the player: remove them and describe only what others do and what visibly happens.` });
  }
  return issues;
}
const GESTURE = /\b(?:gestur\w*|nod(?:s|ded|ding)?|smil\w*|grin\w*|shrug\w*|wav(?:es|ed|ing)|point(?:s|ed|ing)?|bow(?:s|ed|ing)?|wink\w*|sigh\w*|laugh\w*|frown\w*|turn(?:s|ed|ing)?|step(?:s|ped|ping)?|reach(?:es|ed|ing)?|extend(?:s|ed|ing)?|holds? out|held out|holding out|rais(?:es|ed|ing)|lower(?:s|ed|ing)|glanc\w*|shak(?:es|ing) his head|shook his head|lean(?:s|ed|ing)?|cross(?:es|ed|ing)|fold(?:s|ed|ing)?|shift(?:s|ed|ing)?|clench\w*|straighten\w*)\b/gi;
const INTERNAL = /\b(?:think(?:s|ing)?|thought|believ\w*|suspect\w*|realiz\w*|knows?|knew|wonder\w*|feels?|felt|fear\w*|hop(?:es|ed|ing)|wants?|wanted|intend\w*|assum\w*|conclud\w*|decides? (?:that|she|he|they|it)|can tell|notices? that|sees? that|embarrass\w*|afraid|ashamed|nervous|uneasy|relieved|knowingly)\b/gi;

/**
 * Household Pass 1 reconciliation. (1) Narration outside dialogue must not present a present non-member as a household or family
 * member: living, staying, being owned or being welcomed is not membership (checked after this turn's committed joins).
 * (2) In a trade scene, narration must not show payment or a person changing hands unless a transaction committed this turn.
 */
function householdIssues(input: NarrationAuditInput, sentences: readonly string[], negotiation: boolean): AuditIssue[] {
  const { context, prepared } = input, issues: AuditIssue[] = [];
  const members = new Set(prepared.households.filter(h => h.members.some(m => m.character_id === "nicco" && m.status === "member")).flatMap(h => h.members.filter(m => m.status === "member").map(m => m.character_id)));
  const outsiders = context.characters.filter(c => c.id !== "nicco" && !members.has(c.id));
  const CLAIM = /\b(?:(?:a |the )?(?:member|part) of (?:the |this |his |nicco's )?(?:household|family|heartstone)|(?:joined|joins) (?:the |this |his )?(?:household|family)|household member|one of the family)\b/i;
  const DENIED = GATES.audit_denied;
  for (const sentence of sentences) {
    const plain = outside(sentence);
    if (!CLAIM.test(plain) || DENIED.test(plain)) continue;
    const who = outsiders.find(c => { const n = c.profile.name ?? c.id; return exactNamePattern([n, ...n.split(/\s+/).filter(t => t.length > 2)], "i").test(plain); });
    if (who) issues.push({ kind: "uncommitted_household", character: who.profile.name ?? who.id, sentence, correction: `${who.profile.name ?? who.id} is NOT a household member: no voluntary membership has been established. They may be present, staying, owned or cared for, but do not call them part of the household or family.` });
  }
  const traded = prepared.transactions.some(t => t.revision === prepared.revision && prepared.revision !== (input.base_revision ?? context.primary.runtime_revision));
  if (negotiation && !traded) {
    const PAID = /\b(?:pays?|paid|hands? over|counts? out|pockets?|takes?) (?:him |her |them |korvin |the )?(?:\w+ ){0,2}?(?:gold|coins?)\b|\b(?:changes?|changed) hands\b|\bthe (?:sale|purchase|deal) (?:is|was) (?:done|complete|made|struck)\b|\bnow (?:belongs|belonged) to nicco\b/i;
    for (const sentence of sentences) if (PAID.test(outside(sentence)) && !DENIED.test(outside(sentence)))
      issues.push({ kind: "asserts_uncommitted_purchase", sentence, correction: `No purchase committed this turn: no gold was paid and nobody changed hands. Keep the negotiation open or show the deal failing; do not narrate payment or a completed sale.` });
  }
  return issues;
}
