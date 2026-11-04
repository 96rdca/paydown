import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createOverlayStore,
  OverlayNotFoundError,
  OverlayStoreError,
  type OverlayStore,
} from "./store";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function errorFrom(fn: () => Promise<unknown>): Promise<Error> {
  try {
    await fn();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected the promise to reject, but it resolved.");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("overlay store", () => {
  let dir: string;
  let filePath: string;
  let store: OverlayStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "paydown-overlay-"));
    filePath = join(dir, "data", "overlay.json");
    store = createOverlayStore({ filePath });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("a missing file is the empty default and is not created", async () => {
    const overlay = await store.read();

    expect(overlay).toEqual({
      version: 1,
      cards: {},
      cardPayments: [],
      loanAbonos: [],
    });
    expect(await fileExists(filePath)).toBe(false);
  });

  test("setCardRate persists and can be read back by a new store", async () => {
    const config = await store.setCardRate("bhd-mi-pais", 0.0255);
    expect(config).toEqual({ monthlyRate: 0.0255, sharedLimitDopUsd: false });

    const reloaded = createOverlayStore({ filePath });
    const overlay = await reloaded.read();
    expect(overlay.cards["bhd-mi-pais"]).toEqual({
      monthlyRate: 0.0255,
      sharedLimitDopUsd: false,
    });

    const raw = JSON.parse(await readFile(filePath, "utf8"));
    expect(raw.version).toBe(1);
    expect(raw.cards["bhd-mi-pais"].monthlyRate).toBe(0.0255);
    expect(raw.cards["bhd-mi-pais"].sharedLimitDopUsd).toBe(false);
  });

  test("setCardRate(null) clears the rate without dropping the card", async () => {
    await store.setCardRate("apap", 0.03);
    await store.setCardRate("apap", null);

    const overlay = await store.read();
    expect(overlay.cards["apap"]).toEqual({
      monthlyRate: null,
      sharedLimitDopUsd: false,
    });
  });

  test("setCardRate preserves a configured shared-pool flag", async () => {
    await store.setCardConfig("apap", { sharedLimitDopUsd: true });
    const config = await store.setCardRate("apap", 0.0255);

    expect(config).toEqual({ monthlyRate: 0.0255, sharedLimitDopUsd: true });
  });

  test("setCardConfig applies only the provided keys", async () => {
    const first = await store.setCardConfig("apap", {
      sharedLimitDopUsd: true,
    });
    expect(first).toEqual({ monthlyRate: null, sharedLimitDopUsd: true });

    const second = await store.setCardConfig("apap", { monthlyRate: 0.03 });
    expect(second).toEqual({ monthlyRate: 0.03, sharedLimitDopUsd: true });

    const third = await store.setCardConfig("apap", { monthlyRate: null });
    expect(third).toEqual({ monthlyRate: null, sharedLimitDopUsd: true });

    // A separate-pool card can be switched back explicitly.
    const fourth = await store.setCardConfig("apap", {
      sharedLimitDopUsd: false,
    });
    expect(fourth).toEqual({ monthlyRate: null, sharedLimitDopUsd: false });

    const onDisk = JSON.parse(await readFile(filePath, "utf8"));
    expect(onDisk.cards["apap"]).toEqual({
      monthlyRate: null,
      sharedLimitDopUsd: false,
    });
  });

  test("setCardConfig rejects empty patches and invalid values", async () => {
    const empty = await errorFrom(() => store.setCardConfig("apap", {}));
    expect(empty.message).toContain("At least one");

    const badFlag = await errorFrom(() =>
      // @ts-expect-error — runtime validation of a non-boolean payload.
      store.setCardConfig("apap", { sharedLimitDopUsd: "yes" }),
    );
    expect(badFlag.message).toContain("sharedLimitDopUsd");

    const badRate = await errorFrom(() =>
      store.setCardConfig("apap", { monthlyRate: 1.5 }),
    );
    expect(badRate.message).toContain("monthlyRate");

    expect(await fileExists(filePath)).toBe(false);
  });

  test("an overlay file without sharedLimitDopUsd reads as separate pools", async () => {
    await mkdir(join(dir, "data"), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({
        version: 1,
        cards: { apap: { monthlyRate: 0.0255 } },
        cardPayments: [],
        loanAbonos: [],
      }),
      "utf8",
    );

    const overlay = await store.read();
    expect(overlay.cards["apap"]).toEqual({
      monthlyRate: 0.0255,
      sharedLimitDopUsd: false,
    });

    // A partial patch keeps the legacy rate and writes the normalized flag.
    const config = await store.setCardConfig("apap", {
      sharedLimitDopUsd: true,
    });
    expect(config).toEqual({ monthlyRate: 0.0255, sharedLimitDopUsd: true });
  });

  test("setCardRate rejects invalid rates", async () => {
    for (const rate of [-0.01, 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = await errorFrom(() => store.setCardRate("apap", rate));
      expect(error.message).toContain("monthlyRate");
    }
    expect(await fileExists(filePath)).toBe(false);
  });

  test("addCardPayment creates a UUID record with normalized optional fields", async () => {
    const payment = await store.addCardPayment({
      cardId: "santa-cruz",
      date: "2026-11-04",
      amountDop: 2500.5,
      note: "   ",
    });

    expect(UUID_RE.test(payment.id)).toBe(true);
    expect(payment.amountUsd).toBeNull();
    expect(payment.note).toBeNull();

    const withUsd = await store.addCardPayment({
      cardId: "santa-cruz",
      date: "2026-11-05",
      amountDop: 0,
      amountUsd: 25,
      note: "pago mínimo",
    });
    expect(withUsd.amountUsd).toBe(25);
    expect(withUsd.note).toBe("pago mínimo");

    const overlay = await store.read();
    expect(overlay.cardPayments).toHaveLength(2);
  });

  test("addCardPayment validates date, amount and required fields", async () => {
    for (const input of [
      { cardId: "", date: "2026-11-04", amountDop: 10 },
      { cardId: "apap", date: "2026-02-30", amountDop: 10 },
      { cardId: "apap", date: "11/04/2026", amountDop: 10 },
      { cardId: "apap", date: "2026-11-04", amountDop: -1 },
      { cardId: "apap", date: "2026-11-04", amountDop: Number.NaN },
      { cardId: "apap", date: "2026-11-04", amountDop: 10, amountUsd: -2 },
    ]) {
      const error = await errorFrom(() => store.addCardPayment(input));
      expect(error.message.length > 0).toBe(true);
    }
    expect(await fileExists(filePath)).toBe(false);
  });

  test("deleteCardPayment removes the record and 404s on unknown ids", async () => {
    const payment = await store.addCardPayment({
      cardId: "apap",
      date: "2026-11-04",
      amountDop: 100,
    });

    await store.deleteCardPayment(payment.id);
    expect((await store.read()).cardPayments).toHaveLength(0);

    const error = await errorFrom(() => store.deleteCardPayment(payment.id));
    expect(error instanceof OverlayNotFoundError).toBe(true);
    expect(error.message).toContain("No card payment");
  });

  test("addLoanAbono requires a strictly positive amount", async () => {
    const error = await errorFrom(() =>
      store.addLoanAbono({
        loanId: "jeep-loan",
        date: "2026-11-04",
        amount: 0,
      }),
    );
    expect(error.message).toContain('"amount"');

    const abono = await store.addLoanAbono({
      loanId: "jeep-loan",
      date: "2026-11-04",
      amount: 10000,
    });
    expect(UUID_RE.test(abono.id)).toBe(true);
    expect(abono.note).toBeNull();

    await store.deleteLoanAbono(abono.id);
    expect((await store.read()).loanAbonos).toHaveLength(0);
  });

  test("deleteLoanAbono 404s on unknown ids", async () => {
    const error = await errorFrom(() => store.deleteLoanAbono("missing"));
    expect(error instanceof OverlayNotFoundError).toBe(true);
    expect(error.message).toContain("No loan abono");
  });

  test("concurrent mutations are serialized without losing writes", async () => {
    const writes = Array.from({ length: 10 }, (_, index) =>
      store.addCardPayment({
        cardId: "apap",
        date: "2026-11-04",
        amountDop: index * 100,
      }),
    );

    const created = await Promise.all(writes);
    const ids = new Set(created.map((payment) => payment.id));
    expect(ids.size).toBe(10);

    const overlay = await store.read();
    expect(overlay.cardPayments).toHaveLength(10);

    const onDisk = JSON.parse(await readFile(filePath, "utf8"));
    expect(onDisk.cardPayments).toHaveLength(10);
  });

  test("a corrupt JSON file throws instead of resetting to empty", async () => {
    await mkdir(join(dir, "data"), { recursive: true });
    await writeFile(filePath, "{ not json", "utf8");

    const error = await errorFrom(() => store.read());
    expect(error instanceof OverlayStoreError).toBe(true);
    expect(error.message).toContain("invalid JSON");
    expect(error.message).toContain("left untouched");

    // A mutation must not overwrite the unreadable record either.
    const mutationError = await errorFrom(() =>
      store.addCardPayment({
        cardId: "apap",
        date: "2026-11-04",
        amountDop: 100,
      }),
    );
    expect(mutationError instanceof OverlayStoreError).toBe(true);
    expect(await readFile(filePath, "utf8")).toBe("{ not json");
  });

  test("unsupported versions and malformed shapes are rejected", async () => {
    const cases: Array<unknown> = [
      { version: 2, cards: {}, cardPayments: [], loanAbonos: [] },
      { version: 1, cards: [], cardPayments: [], loanAbonos: [] },
      { version: 1, cards: {}, cardPayments: "nope", loanAbonos: [] },
      {
        version: 1,
        cards: {},
        cardPayments: [
          {
            id: "p1",
            cardId: "apap",
            date: "2026-02-30",
            amountDop: 1,
            amountUsd: null,
            note: null,
          },
        ],
        loanAbonos: [],
      },
      {
        version: 1,
        cards: { apap: { monthlyRate: 2 } },
        cardPayments: [],
        loanAbonos: [],
      },
      {
        version: 1,
        cards: { apap: { monthlyRate: null, sharedLimitDopUsd: "yes" } },
        cardPayments: [],
        loanAbonos: [],
      },
      {
        version: 1,
        cards: {},
        cardPayments: [],
        loanAbonos: [
          {
            id: "a1",
            loanId: "jeep-loan",
            date: "2026-11-04",
            amount: -5,
            note: null,
          },
        ],
      },
    ];

    for (const value of cases) {
      await mkdir(join(dir, "data"), { recursive: true });
      await writeFile(filePath, JSON.stringify(value), "utf8");

      const error = await errorFrom(() => store.read());
      expect(error instanceof OverlayStoreError).toBe(true);
    }
  });

  test("an empty file is treated as corrupt, not as empty overlay", async () => {
    await mkdir(join(dir, "data"), { recursive: true });
    await writeFile(filePath, "   \n", "utf8");

    const error = await errorFrom(() => store.read());
    expect(error instanceof OverlayStoreError).toBe(true);
    expect(error.message).toContain("empty");
  });

  test("writes are atomic: the temp file is gone after a successful mutation", async () => {
    await store.setCardRate("apap", 0.02);

    const entries = await readdir(join(dir, "data"));
    expect(entries).toEqual(["overlay.json"]);
    expect(entries.some((name) => name.endsWith(".tmp"))).toBe(false);
  });
});
