/**
 * Domain model for the "Payments" Google Sheet snapshot.
 *
 * This file is the shared contract between the data layer (src/lib/sheets)
 * and the UI (src/app, src/components). Do not modify unilaterally —
 * propose changes through the orchestrator instead.
 *
 * Conventions:
 * - Monetary values are plain numbers in their currency of record.
 * - DOP is the base currency; USD amounts convert via Settings.usdRate.
 * - Dates are ISO strings (yyyy-mm-dd).
 */

export type QuincenaId = "Q15" | "Q30";

export interface Settings {
  /** DOP per USD — "Tasa Dollar" on Sheet1. */
  usdRate: number;
}

/** One expense/commitment row in a quincena block (Sheet1, cols A/B). */
export interface BudgetItem {
  id: string;
  label: string;
  /**
   * Amount in DOP. Rows for USD-billed services (label starts with "USD")
   * are stored already converted to DOP by the sheet's owner.
   */
  amountDop: number;
  /** True when the underlying service is billed in USD. */
  isUsdBilled: boolean;
}

/** A "Q 15" / "Q 30" biweekly block on Sheet1. */
export interface PayPeriod {
  id: QuincenaId;
  /** As printed on the sheet, e.g. "Q 15". */
  label: string;
  /** Salary (Sueldo) in DOP. */
  salary: number;
  items: BudgetItem[];
  /** salary − sum(items.amountDop), in DOP. */
  surplusDop: number;
}

/** Sheet1 "Deudas" block — a named debt with a payoff target date. */
export interface DatedDebt {
  id: string;
  label: string;
  amountDop: number;
  dueDate: string;
}

export interface CardAccount {
  id: string;
  /** Full card label without the day numbers: "Santa Cruz", "BHD Premia", "APAP"... */
  bank: string;
  /** Day of month the statement closes (corte); null if unknown. */
  closingDay: number | null;
  /** Day of month the payment is due; null if unknown. */
  dueDay: number | null;
  limitDop: number | null;
  limitUsd: number | null;
  /** Statement balance ("Balance Corte"). */
  statementBalanceDop: number | null;
  statementBalanceUsd: number | null;
  availableDop: number | null;
  availableUsd: number | null;
  minPaymentDop: number | null;
  minPaymentUsd: number | null;
  /**
   * Monthly interest rate as a fraction (e.g. 0.025). Configured in a
   * later phase; null until then.
   */
  monthlyRate: number | null;
}

/** Totals row ("Totales") of the card matrix. */
export interface CardTotals {
  limitDop: number;
  limitUsd: number;
  statementBalanceDop: number;
  statementBalanceUsd: number;
  availableDop: number;
  availableUsd: number;
  minPaymentDop: number;
  minPaymentUsd: number;
}

/**
 * Sheet1 bottom table — money owed TO the sheet's owner (receivable).
 * Two side-by-side copies exist on the sheet; both parse into this list.
 */
export interface Receivable {
  id: string;
  /** Why the money is owed: "Internet - Abril", "PS 5"... */
  reason: string;
  /** Who owes it: "Joel Casado", "Amazon"... */
  debtor: string;
  /** Monthly amount ("Monto"). */
  monthlyAmount: number;
  /** Number of monthly installments; null = one-off. */
  months: number | null;
  /** Full obligation ("Total"); equals monthlyAmount when months is null. */
  total: number;
}

export type InstallmentStatus = "paid" | "pending" | "extra";

export interface LoanInstallment {
  number: number;
  date: string;
  beginningBalance: number;
  interest: number;
  principal: number;
  /** Monthly insurance (Jeep loan "Seguro"); null when the loan has none. */
  insurance: number | null;
  totalPayment: number;
  endingBalance: number;
  status: InstallmentStatus;
  /** Extra principal applied that period ("Abonado"); usually null. */
  extraPayment: number | null;
}

export interface LoanSummary {
  paidCount: number | null;
  remainingCount: number | null;
  /** Total cost of the loan as tracked on the sheet; null if absent. */
  loanTotal: number | null;
  amountPaid: number | null;
  /** Interest saved via extra payments ("Saved"); null if not tracked. */
  interestSaved: number | null;
}

