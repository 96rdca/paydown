"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDop, formatUsd, formatDate, parseMoneyInput } from "@/lib/format";
import { todayIso } from "@/lib/projection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { AugmentedCard } from "@/lib/types";
import { Plus, Trash2, Receipt, CreditCard, Check, X, Loader2 } from "lucide-react";

interface CardPaymentsProps {
  card: AugmentedCard;
}

function isRecentPayment(date: string): boolean {
  const now = new Date();
  const d = new Date(date);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export function CardPayments({ card }: CardPaymentsProps) {
  const router = useRouter();
  const [date, setDate] = React.useState(todayIso());
  const [amountDop, setAmountDop] = React.useState("");
  const [amountUsd, setAmountUsd] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const hasRecent = card.payments.some((p) => isRecentPayment(p.date));

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    const dop = parseMoneyInput(amountDop);
    if (dop === null) {
      setError("El monto en RD$ es obligatorio.");
      return;
    }
    const usd = amountUsd.trim() === "" ? null : parseMoneyInput(amountUsd);
    if (amountUsd.trim() !== "" && usd === null) {
      setError("El monto en US$ no es válido.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/overlay/card-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: card.id,
          date,
          amountDop: dop,
          amountUsd: usd,
          note: note.trim() === "" ? null : note.trim(),
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "No se pudo registrar el pago.");
      }
      setAmountDop("");
      setAmountUsd("");
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar el pago.");
    } finally {
      setSaving(false);
    }
  }

  async function deletePayment(id: string) {
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/overlay/card-payments/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "No se pudo eliminar el pago.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el pago.");
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <Receipt className="size-3.5 text-muted-foreground" /> Pagos registrados
        </h4>
        {hasRecent && (
          <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <CreditCard className="mr-1 size-3" /> pagado este ciclo
          </Badge>
        )}
      </div>

      {card.payments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aún no hay pagos registrados.</p>
      ) : (
        <ul className="space-y-2">
          {card.payments.map((payment) => (
            <li
              key={payment.id}
              className="flex items-start justify-between gap-2 rounded-lg border p-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{formatDate(payment.date)}</span>
                  <span className="text-muted-foreground">{formatDop(payment.amountDop)}</span>
                  {payment.amountUsd !== null && payment.amountUsd > 0 && (
                    <span className="text-muted-foreground">{formatUsd(payment.amountUsd)}</span>
                  )}
                </div>
                {payment.note && (
                  <p className="truncate text-xs text-muted-foreground">{payment.note}</p>
                )}
              </div>
              {confirming === payment.id ? (
                <span className="inline-flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">¿Eliminar?</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => void deletePayment(payment.id)}
                    disabled={deleting === payment.id}
                    title="Sí, eliminar"
                  >
                    {deleting === payment.id ? (
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
                    disabled={deleting === payment.id}
                    title="Cancelar"
                  >
                    <X className="size-3 text-muted-foreground" />
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Eliminar pago"
                  onClick={() => setConfirming(payment.id)}
                  disabled={deleting === payment.id}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addPayment} className="space-y-3 rounded-lg border p-3">
        <p className="text-xs font-medium">Registrar pago</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`payment-date-${card.id}`} className="text-xs text-muted-foreground">
              Fecha
            </label>
            <Input
              id={`payment-date-${card.id}`}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`payment-dop-${card.id}`} className="text-xs text-muted-foreground">
              Monto RD$
            </label>
            <Input
              id={`payment-dop-${card.id}`}
              inputMode="decimal"
              placeholder="0.00"
              value={amountDop}
              onChange={(e) => setAmountDop(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`payment-usd-${card.id}`} className="text-xs text-muted-foreground">
              Monto US$ (opcional)
            </label>
            <Input
              id={`payment-usd-${card.id}`}
              inputMode="decimal"
              placeholder="0.00"
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor={`payment-note-${card.id}`} className="text-xs text-muted-foreground">
              Nota (opcional)
            </label>
            <Input
              id={`payment-note-${card.id}`}
              placeholder="Ej. Pago mínimo"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        <Button
          type="submit"
          size="sm"
          disabled={saving}
          className="w-full sm:w-auto"
        >
          <Plus className="mr-1 size-3.5" />
          {saving ? "Guardando..." : "Registrar pago"}
        </Button>
      </form>
    </div>
  );
}
