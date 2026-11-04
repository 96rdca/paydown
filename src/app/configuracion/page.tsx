import { Suspense } from "react";
import { io } from "next/cache";
import { getFinancialState } from "@/lib/state";
import { isSheetWriteConfigured } from "@/lib/gsheets/config";
import { Footer } from "@/components/footer";
import { ConfigForm } from "@/components/config-form";
import { LocalDataCard } from "@/components/local-data-card";
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
      <Card>
        <CardContent className="py-8">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

async function ConfiguracionContent() {
  await io();
  const state = await getFinancialState();
  const editable = isSheetWriteConfigured();

  return (
    <div className="space-y-8">
      <ConfigForm
        key={state.snapshot.fetchedAt}
        editable={editable}
        initial={{
          fetchedAt: state.snapshot.fetchedAt,
          usdRate: state.snapshot.settings.usdRate,
        }}
      />
      <LocalDataCard state={state} />
      <Footer snapshot={state.snapshot} />
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
