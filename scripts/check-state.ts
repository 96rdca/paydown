/**
 * Live end-to-end check for the overlay store + projection engine.
 *
 *   bun run scripts/check-state.ts
 *
 * 1. Prints the FinancialState summary (per card: rate/payment counts and
 *    projection; per loan: abono counts, baseline and with-abono projections).
 * 2. Adds a temporary RD$10,000 abono to the Jeep loan, proves the projection
 *    reports both monthsSaved > 0 and interestSaved > 0, then deletes it and
 *    proves the state returns to its pre-check values.
 *
 * The temporary abono is always removed, even when an assertion fails. Other
 * overlay data is left untouched.
 */
import { overlayStore } from "../src/lib/overlay/store";
import { getFinancialState } from "../src/lib/state";
import type {
  AugmentedLoan,
  FinancialState,
  LoanProjection,
} from "../src/lib/types";

const TEST_LOAN_ID = "jeep-loan";
const TEST_AMOUNT = 10_000;

function todayIso(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}`;
}

function money(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function percent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function loan(state: FinancialState, id: string): AugmentedLoan {
  const found = state.loans.find((candidate) => candidate.id === id);
  if (!found) {
    throw new Error(`State is missing loan "${id}".`);
  }
  return found;
}

function projectionOf(loanValue: AugmentedLoan, label: string): LoanProjection {
  if (!loanValue.projection) {
    throw new Error(`Loan "${loanValue.id}" has no projection (${label}).`);
  }
  return loanValue.projection;
}

function printSummary(state: FinancialState, title: string): void {
  console.log("");
  console.log(`── ${title} ──`);
  console.log(`Sheet fetched at ${state.snapshot.fetchedAt}`);

  console.log("Cards:");
  for (const card of state.cards) {
    const rate =
      card.monthlyRate === null ? "no" : `sí (${percent(card.monthlyRate)}/mes)`;
    const projection = card.projection;
    const payoff = projection
      ? projection.minPayoff
        ? `${projection.minPayoff.months} meses, interés RD$ ${money(
            projection.minPayoff.totalInterest,
          )}`
        : (projection.minPayoffBlockedReason ?? "sin payoff")
      : "sin proyección";

    console.log(
      `  ${card.id.padEnd(14)} tasa: ${rate.padEnd(22)} ` +
        `pagos: ${String(card.payments.length).padEnd(3)} ` +
        `payoff: RD$ ${money(projection?.payoffNowDop ?? 0).padStart(12)}  ${payoff}`,
    );
  }

  console.log("Loans:");
  for (const loanValue of state.loans) {
    const projection = loanValue.projection;
    const baseline = projection
      ? `${projection.baseline.months} meses / RD$ ${money(
          projection.baseline.totalInterest,
        )}`
      : "sin proyección";
    const withAbonos = projection
      ? `${projection.withAbonos.months} meses / RD$ ${money(
          projection.withAbonos.totalInterest,
        )}`
      : "—";

    console.log(
      `  ${loanValue.id.padEnd(14)} abonos: ${String(
        loanValue.abonos.length,
      ).padEnd(3)} baseline: ${baseline.padEnd(34)} ` +
        `con abonos: ${withAbonos}`,
    );
  }
}

async function main(): Promise<void> {
  const before = await getFinancialState({ force: true });
  printSummary(before, "Estado inicial");

  const jeepBefore = loan(before, TEST_LOAN_ID);
  const beforeProjection = projectionOf(jeepBefore, "before");
  const beforeAbonoCount = jeepBefore.abonos.length;

  const abono = await overlayStore.addLoanAbono({
    loanId: TEST_LOAN_ID,
    date: todayIso(),
    amount: TEST_AMOUNT,
    note: "check-state temporal",
  });

  try {
    const after = await getFinancialState();
    const jeepAfter = loan(after, TEST_LOAN_ID);
    const afterProjection = projectionOf(jeepAfter, "after");

    console.log("");
    console.log(
      `POST abono RD$ ${money(TEST_AMOUNT)} (${todayIso()}) -> id ${abono.id}`,
    );
    console.log(
      `  meses: ${afterProjection.baseline.months} -> ` +
        `${afterProjection.withAbonos.months} (ahorro ${afterProjection.monthsSaved})`,
    );
    console.log(
      `  interés: RD$ ${money(afterProjection.baseline.totalInterest)} -> ` +
        `RD$ ${money(afterProjection.withAbonos.totalInterest)} ` +
        `(ahorro RD$ ${money(afterProjection.interestSaved)})`,
    );

    assert(
      afterProjection.monthsSaved > 0,
      `Expected monthsSaved > 0 after the test abono, got ${afterProjection.monthsSaved}.`,
    );
    assert(
      afterProjection.interestSaved > 0,
      `Expected interestSaved > 0 after the test abono, got ${afterProjection.interestSaved}.`,
    );
    assert(
      jeepAfter.abonos.length === beforeAbonoCount + 1,
      "The new abono is not visible in the augmented loan.",
    );
  } finally {
    await overlayStore.deleteLoanAbono(abono.id);
  }

  const restored = await getFinancialState();
  const jeepRestored = loan(restored, TEST_LOAN_ID);
  const restoredProjection = projectionOf(jeepRestored, "restored");

  printSummary(restored, "Estado tras DELETE");

  assert(
    jeepRestored.abonos.length === beforeAbonoCount,
    `Expected ${beforeAbonoCount} abonos after DELETE, got ${jeepRestored.abonos.length}.`,
  );
  assert(
    !jeepRestored.abonos.some((candidate) => candidate.id === abono.id),
    "The temporary abono is still present after DELETE.",
  );
  assert(
    restoredProjection.baseline.months === beforeProjection.baseline.months,
    "Baseline months changed after DELETE.",
  );
  assert(
    Math.abs(
      restoredProjection.baseline.totalInterest -
        beforeProjection.baseline.totalInterest,
    ) < 0.01,
    "Baseline interest changed after DELETE.",
  );

  console.log("");
  console.log(
    "OK: the temporary abono shortened the Jeep loan, saved interest and was " +
      "removed; the state is back to its initial projection.",
  );
}

main().catch((error: unknown) => {
  console.error("");
  console.error("Live state check FAILED:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
