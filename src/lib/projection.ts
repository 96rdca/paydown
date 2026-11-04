/**
 * Projection engine — pure math, no I/O and no server-only imports.
 *
 * The UI imports these functions directly inside client components, so this
 * module must stay dependency-free (types are erased at build time).
 *
 * Money is DOP-combined for cards: USD amounts convert with the sheet's
 * `usdRate`. Loans are DOP-denominated on the sheet, so their projections use
 * the loan's own annual rate (`annualRate / 12` per month).
 *
 * Assumptions documented here (also surfaced in the API/README summary):
 * - Card minimum-payment simulation: interest accrues on the statement
 *   balance, the sheet's combined minimum (DOP + USD × rate) is paid at the
 *   end of each month, and the final month pays only the remaining balance.
 * - Loan abonos reduce principal in the month they occur, BEFORE that month's
 *   interest accrues. An abono dated before the first pending cuota is applied
 *   to the starting balance.
 * - Loan insurance is a constant monthly cost: it is part of the cuota but
 *   never reduces principal.
 * - Projected dates step monthly from the first pending cuota date, clamping
 *   to the last day of shorter months (Jan 31 -> Feb 28).
 */
import type {
  CardAccount,
  CardProjection,
  CardUtilization,
  Loan,
  LoanAbono,
  LoanInstallment,
  LoanProjection,
  ProjectionTotals,
} from "@/lib/types";

const MAX_CARD_MONTHS = 600;
const MAX_LOAN_MONTHS = 1200;
/** Values below this are treated as zero (float dust). */
const EPSILON = 0.005;

export function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Today's calendar date in the server's local timezone. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
    now.getDate(),
  )}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Add calendar months to an ISO date, clamping to the last day of the target
 * month (2026-01-31 + 1 month -> 2026-02-28). Pure string/UTC math; no
 * timezone conversion.
 */
