/**
 * The write engine: resolve → conflict-check → single-cell PUT → verify → fresh
 * FinancialState.
 *
 * Why read-modify-write: the Google Sheet is a shared document. The owner may
 * have typed into the same cell while the app tab was open. The UI therefore
 * sends what it believed (`before`); we re-parse the tab fresh, compare, and
 * only write when the sheet still holds that value. On a mismatch nothing is
 * written and the API answers 409 with the current value.
 *
 * Freshness: the public CSV read is cached in `sheets/snapshot.ts` for 60s.
 * This module bypasses that cache by fetching the tab directly (same export
 * endpoint, same gid map), and explicitly invalidates the snapshot cache after
 * a successful write, so a normal `getFinancialState()` on the next request sees
 * the edit instead of waiting out the TTL.
 */
import type { FinancialState } from "@/lib/types";
import { getFinancialState } from "@/lib/state";
import { parseCsv } from "@/lib/sheets/csv";
import { TAB_TIMEOUT_MS, TABS, type TabKey } from "@/lib/sheets/fetch";
import { cellAt, type Grid } from "@/lib/sheets/grid";
import { invalidateSnapshotCache } from "@/lib/sheets/snapshot";
import { parseNumber } from "@/lib/sheets/values";
import { isSheetWriteConfigured, spreadsheetId } from "./config";
import {
  assertNoConflict,
  numbersMatch,
  valuesMatch,
  type ConflictKind,
} from "./conflict";
import {
  InvalidTargetError,
  NotConfiguredError,
  UnknownEntityError,
  UpstreamError,
  WriteConflictError,
} from "./errors";
import {
  CARD_FIELDS,
  findPeriodItemRow,
  isCardField,
  isStructuralRow,
  loanTab,
  normalizePeriodId,
  resolveCardField,
  resolveDebtAmount,
  resolveDebtDueDate,
  resolveInsertionPoint,
  resolveLoanCuotaStatus,
  resolvePeriodBlock,
  resolvePeriodItem,
  resolvePeriodSalary,
  resolveUsdRate,
  toA1,
  type PeriodItemRow,
  type ResolvedCell,
} from "./resolve";
import {
  batchUpdate,
  deleteRowRequest,
  insertRowRequest,
  normalizeItemLabel,
  removalMode,
  SHEET1_GID,
} from "./rows";
import { writeCell } from "./write";

/** Tabs that can be edited today (the read-only savings tab is absent). */
export type EditableTab = Extract<TabKey, "sheet1" | "autoLoan" | "jeepLoan">;

export interface CellEdit {
  /** Which tab this cell lives in. */
  tab: EditableTab;
  /** Human name used in conflict/verification messages. */
  label: string;
  kind: ConflictKind;
  /** What the UI believed the cell held. */
  before: unknown;
  /** The value the cell should hold afterwards. */
  after: unknown;
  /** Literal sent to the Sheets API (number, ISO date or status text). */
  value: string | number;
  /** Resolves the target cell in a freshly parsed grid. */
  resolve: (grid: Grid) => ResolvedCell;
}

/** Sheet text for the only two statuses the UI may write. */
export type CuotaStatusText = "Cuota Paga" | "Pendiente";

const VERIFY_ATTEMPTS = 3;
const VERIFY_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `sin respuesta después de ${TAB_TIMEOUT_MS}ms`;
    }
    return error.message || error.name;
  }
  return String(error);
}

/**
 * One tab, straight from the public CSV export — no snapshot cache involved.
 * Reuses the reader's gid map and Accept/cache headers so it sees exactly what
 * the reader would see on its next refresh.
 */
