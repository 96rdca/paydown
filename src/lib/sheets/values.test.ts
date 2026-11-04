import { describe, expect, test } from "bun:test";
import { parseDate, parseNumber, parsePercent, slugify } from "./values";

describe("parseNumber", () => {
  test("parses currency-formatted amounts", () => {
    expect(parseNumber("$1,234.56")).toBe(1234.56);
    expect(parseNumber("$0.00")).toBe(0);
    expect(parseNumber("$159,070.21")).toBe(159070.21);
  });

  test("parses negative currency", () => {
    expect(parseNumber("-$11,412.11")).toBe(-11412.11);
    expect(parseNumber("($1,234.56)")).toBe(-1234.56);
  });

  test("parses percentages as fractions", () => {
    expect(parseNumber("18.00%")).toBe(0.18);
    expect(parseNumber("6.25%")).toBe(0.0625);
    expect(parsePercent("18.95%")).toBe(0.1895);
  });

  test("leaves plain numbers alone", () => {
    expect(parseNumber("29000")).toBe(29000);
    expect(parseNumber("60.5")).toBe(60.5);
    expect(parseNumber("0.1895")).toBe(0.1895);
  });

  test("maps empty cells and junk to null", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
    expect(parseNumber("-")).toBeNull();
    expect(parseNumber("n/a")).toBeNull();
    expect(parseNumber("not money")).toBeNull();
  });
});

describe("parseDate", () => {
  test("normalizes the three sheet date formats", () => {
    expect(parseDate("December 21, 2026")).toBe("2026-12-21");
    expect(parseDate("4/29/2025")).toBe("2025-04-29");
    expect(parseDate("4-Mar-2024")).toBe("2024-03-04");
  });

  test("accepts ISO and single-digit parts", () => {
    expect(parseDate("2024-07-27")).toBe("2024-07-27");
    expect(parseDate("1/5/2025")).toBe("2025-01-05");
    expect(parseDate("1-Apr-2024")).toBe("2024-04-01");
  });

  test("rejects empty and impossible dates", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("March 32, 2026")).toBeNull();
    expect(parseDate("4/31/2025")).toBeNull();
    expect(parseDate("29 Feb 2025")).toBeNull();
  });
});

describe("slugify", () => {
  test("produces stable id fragments", () => {
    expect(slugify("Mas Limite APAP")).toBe("mas-limite-apap");
    expect(slugify("Prestamo BR")).toBe("prestamo-br");
    expect(slugify("USD Microsoft")).toBe("usd-microsoft");
    expect(slugify("Comisión de avance")).toBe("comision-de-avance");
  });
});
