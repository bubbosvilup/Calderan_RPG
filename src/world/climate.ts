import type { SeasonId, SeasonPhase } from "./calendar.js";

/**
 * Climate profiles — the regional BASELINE under Weather. Season (calendar), climate (regional baseline) and weather (the current
 * local condition) are three separate concepts: the same day is spring, summer, autumn or winter everywhere, while a climate profile
 * only biases which conditions are likely and how warm it feels. These tables are the single source of truth for weather weights;
 * they are validated at module load (`validateClimateProfiles`) and are never read from prose.
 *
 * No latitude, ocean, pressure or humidity physics is modelled: only biases, and continuity weighting in weather.ts.
 */
export const WEATHER_CONDITIONS = [
  "clear", "partly_cloudy", "overcast", "light_rain", "rain", "heavy_rain", "thunderstorm", "fog", "windy",
  "frost", "sleet", "light_snow", "snow", "heavy_snow", "blizzard", "dry_heat", "dust_wind",
] as const;
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];
export const TEMPERATURE_BANDS = ["very_cold", "cold", "cool", "mild", "warm", "hot", "very_hot"] as const;
export type TemperatureBand = (typeof TEMPERATURE_BANDS)[number];

export type ClimateProfileId = "west_cool_maritime" | "center_hot_arid" | "east_cold_continental" | "south_hot" | "south_cold" | "south_mixed";
export const CLIMATE_PROFILE_IDS: readonly ClimateProfileId[] = ["west_cool_maritime", "center_hot_arid", "east_cold_continental", "south_hot", "south_cold", "south_mixed"];
type Weights = Partial<Record<WeatherCondition, number>>;
type SeasonWeights = Record<SeasonId, Weights>;
type PhaseMods = Record<SeasonId, Partial<Record<SeasonPhase, Weights>>>;
export interface ClimateProfile {
  readonly id: ClimateProfileId;
  /** Human-readable label (design reference only; never rendered to the narrator). */
  readonly label: string;
  /** `mixed` profiles have no weather of their own: a child location must choose a concrete profile. */
  readonly mixed?: true;
  /** Base weights per season (relative, not normalised). */
  readonly season_weights: SeasonWeights;
  /** Multiplicative phase modifiers per season and phase (alpha opening, med height, x exit); omitted = 1. */
  readonly phase_mods: PhaseMods;
  /** Daytime temperature index (0 very_cold … 6 very_hot, fractional) per month, in calendar month order. */
  readonly month_temperature: readonly number[];
  /** Offset by six-hour block of the day: 00-06, 06-12, 12-18, 18-24. */
  readonly block_offsets: readonly [number, number, number, number];
}
const PHASELESS: PhaseMods = { spring: {}, summer: {}, autumn: {}, winter: {} };

