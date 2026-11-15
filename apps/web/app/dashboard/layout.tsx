import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { DashboardShell } from '../../components/dashboard';
import { ensureAccount } from '../../lib/accounts';

// Each page under here calls auth.protect() too: Next.js doesn't always
// re-render a layout when the page below it changes.
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // The user ID comes from Clerk on the server, never from the request body.
  const { userId } = await auth.protect();
  await ensureAccount(userId);
  return <DashboardShell>{children}</DashboardShell>;
}
