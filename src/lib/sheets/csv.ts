/**
 * Minimal RFC 4180 CSV parser.
 *
 * Google's CSV export is conventional RFC 4180: comma separated, CRLF line
 * endings, double quotes around fields that contain commas/quotes/newlines,
 * and `""` for a literal quote. We hand-roll this to avoid adding a
 * dependency (package.json is owned by another lane).
 *
 * Rows are returned verbatim (including completely empty rows) so positional
 * diagnostics ("row 23") line up with the sheet. Callers should use the
 * `cellAt` helper rather than assuming every row has the same length.
 */
export function parseCsv(input: string): string[][] {
  // Google prepends a UTF-8 BOM to exported CSV files.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      // Tolerate a stray quote mid-field: treat it as the start of a quoted
      // segment rather than rejecting the whole export.
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      index += 1;
      continue;
    }

    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // Do not emit a phantom row when the file ends with a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
