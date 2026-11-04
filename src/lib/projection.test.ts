import { describe, expect, test } from "bun:test";
import {
  addMonthsClamped,
  cardUtilization,
  projectCard,
  simulateLoan,
  type CardUtilizationInput,
} from "./projection";
import { fixtureSnapshot } from "./sheets/fixture";
import type { CardAccount, Loan, LoanAbono } from "./types";

function card(overrides: Partial<CardAccount> = {}): CardAccount {
  return {
    id: "test-card",
    bank: "Test",
    closingDay: null,
    dueDay: null,
    limitDop: null,
    limitUsd: null,
    statementBalanceDop: null,
    statementBalanceUsd: null,
    availableDop: null,
    availableUsd: null,
    minPaymentDop: null,
    minPaymentUsd: null,
    monthlyRate: null,
    ...overrides,
  };
}

function utilCard(
  overrides: Partial<CardUtilizationInput> = {},
): CardUtilizationInput {
  return {
    statementBalanceDop: null,
    statementBalanceUsd: null,
    limitDop: null,
    limitUsd: null,
    sharedLimitDopUsd: false,
    ...overrides,
  };
}

function required<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Expected ${label} to be projected, got null.`);
  }
  return value;
}

function loanById(id: string): Loan {
  const found = fixtureSnapshot().loans.find((loan) => loan.id === id);
  if (!found) {
    throw new Error(`Fixture is missing loan "${id}".`);
  }
  return found;
}

function abono(overrides: Partial<LoanAbono> = {}): LoanAbono {
  return {
    id: "abono-test",
    loanId: "jeep-loan",
    date: "2026-11-04",
    amount: 10000,
    note: null,
    ...overrides,
  };
}

describe("addMonthsClamped", () => {
  test("clamps to the last day of shorter months", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2024-02-29", 12)).toBe("2025-02-28");
    expect(addMonthsClamped("2026-03-31", 11)).toBe("2027-02-28");
    expect(addMonthsClamped("2026-11-04", 3)).toBe("2027-02-04");
  });
});

describe("projectCard", () => {
  test("returns null without a configured monthly rate", () => {
    expect(
      projectCard(card({ statementBalanceDop: 1000 }), 60.5, "2026-11-04"),
    ).toBeNull();
  });

  test("combines statement balances and minimums in DOP", () => {
    const projection = required(
      projectCard(
        card({
          statementBalanceDop: 1000,
          statementBalanceUsd: 10,
          minPaymentDop: 100,
          minPaymentUsd: 2,
          monthlyRate: 0.02,
        }),
        50,
        "2026-11-04",
      ),
      "card projection",
    );

    expect(projection.payoffNowDop).toBe(1500);
    expect(projection.monthlyInterestDop).toBe(30);
    expect(projection.minPayoffBlockedReason).toBeNull();
    expect(projection.minPayoff).toBeTruthy();
  });

  test("simulates the minimum-payment loop to zero", () => {
    const projection = required(
      projectCard(
        card({
          statementBalanceDop: 1200,
          minPaymentDop: 500,
          monthlyRate: 0.1,
        }),
        60.5,
        "2026-01-31",
      ),
      "card projection",
    );
    const payoff = required(projection.minPayoff, "min payoff");

    // Month 1: 120 interest -> 820; month 2: 82 -> 402; month 3: 40.20 -> 0.
    expect(payoff.months).toBe(3);
    expect(payoff.totalInterest).toBe(242.2);
    expect(payoff.totalPaid).toBe(1442.2);
    expect(payoff.endDate).toBe("2026-04-30");
  });

  test("handles a zero interest rate", () => {
    const projection = required(
      projectCard(
        card({
          statementBalanceDop: 1000,
          minPaymentDop: 300,
          monthlyRate: 0,
        }),
        60.5,
        "2026-01-31",
      ),
      "card projection",
    );
    const payoff = required(projection.minPayoff, "min payoff");

    expect(payoff.months).toBe(4);
    expect(payoff.totalInterest).toBe(0);
    expect(payoff.totalPaid).toBe(1000);
    expect(payoff.endDate).toBe("2026-05-31");
  });

  test("explains a missing sheet minimum", () => {
    const projection = required(
      projectCard(
        card({ statementBalanceDop: 1000, monthlyRate: 0.02 }),
        60.5,
        "2026-11-04",
      ),
      "card projection",
    );

    expect(projection.minPayoff).toBeNull();
    expect(projection.minPayoffBlockedReason).toBe(
      "Sin pago mínimo en la hoja.",
    );
  });

  test("explains a minimum that only covers interest", () => {
    const projection = required(
      projectCard(
        card({
          statementBalanceDop: 1000,
          minPaymentDop: 20,
          monthlyRate: 0.02,
        }),
        60.5,
        "2026-11-04",
      ),
      "card projection",
    );

    expect(projection.minPayoff).toBeNull();
    expect(projection.minPayoffBlockedReason).toBe(
      "El pago mínimo no cubre los intereses.",
    );
  });

  test("treats a single-currency minimum as the combined minimum", () => {
    const projection = required(
      projectCard(
        card({
          statementBalanceDop: 5000,
          minPaymentUsd: 10,
          monthlyRate: 0.02,
        }),
        50,
        "2026-11-04",
      ),
      "card projection",
    );

    // US$10 × 50 = RD$500/month; it amortizes, so no blocked reason.
    expect(projection.minPayoffBlockedReason).toBeNull();
    expect((projection.minPayoff?.months ?? 0) > 0).toBe(true);
  });

  test("a zero balance is already paid off", () => {
    const projection = required(
      projectCard(
        card({ statementBalanceDop: 0, monthlyRate: 0.02 }),
        60.5,
        "2026-11-04",
      ),
      "card projection",
    );

    expect(projection.minPayoff).toEqual({
      months: 0,
      totalInterest: 0,
      totalPaid: 0,
      endDate: "2026-11-04",
    });
    expect(projection.minPayoffBlockedReason).toBeNull();
  });
});

describe("cardUtilization", () => {
  test("shared pool (APAP): USD balance consumes the DOP limit at the tasa", () => {
    const utilization = cardUtilization(
      utilCard({
        limitDop: 85000,
        statementBalanceDop: null,
        statementBalanceUsd: 607.63,
        limitUsd: null,
        sharedLimitDopUsd: true,
      }),
      61.5,
    );

    // (0 + 607.63 × 61.5) / 85,000 = 37,369.245 / 85,000 = 0.439638…
    expect(utilization.kind).toBe("shared");
    expect(utilization.combined).toBeCloseTo(0.4396, 4);
    expect(utilization.combined).toBeCloseTo((607.63 * 61.5) / 85000, 10);
    expect(utilization.dop).toBeNull();
    expect(utilization.usd).toBeNull();
  });

  test("shared pool adds both balances in DOP terms", () => {
    const utilization = cardUtilization(
      utilCard({
        limitDop: 10000,
        statementBalanceDop: 2000,
        statementBalanceUsd: 100,
        sharedLimitDopUsd: true,
      }),
      50,
    );

    expect(utilization.combined).toBeCloseTo(0.7, 10);
  });

  test("shared pool is null without a usable DOP limit", () => {
    for (const limitDop of [null, 0]) {
      const utilization = cardUtilization(
        utilCard({
          limitDop,
          statementBalanceUsd: 607.63,
          sharedLimitDopUsd: true,
        }),
        61.5,
      );
      expect(utilization.kind).toBe("shared");
      expect(utilization.combined).toBeNull();
      expect(utilization.dop).toBeNull();
      expect(utilization.usd).toBeNull();
    }
  });

  test("shared pool treats missing balances as unknown, not zero", () => {
    const utilization = cardUtilization(
      utilCard({ limitDop: 85000, sharedLimitDopUsd: true }),
      61.5,
    );

    expect(utilization.kind).toBe("shared");
    expect(utilization.combined).toBeNull();
  });

  test("separate pools: DOP and USD utilization are independent", () => {
    const utilization = cardUtilization(
      utilCard({
        limitDop: 10000,
        statementBalanceDop: 2500,
        limitUsd: 200,
        statementBalanceUsd: 50,
      }),
      60.5,
    );

    expect(utilization.kind).toBe("separate");
    expect(utilization.dop).toBeCloseTo(0.25, 10);
    expect(utilization.usd).toBeCloseTo(0.25, 10);
    expect(utilization.combined).toBeNull();
  });

  test("separate pools: a missing USD limit leaves usd null", () => {
    const utilization = cardUtilization(
      utilCard({
        limitDop: 85000,
        statementBalanceUsd: 607.63,
        limitUsd: null,
      }),
      61.5,
    );

    expect(utilization.kind).toBe("separate");
    expect(utilization.dop).toBeNull();
    expect(utilization.usd).toBeNull();
  });

  test("separate pools: a missing balance is null, not 0% usage", () => {
    const utilization = cardUtilization(
      utilCard({
        limitDop: 31000,
        limitUsd: 300,
        statementBalanceDop: null,
        statementBalanceUsd: null,
      }),
      60.5,
    );

    expect(utilization.kind).toBe("separate");
    expect(utilization.dop).toBeNull();
    expect(utilization.usd).toBeNull();
    expect(utilization.combined).toBeNull();
  });

  test("separate pools: a paid-off pool reports 0% usage", () => {
    const utilization = cardUtilization(
      utilCard({
        limitDop: 31000,
        statementBalanceDop: 0,
        limitUsd: 300,
        statementBalanceUsd: 0,
      }),
      60.5,
    );

    expect(utilization.dop).toBe(0);
    expect(utilization.usd).toBe(0);
  });

  test("no usable limits at all is kind none", () => {
    const utilization = cardUtilization(
      utilCard({ statementBalanceDop: 1000, statementBalanceUsd: 10 }),
      60.5,
    );

    expect(utilization).toEqual({
      kind: "none",
      combined: null,
      dop: null,
      usd: null,
    });
  });

  test("utilization is a raw fraction (not clamped or rounded)", () => {
    const utilization = cardUtilization(
      utilCard({ limitDop: 10000, statementBalanceDop: 15000 }),
      60.5,
    );

    expect(utilization.dop).toBeCloseTo(1.5, 10);
  });

  test("APAP fixture card reports a single shared pool", () => {
    const apap = fixtureSnapshot().cards.find((entry) => entry.id === "apap");
    if (!apap) {
      throw new Error("Fixture is missing the apap card.");
    }

    const utilization = cardUtilization(
      { ...apap, sharedLimitDopUsd: true },
      60.5,
    );

    expect(utilization.kind).toBe("shared");
    expect(utilization.combined).toBeCloseTo((607.63 * 60.5) / 85000, 10);
  });
});

describe("simulateLoan", () => {
  test("Auto Loan baseline matches the sheet's pending cuotas", () => {
    const auto = loanById("auto-loan");
    const projection = required(
      simulateLoan(auto, [], 60.5, "2026-11-04"),
      "auto loan projection",
    );

    expect(projection.baseline.months).toBe(6);
    expect(projection.baseline.endDate).toBe("2027-03-21");
    // The live sheet's pending interest (rows 19-24) sums to 5,912.94.
    // The engine's unrounded simulation lands on 5,912.95 (per-row rounding
    // on the sheet). The brief's 5,113.57 does not match the current sheet.
    expect(projection.baseline.totalInterest).toBeCloseTo(5912.95, 1);
    expect(projection.projectedSchedule).toHaveLength(6);
    expect(projection.projectedSchedule[0].number).toBe(19);
    expect(
      projection.projectedSchedule[projection.projectedSchedule.length - 1]
        .endingBalance,
    ).toBe(0);
    expect(projection.interestSaved).toBe(0);
    expect(projection.monthsSaved).toBe(0);
  });

  test("Jeep baseline regenerates the sheet's insurance-bearing cuotas", () => {
    const jeep = loanById("jeep-loan");
    const projection = required(
      simulateLoan(jeep, [], 60.5, "2026-11-04"),
      "jeep loan projection",
    );
    const first = projection.projectedSchedule[0];

    expect(projection.baseline.months).toBe(25);
    expect(projection.baseline.endDate).toBe("2028-10-28");
    expect(first.number).toBe(62);
    expect(first.beginningBalance).toBe(330672.34);
    expect(first.interest).toBe(5221.87);
    expect(first.principal).toBe(11265.98);
    expect(first.insurance).toBe(5012.5);
    expect(first.totalPayment).toBe(21500.35);
    expect(first.endingBalance).toBe(319406.36);
  });

  test("a Jeep abono shortens the loan and saves interest", () => {
    const jeep = loanById("jeep-loan");
    const projection = required(
      simulateLoan(jeep, [abono()], 60.5, "2026-11-04"),
      "jeep projection with abono",
    );

    expect(projection.monthsSaved).toBe(1);
    expect(projection.withAbonos.months).toBe(24);
    expect(projection.interestSaved > 0).toBe(true);
    expect(projection.interestSaved).toBeCloseTo(4417.51, 1);
    expect(projection.projectedSchedule).toHaveLength(24);
    expect(projection.projectedSchedule[0].number).toBe(62);

    // The 2026-11-04 abono lands before the second cuota (2026-11-28).
    expect(projection.projectedSchedule[0].beginningBalance).toBe(330672.34);
    expect(projection.projectedSchedule[1].beginningBalance < 319406.36).toBe(
      true,
    );
  });

  test("an abono dated before the first pending cuota hits the starting balance", () => {
    const jeep = loanById("jeep-loan");
    const projection = required(
      simulateLoan(
        jeep,
        [abono({ date: "2020-01-01" })],
        60.5,
        "2026-11-04",
      ),
      "jeep projection with pre-start abono",
    );

    expect(projection.projectedSchedule[0].beginningBalance).toBe(320672.34);
    expect(projection.monthsSaved >= 1).toBe(true);
    expect(projection.interestSaved > 0).toBe(true);
  });

  test("abonos after payoff are ignored (saved values never go negative)", () => {
    const jeep = loanById("jeep-loan");
    const projection = required(
      simulateLoan(
        jeep,
        [abono({ date: "2035-01-01" })],
        60.5,
        "2026-11-04",
      ),
      "jeep projection with late abono",
    );

    expect(projection.interestSaved).toBe(0);
    expect(projection.monthsSaved).toBe(0);
    expect(projection.withAbonos.months).toBe(projection.baseline.months);
  });

  test("Credimas cannot be projected (no pending schedule)", () => {
    expect(
      simulateLoan(loanById("credimas"), [], 60.5, "2026-11-04"),
    ).toBeNull();
  });

  test("a loan with no pending rows cannot be projected", () => {
    const auto = loanById("auto-loan");
    expect(
      simulateLoan({ ...auto, schedule: [] }, [], 60.5, "2026-11-04"),
    ).toBeNull();
  });

  test("a loan without an annual rate cannot be projected", () => {
    const auto = loanById("auto-loan");
    expect(
      simulateLoan({ ...auto, annualRate: null }, [], 60.5, "2026-11-04"),
    ).toBeNull();
  });

  test("a cuota that cannot cover interest + insurance returns null", () => {
    const jeep = loanById("jeep-loan");
    // cuota 6,000 - insurance 5,012.50 = 987.50 < month-1 interest 5,221.87.
    expect(
      simulateLoan(
        { ...jeep, monthlyPayment: 6000 },
        [],
        60.5,
        "2026-11-04",
      ),
    ).toBeNull();
  });

  test("derives the cuota from the first pending row when absent", () => {
    const auto = loanById("auto-loan");
    const projection = required(
      simulateLoan(
        { ...auto, monthlyPayment: null },
        [],
        60.5,
        "2026-11-04",
      ),
      "auto projection with derived cuota",
    );

    // First pending row: 1,655.36 + 10,365.89 = 12,021.25. The sheet's own
    // rounded principal is one cent below the unrounded 12,021.26 cuota, so
    // the derived-cuota simulation needs a seventh (residual-cent) month.
    expect(projection.baseline.months).toBe(7);
    expect(projection.baseline.totalInterest).toBeCloseTo(5912.95, 1);
  });
});
