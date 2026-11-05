"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, CreditCard, DollarSign, Landmark, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import type { FinancialState } from "@/lib/types";
import { monthEvents, monthMatrix, type CalendarEvent, type CalendarDay } from "@/lib/calendar";
import { formatDop, relativeDayLabel, formatDate } from "@/lib/format";
import { DebtAmountEdit, DebtDateEdit } from "@/components/sheet-edit";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const kindLabels: Record<CalendarEvent["kind"], string> = {
  "card-due": "Tarjeta",
  "card-cutoff": "Corte",
  cuota: "Cuota",
  debt: "Deuda",
  salary: "Sueldo",
  payment: "Pago",
  abono: "Abono",
};

const kindIcon: Record<CalendarEvent["kind"], React.ReactNode> = {
  "card-due": <CreditCard className="size-3.5" />,
  "card-cutoff": <CreditCard className="size-3.5" />,
  cuota: <Landmark className="size-3.5" />,
  debt: <DollarSign className="size-3.5" />,
  salary: <Wallet className="size-3.5" />,
  payment: <CreditCard className="size-3.5" />,
  abono: <Landmark className="size-3.5" />,
};

const kindChipClass: Record<CalendarEvent["kind"], string> = {
  "card-due": "bg-blue-500/10 text-blue-700 border-blue-500/20",
  "card-cutoff": "bg-slate-500/10 text-slate-600 border-slate-500/20",
  cuota: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  debt: "bg-red-500/10 text-red-700 border-red-500/20",
  salary: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  payment: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  abono: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
};

const kindBadgeClass: Record<CalendarEvent["kind"], string> = {
  "card-due": "bg-blue-100 text-blue-700 hover:bg-blue-100",
  "card-cutoff": "bg-slate-100 text-slate-700 hover:bg-slate-100",
  cuota: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  debt: "bg-red-100 text-red-700 hover:bg-red-100",
  salary: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  payment: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  abono: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
};

