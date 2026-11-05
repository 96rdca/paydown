"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="size-5 text-destructive" />
            Algo salió mal
          </CardTitle>
          <CardDescription>
            No pudimos cargar tus datos. Esto suele pasar cuando Google Sheets no responde.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Revisa tu conexión y vuelve a intentarlo. Si el problema continúa, espera un momento y
            refresca la página.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Ref: {error.digest}
            </p>
          )}
          <Button onClick={() => reset()} className="w-full">
            Intentar de nuevo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
