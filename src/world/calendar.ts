/**
 * Calendar System V1 — the fantasy calendar of Helion, derived from the one authoritative clock, `world_minute`.
 *
 * Nothing here is persisted: year, month, day, weekday, season and observances are pure functions of `world_minute`. All arithmetic is
 * integer arithmetic in constant time (a 4-year cycle of 1461 days); no real-world Date/Intl API is used, so the game calendar is
 * independent of any real timezone.
 *
 * Structure: 12 months of 30 days (360 regular days) in a six-day week (5 exact weeks per month), then 5 intercalary days (6 in a leap
 * year) after Hiem X 30 and before Aurel Alpha 1. Intercalary days belong to no month, no week and no season, and do not advance the
 * weekday cycle. Year 0 exists (the year Aureth revealed himself). Leap years follow a named anchor (see LEAP_ANCHOR_YEAR), so that
 * Year 1191 is a leap year.
 */
export const MINUTES_PER_DAY = 1440;
export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const REGULAR_DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
export const WEEK_LENGTH = 6;
export const INTERCALARY_DAYS = 5;
export const LEAP_INTERCALARY_DAYS = 6;
export const LEAP_CYCLE_YEARS = 4;
/**
 * Named leap-year anchor: Year 3 is the first leap year after Year 0 (and, going back, Year -1). Leap years are the years whose
 * distance from the anchor is divisible by four, so 1187, 1191 and 1195 are leap years and 1188 to 1190 are not. This is deliberately
 * NOT `year % 4 === 0`: canon fixes Year 1191, the seven-hundredth anniversary of the disappearance, as a leap year.
 */
export const LEAP_ANCHOR_YEAR = 3;
/** Year 0 is the year Aureth publicly revealed himself; it exists as an ordinary year in this calendar. */
export const REVELATION_YEAR = 0;
/** The Sun Emperor disappeared in Year 491; centennial observances count from this year. */
export const DISAPPEARANCE_YEAR = 491;
export const CAMPAIGN_EPOCH_YEAR = 1191;
/** world_minute 0 is 00:00 on day 1 of this month (Vesp Alpha 1, the first day of autumn). */
export const CAMPAIGN_EPOCH_MONTH_INDEX = 7;

export type SeasonId = "spring" | "summer" | "autumn" | "winter";
export type SeasonPhase = "alpha" | "med" | "x";
export interface SeasonInfo { readonly id: SeasonId; readonly name: string; readonly month_prefix: string }
export const SEASONS: readonly SeasonInfo[] = Object.freeze([
  { id: "spring", name: "Spring", month_prefix: "Aurel" }, { id: "summer", name: "Summer", month_prefix: "Sol" },
  { id: "autumn", name: "Autumn", month_prefix: "Vesp" }, { id: "winter", name: "Winter", month_prefix: "Hiem" },
]);
const PHASES: readonly SeasonPhase[] = ["alpha", "med", "x"];
const PHASE_NAMES = ["Alpha", "Med", "X"] as const;
export interface MonthInfo { readonly id: string; readonly name: string; readonly index: number; readonly season: SeasonId; readonly phase: SeasonPhase }
export const MONTHS: readonly MonthInfo[] = Object.freeze(SEASONS.flatMap((s, si) => PHASES.map((phase, pi): MonthInfo => ({
  id: `${s.month_prefix.toLowerCase()}_${phase}`, name: `${s.month_prefix} ${PHASE_NAMES[pi]}`, index: si * 3 + pi + 1, season: s.id, phase }))));
/** Weekday names. `aspect` is a cultural association that survived from ancient custom; it is never rendered to the narrator. */
export interface WeekdayInfo { readonly id: string; readonly name: string; readonly index: number; readonly aspect: string }
export const WEEKDAYS: readonly WeekdayInfo[] = Object.freeze([
  { id: "stonewake", name: "Stonewake", index: 1, aspect: "earth" }, { id: "emberday", name: "Emberday", index: 2, aspect: "fire" },
  { id: "gustday", name: "Gustday", index: 3, aspect: "air" }, { id: "tideday", name: "Tideday", index: 4, aspect: "water" },
  { id: "radiantday", name: "Radiantday", index: 5, aspect: "light" }, { id: "veilday", name: "Veilday", index: 6, aspect: "shadow" },
]);
export interface IntercalaryInfo { readonly id: string; readonly name: string; readonly index: number; readonly theme: string }
export const INTERCALARY: readonly IntercalaryInfo[] = Object.freeze([
  { id: "first_sun", name: "First Sun", index: 1, theme: "revelation" }, { id: "second_sun", name: "Second Sun", index: 2, theme: "unity" },
  { id: "third_sun", name: "Third Sun", index: 3, theme: "charity" }, { id: "fourth_sun", name: "Fourth Sun", index: 4, theme: "remembrance" },
  { id: "fifth_sun", name: "Fifth Sun", index: 5, theme: "vigil" }, { id: "sixth_sun", name: "Sixth Sun", index: 6, theme: "extra time granted to the world" },
]);

