# Temporal & Environmental Systems V1

Calendar + Seasons + Weather + canon climate integration. Authored on top of 7820d5a. **Not committed, not pushed.**

## 1. Executive verdict
TEMPORAL_ENVIRONMENTAL_V1_READY. 3027/3027 tests (23 new), `npm run typecheck` and `npm run build` clean. No save-schema change, no Controller change, no live LLM or image calls.

## 2. Principle
The engine owns truth. `world_minute` is the only stored clock; date, season, observances, climate and weather are derived projections and are never persisted.

## 3. Epoch
`world_minute 0` = Year 1191, Vesp Alpha 1, 00:00, Stonewake, first day of autumn. Year 0 exists; negative years work.

## 4. Leap rule
Anchor-based, not `% 4 === 0`: leap years are those congruent to 3 mod 4 (1187, 1191, 1195 leap; 1188-1190 not). A runtime guard protects the assumption that the leap year closes each 1461-day cycle.

## 5. Year structure
12 months x 30 days, then 5 intercalary days (6 in a leap year) after Hiem X 30 and before Aurel Alpha 1.

## 6. Months and seasons
Aurel (spring), Sol (summer), Vesp (autumn), Hiem (winter), each Alpha / Med / X, ids such as `aurel_alpha`.

## 7. Week
Six days: Stonewake, Emberday, Gustday, Tideday, Radiantday, Veilday. Every ordinary month starts on Stonewake and ends on Veilday.

## 8. Intercalary days
A separate date type with no weekday, month or season. They do not advance the weekday cycle.

## 9. Weekday associations
Earth, Fire, Air, Water, Light, Shadow, framed as old custom. The sealed cosmology is not leaked. Veilday is the day of penance and confession; the Church teaches that every person carries flaws, not that Shadow is good.

## 10. The Suns
First to Fifth Sun every year; the Sixth only in leap years. Themes: revelation, unity, charity, remembrance, vigil, and extra time granted to the world.

## 11. Annual festivals
Greenwake (Aurel Med 1), Highsun (Sol Med 15), Harvest (Vesp Med 30). No winter festival. Derived, never stored.

## 12. Great Illumination
Year minus 491 is a positive multiple of 100. Not a separate day: an elevated form of the Suns. 1191 spans all six; 491 and 1190 do not qualify.

## 13. Soul-fragment legend
Stays false folklore, not tied to Nicco.

## 14. Date types and formatting
Regular and intercalary types; narrator-safe formatting (`Vesp Alpha 1, Stonewake`, `First Sun, Year 1191`), never an internal id.

## 15. Arithmetic
O(1) integer math from a 4-year, 1461-day cycle. No `Date`, `Intl` or `Math.random` (enforced by test T10).

## 16. Season system
Season derives from the month. An intercalary day has no calendar season, but its climate baseline is late winter.

## 17. Climate profiles
Structured `climate_profile` on locations, validated against a closed id set, inherited down the ancestry with child override.

## 18. Regional climate
West: cool northern maritime. Center: hot arid. East: cold continental, harshest winters. South: mixed (hot west half, cold east half), beneath Center and East, not bordering West. No cities invented, no real-world places named.

## 19. South handling
`south_mixed` on the continent gives no weather by itself (`needs_climate_zone`); `south_hot` mirrors Center and `south_cold` mirrors East once a place picks a half.

## 20. Weather conditions and temperature
17 conditions; seven categorical temperature bands from month baseline, time of day and condition offset.

## 21. Weather selection
Season/phase weights x modifiers x time-of-day shaping x continuity multipliers, then a seeded weighted pick (FNV-1a with avalanche).

## 22. Blocks
Six-hour blocks (4 per day); weather is constant inside a block.

## 23. Seed
The immutable campaign id plus profile and block index. Nothing is stored.

## 24. Continuity and bounded reconstruction
Recent weather weights the next block (blizzard to dry heat is impossible, heavy rain favours overcast, long repetition is damped). Reconstruction chains within aligned 28-block segments, so at most 28 draws and no replay from world origin.

## 25. Hearth and indoor rules
Weather describes the outdoors only; it never mutates hearth state. There is no `set_weather`.

## 26. Scene State Projection
Compact lines: `Time: <date>, <weekday> (<season>) - HH:MM - daypart`, optional `Observance:`, `Outside weather:`. Intercalary scenes show `Season: -`. No seeds, block indices, climate ids or raw minutes.

## 27. Controller
Receives no calendar or weather; the envelope is byte-identical (test T21).

## 28. Retrieval
Not authoritative for date or weather. Canon records (calendar, week, Suns, festivals, climate) added as world_lore; counts updated in the retrieval tests.

