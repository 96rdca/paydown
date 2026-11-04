/**
 * App-owned overlay store.
 *
 * The Google Sheet stays the read-only source of truth for base data. This
 * store owns the small amount of financial data the app lets the owner manage
 * itself — per-card monthly interest rates, the card payment log and loan
 * "abonos" (extra principal payments) — and persists it to
 * `data/overlay.json`.
 *
 * Guarantees:
 * - Atomic writes: a sibling temp file is written and then renamed over the
 *   target, so a crash never leaves a half-written financial record.
 * - A corrupt/unreadable file throws a descriptive `OverlayStoreError`. It is
 *   NEVER silently replaced with an empty overlay.
 * - A missing file is the empty default (version 1) and is not written until
 *   the first mutation.
 * - A per-store mutex serializes reads and mutations; every mutation re-reads
 *   the file before applying its change, so concurrent requests cannot lose
 *   updates.
 * - An in-memory copy caches the last read/written overlay. All app writes go
 *   through this store, so the cached copy is invalidated by every mutation.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type {
  CardOverlayConfig,
  CardPayment,
  LoanAbono,
  Overlay,
} from "@/lib/types";

/** The overlay file shape this build understands. */
const OVERLAY_VERSION = 1;

export class OverlayStoreError extends Error {
  readonly filePath: string;

  constructor(filePath: string, message: string) {
    super(message);
    this.name = "OverlayStoreError";
    this.filePath = filePath;
  }
}

/** The caller sent something the store refuses to persist (-> HTTP 400). */
export class OverlayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverlayValidationError";
  }
}

/** The addressed record does not exist (-> HTTP 404). */
export class OverlayNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OverlayNotFoundError";
  }
}

export interface NewCardPayment {
  cardId: string;
  date: string;
  amountDop: number;
  amountUsd?: number | null;
  note?: string | null;
}

export interface NewLoanAbono {
  loanId: string;
  date: string;
  amount: number;
  note?: string | null;
}

export interface OverlayStore {
  readonly filePath: string;
  read(): Promise<Overlay>;
  setCardRate(
    cardId: string,
    monthlyRate: number | null,
  ): Promise<CardOverlayConfig>;
  addCardPayment(input: NewCardPayment): Promise<CardPayment>;
  deleteCardPayment(id: string): Promise<void>;
  addLoanAbono(input: NewLoanAbono): Promise<LoanAbono>;
  deleteLoanAbono(id: string): Promise<void>;
}

export interface OverlayStoreOptions {
  /** Override the overlay file path (tests use a temp directory). */
  filePath?: string;
}

/* ── shared validation ─────────────────────────────────────────────────── */

/** Strict ISO calendar date (`yyyy-mm-dd`), rejecting 2026-02-30. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }

  // Round-trip through UTC only to reject impossible dates; no timezone math.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new OverlayValidationError(
      `"${field}" must be a non-empty string.`,
    );
  }
  return value.trim();
}

function requireDate(value: unknown, field: string): string {
  if (!isIsoDate(value)) {
    throw new OverlayValidationError(
      `"${field}" must be an ISO date (yyyy-mm-dd).`,
    );
  }
  return value;
}

function requireAmount(
  value: unknown,
  field: string,
  options: { min: number; exclusiveMin?: boolean },
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new OverlayValidationError(`"${field}" must be a finite number.`);
  }

  const tooSmall = options.exclusiveMin
    ? value <= options.min
    : value < options.min;

  if (tooSmall) {
    throw new OverlayValidationError(
      `"${field}" must be ${options.exclusiveMin ? ">" : ">="} ${options.min}.`,
    );
  }
  return value;
}

function optionalAmount(
  value: unknown,
  field: string,
  options: { min: number },
): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  return requireAmount(value, field, options);
}

function normalizeNote(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new OverlayValidationError('"note" must be a string or null.');
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function requireRate(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value >= 1
  ) {
    throw new OverlayValidationError(
      '"monthlyRate" must be null or a fraction >= 0 and < 1 (e.g. 0.0255).',
    );
  }
  return value;
}

/* ── file parsing ──────────────────────────────────────────────────────── */

