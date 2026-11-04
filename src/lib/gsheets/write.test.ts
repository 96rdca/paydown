import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { InvalidTargetError, UpstreamError } from "./errors";
import { SHEETS_API_BASE, WRITE_TIMEOUT_MS, writeCell } from "./write";

const ORIGINAL_ID_ENV = process.env.SPREADSHEET_ID;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function fakeFetch(makeResponse: () => Response): {
  impl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    return makeResponse();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const token = async () => "test-token";

async function capture(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error;
  }
}

beforeEach(() => {
  process.env.SPREADSHEET_ID = "test-sheet-id";
});

afterEach(() => {
  if (ORIGINAL_ID_ENV === undefined) {
    delete process.env.SPREADSHEET_ID;
  } else {
    process.env.SPREADSHEET_ID = ORIGINAL_ID_ENV;
  }
});

describe("writeCell request shape", () => {
  test("PUTs a single-cell USER_ENTERED value with a bearer token", async () => {
    const { impl, calls } = fakeFetch(() => Response.json({}));

    await writeCell("Sheet1", "B12", 1234.5, {
      fetchImpl: impl,
      getToken: token,
    });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];

    expect(url).toBe(
      `${SHEETS_API_BASE}/test-sheet-id/values/'Sheet1'!B12?valueInputOption=USER_ENTERED`,
    );
    expect(init?.method).toBe("PUT");
    expect(init?.cache).toBe("no-store");

    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-token");
    expect(headers["Content-Type"]).toBe("application/json");

    expect(JSON.parse(String(init?.body))).toEqual({ values: [[1234.5]] });
    expect(init?.signal instanceof AbortSignal).toBe(true);
    expect(WRITE_TIMEOUT_MS).toBe(10_000);
  });

  test("quotes tab names with spaces", async () => {
    const { impl, calls } = fakeFetch(() => Response.json({}));

    await writeCell("Auto Loan", "H8", "Cuota Paga", {
      fetchImpl: impl,
      getToken: token,
    });

    expect(calls[0].url).toContain(`/values/'Auto%20Loan'!H8?`);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      values: [["Cuota Paga"]],
    });
  });

  test("sends ISO dates as inert strings for USER_ENTERED parsing", async () => {
    const { impl, calls } = fakeFetch(() => Response.json({}));

    await writeCell("Sheet1", "I4", "2026-12-21", {
      fetchImpl: impl,
      getToken: token,
    });

    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      values: [["2026-12-21"]],
    });
  });
});

describe("writeCell error mapping", () => {
  test("surfaces Google's error message and HTTP status", async () => {
    const { impl } = fakeFetch(
      () =>
        new Response(
          JSON.stringify({
            error: {
              code: 403,
              message:
                "The caller does not have permission to access the requested spreadsheet.",
            },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
    );

    const error = await capture(
      writeCell("Sheet1", "B12", 1, { fetchImpl: impl, getToken: token }),
    );

    expect(error instanceof UpstreamError).toBe(true);
    const upstream = error as UpstreamError;
    expect(upstream.status).toBe(403);
    expect(upstream.message).toContain(
      "The caller does not have permission to access the requested spreadsheet.",
    );
    expect(upstream.message).toContain("Sheet1!B12");
  });

  test("handles a non-JSON error body", async () => {
    const { impl } = fakeFetch(() => new Response("bad gateway", { status: 502 }));

    const error = await capture(
      writeCell("Sheet1", "B12", 1, { fetchImpl: impl, getToken: token }),
    );

    expect(error instanceof UpstreamError).toBe(true);
    expect((error as UpstreamError).status).toBe(502);
    expect((error as UpstreamError).message).toContain("HTTP 502");
  });

  test("wraps network failures", async () => {
    const impl = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const error = await capture(
      writeCell("Sheet1", "B12", 1, { fetchImpl: impl, getToken: token }),
    );

    expect(error instanceof UpstreamError).toBe(true);
    expect((error as UpstreamError).message).toContain("fetch failed");
  });

  test("rejects an empty access token", async () => {
    const { impl, calls } = fakeFetch(() => Response.json({}));

    const error = await capture(
      writeCell("Sheet1", "B12", 1, {
        fetchImpl: impl,
        getToken: async () => "",
      }),
    );

    expect(error instanceof UpstreamError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("writeCell guards", () => {
  test("only accepts a single cell, never a range", async () => {
    let tokenCalls = 0;
    const { impl, calls } = fakeFetch(() => Response.json({}));

    const error = await capture(
      writeCell("Sheet1", "B12:C20", 1, {
        fetchImpl: impl,
        getToken: async () => {
          tokenCalls += 1;
          return "test-token";
        },
      }),
    );

    expect(error instanceof InvalidTargetError).toBe(true);
    expect(calls).toHaveLength(0);
    expect(tokenCalls).toBe(0);
  });

  test("rejects an unsafe tab name", async () => {
    const { impl, calls } = fakeFetch(() => Response.json({}));

    const error = await capture(
      writeCell("Sheet1';DROP", "B12", 1, {
        fetchImpl: impl,
        getToken: token,
      }),
    );

    expect(error instanceof InvalidTargetError).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test("rejects a non-finite number", async () => {
    const { impl, calls } = fakeFetch(() => Response.json({}));

    const error = await capture(
      writeCell("Sheet1", "B12", Number.NaN, {
        fetchImpl: impl,
        getToken: token,
      }),
    );

    expect(error instanceof InvalidTargetError).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
