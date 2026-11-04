import {
  errorResponse,
  readJsonObject,
  requireCard,
  stateJson,
} from "@/lib/overlay/http";
import {
  type CardConfigPatch,
  OverlayValidationError,
  overlayStore,
} from "@/lib/overlay/store";

/**
 * PUT /api/overlay/cards/[cardId]
 *
 * Body (partial, at least one key):
 *   - `monthlyRate`: number | null — a monthly fraction such as 0.0255.
 *     Null clears the app-owned rate.
 *   - `sharedLimitDopUsd`: boolean — true when the card has ONE credit pool
 *     (USD balance consumes the DOP limit at the tasa, e.g. APAP).
 *
 * Responds with the full updated state.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> },
) {
  try {
    const { cardId } = await params;
    const body = await readJsonObject(request);
    const patch: CardConfigPatch = {};

    if (Object.prototype.hasOwnProperty.call(body, "monthlyRate")) {
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

      patch.monthlyRate = monthlyRate as number | null;
    }

    if (Object.prototype.hasOwnProperty.call(body, "sharedLimitDopUsd")) {
      const sharedLimitDopUsd = body.sharedLimitDopUsd;

      if (typeof sharedLimitDopUsd !== "boolean") {
        throw new OverlayValidationError(
          '"sharedLimitDopUsd" must be a boolean.',
        );
      }

      patch.sharedLimitDopUsd = sharedLimitDopUsd;
    }

    if (Object.keys(patch).length === 0) {
      throw new OverlayValidationError(
        'At least one of "monthlyRate" or "sharedLimitDopUsd" must be provided.',
      );
    }

    await requireCard(cardId);
    await overlayStore.setCardConfig(cardId, patch);
    return await stateJson();
  } catch (error) {
    return errorResponse(error, "PUT /api/overlay/cards/[cardId]");
  }
}
