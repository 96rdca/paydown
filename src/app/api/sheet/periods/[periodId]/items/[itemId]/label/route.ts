import { renameItemLabel } from "@/lib/gsheets/engine";
import {
  readJsonObject,
  sheetErrorResponse,
  stateJson,
} from "@/lib/gsheets/http";
import { normalizeItemLabel } from "@/lib/gsheets/rows";

/**
 * PUT /api/sheet/periods/[periodId]/items/[itemId]/label
 *
 * Body: `{ before: string, after: string }` — a single-cell write to column A.
 * `before` is conflict-checked against the freshly parsed row (409 on drift).
 * Renaming changes the parser-generated item id (`${period}-${slug(label)}`),
 * so the response state carries the new id and the UI must refresh from it.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ periodId: string; itemId: string }> },
) {
  try {
    const { periodId, itemId } = await params;
    const body = await readJsonObject(request);
    const before = normalizeItemLabel(body.before, "before");
    const after = normalizeItemLabel(body.after, "after");

    const state = await renameItemLabel(periodId, itemId, before, after);
    return stateJson(state);
  } catch (error) {
    return sheetErrorResponse(
      error,
      "PUT /api/sheet/periods/[periodId]/items/[itemId]/label",
    );
  }
}
