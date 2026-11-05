"use client";

import * as React from "react";
import { formatDop } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Calculator } from "lucide-react";

interface ScheduleRow {
  number: number;
  beginningBalance: number;
  payment: number;
  interest: number;
  principal: number;
  endingBalance: number;
}

function calculateAmortization(
  principal: number,
  annualRatePct: number,
  months: number,
): { payment: number; schedule: ScheduleRow[] } {
  const r = annualRatePct / 100 / 12;
  const payment =
    r === 0
      ? principal / months
      : (principal * r) / (1 - Math.pow(1 + r, -months));

  const schedule: ScheduleRow[] = [];
  let balance = principal;

  for (let i = 1; i <= months; i++) {
    const interest = balance * r;
    const principalPaid = payment - interest;
    const beginning = balance;
    balance = balance - principalPaid;
    if (balance < 0) balance = 0;
    schedule.push({
      number: i,
      beginningBalance: beginning,
      payment,
      interest,
      principal: principalPaid,
      endingBalance: balance,
    });
  }

  return { payment, schedule };
}

export default function CalculadoraPage() {
  const [amount, setAmount] = React.useState<string>("215000");
  const [rate, setRate] = React.useState<string>("30");
  const [term, setTerm] = React.useState<string>("24");

  const numericAmount = parseFloat(amount) || 0;
  const numericRate = parseFloat(rate) || 0;
  const numericTerm = parseInt(term, 10) || 0;

  const { payment, schedule } = React.useMemo(
    () => calculateAmortization(numericAmount, numericRate, numericTerm),
    [numericAmount, numericRate, numericTerm],
  );

  const chartData = schedule.map((row) => ({
    mes: row.number,
    saldo: row.endingBalance,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Calculadora de préstamo
        </h1>
        <p className="text-muted-foreground">
          Calcula la cuota mensual y el cronograma de amortización.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="size-4" /> Entradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label htmlFor="amount" className="text-sm font-medium">Monto (RD$)</label>
              <Input
                id="amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="rate" className="text-sm font-medium">Tasa anual (%)</label>
              <Input
                id="rate"
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="term" className="text-sm font-medium">Plazo (meses)</label>
              <Input
                id="term"
                type="number"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">Cuota mensual estimada</p>
          <p className="text-3xl font-semibold tracking-tight">
            {formatDop(payment)}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Curva de saldo</CardTitle>
            <CardDescription>Saldo restante mes a mes</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                saldo: {
                  label: "Saldo restante",
                  color: "var(--chart-5)",
                },
              }}
              className="aspect-[4/3]"
            >
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) =>
                    `RD$${(v / 1000).toFixed(0)}k`
                  }
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(label) => `Mes ${label}`}
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
                  stroke="var(--chart-5)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cronograma</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto rounded-xl border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead className="text-right">Saldo inicial</TableHead>
                    <TableHead className="text-right">Interés</TableHead>
                    <TableHead className="text-right">Capital</TableHead>
                    <TableHead className="text-right">Cuota</TableHead>
                    <TableHead className="text-right">Saldo final</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((row) => (
                    <TableRow key={row.number}>
                      <TableCell className="font-medium">
                        {row.number}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatDop(row.beginningBalance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatDop(row.interest)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatDop(row.principal)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatDop(row.payment)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatDop(row.endingBalance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
