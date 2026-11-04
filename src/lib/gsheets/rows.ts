/**
 * Row (dimension) mutations for Sheet1.
 *
 * The budget rows live in the SAME sheet as the Deudas block and the card
 * matrix: Q15's A/B items share rows with G/H/I debts, Q30's with D–K cards.
 * Deleting a row therefore deletes whatever else sits on it. Every removal is
 * therefore adaptive (see `removalMode`): clear A/B only unless the rest of the
 * row is provably empty.
 *
 * `insertDimension`/`deleteDimension` go through `:batchUpdate`, with the same
 * auth/token client, 10s timeout and Google-message surfacing as `writeCell`.
 * Indices are 0-based and half-open, exactly as the API expects:
 *   - insert a row at 0-based index i  -> startIndex i, endIndex i + 1
 *   - delete the row at 0-based index i -> startIndex i, endIndex i + 1
 * (The 1-based equivalents in the brief: after row R inserts at R; deleting
 * row R uses R−1..R.)
 */
import { cellAt, type Grid } from "@/lib/sheets/grid";
import { TABS } from "@/lib/sheets/fetch";
import { spreadsheetId } from "./config";
import { getAccessToken } from "./auth";
import { InvalidTargetError, UpstreamError } from "./errors";
import {
  SHEETS_API_BASE,
  WRITE_TIMEOUT_MS,
  describeFetchError,
  googleErrorMessage,
} from "./write";

/** Sheet1's numeric sheetId (`gid`); 0 on this spreadsheet. */
export const SHEET1_GID = Number(TABS.sheet1.gid);

export interface DimensionRange {
  sheetId: number;
  startIndex: number;
  endIndex: number;
  dimension: "ROWS";
}

export type SheetsRowRequest =
  | {
      insertDimension: {
        range: DimensionRange;
      };
    }
  | {
      deleteDimension: {
        range: DimensionRange;
      };
    };

export interface BatchUpdateOptions {
  /** Test seam: replace the global fetch (request shape assertions). */
  fetchImpl?: typeof fetch;
  /** Test seam: replace service-account token acquisition (no network). */
  getToken?: () => Promise<string>;
}

function assertRowIndex(index: number, field: string): void {
  if (!Number.isInteger(index) || index < 0) {
    throw new InvalidTargetError(
      `Invalid row index ${JSON.stringify(index)} for "${field}": expected a non-negative integer.`,
    );
  }
}

/**
 * Insert a blank row at 0-based index `insertAt` (i.e. directly BEFORE the row
 * currently at that index).
 *
 * Trade-off: the live Sheets API rejects `inheritBefore` on
 * InsertDimensionRequest ("Unknown name \"inheritBefore\" ... Cannot find
 * field"), and we deliberately do NOT replace it with repeatCell/copyPaste.
 * The new row therefore does not inherit the currency formatting of the row
 * above; that is cosmetic, and the reader parses plain numbers fine.
 */
export function insertRowRequest(
  sheetId: number,
  insertAt: number,
): SheetsRowRequest {
  assertRowIndex(insertAt, "insertAt");
  return {
    insertDimension: {
      range: {
        sheetId,
        startIndex: insertAt,
        endIndex: insertAt + 1,
        dimension: "ROWS",
      },
    },
  };
}

/** Delete the single row at 0-based index `row`. */
export function deleteRowRequest(
  sheetId: number,
  row: number,
): SheetsRowRequest {
  assertRowIndex(row, "row");
  return {
    deleteDimension: {
      range: {
        sheetId,
        startIndex: row,
        endIndex: row + 1,
        dimension: "ROWS",
      },
    },
  };
}

/**
 * Applies dimension requests through `spreadsheets/{id}:batchUpdate`.
 *
 * Callers must validate layout and conflicts BEFORE calling this: a dimension
 * request shifts every coordinate below it and cannot be undone.
 */
export async function batchUpdate(
  requests: SheetsRowRequest[],
  options: BatchUpdateOptions = {},
): Promise<void> {
  if (requests.length === 0) {
    throw new InvalidTargetError("No sheet requests were provided.");
  }

  const getToken = options.getToken ?? getAccessToken;
  const fetchImpl = options.fetchImpl ?? fetch;

  const token = await getToken();
  if (!token) {
    throw new UpstreamError(
      "No se pudo escribir: la service account no devolvió un token.",
    );
  }

  const url =
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId())}:batchUpdate`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new UpstreamError(
      `No se pudo cambiar filas en Google Sheets: ${describeFetchError(error)}`,
    );
  }

  if (!response.ok) {
    const detail = await googleErrorMessage(response);
    throw new UpstreamError(
      `Google Sheets rechazó el cambio de filas (HTTP ${
        response.status
      })${detail ? `: ${detail}` : "."}`,
      response.status,
    );
  }
}

/** Columns A and B are the only ones a budget item owns. */
const ITEM_COLUMNS = 2;

/**
 * True when the row carries ANY non-empty cell beyond cols A/B.
 *
 * "Beyond" is the whole rest of the exported row (C..end of the widest row), so
 * a debt in G/H/I, a card value in D–K or a stray note all count. A missing row
 * counts as "has data" — when in doubt, clear instead of delete.
 */
export function hasDataOutsideItems(grid: Grid, row: number): boolean {
  const cells = grid[row];
  if (!cells) {
    return true;
  }

  for (let col = ITEM_COLUMNS; col < cells.length; col += 1) {
    if (cellAt(grid, row, col).trim() !== "") {
      return true;
    }
  }
  return false;
}

export type RemovalMode = "clear" | "delete";

/**
 * Adaptive removal decision:
 *   - "delete" only when the row holds NOTHING outside A/B (safe to remove);
 *   - "clear" otherwise (writes "" into A and B, leaves every other cell).
 */
export function removalMode(grid: Grid, row: number): RemovalMode {
  return hasDataOutsideItems(grid, row) ? "clear" : "delete";
}

/** Max length of an item label, in characters (trimmed). */
export const ITEM_LABEL_MAX_LENGTH = 60;

/** Trimmed, non-empty, ≤ 60 chars. Throws InvalidTargetError (400). */
export function normalizeItemLabel(value: unknown, field = "label"): string {
  if (typeof value !== "string") {
    throw new InvalidTargetError(`"${field}" must be a string.`);
  }

  const label = value.trim();
  if (label === "") {
    throw new InvalidTargetError(`"${field}" must not be empty.`);
  }
  if (label.length > ITEM_LABEL_MAX_LENGTH) {
    throw new InvalidTargetError(
      `"${field}" must be at most ${ITEM_LABEL_MAX_LENGTH} characters.`,
    );
  }
  return label;
}
