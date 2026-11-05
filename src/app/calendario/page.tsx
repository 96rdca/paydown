import { Suspense } from "react";
import { io } from "next/cache";
import { getFinancialState } from "@/lib/state";
import { isSheetWriteConfigured } from "@/lib/gsheets/config";
import { Footer } from "@/components/footer";
import { CalendarView } from "@/components/calendar-view";
import { Skeleton } from "@/components/ui/skeleton";

function CalendarioSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

async function CalendarioContent() {
  await io();
  const state = await getFinancialState();
  const editable = isSheetWriteConfigured();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendario</h1>
        <p className="text-muted-foreground">
          Obligaciones, vencimientos y fechas clave.
        </p>
      </div>

      <CalendarView state={state} editable={editable} />

      <Footer snapshot={state.snapshot} />
    </div>
  );
}

export default function CalendarioPage() {
  return (
    <Suspense fallback={<CalendarioSkeleton />}>
      <CalendarioContent />
    </Suspense>
  );
}
