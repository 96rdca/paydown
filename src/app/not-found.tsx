import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-lg">Página no encontrada</CardTitle>
          <CardDescription>
            La ruta que buscas no existe en Paydown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/">Volver al dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
