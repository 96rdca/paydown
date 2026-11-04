/**
 * Sheet1 parser: biweekly budget, dated debts, credit-card matrix and the two
 * receivable tables.
 *
 * Everything is anchored on labels rather than fixed row numbers. On the live
 * tab the owner keeps a blank row between blocks and hides rows now and then,
 * so `A9 = "Q 30"` in the brief no longer matches the exported CSV; searching
 * for the labels keeps the parser honest across those edits.
 */
import type {
  CardAccount,
  CardTotals,
  DatedDebt,
  PayPeriod,
  QuincenaId,
  Receivable,
} from "@/lib/types";
import { SheetLayoutError, SheetParseError } from "./errors";
import {
  cellAt,
  findCell,
  findInColumn,
  firstColumnSample,
  norm,
  nextValue,
  type CellRef,
  type Grid,
} from "./grid";
import { parseDate, parseInteger, parseNumber, round2, slugify } from "./values";

const TAB = "Sheet1";

export interface Sheet1Data {
  usdRate: number;
  periods: PayPeriod[];
  datedDebts: DatedDebt[];
  cards: CardAccount[];
  cardTotals: CardTotals;
  receivables: Receivable[];
}

type CardNumberField =
  | "limitDop"
  | "limitUsd"
  | "statementBalanceDop"
  | "statementBalanceUsd"
  | "availableDop"
  | "availableUsd"
  | "minPaymentDop"
  | "minPaymentUsd";

const CARD_ROWS: Array<{ label: string; field: CardNumberField }> = [
  { label: "Limite DOP", field: "limitDop" },
  { label: "Limite USD", field: "limitUsd" },
  { label: "Balance Corte", field: "statementBalanceDop" },
  { label: "Balance Corte USD", field: "statementBalanceUsd" },
  { label: "Disponible", field: "availableDop" },
  { label: "Disponible USD", field: "availableUsd" },
  { label: "Pago Minimo", field: "minPaymentDop" },
  { label: "Pago Minimo USD", field: "minPaymentUsd" },
];

const CARD_ROW_BY_LABEL = new Map(
  CARD_ROWS.map((row) => [norm(row.label), row.field]),
);

function requiredAnchor(
  grid: Grid,
  predicate: (value: string) => boolean,
  expected: string,
  startRow = 0,
): CellRef {
  const anchor = findInColumn(grid, 0, predicate, startRow);
  if (!anchor) {
    throw new SheetLayoutError(TAB, expected, firstColumnSample(grid));
  }
  return anchor;
}

function readPeriod(
  grid: Grid,
  anchor: CellRef,
  id: QuincenaId,
  endRow: number,
): PayPeriod {
  const label = cellAt(grid, anchor.row, anchor.col).trim();

  let salaryRow = -1;
  for (let row = anchor.row + 1; row < endRow; row += 1) {
    if (norm(cellAt(grid, row, 0)) === "sueldo") {
      salaryRow = row;
      break;
    }
  }
  if (salaryRow < 0) {
    throw new SheetLayoutError(
      TAB,
      `a "Sueldo" row under "${label}"`,
      firstColumnSample(grid),
    );
  }

  const salaryRaw = cellAt(grid, salaryRow, 1);
  const salary = parseNumber(salaryRaw);
  if (salary == null) {
    throw new SheetParseError(
      TAB,
      `row ${salaryRow + 1}: expected the "${label}" salary in column B, found ${JSON.stringify(
        salaryRaw,
      )}`,
    );
  }

  const items: PayPeriod["items"] = [];
  for (let row = salaryRow + 1; row < endRow; row += 1) {
    const itemLabel = cellAt(grid, row, 0).trim();
    if (!itemLabel) {
      continue;
    }
    if (norm(itemLabel) === "razon") {
      break;
    }

    const amountRaw = cellAt(grid, row, 1);
    const amountDop = parseNumber(amountRaw);
    if (amountDop == null) {
      if (!amountRaw.trim()) {
        continue;
      }
      throw new SheetParseError(
        TAB,
        `row ${row + 1} ("${itemLabel}"): expected a DOP amount in column B, found ${JSON.stringify(
          amountRaw,
        )}`,
      );
    }

    items.push({
      id: `${id.toLowerCase()}-${slugify(itemLabel)}`,
      label: itemLabel,
      amountDop,
      isUsdBilled: /^usd(?:\s|$)/i.test(itemLabel),
    });
  }

  const total = items.reduce((sum, item) => sum + item.amountDop, 0);
  return {
    id,
    label,
    salary,
    items,
    surplusDop: round2(salary - total),
  };
}

