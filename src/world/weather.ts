import { calendarDateAt, floorDiv, floorMod, type CalendarDate, type SeasonId, type SeasonPhase } from "./calendar.js";
import { CLIMATE_PROFILES, TEMPERATURE_BANDS, WEATHER_CONDITIONS, type ClimateProfile, type ClimateProfileId, type TemperatureBand, type WeatherCondition } from "./climate.js";

/**
 * Weather System V1 — deterministic, bounded, continuity-weighted pseudo-random weather. The LLM never rolls or selects weather.
 *
 * Time model: weather is generated in fixed SIX-HOUR blocks (00:00, 06:00, 12:00, 18:00), at most four states per day, so weather never
 * rerolls per turn. A block index is floorDiv(world_minute, 360).
 *
 * Determinism: the only inputs are a stable campaign seed string (the immutable campaign id), the climate profile id (so every place
 * sharing a profile shares weather) and the block index. No Math.random, no real clock, no model output.
 *
 * Continuity without replaying world history (Debt Zero: sliding window, no seam): the state of block N is the last link of a short chain that
 * starts WEATHER_LOOKBACK_BLOCKS earlier. The first block of that chain is a history-free draw; every later block is drawn with weights
 * shaped by the previous block(s) of the same chain. N's state is therefore a pure function of (seed, profile, N) computed from
 * WEATHER_LOOKBACK_BLOCKS + 1 small draws, regardless of the order or number of calls, with nothing persisted. Neighbouring windows share
 * all but one draw, so the weather evolves smoothly across every block boundary, including what used to be the weekly seam. Memory of the
 * chain is bounded by the window (a streak is counted at most WEATHER_LOOKBACK_BLOCKS + 1 blocks back).
 */
export const WEATHER_BLOCK_MINUTES = 360;
export const WEATHER_BLOCKS_PER_DAY = 4;
/** Blocks of history a block's state depends on (seven days minus one block); the chain is LOOKBACK + 1 draws long. */
export const WEATHER_LOOKBACK_BLOCKS = 27;

export interface WeatherState {
  readonly condition: WeatherCondition;
  readonly temperature: TemperatureBand;
  readonly profile_id: ClimateProfileId;
  readonly block_index: number;
}
export const weatherBlockIndex = (worldMinute: number): number => floorDiv(worldMinute, WEATHER_BLOCK_MINUTES);

// ------------------------------------------------------------------------------------------------ seeded random
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  // Final avalanche so adjacent block numbers do not give correlated draws.
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}
/** One uniform draw in [0, 1) from (seed, profile, block). */
export function weatherDraw(seed: string, profileId: string, block: number): number {
  return hash32(`weather|${seed}|${profileId}|${block}`) / 4294967296;
}

// ------------------------------------------------------------------------------------------------ weights
const RAIN = new Set<WeatherCondition>(["light_rain", "rain", "heavy_rain", "thunderstorm"]);
const CLOUD = new Set<WeatherCondition>(["overcast", "fog"]);
const SNOWFALL = new Set<WeatherCondition>(["sleet", "light_snow", "snow", "heavy_snow", "blizzard"]);
const SNOWY = new Set<WeatherCondition>(["frost", ...SNOWFALL]);
const HEAT = new Set<WeatherCondition>(["dry_heat", "dust_wind"]);
const FAIR = new Set<WeatherCondition>(["clear", "partly_cloudy"]);

