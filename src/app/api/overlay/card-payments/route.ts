import {
  errorResponse,
  readDate,
  readJsonObject,
  readNumber,
  readOptionalNote,
  readOptionalNumber,
  readString,
  requireCard,
  stateJson,
} from "@/lib/overlay/http";
import { overlayStore } from "@/lib/overlay/store";

/**
 * POST /api/overlay/card-payments
 *
 * Body: `{ cardId, date, amountDop, amountUsd?, note? }`.
 * Responds with the full updated state.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const cardId = readString(body, "cardId");
    const date = readDate(body, "date");
    const amountDop = readNumber(body, "amountDop");
    const amountUsd = readOptionalNumber(body, "amountUsd");
    const note = readOptionalNote(body, "note");

    await requireCard(cardId);
    await overlayStore.addCardPayment({
      cardId,
      date,
      amountDop,
      amountUsd,
      note,
    });

    return await stateJson();
  } catch (error) {
    return errorResponse(error, "POST /api/overlay/card-payments");
  }
}
