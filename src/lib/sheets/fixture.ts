import type {
  CardAccount,
  CardTotals,
  DatedDebt,
  Loan,
  LoanInstallment,
  PayPeriod,
  Receivable,
  SavingsWeek,
  Snapshot,
} from "@/lib/types";

/**
 * Fixture snapshot encoding the real contents of the "Payments" sheet as
 * read on 2026-11-03. Used by the UI while the live Sheets reader is being
 * built, and afterwards as a deterministic stand-in for tests and offline
 * development. Do not edit casually — it mirrors real sheet data.
 *
 * Layout facts encoded here (verified against the sheet's own totals):
 * - Budget rows are DOP amounts, even "USD …" labeled ones (converted).
 * - USD card balances: BHD Mi Pais 82.32 and APAP 607.63 (not Premia —
 *   confirmed by Disponible USD: 300 − 217.68 = 82.32 on Mi Pais).
 */

type Row = [
  number, // cuota number
  string, // ISO date
  number, // beginning balance
  number, // interest
  number, // principal
  number, // total payment
  number, // ending balance
  LoanInstallment["status"],
  number | null, // extra payment (abonado)
];

function installment(
  row: Row,
  insurance: number | null,
): LoanInstallment {
  return {
    number: row[0],
    date: row[1],
    beginningBalance: row[2],
    interest: row[3],
    principal: row[4],
    insurance,
    totalPayment: row[5],
    endingBalance: row[6],
    status: row[7],
    extraPayment: row[8],
  };
}

const q15: PayPeriod = {
  id: "Q15",
  label: "Q 15",
  salary: 35000,
  items: [
    { id: "q15-starlink", label: "Starlink", amountDop: 4113.28, isUsdBilled: false },
    { id: "q15-luz", label: "Luz", amountDop: 1500, isUsdBilled: false },
    { id: "q15-mas-limite-apap", label: "Mas Limite APAP", amountDop: 900, isUsdBilled: false },
    { id: "q15-jeep", label: "Jeep", amountDop: 21500, isUsdBilled: false },
    { id: "q15-credimas", label: "Credimas", amountDop: 3510.5, isUsdBilled: false },
  ],
  surplusDop: 3476.22,
};

const q30: PayPeriod = {
  id: "Q30",
  label: "Q 30",
  salary: 29000,
  items: [
    { id: "q30-internet", label: "Internet", amountDop: 1150, isUsdBilled: false },
    { id: "q30-internet-cellular", label: "Internet Cellular", amountDop: 1030, isUsdBilled: false },
    { id: "q30-hbo", label: "HBO", amountDop: 200, isUsdBilled: false },
    { id: "q30-luz", label: "Luz", amountDop: 1500, isUsdBilled: false },
    { id: "q30-usd-microsoft", label: "USD Microsoft", amountDop: 513.65, isUsdBilled: true },
    { id: "q30-usd-netflix", label: "USD Netflix", amountDop: 1033.34, isUsdBilled: true },
    { id: "q30-claris", label: "Claris", amountDop: 3000, isUsdBilled: false },
    { id: "q30-prestamo-br", label: "Prestamo BR", amountDop: 10700, isUsdBilled: false },
  ],
  surplusDop: 9873.01,
};

const datedDebts: DatedDebt[] = [
  { id: "apap", label: "Apap", amountDop: 2700, dueDate: "2026-12-21" },
  { id: "credimas", label: "Credimas", amountDop: 16790, dueDate: "2027-02-26" },
  { id: "prestamo-br", label: "Prestamo BR", amountDop: 159070.21, dueDate: "2028-03-26" },
];

