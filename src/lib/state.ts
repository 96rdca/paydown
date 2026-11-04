import { getSnapshot } from "@/lib/sheets/snapshot";
import type {
  AugmentedCard,
  AugmentedLoan,
  FinancialState,
  LoanProjection,
} from "@/lib/types";

export interface GetStateOptions {
  /** Bypass the underlying sheet cache too. */
  force?: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Sheet snapshot + app-owned overlay + computed projections — the single
 * read model the UI uses once Phase 3/4 land.
 *
 * STUB: the overlay is always empty, loan projections are naive baselines
 * derived straight from the pending schedule, and card projections are null
 * (no rates configured). The overlay store, API routes and full projection
 * engine replace these internals while keeping this exact signature.
 */
export async function getFinancialState(
  options: GetStateOptions = {},
): Promise<FinancialState> {
  const snapshot = await getSnapshot(options);

  const cards: AugmentedCard[] = snapshot.cards.map((card) => ({
    ...card,
    payments: [],
    projection: null,
  }));

  const loans: AugmentedLoan[] = snapshot.loans.map((loan) => {
    const pending = loan.schedule.filter((i) => i.status === "pending");
    let projection: LoanProjection | null = null;
    if (pending.length > 0) {
      const totals = {
        months: pending.length,
        totalInterest: round2(pending.reduce((s, i) => s + i.interest, 0)),
        endDate: pending[pending.length - 1].date,
      };
      projection = {
        baseline: totals,
        withAbonos: { ...totals, endDate: totals.endDate },
        interestSaved: 0,
        monthsSaved: 0,
        projectedSchedule: pending,
      };
    }
    return { ...loan, abonos: [], projection };
  });

  return { snapshot, cards, loans };
}