function readDatedDebts(grid: Grid, endRow: number): DatedDebt[] {
  const header = findCell(grid, (value) => norm(value) === "deudas");
  if (!header) {
    throw new SheetLayoutError(TAB, 'the "Deudas" block header', "<not found>");
  }

  const debts: DatedDebt[] = [];
  for (let row = header.row + 1; row < endRow; row += 1) {
    const label = cellAt(grid, row, header.col).trim();
    if (!label) {
      // The salary row sits between the "Deudas" header and the first debt.
      continue;
    }

    const amountRaw = cellAt(grid, row, header.col + 1);
    const dateRaw = cellAt(grid, row, header.col + 2);
    const amountDop = parseNumber(amountRaw);
    const dueDate = parseDate(dateRaw);

    if (amountDop == null || dueDate == null) {
      throw new SheetParseError(
        TAB,
        `debt "${label}" (row ${row + 1}): expected an amount and a date, found ${JSON.stringify(
          amountRaw,
        )} / ${JSON.stringify(dateRaw)}`,
      );
    }

    debts.push({
      id: slugify(label),
      label,
      amountDop,
      dueDate,
    });
  }

  if (debts.length === 0) {
    throw new SheetLayoutError(
      TAB,
      'at least one debt row below "Deudas"',
      "0 rows",
    );
  }
  return debts;
}

interface CardHeader {
  bank: string;
  closingDay: number | null;
  dueDay: number | null;
}

/** "Santa Cruz (18) - (13)" -> Santa Cruz / 18 / 13. */
function parseCardHeader(raw: string): CardHeader {
  const days = Array.from(raw.matchAll(/\((\d{1,2})\)/g), (match) =>
    Number(match[1]),
  );
  const bank = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    bank,
    closingDay: days[0] ?? null,
    dueDay: days[1] ?? null,
  };
}

function readCards(
  grid: Grid,
  header: CellRef,
  endRow: number,
): { cards: CardAccount[]; cardTotals: CardTotals } {
  if (norm(cellAt(grid, header.row, header.col)) !== "banco (corte)") {
    throw new SheetLayoutError(TAB, 'D10 = "Banco (Corte)"', "<not found>");
  }
  const cardHeaders: CardHeader[] = [];
  for (let offset = 1; offset <= 6; offset += 1) {
    const raw = cellAt(grid, header.row, header.col + offset).trim();
    if (!raw) {
      throw new SheetLayoutError(
        TAB,
        "six card headers in columns E–J",
        `an empty header at column ${header.col + offset + 1}`,
      );
    }
    const parsed = parseCardHeader(raw);
    if (!parsed.bank) {
      throw new SheetLayoutError(
        TAB,
        "a bank name inside each card header",
        JSON.stringify(raw),
      );
    }
    cardHeaders.push(parsed);
  }

  const cards: CardAccount[] = cardHeaders.map((parsed) => ({
    id: slugify(parsed.bank),
    bank: parsed.bank,
    closingDay: parsed.closingDay,
    dueDay: parsed.dueDay,
    limitDop: null,
    limitUsd: null,
    statementBalanceDop: null,
    statementBalanceUsd: null,
    availableDop: null,
    availableUsd: null,
    minPaymentDop: null,
    minPaymentUsd: null,
    monthlyRate: null,
  }));

  const totals: CardTotals = {
    limitDop: 0,
    limitUsd: 0,
    statementBalanceDop: 0,
    statementBalanceUsd: 0,
    availableDop: 0,
    availableUsd: 0,
    minPaymentDop: 0,
    minPaymentUsd: 0,
  };
  const explicitTotals = new Map<CardNumberField, number>();
  const seenFields = new Set<CardNumberField>();

  for (let row = header.row + 1; row < endRow; row += 1) {
    const field = CARD_ROW_BY_LABEL.get(norm(cellAt(grid, row, header.col)));
    if (!field) {
      continue;
    }
    seenFields.add(field);

    cards.forEach((card, index) => {
      const raw = cellAt(grid, row, header.col + 1 + index);
      if (!raw.trim()) {
        card[field] = null;
        return;
      }
      const value = parseNumber(raw);
      if (value == null) {
        throw new SheetParseError(
          TAB,
          `card "${card.bank}" / "${cellAt(grid, row, header.col).trim()}": expected a number, found ${JSON.stringify(
            raw,
          )}`,
        );
      }
      card[field] = value;
    });

    const totalRaw = cellAt(grid, row, header.col + 7);
    const total = parseNumber(totalRaw);
    if (total != null) {
      explicitTotals.set(field, total);
    }
  }

  for (const { label, field } of CARD_ROWS) {
    if (!seenFields.has(field)) {
      throw new SheetLayoutError(TAB, `the card row "${label}"`, "<not found>");
    }
    const explicit = explicitTotals.get(field);
    totals[field] =
      explicit ??
      round2(cards.reduce((sum, card) => sum + (card[field] ?? 0), 0));
  }

  return { cards, cardTotals: totals };
}

