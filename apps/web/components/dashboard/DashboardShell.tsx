import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP_NAME } from '@askwell/shared';
import { DashboardNav } from './DashboardNav';

/** Light glass frame: brand, nav and sign-out control around the page. */
export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="theme-light min-h-dvh overflow-x-clip">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:flex-row md:gap-6 md:p-6">
        <header className="flex flex-col gap-3 rounded-lg border border-glass-border bg-glass p-3 text-fg shadow-md backdrop-blur-md md:sticky md:top-6 md:h-fit md:w-56 md:shrink-0 md:gap-6 md:p-4">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/dashboard"
              className="flex min-h-11 items-center px-2 font-semibold tracking-tight"
            >
              {APP_NAME}
            </Link>
            <UserButton />
          </div>
          <DashboardNav />
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