export function addMonthsClamped(iso: string, months: number): string {
  const [yearText, monthText, dayText] = iso.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = (targetIndex % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return `${targetYear}-${pad2(targetMonth)}-${pad2(targetDay)}`;
}

/**
 * Card interest + minimum-payment payoff projection.
 *
 * Returns null when no monthly rate is configured — the UI shows "sin tasa".
 */
export function projectCard(
  card: CardAccount,
  usdRate: number,
  today: string = todayIso(),
): CardProjection | null {
  if (card.monthlyRate === null) {
    return null;
  }

  const rate = card.monthlyRate;
  const balance =
    (card.statementBalanceDop ?? 0) +
    (card.statementBalanceUsd ?? 0) * usdRate;
  const hasMinimum =
    card.minPaymentDop !== null || card.minPaymentUsd !== null;
  const minimum =
    (card.minPaymentDop ?? 0) + (card.minPaymentUsd ?? 0) * usdRate;

  const projection: CardProjection = {
    monthlyInterestDop: round2(balance * rate),
    payoffNowDop: round2(balance),
    minPayoff: null,
    minPayoffBlockedReason: null,
  };

  // Nothing owed: already paid off, zero months.
  if (balance <= 0) {
    projection.minPayoff = {
      months: 0,
      totalInterest: 0,
      totalPaid: 0,
      endDate: today,
    };
    return projection;
  }

  if (!hasMinimum || minimum <= 0) {
    projection.minPayoffBlockedReason = "Sin pago mínimo en la hoja.";
    return projection;
  }

  if (minimum <= balance * rate) {
    projection.minPayoffBlockedReason =
      "El pago mínimo no cubre los intereses.";
    return projection;
  }

  let remaining = balance;
  let totalInterest = 0;
  let totalPaid = 0;
  let months = 0;

  while (remaining > EPSILON && months < MAX_CARD_MONTHS) {
    const interest = remaining * rate;
    const payment = Math.min(minimum, remaining + interest);

    remaining = remaining + interest - payment;
    totalInterest += interest;
    totalPaid += payment;
    months += 1;
  }

  if (remaining > EPSILON) {
    projection.minPayoffBlockedReason =
      "La simulación supera los 600 meses.";
    return projection;
  }

  projection.minPayoff = {
    months,
    totalInterest: round2(totalInterest),
    totalPaid: round2(totalPaid),
    endDate: addMonthsClamped(today, months),
  };
  return projection;
}

/* ── credit utilization ────────────────────────────────────────────────── */

/**
 * Structural input for {@link cardUtilization}: any card-shaped object with
 * the pool limits, statement balances and the resolved shared-pool flag.
 */
export interface CardUtilizationInput {
  statementBalanceDop: number | null;
  statementBalanceUsd: number | null;
  limitDop: number | null;
  limitUsd: number | null;
  /** Resolved from the overlay; true only for single-pool cards (APAP). */
  sharedLimitDopUsd: boolean;
}

function utilizationRatio(
  balance: number | null,
  limit: number | null,
): number | null {
  if (balance === null || limit === null || limit <= 0) {
    return null;
  }
  return balance / limit;
}

/**
 * Credit utilization per the card's pool model.
 *
 * - Shared pool (`sharedLimitDopUsd === true`, e.g. APAP): a single pool where
 *   the USD balance consumes the DOP limit converted at the tasa. `combined`
 *   is `(balanceDop + balanceUsd × usdRate) / limitDop`; null when the DOP
 *   limit is missing/0 or both balances are unknown. `dop`/`usd` are null.
 * - Separate pools (default): `dop = balanceDop / limitDop` and
 *   `usd = balanceUsd / limitUsd`, each computed independently.
 * - Missing data is treated as UNKNOWN, never as zero usage: a missing balance
 *   yields null for that pool (a missing limit also yields null). A configured
 *   limit with no reported balance is therefore not "0% used".
 * - `kind` mirrors the card's configured mode; it is "none" only for a
 *   separate-pool card with no usable limit at all (both limits missing/0).
 *
 * Values are fractions (0.44 = 44% used) and are not rounded or clamped; the
 * UI formats them. `projectCard` stays currency-combined: interest accrues on
 * the total owed regardless of how the limits are split.
 */
export function cardUtilization(
  card: CardUtilizationInput,
  usdRate: number,
): CardUtilization {
  if (card.sharedLimitDopUsd) {
    const limitDop = card.limitDop;
    const balanceDop = card.statementBalanceDop;
    const balanceUsd = card.statementBalanceUsd;

    const combined =
      limitDop === null ||
      limitDop <= 0 ||
      (balanceDop === null && balanceUsd === null)
        ? null
        : ((balanceDop ?? 0) + (balanceUsd ?? 0) * usdRate) / limitDop;

    return { kind: "shared", combined, dop: null, usd: null };
  }

  const dop = utilizationRatio(card.statementBalanceDop, card.limitDop);
  const usd = utilizationRatio(card.statementBalanceUsd, card.limitUsd);
  const hasUsableLimit =
    (card.limitDop !== null && card.limitDop > 0) ||
    (card.limitUsd !== null && card.limitUsd > 0);

  return {
    kind: hasUsableLimit ? "separate" : "none",
    combined: null,
    dop,
    usd,
  };
}

/* ── loans ─────────────────────────────────────────────────────────────── */

interface AmortizationInput {
  startBalance: number;
  startDate: string;
  monthlyRate: number;
  /** Total monthly cuota, insurance included. */
  cuota: number;
  /** Constant monthly insurance; never reduces principal. */
  insurance: number;
  /** Cuota number of the first regenerated row. */
  firstNumber: number;
  /** Date used when abonos settle the debt before any cuota. */
  asOf: string;
}

interface SimulationResult {
  totals: ProjectionTotals;
  rows: LoanInstallment[];
}

/**
 * Regenerate the remaining amortization table.
 *
 * Abono timing: every abono dated on/before a cuota's date is applied to the
 * balance BEFORE that cuota's interest is computed. Pre-start abonos are
 * folded into the starting balance. Insurance is charged every month but only
 * `cuota - interest - insurance` reduces principal.
 */
function amortize(
  input: AmortizationInput,
  abonos: LoanAbono[],
): SimulationResult | null {
  const ordered = [...abonos].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );

  let balance = input.startBalance;
  let abonoIndex = 0;

  // Abonos dated before the first pending cuota apply to the starting balance.
  while (
    abonoIndex < ordered.length &&
    ordered[abonoIndex].date < input.startDate
  ) {
    balance -= ordered[abonoIndex].amount;
    abonoIndex += 1;
  }
  balance = Math.max(0, balance);

  const rows: LoanInstallment[] = [];
  let totalInterest = 0;
  let months = 0;

  while (balance > EPSILON && months < MAX_LOAN_MONTHS) {
    const date = addMonthsClamped(input.startDate, months);

    // Abonos already in force at this cuota reduce principal before interest.
    while (abonoIndex < ordered.length && ordered[abonoIndex].date <= date) {
      balance = Math.max(0, balance - ordered[abonoIndex].amount);
      abonoIndex += 1;
    }

    if (balance <= EPSILON) {
      break;
    }

    const interest = balance * input.monthlyRate;

    // Month one check: the cuota after insurance must cover the interest or
    // the loan would never amortize.
    if (months === 0 && input.cuota - input.insurance <= interest) {
      return null;
    }

    const scheduledPrincipal = input.cuota - input.insurance - interest;
    if (scheduledPrincipal <= 0) {
      return null;
    }

    const beginningBalance = balance;
    // Final cuota pays only what is left (interest + insurance + remaining).
    const principal = Math.min(scheduledPrincipal, balance);
    balance = Math.max(0, balance - principal);

    rows.push({
      number: input.firstNumber + months,
      date,
      beginningBalance: round2(beginningBalance),
      interest: round2(interest),
      principal: round2(principal),
      insurance: input.insurance > 0 ? round2(input.insurance) : null,
      totalPayment: round2(principal + interest + input.insurance),
      endingBalance: round2(balance),
      status: "pending",
      extraPayment: null,
    });

    totalInterest += interest;
    months += 1;
  }

  if (balance > EPSILON) {
    return null;
  }

  return {
    totals: {
      months,
      totalInterest: round2(totalInterest),
      endDate: rows.length > 0 ? rows[rows.length - 1].date : input.asOf,
    },
    rows,
  };
}

