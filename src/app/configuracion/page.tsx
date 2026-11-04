import { Suspense } from "react";
import { io } from "next/cache";
import { getSnapshot } from "@/lib/sheets/snapshot";
import { Footer } from "@/components/footer";
import { ConfigForm } from "@/components/config-form";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ConfiguracionSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="py-8">
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-8">
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function ConfiguracionContent() {
  await io();
  const snapshot = await getSnapshot();

  return (
    <div className="space-y-8">
      <ConfigForm
        initial={{
          fetchedAt: snapshot.fetchedAt,
          usdRate: snapshot.settings.usdRate,
        }}
      />
      <Footer snapshot={snapshot} />
    </div>
  );
}

export default function ConfiguracionPage() {
  return (
    <Suspense fallback={<ConfiguracionSkeleton />}>
      <ConfiguracionContent />
    </Suspense>
  );
}