function emptyOverlay(): Overlay {
  return { version: OVERLAY_VERSION, cards: {}, cardPayments: [], loanAbonos: [] };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function corrupt(filePath: string, detail: string): OverlayStoreError {
  return new OverlayStoreError(
    filePath,
    `Overlay file "${filePath}" is corrupt: ${detail}. ` +
      `It was left untouched — fix or restore the file before using the app.`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCards(
  raw: unknown,
  filePath: string,
): Record<string, CardOverlayConfig> {
  if (!isRecord(raw)) {
    throw corrupt(filePath, '"cards" must be an object keyed by card id');
  }

  const cards: Record<string, CardOverlayConfig> = {};
  for (const [cardId, entry] of Object.entries(raw)) {
    if (cardId.trim() === "") {
      throw corrupt(filePath, "a card id is empty");
    }
    if (!isRecord(entry)) {
      throw corrupt(filePath, `cards["${cardId}"] must be an object`);
    }

    const rate = entry.monthlyRate;
    if (
      rate !== null &&
      !(
        typeof rate === "number" &&
        Number.isFinite(rate) &&
        rate >= 0 &&
        rate < 1
      )
    ) {
      throw corrupt(
        filePath,
        `cards["${cardId}"].monthlyRate must be null or a fraction in [0, 1)`,
      );
    }

    cards[cardId] = { monthlyRate: rate as number | null };
  }
  return cards;
}

function validateCardPayments(
  raw: unknown,
  filePath: string,
): CardPayment[] {
  if (!Array.isArray(raw)) {
    throw corrupt(filePath, '"cardPayments" must be an array');
  }

  const ids = new Set<string>();
  const payments: CardPayment[] = [];

  raw.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw corrupt(filePath, `cardPayments[${index}] must be an object`);
    }

    const id = entry.id;
    if (typeof id !== "string" || id.trim() === "") {
      throw corrupt(filePath, `cardPayments[${index}].id must be a string`);
    }
    if (ids.has(id)) {
      throw corrupt(filePath, `duplicate card payment id "${id}"`);
    }
    ids.add(id);

    if (typeof entry.cardId !== "string" || entry.cardId.trim() === "") {
      throw corrupt(filePath, `cardPayments[${index}].cardId must be a string`);
    }
    if (!isIsoDate(entry.date)) {
      throw corrupt(
        filePath,
        `cardPayments[${index}].date must be an ISO date (yyyy-mm-dd)`,
      );
    }
    if (
      typeof entry.amountDop !== "number" ||
      !Number.isFinite(entry.amountDop) ||
      entry.amountDop < 0
    ) {
      throw corrupt(
        filePath,
        `cardPayments[${index}].amountDop must be a finite number >= 0`,
      );
    }
    if (
      entry.amountUsd !== null &&
      entry.amountUsd !== undefined &&
      (typeof entry.amountUsd !== "number" ||
        !Number.isFinite(entry.amountUsd) ||
        entry.amountUsd < 0)
    ) {
      throw corrupt(
        filePath,
        `cardPayments[${index}].amountUsd must be null or a finite number >= 0`,
      );
    }
    if (
      entry.note !== null &&
      entry.note !== undefined &&
      typeof entry.note !== "string"
    ) {
      throw corrupt(filePath, `cardPayments[${index}].note must be a string`);
    }

    payments.push({
      id,
      cardId: entry.cardId,
      date: entry.date,
      amountDop: entry.amountDop,
      amountUsd: entry.amountUsd ?? null,
      note: entry.note ?? null,
    });
  });

  return payments;
}

