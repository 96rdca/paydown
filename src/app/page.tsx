import { Suspense } from "react";
import { io } from "next/cache";
import { getSnapshot } from "@/lib/sheets/snapshot";
import {
  formatDop,
  formatUsd,
  formatCombinedDop,
  formatDateShort,
  relativeDayLabel,
  isoDayOfMonth,
} from "@/lib/format";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { UtilizationChart } from "@/components/charts/utilization-chart";
import { LoanBalanceChart } from "@/components/charts/loan-balance-chart";
import type {
  CardAccount,
  Loan,
  LoanInstallment,
  PayPeriod,
  Snapshot,
} from "@/lib/types";
import {
  CalendarClock,
  CreditCard,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
  DollarSign,
} from "lucide-react";

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <Skeleton className="mb-2 h-3 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardContent className="py-8">
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardContent className="py-8">
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="py-24">
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-24">
            <Skeleton className="h-8 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function calculateUtilization(card: CardAccount, rate: number): number | null {
  const limitDop = card.limitDop ?? 0;
  const limitUsdDop = (card.limitUsd ?? 0) * rate;
  const balanceDop = card.statementBalanceDop ?? 0;
  const balanceUsdDop = (card.statementBalanceUsd ?? 0) * rate;
  const limit = limitDop + limitUsdDop;
  const balance = balanceDop + balanceUsdDop;
  if (limit === 0 || (card.limitDop === null && card.limitUsd === null)) {
    return null;
  }
  return balance / limit;
}

function upcomingPayments(snapshot: Snapshot) {
  const today = new Date();
  const windowEnd = new Date();
  windowEnd.setDate(today.getDate() + 30);

  const items: {
    id: string;
    date: string;
    label: string;
    amount: string;
    type: "tarjeta" | "prestamo" | "deuda";
  }[] = [];

  snapshot.cards.forEach((card) => {
    if (card.dueDay !== null) {
      const iso = isoDayOfMonth(card.dueDay, today);
      if (iso) {
        const d = new Date(iso);
        if (d >= today && d <= windowEnd) {
          items.push({
            id: `card-due-${card.id}`,
            date: iso,
            label: `Vencimiento ${card.bank}`,
            amount: formatDop(card.minPaymentDop),
            type: "tarjeta",
          });
        }
      }
    }
  });

  snapshot.loans.forEach((loan) => {
    loan.schedule.forEach((inst: LoanInstallment) => {
      const d = new Date(inst.date);
      if (inst.status === "pending" && d >= today && d <= windowEnd) {
        items.push({
          id: `loan-${loan.id}-${inst.number}`,
          date: inst.date,
          label: `${loan.name} · Cuota ${inst.number}`,
          amount: formatDop(inst.totalPayment),
          type: "prestamo",
        });
      }
    });
  });

  snapshot.datedDebts.forEach((debt) => {
    const d = new Date(debt.dueDate);
    if (d >= today && d <= windowEnd) {
      items.push({
        id: `debt-${debt.id}`,
        date: debt.dueDate,
        label: debt.label,
        amount: formatDop(debt.amountDop),
        type: "deuda",
      });
    }
  });

  return items.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
}

function loanBalanceData(loan: Loan) {
  return loan.schedule.map((inst: LoanInstallment) => ({
    cuota: inst.number,
    saldo: inst.endingBalance,
    fecha: formatDateShort(inst.date),
  }));
}

function cardUtilizationData(cards: CardAccount[], rate: number) {
  return cards
    .map((card) => {
      const util = calculateUtilization(card, rate);
      return {
        name: card.bank,
        utilizacion: util !== null ? Math.round(util * 100) : 0,
        balance: card.statementBalanceDop ?? 0,
        usdBalance: card.statementBalanceUsd ?? null,
        util,
      };
    })
    .filter((c) => c.util !== null)
    .sort((a, b) => b.utilizacion - a.utilizacion);
}

