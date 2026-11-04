import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FinancialState } from "@/lib/types";
import { SheetLayoutError } from "@/lib/sheets/errors";
import type { Grid } from "@/lib/sheets/grid";
import {
  addItemRow,
  removeItemRow,
  renameItemLabel,
  type RowOpOptions,
} from "./engine";
import {
  InvalidTargetError,
  NotConfiguredError,
  UnknownEntityError,
  UpstreamError,
  WriteConflictError,
} from "./errors";
import {
  hasDataOutsideItems,
  insertRowRequest,
  deleteRowRequest,
  batchUpdate,
  removalMode,
} from "./rows";
import {
  findPeriodItemRow,
  isStructuralRow,
  resolveInsertionPoint,
  resolvePeriodBlock,
} from "./resolve";

/* ────────────────────────────── Fixture ────────────────────────────── */

/**
 * Sheet1 in the live layout (verified 2026-11-04): blank leading row, Q15
 * items in A/B SHARING ROWS with the Deudas block in G/H/I, Q30 items sharing
 * rows with the card matrix (D–K), then the "Razon" table.
 *
 *   idx 0  (blank)
 *   idx 1  Q 15        idx 2  Sueldo
 *   idx 3  Starlink  + Apap / 946.89 / 2026-11-21   (shared line!)
 *   idx 4  Luz       idx 5 Mas Limite APAP
 *   idx 6  Jeep      idx 7 Credimas
 *   idx 8  (blank)   idx 9 Q 30   idx 10 Sueldo + Banco (Corte) + cards
 *   idx 11–18 Q30 items + card rows
 *   idx 19–21 (blank)  idx 22 Razon headers  idx 23 receivables
 */
function blankGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () => Array<string>(cols).fill(""));
}

function fixtureGrid(): Grid {
  const grid = blankGrid(24, 12);

  grid[1][0] = "Q 15";
  grid[1][1] = "$3,430.22";
  grid[1][3] = "Tasa Dollar";
  grid[1][4] = "$61.50";
  grid[1][6] = "Deudas";

  grid[2][0] = "Sueldo";
  grid[2][1] = "$35,000.00";

  grid[3][0] = "Starlink";
  grid[3][1] = "$4,113.28";
  grid[3][6] = "Apap";
  grid[3][7] = "$946.89";
  grid[3][8] = "November 21, 2026";

  grid[4][0] = "Luz";
  grid[4][1] = "$1,500.00";

  grid[5][0] = "Mas Limite APAP";
  grid[5][1] = "$946.00";

  grid[6][0] = "Jeep";
  grid[6][1] = "$21,500.00";

  grid[7][0] = "Credimas";
  grid[7][1] = "$3,510.50";

  grid[9][0] = "Q 30";
  grid[9][1] = "$9,847.45";

  grid[10][0] = "Sueldo";
  grid[10][1] = "$29,000.00";
  grid[10][3] = "Banco (Corte)";
  const cardHeaders = [
    "Santa Cruz (18) - (13)",
    "Caribe (4) - (26)",
    "Banreservas (26)",
    "BHD - Premia (18) -(12)",
    "BHD - Mi Pais (15) -(9)",
    "APAP (21)",
    "Totales",
  ];
  cardHeaders.forEach((header, offset) => {
    grid[10][4 + offset] = header;
  });

  const q30Items = [
    "Internet",
    "Internet Cellular",
    "HBO",
    "Luz",
    "USD Microsoft",
    "USD Netflix",
    "Claris",
    "Prestamo BR",
  ];
  const cardRows = [
    "Limite DOP",
    "Limite USD",
    "Balance Corte",
    "Balance Corte USD",
    "Disponible",
    "Disponible USD",
    "Pago Minimo",
    "Pago Minimo USD",
  ];
  q30Items.forEach((label, offset) => {
    const row = 11 + offset;
    grid[row][0] = label;
    grid[row][1] = "$1,000.00";
    grid[row][3] = cardRows[offset];
    grid[row][4] = "$100.00";
  });

  grid[22][0] = "Razon";
  grid[22][1] = "Deudor";
  grid[22][2] = "Monto";
  grid[22][3] = "Meses";
  grid[22][4] = "Total";
  grid[22][6] = "Razon";
  grid[22][7] = "Deudor";
  grid[22][8] = "Monto";
  grid[22][9] = "Meses";
  grid[22][10] = "Total";

  return grid;
}

