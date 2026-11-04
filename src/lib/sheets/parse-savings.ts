/**
 * "Ahorro 100" — the 52-week savings challenge tab.
 *
 * One header row, one row per week. Dates are d-MMM-yyyy (e.g. "4-Mar-2024").
 */
import type { SavingsPlan, SavingsWeek } from "@/lib/types";
import { SheetLayoutError, SheetParseError } from "./errors";
import { cellAt, norm, type Grid } from "./grid";
import { parseDate, parseInteger, parseNumber } from "./values";

const TAB = "Ahorro 100";

export function parseSavings(grid: Grid): SavingsPlan {
  const firstHeader = cellAt(grid, 0, 0);
  if (norm(firstHeader) !== "fecha") {
    throw new SheetLayoutError(
      TAB,
      'A1 = "Fecha"',
      JSON.stringify(firstHeader),
    );
  }

  const weeks: SavingsWeek[] = [];

  for (let row = 1; row < grid.length; row += 1) {
    const dateRaw = cellAt(grid, row, 0).trim();
    if (!dateRaw) {
      break;
    }

    const date = parseDate(dateRaw);
    if (!date) {
      throw new SheetParseError(
        TAB,
        `row ${row + 1}: unrecognized date ${JSON.stringify(dateRaw)}`,
      );
    }

    const week = parseInteger(cellAt(grid, row, 1));
    const deposit = parseNumber(cellAt(grid, row, 2));
    const cumulative = parseNumber(cellAt(grid, row, 3));

    if (week == null || deposit == null || cumulative == null) {
      throw new SheetParseError(
        TAB,
        `row ${row + 1}: expected week/deposit/cumulative numbers, found ${JSON.stringify(
          [cellAt(grid, row, 1), cellAt(grid, row, 2), cellAt(grid, row, 3)],
        )}`,
      );
    }

    weeks.push({ week, date, deposit, cumulative });
  }

  if (weeks.length === 0) {
    throw new SheetLayoutError(
      TAB,
      "at least one savings week below the header",
      "0 data rows",
    );
  }

  const last = weeks[weeks.length - 1];
  return {
    name: "Ahorro 100",
    weeks,
    target: last.cumulative,
    current: last.cumulative,
  };
}
