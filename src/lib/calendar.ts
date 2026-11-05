import type {
  FinancialState,
} from "@/lib/types";

/**
 * A single item shown on the calendar.
 *
 * `date` is an ISO yyyy-mm-dd string in local (es-DO) time.
 */
export type CalendarEvent = {
  id: string;
  date: string;
  kind:
    | "card-due"
    | "card-cutoff"
    | "cuota"
    | "debt"
    | "salary"
    | "payment"
    | "abono";
  label: string;
  amountDop?: number;
  cardId?: string;
  loanId?: string;
  debtId?: string;
  meta?: string;
};

export type CalendarDay = {
  date: string;
  day: number;
  inMonth: boolean;
};

const KIND_PRIORITY: Record<CalendarEvent["kind"], number> = {
  "card-due": 1,
  "cuota": 2,
  "debt": 3,
  "salary": 4,
  "payment": 5,
  "abono": 6,
  "card-cutoff": 7,
};

function toISODate(year: number, monthIndex: number, day: number): string {
  return new Date(year, monthIndex, day).toISOString().slice(0, 10);
}

function monthPrefix(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Build the day grid for a full month.
 *
 * The grid is always 6 rows × 7 columns and the week starts on Sunday,
 * which matches the es-DO convention used by `Intl.DateTimeFormat("es-DO")`.
 */
export function monthMatrix(year: number, monthIndex: number): CalendarDay[][] {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const totalDays = daysInMonth(year, monthIndex);
  const cells: CalendarDay[] = [];

  for (let i = 0; i < 42; i++) {
    const dayNumber = 1 - startOffset + i;
    const date = new Date(year, monthIndex, dayNumber);
    cells.push({
      date: date.toISOString().slice(0, 10),
      day: date.getDate(),
      inMonth: dayNumber >= 1 && dayNumber <= totalDays,
    });
  }

  const rows: CalendarDay[][] = [];
  for (let r = 0; r < 6; r++) {
    rows.push(cells.slice(r * 7, (r + 1) * 7));
  }
  return rows;
}

/**
 * Return all calendar events that belong to the requested month.
 *
 * Includes:
 * - Card vencimientos (monthly recurring on `dueDay`).
 * - Card corte days (monthly recurring on `closingDay`).
 * - Pending loan cuotas that fall in this month.
 * - Dated debts due this month.
 * - Quincena salary days (15 and 30, clamped to month end).
 * - Card payments from the overlay.
 * - Loan abonos from the overlay.
 */
export function monthEvents(
  state: FinancialState,
  year: number,
  monthIndex: number,
): CalendarEvent[] {
  const prefix = monthPrefix(year, monthIndex);
  const dim = daysInMonth(year, monthIndex);
  const events: CalendarEvent[] = [];

  for (const card of state.cards) {
    if (card.dueDay !== null && card.dueDay !== undefined) {
      const date = toISODate(year, monthIndex, Math.min(card.dueDay, dim));
      events.push({
        id: `card-due-${card.id}-${date}`,
        date,
        kind: "card-due",
        label: `Vencimiento ${card.bank}`,
        amountDop: card.minPaymentDop ?? undefined,
        cardId: card.id,
        meta: card.closingDay !== null ? `Corte ${card.closingDay}` : undefined,
      });
    }

    if (card.closingDay !== null && card.closingDay !== undefined) {
      const date = toISODate(year, monthIndex, Math.min(card.closingDay, dim));
      events.push({
        id: `card-cutoff-${card.id}-${date}`,
        date,
        kind: "card-cutoff",
        label: `Corte ${card.bank}`,
        cardId: card.id,
        meta: card.dueDay !== null ? `Vence ${card.dueDay}` : undefined,
      });
    }
  }

  for (const period of state.snapshot.periods) {
    const day = period.id === "Q15" ? 15 : Math.min(30, dim);
    const date = toISODate(year, monthIndex, day);
    events.push({
      id: `salary-${period.id}-${date}`,
      date,
      kind: "salary",
      label: `Sueldo ${period.label}`,
      amountDop: period.salary,
      meta: period.label,
    });
  }

  for (const loan of state.loans) {
    for (const inst of loan.schedule) {
      if (inst.status === "pending" && inst.date.startsWith(prefix)) {
        events.push({
          id: `cuota-${loan.id}-${inst.number}`,
          date: inst.date,
          kind: "cuota",
          label: `${loan.name} · Cuota ${inst.number}`,
          amountDop: inst.totalPayment,
          loanId: loan.id,
        });
      }
    }
  }

  for (const debt of state.snapshot.datedDebts) {
    if (debt.dueDate.startsWith(prefix)) {
      events.push({
        id: `debt-${debt.id}`,
        date: debt.dueDate,
        kind: "debt",
        label: debt.label,
        amountDop: debt.amountDop,
        debtId: debt.id,
      });
    }
  }

  for (const card of state.cards) {
    for (const payment of card.payments) {
      if (payment.date.startsWith(prefix)) {
        events.push({
          id: `payment-${card.id}-${payment.id}`,
          date: payment.date,
          kind: "payment",
          label: `Pago ${card.bank}`,
          amountDop: payment.amountDop,
          cardId: card.id,
          meta: payment.note ?? undefined,
        });
      }
    }
  }

  for (const loan of state.loans) {
    for (const abono of loan.abonos) {
      if (abono.date.startsWith(prefix)) {
        events.push({
          id: `abono-${loan.id}-${abono.id}`,
          date: abono.date,
          kind: "abono",
          label: `Abono ${loan.name}`,
          amountDop: abono.amount,
          loanId: loan.id,
          meta: abono.note ?? undefined,
        });
      }
    }
  }

  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
  });
}
