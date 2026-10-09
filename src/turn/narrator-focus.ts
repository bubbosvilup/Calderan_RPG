import type { TurnContext } from "./context-builder.js";
import type { PlayerIntent } from "./player-intent.js";
import type { RecentExchange } from "./recent-conversation.js";
import type { SceneParticipantPlan } from "./scene-participants.js";
import { INACTIVE_EXPIRY_TURNS, castingOptions } from "./scene-participants.js";
import { narratorIdentityGate } from "./narrator-identity.js";
import { playerAuthoredEvents } from "./player-authored-events.js";
import { canonicalInteractionTargets } from "./canonical-interaction-targets.js";
import { escapeRegExp } from "./language/text.js";

/** Derived narrator attention only. No roster, campaign or controller mutation. */
export function projectNarratorFocus(context: TurnContext, input: string, recent: readonly RecentExchange[], intent: PlayerIntent, participants?: SceneParticipantPlan) {
  const gate = narratorIdentityGate(context);
  const canonical = context.characters.filter(c => gate?.identities.has(c.id));
  const names = (id: string) => {
    const c = context.characters.find(c => c.id === id)!, identity = gate!.identities.get(id)!;
    return [c.id, c.profile.name, ...(c.profile.aliases ?? []), ...(identity.observable_label.includes(":") ? [identity.observable_label] : []), identity.ref].filter((s): s is string => !!s);
  };
  const targets = (text: string) => canonicalInteractionTargets(context, text);
  // Casting fix: the current input may point back to the person the latest scene narration described (same rule as planning).
  const current = new Set(canonicalInteractionTargets(context, input, castingOptions(context, participants?.participants ?? [], recent)));
  if (/\b(?:ask\w*|inspect\w*|examin\w*|about|specialties|services)\b/i.test(input) && /\b(?:private sellers|slavers)\b/i.test(input)) {
    for (const c of canonical) if (/\b(?:seller|slaver)\b/i.test(context.primary.scene.present_characters.find(p => p.id === c.id)?.summary ?? "")) current.add(c.id);
  }
  const foreground = new Set(current);
  for (const id of [...(participants?.addressed ?? []), ...(participants?.focus ? [participants.focus] : [])]) foreground.add(id);
  for (const c of canonical) if (context.npc_plus?.lines.some(l => l.startsWith("NPC+ ") && l.includes(` (${c.id})`))) foreground.add(c.id);
  for (const ref of intent.resolved_references ?? []) for (const id of ref.ids) foreground.add(id);
  for (const p of intent.natural?.physical ?? []) { foreground.add(p.actor); foreground.add(p.target); }
  for (const e of playerAuthoredEvents(input, context).filter(e => !e.negated)) { if (e.actor_id) foreground.add(e.actor_id); if (e.target_id) foreground.add(e.target_id); }
  // Existing command IDs are authoritative interaction targets, not inferred from canonical importance.
  for (const command of [...intent.candidates, ...intent.runtime]) {
    const c = command as unknown as Record<string, unknown>;
    for (const key of ["character_id", "owner_id", "seller_id", "buyer_id", "holder_id", "from_holder_id", "to_holder_id", "subject_id", "from_character_id", "to_character_id"]) if (typeof c[key] === "string") foreground.add(c[key] as string);
    if (command.kind === "set_knowledge") foreground.add(command.knowledge.character_id);
    if (command.kind === "schedule_event") for (const id of command.participants ?? []) foreground.add(id);
    if (command.kind === "runtime_delta") for (const m of command.delta.character_movements ?? []) foreground.add(m.character_id);
    if (command.kind === "transfer_item") {
      if (command.position.kind === "carried" || command.position.kind === "equipped") foreground.add(command.position.character_id);
      const item = context.items.find(i => i.id === command.item_id);
      if (item && (item.position.kind === "carried" || item.position.kind === "equipped")) foreground.add(item.position.character_id);
    }
  }
  const canonicalIds = new Set(canonical.map(c => c.id));
  for (const id of foreground) if (!canonicalIds.has(id)) foreground.delete(id);
  // Reuse the participant inactivity bound, but only player focus (never repeated narrator roster exposition).
  // Explicit attention/movement elsewhere replaces recent focus, including within the same coarse location.
  const attentionShift = /\b(?:walk\w*|go(?:es|ing)?|move\w*|return\w*|join\w*|turn\w*|look\w*|focus\w*|wait\w*)\b/i;
  const shifted = current.size > 0 || attentionShift.test(input);
  if (!shifted && !foreground.size && !participants?.focus) for (const e of recent.filter(e => e.status === "finalized").slice(-INACTIVE_EXPIRY_TURNS).reverse()) {
    const addressed = e.conversation_partner_id && canonicalIds.has(e.conversation_partner_id) ? new Set([e.conversation_partner_id]) : targets(e.player);
    for (const id of addressed) foreground.add(id);
    if (addressed.size || attentionShift.test(e.player)) break;
  }
  // Direct second-person continuation with exactly one canonical partner is the existing NPC+ convention.
  if (!foreground.size && !participants?.focus && canonical.length === 1 && context.characters.filter(c => c.id !== "nicco").length === 1
    && (/\b(?:you|your)\b/i.test(input) || /\b(?:kiss\w*|touch\w*|hug\w*|greet\w*|ask\w*|tell\w*)\b[^.!?]{0,40}\b(?:her|him)\b/i.test(input) || /^(?:hello|hi|good morning|good evening)[.!\s]*$/i.test(input))) foreground.add(canonical[0]!.id);
  const background = new Set(canonical.filter(c => !foreground.has(c.id)).map(c => c.id));
  const compact = canonical.filter(c => background.has(c.id)).map(c => {
    const identity = gate!.identities.get(c.id)!;
    const confidential = context.primary.scene.present_characters.some(p => p.id === c.id && "confidential_encounter" in p);
    return { internal_id: c.id, player_known_name: identity.player_known_name, observable_label: gate!.mask(identity.observable_label), present: true, ...(confidential ? { confidential_encounter: "Identity, role, affiliations and private canon are not public." } : {}) };
  });
  const backgroundNames = [...background].flatMap(names);
  const referencesBackground = (text: string) => backgroundNames.some(n => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(n)}(?![\\p{L}\\p{N}_])`, "iu").test(text));
  const lore = (text: string) => text.split(/(?<=[.!?])\s+/).filter(s => !referencesBackground(s) || /\b\d+\s*(?:gold|coins?|silver)\b/i.test(s)).join(" ");
  // Keep all legal/relationship/household authority, referring to background actors by ID instead of repeating labels.
  const references = (text: string) => {
    for (const id of background) for (const n of names(id).filter(n => n !== id)) text = text.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(n)}(?![\\p{L}\\p{N}_])`, "gu"), id);
    return text;
  };
  const backgroundSource = (text: string) => [...background].some(id => names(id).some(n => text.startsWith(`${n}:`) || text.startsWith(`NPC+ ${n} (${id})`) || text.startsWith(`Recovered for ${n} [npcmem:${id}:`)));
  const view: TurnContext = { ...context, ...(context.npc_private_canon ? { npc_private_canon: context.npc_private_canon.filter(g => !background.has(g.character_id)) } : {}),
    ...(context.npc_plus ? { npc_plus: { ...context.npc_plus, lines: context.npc_plus.lines.filter(l => !backgroundSource(l)).map(references) } } : {}) };
  const retrieved = retrievalProjection;
  function retrievalProjection(value: unknown): unknown {
    if (Array.isArray(value)) return value.filter(v => !(v && typeof v === "object" && background.has((v as { entity_id?: string }).entity_id ?? ""))).map(retrievalProjection);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, retrievalProjection(v)]));
    return typeof value === "string" && /\s/.test(value) ? lore(value) : value;
  }
  return { foreground, background, compact, lore, references, view, retrieved };
}
