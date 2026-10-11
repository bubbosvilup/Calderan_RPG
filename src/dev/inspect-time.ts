import { loadWorld } from "../world/loader.js";
import { calendarMomentAt, formatCalendarDate, formatClock, observancesOf, worldMinuteOf, type CalendarPosition } from "../world/calendar.js";
import { environmentAt, describeWeather, resolveClimateProfileId } from "../world/environment.js";
import { weatherAt } from "../world/weather.js";
import type { ClimateProfileId } from "../world/climate.js";

/**
 * Deterministic developer inspection of the calendar and weather (no provider, no network, no campaign needed).
 *   inspect:time                      sample matrix across Year 1191 and the start of 1192 for West, Center, East and the South profiles
 *   inspect:time <world_minute> [location_id]
 */
const SEED = "inspect-seed";
const world = await loadWorld("data");
export function inspectCalendar(worldMinute: number): string {
  const d = calendarMomentAt(worldMinute), obs = observancesOf(d).map(o => o.name).join("; ");
  return `${worldMinute} -> ${formatCalendarDate(d, "compact")} ${formatClock(d.minute_of_day)}${d.kind === "regular" ? ` | ${d.season_name} (${d.month_id})` : " | no month, week or season"}${obs ? ` | ${obs}` : ""}`;
}
export function inspectWeather(worldMinute: number, locationId: string, seed = SEED): string {
  const e = environmentAt(world, seed, worldMinute, locationId);
  return `${locationId}: ${e.climate_profile_id ?? "no climate"} | ${e.weather ? `${describeWeather(e.weather)} (${e.weather.condition}/${e.weather.temperature})` : e.weather_status}`;
}
const arg = process.argv[2];
if (arg !== undefined) {
  const minute = Number(arg), place = process.argv[3] ?? "calderan";
  console.log(inspectCalendar(minute)); console.log(inspectWeather(minute, place));
} else {
  const samples: [string, CalendarPosition][] = [
    ["Aurel Alpha 1", { year: 1191, month_index: 1, day_of_month: 1 }], ["Aurel Med 1", { year: 1191, month_index: 2, day_of_month: 1 }], ["Sol Med 15", { year: 1191, month_index: 5, day_of_month: 15 }],
    ["Vesp Alpha 1", { year: 1191, month_index: 7, day_of_month: 1 }], ["Vesp Med 30", { year: 1191, month_index: 8, day_of_month: 30 }], ["Hiem X 30", { year: 1191, month_index: 12, day_of_month: 30 }],
    ["First Sun", { year: 1191, intercalary_index: 1 }], ["Fifth Sun", { year: 1191, intercalary_index: 5 }], ["Sixth Sun", { year: 1191, intercalary_index: 6 }], ["1192 Aurel Alpha 1", { year: 1192, month_index: 1, day_of_month: 1 }],
  ];
  const places = ["calderan", "center", "east", "south_hot", "south_cold"];
  const south = new Map<string, ClimateProfileId>([["south_hot", "south_hot"], ["south_cold", "south_cold"]]);
  for (const [label, position] of samples) {
    const minute = worldMinuteOf(position, 12 * 60);
    console.log(`\n== ${label}\n${inspectCalendar(minute)}`);
    for (const p of places) {
      const profile = south.get(p);
      console.log(profile ? `${p}: ${profile} | ${describeWeather(weatherAt(SEED, profile, minute))}` : inspectWeather(minute, p));
    }
  }
  console.log(`\nclimate of south_continent: ${resolveClimateProfileId(world, "south_continent")} (a mixed profile has no weather of its own)`);
}
