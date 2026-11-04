/**
 * Live parity check for the Google Sheets data layer.
 *
 *   bun run scripts/check-snapshot.ts
 *
 * Fetches the real spreadsheet, prints the values the UI depends on and
 * compares them with fixture.ts (captured 2026-11-03). A diff means the owner
 * edited the sheet — report it, do not "fix" the fixture.
 */
import { fixtureSnapshot } from "../src/lib/sheets/fixture";
import { getSnapshot } from "../src/lib/sheets/snapshot";
import type { Loan, Snapshot } from "../src/lib/types";

interface Check {
  label: string;
  expected: unknown;
  actual: unknown;
}

function card(snapshot: Snapshot, id: string) {
  return snapshot.cards.find((candidate) => candidate.id === id) ?? null;
}

function loan(snapshot: Snapshot, id: string): Loan {
  const found = snapshot.loans.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`Live snapshot is missing loan "${id}"`);
  }
  return found;
}

function installment(loanValue: Loan, number: number) {
  const found = loanValue.schedule.find((item) => item.number === number);
  if (!found) {
    throw new Error(
      `Loan "${loanValue.id}" is missing cuota ${number} in its schedule`,
    );
  }
  return found;
}

function isMatch(expected: unknown, actual: unknown): boolean {
  if (typeof expected === "number" && typeof actual === "number") {
    return Math.abs(expected - actual) < 0.005;
  }
  if (expected === null || actual === null) {
    return expected === actual;
  }
  if (typeof expected === "object" && typeof actual === "object") {
    return JSON.stringify(expected) === JSON.stringify(actual);
  }
  return Object.is(expected, actual);
}

function display(value: unknown): string {
  if (value === undefined) {
    return "<undefined>";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function main() {
  const live = await getSnapshot({ force: true });
  const fixture = fixtureSnapshot();

  const liveAuto = loan(live, "auto-loan");
  const fixtureAuto = loan(fixture, "auto-loan");
  const liveJeep = loan(live, "jeep-loan");
  const fixtureJeep = loan(fixture, "jeep-loan");
  const liveSavingsLast = live.savings?.weeks.at(-1) ?? null;
  const fixtureSavingsLast = fixture.savings?.weeks.at(-1) ?? null;

  const checks: Check[] = [
    {
      label: "settings.usdRate",
      expected: fixture.settings.usdRate,
      actual: live.settings.usdRate,
    },
    {
      label: "Santa Cruz limit DOP",
      expected: card(fixture, "santa-cruz")?.limitDop,
      actual: card(live, "santa-cruz")?.limitDop,
    },
    {
      label: "BHD Mi Pais balance USD",
      expected: card(fixture, "bhd-mi-pais")?.statementBalanceUsd,
      actual: card(live, "bhd-mi-pais")?.statementBalanceUsd,
    },
    {
      label: "APAP balance USD",
      expected: card(fixture, "apap")?.statementBalanceUsd,
      actual: card(live, "apap")?.statementBalanceUsd,
    },
    {
      label: "receivables count",
      expected: fixture.receivables.length,
      actual: live.receivables.length,
    },
    {
      label: "Auto Loan paid count",
      expected: fixtureAuto.summary.paidCount,
      actual: liveAuto.summary.paidCount,
    },
    {
      label: "Jeep cuota 61 status",
      expected: installment(fixtureJeep, 61).status,
      actual: installment(liveJeep, 61).status,
    },
    {
      label: "Jeep cuota 60 extraPayment",
      expected: installment(fixtureJeep, 60).extraPayment,
      actual: installment(liveJeep, 60).extraPayment,
    },
    {
      label: "Ahorro week 52 cumulative",
      expected: fixtureSavingsLast?.cumulative,
      actual: liveSavingsLast?.cumulative,
    },
  ];

  console.log(`Live snapshot fetched at ${live.fetchedAt}`);
  console.log(
    `Context: ${live.periods.length} periods, ${live.cards.length} cards, ` +
      `${live.receivables.length} receivables, ${live.loans.length} loans, ` +
      `${live.savings?.weeks.length ?? 0} savings weeks`,
  );
  console.log(
    `Jeep schedule rows: ${liveJeep.schedule.length} ` +
      `(fixture: ${fixtureJeep.schedule.length})`,
  );
  console.log("");

  let differences = 0;
  for (const check of checks) {
    const matched = isMatch(check.expected, check.actual);
    if (!matched) {
      differences += 1;
    }
    console.log(
      `${matched ? "MATCH" : "DIFF "}  ${check.label.padEnd(30)} ` +
        `live=${display(check.actual)}  fixture=${display(check.expected)}`,
    );
  }

  console.log("");
  if (differences === 0) {
    console.log(`All ${checks.length} parity checks match the fixture.`);
  } else {
    console.log(
      `${differences}/${checks.length} values differ from the 2026-11-03 fixture. ` +
        `Expected if the owner edited the sheet.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error("Live snapshot check failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
