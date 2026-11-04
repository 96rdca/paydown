/**
 * HTTP plumbing shared by the `/api/sheet/*` write routes.
 *
 * Mirrors the overlay routes' contract (see `@/lib/overlay/http`):
 *   - success: the full fresh FinancialState, `Cache-Control: no-store`;
 *   - failure: `{ error }`, plus `current` for a 409 conflict.
 *
 * Status mapping:
 *   400 bad payload / unknown enum value (period id, card field, status text)
 *   404 id not found in the freshly parsed sheet
 *   409 the sheet changed since the UI read it
 *   502 Google Sheets read/write/auth failure (incl. reader layout errors)
 *   503 write-back not configured
 */
import type { FinancialState } from "@/lib/types";
import { SheetError } from "@/lib/sheets/errors";
import { parseDate } from "@/lib/sheets/values";
import type { CuotaStatusText } from "./engine";
import {
  InvalidTargetError,
  NotConfiguredError,
  UnknownEntityError,
  UpstreamError,
  WriteConflictError,
} from "./errors";

const NO_STORE = { "Cache-Control": "no-store" };

/** Serialize an already-built (fresh) state. */
export function stateJson(state: FinancialState): Response {
  return Response.json(state, { headers: NO_STORE });
}

export function sheetErrorResponse(error: unknown, context: string): Response {
  let status = 500;

  if (error instanceof NotConfiguredError) {
    status = 503;
  } else if (error instanceof WriteConflictError) {
    status = 409;
  } else if (error instanceof UnknownEntityError) {
    status = 404;
  } else if (error instanceof InvalidTargetError) {
    status = 400;
  } else if (error instanceof UpstreamError || error instanceof SheetError) {
    status = 502;
  }

  // 4xx are expected user corrections; log only real incidents.
  if (status >= 500) {
    console.error(`[api] ${context} failed`, error);
  }

  const message =
    error instanceof Error ? error.message : "Unknown error";

  if (error instanceof WriteConflictError) {
    return Response.json(
      { error: message, current: error.current },
      { status, headers: NO_STORE },
    );
  }

  return Response.json({ error: message }, { status, headers: NO_STORE });
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    throw new InvalidTargetError("Request body must be valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new InvalidTargetError("Request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

interface NumberOptions {
  min?: number;
  exclusiveMin?: boolean;
}

/** Finite number from a body field, with optional lower bound. */
export function readFiniteNumber(
  value: unknown,
  field: string,
  options: NumberOptions = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidTargetError(`"${field}" must be a finite number.`);
  }

  const min = options.min ?? 0;
  const tooSmall = options.exclusiveMin ? value <= min : value < min;
  if (tooSmall) {
    throw new InvalidTargetError(
      `"${field}" must be ${options.exclusiveMin ? ">" : ">="} ${min}.`,
    );
  }

  return value;
}

/** Finite number or null (card fields can be empty in the sheet). */
export function readNullableNumber(
  value: unknown,
  field: string,
): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidTargetError(
      `"${field}" must be a finite number or null.`,
    );
  }
  return value;
}

/** Canonical ISO date (yyyy-mm-dd) that the reader can round-trip. */
export function readIsoDate(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new InvalidTargetError(`"${field}" must be an ISO date (yyyy-mm-dd).`);
  }

  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || parseDate(trimmed) !== trimmed) {
    throw new InvalidTargetError(`"${field}" must be an ISO date (yyyy-mm-dd).`);
  }
  return trimmed;
}

export function readCuotaStatus(
  value: unknown,
  field: string,
): CuotaStatusText {
  if (value === "Cuota Paga" || value === "Pendiente") {
    return value;
  }
  throw new InvalidTargetError(
    `"${field}" must be "Cuota Paga" or "Pendiente".`,
  );
}

/** A `{ before, after }` object from a nested body field (debts). */
export function readChange(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidTargetError(`"${field}" must be a { before, after } object.`);
  }
  return value as Record<string, unknown>;
}

/** Cuota number from the URL: positive integer, nothing else. */
export function readCuotaNumber(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidTargetError(
      `Invalid cuota number ${JSON.stringify(value)}: expected a positive integer.`,
    );
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InvalidTargetError(
      `Invalid cuota number ${JSON.stringify(value)}: expected a positive integer.`,
    );
  }
  return parsed;
}