async function readFreshTab(tab: EditableTab): Promise<Grid> {
  const spec = TABS[tab];
  const url =
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
      spreadsheetId(),
    )}/export?format=csv&gid=${encodeURIComponent(spec.gid)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TAB_TIMEOUT_MS),
      headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8" },
    });
  } catch (error) {
    throw new UpstreamError(
      `No se pudo releer la pestaña "${spec.tab}": ${describeError(error)}`,
    );
  }

  if (!response.ok) {
    throw new UpstreamError(
      `No se pudo releer la pestaña "${spec.tab}" (HTTP ${response.status}).`,
      response.status,
    );
  }

  const body = await response.text();
  if (!body.trim()) {
    throw new UpstreamError(
      `No se pudo releer la pestaña "${spec.tab}": respuesta CSV vacía.`,
    );
  }

  return parseCsv(body);
}

function uniqueTabs(edits: CellEdit[]): EditableTab[] {
  return [...new Set(edits.map((edit) => edit.tab))];
}

async function readFreshTabs(
  edits: CellEdit[],
): Promise<Map<EditableTab, Grid>> {
  const tabs = uniqueTabs(edits);
  const grids = await Promise.all(tabs.map((tab) => readFreshTab(tab)));
  return new Map(tabs.map((tab, index) => [tab, grids[index]]));
}

function gridFor(
  grids: Map<EditableTab, Grid>,
  edit: CellEdit,
): Grid {
  const grid = grids.get(edit.tab);
  if (!grid) {
    throw new UpstreamError(
      `Internal error: no fresh grid for tab "${edit.tab}".`,
    );
  }
  return grid;
}

function compareEdits(
  edits: CellEdit[],
  targets: ResolvedCell[],
  grids: Map<EditableTab, Grid>,
): string | null {
  for (let index = 0; index < edits.length; index += 1) {
    const edit = edits[index];
    const expected = targets[index];
    const actual = edit.resolve(gridFor(grids, edit));

    if (actual.tab !== expected.tab || actual.a1 !== expected.a1) {
      return (
        `la celda de "${edit.label}" se movió durante la escritura ` +
        `(${expected.tab}!${expected.a1} -> ${actual.tab}!${actual.a1})`
      );
    }

    if (!valuesMatch(edit.kind, edit.after, actual.current)) {
      return (
        `"${edit.label}" sigue valiendo ${JSON.stringify(actual.current)} ` +
        `después de escribir ${JSON.stringify(edit.after)}`
      );
    }
  }

  return null;
}

/**
 * Re-reads the touched tabs and proves the write landed. Google's CSV export
 * can lag the Sheets API by a moment, so a mismatch is retried briefly before
 * it becomes a 502; a *successful* write must never look like a failure because
 * of export lag.
 */
async function verifyEdits(
  edits: CellEdit[],
  targets: ResolvedCell[],
): Promise<void> {
  let lastProblem = "la hoja no reflejó la escritura";

  for (let attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1) {
    let problem: string | null = null;

    try {
      problem = compareEdits(edits, targets, await readFreshTabs(edits));
    } catch (error) {
      // A resolve/read failure here happens *after* a successful write, so it
      // is a verification/upstream problem, never a 404 for the entity.
      problem = `no se pudo releer la hoja: ${describeError(error)}`;
    }

    if (problem === null) {
      return;
    }
    lastProblem = problem;

    if (attempt < VERIFY_ATTEMPTS) {
      await sleep(VERIFY_DELAY_MS);
    }
  }

  throw new UpstreamError(`La escritura no se pudo verificar: ${lastProblem}.`);
}

/**
 * Applies one or more single-cell edits atomically from the UI's point of view:
 * every target is conflict-checked before the first write, and the response is
 * the full fresh state.
 *
 * Multi-cell only for a dated debt (amount + due date), never for tables.
 */
