import { RELATIONSHIP_LEVELS, type CampaignCommand } from "./types.js";
import { ageStatus } from "./age.js";
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
    // Household Pass 1: explicit voluntary membership transitions. Never inferred from ownership, location or relationships.
    case "join_household": {
      const h = findRequired(draft.households, command.household_id, "household_id"); refs.character(command.character_id);
      const prior = h.members.find(m => m.character_id === command.character_id);
      if (prior?.status === "member") fail("membership", "already a household member");
      h.members = [...h.members.filter(m => m.character_id !== command.character_id), { character_id: command.character_id, status: "member" as const, joined_at: worldMinute(context), ...(prior?.role ? { role: prior.role } : {}) }]
        .sort((a, b) => compareIds(a.character_id, b.character_id));
      return true;
    }
    case "leave_household": {
      const h = findRequired(draft.households, command.household_id, "household_id"); refs.character(command.character_id);
      const prior = h.members.find(m => m.character_id === command.character_id);
      if (prior?.status !== "member") fail("membership", "only a current member can leave");
      if (prior.role === "owner") fail("membership", "the household keeper cannot leave through this command");
      prior.status = "former_member"; return true;
    }
    case "add_household_rule": {
      const h = findRequired(draft.households, command.household_id, "household_id");
      const rules = h.rules ?? [];
      if (rules.some(r => r.active && r.text.trim().toLowerCase() === command.text.trim().toLowerCase())) fail("rule", "identical active rule already exists");
      h.rules = [...rules, { id: `rule_${rules.length + 1}`, text: command.text.trim(), created_revision: draft.revision + 1, active: true }];
      return true;
    }
    case "set_household_rule_active": {
      const h = findRequired(draft.households, command.household_id, "household_id");
      const rule = (h.rules ?? []).find(r => r.id === command.rule_id);
      if (!rule) fail("rule_id", "unknown household rule");
      rule.active = command.active; return true;
    }
    case "adjust_relationship": {
      refs.character(command.from_character_id); refs.character(command.to_character_id);
      if (command.from_character_id === command.to_character_id) fail("relationship", "self-edge forbidden");
      if (command.dimension === "romance" && (ageStatus(refs.world, draft, command.from_character_id) !== "adult" || ageStatus(refs.world, draft, command.to_character_id) !== "adult"))
        fail("relationship.romance", "romance requires two established adults");
      let edge = draft.relationships.find(e => e.from_character_id === command.from_character_id && e.to_character_id === command.to_character_id);
      if (!edge) { edge = { from_character_id: command.from_character_id, to_character_id: command.to_character_id }; draft.relationships.push(edge); }
      const levels = RELATIONSHIP_LEVELS, current = levels.indexOf(edge.dimensions?.[command.dimension] ?? "none");
      // One bounded step per command: a single event never turns hostility into devotion.
      const next = Math.max(0, Math.min(levels.length - 1, current + (command.direction === "raise" ? 1 : -1)));
      if (next === current) fail("relationship", `already at the ${command.direction === "raise" ? "upper" : "lower"} bound`);
      edge.dimensions = { ...edge.dimensions, [command.dimension]: levels[next]! };
      return true;
    }
    case "seed_relationship":
    case "set_trust": {
      const edge = command.kind === "seed_relationship" ? command.relationship : command;
      refs.character(edge.from_character_id); refs.character(edge.to_character_id);
      if (edge.from_character_id === edge.to_character_id) fail("relationship", "self-edge forbidden");
      const prior = draft.relationships.find(e => e.from_character_id === edge.from_character_id && e.to_character_id === edge.to_character_id);
      if (command.kind === "seed_relationship") {
        if (prior) fail("relationship", "edge already seeded");
        const romance = command.relationship.dimensions?.romance;
        if (romance && romance !== "none" && (ageStatus(refs.world, draft, edge.from_character_id) !== "adult" || ageStatus(refs.world, draft, edge.to_character_id) !== "adult")) fail("relationship.romance", "romance requires two established adults");
        draft.relationships.push(command.relationship);
      } else {
        if (!prior) fail("relationship", "seed explicit initial trust before updating an edge"); prior.trust = command.trust;
      }
      return true;
    }
    default: return false;
  }
}