function clone(grid: Grid): Grid {
  return grid.map((row) => [...row]);
}

/* ───────────────────────── In-memory Sheets API ────────────────────── */

interface FetchCall {
  url: string;
  init?: RequestInit;
}

interface FakeSheetsRequest {
  insertDimension?: { range?: { startIndex?: number } };
  deleteDimension?: { range?: { startIndex?: number; endIndex?: number } };
}

function columnIndex(letters: string): number {
  let value = 0;
  for (const char of letters) {
    value = value * 26 + (char.charCodeAt(0) - 64);
  }
  return value - 1;
}

/**
 * Minimal Sheets stand-in: applies batchUpdate dimension requests and single
 * value PUTs to an in-memory grid, so the engine's post-mutation verification
 * sees a sheet that really changed.
 */
function sheetServer(initial: Grid) {
  const state = { grid: clone(initial) };
  const calls: FetchCall[] = [];

  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });

    if (url.includes(":batchUpdate")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        requests?: FakeSheetsRequest[];
      };
      for (const request of body.requests ?? []) {
        const insert = request.insertDimension;
        if (insert?.range?.startIndex !== undefined) {
          state.grid.splice(insert.range.startIndex, 0, []);
          continue;
        }
        const remove = request.deleteDimension;
        if (
          remove?.range?.startIndex !== undefined &&
          remove.range.endIndex !== undefined
        ) {
          state.grid.splice(
            remove.range.startIndex,
            remove.range.endIndex - remove.range.startIndex,
          );
        }
      }
      return Response.json({});
    }

    const decoded = decodeURIComponent(url);
    const match = /\/values\/'Sheet1'!([A-Z]+)(\d+)/.exec(decoded);
    if (match && (init?.method ?? "").toUpperCase() === "PUT") {
      const row = Number(match[2]) - 1;
      const col = columnIndex(match[1]);
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        values?: unknown[][];
      };
      state.grid[row] = state.grid[row] ?? [];
      const value = body.values?.[0]?.[0];
      state.grid[row][col] = value == null ? "" : String(value);
      return Response.json({});
    }

    return Response.json({});
  }) as unknown as typeof fetch;

  return { state, calls, impl };
}

/* ───────────────────────────── Test setup ──────────────────────────── */

const ACCOUNT_FILE = path.join(
  tmpdir(),
  `paydown-rows-account-${process.pid}.json`,
);
writeFileSync(
  ACCOUNT_FILE,
  JSON.stringify({
    client_email: "rows@test.iam.gserviceaccount.com",
    private_key: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
  }),
);

const ORIGINAL_ACCOUNT_ENV = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
const ORIGINAL_ID_ENV = process.env.SPREADSHEET_ID;

beforeEach(() => {
  process.env.GOOGLE_SERVICE_ACCOUNT_FILE = ACCOUNT_FILE;
  process.env.SPREADSHEET_ID = "test-sheet-id";
});

afterEach(() => {
  if (ORIGINAL_ACCOUNT_ENV === undefined) {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  } else {
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE = ORIGINAL_ACCOUNT_ENV;
  }
  if (ORIGINAL_ID_ENV === undefined) {
    delete process.env.SPREADSHEET_ID;
  } else {
    process.env.SPREADSHEET_ID = ORIGINAL_ID_ENV;
  }
});

const token = async () => "test-token";
const FRESH_STATE = { marker: "fresh-state" } as unknown as FinancialState;

function rowOptions(
  server: ReturnType<typeof sheetServer>,
  overrides: RowOpOptions = {},
): RowOpOptions {
  return {
    fetchImpl: server.impl,
    getToken: token,
    readGrid: async () => clone(server.state.grid),
    loadState: async () => FRESH_STATE,
    verifyDelayMs: 0,
    ...overrides,
  };
}

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

function valueWrites(calls: FetchCall[]): FetchCall[] {
  return calls.filter((call) => !call.url.includes(":batchUpdate"));
}

/* ─────────────────────── Insertion-index resolution ────────────────── */

