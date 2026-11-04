/**
 * Write-back configuration.
 *
 * Phase 2 writes through a Google *service account*: the JSON key is opened
 * from GOOGLE_SERVICE_ACCOUNT_FILE (default `.google-service-account.json` in
 * the project root) and the spreadsheet must be shared with the service
 * account's `client_email` as Editor.
 *
 * `isSheetWriteConfigured()` is the single switch the UI uses to decide between
 * "editable" and "read-only". It is intentionally side-effect free: it never
 * throws and never logs the key, so a missing or malformed file is simply
 * "write-back disabled" rather than a crash on a server render.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SheetConfigError } from "@/lib/sheets/errors";

export const DEFAULT_SERVICE_ACCOUNT_FILE = ".google-service-account.json";

export interface ServiceAccountCredentials {
  client_email: string;
  private_key: string;
}

/** Absolute path of the service-account JSON (env override or repo default). */
export function serviceAccountFilePath(): string {
  const configured = process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim();
  return configured
    ? path.resolve(process.cwd(), configured)
    : path.join(process.cwd(), DEFAULT_SERVICE_ACCOUNT_FILE);
}

/**
 * Reads and validates the service-account JSON.
 *
 * Returns null for every failure mode (missing file, unreadable file, invalid
 * JSON, missing/short fields). Error messages are deliberately not logged: the
 * file's contents are a secret and a path-level hint is enough for the owner
 * (see `serviceAccountFilePath()`), while the UI only needs the boolean.
 */
export function loadServiceAccount(): ServiceAccountCredentials | null {
  const file = serviceAccountFilePath();

  try {
    if (!existsSync(file)) {
      return null;
    }

    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const candidate = parsed as Record<string, unknown>;
    const email = candidate.client_email;
    const key = candidate.private_key;

    if (
      typeof email !== "string" ||
      email.trim() === "" ||
      typeof key !== "string" ||
      key.trim() === ""
    ) {
      return null;
    }

    return { client_email: email.trim(), private_key: key };
  } catch {
    // Never throw, never log file contents.
    return null;
  }
}

/** True when write-back can authenticate. Never throws. */
export function isSheetWriteConfigured(): boolean {
  return loadServiceAccount() !== null;
}

/** The spreadsheet id shared by the reader and the writer. */
export function spreadsheetId(): string {
  const id = process.env.SPREADSHEET_ID?.trim();
  if (!id) {
    throw new SheetConfigError(
      "SPREADSHEET_ID is not set. Add it to .env (see .env.example).",
    );
  }
  return id;
}
