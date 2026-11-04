"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { simulateLoan } from "@/lib/projection";
import { todayIso } from "@/lib/projection";
import { formatDop, formatDate, parseMoneyInput } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { AugmentedLoan, LoanAbono } from "@/lib/types";
import { Calculator, Save, TrendingDown, Calendar, Clock } from "lucide-react";
import { LoanAbonoImpactChart } from "@/components/charts/loan-abono-impact-chart";

interface LoanAbonoSimulatorProps {
  loan: AugmentedLoan;
  usdRate: number;
}

export function LoanAbonoSimulator({ loan, usdRate }: LoanAbonoSimulatorProps) {
  const router = useRouter();
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(todayIso());
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const amountValue = parseMoneyInput(amount);
  const draftAbono: LoanAbono | null = React.useMemo(() => {
    if (amountValue === null || amountValue <= 0) return null;
    return {
      id: "draft",
      loanId: loan.id,
      date,
      amount: amountValue,
      note: note.trim() === "" ? null : note.trim(),
    };
  }, [amountValue, loan.id, date, note]);

  const projection = React.useMemo(() => {
    if (!loan.projection) return null;
    if (!draftAbono) return loan.projection;
    return simulateLoan(loan, [...loan.abonos, draftAbono], usdRate);
  }, [loan, draftAbono, usdRate]);

  async function makePermanent() {
    if (!draftAbono) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/overlay/loan-abonos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loanId: loan.id,
          date: draftAbono.date,
          amount: draftAbono.amount,
          note: draftAbono.note,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "No se pudo guardar el abono.");
      }
      setAmount("");
      setNote("");
      setDate(todayIso());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setSaving(false);
    }
  }

  if (!loan.projection) {
    return null;
  }

  const hasSimulation = projection && projection !== loan.projection;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="size-4 text-primary" /> Simulador de abono
            </CardTitle>
            <CardDescription>
              Prueba un abono extra y conviértelo en permanente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor={`abono-amount-${loan.id}`} className="text-xs font-medium">
              Monto (RD$)
            </label>
            <Input
              id={`abono-amount-${loan.id}`}
              inputMode="decimal"
              placeholder="5,000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`abono-date-${loan.id}`} className="text-xs font-medium">
              Fecha
            </label>
            <Input
              id={`abono-date-${loan.id}`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`abono-note-${loan.id}`} className="text-xs font-medium">
              Nota (opcional)
            </label>
            <Input
              id={`abono-note-${loan.id}`}
              placeholder="Ej. Bono"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        {hasSimulation && projection && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-emerald-500/10 p-3">
                <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <Clock className="size-3" /> Meses ahorrados
                </p>
                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                  {projection.monthsSaved}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-500/10 p-3">
                <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                  <TrendingDown className="size-3" /> Interés ahorrado
                </p>
                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatDop(projection.interestSaved)}
                </p>
              </div>
              <div className="rounded-lg bg-primary/10 p-3">
                <p className="flex items-center gap-1 text-xs text-primary">
                  <Calendar className="size-3" /> Nueva fecha final
                </p>
                <p className="text-lg font-semibold text-primary">
                  {formatDate(projection.withAbonos.endDate)}
                </p>
              </div>
            </div>

            <LoanAbonoImpactChart
              loan={loan}
              usdRate={usdRate}
              draftAbono={draftAbono}
            />
          </div>
        )}

        {!hasSimulation && amount.trim() !== "" && amountValue === null && (
          <p className="text-xs text-destructive">El monto no es válido.</p>
        )}

        {error && (
          <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button
          onClick={makePermanent}
          disabled={saving || draftAbono === null}
          className="w-full sm:w-auto"
        >
          <Save className="mr-1.5 size-4" />
          {saving ? "Guardando..." : "Hacer permanente"}
        </Button>
      </CardContent>
    </Card>
  );
}
