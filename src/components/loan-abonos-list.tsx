"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDop, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AugmentedLoan } from "@/lib/types";
import { Trash2, PiggyBank, ScrollText, Check, X, Loader2 } from "lucide-react";

interface LoanAbonosListProps {
  loan: AugmentedLoan;
}

export function LoanAbonosList({ loan }: LoanAbonosListProps) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function deleteAbono(id: string) {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/overlay/loan-abonos/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "No se pudo eliminar el abono.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el abono.");
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  }

  const totalSaved = loan.projection?.interestSaved ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <ScrollText className="size-3.5 text-muted-foreground" /> Abonos permanentes
        </h4>
        {totalSaved > 0 && (
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <PiggyBank className="mr-1 size-3" /> Interés ahorrado total{" "}
            {formatDop(totalSaved)}
          </Badge>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {loan.abonos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aún no hay abonos registrados.</p>
      ) : (
        <ul className="space-y-2">
          {loan.abonos.map((abono) => (
            <li
              key={abono.id}
              className="flex items-start justify-between gap-2 rounded-lg border p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{formatDate(abono.date)}</span>
                  <span className="text-muted-foreground">{formatDop(abono.amount)}</span>
                </div>
                {abono.note && (
                  <p className="truncate text-xs text-muted-foreground">{abono.note}</p>
                )}
              </div>
              {confirming === abono.id ? (
                <span className="inline-flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">¿Eliminar?</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void deleteAbono(abono.id)}
                    disabled={deleting === abono.id}
                    title="Sí, eliminar"
                  >
                    {deleting === abono.id ? (
                      <Loader2 className="size-3 animate-spin text-muted-foreground" />
                    ) : (
                      <Check className="size-3 text-destructive" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setConfirming(null)}
                    disabled={deleting === abono.id}
                    title="Cancelar"
                  >
                    <X className="size-3 text-muted-foreground" />
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Eliminar abono"
                  onClick={() => setConfirming(abono.id)}
                  disabled={deleting === abono.id}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