const cards: CardAccount[] = [
  {
    id: "santa-cruz",
    bank: "Santa Cruz",
    closingDay: 18,
    dueDay: 13,
    limitDop: 40000,
    limitUsd: 300,
    statementBalanceDop: 36000,
    statementBalanceUsd: null,
    availableDop: 4000,
    availableUsd: 300,
    minPaymentDop: null,
    minPaymentUsd: null,
    monthlyRate: null,
  },
  {
    id: "caribe",
    bank: "Caribe",
    closingDay: 4,
    dueDay: 26,
    limitDop: 47000,
    limitUsd: 400,
    statementBalanceDop: 33560.53,
    statementBalanceUsd: null,
    availableDop: 13439.47,
    availableUsd: 400,
    minPaymentDop: null,
    minPaymentUsd: null,
    monthlyRate: null,
  },
  {
    id: "banreservas",
    bank: "Banreservas",
    closingDay: 26,
    dueDay: null,
    limitDop: 20000,
    limitUsd: 200,
    statementBalanceDop: null,
    statementBalanceUsd: null,
    availableDop: 20000,
    availableUsd: 200,
    minPaymentDop: null,
    minPaymentUsd: null,
    monthlyRate: null,
  },
  {
    id: "bhd-premia",
    bank: "BHD Premia",
    closingDay: 18,
    dueDay: 12,
    limitDop: 40000,
    limitUsd: 340,
    statementBalanceDop: 30463.17,
    statementBalanceUsd: null,
    availableDop: 9536.83,
    availableUsd: 340,
    minPaymentDop: null,
    minPaymentUsd: null,
    monthlyRate: null,
  },
  {
    id: "bhd-mi-pais",
    bank: "BHD Mi Pais",
    closingDay: 15,
    dueDay: 9,
    limitDop: 31000,
    limitUsd: 300,
    statementBalanceDop: 15387.61,
    statementBalanceUsd: 82.32,
    availableDop: 15612.39,
    availableUsd: 217.68,
    minPaymentDop: 2000,
    minPaymentUsd: 10,
    monthlyRate: null,
  },
  {
    id: "apap",
    bank: "APAP",
    closingDay: 21,
    dueDay: null,
    limitDop: 85000,
    limitUsd: null,
    statementBalanceDop: null,
    statementBalanceUsd: 607.63,
    availableDop: 85000,
    availableUsd: null,
    minPaymentDop: null,
    minPaymentUsd: null,
    monthlyRate: null,
  },
];

const cardTotals: CardTotals = {
  limitDop: 263000,
  limitUsd: 1540,
  statementBalanceDop: 115411.31,
  statementBalanceUsd: 689.95,
  availableDop: 147588.69,
  availableUsd: 1457.68,
  minPaymentDop: 2000,
  minPaymentUsd: 10,
};

const receivables: Receivable[] = [
  { id: "internet-abril", reason: "Internet - Abril", debtor: "Joel Casado", monthlyAmount: 1150, months: 4, total: 4600 },
  { id: "prestamo-cumple-2024", reason: "Prestamo, Cumple 2024, Jarabacoa", debtor: "Omar Cullen", monthlyAmount: 41000, months: null, total: 41000 },
  { id: "tv-yohamy", reason: "TV Yohamy", debtor: "Wilmys Gomera", monthlyAmount: 983.73, months: 2, total: 1967.46 },
  { id: "concierto-chayanne", reason: "Concierto Chayanne", debtor: "Yohamy", monthlyAmount: 3000, months: null, total: 3000 },
  { id: "ps5", reason: "PS 5", debtor: "Amazon", monthlyAmount: 7865, months: 2, total: 15730 },
  { id: "tv-yohamy-amazon", reason: "TV Yohamy", debtor: "Amazon", monthlyAmount: 983.73, months: 4, total: 3934.92 },
];

