import { calendarMomentAt, formatCalendarDate, formatClock, observancesOf, type CalendarMoment, type Observance } from "./calendar.js";
import { CLIMATE_PROFILES, isClimateProfileId, type ClimateProfileId, type TemperatureBand, type WeatherCondition } from "./climate.js";
import { weatherAt, type WeatherState } from "./weather.js";
import type { WorldStore } from "./world-store.js";

/**
 * Environment = Calendar + Season + Weather for one place and moment. It is a pure, deterministic derivation from authoritative
 * `world_minute`, the immutable campaign id (the weather seed) and the authored location; nothing is persisted and nothing here can
 * mutate a campaign.
 */
export type WeatherStatus = "ok" | "no_climate" | "needs_climate_zone";
/** Authored exposure of a place. Not inherited (a room inside an outdoor district is not outdoors); climate is inherited, exposure is not. */
export type EnvironmentExposure = "indoor" | "outdoor" | "sheltered" | "unknown";
export interface EnvironmentState {
  readonly exposure: EnvironmentExposure;
  readonly calendar: CalendarMoment;
  readonly observances: readonly Observance[];
  readonly climate_profile_id: ClimateProfileId | null;
  readonly weather: WeatherState | null;
  readonly weather_status: WeatherStatus;
}

/** Nearest authored `climate_profile` on the location or its geographic ancestors (a child may override its parent). */
export function resolveClimateProfileId(world: WorldStore, locationId: string): ClimateProfileId | undefined {
  for (const entity of [world.getEntity(locationId), ...world.getAncestors(locationId)]) {
    if (entity?.type === "location" && entity.climate_profile !== undefined) return isClimateProfileId(entity.climate_profile) ? entity.climate_profile : undefined;
  }
  return undefined;
}
export function resolveExposure(world: WorldStore, locationId: string | null): EnvironmentExposure {
  const entity = locationId ? world.getEntity(locationId) : undefined, value = entity?.type === "location" ? entity.environment_exposure : undefined;
  return value === "indoor" || value === "outdoor" || value === "sheltered" ? value : "unknown";
}
export function environmentAt(world: WorldStore, campaignId: string, worldMinute: number, locationId: string | null): EnvironmentState {
  const calendar = calendarMomentAt(worldMinute), observances = observancesOf(calendar);
  const profileId = locationId ? resolveClimateProfileId(world, locationId) : undefined, exposure = resolveExposure(world, locationId);
  if (!profileId) return Object.freeze({ exposure, calendar, observances, climate_profile_id: null, weather: null, weather_status: "no_climate" as const });
  if (CLIMATE_PROFILES[profileId].mixed) return Object.freeze({ exposure, calendar, observances, climate_profile_id: profileId, weather: null, weather_status: "needs_climate_zone" as const });
  return Object.freeze({ exposure, calendar, observances, climate_profile_id: profileId, weather: weatherAt(campaignId, profileId, worldMinute), weather_status: "ok" as const });
}

// ------------------------------------------------------------------------------------------------ narrator-safe text
const TEMPERATURE_WORDS: Record<TemperatureBand, string> = { very_cold: "Bitterly cold", cold: "Cold", cool: "Cool", mild: "Mild", warm: "Warm", hot: "Hot", very_hot: "Scorching" };
const CONDITION_WORDS: Record<WeatherCondition, string> = {
  clear: "clear skies", partly_cloudy: "partly cloudy", overcast: "overcast", light_rain: "light rain", rain: "rain", heavy_rain: "heavy rain", thunderstorm: "thunderstorm",
  fog: "fog", windy: "windy", frost: "frost", sleet: "sleet", light_snow: "light snow", snow: "snow", heavy_snow: "heavy snow", blizzard: "blizzard", dry_heat: "dry heat", dust_wind: "dust wind",
};
/** "Cool, light rain." (no ids, seeds or block numbers). */
export const describeWeather = (w: WeatherState): string => `${TEMPERATURE_WORDS[w.temperature]}, ${CONDITION_WORDS[w.condition]}.`;
export const weatherWords = { temperature: TEMPERATURE_WORDS, condition: CONDITION_WORDS };

/** Date text for the scene: regular "Vesp Alpha 1, Stonewake"; intercalary "First Sun, Year 1191". */
export const describeDate = (e: EnvironmentState): string => formatCalendarDate(e.calendar);
/** The one-line clock and daypart-free form used by read models. */
export const describeClock = (e: EnvironmentState): string => formatClock(e.calendar.minute_of_day);