function validateLoanAbonos(raw: unknown, filePath: string): LoanAbono[] {
  if (!Array.isArray(raw)) {
    throw corrupt(filePath, '"loanAbonos" must be an array');
  }

  const ids = new Set<string>();
  const abonos: LoanAbono[] = [];

  raw.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw corrupt(filePath, `loanAbonos[${index}] must be an object`);
    }

    const id = entry.id;
    if (typeof id !== "string" || id.trim() === "") {
      throw corrupt(filePath, `loanAbonos[${index}].id must be a string`);
    }
    if (ids.has(id)) {
      throw corrupt(filePath, `duplicate loan abono id "${id}"`);
    }
    ids.add(id);

    if (typeof entry.loanId !== "string" || entry.loanId.trim() === "") {
      throw corrupt(filePath, `loanAbonos[${index}].loanId must be a string`);
    }
    if (!isIsoDate(entry.date)) {
      throw corrupt(
        filePath,
        `loanAbonos[${index}].date must be an ISO date (yyyy-mm-dd)`,
      );
    }
    if (
      typeof entry.amount !== "number" ||
      !Number.isFinite(entry.amount) ||
      entry.amount < 0
    ) {
      throw corrupt(
        filePath,
        `loanAbonos[${index}].amount must be a finite number >= 0`,
      );
    }
    if (
      entry.note !== null &&
      entry.note !== undefined &&
      typeof entry.note !== "string"
    ) {
      throw corrupt(filePath, `loanAbonos[${index}].note must be a string`);
    }

    abonos.push({
      id,
      loanId: entry.loanId,
      date: entry.date,
      amount: entry.amount,
      note: entry.note ?? null,
    });
  });

  return abonos;
}

function validateOverlay(raw: unknown, filePath: string): Overlay {
  if (!isRecord(raw)) {
    throw corrupt(filePath, "expected a JSON object");
  }

  if (raw.version !== OVERLAY_VERSION) {
    throw corrupt(
      filePath,
      `unsupported version ${JSON.stringify(raw.version)} (this build supports version ${OVERLAY_VERSION})`,
    );
  }

  return {
    version: OVERLAY_VERSION,
    cards: validateCards(raw.cards, filePath),
    cardPayments: validateCardPayments(raw.cardPayments, filePath),
    loanAbonos: validateLoanAbonos(raw.loanAbonos, filePath),
  };
}

function errorCode(error: unknown): string | null {
  if (isRecord(error) && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name;
  }
  return String(error);
}

async function loadOverlayFile(filePath: string): Promise<Overlay> {
  let text: string;

  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    // A missing file is simply "nothing configured yet". It is not created
    // here: the first mutation is what materializes the file.
    if (errorCode(error) === "ENOENT") {
      return emptyOverlay();
    }
    throw new OverlayStoreError(
      filePath,
      `Could not read overlay file "${filePath}": ${describeError(error)}. ` +
        `Refusing to continue with an empty overlay.`,
    );
  }

  if (text.trim() === "") {
    throw corrupt(filePath, "the file is empty");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw corrupt(filePath, `invalid JSON (${describeError(error)})`);
  }

  return validateOverlay(parsed, filePath);
}

