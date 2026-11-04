import { addItemRow } from "@/lib/gsheets/engine";
import {
  readFiniteNumber,
  readJsonObject,
  sheetErrorResponse,
  stateJson,
} from "@/lib/gsheets/http";
import { normalizeItemLabel } from "@/lib/gsheets/rows";

/**
 * POST /api/sheet/periods/[periodId]/items
 *
 * Body: `{ label: string, amountDop: number }`.
 *
 * Inserts a new expense row after the last item of that quincena's block (or
 * after "Sueldo" when the block has no items yet) and writes its A/B cells.
 * The sheet is shared with the Deudas and card blocks, so inserting never
 * overwrites an existing row; it shifts them down by one.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ periodId: string }> },
) {
  try {
    const { periodId } = await params;
    const body = await readJsonObject(request);
    const label = normalizeItemLabel(body.label);
    const amountDop = readFiniteNumber(body.amountDop, "amountDop", { min: 0 });

    const state = await addItemRow(periodId, label, amountDop);
    return stateJson(state);
  } catch (error) {
    return sheetErrorResponse(
      error,
      "POST /api/sheet/periods/[periodId]/items",
    );
  }
}
