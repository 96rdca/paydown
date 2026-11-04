import { describe, expect, test } from "bun:test";
import { parseCsv } from "@/lib/sheets/csv";
import type { Grid } from "@/lib/sheets/grid";
import { SheetLayoutError } from "@/lib/sheets/errors";
import {
  columnLetter,
  isCardField,
  normalizePeriodId,
  resolveCardField,
  resolveDebtAmount,
  resolveDebtDueDate,
  resolveLoanCuotaStatus,
  resolvePeriodItem,
  resolvePeriodSalary,
  resolveUsdRate,
  toA1,
} from "./resolve";
import { InvalidTargetError, UnknownEntityError } from "./errors";

/**
 * Sheet1 as exported on 2026-11-04: blank leading row, a blank row between the
 * two quincenas, the card matrix to the right of the Q30 budget and the
 * two-copy receivables table at the bottom. Every coordinate below is derived
 * from the labels, exactly like the reader.
 */
const SHEET1_CSV = `,,,,,,,,,,
Q 15,"$3,430.22",,Tasa Dollar,$61.50,,Deudas,,,,
Sueldo,"$35,000.00",,,,,,,,,
Starlink,"$4,113.28",,,,,Apap,$946.89,"November 21, 2026",,
Luz,"$1,500.00",,,,,Credimas,"$13,350.84","February 26, 2027",,
Mas Limite APAP,$946.00,,,,,Prestamo BR,"$151,505.46","March 26, 2028",,
Jeep,"$21,500.00",,,,,,,,,
Credimas,"$3,510.50",,,,,,,,,
,,,,,,,,,,
Q 30,"$9,847.45",,,,,,,,,
Sueldo,"$29,000.00",,Banco (Corte),Santa Cruz (18) - (13),Caribe (4) - (26),Banreservas (26),BHD - Premia (18) -(12),BHD - Mi Pais (15) -(9),APAP (21),Totales
Internet,"$1,150.00",,Limite DOP,"$40,000.00","$47,000.00","$20,000.00","$40,000.00","$31,000.00","$85,000.00","$263,000.00"
Internet Cellular,"$1,030.00",,Limite USD,$300.00,$400.00,$340.00,$300.00,$300.00,,"$1,540.00"
HBO,$200.00,,Balance Corte,"$36,000.00","$33,560.53",,"$30,329.90","$15,387.61",,"$115,278.04"
Luz,"$1,500.00",,Balance Corte USD,,,,,"$82.32","$607.63",$689.95
USD Microsoft,"$522.14",,Disponible,"$4,000.00","$13,439.47","$20,000.00","$9,670.10","$15,612.39","$85,000.00","$147,721.96"
USD Netflix,"$1,050.42",,Disponible USD,$300.00,$400.00,$200.00,$340.00,"$217.68",,"$1,540.00"
Claris,"$3,000.00",,Pago Minimo,"$3,000.00",,,"$2,500.00","$2,000.00",,"$7,500.00"
Prestamo BR,"$10,700.00",,Pago Minimo USD,,,,,,,$0.00
,,,,,,,,,,
,,,,,,,,,,
,,,,,,,,,,
Razon,Deudor,Monto,Meses,Total,,Razon,Deudor,Monto,Meses,Total
Internet - Abril,Joel Casado,"$1,150.00",4,"$4,600.00",,PS 5,Amazon,"$7,995.00",2,"$15,990.00"
"Prestamo, Cumple 2024, Jarabacoa",Omar Cullen,"$41,000.00",,"$41,000.00",,TV Yohamy,Amazon,$999.99,4,"$3,999.96"`;

/** Auto Loan: summary block, then the schedule with Status at header+7. */
const AUTO_LOAN_CSV = `,,,,,,,,
,,,,,,,,
Payed,Month Left,Years Left,Loan Total,Amount Payed,Saved,,
19,5,0.4166666667,"$288,510.15","$228,403.87",$0.00,,
,,,,,,,,
,,,,,,,,
Payment Number,Payment Date,Beginining Balance,Interest Paid,Principal Paid,Total Payment,Ending Balance,Status
1,4/29/2025,"$215,000.00","$5,375.00","$6,646.26","$12,021.26","$208,353.74",Cuota Paga
2,5/29/2025,"$208,353.74","$5,208.84","$6,812.41","$12,021.26","$201,541.33",Pendiente
,,,,,,,,
,,,,,,,,""`;

/**
 * Jeep Loan: merged-cell junk in the summary ("Desembolso", "Interes",
 * "18.95%", "0.1895"), a "No.Cuota" header and Status at header+8. Cuota 60 is
 * an "Abono Capital" (extra) row.
 */
