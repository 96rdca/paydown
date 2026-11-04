import { applyCellEdits, periodSalaryEdit } from "@/lib/gsheets/engine";
import {
  readFiniteNumber,
  readJsonObject,
  sheetErrorResponse,
  stateJson,
} from "@/lib/gsheets/http";

/**
 * PUT /api/sheet/periods/[periodId]/salary
 *
 * Body: `{ before: number, after: number }` — the "Sueldo" cell (column B) of
 * the Q15/Q30 block. `after` must be >= 0.
 *
 * Resolves via the reader's period anchors; a stale `before` answers 409 with
 * the sheet's current salary. Success returns the full fresh FinancialState.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> },
) {
  try {
    const { periodId } = await params;
    const body = await readJsonObject(request);
    const before = readFiniteNumber(body.before, "before");
    const after = readFiniteNumber(body.after, "after", { min: 0 });

    const state = await applyCellEdits([
      periodSalaryEdit(periodId, before, after),
    ]);
    return stateJson(state);
  } catch (error) {
    return sheetErrorResponse(
      error,
      "PUT /api/sheet/periods/[periodId]/salary",
    );
  }
}
