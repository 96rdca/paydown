import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { SheetLayoutError } from "@/lib/sheets/errors";
import {
  InvalidTargetError,
  NotConfiguredError,
  UnknownEntityError,
  UpstreamError,
  WriteConflictError,
} from "./errors";
import {
  readCuotaNumber,
  readCuotaStatus,
  readFiniteNumber,
  readIsoDate,
  readNullableNumber,
  sheetErrorResponse,
} from "./http";

async function responseFor(error: unknown): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const response = sheetErrorResponse(error, "test");
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body };
}

const originalConsoleError = console.error.bind(console);

beforeEach(() => {
  // 5xx responses log on purpose; keep the test output clean.
  console.error = () => {};
});

afterEach(() => {
  console.error = originalConsoleError;
});

describe("sheetErrorResponse status mapping", () => {
  test("503 when write-back is not configured", async () => {
    const { status, body } = await responseFor(new NotConfiguredError());
    expect(status).toBe(503);
    expect(body.error).toBe(
      "Escritura no configurada: falta la service account.",
    );
    expect(body.current).toBeUndefined();
  });

  test("409 with the freshest parsed value on a conflict", async () => {
    const { status, body } = await responseFor(
      new WriteConflictError("La hoja cambió: …", 1200),
    );
    expect(status).toBe(409);
    expect(body.error).toContain("La hoja cambió");
    expect(body.current).toBe(1200);
  });

  test("404 for an id missing from the sheet", async () => {
    const { status } = await responseFor(
      new UnknownEntityError('Unknown card id "nope".'),
    );
    expect(status).toBe(404);
  });

  test("400 for a bad payload / unknown enum value", async () => {
    const { status } = await responseFor(new InvalidTargetError("bad"));
    expect(status).toBe(400);
  });

  test("502 for upstream and reader layout failures", async () => {
    expect((await responseFor(new UpstreamError("boom", 500))).status).toBe(
      502,
    );
    expect(
      (await responseFor(new SheetLayoutError("Sheet1", "x", "y"))).status,
    ).toBe(502);
  });
});

describe("payload readers", () => {
  test("reject non-finite numbers and enforce lower bounds", () => {
    expect(readFiniteNumber(5, "before")).toBe(5);
    expect(() => readFiniteNumber("5", "before")).toThrow();
    expect(() => readFiniteNumber(Number.NaN, "before")).toThrow();

    try {
      readFiniteNumber(-1, "after", { min: 0 });
    } catch (error) {
      expect(error instanceof InvalidTargetError).toBe(true);
    }

    try {
      readFiniteNumber(0, "after", { min: 0, exclusiveMin: true });
    } catch (error) {
      expect(error instanceof InvalidTargetError).toBe(true);
    }
  });

  test("card values may be null but not strings", () => {
    expect(readNullableNumber(null, "before")).toBeNull();
    expect(readNullableNumber(82.32, "before")).toBe(82.32);
    expect(() => readNullableNumber("82.32", "before")).toThrow();
  });

  test("accepts only canonical ISO dates", () => {
    expect(readIsoDate("2026-12-21", "dueDate.after")).toBe("2026-12-21");
    expect(() => readIsoDate("2026-2-1", "dueDate.after")).toThrow();
    expect(() => readIsoDate("12/21/2026", "dueDate.after")).toThrow();
    expect(() => readIsoDate("2026-02-30", "dueDate.after")).toThrow();
    expect(() => readIsoDate(1234, "dueDate.after")).toThrow();
  });

  test("only the two writable statuses are accepted", () => {
    expect(readCuotaStatus("Cuota Paga", "before")).toBe("Cuota Paga");
    expect(readCuotaStatus("Pendiente", "after")).toBe("Pendiente");
    expect(() => readCuotaStatus("Abono Capital", "after")).toThrow();
    expect(() => readCuotaStatus("cuota paga", "after")).toThrow();
  });

  test("cuota numbers come from the URL as positive integers", () => {
    expect(readCuotaNumber("61")).toBe(61);
    expect(() => readCuotaNumber("0")).toThrow();
    expect(() => readCuotaNumber("-1")).toThrow();
    expect(() => readCuotaNumber("1.5")).toThrow();
    expect(() => readCuotaNumber("abc")).toThrow();
  });
});