async function writeOverlayFile(
  filePath: string,
  overlay: Overlay,
): Promise<void> {
  const directory = dirname(filePath);
  const tempPath = join(
    directory,
    `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(
      tempPath,
      `${JSON.stringify(overlay, null, 2)}\n`,
      "utf8",
    );
    // Same-directory rename: atomic on POSIX and Windows (replaces the target).
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw new OverlayStoreError(
      filePath,
      `Could not write overlay file "${filePath}": ${describeError(error)}. ` +
        `The previous file (if any) was left untouched.`,
    );
  }
}

/* ── store factory ─────────────────────────────────────────────────────── */

/** Default location: `<cwd>/data/overlay.json` (gitignored). */
export function defaultOverlayPath(): string {
  return resolve(process.cwd(), "data", "overlay.json");
}

export function createOverlayStore(
  options: OverlayStoreOptions = {},
): OverlayStore {
  const filePath = resolve(options.filePath ?? defaultOverlayPath());

  let cache: Overlay | null = null;
  let tail: Promise<unknown> = Promise.resolve();

  /**
   * Serialize every operation. `tail` never rejects, so one failed mutation
   * cannot poison the queue.
   */
  function withLock<T>(operation: () => Promise<T>): Promise<T> {
    const run = tail.then(operation, operation);
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Read the overlay, preferring the in-memory copy. */
  async function read(): Promise<Overlay> {
    if (cache) {
      return clone(cache);
    }

    return withLock(async () => {
      if (cache) {
        return clone(cache);
      }
      const loaded = await loadOverlayFile(filePath);
      cache = loaded;
      return clone(loaded);
    });
  }

  /**
   * Apply a change and persist it. Always re-reads the file inside the lock:
   * the file is authoritative and concurrent mutations must not lose updates.
   */
  async function mutate<T>(operation: (draft: Overlay) => T): Promise<T> {
    return withLock(async () => {
      const onDisk = await loadOverlayFile(filePath);
      const draft = clone(onDisk);
      const result = operation(draft);
      await writeOverlayFile(filePath, draft);
      cache = draft;
      return result === undefined ? result : clone(result);
    });
  }

  async function setCardRate(
    cardId: string,
    monthlyRate: number | null,
  ): Promise<CardOverlayConfig> {
    const id = requireId(cardId, "cardId");
    const rate = requireRate(monthlyRate);

    return mutate((draft) => {
      const config: CardOverlayConfig = { monthlyRate: rate };
      draft.cards[id] = config;
      return config;
    });
  }

  async function addCardPayment(input: NewCardPayment): Promise<CardPayment> {
    const cardId = requireId(input.cardId, "cardId");
    const date = requireDate(input.date, "date");
    const amountDop = requireAmount(input.amountDop, "amountDop", { min: 0 });
    const amountUsd = optionalAmount(input.amountUsd, "amountUsd", { min: 0 });
    const note = normalizeNote(input.note);

    const payment: CardPayment = {
      id: randomUUID(),
      cardId,
      date,
      amountDop,
      amountUsd,
      note,
    };

    return mutate((draft) => {
      draft.cardPayments.push(payment);
      return payment;
    });
  }

  async function deleteCardPayment(id: string): Promise<void> {
    const paymentId = requireId(id, "id");

    return mutate((draft) => {
      const index = draft.cardPayments.findIndex(
        (payment) => payment.id === paymentId,
      );
      if (index === -1) {
        throw new OverlayNotFoundError(
          `No card payment with id "${paymentId}".`,
        );
      }
      draft.cardPayments.splice(index, 1);
    });
  }

  async function addLoanAbono(input: NewLoanAbono): Promise<LoanAbono> {
    const loanId = requireId(input.loanId, "loanId");
    const date = requireDate(input.date, "date");
    const amount = requireAmount(input.amount, "amount", {
      min: 0,
      exclusiveMin: true,
    });
    const note = normalizeNote(input.note);

    const abono: LoanAbono = {
      id: randomUUID(),
      loanId,
      date,
      amount,
      note,
    };

    return mutate((draft) => {
      draft.loanAbonos.push(abono);
      return abono;
    });
  }

  async function deleteLoanAbono(id: string): Promise<void> {
    const abonoId = requireId(id, "id");

    return mutate((draft) => {
      const index = draft.loanAbonos.findIndex(
        (abono) => abono.id === abonoId,
      );
      if (index === -1) {
        throw new OverlayNotFoundError(
          `No loan abono with id "${abonoId}".`,
        );
      }
      draft.loanAbonos.splice(index, 1);
    });
  }

  return {
    filePath,
    read,
    setCardRate,
    addCardPayment,
    deleteCardPayment,
    addLoanAbono,
    deleteLoanAbono,
  };
}

/**
 * Default singleton used by the state layer and API routes. Tests create
 * isolated stores with `createOverlayStore({ filePath })` instead.
 */
export const overlayStore = createOverlayStore();
