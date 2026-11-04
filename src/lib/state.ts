import { overlayStore } from "@/lib/overlay/store";
import { projectCard, simulateLoan, todayIso } from "@/lib/projection";
import { getSnapshot } from "@/lib/sheets/snapshot";
import type {
  AugmentedCard,
  AugmentedLoan,
  CardPayment,
  FinancialState,
  LoanAbono,
  Snapshot,
} from "@/lib/types";

export interface GetStateOptions {
  /** Bypass the underlying sheet cache too. */
  force?: boolean;
}

/**
 * The sheet is the slow, shared part: cache it for 60s (and collapse bursts of
 * cache misses), like `sheets/snapshot.ts`. `force` bypasses both caches.
 */
const SHEET_TTL_MS = 60_000;

let sheetCache: { snapshot: Snapshot; expiresAt: number } | null = null;
let sheetInflight: Promise<Snapshot> | null = null;

async function readSnapshot(force: boolean): Promise<Snapshot> {
  if (!force && sheetCache && sheetCache.expiresAt > Date.now()) {
    return sheetCache.snapshot;
  }

  if (!force && sheetInflight) {
    return sheetInflight;
  }

  const pending = getSnapshot({ force }).then((snapshot) => {
    sheetCache = { snapshot, expiresAt: Date.now() + SHEET_TTL_MS };
    return snapshot;
  });

  if (!force) {
    sheetInflight = pending;
  }

  try {
    return await pending;
  } finally {
    if (sheetInflight === pending) {
      sheetInflight = null;
    }
  }
}

/** Newest first, with a stable tie-breaker for same-day records. */
function newestFirst<T extends { id: string; date: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );
}

/**
 * Sheet snapshot + app-owned overlay + computed projections — the single read
 * model the UI and the API routes use.
 *
 * The precious overlay is read from the store on EVERY call (never cached
 * here), so a mutation is visible on the very next request. Only the sheet
 * part is cached for 60s.
 */
export async function getFinancialState(
  options: GetStateOptions = {},
): Promise<FinancialState> {
  const [snapshot, overlay] = await Promise.all([
    readSnapshot(options.force === true),
    overlayStore.read(),
  ]);

  const usdRate = snapshot.settings.usdRate;
  const today = todayIso();

  const cards: AugmentedCard[] = snapshot.cards.map((card) => {
    const overlayRate = overlay.cards[card.id]?.monthlyRate ?? null;
    // The app-owned rate overrides the sheet's (currently always null).
    const monthlyRate = overlayRate ?? card.monthlyRate;
    const base = { ...card, monthlyRate };
    const payments: CardPayment[] = newestFirst(
      overlay.cardPayments.filter((payment) => payment.cardId === card.id),
    );

    return {
      ...base,
      payments,
      projection: projectCard(base, usdRate, today),
    };
  });

  const loans: AugmentedLoan[] = snapshot.loans.map((loan) => {
    const abonos: LoanAbono[] = newestFirst(
      overlay.loanAbonos.filter((abono) => abono.loanId === loan.id),
    );

    return {
      ...loan,
      abonos,
      projection: simulateLoan(loan, abonos, usdRate, today),
    };
  });

  return { snapshot, cards, loans };
}