/** Climate season and phase of a date: intercalary days have no calendar season, so their CLIMATE baseline is late winter (Hiem X). */
export function climateSeasonOf(date: CalendarDate): { readonly season: SeasonId; readonly phase: SeasonPhase; readonly month_index: number } {
  return date.kind === "regular" ? { season: date.season_id, phase: date.season_phase, month_index: date.month_index } : { season: "winter", phase: "x", month_index: 12 };
}
/** Base weights of a profile for a season and phase (climate x season x phase), before any continuity or time-of-day shaping. */
export function baseWeatherWeights(profile: ClimateProfile, season: SeasonId, phase: SeasonPhase): Record<WeatherCondition, number> {
  const out = {} as Record<WeatherCondition, number>, base = profile.season_weights[season], mods = profile.phase_mods[season][phase] ?? {};
  for (const c of WEATHER_CONDITIONS) out[c] = (base[c] ?? 0) * (mods[c] ?? 1);
  return out;
}
/** Time-of-day shaping where it matters: fog and frost at night and morning, storms and heat in the afternoon. Index 0..3 = six-hour block of the day. */
const BLOCK_SHAPE: Partial<Record<WeatherCondition, readonly [number, number, number, number]>> = {
  fog: [1.6, 1.4, 0.5, 1.0], frost: [1.8, 1.3, 0.4, 1.0], thunderstorm: [0.6, 0.8, 1.8, 1.0], dry_heat: [0.2, 0.8, 1.5, 0.6],
};
/** Continuity multiplier for `next` after `prev` (which has lasted `streak` blocks). Impossible neighbours are exactly zero. */
export function transitionMultiplier(prev: WeatherCondition, streak: number, next: WeatherCondition): number {
  let m = 1;
  if (next === prev) { m *= 1.5; if (RAIN.has(next) && streak >= 3) m *= 0.75; else if (streak >= 5) m *= 0.8; }
  if (prev === "heavy_rain") { if (RAIN.has(next) || CLOUD.has(next)) m *= 1.6; if (FAIR.has(next)) m *= 0.6; if (HEAT.has(next)) m *= 0.05; }
  else if (RAIN.has(prev)) { if (CLOUD.has(next)) m *= 1.3; if (next === "dry_heat") m *= 0.3; }
  if (prev === "blizzard") { if (SNOWFALL.has(next)) m *= 1.8; if (next === "overcast") m *= 1.5; if (FAIR.has(next)) m *= 0.5; if (HEAT.has(next)) m = 0; if (RAIN.has(next)) m *= 0.2; }
  if (SNOWFALL.has(prev) && HEAT.has(next)) m = 0;
  else if (SNOWY.has(prev)) { if (SNOWY.has(next) || next === "overcast") m *= 1.5; if (HEAT.has(next)) m *= 0.02; }
  if (HEAT.has(prev)) { if (SNOWFALL.has(next)) m = 0; if (next === "heavy_rain") m *= 0.3; }
  if (FAIR.has(prev)) { if (FAIR.has(next)) m *= 1.4; if (next === "heavy_rain") m *= 0.5; if (next === "blizzard") m *= 0.3; if (next === "heavy_snow") m *= 0.5; }
  return m;
}
/** Final weights for one block. Zero-weight conditions are impossible this block. Falls back to the base weights if continuity zeroes everything. */
export function blockWeights(profile: ClimateProfile, date: CalendarDate, blockOfDay: number, previous?: { readonly condition: WeatherCondition; readonly streak: number }): Record<WeatherCondition, number> {
  const { season, phase } = climateSeasonOf(date), base = baseWeatherWeights(profile, season, phase), out = {} as Record<WeatherCondition, number>;
  let total = 0;
  for (const c of WEATHER_CONDITIONS) {
    out[c] = base[c] * (BLOCK_SHAPE[c]?.[blockOfDay] ?? 1) * (previous ? transitionMultiplier(previous.condition, previous.streak, c) : 1);
    total += out[c];
  }
  return total > 0 ? out : base;
}
function pick(weights: Record<WeatherCondition, number>, u: number): WeatherCondition {
  let total = 0;
  for (const c of WEATHER_CONDITIONS) total += weights[c];
  let target = u * total;
  for (const c of WEATHER_CONDITIONS) { if (weights[c] <= 0) continue; if (target < weights[c]) return c; target -= weights[c]; }
  return [...WEATHER_CONDITIONS].reverse().find(c => weights[c] > 0)!;
}

// ------------------------------------------------------------------------------------------------ temperature
const CONDITION_OFFSET: Record<WeatherCondition, number> = {
  clear: 0.3, partly_cloudy: 0.1, overcast: 0, light_rain: -0.1, rain: -0.1, heavy_rain: -0.2, thunderstorm: 0.1, fog: -0.2, windy: -0.3,
  frost: -0.8, sleet: -0.6, light_snow: -0.5, snow: -0.8, heavy_snow: -1.0, blizzard: -1.6, dry_heat: 0.6, dust_wind: 0.2,
};
export function temperatureBandFor(profile: ClimateProfile, date: CalendarDate, blockOfDay: number, condition: WeatherCondition): TemperatureBand {
  const { month_index } = climateSeasonOf(date);
  const value = profile.month_temperature[month_index - 1]! + profile.block_offsets[blockOfDay]! + CONDITION_OFFSET[condition];
  return TEMPERATURE_BANDS[Math.min(TEMPERATURE_BANDS.length - 1, Math.max(0, Math.round(value)))]!;
}

// ------------------------------------------------------------------------------------------------ derivation
/** Weather at a world minute for a concrete (non-mixed) climate profile. Bounded: exactly WEATHER_LOOKBACK_BLOCKS + 1 small draws. */
export function weatherAt(seed: string, profileId: ClimateProfileId, worldMinute: number): WeatherState {
  const profile = CLIMATE_PROFILES[profileId];
  if (profile.mixed) throw new Error(`weather: climate profile ${profileId} is mixed; a concrete profile is required`);
  const block = weatherBlockIndex(worldMinute), start = block - WEATHER_LOOKBACK_BLOCKS;
  let previous: { condition: WeatherCondition; streak: number } | undefined;
  for (let b = start; b <= block; b++) {
    const date = calendarDateAt(b * WEATHER_BLOCK_MINUTES), blockOfDay = floorMod(b, WEATHER_BLOCKS_PER_DAY);
    const condition = pick(blockWeights(profile, date, blockOfDay, previous), weatherDraw(seed, profileId, b));
    previous = { condition, streak: previous && previous.condition === condition ? previous.streak + 1 : 1 };
    if (b === block) {
      const at = calendarDateAt(worldMinute);
      return Object.freeze({ condition, temperature: temperatureBandFor(profile, at, blockOfDay, condition), profile_id: profileId, block_index: block });
    }
  }
  throw new Error("weather: unreachable");
}
