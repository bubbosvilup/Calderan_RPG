import { transferRecipient, itemHolder, transferCharacterPresent, validTransferMode } from "../campaign/item-transfer.js";
import { isDeepStrictEqual } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { WorldStore } from "../world/world-store.js";
import type { TurnContext } from "./context-builder.js";
import type { TurnEvidence } from "./turn-evidence.js";
import type { AuthorizationDiagnostic } from "./turn-types.js";
import { isPhysicalCondition } from "./physical-interaction.js";
import { ruleMatchesDeclaration } from "./household-evidence.js";

/** Item Domain V1 owner check: an authored character (world) or a campaign character (snapshot). Never the player's absence or presence. */
export function knownCharacter(id: string, snapshot: DeepReadonly<CampaignSnapshot>, world?: WorldStore): boolean {
  return snapshot.characters.some(c => c.id === id) || (world ? world.getEntity(id)?.type === "character" : snapshot.runtime.npc_locations.some(n => n.character_id === id));
}
/** Permanent Inventory V1: a place_item that puts an existing item down at a location, or picks a stored item up. */
export function isLocationPlacement(command: CampaignCommand, snapshot: DeepReadonly<CampaignSnapshot>): command is Extract<CampaignCommand, { kind: "place_item" }> {
  if (command.kind !== "place_item") return false;
  const item = snapshot.items.find(i => i.id === command.item_id);
  return !!item && (command.position.kind === "stored" || item.position.kind === "stored" && command.position.kind === "carried");
}
/** Policy consumes resolved same-turn evidence, never searches arbitrary narration. */
export function authorizeCommands(proposal: readonly CampaignCommand[], evidence: TurnEvidence, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>, world?: WorldStore): readonly AuthorizationDiagnostic[] {
  const present = new Set(context.characters.map(c => c.id));
  return proposal.map(command => {
    const reject = (reason: AuthorizationDiagnostic["reason"]): AuthorizationDiagnostic => ({ command, authorized: false, reason });
    let valid = false;
    switch (command.kind) {
      case "transfer_item": {
        const item = snapshot.items.find(i => i.id === command.item_id);
        const holder = item && itemHolder(item), target = command.position.kind === "carried" ? command.position.character_id : undefined;
        valid = !!item && !!holder && !!target && present.has(holder) && present.has(target)
          && transferCharacterPresent(snapshot, holder) && transferCharacterPresent(snapshot, target) && validTransferMode(item, target, command.mode);
        break;
      }
      case "create_item": {
        // Item Domain V1: the controller decides semantically that an object needs persistent identity; the engine checks the
        // references here (a present holder or the current scene location; a present owner or none) and refuses re-materializing an
        // item already in state at that position. There is no grammar path: only a verified narration quote completes it (hybrid).
        const p = command.position, here = snapshot.runtime.scene.player_location;
        const placed = p.kind === "carried" ? present.has(p.character_id) : p.kind === "stored" && p.location_id === here;
        // Ownership is social/legal, not physical: an owner must resolve to a known character, present or not (an absent owner
        // additionally needs the narration to name them; see verifyEvidence). Position rules above stay strictly physical.
        const owner = command.owner_id === undefined || command.owner_id === null || present.has(command.owner_id) || knownCharacter(command.owner_id, snapshot, world);
        if (!placed || !owner || !command.name.trim()) return reject("rejected_reference_invalid");
        const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase().replace(/^(?:the|a|an)\s+/, "");
        // Identity continuity (Permanent Inventory V1): an item the controller can already see (on a present person, or lying here)
        // is moved with place_item, never materialized again, whatever position the duplicate proposes.
        const visible = (q: DeepReadonly<CampaignSnapshot>["items"][number]["position"]) => (q.kind === "carried" || q.kind === "equipped") && present.has(q.character_id) || q.kind === "stored" && q.location_id === here;
        if (snapshot.items.some(i => norm(i.name) === norm(command.name) && visible(i.position))) return reject("rejected_already_established");
        return reject("rejected_insufficient_confirmation");
      }
      case "set_condition": {
        // Repair 1 class-B physical conditions: closed vocabulary, same-turn physical interaction, additive only, no status or
        // presentation change. The grammar never confirms conditions; only verified controller evidence can (hybrid mode).
        const current = snapshot.characters.find(c => c.id === command.character_id)?.current.conditions ?? [];
        const added = command.conditions.filter(c => !current.includes(c));
        const involved = (evidence.physical_interactions ?? []).some(p => p.target === command.character_id || p.actor === command.character_id || command.character_id === "nicco" && present.has(p.target));
        const ok = present.has(command.character_id) && involved && command.status === undefined && command.presentation === undefined && current.every(c => command.conditions.includes(c)) && added.length > 0 && added.every(isPhysicalCondition);
        return ok ? reject("rejected_insufficient_confirmation") : reject("rejected_reference_invalid");
      }
      case "move_character": {
        // Location Continuity Pass 1.3: a living created (campaign) character whose completed movement to exactly this location the
        // narration establishes (character_movements: the grammar already restricted movers to the scene Nicco is in or left).
        // NPC+ Pass 1: an ACTIVE authored NPC+ is movable on the same evidence; other authored NPCs remain canon-placed.
        const c = snapshot.characters.find(x => x.id === command.character_id);
        const authoredNpcPlus = (!c || c.origin.kind === "canonical") && snapshot.premium_characters.some(p => p.character_id === command.character_id && p.metadata.active_household_member);
        if (!authoredNpcPlus && (!c || c.origin.kind !== "created" || c.current.status === "dead")) return reject("rejected_reference_invalid");
        const now = c?.origin.kind === "created" ? c.current.current_location : snapshot.runtime.npc_locations.find(n => n.character_id === command.character_id)?.current_location; // OFF_SCENE: undefined
        if (now === command.location_id) return reject("rejected_already_established");
        return (evidence.character_movements ?? []).some(m => m.character_id === command.character_id && m.location_id === command.location_id) ? { command, authorized: true, reason: "authorized_narrative_confirmation" } : reject("rejected_insufficient_confirmation");
      }
      case "leave_scene": {
        // Runtime Continuity Repair 1: a present created character, still in the scene in the projected state, whose completed
        // departure the narration establishes. No player intent is involved: the controller proposes, narration evidence confirms.
        const c = snapshot.characters.find(x => x.id === command.character_id);
        // Final movement closure: an ACTIVE authored NPC+ located with Nicco may depart for an unknown destination (-> OFF_SCENE) on the same evidence.
        const authoredNpcPlus = (!c || c.origin.kind === "canonical") && snapshot.premium_characters.some(p => p.character_id === command.character_id && p.metadata.active_household_member)
          && snapshot.runtime.npc_locations.some(n => n.character_id === command.character_id && n.current_location === snapshot.runtime.scene.player_location);
        const canonicalPresent = command.character_id !== "nicco" && (!c || c.origin.kind === "canonical") && snapshot.runtime.npc_locations.some(n => n.character_id === command.character_id && n.current_location === snapshot.runtime.scene.player_location);
        const ok = present.has(command.character_id) && (canonicalPresent || authoredNpcPlus || c?.origin.kind === "created" && c.current.current_location === snapshot.runtime.scene.player_location && c.current.status !== "dead");
        if (!ok) return reject("rejected_reference_invalid");
        // Ordinary canonical departures require the strict deterministic path; a controller quote cannot bypass its gates.
        if (canonicalPresent && !authoredNpcPlus && !(evidence.departures ?? []).some(d => d.character_id === command.character_id)) return reject("rejected_reference_invalid");
        return (evidence.departures ?? []).some(d => d.character_id === command.character_id) ? { command, authorized: true, reason: "authorized_narrative_confirmation" } : reject("rejected_insufficient_confirmation");
      }
      // Household Pass 1. Membership is a voluntary choice voiced by the chooser; rules are the keeper's explicit declarations;
      // relationship deltas need verified evidence (evidence path only) and never change Nicco's feelings (player agency).
      case "join_household":
      case "leave_household": {
        const h = snapshot.households.find(x => x.id === command.household_id);
        const member = h?.members.find(m => m.character_id === command.character_id);
        const ok = !!h && present.has(command.character_id) && command.character_id !== "nicco" && (command.kind === "join_household" ? member?.status !== "member" : member?.status === "member" && member.role !== "owner");
        if (!ok) return reject(command.kind === "join_household" && member?.status === "member" ? "rejected_already_established" : "rejected_reference_invalid");
        const choice = command.kind === "join_household" ? "join" : "leave";
        return (evidence.household_choices ?? []).some(c => c.character_id === command.character_id && c.choice === choice) ? { command, authorized: true, reason: "authorized_narrative_confirmation" } : reject("rejected_insufficient_confirmation");
      }
      case "add_household_rule": {
        const h = snapshot.households.find(x => x.id === command.household_id);
        const keeper = !!h?.members.some(m => m.character_id === "nicco" && m.status === "member" && m.role === "owner");
        if (!keeper) return reject("rejected_reference_invalid");
        if ((h!.rules ?? []).some(r => r.active && r.text.trim().toLowerCase() === command.text.trim().toLowerCase())) return reject("rejected_already_established");
        return ruleMatchesDeclaration(command.text, evidence.rule_declarations ?? []) ? { command, authorized: true, reason: "authorized_narrative_confirmation" } : reject("rejected_insufficient_confirmation");
      }
      case "adjust_relationship": {
        const ok = command.from_character_id !== "nicco" && command.from_character_id !== command.to_character_id && present.has(command.from_character_id) && present.has(command.to_character_id);
        return ok ? reject("rejected_insufficient_confirmation") : reject(command.from_character_id === "nicco" ? "rejected_command_not_allowed" : "rejected_reference_invalid");
      }
      case "place_item": {
        const item = snapshot.items.find(i => i.id === command.item_id);
        const holder = item && itemHolder(item);
        if (holder && (command.position.kind === "carried" || command.position.kind === "equipped") && command.position.character_id !== holder)
          return reject("rejected_command_not_allowed"); // Character-to-character movement requires explicit transfer mode.
        if (isLocationPlacement(command, snapshot)) {
          // Permanent Inventory V1: put an existing item down at, or pick it up from, the CURRENT scene location. Physical rules only:
          // the holder/new carrier is present and the location is here; ownership never changes. Same item ID, never re-created.
          // There is no grammar path: only a verified narration quote naming the item completes it (hybrid evidence).
          const here = snapshot.runtime.scene.player_location, from = item!.position, to = command.position;
          const putDown = to.kind === "stored" && to.location_id === here && (from.kind === "carried" || from.kind === "equipped") && present.has(from.character_id);
          const pickUp = to.kind === "carried" && present.has(to.character_id) && from.kind === "stored" && from.location_id === here;
          if (isDeepStrictEqual(from, to)) return reject("rejected_already_established");
          return putDown || pickUp ? reject("rejected_insufficient_confirmation") : reject("rejected_reference_invalid");
        }
        valid = !!item && item.owner_id === "nicco" && (item.position.kind === "carried" || item.position.kind === "equipped") && item.position.character_id === "nicco";
        break;
      }
      case "set_knowledge": valid = present.has(command.knowledge.character_id) && command.knowledge.character_id !== "nicco" && snapshot.knowledge.some(k => k.character_id === "nicco" && k.fact_id === command.knowledge.fact_id && k.status === "knows") && context.facts.some(f => f.id === command.knowledge.fact_id); break;
      case "schedule_event": valid = (command.participants?.length ?? 0) > 0 && command.participants!.every(id => present.has(id)) && command.scheduled_world_minute > snapshot.runtime.scene.world_time.world_minute; break;
      default: return reject("rejected_command_not_allowed");
    }
    if (!valid) return reject("rejected_reference_invalid");
    // Phase 1O: re-telling a fact the recipient already knows is a no-op; it must not overwrite the original provenance.
    if (command.kind === "set_knowledge" && snapshot.knowledge.some(k => k.character_id === command.knowledge.character_id && k.fact_id === command.knowledge.fact_id && k.status === "knows")) return reject("rejected_already_established");
    // A semantic mode choice cannot bypass a refusal of the same physical handover.
    if (command.kind === "transfer_item") {
      const related = evidence.player_intents.flatMap((c, i) => c.kind === "transfer_item" && c.item_id === command.item_id && transferRecipient(c) === transferRecipient(command) ? [i] : []);
      if (evidence.narrator_refusals.some(r => r.command_indexes.some(i => related.includes(i)))) return reject("rejected_recipient_refused");
    }
    const index = evidence.player_intents.findIndex(c => isDeepStrictEqual(c, command));
    if (index < 0) {
      if (evidence.ambiguous_reference) return reject("rejected_ambiguous_reference");
      if (command.kind === "transfer_item" && command.position.kind === "equipped") return reject("rejected_equipment_not_established");
      if (command.kind === "schedule_event") return reject("rejected_time_not_exact");
      // Pass C: a resolved explicit player transfer binds the item, recipient and mode; narration may decide whether that transfer completed,
      // never redirect it. With no transfer intent at all, autonomous NPC transfers keep their evidence path ("insufficient confirmation").
      if (command.kind === "transfer_item") return reject(evidence.player_intents.some(c => c.kind === "transfer_item") ? "rejected_controller_mismatch" : "rejected_insufficient_confirmation");
      return reject("rejected_controller_mismatch");
    }
    if (evidence.narrator_refusals.some(r => r.command_indexes.includes(index))) return reject("rejected_recipient_refused");
    const confirmation = evidence.narrator_confirmations.find(c => c.command_indexes.includes(index));
    if (!confirmation) return reject(command.kind === "set_knowledge" ? "rejected_fact_not_communicated" : "rejected_insufficient_confirmation");
    return { command, authorized: true, reason: confirmation.collective ? "authorized_collective_acceptance" : command.kind === "set_knowledge" ? "authorized_explicit_information_transfer" : "authorized_narrative_confirmation" };
  });
}