describe("resolveInsertionPoint", () => {
  test("Q15 inserts after its last item (Credimas, 0-based 7)", () => {
    const point = resolveInsertionPoint(fixtureGrid(), "Q15");

    expect(point.insertIndex).toBe(8);
    expect(point.salaryRow).toBe(2);
    expect(point.lastItemRow).toBe(7);
    expect(point.endRow).toBe(9);
  });

  test("Q30 inserts after its last item (Prestamo BR, 0-based 18)", () => {
    const point = resolveInsertionPoint(fixtureGrid(), "Q 30");

    expect(point.insertIndex).toBe(19);
    expect(point.salaryRow).toBe(10);
    expect(point.lastItemRow).toBe(18);
    expect(point.endRow).toBe(22);
  });

  test("a block with zero items inserts directly after Sueldo", () => {
    const grid = fixtureGrid();
    // Blank every Q15 item label; the shared Deudas cells stay in place.
    for (let row = 3; row <= 7; row += 1) {
      grid[row][0] = "";
      grid[row][1] = "";
    }

    const block = resolvePeriodBlock(grid, "Q15");
    expect(block.itemRows).toEqual([]);

    const point = resolveInsertionPoint(grid, "Q15");
    expect(point.insertIndex).toBe(3); // Sueldo is 2, so 3 is right after it
    expect(point.lastItemRow).toBeNull();
  });

  test("unknown period ids are rejected before any layout read", () => {
    const error = (() => {
      try {
        resolveInsertionPoint(fixtureGrid(), "Q45");
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error instanceof InvalidTargetError).toBe(true);
  });

  test("a missing block anchor fails with SheetLayoutError", () => {
    const grid = fixtureGrid();
    grid[9][0] = "not q30";
    const error = (() => {
      try {
        resolveInsertionPoint(grid, "Q15");
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error instanceof SheetLayoutError).toBe(true);
  });
});

/* ─────────────────────── Row emptiness / adaptive rule ─────────────── */

describe("row emptiness and adaptive removal", () => {
  test("a Q15 item row carrying Deudas cells must be CLEARED, never deleted", () => {
    const grid = fixtureGrid();
    expect(hasDataOutsideItems(grid, 3)).toBe(true);
    expect(removalMode(grid, 3)).toBe("clear");
  });

  test("a Q15 row with nothing beyond A/B can be DELETED", () => {
    const grid = fixtureGrid();
    expect(hasDataOutsideItems(grid, 4)).toBe(false);
    expect(removalMode(grid, 4)).toBe("delete");
  });

  test("whitespace outside A/B is still empty", () => {
    const grid = fixtureGrid();
    grid[4][5] = "   ";
    expect(hasDataOutsideItems(grid, 4)).toBe(false);
  });

  test("a missing row is treated as having data (clear when in doubt)", () => {
    const grid = fixtureGrid();
    expect(hasDataOutsideItems(grid, 999)).toBe(true);
    expect(removalMode(grid, 999)).toBe("clear");
  });

  test("structural rows are recognised", () => {
    const grid = fixtureGrid();
    expect(isStructuralRow(grid, 1)).toBe(true); // Q 15
    expect(isStructuralRow(grid, 2)).toBe(true); // Sueldo
    expect(isStructuralRow(grid, 9)).toBe(true); // Q 30
    expect(isStructuralRow(grid, 10)).toBe(true); // Sueldo + cards header
    expect(isStructuralRow(grid, 22)).toBe(true); // Razon
    expect(isStructuralRow(grid, 3)).toBe(false); // Starlink
  });
});

/* ─────────────────────── batchUpdate request shape ─────────────────── */

describe("row request payloads", () => {
  test("insertRowRequest uses 0-based half-open indices and no inheritBefore", () => {
    expect(insertRowRequest(0, 8)).toEqual({
      insertDimension: {
        range: {
          sheetId: 0,
          startIndex: 8,
          endIndex: 9,
          dimension: "ROWS",
        },
      },
    });
  });

  test("deleteRowRequest targets exactly one 0-based row", () => {
    expect(deleteRowRequest(0, 3)).toEqual({
      deleteDimension: {
        range: {
          sheetId: 0,
          startIndex: 3,
          endIndex: 4,
          dimension: "ROWS",
        },
      },
    });
  });

  test("negative or fractional indices are rejected", () => {
    expect(() => insertRowRequest(0, -1)).toThrow();
    expect(() => deleteRowRequest(0, 1.5)).toThrow();
  });

  test("batchUpdate POSTs the exact payload with the bearer token", async () => {
    const { impl, calls } = sheetServer(fixtureGrid());

    await batchUpdate([insertRowRequest(0, 8)], {
      fetchImpl: impl,
      getToken: token,
    });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];

    expect(url).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/test-sheet-id:batchUpdate",
    );
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");

    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");

    expect(JSON.parse(String(init?.body))).toEqual({
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: 0,
              startIndex: 8,
              endIndex: 9,
              dimension: "ROWS",
            },
          },
        },
      ],
    });
    expect(init?.signal instanceof AbortSignal).toBe(true);
  });

  test("Google's error message is surfaced with its status", async () => {
    const impl = (async () =>
      Response.json(
        { error: { message: "The caller does not have permission" } },
        { status: 403 },
      )) as unknown as typeof fetch;

    const error = await errorOf(
      batchUpdate([deleteRowRequest(0, 3)], {
        fetchImpl: impl,
        getToken: token,
      }),
    );

    expect(error instanceof UpstreamError).toBe(true);
    expect((error as UpstreamError).status).toBe(403);
    expect((error as UpstreamError).message).toContain(
      "The caller does not have permission",
    );
  });

  test("an empty request list is a programming error", async () => {
    const error = await errorOf(batchUpdate([]));
    expect(error instanceof InvalidTargetError).toBe(true);
  });
});

