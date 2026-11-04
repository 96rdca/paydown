"use client";

import { formatDop } from "@/lib/format";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

export interface AhorroChartData {
  semana: number;
  deposito: number;
  acumulado: number;
}

export function AhorroChart({ data }: { data: AhorroChartData[] }) {
  return (
    <ChartContainer
      config={{
        deposito: {
          label: "Depósito",
          color: "hsl(var(--chart-3))",
        },
        acumulado: {
          label: "Acumulado",
          color: "hsl(var(--chart-4))",
        },
      }}
      className="aspect-[16/7]"
    >
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
        <YAxis
          tick={{ fontSize: 10 }}
          tickFormatter={(v: number) => `RD$${(v / 1000).toFixed(0)}k`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(label) => `Semana ${label}`}
              formatter={(value) => [
                formatDop(typeof value === "number" ? value : 0),
                "",
              ]}
            />
          }
        />
        <Bar dataKey="deposito" radius={[4, 4, 0, 0]} />
        <Bar dataKey="acumulado" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
