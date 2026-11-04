/**
 * Cell resolution for write-back.
 *
 * Every writer answers the same question: "which single cell backs this entity
 * in the *current* layout?" The answer must come from the same anchors the
 * reader uses (`parse-sheet1.ts`, `parse-loans.ts`), never from hardcoded A1
 * references — the owner inserts/hides rows, and a stale coordinate would
 * silently write into the wrong budget line.
 *
 * Resolution works on a freshly parsed grid, so the resolved cell also carries
 * the current raw/parsed value used by the conflict check.
 *
 * Layout notes (verified against the live export):
 *   Sheet1      Q 15 block -> A/B rows, then Q 30 block, then "Razon".
 *               Cards: header "Banco (Corte)" in D, card columns E–J derived
 *               from the header cells, field labels in column D.
 *               "Tasa Dollar" label with the rate in the cell to its right.
 *               "Deudas" header: label / amount (+1) / due date (+2).
 *   Auto Loan   header "Payment Number", Status at +7 (validated, like the
 *               reader).
 *   Jeep Loan   header "No.Cuota" (normalized), Status at +8 (validated).
 *               The summary block has merged-cell junk, so the status column
 *               is never guessed — it must sit exactly where the reader
 *               expects it or resolution fails loudly.
 */
import {
  cellAt,
  findCell,
  findInColumn,
  norm,
  type CellRef,
  type Grid,
} from "@/lib/sheets/grid";
import { SheetLayoutError } from "@/lib/sheets/errors";
import { parseDate, parseInteger, parseNumber, slugify } from "@/lib/sheets/values";
import { InvalidTargetError, UnknownEntityError } from "./errors";

const SHEET1 = "Sheet1";

export type PeriodId = "Q15" | "Q30";

export const CARD_FIELDS = {
  limitDop: "Limite DOP",
  limitUsd: "Limite USD",
  statementBalanceDop: "Balance Corte",
  statementBalanceUsd: "Balance Corte USD",
  availableDop: "Disponible",
  availableUsd: "Disponible USD",
  minPaymentDop: "Pago Minimo",
  minPaymentUsd: "Pago Minimo USD",
} as const;

export type CardField = keyof typeof CARD_FIELDS;

export interface ResolvedCell {
  /** Sheet tab name, e.g. "Sheet1" / "Auto Loan". */
  tab: string;
  /** 0-based row/column of the target cell. */
  row: number;
  col: number;
  /** A1 notation without the tab, e.g. "B12". */
  a1: string;
  /** Raw text as it appears in the fresh export. */
  currentRaw: string;
  /**
   * Parsed value for the conflict check: number | ISO date | status text.
   * `null` means the cell is empty; an unparseable non-empty cell keeps its raw
   * text so the client sees what is actually there.
   */
  current: number | string | null;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnLetter(col: number): string {
  if (!Number.isInteger(col) || col < 0) {
    throw new InvalidTargetError(`Invalid column index ${String(col)}.`);
  }

  let remaining = col + 1;
  let letters = "";
  while (remaining > 0) {
    const digit = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + digit) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return letters;
}

/** 0-based row/col -> A1 cell ("B12"). */
export function toA1(row: number, col: number): string {
  return `${columnLetter(col)}${row + 1}`;
}

function cell(tab: string, row: number, col: number): Omit<ResolvedCell, "current" | "currentRaw"> {
  return { tab, row, col, a1: toA1(row, col) };
}

function numericValue(raw: string): number | string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return parseNumber(trimmed) ?? trimmed;
}

function dateValue(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  // Keep unparseable text in the conflict report instead of pretending empty.
  return parseDate(trimmed) ?? trimmed;
}

