/**
 * Loan tabs: Credimas (labeled cells only), Auto Loan and Jeep Loan
 * (summary block + amortization schedule).
 *
 * These tabs use two summary layouts:
 *   - Credimas: label and value side by side (B/F next to A/D).
 *   - Auto / Jeep: labels in one row, values on the row below — except Jeep's
 *     "Desembolso" and "Interes", whose values sit to the right.
 * `readNumberField`/`readDateField` try the right-hand cell first and then
 * the cell below, which handles all three arrangements.
 */
import type { InstallmentStatus, Loan, LoanInstallment, LoanSummary } from "@/lib/types";
import { SheetLayoutError, SheetParseError } from "./errors";
import { cellAt, findCell, norm, type CellRef, type Grid } from "./grid";
import { parseDate, parseInteger, parseNumber, round2 } from "./values";

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function findLabelRef(grid: Grid, label: string): CellRef | null {
  const target = norm(label);
  return findCell(grid, (value) => norm(value) === target);
}

/** Numeric field: right neighbour, else the cell directly below. */
function readNumberField(grid: Grid, label: string): number | null {
  const ref = findLabelRef(grid, label);
  if (!ref) {
    return null;
  }

  const inline = parseNumber(cellAt(grid, ref.row, ref.col + 1));
  if (inline != null) {
    return inline;
  }
  return parseNumber(cellAt(grid, ref.row + 1, ref.col));
}

/** Date field: right neighbour, else the cell directly below. */
function readDateField(grid: Grid, label: string): string | null {
  const ref = findLabelRef(grid, label);
  if (!ref) {
    return null;
  }

  return (
    parseDate(cellAt(grid, ref.row, ref.col + 1)) ??
    parseDate(cellAt(grid, ref.row + 1, ref.col))
  );
}

function requireNumberField(
  tab: string,
  grid: Grid,
  label: string,
): number {
  const value = readNumberField(grid, label);
  if (value == null) {
    throw new SheetLayoutError(tab, `a "${label}" numeric cell`, "<not found>");
  }
  return value;
}

function readIntegerField(grid: Grid, label: string): number | null {
  const value = readNumberField(grid, label);
  return value != null && Number.isInteger(value) ? value : null;
}

