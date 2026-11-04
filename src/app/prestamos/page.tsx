import { Suspense } from "react";
import { io } from "next/cache";
import { getFinancialState } from "@/lib/state";
import { formatDop, formatDate, formatAnnualRate, formatInteger } from "@/lib/format";
import { Footer } from "@/components/footer";
import { LoanAbonoSimulator } from "@/components/loan-abono-simulator";
import { LoanAbonosList } from "@/components/loan-abonos-list";
import { LoanScheduleTabs } from "@/components/loan-schedule-tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { AugmentedLoan, LoanInstallment } from "@/lib/types";
import { Landmark, PiggyBank, Calendar, Clock, Sparkles } from "lucide-react";

function LoanCard({ loan }: { loan: AugmentedLoan }) {
  const totalCount =
    (loan.summary.paidCount ?? 0) + (loan.summary.remainingCount ?? 0);
  const progress =
    totalCount > 0 ? ((loan.summary.paidCount ?? 0) / totalCount) * 100 : 0;

  const firstPending = loan.schedule.find(
    (i: LoanInstallment) => i.status !== "paid",
  );
  const remaining = firstPending
    ? firstPending.beginningBalance
    : (loan.summary.loanTotal ?? 0);

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Landmark className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base">{loan.name}</CardTitle>
              <CardDescription className="text-xs">
                {loan.sourceTab}
              </CardDescription>
            </div>
          </div>
          {loan.summary.interestSaved ? (
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
              <PiggyBank className="mr-1 size-3" /> Interés ahorrado{" "}
              {formatDop(loan.summary.interestSaved)}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Cuota mensual</p>
            <p className="font-medium">{formatDop(loan.monthlyPayment)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Saldo restante</p>
            <p className="font-medium">{formatDop(remaining)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tasa anual</p>
            <p className="font-medium">{formatAnnualRate(loan.annualRate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Seguro</p>
            <p className="font-medium">{formatDop(loan.insuranceMonthly)}</p>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Progreso</span>
            <span className="font-medium">
              {loan.summary.paidCount ?? "—"} / {totalCount || "—"} cuotas
            </span>
          </div>
          <Progress value={progress} />
        </div>

        {loan.projection && (
          <div className="space-y-3 rounded-lg bg-muted/50 p-3">
            <p className="text-xs font-medium text-muted-foreground">Proyección de pagos restantes</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="size-3" /> Según hoja
                </p>
                <p className="text-sm font-medium">
                  {formatInteger(loan.projection.baseline.months)} meses ·{" "}
                  {formatDop(loan.projection.baseline.totalInterest)} intereses
                </p>
                <p className="text-xs text-muted-foreground">
                  Termina {formatDate(loan.projection.baseline.endDate)}
                </p>
              </div>
              {loan.abonos.length > 0 ? (
                <div>
                  <p className="flex items-center gap-1 text-xs text-emerald-600">
                    <Sparkles className="size-3" /> Con tus abonos
                  </p>
                  <p className="text-sm font-medium text-emerald-600">
                    {formatInteger(loan.projection.withAbonos.months)} meses ·{" "}
                    {formatDop(loan.projection.withAbonos.totalInterest)} intereses
                  </p>
                  <p className="text-xs text-emerald-600">
                    Termina {formatDate(loan.projection.withAbonos.endDate)}
                  </p>
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                    Ahorras {formatInteger(loan.projection.monthsSaved)} meses y{" "}
                    {formatDop(loan.projection.interestSaved)}
                  </p>
                </div>
              ) : (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Clock className="mr-1 size-3" /> Sin abonos registrados.
                </div>
              )}
            </div>
          </div>
        )}

        {loan.extras.length > 0 && (
          <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2">
            {loan.extras.map((extra, idx) => (
              <div key={idx}>
                <p className="text-xs text-muted-foreground">{extra.label}</p>
                <p className="font-medium">{extra.value}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PrestamosSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-4">
          <Card>
            <CardContent className="space-y-4 py-6">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-10 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

async function PrestamosContent() {
  await io();
  const state = await getFinancialState();
  const rate = state.snapshot.settings.usdRate;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Préstamos</h1>
        <p className="text-muted-foreground">
          Estado, cronogramas y simulador de abonos.
        </p>
      </div>

      <div className="space-y-8">
        {state.loans.map((loan: AugmentedLoan) => (
          <div key={loan.id} className="space-y-4">
            <LoanCard loan={loan} />
            {loan.projection && (
              <>
                <LoanAbonoSimulator loan={loan} usdRate={rate} />
                <LoanAbonosList loan={loan} />
              </>
            )}
            <LoanScheduleTabs loan={loan} />
            <Separator />
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Los abonos y tasas se guardan localmente en la app; la hoja sigue siendo la fuente
        oficial.
      </p>

      <Footer snapshot={state.snapshot} />
    </div>
  );
}

export default function PrestamosPage() {
  return (
    <Suspense fallback={<PrestamosSkeleton />}>
      <PrestamosContent />
    </Suspense>
  );
}
