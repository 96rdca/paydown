import { Suspense } from "react";
import { io } from "next/cache";
import { getSnapshot } from "@/lib/sheets/snapshot";
import {
  formatDateShort,
  formatDop,
  isoDayOfMonth,
  relativeDayLabel,
} from "@/lib/format";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Snapshot, LoanInstallment, CardAccount } from "@/lib/types";
import { CreditCard, Landmark, Wallet, DollarSign } from "lucide-react";

interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  amount?: string;
  type: "salary" | "card-cut" | "card-due" | "loan" | "debt";
  meta?: string;
}

function buildCalendar(snapshot: Snapshot): CalendarEvent[] {
  const today = new Date();
  const end = new Date();
  end.setDate(today.getDate() + 60);

  const events: CalendarEvent[] = [];

  // Salary days (15 and 30 of each month within window)
  const salaryCursor = new Date(today.getFullYear(), today.getMonth(), 1);
  while (salaryCursor <= end) {
    const month = salaryCursor.getMonth();
    const year = salaryCursor.getFullYear();
    [15, 30].forEach((day) => {
      const iso = new Date(year, month, day).toISOString().slice(0, 10);
      if (new Date(iso) >= today && new Date(iso) <= end) {
        events.push({
          id: `salary-${iso}`,
          date: iso,
          title: "Sueldo de quincena",
          type: "salary",
        });
      }
    });
    salaryCursor.setMonth(salaryCursor.getMonth() + 1);
  }

  // Card cut and due dates
  snapshot.cards.forEach((card: CardAccount) => {
    if (card.closingDay !== null) {
      const iso = isoDayOfMonth(card.closingDay, today);
      if (iso && new Date(iso) >= today && new Date(iso) <= end) {
        events.push({
          id: `cut-${card.id}-${iso}`,
          date: iso,
          title: `Corte ${card.bank}`,
          type: "card-cut",
          meta: `Vence ${card.dueDay ?? "—"}`,
        });
      }
    }
    if (card.dueDay !== null) {
      const iso = isoDayOfMonth(card.dueDay, today);
      if (iso && new Date(iso) >= today && new Date(iso) <= end) {
        events.push({
          id: `due-${card.id}-${iso}`,
          date: iso,
          title: `Vencimiento ${card.bank}`,
          amount: formatDop(card.minPaymentDop),
          type: "card-due",
          meta: `Corte ${card.closingDay ?? "—"}`,
        });
      }
    }
  });

  // Loan installments
  snapshot.loans.forEach((loan) => {
    loan.schedule.forEach((inst: LoanInstallment) => {
      const d = new Date(inst.date);
      if (inst.status === "pending" && d >= today && d <= end) {
        events.push({
          id: `loan-${loan.id}-${inst.number}`,
          date: inst.date,
          title: `${loan.name} · Cuota ${inst.number}`,
          amount: formatDop(inst.totalPayment),
          type: "loan",
        });
      }
    });
  });

  // Dated debts
  snapshot.datedDebts.forEach((debt) => {
    const d = new Date(debt.dueDate);
    if (d >= today && d <= end) {
      events.push({
        id: `debt-${debt.id}`,
        date: debt.dueDate,
        title: debt.label,
        amount: formatDop(debt.amountDop),
        type: "debt",
      });
    }
  });

  return events.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

function groupByMonth(events: CalendarEvent[]) {
  const groups = new Map<string, CalendarEvent[]>();
  events.forEach((e) => {
    const key = e.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  });
  return groups;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("es-DO", { month: "long", year: "numeric" });
}

function eventIcon(type: CalendarEvent["type"]) {
  switch (type) {
    case "salary":
      return <Wallet className="size-4 text-emerald-600" />;
    case "card-cut":
      return <CreditCard className="size-4 text-blue-600" />;
    case "card-due":
      return <CreditCard className="size-4 text-amber-600" />;
    case "loan":
      return <Landmark className="size-4 text-purple-600" />;
    case "debt":
      return <DollarSign className="size-4 text-red-600" />;
  }
}

function countdownBadge(date: string) {
  const label = relativeDayLabel(date);
  const isToday = label === "hoy";
  const isOverdue = label === "vencido";
  return (
    <Badge
      variant="outline"
      className={
        isToday
          ? "border-amber-500 text-amber-600"
          : isOverdue
            ? "border-red-500 text-red-600"
            : "text-muted-foreground"
      }
    >
      {label}
    </Badge>
  );
}

function CalendarioSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="py-6">
            <Skeleton className="mb-3 h-5 w-32" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

async function CalendarioContent() {
  await io();
  const snapshot = await getSnapshot();
  const events = buildCalendar(snapshot);
  const grouped = groupByMonth(events);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
        <p className="text-muted-foreground">
          Obligaciones y fechas clave de los próximos 60 días.
        </p>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No hay eventos próximos.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([key, monthEvents]) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-base capitalize">
                  {monthLabel(key)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {monthEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-muted p-2">
                        {eventIcon(event.type)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{event.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(event.date)}
                          {event.meta ? ` · ${event.meta}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {event.amount && (
                        <span className="text-sm font-medium">
                          {event.amount}
                        </span>
                      )}
                      {countdownBadge(event.date)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Footer snapshot={snapshot} />
    </div>
  );
}

export default function CalendarioPage() {
  return (
    <Suspense fallback={<CalendarioSkeleton />}>
      <CalendarioContent />
    </Suspense>
  );
}
