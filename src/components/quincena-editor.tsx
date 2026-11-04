"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { parseMoneyInput, formatDop } from "@/lib/format";
import type { BudgetItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import {
  SheetEditMoneyEndpoint,
  SheetEditLabelEndpoint,
  parseEditResponse,
  formatConflictMessage,
} from "@/components/sheet-edit";
import { Trash2, Plus, Loader2, AlertCircle, Check, X } from "lucide-react";

interface EditableItemRowProps {
  periodId: string;
  item: BudgetItem;
}

export function EditableItemRow({ periodId, item }: EditableItemRowProps) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sheet/periods/${encodeURIComponent(periodId)}/items/${encodeURIComponent(item.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: item.label, amountDop: item.amountDop }),
        },
      );
      const result = await parseEditResponse(res);
      if (result.ok) {
        router.refresh();
      } else {
        setError(formatConflictMessage(result.error, result.current));
        if (result.status === 409) {
          window.setTimeout(() => router.refresh(), 1500);
        }
      }
    } catch {
      setError("No se pudo eliminar. Intenta de nuevo.");
    } finally {
      setRemoving(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <TableCell className="font-medium">
        <SheetEditLabelEndpoint
          value={item.label}
          endpoint={`/api/sheet/periods/${encodeURIComponent(periodId)}/items/${encodeURIComponent(item.id)}/label`}
          before={item.label}
        />
      </TableCell>
      <TableCell className="text-right">
        <SheetEditMoneyEndpoint
          value={item.amountDop}
          endpoint={`/api/sheet/periods/${encodeURIComponent(periodId)}/items/${encodeURIComponent(item.id)}`}
          before={item.amountDop}
        />
      </TableCell>
      <TableCell className="text-right">
        {item.isUsdBilled && <Badge variant="outline">Facturado en USD</Badge>}
      </TableCell>
      <TableCell className="text-right">
        {confirming ? (
          <span className="inline-flex items-center gap-1">
            <span className="text-xs text-muted-foreground">¿Eliminar?</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => void remove()}
              disabled={removing}
              title="Sí, eliminar"
            >
              {removing ? (
                <Loader2 className="size-3 animate-spin text-muted-foreground" />
              ) : (
                <Check className="size-3 text-destructive" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setConfirming(false)}
              disabled={removing}
              title="Cancelar"
            >
              <X className="size-3 text-muted-foreground" />
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => setConfirming(true)}
            title="Eliminar gasto"
          >
            <Trash2 className="size-3 text-muted-foreground" />
          </Button>
        )}
        {error && (
          <span className="mt-1 block text-xs text-destructive">
            <AlertCircle className="inline size-3" /> {error}
          </span>
        )}
      </TableCell>
    </>
  );
}

interface AddExpenseFormProps {
  periodId: string;
  defaultOpen?: boolean;
}

export function AddExpenseForm({ periodId, defaultOpen = false }: AddExpenseFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(defaultOpen);
  const [label, setLabel] = React.useState("");
  const [rawAmount, setRawAmount] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<{
    label?: string;
    amount?: string;
  }>({});

  function reset() {
    setLabel("");
    setRawAmount("");
    setError(null);
    setFieldErrors({});
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const nextFieldErrors: { label?: string; amount?: string } = {};
    const trimmedLabel = label.trim();
    if (trimmedLabel === "") {
      nextFieldErrors.label = "El concepto es requerido.";
    } else if (trimmedLabel.length > 60) {
      nextFieldErrors.label = "Máximo 60 caracteres.";
    }

    const amountDop = parseMoneyInput(rawAmount);
    if (amountDop === null) {
      nextFieldErrors.amount = "Monto inválido.";
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/sheet/periods/${encodeURIComponent(periodId)}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: trimmedLabel, amountDop }),
      });
      const result = await parseEditResponse(res);
      if (result.ok) {
        reset();
        setIsOpen(false);
        router.refresh();
      } else {
        setError(formatConflictMessage(result.error, result.current));
        if (result.status === 409) {
          window.setTimeout(() => router.refresh(), 1500);
        }
      }
    } catch {
      setError("No se pudo agregar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setIsOpen(true)}>
        <Plus className="size-4" />
        Agregar gasto
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <label
          htmlFor={`add-label-${periodId}`}
          className="mb-1 block text-xs text-muted-foreground"
        >
          Concepto
        </label>
        <Input
          id={`add-label-${periodId}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
          placeholder="Ej. Internet"
          disabled={saving}
          className="h-8"
        />
        {fieldErrors.label && (
          <span className="mt-1 block text-xs text-destructive">{fieldErrors.label}</span>
        )}
      </div>
      <div className="w-full sm:w-36">
        <label
          htmlFor={`add-amount-${periodId}`}
          className="mb-1 block text-xs text-muted-foreground"
        >
          Monto RD$
        </label>
        <Input
          id={`add-amount-${periodId}`}
          value={rawAmount}
          onChange={(e) => setRawAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          disabled={saving}
          className="h-8"
        />
        {fieldErrors.amount && (
          <span className="mt-1 block text-xs text-destructive">{fieldErrors.amount}</span>
        )}
      </div>
      <div className="flex items-start gap-1 sm:pt-5">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            setIsOpen(false);
          }}
          disabled={saving}
        >
          Cancelar
        </Button>
      </div>
      {error && (
        <span className="block text-xs text-destructive sm:w-full">
          <AlertCircle className="inline size-3" /> {error}
        </span>
      )}
    </form>
  );
}

interface ReadOnlyItemRowProps {
  item: BudgetItem;
}

export function ReadOnlyItemRow({ item }: ReadOnlyItemRowProps) {
  return (
    <>
      <TableCell className="font-medium">{item.label}</TableCell>
      <TableCell className="text-right">{formatDop(item.amountDop)}</TableCell>
      <TableCell className="text-right">
        {item.isUsdBilled && <Badge variant="outline">Facturado en USD</Badge>}
      </TableCell>
    </>
  );
}
