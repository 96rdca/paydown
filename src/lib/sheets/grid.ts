/**
 * Small helpers for walking a parsed CSV grid.
 *
 * The sheet's row/column positions drift over time (the owner inserts blank
 * rows, hides cuotas, renames cities), so every parser locates its anchors
 * dynamically instead of trusting fixed indexes. `cellAt` makes ragged rows
 * safe to read.
 */

export type Grid = string[][];

export interface CellRef {
  row: number;
  col: number;
}

/** Sheet cell access: row/col are 0-based. Missing cells read as "". */
export function cellAt(grid: Grid, row: number, col: number): string {
  const cells = grid[row];
  if (!cells) {
    return "";
  }
  const value = cells[col];
  return typeof value === "string" ? value : "";
}

/** Comparison form: trimmed, whitespace-collapsed, lowercased. */
export function norm(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** First cell (row-major) matching the predicate, or null. */
export function findCell(
  grid: Grid,
  predicate: (value: string, row: number, col: number) => boolean,
  startRow = 0,
): CellRef | null {
  for (let row = startRow; row < grid.length; row += 1) {
    const cells = grid[row] ?? [];
    for (let col = 0; col < cells.length; col += 1) {
      if (predicate(cellAt(grid, row, col), row, col)) {
        return { row, col };
      }
    }
  }
  return null;
}

/** First match in a single column at/after `startRow`. */
export function findInColumn(
  grid: Grid,
  col: number,
  predicate: (value: string) => boolean,
  startRow = 0,
): CellRef | null {
  for (let row = startRow; row < grid.length; row += 1) {
    if (predicate(cellAt(grid, row, col))) {
      return { row, col };
    }
  }
  return null;
}

/** Exact (normalized) label match, row-major. */
export function findLabel(grid: Grid, label: string): CellRef | null {
  const target = norm(label);
  return findCell(grid, (value) => norm(value) === target);
}

/** First non-empty cell to the right of (row, col), or "". */
export function nextValue(grid: Grid, row: number, col: number): string {
  const cells = grid[row] ?? [];
  for (let index = col; index < cells.length; index += 1) {
    const value = cellAt(grid, row, index).trim();
    if (value) {
      return value;
    }
  }
  return "";
}

/**
 * Human-readable sample of the first column, used in layout errors so the
 * message shows what the parser actually saw.
 */
export function firstColumnSample(grid: Grid, limit = 6): string {
  const values: string[] = [];
  for (let row = 0; row < grid.length && values.length < limit; row += 1) {
    const value = cellAt(grid, row, 0).trim();
    if (value) {
      values.push(value);
    }
  }
  return values.length > 0 ? JSON.stringify(values) : "<no values>";
}
