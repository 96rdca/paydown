import { applyCellEdits, loanStatusEdit } from "@/lib/gsheets/engine";
import {
  readCuotaNumber,
  readCuotaStatus,
  readJsonObject,
  sheetErrorResponse,
  stateJson,
} from "@/lib/gsheets/http";

/**
 * PUT /api/sheet/loans/[loanId]/cuotas/[number]/status
 *
 * Body: `{ before: "Cuota Paga" | "Pendiente", after: "Cuota Paga" | "Pendiente" }`.
 *
 * Only loans with an amortization schedule are editable (auto-loan,
 * jeep-loan). The row is located by the cuota number; the Status column is the
 * one the reader validates (Auto +7, Jeep +8).
 */
export async function PUT(
  request: Request,
  {
    params,
  }: { params: Promise<{ loanId: string; number: string }> },
) {
  try {
    const { loanId, number } = await params;
    const cuotaNumber = readCuotaNumber(number);
    const body = await readJsonObject(request);
    const before = readCuotaStatus(body.before, "before");
    const after = readCuotaStatus(body.after, "after");

    const state = await applyCellEdits([
      loanStatusEdit(loanId, cuotaNumber, before, after),
    ]);
    return stateJson(state);
  } catch (error) {
    return sheetErrorResponse(
      error,
      "PUT /api/sheet/loans/[loanId]/cuotas/[number]/status",
    );
  }
}
