import { applyCellEdits, cardFieldEdit } from "@/lib/gsheets/engine";
import {
  readFiniteNumber,
  readJsonObject,
  readNullableNumber,
  sheetErrorResponse,
  stateJson,
} from "@/lib/gsheets/http";
import { isCardField } from "@/lib/gsheets/resolve";
import { InvalidTargetError } from "@/lib/gsheets/errors";

/**
 * PUT /api/sheet/cards/[cardId]/fields/[field]
 *
 * Body: `{ before: number | null, after: number }`.
 *
 * `field` is one of the parser's card fields:
 *   limitDop | limitUsd | statementBalanceDop | statementBalanceUsd |
 *   availableDop | availableUsd | minPaymentDop | minPaymentUsd
 *
 * The cell is resolved through the card matrix: the field's row label in column
 * D plus the card's header position in E–J (never a fixed offset).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ cardId: string; field: string }> },
) {
  try {
    const { cardId, field } = await params;
    if (!isCardField(field)) {
      throw new InvalidTargetError(
        `Unknown card field ${JSON.stringify(field)}.`,
      );
    }

    const body = await readJsonObject(request);
    const before = readNullableNumber(body.before, "before");
    const after = readFiniteNumber(body.after, "after");

    const state = await applyCellEdits([
      cardFieldEdit(cardId, field, before, after),
    ]);
    return stateJson(state);
  } catch (error) {
    return sheetErrorResponse(
      error,
      "PUT /api/sheet/cards/[cardId]/fields/[field]",
    );
  }
}