const JEEP_LOAN_CSV = `,,,,,,,,,,,,
Payed,Month Left,Years Left,Loan Total,Amount Payed,Saved,Total Payed,Desembolso,"July 27, 2024",,,
62,22,1.83,"$1,826,410.93","$848,376.86","$507,169.75","$1,319,241.18",Interes,18.95%,0.1895,,"$19,983.09"
,,,,,,,,,,,,
,,,,,,,,,,,,
No.Cuota,Fecha,Begining Balance,Valor de cuota,Intereses,Seguro,Capital,Ending Balance,Status,Abonado,,
60,"August 28, 2026","$354,867.50","$21,500.35","$5,603.95","$5,012.50","$10,883.90","$341,763.18",Abono Capital,45000,,
61,"September 28, 2026","$341,763.18","$21,500.35","$5,397.01","$5,012.50","$11,090.84","$330,672.34",Cuota Paga,,
62,"October 28, 2026","$330,672.34","$21,500.35","$5,221.87","$5,012.50","$11,265.98","$319,406.36",Pendiente,,
,,,,,,,,,,,,
,,,,,,,,,,,""`;

const sheet1: Grid = parseCsv(SHEET1_CSV);
const autoLoan: Grid = parseCsv(AUTO_LOAN_CSV);
const jeepLoan: Grid = parseCsv(JEEP_LOAN_CSV);

/** Captures the thrown value so tests can assert on the class (`bun:test`
 * typings here only know `toThrow(string)`). */
function errorOf(fn: () => unknown): unknown {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

function expectError(fn: () => unknown, type: unknown): void {
  const error = errorOf(fn);
  expect(error instanceof (type as new () => Error)).toBe(true);
}

describe("A1 helpers", () => {
  test("maps 0-based columns to sheet letters", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(1)).toBe("B");
    expect(columnLetter(7)).toBe("H");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
  });

  test("builds A1 cells", () => {
    expect(toA1(0, 0)).toBe("A1");
    expect(toA1(11, 1)).toBe("B12");
  });
});

describe("period ids", () => {
  test("accepts the URL spellings", () => {
    expect(normalizePeriodId("Q15")).toBe("Q15");
    expect(normalizePeriodId("q 15")).toBe("Q15");
    expect(normalizePeriodId(" Q 30 ")).toBe("Q30");
  });

  test("rejects anything else", () => {
    expectError(() => normalizePeriodId("Q45"), InvalidTargetError);
  });
});

describe("resolvePeriodSalary", () => {
  test("Q15 salary sits in column B of the first Sueldo row", () => {
    const cell = resolvePeriodSalary(sheet1, "Q15");
    expect(cell.tab).toBe("Sheet1");
    expect(cell.a1).toBe("B3");
    expect(cell.current).toBe(35000);
  });

  test("Q30 salary is found below its own 'Q 30' anchor", () => {
    const cell = resolvePeriodSalary(sheet1, "q 30");
    expect(cell.a1).toBe("B11");
    expect(cell.current).toBe(29000);
  });
});

describe("resolvePeriodItem", () => {
  test("resolves Q15 items by label slug inside the block", () => {
    expect(resolvePeriodItem(sheet1, "Q15", "q15-starlink").a1).toBe("B4");
    expect(resolvePeriodItem(sheet1, "Q15", "q15-credimas").current).toBe(
      3510.5,
    );
    expect(resolvePeriodItem(sheet1, "Q15", "q15-mas-limite-apap").a1).toBe(
      "B6",
    );
  });

  test("resolves Q30 items, including USD-billed ones", () => {
    const netflix = resolvePeriodItem(sheet1, "Q30", "q30-usd-netflix");
    expect(netflix.a1).toBe("B17");
    expect(netflix.current).toBe(1050.42);
    expect(resolvePeriodItem(sheet1, "Q30", "q30-prestamo-br").a1).toBe("B19");
  });

  test("does not confuse a Q15 item with a same-named Q30 row", () => {
    // "Luz" exists in both quincenas; each id resolves inside its own block.
    expect(resolvePeriodItem(sheet1, "Q15", "q15-luz").a1).toBe("B5");
    expect(resolvePeriodItem(sheet1, "Q30", "q30-luz").a1).toBe("B15");
  });

  test("rejects an id from the other period", () => {
    expectError(
      () => resolvePeriodItem(sheet1, "Q15", "q30-internet"),
      UnknownEntityError,
    );
  });

  test("rejects unknown items", () => {
    expectError(
      () => resolvePeriodItem(sheet1, "Q15", "q15-nope"),
      UnknownEntityError,
    );
  });
});

