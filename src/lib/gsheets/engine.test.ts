import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  applyCellEdits,
  cardFieldEdit,
  debtEdits,
  loanStatusEdit,
  periodItemEdit,
  periodSalaryEdit,
  usdRateEdit,
} from "./engine";
import {
  InvalidTargetError,
  NotConfiguredError,
  UnknownEntityError,
} from "./errors";

/**
 * Offline coverage for the engine's guards. The network path (fresh CSV read,
 * PUT, verify, fresh state) is exercised by `scripts/check-write.ts` against
 * the real sheet — these tests only prove nothing is attempted when the input
 * or the configuration is wrong.
 */
const ORIGINAL_FILE_ENV = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;

beforeEach(() => {
  process.env.GOOGLE_SERVICE_ACCOUNT_FILE = path.join(
    tmpdir(),
    "paydown-missing-service-account.json",
  );
});

afterEach(() => {
  if (ORIGINAL_FILE_ENV === undefined) {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  } else {
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE = ORIGINAL_FILE_ENV;
  }
});

async function errorOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

describe("applyCellEdits", () => {
  test("fails fast with NotConfiguredError when there is no service account", async () => {
    const error = await errorOf(
      applyCellEdits([usdRateEdit(61.5, 61.5)]),
    );

    expect(error instanceof NotConfiguredError).toBe(true);
  });

  test("rejects an empty edit list before reading the sheet", async () => {
    const error = await errorOf(applyCellEdits([]));
    expect(error instanceof InvalidTargetError).toBe(true);
  });
});

describe("edit builders validate early", () => {
  test("period ids must be Q15/Q30", () => {
    let caught: unknown;
    try {
      periodSalaryEdit("Q45", 1, 2);
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof InvalidTargetError).toBe(true);
    expect(() => periodItemEdit("Q15", "  ", 1, 2)).toThrow();
  });

  test("edit labels are human-readable", () => {
    expect(periodSalaryEdit("Q30", 1, 2).label).toBe("Sueldo Q30");
    expect(cardFieldEdit("apap", "limitDop", null, 1).label).toBe(
      "apap Limite DOP",
    );
    expect(usdRateEdit(60.5, 60.51).value).toBe(60.51);
    expect(debtEdits("apap", { before: 1, after: 2 })[0].label).toContain(
      "apap",
    );
  });

  test("debt edits require at least one part", () => {
    let caught: unknown;
    try {
      debtEdits("apap");
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof InvalidTargetError).toBe(true);
  });

  test("debt edits produce one cell edit per provided part", () => {
    const amountOnly = debtEdits("apap", { before: 10, after: 20 });
    expect(amountOnly).toHaveLength(1);
    expect(amountOnly[0].kind).toBe("number");
    expect(amountOnly[0].tab).toBe("sheet1");

    const both = debtEdits(
      "apap",
      { before: 10, after: 20 },
      { before: "2026-12-21", after: "2027-01-21" },
    );
    expect(both).toHaveLength(2);
    expect(both[0].kind).toBe("number");
    expect(both[1].kind).toBe("date");
    expect(both[1].value).toBe("2027-01-21");
  });

  test("loans without a schedule have no status cell", () => {
    let caught: unknown;
    try {
      loanStatusEdit("credimas", 1, "Pendiente", "Cuota Paga");
    } catch (error) {
      caught = error;
    }
    expect(caught instanceof UnknownEntityError).toBe(true);
  });

  test("auto and jeep edits target their own tab", () => {
    expect(loanStatusEdit("auto-loan", 3, "Pendiente", "Cuota Paga").tab).toBe(
      "autoLoan",
    );
    expect(loanStatusEdit("jeep-loan", 62, "Pendiente", "Cuota Paga").tab).toBe(
      "jeepLoan",
    );
  });
});