function statusValue(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/** Bounded column search: rows [startRow, endRow). */
function findInColumnBetween(
  grid: Grid,
  col: number,
  predicate: (value: string) => boolean,
  startRow: number,
  endRow: number,
): CellRef | null {
  for (let row = Math.max(startRow, 0); row < Math.min(endRow, grid.length); row += 1) {
    if (predicate(cellAt(grid, row, col))) {
      return { row, col };
    }
  }
  return null;
}

/** Period ids arrive from the URL; accept "Q15"/"q 15"/"Q 30". */
export function normalizePeriodId(raw: string): PeriodId {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (compact === "Q15" || compact === "Q30") {
    return compact;
  }
  throw new InvalidTargetError(
    `Unknown period id ${JSON.stringify(raw)}: expected "Q15" or "Q30".`,
  );
}

/* ────────────────────────────── Sheet1 ────────────────────────────── */

interface Sheet1Anchors {
  q15: CellRef;
  q30: CellRef;
  q30SalaryRow: number;
  razonRow: number;
  cardsHeader: CellRef;
}

/**
 * Same anchors/order as `parseSheet1`: Q 15 first, Q 30 searched below it,
 * then the "Razon" table that closes the budget area.
 */
function sheet1Anchors(grid: Grid): Sheet1Anchors {
  const q15 = findInColumn(grid, 0, (value) => norm(value) === "q 15");
  if (!q15) {
    throw new SheetLayoutError(SHEET1, 'A1 = "Q 15"', "<not found>");
  }

  const q30 = findInColumn(
    grid,
    0,
    (value) => norm(value) === "q 30",
    q15.row + 1,
  );
  if (!q30) {
    throw new SheetLayoutError(SHEET1, 'A9 = "Q 30"', "<not found>");
  }

  const q30Salary = findInColumn(
    grid,
    0,
    (value) => norm(value) === "sueldo",
    q30.row + 1,
  );
  if (!q30Salary) {
    throw new SheetLayoutError(SHEET1, 'A10 = "Sueldo"', "<not found>");
  }

  const razon = findInColumn(
    grid,
    0,
    (value) => norm(value) === "razon",
    q30Salary.row + 1,
  );
  if (!razon) {
    throw new SheetLayoutError(SHEET1, 'row 20 starts with "Razon"', "<not found>");
  }

  const cardsHeader = findCell(
    grid,
    (value) => norm(value) === "banco (corte)",
    q30Salary.row,
  );
  if (!cardsHeader) {
    throw new SheetLayoutError(SHEET1, 'D10 = "Banco (Corte)"', "<not found>");
  }

  return {
    q15,
    q30,
    q30SalaryRow: q30Salary.row,
    razonRow: razon.row,
    cardsHeader,
  };
}

/** Row range [start, end) of a quincena block, mirroring the reader. */
function periodBounds(
  anchors: Sheet1Anchors,
  periodId: PeriodId,
): { start: number; end: number } {
  return periodId === "Q15"
    ? { start: anchors.q15.row, end: anchors.q30.row }
    : { start: anchors.q30.row, end: anchors.razonRow };
}

function periodLabel(periodId: PeriodId): string {
  return periodId === "Q15" ? "Q 15" : "Q 30";
}

/** The "Sueldo" row of a quincena block (amount lives in column B). */
function salaryRowOf(
  grid: Grid,
  anchors: Sheet1Anchors,
  periodId: PeriodId,
): number {
  const { start, end } = periodBounds(anchors, periodId);
  const salary = findInColumnBetween(
    grid,
    0,
    (value) => norm(value) === "sueldo",
    start + 1,
    end,
  );
  if (!salary) {
    throw new SheetLayoutError(
      SHEET1,
      `a "Sueldo" row under "${periodLabel(periodId)}"`,
      "<not found>",
    );
  }
  return salary.row;
}

/** Period salary cell: Sheet1 column B on the block's "Sueldo" row. */
export function resolvePeriodSalary(grid: Grid, periodId: string): ResolvedCell {
  const id = normalizePeriodId(periodId);
  const anchors = sheet1Anchors(grid);
  const row = salaryRowOf(grid, anchors, id);

  return {
    ...cell(SHEET1, row, 1),
    currentRaw: cellAt(grid, row, 1),
    current: numericValue(cellAt(grid, row, 1)),
  };
}

/** One labelled expense row inside a quincena block (cols A/B). */
export interface PeriodItemRow {
  /** 0-based row index. */
  row: number;
  label: string;
  amountRaw: string;
  /** Parsed column B; null when the cell is empty or unparseable. */
  amountDop: number | null;
}

/**
 * The item row for an id inside a quincena block, or null.
 *
 * Mirrors `parseSheet1`/`resolvePeriodItem`: items start below that block's
 * "Sueldo", stop at the next block anchor ("Razon" for Q30), and their id is
 * `${period}-${slug(label)}`.
 */
export function findPeriodItemRow(
  grid: Grid,
  periodId: string,
  itemId: string,
): PeriodItemRow | null {
  const id = normalizePeriodId(periodId);
  const anchors = sheet1Anchors(grid);
  const { end } = periodBounds(anchors, id);
  const salaryRow = salaryRowOf(grid, anchors, id);
  const prefix = `${id.toLowerCase()}-`;

  for (let row = salaryRow + 1; row < Math.min(end, grid.length); row += 1) {
    const label = cellAt(grid, row, 0).trim();
    if (!label) {
      continue;
    }
    if (norm(label) === "razon") {
      break;
    }

    if (`${prefix}${slugify(label)}` !== itemId) {
      continue;
    }

    const amountRaw = cellAt(grid, row, 1);
    return {
      row,
      label,
      amountRaw,
      amountDop: parseNumber(amountRaw),
    };
  }

  return null;
}

/** Budget item cell: the row whose label slugifies to the item id, column B. */
export function resolvePeriodItem(
  grid: Grid,
  periodId: string,
  itemId: string,
): ResolvedCell {
  const id = normalizePeriodId(periodId);
  const target = findPeriodItemRow(grid, id, itemId);

  if (!target) {
    throw new UnknownEntityError(
      `Unknown item id ${JSON.stringify(itemId)} in period "${id}".`,
    );
  }

  return {
    ...cell(SHEET1, target.row, 1),
    currentRaw: target.amountRaw,
    current: numericValue(target.amountRaw),
  };
}

/** A quincena block as the reader sees it. Rows are 0-based. */
export interface PeriodBlock {
  periodId: PeriodId;
  /** The block's "Sueldo" row. */
  salaryRow: number;
  /** Rows carrying an item label, in sheet order. Never includes the header. */
  itemRows: number[];
  /** Exclusive end: the next block's anchor row ("Q 30" / "Razon"). */
  endRow: number;
}

/**
 * Structural view of a quincena block, built from the reader's anchors.
 *
 * `parseSheet1` reads items from `salaryRow + 1` up to the next block anchor,
 * skipping blank labels and stopping at "Razon". `itemRows` keeps every row
 * with a label in that window — including a row whose amount is momentarily
 * blank — because those rows still occupy the block and inserting after them
 * keeps the owner's order intact.
 */
export function resolvePeriodBlock(
  grid: Grid,
  periodId: string,
): PeriodBlock {
  const id = normalizePeriodId(periodId);
  const anchors = sheet1Anchors(grid);
  const { end } = periodBounds(anchors, id);
  const salaryRow = salaryRowOf(grid, anchors, id);
  const itemRows: number[] = [];

  for (let row = salaryRow + 1; row < Math.min(end, grid.length); row += 1) {
    const label = cellAt(grid, row, 0).trim();
    if (!label) {
      continue;
    }
    if (norm(label) === "razon") {
      break;
    }
    itemRows.push(row);
  }

  return { periodId: id, salaryRow, itemRows, endRow: end };
}

/** Where a new expense row must go for a quincena block. */
export interface InsertionPoint {
  periodId: PeriodId;
  /** 0-based index the new row will occupy after `insertDimension`. */
  insertIndex: number;
  salaryRow: number;
  /** Last item row, or null when the block has no items yet. */
  lastItemRow: number | null;
  endRow: number;
}

/**
 * Insert AFTER the last item row; with no items, directly after "Sueldo".
 *
 * 0-based `insertIndex` is exactly the `startIndex` for the `insertDimension`
 * batchUpdate request (the API's indices are 0-based and half-open).
 */
export function resolveInsertionPoint(
  grid: Grid,
  periodId: string,
): InsertionPoint {
  const block = resolvePeriodBlock(grid, periodId);
  const lastItemRow =
    block.itemRows.length > 0
      ? block.itemRows[block.itemRows.length - 1]
      : null;
  const insertIndex =
    lastItemRow === null ? block.salaryRow + 1 : lastItemRow + 1;

  // Defence in depth: never insert above the salary row or outside the block.
  if (
    insertIndex <= block.salaryRow ||
    insertIndex > block.endRow ||
    insertIndex > grid.length
  ) {
    throw new SheetLayoutError(
      SHEET1,
      `an insertion row inside "${periodLabel(block.periodId)}"`,
      `row ${insertIndex + 1}`,
    );
  }

  return {
    periodId: block.periodId,
    insertIndex,
    salaryRow: block.salaryRow,
    lastItemRow,
    endRow: block.endRow,
  };
}

/**
 * True when `row` is one of Sheet1's structural anchor rows (block headers,
 * "Sueldo", card header, "Deudas" header). Such a row must never be deleted by
 * a dimension request.
 */
export function isStructuralRow(grid: Grid, row: number): boolean {
  const anchors = sheet1Anchors(grid);
  const structural = new Set<number>([
    anchors.q15.row,
    anchors.q30.row,
    anchors.q30SalaryRow,
    anchors.razonRow,
    anchors.cardsHeader.row,
  ]);

  // Both quincenas have their own "Sueldo" row; neither is removable.
  const q15Salary = findInColumn(
    grid,
    0,
    (value) => norm(value) === "sueldo",
    anchors.q15.row + 1,
  );
  if (q15Salary) {
    structural.add(q15Salary.row);
  }

  const deudas = findCell(grid, (value) => norm(value) === "deudas");
  if (deudas) {
    structural.add(deudas.row);
  }

  return structural.has(row);
}

/** Bank name inside a card header ("BHD - Premia (18) -(12)" -> "BHD Premia"). */
function cardBankName(raw: string): string {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Card matrix cell.
 *
 * Row: the field label ("Limite DOP"…) in the header's own column (D).
 * Column: the card's header position in E–J — resolved by comparing the
 * slugified bank name, never by a fixed offset, because the sheet reorders
 * cards between statements.
 */
export function resolveCardField(
  grid: Grid,
  cardId: string,
  field: string,
): ResolvedCell {
  if (!isCardField(field)) {
    throw new InvalidTargetError(
      `Unknown card field ${JSON.stringify(field)}. Expected one of: ${Object.keys(
        CARD_FIELDS,
      ).join(", ")}.`,
    );
  }

  const anchors = sheet1Anchors(grid);
  const header = anchors.cardsHeader;

  let cardCol = -1;
  for (let offset = 1; offset <= 6; offset += 1) {
    const raw = cellAt(grid, header.row, header.col + offset).trim();
    if (!raw) {
      continue;
    }
    if (slugify(cardBankName(raw)) === cardId) {
      cardCol = header.col + offset;
      break;
    }
  }

  if (cardCol < 0) {
    throw new UnknownEntityError(`Unknown card id ${JSON.stringify(cardId)}.`);
  }

  const label = CARD_FIELDS[field];
  const row = findInColumnBetween(
    grid,
    header.col,
    (value) => norm(value) === norm(label),
    header.row + 1,
    anchors.razonRow,
  );
  if (!row) {
    throw new SheetLayoutError(
      SHEET1,
      `the card row "${label}"`,
      "<not found>",
    );
  }

  return {
    ...cell(SHEET1, row.row, cardCol),
    currentRaw: cellAt(grid, row.row, cardCol),
    current: numericValue(cellAt(grid, row.row, cardCol)),
  };
}

/** "Tasa Dollar" — the rate cell immediately to the right of the label. */
export function resolveUsdRate(grid: Grid): ResolvedCell {
  const label = findCell(grid, (value) => norm(value) === "tasa dollar");
  if (!label) {
    throw new SheetLayoutError(SHEET1, 'D1 = "Tasa Dollar"', "<not found>");
  }

  // The reader uses `nextValue` (first non-empty cell to the right). Mirror it
  // when the adjacent cell is blank so conflict checks see the same rate.
  let col = label.col + 1;
  if (!cellAt(grid, label.row, col).trim()) {
    const cells = grid[label.row] ?? [];
    for (let index = col; index < cells.length; index += 1) {
      if (cellAt(grid, label.row, index).trim()) {
        col = index;
        break;
      }
    }
  }

  const raw = cellAt(grid, label.row, col);
  return {
    ...cell(SHEET1, label.row, col),
    currentRaw: raw,
    current: numericValue(raw),
  };
}

/** The "Deudas" block header, located the same way `readDatedDebts` does. */
function datedDebtsBlock(
  grid: Grid,
  anchors: Sheet1Anchors,
): { labelCol: number; endRow: number; headerRow: number } {
  const header = findCell(grid, (value) => norm(value) === "deudas");
  if (!header) {
    throw new SheetLayoutError(SHEET1, 'the "Deudas" block header', "<not found>");
  }
  return {
    labelCol: header.col,
    headerRow: header.row,
    // The reader stops the block at the card matrix header.
    endRow: anchors.cardsHeader.row,
  };
}

function datedDebtRow(
  grid: Grid,
  anchors: Sheet1Anchors,
  debtId: string,
): { row: number; labelCol: number } {
  const block = datedDebtsBlock(grid, anchors);

  for (let row = block.headerRow + 1; row < Math.min(block.endRow, grid.length); row += 1) {
    const label = cellAt(grid, row, block.labelCol).trim();
    if (!label) {
      // The salary row sits between "Deudas" and the first debt.
      continue;
    }
    if (slugify(label) === debtId) {
      return { row, labelCol: block.labelCol };
    }
  }

  throw new UnknownEntityError(`Unknown debt id ${JSON.stringify(debtId)}.`);
}

/** Dated debt amount: label column + 1. */
export function resolveDebtAmount(grid: Grid, debtId: string): ResolvedCell {
  const anchors = sheet1Anchors(grid);
  const { row, labelCol } = datedDebtRow(grid, anchors, debtId);
  const col = labelCol + 1;

  return {
    ...cell(SHEET1, row, col),
    currentRaw: cellAt(grid, row, col),
    current: numericValue(cellAt(grid, row, col)),
  };
}

/** Dated debt due date: label column + 2. */
export function resolveDebtDueDate(grid: Grid, debtId: string): ResolvedCell {
  const anchors = sheet1Anchors(grid);
  const { row, labelCol } = datedDebtRow(grid, anchors, debtId);
  const col = labelCol + 2;

  return {
    ...cell(SHEET1, row, col),
    currentRaw: cellAt(grid, row, col),
    current: dateValue(cellAt(grid, row, col)),
  };
}

/* ────────────────────────────── Loans ────────────────────────────── */

interface LoanLayout {
  tab: string;
  /** Header cell predicate, identical to the reader's. */
  header: (value: string) => boolean;
  /** Status column offset from the header, validated exactly like the reader. */
  statusOffset: number;
}

const LOAN_LAYOUTS: Record<string, LoanLayout> = {
  "auto-loan": {
    tab: "Auto Loan",
    header: (value) => norm(value) === "payment number",
    statusOffset: 7,
  },
  "jeep-loan": {
    tab: "Jeep Loan",
    // "No.Cuota" / "No Cuota" / "No. Cuota" all normalize the same way.
    header: (value) => norm(value).replace(/[\s.]/g, "") === "nocuota",
    statusOffset: 8,
  },
};

export function isLoanWithSchedule(loanId: string): boolean {
  return loanId in LOAN_LAYOUTS;
}

/**
 * Status cell for a loan cuota.
 *
 * The row is found by the cuota number in the header's column. The status
 * column must sit at the offset the reader validates (Auto +7, Jeep +8): Jeep's
 * summary block has merged/junk cells ("Desembolso", "Interes"), so scanning for
 * the first "Status" text would be less trustworthy than the reader's rule.
 */
export function resolveLoanCuotaStatus(
  grid: Grid,
  loanId: string,
  number: number,
): ResolvedCell {
  const layout = LOAN_LAYOUTS[loanId];
  if (!layout) {
    throw new UnknownEntityError(
      `Loan ${JSON.stringify(loanId)} has no cuota status column.`,
    );
  }
  if (!Number.isInteger(number) || number <= 0) {
    throw new InvalidTargetError(
      `Invalid cuota number ${JSON.stringify(number)}: expected a positive integer.`,
    );
  }

  const header = findCell(grid, layout.header);
  if (!header) {
    throw new SheetLayoutError(
      layout.tab,
      'a schedule header row ("Payment Number" / "No.Cuota")',
      "<not found>",
    );
  }

  const statusCol = header.col + layout.statusOffset;
  const statusHeader = cellAt(grid, header.row, statusCol);
  if (norm(statusHeader) !== "status") {
    throw new SheetLayoutError(
      layout.tab,
      'a "Status" column after "Ending Balance"',
      JSON.stringify(statusHeader),
    );
  }

  for (let row = header.row + 1; row < grid.length; row += 1) {
    const numberRaw = cellAt(grid, row, header.col).trim();
    if (!numberRaw) {
      continue;
    }

    const parsed = parseInteger(numberRaw);
    if (parsed == null) {
      // Same bail-out as the reader: the schedule ends at the first non-number.
      break;
    }

    if (parsed !== number) {
      continue;
    }

    return {
      ...cell(layout.tab, row, statusCol),
      currentRaw: cellAt(grid, row, statusCol),
      current: statusValue(cellAt(grid, row, statusCol)),
    };
  }

  throw new UnknownEntityError(
    `Unknown cuota ${number} on loan ${JSON.stringify(loanId)}.`,
  );
}

/* ──────────────────────────── Type guards ──────────────────────────── */

export function isCardField(value: string): value is CardField {
  return Object.prototype.hasOwnProperty.call(CARD_FIELDS, value);
}

/** Exported for tests/type-safety: tab lookup by loan id. */
export function loanTab(loanId: string): string | null {
  return LOAN_LAYOUTS[loanId]?.tab ?? null;
}
