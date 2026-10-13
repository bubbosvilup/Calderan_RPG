import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadWorld } from "../src/world/loader.js";
import {
  CAMPAIGN_EPOCH_YEAR, INTERCALARY, MONTHS, WEEKDAYS, calendarDateAt, calendarDateFromDay, calendarMomentAt, daysInYear, formatCalendarDate, isGreatIlluminationYear, isLeapYear,
  observancesOf, worldMinuteOf, dayNumberOf, type CalendarDate, type RegularCalendarDate,
} from "../src/world/calendar.js";
import { CLIMATE_PROFILES, WEATHER_CONDITIONS, validateClimateProfiles, type WeatherCondition } from "../src/world/climate.js";
import { WEATHER_BLOCK_MINUTES, baseWeatherWeights, blockWeights, climateSeasonOf, transitionMultiplier, weatherAt, weatherBlockIndex } from "../src/world/weather.js";
import { describeWeather, environmentAt, resolveClimateProfileId } from "../src/world/environment.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { buildTurnContext } from "../src/turn/context/context-builder.js";
import { buildNarratorPrompt } from "../src/turn/context/prompt-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { deriveSessionView } from "../src/app/session-view.js";

/** Temporal & Environmental Systems V1: calendar, seasons, climate, weather, scene integration, determinism and persistence. */
const world = await loadWorld("data");
const at = (year: number, month: number, day: number, minute = 0) => worldMinuteOf({ year, month_index: month, day_of_month: day }, minute);
const sun = (year: number, n: number, minute = 0) => worldMinuteOf({ year, intercalary_index: n }, minute);
const reg = (m: number) => { const d = calendarDateAt(m); assert.equal(d.kind, "regular"); return d as RegularCalendarDate; };
const label = (d: CalendarDate) => d.kind === "regular" ? `${d.year} ${d.month_name} ${d.day_of_month} ${d.weekday_name}` : `${d.year} ${d.intercalary_name}`;

