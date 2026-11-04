import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DEFAULT_SERVICE_ACCOUNT_FILE,
  isSheetWriteConfigured,
  loadServiceAccount,
  serviceAccountFilePath,
  spreadsheetId,
} from "./config";
import { SheetConfigError } from "@/lib/sheets/errors";

const ORIGINAL_FILE_ENV = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
const ORIGINAL_ID_ENV = process.env.SPREADSHEET_ID;

let tempDir: string;

function writeKey(name: string, contents: string): string {
  const file = path.join(tempDir, name);
  writeFileSync(file, contents, "utf8");
  return file;
}

function pointEnvAt(file: string | undefined): void {
  if (file === undefined) {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
    return;
  }
  process.env.GOOGLE_SERVICE_ACCOUNT_FILE = file;
}

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "paydown-gsheets-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  pointEnvAt(ORIGINAL_FILE_ENV);
  if (ORIGINAL_ID_ENV === undefined) {
    delete process.env.SPREADSHEET_ID;
  } else {
    process.env.SPREADSHEET_ID = ORIGINAL_ID_ENV;
  }
});

describe("isSheetWriteConfigured", () => {
  test("accepts a service-account JSON with client_email + private_key", () => {
    const file = writeKey(
      "valid.json",
      JSON.stringify({
        type: "service_account",
        client_email: "paydown@project.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
      }),
    );
    pointEnvAt(file);

    expect(isSheetWriteConfigured()).toBe(true);
    expect(loadServiceAccount()?.client_email).toBe(
      "paydown@project.iam.gserviceaccount.com",
    );
  });

  test("returns false for a missing file", () => {
    pointEnvAt(path.join(tempDir, "nope.json"));
    expect(isSheetWriteConfigured()).toBe(false);
  });

  test("returns false for malformed JSON", () => {
    pointEnvAt(writeKey("broken.json", "{ not json"));
    expect(isSheetWriteConfigured()).toBe(false);
  });

  test("returns false when client_email is missing", () => {
    pointEnvAt(
      writeKey(
        "no-email.json",
        JSON.stringify({ private_key: "-----BEGIN PRIVATE KEY-----" }),
      ),
    );
    expect(isSheetWriteConfigured()).toBe(false);
  });

  test("returns false when private_key is missing", () => {
    pointEnvAt(
      writeKey(
        "no-key.json",
        JSON.stringify({ client_email: "svc@example.com" }),
      ),
    );
    expect(isSheetWriteConfigured()).toBe(false);
  });

  test("returns false for blank credentials", () => {
    pointEnvAt(
      writeKey(
        "blank.json",
        JSON.stringify({ client_email: "  ", private_key: "  " }),
      ),
    );
    expect(isSheetWriteConfigured()).toBe(false);
  });

  test("returns false for a JSON array", () => {
    pointEnvAt(writeKey("array.json", JSON.stringify([1, 2, 3])));
    expect(isSheetWriteConfigured()).toBe(false);
  });

  test("never throws when the path is a directory", () => {
    pointEnvAt(tempDir);
    expect(isSheetWriteConfigured()).toBe(false);
  });

  test("resolves the default file from the working directory", () => {
    pointEnvAt(undefined);
    expect(serviceAccountFilePath()).toBe(
      path.join(process.cwd(), DEFAULT_SERVICE_ACCOUNT_FILE),
    );
  });

  test("trims and resolves a relative env path", () => {
    pointEnvAt("  keys/service.json  ");
    expect(serviceAccountFilePath()).toBe(
      path.resolve(process.cwd(), "keys/service.json"),
    );
  });
});

describe("spreadsheetId", () => {
  test("reads SPREADSHEET_ID", () => {
    process.env.SPREADSHEET_ID = "  sheet-123  ";
    expect(spreadsheetId()).toBe("sheet-123");
  });

  test("throws SheetConfigError when unset", () => {
    delete process.env.SPREADSHEET_ID;

    let caught: unknown;
    try {
      spreadsheetId();
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof SheetConfigError).toBe(true);
  });
});