const autoSchedule: LoanInstallment[] = (
  [
    [1, "2025-04-29", 215000.0, 5375.0, 6646.26, 12021.26, 208353.74, "paid", null],
    [2, "2025-05-29", 208353.74, 5208.84, 6812.41, 12021.26, 201541.33, "paid", null],
    [3, "2025-06-28", 201541.33, 5038.53, 6982.72, 12021.26, 194558.61, "paid", null],
    [4, "2025-07-28", 194558.61, 4863.97, 7157.29, 12021.26, 187401.32, "paid", null],
    [5, "2025-08-27", 187401.32, 4685.03, 7336.22, 12021.26, 180065.09, "paid", null],
    [6, "2025-09-26", 180065.09, 4501.63, 7519.63, 12021.26, 172545.46, "paid", null],
    [7, "2025-10-26", 172545.46, 4313.64, 7707.62, 12021.26, 164837.84, "paid", null],
    [8, "2025-11-25", 164837.84, 4120.95, 7900.31, 12021.26, 156937.53, "paid", null],
    [9, "2025-12-25", 156937.53, 3923.44, 8097.82, 12021.26, 148839.72, "paid", null],
    [10, "2026-01-24", 148839.72, 3720.99, 8300.26, 12021.26, 140539.45, "paid", null],
    [11, "2026-02-23", 140539.45, 3513.49, 8507.77, 12021.26, 132031.68, "paid", null],
    [12, "2026-03-25", 132031.68, 3300.79, 8720.46, 12021.26, 123311.22, "paid", null],
    [13, "2026-04-24", 123311.22, 3082.78, 8938.48, 12021.26, 114372.74, "paid", null],
    [14, "2026-05-24", 114372.74, 2859.32, 9161.94, 12021.26, 105210.8, "paid", null],
    [15, "2026-06-23", 105210.8, 2630.27, 9390.99, 12021.26, 95819.82, "paid", null],
    [16, "2026-07-23", 95819.82, 2395.5, 9625.76, 12021.26, 86194.06, "paid", null],
    [17, "2026-08-22", 86194.06, 2154.85, 9866.4, 12021.26, 76327.65, "paid", null],
    [18, "2026-09-21", 76327.65, 1908.19, 10113.07, 12021.26, 66214.59, "paid", null],
    [19, "2026-10-21", 66214.59, 1655.36, 10365.89, 12021.26, 55848.7, "pending", null],
    [20, "2026-11-20", 55848.7, 1396.22, 10625.04, 12021.26, 45223.66, "pending", null],
    [21, "2026-12-20", 45223.66, 1130.59, 10890.66, 12021.26, 34332.99, "pending", null],
    [22, "2027-01-19", 34332.99, 858.32, 11162.93, 12021.26, 23170.06, "pending", null],
    [23, "2027-02-18", 23170.06, 579.25, 11442.0, 12021.26, 11728.06, "pending", null],
    [24, "2027-03-20", 11728.06, 293.2, 11728.06, 12021.26, 0, "pending", null],
  ] as Row[]
).map((row) => installment(row, null));

const jeepSchedule: LoanInstallment[] = (
  [
    [60, "2026-08-28", 354867.5, 5603.95, 10883.9, 21500.35, 341763.18, "extra", 45000],
    [61, "2026-09-28", 341763.18, 5397.01, 11090.84, 21500.35, 330672.34, "paid", null],
    [62, "2026-10-28", 330672.34, 5221.87, 11265.98, 21500.35, 319406.36, "pending", null],
    [63, "2026-11-28", 319406.36, 5043.96, 11443.89, 21500.35, 307962.47, "pending", null],
    [64, "2026-12-28", 307962.47, 4863.24, 11624.61, 21500.35, 296337.86, "pending", null],
    [65, "2027-01-28", 296337.86, 4679.67, 11808.18, 21500.35, 284529.68, "pending", null],
    [66, "2027-02-28", 284529.68, 4493.2, 11994.65, 21500.35, 272535.02, "pending", null],
    [67, "2027-03-28", 272535.02, 4303.78, 12184.07, 21500.35, 260350.96, "pending", null],
    [68, "2027-04-28", 260350.96, 4111.38, 12376.47, 21500.35, 247974.48, "pending", null],
    [69, "2027-05-28", 247974.48, 3915.93, 12571.92, 21500.35, 235402.56, "pending", null],
    [70, "2027-06-28", 235402.56, 3717.4, 12770.45, 21500.35, 222632.11, "pending", null],
    [71, "2027-07-28", 222632.11, 3515.73, 12972.12, 21500.35, 209659.99, "pending", null],
    [72, "2027-08-28", 209659.99, 3310.88, 13176.97, 21500.35, 196483.02, "pending", null],
    [73, "2027-09-28", 196483.02, 3102.79, 13385.06, 21500.35, 183097.97, "pending", null],
    [74, "2027-10-28", 183097.97, 2891.42, 13596.43, 21500.35, 169501.54, "pending", null],
    [75, "2027-11-28", 169501.54, 2676.71, 13811.14, 21500.35, 155690.4, "pending", null],
    [76, "2027-12-28", 155690.4, 2458.61, 14029.24, 21500.35, 141661.16, "pending", null],
    [77, "2028-01-28", 141661.16, 2237.07, 14250.78, 21500.35, 127410.38, "pending", null],
    [78, "2028-02-28", 127410.38, 2012.02, 14475.83, 21500.35, 112934.55, "pending", null],
    [79, "2028-03-28", 112934.55, 1783.42, 14704.43, 21500.35, 98230.13, "pending", null],
    [80, "2028-04-28", 98230.13, 1551.22, 14936.63, 21500.35, 83293.49, "pending", null],
    [81, "2028-05-28", 83293.49, 1315.34, 15172.51, 21500.35, 68120.99, "pending", null],
    [82, "2028-06-28", 68120.99, 1075.74, 15412.11, 21500.35, 52708.88, "pending", null],
    [83, "2028-07-28", 52708.88, 832.36, 15655.49, 21500.35, 37053.39, "pending", null],
    [84, "2028-08-28", 37053.39, 585.13, 15902.72, 21500.35, 21150.68, "pending", null],
    [85, "2028-09-28", 21150.68, 334.0, 16153.85, 21500.35, 4996.83, "pending", null],
    [86, "2028-10-28", 4996.83, 78.91, 16408.94, 21500.35, -11412.11, "pending", null],
  ] as Row[]
).map((row) => installment(row, 5012.5));

