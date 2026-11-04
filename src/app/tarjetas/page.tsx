import { Suspense } from "react";
import { io } from "next/cache";
import { getFinancialState } from "@/lib/state";
import { isSheetWriteConfigured } from "@/lib/gsheets/config";
import { formatDop, formatUsd, formatMonthlyRate } from "@/lib/format";
import { MoneyInline } from "@/components/money";
import { Footer } from "@/components/footer";
import { CardRateDialog } from "@/components/card-rate-dialog";
import { CardEditDialog } from "@/components/card-edit-dialog";
import { CardInterestPanel } from "@/components/card-interest-panel";
import { CardPayments } from "@/components/card-payments";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { AugmentedCard, CardTotals } from "@/lib/types";
import { CreditCard } from "lucide-react";

function cardUtilization(card: AugmentedCard, rate: number): number | null {
  const limitDop = card.limitDop ?? 0;
  const limitUsdDop = (card.limitUsd ?? 0) * rate;
  const balanceDop = card.statementBalanceDop ?? 0;
  const balanceUsdDop = (card.statementBalanceUsd ?? 0) * rate;
  const limit = limitDop + limitUsdDop;
  const balance = balanceDop + balanceUsdDop;
  if (limit === 0 || (card.limitDop === null && card.limitUsd === null)) {
    return null;
  }
  return Math.min(100, Math.round((balance / limit) * 100));
}

function CardItem({
  card,
  rate,
  editable,
}: {
  card: AugmentedCard;
  rate: number;
  editable: boolean;
}) {
  const util = cardUtilization(card, rate);
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <CreditCard className="size-4" />
            </div>
            <div>
              <CardTitle className="text-base">{card.bank}</CardTitle>
              <CardDescription className="text-xs">
                Corte {card.closingDay ?? "—"} · Vence {card.dueDay ?? "—"}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {util !== null && (
              <Badge
                variant="secondary"
                className={
                  util >= 80
                    ? "bg-red-500/10 text-red-600"
                    : util >= 50
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-emerald-500/10 text-emerald-600"
                }
              >
                {util}%
              </Badge>
            )}
            <div className="flex items-center gap-1">
              {editable && <CardEditDialog card={card} />}
              <CardRateDialog cardId={card.id} bank={card.bank} currentRate={card.monthlyRate} />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Límite</p>
            <MoneyInline dop={card.limitDop} usd={card.limitUsd} rate={rate} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Balance</p>
            <MoneyInline
              dop={card.statementBalanceDop}
              usd={card.statementBalanceUsd}
              rate={rate}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Disponible</p>
            <MoneyInline
              dop={card.availableDop}
              usd={card.availableUsd}
              rate={rate}
            />
          </div>
        </div>
        {util !== null ? <Progress value={util} className="h-1.5" /> : null}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Pago mínimo: {formatDop(card.minPaymentDop)} / {formatUsd(card.minPaymentUsd)}
          </span>
          <span>
            {card.monthlyRate !== null ? formatMonthlyRate(card.monthlyRate) : "Tasa: por configurar"}
          </span>
        </div>

        {card.projection && <CardInterestPanel projection={card.projection} />}
        <Separator />
        <CardPayments card={card} />
      </CardContent>
    </Card>
  );
}

function TarjetasSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
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
      <Separator />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-4 py-6">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

async function TarjetasContent() {
  await io();
  const state = await getFinancialState();
  const editable = isSheetWriteConfigured();
  const rate = state.snapshot.settings.usdRate;
  const totals: CardTotals = state.snapshot.cardTotals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tarjetas</h1>
        <p className="text-muted-foreground">
          Límites, balances, tasas y pagos registrados.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Límite total</p>
            <MoneyInline dop={totals.limitDop} usd={totals.limitUsd} rate={rate} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Balance total</p>
            <MoneyInline
              dop={totals.statementBalanceDop}
              usd={totals.statementBalanceUsd}
              rate={rate}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Disponible total</p>
            <MoneyInline
              dop={totals.availableDop}
              usd={totals.availableUsd}
              rate={rate}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">Pago mínimo total</p>
            <MoneyInline
              dop={totals.minPaymentDop}
              usd={totals.minPaymentUsd}
              rate={rate}
            />
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {state.cards.map((card: AugmentedCard) => (
          <CardItem key={card.id} card={card} rate={rate} editable={editable} />
        ))}
      </div>

      <Footer snapshot={state.snapshot} />
    </div>
  );
}

export default function TarjetasPage() {
  return (
    <Suspense fallback={<TarjetasSkeleton />}>
      <TarjetasContent />
    </Suspense>
  );
}
