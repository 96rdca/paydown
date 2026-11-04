"use client";

import { formatDop, formatUsd } from "@/lib/format";
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

export interface UtilizationChartData {
  name: string;
  utilizacion: number;
  balance: number;
  usdBalance: number | null;
}

export function UtilizationChart({
  data,
}: {
  data: UtilizationChartData[];
}) {
  return (
    <ChartContainer
      config={{
        utilizacion: {
          label: "Utilización %",
          color: "hsl(var(--chart-1))",
        },
      }}
      className="aspect-[4/3]"
    >
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          dataKey="name"
          type="category"
          width={90}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <span>
                  {value}% ({formatDop(item.payload.balance)}
                  {item.payload.usdBalance
                    ? ` · ${formatUsd(item.payload.usdBalance)}`
                    : ""}
                  )
                </span>
              )}
            />
          }
        />
        <Bar
          dataKey="utilizacion"
          radius={[0, 4, 4, 0]}
          fill="hsl(var(--chart-1))"
        />
      </BarChart>
    </ChartContainer>
  );
}
