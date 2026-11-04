"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMonthlyRate } from "@/lib/format";
import { Settings2, X } from "lucide-react";

interface CardRateDialogProps {
  cardId: string;
  bank: string;
  currentRate: number | null;
}

function parsePercentInput(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 100) return null;
  return parsed / 100;
}

function formatPercentInput(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return "";
  return (rate * 100).toFixed(2);
}

export function CardRateDialog({
  cardId,
  bank,
  currentRate,
}: CardRateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [raw, setRaw] = React.useState(formatPercentInput(currentRate));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setRaw(formatPercentInput(currentRate));
      setError(null);
    }
  }

  const parsed = parsePercentInput(raw);
  const changed =
    parsed !== currentRate &&
    !(parsed === null && currentRate === null) &&
    !(parsed !== null && currentRate !== null && Math.abs(parsed - currentRate) < 0.000_001);

  async function save() {
    if (!changed) return;
    const monthlyRate = raw.trim() === "" ? null : parsed;
    if (monthlyRate === undefined) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/overlay/cards/${encodeURIComponent(cardId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyRate: monthlyRate }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "No se pudo guardar la tasa.");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setSaving(false);
    }
  }

  function clear() {
    setRaw("");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto gap-1 px-2 py-1 text-xs">
          <Settings2 className="size-3" />
          {currentRate !== null ? (
            <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/15">
              {formatMonthlyRate(currentRate)}
            </Badge>
          ) : (
            <span>Configurar tasa</span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Configurar tasa mensual</DialogTitle>
          <DialogDescription>
            {bank} — tasa de interés que aplica la tarjeta cada mes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label htmlFor="rate" className="text-sm font-medium">
              Tasa mensual (%)
            </label>
            <div className="relative">
              <Input
                id="rate"
                inputMode="decimal"
                placeholder="2.55"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                className="pr-8"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                %
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Ejemplo: 2.55 equivale a 2.55 % mensual.
            </p>
          </div>
          {currentRate !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              className="h-auto gap-1 px-0 text-xs text-muted-foreground hover:text-destructive"
            >
              <X className="size-3" /> Borrar tasa configurada
            </Button>
          )}
          {error && (
            <p className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={save}
            disabled={saving || !changed || (raw.trim() !== "" && parsed === null)}
            className="w-full sm:w-auto"
          >
            {saving ? "Guardando..." : "Guardar tasa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
