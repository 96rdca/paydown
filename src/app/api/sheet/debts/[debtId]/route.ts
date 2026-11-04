import {
  applyCellEdits,
  debtEdits,
  type DateChange,
  type NumberChange,
} from "@/lib/gsheets/engine";
import {
  readChange,
  readFiniteNumber,
  readIsoDate,
  readJsonObject,
  sheetErrorResponse,
  stateJson,
} from "@/lib/gsheets/http";
import { InvalidTargetError } from "@/lib/gsheets/errors";

/**
 * PUT /api/sheet/debts/[debtId]
 *
 * Body:
 *   { amountDop?: { before: number, after: number },
 *     dueDate?:   { before: "yyyy-mm-dd", after: "yyyy-mm-dd" } }
 *
 * At least one part must be present. Both cells are conflict-checked before
 * either is written, so a partial update cannot slip through. Amount lives at
 * label column + 1, due date at label column + 2 in the "Deudas" block.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ debtId: string }> },
) {
  try {
    const { debtId } = await params;
    const body = await readJsonObject(request);

    let amount: NumberChange | undefined;
    if (body.amountDop !== undefined && body.amountDop !== null) {
      const change = readChange(body.amountDop, "amountDop");
      amount = {
        before: readFiniteNumber(change.before, "amountDop.before"),
        after: readFiniteNumber(change.after, "amountDop.after", { min: 0 }),
      };
    }

    let dueDate: DateChange | undefined;
    if (body.dueDate !== undefined && body.dueDate !== null) {
      const change = readChange(body.dueDate, "dueDate");
      dueDate = {
        before: readIsoDate(change.before, "dueDate.before"),
        after: readIsoDate(change.after, "dueDate.after"),
      };
    }

    if (!amount && !dueDate) {
      throw new InvalidTargetError(
        "Provide at least one of amountDop or dueDate.",
      );
    }

    const state = await applyCellEdits(debtEdits(debtId, amount, dueDate));
    return stateJson(state);
  } catch (error) {
    return sheetErrorResponse(error, "PUT /api/sheet/debts/[debtId]");
  }
}
