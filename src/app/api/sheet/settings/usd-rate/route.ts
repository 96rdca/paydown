import { applyCellEdits, usdRateEdit } from "@/lib/gsheets/engine";
import {
  readFiniteNumber,
  readJsonObject,
  sheetErrorResponse,
  stateJson,
} from "@/lib/gsheets/http";

/**
 * PUT /api/sheet/settings/usd-rate
 *
 * Body: `{ before: number, after: number }` — the DOP/USD rate next to the
 * "Tasa Dollar" label. `after` must be > 0.
 */
export async function PUT(request: Request) {
  try {
    const body = await readJsonObject(request);
    const before = readFiniteNumber(body.before, "before");
    const after = readFiniteNumber(body.after, "after", {
      min: 0,
      exclusiveMin: true,
    });

    const state = await applyCellEdits([usdRateEdit(before, after)]);
    return stateJson(state);
  } catch (error) {
    return sheetErrorResponse(error, "PUT /api/sheet/settings/usd-rate");
  }
}
