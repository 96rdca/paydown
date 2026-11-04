import { applyCellEdits, periodItemEdit } from "@/lib/gsheets/engine";
import {
  readFiniteNumber,
  readJsonObject,
  sheetErrorResponse,
  stateJson,
} from "@/lib/gsheets/http";

/**
 * PUT /api/sheet/periods/[periodId]/items/[itemId]
 *
 * Body: `{ before: number, after: number }` — one budget row's amount in column
 * B. The item is located by its label inside the requested Q15/Q30 block; the
 * id is the parser's `${period}-${slug(label)}`.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ periodId: string; itemId: string }> },
) {
  try {
    const { periodId, itemId } = await params;
    const body = await readJsonObject(request);
    const before = readFiniteNumber(body.before, "before");
    const after = readFiniteNumber(body.after, "after", { min: 0 });

    const state = await applyCellEdits([
      periodItemEdit(periodId, itemId, before, after),
    ]);
    return stateJson(state);
  } catch (error) {
    return sheetErrorResponse(
      error,
      "PUT /api/sheet/periods/[periodId]/items/[itemId]",
    );
  }
}
