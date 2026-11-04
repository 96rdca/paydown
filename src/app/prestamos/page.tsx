import { Suspense } from "react";
import { io } from "next/cache";
import { getSnapshot } from "@/lib/sheets/snapshot";
import { formatDop, formatDate, formatAnnualRate } from "@/lib/format";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Loan, LoanInstallment } from "@/lib/types";
import { Landmark, PiggyBank } from "lucide-react";

function statusBadge(status: LoanInstallment["status"]) {
  switch (status) {
    case "paid":
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-500/10 text-emerald-600"
        >
          Pagada
        </Badge>
      );
    case "extra":
      return (
        <Badge
          variant="secondary"
          className="bg-blue-500/10 text-blue-600"
        >
          Abono
        </Badge>
      );
    default:
      return <Badge variant="outline">Pendiente</Badge>;
  }
}

function LoanCard({ loan }: { loan: Loan }) {
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
            <Badge
              variant="secondary"
              className="bg-emerald-500/10 text-emerald-600"
            >
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

function ScheduleTable({ loan }: { loan: Loan }) {
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Saldo inicial</TableHead>
            <TableHead className="text-right">Interés</TableHead>
            <TableHead className="text-right">Capital</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Saldo final</TableHead>
            <TableHead className="text-right">Abonado</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loan.schedule.map((inst: LoanInstallment) => (
            <TableRow
              key={inst.number}
              className={
                inst.status === "pending" ? "bg-muted/30" : undefined
              }
            >
              <TableCell className="font-medium">{inst.number}</TableCell>
              <TableCell>{formatDate(inst.date)}</TableCell>
              <TableCell className="text-right">
                {formatDop(inst.beginningBalance)}
              </TableCell>
              <TableCell className="text-right">
                {formatDop(inst.interest)}
              </TableCell>
              <TableCell className="text-right">
                {formatDop(inst.principal)}
              </TableCell>
              <TableCell className="text-right">
                {formatDop(inst.totalPayment)}
              </TableCell>
              <TableCell className="text-right">
                {formatDop(inst.endingBalance)}
              </TableCell>
              <TableCell className="text-right">
                {inst.extraPayment ? formatDop(inst.extraPayment) : "—"}
              </TableCell>
              <TableCell>{statusBadge(inst.status)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
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
            <CardContent className="py-8">
              <Skeleton className="h-4 w-full" />
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
  const snapshot = await getSnapshot();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Préstamos</h1>
        <p className="text-muted-foreground">
          Estado y cronogramas de cada préstamo.
        </p>
      </div>

      <div className="space-y-8">
        {snapshot.loans.map((loan: Loan) => (
          <div key={loan.id} className="space-y-4">
            <LoanCard loan={loan} />
            {loan.schedule.length > 0 ? (
              <ScheduleTable loan={loan} />
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {loan.name} no tiene cronograma detallado.
              </div>
            )}
            <Separator />
          </div>
        ))}
      </div>

      <Footer snapshot={snapshot} />
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
