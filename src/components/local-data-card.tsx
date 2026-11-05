import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Database, CreditCard, Receipt, PiggyBank } from "lucide-react";
import type { FinancialState } from "@/lib/types";

interface LocalDataCardProps {
  state: FinancialState;
}

export function LocalDataCard({ state }: LocalDataCardProps) {
  const cardsWithRate = state.cards.filter((card) => card.monthlyRate !== null).length;
  const paymentsCount = state.cards.reduce(
    (sum, card) => sum + card.payments.length,
    0,
  );
  const abonosCount = state.loans.reduce(
    (sum, loan) => sum + loan.abonos.length,
    0,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="size-4 text-primary" /> Datos locales de la app
        </CardTitle>
        <CardDescription>
          Información que guarda la app por encima de la hoja de Google.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <CreditCard className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tarjetas con tasa</p>
              <p className="text-lg font-semibold">{cardsWithRate}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Receipt className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagos registrados</p>
              <p className="text-lg font-semibold">{paymentsCount}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border p-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <PiggyBank className="size-4" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Abonos permanentes</p>
              <p className="text-lg font-semibold">{abonosCount}</p>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Los abonos y tasas se guardan localmente en la app; la hoja sigue siendo la fuente
          oficial.
        </p>
      </CardContent>
    </Card>
  );
}