const WEST: ClimateProfile = {
  id: "west_cool_maritime", label: "cool northern maritime",
  season_weights: {
    spring: { clear: 14, partly_cloudy: 20, overcast: 18, light_rain: 18, rain: 12, heavy_rain: 3, thunderstorm: 0.5, fog: 6, windy: 5, frost: 3, light_snow: 1 },
    summer: { clear: 24, partly_cloudy: 28, overcast: 12, light_rain: 12, rain: 6, heavy_rain: 1, thunderstorm: 3, fog: 3, windy: 4 },
    autumn: { clear: 8, partly_cloudy: 14, overcast: 22, light_rain: 20, rain: 16, heavy_rain: 5, thunderstorm: 0.5, fog: 7, windy: 8, frost: 2, light_snow: 0.3 },
    winter: { clear: 4, partly_cloudy: 7, overcast: 20, light_rain: 5, rain: 3, fog: 5, windy: 6, frost: 12, sleet: 8, light_snow: 18, snow: 16, heavy_snow: 6, blizzard: 3 },
  },
  phase_mods: {
    spring: { alpha: { frost: 2.5, light_snow: 3 }, x: { frost: 0.3, clear: 1.2, thunderstorm: 2 } },
    summer: { med: { clear: 1.2 }, x: { rain: 1.4, overcast: 1.3 } },
    autumn: { alpha: { frost: 0.4, light_snow: 0.2, clear: 1.2 }, x: { frost: 3, light_snow: 4, sleet: 3, windy: 1.2 } },
    winter: { alpha: { light_rain: 2, rain: 2, sleet: 1.2, snow: 0.7, blizzard: 0.5 }, med: { snow: 1.3, blizzard: 1.5, frost: 1.2 }, x: { snow: 1.1 } },
  },
  month_temperature: [1.4, 1.8, 2.2, 2.8, 3.2, 2.9, 2.0, 1.7, 1.3, 1.1, 0.8, 0.9],
  block_offsets: [-0.8, -0.2, 0.4, -0.5],
};
const CENTER: ClimateProfile = {
  id: "center_hot_arid", label: "hot arid",
  season_weights: {
    spring: { clear: 35, partly_cloudy: 25, overcast: 6, dry_heat: 15, windy: 8, dust_wind: 6, light_rain: 3, thunderstorm: 0.5 },
    summer: { clear: 28, partly_cloudy: 10, overcast: 2, dry_heat: 45, windy: 4, dust_wind: 7, light_rain: 0.5, thunderstorm: 1 },
    autumn: { clear: 38, partly_cloudy: 22, overcast: 6, dry_heat: 18, windy: 8, dust_wind: 6, light_rain: 2 },
    winter: { clear: 40, partly_cloudy: 28, overcast: 12, windy: 8, dust_wind: 4, light_rain: 5, rain: 2, thunderstorm: 0.3, fog: 1 },
  },
  phase_mods: { ...PHASELESS, summer: { med: { dry_heat: 1.3 } }, winter: { alpha: { light_rain: 1.5 } } },
  month_temperature: [3.7, 3.9, 4.2, 5.0, 5.4, 5.2, 4.4, 4.0, 3.6, 3.4, 3.2, 3.4],
  block_offsets: [-1.6, -0.6, 0.5, -0.9],
};
const EAST: ClimateProfile = {
  id: "east_cold_continental", label: "cold continental subarctic",
  season_weights: {
    spring: { clear: 10, partly_cloudy: 14, overcast: 20, light_rain: 12, rain: 6, light_snow: 14, snow: 8, sleet: 8, fog: 8, frost: 14, windy: 6 },
    summer: { clear: 22, partly_cloudy: 28, overcast: 16, light_rain: 16, rain: 8, heavy_rain: 1, thunderstorm: 3, fog: 5, windy: 5, frost: 0.5 },
    autumn: { clear: 8, partly_cloudy: 12, overcast: 22, light_rain: 14, rain: 8, sleet: 8, frost: 16, light_snow: 12, snow: 6, heavy_snow: 1, fog: 5, windy: 7 },
    winter: { clear: 8, partly_cloudy: 5, overcast: 14, fog: 2, windy: 6, sleet: 1, frost: 20, light_snow: 18, snow: 22, heavy_snow: 12, blizzard: 8 },
  },
  phase_mods: {
    spring: { alpha: { snow: 2, frost: 1.5, rain: 0.5 }, med: { rain: 1.6, light_rain: 1.4, snow: 0.4, sleet: 0.7 }, x: { rain: 1.8, light_rain: 1.5, snow: 0.1, light_snow: 0.2, frost: 0.3, clear: 1.5 } },
    summer: {},
    autumn: { alpha: { frost: 0.5, snow: 0.3, light_snow: 0.4 }, med: { frost: 1.2, snow: 2 }, x: { snow: 3, heavy_snow: 3, light_snow: 2, frost: 1.3, rain: 0.3, light_rain: 0.4 } },
    winter: {},
  },
  month_temperature: [0.8, 1.2, 1.7, 2.2, 2.8, 2.4, 1.8, 1.0, 0.4, 0.0, -0.4, -0.1],
  block_offsets: [-0.7, -0.2, 0.4, -0.4],
};
/** The hot western half of the South Continent resembles Center; the cold eastern half resembles East. Future South locations choose one. */
const SOUTH_HOT: ClimateProfile = { ...CENTER, id: "south_hot", label: "south, hot western half" };
const SOUTH_COLD: ClimateProfile = { ...EAST, id: "south_cold", label: "south, cold eastern half" };
const SOUTH_MIXED: ClimateProfile = { ...CENTER, id: "south_mixed", label: "south, mixed", mixed: true };

export const CLIMATE_PROFILES: Readonly<Record<ClimateProfileId, ClimateProfile>> = Object.freeze({
  west_cool_maritime: WEST, center_hot_arid: CENTER, east_cold_continental: EAST, south_hot: SOUTH_HOT, south_cold: SOUTH_COLD, south_mixed: SOUTH_MIXED,
});
export const isClimateProfileId = (value: unknown): value is ClimateProfileId => typeof value === "string" && (CLIMATE_PROFILE_IDS as readonly string[]).includes(value);

/** Fail-fast structural validation of the profile tables (run once at load; also callable from tests). */
export function validateClimateProfiles(profiles: Readonly<Record<string, ClimateProfile>> = CLIMATE_PROFILES): void {
  const known = new Set<string>(WEATHER_CONDITIONS);
  for (const [key, p] of Object.entries(profiles)) {
    if (p.id !== key) throw new Error(`climate: profile key ${key} does not match id ${p.id}`);
    if (p.month_temperature.length !== 12) throw new Error(`climate: ${key} needs 12 month temperatures`);
    for (const t of p.month_temperature) if (!Number.isFinite(t) || t < -1 || t > 7) throw new Error(`climate: ${key} month temperature out of range`);
    for (const s of ["spring", "summer", "autumn", "winter"] as const) {
      const w = p.season_weights[s];
      let total = 0;
      for (const [c, v] of Object.entries(w)) { if (!known.has(c)) throw new Error(`climate: ${key}/${s} unknown condition ${c}`); if (!(v! >= 0) || !Number.isFinite(v)) throw new Error(`climate: ${key}/${s}/${c} invalid weight`); total += v!; }
      if (total <= 0) throw new Error(`climate: ${key}/${s} has no positive weight`);
      for (const mods of Object.values(p.phase_mods[s])) for (const [c, v] of Object.entries(mods)) if (!known.has(c) || !(v! >= 0)) throw new Error(`climate: ${key}/${s} invalid phase modifier ${c}`);
    }
  }
}
validateClimateProfiles();
