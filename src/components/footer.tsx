import { formatFetchedAt } from "@/lib/format";
import type { Snapshot } from "@/lib/types";

export function Footer({ snapshot }: { snapshot: Snapshot }) {
  return (
    <footer className="mt-auto border-t py-4 text-center text-xs text-muted-foreground">
      Datos: {formatFetchedAt(snapshot)} · Fuente: Google Sheets
    </footer>
  );
}
