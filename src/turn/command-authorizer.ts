import { isDeepStrictEqual } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { TurnContext } from "./context-builder.js";
import type { TurnEvidence } from "./turn-evidence.js";
import type { AuthorizationDiagnostic } from "./turn-types.js";
import { isPhysicalCondition } from "./physical-interaction.js";

/** Policy consumes resolved same-turn evidence, never searches arbitrary narration. */
export function authorizeCommands(proposal: readonly CampaignCommand[], evidence: TurnEvidence, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>): readonly AuthorizationDiagnostic[] {
  const present = new Set(context.characters.map(c => c.id));
  return proposal.map(command => {
    const reject = (reason: AuthorizationDiagnostic["reason"]): AuthorizationDiagnostic => ({ command, authorized: false, reason });
    let valid = false;
    switch (command.kind) {
      case "transfer_item": {
        const item = snapshot.items.find(i => i.id === command.item_id);
        const holder = item && (item.position.kind === "carried" || item.position.kind === "equipped") ? item.position.character_id : undefined;
        // Outbound: Nicco owns and holds the item and gives it to a present character.
        const outbound = !!item && item.owner_id === "nicco" && holder === "nicco" && !!command.owner_id && command.owner_id !== "nicco" && present.has(command.owner_id);
        // Inbound (Repair 1): a present character who both owns and holds the exact item gives it to Nicco, who carries it.
        // No remote transfer, no transfer from a mere carrier or owner, never directly into an equipment slot.
        const inbound = !!item && !!holder && holder !== "nicco" && item.owner_id === holder && present.has(holder) && command.owner_id === "nicco" && command.position.kind === "carried" && command.position.character_id === "nicco";
        valid = outbound || inbound;
        break;
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
      case "place_item": {
        const item = snapshot.items.find(i => i.id === command.item_id);
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
    const index = evidence.player_intents.findIndex(c => isDeepStrictEqual(c, command));
    if (index < 0) {
      if (evidence.ambiguous_reference) return reject("rejected_ambiguous_reference");
      if (command.kind === "transfer_item" && command.position.kind === "equipped") return reject("rejected_equipment_not_established");
      if (command.kind === "schedule_event") return reject("rejected_time_not_exact");
      return reject("rejected_controller_mismatch");
    }
    if (evidence.narrator_refusals.some(r => r.command_indexes.includes(index))) return reject("rejected_recipient_refused");
    const confirmation = evidence.narrator_confirmations.find(c => c.command_indexes.includes(index));
    if (!confirmation) return reject(command.kind === "set_knowledge" ? "rejected_fact_not_communicated" : "rejected_insufficient_confirmation");
    return { command, authorized: true, reason: confirmation.collective ? "authorized_collective_acceptance" : command.kind === "set_knowledge" ? "authorized_explicit_information_transfer" : "authorized_narrative_confirmation" };
  });
}
