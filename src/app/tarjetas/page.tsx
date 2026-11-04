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
import { cardUtilization } from "@/lib/projection";
import type { AugmentedCard, CardTotals, CardUtilization } from "@/lib/types";
import { CreditCard } from "lucide-react";

/**
 * The utilization badge reflects the worst pool: for separate-pool cards the
 * highest of the DOP / USD utilizations, for shared-pool cards the combined
 * value. This is what matters to a bank when judging credit exposure.
 */
function worstUtilization(util: CardUtilization): number | null {
  if (util.kind === "none") return null;
  if (util.kind === "shared") return util.combined;
  const worst = Math.max(util.dop ?? 0, util.usd ?? 0);
  return worst > 0 ? worst : null;
}

function utilizationBadgePercent(util: CardUtilization): number | null {
  const raw = worstUtilization(util);
  if (raw === null) return null;
  return Math.min(100, Math.round(raw * 100));
}

function PoolGaugeRow({
  label,
  util,
  balance,
  limit,
  currency,
}: {
  label: string;
  util: number | null;
  balance: number | null;
  limit: number | null;
  currency: "dop" | "usd";
}) {
  if (util === null) {
    return (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">—</span>
      </div>
    );
  }

  const pct = Math.min(100, Math.round(util * 100));
  const formatMoney = currency === "dop" ? formatDop : formatUsd;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <p className="text-xs text-muted-foreground">
        {formatMoney(balance)} / {formatMoney(limit)}
      </p>
    </div>
  );
}

function UtilizationGauges({
  card,
  util,
  rate,
}: {
  card: AugmentedCard;
  util: CardUtilization;
  rate: number;
}) {
  if (util.kind === "none") {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium">Utilización</p>
        <p className="text-xs text-muted-foreground">—</p>
      </div>
    );
  }

  if (util.kind === "shared") {
    const pct =
      util.combined !== null ? Math.min(100, Math.round(util.combined * 100)) : null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Combinado (RD$ + US$)</span>
          <span className="tabular-nums">{pct !== null ? `${pct}%` : "—"}</span>
        </div>
        <Progress value={pct ?? 0} className="h-1.5" />
        <p className="text-xs text-muted-foreground">
          Límite compartido: {formatDop(card.limitDop)}
          {card.statementBalanceUsd !== null && card.statementBalanceUsd !== 0 && (
            <>
              {" "}· {formatUsd(card.statementBalanceUsd)} ={" "}
              {formatDop(card.statementBalanceUsd * rate)}
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Utilización</p>
      <PoolGaugeRow
        label="DOP"
        util={util.dop}
        balance={card.statementBalanceDop}
        limit={card.limitDop}
        currency="dop"
      />
      <PoolGaugeRow
        label="USD"
        util={util.usd}
        balance={card.statementBalanceUsd}
        limit={card.limitUsd}
        currency="usd"
      />
    </div>
  );
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
  const badgePct = utilizationBadgePercent(util);
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
            {badgePct !== null && (
              <Badge
                variant="secondary"
                className={
                  badgePct >= 80
                    ? "bg-red-500/10 text-red-600"
                    : badgePct >= 50
                      ? "bg-amber-500/10 text-amber-600"
                      : "bg-emerald-500/10 text-emerald-600"
                }
              >
                {badgePct}%
              </Badge>
            )}
            {card.sharedLimitDopUsd && (
              <Badge variant="outline" className="text-[10px] font-normal">
                Límite compartido
              </Badge>
            )}
            <div className="flex items-center gap-1">
              {editable && <CardEditDialog card={card} />}
              <CardRateDialog
                cardId={card.id}
                bank={card.bank}
                currentRate={card.monthlyRate}
                sharedLimitDopUsd={card.sharedLimitDopUsd}
              />
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

        <UtilizationGauges card={card} util={util} rate={rate} />

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
