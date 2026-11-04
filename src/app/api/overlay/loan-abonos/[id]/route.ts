import { errorResponse, stateJson } from "@/lib/overlay/http";
import { overlayStore } from "@/lib/overlay/store";

/**
 * DELETE /api/overlay/loan-abonos/[id]
 *
 * Responds with the full updated state (404 when the abono does not exist).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await overlayStore.deleteLoanAbono(id);
    return await stateJson();
  } catch (error) {
    return errorResponse(error, "DELETE /api/overlay/loan-abonos/[id]");
  }
}
