import { errorResponse, stateJson } from "@/lib/overlay/http";

/**
 * GET /api/state[?force=1]
 *
 * The full read model: live sheet snapshot + overlay + projections.
 */
export async function GET(request: Request) {
  const force = new URL(request.url).searchParams.get("force") === "1";

  try {
    return await stateJson(force);
  } catch (error) {
    return errorResponse(error, "GET /api/state");
  }
}
