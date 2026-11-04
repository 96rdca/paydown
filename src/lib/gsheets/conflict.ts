/**
 * Conflict detection for read-modify-write edits.
 *
 * The UI always sends the value it based the edit on (`before`). Before writing,
 * the route re-parses the tab and compares the *current* cell against `before`:
 *
 *   number  — money/rate cells; tolerant to floating-point/rounding drift
 *             within 0.005 (the sheet's own cents precision).
 *   date    — ISO dates; equality after the reader's normalization, so
 *             "December 21, 2026" and "2026-12-21" are the same day.
 *   status  — status text; equality after the reader's normalization (trim,
 *             collapse spaces, lowercase). No fuzzy matching.
 *
 * A mismatch is not an error in the request: the sheet is the source of truth
 * and someone edited it directly. It surfaces as a 409 carrying the freshest
 * parsed value so the UI can show it immediately.
 */
import { parseDate } from "@/lib/sheets/values";
import { norm } from "@/lib/sheets/grid";
import { WriteConflictError } from "./errors";

export type ConflictKind = "number" | "date" | "status";

/** Half a cent: the sheet stores money with two decimals. */
export const NUMBER_EPSILON = 0.005;

export function numbersMatch(
  before: number | null,
  current: unknown,
): boolean {
  if (before === null) {
    return current === null;
  }
  return typeof current === "number" && Math.abs(current - before) <= NUMBER_EPSILON;
}

export function datesMatch(before: string, current: unknown): boolean {
  if (typeof current !== "string") {
    return false;
  }

  const expected = parseDate(before);
  if (!expected) {
    // Callers validate ISO input; a non-date `before` can only match verbatim.
    return norm(current) === norm(before);
  }
  return parseDate(current) === expected;
}

export function statusesMatch(before: string, current: unknown): boolean {
  if (typeof current !== "string") {
    return false;
  }
  return norm(current) === norm(before);
}

/** True when the freshly parsed cell still holds the value the UI saw. */
export function valuesMatch(
  kind: ConflictKind,
  before: unknown,
  current: unknown,
): boolean {
  switch (kind) {
    case "number":
      if (before !== null && typeof before !== "number") {
        return false;
      }
      return numbersMatch(before, current);
    case "date":
      return typeof before === "string" ? datesMatch(before, current) : false;
    case "status":
      return typeof before === "string" ? statusesMatch(before, current) : false;
  }
}

function display(value: unknown): string {
  if (value === null || value === undefined) {
    return "vacío";
  }
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}

/**
 * Throws `WriteConflictError` (409) when the sheet moved under the edit.
 * `label` is the human name of the field, used in the message the UI shows.
 */
export function assertNoConflict(
  kind: ConflictKind,
  before: unknown,
  current: unknown,
  label: string,
): void {
  if (valuesMatch(kind, before, current)) {
    return;
  }

  throw new WriteConflictError(
    `La hoja cambió: "${label}" ahora vale ${display(
      current,
    )} y la app esperaba ${display(before)}. Recarga y vuelve a intentar.`,
    current,
  );
}