/* ─────────────────────────── addItemRow ────────────────────────────── */

describe("addItemRow", () => {
  test("inserts after the Q15 block's last item and writes A/B", async () => {
    const server = sheetServer(fixtureGrid());

    const state = await addItemRow(
      "Q15",
      "  Nueva Partida  ",
      1234.5,
      rowOptions(server),
    );

    expect(state).toBe(FRESH_STATE);

    const [insertCall, ...writes] = server.calls;
    expect(insertCall.url).toContain(":batchUpdate");
    expect(JSON.parse(String(insertCall.init?.body))).toEqual({
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: 0,
              startIndex: 8,
              endIndex: 9,
              dimension: "ROWS",
            },
          },
        },
      ],
    });

    expect(valueWrites(writes).map((call) => decodeURIComponent(call.url))).toEqual([
      "https://sheets.googleapis.com/v4/spreadsheets/test-sheet-id/values/'Sheet1'!A9?valueInputOption=USER_ENTERED",
      "https://sheets.googleapis.com/v4/spreadsheets/test-sheet-id/values/'Sheet1'!B9?valueInputOption=USER_ENTERED",
    ]);

    // Trimmed label + numeric amount land on the inserted row; everything below
    // (including "Q 30") shifted one row down intact.
    expect(server.state.grid[8][0]).toBe("Nueva Partida");
    expect(server.state.grid[8][1]).toBe("1234.5");
    expect(server.state.grid[10][0]).toBe("Q 30");
    expect(server.state.grid[3][6]).toBe("Apap"); // the debt row is untouched
  });

  test("adds directly after Sueldo when the block has no items", async () => {
    const grid = fixtureGrid();
    for (let row = 3; row <= 7; row += 1) {
      grid[row][0] = "";
      grid[row][1] = "";
    }
    const server = sheetServer(grid);

    await addItemRow("Q15", "Primera", 500, rowOptions(server));

    expect(JSON.parse(String(server.calls[0].init?.body))).toEqual({
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: 0,
              startIndex: 3,
              endIndex: 4,
              dimension: "ROWS",
            },
          },
        },
      ],
    });
    expect(server.state.grid[3][0]).toBe("Primera");
    expect(server.state.grid[2][0]).toBe("Sueldo");
  });

  test("rejects an empty/oversized label and a negative amount before reading", async () => {
    const server = sheetServer(fixtureGrid());
    const options = rowOptions(server, {
      readGrid: async () => {
        throw new Error("readGrid must not run");
      },
    });

    const empty = await errorOf(addItemRow("Q15", "   ", 1, options));
    expect(empty instanceof InvalidTargetError).toBe(true);

    const long = await errorOf(addItemRow("Q15", "x".repeat(61), 1, options));
    expect(long instanceof InvalidTargetError).toBe(true);

    const negative = await errorOf(addItemRow("Q15", "Ok", -1, options));
    expect(negative instanceof InvalidTargetError).toBe(true);

    expect(server.calls).toHaveLength(0);
  });

  test("fails with NotConfiguredError when write-back is disabled", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE = path.join(
      tmpdir(),
      "paydown-rows-missing-account.json",
    );

    const server = sheetServer(fixtureGrid());
    const error = await errorOf(
      addItemRow("Q15", "Nueva", 1, rowOptions(server)),
    );

    expect(error instanceof NotConfiguredError).toBe(true);
    expect(server.calls).toHaveLength(0);
  });
});

