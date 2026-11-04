import { Suspense } from "react";
import { io } from "next/cache";
import { getSnapshot } from "@/lib/sheets/snapshot";
import { formatDop, formatDate } from "@/lib/format";
import { Footer } from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { AhorroChart } from "@/components/charts/ahorro-chart";
import type { SavingsPlan, SavingsWeek } from "@/lib/types";
import { PiggyBank, Trophy } from "lucide-react";

function latestWeek(weeks: SavingsWeek[]): SavingsWeek | null {
  if (!weeks.length) return null;
  return weeks[weeks.length - 1];
}

function AhorroSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <Skeleton className="mb-2 h-3 w-20" />
              <Skeleton className="h-7 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="py-8">
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="py-24">
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

async function AhorroContent() {
  await io();
  const snapshot = await getSnapshot();
  const savings: SavingsPlan | null = snapshot.savings;

  if (!savings) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Ahorro</h1>
        <p className="text-muted-foreground">No hay plan de ahorro activo.</p>
        <Footer snapshot={snapshot} />
      </div>
    );
  }

  const latest = latestWeek(savings.weeks);
  const progress = (savings.current / savings.target) * 100;

  const chartData = savings.weeks.map((w: SavingsWeek) => ({
    semana: w.week,
    deposito: w.deposit,
    acumulado: w.cumulative,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {savings.name}
        </h1>
        <p className="text-muted-foreground">Reto de 52 semanas.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Meta</p>
            <p className="text-xl font-semibold">{formatDop(savings.target)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Acumulado</p>
            <p className="text-xl font-semibold text-emerald-600">
              {formatDop(savings.current)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Progreso</p>
            <p className="text-xl font-semibold">{progress.toFixed(1)}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Última semana</p>
            <p className="text-xl font-semibold">
              {latest ? `Semana ${latest.week}` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4" /> Progreso hacia la meta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Progress value={progress} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            {formatDop(savings.current)} de {formatDop(savings.target)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="size-4" /> Depósitos semanales
          </CardTitle>
          <CardDescription>Depósito acumulado por semana</CardDescription>
        </CardHeader>
        <CardContent>
          <AhorroChart data={chartData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cronograma de semanas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {savings.weeks.slice(-8).map((week: SavingsWeek) => {
              const isLatest = latest && week.week === latest.week;
              return (
                <div
                  key={week.week}
                  className={`rounded-lg border p-3 transition-colors ${
                    isLatest
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Semana {week.week}
                    </span>
                    {isLatest && (
                      <Badge
                        variant="secondary"
                        className="bg-emerald-500/10 text-emerald-600"
                      >
                        Actual
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(week.date)}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {formatDop(week.deposit)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Acum: {formatDop(week.cumulative)}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Footer snapshot={snapshot} />
    </div>
  );
}

export default function AhorroPage() {
  return (
    <Suspense fallback={<AhorroSkeleton />}>
      <AhorroContent />
    </Suspense>
  );
}
