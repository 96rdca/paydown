"use client";

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
} from "recharts";

export interface LoanBalanceChartData {
  cuota: number;
  saldo: number;
  fecha: string;
}

export function LoanBalanceChart({ data }: { data: LoanBalanceChartData[] }) {
  return (
    <ChartContainer
      config={{
        saldo: {
          label: "Saldo restante",
          color: "hsl(var(--chart-2))",
        },
      }}
      className="aspect-[4/3]"
    >
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="cuota" tick={{ fontSize: 10 }} />
        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={(v: number) => `RD$${(v / 1000).toFixed(0)}k`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => `Cuota ${label}`}
              formatter={(value) => [
                formatDop(typeof value === "number" ? value : 0),
                "Saldo",
              ]}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="saldo"
          stroke="hsl(var(--chart-2))"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