export async function applyCellEdits(
  edits: CellEdit[],
): Promise<FinancialState> {
  if (edits.length === 0) {
    throw new InvalidTargetError("No edits were provided.");
  }
  if (!isSheetWriteConfigured()) {
    throw new NotConfiguredError();
  }

  const before = await readFreshTabs(edits);
  const targets = edits.map((edit) => {
    const cell = edit.resolve(gridFor(before, edit));
    // Conflict before writing anything: a two-cell debt edit must not leave the
    // amount updated and the date stale.
    assertNoConflict(edit.kind, edit.before, cell.current, edit.label);
    return cell;
  });

  for (let index = 0; index < edits.length; index += 1) {
    await writeCell(targets[index].tab, targets[index].a1, edits[index].value);
  }

  // A successful write makes the reader's 60s snapshot stale.
  invalidateSnapshotCache();

  await verifyEdits(edits, targets);

  // force: true refreshes both the snapshot cache and the state-layer cache.
  return getFinancialState({ force: true });
}

/* ─────────────────────────── Edit builders ─────────────────────────── */

export function periodSalaryEdit(
  periodId: string,
  before: number,
  after: number,
): CellEdit {
  const id = normalizePeriodId(periodId);
  return {
    tab: "sheet1",
    label: `Sueldo ${id}`,
    kind: "number",
    before,
    after,
    value: after,
    resolve: (grid) => resolvePeriodSalary(grid, id),
  };
}

export function periodItemEdit(
  periodId: string,
  itemId: string,
  before: number,
  after: number,
): CellEdit {
  const id = normalizePeriodId(periodId);
  if (itemId.trim() === "") {
    throw new InvalidTargetError('"itemId" must be a non-empty string.');
  }
  return {
    tab: "sheet1",
    label: `${id} ${itemId}`,
    kind: "number",
    before,
    after,
    value: after,
    resolve: (grid) => resolvePeriodItem(grid, id, itemId),
  };
}

export function cardFieldEdit(
  cardId: string,
  field: string,
  before: number | null,
  after: number,
): CellEdit {
  const label = isCardField(field) ? CARD_FIELDS[field] : field;
  return {
    tab: "sheet1",
    label: `${cardId} ${label}`,
    kind: "number",
    before,
    after,
    value: after,
    resolve: (grid) => resolveCardField(grid, cardId, field),
  };
}

export function usdRateEdit(before: number, after: number): CellEdit {
  return {
    tab: "sheet1",
    label: "Tasa Dollar",
    kind: "number",
    before,
    after,
    value: after,
    resolve: resolveUsdRate,
  };
}

export function loanStatusEdit(
  loanId: string,
  cuotaNumber: number,
  before: CuotaStatusText,
  after: CuotaStatusText,
): CellEdit {
  const tabName = loanTab(loanId);
  if (tabName === null) {
    throw new UnknownEntityError(
      `Loan ${JSON.stringify(loanId)} has no cuota status column.`,
    );
  }

  return {
    tab: tabName === "Jeep Loan" ? "jeepLoan" : "autoLoan",
    label: `${loanId} cuota ${cuotaNumber}`,
    kind: "status",
    before,
    after,
    value: after,
    resolve: (grid) => resolveLoanCuotaStatus(grid, loanId, cuotaNumber),
  };
}

export interface NumberChange {
  before: number;
  after: number;
}

export interface DateChange {
  before: string;
  after: string;
}

/**
 * Dated debt edit: amount and/or due date, resolved from the same fresh parse.
 * Both cells are conflict-checked before either is written.
 */
export function debtEdits(
  debtId: string,
  amount?: NumberChange,
  dueDate?: DateChange,
): CellEdit[] {
  if (debtId.trim() === "") {
    throw new InvalidTargetError('"debtId" must be a non-empty string.');
  }
  if (!amount && !dueDate) {
    throw new InvalidTargetError(
      "Provide at least one of amountDop or dueDate.",
    );
  }

  const edits: CellEdit[] = [];

  if (amount) {
    edits.push({
      tab: "sheet1",
      label: `Deuda ${debtId} (monto)`,
      kind: "number",
      before: amount.before,
      after: amount.after,
      value: amount.after,
      resolve: (grid) => resolveDebtAmount(grid, debtId),
    });
  }

  if (dueDate) {
    edits.push({
      tab: "sheet1",
      label: `Deuda ${debtId} (fecha)`,
      kind: "date",
      before: dueDate.before,
      after: dueDate.after,
      value: dueDate.after,
      resolve: (grid) => resolveDebtDueDate(grid, debtId),
    });
  }

  return edits;
}