test("T1 leap rule uses a named anchor: 1187, 1191 and 1195 are leap years, the years between are not; Year 0 and negative years are sound", () => {
  assert.deepEqual([1187, 1188, 1189, 1190, 1191, 1192, 1195].map(isLeapYear), [true, false, false, false, true, false, true]);
  assert.equal(CAMPAIGN_EPOCH_YEAR, 1191); assert.equal(isLeapYear(1191), true);
  assert.deepEqual([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4].map(isLeapYear), [true, false, false, false, true, false, false, false, true, false]);
  assert.equal(daysInYear(1191), 366); assert.equal(daysInYear(1190), 365); assert.equal(isLeapYear(1188), false);
});
test("T2 world_minute 0 is Year 1191, Vesp Alpha 1, Stonewake, 00:00, the first day of autumn", () => {
  const d = calendarMomentAt(0);
  assert.deepEqual([d.kind, d.year], ["regular", 1191]);
  const r = d as RegularCalendarDate & { minute_of_day: number };
  assert.deepEqual([r.month_id, r.month_name, r.day_of_month, r.weekday_name, r.season_id, r.season_name, r.minute_of_day, r.day_of_year], ["vesp_alpha", "Vesp Alpha", 1, "Stonewake", "autumn", "Autumn", 0, 181]);
  assert.equal(label(calendarDateAt(-1)), "1191 Sol X 30 Veilday"); assert.equal(calendarMomentAt(-1).minute_of_day, 1439);
  assert.equal(label(calendarDateAt(1439)), "1191 Vesp Alpha 1 Stonewake"); assert.equal(label(calendarDateAt(1440)), "1191 Vesp Alpha 2 Emberday");
});
test("T3 month names, ids, seasons and the six-day week are exactly the canon", () => {
  assert.deepEqual(MONTHS.map(m => m.name), ["Aurel Alpha", "Aurel Med", "Aurel X", "Sol Alpha", "Sol Med", "Sol X", "Vesp Alpha", "Vesp Med", "Vesp X", "Hiem Alpha", "Hiem Med", "Hiem X"]);
  assert.deepEqual(MONTHS.map(m => m.id), ["aurel_alpha", "aurel_med", "aurel_x", "sol_alpha", "sol_med", "sol_x", "vesp_alpha", "vesp_med", "vesp_x", "hiem_alpha", "hiem_med", "hiem_x"]);
  assert.deepEqual(MONTHS.map(m => m.season), ["spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter", "winter", "winter"]);
  assert.deepEqual(WEEKDAYS.map(w => w.name), ["Stonewake", "Emberday", "Gustday", "Tideday", "Radiantday", "Veilday"]);
  assert.deepEqual(WEEKDAYS.map(w => w.aspect), ["earth", "fire", "air", "water", "light", "shadow"]);
  assert.deepEqual(INTERCALARY.map(i => i.name), ["First Sun", "Second Sun", "Third Sun", "Fourth Sun", "Fifth Sun", "Sixth Sun"]);
});
test("T4 every regular month begins on Stonewake and ends on Veilday, in ordinary and leap years", () => {
  for (const year of [1190, 1191, 0, 3]) for (let m = 1; m <= 12; m++) {
    assert.equal(reg(at(year, m, 1)).weekday_name, "Stonewake", `${year}/${m}/1`); assert.equal(reg(at(year, m, 30)).weekday_name, "Veilday", `${year}/${m}/30`);
  }
});
test("T5 month, season and year boundaries convert correctly, including the Five and Six Suns", () => {
  const next = (m: number) => label(calendarDateAt(m + 1440));
  assert.equal(next(at(1191, 7, 30)), "1191 Vesp Med 1 Stonewake");
  assert.equal(next(at(1191, 3, 30)), "1191 Sol Alpha 1 Stonewake");   // Aurel X 30 -> Sol Alpha 1
  assert.equal(next(at(1191, 6, 30)), "1191 Vesp Alpha 1 Stonewake");  // Sol X 30 -> Vesp Alpha 1
  assert.equal(next(at(1191, 9, 30)), "1191 Hiem Alpha 1 Stonewake");  // Vesp X 30 -> Hiem Alpha 1
  assert.equal(next(at(1191, 12, 30)), "1191 First Sun");               // Hiem X 30 -> First Sun
  assert.equal(next(at(1190, 12, 30)), "1190 First Sun");
  // Ordinary year: Fifth Sun -> next year Aurel Alpha 1.
  assert.equal(next(sun(1190, 5)), "1191 Aurel Alpha 1 Stonewake");
  assert.throws(() => sun(1190, 6), /no such intercalary day/);
  // Leap year: Fifth Sun -> Sixth Sun -> next year Aurel Alpha 1.
  assert.equal(next(sun(1191, 5)), "1191 Sixth Sun"); assert.equal(next(sun(1191, 6)), "1192 Aurel Alpha 1 Stonewake");
  // Intercalary days do not advance the weekday cycle: the day after Veilday (Hiem X 30) is not a weekday, and the new year opens on Stonewake.
  assert.equal(calendarDateAt(sun(1191, 3)).kind, "intercalary");
  assert.equal(reg(at(1192, 1, 1)).weekday_name, "Stonewake");
});
test("T6 intercalary days belong to no month, week or season; Year 1191 holds all six Suns; the Sixth Sun is leap-only", () => {
  const names = [1, 2, 3, 4, 5, 6].map(n => { const d = calendarDateAt(sun(1191, n)); assert.equal(d.kind, "intercalary"); if (d.kind === "intercalary") { assert.deepEqual([d.month, d.weekday, d.season], [null, null, null]); assert.ok(!("season_id" in d) && !("weekday_name" in d)); return d.intercalary_name; } });
  assert.deepEqual(names, ["First Sun", "Second Sun", "Third Sun", "Fourth Sun", "Fifth Sun", "Sixth Sun"]);
  assert.equal(INTERCALARY.length, 6);
  for (const year of [1188, 1189, 1190, 1192]) assert.equal(calendarDateAt(sun(year, 5)).kind, "intercalary"), assert.throws(() => sun(year, 6));
});
test("T7 O(1) conversion agrees with a brute-force day-by-day reference across Year 0, negative years and the present, and never skips Year 0", () => {
  // Reference: iterate year by year from -12 to 1200 with plain arithmetic and compare each year start to the closed form.
  let day = dayNumberOf(-12, 0);
  for (let y = -12; y <= 1200; y++) {
    assert.equal(dayNumberOf(y, 0), day, `start of ${y}`);
    const first = calendarDateFromDay(day), last = calendarDateFromDay(day + daysInYear(y) - 1);
    assert.equal(label(first), `${y} Aurel Alpha 1 Stonewake`); assert.equal(last.kind, "intercalary"); assert.equal(last.year, y); assert.equal(last.day_of_year, daysInYear(y));
    day += daysInYear(y);
  }
  assert.equal(label(calendarDateFromDay(dayNumberOf(0, 0))), "0 Aurel Alpha 1 Stonewake");
  assert.equal(label(calendarDateFromDay(dayNumberOf(0, 0) - 1)), "-1 Sixth Sun"); // Year -1 is a leap year and directly precedes Year 0
  for (const m of [-10_000_000, -1441, -1, 0, 1, 1439, 1440, 123_456_789]) assert.equal(worldMinuteOf(calendarDateAt(m).kind === "regular" ? { year: calendarDateAt(m).year, month_index: (calendarDateAt(m) as RegularCalendarDate).month_index, day_of_month: (calendarDateAt(m) as RegularCalendarDate).day_of_month } : { year: calendarDateAt(m).year, intercalary_index: (calendarDateAt(m) as { intercalary_index: number }).intercalary_index }) , Math.floor(m / 1440) * 1440);
});
test("T8 observances: Greenwake, Highsun, Harvest, the Suns, and the Great Illumination only in 100-year multiples after Year 491", () => {
  const names = (m: number) => observancesOf(calendarDateAt(m)).map(o => o.name);
  assert.deepEqual(names(at(1191, 2, 1)), ["Greenwake"]); assert.deepEqual(names(at(1191, 5, 15)), ["Highsun"]); assert.deepEqual(names(at(1191, 8, 30)), ["Harvest"]);
  for (const [m, d] of [[2, 2], [2, 30], [1, 1], [5, 14], [5, 16], [8, 29], [9, 1], [8, 1], [5, 1]]) assert.deepEqual(names(at(1191, m!, d!)), [], `${m}/${d}`);
  assert.deepEqual(names(at(1190, 2, 1)), ["Greenwake"]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(n => names(sun(1191, n))[0]), ["First Sun", "Second Sun", "Third Sun", "Fourth Sun", "Fifth Sun", "Sixth Sun"]);
  assert.deepEqual([1, 2, 3, 4, 5].map(n => names(sun(1190, n))), [["First Sun"], ["Second Sun"], ["Third Sun"], ["Fourth Sun"], ["Fifth Sun"]]);
  assert.ok(names(sun(1191, 1)).includes("Great Illumination") && names(sun(1191, 6)).includes("Great Illumination"));
  assert.deepEqual([491, 590, 591, 1091, 1190, 1191, 1192, 1291, 391, 0].map(isGreatIlluminationYear), [false, false, true, true, false, true, false, true, false, false]);
  assert.ok(!names(sun(1190, 1)).includes("Great Illumination")); assert.ok(!names(at(1191, 7, 1)).includes("Great Illumination"));
});
test("T9 narrator-safe date formatting exposes no ids and never gives an intercalary day a weekday", () => {
  assert.equal(formatCalendarDate(calendarDateAt(0)), "Vesp Alpha 1, Stonewake"); assert.equal(formatCalendarDate(calendarDateAt(0), "long", true), "Year 1191, Vesp Alpha 1, Stonewake");
  assert.equal(formatCalendarDate(calendarDateAt(0), "compact"), "1191 · Vesp Alpha 1 · Stonewake");
  assert.equal(formatCalendarDate(calendarDateAt(sun(1191, 1))), "First Sun, Year 1191"); assert.equal(formatCalendarDate(calendarDateAt(sun(1191, 1)), "compact"), "1191 · First Sun");
  for (const m of [0, sun(1191, 2)]) assert.doesNotMatch(formatCalendarDate(calendarDateAt(m)), /_|Stonewake.*Sun|Sun.*(?:Stonewake|Emberday|Veilday)/);
});
test("T10 calendar and weather code uses only integer game arithmetic: no Date, Intl or Math.random", () => {
  for (const f of ["calendar", "climate", "weather", "environment"]) {
    const src = readFileSync(`src/world/${f}.ts`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /\bnew Date\b|\bDate\.(?:now|UTC|parse)\b|\bIntl\b|Math\.random|performance\.now/, f);
  }
  const t = Date.now(); calendarDateAt(10 ** 12); calendarDateAt(-(10 ** 12)); weatherAt("seed", "west_cool_maritime", 10 ** 12); assert.ok(Date.now() - t < 200, "constant-time and bounded");
});

