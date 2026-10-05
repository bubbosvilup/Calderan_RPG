import { WORLD_DAY_MINUTES } from "../world/runtime-domain.js";

/** Projection of the existing primitive clock, not a calendar or time-advance rule. */
export function temporalGrounding(worldMinute: number) {
  const minute = (worldMinute % WORLD_DAY_MINUTES + WORLD_DAY_MINUTES) % WORLD_DAY_MINUTES;
  const hour = Math.floor(minute / 60);
  return { world_minute: worldMinute, day: Math.floor(worldMinute / WORLD_DAY_MINUTES),
    actual_time: `${String(hour).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}` };
}
export const TEMPORAL_GROUNDING_RULE = "TEMPORAL GROUNDING: The authoritative clock determines the current time. Do not infer morning, afternoon, evening or night from prior prose, lighting, mood, traffic, habits or schedules. Conversation alone does not advance time; unchanged clock means unchanged time of day. Describe current lighting/traffic consistently with that clock. No calendar, season or sunrise/sunset time is established.";
