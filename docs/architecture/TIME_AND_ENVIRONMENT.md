# Time and environment (Calendar, Seasons, Weather, Exposure)

Status: Current. Last reconciled: 2026-10-11. Source of truth: `src/world/calendar.ts`, `climate.ts`, `weather.ts`, `environment.ts`, `data/world/history/`, `data/world/religion/`, `data/world/geography/helion_climate.yaml`. The original build report is [TEMPORAL_ENVIRONMENTAL_SYSTEMS_V1](../evaluations/TEMPORAL_ENVIRONMENTAL_SYSTEMS_V1.md) (historical).

## Principle

The engine owns truth. `world_minute` is the **only stored clock**. Date, weekday, season, observances, climate and weather are derived projections and are never persisted. There is no `set_weather` command and nothing about time or weather is written to a save. The State Controller receives no calendar or weather.

## Calendar

- **Epoch:** `world_minute 0` = Year 1191, Vesp Alpha 1, 00:00, Stonewake, the first day of autumn. Year 0 exists and negative years work.
- **Year:** 12 months of 30 days, then the intercalary Suns.
- **Months and seasons:** Aurel Alpha / Med / X (spring), Sol Alpha / Med / X (summer), Vesp Alpha / Med / X (autumn), Hiem Alpha / Med / X (winter).
- **Week:** six days: Stonewake, Emberday, Gustday, Tideday, Radiantday, Veilday. Every regular month is exactly five six-day weeks, starting on Stonewake and ending on Veilday.
- **Intercalary days (the Suns):** after Hiem X 30 and before the next Aurel Alpha 1: First Sun, Second Sun, Third Sun, Fourth Sun, Fifth Sun; leap years add a Sixth Sun. They are outside any month, regular week and season, do not advance the weekday cycle, and are a separate date type.
- **Leap rule:** anchor-based, not `% 4`: years congruent to 3 mod 4 are leap (1187, 1191, 1195). A runtime guard protects the 1461-day four-year cycle.
- **Arithmetic:** O(1) integer math. No `Date`, `Intl` or `Math.random` (enforced by a test).
- **Observances (derived, never stored):** Greenwake (Aurel Med 1), Highsun (Sol Med 15), Harvest (Vesp Med 30), the Five/Six Suns, and the Great Illumination (a year more than 491 that is a positive multiple of 100 years after Year 491; Year 1191 qualifies; it is an elevated form of the Suns, not a separate day). There is no winter festival. Observance lore stays within the authored canon (`five_suns`, `annual_festivals`, `centennial_observances`).
- **Narrator-safe formatting:** `Vesp Alpha 1, Stonewake`, `First Sun, Year 1191`; never an internal id.

## Seasons

The season derives from the month. An intercalary day has no calendar season (its climate baseline is late winter). The SSP shows `Season: -` for intercalary scenes.

## Climate

A structured `climate_profile` on a location, validated against the closed set `west_cool_maritime`, `center_hot_arid`, `east_cold_continental`, `south_hot`, `south_cold`, `south_mixed`. It is inherited down the ancestry; a child overrides.

- West: cool northern maritime style. Center: hot, arid, semi-desert. East: cold continental/subarctic with the harshest winters. South: a mixed, unresolved parent climate (a hot west half and a cold east half beneath Center and East); `south_mixed` on the South continent produces no weather by itself (`needs_climate_zone`) until a place picks `south_hot` or `south_cold`.
- Real-world places were design references only and are not in-world names.
- Intentionally unresolved: the South parent, the Mist Sea and the continent root have no weather.

## Weather

- **Deterministic and derived.** Inputs: the immutable campaign id, the climate profile and the block index. Nothing is stored; the same inputs give the same weather after save/load and regardless of call order.
- **Blocks:** six hours (`WEATHER_BLOCK_MINUTES = 360`, four per day); weather is constant inside a block.
- **Conditions (17):** clear, partly_cloudy, overcast, light_rain, rain, heavy_rain, thunderstorm, fog, windy, frost, sleet, light_snow, snow, heavy_snow, blizzard, dry_heat, dust_wind.
- **Temperature:** categorical bands `very_cold, cold, cool, mild, warm, hot, very_hot` from the month baseline, time of day and condition offset. No degrees.
- **Selection:** season/phase weights × modifiers × time-of-day shaping × continuity multipliers, then a seeded weighted pick (FNV-1a with avalanche).
- **Continuity without a seam:** a sliding window. The state of block N is the last link of a short chain that starts `WEATHER_LOOKBACK_BLOCKS` (27) blocks earlier, so exactly 28 small draws per query, independent of order, with nothing persisted and no artificial seven-day seam. A blizzard cannot jump to dry heat, heavy rain favours overcast, and long repetition is damped.

## Environment exposure

`environment_exposure` is authored per place and **not inherited**: `indoor`, `outdoor`, `sheltered`, `unknown` (the default when absent). Heartstone: LR, U1 and F1 are `indoor`; the courtyard (CY) and the square are `outdoor`.

Weather describes the outdoors only; it never mutates hearth or building state and never "happens" indoors. Narrator-facing wording in the Scene State Projection:

- outdoor: `Weather: …`
- otherwise: `Outside weather: …`

Compact SSP lines: `Time: <date>, <weekday> (<season>) - HH:MM - daypart`, optional `Observance:`, then the weather line. No seeds, block indices, climate ids or raw minutes appear. The narrator keeps `HH:MM` time by decision.

## Facade

`deriveSessionView` exposes an `environment` read model (date text, kind, year, leap flag, Great Illumination, month, weekday, season, observances, weather summary) without ids. There is **no weather UI** yet.

## Tooling

`npm run inspect:time` prints a matrix over 1191 and 1192; `inspect:time <minute> [location]` prints one sample.

## Known limits

Temperature physics, humidity, wind, pressure, storm movement, climate change, magic weather, survival/exposure effects, crops, snow depth, room heating and hearth automation are not modeled. South has no named settlements yet.