// ------------------------------------------------------------------------------------------------ climate and weather
const date = (year: number, month: number) => calendarDateAt(at(year, month, 10));
const w = (profile: keyof typeof CLIMATE_PROFILES, season: "spring" | "summer" | "autumn" | "winter", phase: "alpha" | "med" | "x" = "med") => baseWeatherWeights(CLIMATE_PROFILES[profile], season, phase);
const sum = (weights: Record<WeatherCondition, number>, cs: readonly WeatherCondition[]) => cs.reduce((a, c) => a + weights[c], 0), total = (weights: Record<WeatherCondition, number>) => sum(weights, WEATHER_CONDITIONS);
const SNOW: readonly WeatherCondition[] = ["light_snow", "snow", "heavy_snow", "blizzard", "sleet"];
const share = (weights: Record<WeatherCondition, number>, cs: readonly WeatherCondition[]) => sum(weights, cs) / total(weights);
test("T11 profile tables validate and every profile resolves to concrete weights per season", () => {
  validateClimateProfiles();
  for (const p of Object.values(CLIMATE_PROFILES)) for (const s of ["spring", "summer", "autumn", "winter"] as const) for (const ph of ["alpha", "med", "x"] as const) assert.ok(total(baseWeatherWeights(p, s, ph)) > 0, `${p.id}/${s}/${ph}`);
  assert.throws(() => validateClimateProfiles({ bad: { ...CLIMATE_PROFILES.west_cool_maritime, id: "west_cool_maritime" } } as never), /does not match id/);
  assert.ok(WEATHER_CONDITIONS.length <= 17);
});
test("T12 regional weight relationships (deterministic, not statistical)", () => {
  assert.ok(share(w("west_cool_maritime", "winter"), SNOW) > 5 * share(w("west_cool_maritime", "summer"), SNOW));
  assert.equal(w("west_cool_maritime", "summer").dry_heat, 0); assert.equal(w("west_cool_maritime", "summer").blizzard, 0);
  const westSol = w("west_cool_maritime", "summer"); assert.ok(share(westSol, ["clear", "partly_cloudy"]) > 0.4); assert.ok(share(westSol, ["light_rain", "rain", "heavy_rain", "thunderstorm"]) > 0.15);
  const centerSol = w("center_hot_arid", "summer"); assert.ok(share(centerSol, ["dry_heat", "clear"]) > 0.65); assert.equal(sum(centerSol, SNOW), 0);
  assert.equal(sum(w("center_hot_arid", "winter"), SNOW), 0);
  const east = w("east_cold_continental", "winter"); assert.ok(share(east, ["snow", "heavy_snow", "blizzard", "light_snow", "frost"]) > 0.6); assert.ok(east.blizzard > w("west_cool_maritime", "winter").blizzard);
  assert.equal(w("east_cold_continental", "summer").dry_heat, 0); assert.equal(sum(w("east_cold_continental", "summer"), SNOW), 0);
  // Temperature index: Center Hiem warmer than East Hiem; East Sol warmer than East Hiem but nowhere near Center Sol; West below Mediterranean-style heat all year.
  const t = (p: keyof typeof CLIMATE_PROFILES, m: number) => CLIMATE_PROFILES[p].month_temperature[m - 1]!;
  assert.ok(t("center_hot_arid", 11) > t("east_cold_continental", 11) + 2); assert.ok(t("east_cold_continental", 5) > t("east_cold_continental", 11) + 2); assert.ok(t("center_hot_arid", 5) > t("east_cold_continental", 5) + 2);
  assert.ok(Math.max(...CLIMATE_PROFILES.west_cool_maritime.month_temperature) < 3.5);
  // Autumn opening in the West: cool, frost not dominant at Vesp Alpha, more at Vesp X.
  const vAlpha = w("west_cool_maritime", "autumn", "alpha"), vX = w("west_cool_maritime", "autumn", "x"); assert.ok(vX.frost > 4 * vAlpha.frost); assert.ok(share(vAlpha, ["light_rain", "rain", "heavy_rain", "overcast"]) > 0.4);
});
test("T13 South profiles: hot resembles Center, cold resembles East, the parent is mixed and has no weather of its own", () => {
  for (const s of ["spring", "summer", "autumn", "winter"] as const) { assert.deepEqual(w("south_hot", s), w("center_hot_arid", s)); assert.deepEqual(w("south_cold", s), w("east_cold_continental", s)); }
  assert.equal(CLIMATE_PROFILES.south_mixed.mixed, true);
  assert.throws(() => weatherAt("s", "south_mixed", 0), /mixed/);
  const e = environmentAt(world, "c", 0, "south_continent");
  assert.deepEqual([e.climate_profile_id, e.weather, e.weather_status], ["south_mixed", null, "needs_climate_zone"]);
  assert.equal(weatherAt("s", "south_hot", at(1191, 5, 10)).profile_id, "south_hot"); assert.equal(weatherAt("s", "south_cold", at(1191, 11, 10)).profile_id, "south_cold");
});
test("T14 climate profile is authored on geography and inherited down the ancestry; a child overrides its parent; unplaced places have no weather", () => {
  assert.equal(resolveClimateProfileId(world, "heartstone_lr"), "west_cool_maritime"); assert.equal(resolveClimateProfileId(world, "calderan"), "west_cool_maritime");
  assert.equal(resolveClimateProfileId(world, "calderan_northern_forest"), "west_cool_maritime");
  assert.equal(resolveClimateProfileId(world, "central_oasis_settlement"), "center_hot_arid"); assert.equal(resolveClimateProfileId(world, "zul_rath"), "center_hot_arid");
  assert.equal(resolveClimateProfileId(world, "vaelrost"), "east_cold_continental"); assert.equal(resolveClimateProfileId(world, "frostspire"), "east_cold_continental");
  // Debt Zero climate audit: the mountain spine and the surrounding seas with an authored side now carry the nearest existing profile; the Mist Sea (north, no side authored) and the continent itself stay climate-less.
  assert.equal(resolveClimateProfileId(world, "dragons_teeth_mountains"), "east_cold_continental"); assert.equal(resolveClimateProfileId(world, "chained_bay"), "west_cool_maritime");
  assert.equal(resolveClimateProfileId(world, "mist_sea"), undefined);
  assert.deepEqual([environmentAt(world, "c", 0, "mist_sea").weather, environmentAt(world, "c", 0, "mist_sea").weather_status], [null, "no_climate"]);
  const fake = { getEntity: (id: string) => ({ type: "location", climate_profile: id === "child" ? "south_cold" : id === "parent" ? "south_hot" : undefined }), getAncestors: (id: string) => id === "child" ? [{ type: "location", climate_profile: "south_hot" }] : [] } as never;
  assert.equal(resolveClimateProfileId(fake, "child"), "south_cold");
  const climateFiles = world.getEntitiesByType("location").filter(e => e.climate_profile !== undefined).map(e => `${e.id}:${e.climate_profile}`).sort();
  assert.deepEqual(climateFiles, ["calderan_northern_forest:west_cool_maritime", "center:center_hot_arid", "chained_bay:west_cool_maritime", "dragons_teeth_mountains:east_cold_continental", "east:east_cold_continental", "silent_ocean:east_cold_continental", "sorrow_sea:west_cool_maritime", "south_continent:south_mixed", "west:west_cool_maritime"]);
});
test("T15 weather is deterministic and changes only at six-hour block boundaries", () => {
  const seed = "campaign-a", base = at(1191, 8, 3);
  for (const p of ["west_cool_maritime", "center_hot_arid", "east_cold_continental", "south_hot", "south_cold"] as const) {
    const first = weatherAt(seed, p, base);
    for (let m = 0; m < WEATHER_BLOCK_MINUTES; m += 30) assert.equal(weatherAt(seed, p, base + m).condition, weatherAt(seed, p, base + m).condition);
    assert.deepEqual(weatherAt(seed, p, base), first);
  }
  assert.equal(WEATHER_BLOCK_MINUTES, 360); assert.equal(weatherBlockIndex(0), 0); assert.equal(weatherBlockIndex(359), 0); assert.equal(weatherBlockIndex(360), 1); assert.equal(weatherBlockIndex(-1), -1);
  for (let b = 100; b < 108; b++) assert.deepEqual(weatherAt(seed, "west_cool_maritime", b * 360 + 5), weatherAt(seed, "west_cool_maritime", b * 360 + 359));
  const kinds = new Set<string>(); for (let b = 0; b < 400; b++) kinds.add(weatherAt(seed, "west_cool_maritime", b * 360).condition);
  assert.ok(kinds.size >= 6, "different blocks vary");
  const other = Array.from({ length: 60 }, (_, b) => weatherAt("campaign-b", "west_cool_maritime", b * 360).condition).join() !== Array.from({ length: 60 }, (_, b) => weatherAt(seed, "west_cool_maritime", b * 360).condition).join();
  assert.ok(other, "a different campaign seed yields a different weather history");
});
test("T16 continuity: impossible neighbours are zero, plausible ones are favoured, and repetition is damped", () => {
  assert.equal(transitionMultiplier("blizzard", 1, "dry_heat"), 0); assert.equal(transitionMultiplier("dry_heat", 1, "heavy_snow"), 0); assert.equal(transitionMultiplier("heavy_snow", 2, "dust_wind"), 0);
  assert.ok(transitionMultiplier("heavy_rain", 1, "overcast") > 1); assert.ok(transitionMultiplier("heavy_rain", 1, "rain") > 1); assert.ok(transitionMultiplier("heavy_rain", 1, "dry_heat") < 0.1);
  assert.ok(transitionMultiplier("clear", 1, "clear") > 1.5); assert.ok(transitionMultiplier("rain", 4, "rain") < transitionMultiplier("rain", 1, "rain"));
  const center = CLIMATE_PROFILES.center_hot_arid, d = date(1191, 5);
  const afterHeat = blockWeights(center, d, 2, { condition: "dry_heat", streak: 1 }); for (const c of ["light_snow", "snow", "heavy_snow", "blizzard", "sleet"] as const) assert.equal(afterHeat[c], 0);
  const westWinter = blockWeights(CLIMATE_PROFILES.west_cool_maritime, date(1191, 11), 1, { condition: "blizzard", streak: 1 }); assert.equal(westWinter.dry_heat, 0); assert.ok(westWinter.snow > blockWeights(CLIMATE_PROFILES.west_cool_maritime, date(1191, 11), 1).snow);
  // Over long runs no impossible pair ever appears and no region produces conditions outside its climate.
  const SNOWY = new Set<WeatherCondition>(["frost", "sleet", "light_snow", "snow", "heavy_snow", "blizzard"]), HEAT = new Set<WeatherCondition>(["dry_heat", "dust_wind"]);
  for (const p of ["west_cool_maritime", "center_hot_arid", "east_cold_continental"] as const) {
    let prev: WeatherCondition | undefined;
    for (let b = -1500; b < 3000; b++) {
      const c = weatherAt("long-run", p, b * 360).condition;
      if (prev && ((HEAT.has(c) && ["sleet", "light_snow", "snow", "heavy_snow", "blizzard"].includes(prev)) || (HEAT.has(prev) && ["sleet", "light_snow", "snow", "heavy_snow", "blizzard"].includes(c)))) assert.fail(`${p}: ${prev} -> ${c} at block ${b}`);
      if (p === "center_hot_arid") assert.ok(!SNOWY.has(c), `center produced ${c}`);
      if (p === "east_cold_continental") assert.ok(!HEAT.has(c), `east produced ${c}`);
      prev = c;
    }
  }
});
test("T17 intercalary days have no calendar season, but their climate baseline is late winter", () => {
  const first = calendarDateAt(sun(1191, 1)); assert.equal(first.kind, "intercalary");
  assert.deepEqual([climateSeasonOf(first).season, climateSeasonOf(first).phase], ["winter", "x"]);
  const eastSun = weatherAt("s", "east_cold_continental", sun(1191, 1, 12 * 60)); assert.ok(["very_cold", "cold"].includes(eastSun.temperature), eastSun.temperature);
  for (let n = 1; n <= 6; n++) { const wx = weatherAt("seed", "west_cool_maritime", sun(1191, n, 12 * 60)); assert.ok(["very_cold", "cold", "cool"].includes(wx.temperature)); }
  const e = environmentAt(world, "seed", sun(1191, 1, 540), "calderan"); assert.equal(e.calendar.kind, "intercalary"); assert.ok(e.weather);
  assert.match(describeWeather(e.weather!), /^[A-Z][a-z ]+, [a-z ]+\.$/);
});
test("T18 weather derivation is bounded: reconstruction touches at most one week of blocks regardless of how far the campaign has run", () => {
  const t = Date.now(); for (let i = 0; i < 2000; i++) weatherAt("perf", "east_cold_continental", 1_000_000_000 + i * 360); assert.ok(Date.now() - t < 2000, "2000 far-future weather lookups stay fast");
  assert.equal(weatherAt("perf", "east_cold_continental", 123_456_789).block_index, weatherBlockIndex(123_456_789));
});