async function DashboardContent() {
  await io();
  const snapshot = await getSnapshot();
  const rate = snapshot.settings.usdRate;

  const totalCardDebtDop = snapshot.cardTotals.statementBalanceDop;
  const totalCardDebtUsd = snapshot.cardTotals.statementBalanceUsd;
  const totalCardDebtCombined = formatCombinedDop(
    totalCardDebtDop,
    totalCardDebtUsd,
    rate,
  );

  const remainingLoanBalance = snapshot.loans.reduce((sum, loan) => {
    // "extra" rows are past abono events, not upcoming debt — only a truly
    // pending cuota tells us the outstanding balance.
    const firstPending = loan.schedule.find(
      (i: LoanInstallment) => i.status === "pending",
    );
    if (firstPending) return sum + firstPending.beginningBalance;
    if (loan.summary.remainingCount && loan.monthlyPayment) {
      return sum + loan.summary.remainingCount * loan.monthlyPayment;
    }
    if (loan.summary.loanTotal) return sum + loan.summary.loanTotal;
    return sum;
  }, 0);

  const receivablesTotal = snapshot.receivables.reduce(
    (sum, r) => sum + r.total,
    0,
  );
  const monthlyInflow = snapshot.receivables.reduce(
    (sum, r) => sum + r.monthlyAmount,
    0,
  );

  const savingsCurrent = snapshot.savings?.current ?? 0;
  const savingsTarget = snapshot.savings?.target ?? 1;

  const availableCards = formatCombinedDop(
    snapshot.cardTotals.availableDop,
    snapshot.cardTotals.availableUsd,
    rate,
  );

  const payments = upcomingPayments(snapshot);

  const autoLoan = snapshot.loans.find((l) => l.id === "auto-loan");
  const utilizationData = cardUtilizationData(snapshot.cards, rate);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Resumen financiero al día de hoy.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Deuda de tarjetas
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {totalCardDebtCombined}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDop(totalCardDebtDop)} · {formatUsd(totalCardDebtUsd)}
                </p>
              </div>
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <CreditCard className="size-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Saldo restante de préstamos
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatDop(remainingLoanBalance)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {snapshot.loans.length} préstamos activos
                </p>
              </div>
              <div className="rounded-lg bg-destructive/10 p-2 text-destructive">
                <TrendingDown className="size-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Por cobrar
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatDop(receivablesTotal)}
                </p>
                <p className="text-xs text-muted-foreground">
                  +{formatDop(monthlyInflow)} mensuales esperados
                </p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600">
                <Wallet className="size-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Ahorro acumulado
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatDop(savingsCurrent)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Meta: {formatDop(savingsTarget)}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                <PiggyBank className="size-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Disponible en tarjetas
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {availableCards}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDop(snapshot.cardTotals.availableDop)} ·{" "}
                  {formatUsd(snapshot.cardTotals.availableUsd)}
                </p>
              </div>
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
                <DollarSign className="size-5" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Tasa del día
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  {formatDop(rate)}
                </p>
                <p className="text-xs text-muted-foreground">DOP por US$1</p>
              </div>
              <div className="rounded-lg bg-muted p-2 text-foreground">
                <TrendingUp className="size-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Quincenas summary */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Resumen de quincenas</CardTitle>
            <CardDescription>Sueldo vs compromisos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {snapshot.periods.map((period: PayPeriod) => {
              const committed = period.salary - period.surplusDop;
              return (
                <div
                  key={period.id}
                  className="rounded-lg border p-3 transition-colors hover:bg-muted/30"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-medium">{period.label}</span>
                    <Badge
                      variant={
                        period.surplusDop >= 0 ? "secondary" : "destructive"
                      }
                      className={
                        period.surplusDop >= 0
                          ? "bg-emerald-500/10 text-emerald-600"
                          : ""
                      }
                    >
                      Sobrante {formatDop(period.surplusDop)}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sueldo</span>
                      <span className="font-medium">
                        {formatDop(period.salary)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Compromisos
                      </span>
                      <span className="font-medium">
                        {formatDop(committed)}
                      </span>
                    </div>
                  </div>
                  <Progress
                    value={Math.min(100, (committed / period.salary) * 100)}
                    className="mt-3"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Upcoming payments */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4" /> Próximos pagos
            </CardTitle>
            <CardDescription>Próximos 30 días</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay pagos próximos.
              </p>
            ) : (
              <div className="space-y-2">
                {payments.slice(0, 8).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="outline"
                        className={
                          p.type === "tarjeta"
                            ? "border-blue-200 text-blue-600"
                            : p.type === "prestamo"
                              ? "border-amber-200 text-amber-600"
                              : "border-red-200 text-red-600"
                        }
                      >
                        {p.type === "tarjeta"
                          ? "Tarjeta"
                          : p.type === "prestamo"
                            ? "Préstamo"
                            : "Deuda"}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium">{p.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateShort(p.date)} · {relativeDayLabel(p.date)}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-medium">{p.amount}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Card utilization */}
        <Card>
          <CardHeader>
            <CardTitle>Utilización por tarjeta</CardTitle>
            <CardDescription>% del límite usado</CardDescription>
          </CardHeader>
          <CardContent>
            <UtilizationChart data={utilizationData} />
          </CardContent>
        </Card>

        {/* Loan balance curve */}
        <Card>
          <CardHeader>
            <CardTitle>Curva de saldo de préstamos</CardTitle>
            <CardDescription>
              {autoLoan ? autoLoan.name : "Auto Loan"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {autoLoan && autoLoan.schedule.length > 0 ? (
              <LoanBalanceChart data={loanBalanceData(autoLoan)} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay datos de cronograma.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Loan progress */}
        <Card>
          <CardHeader>
            <CardTitle>Progreso de préstamos</CardTitle>
            <CardDescription>Cuotas pagadas vs totales</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {snapshot.loans.map((loan: Loan) => {
              const total =
                (loan.summary.paidCount ?? 0) +
                (loan.summary.remainingCount ?? 0);
              const pct =
                total > 0 ? ((loan.summary.paidCount ?? 0) / total) * 100 : 0;
              return (
                <div key={loan.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{loan.name}</span>
                    <span className="text-muted-foreground">
                      {loan.summary.paidCount ?? "—"} / {total || "—"} cuotas
                    </span>
                  </div>
                  <Progress value={pct} />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Savings mini */}
        <Card>
          <CardHeader>
            <CardTitle>Ahorro 100</CardTitle>
            <CardDescription>
              Meta: {formatDop(savingsTarget)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex items-center justify-between">
              <span className="text-2xl font-semibold tracking-tight">
                {formatDop(savingsCurrent)}
              </span>
              <Badge
                variant="secondary"
                className="bg-emerald-500/10 text-emerald-600"
              >
                {percentage(savingsCurrent / savingsTarget)}
              </Badge>
            </div>
            <Progress value={(savingsCurrent / savingsTarget) * 100} />
            <p className="mt-2 text-xs text-muted-foreground">
              {snapshot.savings
                ? `Semana ${snapshot.savings.weeks.length} de 52`
                : "Sin datos"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Footer snapshot={snapshot} />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

function percentage(value: number): string {
  if (Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}
