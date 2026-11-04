import { fixtureSnapshot } from "./fixture";
import type { Snapshot } from "@/lib/types";

export interface GetSnapshotOptions {
  /** Bypass the cache and re-read the source. */
  force?: boolean;
}

/**
 * Single entry point the UI uses to obtain the current snapshot.
 *
 * Currently returns fixture data (the real "Payments" sheet contents
 * captured 2026-11-03). The live Google Sheets reader replaces the
 * internals while keeping this exact signature.
 */
export async function getSnapshot(
  options: GetSnapshotOptions = {},
): Promise<Snapshot> {
  const ttlMs = 60_000;

  if (!options.force && cache && cache.expiresAt > Date.now()) {
    return cache.snapshot;
  }

  // TODO(data-layer): replace with the live reader (public gviz CSV
  // endpoints, one fetch per tab, parse + integrity-check into Snapshot).
  const snapshot = fixtureSnapshot();

  cache = { snapshot, expiresAt: Date.now() + ttlMs };
  return snapshot;
}

let cache: { snapshot: Snapshot; expiresAt: number } | null = null;