function uniqueReceivableId(
  reason: string,
  debtor: string,
  used: Set<string>,
): string {
  const base = slugify(reason);
  const candidates = [base];
  if (debtor) {
    candidates.push(`${base}-${slugify(debtor)}`);
  }

  for (const candidate of candidates) {
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function readReceivables(grid: Grid): Receivable[] {
  const header = findInColumn(grid, 0, (value) => norm(value) === "razon");
  if (!header) {
    throw new SheetLayoutError(TAB, 'row 20 starts with "Razon"', "<not found>");
  }

  // The sheet holds two side-by-side copies of the same table (A–E, G–K).
  const headerRow = grid[header.row] ?? [];
  const tableStarts: number[] = [];
  for (let col = 0; col < headerRow.length; col += 1) {
    if (norm(cellAt(grid, header.row, col)) === "razon") {
      tableStarts.push(col);
    }
  }
  if (tableStarts.length === 0) {
    throw new SheetLayoutError(TAB, 'row 20 starts with "Razon"', "<not found>");
  }

  const receivables: Receivable[] = [];
  const usedIds = new Set<string>();

  for (const start of tableStarts) {
    for (let row = header.row + 1; row < grid.length; row += 1) {
      const reason = cellAt(grid, row, start).trim();
      if (!reason) {
        break;
      }

      const debtor = cellAt(grid, row, start + 1).trim();
      const monthlyRaw = cellAt(grid, row, start + 2);
      const monthsRaw = cellAt(grid, row, start + 3);
      const totalRaw = cellAt(grid, row, start + 4);

      const monthlyAmount = parseNumber(monthlyRaw);
      if (monthlyAmount == null) {
        throw new SheetParseError(
          TAB,
          `receivable "${reason}": expected a monthly amount, found ${JSON.stringify(
            monthlyRaw,
          )}`,
        );
      }

      let months: number | null = null;
      if (monthsRaw.trim()) {
        months = parseInteger(monthsRaw);
        if (months == null) {
          throw new SheetParseError(
            TAB,
            `receivable "${reason}": expected whole months, found ${JSON.stringify(
              monthsRaw,
            )}`,
          );
        }
      }

      const explicitTotal = parseNumber(totalRaw);
      const total =
        explicitTotal ??
        (months != null ? round2(monthlyAmount * months) : monthlyAmount);

      const id = uniqueReceivableId(reason, debtor, usedIds);
      usedIds.add(id);

      receivables.push({
        id,
        reason,
        debtor,
        monthlyAmount,
        months,
        total,
      });
    }
  }

  return receivables;
}

function readUsdRate(grid: Grid): number {
  const label = findCell(grid, (value) => norm(value) === "tasa dollar");
  if (!label) {
    throw new SheetLayoutError(TAB, 'D1 = "Tasa Dollar"', "<not found>");
  }

  const raw = nextValue(grid, label.row, label.col + 1);
  const rate = parseNumber(raw);
  if (rate == null) {
    throw new SheetParseError(
      TAB,
      `"Tasa Dollar": expected the DOP/USD rate, found ${JSON.stringify(raw)}`,
    );
  }
  return rate;
}

export function parseSheet1(grid: Grid): Sheet1Data {
  const q15Anchor = requiredAnchor(
    grid,
    (value) => norm(value) === "q 15",
    'A1 = "Q 15"',
  );
  const q30Anchor = requiredAnchor(
    grid,
    (value) => norm(value) === "q 30",
    'A9 = "Q 30"',
    q15Anchor.row + 1,
  );

  const q30SalaryRow = (() => {
    for (let row = q30Anchor.row + 1; row < grid.length; row += 1) {
      if (norm(cellAt(grid, row, 0)) === "sueldo") {
        return row;
      }
    }
    throw new SheetLayoutError(TAB, 'A10 = "Sueldo"', firstColumnSample(grid));
  })();

  const razonAnchor = findInColumn(
    grid,
    0,
    (value) => norm(value) === "razon",
    q30SalaryRow + 1,
  );
  if (!razonAnchor) {
    throw new SheetLayoutError(TAB, 'row 20 starts with "Razon"', "<not found>");
  }

  const periods = [
    readPeriod(grid, q15Anchor, "Q15", q30Anchor.row),
    readPeriod(grid, q30Anchor, "Q30", razonAnchor.row),
  ];

  const cardsHeader = findCell(
    grid,
    (value) => norm(value) === "banco (corte)",
    q30SalaryRow,
  );
  if (!cardsHeader) {
    throw new SheetLayoutError(TAB, 'D10 = "Banco (Corte)"', "<not found>");
  }

  const usdRate = readUsdRate(grid);
  const datedDebts = readDatedDebts(grid, cardsHeader.row);
  const { cards, cardTotals } = readCards(
    grid,
    cardsHeader,
    razonAnchor.row,
  );
  const receivables = readReceivables(grid);

  return {
    usdRate,
    periods,
    datedDebts,
    cards,
    cardTotals,
    receivables,
  };
}