export interface Loan {
  id: string;
  /** Display name: "Credimas", "Auto Loan", "Jeep"... */
  name: string;
  /** Source tab name in the spreadsheet. */
  sourceTab: string;
  principal: number | null;
  /** Annual rate as a fraction (0.1895); null when not stated. */
  annualRate: number | null;
  termMonths: number | null;
  monthlyPayment: number | null;
  insuranceMonthly: number | null;
  /** First disbursement date; null if unknown. */
  startDate: string | null;
  summary: LoanSummary;
  /** May be partial: some sheets only keep the remaining cuotas. */
  schedule: LoanInstallment[];
  /** Extra sheet-specific facts worth showing (e.g. Credimas avance). */
  extras: { label: string; value: string }[];
}

/** "Ahorro 100" — the 52-week savings challenge tab. */
export interface SavingsWeek {
  week: number;
  date: string;
  deposit: number;
  cumulative: number;
}

export interface SavingsPlan {
  name: string;
  weeks: SavingsWeek[];
  /** Final cumulative total (week 52). */
  target: number;
  /** Cumulative through the latest week on the sheet. */
  current: number;
}

export interface Snapshot {
  /** ISO timestamp of the moment the data was read. */
  fetchedAt: string;
  settings: Settings;
  periods: PayPeriod[];
  datedDebts: DatedDebt[];
  cards: CardAccount[];
  cardTotals: CardTotals;
  receivables: Receivable[];
  loans: Loan[];
  savings: SavingsPlan | null;
}

/* ────────────────────────────────────────────────────────────────────────
 * App-owned overlay (stored locally by the app — NOT in the Google Sheet).
 * The sheet stays the read-only source of truth for base data; rates,
 * payment logs and abonos live here until Phase 2 moves them into an
 * app-owned sheet tab.
 * ──────────────────────────────────────────────────────────────────────── */

export interface CardOverlayConfig {
  /** Monthly interest rate as a fraction (e.g. 0.0255 = 2.55 %/mes). */
  monthlyRate: number | null;
}

export interface CardPayment {
  id: string;
  cardId: string;
  /** ISO date the payment was made. */
  date: string;
  amountDop: number;
  amountUsd: number | null;
  note: string | null;
}

export interface LoanAbono {
  id: string;
  loanId: string;
  /** ISO date the extra payment was applied. */
  date: string;
  amount: number;
  note: string | null;
}

export interface Overlay {
  /** Overlay file format version. */
  version: 1;
  /** Keyed by CardAccount.id. */
  cards: Record<string, CardOverlayConfig>;
  cardPayments: CardPayment[];
  loanAbonos: LoanAbono[];
}

/* ── Projections (always computed, never stored) ── */

export interface MinPayoff {
  months: number;
  totalInterest: number;
  totalPaid: number;
  /** ISO date of the final payment. */
  endDate: string;
}

export interface CardProjection {
  /** One month of interest on the current statement balance, DOP-combined. */
  monthlyInterestDop: number;
  /** Pay this now (DOP-combined) to zero the card without interest. */
  payoffNowDop: number;
  /** Simulation paying only the minimum each month. */
  minPayoff: MinPayoff | null;
  /** Human-readable reason when minPayoff cannot be computed. */
  minPayoffBlockedReason: string | null;
}

export interface ProjectionTotals {
  months: number;
  totalInterest: number;
  /** ISO date of the final payment. */
  endDate: string;
}

export interface LoanProjection {
  /** Remaining cost if nothing extra is ever paid (from current state). */
  baseline: ProjectionTotals;
  /** Remaining cost with every persisted abono applied at its date. */
  withAbonos: ProjectionTotals;
  interestSaved: number;
  monthsSaved: number;
  /** Regenerated remaining schedule with abonos applied. */
  projectedSchedule: LoanInstallment[];
}

export interface AugmentedCard extends CardAccount {
  payments: CardPayment[];
  /** Null until a monthly rate is configured in the overlay. */
  projection: CardProjection | null;
}

export interface AugmentedLoan extends Loan {
  abonos: LoanAbono[];
  /** Null when the loan lacks the inputs a projection needs. */
  projection: LoanProjection | null;
}

export interface FinancialState {
  snapshot: Snapshot;
  cards: AugmentedCard[];
  loans: AugmentedLoan[];
}