/* ────────────────────────── removeItemRow ──────────────────────────── */

describe("removeItemRow", () => {
  test("clears A/B only when the row also holds Deudas data", async () => {
    const server = sheetServer(fixtureGrid());

    const state = await removeItemRow(
      "Q15",
      "q15-starlink",
      { label: "Starlink", amountDop: 4113.28 },
      rowOptions(server),
    );

    expect(state).toBe(FRESH_STATE);
    expect(server.calls.every((call) => !call.url.includes(":batchUpdate"))).toBe(
      true,
    );

    const writes = valueWrites(server.calls);
    expect(writes.map((call) => decodeURIComponent(call.url))).toEqual([
      "https://sheets.googleapis.com/v4/spreadsheets/test-sheet-id/values/'Sheet1'!A4?valueInputOption=USER_ENTERED",
      "https://sheets.googleapis.com/v4/spreadsheets/test-sheet-id/values/'Sheet1'!B4?valueInputOption=USER_ENTERED",
    ]);
    expect(JSON.parse(String(writes[0].init?.body))).toEqual({ values: [[""]] });
    expect(JSON.parse(String(writes[1].init?.body))).toEqual({ values: [[""]] });

    // The Deudas cells in G/H/I survive; the row count is unchanged.
    expect(server.state.grid[3][6]).toBe("Apap");
    expect(server.state.grid[3][7]).toBe("$946.89");
    expect(server.state.grid).toHaveLength(24);
    expect(findPeriodItemRow(server.state.grid, "Q15", "q15-starlink")).toBeNull();
  });

  test("deletes the whole row when nothing sits outside A/B", async () => {
    const server = sheetServer(fixtureGrid());

    await removeItemRow(
      "Q15",
      "q15-luz",
      { label: "Luz", amountDop: 1500 },
      rowOptions(server),
    );

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].url).toContain(":batchUpdate");
    expect(JSON.parse(String(server.calls[0].init?.body))).toEqual({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: 0,
              startIndex: 4,
              endIndex: 5,
              dimension: "ROWS",
            },
          },
        },
      ],
    });

    expect(server.state.grid).toHaveLength(23);
    expect(server.state.grid[4][0]).toBe("Mas Limite APAP");
    expect(findPeriodItemRow(server.state.grid, "Q15", "q15-luz")).toBeNull();
  });

  test("409s with `current` and writes nothing when the label drifted", async () => {
    const server = sheetServer(fixtureGrid());

    const error = await errorOf(
      removeItemRow(
        "Q15",
        "q15-starlink",
        { label: "Starlink viejo", amountDop: 4113.28 },
        rowOptions(server),
      ),
    );

    expect(error instanceof WriteConflictError).toBe(true);
    expect((error as WriteConflictError).current).toEqual({
      label: "Starlink",
      amountDop: 4113.28,
    });
    expect(server.calls).toHaveLength(0);
    expect(server.state.grid[3][0]).toBe("Starlink");
  });

  test("409s when only the amount drifted", async () => {
    const server = sheetServer(fixtureGrid());

    const error = await errorOf(
      removeItemRow(
        "Q15",
        "q15-luz",
        { label: "Luz", amountDop: 1501 },
        rowOptions(server),
      ),
    );

    expect(error instanceof WriteConflictError).toBe(true);
    expect(server.calls).toHaveLength(0);
  });

  test("unknown item ids are 404 material, not conflicts", async () => {
    const server = sheetServer(fixtureGrid());

    const error = await errorOf(
      removeItemRow(
        "Q30",
        "q30-nonexistent",
        { label: "Nope", amountDop: 1 },
        rowOptions(server),
      ),
    );

    expect(error instanceof UnknownEntityError).toBe(true);
    expect(server.calls).toHaveLength(0);
  });
});

/* ────────────────────────── renameItemLabel ────────────────────────── */

