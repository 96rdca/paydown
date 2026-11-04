"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SheetEditMoney, parseEditResponse } from "@/components/sheet-edit";
import type { AugmentedCard } from "@/lib/types";
import { Settings2 } from "lucide-react";

interface CardEditDialogProps {
  card: AugmentedCard;
}

type CardField =
  | "limitDop"
  | "limitUsd"
  | "statementBalanceDop"
  | "statementBalanceUsd"
  | "availableDop"
  | "availableUsd"
  | "minPaymentDop"
  | "minPaymentUsd";

interface FieldConfig {
  key: CardField;
  label: string;
  currency: "dop" | "usd";
}

const FIELDS: FieldConfig[] = [
  { key: "limitDop", label: "Límite", currency: "dop" },
  { key: "limitUsd", label: "Límite USD", currency: "usd" },
  { key: "statementBalanceDop", label: "Balance corte", currency: "dop" },
  { key: "statementBalanceUsd", label: "Balance corte USD", currency: "usd" },
  { key: "availableDop", label: "Disponible", currency: "dop" },
  { key: "availableUsd", label: "Disponible USD", currency: "usd" },
  { key: "minPaymentDop", label: "Pago mínimo", currency: "dop" },
  { key: "minPaymentUsd", label: "Pago mínimo USD", currency: "usd" },
];

function CardFieldRow({
  card,
  field,
}: {
  card: AugmentedCard;
  field: FieldConfig;
}) {
  const value = card[field.key];
  if (value === null || value === undefined) {
    return (
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <span className="text-sm text-muted-foreground">{field.label}</span>
        <span className="text-sm text-muted-foreground">—</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-lg border px-3 py-2">
      <span className="text-sm text-muted-foreground">{field.label}</span>
      <SheetEditMoney
        value={value}
        currency={field.currency}
        save={async (after) => {
          const res = await fetch(
            `/api/sheet/cards/${encodeURIComponent(card.id)}/fields/${encodeURIComponent(field.key)}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ before: value, after }),
            },
          );
          return parseEditResponse(res);
        }}
      />
    </div>
  );
}

export function CardEditDialog({ card }: CardEditDialogProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto gap-1 px-2 py-1 text-xs">
          <Settings2 className="size-3" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar campos</DialogTitle>
          <DialogDescription>
            {card.bank} — los cambios se escriben directamente en la hoja.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          {FIELDS.map((field) => (
            <CardFieldRow key={field.key} card={card} field={field} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
