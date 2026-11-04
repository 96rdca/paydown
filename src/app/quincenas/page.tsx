import { Suspense } from "react";
import { io } from "next/cache";
import { getFinancialState } from "@/lib/state";
import { isSheetWriteConfigured } from "@/lib/gsheets/config";
import { formatDop } from "@/lib/format";
import { Footer } from "@/components/footer";
import { SheetEditMoneyEndpoint } from "@/components/sheet-edit";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PayPeriod, BudgetItem } from "@/lib/types";

function EditableSalary({
  period,
  editable,
}: {
  period: PayPeriod;
  editable: boolean;
}) {
  if (!editable) return <p className="text-xl font-semibold">{formatDop(period.salary)}</p>;
  return (
    <p className="text-xl font-semibold">
      <SheetEditMoneyEndpoint
        value={period.salary}
        endpoint={`/api/sheet/periods/${encodeURIComponent(period.id)}/salary`}
        before={period.salary}
      />
    </p>
  );
}

function EditableItemAmount({
  periodId,
  item,
  editable,
}: {
  periodId: string;
  item: BudgetItem;
  editable: boolean;
}) {
  if (!editable) return <span>{formatDop(item.amountDop)}</span>;
  return (
    <SheetEditMoneyEndpoint
      value={item.amountDop}
      endpoint={`/api/sheet/periods/${encodeURIComponent(periodId)}/items/${encodeURIComponent(item.id)}`}
      before={item.amountDop}
    />
  );
}

function PeriodPanel({
  period,
  editable,
}: {
  period: PayPeriod;
  editable: boolean;
}) {
  const committed = period.salary - period.surplusDop;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Sueldo</p>
            <EditableSalary period={period} editable={editable} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Compromisos</p>
            <p className="text-xl font-semibold">{formatDop(committed)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Sobrante</p>
            <p
              className={`text-xl font-semibold ${
                period.surplusDop >= 0 ? "text-emerald-600" : "text-destructive"
              }`}
            >
              {formatDop(period.surplusDop)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-right">Nota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {period.items.map((item: BudgetItem) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.label}</TableCell>
                <TableCell className="text-right">
                  <EditableItemAmount periodId={period.id} item={item} editable={editable} />
                </TableCell>
                <TableCell className="text-right">
                  {item.isUsdBilled && (
                    <Badge variant="outline">Facturado en USD</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 font-medium">
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{formatDop(committed)}</TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function QuincenasSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-8 w-32" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

async function QuincenasContent() {
  await io();
  const state = await getFinancialState();
  const editable = isSheetWriteConfigured();
  const q15 = state.snapshot.periods.find((p: PayPeriod) => p.id === "Q15");
  const q30 = state.snapshot.periods.find((p: PayPeriod) => p.id === "Q30");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quincenas</h1>
        <p className="text-muted-foreground">
          Sueldo y compromisos de cada quincena.
        </p>
      </div>

      <Tabs defaultValue="Q15">
        <TabsList>
          <TabsTrigger value="Q15">Q 15</TabsTrigger>
          <TabsTrigger value="Q30">Q 30</TabsTrigger>
        </TabsList>
        <TabsContent value="Q15" className="mt-4">
          {q15 ? <PeriodPanel period={q15} editable={editable} /> : <p>Sin datos.</p>}
        </TabsContent>
        <TabsContent value="Q30" className="mt-4">
          {q30 ? <PeriodPanel period={q30} editable={editable} /> : <p>Sin datos.</p>}
        </TabsContent>
      </Tabs>

      <Footer snapshot={state.snapshot} />
    </div>
  );
}

export default function QuincenasPage() {
  return (
    <Suspense fallback={<QuincenasSkeleton />}>
      <QuincenasContent />
    </Suspense>
  );
}