describe("resolveCardField", () => {
  test("resolves the card column from the header row, not a fixed offset", () => {
    const cell = resolveCardField(
      sheet1,
      "bhd-mi-pais",
      "statementBalanceUsd",
    );
    // "BHD - Mi Pais" is the 5th header (column I); "Balance Corte USD" row 15.
    expect(cell.a1).toBe("I15");
    expect(cell.current).toBe(82.32);
  });

  test("maps every card field label", () => {
    expect(resolveCardField(sheet1, "santa-cruz", "limitDop").a1).toBe("E12");
    expect(resolveCardField(sheet1, "santa-cruz", "limitUsd").a1).toBe("E13");
    expect(resolveCardField(sheet1, "santa-cruz", "statementBalanceDop").a1).toBe(
      "E14",
    );
    expect(resolveCardField(sheet1, "santa-cruz", "availableDop").a1).toBe(
      "E16",
    );
    expect(resolveCardField(sheet1, "santa-cruz", "availableUsd").a1).toBe(
      "E17",
    );
    expect(resolveCardField(sheet1, "santa-cruz", "minPaymentDop").a1).toBe(
      "E18",
    );
    expect(resolveCardField(sheet1, "santa-cruz", "minPaymentUsd").a1).toBe(
      "E19",
    );
  });

  test("resolves APAP's USD balance in column J", () => {
    const cell = resolveCardField(sheet1, "apap", "statementBalanceUsd");
    expect(cell.a1).toBe("J15");
    expect(cell.current).toBe(607.63);
  });

  test("returns an empty current value for a blank cell", () => {
    const cell = resolveCardField(sheet1, "apap", "limitUsd");
    expect(cell.a1).toBe("J13");
    expect(cell.current).toBeNull();
    expect(cell.currentRaw.trim()).toBe("");
  });

  test("rejects unknown cards and fields", () => {
    expectError(
      () => resolveCardField(sheet1, "nope", "limitDop"),
      UnknownEntityError,
    );
    expectError(
      () => resolveCardField(sheet1, "apap", "interestRate"),
      InvalidTargetError,
    );
  });

  test("recognizes the API's card field names", () => {
    expect(isCardField("minPaymentUsd")).toBe(true);
    expect(isCardField("monthlyRate")).toBe(false);
  });
});

describe("resolveUsdRate", () => {
  test("uses the cell right of the Tasa Dollar label", () => {
    const cell = resolveUsdRate(sheet1);
    expect(cell.a1).toBe("E2");
    expect(cell.current).toBe(61.5);
  });

  test("fails loudly when the label is gone", () => {
    expectError(() => resolveUsdRate([["Q 15", "1"]]), SheetLayoutError);
  });
});

describe("resolveLoanCuotaStatus", () => {
  test("Auto Loan: Status is header column + 7", () => {
    const first = resolveLoanCuotaStatus(autoLoan, "auto-loan", 1);
    expect(first.tab).toBe("Auto Loan");
    expect(first.a1).toBe("H8");
    expect(first.current).toBe("Cuota Paga");

    const second = resolveLoanCuotaStatus(autoLoan, "auto-loan", 2);
    expect(second.a1).toBe("H9");
    expect(second.current).toBe("Pendiente");
  });

  test("Jeep Loan: Status is header column + 8 despite summary junk", () => {
    const paid = resolveLoanCuotaStatus(jeepLoan, "jeep-loan", 61);
    expect(paid.tab).toBe("Jeep Loan");
    expect(paid.a1).toBe("I8");
    expect(paid.current).toBe("Cuota Paga");

    const extra = resolveLoanCuotaStatus(jeepLoan, "jeep-loan", 60);
    expect(extra.a1).toBe("I7");
    expect(extra.current).toBe("Abono Capital");
  });

  test("rejects unknown cuotas, loans without a schedule and bad numbers", () => {
    expectError(
      () => resolveLoanCuotaStatus(jeepLoan, "jeep-loan", 999),
      UnknownEntityError,
    );
    expectError(
      () => resolveLoanCuotaStatus(sheet1, "credimas", 1),
      UnknownEntityError,
    );
    expectError(
      () => resolveLoanCuotaStatus(autoLoan, "auto-loan", 0),
      InvalidTargetError,
    );
    expectError(
      () => resolveLoanCuotaStatus(autoLoan, "auto-loan", 1.5),
      InvalidTargetError,
    );
  });

  test("fails loudly if the schedule header moved", () => {
    expectError(
      () =>
        resolveLoanCuotaStatus(
          [["No.Cuota", "Fecha", "Status"]],
          "jeep-loan",
          1,
        ),
      SheetLayoutError,
    );
  });
});

describe("dated debts", () => {
  test("amount lives at label column + 1 and date at + 2", () => {
    const amount = resolveDebtAmount(sheet1, "apap");
    expect(amount.a1).toBe("H4");
    expect(amount.current).toBe(946.89);

    const due = resolveDebtDueDate(sheet1, "apap");
    expect(due.a1).toBe("I4");
    expect(due.current).toBe("2026-11-21");
  });

  test("follows the block when its labels move", () => {
    expect(resolveDebtAmount(sheet1, "prestamo-br").a1).toBe("H6");
    expect(resolveDebtDueDate(sheet1, "prestamo-br").current).toBe(
      "2028-03-26",
    );
  });

  test("rejects unknown debts", () => {
    expectError(() => resolveDebtAmount(sheet1, "nope"), UnknownEntityError);
  });
});