/* ───────────────────────── Row operations ───────────────────────── */

/**
 * Row mutations cannot ride on `CellEdit`: `insertDimension`/`deleteDimension`
 * shift every coordinate below the change, so the pre-mutation resolutions are
 * valid only for the requests themselves. These operations therefore follow
 * their own sequence:
 *
 *   fresh parse → resolve + validate anchors → conflict check →
 *   mutate → force re-read → verify (retry for CSV lag) → fresh state
 *
 * The post-mutation read re-resolves the anchors before anything is claimed as
 * verified, so a dimension change that would have moved the "Sueldo"/"Razon"
 * rows elsewhere fails loudly instead of returning a plausible wrong state.
 */
export interface RowOpOptions {
  /** Test seam: replace the global fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam: replace service-account token acquisition. */
  getToken?: () => Promise<string>;
  /** Test seam: fresh Sheet1 read. Defaults to the uncached CSV export. */
  readGrid?: () => Promise<Grid>;
  /** Test seam: fresh state builder. Defaults to `force: true`. */
  loadState?: () => Promise<FinancialState>;
  /** Test seam: delay between verification attempts (default 400ms). */
  verifyDelayMs?: number;
}

/** What the UI last showed for the row it wants to remove. */
export interface ExpectedItem {
  label: string;
  amountDop: number;
}

const ROW_VERIFY_ATTEMPTS = 3;
const ROW_VERIFY_DELAY_MS = 400;

function validateItemAmount(value: unknown, field = "amountDop"): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidTargetError(`"${field}" must be a finite number.`);
  }
  if (value < 0) {
    throw new InvalidTargetError(`"${field}" must be >= 0.`);
  }
  return value;
}

function validateItemId(itemId: unknown): string {
  if (typeof itemId !== "string" || itemId.trim() === "") {
    throw new InvalidTargetError('"itemId" must be a non-empty string.');
  }
  return itemId.trim();
}

function writeOptions(options: RowOpOptions): {
  fetchImpl?: typeof fetch;
  getToken?: () => Promise<string>;
} {
  return { fetchImpl: options.fetchImpl, getToken: options.getToken };
}

/**
 * Re-reads the tab and proves the mutation landed. Google's CSV export can lag
 * the Sheets API by a moment, so a mismatch is retried briefly before it
 * becomes a 502 — a successful mutation must never look like a failure.
 */
async function verifyRowMutation(
  check: () => Promise<string | null>,
  delayMs: number,
): Promise<void> {
  let lastProblem = "la hoja no reflejó el cambio";

  for (let attempt = 1; attempt <= ROW_VERIFY_ATTEMPTS; attempt += 1) {
    let problem: string | null;

    try {
      problem = await check();
    } catch (error) {
      // Anything thrown here happens after a successful mutation, so it is a
      // verification/upstream problem, never a bad entity id.
      problem = `no se pudo releer la hoja: ${describeError(error)}`;
    }

    if (problem === null) {
      return;
    }
    lastProblem = problem;

    if (attempt < ROW_VERIFY_ATTEMPTS) {
      await sleep(delayMs);
    }
  }

  throw new UpstreamError(
    `El cambio de filas no se pudo verificar: ${lastProblem}.`,
  );
}

function itemRowOrThrow(
  grid: Grid,
  periodId: string,
  itemId: string,
): PeriodItemRow {
  const target = findPeriodItemRow(grid, periodId, itemId);
  if (!target) {
    throw new UnknownEntityError(
      `Unknown item id ${JSON.stringify(itemId)} in period "${periodId}".`,
    );
  }
  return target;
}

/**
 * POST /items — inserts a row after the block's last item (or after "Sueldo"
 * when it has none) and writes A=label, B=amount into it.
 */
