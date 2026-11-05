"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { parseMoneyInput, formatDop, formatUsd, formatNumber, formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pencil, Loader2, Check, X, RotateCcw, AlertCircle } from "lucide-react";
import { cn } from "cn";

export type SheetEditResult =
  | { ok: true }
  | { ok: false; error: string; current?: number | string; status?: number };

export async function parseEditResponse(res: Response): Promise<SheetEditResult> {
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => ({ error: "Error desconocido" }))) as {
    error?: string;
    current?: number | string;
  };
  return {
    ok: false,
    error: data.error ?? "Error desconocido",
    current: data.current,
    status: res.status,
  };
}

export function formatConflictMessage(error: string, current?: number | string): string {
  if (current !== undefined) {
    return `La hoja cambió — valor actual: ${current}`;
  }
  return error;
}

interface UseSheetEditOptions<T> {
  value: T;
  format: (value: T) => string;
  parse: (raw: string) => T | null;
  save: (after: T) => Promise<SheetEditResult>;
  invalidMessage?: string;
}

function useSheetEdit<T>({ value, format, parse, save, invalidMessage = "Valor inválido" }: UseSheetEditOptions<T>) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [raw, setRaw] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; current?: number | string } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const committingRef = React.useRef(false);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function start() {
    setRaw(format(value));
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function commit() {
    const parsed = parse(raw);
    if (parsed === null) {
      setError({ message: invalidMessage });
      return;
    }
    if (parsed === value) {
      setEditing(false);
      return;
    }
    committingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await save(parsed);
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError({ message: result.error, current: result.current });
        if (result.status === 409) {
          window.setTimeout(() => router.refresh(), 1500);
        }
      }
    } catch {
      setError({ message: "No se pudo guardar. Intenta de nuevo." });
    } finally {
      setSaving(false);
      committingRef.current = false;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }

  function handleBlur() {
    if (committingRef.current) return;
    const parsed = parse(raw);
    if (parsed === null || parsed !== value) {
      // Keep the edit alive so the user does not lose their typing.
      return;
    }
    cancel();
  }

  return {
    editing,
    raw,
    setRaw,
    saving,
    error,
    inputRef,
    start,
    cancel,
    commit,
    handleKeyDown,
    handleBlur,
  };
}

