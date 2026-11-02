"use client";

import { UserButton } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { APP_NAME } from "@askwell/shared";
import { NavList } from "./NavList";

export function DashboardShell({ children, planLabel }: { children: ReactNode; planLabel?: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-clip bg-surface text-fg md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-glass-border bg-glass p-4 backdrop-blur-(--blur-glass) md:flex md:flex-col md:gap-6">
        <span className="px-3 text-lg font-semibold">{APP_NAME}</span>
        <NavList pathname={pathname} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-glass-border bg-glass px-4 py-3 backdrop-blur-(--blur-glass)">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex min-h-10 items-center rounded-md border border-border bg-surface-raised px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus md:hidden"
            >
              {menuOpen ? "Close" : "Menu"}
            </button>
            <span className="text-lg font-semibold md:hidden">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-3">
            {planLabel ? (
              <span className="rounded-full border border-border bg-surface-raised px-3 py-1 text-sm font-medium">
                {planLabel}
              </span>
            ) : null}
            <UserButton />
          </div>
        </header>

        {menuOpen ? (
          <div id="mobile-nav" className="border-b border-glass-border bg-glass p-4 backdrop-blur-(--blur-glass) md:hidden">
            <NavList pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          </div>
        ) : null}

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
