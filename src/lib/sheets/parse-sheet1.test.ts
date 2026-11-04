import { describe, expect, test } from "bun:test";
import { parseCsv } from "./csv";
import { parseSheet1 } from "./parse-sheet1";

/**
 * Values lifted from fixture.ts (the real sheet as captured 2026-11-03).
 * Kept as CSV text so the test exercises the parser end-to-end, including
 * quoted commas in "Prestamo, Cumple 2024, Jarabacoa".
 */
const SHEET1_CSV = `"Q 15","$3,476.22","","Tasa Dollar","$60.50","","Deudas","","","",""
"Sueldo","$35,000.00","","","","","","","","",""
"Starlink","$4,113.28","","","","","Apap","$2,700.00","December 21, 2026","",""
"Luz","$1,500.00","","","","","Credimas","$16,790.00","February 26, 2027","",""
"Mas Limite APAP","$900.00","","","","","Prestamo BR","$159,070.21","March 26, 2028","",""
"Jeep","$21,500.00","","","","","","","","",""
"Credimas","$3,510.50","","","","","","","","",""
"Q 30","$9,873.02","","","","","","","","",""
"Sueldo","$29,000.00","","Banco (Corte)","Santa Cruz (18) - (13)","Caribe (4) - (26)","Banreservas (26)","BHD - Premia (18) -(12)","BHD - Mi Pais (15) -(9)","APAP (21)","Totales"
"Internet","$1,150.00","","Limite DOP","$40,000.00","$47,000.00","$20,000.00","$40,000.00","$31,000.00","$85,000.00","$263,000.00"
"Internet Cellular","$1,030.00","","Limite USD","$300.00","$400.00","$200.00","$340.00","$300.00","","$1,540.00"
"HBO","$200.00","","Balance Corte","$36,000.00","$33,560.53","","$30,463.17","$15,387.61","","$115,411.31"
"Luz","$1,500.00","","Balance Corte USD","","","","","$82.32","$607.63","$689.95"
"USD Microsoft","$513.65","","Disponible","$4,000.00","$13,439.47","$20,000.00","$9,536.83","$15,612.39","$85,000.00","$147,588.69"
"USD Netflix","$1,033.34","","Disponible USD","$300.00","$400.00","$200.00","$340.00","$217.68","","$1,457.68"
"Claris","$3,000.00","","Pago Minimo","","","","","$2,000.00","","$2,000.00"
"Prestamo BR","$10,700.00","","Pago Minimo USD","","","","","$10.00","","$10.00"
"Razon","Deudor","Monto","Meses","Total","","Razon","Deudor","Monto","Meses","Total"
"Internet - Abril","Joel Casado","$1,150.00","4","$4,600.00","","PS 5","Amazon","$7,865.00","2","$15,730.00"
"Prestamo, Cumple 2024, Jarabacoa","Omar Cullen","$41,000.00","","$41,000.00","","TV Yohamy","Amazon","$983.73","4","$3,934.92"
"TV Yohamy","Wilmys Gomera","$983.73","2","$1,967.46","","","","","",""
"Concierto Chayanne","Yohamy","$3,000.00","","$3,000.00","","","","","",""`;

const data = parseSheet1(parseCsv(SHEET1_CSV));

function findCard(id: string) {
  const card = data.cards.find((candidate) => candidate.id === id);
  if (!card) {
    throw new Error(`Expected card "${id}" in the parsed snapshot`);
  }
  return card;
}

describe("parseSheet1", () => {
  test("reads the exchange rate and both quincenas", () => {
    expect(data.usdRate).toBe(60.5);
    expect(data.periods).toHaveLength(2);

    const [q15, q30] = data.periods;
    expect(q15.label).toBe("Q 15");
    expect(q15.salary).toBe(35000);
    expect(q15.items).toHaveLength(5);
    expect(q15.surplusDop).toBe(3476.22);

    expect(q30.label).toBe("Q 30");
    expect(q30.salary).toBe(29000);
    expect(q30.items).toHaveLength(8);
    expect(q30.surplusDop).toBe(9873.01);

    const netflix = q30.items.find((item) => item.label === "USD Netflix");
    expect(netflix?.isUsdBilled).toBe(true);
    expect(netflix?.amountDop).toBe(1033.34);

    const claris = q30.items.find((item) => item.label === "Claris");
    expect(claris?.isUsdBilled).toBe(false);
  });

  test("reads the dated debts block", () => {
    expect(data.datedDebts).toEqual([
      { id: "apap", label: "Apap", amountDop: 2700, dueDate: "2026-12-21" },
      {
        id: "credimas",
        label: "Credimas",
        amountDop: 16790,
        dueDate: "2027-02-26",
      },
      {
        id: "prestamo-br",
        label: "Prestamo BR",
        amountDop: 159070.21,
        dueDate: "2028-03-26",
      },
    ]);
  });

  test("maps the card matrix by grid column, not by assumption", () => {
    expect(data.cards).toHaveLength(6);

    const santaCruz = findCard("santa-cruz");
    expect(santaCruz.bank).toBe("Santa Cruz");
    expect(santaCruz.closingDay).toBe(18);
    expect(santaCruz.dueDay).toBe(13);
    expect(santaCruz.limitDop).toBe(40000);
    expect(santaCruz.statementBalanceDop).toBe(36000);
    expect(santaCruz.minPaymentDop).toBeNull();

    const miPais = findCard("bhd-mi-pais");
    expect(miPais.bank).toBe("BHD Mi Pais");
    expect(miPais.statementBalanceUsd).toBe(82.32);
    expect(miPais.availableUsd).toBe(217.68);
    expect(miPais.minPaymentUsd).toBe(10);

    const apap = findCard("apap");
    expect(apap.closingDay).toBe(21);
    expect(apap.dueDay).toBeNull();
    expect(apap.statementBalanceUsd).toBe(607.63);

    expect(data.cardTotals).toEqual({
      limitDop: 263000,
      limitUsd: 1540,
      statementBalanceDop: 115411.31,
      statementBalanceUsd: 689.95,
      availableDop: 147588.69,
      availableUsd: 1457.68,
      minPaymentDop: 2000,
      minPaymentUsd: 10,
    });
  });

  test("reads both receivable tables", () => {
    expect(data.receivables).toHaveLength(6);

    const birthdayLoan = data.receivables.find((receivable) =>
      receivable.reason.startsWith("Prestamo, Cumple"),
    );
    expect(birthdayLoan?.months).toBeNull();
    expect(birthdayLoan?.total).toBe(41000);

    const tvYohamy = data.receivables.filter(
      (receivable) => receivable.reason === "TV Yohamy",
    );
    expect(tvYohamy).toHaveLength(2);
    expect(tvYohamy[0].debtor).toBe("Wilmys Gomera");
    expect(tvYohamy[0].total).toBe(1967.46);
    expect(tvYohamy[1].debtor).toBe("Amazon");
    expect(tvYohamy[0].id).not.toBe(tvYohamy[1].id);

    expect(data.receivables.every((receivable) => receivable.total > 0)).toBe(
      true,
    );
  });
});