## 29. Facade
`deriveSessionView` exposes an `environment` read model (date text, kind, year, leap flag, Great Illumination, month, weekday, season, observances, weather summary) without ids.

## 30. Dev tooling
`npm run inspect:time` prints a matrix over 1191 and 1192; `inspect:time <minute> [location]` prints one sample. Exports `inspectCalendar` and `inspectWeather`.

## 31. Sample matrix (excerpt)
```
> caldrevan-rpg@0.1.0 inspect:time
> npm run build --silent && node .build/src/dev/inspect-time.js


== Aurel Alpha 1
-258480 -> 1191 · Aurel Alpha 1 · Stonewake 12:00 | Spring (aurel_alpha)
calderan: west_cool_maritime | Cool, partly cloudy. (partly_cloudy/cool)
center: center_hot_arid | Hot, dry heat. (dry_heat/hot)
east: east_cold_continental | Cold, overcast. (overcast/cold)
south_hot: south_hot | Hot, clear skies.
south_cold: south_cold | Cold, light rain.

== Aurel Med 1
-215280 -> 1191 · Aurel Med 1 · Stonewake 12:00 | Spring (aurel_med) | Greenwake
calderan: west_cool_maritime | Mild, clear skies. (clear/mild)
center: center_hot_arid | Hot, partly cloudy. (partly_cloudy/hot)
east: east_cold_continental | Cool, clear skies. (clear/cool)
south_hot: south_hot | Hot, partly cloudy.
south_cold: south_cold | Cool, partly cloudy.

== Sol Med 15
-65520 -> 1191 · Sol Med 15 · Gustday 12:00 | Summer (sol_med) | Highsun
calderan: west_cool_maritime | Warm, clear skies. (clear/warm)
center: center_hot_arid | Scorching, dry heat. (dry_heat/very_hot)
east: east_cold_continental | Mild, light rain. (light_rain/mild)
south_hot: south_hot | Scorching, clear skies.
south_cold: south_cold | Mild, clear skies.

== Vesp Alpha 1
720 -> 1191 · Vesp Alpha 1 · Stonewake 12:00 | Autumn (vesp_alpha)
calderan: west_cool_maritime | Cool, light rain. (light_rain/cool)
center: center_hot_arid | Hot, clear skies. (clear/hot)
east: east_cold_continental | Cool, light snow. (light_snow/cool)
south_hot: south_hot | Hot, clear skies.
south_cold: south_cold | Cool, partly cloudy.

== Vesp Med 30
85680 -> 1191 · Vesp Med 30 · Veilday 12:00 | Autumn (vesp_med) | Harvest
calderan: west_cool_maritime | Cool, windy. (windy/cool)
```
(see the command for the full output)

## 32. Tests
`tests/temporal-environmental.test.ts`, 23 tests: leap years, epoch, all boundaries, Five and Six Suns, festivals without false positives, brute-force 1,200-year conversion check, climate weight relationships, South, inheritance, determinism, continuity, bounded cost, SSP rendering, save/load, controller isolation, facade.

## 33. Existing tests updated
Time-line regexes, entity / chunk / document / geography counts, two goldens regenerated (prompt change only).

## 34. Stale-canon audit
Grep for Gregorian months and days, seven-day week, `% 4`, three seasons, 365: no active normative conflict. The only hit, `modern_reckoning`, was rewritten to the new calendar. Earlier West "temperate", Center "arid", East "cold and snowy" are compatible.

## 35. Canon changed
`continent`, `continental_structure`, `south_continent` (position and mixed climate), `modern_reckoning`, centennial observances; new calendar, week, Suns, festivals and climate records.

## 36. Prompt-size impact
About +52 tokens per narrator prompt (context-compaction estimate 2860 to 2912).

## 37. Save impact
None. No new fields; save text contains no calendar, season or weather keys.

## 38. Determinism
Same campaign id and minute give the same weather after save/load; a different campaign id gives a different history.

## 39. Security and spoilers
No sealed cosmology in weekday associations or any new public text.

## 40. Known limitations
- Continuity has a fresh draw at 7-day segment seams.
- "Outside weather" is always outdoors; no indoor semantics yet.
- Locations without a resolvable climate (mountains, seas) get no weather.
- The South parent has no weather until a place picks a half.
- Heartstone location fields untouched.

## 41. Deferred
Temperature physics, humidity, wind, pressure, storm movement, climate change, magic weather, exposure and survival, crops, snow depth, room heating, hearth automation, named South settlements, calendar and weather UI, Property/Heartstone, combat, medicine.

## 42. Recommended next milestone
Weather UI on the new read model, then foundation re-certification and live smoke, then Property/Heartstone per the roadmap.