function SaveCancelButtons({
  onSave,
  onCancel,
  saving,
}: {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => onSave()}
        onMouseDown={(e) => e.preventDefault()}
        disabled={saving}
        title="Guardar"
        aria-label="Guardar"
      >
        {saving ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : (
          <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={() => onCancel()}
        onMouseDown={(e) => e.preventDefault()}
        disabled={saving}
        title="Cancelar"
        aria-label="Cancelar"
      >
        <X className="size-3 text-muted-foreground" />
      </Button>
    </span>
  );
}

interface EditableValueButtonProps {
  children: React.ReactNode;
  onClick: () => void;
  tabular?: boolean;
  className?: string;
}

function EditableValueButton({ children, onClick, tabular, className }: EditableValueButtonProps) {
  return (
    <span className={cn("group inline-flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={onClick}
        className={cn(
          "h-auto gap-1 px-1 py-0 font-normal",
          tabular && "tabular-nums",
        )}
      >
        <span className="border-b border-dotted border-current/40 transition-colors group-hover/button:border-transparent">
          {children}
        </span>
        <Pencil className="size-3 opacity-40 transition-opacity group-hover:opacity-100" />
      </Button>
    </span>
  );
}

interface SheetEditMoneyProps {
  value: number;
  currency?: "dop" | "usd";
  save: (after: number) => Promise<SheetEditResult>;
  className?: string;
}

export function SheetEditMoney({ value, currency = "dop", save, className }: SheetEditMoneyProps) {
  const formatter = currency === "usd" ? formatUsd : formatDop;
  const { editing, raw, setRaw, saving, error, inputRef, start, cancel, commit, handleKeyDown, handleBlur } =
    useSheetEdit<number>({
      value,
      format: formatNumber,
      parse: parseMoneyInput,
      save,
    });

  if (editing) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
        <Input
          ref={inputRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          inputMode="decimal"
          disabled={saving}
          className="h-6 w-28 px-1.5 py-0 text-sm"
        />
        <SaveCancelButtons onSave={commit} onCancel={cancel} saving={saving} />
        {error && (
          <span className="inline-flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3" />
            {formatConflictMessage(error.message, error.current)}
          </span>
        )}
      </span>
    );
  }

  return (
    <EditableValueButton onClick={start} tabular className={className}>
      {formatter(value)}
    </EditableValueButton>
  );
}

interface SheetEditNumberProps {
  value: number;
  decimals?: number;
  suffix?: string;
  save: (after: number) => Promise<SheetEditResult>;
  className?: string;
}

export function SheetEditNumber({ value, decimals = 2, suffix, save, className }: SheetEditNumberProps) {
  const { editing, raw, setRaw, saving, error, inputRef, start, cancel, commit, handleKeyDown, handleBlur } =
    useSheetEdit<number>({
      value,
      format: (v) => v.toFixed(decimals),
      parse: parseMoneyInput,
      save,
    });

  if (editing) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
        <Input
          ref={inputRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          inputMode="decimal"
          disabled={saving}
          className="h-6 w-24 px-1.5 py-0 text-sm"
        />
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
        <SaveCancelButtons onSave={commit} onCancel={cancel} saving={saving} />
        {error && (
          <span className="inline-flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3" />
            {formatConflictMessage(error.message, error.current)}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn("group inline-flex items-center gap-1", className)}>
      <EditableValueButton onClick={start} tabular>
        {formatNumber(value)}
      </EditableValueButton>
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </span>
  );
}

function parseLabel(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.length > 60) return null;
  return trimmed;
}

interface SheetEditLabelProps {
  value: string;
  save: (after: string) => Promise<SheetEditResult>;
  className?: string;
}

export function SheetEditLabel({ value, save, className }: SheetEditLabelProps) {
  const { editing, raw, setRaw, saving, error, inputRef, start, cancel, commit, handleKeyDown, handleBlur } =
    useSheetEdit<string>({
      value,
      format: (v) => v,
      parse: parseLabel,
      save,
      invalidMessage: "Concepto inválido",
    });

  if (editing) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
        <Input
          ref={inputRef}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={saving}
          maxLength={60}
          className="h-6 min-w-56 w-full max-w-md px-1.5 py-0 text-sm"
        />
        <SaveCancelButtons onSave={commit} onCancel={cancel} saving={saving} />
        {error && (
          <span className="inline-flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3" />
            {formatConflictMessage(error.message, error.current)}
          </span>
        )}
      </span>
    );
  }

  return (
    <EditableValueButton onClick={start} className={className}>
      {value}
    </EditableValueButton>
  );
}

export interface SheetEditMoneyEndpointProps {
  value: number;
  currency?: "dop" | "usd";
  endpoint: string;
  before: number;
  className?: string;
}

export function SheetEditMoneyEndpoint({
  value,
  currency = "dop",
  endpoint,
  before,
  className,
}: SheetEditMoneyEndpointProps) {
  return (
    <SheetEditMoney
      value={value}
      currency={currency}
      save={async (after) => {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ before, after }),
        });
        return parseEditResponse(res);
      }}
      className={className}
    />
  );
}

export interface SheetEditLabelEndpointProps {
  value: string;
  endpoint: string;
  before: string;
  className?: string;
}

export function SheetEditLabelEndpoint({
  value,
  endpoint,
  before,
  className,
}: SheetEditLabelEndpointProps) {
  return (
    <SheetEditLabel
      value={value}
      save={async (after) => {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ before, after }),
        });
        return parseEditResponse(res);
      }}
      className={className}
    />
  );
}

export interface SheetEditDateEndpointProps {
  value: string;
  endpoint: string;
  before: string;
  className?: string;
}

