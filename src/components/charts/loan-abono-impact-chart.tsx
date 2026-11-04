"use client";

import * as React from "react";
import { simulateLoan } from "@/lib/projection";
import { formatDop } from "@/lib/format";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import type { AugmentedLoan, LoanAbono } from "@/lib/types";

interface LoanAbonoImpactChartProps {
  loan: AugmentedLoan;
  usdRate: number;
  draftAbono: LoanAbono | null;
}

interface ChartPoint {
  mes: number;
  sinAbono: number | null;
  conAbono: number | null;
}

export function LoanAbonoImpactChart({
  loan,
  usdRate,
  draftAbono,
}: LoanAbonoImpactChartProps) {
  const data = React.useMemo<ChartPoint[]>(() => {
    const baseline = simulateLoan(loan, [], usdRate);
    const withDraft = draftAbono
      ? simulateLoan(loan, [...loan.abonos, draftAbono], usdRate)
      : null;

    if (!baseline) return [];

    const maxMonths = Math.max(
      baseline.projectedSchedule.length,
      withDraft?.projectedSchedule.length ?? 0,
    );

    return Array.from({ length: maxMonths }, (_, i) => ({
      mes: baseline.projectedSchedule[i]?.number ?? i + 1,
      sinAbono: baseline.projectedSchedule[i]?.endingBalance ?? null,
      conAbono: withDraft?.projectedSchedule[i]?.endingBalance ?? null,
    }));
  }, [loan, usdRate, draftAbono]);

  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No se pudo generar la curva de saldos.
      </p>
    );
  }

  return (
    <ChartContainer
      config={{
        sinAbono: {
          label: "Sin abono",
          color: "hsl(var(--muted-foreground))",
        },
        conAbono: {
          label: "Con abono simulado",
          color: "hsl(var(--chart-2))",
        },
      }}
      className="aspect-[16/9] w-full"
    >
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="mes"
          tick={{ fontSize: 10 }}
          label={{ value: "Cuota", position: "insideBottom", offset: -4, fontSize: 10 }}
        />
        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={(v: number) => `RD$${(v / 1000).toFixed(0)}k`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => `Cuota ${label}`}
              formatter={(value) =>
                value !== null && value !== undefined
                  ? [formatDop(typeof value === "number" ? value : 0), "Saldo"]
                  : ["—", "Saldo"]
              }
            />
          }
        />
        <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey="sinAbono"
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="4 4"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="conAbono"
          stroke="hsl(var(--chart-2))"
          strokeWidth={2}
          dot={false}
          connectNulls={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
