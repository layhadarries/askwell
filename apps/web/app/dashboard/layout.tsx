import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { DashboardShell } from '../../components/dashboard';

// Each page under here calls auth.protect() too: Next.js doesn't always
// re-render a layout when the page below it changes.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await auth.protect();
  return <DashboardShell>{children}</DashboardShell>;
}
