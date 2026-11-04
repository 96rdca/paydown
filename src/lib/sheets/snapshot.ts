import type { Snapshot } from "@/lib/types";
import { parseCsv } from "./csv";
import { fetchAllTabs } from "./fetch";
import { parseAutoLoan, parseCredimas, parseJeepLoan } from "./parse-loans";
import { parseSavings } from "./parse-savings";
import { parseSheet1 } from "./parse-sheet1";

export interface GetSnapshotOptions {
  /** Bypass the cache and re-read the source. */
  force?: boolean;
}

/** The UI tolerates data up to a minute old; ?force=1 always bypasses this. */
const TTL_MS = 60_000;

let cache: { snapshot: Snapshot; expiresAt: number } | null = null;
let inflight: Promise<Snapshot> | null = null;

/**
 * Single entry point the UI uses to obtain the current snapshot.
 *
 * Reads every tab of the public "Payments" spreadsheet, validates the layout
 * anchors and maps the cells into the typed Snapshot. Cached for 60s;
 * `force: true` re-fetches immediately (used by the refresh button and the
 * check-snapshot script).
 *
 * Any failed tab or layout mismatch rejects the whole promise — the UI must
 * never render a silently partial picture of the owner's finances.
 */
export async function getSnapshot(
  options: GetSnapshotOptions = {},
): Promise<Snapshot> {
  if (!options.force && cache && cache.expiresAt > Date.now()) {
    return cache.snapshot;
  }

  // Collapse bursts of cache misses into one fetch. A forced refresh always
  // starts a new request instead of joining an in-flight one.
  if (!options.force && inflight) {
    return inflight;
  }

  const pending = buildSnapshot().then((snapshot) => {
    cache = { snapshot, expiresAt: Date.now() + TTL_MS };
    return snapshot;
  });

  if (!options.force) {
    inflight = pending;
  }

  try {
    return await pending;
  } finally {
    if (inflight === pending) {
      inflight = null;
    }
  }
}

async function buildSnapshot(): Promise<Snapshot> {
  const tabs = await fetchAllTabs();

  const sheet1 = parseSheet1(parseCsv(tabs.sheet1));
  const credimas = parseCredimas(parseCsv(tabs.credimas));
  const autoLoan = parseAutoLoan(parseCsv(tabs.autoLoan));
  const jeepLoan = parseJeepLoan(parseCsv(tabs.jeepLoan));
  const savings = parseSavings(parseCsv(tabs.savings));

  return {
    fetchedAt: new Date().toISOString(),
    settings: { usdRate: sheet1.usdRate },
    periods: sheet1.periods,
    datedDebts: sheet1.datedDebts,
    cards: sheet1.cards,
    cardTotals: sheet1.cardTotals,
    receivables: sheet1.receivables,
    loans: [credimas, autoLoan, jeepLoan],
    savings,
  };
}
