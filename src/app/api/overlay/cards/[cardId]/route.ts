import {
  errorResponse,
  readJsonObject,
  requireCard,
  stateJson,
} from "@/lib/overlay/http";
import { OverlayValidationError, overlayStore } from "@/lib/overlay/store";

/**
 * PUT /api/overlay/cards/[cardId]
 *
 * Body: `{ monthlyRate: number | null }` — a monthly fraction such as 0.0255.
 * Null clears the app-owned rate. Responds with the full updated state.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const { cardId } = await params;
    const body = await readJsonObject(request);
    const monthlyRate = body.monthlyRate;

    if (
      monthlyRate !== null &&
      (typeof monthlyRate !== "number" ||
        !Number.isFinite(monthlyRate) ||
        monthlyRate < 0 ||
        monthlyRate >= 1)
    ) {
      throw new OverlayValidationError(
        '"monthlyRate" must be null or a fraction >= 0 and < 1 (e.g. 0.0255).',
      );
    }

    await requireCard(cardId);
    await overlayStore.setCardRate(cardId, monthlyRate);
    return await stateJson();
  } catch (error) {
    return errorResponse(error, "PUT /api/overlay/cards/[cardId]");
  }
}
