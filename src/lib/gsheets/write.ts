/**
 * Single-cell writer for the Sheets REST API.
 *
 * Contract: exactly one cell per call. There is deliberately no "update a
 * range"/"replace a table" helper — the sheet belongs to its owner and a bulk
 * write would clobber columns this app does not understand (formulas, notes,
 * hidden helper cells).
 *
 * `valueInputOption=USER_ENTERED` is intentional:
 *   - a number is parsed by Sheets as a number, so the cell keeps its existing
 *     currency/percent formatting (`$1,234.56`, `18.00%`);
 *   - an ISO date string ("2026-12-21") is parsed as a real date, matching how
 *     the reader normalizes dates from any of the sheet's date renderings;
 *   - status text ("Cuota Paga") is stored as inert text, never a formula.
 * RAW would store everything as a literal string and break the date cells.
 */
import { spreadsheetId } from "./config";
import { getAccessToken } from "./auth";
import { InvalidTargetError, UpstreamError } from "./errors";

export const SHEETS_API_BASE =
  "https://sheets.googleapis.com/v4/spreadsheets";
export const WRITE_TIMEOUT_MS = 10_000;

/** Tab names on this spreadsheet are plain names; reject anything exotic. */
const TAB_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]*$/;
const A1_PATTERN = /^[A-Z]{1,3}[1-9][0-9]*$/;

export interface WriteCellOptions {
  /** Test seam: replace the global fetch (request shape assertions). */
  fetchImpl?: typeof fetch;
  /** Test seam: replace service-account token acquisition (no network). */
  getToken?: () => Promise<string>;
}

function assertSafeTab(tab: string): void {
  if (!TAB_PATTERN.test(tab)) {
    throw new InvalidTargetError(
      `Invalid sheet tab name ${JSON.stringify(tab)}.`,
    );
  }
}

function assertSafeRange(range: string): void {
  if (!A1_PATTERN.test(range)) {
    throw new InvalidTargetError(
      `Invalid A1 range ${JSON.stringify(range)}: expected a single cell.`,
    );
  }
}

export function describeFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `sin respuesta después de ${WRITE_TIMEOUT_MS}ms`;
    }
    return error.message || error.name;
  }
  return String(error);
}

/** Google puts the actionable text in `error.message`; keep it for the UI. */
export async function googleErrorMessage(response: Response): Promise<string> {
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === "object" && parsed !== null) {
      const error = (parsed as Record<string, unknown>).error;
      if (typeof error === "object" && error !== null) {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === "string" && message.trim() !== "") {
          return message.trim();
        }
      }
    }
  } catch {
    // Non-JSON error body (HTML gateway page, empty body, …).
  }
  return "";
}

/**
 * Writes one value into one cell.
 *
 * @param tab   Tab name exactly as Google prints it ("Sheet1", "Auto Loan").
 * @param range A1 cell without the tab ("B12").
 * @param value Number (money/rate) or string (ISO date/status text).
 */
export async function writeCell(
  tab: string,
  range: string,
  value: string | number,
  options: WriteCellOptions = {},
): Promise<void> {
  assertSafeTab(tab);
  assertSafeRange(range);

  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new InvalidTargetError(
      `Refusing to write a non-finite number (${String(value)}).`,
    );
  }

  const getToken = options.getToken ?? getAccessToken;
  const fetchImpl = options.fetchImpl ?? fetch;

  const token = await getToken();
  if (!token) {
    throw new UpstreamError(
      "No se pudo escribir: la service account no devolvió un token.",
    );
  }

  const rangeWithTab = `'${tab}'!${range}`;
  const url =
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId())}` +
    `/values/${encodeURIComponent(rangeWithTab)}?valueInputOption=USER_ENTERED`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "PUT",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ values: [[value]] }),
      signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new UpstreamError(
      `No se pudo escribir en Google Sheets (${tab}!${range}): ${describeFetchError(
        error,
      )}`,
    );
  }

  if (!response.ok) {
    const detail = await googleErrorMessage(response);
    throw new UpstreamError(
      `Google Sheets rechazó la escritura en ${tab}!${range} (HTTP ${
        response.status
      })${detail ? `: ${detail}` : "."}`,
      response.status,
    );
  }
}