/**
 * Loan payoff projection with and without the persisted abonos.
 *
 * Returns null when the loan cannot be projected from the current data:
 * no pending schedule rows (nothing supplies a current balance — e.g.
 * Credimas only has a summary), no annual rate, or inputs that never
 * amortize. `usdRate` is kept in the signature for symmetry with cards and
 * for future USD-denominated loans; the sheet's loans are DOP-only.
 */
export function simulateLoan(
  loan: Loan,
  abonos: LoanAbono[],
  usdRate: number,
  today: string = todayIso(),
): LoanProjection | null {
  void usdRate;

  const pending = loan.schedule.filter(
    (installment) => installment.status === "pending",
  );
  if (pending.length === 0) {
    return null;
  }

  if (
    loan.annualRate === null ||
    !Number.isFinite(loan.annualRate) ||
    loan.annualRate < 0
  ) {
    return null;
  }

  const first = pending[0];
  const insurance = loan.insuranceMonthly ?? first.insurance ?? 0;
  const derivedCuota =
    first.interest + first.principal + (first.insurance ?? 0);
  const cuota = loan.monthlyPayment ?? derivedCuota;

  if (!Number.isFinite(cuota) || cuota <= 0 || insurance >= cuota) {
    return null;
  }

  const monthlyRate = loan.annualRate / 12;
  const input: AmortizationInput = {
    startBalance: first.beginningBalance,
    startDate: first.date,
    monthlyRate,
    cuota,
    insurance,
    firstNumber: first.number,
    asOf: today,
  };

  const relevant = abonos.filter((abono) => abono.loanId === loan.id);

  const baseline = amortize(input, []);
  if (!baseline) {
    return null;
  }

  const withAbonos = amortize(input, relevant);
  if (!withAbonos) {
    return null;
  }

  return {
    baseline: baseline.totals,
    withAbonos: withAbonos.totals,
    interestSaved: round2(
      Math.max(0, baseline.totals.totalInterest - withAbonos.totals.totalInterest),
    ),
    monthsSaved: Math.max(
      0,
      baseline.totals.months - withAbonos.totals.months,
    ),
    projectedSchedule: withAbonos.rows,
  };
}
