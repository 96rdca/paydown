/**
 * Error types for the Phase 2 write-back layer.
 *
 * Reads use `@/lib/sheets/errors` (SheetError and friends). Writes have their
 * own taxonomy because each failure maps to a different HTTP status the UI
 * reacts to differently:
 *   400 InvalidTargetError   — bad payload / unknown enum value
 *   404 UnknownEntityError   — an id that no longer exists in the sheet
 *   409 WriteConflictError   — the sheet changed since the UI last read it
 *   502 UpstreamError        — Google rejected the write or the read broke
 *   503 NotConfiguredError   — no service account, write-back is read-only
 */
export class SheetWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** No service account key means the app stays read-only. */
export class NotConfiguredError extends SheetWriteError {
  constructor(
    message = "Escritura no configurada: falta la service account.",
  ) {
    super(message);
    this.name = "NotConfiguredError";
  }
}

/** The request names something the sheet layout cannot express. */
export class InvalidTargetError extends SheetWriteError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTargetError";
  }
}

/** The id exists in the URL but not in the freshly parsed sheet. */
export class UnknownEntityError extends SheetWriteError {
  constructor(message: string) {
    super(message);
    this.name = "UnknownEntityError";
  }
}

/**
 * Read-modify-write guard: the cell no longer holds the value the UI based its
 * edit on. `current` carries the freshest parsed value so the client can show
 * it without another round-trip.
 */
export class WriteConflictError extends SheetWriteError {
  readonly current: unknown;

  constructor(message: string, current: unknown) {
    super(message);
    this.name = "WriteConflictError";
    this.current = current;
  }
}

/** Google Sheets (or its auth endpoint) failed. */
export class UpstreamError extends SheetWriteError {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}
