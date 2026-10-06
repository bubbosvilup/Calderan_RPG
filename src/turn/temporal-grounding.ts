import { WORLD_DAY_MINUTES } from "../world/runtime-domain.js";

/** Fixed, non-seasonal V1 labels; upper bounds are exclusive minute-of-day values. */
const DAYPARTS = [
  [60, "Midnight"], [300, "Deep Hours"], [390, "Sunrise"], [570, "Morning"],
  [720, "Late Morning"], [840, "Early Afternoon"], [990, "Afternoon"],
  [1110, "Late Afternoon"], [1170, "Sunset"], [1290, "Evening"],
  [1380, "Late Evening"], [1410, "Night"], [WORLD_DAY_MINUTES, "Midnight"],
] as const;
export type TimeOfDay = (typeof DAYPARTS)[number][1];

/** Projection of the existing primitive clock, not a calendar or time-advance rule. */
export function temporalGrounding(worldMinute: number) {
  const minute = (worldMinute % WORLD_DAY_MINUTES + WORLD_DAY_MINUTES) % WORLD_DAY_MINUTES;
  const hour = Math.floor(minute / 60);
  return { world_minute: worldMinute, day: Math.floor(worldMinute / WORLD_DAY_MINUTES),
    minute_of_day: minute, time_of_day: DAYPARTS.find(([end]) => minute < end)![1],
    actual_time: `${String(hour).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}` };
}
export const TEMPORAL_GROUNDING_RULE = "TEMPORAL GROUNDING: Authoritative runtime time determines the current time of day; use the supplied time_of_day. Do not infer another daypart from prior prose, lighting, mood, traffic or habits. Conversation alone does not advance time; unchanged clock means unchanged time of day. Describe lighting/traffic consistently with that label. Labels are fixed; no calendar, season or dynamic sunrise/sunset model exists.";
