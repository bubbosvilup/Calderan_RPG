import type { WorldStore } from "../world/world-store.js";
import type { DeepReadonly } from "../types/readonly.js";
import type { CampaignDomains } from "./types.js";

/**
 * Household Pass 1 age eligibility (romance gate). Deterministic and fail-safe: only an established adult age counts as adult.
 * Sources, in order: a campaign profile's exact or approximate age; a canonical age_band; a canonical "N-year-old" statement.
 * Any stated age under 18, or child/minor wording, is a minor. Anything else is unknown, and unknown is never treated as adult.
 */
export type AgeStatus = "adult" | "minor" | "unknown";
const MINOR_WORDS = /\b(?:child|children|minor|underage|girl of \d|boy of \d|infant|toddler|adolescent|teen(?:ager|age)?|juvenile)\b/i;
function fromText(text: string): AgeStatus {
  if (MINOR_WORDS.test(text)) return "minor";
  const numbers = [...text.matchAll(/\b(\d{1,3})\b/g)].map(m => Number(m[1]));
  if (numbers.length) return numbers.every(n => n >= 18) ? "adult" : "minor";
  if (/\badult\b|\bmiddle[- ]aged?\b|\belderly\b|\bold\b|\blate middle age\b/i.test(text)) return "adult";
  return "unknown";
}
export function ageStatus(world: WorldStore, domains: DeepReadonly<Pick<CampaignDomains, "characters">>, id: string): AgeStatus {
  const age = domains.characters.find(c => c.id === id)?.profile.age;
  if (age?.kind === "exact") return age.years >= 18 ? "adult" : "minor";
  if (age?.kind === "approximate") { const s = fromText(age.description); if (s !== "unknown") return s; }
  const entity = world.getEntity(id);
  if (entity?.type !== "character") return "unknown";
  if ("age_band" in entity && entity.age_band) { const s = fromText(entity.age_band); if (s !== "unknown") return s; }
  const stated = `${entity.summary} ${entity.content}`.match(/\b(\d{1,3})-year-old\b/);
  return stated ? (Number(stated[1]) >= 18 ? "adult" : "minor") : "unknown";
}
