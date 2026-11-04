/**
 * Downloads the CSV export for each tab of the "Payments" spreadsheet.
 *
 * Endpoint note: the task brief suggested `gviz/tq?tqx=out:csv&gid=…`, but
 * that endpoint applies Google's per-column type inference and silently
 * returns empty cells when text lives in a mostly-numeric column. On this
 * sheet that drops the card headers (`Santa Cruz (18) - (13)`, …), the
 * receivable debtors and several Jeep labels, which makes a faithful snapshot
 * impossible. `/export?format=csv&gid=…` serves the same tab as plain
 * RFC 4180 CSV without that loss, so we use it and keep the same
 * "public, no auth, read-only" contract.
 */
import { SheetConfigError, SheetFetchError, type SheetFetchFailure } from "./errors";

export const TAB_TIMEOUT_MS = 10_000;

export const TABS = {
  sheet1: { tab: "Sheet1", gid: "0" },
  credimas: { tab: "Credimas", gid: "1379323527" },
  savings: { tab: "Ahorro 100", gid: "1235839389" },
  autoLoan: { tab: "Auto Loan", gid: "644639917" },
  jeepLoan: { tab: "Jeep Loan", gid: "2061641509" },
} as const;

export type TabKey = keyof typeof TABS;
export type TabSpec = (typeof TABS)[TabKey];

export type TabCsv = Record<TabKey, string>;

function spreadsheetId(): string {
  const id = process.env.SPREADSHEET_ID?.trim();
  if (!id) {
    throw new SheetConfigError(
      "SPREADSHEET_ID is not set. Add it to .env (see .env.example).",
    );
  }
  return id;
}

function csvUrl(id: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(
    id,
  )}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

function describeFetchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return `timed out after ${TAB_TIMEOUT_MS}ms`;
    }
    return error.message || error.name;
  }
  return String(error);
}

async function fetchTab(id: string, spec: TabSpec): Promise<string> {
  let response: Response;

  try {
    response = await fetch(csvUrl(id, spec.gid), {
      cache: "no-store",
      signal: AbortSignal.timeout(TAB_TIMEOUT_MS),
      // Google occasionally returns a consent/login HTML page instead of the
      // CSV when a sheet stops being link-shared; an Accept header keeps the
      // happy path unambiguous.
      headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8" },
    });
  } catch (error) {
    throw new SheetFetchError([{ tab: spec.tab, detail: describeFetchError(error) }]);
  }

  if (!response.ok) {
    throw new SheetFetchError([
      {
        tab: spec.tab,
        detail: `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
      },
    ]);
  }

  const body = await response.text();
  if (!body.trim()) {
    throw new SheetFetchError([{ tab: spec.tab, detail: "empty CSV response" }]);
  }
  return body;
}

/**
 * Fetches every tab in parallel. Any failed tab fails the whole snapshot —
 * returning a half-parsed snapshot would make the UI lie about the owner's
 * finances.
 */
export async function fetchAllTabs(): Promise<TabCsv> {
  const id = spreadsheetId();
  const entries = Object.entries(TABS) as Array<[TabKey, TabSpec]>;

  const results = await Promise.allSettled(
    entries.map(([, spec]) => fetchTab(id, spec)),
  );

  const out = {} as TabCsv;
  const failures: SheetFetchFailure[] = [];

  results.forEach((result, index) => {
    const [key, spec] = entries[index];
    if (result.status === "fulfilled") {
      out[key] = result.value;
      return;
    }

    const reason: unknown = result.reason;
    if (reason instanceof SheetFetchError) {
      failures.push(...reason.failures);
    } else {
      failures.push({ tab: spec.tab, detail: describeFetchError(reason) });
    }
  });

  if (failures.length > 0) {
    throw new SheetFetchError(failures);
  }

  return out;
}
