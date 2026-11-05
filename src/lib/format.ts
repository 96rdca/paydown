import type { Snapshot } from "@/lib/types";

const esNumber = new Intl.NumberFormat("es-DO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const esNumberInt = new Intl.NumberFormat("es-DO", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function esPercent(decimals: number) {
  return new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatDop(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `RD$ ${esNumber.format(value)}`;
}

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `US$ ${esNumber.format(value)}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return esNumber.format(value);
}

export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return esNumberInt.format(value);
}

export function convertUsdToDop(
  usd: number | null | undefined,
  rate: number,
): number | null {
  if (usd === null || usd === undefined || Number.isNaN(usd)) return null;
  return usd * rate;
}

export function formatCombinedDop(
  dop: number | null | undefined,
  usd: number | null | undefined,
  rate: number,
): string {
  const dopValue = dop ?? 0;
  const usdDop = convertUsdToDop(usd, rate) ?? 0;
  return formatDop(dopValue + usdDop);
}

export function percentage(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${esPercent(decimals).format(value * 100)}%`;
}

export function formatAnnualRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${esPercent(2).format(value * 100)}%`;
}

export function formatMonthlyRate(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${esPercent(2).format(value * 100)}%/mes`;
}

const esDate = new Intl.DateTimeFormat("es-DO", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const esDateShort = new Intl.DateTimeFormat("es-DO", {
  day: "numeric",
  month: "short",
});

const esTime = new Intl.DateTimeFormat("es-DO", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const esDateTime = new Intl.DateTimeFormat("es-DO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return esDate.format(d);
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return esDateShort.format(d);
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return esTime.format(d).toLowerCase();
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return esDateTime.format(d).toLowerCase();
}

export function formatFetchedAt(snapshot: Snapshot): string {
  return formatDateTime(snapshot.fetchedAt);
}

export function relativeDayLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfTarget = new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
  );
  const diffMs = startOfTarget.getTime() - startOfToday.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "vencido";
  if (diffDays === 0) return "hoy";
  if (diffDays === 1) return "mañana";
  return `en ${diffDays} días`;
}

export function nextOccurrenceDay(
  dayOfMonth: number | null | undefined,
  from = new Date(),
): Date | null {
  if (dayOfMonth === null || dayOfMonth === undefined) return null;
  const clamped = Math.max(1, Math.min(31, dayOfMonth));
  let candidate = new Date(from.getFullYear(), from.getMonth(), clamped);
  if (candidate.getTime() < new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) {
    candidate = new Date(from.getFullYear(), from.getMonth() + 1, clamped);
  }
  return candidate;
}

export function isoDayOfMonth(
  dayOfMonth: number | null | undefined,
  from = new Date(),
): string | null {
  const d = nextOccurrenceDay(dayOfMonth, from);
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Parse a money input written in Spanish/Dominican notation.
 * Accepts both "1500", "1.500" and "1500,50"; comma is treated as the
 * decimal separator when present.
 */
export function parseMoneyInput(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const hasComma = trimmed.includes(",");
  const normalized = hasComma
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}
