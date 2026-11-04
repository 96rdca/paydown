/**
 * Error types for the live Google Sheets data layer.
 *
 * Every failure carries the tab name so the route handler (and the
 * check-snapshot script) can tell the owner exactly where to look. The UI
 * surfaces the message verbatim, so keep them human-readable.
 */

export class SheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The spreadsheet id is missing from the environment. */
export class SheetConfigError extends SheetError {
  constructor(message: string) {
    super(message);
    this.name = "SheetConfigError";
  }
}

export interface SheetFetchFailure {
  tab: string;
  detail: string;
}

/** One or more tab downloads failed (network, HTTP status, timeout). */
export class SheetFetchError extends SheetError {
  readonly failures: SheetFetchFailure[];

  constructor(failures: SheetFetchFailure[]) {
    const detail = failures
      .map((failure) => `"${failure.tab}" — ${failure.detail}`)
      .join("; ");
    super(
      `Could not read the Google Sheet (${failures.length} tab${
        failures.length === 1 ? "" : "s"
      } failed): ${detail}`,
    );
    this.name = "SheetFetchError";
    this.failures = failures;
  }
}

/**
 * An anchor cell/row the parser relies on is not where (or not what) it
 * should be. Usually means the owner restructured the tab.
 */
export class SheetLayoutError extends SheetError {
  readonly tab: string;
  readonly expected: string;
  readonly found: string;

  constructor(tab: string, expected: string, found: string) {
    super(
      `Sheet layout changed in tab "${tab}": expected ${expected}, found ${found}. ` +
        `Fix the tab or update the parser.`,
    );
    this.name = "SheetLayoutError";
    this.tab = tab;
    this.expected = expected;
    this.found = found;
  }
}

/** A cell exists but does not contain a value the parser can use. */
export class SheetParseError extends SheetError {
  readonly tab: string;

  constructor(tab: string, detail: string) {
    super(`Could not parse tab "${tab}": ${detail}`);
    this.name = "SheetParseError";
    this.tab = tab;
  }
}