// ------------------------------------------------------------------------------------------------ integration
const sceneText = (campaign: ReturnType<typeof createOpeningCampaign>) => buildNarratorPrompt("", buildTurnContext(world, campaign.exportSnapshot()), [], {}, playerIntent("Look around.", buildTurnContext(world, campaign.exportSnapshot()), campaign.exportSnapshot(), world)).messages[0]!.content;
const timeLine = (text: string) => text.split("\n").find(l => l.startsWith("Time: "))!;
test("T19 CURRENT SCENE shows date, season, outside weather and observances compactly and without internal ids", () => {
  const campaign = createOpeningCampaign(world, "temporal_scene");
  const text = sceneText(campaign), line = timeLine(text);
  assert.match(line, /^Time: Vesp Alpha 1, Stonewake \(Autumn\) — 00:00 — Midnight$/);
  const weather = text.split("\n").find(l => /^(?:Outside weather|Weather): /.test(l))!; assert.match(weather, /^(?:Outside weather|Weather): [A-Z][A-Za-z ]+, [a-z ]+\.$/);
  assert.ok(line.length + weather.length < 170, `${line.length + weather.length} chars`);
  assert.doesNotMatch(text, /west_cool_maritime|climate_profile|temporal_scene\||weather\||block_index|vesp_alpha|\bseed\b/);
  assert.ok(!/Observance:/.test(text));
  // Intercalary day of the Great Illumination: no weekday, no season, the observance, outside weather.
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 1440 } }] });
  assert.match(timeLine(sceneText(campaign)), /^Time: Vesp Alpha 2, Emberday \(Autumn\) — 00:00 — Midnight$/);
});
test("T20 an intercalary scene has no weekday or season but names its observance", () => {
  const campaign = createOpeningCampaign(world, "temporal_sun"), target = sun(1191, 1, 9 * 60 + 15), chunk = 1440;
  for (let left = target - campaign.exportSnapshot().runtime.scene.world_time.world_minute; left > 0; left -= chunk) campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: Math.min(chunk, left) } }] });
  assert.equal(campaign.exportSnapshot().runtime.scene.world_time.world_minute, target);
  const text = sceneText(campaign);
  assert.match(timeLine(text), /^Time: First Sun, Year 1191 — 09:15 — Morning$/); assert.doesNotMatch(timeLine(text), /Stonewake|Emberday|Veilday|\(Autumn\)|\(Winter\)/);
  assert.match(text, /\nSeason: —\n/); assert.match(text, /\nObservance: Great Illumination — First Sun \(revelation\)\.\n/); assert.match(text, /\n(?:Outside weather|Weather): /);
});
test("T21 the controller context and the saved campaign carry no calendar, climate or weather; save/load re-derives identical date, season and weather", () => {
  const campaign = createOpeningCampaign(world, "temporal_save");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 5 * 1440 + 777 } }] });
  const snapshot = campaign.exportSnapshot(), context = buildTurnContext(world, snapshot);
  assert.doesNotMatch(JSON.stringify(context), /Outside weather|climate|Vesp Alpha|Autumn|west_cool/);
  const text = serializeSave(createSaveFile(snapshot, world, "2026-10-10T10:00:00.000Z"), world);
  assert.doesNotMatch(text, /climate|weather|season|calendar|Vesp|"current_year"|"weekday"/i);
  const restored = decodeSave(text, world).snapshot;
  const derive = (s: typeof snapshot) => environmentAt(world, s.campaign_id, s.runtime.scene.world_time.world_minute, s.runtime.scene.player_location);
  assert.deepEqual(derive(restored), derive(snapshot));
  assert.equal(JSON.stringify(Object.keys(snapshot)), JSON.stringify(Object.keys(restored)));
});
test("T22 the session read model exposes date, weekday, season, observances and weather without ids", () => {
  const campaign = createOpeningCampaign(world, "temporal_view"), snapshot = campaign.exportSnapshot();
  const view = deriveSessionView(world, snapshot, { status: "idle", last_saved_revision: null, provider: { mode: "stub", configured: true } });
  const env = view.scene.environment;
  assert.deepEqual([env.date_text, env.kind, env.year, env.is_leap_year, env.great_illumination, env.month_name, env.day_of_month, env.weekday_name, env.season_name, env.observances], ["Vesp Alpha 1, Stonewake", "regular", 1191, true, false, "Vesp Alpha", 1, "Stonewake", "Autumn", []]);
  assert.equal(env.weather.status, "ok"); assert.match(env.weather.summary!, /\.$/); assert.doesNotMatch(JSON.stringify(Object.values(env)), /_|west_cool/);
  assert.equal(view.scene.time.world_minute, 0);
});
test("T23 the weather rule keeps the narrator in its lane: engine-derived, outdoors only, no hearth automation", () => {
  const prompt = sceneText(createOpeningCampaign(world, "temporal_rule"));
  assert.match(prompt, /Date, season, observance and outside weather are engine-derived: use them, never invent or change them\. Weather is outdoors only and never lights a hearth\./);
  assert.doesNotMatch(prompt, /no calendar, season/);
  for (const f of ["src/turn/stages", "src/turn/controller-policy.ts"]) { try { const src = readFileSync(f, "utf8"); assert.doesNotMatch(src, /set_weather/); } catch { /* directory */ } }
  assert.ok(!JSON.stringify(world.listEntities()).includes("set_weather"));
});
