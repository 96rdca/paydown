"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDop, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SheetEditNumber, parseEditResponse } from "@/components/sheet-edit";
import { RefreshCw, Database, DollarSign, FileSpreadsheet } from "lucide-react";

interface SnapshotInfo {
  fetchedAt: string;
  usdRate: number;
}

interface ConfigFormProps {
  editable: boolean;
  initial: SnapshotInfo;
}

export function ConfigForm({ editable, initial }: ConfigFormProps) {
  const router = useRouter();
  const [info, setInfo] = React.useState<SnapshotInfo>(initial);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/snapshot?force=1");
      if (!res.ok) {
        setError("No se pudo actualizar. Intenta de nuevo.");
        return;
      }
      const data = (await res.json()) as SnapshotInfo;
      setInfo(data);
      router.refresh();
    } catch {
      setError("No se pudo actualizar. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Configuración
        </h1>
        <p className="text-muted-foreground">
          Datos de origen y preferencias básicas.
        </p>
      </div>

      {editable && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
          <FileSpreadsheet className="size-4" />
          Se escriben cambios en tu hoja de Google.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
              <DollarSign className="size-4" /> Tasa del día
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Valor usado para convertir USD a DOP.
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                {editable ? (
                  <SheetEditNumber
                    value={info.usdRate}
                    decimals={2}
                    suffix="DOP por US$1"
                    save={async (after) => {
                      const res = await fetch("/api/sheet/settings/usd-rate", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ before: info.usdRate, after }),
                      });
                      const result = await parseEditResponse(res);
                      if (result.ok) {
                        setInfo((prev) => ({ ...prev, usdRate: after }));
                      }
                      return result;
                    }}
                  />
                ) : (
                  <Input
                    value={formatDop(info.usdRate)}
                    readOnly
                    className="bg-muted"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
              <Database className="size-4" /> Fuente de datos
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">
              De dónde se leen los números que ves en la app.
            </p>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Fuente</span>
                <span className="text-sm text-muted-foreground">
                  Google Sheets
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Última lectura</span>
                <span className="text-sm text-muted-foreground">
                  {formatDateTime(info.fetchedAt)}
                </span>
              </div>
            </div>
            {error && (
              <p className="mt-3 text-xs text-destructive">{error}</p>
            )}
            <Button
              onClick={handleRefresh}
              disabled={loading}
              className="mt-4 w-full sm:w-auto"
            >
              <RefreshCw
                className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`}
              />
              Actualizar datos
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
