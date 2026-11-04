import {
  applyCellEdits,
  periodItemEdit,
  removeItemRow,
} from "@/lib/gsheets/engine";
import {
  readFiniteNumber,
  readJsonObject,
  sheetErrorResponse,
  stateJson,
} from "@/lib/gsheets/http";
import { normalizeItemLabel } from "@/lib/gsheets/rows";

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

/**
 * DELETE /api/sheet/periods/[periodId]/items/[itemId]
 *
 * Body: `{ label: string, amountDop: number }` — what the UI last showed.
 *
 * The row is re-parsed and conflict-checked first (409 with `current` on drift,
 * nothing written). On match the row is removed adaptively: A/B are cleared when
 * the line also carries Deudas/card data, otherwise the row is deleted.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ periodId: string; itemId: string }> },
) {
  try {
    const { periodId, itemId } = await params;
    const body = await readJsonObject(request);
    const label = normalizeItemLabel(body.label);
    const amountDop = readFiniteNumber(body.amountDop, "amountDop", { min: 0 });

    const state = await removeItemRow(periodId, itemId, { label, amountDop });
    return stateJson(state);
  } catch (error) {
    return sheetErrorResponse(
      error,
      "DELETE /api/sheet/periods/[periodId]/items/[itemId]",
    );
  }
}
