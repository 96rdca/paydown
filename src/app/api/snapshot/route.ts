import { getSnapshot } from "@/lib/sheets/snapshot";

/**
 * GET /api/snapshot[?force=1]
 *
 * Returns the live sheet snapshot as JSON. Always JSON on failure too, so the
 * UI never has to parse Next's HTML error page.
 */
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("force") === "1";

  try {
    const snapshot = await getSnapshot({ force });
    return Response.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/snapshot] failed to build snapshot", error);

    const message =
      error instanceof Error ? error.message : "Unknown snapshot error";

    return Response.json(
      { error: message },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
