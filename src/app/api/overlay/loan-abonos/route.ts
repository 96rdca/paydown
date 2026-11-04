import {
  errorResponse,
  readDate,
  readJsonObject,
  readNumber,
  readOptionalNote,
  readString,
  requireLoan,
  stateJson,
} from "@/lib/overlay/http";
import { overlayStore } from "@/lib/overlay/store";

/**
 * POST /api/overlay/loan-abonos
 *
 * Body: `{ loanId, date, amount, note? }` — an extra principal payment.
 * Responds with the full updated state.
 */
export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const loanId = readString(body, "loanId");
    const date = readDate(body, "date");
    const amount = readNumber(body, "amount", { min: 0, exclusiveMin: true });
    const note = readOptionalNote(body, "note");

    await requireLoan(loanId);
    await overlayStore.addLoanAbono({ loanId, date, amount, note });

    return await stateJson();
  } catch (error) {
    return errorResponse(error, "POST /api/overlay/loan-abonos");
  }
}
