import { describe, expect, test } from "bun:test";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  test("parses quoted commas", () => {
    const rows = parseCsv(
      '"Prestamo, Cumple 2024, Jarabacoa",Omar Cullen,"$41,000.00"',
    );
    expect(rows).toEqual([
      ["Prestamo, Cumple 2024, Jarabacoa", "Omar Cullen", "$41,000.00"],
    ]);
  });

  test("unescapes doubled quotes", () => {
    const rows = parseCsv('a,"say ""hi""",b');
    expect(rows).toEqual([["a", 'say "hi"', "b"]]);
  });

  test("handles CRLF, LF and embedded newlines", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseCsv("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(parseCsv('a,"line 1\nline 2",c')).toEqual([
      ["a", "line 1\nline 2", "c"],
    ]);
  });

  test("does not emit a phantom row after a trailing newline", () => {
    expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
    expect(parseCsv("a,b")).toEqual([["a", "b"]]);
  });

  test("strips a UTF-8 BOM and keeps ragged rows", () => {
    expect(parseCsv('\ufeffQ 15,"$3,476.22"\r\n')).toEqual([
      ["Q 15", "$3,476.22"],
    ]);
    expect(parseCsv("a\nb,c,d")).toEqual([["a"], ["b", "c", "d"]]);
  });

  test("keeps trailing empty fields", () => {
    expect(parseCsv("a,b,\n")).toEqual([["a", "b", ""]]);
  });
});
