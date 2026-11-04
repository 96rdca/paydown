import { describe, expect, test } from "bun:test";
import {
  NUMBER_EPSILON,
  assertNoConflict,
  datesMatch,
  numbersMatch,
  statusesMatch,
  valuesMatch,
} from "./conflict";
import { WriteConflictError } from "./errors";

describe("numbersMatch", () => {
  test("uses a half-cent epsilon", () => {
    expect(NUMBER_EPSILON).toBe(0.005);
    expect(numbersMatch(100, 100.004)).toBe(true);
    expect(numbersMatch(100, 99.996)).toBe(true);
    expect(numbersMatch(100, 100.006)).toBe(false);
    expect(numbersMatch(35000, 35000.01)).toBe(false);
  });

  test("treats null as 'empty', not as zero", () => {
    expect(numbersMatch(null, null)).toBe(true);
    expect(numbersMatch(null, 0)).toBe(false);
    expect(numbersMatch(0, null)).toBe(false);
  });

  test("rejects non-numeric current values", () => {
    expect(numbersMatch(10, "10")).toBe(false);
    expect(numbersMatch(10, "garbage")).toBe(false);
  });
});

describe("datesMatch", () => {
  test("compares the reader's normalized date", () => {
    expect(datesMatch("2026-12-21", "2026-12-21")).toBe(true);
    expect(datesMatch("2026-12-21", "December 21, 2026")).toBe(true);
    expect(datesMatch("2026-12-21", "12/21/2026")).toBe(true);
    expect(datesMatch("2026-12-21", "21-Dec-2026")).toBe(true);
  });

  test("detects a changed day", () => {
    expect(datesMatch("2026-12-21", "2026-12-22")).toBe(false);
    expect(datesMatch("2026-12-21", "December 22, 2026")).toBe(false);
  });

  test("rejects empty and unparseable dates", () => {
    expect(datesMatch("2026-12-21", null)).toBe(false);
    expect(datesMatch("2026-12-21", "next friday")).toBe(false);
  });
});

describe("statusesMatch", () => {
  test("is exact after the reader's normalization", () => {
    expect(statusesMatch("Cuota Paga", "Cuota Paga")).toBe(true);
    expect(statusesMatch("Cuota Paga", " cuota   paga ")).toBe(true);
    expect(statusesMatch("Pendiente", "Pendiente")).toBe(true);
  });

  test("never matches a different status", () => {
    expect(statusesMatch("Cuota Paga", "Pendiente")).toBe(false);
    expect(statusesMatch("Pendiente", "Abono Capital")).toBe(false);
    expect(statusesMatch("Pendiente", null)).toBe(false);
    expect(statusesMatch("Pendiente", "Pendient")).toBe(false);
  });
});

describe("valuesMatch", () => {
  test("dispatches by conflict kind", () => {
    expect(valuesMatch("number", 1, 1.001)).toBe(true);
    expect(valuesMatch("date", "2026-12-21", "2026-12-21")).toBe(true);
    expect(valuesMatch("status", "Pendiente", "pendiente")).toBe(true);
  });

  test("rejects a mismatched before type", () => {
    expect(valuesMatch("number", "10", 10)).toBe(false);
    expect(valuesMatch("date", null, "2026-12-21")).toBe(false);
    expect(valuesMatch("status", 1, "Pendiente")).toBe(false);
  });
});

describe("assertNoConflict", () => {
  test("passes when the sheet still holds the value the UI saw", () => {
    expect(() => assertNoConflict("number", 946, 946.002, "Apap")).not.toThrow();
    expect(() =>
      assertNoConflict("status", "Pendiente", "pendiente", "Jeep cuota 62"),
    ).not.toThrow();
  });

  test("throws a 409-shaped error carrying the current value", () => {
    let caught: unknown;
    try {
      assertNoConflict("number", 946.89, 1200, "Deuda apap (monto)");
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof WriteConflictError).toBe(true);
    const conflict = caught as WriteConflictError;
    expect(conflict.current).toBe(1200);
    expect(conflict.message).toContain("La hoja cambió");
    expect(conflict.message).toContain("Deuda apap (monto)");
  });

  test("reports an empty sheet cell as 'vacío'", () => {
    let caught: unknown;
    try {
      assertNoConflict("number", 500, null, "APAP limite USD");
    } catch (error) {
      caught = error;
    }

    expect(caught instanceof WriteConflictError).toBe(true);
    expect((caught as WriteConflictError).current).toBeNull();
    expect((caught as WriteConflictError).message).toContain("vacío");
  });
});