describe("renameItemLabel", () => {
  test("writes one cell (column A) and nothing else", async () => {
    const server = sheetServer(fixtureGrid());

    const state = await renameItemLabel(
      "Q15",
      "q15-luz",
      "Luz",
      "Luz Nueva",
      rowOptions(server),
    );

    expect(state).toBe(FRESH_STATE);
    expect(server.calls).toHaveLength(1);

    const call = server.calls[0];
    expect(decodeURIComponent(call.url)).toBe(
      "https://sheets.googleapis.com/v4/spreadsheets/test-sheet-id/values/'Sheet1'!A5?valueInputOption=USER_ENTERED",
    );
    expect(JSON.parse(String(call.init?.body))).toEqual({
      values: [["Luz Nueva"]],
    });

    expect(server.state.grid[4][0]).toBe("Luz Nueva");
    expect(server.state.grid[4][1]).toBe("$1,500.00");
    // The parser-derived id follows the label.
    expect(findPeriodItemRow(server.state.grid, "Q15", "q15-luz-nueva")).not.toBeNull();
  });

  test("409s on a stale `before` without writing", async () => {
    const server = sheetServer(fixtureGrid());

    const error = await errorOf(
      renameItemLabel("Q15", "q15-luz", "Otra cosa", "Luz Nueva", rowOptions(server)),
    );

    expect(error instanceof WriteConflictError).toBe(true);
    expect((error as WriteConflictError).current).toBe("Luz");
    expect(server.calls).toHaveLength(0);
  });

  test("rejects an oversized `after` before touching the sheet", async () => {
    const server = sheetServer(fixtureGrid());

    const error = await errorOf(
      renameItemLabel(
        "Q15",
        "q15-luz",
        "Luz",
        "y".repeat(61),
        rowOptions(server),
      ),
    );

    expect(error instanceof InvalidTargetError).toBe(true);
    expect(server.calls).toHaveLength(0);
  });
});

/* ─────────────────────── Post-mutation revalidation ────────────────── */

describe("post-mutation verification", () => {
  test("retries once when the CSV export lags the dimension change", async () => {
    const grid = fixtureGrid();
    const server = sheetServer(grid);
    const stale = clone(grid);
    let reads = 0;

    const options = rowOptions(server, {
      readGrid: async () => {
        reads += 1;
        // 1st read = pre-mutation; 2nd = lagging export; 3rd = up to date.
        return reads === 2 ? clone(stale) : clone(server.state.grid);
      },
    });

    await addItemRow("Q15", "Con Lag", 10, options);

    expect(reads).toBe(3);
    expect(server.state.grid[8][0]).toBe("Con Lag");
  });

  test("fails with UpstreamError when the inserted row never appears", async () => {
    const grid = fixtureGrid();

    const error = await errorOf(
      addItemRow("Q15", "Fantasma", 10, {
        fetchImpl: sheetServer(grid).impl,
        getToken: token,
        readGrid: async () => clone(grid), // never changes
        loadState: async () => FRESH_STATE,
        verifyDelayMs: 0,
      }),
    );

    expect(error instanceof UpstreamError).toBe(true);
    expect((error as UpstreamError).message).toContain("no se pudo verificar");
  });

  test("fails with UpstreamError when the post-mutation anchors no longer parse", async () => {
    const grid = fixtureGrid();
    const broken = clone(grid);
    broken[9][0] = "Q 30 perdido";

    let reads = 0;
    const server = sheetServer(grid);
    const error = await errorOf(
      addItemRow("Q15", "Sin Ancla", 10, {
        fetchImpl: server.impl,
        getToken: token,
        readGrid: async () => {
          reads += 1;
          return reads === 1 ? clone(grid) : clone(broken);
        },
        loadState: async () => FRESH_STATE,
        verifyDelayMs: 0,
      }),
    );

    expect(error instanceof UpstreamError).toBe(true);
    expect((error as UpstreamError).message).toContain("no se pudo releer");
  });

  test("a delete that leaves the item in place is reported as a failed verification", async () => {
    const grid = fixtureGrid();
    const error = await errorOf(
      removeItemRow(
        "Q15",
        "q15-luz",
        { label: "Luz", amountDop: 1500 },
        {
          // batchUpdate succeeds, but reads never reflect it.
          fetchImpl: (async () => Response.json({})) as unknown as typeof fetch,
          getToken: token,
          readGrid: async () => clone(grid),
          loadState: async () => FRESH_STATE,
          verifyDelayMs: 0,
        },
      ),
    );

    expect(error instanceof UpstreamError).toBe(true);
    expect((error as UpstreamError).message).toContain("sigue presente");
  });
});