export const floorDiv = (a: number, b: number): number => Math.floor(a / b);
export const floorMod = (a: number, b: number): number => ((a % b) + b) % b;

export const isLeapYear = (year: number): boolean => floorMod(year - LEAP_ANCHOR_YEAR, LEAP_CYCLE_YEARS) === 0;
export const intercalaryDaysIn = (year: number): number => (isLeapYear(year) ? LEAP_INTERCALARY_DAYS : INTERCALARY_DAYS);
export const daysInYear = (year: number): number => REGULAR_DAYS_PER_YEAR + intercalaryDaysIn(year);
/** The years of a 4-year cycle starting at a multiple of four are 365, 365, 365 and 366 days (the leap year is the fourth). */
const CYCLE_DAYS = 3 * (REGULAR_DAYS_PER_YEAR + INTERCALARY_DAYS) + (REGULAR_DAYS_PER_YEAR + LEAP_INTERCALARY_DAYS);
if (LEAP_ANCHOR_YEAR % LEAP_CYCLE_YEARS !== LEAP_CYCLE_YEARS - 1) throw new Error("calendar: the 4-year cycle arithmetic assumes the leap year is last in each cycle");
/** Days from the first day of Year 0 to the first day of `year` (negative before Year 0). Constant time. */
export const daysBeforeYear = (year: number): number => year * (REGULAR_DAYS_PER_YEAR + INTERCALARY_DAYS) + floorDiv(year, LEAP_CYCLE_YEARS);

export interface RegularCalendarDate {
  readonly kind: "regular";
  readonly year: number;
  readonly month_id: string;
  readonly month_index: number;
  readonly month_name: string;
  readonly day_of_month: number;
  readonly weekday_id: string;
  readonly weekday_name: string;
  readonly weekday_index: number;
  readonly season_id: SeasonId;
  readonly season_name: string;
  readonly season_phase: SeasonPhase;
  readonly day_of_year: number;
}
/** An intercalary day deliberately carries no month, weekday or season. */
export interface IntercalaryCalendarDate {
  readonly kind: "intercalary";
  readonly year: number;
  readonly intercalary_index: number;
  readonly intercalary_id: string;
  readonly intercalary_name: string;
  readonly day_of_year: number;
  readonly leap_year: boolean;
  readonly month: null;
  readonly weekday: null;
  readonly season: null;
}
export type CalendarDate = RegularCalendarDate | IntercalaryCalendarDate;
export type CalendarMoment = CalendarDate & { readonly minute_of_day: number };

/** Absolute day number (days since the first day of Year 0) of a calendar position; `dayOfYear0` is 0-based. */
export const dayNumberOf = (year: number, dayOfYear0: number): number => daysBeforeYear(year) + dayOfYear0;
const EPOCH_DAY = dayNumberOf(CAMPAIGN_EPOCH_YEAR, (CAMPAIGN_EPOCH_MONTH_INDEX - 1) * DAYS_PER_MONTH);

export function calendarDateFromDay(day: number): CalendarDate {
  if (!Number.isSafeInteger(day)) throw new Error("calendar: day number must be a safe integer");
  const cycle = floorDiv(day, CYCLE_DAYS), within = floorMod(day, CYCLE_DAYS);
  const k = within < 365 ? 0 : within < 730 ? 1 : within < 1095 ? 2 : 3;
  const year = cycle * LEAP_CYCLE_YEARS + k, dayOfYear0 = within - k * 365;
  if (dayOfYear0 >= REGULAR_DAYS_PER_YEAR) {
    const info = INTERCALARY[dayOfYear0 - REGULAR_DAYS_PER_YEAR]!;
    return Object.freeze({ kind: "intercalary", year, intercalary_index: info.index, intercalary_id: info.id, intercalary_name: info.name,
      day_of_year: dayOfYear0 + 1, leap_year: isLeapYear(year), month: null, weekday: null, season: null });
  }
  const month = MONTHS[floorDiv(dayOfYear0, DAYS_PER_MONTH)]!, dom = dayOfYear0 % DAYS_PER_MONTH, weekday = WEEKDAYS[dom % WEEK_LENGTH]!, season = SEASONS.find(s => s.id === month.season)!;
  return Object.freeze({ kind: "regular", year, month_id: month.id, month_index: month.index, month_name: month.name, day_of_month: dom + 1,
    weekday_id: weekday.id, weekday_name: weekday.name, weekday_index: weekday.index, season_id: season.id, season_name: season.name, season_phase: month.phase, day_of_year: dayOfYear0 + 1 });
}
export const dayNumberAt = (worldMinute: number): number => EPOCH_DAY + floorDiv(worldMinute, MINUTES_PER_DAY);
export function calendarDateAt(worldMinute: number): CalendarDate {
  if (!Number.isSafeInteger(worldMinute)) throw new Error("calendar: world_minute must be a safe integer");
  return calendarDateFromDay(dayNumberAt(worldMinute));
}
export function calendarMomentAt(worldMinute: number): CalendarMoment {
  return Object.freeze({ ...calendarDateAt(worldMinute), minute_of_day: floorMod(worldMinute, MINUTES_PER_DAY) });
}

