/**
 * Value parsers for the "Payments" sheet.
 *
 * The sheet mixes hand-typed cells with currency-formatted numbers, percents
 * and three different date renderings. Everything here is deliberately
 * lossless and date-only: dates stay in the sheet's local calendar terms, we
 * never route them through `Date` timezone conversion.
 */

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/** Values that the sheet uses to mean "nothing here". */
const EMPTY_MARKERS = new Set(["", "-", "--", "—", "–", "n/a", "na"]);

/**
 * Parses money/plain numbers in the sheet's formats:
 *   "$1,234.56" -> 1234.56
 *   "-$11,412.11" -> -11412.11
 *   "(1,234.56)" -> -1234.56
 *   "18.00%" -> 0.18
 *   "" -> null
 * Invalid text returns null so callers can decide whether that is fatal.
 */
export function parseNumber(raw: string | null | undefined): number | null {
  if (raw == null) {
    return null;
  }

  let text = raw.replace(/\u00a0/g, " ").trim();
  if (EMPTY_MARKERS.has(text.toLowerCase())) {
    return null;
  }

  text = text.replace(/\s+/g, "");

  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1);
  }

  let isPercent = false;
  if (text.endsWith("%")) {
    isPercent = true;
    text = text.slice(0, -1);
  }

  text = text.replace(/\$/g, "").replace(/,/g, "");

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    return null;
  }

  const value = Number(text);
  if (!Number.isFinite(value)) {
    return null;
  }

  // The sheet writes percentages as "18.00%" (already multiplied by 100) and
  // fractions as "0.1895". Only the former needs scaling.
  const scaled = isPercent ? value / 100 : value;
  return negative ? -scaled : scaled;
}

/** Percent cell helper: "18.00%" -> 0.18, "0.1895" -> 0.1895. */
export function parsePercent(raw: string | null | undefined): number | null {
  return parseNumber(raw);
}

/** Whole-number cell helper ("6", "86"); null for fractions/invalid text. */
export function parseInteger(raw: string | null | undefined): number | null {
  const value = parseNumber(raw);
  return value != null && Number.isInteger(value) ? value : null;
}

/** Rounds to 2 decimals without turning 1.005 into 1.00. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toIso(year: number, month: number, day: number): string | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  // Round-trip through UTC solely to reject impossible dates (2025-02-30).
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;
}

/**
 * Normalizes the three date renderings found on the sheet to yyyy-mm-dd:
 *   "December 21, 2026"  (en-US long)
 *   "4/29/2025"          (M/D/YYYY)
 *   "4-Mar-2024"         (d-MMM-yyyy)
 *   "2024-07-27"         (already ISO)
 * Returns null for empty in values; null for anything unrecognizable.
 */
export function parseDate(raw: string | null | undefined): string | null {
  if (raw == null) {
    return null;
  }

  const text = raw.replace(/\u00a0/g, " ").trim();
  if (!text) {
    return null;
  }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    return toIso(Number(slash[3]), Number(slash[1]), Number(slash[2]));
  }

  const dayMonthName = text.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{4})$/);
  if (dayMonthName) {
    const month = MONTHS[dayMonthName[2].toLowerCase()];
    return month ? toIso(Number(dayMonthName[3]), month, Number(dayMonthName[1])) : null;
  }

  const monthName = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthName) {
    const month = MONTHS[monthName[1].toLowerCase()];
    return month ? toIso(Number(monthName[3]), month, Number(monthName[2])) : null;
  }

  return null;
}

/** Stable, URL-safe id fragment from a human label. */
export function slugify(input: string): string {
  const slug = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "item";
}