function toISODate(year: number, monthIndex: number, day: number): string {
  return new Date(year, monthIndex, day).toISOString().slice(0, 10);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function isToday(date: string): boolean {
  return date === new Date().toISOString().slice(0, 10);
}

function urgencyChipClass(event: CalendarEvent): string | null {
  if (event.kind !== "card-due" && event.kind !== "cuota" && event.kind !== "debt") {
    return null;
  }
  const label = relativeDayLabel(event.date);
  if (label === "vencido") return "bg-red-500/10 text-red-700 border-red-500/20";
  if (label === "hoy") return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  return null;
}

function CountdownBadge({ date }: { date: string }) {
  const label = relativeDayLabel(date);
  const overdue = label === "vencido";
  const today = label === "hoy";
  return (
    <Badge
      variant="outline"
      className={cn(
        overdue && "border-red-400 text-red-600",
        today && "border-amber-500 text-amber-600",
        !overdue && !today && "text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

function monthYearLabel(year: number, monthIndex: number): string {
  const formatter = new Intl.DateTimeFormat("es-DO", { month: "long", year: "numeric" });
  return formatter.format(new Date(year, monthIndex, 1));
}

function pickDefaultSelected(
  year: number,
  monthIndex: number,
  events: CalendarEvent[],
): string {
  const firstOfMonth = toISODate(year, monthIndex, 1);
  const lastOfMonth = toISODate(year, monthIndex, daysInMonth(year, monthIndex));
  const todayIso = new Date().toISOString().slice(0, 10);

  if (todayIso >= firstOfMonth && todayIso <= lastOfMonth) {
    if (events.some((e) => e.date === todayIso)) return todayIso;
    const next = events.find((e) => e.date > todayIso);
    if (next) return next.date;
  }

  return events[0]?.date ?? firstOfMonth;
}

interface CalendarViewProps {
  state: FinancialState;
  editable: boolean;
}

export function CalendarView({ state, editable }: CalendarViewProps) {
  const [cursor, setCursor] = React.useState(() => new Date());
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();

  const matrix = React.useMemo(() => monthMatrix(year, monthIndex), [year, monthIndex]);
  const events = React.useMemo(() => monthEvents(state, year, monthIndex), [state, year, monthIndex]);
  const defaultSelected = React.useMemo(
    () => pickDefaultSelected(year, monthIndex, events),
    [year, monthIndex, events],
  );
  const activeSelectedDate = selectedDate ?? defaultSelected;

  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, [events]);

  const selectedEvents = eventsByDate.get(activeSelectedDate) ?? [];

  const moneyOwedTotal = React.useMemo(() => {
    return events
      .filter((e) => e.kind === "card-due" || e.kind === "cuota" || e.kind === "debt")
      .reduce((sum, e) => sum + (e.amountDop ?? 0), 0);
  }, [events]);

  function previousMonth() {
    setCursor(new Date(year, monthIndex - 1, 1));
    setSelectedDate(null);
  }

  function nextMonth() {
    setCursor(new Date(year, monthIndex + 1, 1));
    setSelectedDate(null);
  }

  function goToToday() {
    const now = new Date();
    setCursor(now);
    setSelectedDate(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon-xs" onClick={previousMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="min-w-44 text-center text-lg font-semibold capitalize">
            {monthYearLabel(year, monthIndex)}
          </h2>
          <Button type="button" variant="outline" size="icon-xs" onClick={nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button type="button" variant="ghost" size="xs" onClick={goToToday}>
          Hoy
        </Button>
      </div>

      {moneyOwedTotal > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="py-3 text-sm">
            <span className="text-muted-foreground">Vence este mes:</span>{" "}
            <span className="font-semibold">{formatDop(moneyOwedTotal)}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {matrix.flat().map((cell) => (
                <DayCell
                  key={cell.date}
                  cell={cell}
                  events={eventsByDate.get(cell.date) ?? []}
                  selected={cell.date === activeSelectedDate}
                  onClick={() => cell.inMonth && setSelectedDate(cell.date)}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader>
            <CardTitle className="text-base">
              {activeSelectedDate ? formatDate(activeSelectedDate) : "Selecciona un día"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay eventos para este día.</p>
            ) : (
              selectedEvents.map((event) => (
                <DetailEvent key={event.id} event={event} editable={editable} />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DayCell({
  cell,
  events,
  selected,
  onClick,
}: {
  cell: CalendarDay;
  events: CalendarEvent[];
  selected: boolean;
  onClick: () => void;
}) {
  const today = isToday(cell.date);
  const visible = events.slice(0, 2);
  const overflow = events.length - visible.length;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!cell.inMonth}
      className={cn(
        "flex min-h-20 flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors sm:min-h-28",
        cell.inMonth
          ? "bg-background hover:bg-muted/50"
          : "bg-muted/30 text-muted-foreground",
        selected && "ring-2 ring-ring",
        today && "ring-1 ring-primary",
      )}
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-sm font-medium",
          today && "bg-primary text-primary-foreground",
          !today && cell.inMonth && "text-foreground",
          !cell.inMonth && "text-muted-foreground",
        )}
      >
        {cell.day}
      </span>
      {cell.inMonth && (
        <div className="flex w-full flex-col gap-1">
          {visible.map((event) => (
            <span
              key={event.id}
              className={cn(
                "block truncate rounded border px-1.5 py-0.5 text-[10px] leading-tight font-medium",
                urgencyChipClass(event) ?? kindChipClass[event.kind],
              )}
            >
              {event.label}
            </span>
          ))}
          {overflow > 0 && (
            <span className="text-[10px] text-muted-foreground">+{overflow} más</span>
          )}
        </div>
      )}
    </button>
  );
}

function DetailEvent({ event, editable }: { event: CalendarEvent; editable: boolean }) {
  const isDebt = event.kind === "debt";

  return (
    <div className="flex items-start justify-between gap-3 border-b py-3 last:border-0">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <Badge className={cn("gap-1", kindBadgeClass[event.kind])}>
            {kindIcon[event.kind]}
            {kindLabels[event.kind]}
          </Badge>
          <CountdownBadge date={event.date} />
        </div>
        <p className="text-sm font-medium">{event.label}</p>
        {isDebt && editable ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <DebtDateEdit debtId={event.debtId!} dueDate={event.date} />
            {event.meta ? <span>· {event.meta}</span> : null}
          </div>
        ) : event.meta ? (
          <p className="text-xs text-muted-foreground">{event.meta}</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        {isDebt && editable ? (
          <DebtAmountEdit debtId={event.debtId!} amountDop={event.amountDop ?? 0} />
        ) : (
          <span className="block text-sm font-medium">{formatDop(event.amountDop)}</span>
        )}
      </div>
    </div>
  );
}