export function SheetEditDateEndpoint({
  value,
  endpoint,
  before,
  className,
}: SheetEditDateEndpointProps) {
  return (
    <SheetEditDate
      value={value}
      save={async (after) => {
        const res = await fetch(endpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ before, after }),
        });
        return parseEditResponse(res);
      }}
      className={className}
    />
  );
}

export interface DebtAmountEditProps {
  debtId: string;
  amountDop: number;
}

export function DebtAmountEdit({ debtId, amountDop }: DebtAmountEditProps) {
  return (
    <SheetEditMoney
      value={amountDop}
      save={async (after) => {
        const res = await fetch(`/api/sheet/debts/${encodeURIComponent(debtId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountDop: { before: amountDop, after } }),
        });
        return parseEditResponse(res);
      }}
    />
  );
}

export interface DebtDateEditProps {
  debtId: string;
  dueDate: string;
}

export function DebtDateEdit({ debtId, dueDate }: DebtDateEditProps) {
  return (
    <SheetEditDate
      value={dueDate}
      save={async (after) => {
        const res = await fetch(`/api/sheet/debts/${encodeURIComponent(debtId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dueDate: { before: dueDate, after } }),
        });
        return parseEditResponse(res);
      }}
    />
  );
}

function parseIsoDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return trimmed;
}

interface SheetEditDateProps {
  value: string;
  save: (after: string) => Promise<SheetEditResult>;
  className?: string;
}

export function SheetEditDate({ value, save, className }: SheetEditDateProps) {
  const { editing, raw, setRaw, saving, error, inputRef, start, cancel, commit, handleKeyDown, handleBlur } =
    useSheetEdit<string>({
      value,
      format: (v) => v,
      parse: parseIsoDate,
      save,
    });

  if (editing) {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
        <Input
          ref={inputRef}
          type="date"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          disabled={saving}
          className="h-6 w-auto px-1.5 py-0 text-sm"
        />
        <SaveCancelButtons onSave={commit} onCancel={cancel} saving={saving} />
        {error && (
          <span className="inline-flex items-center gap-1 text-xs text-destructive">
            <AlertCircle className="size-3" />
            {formatConflictMessage(error.message, error.current)}
          </span>
        )}
      </span>
    );
  }

  return (
    <EditableValueButton onClick={start} className={className}>
      {formatDate(value)}
    </EditableValueButton>
  );
}

interface CuotaStatusButtonProps {
  loanId: string;
  number: number;
  status: "paid" | "pending" | "extra";
  save: (before: string, after: string) => Promise<SheetEditResult>;
}

function statusLabel(status: CuotaStatusButtonProps["status"]): string {
  switch (status) {
    case "paid":
      return "Cuota Paga";
    case "pending":
      return "Pendiente";
    case "extra":
      return "Abono";
  }
}

export function CuotaStatusButton({ status, save }: CuotaStatusButtonProps) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (status === "extra") {
    return null;
  }

  async function toggle() {
    const before = statusLabel(status);
    const after = status === "paid" ? "Pendiente" : "Cuota Paga";
    setSaving(true);
    setError(null);
    try {
      const result = await save(before, after);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error);
        if (result.status === 409) {
          window.setTimeout(() => router.refresh(), 1500);
        }
      }
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const isPaid = status === "paid";

  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        variant={isPaid ? "outline" : "secondary"}
        size="icon-xs"
        onClick={() => void toggle()}
        disabled={saving}
        title={isPaid ? "Marcar como pendiente" : "Marcar como pagada"}
        className={cn(
          isPaid
            ? "text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
            : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:hover:text-emerald-300",
        )}
      >
        {saving ? (
          <Loader2 className="size-3 animate-spin" />
        ) : isPaid ? (
          <RotateCcw className="size-3" />
        ) : (
          <Check className="size-3" />
        )}
      </Button>
      {error && (
        <span className="inline-flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="size-3" />
          {error}
        </span>
      )}
    </span>
  );
}
