"use client";

import { formatDop, formatDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CuotaStatusButton, parseEditResponse } from "@/components/sheet-edit";
import type { AugmentedLoan, LoanInstallment } from "@/lib/types";
import { FileSpreadsheet, Sparkles } from "lucide-react";

interface LoanScheduleTabsProps {
  loan: AugmentedLoan;
  editable?: boolean;
}

function statusBadge(status: LoanInstallment["status"]) {
  switch (status) {
    case "paid":
      return (
        <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600">
          Pagada
        </Badge>
      );
    case "extra":
      return (
        <Badge variant="secondary" className="bg-blue-500/10 text-blue-600">
          Abono
        </Badge>
      );
    default:
      return <Badge variant="outline">Pendiente</Badge>;
  }
}

function ScheduleTable({
  rows,
  loanId,
  editable,
}: {
  rows: LoanInstallment[];
  loanId?: string;
  editable?: boolean;
}) {
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
            {editable && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((inst) => (
            <TableRow
              key={inst.number}
              className={inst.status === "pending" ? "bg-muted/30" : undefined}
            >
              <TableCell className="font-medium">{inst.number}</TableCell>
              <TableCell>{formatDate(inst.date)}</TableCell>
              <TableCell className="text-right">
                {formatDop(inst.beginningBalance)}
              </TableCell>
              <TableCell className="text-right">{formatDop(inst.interest)}</TableCell>
              <TableCell className="text-right">{formatDop(inst.principal)}</TableCell>
              <TableCell className="text-right">{formatDop(inst.totalPayment)}</TableCell>
              <TableCell className="text-right">{formatDop(inst.endingBalance)}</TableCell>
              <TableCell className="text-right">
                {inst.extraPayment ? formatDop(inst.extraPayment) : "—"}
              </TableCell>
              <TableCell>{statusBadge(inst.status)}</TableCell>
              {editable && loanId && (
                <TableCell>
                  <CuotaStatusButton
                    loanId={loanId}
                    number={inst.number}
                    status={inst.status}
                    save={async (before, after) => {
                      const res = await fetch(
                        `/api/sheet/loans/${encodeURIComponent(loanId)}/cuotas/${encodeURIComponent(inst.number)}/status`,
                        {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ before, after }),
                        },
                      );
                      return parseEditResponse(res);
                    }}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function LoanScheduleTabs({ loan, editable }: LoanScheduleTabsProps) {
  const hasProjection =
    loan.projection && loan.projection.projectedSchedule.length > 0;
  const hasAbonos = loan.abonos.length > 0;

  if (!hasProjection || !hasAbonos) {
    return loan.schedule.length > 0 ? (
      <ScheduleTable rows={loan.schedule} loanId={loan.id} editable={editable} />
    ) : (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        {loan.name} no tiene cronograma detallado.
      </div>
    );
  }

  return (
    <Tabs defaultValue="sheet">
      <TabsList className="mb-3">
        <TabsTrigger value="sheet" className="gap-1">
          <FileSpreadsheet className="size-3.5" /> Según la hoja
        </TabsTrigger>
        <TabsTrigger value="projected" className="gap-1">
          <Sparkles className="size-3.5" /> Proyección con abonos (local)
        </TabsTrigger>
      </TabsList>
      <TabsContent value="sheet">
        <ScheduleTable rows={loan.schedule} loanId={loan.id} editable={editable} />
      </TabsContent>
      <TabsContent value="projected">
        {loan.projection ? (
          <ScheduleTable rows={loan.projection.projectedSchedule} />
        ) : (
          <p className="text-sm text-muted-foreground">Proyección no disponible.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
