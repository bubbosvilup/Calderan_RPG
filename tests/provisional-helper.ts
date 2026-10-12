import { buildPromotedCharacter } from "../src/campaign/promotion.js";
import type { CampaignCharacter } from "../src/campaign/types.js";
import type { IdentityResolution } from "../src/turn/name-establishment.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";

/**
 * What an explicitly-authorized materialization (e.g. a person Actual Offer Accept) would record for each PROVISIONAL person a resolution reported:
 * the pre-AUTH-2 name-driven record, reconstructed from the provisional person's own established facts. Tests use it to assert the CONTENT guardrails
 * (never-invented facts, evidence, name provenance) without naming persistence; nothing here is production authority.
 */
export function materializedFrom(c: CampaignState, resolution: Pick<IdentityResolution, "provisional">): CampaignCharacter[] {
  const snapshot = c.exportSnapshot();
  const named = new Set(snapshot.characters.flatMap(x => x.profile.name ? [x.profile.name.toLowerCase()] : []));
  return resolution.provisional.filter(p => !p.name || !named.has(p.name.toLowerCase())).map(p => buildPromotedCharacter({ label: p.name ?? p.label, established: { ...p.established, ...(p.captive ? { role: "held captive (narrated)" } : {}) }, evidence: p.evidence,
    location_id: p.location_id, trigger: "name_established", promoted_revision: c.revision + 1, world_minute: snapshot.runtime.scene.world_time.world_minute, ephemeral_ref: p.ref,
    ...(p.name_source ? { name_source: p.name_source } : {}) }));
}

/** Applies a resolution's own commands (late naming) AND the explicit-authority materialization of its provisional people, in one commit. */
export function applyAuthorized(c: CampaignState, resolution: IdentityResolution): IdentityResolution {
  const commands = [...resolution.commands, ...materializedFrom(c, resolution).map(character => ({ kind: "register_character" as const, character }))];
  if (commands.length) c.apply({ expected_revision: c.revision, commands });
  return resolution;
}