const loans: Loan[] = [
  {
    id: "credimas",
    name: "Credimas",
    sourceTab: "Credimas",
    principal: 20000,
    annualRate: 0.18,
    termMonths: 6,
    monthlyPayment: 3510.5,
    insuranceMonthly: null,
    startDate: null,
    summary: {
      paidCount: null,
      remainingCount: null,
      loanTotal: 22563.03,
      amountPaid: null,
      interestSaved: null,
    },
    schedule: [],
    extras: [
      { label: "Pago inicial", value: "RD$5,010.50" },
      { label: "Avance", value: "RD$20,000.00 al 6.25%" },
      { label: "Comisión de avance", value: "RD$1,250.00" },
      { label: "Intereses", value: "RD$2,563.03" },
    ],
  },
  {
    id: "auto-loan",
    name: "Auto Loan",
    sourceTab: "Auto Loan",
    principal: 215000,
    annualRate: 0.3,
    termMonths: 24,
    monthlyPayment: 12021.26,
    insuranceMonthly: null,
    startDate: "2025-04-29",
    summary: {
      paidCount: 18,
      remainingCount: 6,
      loanTotal: 288510.15,
      amountPaid: 216382.61,
      interestSaved: 0,
    },
    schedule: autoSchedule,
    extras: [],
  },
  {
    id: "jeep-loan",
    name: "Jeep Loan",
    sourceTab: "Jeep Loan",
    principal: null,
    annualRate: 0.1895,
    termMonths: 86,
    monthlyPayment: 21500.35,
    insuranceMonthly: 5012.5,
    startDate: "2024-07-27",
    summary: {
      paidCount: 61,
      remainingCount: 23,
      loanTotal: 1826410.93,
      amountPaid: 826876.51,
      interestSaved: 507169.75,
    },
    schedule: jeepSchedule,
    extras: [{ label: "Desembolso", value: "27 Jul 2024" }],
  },
];

/** 52-week challenge: deposit = week × 100, weekly Mondays from 2024-03-04. */
const savingsWeeks: SavingsWeek[] = Array.from({ length: 52 }, (_, i) => {
  const week = i + 1;
  const date = new Date(Date.UTC(2024, 2, 4 + i * 7));
  return {
    week,
    date: date.toISOString().slice(0, 10),
    deposit: week * 100,
    cumulative: ((week * (week + 1)) / 2) * 100,
  };
});

export function fixtureSnapshot(): Snapshot {
  return {
    fetchedAt: new Date().toISOString(),
    settings: { usdRate: 60.5 },
    periods: [q15, q30],
    datedDebts,
    cards,
    cardTotals,
    receivables,
    loans,
    savings: {
      name: "Ahorro 100",
      weeks: savingsWeeks,
      target: 137800,
      current: savingsWeeks[savingsWeeks.length - 1].cumulative,
    },
  };
}
