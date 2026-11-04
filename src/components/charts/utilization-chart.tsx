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

export interface UtilizationChartData {
  name: string;
  utilizacion: number;
  kind: "separate" | "shared" | "none";
  dopUtil: number | null;
  usdUtil: number | null;
  combinedUtil: number | null;
  balanceDop: number | null;
  balanceUsd: number | null;
  limitDop: number | null;
  limitUsd: number | null;
  rate: number;
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
              formatter={(_value, _name, item) => {
                const payload = item.payload as UtilizationChartData;
                if (payload.kind === "shared") {
                  const combinedBalance =
                    (payload.balanceDop ?? 0) +
                    (payload.balanceUsd ?? 0) * payload.rate;
                  return (
                    <span>
                      {payload.utilizacion}% (
                      {formatDop(combinedBalance)} / {formatDop(payload.limitDop)})
                    </span>
                  );
                }

                const parts: string[] = [];
                if (payload.dopUtil !== null) {
                  parts.push(`DOP ${(payload.dopUtil * 100).toFixed(1)}%`);
                }
                if (payload.usdUtil !== null) {
                  parts.push(`USD ${(payload.usdUtil * 100).toFixed(1)}%`);
                }
                return (
                  <span>
                    {payload.utilizacion}%
                    {parts.length > 0 && (
                      <>
                        {" "}({parts.join(" · ")})
                      </>
                    )}
                  </span>
                );
              }}
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
