/**
 * Small HTTP helpers shared by the `/api/state` and `/api/overlay` handlers.
 *
 * Every successful mutation responds with the full updated FinancialState so
 * the client can refresh its whole view from one round-trip. Failures are
 * always JSON `{ error }` with a meaningful status:
 *   400 invalid payload / unknown card or loan id
 *   404 missing payment or abono
 *   500 overlay-store failure
 *   502 Google Sheet failure
 */
import {
  OverlayNotFoundError,
  OverlayStoreError,
  OverlayValidationError,
  isIsoDate,
} from "@/lib/overlay/store";
import { SheetError } from "@/lib/sheets/errors";
import { getSnapshot } from "@/lib/sheets/snapshot";
import { getFinancialState } from "@/lib/state";

const NO_STORE = { "Cache-Control": "no-store" };

/** Serialize the current FinancialState. */
export async function stateJson(force = false): Promise<Response> {
  const state = await getFinancialState({ force });
  return Response.json(state, { headers: NO_STORE });
}

export function errorResponse(error: unknown, context: string): Response {
  let status = 500;

  if (error instanceof OverlayValidationError) {
    status = 400;
  } else if (error instanceof OverlayNotFoundError) {
    status = 404;
  } else if (error instanceof OverlayStoreError) {
    status = 500;
  } else if (error instanceof SheetError) {
    status = 502;
  }

  // Expected client errors (400/404) are not server failures; keep the log
  // clean and only surface real outages (store/Sheet failures).
  if (status >= 500) {
    console.error(`[api] ${context} failed`, error);
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    throw new OverlayValidationError("Request body must be valid JSON.");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new OverlayValidationError("Request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

export function readString(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new OverlayValidationError(
      `"${field}" must be a non-empty string.`,
    );
  }
  return value.trim();
}

export function readDate(
  body: Record<string, unknown>,
  field: string,
): string {
  const value = readString(body, field);
  if (!isIsoDate(value)) {
    throw new OverlayValidationError(
      `"${field}" must be an ISO date (yyyy-mm-dd).`,
    );
  }
  return value;
}

interface NumberOptions {
  min?: number;
  exclusiveMin?: boolean;
}

export function readNumber(
  body: Record<string, unknown>,
  field: string,
  options: NumberOptions = {},
): number {
  const value = body[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new OverlayValidationError(`"${field}" must be a finite number.`);
  }

  const min = options.min ?? 0;
  const tooSmall = options.exclusiveMin ? value <= min : value < min;
  if (tooSmall) {
    throw new OverlayValidationError(
      `"${field}" must be ${options.exclusiveMin ? ">" : ">="} ${min}.`,
    );
  }

  return value;
}

export function readOptionalNumber(
  body: Record<string, unknown>,
  field: string,
  options: NumberOptions = {},
): number | null {
  const value = body[field];
  if (value === undefined || value === null) {
    return null;
  }
  return readNumber(body, field, options);
}

export function readOptionalNote(
  body: Record<string, unknown>,
  field: string,
): string | null {
  const value = body[field];
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new OverlayValidationError(
      `"${field}" must be a string or null.`,
    );
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Reject card ids that are not present in the live snapshot. */
export async function requireCard(cardId: string): Promise<void> {
  if (cardId.trim() === "") {
    throw new OverlayValidationError('"cardId" must be a non-empty string.');
  }

  const snapshot = await getSnapshot({});
  if (!snapshot.cards.some((card) => card.id === cardId)) {
    throw new OverlayValidationError(`Unknown card id "${cardId}".`);
  }
}

/** Reject loan ids that are not present in the live snapshot. */
export async function requireLoan(loanId: string): Promise<void> {
  if (loanId.trim() === "") {
    throw new OverlayValidationError('"loanId" must be a non-empty string.');
  }

  const snapshot = await getSnapshot({});
  if (!snapshot.loans.some((loan) => loan.id === loanId)) {
    throw new OverlayValidationError(`Unknown loan id "${loanId}".`);
  }
}
