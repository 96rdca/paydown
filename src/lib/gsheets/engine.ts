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
import type { Grid } from "@/lib/sheets/grid";
import { invalidateSnapshotCache } from "@/lib/sheets/snapshot";
import { isSheetWriteConfigured, spreadsheetId } from "./config";
import {
  assertNoConflict,
  valuesMatch,
  type ConflictKind,
} from "./conflict";
import {
  InvalidTargetError,
  NotConfiguredError,
  UnknownEntityError,
  UpstreamError,
} from "./errors";
import {
  CARD_FIELDS,
  isCardField,
  loanTab,
  normalizePeriodId,
  resolveCardField,
  resolveDebtAmount,
  resolveDebtDueDate,
  resolveLoanCuotaStatus,
  resolvePeriodItem,
  resolvePeriodSalary,
  resolveUsdRate,
  type ResolvedCell,
} from "./resolve";
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