export async function addItemRow(
  periodId: string,
  label: string,
  amountDop: number,
  options: RowOpOptions = {},
): Promise<FinancialState> {
  const id = normalizePeriodId(periodId);
  const cleanLabel = normalizeItemLabel(label);
  const amount = validateItemAmount(amountDop);

  if (!isSheetWriteConfigured()) {
    throw new NotConfiguredError();
  }

  const readGrid = options.readGrid ?? (() => readFreshTab("sheet1"));
  const loadState =
    options.loadState ?? (() => getFinancialState({ force: true }));
  const writes = writeOptions(options);

  const before = await readGrid();
  // Validates every anchor BEFORE the sheet is touched.
  const point = resolveInsertionPoint(before, id);

  await batchUpdate([insertRowRequest(SHEET1_GID, point.insertIndex)], writes);

  // The new row occupies 0-based `insertIndex` (1-based insertIndex + 1). No
  // pre-mutation coordinate is reused for anything below this line.
  await writeCell("Sheet1", toA1(point.insertIndex, 0), cleanLabel, writes);
  await writeCell("Sheet1", toA1(point.insertIndex, 1), amount, writes);

  invalidateSnapshotCache();

  await verifyRowMutation(async () => {
    const grid = await readGrid();
    // Re-validate the whole block: the inserted row must not have pushed the
    // anchors somewhere the reader no longer recognizes.
    const block = resolvePeriodBlock(grid, id);

    if (point.insertIndex <= block.salaryRow || point.insertIndex >= block.endRow) {
      return (
        `la fila insertada (${point.insertIndex + 1}) quedó fuera del bloque ` +
        `${id} (Sueldo ${block.salaryRow + 1}, fin ${block.endRow + 1})`
      );
    }

    if (!block.itemRows.includes(point.insertIndex)) {
      return `la fila ${point.insertIndex + 1} no quedó como partida de ${id}`;
    }

    const actualLabel = cellAt(grid, point.insertIndex, 0).trim();
    if (actualLabel !== cleanLabel) {
      return (
        `la fila ${point.insertIndex + 1} tiene ${JSON.stringify(
          actualLabel,
        )} en A en vez de ${JSON.stringify(cleanLabel)}`
      );
    }

    const actualAmount = parseNumber(cellAt(grid, point.insertIndex, 1));
    if (actualAmount == null || !numbersMatch(amount, actualAmount)) {
      return (
        `la fila ${point.insertIndex + 1} tiene ${JSON.stringify(
          cellAt(grid, point.insertIndex, 1),
        )} en B en vez de ${JSON.stringify(amount)}`
      );
    }

    return null;
  }, options.verifyDelayMs ?? ROW_VERIFY_DELAY_MS);

  return loadState();
}

/**
 * DELETE /items/:itemId — conflict-checks the row the UI last showed, then
 * removes it adaptively: clear A/B when the row shares its line with any other
 * block, delete the whole row only when the rest is empty.
 */