function numberAt(
  tab: string,
  grid: Grid,
  row: number,
  col: number,
  field: string,
): number {
  const raw = cellAt(grid, row, col);
  const value = parseNumber(raw);
  if (value == null) {
    throw new SheetParseError(
      tab,
      `row ${row + 1}: expected ${field}, found ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

function parseStatus(tab: string, raw: string, row: number): InstallmentStatus {
  const value = norm(raw);
  if (value === "cuota paga") {
    return "paid";
  }
  if (value === "pendiente") {
    return "pending";
  }
  if (value === "abono capital") {
    return "extra";
  }
  throw new SheetParseError(
    tab,
    `row ${row + 1}: unknown installment status ${JSON.stringify(raw)}`,
  );
}

function formatRd(value: number): string {
  return `RD$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercentValue(rate: number): string {
  return `${round2(rate * 100).toFixed(2)}%`;
}

/** "2024-07-27" -> "27 Jul 2024" (matches the sheet's human notation). */
function formatDateHuman(iso: string): string {
  const [year, month, day] = iso.split("-");
  const monthName = MONTH_ABBR[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthName} ${year}`;
}

export function parseCredimas(grid: Grid): Loan {
  const tab = "Credimas";

  const anchor = findCell(grid, (value) => norm(value).includes("duracion"));
  if (!anchor) {
    throw new SheetLayoutError(tab, 'a "Duracion" label', "<not found>");
  }

  const termMonths = requireNumberField(tab, grid, "Duracion");
  const annualRate = requireNumberField(tab, grid, "Interes");
  const principal = requireNumberField(tab, grid, "Monto");
  const loanTotal = requireNumberField(tab, grid, "Total");
  const monthlyPayment = readNumberField(grid, "Pago Mensual") ?? null;

  const extras: Loan["extras"] = [];

  const downPayment = readNumberField(grid, "Pago Inicial");
  if (downPayment != null) {
    extras.push({ label: "Pago inicial", value: formatRd(downPayment) });
  }

  const advanceRate = readNumberField(grid, "Avance");
  const advanceLabel =
    advanceRate != null
      ? `${formatRd(principal)} al ${formatPercentValue(advanceRate)}`
      : formatRd(principal);
  extras.push({ label: "Avance", value: advanceLabel });

  const advanceFee = readNumberField(grid, "Comision Avance");
  if (advanceFee != null) {
    extras.push({
      label: "Comisión de avance",
      value: formatRd(advanceFee),
    });
  }

  const interest = readNumberField(grid, "Intereses");
  if (interest != null) {
    extras.push({ label: "Intereses", value: formatRd(interest) });
  }

  return {
    id: "credimas",
    name: "Credimas",
    sourceTab: tab,
    principal,
    annualRate,
    termMonths: Math.trunc(termMonths),
    monthlyPayment,
    insuranceMonthly: null,
    startDate: null,
    summary: {
      paidCount: null,
      remainingCount: null,
      loanTotal,
      amountPaid: null,
      interestSaved: null,
    },
    schedule: [],
    extras,
  };
}

export function parseAutoLoan(grid: Grid): Loan {
  const tab = "Auto Loan";

  const header = findCell(grid, (value) => norm(value) === "payment number");
  if (!header) {
    throw new SheetLayoutError(
      tab,
      'a header row containing "Payment Number"',
      "<not found>",
    );
  }

  const statusHeader = cellAt(grid, header.row, header.col + 7);
  if (norm(statusHeader) !== "status") {
    throw new SheetLayoutError(
      tab,
      'a "Status" column after "Ending Balance"',
      JSON.stringify(statusHeader),
    );
  }

  const schedule: LoanInstallment[] = [];

  for (let row = header.row + 1; row < grid.length; row += 1) {
    const numberRaw = cellAt(grid, row, header.col).trim();
    if (!numberRaw) {
      continue;
    }

    const number = parseInteger(numberRaw);
    if (number == null) {
      break;
    }

    const date = parseDate(cellAt(grid, row, header.col + 1));
    if (!date) {
      throw new SheetParseError(
        tab,
        `row ${row + 1}: expected a payment date, found ${JSON.stringify(
          cellAt(grid, row, header.col + 1),
        )}`,
      );
    }

    schedule.push({
      number,
      date,
      beginningBalance: numberAt(
        tab,
        grid,
        row,
        header.col + 2,
        "beginning balance",
      ),
      interest: numberAt(tab, grid, row, header.col + 3, "interest paid"),
      principal: numberAt(tab, grid, row, header.col + 4, "principal paid"),
      insurance: null,
      totalPayment: numberAt(tab, grid, row, header.col + 5, "total payment"),
      endingBalance: numberAt(tab, grid, row, header.col + 6, "ending balance"),
      status: parseStatus(tab, cellAt(grid, row, header.col + 7), row),
      extraPayment: null,
    });
  }

  if (schedule.length === 0) {
    throw new SheetLayoutError(
      tab,
      "at least one installment below the header",
      "0 rows",
    );
  }

  const paidCount = readIntegerField(grid, "Payed");
  const remainingCount = readIntegerField(grid, "Month Left");

  const summary: LoanSummary = {
    paidCount:
      paidCount ?? schedule.filter((item) => item.status === "paid").length,
    remainingCount:
      remainingCount ??
      schedule.filter((item) => item.status === "pending").length,
    loanTotal: readNumberField(grid, "Loan Total"),
    amountPaid: readNumberField(grid, "Amount Payed"),
    interestSaved: readNumberField(grid, "Saved"),
  };

  return {
    id: "auto-loan",
    name: "Auto Loan",
    sourceTab: tab,
    // The tab does not publish the principal explicitly; the schedule's first
    // beginning balance is the original amount financed.
    principal: schedule[0].beginningBalance,
    // Rate is not written on the Auto Loan tab; 30% annual is the sheet's
    // documented rate (captured 2026-11-03).
    annualRate: 0.3,
    termMonths: schedule.length,
    monthlyPayment: schedule[0].totalPayment,
    insuranceMonthly: null,
    startDate: schedule[0].date,
    summary,
    schedule,
    extras: [],
  };
}

export function parseJeepLoan(grid: Grid): Loan {
  const tab = "Jeep Loan";

  const header = findCell(
    grid,
    (value) => norm(value).replace(/[\s.]/g, "") === "nocuota",
  );
  if (!header) {
    throw new SheetLayoutError(
      tab,
      'a header row containing "No.Cuota"',
      "<not found>",
    );
  }

  const statusHeader = cellAt(grid, header.row, header.col + 8);
  if (norm(statusHeader) !== "status") {
    throw new SheetLayoutError(
      tab,
      'a "Status" column after "Ending Balance"',
      JSON.stringify(statusHeader),
    );
  }

  const schedule: LoanInstallment[] = [];

  for (let row = header.row + 1; row < grid.length; row += 1) {
    const numberRaw = cellAt(grid, row, header.col).trim();
    if (!numberRaw) {
      continue;
    }

    const number = parseInteger(numberRaw);
    if (number == null) {
      break;
    }

    const date = parseDate(cellAt(grid, row, header.col + 1));
    if (!date) {
      throw new SheetParseError(
        tab,
        `row ${row + 1}: expected a due date, found ${JSON.stringify(
          cellAt(grid, row, header.col + 1),
        )}`,
      );
    }

    const abonadoRaw = cellAt(grid, row, header.col + 9);
    let extraPayment: number | null = null;
    if (abonadoRaw.trim()) {
      extraPayment = parseNumber(abonadoRaw);
      if (extraPayment == null) {
        throw new SheetParseError(
          tab,
          `row ${row + 1}: expected an extra-payment amount, found ${JSON.stringify(
            abonadoRaw,
          )}`,
        );
      }
    }

    schedule.push({
      number,
      date,
      beginningBalance: numberAt(
        tab,
        grid,
        row,
        header.col + 2,
        "beginning balance",
      ),
      totalPayment: numberAt(tab, grid, row, header.col + 3, "installment value"),
      interest: numberAt(tab, grid, row, header.col + 4, "interest"),
      insurance: numberAt(tab, grid, row, header.col + 5, "insurance"),
      principal: numberAt(tab, grid, row, header.col + 6, "principal"),
      endingBalance: numberAt(tab, grid, row, header.col + 7, "ending balance"),
      status: parseStatus(tab, cellAt(grid, row, header.col + 8), row),
      extraPayment,
    });
  }

  if (schedule.length === 0) {
    throw new SheetLayoutError(
      tab,
      "at least one installment below the header",
      "0 rows",
    );
  }

  const last = schedule[schedule.length - 1];
  const highestNumber = schedule.reduce(
    (max, item) => (item.number > max ? item.number : max),
    schedule[0].number,
  );
  const firstInsurance =
    schedule.find((item) => item.insurance != null)?.insurance ?? null;

  const paidCount = readIntegerField(grid, "Payed");
  const remainingCount = readIntegerField(grid, "Month Left");

  const summary: LoanSummary = {
    paidCount:
      paidCount ?? schedule.filter((item) => item.status === "paid").length,
    remainingCount:
      remainingCount ??
      schedule.filter((item) => item.status === "pending").length,
    loanTotal: readNumberField(grid, "Loan Total"),
    amountPaid: readNumberField(grid, "Amount Payed"),
    interestSaved: readNumberField(grid, "Saved"),
  };

  const extras: Loan["extras"] = [];
  const disbursement = readDateField(grid, "Desembolso");
  if (disbursement) {
    extras.push({
      label: "Desembolso",
      value: formatDateHuman(disbursement),
    });
  }

  return {
    id: "jeep-loan",
    name: "Jeep Loan",
    sourceTab: tab,
    principal: null,
    annualRate: readNumberField(grid, "Interes"),
    termMonths: highestNumber,
    monthlyPayment: last.totalPayment,
    insuranceMonthly: last.insurance ?? firstInsurance,
    startDate: disbursement ?? schedule[0].date,
    summary,
    schedule,
    extras,
  };
}
