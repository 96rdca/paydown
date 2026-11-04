"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDop, formatDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Database, DollarSign } from "lucide-react";

interface SnapshotInfo {
  fetchedAt: string;
  usdRate: number;
}

export function ConfigForm({ initial }: { initial: SnapshotInfo }) {
  const router = useRouter();
  const [info, setInfo] = React.useState<SnapshotInfo>(initial);
  const [loading, setLoading] = React.useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/snapshot?force=1");
      if (res.ok) {
        const data = (await res.json()) as SnapshotInfo;
        setInfo(data);
      }
      router.refresh();
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
                <Input
                  value={formatDop(info.usdRate)}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <span className="text-sm text-muted-foreground">
                DOP por US$1
              </span>
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
