import type { CampaignCommand } from "./types.js";
import type { PreparationContext } from "./preparation.js";
import { findRequired, historicalMinute, worldMinute } from "./preparation.js";
import { fail } from "./validation.js";
import { compareIds } from "../world/provenance.js";

export function prepareSocialCommand(context: PreparationContext, command: CampaignCommand): boolean {
  const { draft, refs } = context;
  switch (command.kind) {
    case "create_household":
      refs.newId(command.id, "household");
      draft.households.push({ id: command.id, ...(command.name === undefined ? {} : { name: command.name }), members: [] }); return true;
    case "set_membership": {
      const h = findRequired(draft.households, command.household_id, "household_id"), next = command.membership;
      refs.character(next.character_id); historicalMinute(next.joined_at, context, "joined_at");
      const prior = h.members.find(m => m.character_id === next.character_id);
      if (next.status === "former_member" && !prior) fail("membership", "cannot leave a household never joined");
      if (next.joined_at === undefined) {
        if (prior?.joined_at !== undefined && !(prior.status === "former_member" && next.status !== "former_member")) next.joined_at = prior.joined_at;
        else next.joined_at = worldMinute(context);
      }
      h.members = [...h.members.filter(m => m.character_id !== next.character_id), next].sort((a, b) => compareIds(a.character_id, b.character_id)); return true;
    }
    case "create_fact": {
      const fact = command.fact; refs.newId(fact.id, "fact");
      if (fact.content.kind === "canonical") {
        refs.canonical(fact.content.entity_id);
        if (fact.content.chunk_id !== undefined && refs.world.getChunk(fact.content.chunk_id)?.entity_id !== fact.content.entity_id) fail("chunk_id", "canonical fact chunk must belong to referenced entity");
      }
      draft.facts.push(fact); return true;
    }
    case "set_knowledge": {
      const k = command.knowledge; refs.character(k.character_id); findRequired(draft.facts, k.fact_id, "fact_id");
      if (k.provenance) {
        historicalMinute(k.provenance.learned_at, context, "learned_at");
        if (k.provenance.source_character_id !== undefined) refs.character(k.provenance.source_character_id);
        if (k.provenance.source_event_id !== undefined) refs.event(k.provenance.source_event_id);
      }
      draft.knowledge = [...draft.knowledge.filter(old => old.character_id !== k.character_id || old.fact_id !== k.fact_id), k]; return true;
    }
    case "seed_relationship":
    case "set_trust": {
      const edge = command.kind === "seed_relationship" ? command.relationship : command;
      refs.character(edge.from_character_id); refs.character(edge.to_character_id);
      if (edge.from_character_id === edge.to_character_id) fail("relationship", "self-edge forbidden");
      const prior = draft.relationships.find(e => e.from_character_id === edge.from_character_id && e.to_character_id === edge.to_character_id);
      if (command.kind === "seed_relationship") {
        if (prior) fail("relationship", "edge already seeded"); draft.relationships.push(command.relationship);
      } else {
        if (!prior) fail("relationship", "seed explicit initial trust before updating an edge"); prior.trust = command.trust;
      }
      return true;
    }
    default: return false;
  }
}