/** Inverse conversion: the world_minute of 00:00 on a calendar position (plus optional minute of day). */
export type CalendarPosition = { readonly year: number; readonly month_index: number; readonly day_of_month: number } | { readonly year: number; readonly intercalary_index: number };
export function worldMinuteOf(position: CalendarPosition, minuteOfDay = 0): number {
  let dayOfYear0: number;
  if ("intercalary_index" in position) {
    if (!Number.isInteger(position.intercalary_index) || position.intercalary_index < 1 || position.intercalary_index > intercalaryDaysIn(position.year)) throw new Error("calendar: no such intercalary day in that year");
    dayOfYear0 = REGULAR_DAYS_PER_YEAR + position.intercalary_index - 1;
  } else {
    if (!Number.isInteger(position.month_index) || position.month_index < 1 || position.month_index > MONTHS_PER_YEAR || !Number.isInteger(position.day_of_month) || position.day_of_month < 1 || position.day_of_month > DAYS_PER_MONTH) throw new Error("calendar: invalid month or day");
    dayOfYear0 = (position.month_index - 1) * DAYS_PER_MONTH + position.day_of_month - 1;
  }
  return (dayNumberOf(position.year, dayOfYear0) - EPOCH_DAY) * MINUTES_PER_DAY + minuteOfDay;
}

/** The Great Illumination: a positive multiple of 100 years after the disappearance (Year 491). Year 1191 is 700 years after it. */
export const yearsSinceDisappearance = (year: number): number => year - DISAPPEARANCE_YEAR;
export const isGreatIlluminationYear = (year: number): boolean => { const n = yearsSinceDisappearance(year); return n > 0 && n % 100 === 0; };

export type ObservanceKind = "festival" | "intercalary" | "great_illumination";
export interface Observance { readonly id: string; readonly name: string; readonly kind: ObservanceKind; readonly theme: string }
/** Annual festivals by (month id, day). */
const FESTIVALS: readonly { readonly month_id: string; readonly day: number; readonly id: string; readonly name: string; readonly theme: string }[] = Object.freeze([
  { month_id: "aurel_med", day: 1, id: "greenwake", name: "Greenwake", theme: "spring renewal" },
  { month_id: "sol_med", day: 15, id: "highsun", name: "Highsun", theme: "the height of summer" },
  { month_id: "vesp_med", day: 30, id: "harvest", name: "Harvest", theme: "harvest and preparation for winter" },
]);
/** Observances are derived from the date and never stored. */
export function observancesOf(date: CalendarDate): readonly Observance[] {
  if (date.kind === "regular") {
    const f = FESTIVALS.find(x => x.month_id === date.month_id && x.day === date.day_of_month);
    return f ? [{ id: f.id, name: f.name, kind: "festival", theme: f.theme }] : [];
  }
  const info = INTERCALARY[date.intercalary_index - 1]!, out: Observance[] = [{ id: info.id, name: info.name, kind: "intercalary", theme: info.theme }];
  if (isGreatIlluminationYear(date.year)) out.push({ id: "great_illumination", name: "Great Illumination", kind: "great_illumination", theme: "centennial of the disappearance" });
  return out;
}

export type DateStyle = "long" | "compact";
/** Narrator-safe text, with no internal ids. Regular: "Vesp Alpha 1, Stonewake"; intercalary: "First Sun, Year 1191". */
export function formatCalendarDate(date: CalendarDate, style: DateStyle = "long", withYear = false): string {
  if (style === "compact") return date.kind === "regular" ? `${date.year} · ${date.month_name} ${date.day_of_month} · ${date.weekday_name}` : `${date.year} · ${date.intercalary_name}`;
  if (date.kind === "intercalary") return `${date.intercalary_name}, Year ${date.year}`;
  return `${withYear ? `Year ${date.year}, ` : ""}${date.month_name} ${date.day_of_month}, ${date.weekday_name}`;
}
export const formatClock = (minuteOfDay: number): string => `${String(floorDiv(minuteOfDay, 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
