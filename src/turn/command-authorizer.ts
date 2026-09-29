import { isDeepStrictEqual } from "node:util";
import type { CampaignCommand, CampaignSnapshot } from "../campaign/types.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { TurnContext } from "./context-builder.js";
import type { TurnEvidence } from "./turn-evidence.js";
import type { AuthorizationDiagnostic } from "./turn-types.js";

/** Policy consumes resolved same-turn evidence, never searches arbitrary narration. */
export function authorizeCommands(proposal: readonly CampaignCommand[], evidence: TurnEvidence, context: TurnContext, snapshot: DeepReadonly<CampaignSnapshot>): readonly AuthorizationDiagnostic[] {
  const present = new Set(context.characters.map(c => c.id));
  return proposal.map(command => {
    const reject = (reason: AuthorizationDiagnostic["reason"]): AuthorizationDiagnostic => ({ command, authorized: false, reason });
    let valid = false;
    switch (command.kind) {
      case "transfer_item": {
        const item = snapshot.items.find(i => i.id === command.item_id);
        valid = !!item && item.owner_id === "nicco" && (item.position.kind === "carried" || item.position.kind === "equipped") && item.position.character_id === "nicco" && !!command.owner_id && command.owner_id !== "nicco" && present.has(command.owner_id);
        break;
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
