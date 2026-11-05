import { formatDop, formatDate, formatInteger } from "@/lib/format";
import type { CardProjection } from "@/lib/types";
import { TrendingUp, Zap, AlertCircle } from "lucide-react";

interface CardInterestPanelProps {
  projection: CardProjection;
}

export function CardInterestPanel({ projection }: CardInterestPanelProps) {
  return (
    <div className="space-y-3 rounded-lg bg-muted/50 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="size-3" /> Interés del mes
          </p>
          <p className="text-base font-semibold tracking-tight">
            {formatDop(projection.monthlyInterestDop)}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="size-3" /> Pagar total ahora
          </p>
          <p className="text-base font-semibold tracking-tight">
            {formatDop(projection.payoffNowDop)}
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">cero intereses</p>
        </div>
      </div>

      <div className="border-t border-border/50 pt-3">
        {projection.minPayoff ? (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Solo pago mínimo
            </p>
            <p className="text-sm">
              <span className="font-medium">
                {formatInteger(projection.minPayoff.months)} meses
              </span>
              {" · "}
              <span className="text-muted-foreground">
                {formatDop(projection.minPayoff.totalInterest)} de intereses
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Termina {formatDate(projection.minPayoff.endDate)}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <div>
              <span className="font-medium text-foreground">Simulación no disponible:</span>{" "}
              {projection.minPayoffBlockedReason ?? "Sin datos suficientes."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
