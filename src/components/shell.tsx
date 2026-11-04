"use client";

import * as React from "react";
import Link from "next/link";
import { Suspense } from "react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  DesktopNav,
  MobileNav,
  ThemeToggle,
  Menu,
} from "@/components/active-nav";

function NavSkeleton({ count }: { count: number }) {
  return (
    <div className="flex flex-1 flex-col gap-1 p-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg bg-muted"
        />
      ))}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="flex min-h-full flex-col">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            P
          </span>
          Paydown
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir menú"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <Menu className="size-5" />
          </Button>
        </div>
      </header>

      <Suspense fallback={null}>
        <MobileNav open={mobileOpen} setOpen={setMobileOpen} />
      </Suspense>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r bg-sidebar lg:flex">
          <div className="flex h-16 items-center gap-2 px-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              P
            </span>
            <span className="text-lg font-semibold tracking-tight">
              Paydown
            </span>
          </div>
          <Separator />
          <Suspense fallback={<NavSkeleton count={8} />}>
            <DesktopNav />
          </Suspense>
          <Separator />
          <div className="flex items-center justify-end p-3">
            <ThemeToggle />
          </div>
        </aside>

        <main className="flex flex-1 flex-col">
          <div className="flex-1 p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