export async function removeItemRow(
  periodId: string,
  itemId: string,
  expected: ExpectedItem,
  options: RowOpOptions = {},
): Promise<FinancialState> {
  const id = normalizePeriodId(periodId);
  const targetId = validateItemId(itemId);

  if (
    typeof expected !== "object" ||
    expected === null ||
    Array.isArray(expected)
  ) {
    throw new InvalidTargetError(
      '"expected" must be an object with the row\'s label and amountDop.',
    );
  }
  const expectedLabel = normalizeItemLabel(expected.label);
  const expectedAmount = validateItemAmount(expected.amountDop);

  if (!isSheetWriteConfigured()) {
    throw new NotConfiguredError();
  }

  const readGrid = options.readGrid ?? (() => readFreshTab("sheet1"));
  const loadState =
    options.loadState ?? (() => getFinancialState({ force: true }));
  const writes = writeOptions(options);

  const before = await readGrid();
  const target = itemRowOrThrow(before, id, targetId);

  // Conflict check: both values the UI showed must still be on that row.
  if (
    target.label !== expectedLabel ||
    !numbersMatch(expectedAmount, target.amountDop)
  ) {
    throw new WriteConflictError(
      `La hoja cambió: la fila "${targetId}" ahora es ${JSON.stringify(
        target.label,
      )} / ${JSON.stringify(target.amountDop)} y la app esperaba ` +
        `${JSON.stringify(expectedLabel)} / ${JSON.stringify(expectedAmount)}. ` +
        `Recarga y vuelve a intentar.`,
      { label: target.label, amountDop: target.amountDop },
    );
  }

  const mode = removalMode(before, target.row);

  if (mode === "delete") {
    // Never remove a structural row, even if resolution were ever wrong.
    if (isStructuralRow(before, target.row)) {
      throw new UpstreamError(
        `Se rechazó borrar la fila ${target.row + 1}: es una fila estructural de Sheet1.`,
      );
    }
    await batchUpdate([deleteRowRequest(SHEET1_GID, target.row)], writes);
  } else {
    // Shared line (Deudas / cards / anything in C..): clear only A and B.
    await writeCell("Sheet1", toA1(target.row, 0), "", writes);
    await writeCell("Sheet1", toA1(target.row, 1), "", writes);
  }

  invalidateSnapshotCache();

  const modeLabel =
    mode === "delete" ? "borrar la fila" : "limpiar las celdas A/B de la fila";

  await verifyRowMutation(async () => {
    const grid = await readGrid();
    resolvePeriodBlock(grid, id); // anchors must still parse

    const stillThere = findPeriodItemRow(grid, id, targetId);
    if (stillThere) {
      return (
        `la fila "${targetId}" sigue presente en la hoja ` +
        `(fila ${stillThere.row + 1}) tras ${modeLabel}`
      );
    }

    return null;
  }, options.verifyDelayMs ?? ROW_VERIFY_DELAY_MS);

  return loadState();
}

/**
 * PUT /items/:itemId/label — renames the item in column A only.
 *
 * The item id is derived from the label, so the response state carries the new
 * id; the UI must refresh from it rather than keep the old id.
 */
export async function renameItemLabel(
  periodId: string,
  itemId: string,
  before: string,
  after: string,
  options: RowOpOptions = {},
): Promise<FinancialState> {
  const id = normalizePeriodId(periodId);
  const targetId = validateItemId(itemId);
  const beforeLabel = normalizeItemLabel(before, "before");
  const afterLabel = normalizeItemLabel(after, "after");

  if (!isSheetWriteConfigured()) {
    throw new NotConfiguredError();
  }

  const readGrid = options.readGrid ?? (() => readFreshTab("sheet1"));
  const loadState =
    options.loadState ?? (() => getFinancialState({ force: true }));
  const writes = writeOptions(options);

  const grid = await readGrid();
  const target = itemRowOrThrow(grid, id, targetId);

  if (target.label !== beforeLabel) {
    throw new WriteConflictError(
      `La hoja cambió: la fila "${targetId}" ahora se llama ${JSON.stringify(
        target.label,
      )} y la app esperaba ${JSON.stringify(beforeLabel)}. ` +
        `Recarga y vuelve a intentar.`,
      target.label,
    );
  }

  // Exactly one cell: column A of the resolved row.
  await writeCell("Sheet1", toA1(target.row, 0), afterLabel, writes);

  invalidateSnapshotCache();

  await verifyRowMutation(async () => {
    const fresh = await readGrid();
    const block = resolvePeriodBlock(fresh, id);

    if (!block.itemRows.includes(target.row)) {
      return `la fila ${target.row + 1} ya no está en el bloque ${id}`;
    }

    const actual = cellAt(fresh, target.row, 0).trim();
    if (actual !== afterLabel) {
      return (
        `la fila ${target.row + 1} tiene ${JSON.stringify(actual)} en A en vez ` +
        `de ${JSON.stringify(afterLabel)}`
      );
    }

    return null;
  }, options.verifyDelayMs ?? ROW_VERIFY_DELAY_MS);

  return loadState();
}
